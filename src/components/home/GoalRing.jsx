/**
 * Today's session goal as a ring.
 *
 * `done` is real: it comes from daily_activity for today. The target is a
 * constant because there is no per-student goal column yet — learning_profile
 * would be the place for it once goals are configurable.
 */
export const DAILY_SESSION_GOAL = 5

const R = 46
const CIRC = 2 * Math.PI * R

export function GoalRing({ done = 0, goal = DAILY_SESSION_GOAL }) {
  const ratio = goal > 0 ? Math.min(done / goal, 1) : 0

  return (
    <section className="hm-card hm-goal" aria-label="Today's goal">
      <p className="hm-card-title">Today&apos;s Goal</p>

      <div className="hm-ring">
        <svg viewBox="0 0 110 110" role="img" aria-label={`${done} of ${goal} sessions today`}>
          <circle className="hm-ring-track" cx="55" cy="55" r={R} />
          <circle
            className="hm-ring-fill"
            cx="55"
            cy="55"
            r={R}
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - ratio)}
          />
        </svg>
        <div className="hm-ring-label">
          <span className="hm-ring-count">{done}/{goal}</span>
          <span className="hm-ring-unit">sessions</span>
        </div>
      </div>
    </section>
  )
}
