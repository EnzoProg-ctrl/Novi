import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { AuthCardSkeleton, BuddyCardSkeleton, LandingSkeleton } from './components/RouteSkeletons'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthProvider'
import { PreferencesProvider } from './context/PreferencesProvider'
import { useAuth } from './context/auth-context'

/**
 * Each page is loaded the first time it's opened, not all up front, so the
 * landing and sign-in pages don't carry AI Chat, Calendar and the rest. Pages
 * inside the app shell show PageBodySkeleton meanwhile (see AppLayout).
 *
 * A page's styles load with it, so a page must import every stylesheet whose
 * classes it uses, even ones another page also loads.
 */
const page = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })))
const Calendar = page(() => import('./pages/Calendar'), 'Calendar')
const Chat = page(() => import('./pages/Chat'), 'Chat')
const CreateBuddy = page(() => import('./pages/CreateBuddy'), 'CreateBuddy')
const Dashboard = page(() => import('./pages/Dashboard'), 'Dashboard')
const ForgotPassword = page(() => import('./pages/ForgotPassword'), 'ForgotPassword')
const Landing = page(() => import('./pages/Landing'), 'Landing')
const Packs = page(() => import('./pages/Packs'), 'Packs')
const Practice = page(() => import('./pages/Practice'), 'Practice')
const Progress = page(() => import('./pages/Progress'), 'Progress')
const ResetPassword = page(() => import('./pages/ResetPassword'), 'ResetPassword')
const Settings = page(() => import('./pages/Settings'), 'Settings')
const SignIn = page(() => import('./pages/SignIn'), 'SignIn')
const SignUp = page(() => import('./pages/SignUp'), 'SignUp')
const StudyPack = page(() => import('./pages/StudyPack'), 'StudyPack')
import './App.css'

/** Keeps signed-in students out of the landing and auth screens. */
function PublicOnly({ children, skeleton = <AuthCardSkeleton /> }) {
  const { user, buddy, loading, recoveryPending } = useAuth()
  if (loading) return skeleton
  if (user && recoveryPending) return <Navigate to="/reset-password" replace />
  if (user) return <Navigate to={buddy ? '/dashboard' : '/buddy/new'} replace />
  return <Suspense fallback={skeleton}>{children}</Suspense>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicOnly skeleton={<LandingSkeleton />}><Landing /></PublicOnly>} />
      <Route path="/signin" element={<PublicOnly><SignIn /></PublicOnly>} />
      <Route path="/signup" element={<PublicOnly><SignUp /></PublicOnly>} />
      <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
      {/* Opened from a reset link, which signs the student in; not PublicOnly for that reason. */}
      <Route path="/reset-password" element={<Suspense fallback={<AuthCardSkeleton />}><ResetPassword /></Suspense>} />

      {/* Buddy creation is the one signed-in screen that must not require a buddy. */}
      <Route
        path="/buddy/new"
        element={
          <ProtectedRoute requireBuddy={false}>
            <Suspense fallback={<BuddyCardSkeleton />}>
              <CreateBuddy />
            </Suspense>
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
