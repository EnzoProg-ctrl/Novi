import {
  IconArrowRight,
  IconAtom,
  IconBell,
  IconBook,
  IconCalendar,
  IconChart,
  IconChat,
  IconDatabase,
  IconHome,
  IconNetwork,
  IconPlus,
  IconSearch,
  IconSettings,
} from './icons'

const NAV = [
  { label: 'Home', Icon: IconHome, active: true },
  { label: 'Study Packs', Icon: IconBook },
  { label: 'Calendar', Icon: IconCalendar },
  { label: 'Progress', Icon: IconChart },
  { label: 'AI Chat', Icon: IconChat },
  { label: 'Settings', Icon: IconSettings },
]

const PACKS = [
  { title: 'General Physics', concepts: 12, tone: 'blue', Icon: IconAtom },
  { title: 'Database Management & SQL', concepts: 20, tone: 'green', Icon: IconDatabase },
  { title: 'Computer Networking', concepts: 18, tone: 'violet', Icon: IconNetwork },
]

const PROGRESS = 72
// Circumference of the ring (r = 15.9 makes it 100 user units round).
const RING = 100

/**
 * A still picture of Novi's Home in dark mode, for the hero. Decorative: it
 * is hidden from assistive tech and nothing in it is interactive.
 */
export function DashboardMockup() {
  return (
    <div className="nv-device" aria-hidden="true">
      <div className="nv-mock">
        <aside className="nv-mock-side">
          <p className="nv-mock-brand">
            <span className="nv-mock-mark"><i /><i /></span>
            Novi
          </p>
          <ul className="nv-mock-nav">
            {NAV.map(({ label, Icon, active }) => (
              <li key={label} className={active ? 'is-active' : undefined}>
                <Icon width="1.15em" height="1.15em" />
                {label}
              </li>
            ))}
          </ul>
        </aside>

        <div className="nv-mock-main">
          <div className="nv-mock-top">
            <span className="nv-mock-search">
              <IconSearch width="1em" height="1em" />
              Search…
            </span>
            <span className="nv-mock-icon"><IconBell width="1.1em" height="1.1em" /></span>
            <span className="nv-mock-avatar">EN</span>
          </div>

          <p className="nv-mock-h">Home</p>
          <p className="nv-mock-sub">Welcome back, Enzo! Ready to study?</p>

          <div className="nv-mock-row">
            <div className="nv-mock-card nv-mock-next">
              <p className="nv-mock-label">Pick up where you left off</p>
              <p className="nv-mock-pack">Computer Networking Fundamentals</p>
              <p className="nv-mock-meta">12 concepts · 30 questions</p>
              <span className="nv-mock-btn">
                Continue Studying <IconArrowRight width="1em" height="1em" />
              </span>
            </div>

            <div className="nv-mock-card nv-mock-progress">
              <p className="nv-mock-label">Your Progress</p>
              <div className="nv-mock-ring-row">
                <svg className="nv-mock-ring" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" className="nv-mock-ring-track" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    className="nv-mock-ring-fill"
                    strokeDasharray={`${PROGRESS} ${RING - PROGRESS}`}
                  />
                  <text x="18" y="20.4" textAnchor="middle">{PROGRESS}%</text>
                </svg>
                <div>
                  <p className="nv-mock-meta">Overall Progress</p>
                  <p className="nv-mock-big">{PROGRESS}%</p>
                </div>
              </div>
              <span className="nv-mock-link">View All <IconArrowRight width="1em" height="1em" /></span>
            </div>
          </div>

          <div className="nv-mock-section">
            <p className="nv-mock-label">Recent Study Packs</p>
            <span className="nv-mock-link">See All <IconArrowRight width="1em" height="1em" /></span>
          </div>
          <div className="nv-mock-packs">
            {PACKS.map(({ title, concepts, tone, Icon }) => (
              <div key={title} className="nv-mock-card nv-mock-tile">
                <span className={`nv-mock-tile-icon is-${tone}`}><Icon width="1.25em" height="1.25em" /></span>
                <p className="nv-mock-tile-title">{title}</p>
                <p className="nv-mock-meta">{concepts} concepts</p>
              </div>
            ))}
            <div className="nv-mock-tile nv-mock-add">
              <IconPlus width="1.4em" height="1.4em" />
              Add New Study Pack
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
