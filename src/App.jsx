import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { FullPageLoader } from './components/FullPageLoader'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthProvider'
import { useAuth } from './context/auth-context'
import { CreateBuddy } from './pages/CreateBuddy'
import { Dashboard } from './pages/Dashboard'
import { Landing } from './pages/Landing'
import { Packs } from './pages/Packs'
import { Practice } from './pages/Practice'
import { SignIn } from './pages/SignIn'
import { SignUp } from './pages/SignUp'
import { StudyPack } from './pages/StudyPack'
import { Upload } from './pages/Upload'
import './App.css'

/** Keeps signed-in students out of the landing and auth screens. */
function PublicOnly({ children }) {
  const { user, buddy, loading } = useAuth()
  if (loading) return <FullPageLoader />
  if (user) return <Navigate to={buddy ? '/dashboard' : '/buddy/new'} replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
      <Route path="/signin" element={<PublicOnly><SignIn /></PublicOnly>} />
      <Route path="/signup" element={<PublicOnly><SignUp /></PublicOnly>} />

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
        <Route path="/upload" element={<Upload />} />
        <Route path="/packs" element={<Packs />} />
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
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
