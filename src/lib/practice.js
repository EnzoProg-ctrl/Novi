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
export const AUTO_GRADED = new Set(['multiple_choice', 'true_false', 'fill_blank'])

const normalise = (s) => (s ?? '').trim().toLowerCase()

/**
 * Forgiving match for typed blanks: case, punctuation, a leading article and
 * extra spaces do not count against the student. Synonyms still do; a blank
 * should have one right word.
 */
const normaliseTyped = (s) =>
  normalise(s)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '')

export function isAutoGraded(question) {
  return AUTO_GRADED.has(question?.type)
}

/** Returns true/false for auto-graded types, or null when the student decides. */
export function gradeAnswer(question, given) {
  if (!isAutoGraded(question)) return null
  if (question.type === 'fill_blank') {
    const typed = normaliseTyped(given)
    return typed !== '' && typed === normaliseTyped(question.correct_answer)
  }
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

const MAX_ANSWER_MS = 5 * 60 * 1000

const SESSION_COLUMNS = 'id, questions_answered, questions_correct, started_at, target_count'

/**
 * The open session for this pack, with the questions already answered in it,
 * or null. Resuming is what makes "Continue Where You Left Off" actually
 * continue rather than restart.
 */
export async function findOpenSession(userId, studySetId) {
  const { data: open, error } = await supabase
    .from('study_sessions')
    .select(SESSION_COLUMNS)
    .eq('user_id', userId)
    .eq('study_set_id', studySetId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!open) return null
  return { session: open, answeredIds: await fetchAnsweredQuestionIds(open.id) }
}

/**
 * Starts a sitting. `targetCount` is how many questions the student chose to
 * do; null means the whole pack.
 */
export async function startSession(userId, studySetId, targetCount = null) {
  const { data: created, error } = await supabase
    .from('study_sessions')
    .insert({
      user_id: userId,
      study_set_id: studySetId,
      mode: 'practice',
      target_count: targetCount,
    })
    .select(SESSION_COLUMNS)
    .single()

  if (error) throw error
  await bumpDailyActivity(userId, { sessions: 1 })
  return created
}

/**
 * Orders a pack's questions for a sitting that may not cover all of them.
 *
 * Questions never attempted come first, then ones last answered wrong, then
 * ones last answered right, oldest first. Without this, choosing "5" on a
 * 20-question pack would serve the same opening five every time.
 */
export async function orderForPractice(questions) {
  const ids = questions.map((q) => q.id)
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from('question_attempts')
    .select('question_id, is_correct, created_at')
    .in('question_id', ids)
    .order('created_at', { ascending: false })
  if (error) throw error

  const last = new Map()
  for (const a of data ?? []) {
    if (!last.has(a.question_id)) last.set(a.question_id, a)
  }

  const rank = (q) => {
    const a = last.get(q.id)
    if (!a) return 0
    return a.is_correct ? 2 : 1
  }
  const seenAt = (q) => (last.has(q.id) ? Date.parse(last.get(q.id).created_at) : 0)

  return [...questions].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      seenAt(a) - seenAt(b) ||
      (a.position ?? 0) - (b.position ?? 0),
  )
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
  // Time actually spent answering, not wall-clock since the session opened: a
  // session left open on Monday and finished on Wednesday is not two days of
  // study.
  const { data: attempts, error: attemptsError } = await supabase
    .from('question_attempts')
    .select('time_taken_ms')
    .eq('session_id', session.id)
  if (attemptsError) throw attemptsError
  // Each answer is capped so one question left on screen over lunch cannot
  // inflate the total.
  const activeMs = (attempts ?? []).reduce(
    (sum, a) => sum + Math.min(a.time_taken_ms ?? 0, MAX_ANSWER_MS),
    0,
  )
  const minutes = Math.max(1, Math.round(activeMs / 60000))

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
