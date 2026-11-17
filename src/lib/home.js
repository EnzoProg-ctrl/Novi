import { supabase } from './supabase'

/** The student's most recently updated packs, for Recent Study Packs. */
export async function fetchStudySets(userId, limit = 6) {
  const { data, error } = await supabase
    .from('study_sets')
    .select('id, title, status, updated_at, material_id, subjects(name)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return (data ?? []).map((set) => ({
    id: set.id,
    materialId: set.material_id,
    subject: set.subjects?.name ?? null,
    title: set.title,
    status: set.status,
    updatedAt: set.updated_at,
  }))
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
 * makes a session resumable. Progress is answered-so-far against the length the
 * student chose for that sitting, or the whole set when they chose all of it.
 * Set sizes are counted in a second pass since PostgREST cannot aggregate a
 * child table inline.
 */
export async function fetchInProgress(userId, limit = 4) {
  const { data, error } = await supabase
    .from('study_sessions')
    .select('id, mode, started_at, questions_answered, target_count, focus_topic_id, study_sets(id, title, material_id, subjects(name)), topics(name)')
    .eq('user_id', userId)
    .is('ended_at', null)
    // study_sessions.study_set_id is ON DELETE SET NULL, so deleting a material
    // leaves its sessions behind as orphans. They cannot be resumed into
    // anything, so they must not appear here. The rows are kept rather than
    // deleted because they still count toward study time and streaks.
    .not('study_set_id', 'is', null)
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
    const setSize = set ? (totals.get(set.id) ?? 0) : 0
    const total = s.target_count ? Math.min(s.target_count, setSize) : setSize
    const done = s.questions_answered ?? 0
    return {
      id: s.id,
      packId: set?.id ?? null,
      // A session on one topic resumes through ?topic= (see Practice).
      focusTopicId: s.focus_topic_id ?? null,
      topicName: s.topics?.name ?? null,
      materialId: set?.material_id ?? null,
      subject: set?.subjects?.name ?? null,
      title: set?.title ?? 'Study session',
      modeLabel: MODE_LABEL[s.mode] ?? 'Session',
      done,
      total,
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
    }
  })
}
