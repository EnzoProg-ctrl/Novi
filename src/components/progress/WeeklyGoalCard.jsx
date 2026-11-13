import { useState } from 'react'
import { getWeekStart } from '../../lib/calendar-dates'
import { IconClose } from '../app/AppIcons'
import { MascotRig } from '../MascotRig'
import { CardError, RingSkeleton } from './CardStatus'

const MIN_GOAL = 1
const MAX_GOAL = 21 // matches the CHECK on learning_profile.weekly_session_goal
const R = 42
const CIRC = 2 * Math.PI * R

function messageFor(done, goal) {
  const left = goal - done
  if (left <= 0) return { line: 'Goal reached!', sub: 'You showed up for yourself this week.' }
  if (done === 0) return { line: 'A fresh week.', sub: `${goal} sessions to reach your weekly goal.` }
  if (left === 1) return { line: "You're almost there!", sub: '1 more session to reach your weekly goal.' }
  return { line: 'Keep it going!', sub: `${left} more sessions to reach your weekly goal.` }
}

/** Planned sessions marked completed this week (Mon-Sun), the same count the Calendar shows. */
export function WeeklyGoalCard({ completed, goal, loading, error, onRetry, onEdit }) {
  const target = goal ?? 5
  const ratio = Math.min(completed / target, 1)
  const msg = messageFor(completed, target)

  return (
    <section className="hm-card pg-card" aria-labelledby="pg-goal-title">
      <div className="pg-card-head">
        <h2 id="pg-goal-title" className="hm-card-title">Weekly Goal</h2>
        {!loading && !error && (
          <button type="button" className="hm-muted-link pg-link-btn" onClick={onEdit}>Edit Goal</button>
        )}
      </div>

      {error ? (
        <CardError onRetry={onRetry}>Your goal could not be loaded.</CardError>
      ) : loading ? (
        <RingSkeleton label="Loading your weekly goal…" />
      ) : (
        <div className="pg-goal">
          <div className="pg-ring">
            <svg viewBox="0 0 100 100" role="img" aria-label={`${completed} of ${target} sessions completed this week`}>
              <circle className="pg-ring-track" cx="50" cy="50" r={R} />
              <circle
                className="pg-ring-fill"
                cx="50"
                cy="50"
                r={R}
                strokeDasharray={CIRC}
                strokeDashoffset={CIRC * (1 - ratio)}
              />
            </svg>
            <p className="pg-ring-text" aria-hidden="true">
              <strong>{completed}/{target}</strong>
              <span>sessions</span>
            </p>
          </div>
          <div className="pg-goal-text">
            <p className="pg-goal-line">{msg.line}</p>
            <p className="hm-sub">{msg.sub}</p>
            <MascotRig pose="front" className="pg-goal-art" />
          </div>
        </div>
      )}
    </section>
  )
}

export function GoalForm({ goal, saving, onCancel, onSave }) {
  const [value, setValue] = useState(String(goal ?? 5))
  const [error, setError] = useState(null)
  const n = Number(value)
  const valid = Number.isInteger(n) && n >= MIN_GOAL && n <= MAX_GOAL

  async function submit(event) {
    event.preventDefault()
    if (!valid) {
      setError(`Choose a whole number from ${MIN_GOAL} to ${MAX_GOAL}.`)
      return
    }
    setError(null)
    try {
      await onSave(n)
    } catch {
      setError('Could not save your goal. Try again.')
    }
  }

  const step = (delta) => {
    const next = Math.min(MAX_GOAL, Math.max(MIN_GOAL, (Number.isFinite(n) ? n : 5) + delta))
    setValue(String(next))
    setError(null)
  }

  return (
    <form className="nv-modal-panel" onSubmit={submit} noValidate>
      <header className="nv-modal-head">
        <div>
          <h2 id="pg-modal-title" className="nv-modal-title">Weekly goal</h2>
          <p className="hint">How many planned sessions do you want to complete each week?</p>
        </div>
        <button type="button" className="nv-modal-close" onClick={onCancel} disabled={saving} aria-label="Close">
          <IconClose />
        </button>
      </header>

      <div className="field">
        <label className="label" htmlFor="pg-goal-input">Sessions per week</label>
        <div className="pg-goal-stepper">
          <button type="button" className="cal-icon-btn" onClick={() => step(-1)} disabled={saving || n <= MIN_GOAL} aria-label="Fewer sessions">−</button>
          <input
            id="pg-goal-input"
            className="input pg-goal-input"
            type="number"
            inputMode="numeric"
            min={MIN_GOAL}
            max={MAX_GOAL}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby="pg-goal-help"
          />
          <button type="button" className="cal-icon-btn" onClick={() => step(1)} disabled={saving || n >= MAX_GOAL} aria-label="More sessions">+</button>
        </div>
        <span id="pg-goal-help" className="hint">Counts planned sessions you mark completed, {getWeekStart() === 0 ? 'Sunday to Saturday' : 'Monday to Sunday'}.</span>
        {error && <span className="cal-field-error" role="alert">{error}</span>}
      </div>

      <div className="nv-modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" disabled={saving}>
          {saving && <span className="spinner" />}
          {saving ? 'Saving…' : 'Save goal'}
        </button>
      </div>
    </form>
  )
}
