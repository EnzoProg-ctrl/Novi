import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/auth-context'
import { useAttemptLimit } from '../lib/useAttemptLimit'
import { Logo } from './Mascot'

/**
 * The second step of signing in, for students who turned on two-step
 * verification: a 6-digit code from their authenticator app.
 *
 * Until it is entered the session is only partly trusted (aal1), and the
 * database itself refuses to return their data, so this screen is the only
 * thing they can reach.
 */
export function MfaChallenge() {
  const { verifyMfa, signOut, user } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)
  const limit = useAttemptLimit('novi.mfaAttempts')

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (busy || limit.locked) return
    const clean = code.replace(/\s+/g, '')
    if (!/^\d{6}$/.test(clean)) {
      setError('Enter the 6-digit code from your authenticator app.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await verifyMfa(clean)
      limit.succeed()
      // The upgraded session arrives through AuthProvider; the app takes over.
    } catch (err) {
      limit.fail()
      setCode('')
      setError(
        /rate|too many/i.test(err?.message ?? '')
          ? 'Too many attempts. Wait a minute, then try again.'
          : "That code didn't work. Codes change every 30 seconds, so use the newest one.",
      )
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="auth-shell">
      <form className="card card-pad auth-card" onSubmit={submit} noValidate>
        <Logo />
        <h2 className="auth-title">Two-step verification</h2>
        <p className="hint">
          Enter the 6-digit code from your authenticator app{user?.email ? ` for ${user.email}` : ''}.
        </p>

        {limit.locked ? (
          <div className="msg msg-error auth-gap" role="alert">
            Too many tries. You can try again in {limit.secondsLeft}s.
          </div>
        ) : (
          error && <div className="msg msg-error auth-gap" role="alert">{error}</div>
        )}

        <div className="auth-gap field">
          <label className="label" htmlFor="mfa-code">Verification code</label>
          <input
            ref={inputRef}
            id="mfa-code"
            className="input mfa-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, '').slice(0, 7))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={7}
            placeholder="123 456"
            disabled={busy || limit.locked}
            aria-invalid={error ? 'true' : undefined}
          />
        </div>

        <button className="btn btn-primary btn-block auth-gap" disabled={busy || limit.locked}>
          {busy && <span className="spinner" />}
          {busy ? 'Checking…' : 'Verify'}
        </button>

        <p className="hint auth-foot">
          Not you, or lost your phone?{' '}
          <button type="button" className="mfa-link" onClick={() => signOut().catch(() => {})}>
            Sign out
          </button>
        </p>
      </form>
    </div>
  )
}
