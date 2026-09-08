import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Mascot'
import { PasswordField } from '../components/PasswordField'
import { useAuth } from '../context/auth-context'

function friendlyError(err) {
  const msg = err?.message ?? 'Something went wrong.'
  if (/already registered|already exists/i.test(msg)) {
    return 'That email already has an account. Try signing in instead.'
  }
  return msg
}

export function SignUp() {
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ displayName: '', email: '', password: '' })
  const [error, setError] = useState(null)
  const [confirmSent, setConfirmSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const update = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)

    if (form.password.length < 8) {
      setError('Use at least 8 characters for your password.')
      return
    }

    setBusy(true)
    try {
      const { needsEmailConfirmation } = await signUp(form)
      if (needsEmailConfirmation) {
        setConfirmSent(true)
      } else {
        navigate('/buddy/new', { replace: true })
      }
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  if (confirmSent) {
    return (
      <div className="auth-shell">
        <div className="card card-pad auth-card">
          <Logo />
          <h2 className="auth-title">Check your email</h2>
          <p className="hint">
            We sent a confirmation link to <strong>{form.email}</strong>. Open it, then come
            back and sign in.
          </p>
          <Link to="/signin" className="btn btn-secondary btn-block auth-gap">
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-shell">
      <form className="card card-pad auth-card" onSubmit={handleSubmit}>
        <Logo />
        <h2 className="auth-title">Create your account</h2>
        <p className="hint">Next, you get to name your buddy.</p>

        {error && <div className="msg msg-error auth-gap">{error}</div>}

        <div className="auth-gap">
          <div className="field">
            <label className="label" htmlFor="name">What should we call you?</label>
            <input
              id="name"
              className="input"
              value={form.displayName}
              onChange={update('displayName')}
              placeholder="Enzo"
              autoComplete="given-name"
              required
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              value={form.email}
              onChange={update('email')}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>

          <PasswordField
            id="password"
            label="Password"
            value={form.password}
            onChange={update('password')}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            required
          />
        </div>

        <button className="btn btn-primary btn-block auth-gap" disabled={busy}>
          {busy && <span className="spinner" />}
          {busy ? 'Creating account...' : 'Create account'}
        </button>

        <p className="hint auth-foot">
          Already have one? <Link to="/signin">Sign in</Link>
        </p>
      </form>
    </div>
  )
}
