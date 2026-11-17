import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

/**
 * Sharing study packs by link. Making a link, previewing one and adding one
 * go through the share-packs function, which does the copying; a student's
 * own links (and who added them) are read straight from the database, where
 * row level security keeps each student to their own.
 */

export const EXPIRY_OPTIONS = [
  { days: 1, label: '1 day' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
]

export const shareUrl = (code) => `${window.location.origin}/share/${code}`

async function call(body, fallback) {
  const { data, error } = await supabase.functions.invoke('share-packs', { body })
  if (!error) return data
  let message = fallback
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json()
      if (payload?.error) message = payload.error
    } catch {
      /* keep the generic message */
    }
  }
  const err = new Error(message)
  err.status = error.context?.status
  throw err
}

/** A new link for these packs. Resolves to { code, expires_at, packs }. */
export const createShare = (studySetIds, expiresDays) =>
  call({ action: 'create', study_set_ids: studySetIds, expires_days: expiresDays }, 'The link could not be made. Try again.')

/** Who shared what, before adding it. */
export const previewShare = (code) => call({ action: 'preview', code }, 'This share link could not be opened.')

/** Copies the link's packs into this student's Shared with Me. */
export const acceptShare = (code) => call({ action: 'accept', code }, 'The packs could not be added. Try again.')

/** The student's own links, newest first, with their packs and who added them. */
export async function fetchMyShares(userId) {
  const { data, error } = await supabase
    .from('pack_shares')
    .select(`
      id, code, expires_at, created_at,
      pack_share_items ( study_sets ( id, title ) ),
      pack_share_redemptions ( id, receiver_name, packs_added, created_at )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    expired: Date.parse(row.expires_at) <= Date.now(),
    packs: (row.pack_share_items ?? []).map((i) => i.study_sets).filter(Boolean),
    added: [...(row.pack_share_redemptions ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)),
  }))
}

// ── A link opened while signed out ────────────────────────────────
// Kept until the student has signed in (or made an account and a buddy), so
// they land back on the link instead of the dashboard. localStorage, not
// sessionStorage: a confirmation email opens in a new tab.

const PENDING_KEY = 'novi.pendingShare'
const PENDING_TTL_MS = 24 * 60 * 60 * 1000
const validCode = (code) => typeof code === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(code)

export function rememberPendingShare(code) {
  if (!validCode(code)) return
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ code, at: Date.now() }))
  } catch {
    /* storage blocked: the student can open the link again */
  }
}

export function readPendingShare() {
  try {
    const saved = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null')
    if (validCode(saved?.code) && Date.now() - saved.at < PENDING_TTL_MS) return saved.code
  } catch {
    /* nothing usable */
  }
  return null
}

export function clearPendingShare() {
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch {
    /* nothing to clear */
  }
}
