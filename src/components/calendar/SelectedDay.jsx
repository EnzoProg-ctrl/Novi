import { formatDuration, formatTime, minutesBetween } from '../../lib/calendar-dates'
import { IconCalendar } from '../app/AppIcons'
import { IconPlus } from '../home/HomeIcons'
import { LoadingRegion, Sk, SkText } from '../Skeleton'
import { IconClockSmall } from './CalendarIcons'
import { IconCheck } from './SessionTypeIcons'
import { describeSession, typeOf } from './sessionTypes'

const DAY = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

const IconTimer = (props) => (
  <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 9.5v4l2.5 1.5M9.5 2.5h5M12 2.5v3.5" />
  </svg>
)

const IconMore = (props) => (
  <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden="true" {...props}>
    <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
  </svg>
)

/**
 * The selected day: its sessions and a way to add one. Clicking a day on the
 * calendar fills this in; the icon opens that day in the Day view.
 */
export function SelectedDay({ date, isToday, sessions, loading, onOpen, onAdd, onShowDay }) {
  return (
    <section className="hm-card cal-card cal-dayp" aria-labelledby="cal-dayp-title">
      <div className="cal-card-head">
        <div>
          <h2 id="cal-dayp-title" className="cal-card-title">{DAY.format(date)}</h2>
          <p className="hm-sub">{isToday ? 'Today' : 'Selected day'}</p>
        </div>
        <button type="button" className="cal-dayp-open" onClick={onShowDay} aria-label="Open this day in Day view" title="Open in Day view">
          <IconCalendar width={20} height={20} />
        </button>
      </div>

      {loading ? (
        <LoadingRegion label="Loading the day's sessions…" className="cal-dayp-list">
          <div className="cal-dayp-item">
            <Sk w={46} h={46} r={12} />
            <span className="cal-dayp-body"><SkText lines={3} widths={['60%', '80%', '50%']} gap={8} /></span>
          </div>
        </LoadingRegion>
      ) : sessions.length === 0 ? (
        <p className="hm-empty-line cal-dayp-empty">Nothing planned for this day.</p>
      ) : (
        <ul className="cal-dayp-list">
          {sessions.map((session) => {
            const type = typeOf(session)
            const { Icon } = type
            const done = Boolean(session.completedAt)
            return (
              <li key={session.id} className={`cal-dayp-item tone-${type.tone}${done ? ' is-done' : ''}`}>
                <span className="cal-dayp-mark">{done ? <IconCheck width={20} height={20} /> : <Icon width={20} height={20} />}</span>
                <span className="cal-dayp-body">
                  <span className="cal-dayp-title">{session.title}</span>
                  <span className="cal-dayp-pack">{session.packTitle ?? type.label}</span>
                  <span className="cal-dayp-time">
                    <span><IconClockSmall /> {formatTime(session.start)} – {formatTime(session.end)}</span>
                    <span className="cal-dayp-sep" aria-hidden="true" />
                    <span><IconTimer /> {formatDuration(minutesBetween(session.start, session.end))}</span>
                  </span>
                </span>
                {/* The whole card opens the details; the dots say so. */}
                <button
                  type="button"
                  className="cal-dayp-more"
                  onClick={() => onOpen(session)}
                  aria-label={`Open ${describeSession(session)}`}
                >
                  <IconMore />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <button type="button" className="cal-dayp-add" onClick={onAdd}>
        <IconPlus width={18} height={18} />
        {sessions.length > 0 ? 'Add Another Session' : 'Add Session'}
      </button>
    </section>
  )
}
