import { useState } from 'react'
import { PASSWORD_MIN } from '../../lib/account'
import { IconClose } from '../app/AppIcons'
import { PasswordField } from '../PasswordField'
import { friendlyError } from '../../lib/errors'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Head({ title, hint, onClose, busy }) {
  return (
    <header className="nv-modal-head">
      <div>
        <h2 id="st-modal-title" className="nv-modal-title">{title}</h2>
        {hint && <p className="hint">{hint}</p>}
      </div>
      <button type="button" className="nv-modal-close" onClick={onClose} disabled={busy} aria-label="Close">
        <IconClose />
      </button>
    </header>
  )
}

/** Supabase's email change: a confirmation link, not an instant change. */
export function EmailForm({ currentEmail, onCancel, onSubmit }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState(null)

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const clean = email.trim()
    if (!EMAIL_RE.test(clean)) return setError('Enter a valid email address.')
    if (clean.toLowerCase() === currentEmail?.toLowerCase()) return setError('That is already your email.')
    setError(null)
    setBusy(true)
    try {
      await onSubmit(clean)
      setSentTo(clean)
    } catch (err) {
      setError(friendlyError(err, 'The change could not be started. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  if (sentTo) {
    return (
      <div className="nv-modal-panel">
        <Head title="Check your inbox" onClose={onCancel} />
        <p className="st-modal-text">
          We sent a confirmation link to <strong>{sentTo}</strong> and another to{' '}
          <strong>{currentEmail}</strong>. Click the link in <strong>both</strong> emails. Your email
          stays {currentEmail} until the second one is confirmed. Each link works once.
        </p>
        <div className="nv-modal-actions">
          <button type="button" className="btn btn-primary" onClick={onCancel}>Done</button>
        </div>
      </div>
    )
  }

  return (
    <form className="nv-modal-panel" onSubmit={submit} noValidate>
      <Head title="Update email" hint={`Currently ${currentEmail}`} onClose={onCancel} busy={busy} />
      <div className="field">
        <label className="label" htmlFor="st-new-email">New email address</label>
        <input
          id="st-new-email"
          type="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'st-new-email-error' : 'st-new-email-help'}
          autoFocus
        />
        {error ? (
          <span id="st-new-email-error" className="st-field-error">{error}</span>
        ) : (
          <span id="st-new-email-help" className="hint">Your email changes only after you confirm the link we send.</span>
        )}
      </div>
      <div className="nv-modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>
          {busy && <span className="spinner" />}
          {busy ? 'Sending…' : 'Send confirmation'}
        </button>
      </div>
    </form>
  )
}

export function PasswordForm({ onCancel, onSubmit }) {
  const [values, setValues] = useState({ current: '', next: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }))

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const found = {}
    if (!values.current) found.current = 'Enter your current password.'
    if (values.next.length < PASSWORD_MIN) found.next = `Use at least ${PASSWORD_MIN} characters.`
    else if (values.next === values.current) found.next = 'Choose a password different from your current one.'
    if (values.confirm !== values.next) found.confirm = 'The passwords do not match.'
    setErrors(found)
    if (Object.keys(found).length) return
    setBusy(true)
    try {
      await onSubmit(values.current, values.next)
    } catch (err) {
      setErrors(err?.field ? { [err.field]: err.message } : { form: friendlyError(err, 'Your password could not be changed.') })
      setBusy(false)
    }
  }

  const err = (key) => errors[key] && <span className="st-field-error" role="alert">{errors[key]}</span>

  return (
    <form className="nv-modal-panel" onSubmit={submit} noValidate>
      <Head title="Change password" hint="You'll stay signed in on this device." onClose={onCancel} busy={busy} />
      {errors.form && <div className="msg msg-error" role="alert">{errors.form}</div>}
      <div>
        <PasswordField id="st-pw-current" label="Current password" value={values.current} onChange={set('current')} autoComplete="current-password" />
        {err('current')}
      </div>
      <div>
        <PasswordField id="st-pw-new" label="New password" value={values.next} onChange={set('next')} autoComplete="new-password" hint={`At least ${PASSWORD_MIN} characters.`} />
        {err('next')}
      </div>
      <div>
        <PasswordField id="st-pw-confirm" label="Confirm new password" value={values.confirm} onChange={set('confirm')} autoComplete="new-password" />
        {err('confirm')}
      </div>
      <div className="nv-modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>
          {busy && <span className="spinner" />}
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </div>
    </form>
  )
}

/**
 * Deleting is permanent, so it asks for three things: reading what happens,
 * the account password, and typing DELETE. The button stays disabled until
 * both are filled in.
 */
export function DeleteForm({ onCancel, onSubmit }) {
  const [password, setPassword] = useState('')
  const [typed, setTyped] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const ready = typed === 'DELETE' && password.length > 0

  async function submit(event) {
    event.preventDefault()
    if (!ready || busy) return
    setError(null)
    setBusy(true)
    try {
      await onSubmit(password)
    } catch (err) {
      setError(friendlyError(err, 'Your account could not be deleted. Try again.'))
      setBusy(false)
    }
  }

  return (
    <form className="nv-modal-panel" onSubmit={submit} noValidate>
      <Head title="Delete your account?" onClose={onCancel} busy={busy} />
      <div className="st-danger-box">
        <p>This permanently deletes:</p>
        <ul className="st-list">
          <li>Your account and sign-in</li>
          <li>Every file you uploaded and the study packs made from them</li>
          <li>Your practice history, planned sessions, progress and buddy</li>
        </ul>
        <p>It can&apos;t be undone. Download your data first if you want a copy.</p>
      </div>
      {error && <div className="msg msg-error" role="alert">{error}</div>}
      <PasswordField id="st-del-password" label="Your password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      <div className="field">
        <label className="label" htmlFor="st-del-confirm">Type <strong>DELETE</strong> to confirm</label>
        <input
          id="st-del-confirm"
          className="input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
      </div>
      <div className="nv-modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>Keep my account</button>
        <button className="btn st-btn-danger" disabled={!ready || busy}>
          {busy && <span className="spinner" />}
          {busy ? 'Deleting…' : 'Delete forever'}
        </button>
      </div>
    </form>
  )
}
