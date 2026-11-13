import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Mascot'
import { PasswordField } from '../components/PasswordField'
import { SIGNED_OUT_NOTICE_KEY, useAuth } from '../context/auth-context'
import { useAttemptLimit } from '../lib/useAttemptLimit'

/** Read once: why the student was signed out (after a week without activity). */
function takeSignedOutNotice() {
  try {
    const notice = sessionStorage.getItem(SIGNED_OUT_NOTICE_KEY)
    sessionStorage.removeItem(SIGNED_OUT_NOTICE_KEY)
    return notice
  } catch {
    return null
  }
}

export function SignIn() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [idleNotice] = useState(takeSignedOutNotice)
  // A short pause after 5 wrong tries. Supabase Auth also limits sign-ins on
  // the server, which is the real protection.
  const limit = useAttemptLimit('novi.signinAttempts')

  const update = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  async function handleSubmit(event) {
    event.preventDefault()
    if (limit.locked) return
    setError(null)
    setBusy(true)
    try {
      await signIn(form)
      limit.succeed()
      // ProtectedRoute forwards to /buddy/new if this student has no buddy yet.
      navigate(location.state?.from ?? '/dashboard', { replace: true })
    } catch (err) {
      const msg = err?.message ?? 'Something went wrong.'
      if (/invalid login/i.test(msg)) limit.fail()
      setError(
        /invalid login/i.test(msg)
          ? 'That email and password do not match.'
          : /rate limit|too many/i.test(msg)
            ? 'Too many sign-in attempts. Wait a few minutes, then try again.'
            : msg,
      )
      setBusy(false)
    }
  }

  return (
    <div className="auth-shell">
      <form className="card card-pad auth-card" onSubmit={handleSubmit}>
        <Logo />
        <h2 className="auth-title">Welcome back</h2>
        <p className="hint">Your buddy has been waiting.</p>

        {location.state?.notice && !error && (
          <div className="msg msg-success auth-gap" role="status">{location.state.notice}</div>
        )}
        {idleNotice && !location.state?.notice && !error && (
          <div className="msg msg-success auth-gap" role="status">{idleNotice}</div>
        )}
        {limit.locked ? (
          <div className="msg msg-error auth-gap" role="alert">
            Too many tries. You can try again in {limit.secondsLeft}s, or{' '}
            <Link to="/forgot-password" state={{ email: form.email.trim() }}>reset your password</Link>.
          </div>
        ) : (
          error && <div className="msg msg-error auth-gap" role="alert">{error}</div>
        )}

        <div className="auth-gap">
          <div className="field">
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              value={form.email}
              onChange={update('email')}
              autoComplete="email"
              required
            />
          </div>

          <PasswordField
            id="password"
            label="Password"
            value={form.password}
            onChange={update('password')}
            autoComplete="current-password"
            required
          />
          <p className="auth-forgot">
            <Link to="/forgot-password" state={{ email: form.email.trim() }}>Forgot password?</Link>
          </p>
        </div>

        <button className="btn btn-primary btn-block auth-gap" disabled={busy || limit.locked}>
          {busy && <span className="spinner" />}
          {busy ? 'Signing in...' : 'Sign in'}
        </button>

        <p className="hint auth-foot">
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </form>
    </div>
  )
}
