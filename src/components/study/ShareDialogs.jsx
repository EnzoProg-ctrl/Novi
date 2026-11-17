import { useEffect, useState } from 'react'
import { IconCheck, IconClose } from '../app/AppIcons'
import { friendlyError } from '../../lib/errors'
import { createShare, EXPIRY_OPTIONS, fetchMyShares, shareUrl } from '../../lib/sharing'

const dateTime = (iso) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function untilLabel(iso) {
  const ms = Date.parse(iso) - Date.now()
  if (ms <= 0) return 'Expired'
  const hours = Math.round(ms / 3_600_000)
  if (hours < 24) return hours <= 1 ? 'Expires within the hour' : `Expires in ${hours} hours`
  const days = Math.round(hours / 24)
  return days === 1 ? 'Expires tomorrow' : `Expires in ${days} days`
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function CopyField({ url }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])
  return (
    <div className="pk-share-link">
      <input
        className="input"
        readOnly
        value={url}
        aria-label="Share link"
        onFocus={(e) => e.target.select()}
      />
      <button type="button" className="btn btn-secondary" onClick={async () => setCopied(await copyText(url))}>
        {copied ? <><IconCheck width={16} height={16} /> Copied</> : 'Copy'}
      </button>
    </div>
  )
}

/**
 * Making a link for the selected packs: choose how long it works, then copy
 * it. Shown inside the page's <Modal>.
 */
export function ShareLinkForm({ packs, onClose, onCreated, onBusy }) {
  const [days, setDays] = useState(7)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [link, setLink] = useState(null)

  async function make() {
    setBusy(true)
    onBusy?.(true)
    setError(null)
    try {
      const res = await createShare(packs.map((p) => p.id), days)
      setLink(res)
      onCreated?.()
    } catch (err) {
      setError(friendlyError(err, 'The link could not be made. Try again.'))
    } finally {
      setBusy(false)
      onBusy?.(false)
    }
  }

  const count = packs.length
  return (
    <div className="nv-modal-panel">
      <header className="nv-modal-head">
        <div>
          <h2 id="pk-modal-title" className="nv-modal-title">
            {link ? 'Your link is ready' : `Share ${count === 1 ? 'this pack' : `${count} packs`}`}
          </h2>
          <p className="hint">
            {link
              ? `Anyone with a Novi account who opens it before it expires gets their own copy. You'll see who added it.`
              : 'Anyone with a Novi account who opens the link can add a copy to their Shared with Me.'}
          </p>
        </div>
        <button type="button" className="nv-modal-close" onClick={onClose} aria-label="Close" disabled={busy}>
          <IconClose />
        </button>
      </header>

      <ul className="pk-share-packs">
        {packs.map((p) => <li key={p.id}>{p.title}</li>)}
      </ul>

      {link ? (
        <>
          <CopyField url={shareUrl(link.code)} />
          <p className="hint">{untilLabel(link.expires_at)} ({dateTime(link.expires_at)}).</p>
          <div className="nv-modal-actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </>
      ) : (
        <>
          <fieldset className="pk-share-expiry">
            <legend>Link works for</legend>
            <div className="pk-share-options">
              {EXPIRY_OPTIONS.map((o) => (
                <label key={o.days} className={`pk-share-option${days === o.days ? ' is-active' : ''}`}>
                  <input
                    type="radio"
                    name="pk-share-days"
                    value={o.days}
                    checked={days === o.days}
                    onChange={() => setDays(o.days)}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
          {error && <div className="msg msg-error" role="alert">{error}</div>}
          <div className="nv-modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={make} disabled={busy}>
              {busy ? 'Making link…' : 'Make link'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** The student's own links: which packs, when each expires, and who added it. */
export function ShareLinksList({ userId, onClose }) {
  const [state, setState] = useState({ loading: true, rows: [], error: null })

  useEffect(() => {
    let active = true
    fetchMyShares(userId)
      .then((rows) => active && setState({ loading: false, rows, error: null }))
      .catch((err) => active && setState({ loading: false, rows: [], error: friendlyError(err, 'Your links could not be loaded.') }))
    return () => {
      active = false
    }
  }, [userId])

  return (
    <div className="nv-modal-panel">
      <header className="nv-modal-head">
        <div>
          <h2 id="pk-modal-title" className="nv-modal-title">Your share links</h2>
          <p className="hint">Who added each link. Only their display name is shown, never their email.</p>
        </div>
        <button type="button" className="nv-modal-close" onClick={onClose} aria-label="Close">
          <IconClose />
        </button>
      </header>

      {state.loading ? (
        <p className="hint" role="status">Loading your links…</p>
      ) : state.error ? (
        <div className="msg msg-error" role="alert">{state.error}</div>
      ) : state.rows.length === 0 ? (
        <p className="hm-empty-line">
          You haven't shared any packs yet. Choose Select on Study Packs, tick some packs, then Share link.
        </p>
      ) : (
        <ul className="pk-links">
          {state.rows.map((row) => (
            <li key={row.id} className={`pk-links-row${row.expired ? ' is-expired' : ''}`}>
              <div className="pk-links-top">
                <strong className="pk-links-title">
                  {row.packs.length === 0
                    ? 'Packs since deleted'
                    : row.packs.map((p) => p.title).join(', ')}
                </strong>
                <span className="pk-links-when">{untilLabel(row.expiresAt)}</span>
              </div>
              {!row.expired && row.packs.length > 0 && <CopyField url={shareUrl(row.code)} />}
              <p className="pk-links-added">
                {row.added.length === 0
                  ? 'Nobody has added it yet.'
                  : `Added by ${row.added.length} ${row.added.length === 1 ? 'student' : 'students'}:`}
              </p>
              {row.added.length > 0 && (
                <ul className="pk-links-people">
                  {row.added.map((r) => (
                    <li key={r.id}>
                      <span>{r.receiver_name || 'A Novi student'}</span>
                      <span className="pk-links-when">{dateTime(r.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
