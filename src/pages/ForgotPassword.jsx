import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Logo } from '../components/Mascot'
import { authErrorMessage, requestPasswordReset } from '../lib/account'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Supabase allows one reset email per address per minute. */
const RESEND_AFTER_S = 60

export function ForgotPassword() {
  const location = useLocation()
  const [email, setEmail] = useState(location.state?.email ?? '')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState(null)
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (wait <= 0) return
    const timer = setTimeout(() => setWait((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])

  async function send(address) {
    setBusy(true)
    setError(null)
    try {
      await requestPasswordReset(address)
      setSentTo(address)
      setWait(RESEND_AFTER_S)
    } catch (err) {
      setError(authErrorMessage(err, "The reset link couldn't be sent. Try again in a moment."))
    } finally {
      setBusy(false)
    }
  }

  function submit(event) {
    event.preventDefault()
    if (busy) return
    const clean = email.trim()
    if (!EMAIL_RE.test(clean)) {
      setError('Enter the email address you sign in with.')
      return
    }
    send(clean)
  }

  if (sentTo) {
    return (
      <div className="auth-shell">
        <div className="card card-pad auth-card">
          <Logo />
          <h2 className="auth-title">Check your email</h2>
          <p className="hint">
            If <strong>{sentTo}</strong> has a Novi account, a link to reset your password is on its
            way. Open it on this device. It works once and expires after a while.
          </p>
          <p className="hint">Nothing there? Check your spam folder, or send it again.</p>

          {error && <div className="msg msg-error auth-gap" role="alert">{error}</div>}

          <button
            type="button"
            className="btn btn-secondary btn-block auth-gap"
            onClick={() => send(sentTo)}
            disabled={busy || wait > 0}
          >
            {busy && <span className="spinner" />}
            {busy ? 'Sending...' : wait > 0 ? `Send again in ${wait}s` : 'Send again'}
          </button>
          <p className="hint auth-foot">
            <Link to="/signin">Back to sign in</Link>
            {' · '}
            <button type="button" className="mfa-link" onClick={() => setSentTo(null)}>Use a different email</button>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-shell">
      <form className="card card-pad auth-card" onSubmit={submit} noValidate>
        <Logo />
        <h2 className="auth-title">Reset your password</h2>
        <p className="hint">Enter the email you sign in with and we&rsquo;ll send you a link to set a new password.</p>

        {error && <div className="msg msg-error auth-gap" role="alert">{error}</div>}

        <div className="auth-gap">
          <div className="field">
            <label className="label" htmlFor="reset-email">Email</label>
            <input
              id="reset-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              required
            />
          </div>
        </div>

        <button className="btn btn-primary btn-block auth-gap" disabled={busy}>
          {busy && <span className="spinner" />}
          {busy ? 'Sending...' : 'Send reset link'}
        </button>

        <p className="hint auth-foot">
          Remembered it? <Link to="/signin">Back to sign in</Link>
        </p>
      </form>
    </div>
  )
}
