import { addDays, addMonths, dateKey, formatShortDay, parseLocal, startOfDay, startOfWeek } from './calendar-dates'

/**
 * Pure calculations behind the Progress page. Everything here takes plain
 * data and returns plain data, so each rule can be tested without a database.
 *
 * Definitions used throughout (and in the page's copy):
 * - Study time: time spent answering practice questions, each answer capped at
 *   5 minutes (the cap is applied in the database). Planned calendar time is
 *   never counted: a session marked done records *that* it happened, not how
 *   long it actually took.
 * - Study day: a local calendar day with at least one practice answer or a
 *   planned session marked completed.
 * - Completed session: a planned (calendar) session marked completed, dated by
 *   its scheduled start. The weekly goal counts the same thing.
 * - Studied pack: a pack with a practice answer, or a completed planned
 *   session linked to it, inside the period.
 * - Pack progress: questions answered correctly at least once / questions.
 */

export const PRESETS = [
  { value: 'this-week', label: 'This Week' },
  { value: 'last-week', label: 'Last Week' },
  { value: 'this-month', label: 'This Month' },
  { value: 'last-month', label: 'Last Month' },
  { value: 'this-year', label: 'This Year' },
  { value: 'custom', label: 'Custom range' },
]

export const MAX_CUSTOM_DAYS = 366

const daysBetween = (start, end) => Math.round((startOfDay(end) - startOfDay(start)) / 86_400_000)

/**
 * Reporting period as [start, end) local midnights, plus the preceding period
 * of the same kind for comparisons. `custom` is { from, to } as YYYY-MM-DD,
 * both inclusive.
 */
export function resolveRange(preset, now, custom) {
  const today = startOfDay(now)
  const month = new Date(today.getFullYear(), today.getMonth(), 1)
  let start
  let end
  let previous
  let compareLabel

  switch (preset) {
    case 'last-week':
      start = addDays(startOfWeek(today), -7)
      end = addDays(start, 7)
      previous = { start: addDays(start, -7), end: start }
      compareLabel = 'the week before'
      break
    case 'this-month':
      start = month
      end = addMonths(month, 1)
      previous = { start: addMonths(month, -1), end: month }
      compareLabel = 'last month'
      break
    case 'last-month':
      start = addMonths(month, -1)
      end = month
      previous = { start: addMonths(month, -2), end: start }
      compareLabel = 'the month before'
      break
    case 'this-year':
      start = new Date(today.getFullYear(), 0, 1)
      end = new Date(today.getFullYear() + 1, 0, 1)
      previous = { start: new Date(today.getFullYear() - 1, 0, 1), end: start }
      compareLabel = 'last year'
      break
    case 'custom': {
      const from = custom?.from && parseLocal(custom.from, '00:00')
      const to = custom?.to && parseLocal(custom.to, '00:00')
      if (from && to && from <= to) {
        start = from
        end = addDays(to, 1)
        const length = daysBetween(start, end)
        previous = { start: addDays(start, -length), end: start }
        compareLabel = 'the previous period'
        break
      }
      return resolveRange('this-week', now)
    }
    default: // this-week
      start = startOfWeek(today)
      end = addDays(start, 7)
      previous = { start: addDays(start, -7), end: start }
      compareLabel = 'last week'
  }

  return { preset, start, end, previous, compareLabel, days: daysBetween(start, end) }
}

export function formatRange(start, end) {
  const last = addDays(end, -1)
  const sameYear = start.getFullYear() === last.getFullYear()
  const left = sameYear
    ? formatShortDay(start)
    : `${formatShortDay(start)}, ${start.getFullYear()}`
  if (dateKey(start) === dateKey(last)) return `${formatShortDay(start)}, ${start.getFullYear()}`
  return `${left} – ${formatShortDay(last)}, ${last.getFullYear()}`
}

/** "YYYY-MM-DD" from the database -> local midnight. */
export const dayToDate = (day) => parseLocal(day, '00:00')

export const inRange = (day, range) => {
  const d = typeof day === 'string' ? dayToDate(day) : day
  return d >= range.start && d < range.end
}

// ── Study time ────────────────────────────────────────────────────

export const sumSeconds = (rows) => rows.reduce((sum, r) => sum + Number(r.seconds || 0), 0)

export function formatStudyTime(seconds) {
  const s = Math.max(0, Number(seconds) || 0)
  if (s === 0) return '0 min'
  if (s < 60) return '< 1 min'
  if (s < 3600) return `${Math.round(s / 60)} min`
  const hours = s / 3600
  return `${hours < 10 ? hours.toFixed(1).replace(/\.0$/, '') : Math.round(hours)} hrs`
}

const MONTHS = new Intl.DateTimeFormat(undefined, { month: 'short' })
const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'short' })

