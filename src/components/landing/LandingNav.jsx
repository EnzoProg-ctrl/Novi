import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Testimonials', href: '#testimonials' },
  { label: 'FAQ', href: '#faq' },
]

/** The coral double-bar wordmark from the reference. */
function NoviMark({ size = 34 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 34 34"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="4" width="11" height="26" rx="4" fill="var(--nv-coral)" />
      <rect x="17" y="4" width="11" height="26" rx="4" fill="var(--nv-coral-soft)" />
    </svg>
  )
}

export function LandingNav() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  // Hairline border only once the page has moved, so the bar sits flush at rest.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Escape closes the mobile menu, matching what a dialog-ish surface should do.
  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  return (
    <header className={`nv-nav${scrolled ? ' is-scrolled' : ''}`}>
      <div className="nv-nav-inner">
        <Link to="/" className="nv-brand" aria-label="Novi home">
          <NoviMark />
          <span className="nv-brand-text">Novi</span>
        </Link>

        <nav className="nv-links" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="nv-link">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="nv-actions">
          <Link to="/signin" className="nv-signin">Sign in</Link>
          <Link to="/signup" className="nv-cta">Get Started</Link>
        </div>

        <button
          type="button"
          className="nv-burger"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="nv-mobile-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className={`nv-burger-box${menuOpen ? ' is-open' : ''}`}>
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>

      <div id="nv-mobile-menu" className="nv-mobile" hidden={!menuOpen}>
        <nav className="nv-mobile-links" aria-label="Main, mobile">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="nv-mobile-link"
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="nv-mobile-actions">
          <Link to="/signin" className="nv-mobile-signin" onClick={() => setMenuOpen(false)}>
            Sign in
          </Link>
          <Link to="/signup" className="nv-cta nv-cta-block" onClick={() => setMenuOpen(false)}>
            Get Started
          </Link>
        </div>
      </div>
    </header>
  )
}
