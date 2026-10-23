import { useCallback, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { UploadContext } from '../../context/upload-context'
import { UploadDialog } from './UploadDialog'

export function UploadProvider({ children }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // 'closing' keeps the dialog on screen while its exit animation plays.
  const [state, setState] = useState('closed')
  // Bumped per opening so the form inside always starts empty.
  const [session, setSession] = useState(0)
  const [uploads, setUploads] = useState(0)

  const openUpload = useCallback(() => {
    setSession((n) => n + 1)
    setState('open')
  }, [])

  const requestClose = useCallback(() => setState((s) => (s === 'open' ? 'closing' : s)), [])

  const handleUploaded = useCallback(() => {
    setUploads((n) => n + 1)
    setState('closing')
    // Processing status is shown on Home, so that is where the student lands.
    if (pathname !== '/dashboard') navigate('/dashboard')
  }, [navigate, pathname])

  const value = useMemo(() => ({ openUpload, uploads }), [openUpload, uploads])

  return (
    <UploadContext.Provider value={value}>
      {children}
      <UploadDialog
        state={state}
        session={session}
        onRequestClose={requestClose}
        onClosed={() => setState('closed')}
        onUploaded={handleUploaded}
      />
    </UploadContext.Provider>
  )
}
