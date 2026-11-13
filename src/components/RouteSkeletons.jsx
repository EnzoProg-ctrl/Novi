import './app/app-shell.css'
import { LoadingRegion, Sk, SkCircle, SkText } from './Skeleton'

/**
 * Full-page skeletons shown while the session is being restored, before the
 * app knows which screen to render. Each one has the real screen's frame, so
 * the switch to real content does not shift anything.
 */

/** The signed-in shell: sidebar, top bar, and a generic page body. */
export function AppShellSkeleton() {
  return (
    <LoadingRegion label="Loading Novi…" className="nv-app">
      <aside className="nv-side">
        <div className="nv-side-head">
          <span className="sk-row">
            <Sk w={28} h={28} r={8} />
            <Sk w={64} h={18} />
          </span>
        </div>
        <div className="nv-side-nav">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="nv-side-item">
              <Sk w={20} h={20} r={6} />
              <Sk w={`${55 + ((i * 17) % 35)}%`} h={12} />
            </span>
          ))}
        </div>
      </aside>

      <div className="nv-app-body">
        <header className="nv-top">
          <Sk w="min(420px, 60%)" h={44} r={999} style={{ marginLeft: 'auto' }} />
          <span className="nv-top-end">
            <SkCircle size={42} />
            <SkCircle size={42} />
          </span>
        </header>
        <main className="nv-app-content">
          <PageBodySkeleton />
        </main>
      </div>
    </LoadingRegion>
  )
}

/** Title, a row of cards, and a large panel: the common shape of every app page. */
export function PageBodySkeleton() {
  return (
    <div className="sk-page">
      <span className="sk-stack" style={{ gap: 10 }}>
        <Sk w={220} h={30} r={8} />
        <Sk w={300} h={13} />
      </span>
      <div className="sk-cards">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="hm-card sk-card">
            <Sk w={44} h={44} r={12} />
            <SkText lines={2} />
          </div>
        ))}
      </div>
      <div className="hm-card sk-panel">
        <SkText lines={4} h={12} gap={14} />
      </div>
    </div>
  )
}

/** Sign-in and sign-up: the auth card. */
export function AuthCardSkeleton() {
  return (
    <LoadingRegion label="Loading…" className="auth-shell">
      <div className="card card-pad auth-card sk-auth">
        <span className="sk-row">
          <Sk w={28} h={28} r={8} />
          <Sk w={64} h={18} />
        </span>
        <Sk w="60%" h={22} r={8} style={{ marginTop: 20 }} />
        <Sk w="80%" h={12} style={{ marginTop: 8 }} />
        {Array.from({ length: 2 }, (_, i) => (
          <span key={i} className="sk-stack" style={{ marginTop: 20, gap: 8 }}>
            <Sk w={70} h={11} />
            <Sk h={44} r={12} />
          </span>
        ))}
        <Sk h={46} r={12} style={{ marginTop: 22 }} />
      </div>
    </LoadingRegion>
  )
}

/** Buddy creation: the preview orb, name field and personality grid. */
export function BuddyCardSkeleton() {
  return (
    <LoadingRegion label="Loading…" className="auth-shell">
      <div className="card card-pad buddy-card sk-auth">
        <span className="sk-stack" style={{ alignItems: 'center', gap: 12 }}>
          <SkCircle size={132} />
          <Sk w="55%" h={22} r={8} />
          <Sk w="75%" h={12} />
        </span>
        <span className="sk-stack" style={{ marginTop: 22, gap: 8 }}>
          <Sk w={90} h={11} />
          <Sk h={44} r={12} />
        </span>
        <div className="sk-grid-2" style={{ marginTop: 22 }}>
          {Array.from({ length: 4 }, (_, i) => <Sk key={i} h={54} r={12} />)}
        </div>
        <Sk h={46} r={12} style={{ marginTop: 22 }} />
      </div>
    </LoadingRegion>
  )
}

/** The landing page's frame: nav bar and hero. */
export function LandingSkeleton() {
  return (
    <LoadingRegion label="Loading Novi…" className="sk-landing">
      <div className="sk-landing-nav">
        <span className="sk-row">
          <Sk w={34} h={34} r={9} />
          <Sk w={80} h={22} />
        </span>
        <span className="sk-row">
          <Sk w={90} h={40} r={12} />
          <Sk w={130} h={44} r={12} />
        </span>
      </div>
      <div className="sk-landing-hero">
        <span className="sk-stack" style={{ gap: 16 }}>
          <Sk w={160} h={30} r={999} />
          <Sk w="90%" h={54} r={10} />
          <Sk w="70%" h={54} r={10} />
          <SkText lines={3} h={14} gap={10} />
          <span className="sk-row" style={{ marginTop: 8 }}>
            <Sk w={160} h={52} r={12} />
            <Sk w={170} h={52} r={12} />
          </span>
        </span>
        <Sk h={380} r={20} />
      </div>
    </LoadingRegion>
  )
}
