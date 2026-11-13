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
