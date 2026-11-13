/**
 * What to show a student when something fails.
 *
 * Novi's own messages (thrown with `new Error('…')`) and Supabase Auth messages
 * are written for people, so they pass through. Raw database, storage and
 * network errors are not: they can name tables, columns or constraints, so
 * they are logged to the console for debugging and replaced with `fallback`.
 */
export function friendlyError(err, fallback) {
  if (!err) return fallback
  // Supabase Auth errors carry a `code` too, but their messages are safe to
  // show; known ones get Novi's own wording.
  if (err.__isAuthError) return knownAuthMessage(err) ?? (err.message?.trim() || fallback)
  const raw =
    // PostgREST errors are plain objects with these fields.
    'code' in Object(err) ||
    'details' in Object(err) ||
    'hint' in Object(err) ||
    err.__isStorageError ||
    // fetch() failing outright (offline, blocked).
    err.name === 'TypeError'
  if (raw) {
    console.warn('Request failed:', err)
    return fallback
  }
  return typeof err.message === 'string' && err.message.trim() ? err.message : fallback
}

/** Novi's wording for Supabase Auth errors a student can actually hit; null if unknown. */
function knownAuthMessage(err) {
  const code = err?.code ?? ''
  const message = err?.message ?? ''
  if (code === 'over_email_send_rate_limit' || /email rate limit/i.test(message)) {
    return 'Novi has sent too many emails in the last hour. Try again later.'
  }
  const wait = message.match(/after (\d+) seconds?/i)
  if (wait) return `For security, wait ${wait[1]} seconds before trying again.`
  if (code === 'over_request_rate_limit') return 'Too many attempts. Wait a few minutes, then try again.'
  if (code === 'email_exists') return 'That email already belongs to another Novi account.'
  if (code === 'same_password') return 'Choose a password different from your old one.'
  if (code === 'weak_password') return 'Choose a stronger password: longer, and not a common one.'
  if (code === 'insufficient_aal') return 'Enter your two-step verification code first.'
  if (code === 'reauthentication_needed') return 'For security, sign in again before making this change.'
  if (code === 'email_address_invalid' || /invalid.*email/i.test(message)) return 'Enter a valid email address.'
  if (/fetch/i.test(message)) return "You're offline. Check your connection and try again."
  return null
}

/** Like friendlyError, for Supabase Auth calls: Novi's wording, or `fallback`. */
export function authErrorMessage(err, fallback) {
  return knownAuthMessage(err) ?? fallback
}
