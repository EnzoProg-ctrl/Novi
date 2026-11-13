import { formatMonthShort, formatTime, formatWeekday, sameDay } from '../../lib/calendar-dates'
import { LoadingRegion, Sk, SkText } from '../Skeleton'
import { IconChevronRight } from './CalendarIcons'
import { describeSession, typeOf } from './sessionTypes'

const PREVIEW = 3

function dayLabel(session, now) {
  if (sameDay(session.start, now)) return 'Today'
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (sameDay(session.start, tomorrow)) return 'Tomorrow'
  return `${formatWeekday(session.start)}, ${formatMonthShort(session.start)} ${session.start.getDate()}`
}

/** The list itself, shared by the card and the "View all" pop-up. */
export function UpcomingList({ sessions, now, onOpen }) {
  if (sessions.length === 0) {
    return <p className="hm-empty-line">Nothing planned yet.</p>
  }
  return (
    <ul className="cal-up-list">
      {sessions.map((session) => {
        const type = typeOf(session)
        const inProgress = session.start <= now
        return (
          <li key={session.id}>
            <button
              type="button"
              className={`cal-up-item tone-${type.tone}`}
              onClick={() => onOpen(session)}
              aria-label={describeSession(session)}
            >
              <span className="cal-badge" aria-hidden="true">
                <span className="cal-badge-month">{formatMonthShort(session.start)}</span>
                <span className="cal-badge-day">{session.start.getDate()}</span>
              </span>
              <span className="cal-up-text">
                <span className="cal-up-title">{session.title}</span>
                <span className="cal-up-meta">
                  {inProgress ? 'Now' : dayLabel(session, now)} · {formatTime(session.start)} – {formatTime(session.end)}
                </span>
                <span className="cal-up-pack">{session.packTitle ?? type.label}</span>
              </span>
              <IconChevronRight width={16} height={16} className="cal-up-chevron" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function UpcomingSessions({ sessions, now, loading, onOpen, onViewAll, onSchedule }) {
  return (
    <section className="hm-card cal-card" aria-labelledby="cal-upcoming-title">
      <div className="hm-card-head">
        <h2 id="cal-upcoming-title" className="hm-card-title">Upcoming Sessions</h2>
        {sessions.length > 0 && (
          <button type="button" className="hm-muted-link" onClick={onViewAll}>
            View all{sessions.length > PREVIEW ? ` (${sessions.length})` : ''}
          </button>
        )}
      </div>

      {loading ? (
        <LoadingRegion label="Loading upcoming sessions…" as="ul" className="cal-up-list">
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <div className="cal-up-item">
                <Sk w={46} h={48} r={10} />
                <span className="cal-up-text"><SkText lines={3} widths={['75%', '60%', '40%']} gap={6} /></span>
              </div>
            </li>
          ))}
        </LoadingRegion>
      ) : sessions.length === 0 ? (
        <div className="cal-empty">
          <p className="hm-empty-line">
            No sessions planned. Put your next study block on the calendar so it actually happens.
          </p>
          <button type="button" className="hm-buddy-cta" onClick={onSchedule}>
            Schedule your first session
          </button>
        </div>
      ) : (
        <UpcomingList sessions={sessions.slice(0, PREVIEW)} now={now} onOpen={onOpen} />
      )}
    </section>
  )
}
