import { formatTime } from '../../lib/calendar-dates'
import { IconCheck } from './SessionTypeIcons'
import { describeSession, typeOf } from './sessionTypes'

/** The compact event chip used in month cells: what kind, and when. */
export function SessionChip({ session, onOpen }) {
  const type = typeOf(session)
  const { Icon } = type
  return (
    <button
      type="button"
      className={`cal-chip tone-${type.tone}${session.completedAt ? ' is-done' : ''}`}
      onClick={(event) => {
        event.stopPropagation()
        onOpen(session)
      }}
      aria-label={describeSession(session)}
      title={`${session.title} · ${formatTime(session.start)}`}
    >
      <span className="cal-chip-head">
        <span className="cal-chip-mark">{session.completedAt ? <IconCheck /> : <Icon />}</span>
        <span className="cal-chip-title">{type.short}</span>
      </span>
      <span className="cal-chip-time">{formatTime(session.start)}</span>
    </button>
  )
}
