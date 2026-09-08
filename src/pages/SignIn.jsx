import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Mascot'
import { PasswordField } from '../components/PasswordField'
import { useAuth } from '../context/auth-context'

export function SignIn() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const update = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn(form)
      // ProtectedRoute forwards to /buddy/new if this student has no buddy yet.
      navigate(location.state?.from ?? '/dashboard', { replace: true })
    } catch (err) {
      const msg = err?.message ?? 'Something went wrong.'
      setError(
        /invalid login/i.test(msg) ? 'That email and password do not match.' : msg,
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

        {error && <div className="msg msg-error auth-gap">{error}</div>}

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
        </div>

        <button className="btn btn-primary btn-block auth-gap" disabled={busy}>
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
