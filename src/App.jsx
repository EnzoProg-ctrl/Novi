import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { AuthCardSkeleton, LandingSkeleton } from './components/RouteSkeletons'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthProvider'
import { PreferencesProvider } from './context/PreferencesProvider'
import { useAuth } from './context/auth-context'
import { Calendar } from './pages/Calendar'
import { Chat } from './pages/Chat'
import { CreateBuddy } from './pages/CreateBuddy'
import { Dashboard } from './pages/Dashboard'
import { ForgotPassword } from './pages/ForgotPassword'
import { Landing } from './pages/Landing'
import { Packs } from './pages/Packs'
import { Practice } from './pages/Practice'
import { Progress } from './pages/Progress'
import { ResetPassword } from './pages/ResetPassword'
import { Settings } from './pages/Settings'
import { SignIn } from './pages/SignIn'
import { SignUp } from './pages/SignUp'
import { StudyPack } from './pages/StudyPack'
import './App.css'

/** Keeps signed-in students out of the landing and auth screens. */
function PublicOnly({ children, skeleton = <AuthCardSkeleton /> }) {
  const { user, buddy, loading, recoveryPending } = useAuth()
  if (loading) return skeleton
  if (user && recoveryPending) return <Navigate to="/reset-password" replace />
  if (user) return <Navigate to={buddy ? '/dashboard' : '/buddy/new'} replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicOnly skeleton={<LandingSkeleton />}><Landing /></PublicOnly>} />
      <Route path="/signin" element={<PublicOnly><SignIn /></PublicOnly>} />
      <Route path="/signup" element={<PublicOnly><SignUp /></PublicOnly>} />
      <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
      {/* Opened from a reset link, which signs the student in; not PublicOnly for that reason. */}
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Buddy creation is the one signed-in screen that must not require a buddy. */}
      <Route
        path="/buddy/new"
        element={
          <ProtectedRoute requireBuddy={false}>
            <CreateBuddy />
          </ProtectedRoute>
        }
      />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/packs" element={<Packs />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/chat/:conversationId" element={<Chat />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/pack/:packId" element={<StudyPack />} />
        <Route path="/pack/:packId/practice" element={<Practice />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PreferencesProvider>
          <AppRoutes />
        </PreferencesProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
