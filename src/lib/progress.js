import { supabase } from './supabase'

/**
 * Data for the Progress page. The heavy lifting runs in Postgres functions
 * (migration novi_progress_aggregations), which group by the student's local
 * day and return a handful of rows rather than every answer. All of them are
 * security invoker, so RLS scopes them to the signed-in student.
 */

export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

/** Practice time grouped by local day, pack and sitting, for [start, end). */
export async function fetchActivity(start, end) {
  const { data, error } = await supabase.rpc('progress_activity', {
    p_start: start.toISOString(),
    p_end: end.toISOString(),
    p_tz: localTimeZone(),
  })
  if (error) throw error
  return data ?? []
}

/** Local study days (YYYY-MM-DD) since `since`, for streaks. */
export async function fetchActiveDays(since) {
  const { data, error } = await supabase.rpc('progress_active_days', {
    p_since: since.toISOString(),
    p_tz: localTimeZone(),
  })
  if (error) throw error
  // A set-returning scalar function comes back as values or as single-key rows.
  return (data ?? []).map((row) => (typeof row === 'string' ? row : Object.values(row)[0]))
}

/** Per pack: questions, questions answered correctly at least once, last practice. */
export async function fetchPackCompletion() {
  const { data, error } = await supabase.rpc('progress_pack_completion')
  if (error) throw error
  return data ?? []
}

/** Practice sittings started in [start, end), newest first. */
export async function fetchSittings(userId, start, end) {
  const { data, error } = await supabase
    .from('study_sessions')
    .select('id, mode, started_at, ended_at, questions_answered, questions_correct, study_set_id, study_sets ( id, title )')
    .eq('user_id', userId)
    .gte('started_at', start.toISOString())
    .lt('started_at', end.toISOString())
    .order('started_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return data ?? []
}
