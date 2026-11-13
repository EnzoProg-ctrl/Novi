import { formatDuration, formatTime } from '../lib/calendar-dates'
import { Select } from './Select'

const pad = (n) => String(n).padStart(2, '0')
const toMinutes = (time) => {
  const m = /^(\d{2}):(\d{2})$/.exec(time ?? '')
  return m ? +m[1] * 60 + +m[2] : null
}
const toKey = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
const label = (minutes) => formatTime(new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60))

/**
 * Time field used instead of the native <input type="time">: Novi's own
 * dropdown, with times every `step` minutes in the student's clock format.
 * `value` and `onChange` use "HH:MM", like the native input.
 *
 * With `from` (an "HH:MM" start), later times show how long the session would
 * be, as calendar apps do for an end time. A value off the grid (say 16:37,
 * from an older session) is kept as its own option rather than lost.
 */
export function TimeSelect({ id, value, onChange, labelledBy, describedBy, invalid, from, step = 15 }) {
  const start = toMinutes(from)
  const current = toMinutes(value)

  const minutes = []
  for (let m = 0; m < 24 * 60; m += step) minutes.push(m)
  if (current !== null && !minutes.includes(current)) {
    minutes.push(current)
    minutes.sort((a, b) => a - b)
  }

  const options = minutes.map((m) => ({
    value: toKey(m),
    label: label(m),
    hint: start !== null && m > start ? formatDuration(m - start) : undefined,
  }))

  return (
    <Select
      id={id}
      className="input"
      block
      labelledBy={labelledBy}
      describedBy={describedBy}
      invalid={invalid}
      value={current === null ? options[0].value : toKey(current)}
      onChange={onChange}
      options={options}
    />
  )
}
