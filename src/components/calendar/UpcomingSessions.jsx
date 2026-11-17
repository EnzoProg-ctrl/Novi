import { formatMonthShort, formatTime, formatWeekday, sameDay } from '../../lib/calendar-dates'
import { LoadingRegion, Sk, SkText } from '../Skeleton'
import { IconArrowRight } from '../home/HomeIcons'
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
        const { Icon } = type
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
                <span className="cal-up-title">
                  <span className="cal-up-mark"><Icon width={14} height={14} /></span>
                  <span className="cal-up-name">{session.title}</span>
                </span>
                <span className="cal-up-pack">{session.packTitle ?? type.label}</span>
              </span>
              <span className="cal-up-time" title={inProgress ? 'Happening now' : dayLabel(session, now)}>
                {inProgress ? 'Now' : formatTime(session.start)}
              </span>
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
      <div className="cal-card-head">
        <h2 id="cal-upcoming-title" className="cal-card-title">Upcoming Sessions</h2>
        {sessions.length > 0 && (
          <button type="button" className="hm-muted-link cal-view-all" onClick={onViewAll}>
            View All{sessions.length > PREVIEW ? ` (${sessions.length})` : ''}
            <IconArrowRight width={16} height={16} />
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
