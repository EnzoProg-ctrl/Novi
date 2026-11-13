import { useEffect, useRef } from 'react'
import {
  addDays,
  formatTime,
  formatWeekday,
  formatFullDay,
  overlaps,
  sameDay,
  startOfDay,
  startOfWeek,
  timeKey,
} from '../../lib/calendar-dates'
import { IconCheck } from './SessionTypeIcons'
import { describeSession, typeOf } from './sessionTypes'
import { Sk } from '../Skeleton'

const HOUR_PX = 48
const DEFAULT_FIRST_HOUR = 7
const DEFAULT_LAST_HOUR = 22

/**
 * Places a day's sessions side by side where they overlap. Sessions are
 * grouped into clusters of mutual overlap; within a cluster each takes the
 * first free lane, and the cluster's lane count sets everyone's width.
 */
function layoutDay(items) {
  const placed = []
  let cluster = []
  let clusterEnd = -Infinity

  const flush = () => {
    const lanes = []
    const group = cluster.map((item) => {
      let lane = lanes.findIndex((end) => end <= item.from)
      if (lane === -1) {
        lane = lanes.length
        lanes.push(0)
      }
      lanes[lane] = item.to
      return { ...item, lane }
    })
    for (const item of group) placed.push({ ...item, lanes: lanes.length })
    cluster = []
  }

  for (const item of items) {
    if (cluster.length && item.from >= clusterEnd) flush()
    cluster.push(item)
    clusterEnd = Math.max(clusterEnd, item.to)
  }
  if (cluster.length) flush()
  return placed
}

export function WeekView({ date, selected, now, sessions, loading, onSelectDate, onOpenSession, onCreateAt }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i))
  const scroller = useRef(null)

  // Per day: minutes from midnight, clipped to that day.
  const perDay = days.map((day) => {
    const next = addDays(day, 1)
    const items = sessions
      .filter((s) => overlaps(s, day, next))
      .map((session) => ({
        session,
        from: Math.max(0, (session.start - day) / 60000),
        to: Math.min(24 * 60, (session.end - day) / 60000),
      }))
      .sort((a, b) => a.from - b.from || b.to - a.to)
    return layoutDay(items)
  })

  // Show 7am-10pm, widened to fit anything planned outside it.
  const all = perDay.flat()
  const firstHour = Math.min(DEFAULT_FIRST_HOUR, ...all.map((i) => Math.floor(i.from / 60)))
  const lastHour = Math.max(DEFAULT_LAST_HOUR, ...all.map((i) => Math.ceil(i.to / 60)))
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i)
  const height = hours.length * HOUR_PX

  const todayIndex = days.findIndex((d) => sameDay(d, now))
  const nowMinutes = (now - startOfDay(now)) / 60000
  const nowTop = (nowMinutes - firstHour * 60) / 60 * HOUR_PX

  // Start scrolled near the morning rather than at midnight-heavy edges.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, (8 - firstHour) * HOUR_PX - 8)
    // Only on first show of this week.
  }, [days[0].getTime()]) // eslint-disable-line react-hooks/exhaustive-deps

  function createFromClick(event, day) {
    if (event.target !== event.currentTarget) return
    const rect = event.currentTarget.getBoundingClientRect()
    const minutes = firstHour * 60 + ((event.clientY - rect.top) / HOUR_PX) * 60
    // Snap to the half hour, and leave room for at least 30 minutes.
    const snapped = Math.min(23 * 60, Math.max(0, Math.floor(minutes / 30) * 30))
    const at = new Date(day)
    at.setMinutes(snapped)
    onCreateAt(day, timeKey(at))
  }

  return (
    <div className="cal-week" ref={scroller} aria-busy={loading || undefined}>
      {loading && <span className="sr-only" role="status">Loading your sessions…</span>}
      <div className="cal-week-inner" style={{ '--hour': `${HOUR_PX}px` }}>
        <div className="cal-week-head">
          <span aria-hidden="true" />
          {days.map((day) => (
            <button
              key={day.getTime()}
              type="button"
              className={`cal-week-day${sameDay(day, now) ? ' is-today' : ''}${
                sameDay(day, selected) ? ' is-selected' : ''
              }`}
              onClick={() => onSelectDate(day)}
              aria-pressed={sameDay(day, selected)}
              aria-label={`${formatFullDay(day)}${sameDay(day, now) ? ', today' : ''}`}
            >
              <span className="cal-week-wd">{formatWeekday(day)}</span>
              <span className="cal-week-num">{day.getDate()}</span>
            </button>
          ))}
        </div>

        <div className="cal-week-body">
          <div className="cal-gutter" style={{ height }} aria-hidden="true">
            {hours.map((h, i) => (
              <span key={h} className="cal-hour" style={{ top: i * HOUR_PX }}>
                {i === 0 ? '' : formatTime(new Date(2000, 0, 1, h))}
              </span>
            ))}
          </div>

          {days.map((day, d) => (
            <div
              key={day.getTime()}
              className={`cal-col${sameDay(day, selected) ? ' is-selected' : ''}`}
              style={{ height }}
              onClick={(event) => createFromClick(event, day)}
              title="Click an empty slot to plan a session"
            >
              {perDay[d].map(({ session, from, to, lane, lanes }) => {
                const type = typeOf(session)
                const { Icon } = type
                const top = ((from - firstHour * 60) / 60) * HOUR_PX
                const blockHeight = Math.max(22, ((to - from) / 60) * HOUR_PX - 2)
                return (
                  <button
                    key={session.id}
                    type="button"
                    className={`cal-block tone-${type.tone}${session.completedAt ? ' is-done' : ''}`}
                    style={{
                      top,
                      height: blockHeight,
                      left: `calc(${(lane / lanes) * 100}% + 2px)`,
                      width: `calc(${100 / lanes}% - 4px)`,
                    }}
                    onClick={() => onOpenSession(session)}
                    aria-label={describeSession(session)}
                  >
                    <span className="cal-block-title">
                      {session.completedAt ? <IconCheck /> : <Icon />} {session.title}
                    </span>
                    {blockHeight >= 38 && (
                      <span className="cal-block-time">
                        {formatTime(session.start)} – {formatTime(session.end)}
                      </span>
                    )}
                  </button>
                )
              })}

              {loading && d % 2 === 0 && (
                <span
                  className="cal-block-skel"
                  style={{ top: ((d * 2 + 2) % 8 + 2) * HOUR_PX, height: HOUR_PX * (1 + (d % 3) * 0.5) }}
                  aria-hidden="true"
                >
                  <Sk h="100%" r={7} />
                </span>
              )}

              {d === todayIndex && nowTop >= 0 && nowTop <= height && (
                <span className="cal-now" style={{ top: nowTop }} aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
