import { deleteMaterials, deleteMaterialsOnExit } from './materials'
import { supabase } from './supabase'

/**
 * Deleting material (and the study pack made from it) waits UNDO_MS before it
 * happens, so a slip can be undone.
 *
 * Kept here rather than in a component so the countdown carries on when the
 * student moves to another page, and so every view (Home, the sidebar, the
 * undo toast) agrees on what is about to go. Only one deletion waits at a
 * time: starting another sends the earlier one through first.
 *
 * Nothing is deleted on the server until the countdown ends; until then the
 * material is only hidden. If the tab closes mid-countdown the deletion is
 * sent as the page closes (deleteMaterialsOnExit), and signing out sends it
 * first (AuthProvider), so a deletion the student saw happen does happen.
 */

export const UNDO_MS = 5000

let pending = null // { key, materials, ids, remaining, startedAt, paused, committing, token, timer, promise }
let failure = null // { key, count } after a deletion fails; the material is back
let snapshot = { pending, failure }
const listeners = new Set()

function emit() {
  snapshot = { pending, failure }
  listeners.forEach((listener) => listener())
}

/** For useSyncExternalStore. */
export function subscribeDeletes(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const getDeleteSnapshot = () => snapshot

const NO_IDS = new Set()
/** Material ids that are hidden because their deletion is pending. */
export const hiddenMaterialIds = (state) => state.pending?.ids ?? NO_IDS

function startTimer() {
  pending.startedAt = Date.now()
  pending.timer = setTimeout(commitDelete, pending.remaining)
}

/** Hides `materials` now and deletes them after UNDO_MS unless undone. */
export async function scheduleDelete(materials) {
  if (materials.length === 0) return
  if (pending) await commitDelete()
  // Saved now, for the delete-on-close request, which can't wait for it then.
  const { data } = await supabase.auth.getSession()
  failure = null
  pending = {
    key: crypto.randomUUID(),
    materials,
    ids: new Set(materials.map((m) => m.id)),
    remaining: UNDO_MS,
    startedAt: Date.now(),
    paused: false,
    committing: false,
    token: data.session?.access_token ?? null,
    timer: null,
    promise: null,
  }
  startTimer()
  emit()
}

/** Puts the material back. False if it is too late (already being deleted). */
export function undoDelete() {
  if (!pending || pending.committing) return false
  clearTimeout(pending.timer)
  pending = null
  emit()
  return true
}

/** Holds the countdown, while the student is reading or reaching for Undo. */
export function pauseDelete() {
  if (!pending || pending.paused || pending.committing) return
  clearTimeout(pending.timer)
  pending = { ...pending, paused: true, remaining: Math.max(0, pending.remaining - (Date.now() - pending.startedAt)) }
  emit()
}

export function resumeDelete() {
  if (!pending || !pending.paused || pending.committing) return
  pending = { ...pending, paused: false }
  startTimer()
  emit()
}

/** Deletes now. Safe to call more than once; later calls wait for the first. */
export function commitDelete() {
  if (!pending) return Promise.resolve()
  if (pending.promise) return pending.promise
  const entry = pending
  clearTimeout(entry.timer)
  const promise = (async () => {
    try {
      await deleteMaterials(entry.materials)
    } catch (err) {
      console.warn('Deleting material failed:', err)
      failure = { key: entry.key, count: entry.materials.length }
    }
    if (pending?.key === entry.key) pending = null
    emit()
    // Lists that show material or packs reload from the server.
    window.dispatchEvent(new CustomEvent('novi:materials-changed'))
  })()
  pending = { ...entry, committing: true, promise }
  emit()
  return promise
}

export function dismissDeleteFailure() {
  if (!failure) return
  failure = null
  emit()
}

if (typeof window !== 'undefined') {
  // `pagehide`, not `beforeunload`: it also fires on phones when the browser
  // drops the page, and doesn't stop the page going into the back/forward cache.
  window.addEventListener('pagehide', () => {
    if (pending && !pending.committing) {
      deleteMaterialsOnExit(pending.materials, pending.token)
      pending.sentOnExit = true
    }
  })
  // The page can come back from the back/forward cache with its countdown
  // still showing. That deletion was already sent, so Undo can no longer
  // bring it back: close it and reload what's on screen.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted || !pending?.sentOnExit) return
    clearTimeout(pending.timer)
    pending = null
    emit()
    window.dispatchEvent(new CustomEvent('novi:materials-changed'))
  })
}
