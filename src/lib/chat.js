import { SUPABASE_KEY, SUPABASE_URL, supabase } from './supabase'

/**
 * AI Chat data. Conversations and messages are read straight from the tables
 * (RLS limits them to the signed-in student); sending goes through the `chat`
 * Edge Function, which saves both messages and keeps the AI keys server-side.
 */

const CONVERSATION_COLUMNS = 'id, title, study_set_id, last_message_at, created_at'
const MESSAGE_COLUMNS = 'id, role, content, created_at, metadata, cited_chunk_ids'

/** Mirrors the limit the chat function enforces. */
export const MAX_MESSAGE_CHARS = 4000

export function toConversation(row) {
  return {
    id: row.id,
    title: row.title,
    studySetId: row.study_set_id ?? null,
    lastMessageAt: new Date(row.last_message_at),
  }
}

export function toMessage(row) {
  return {
    id: row.id,
    role: row.role === 'user' ? 'user' : 'buddy',
    content: row.content,
    createdAt: new Date(row.created_at),
    metadata: row.metadata ?? {},
  }
}

export async function listConversations(limit = 50) {
  const { data, error } = await supabase
    .from('chat_conversations')
    .select(CONVERSATION_COLUMNS)
    .order('last_message_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(toConversation)
}

/** A conversation with its messages, oldest first, or null if it is gone. */
export async function fetchConversation(id) {
  const [conv, msgs] = await Promise.all([
    supabase.from('chat_conversations').select(CONVERSATION_COLUMNS).eq('id', id).maybeSingle(),
    supabase
      .from('chat_messages')
      .select(MESSAGE_COLUMNS)
      .eq('conversation_id', id)
      .in('role', ['user', 'buddy'])
      .order('created_at', { ascending: true }),
  ])
  if (conv.error) throw conv.error
  if (msgs.error) throw msgs.error
  if (!conv.data) return null
  return { conversation: toConversation(conv.data), messages: (msgs.data ?? []).map(toMessage) }
}

const CHAT_URL = `${SUPABASE_URL}/functions/v1/chat`
const UNREACHABLE = 'Novi could not be reached. Check your connection and try again.'

/**
 * Sends one message, or asks for a new reply to the last one (`regenerate`).
 *
 * The reply is streamed in two steps: `onSaved({ conversation, userMessage })`
 * runs as soon as the student's message is stored (about a second), so it can
 * show as sent while Novi is still answering; the promise resolves with the
 * reply. If the first step never arrives, the message simply counts as sent
 * when the reply does.
 *
 * On failure the error carries whatever the function did save, so the page
 * can keep the conversation and the student's message and offer a retry:
 * `error.conversation` and `error.userMessage` (either may be null).
 */
export async function sendChat({ conversationId = null, message, studySetId = null, regenerate = false, materialId = null, onSaved }) {
  let saved = null
  const fail = (text, payload = null) => {
    const failure = new Error(text)
    failure.conversation = payload?.conversation ? toConversation(payload.conversation) : (saved?.conversation ?? null)
    failure.userMessage = payload?.user_message ? toMessage(payload.user_message) : (saved?.userMessage ?? null)
    return failure
  }

  const { data: { session } } = await supabase.auth.getSession()
  let res
  try {
    res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session?.access_token ?? SUPABASE_KEY}`,
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        message: regenerate ? undefined : message,
        study_set_id: studySetId,
        regenerate,
        material_id: materialId,
        stream: true,
      }),
    })
  } catch {
    throw fail(UNREACHABLE)
  }

  // Not a stream: an error before the function started (for example an
  // expired sign-in), or a plain answer.
  let outcome = null
  if (!res.ok || !res.body || !(res.headers.get('content-type') ?? '').includes('ndjson')) {
    let payload = null
    try {
      payload = await res.json()
    } catch {
      /* not JSON */
    }
    outcome = { status: res.status, body: payload ?? {} }
  } else {
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const handle = (line) => {
      if (!line.trim()) return
      let event
      try {
        event = JSON.parse(line)
      } catch {
        return
      }
      if (event.type === 'saved' && event.conversation && event.user_message) {
        saved = { conversation: toConversation(event.conversation), userMessage: toMessage(event.user_message) }
        try {
          onSaved?.(saved)
        } catch {
          /* the page's problem, not the send's */
        }
      } else if (event.type === 'done') {
        outcome = { status: event.status, body: event.body ?? {} }
      }
    }
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let cut
        while ((cut = buffer.indexOf('\n')) >= 0) {
          handle(buffer.slice(0, cut))
          buffer = buffer.slice(cut + 1)
        }
      }
      handle(buffer + decoder.decode())
    } catch {
      /* the connection dropped; handled below */
    }
    if (!outcome) throw fail(saved ? "Novi didn't finish answering that one. Try again." : UNREACHABLE)
  }

  const { status, body } = outcome
  if (status >= 400 || !body.reply || !body.conversation) {
    throw fail(body.error ?? (status === 401 ? 'Your session has ended. Sign in again.' : UNREACHABLE), body)
  }
  return {
    conversation: toConversation(body.conversation),
    userMessage: body.user_message ? toMessage(body.user_message) : (saved?.userMessage ?? null),
    reply: toMessage(body.reply),
  }
}

/**
 * Where an upload started from AI Chat has got to. `pack` is the study pack it
 * became, once processing has finished.
 */
export async function checkUpload(materialId) {
  const { data: material, error } = await supabase
    .from('materials')
    .select('status, error_message')
    .eq('id', materialId)
    .maybeSingle()
  if (error) throw error
  if (!material) return { status: 'failed', error: 'That upload no longer exists.', pack: null }
  if (material.status !== 'ready') {
    return { status: material.status === 'failed' ? 'failed' : 'processing', error: material.error_message, pack: null }
  }
  const { data: pack } = await supabase
    .from('study_sets')
    .select('id, title')
    .eq('material_id', materialId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return { status: 'ready', error: null, pack: pack ?? null }
}

/** Matches the length check on chat_conversations.title. */
export const MAX_TITLE_CHARS = 120

/**
 * Renames a conversation. Only the title changes: messages, the id and the
 * last activity time stay as they are (so the list order does not jump).
 * RLS means a conversation that is not the student's is simply not found.
 */
export async function renameConversation(id, title) {
  const clean = title.trim()
  if (!clean) throw new Error('Enter a name for this conversation.')
  if (clean.length > MAX_TITLE_CHARS) throw new Error(`Names can be up to ${MAX_TITLE_CHARS} characters.`)
  const { data, error } = await supabase
    .from('chat_conversations')
    .update({ title: clean })
    .eq('id', id)
    .select(CONVERSATION_COLUMNS)
    .maybeSingle()
  if (error) throw new Error("The new name couldn't be saved. Check your connection and try again.")
  if (!data) throw new Error('This conversation no longer exists.')
  return toConversation(data)
}

/**
 * Deletes a conversation for good. Its messages go with it (the foreign key
 * cascades); study packs and quizzes made in it are kept. Resolves only once
 * the server confirms a row was actually removed.
 */
export async function deleteConversation(id) {
  const { data, error } = await supabase.from('chat_conversations').delete().eq('id', id).select('id')
  if (error) throw new Error("This conversation couldn't be deleted. Check your connection and try again.")
  if (!data?.length) throw new Error('This conversation could not be found. It may already have been deleted.')
}

/** Thumbs up / down on a reply. `value` is 'up', 'down' or null to clear. */
export async function setFeedback(message, value) {
  const metadata = { ...message.metadata, feedback: value }
  const { error } = await supabase.from('chat_messages').update({ metadata }).eq('id', message.id)
  if (error) throw error
  return metadata
}

/** "2:15 PM" today, "Yesterday", a weekday this week, otherwise a date. */
export function whenLabel(date, now = new Date()) {
  const start = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((start(now) - start(date)) / 86400000)
  if (days <= 0) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (days === 1) return 'Yesterday'
  if (days < 7) return date.toLocaleDateString([], { weekday: 'long' })
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
}
