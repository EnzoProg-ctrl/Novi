import sleeping from '../../assets/sleeping.webp'
import { IconArrowRight, IconClock, IconFlame } from './HomeIcons'

const DATE_FMT = { weekday: undefined, month: 'long', day: 'numeric', year: 'numeric' }

/**
 * Upcoming Schedule.
 *
 * Nothing backs this yet: the schema has study_sessions for sittings that have
 * happened, but no table for *planned* ones and no calendar feature to create
 * them. So it renders its empty state until scheduling exists.
 */
export function ScheduleCard({ sessions = [] }) {
  const today = new Date()

  return (
    <section className="hm-card hm-schedule" aria-label="Upcoming schedule">
      <header className="hm-card-head">
        <p className="hm-card-title">Upcoming Schedule</p>
        <span className="hm-muted-link">See Calendar</span>
      </header>

      <div className="hm-schedule-date">
        <p className="hm-sub">Today, {today.toLocaleDateString(undefined, DATE_FMT)}</p>
        <span className="hm-pill">
          {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
        </span>
      </div>

      {sessions.length === 0 ? (
        <p className="hm-empty-line">
          Nothing scheduled. Planning sessions is coming with the calendar.
        </p>
      ) : (
        <ul className="hm-schedule-list">
          {sessions.map((s) => (
            <li key={s.id}>
              <span className="hm-schedule-bar" style={{ background: s.color }} />
              <span className="hm-schedule-meta">
                <span className="hm-schedule-name">{s.title}</span>
                <span className="hm-sub">{s.time}</span>
              </span>
              <span className="hm-schedule-start">Start</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function StatCards({ streakDays = 0, monthMinutes = 0 }) {
  const hours = (monthMinutes / 60).toFixed(1)

  return (
    <div className="hm-stats">
      <section className="hm-card hm-stat" aria-label="Study streak">
        <span className="hm-stat-icon is-flame"><IconFlame /></span>
        <p className="hm-stat-label">Study Streak</p>
        <p className="hm-stat-value">
          {streakDays} <span>{streakDays === 1 ? 'day' : 'days'}</span>
        </p>
        <p className="hm-sub">{streakDays > 0 ? 'Keep it up!' : 'Start today'}</p>
      </section>

      <section className="hm-card hm-stat" aria-label="Total study time">
        <span className="hm-stat-icon is-clock"><IconClock /></span>
        <p className="hm-stat-label">Total Study Time</p>
        <p className="hm-stat-value">
          {hours} <span>hrs</span>
        </p>
        <p className="hm-sub">This month</p>
      </section>
    </div>
  )
}

export function QuoteCard() {
  return (
    <section className="hm-card hm-quote" aria-label="A note from Novi">
      <img className="hm-quote-art" src={sleeping} alt="" width="1536" height="1024" />
      <blockquote className="hm-quote-text">
        <p>&ldquo;Consistency today, brighter tomorrow.&rdquo;</p>
        <footer>&mdash; Novi</footer>
      </blockquote>
    </section>
  )
}

export { IconArrowRight }
