import { useState } from 'react'
import { usePreferences } from '../../context/preferences-context'
import {
  dateKey,
  formatDuration,
  minutesBetween,
  parseLocal,
  sameDay,
  timeKey,
} from '../../lib/calendar-dates'
import { MAX_SESSION_MINUTES } from '../../lib/schedule'
import { IconClose } from '../app/AppIcons'
import { SESSION_TYPES } from './sessionTypes'
import { DatePicker } from '../DatePicker'
import { Select } from '../Select'
import { TimeSelect } from '../TimeSelect'
import { friendlyError } from '../../lib/errors'

const pad = (n) => String(n).padStart(2, '0')

/** Next full hour if planning for today, otherwise late afternoon. */
function defaultStart(date, now) {
  let hour = sameDay(date, now) ? now.getHours() + 1 : 16
  if (hour > 22) hour = 22
  return `${pad(hour)}:00`
}

function plusMinutes(time, minutes) {
  const [h, m] = time.split(':').map(Number)
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes)
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

function initialValues(session, prefill, now, minutes) {
  if (session) {
    return {
      title: session.title,
      packId: session.packId ?? '',
      date: dateKey(session.start),
      start: timeKey(session.start),
      end: timeKey(session.end),
      type: session.type,
      notes: session.notes ?? '',
    }
  }
  const date = prefill?.date ?? now
  const start = prefill?.startTime ?? defaultStart(date, now)
  return {
    title: '',
    packId: '',
    date: dateKey(date),
    start,
    end: plusMinutes(start, minutes),
    type: 'focus',
    notes: '',
  }
}

/**
 * Sessions start and end on the same day; one that would cross midnight is
 * rejected rather than silently stored on the wrong date.
 */
function validate(values) {
  const errors = {}
  if (!values.title.trim()) errors.title = 'Give the session a title.'
  const start = parseLocal(values.date, values.start)
  const end = parseLocal(values.date, values.end)
  if (!parseLocal(values.date, '00:00')) errors.date = 'Pick a date.'
  else if (!start) errors.start = 'Pick a start time.'
  else if (!end) errors.end = 'Pick an end time.'
  else if (end <= start) errors.end = 'End time must be after the start time.'
  else if (minutesBetween(start, end) > MAX_SESSION_MINUTES) errors.end = 'Sessions can be at most 12 hours long.'
  return { errors, start, end }
}

