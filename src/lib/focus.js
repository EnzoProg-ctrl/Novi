import { supabase } from './supabase'

/**
 * The one pack the sidebar's "Today's Focus" card points at, chosen in order:
 *
 *   1. today's next planned session that is linked to a pack and not over yet
 *   2. an unfinished practice session, so the student picks up where they left off
 *   3. the most recently updated pack
 *
 * Returns null when the student has no packs at all. RLS scopes every query to
 * the signed-in student.
 */
export async function fetchTodaysFocus(userId) {
  const now = new Date()
  const endOfDay = new Date(now)
  endOfDay.setHours(23, 59, 59, 999)

  const [planned, open, latest] = await Promise.all([
    supabase
      .from('scheduled_sessions')
      .select('starts_at, study_set_id')
      .eq('user_id', userId)
      .is('completed_at', null)
      .not('study_set_id', 'is', null)
      .gt('ends_at', now.toISOString())
      .lte('starts_at', endOfDay.toISOString())
      .order('starts_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('study_sessions')
      .select('study_set_id, focus_topic_id')
      .eq('user_id', userId)
      .is('ended_at', null)
      .not('study_set_id', 'is', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('study_sets')
      .select('id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  for (const result of [planned, open, latest]) if (result.error) throw result.error

  let reason = null
  let packId = null
  let focusTopicId = null
  let startsAt = null
  if (planned.data) {
    reason = 'scheduled'
    packId = planned.data.study_set_id
    startsAt = new Date(planned.data.starts_at)
  } else if (open.data) {
    reason = 'resume'
    packId = open.data.study_set_id
    focusTopicId = open.data.focus_topic_id ?? null
  } else if (latest.data) {
    reason = 'latest'
    packId = latest.data.id
  }
  if (!packId) return null

  const { data: pack, error } = await supabase
    .from('study_sets')
    .select('id, title, material_id, subjects ( name ), key_concepts ( count ), questions ( count ), summaries ( count )')
    .eq('id', packId)
    .maybeSingle()
  if (error) throw error
  if (!pack) return null

  const countOf = (rel) => (Array.isArray(rel) ? (rel[0]?.count ?? 0) : (rel?.count ?? 0))
  return {
    reason,
    startsAt,
    focusTopicId,
    pack: {
      id: pack.id,
      materialId: pack.material_id,
      title: pack.title,
      subject: pack.subjects?.name ?? null,
      concepts: countOf(pack.key_concepts),
      questions: countOf(pack.questions),
      summaries: countOf(pack.summaries),
    },
  }
}
