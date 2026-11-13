/**
 * Messages still waiting for Novi's reply, kept outside the Chat page.
 *
 * The page unmounts when the student goes to another page, but the request
 * it started keeps going and the server saves the reply. This store remembers
 * that request, so coming back shows the message with Novi still typing, and
 * the reply appears when it lands, instead of a message that looks ignored.
 *
 * Keyed by conversation id, or NEW_CHAT for a chat whose first message has not
 * created it yet. Lives for the browser tab only; a reload falls back to the
 * page checking the server for a reply (see Chat.jsx).
 */

export const NEW_CHAT = 'new'

/** A new chat older than this is no longer something to jump back into. */
const NEW_CHAT_TTL_MS = 3 * 60 * 1000

const entries = new Map()
const listeners = new Set()
const emit = () => listeners.forEach((fn) => fn())

export const inflight = {
  /** { message, attachment, startedAt, status: 'pending' | 'done' | 'failed', conversationId, error, saved } */
  get(key) {
    const entry = entries.get(key) ?? null
    if (entry && key === NEW_CHAT && Date.now() - entry.startedAt > NEW_CHAT_TTL_MS) {
      entries.delete(key)
      return null
    }
    return entry
  },

  start(key, { message = null, attachment = null } = {}) {
    entries.set(key, {
      message,
      attachment,
      startedAt: Date.now(),
      status: 'pending',
      conversationId: key === NEW_CHAT ? null : key,
      error: null,
      saved: false,
    })
    emit()
  },

  /**
   * Records how a send ended. A new chat's entry is also filed under its real
   * id, so opening that chat from Recent Chats finds it too.
   */
  settle(key, patch) {
    const entry = entries.get(key)
    if (!entry) return
    const next = { ...entry, ...patch }
    entries.set(key, next)
    if (key === NEW_CHAT && next.conversationId) entries.set(next.conversationId, next)
    emit()
  },

  /** Forgets one key only (a new chat's entry stays filed under its real id). */
  drop(key) {
    if (entries.delete(key)) emit()
  },

  clear(key) {
    const entry = entries.get(key)
    if (!entry) return
    entries.delete(key)
    if (key === NEW_CHAT && entry.conversationId && entries.get(entry.conversationId) === entry) {
      entries.delete(entry.conversationId)
    }
    emit()
  },

  subscribe(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
}
