import { supabase } from './supabase'

/**
 * One study pack with everything generated from it.
 *
 * Fetched in a single round trip via embedded selects. RLS applies, so a pack
 * belonging to another student simply comes back as not found.
 */
export async function fetchStudyPack(packId) {
  const { data, error } = await supabase
    .from('study_sets')
    .select(`
      id, title, status, generation_model, created_at,
      subjects ( name ),
      materials ( id, title, source_type ),
      summaries ( kind, content, reading_level ),
      key_concepts ( id, term, definition, example, importance, position ),
      questions ( id, topic_id, type, prompt, choices, correct_answer, explanation, difficulty, position )
    `)
    .eq('id', packId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const byPosition = (a, b) => (a.position ?? 0) - (b.position ?? 0)

  return {
    id: data.id,
    title: data.title,
    status: data.status,
    model: data.generation_model,
    createdAt: data.created_at,
    subject: data.subjects?.name ?? null,
    material: data.materials ?? null,
    // 'overview' is what the pipeline writes; fall back to whichever exists.
    summary:
      data.summaries?.find((s) => s.kind === 'overview')?.content ??
      data.summaries?.[0]?.content ??
      null,
    concepts: [...(data.key_concepts ?? [])].sort(byPosition),
    questions: [...(data.questions ?? [])].sort(byPosition),
  }
}

/**
 * All of a student's packs, with the counts the list shows.
 *
 * Counts come from PostgREST's embedded aggregate, so this stays one round
 * trip rather than a query per pack.
 */
/** First couple of sentences of a summary, stripped of markdown noise. */
function excerptFrom(markdown, max = 180) {
  if (!markdown) return null
  const plain = markdown
    .replace(/[#*`_>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (plain.length <= max) return plain
  const cut = plain.slice(0, max)
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '))
  return (lastStop > 80 ? cut.slice(0, lastStop + 1) : cut.trimEnd() + '…')
}

export async function fetchPackList(userId, { subjectId = null, sort = 'updated' } = {}) {
  let query = supabase
    .from('study_sets')
    .select(`
      id, title, status, created_at, updated_at,
      subjects ( id, name ),
      materials ( title ),
      key_concepts ( count ),
      questions ( count ),
      summaries ( kind, content )
    `)
    .eq('user_id', userId)

  if (subjectId) query = query.eq('subject_id', subjectId)

  if (sort === 'title') query = query.order('title', { ascending: true })
  else if (sort === 'created') query = query.order('created_at', { ascending: false })
  else query = query.order('updated_at', { ascending: false })

  const { data, error } = await query
  if (error) throw error

  const countOf = (rel) => (Array.isArray(rel) ? (rel[0]?.count ?? 0) : (rel?.count ?? 0))

  return (data ?? []).map((row) => {
    const summaries = row.summaries ?? []
    const overview = summaries.find((s) => s.kind === 'overview') ?? summaries[0]
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      subject: row.subjects?.name ?? null,
      subjectId: row.subjects?.id ?? null,
      sourceTitle: row.materials?.title ?? null,
      concepts: countOf(row.key_concepts),
      questions: countOf(row.questions),
      summaries: summaries.length,
      // Stands in for a description: study_sets has no such column, so the
      // opening of the summary is the most honest one-line account of a pack.
      excerpt: excerptFrom(overview?.content),
    }
  })
}
