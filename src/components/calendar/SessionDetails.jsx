import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDuration, formatFullDay, formatTime, minutesBetween } from '../../lib/calendar-dates'
import { IconClose } from '../app/AppIcons'
import { IconCheck } from './SessionTypeIcons'
import { typeOf } from './sessionTypes'

export function SessionDetails({ session, now, saving, onClose, onEdit, onToggleComplete, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  const type = typeOf(session)
  const { Icon } = type
  const done = Boolean(session.completedAt)
  const status = done
    ? `Completed ${formatFullDay(session.completedAt)}`
    : session.end <= now
      ? 'Not marked as done'
      : session.start <= now
        ? 'Happening now'
        : 'Planned'

  return (
    <div className="nv-modal-panel">
      <header className="nv-modal-head">
        <div>
          <span className={`cal-type-tag cal-type-tag-lg tone-${type.tone}`}><Icon /> {type.label}</span>
          <h2 id="cal-modal-title" className="nv-modal-title cal-detail-title">{session.title}</h2>
        </div>
        <button type="button" className="nv-modal-close" onClick={onClose} disabled={saving} aria-label="Close">
          <IconClose />
        </button>
      </header>

      <dl className="cal-detail-list">
        <dt>Date</dt>
        <dd>{formatFullDay(session.start)}</dd>
        <dt>Time</dt>
        <dd>{formatTime(session.start)} – {formatTime(session.end)}</dd>
        <dt>Duration</dt>
        <dd>{formatDuration(minutesBetween(session.start, session.end))}</dd>
        <dt>Study pack</dt>
        <dd>
          {session.packId ? (
            <Link to={`/pack/${session.packId}`} className="hm-muted-link">{session.packTitle ?? 'Open study pack'}</Link>
          ) : (
            <span className="cal-muted">None</span>
          )}
        </dd>
        <dt>Status</dt>
        <dd>
          <span className={`cal-status${done ? ' is-done' : ''}`}>
            {done && <IconCheck />} {status}
          </span>
        </dd>
        <dt>Notes</dt>
        <dd className="cal-detail-notes">{session.notes ? session.notes : <span className="cal-muted">No notes</span>}</dd>
      </dl>

      {confirming ? (
        <div className="cal-confirm" role="alert">
          <p>Delete this session? This cannot be undone.</p>
          <div className="nv-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)} disabled={saving}>
              Keep it
            </button>
            <button type="button" className="btn cal-btn-danger" onClick={onDelete} disabled={saving}>
              {saving && <span className="spinner" />}
              Yes, delete
            </button>
          </div>
        </div>
      ) : (
        <div className="cal-detail-actions">
          <button type="button" className="btn cal-btn-danger-ghost" onClick={() => setConfirming(true)} disabled={saving}>
            Delete
          </button>
          <div className="nv-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onToggleComplete} disabled={saving}>
              {done ? 'Mark as not done' : <><IconCheck /> Mark completed</>}
            </button>
            <button type="button" className="btn btn-primary" onClick={onEdit} disabled={saving}>
              Edit
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
