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
