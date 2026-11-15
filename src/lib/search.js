import { supabase } from './supabase'
import { toConversation } from './chat'

/**
 * The top-bar search: study packs, topics and key concepts, and AI Chat
 * conversations whose names contain what the student typed. Plain table reads
 * under RLS, so a student only ever finds their own things.
 */

const PER_GROUP = 5
const MAX_QUERY = 80

/** An ilike pattern matching `text` anywhere, with its wildcards taken literally. */
function containsPattern(text) {
  const literal = text.slice(0, MAX_QUERY).replace(/[\\%_]/g, (c) => `\\${c}`)
  return `%${literal}%`
}

const countOf = (rel) => (Array.isArray(rel) ? (rel[0]?.count ?? 0) : (rel?.count ?? 0))

/** Throws the first error among Supabase results, otherwise returns their data. */
function dataOf(...results) {
  const failed = results.find((r) => r.error)
  if (failed) throw failed.error
  return results.map((r) => r.data ?? [])
}

/**
 * Results grouped for the dropdown, each list capped at a few items:
 * `{ packs: [{id, title, questions}], topics: [{key, name, kind, packId, packTitle}],
 *   chats: [{id, title}] }`. An empty or one-letter query returns empty lists.
 */
export async function searchEverything(query) {
  const text = query.trim()
  const empty = { packs: [], topics: [], chats: [] }
  if (text.length < 2) return empty
  const like = containsPattern(text)

  const [byTitle, byFile, topicRows, conceptRows, chatRows] = dataOf(
    ...(await Promise.all([
      supabase.from('study_sets').select('id, title, questions ( count )')
        .ilike('title', like).order('updated_at', { ascending: false }).limit(PER_GROUP),
      // A pack can also be found by the name of the file it was made from.
      supabase.from('materials').select('study_sets ( id, title, questions ( count ) )')
        .ilike('title', like).order('created_at', { ascending: false }).limit(PER_GROUP),
      supabase.from('topics').select('id, name').ilike('name', like).limit(PER_GROUP),
      supabase.from('key_concepts').select('term, study_set_id, study_sets ( title )')
        .ilike('term', like).limit(PER_GROUP * 2),
      supabase.from('chat_conversations').select('id, title, study_set_id, last_message_at, created_at')
        .ilike('title', like).order('last_message_at', { ascending: false }).limit(PER_GROUP),
    ])),
  )

  // ── Packs: title matches first, then file-name matches, no repeats ──
  const packs = []
  const seenPacks = new Set()
  for (const set of [...byTitle, ...byFile.flatMap((m) => m.study_sets ?? [])]) {
    if (!set?.id || seenPacks.has(set.id)) continue
    seenPacks.add(set.id)
    packs.push({ id: set.id, title: set.title, questions: countOf(set.questions) })
  }

  // ── Topics live across packs: show each in a pack that practises it ──
  let topicPacks = []
  if (topicRows.length) {
    const [rows] = dataOf(
      await supabase.from('questions').select('topic_id, study_set_id, study_sets ( title )')
        .in('topic_id', topicRows.map((t) => t.id)).limit(200),
    )
    topicPacks = rows
  }
  const topics = []
  const seenTopics = new Set()
  const addTopic = (name, kind, packId, packTitle) => {
    const key = `${packId}:${name.toLowerCase()}`
    if (!packId || seenTopics.has(key)) return
    seenTopics.add(key)
    topics.push({ key, name, kind, packId, packTitle: packTitle ?? 'a study pack' })
  }
  for (const topic of topicRows) {
    const where = topicPacks.find((q) => q.topic_id === topic.id)
    if (where) addTopic(topic.name, 'topic', where.study_set_id, where.study_sets?.title)
  }
  for (const concept of conceptRows) addTopic(concept.term, 'concept', concept.study_set_id, concept.study_sets?.title)

  return {
    packs: packs.slice(0, PER_GROUP),
    topics: topics.slice(0, PER_GROUP),
    chats: chatRows.map(toConversation).map(({ id, title }) => ({ id, title })),
  }
}
