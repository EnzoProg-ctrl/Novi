import { NavLink, useLocation } from 'react-router-dom'
import { IconCalendar, IconChat, IconHome, IconPacks, IconProgress } from './AppIcons'

/**
 * Phones only (app-shell.css shows it below 768px, where the sidebar is
 * gone). The five main places, in this order; Settings stays in the profile
 * menu. A pack and its practice screen live under /pack/:id, so they count
 * as Packs.
 */
const TABS = [
  { label: 'Home', Icon: IconHome, to: '/dashboard' },
  { label: 'Packs', Icon: IconPacks, to: '/packs', also: ['/pack/'] },
  { label: 'AI Chat', Icon: IconChat, to: '/chat' },
  { label: 'Calendar', Icon: IconCalendar, to: '/calendar' },
  { label: 'Progress', Icon: IconProgress, to: '/progress' },
]

export function MobileTabBar() {
  const { pathname } = useLocation()
  return (
    <nav className="nv-tabbar" aria-label="Main">
      {TABS.map(({ label, Icon, to, also = [] }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `nv-tab${isActive || also.some((p) => pathname.startsWith(p)) ? ' is-active' : ''}`}
        >
          <Icon width={22} height={22} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
