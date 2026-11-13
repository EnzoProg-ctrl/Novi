import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Mascot'
import { MfaChallenge } from '../components/MfaChallenge'
import { PasswordField } from '../components/PasswordField'
import { AuthCardSkeleton } from '../components/RouteSkeletons'
import { useAuth } from '../context/auth-context'
import { authErrorMessage, PASSWORD_MIN, setNewPassword } from '../lib/account'
import { clearRecoveryPending, peekAuthRedirectNotice, takeAuthRedirectNotice } from '../lib/auth-redirect'
import { supabase } from '../lib/supabase'

/**
 * Where a password reset link lands. The link signs the student in with a
 * session that is only good for this page (the route guards send it nowhere
 * else, see recoveryPending). Saving the new password, or cancelling, signs
 * out everywhere, so the next step is always signing in with the password
 * they now know.
 *
 * A normally signed-in visitor gets no form here: changing the password from
 * Settings needs the current one, so a session left open on a shared computer
 * can't be used to take the account over.
 */
export function ResetPassword() {
  const { user, loading, needsMfa, recoveryPending, signOut } = useAuth()
  const navigate = useNavigate()
  const [notice] = useState(peekAuthRedirectNotice)
  useEffect(() => {
    takeAuthRedirectNotice()
  }, [])

  const [form, setForm] = useState({ password: '', confirm: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  /** Signs out on every device, then on to sign-in. */
  async function finish(message) {
    setLeaving(true)
    try {
      await signOut()
    } catch {
      // The server couldn't be reached: at least end the session here.
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    }
    clearRecoveryPending()
    navigate('/signin', { replace: true, state: message ? { notice: message } : undefined })
  }

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    if (form.password.length < PASSWORD_MIN) {
      setError(`Use at least ${PASSWORD_MIN} characters.`)
      return
    }
    if (form.password !== form.confirm) {
      setError("The two passwords don't match.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await setNewPassword(form.password)
    } catch (err) {
      setError(authErrorMessage(err, "Your password couldn't be changed. Try again."))
      setBusy(false)
      return
    }
    await finish('Your password was changed. Sign in with your new password.')
  }

  if (loading || leaving) return <AuthCardSkeleton />

  if (!user || !recoveryPending) {
    if (notice?.kind === 'error') {
      return (
        <Card title="This link has expired">
          <p className="hint">
            Password reset links work once and only for a while. Ask for a new one and use the newest
            email.
          </p>
          <Link to="/forgot-password" className="btn btn-primary btn-block auth-gap">Send a new link</Link>
          <p className="hint auth-foot"><Link to="/signin">Back to sign in</Link></p>
        </Card>
      )
    }
    if (!user) {
      return (
        <Card title="Open the link from your email">
          <p className="hint">
            This page sets a new password after you open a reset link. If you need one, we&rsquo;ll send it.
          </p>
          <Link to="/forgot-password" className="btn btn-primary btn-block auth-gap">Reset my password</Link>
          <p className="hint auth-foot"><Link to="/signin">Back to sign in</Link></p>
        </Card>
      )
    }
    return (
      <Card title="You're already signed in">
        <p className="hint">
          To change your password, go to Settings and choose Change next to Password. You&rsquo;ll need
          your current password there.
        </p>
        <Link to="/settings" className="btn btn-primary btn-block auth-gap">Open Settings</Link>
      </Card>
    )
  }

  // Two-step verification still applies to a reset: the code first.
  if (needsMfa) return <MfaChallenge />

  return (
    <div className="auth-shell">
      <form className="card card-pad auth-card" onSubmit={submit} noValidate>
        <Logo />
        <h2 className="auth-title">Choose a new password</h2>
        <p className="hint">
          For {user.email}. Use at least {PASSWORD_MIN} characters. You&rsquo;ll sign in with it next.
        </p>

        {error && <div className="msg msg-error auth-gap" role="alert">{error}</div>}

        <div className="auth-gap">
          <PasswordField
            id="new-password"
            label="New password"
            value={form.password}
            onChange={update('password')}
            autoComplete="new-password"
            required
          />
          <PasswordField
            id="confirm-password"
            label="Confirm new password"
            value={form.confirm}
            onChange={update('confirm')}
            autoComplete="new-password"
            required
          />
        </div>

        <button className="btn btn-primary btn-block auth-gap" disabled={busy}>
          {busy && <span className="spinner" />}
          {busy ? 'Saving...' : 'Save new password'}
        </button>
        <p className="hint auth-foot">
          <button type="button" className="mfa-link" onClick={() => finish(null)} disabled={busy}>
            Cancel and sign out
          </button>
        </p>
      </form>
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div className="auth-shell">
      <div className="card card-pad auth-card">
        <Logo />
        <h2 className="auth-title">{title}</h2>
        {children}
      </div>
    </div>
  )
}
