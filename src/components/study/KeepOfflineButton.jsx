import { useState } from 'react'
import { useAuth } from '../../context/auth-context'
import { keepOffline, removeOfflinePack, useOfflinePackIds } from '../../lib/offlinePacks'
import { IconCheck } from '../app/AppIcons'

/**
 * Keeps one pack on this device for the Offline screen, or takes it off.
 * Kept packs open with no internet once Novi is installed (or the tab is open).
 */
export function KeepOfflineButton({ packId }) {
  const { user } = useAuth()
  const kept = useOfflinePackIds().has(packId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      if (kept) await removeOfflinePack(packId)
      else await keepOffline(user.id, [packId])
    } catch (err) {
      setError(err?.message?.includes('storage') ? err.message : 'That didn’t work. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="keep-offline">
      <button
        type="button"
        className={`btn btn-secondary keep-offline-btn${kept ? ' is-kept' : ''}`}
        onClick={toggle}
        disabled={busy || !user}
        aria-pressed={kept}
        title={kept ? 'Remove this pack from this device' : 'Keep a copy on this device to study without internet'}
      >
        {kept && <IconCheck width={15} height={15} />}
        {busy ? (kept ? 'Removing…' : 'Saving…') : kept ? 'Kept offline' : 'Keep offline'}
      </button>
      {error && <span className="keep-offline-error" role="alert">{error}</span>}
    </span>
  )
}
