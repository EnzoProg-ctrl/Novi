import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/auth-context'
import { initialsFrom } from '../../lib/initials'
import { IconChevronDown, IconMenu, NoviMark } from './AppIcons'
import { TopbarSearch } from './TopbarSearch'

export function AppTopbar({ onMenuClick }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const closeTimer = useRef(null)
  const wrapRef = useRef(null)
  const buttonRef = useRef(null)

  // Close on a click or tap anywhere else, and on Escape. Losing focus isn't
  // enough on its own: Safari (Mac, iPhone, iPad) doesn't focus a button when
  // it's clicked, so the menu would stay open until the button was pressed again.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) setMenuOpen(false)
    }
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const displayName = user?.user_metadata?.display_name ?? null
  const initials = initialsFrom(displayName, user?.email)

  async function handleSignOut() {
    setMenuOpen(false)
    try {
      await signOut()
      navigate('/', { replace: true })
    } catch {
      /* stay put; the session is still valid */
    }
  }

  // Blur closes the menu unless focus moved to another control inside it.
  function handleBlur(event) {
    const next = event.relatedTarget
    if (next && event.currentTarget.contains(next)) return
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setMenuOpen(false), 0)
  }

  return (
    <header className="nv-top">
      <button
        type="button"
        className="nv-top-menu"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <IconMenu />
      </button>

      {/* Phones only: the bottom bar replaces the sidebar, so the brand sits here. */}
      <Link to="/dashboard" className="nv-top-brand" aria-label="Novi home">
        <NoviMark size={24} />
        <span>Novi</span>
      </Link>

      <TopbarSearch />

      <div className="nv-top-end">
        <div className="nv-user" ref={wrapRef} onBlur={handleBlur}>
          <button
            ref={buttonRef}
            type="button"
            className="nv-user-btn"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            {/* Avatar slot: initials until a profile photo is supplied. */}
            <span className="nv-avatar">{initials}</span>
            <IconChevronDown width={16} height={16} />
          </button>

          <div className="nv-user-menu" role="menu" hidden={!menuOpen}>
            <p className="nv-user-name">{displayName ?? 'Your account'}</p>
            <p className="nv-user-email">{user?.email}</p>
            <button
              type="button"
              className="nv-user-action"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false)
                navigate('/buddy/new')
              }}
            >
              Edit your buddy
            </button>
            {/* Phones have no sidebar, so Settings is reached from here. */}
            <button
              type="button"
              className="nv-user-action"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false)
                navigate('/settings')
              }}
            >
              Settings
            </button>
            <button type="button" className="nv-user-action" role="menuitem" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
