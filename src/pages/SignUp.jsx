import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Mascot'
import { PasswordField } from '../components/PasswordField'
import { useAuth } from '../context/auth-context'
import { friendlyError } from '../lib/errors'

/** Supabase's error for an email that already has an account (when it reports one at all). */
const isAlreadyRegistered = (err) =>
  err?.code === 'user_already_exists' || err?.code === 'email_exists' || /already registered|already exists/i.test(err?.message ?? '')

export function SignUp() {
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ displayName: '', email: '', password: '' })
  const [error, setError] = useState(null)
  // The email entered already has an account: shown with ways in, not as a plain error.
  const [emailTaken, setEmailTaken] = useState(false)
  const [confirmSent, setConfirmSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const update = (key) => (event) => {
    if (key === 'email') setEmailTaken(false)
    setForm((current) => ({ ...current, [key]: event.target.value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setEmailTaken(false)

    if (form.password.length < 8) {
      setError('Use at least 8 characters for your password.')
      return
    }

    setBusy(true)
    try {
      const { needsEmailConfirmation, alreadyRegistered } = await signUp(form)
      if (alreadyRegistered) {
        setEmailTaken(true)
      } else if (needsEmailConfirmation) {
        setConfirmSent(true)
      } else {
        navigate('/buddy/new', { replace: true })
      }
    } catch (err) {
      if (isAlreadyRegistered(err)) setEmailTaken(true)
      else setError(friendlyError(err, 'Novi couldn’t create your account. Try again.'))
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
        {emailTaken && (
          <div className="msg msg-error auth-gap" role="alert">
            That email already has a Novi account. <Link to="/signin">Sign in</Link> instead, or{' '}
            <Link to="/forgot-password">reset your password</Link> if you&apos;ve forgotten it.
          </div>
        )}

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
