import { supabase } from './supabase'

/**
 * Planned study sessions (the Calendar), stored in scheduled_sessions.
 *
 * RLS scopes every query to the signed-in student. Rows are mapped into one
 * session shape with real Date objects, and every caller works from that, so
 * the calendar grid, the upcoming list and the weekly goal can never disagree.
 */

export const DEFAULT_WEEKLY_GOAL = 5
export const MAX_SESSION_MINUTES = 12 * 60 // matches scheduled_sessions_max_length

const COLUMNS =
  'id, title, session_type, starts_at, ends_at, notes, completed_at, study_set_id, study_sets ( id, title )'

/** Lets the in-app session reminder refresh without polling for every change. */
const announce = () => window.dispatchEvent(new Event('novi:schedule-changed'))

function toSession(row) {
  return {
    id: row.id,
    title: row.title,
    type: row.session_type,
    start: new Date(row.starts_at),
    end: new Date(row.ends_at),
    notes: row.notes ?? '',
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    packId: row.study_set_id ?? null,
    packTitle: row.study_sets?.title ?? null,
  }
}

/**
 * `start` and `end` are local Dates; toISOString turns them into the exact
 * instant, so a session made at 4pm in Manila is stored as 08:00Z and read back
 * as 4pm. Dates only become strings at this boundary.
 */
function toRow(input) {
  return {
    title: input.title.trim(),
    session_type: input.type,
    starts_at: input.start.toISOString(),
    ends_at: input.end.toISOString(),
    notes: input.notes?.trim() ? input.notes.trim() : null,
    study_set_id: input.packId || null,
  }
}

/**
 * All of the student's planned sessions. One list feeds every view; at the
 * scale of one student's calendar that is simpler and more consistent than
 * re-querying per visible range.
 */
export async function fetchScheduledSessions(userId) {
  const { data, error } = await supabase
    .from('scheduled_sessions')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('starts_at', { ascending: true })
    .limit(2000)
  if (error) throw error
  return (data ?? []).map(toSession)
}

export async function createScheduledSession(userId, input) {
  const { data, error } = await supabase
    .from('scheduled_sessions')
    .insert({ user_id: userId, ...toRow(input) })
    .select(COLUMNS)
    .single()
  if (error) throw error
  announce()
  return toSession(data)
}

export async function updateScheduledSession(id, input) {
  const { data, error } = await supabase
    .from('scheduled_sessions')
    .update(toRow(input))
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw error
  announce()
  return toSession(data)
}

export async function setSessionCompleted(id, completed) {
  const { data, error } = await supabase
    .from('scheduled_sessions')
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw error
  announce()
  return toSession(data)
}

export async function deleteScheduledSession(id) {
  const { error } = await supabase.from('scheduled_sessions').delete().eq('id', id)
  if (error) throw error
  announce()
}

/** The student's packs, for the session form and the filter. */
export async function fetchPackOptions(userId) {
  const { data, error } = await supabase
    .from('study_sets')
    .select('id, title')
    .eq('user_id', userId)
    .order('title', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function fetchWeeklyGoal(userId) {
  const { data, error } = await supabase
    .from('learning_profile')
    .select('weekly_session_goal')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data?.weekly_session_goal ?? DEFAULT_WEEKLY_GOAL
}

/** Upsert, since a learning_profile row is created at signup but may be missing. */
export async function saveWeeklyGoal(userId, goal) {
  const { data, error } = await supabase
    .from('learning_profile')
    .upsert({ user_id: userId, weekly_session_goal: goal }, { onConflict: 'user_id' })
    .select('weekly_session_goal')
    .single()
  if (error) throw error
  return data.weekly_session_goal
}

const topicKey = (title) => (title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Same pack, or titles where one contains the other ("Biology" / "Biology revision"). */
function sameTopic(a, b) {
  if (a.packId && b.packId && a.packId === b.packId) return true
  const x = topicKey(a.title)
  const y = topicKey(b.title)
  if (!x || !y) return false
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  return short === long || (short.length >= 4 && long.includes(short))
}

const localDay = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

/**
 * Unfinished sessions that `candidate` ({ id?, title, packId, start, end })
 * would clash with: any overlapping its time, or one on the same topic the
 * same day (a likely duplicate). The session being edited is skipped. Same
 * rules as AI Chat (supabase/functions/chat/schedule.ts).
 */
export function findClashes(candidate, sessions) {
  if (!candidate.start || !candidate.end) return []
  return sessions
    .filter((s) => !s.completedAt && s.id !== candidate.id && localDay(s.start) === localDay(candidate.start))
    .map((s) => (candidate.start < s.end && s.start < candidate.end
      ? { session: s, kind: 'overlap' }
      : sameTopic(candidate, s) ? { session: s, kind: 'same_topic' } : null))
    .filter(Boolean)
}

// ── Too much study ─────────────────────────────────────────────
// Same limits and rules as AI Chat (findStrain in supabase/functions/chat/schedule.ts).
const WEEK_WARN_MINUTES = 25 * 60
const WEEK_FIRM_MINUTES = 30 * 60
const STRETCH_MAX_MINUTES = 3 * 60
const REST_GAP_MINUTES = 10
const DAY_MAX_SESSIONS = 4

const minutes = (a, b) => Math.round((b - a) / 60000)

/** Local midnight of the Monday on or before `date`. */
function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

/**
 * How heavy the plan gets with `candidate` ({ id?, type, start, end }) added:
 * the week's study (Monday to Sunday, finished or not), the stretch it joins
 * with no real break (gaps under 10 minutes don't count), and the day's study
 * sessions. Breaks never count, and the session being edited isn't counted
 * twice. Returns null when nothing is over the limits.
 */
export function findStrain(candidate, sessions) {
  if (!candidate.start || !candidate.end || candidate.type === 'break') return null
  const others = sessions.filter((s) => s.type !== 'break' && s.id !== candidate.id)

  const monday = mondayOf(candidate.start)
  const nextMonday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7)
  const week = others
    .filter((s) => s.start >= monday && s.start < nextMonday)
    .reduce((sum, s) => sum + minutes(s.start, s.end), minutes(candidate.start, candidate.end))

  const day = others.filter((s) => localDay(s.start) === localDay(candidate.start))
  let from = candidate.start
  let to = candidate.end
  const gap = REST_GAP_MINUTES * 60000
  for (let changed = true; changed;) {
    changed = false
    for (const s of day) {
      if (s.start < new Date(to.getTime() + gap) && s.end > new Date(from.getTime() - gap) && (s.start < from || s.end > to)) {
        if (s.start < from) from = s.start
        if (s.end > to) to = s.end
        changed = true
      }
    }
  }
  const stretch = minutes(from, to)
  const count = day.length + 1

  const reasons = []
  if (week > WEEK_WARN_MINUTES) reasons.push('week')
  if (stretch > STRETCH_MAX_MINUTES) reasons.push('stretch')
  if (count > DAY_MAX_SESSIONS) reasons.push('day')
  return reasons.length ? { weekMinutes: week, stretchMinutes: stretch, dayCount: count, firm: week > WEEK_FIRM_MINUTES, reasons } : null
}
