import { formatDuration, formatTime, minutesBetween } from '../../lib/calendar-dates'
import { Sk } from '../Skeleton'
import { IconBook } from './CalendarIcons'
import { IconCheck } from './SessionTypeIcons'
import { describeSession, typeOf } from './sessionTypes'

/** A day's sessions as a list: the Day view, and the month view on phones. */
export function AgendaList({ sessions, now, onOpen }) {
  return (
    <ul className="cal-agenda">
      {sessions.map((session) => {
        const type = typeOf(session)
        const { Icon } = type
        const done = Boolean(session.completedAt)
        const past = !done && session.end <= now
        return (
          <li key={session.id}>
            <button
              type="button"
              className={`cal-item tone-${type.tone}${done ? ' is-done' : ''}`}
              onClick={() => onOpen(session)}
              aria-label={describeSession(session)}
            >
              <span className="cal-item-time">
                <strong>{formatTime(session.start)}</strong>
                <span>{formatTime(session.end)}</span>
              </span>
              <span className="cal-item-body">
                <span className="cal-item-title">{session.title}</span>
                <span className="cal-item-meta">
                  <span className="cal-type-tag"><Icon /> {type.label}</span>
                  <span>{formatDuration(minutesBetween(session.start, session.end))}</span>
                  {session.packTitle && (
                    <span className="cal-item-pack"><IconBook /> {session.packTitle}</span>
                  )}
                </span>
              </span>
              <span className={`cal-status${done ? ' is-done' : past ? ' is-past' : ''}`}>
                {done ? <><IconCheck /> Done</> : past ? 'Not marked' : 'Planned'}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Placeholder rows in the agenda's own layout. */
export function AgendaSkeleton({ rows = 3 }) {
  return (
    <ul className="cal-agenda" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i}>
          <div className="cal-item cal-item-skel">
            <span className="sk-stack" style={{ gap: 6 }}>
              <Sk w="80%" h={13} />
              <Sk w="60%" h={11} />
            </span>
            <span className="sk-stack" style={{ gap: 8 }}>
              <Sk w={`${70 - i * 12}%`} h={14} />
              <Sk w="50%" h={11} />
            </span>
            <Sk w={70} h={22} r={999} />
          </div>
        </li>
      ))}
    </ul>
  )
}
