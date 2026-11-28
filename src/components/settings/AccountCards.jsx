import { useState } from 'react'
import { clearOfflinePacks, useOfflinePackIds } from '../../lib/offlinePacks'
import { TwoStepRow } from './TwoStepCard'

export function Head({ id, title, sub }) {
  return (
    <header className="st-card-head">
      <h2 id={id} className="st-card-title">{title}</h2>
      <p className="hm-sub">{sub}</p>
    </header>
  )
}

/**
 * Email, password and two-step verification: how the student signs in, as
 * Supabase Auth holds it. Each is a row with its action on the right. (Sign
 * out lives in the account menu at the top right.)
 */
export function AccountSecurityCard({ user, onChangeEmail, onChangePassword, notify }) {
  return (
    <section className="hm-card st-card" aria-labelledby="st-account-title">
      <Head id="st-account-title" title="Account Security" sub="How you sign in to Novi." />
      <ul className="st-actions">
        <li className="st-action">
          <span className="st-action-text">
            <span className="st-row-label">Email address</span>
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
        <TwoStepRow notify={notify} />
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

      <OfflineBlock />

      <div className="st-block">
        <p className="st-row-label">What Novi keeps</p>
        <ul className="st-list">
          <li>Your account email and name, and the preferences on this page.</li>
          <li>The files you upload, their extracted text, and the study packs made from them.</li>
          <li>Your practice answers, planned sessions and progress.</li>
          <li>Your AI Chat conversations, including any study sessions you plan there.</li>
          <li>
            Novi uses two AI services, Groq and Google Gemini. To build a study pack, the text of your
            material is sent to them. In AI Chat, your messages, recent conversation and matching
            excerpts from your notes are sent to them to write each reply.
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

/** Packs kept on this device for offline use, and how to get Novi on a phone. */
function OfflineBlock() {
  const count = useOfflinePackIds().size
  const [busy, setBusy] = useState(false)

  async function removeAll() {
    setBusy(true)
    try {
      await clearOfflinePacks()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="st-block">
      <div className="st-block-row">
        <div>
          <p className="st-row-label">Offline packs on this device</p>
          <p className="st-row-help">
            {count === 0
              ? 'None yet. Choose Keep offline on a study pack to study it without internet.'
              : `${count} ${count === 1 ? 'pack is' : 'packs are'} saved here. Signing out removes them.`}
          </p>
          <p className="st-row-help">
            To use Novi like an app: on iPhone or iPad, tap Share, then Add to Home Screen. On Android,
            open the browser menu and choose Install app or Add to Home screen.
          </p>
        </div>
        {count > 0 && (
          <button type="button" className="btn btn-secondary st-action-btn" onClick={removeAll} disabled={busy}>
            {busy ? 'Removing…' : 'Remove all'}
          </button>
        )}
      </div>
    </div>
  )
}

export function DangerZone({ onDelete }) {
  return (
    <section className="hm-card st-card st-danger" aria-labelledby="st-danger-title">
      <Head id="st-danger-title" title="Danger Zone" sub="Actions here can't be undone." />
      <div className="st-block-row">
        <div>
          <p className="st-row-label">Delete account</p>
          <p className="st-row-help">
            Permanently deletes your account, uploads, study packs, practice history and plans.
            You&apos;ll confirm with your password first.
          </p>
        </div>
        <button type="button" className="btn st-btn-danger-ghost st-action-btn" onClick={onDelete}>
          Delete account
        </button>
      </div>
    </section>
  )
}