/**
 * Chart buckets for a period: days up to a month, weeks up to about half a
 * year, months beyond that.
 */
export function chartBuckets(range) {
  const buckets = []
  if (range.days <= 31) {
    for (let d = range.start; d < range.end; d = addDays(d, 1)) {
      buckets.push({
        start: d,
        end: addDays(d, 1),
        label: range.days <= 7 ? WEEKDAY.format(d) : String(d.getDate()),
        sub: range.days <= 7 ? String(d.getDate()) : '',
        title: formatShortDay(d),
      })
    }
    return { unit: 'day', buckets }
  }
  if (range.days <= 186) {
    for (let d = startOfWeek(range.start); d < range.end; d = addDays(d, 7)) {
      const s = d < range.start ? range.start : d
      const e = addDays(d, 7) > range.end ? range.end : addDays(d, 7)
      buckets.push({ start: s, end: e, label: formatShortDay(s), sub: '', title: `Week of ${formatShortDay(s)}` })
    }
    return { unit: 'week', buckets }
  }
  for (let d = new Date(range.start.getFullYear(), range.start.getMonth(), 1); d < range.end; d = addMonths(d, 1)) {
    const s = d < range.start ? range.start : d
    const next = addMonths(d, 1)
    buckets.push({ start: s, end: next > range.end ? range.end : next, label: MONTHS.format(d), sub: '', title: `${MONTHS.format(d)} ${d.getFullYear()}` })
  }
  return { unit: 'month', buckets }
}

/** Seconds and answers per bucket. Every row lands in exactly one bucket. */
export function bucketActivity(rows, buckets) {
  const out = buckets.map((b) => ({ ...b, seconds: 0, answers: 0 }))
  for (const row of rows) {
    const d = dayToDate(row.day)
    const bucket = out.find((b) => d >= b.start && d < b.end)
    if (!bucket) continue
    bucket.seconds += Number(row.seconds || 0)
    bucket.answers += row.answers || 0
  }
  return out
}

/** A round axis maximum (in seconds) with 3-5 gridlines. */
export function axisFor(maxSeconds) {
  const minutes = maxSeconds / 60
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 180, 240, 300, 600]
  const step = steps.find((s) => minutes / s <= 4) ?? Math.ceil(minutes / 4 / 60) * 60
  const ticks = Math.max(1, Math.ceil(minutes / step))
  return { max: step * ticks * 60, step: step * 60, ticks }
}

// ── Streaks ───────────────────────────────────────────────────────

/**
 * Current and longest streak from a list of study days (YYYY-MM-DD). A streak
 * is still alive today until the day is over, so it counts back from
 * yesterday when today has no activity yet.
 */
export function streaks(days, now) {
  const set = new Set(days)
  const today = startOfDay(now)
  let cursor = set.has(dateKey(today)) ? today : addDays(today, -1)
  let current = 0
  while (set.has(dateKey(cursor))) {
    current += 1
    cursor = addDays(cursor, -1)
  }

  let longest = 0
  let run = 0
  let prev = null
  for (const day of [...set].filter((d) => dayToDate(d) <= today).sort()) {
    const date = dayToDate(day)
    run = prev && dateKey(addDays(prev, 1)) === day ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = date
  }
  return { current, longest: Math.max(longest, current) }
}

// ── Sessions, packs, subjects ─────────────────────────────────────

export const completedIn = (planned, range) =>
  planned.filter((s) => s.completedAt && s.start >= range.start && s.start < range.end)

export function percentOf(done, target) {
  if (!(target > 0)) return 0
  return Math.round((done / target) * 100)
}

/**
 * Packs with questions, most recently practised first, then never-practised
 * ones alphabetically.
 */
export function packProgress(rows) {
  return rows
    .filter((r) => r.total_questions > 0)
    .map((r) => ({
      id: r.study_set_id,
      title: r.title,
      subject: r.subject ?? null,
      total: r.total_questions,
      correct: Math.min(r.correct_questions, r.total_questions),
      percent: Math.min(100, percentOf(r.correct_questions, r.total_questions)),
      lastPracticed: r.last_practiced_at ? new Date(r.last_practiced_at) : null,
    }))
    .sort((a, b) =>
      (b.lastPracticed?.getTime() ?? -1) - (a.lastPracticed?.getTime() ?? -1) ||
      a.title.localeCompare(b.title),
    )
}

/** True when completing `saved` brought this week's count exactly to the goal. */
export function goalJustReached(list, saved, goal, now) {
  if (!goal) return false
  const start = startOfWeek(now)
  const end = addDays(start, 7)
  if (!(saved.start >= start && saved.start < end)) return false
  return list.filter((s) => s.completedAt && s.start >= start && s.start < end).length === goal
}
