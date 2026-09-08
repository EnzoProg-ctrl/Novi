import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Logo, Mascot } from '../components/Mascot'
import { useAuth } from '../context/auth-context'

export function AppLayout() {
  const { buddy, user, signOut } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut()
      navigate('/', { replace: true })
    } catch {
      setSigningOut(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-bar">
        <Link to="/dashboard" className="app-bar-brand">
          <Logo />
        </Link>

        <nav className="app-nav">
          <NavLink to="/dashboard" className="app-nav-link">Dashboard</NavLink>
          <NavLink to="/upload" className="app-nav-link">Upload</NavLink>
        </nav>

        <div className="app-bar-end">
          <Link to="/buddy/new" className="buddy-chip" title="Edit your buddy">
            <Mascot size={24} />
            <span>{buddy?.name ?? 'Buddy'}</span>
          </Link>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </header>

      <main className="app-main">
        <Outlet context={{ user, buddy }} />
      </main>
    </div>
  )
}
