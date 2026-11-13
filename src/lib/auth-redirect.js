/**
 * What Supabase said when an email link brought the student back to Novi.
 *
 * After a confirmation link is clicked, Supabase redirects here with details
 * in the URL hash: a message ("now confirm the link sent to the other email"),
 * an error (link expired or already used), or new sign-in tokens once an
 * email change is complete. supabase-js only acts on the tokens, so without
 * this the other two were silently dropped and the link looked broken.
 *
 * Read once, when this module loads. supabase.js imports it before creating
 * its client, so messages and errors are taken out of the address bar before
 * the client looks at the URL. Sign-in tokens are left in place for
 * supabase-js, which removes them itself.
 */

import { ACTIVITY_KEY } from '../context/auth-context'

/**
 * Following a link from an email is activity. Without this, a student who
 * hadn't opened Novi for a week would be signed out by the idle check
 * (AuthProvider) the moment a password reset link signed them in.
 */
function markActive() {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(Date.now()))
  } catch {
    /* storage blocked: nothing to update */
  }
}

/**
 * Set while a password reset link's session is open and no new password has
 * been saved. That session is only for choosing a new password: every page
 * sends the student to /reset-password until it is saved or cancelled (both
 * sign out). Kept in localStorage so every open tab follows it, since
 * supabase-js shares the session between tabs.
 */
const RECOVERY_KEY = 'novi.passwordRecovery'

export function isRecoveryPending() {
  try {
    return localStorage.getItem(RECOVERY_KEY) !== null
  } catch {
    return false
  }
}

export function setRecoveryPending() {
  try {
    localStorage.setItem(RECOVERY_KEY, String(Date.now()))
  } catch {
    /* storage blocked: the reset page still works in this tab */
  }
}

export function clearRecoveryPending() {
  try {
    localStorage.removeItem(RECOVERY_KEY)
  } catch {
    /* nothing to clear */
  }
}

export const RECOVERY_STORAGE_KEY = RECOVERY_KEY

function readHash() {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash.slice(1)
  if (!hash.includes('=')) return null // a normal hash, like a Settings tab

  const params = new URLSearchParams(hash)
  let notice
  if (params.get('error') || params.get('error_description')) {
    notice = { kind: 'error', code: params.get('error_code'), detail: params.get('error_description') }
  } else if (params.get('message')) {
    notice = { kind: 'halfway', detail: params.get('message') }
  } else if (params.get('access_token')) {
    // Tokens stay in the address bar for supabase-js.
    markActive()
    const type = params.get('type')
    if (type === 'email_change') return { kind: 'email_changed' }
    if (type === 'recovery') {
      setRecoveryPending()
      return { kind: 'recovery' }
    }
    return null
  } else {
    return null
  }

  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
  return notice
}

let pending = readHash()

/** The notice from the link that opened Novi, if any; it stays until taken. */
export const peekAuthRedirectNotice = () => pending

/** Marks the notice as shown, so leaving and reopening Settings doesn't repeat it. */
export function takeAuthRedirectNotice() {
  pending = null
}
