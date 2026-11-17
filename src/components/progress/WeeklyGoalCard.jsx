import { percentOf } from '../../lib/progress-metrics'
import { CardError, RingSkeleton } from './CardStatus'

const R = 42
const CIRC = 2 * Math.PI * R

/**
 * Planned sessions marked completed this week, against the weekly goal (the
 * same count the Calendar shows). The goal itself is set in Settings or the
 * Calendar.
 */
export function WeeklyGoalCard({ completed, goal, loading, error, onRetry }) {
  const target = goal ?? 5
  const ratio = Math.min(completed / target, 1)
  const pct = Math.min(100, percentOf(completed, target))

  return (
    <section className="hm-card pg-card" aria-labelledby="pg-goal-title">
      <div className="pg-card-head">
        <h2 id="pg-goal-title" className="pg-card-title">Weekly Goal</h2>
      </div>

      {error ? (
        <CardError onRetry={onRetry}>Your goal could not be loaded.</CardError>
      ) : loading ? (
        <RingSkeleton label="Loading your weekly goal…" lines={2} />
      ) : (
        <div className="pg-goal">
          <div className="pg-ring">
            <svg viewBox="0 0 100 100" role="img" aria-label={`${completed} of ${target} sessions completed this week`}>
              <circle className="pg-ring-track" cx="50" cy="50" r={R} />
              {completed > 0 && (
                <circle
                  className="pg-ring-fill"
                  cx="50"
                  cy="50"
                  r={R}
                  strokeDasharray={CIRC}
                  strokeDashoffset={CIRC * (1 - ratio)}
                />
              )}
            </svg>
            <p className="pg-ring-text" aria-hidden="true">
              <strong>{completed}/{target}</strong>
              <span>sessions</span>
            </p>
          </div>
          <div className="pg-goal-text">
            <p className="pg-goal-line">
              {completed >= target
                ? `Goal reached: ${target} ${target === 1 ? 'session' : 'sessions'} this week.`
                : `Goal: ${target} ${target === 1 ? 'session' : 'sessions'} this week.`}
            </p>
            <div className="pg-goal-progress">
              <span
                className="pg-bar-track"
                role="progressbar"
                aria-label="Weekly goal"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
              >
                <span style={{ width: `${pct}%` }} />
              </span>
              <span className="pg-goal-pct">{pct}%</span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
