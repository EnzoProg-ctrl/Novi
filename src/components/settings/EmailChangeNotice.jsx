import { useState } from 'react'
import { friendlyError } from '../../lib/errors'

/**
 * Shown at the top of Settings after an email-change link brings the student
 * back. With secure email change, Supabase sends a link to the current address
 * and one to the new address, and the change only happens after both.
 */
export function EmailChangeNotice({ notice, user, onResend, onDismiss }) {
  const [busy, setBusy] = useState(false)
  const [resent, setResent] = useState(false)
  const [error, setError] = useState(null)

  const current = user?.email
  const next = user?.new_email
  const pending = Boolean(next)

  async function resend() {
    setBusy(true)
    setError(null)
    try {
      await onResend(next)
      setResent(true)
    } catch (err) {
      setError(friendlyError(err, "New links couldn't be sent. Wait a minute and try again."))
    } finally {
      setBusy(false)
    }
  }

  let tone = 'info'
  let title
  let body
  if (notice.kind === 'email_changed') {
    tone = 'success'
    title = 'Email updated'
    body = 'Both links are confirmed. Use your new email address the next time you sign in.'
  } else if (notice.kind === 'halfway') {
    title = 'One link confirmed, one to go'
    body = pending
      ? `Now open the email we sent to the other address (${current} or ${next}) and click its link. Your email changes once both are confirmed.`
      : 'Now open the email we sent to your other address and click its link. Your email changes once both are confirmed.'
  } else {
    tone = 'error'
    title = 'That link has expired or was already used'
    body = pending
      ? `Each link works once. If you already clicked this one, open the other email (sent to ${current} or ${next}). If both links have expired, send new ones.`
      : 'Each link works once and expires after a while. If your email still needs changing, start again with Update in the Account card.'
  }

  return (
    <div className={`msg msg-${tone} st-notice`} role={tone === 'error' ? 'alert' : 'status'}>
      <div className="st-notice-body">
        <p className="st-notice-title">{title}</p>
        <p>{resent ? `New links are on their way to ${current} and ${next}. Click both.` : body}</p>
        {error && <p className="st-notice-error">{error}</p>}
      </div>
      <div className="st-notice-actions">
        {notice.kind === 'error' && pending && !resent && (
          <button type="button" className="btn btn-secondary st-notice-btn" onClick={resend} disabled={busy}>
            {busy && <span className="spinner" />}
            {busy ? 'Sending…' : 'Send new links'}
          </button>
        )}
        <button type="button" className="st-notice-close" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  )
}
