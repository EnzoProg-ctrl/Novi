import capybara from '../../assets/capybara_landingpage.webp'
import {
  IconArrowRight,
  IconAtom,
  IconBook,
  IconCalendar,
  IconChart,
  IconDots,
  IconGrid,
  IconHome,
  IconPlus,
  IconSettings,
  IconTools,
} from './icons'

const SIDEBAR = [
  { label: 'Home', Icon: IconHome, active: true },
  { label: 'Study Tools', Icon: IconTools },
  { label: 'Calendar', Icon: IconCalendar },
  { label: 'Progress', Icon: IconChart },
  { label: 'Settings', Icon: IconSettings },
]

const PROGRESS = [
  { subject: 'Biology', value: 82 },
  { subject: 'Mathematics', value: 71 },
  { subject: 'Physics', value: 64 },
  { subject: 'History', value: 48 },
]

const PACKS = [
  { subject: 'Biology', topic: 'Cell Division', updated: 'Updated 2 days ago', Icon: IconGrid, tone: 'green' },
  { subject: 'Physics', topic: 'Kinematics', updated: 'Updated 5 days ago', Icon: IconAtom, tone: 'blue' },
  { subject: 'History', topic: 'Philippine Rev.', updated: 'Updated 1 week ago', Icon: IconBook, tone: 'pink' },
]

/**
 * A static preview of the signed-in app, built in markup rather than shipped as
 * an image so it stays crisp and can be restyled with the design tokens.
 * Decorative: hidden from assistive tech, since it is a picture of the product.
 */
export function DashboardMockup() {
  return (
    <div className="nv-mock" role="img" aria-label="Preview of the Novi study dashboard">
      <aside className="nv-mock-side" aria-hidden="true">
        <div className="nv-mock-brand">
          <svg width="18" height="18" viewBox="0 0 34 34" fill="none">
            <rect x="3" y="4" width="11" height="26" rx="4" fill="var(--nv-coral)" />
            <rect x="17" y="4" width="11" height="26" rx="4" fill="var(--nv-coral-soft)" />
          </svg>
          <span>Novi</span>
        </div>

        <nav className="nv-mock-nav">
          {SIDEBAR.map(({ label, Icon, active }) => (
            <span key={label} className={`nv-mock-navitem${active ? ' is-active' : ''}`}>
              <Icon width={15} height={15} />
              {label}
            </span>
          ))}
        </nav>
      </aside>

      <div className="nv-mock-main" aria-hidden="true">
        <header className="nv-mock-head">
          <div>
            <p className="nv-mock-greet">Good morning! ☀️</p>
            <p className="nv-mock-sub">Ready to make progress today?</p>
          </div>
          <div className="nv-mock-headicons">
            <IconDots width={15} height={15} />
            <IconArrowRight width={15} height={15} />
          </div>
        </header>

        <div className="nv-mock-row">
          <div className="nv-mock-card nv-mock-buddy">
            <span className="nv-mock-avatar">
              <img src={capybara} alt="" />
            </span>
            <div className="nv-mock-buddytext">
              <p className="nv-mock-buddyname">Novi</p>
              <p className="nv-mock-sub">You&apos;ve got this!<br />Let&apos;s keep going.</p>
              <span className="nv-mock-btn">
                Start Studying <IconArrowRight width={12} height={12} />
              </span>
            </div>
          </div>

          <div className="nv-mock-card">
            <div className="nv-mock-cardhead">
              <p className="nv-mock-cardtitle">Your Progress</p>
              <span className="nv-mock-link">View All →</span>
            </div>
            <ul className="nv-mock-progress">
              {PROGRESS.map(({ subject, value }) => (
                <li key={subject}>
                  <span className="nv-mock-psubject">{subject}</span>
                  <span className="nv-mock-track">
                    <span className="nv-mock-fill" style={{ width: `${value}%` }} />
                  </span>
                  <span className="nv-mock-pvalue">{value}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="nv-mock-cardhead nv-mock-packhead">
          <p className="nv-mock-cardtitle">Recent Study Packs</p>
          <span className="nv-mock-link">See All →</span>
        </div>

        <div className="nv-mock-packs">
          {PACKS.map(({ subject, topic, updated, Icon, tone }) => (
            <div key={subject} className="nv-mock-pack">
              <span className={`nv-mock-packicon is-${tone}`}>
                <Icon width={13} height={13} />
              </span>
              <p className="nv-mock-packsubject">{subject}</p>
              <p className="nv-mock-packtopic">{topic}</p>
              <p className="nv-mock-packmeta">{updated}</p>
            </div>
          ))}

          <div className="nv-mock-pack nv-mock-packadd">
            <IconPlus width={16} height={16} />
            <p className="nv-mock-packsubject">Add New</p>
            <p className="nv-mock-packtopic">Study Pack</p>
          </div>
        </div>
      </div>
    </div>
  )
}
