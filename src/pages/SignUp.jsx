import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Mascot'
import { EmailSuggestion } from '../components/EmailSuggestion'
import { PasswordField } from '../components/PasswordField'
import { useAuth } from '../context/auth-context'
import { PASSWORD_HINT, passwordProblem } from '../lib/account'
import { domainProblem, emailProblem, emailSuggestion } from '../lib/emailCheck'
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
  // A likely typo in the email's domain, and an address the student said is right as typed.
  const [suggestion, setSuggestion] = useState(null)
  const [keptEmail, setKeptEmail] = useState(null)
  const [emailError, setEmailError] = useState(null)

  const update = (key) => (event) => {
    if (key === 'email') {
      setEmailTaken(false)
      setEmailError(null)
      setSuggestion(null)
    }
    setForm((current) => ({ ...current, [key]: event.target.value }))
  }

  /** Leaving the email field: point out a typo straight away, before submitting. */
  function checkEmailNow() {
    const email = form.email.trim()
    if (!email || email === keptEmail) return
    setSuggestion(emailSuggestion(email))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setEmailTaken(false)
    const email = form.email.trim()

    // The email first: a mistyped address means a confirmation link nobody gets.
    // A likely fix ("gmial.com", or "gmail" with no ending) comes before the error.
    const typo = email === keptEmail ? null : emailSuggestion(email)
    if (typo) {
      setSuggestion(typo)
      return
    }
    const shape = emailProblem(email)
    if (shape) {
      setEmailError(shape)
      return
    }

    const weak = passwordProblem(form.password)
    if (weak) {
      setError(weak)
      return
    }

    setBusy(true)
    const noMail = await domainProblem(email)
    if (noMail) {
      setEmailError(noMail)
      setBusy(false)
      return
    }
    try {
      const { needsEmailConfirmation, alreadyRegistered } = await signUp({ ...form, email })
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
          <p className="hint">Not there after a minute? Check your spam or junk folder.</p>
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
          // One paragraph: .msg is a flex row, so loose text and links would
          // otherwise be laid out as separate columns.
          <div className="msg msg-error auth-gap" role="alert">
            <p>
              <strong>That email already has a Novi account.</strong>
              <br />
              <Link to="/signin">Sign in</Link> or <Link to="/forgot-password">reset your password</Link>.
            </p>
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
              placeholder="Alex"
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
              onBlur={checkEmailNow}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? 'email-error' : undefined}
              required
            />
            {emailError && <span id="email-error" className="field-error" role="alert">{emailError}</span>}
            <EmailSuggestion
              suggestion={suggestion}
              onUse={(fixed) => {
                setForm((current) => ({ ...current, email: fixed }))
                setSuggestion(null)
                setEmailError(null)
              }}
              onKeep={() => {
                setKeptEmail(form.email.trim())
                setSuggestion(null)
              }}
            />
          </div>

          <PasswordField
            id="password"
            label="Password"
            value={form.password}
            onChange={update('password')}
            autoComplete="new-password"
            hint={PASSWORD_HINT}
            required
          />
        </div>

        <button className="btn btn-primary btn-block auth-gap" disabled={busy}>
          {busy && <span className="spinner" />}
          {busy ? 'Checking…' : 'Create account'}
        </button>

        <p className="hint auth-foot">
          Already have one? <Link to="/signin">Sign in</Link>
        </p>
      </form>
    </div>
  )
}
