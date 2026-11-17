import { IconFlame } from './HomeIcons'
import { Sk } from '../Skeleton'

/** Days in a row with practice. */
export function StreakCard({ streakDays = 0, loading = false }) {
  return (
    <section className="hm-card hm-stat" aria-label="Study streak">
      <span className="hm-stat-icon is-flame"><IconFlame /></span>
      <p className="hm-stat-label">Study Streak</p>
      {loading ? (
        <span className="sk-stack" style={{ gap: 8, marginTop: 4 }} aria-hidden="true">
          <Sk w="60%" h={22} r={6} />
          <Sk w="45%" h={11} />
        </span>
      ) : (
        <>
          <p className="hm-stat-value">
            {streakDays} <span>{streakDays === 1 ? 'day' : 'days'}</span>
          </p>
          <p className="hm-sub">{streakDays > 0 ? 'Keep it up!' : 'Start today'}</p>
        </>
      )}
    </section>
  )
}
