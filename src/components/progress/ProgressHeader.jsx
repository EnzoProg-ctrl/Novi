import { useState } from 'react'
import { addDays, dateKey, parseLocal } from '../../lib/calendar-dates'
import { MAX_CUSTOM_DAYS, PRESETS } from '../../lib/progress-metrics'
import { IconClose } from '../app/AppIcons'
import { DatePicker } from '../DatePicker'

export function ProgressHeader() {
  return (
    <header className="pk-head pg-head">
      <div>
        <h1 className="pk-title">Progress</h1>
        <p className="hm-sub">See how your studying is going.</p>
      </div>
    </header>
  )
}

/** The reporting period: a quick preset, or two inclusive dates. */
export function RangeForm({ range, preset, onPreset, onCancel, onApply }) {
  const [from, setFrom] = useState(dateKey(range.start))
  const [to, setTo] = useState(dateKey(addDays(range.end, -1)))
  const [error, setError] = useState(null)

  function submit(event) {
    event.preventDefault()
    const start = parseLocal(from, '00:00')
    const end = parseLocal(to, '00:00')
    if (!start || !end) return setError('Pick both a start and an end date.')
    if (end < start) return setError('The end date must be on or after the start date.')
    const days = Math.round((end - start) / 86_400_000) + 1
    if (days > MAX_CUSTOM_DAYS) return setError('Choose a period of a year or less.')
    onApply(from, to)
  }

  return (
    <form className="nv-modal-panel" onSubmit={submit} noValidate>
      <header className="nv-modal-head">
        <div>
          <h2 id="pg-modal-title" className="nv-modal-title">Period</h2>
          <p className="hint">Every card on the page follows it, except the streak and weekly goal.</p>
        </div>
        <button type="button" className="nv-modal-close" onClick={onCancel} aria-label="Close">
          <IconClose />
        </button>
      </header>

      <div className="pg-presets" role="group" aria-label="Quick periods">
        {PRESETS.filter((p) => p.value !== 'custom').map((p) => (
          <button
            key={p.value}
            type="button"
            className={`pg-preset${preset === p.value ? ' is-active' : ''}`}
            aria-pressed={preset === p.value}
            onClick={() => onPreset(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="label pg-custom-label">Custom range</p>

      <div className="pg-range-grid">
        <div className="field">
          <label id="pg-from-label" className="label" htmlFor="pg-from">From</label>
          <DatePicker id="pg-from" labelledBy="pg-from-label" value={from} onChange={setFrom} max={dateKey(new Date())} invalid={Boolean(error)} />
        </div>
        <div className="field">
          <label id="pg-to-label" className="label" htmlFor="pg-to">To</label>
          <DatePicker id="pg-to" labelledBy="pg-to-label" value={to} onChange={setTo} min={from} invalid={Boolean(error)} />
        </div>
      </div>
      {error && <p className="cal-field-error" role="alert">{error}</p>}

      <div className="nv-modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary">Apply</button>
      </div>
    </form>
  )
}
