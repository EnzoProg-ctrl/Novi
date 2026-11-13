import { useState } from 'react'

export function Head({ id, title, sub }) {
  return (
    <header className="st-card-head">
      <h2 id={id} className="st-card-title">{title}</h2>
      <p className="hm-sub">{sub}</p>
    </header>
  )
}

/** Email, password and sign out: the account itself, as Supabase Auth holds it. */
export function AccountCard({ user, onChangeEmail, onChangePassword, onSignOut }) {
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    try {
      await onSignOut()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <section className="hm-card st-card" aria-labelledby="st-account-title">
      <Head id="st-account-title" title="Account" sub="Manage your account settings." />
      <ul className="st-actions">
        <li className="st-action">
          <span className="st-action-text">
            <span className="st-row-label">Email</span>
            <span className="st-row-help st-ellipsis" title={user?.email}>{user?.email}</span>
            {user?.new_email && (
              <span className="st-pending">Confirming {user.new_email}: click the links sent to both addresses</span>
            )}
          </span>
          <button type="button" className="btn btn-secondary st-action-btn" onClick={onChangeEmail}>Update</button>
        </li>
        <li className="st-action">
          <span className="st-action-text">
            <span className="st-row-label">Password</span>
            <span className="st-row-help">You sign in with your email and password.</span>
          </span>
          <button type="button" className="btn btn-secondary st-action-btn" onClick={onChangePassword}>Change</button>
        </li>
        <li className="st-action">
          <span className="st-action-text">
            <span className="st-row-label">Sign out</span>
            <span className="st-row-help">Sign out of Novi on this device.</span>
          </span>
          <button type="button" className="btn btn-secondary st-action-btn" onClick={signOut} disabled={signingOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </li>
      </ul>
    </section>
  )
}

/**
 * Data export, what Novi keeps, and privacy policy status. Every statement in
 * "What Novi keeps" describes what the code actually does; there is no
 * published policy, so none is linked.
 */
export function DataPrivacyCard({ onDownload }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  async function download() {
    setBusy(true)
    setResult(null)
    try {
      setResult({ ok: true, counts: await onDownload() })
    } catch {
      setResult({ ok: false })
    } finally {
      setBusy(false)
    }
  }

  const total = result?.counts ? Object.values(result.counts).reduce((a, b) => a + b, 0) : 0

  return (
    <section className="hm-card st-card" aria-labelledby="st-privacy-title">
      <Head id="st-privacy-title" title="Data & Privacy" sub="Manage your data and privacy settings." />

      <div className="st-block">
        <div className="st-block-row">
          <div>
            <p className="st-row-label">Download my data</p>
            <p className="st-row-help">
              A JSON file with your profile, preferences, study packs, practice history, planned
              sessions and progress. Uploaded files themselves are not included.
            </p>
          </div>
          <button type="button" className="btn btn-secondary st-action-btn" onClick={download} disabled={busy}>
            {busy && <span className="spinner" />}
            {busy ? 'Preparing…' : 'Download'}
          </button>
        </div>
        {result?.ok && (
          <p className="st-inline-msg is-ok" role="status">Downloaded {total} records.</p>
        )}
        {result && !result.ok && (
          <p className="st-inline-msg is-error" role="alert">
            The export could not be prepared. Nothing was downloaded. Try again.
          </p>
        )}
      </div>

      <div className="st-block">
        <p className="st-row-label">What Novi keeps</p>
        <ul className="st-list">
          <li>Your account email and name, and the preferences on this page.</li>
          <li>The files you upload, their extracted text, and the study packs made from them.</li>
          <li>Your practice answers, planned sessions and progress.</li>
          <li>
            To build a study pack, the text of your material is sent to the AI services Novi uses
            (Groq and Google Gemini).
          </li>
        </ul>
        <p className="st-row-help">Only you can see your data. Deleting your account removes all of it.</p>
      </div>

      <div className="st-block">
        <p className="st-row-label">Privacy policy</p>
        <p className="st-row-help">Novi doesn&apos;t have a published privacy policy yet.</p>
      </div>
    </section>
  )
}

export function DangerZone({ onDelete }) {
  return (
    <section className="hm-card st-card st-danger" aria-labelledby="st-danger-title">
      <Head id="st-danger-title" title="Danger Zone" sub="Actions here can't be undone." />
      <div className="st-block-row">
        <div>
          <p className="st-row-label">Delete account</p>
          <p className="st-row-help">Permanently delete your account and all associated data.</p>
        </div>
        <button type="button" className="btn st-btn-danger-ghost st-action-btn" onClick={onDelete}>
          Delete account
        </button>
      </div>
    </section>
  )
}
