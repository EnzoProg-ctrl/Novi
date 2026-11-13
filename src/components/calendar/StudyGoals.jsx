import { useState } from 'react'
import { MascotRig } from '../MascotRig'
import { LoadingRegion, Sk } from '../Skeleton'

const MIN_GOAL = 1
const MAX_GOAL = 21 // matches the CHECK on learning_profile.weekly_session_goal

function cheerFor(done, goal) {
  if (done >= goal) return { line: 'Goal reached!', quote: 'You showed up for yourself this week.' }
  if (done === 0) return { line: 'A fresh week.', quote: 'One finished session gets the ball rolling.' }
  const left = goal - done
  if (left === 1) return { line: 'One more to go!', quote: 'You are so close. Finish strong.' }
  return { line: 'Nice progress!', quote: `${left} more and this week is yours.` }
}

/**
 * Completed planned sessions this week (from the student's week start) against the
 * student's weekly goal. Only sessions marked done count: a session that
 * merely happened to be in the past is not proof it happened.
 */
export function StudyGoals({ completed, goal, loading, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(goal ?? 5)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const target = goal ?? 5
  const ratio = Math.min(completed / target, 1)
  const cheer = cheerFor(completed, target)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await onSave(draft)
      setEditing(false)
    } catch {
      setError('Could not save your goal. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="hm-card cal-card" aria-labelledby="cal-goals-title">
      <div className="hm-card-head">
        <h2 id="cal-goals-title" className="hm-card-title">Study Goals</h2>
        {!editing && !loading && (
          <button
            type="button"
            className="hm-muted-link"
            onClick={() => {
              setDraft(target)
              setEditing(true)
            }}
          >
            Edit goal
          </button>
        )}
      </div>

      {loading ? (
        <LoadingRegion label="Loading your weekly goal…" className="sk-stack" >
          <Sk w="70%" h={26} r={6} style={{ marginBottom: 12 }} />
          <Sk h={8} r={4} />
          <Sk w="80%" h={11} style={{ marginTop: 10 }} />
        </LoadingRegion>
      ) : editing ? (
        <div className="cal-goal-edit">
          <p className="hm-sub">Planned sessions to complete each week</p>
          <div className="cal-stepper">
            <button
              type="button"
              className="cal-icon-btn"
              onClick={() => setDraft((n) => Math.max(MIN_GOAL, n - 1))}
              disabled={draft <= MIN_GOAL || saving}
              aria-label="Fewer sessions"
            >
              −
            </button>
            <output className="cal-stepper-value" aria-live="polite">{draft}</output>
            <button
              type="button"
              className="cal-icon-btn"
              onClick={() => setDraft((n) => Math.min(MAX_GOAL, n + 1))}
              disabled={draft >= MAX_GOAL || saving}
              aria-label="More sessions"
            >
              +
            </button>
          </div>
          {error && <p className="cal-field-error" role="alert">{error}</p>}
          <div className="cal-goal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
              {saving && <span className="spinner" />}
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="cal-goal-count">
            {completed} <span>of {target} sessions this week</span>
          </p>
          <div
            className="cal-progress"
            role="progressbar"
            aria-label="Weekly goal progress"
            aria-valuemin={0}
            aria-valuemax={target}
            aria-valuenow={Math.min(completed, target)}
          >
            <span style={{ width: `${ratio * 100}%` }} />
          </div>
          <p className="hm-sub cal-goal-note">Sessions count once you mark them completed.</p>
        </>
      )}

      {/* The message depends on the count, so it waits for real data. */}
      {!loading && (
      <div className="cal-cheer">
        <MascotRig pose="front" className="cal-cheer-art" />
        <div>
          <p className="cal-cheer-line">{cheer.line}</p>
          <p className="cal-cheer-quote">&ldquo;{cheer.quote}&rdquo;</p>
        </div>
      </div>
      )}
    </section>
  )
}
