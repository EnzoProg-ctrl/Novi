import { Link, NavLink } from 'react-router-dom'
// The standalone waving pose was removed; capybara-avatar is the same
// waving character, squared off from the landing artwork.
import waving from '../../assets/capybara-avatar.webp'
import {
  IconCalendar,
  IconChat,
  IconClose,
  IconHome,
  IconPacks,
  IconProgress,
  IconSettings,
  IconUpload,
  NoviMark,
} from './AppIcons'

/**
 * `to` marks a screen that exists. Items without it are part of the design but
 * have no feature yet, so they render inert rather than as links that would
 * fall through the catch-all route and bounce the student to the landing page.
 */
const NAV = [
  { label: 'Home', Icon: IconHome, to: '/dashboard' },
  { label: 'Upload', Icon: IconUpload, to: '/upload' },
  { label: 'Study Packs', Icon: IconPacks, to: '/packs' },
  { label: 'Calendar', Icon: IconCalendar },
  { label: 'Progress', Icon: IconProgress },
  { label: 'AI Chat', Icon: IconChat },
  { label: 'Settings', Icon: IconSettings },
]

export function AppSidebar({ open, onClose }) {
  return (
    <>
      <div
        className={`nv-backdrop${open ? ' is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className={`nv-side${open ? ' is-open' : ''}`} aria-label="Main">
        <div className="nv-side-head">
          <Link to="/dashboard" className="nv-side-brand" onClick={onClose}>
            <NoviMark size={28} />
            <span>Novi</span>
          </Link>
          <button type="button" className="nv-side-close" onClick={onClose} aria-label="Close menu">
            <IconClose />
          </button>
        </div>

        <nav className="nv-side-nav">
          {NAV.map(({ label, Icon, to }) =>
            to ? (
              <NavLink
                key={label}
                to={to}
                className={({ isActive }) => `nv-side-item${isActive ? ' is-active' : ''}`}
                onClick={onClose}
              >
                <Icon />
                <span>{label}</span>
              </NavLink>
            ) : (
              <span key={label} className="nv-side-item is-soon" aria-disabled="true">
                <Icon />
                <span>{label}</span>
                <span className="nv-soon">Soon</span>
              </span>
            ),
          )}
        </nav>

        <div className="nv-side-card">
          <img className="nv-side-art" src={waving} alt="" width="320" height="320" />
          <p className="nv-side-cardtitle">Good things take time.</p>
          <p className="nv-side-cardsub">You&apos;re doing great!</p>
        </div>
      </aside>
    </>
  )
}