export function SessionForm({ session, prefill, packs, now, saving, onCancel, onSave }) {
  const { prefs } = usePreferences()
  const lengthFor = (type) => (type === 'break' ? prefs.defaultBreakMinutes : prefs.defaultSessionMinutes)
  const [values, setValues] = useState(() => initialValues(session, prefill, now, lengthFor('focus')))
  // A new session's end time follows the default length for its type until
  // the student sets the end themselves.
  const [endTouched, setEndTouched] = useState(Boolean(session))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitted, setSubmitted] = useState(false)

  const set = (field) => (event) => {
    const next = { ...values, [field]: event.target.value }
    if (field === 'end') setEndTouched(true)
    if (!endTouched && (field === 'type' || field === 'start') && next.start) {
      next.end = plusMinutes(next.start, lengthFor(next.type))
    }
    setValues(next)
    // Once they have tried to save, keep the messages in step with what they type.
    if (submitted) setErrors(validate(next).errors)
  }

  const start = parseLocal(values.date, values.start)
  const end = parseLocal(values.date, values.end)
  const duration = start && end && end > start ? minutesBetween(start, end) : null

  async function handleSubmit(event) {
    event.preventDefault()
    if (saving) return
    setSubmitted(true)
    const result = validate(values)
    setErrors(result.errors)
    if (Object.keys(result.errors).length > 0) return

    setFormError(null)
    try {
      await onSave({
        title: values.title,
        packId: values.packId || null,
        type: values.type,
        notes: values.notes,
        start: result.start,
        end: result.end,
      })
    } catch (err) {
      // Input stays as typed so nothing has to be re-entered.
      setFormError(friendlyError(err, 'Could not save the session. Try again.'))
    }
  }

  // The pickers take a value rather than an input event.
  const setTo = (field) => (value) => set(field)({ target: { value } })
  const pickerProps = (name) => ({
    invalid: Boolean(errors[name]),
    describedBy: errors[name] ? `cal-${name}-error` : undefined,
  })

  const fieldProps = (name) => ({
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `cal-${name}-error` : undefined,
  })
  const errorFor = (name) =>
    errors[name] && (
      <span id={`cal-${name}-error`} className="cal-field-error">{errors[name]}</span>
    )

  return (
    <form className="nv-modal-panel" onSubmit={handleSubmit} noValidate>
      <header className="nv-modal-head">
        <div>
          <h2 id="cal-modal-title" className="nv-modal-title">
            {session ? 'Edit session' : 'Schedule a session'}
          </h2>
          <p className="hint">Block out time to study, and Novi will keep it on your calendar.</p>
        </div>
        <button type="button" className="nv-modal-close" onClick={onCancel} disabled={saving} aria-label="Close">
          <IconClose />
        </button>
      </header>

      {formError && <div className="msg msg-error" role="alert">{formError}</div>}

      <div className="field">
        <label className="label" htmlFor="cal-title">Session title</label>
        <input
          id="cal-title"
          className="input"
          value={values.title}
          onChange={set('title')}
          placeholder="Review cell division"
          maxLength={120}
          autoComplete="off"
          {...fieldProps('title')}
        />
        {errorFor('title')}
      </div>

      <div className="field">
        <label id="cal-pack-label" className="label" htmlFor="cal-pack">
          Study pack <span className="cal-optional">optional</span>
        </label>
        <Select
          id="cal-pack"
          className="input"
          block
          labelledBy="cal-pack-label"
          value={values.packId}
          onChange={(packId) => set('packId')({ target: { value: packId } })}
          options={[
            { value: '', label: 'No study pack' },
            ...packs.map((pack) => ({ value: pack.id, label: pack.title })),
          ]}
        />
        {packs.length === 0 && (
          <span className="hint">You have no study packs yet. Add material from Home to link one.</span>
        )}
      </div>

      <div className="cal-form-grid">
        <div className="field cal-field-date">
          <label id="cal-date-label" className="label" htmlFor="cal-date">Date</label>
          <DatePicker id="cal-date" labelledBy="cal-date-label" value={values.date} onChange={setTo('date')} {...pickerProps('date')} />
          {errorFor('date')}
        </div>
        <div className="field">
          <label id="cal-start-label" className="label" htmlFor="cal-start">Start time</label>
          <TimeSelect id="cal-start" labelledBy="cal-start-label" value={values.start} onChange={setTo('start')} {...pickerProps('start')} />
          {errorFor('start')}
        </div>
        <div className="field">
          <label id="cal-end-label" className="label" htmlFor="cal-end">End time</label>
          <TimeSelect id="cal-end" labelledBy="cal-end-label" value={values.end} from={values.start} onChange={setTo('end')} {...pickerProps('end')} />
          {errorFor('end')}
        </div>
      </div>
      <p className="cal-duration" aria-live="polite">
        Duration: <strong>{duration ? formatDuration(duration) : '—'}</strong>
      </p>

      <fieldset className="cal-types-field">
        <legend className="label">Session type</legend>
        <div className="cal-types">
          {SESSION_TYPES.map(({ value, label, tone, Icon }) => (
            <label
              key={value}
              className={`cal-type-option tone-${tone}${values.type === value ? ' is-selected' : ''}`}
            >
              <input
                type="radio"
                name="cal-type"
                value={value}
                checked={values.type === value}
                onChange={set('type')}
                className="sr-only"
              />
              <span className="cal-type-mark"><Icon /></span>
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label className="label" htmlFor="cal-notes">
          Notes <span className="cal-optional">optional</span>
        </label>
        <textarea
          id="cal-notes"
          className="input cal-notes"
          value={values.notes}
          onChange={set('notes')}
          maxLength={1000}
          rows={3}
          placeholder="Chapters to cover, questions to ask…"
        />
      </div>

      <div className="nv-modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={saving}>
          {saving && <span className="spinner" />}
          {saving ? 'Saving…' : 'Save Session'}
        </button>
      </div>
    </form>
  )
}
