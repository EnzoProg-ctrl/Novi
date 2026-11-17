import { useEffect, useState } from 'react'
import { fetchStudyPack } from './packs'

/**
 * Study packs kept on this device, so they open with no internet (the
 * Offline screen). Stored in IndexedDB: the summary, key concepts and
 * practice questions of each pack the student chose to keep.
 *
 * Private to this browser and this student. Signing out removes them all
 * (AuthProvider), so the next person on a shared device never sees them.
 */

const DB_NAME = 'novi-offline'
const STORE = 'packs'
const CHANGED = 'novi:offline-changed'

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Offline storage isn’t available in this browser.'))
      return
    }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Runs `fn(store)` in a transaction and resolves with its request's result. */
async function run(mode, fn) {
  const db = await open()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req?.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

const changed = () => window.dispatchEvent(new CustomEvent(CHANGED))

/** Every kept pack, newest first. */
export async function listOfflinePacks() {
  const all = (await run('readonly', (s) => s.getAll())) ?? []
  return all.sort((a, b) => b.savedAt - a.savedAt)
}

export const getOfflinePack = (id) => run('readonly', (s) => s.get(id))

/** Downloads each pack and keeps it on this device. Resolves with how many were kept. */
export async function keepOffline(userId, packIds) {
  // Ask the browser not to clear this storage when space runs low. Installed
  // apps get this anyway; in a browser tab it is best effort.
  navigator.storage?.persist?.().catch(() => {})
  let kept = 0
  for (const id of packIds) {
    const pack = await fetchStudyPack(id)
    if (!pack) continue
    const record = {
      id: pack.id,
      userId,
      title: pack.title,
      subject: pack.subject,
      summary: pack.summary,
      concepts: pack.concepts.map((c) => ({ id: c.id, term: c.term, definition: c.definition, example: c.example ?? null })),
      questions: pack.questions
        .filter((q) => q.prompt && q.correct_answer != null)
        .map((q) => ({
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          choices: q.choices,
          correct_answer: q.correct_answer,
          explanation: q.explanation ?? null,
        })),
      savedAt: Date.now(),
    }
    await run('readwrite', (s) => s.put(record))
    kept += 1
  }
  changed()
  return kept
}

export async function removeOfflinePack(id) {
  await run('readwrite', (s) => s.delete(id))
  changed()
}

/** Removes every kept pack (signing out, or "Remove all" in Settings). */
export async function clearOfflinePacks() {
  try {
    await run('readwrite', (s) => s.clear())
  } catch {
    /* nothing stored, or storage unavailable */
  }
  changed()
}

/** The ids of the packs kept on this device, kept up to date. */
export function useOfflinePackIds() {
  const [ids, setIds] = useState(() => new Set())
  useEffect(() => {
    let active = true
    const load = () =>
      listOfflinePacks()
        .then((packs) => active && setIds(new Set(packs.map((p) => p.id))))
        .catch(() => active && setIds(new Set()))
    load()
    window.addEventListener(CHANGED, load)
    return () => {
      active = false
      window.removeEventListener(CHANGED, load)
    }
  }, [])
  return ids
}

/** Whether the browser says it has a connection, kept up to date. */
export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}
