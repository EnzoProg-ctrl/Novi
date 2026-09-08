import { supabase } from './supabase'

/** Local calendar date as YYYY-MM-DD, to match the `date` column. */
function todayISO() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const EMPTY_ACTIVITY = { sessions_count: 0, minutes_studied: 0, questions_answered: 0 }

/**
 * Today's row from daily_activity. Absent until the student actually studies,
 * so a missing row means zero rather than an error.
 */
export async function fetchTodayActivity(userId) {
  const { data, error } = await supabase
    .from('daily_activity')
    .select('sessions_count, minutes_studied, questions_answered')
    .eq('user_id', userId)
    .eq('activity_date', todayISO())
    .maybeSingle()

  if (error) throw error
  return data ?? EMPTY_ACTIVITY
}

/**
 * Mastery per subject: the mean of every tracked topic inside it.
 * Returns [] until questions have been answered.
 */
export async function fetchSubjectProgress(userId) {
  const { data, error } = await supabase
    .from('topic_mastery')
    .select('mastery_score, topics(subject_id, subjects(id, name))')
    .eq('user_id', userId)

  if (error) throw error

  const bySubject = new Map()
  for (const row of data ?? []) {
    const subject = row.topics?.subjects
    if (!subject) continue
    const entry = bySubject.get(subject.id) ?? { id: subject.id, name: subject.name, sum: 0, count: 0 }
    entry.sum += Number(row.mastery_score) || 0
    entry.count += 1
    bySubject.set(subject.id, entry)
  }

  return [...bySubject.values()]
    .map(({ id, name, sum, count }) => ({ id, name, percent: Math.round((sum / count) * 100) }))
    .sort((a, b) => b.percent - a.percent)
}

/** First day of the current month, as YYYY-MM-DD. */
function monthStartISO() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
}

/**
 * Streak comes from learning_profile (maintained by the learning engine).
 * "This month" is summed from daily_activity so the label matches the number
 * rather than reusing the all-time total_study_minutes.
 */
export async function fetchStudyStats(userId) {
  const [{ data: profile, error: profileError }, { data: days, error: daysError }] =
    await Promise.all([
      supabase
        .from('learning_profile')
        .select('current_day_streak, longest_day_streak')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('daily_activity')
        .select('minutes_studied')
        .eq('user_id', userId)
        .gte('activity_date', monthStartISO())
        .lte('activity_date', todayISO()),
    ])

  if (profileError) throw profileError
  if (daysError) throw daysError

  const minutes = (days ?? []).reduce((sum, d) => sum + (d.minutes_studied ?? 0), 0)

  return {
    streakDays: profile?.current_day_streak ?? 0,
    monthMinutes: minutes,
  }
}

/**
 * Study packs are generated from uploaded material. Generation is not built
 * yet, so this returns [] until study_sets rows exist.
 */
export async function fetchStudySets(userId, limit = 6) {
  const { data, error } = await supabase
    .from('study_sets')
    .select('id, title, status, updated_at, subjects(name)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return (data ?? []).map((set) => ({
    id: set.id,
    subject: set.subjects?.name ?? null,
    title: set.title,
    status: set.status,
    updatedAt: set.updated_at,
  }))
}

/**
 * Pending recommendations, highest priority first.
 *
 * Nothing writes to this table yet — the learning engine that would generate
 * recommendations does not exist — so it returns [] in practice.
 */
export async function fetchRecommendations(userId, limit = 3) {
  const { data, error } = await supabase
    .from('recommendations')
    .select('id, kind, title, rationale, priority, study_set_id')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

const MODE_LABEL = {
  practice: 'Practice',
  quiz: 'Practice Quiz',
  review: 'Review',
  chat: 'Chat with Novi',
  reading: 'Reading',
}

/**
 * Sittings the student opened but never closed — `ended_at is null` is what
 * makes a session resumable. Progress is answered-so-far against the number of
 * questions in the set, counted in a second pass since PostgREST cannot
 * aggregate a child table inline.
 */
export async function fetchInProgress(userId, limit = 4) {
  const { data, error } = await supabase
    .from('study_sessions')
    .select('id, mode, started_at, questions_answered, study_sets(id, title, subjects(name))')
    .eq('user_id', userId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  const sessions = data ?? []
  const setIds = [...new Set(sessions.map((s) => s.study_sets?.id).filter(Boolean))]

  let totals = new Map()
  if (setIds.length > 0) {
    const { data: questions, error: qError } = await supabase
      .from('questions')
      .select('study_set_id')
      .in('study_set_id', setIds)
    if (qError) throw qError
    for (const q of questions ?? []) {
      totals.set(q.study_set_id, (totals.get(q.study_set_id) ?? 0) + 1)
    }
  }

  return sessions.map((s) => {
    const set = s.study_sets
    const total = set ? (totals.get(set.id) ?? 0) : 0
    const done = s.questions_answered ?? 0
    return {
      id: s.id,
      subject: set?.subjects?.name ?? null,
      title: set?.title ?? 'Study session',
      modeLabel: MODE_LABEL[s.mode] ?? 'Session',
      done,
      total,
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
    }
  })
}
