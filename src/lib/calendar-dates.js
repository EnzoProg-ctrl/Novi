/**
 * Date helpers for the Calendar. Everything works in the student's local time:
 * a session typed as "Thursday 4pm" is built as a local Date, and only turned
 * into a UTC timestamp at the moment it is saved. Days are stepped with
 * setDate rather than by adding 24h, so daylight-saving changes cannot shift a
 * date.
 */

export const VIEWS = ['month', 'week', 'day']

export function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** Same day of the month where possible, clamped (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date, months) {
  const d = new Date(date.getFullYear(), date.getMonth() + months, 1)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(date.getDate(), lastDay))
  return d
}

// First day of the week, in getDay() numbering: 1 Monday (default), 0 Sunday.
// Set once from the student's preferences by PreferencesProvider; every weekly
// view, goal and report goes through startOfWeek, so they all agree.
let weekStartsOn = 1

export function setWeekStart(day) {
  weekStartsOn = day === 0 ? 0 : 1
}

export const getWeekStart = () => weekStartsOn

export function startOfWeek(date) {
  const d = startOfDay(date)
  return addDays(d, -((d.getDay() - weekStartsOn + 7) % 7))
}

export function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Local calendar date as YYYY-MM-DD. Never toISOString, which is UTC. */
export function dateKey(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function timeKey(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** "2026-10-23" + "16:30" -> local Date, or null if either part is malformed. */
export function parseLocal(dateStr, timeStr) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr ?? '')
  const tm = /^(\d{2}):(\d{2})$/.exec(timeStr ?? '')
  if (!dm || !tm) return null
  const d = new Date(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2])
  // Rejects impossible dates such as 2026-02-31, which Date would roll over.
  return d.getMonth() === +dm[2] - 1 && d.getDate() === +dm[3] ? d : null
}

export const minutesBetween = (a, b) => Math.round((b - a) / 60000)

export function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}

/** Every date needed to fill the month's grid, as rows of seven from the week start. */
export function monthGrid(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1)
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  const weeks = []
  for (let day = startOfWeek(first); day <= last; day = addDays(day, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)))
  }
  return weeks
}

/** The span a view shows: [start, end). */
export function rangeFor(view, date) {
  if (view === 'day') {
    const start = startOfDay(date)
    return { start, end: addDays(start, 1) }
  }
  if (view === 'week') {
    const start = startOfWeek(date)
    return { start, end: addDays(start, 7) }
  }
  const weeks = monthGrid(date)
  return { start: weeks[0][0], end: addDays(weeks.at(-1)[6], 1) }
}

/** Previous/next period from the selected date. */
export function shiftDate(view, date, direction) {
  if (view === 'day') return addDays(date, direction)
  if (view === 'week') return addDays(date, 7 * direction)
  return addMonths(date, direction)
}

const fmt = (options) => new Intl.DateTimeFormat(undefined, options)
const monthYear = fmt({ month: 'long', year: 'numeric' })
const fullDay = fmt({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
const shortMonthDay = fmt({ month: 'short', day: 'numeric' })
const time = fmt({ hour: 'numeric', minute: '2-digit' })

export const formatTime = (date) => time.format(date)
export const formatFullDay = (date) => fullDay.format(date)
export const formatShortDay = (date) => shortMonthDay.format(date)
export const formatWeekday = (date, style = 'short') => fmt({ weekday: style }).format(date)
export const formatMonthShort = (date) => fmt({ month: 'short' }).format(date)

export function periodLabel(view, date) {
  if (view === 'day') return fullDay.format(date)
  if (view === 'week') {
    const start = startOfWeek(date)
    const end = addDays(start, 6)
    const sameMonth = start.getMonth() === end.getMonth()
    const sameYear = start.getFullYear() === end.getFullYear()
    const left = sameYear
      ? shortMonthDay.format(start)
      : fmt({ month: 'short', day: 'numeric', year: 'numeric' }).format(start)
    const right = sameMonth ? end.getDate() : shortMonthDay.format(end)
    return `${left} – ${right}, ${end.getFullYear()}`
  }
  return monthYear.format(date)
}

/** Session overlaps the [start, end) span. */
export const overlaps = (session, start, end) => session.start < end && session.end > start
