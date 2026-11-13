import { addDays, dateKey, formatFullDay, formatWeekday, monthGrid, overlaps, sameDay } from '../../lib/calendar-dates'
import { Sk } from '../Skeleton'
import { AgendaList } from './AgendaList'
import { SessionChip } from './SessionChip'
import { typeOf } from './sessionTypes'

const MAX_CHIPS = 3

export function MonthView({ date, selected, now, sessions, loading, onSelectDate, onOpenSession, onShowDay, onCreateAt }) {
  const weeks = monthGrid(date)

  const byDay = new Map()
  for (const week of weeks) {
    for (const day of week) {
      const next = addDays(day, 1)
      byDay.set(dateKey(day), sessions.filter((s) => overlaps(s, day, next)))
    }
  }
  const selectedSessions = byDay.get(dateKey(selected)) ?? []

  return (
    <div className="cal-month-wrap">
      <div className="cal-weekdays" aria-hidden="true">
        {weeks[0].map((day) => (
          <span key={day.getDay()} className="cal-weekday">
            <span className="cal-wd-long">{formatWeekday(day)}</span>
            <span className="cal-wd-short">{formatWeekday(day, 'narrow')}</span>
          </span>
        ))}
      </div>

      {loading && <span className="sr-only" role="status">Loading your sessions…</span>}
      <div className="cal-month" aria-busy={loading || undefined}>
        {weeks.map((week, w) => (
          <div key={dateKey(week[0])} className="cal-month-row">
            {week.map((day, d) => {
              const items = byDay.get(dateKey(day)) ?? []
              const outside = day.getMonth() !== date.getMonth()
              const isToday = sameDay(day, now)
              const isSelected = sameDay(day, selected)
              // With one slot to spare, a "+N more" line would hide just one
              // session; show it instead.
              const shown = items.length > MAX_CHIPS ? items.slice(0, MAX_CHIPS - 1) : items
              const hidden = items.length - shown.length

              return (
                <div
                  key={dateKey(day)}
                  className={`cal-cell${outside ? ' is-outside' : ''}${isToday ? ' is-today' : ''}${
                    isSelected ? ' is-selected' : ''
                  }`}
                  onClick={() => onSelectDate(day)}
                  onDoubleClick={() => onCreateAt(day)}
                >
                  <button
                    type="button"
                    className="cal-date"
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelectDate(day)
                    }}
                    aria-label={`${formatFullDay(day)}${isToday ? ', today' : ''}, ${
                      items.length === 0 ? 'no sessions' : `${items.length} session${items.length === 1 ? '' : 's'}`
                    }`}
                    aria-current={isToday ? 'date' : undefined}
                    aria-pressed={isSelected}
                  >
                    {day.getDate()}
                  </button>

                  {loading && (w * 7 + d) % 3 === 1 && (
                    <span className="cal-chip-skel" aria-hidden="true">
                      <Sk h={18} r={6} />
                      {(w + d) % 2 === 0 && <Sk w="70%" h={18} r={6} />}
                    </span>
                  )}

                  {items.length > 0 && (
                    <>
                      <ul className="cal-chips">
                        {shown.map((session) => (
                          <li key={session.id}>
                            <SessionChip session={session} onOpen={onOpenSession} />
                          </li>
                        ))}
                      </ul>
                      {hidden > 0 && (
                        <button
                          type="button"
                          className="cal-more"
                          onClick={(event) => {
                            event.stopPropagation()
                            onShowDay(day)
                          }}
                        >
                          +{hidden} more
                        </button>
                      )}
                      {/* Phones: too narrow for chips, so a dot per session. */}
                      <span className="cal-dots" aria-hidden="true">
                        {items.slice(0, 4).map((s) => (
                          <span key={s.id} className={`cal-dot tone-${typeOf(s).tone}${s.completedAt ? ' is-done' : ''}`} />
                        ))}
                      </span>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Phones: the selected day's sessions under the grid. */}
      <div className="cal-month-agenda">
        <div className="cal-month-agenda-head">
          <p className="hm-card-title">{formatFullDay(selected)}</p>
          <button type="button" className="hm-muted-link cal-link-btn" onClick={() => onCreateAt(selected)}>
            + Add
          </button>
        </div>
        {selectedSessions.length === 0 ? (
          <p className="hm-empty-line">Nothing planned for this day.</p>
        ) : (
          <AgendaList sessions={selectedSessions} now={now} onOpen={onOpenSession} />
        )}
      </div>
    </div>
  )
}
