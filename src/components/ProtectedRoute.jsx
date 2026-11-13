import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import { MfaChallenge } from './MfaChallenge'
import { AppShellSkeleton, BuddyCardSkeleton } from './RouteSkeletons'

/**
 * Gates the signed-in area.
 *
 * `requireBuddy` is on for every screen except buddy creation itself — a student
 * without a buddy gets sent there first, which is what makes the onboarding
 * order (account → buddy → upload) hold no matter which URL they land on.
 */
export function ProtectedRoute({ children, requireBuddy = true }) {
  const { user, buddy, loading, needsMfa, recoveryPending } = useAuth()
  const location = useLocation()

  // Buddy creation has no app shell; every other signed-in screen does.
  if (loading) return requireBuddy ? <AppShellSkeleton /> : <BuddyCardSkeleton />

  if (!user) {
    return <Navigate to="/signin" state={{ from: location.pathname }} replace />
  }

  // Opened by a password reset link: choosing a new password comes first.
  if (recoveryPending) return <Navigate to="/reset-password" replace />

  // Password done, authenticator code still to come: nothing else until then.
  // (The database refuses this session their data anyway.)
  if (needsMfa) return <MfaChallenge />

  if (requireBuddy && !buddy) {
    return <Navigate to="/buddy/new" replace />
  }

  return children
}
