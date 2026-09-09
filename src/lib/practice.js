import { supabase } from './supabase'

/**
 * Practice sessions.
 *
 * Grading and the rollups run client-side under RLS rather than in an Edge
 * Function. A determined student could fabricate progress, but the only person
 * they would mislead is themselves, so it is not worth a server round trip per
 * answer.
 */

/** Types Novi can mark automatically. The rest are graded by the student. */
export const AUTO_GRADED = new Set(['multiple_choice', 'true_false'])

const normalise = (s) => (s ?? '').trim().toLowerCase()

export function isAutoGraded(question) {
  return AUTO_GRADED.has(question?.type)
}

/** Returns true/false for auto-graded types, or null when the student decides. */
export function gradeAnswer(question, given) {
  if (!isAutoGraded(question)) return null
  return normalise(given) === normalise(question.correct_answer)
}

/**
 * Local calendar date. Deliberately not toISOString(): east of UTC that returns
 * yesterday for most of the day, which made the streak walk compare dates that
 * could never match the row it had just written.
 */
function localDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Folds a delta into today's activity row.
 *
 * Called per answer rather than only at the end: a student who abandons a
 * session halfway should still see those questions in Today's Goal, and the
 * old end-of-session rollup lost every answer from a visit that was never
 * finished.
 */
async function bumpDailyActivity(userId, delta) {
  const today = localDate()
  const { data: existing, error } = await supabase
    .from('daily_activity')
    .select('minutes_studied, sessions_count, questions_answered, questions_correct')
    .eq('user_id', userId)
    .eq('activity_date', today)
    .maybeSingle()
  if (error) throw error

  const { error: upsertError } = await supabase.from('daily_activity').upsert(
    {
      user_id: userId,
      activity_date: today,
      minutes_studied: (existing?.minutes_studied ?? 0) + (delta.minutes ?? 0),
      sessions_count: (existing?.sessions_count ?? 0) + (delta.sessions ?? 0),
      questions_answered: (existing?.questions_answered ?? 0) + (delta.answered ?? 0),
      questions_correct: (existing?.questions_correct ?? 0) + (delta.correct ?? 0),
    },
    { onConflict: 'user_id,activity_date' },
  )
  if (upsertError) throw upsertError
}

/**
 * Resumes the open session for this pack if there is one, otherwise starts a
 * new one. Resuming is what makes "Continue Where You Left Off" actually
 * continue rather than restart.
 */
export async function startOrResumeSession(userId, studySetId) {
  const { data: open, error: openError } = await supabase
    .from('study_sessions')
    .select('id, questions_answered, questions_correct, started_at')
    .eq('user_id', userId)
    .eq('study_set_id', studySetId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (openError) throw openError
  if (open) {
    const answered = await fetchAnsweredQuestionIds(open.id)
    return { session: open, answeredIds: answered, resumed: true }
  }

  const { data: created, error } = await supabase
    .from('study_sessions')
    .insert({ user_id: userId, study_set_id: studySetId, mode: 'practice' })
    .select('id, questions_answered, questions_correct, started_at')
    .single()

  if (error) throw error
  await bumpDailyActivity(userId, { sessions: 1 })
  return { session: created, answeredIds: new Set(), resumed: false }
}

async function fetchAnsweredQuestionIds(sessionId) {
  const { data, error } = await supabase
    .from('question_attempts')
    .select('question_id')
    .eq('session_id', sessionId)

  if (error) throw error
  return new Set((data ?? []).map((r) => r.question_id))
}

/**
 * Records one answer and moves the counters that depend on it.
 *
 * Mastery is updated here rather than at the end so a student who abandons a
 * session halfway still keeps the progress they earned.
 */
export async function recordAttempt({
  userId,
  session,
  question,
  givenAnswer,
  isCorrect,
  timeTakenMs,
  attemptNumber = 1,
}) {
  const { error } = await supabase.from('question_attempts').insert({
    user_id: userId,
    session_id: session.id,
    question_id: question.id,
    topic_id: question.topic_id ?? null,
    given_answer: givenAnswer ?? null,
    is_correct: isCorrect,
    time_taken_ms: timeTakenMs ?? null,
    attempt_number: attemptNumber,
  })
  if (error) throw error

  const answered = (session.questions_answered ?? 0) + 1
  const correct = (session.questions_correct ?? 0) + (isCorrect ? 1 : 0)

  const { error: sessionError } = await supabase
    .from('study_sessions')
    .update({ questions_answered: answered, questions_correct: correct })
    .eq('id', session.id)
  if (sessionError) throw sessionError

  await bumpDailyActivity(userId, { answered: 1, correct: isCorrect ? 1 : 0 })

  if (question.topic_id) {
    await updateMastery(userId, question.topic_id, isCorrect)
  }

  return { questions_answered: answered, questions_correct: correct }
}

/**
 * Rolling mastery for one topic.
 *
 * Deliberately simple: the score is the share of attempts answered correctly.
 * The spaced-repetition columns (ease_factor, review_interval_days,
 * next_review_at) exist in the schema but are left alone until there is enough
 * history for an SM-2 style schedule to mean anything.
 */
async function updateMastery(userId, topicId, isCorrect) {
  const { data: existing, error } = await supabase
    .from('topic_mastery')
    .select('attempts_total, attempts_correct, current_streak')
    .eq('user_id', userId)
    .eq('topic_id', topicId)
    .maybeSingle()
  if (error) throw error

  const total = (existing?.attempts_total ?? 0) + 1
  const correct = (existing?.attempts_correct ?? 0) + (isCorrect ? 1 : 0)
  const streak = isCorrect ? (existing?.current_streak ?? 0) + 1 : 0

  const { error: upsertError } = await supabase.from('topic_mastery').upsert(
    {
      user_id: userId,
      topic_id: topicId,
      attempts_total: total,
      attempts_correct: correct,
      // numeric(4,3): three decimals is all the column will hold.
      mastery_score: Number((correct / total).toFixed(3)),
      current_streak: streak,
      last_practiced_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,topic_id' },
  )
  if (upsertError) throw upsertError
}

/**
 * Closes the session and folds it into today's activity, which is what feeds
 * Today's Goal, the streak and the monthly study time.
 */
export async function finishSession({ userId, session }) {
  const startedAt = new Date(session.started_at).getTime()
  const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000))

  const { error } = await supabase
    .from('study_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', session.id)
  if (error) throw error

  // Answers were counted as they happened; only the time is left to add.
  await bumpDailyActivity(userId, { minutes })
  await updateStreak(userId, localDate())
  return { minutes }
}

/**
 * Day streak from daily_activity: consecutive days up to today with activity.
 * Recomputed rather than incremented so a missed day self-corrects.
 */
async function updateStreak(userId, today) {
  const { data, error } = await supabase
    .from('daily_activity')
    .select('activity_date')
    .eq('user_id', userId)
    .lte('activity_date', today)
    .order('activity_date', { ascending: false })
    .limit(400)
  if (error) throw error

  const days = new Set((data ?? []).map((r) => r.activity_date))
  let streak = 0
  const cursor = new Date(`${today}T00:00:00`)
  while (days.has(localDate(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  const { data: profile } = await supabase
    .from('learning_profile')
    .select('longest_day_streak')
    .eq('user_id', userId)
    .maybeSingle()

  await supabase
    .from('learning_profile')
    .update({
      current_day_streak: streak,
      longest_day_streak: Math.max(streak, profile?.longest_day_streak ?? 0),
    })
    .eq('user_id', userId)

  return streak
}
