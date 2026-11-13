import { addDays, formatDuration, formatFullDay, minutesBetween, overlaps, sameDay } from '../../lib/calendar-dates'
import { Sk } from '../Skeleton'
import { AgendaList, AgendaSkeleton } from './AgendaList'

export function DayView({ date, now, sessions, loading, onOpenSession, onCreateAt }) {
  const next = addDays(date, 1)
  const items = sessions.filter((s) => overlaps(s, date, next))
  const planned = items.reduce((sum, s) => sum + minutesBetween(s.start, s.end), 0)

  return (
    <div className="cal-day">
      <header className="cal-day-head">
        <div>
          <p className="hm-card-title">
            {formatFullDay(date)}
            {sameDay(date, now) && <span className="cal-today-tag">Today</span>}
          </p>
          {loading && <span className="sr-only" role="status">Loading your sessions…</span>}
          <p className="hm-sub">
            {loading
              ? <Sk w={170} h={11} style={{ marginTop: 6 }} />
              : items.length === 0
                ? 'No sessions planned.'
                : `${items.length} session${items.length === 1 ? '' : 's'} · ${formatDuration(planned)} planned`}
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => onCreateAt(date)}>
          Schedule on this day
        </button>
      </header>

      {loading ? (
        <AgendaSkeleton rows={3} />
      ) : items.length === 0 ? (
        <div className="cal-day-empty">
          <p className="hm-empty-line">
            A free day. Plan a short session to keep your momentum, or enjoy the break.
          </p>
        </div>
      ) : (
        <AgendaList sessions={items} now={now} onOpen={onOpenSession} />
      )}
    </div>
  )
}
