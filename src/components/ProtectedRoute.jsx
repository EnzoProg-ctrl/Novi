import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import { FullPageLoader } from './FullPageLoader'

/**
 * Gates the signed-in area.
 *
 * `requireBuddy` is on for every screen except buddy creation itself — a student
 * without a buddy gets sent there first, which is what makes the onboarding
 * order (account → buddy → upload) hold no matter which URL they land on.
 */
export function ProtectedRoute({ children, requireBuddy = true }) {
  const { user, buddy, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageLoader />

  if (!user) {
    return <Navigate to="/signin" state={{ from: location.pathname }} replace />
  }

  if (requireBuddy && !buddy) {
    return <Navigate to="/buddy/new" replace />
  }

  return children
}
