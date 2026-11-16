import { Suspense, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import { AppSidebar } from './app/AppSidebar'
import { AppTopbar } from './app/AppTopbar'
import { PageBodySkeleton } from './RouteSkeletons'
import { UploadProvider } from './upload/UploadProvider'
import { SessionReminder } from './SessionReminder'
import { UndoToast } from './UndoToast'
import './app/app-shell.css'

export function AppLayout() {
  const { user, buddy } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  // Every sidebar link closes the drawer itself, so navigation needs no effect
  // here. Escape is the one case with no element to hang a handler on.
  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  return (
    <UploadProvider>
    <div className="nv-app">
      <AppSidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="nv-app-body">
        <AppTopbar onMenuClick={() => setMenuOpen(true)} />
        <main className="nv-app-content">
          {/* Pages load the first time they're opened (App.jsx); the shell
              stays up and the page area shows its skeleton meanwhile. */}
          <Suspense fallback={<PageBodySkeleton />}>
            <Outlet context={{ user, buddy }} />
          </Suspense>
        </main>
      </div>
      <SessionReminder />
      <UndoToast />
    </div>
    </UploadProvider>
  )
}
