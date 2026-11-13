import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  IconCalendar,
  IconChat,
  IconClose,
  IconHome,
  IconPacks,
  IconProgress,
  IconSettings,
  NoviMark,
} from './AppIcons'
import { SidebarFocus } from './SidebarFocus'

/**
 * `to` marks a screen that exists. Items without it are part of the design but
 * have no feature yet, so they render inert rather than as links that would
 * fall through the catch-all route and bounce the student to the landing page.
 */
const NAV = [
  { label: 'Home', Icon: IconHome, to: '/dashboard' },
  // A pack and its practice screen live under /pack/:id, so they count as
  // Study Packs too.
  { label: 'Study Packs', Icon: IconPacks, to: '/packs', also: ['/pack/'] },
  { label: 'Calendar', Icon: IconCalendar, to: '/calendar' },
  { label: 'Progress', Icon: IconProgress, to: '/progress' },
  { label: 'AI Chat', Icon: IconChat, to: '/chat' },
  { label: 'Settings', Icon: IconSettings, to: '/settings' },
]

export function AppSidebar({ open, onClose }) {
  const { pathname } = useLocation()
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
          {NAV.map(({ label, Icon, to, also = [] }) =>
            to ? (
              <NavLink
                key={label}
                to={to}
                className={({ isActive }) =>
                  `nv-side-item${isActive || also.some((p) => pathname.startsWith(p)) ? ' is-active' : ''}`}
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

        <SidebarFocus onNavigate={onClose} />
      </aside>
    </>
  )
}
