import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

/** Shown on the sign-in page after an automatic sign-out (sessionStorage key). */
export const SIGNED_OUT_NOTICE_KEY = 'novi.signedOutNotice'

/** When the student was last active (localStorage); drives the idle sign-out. */
export const ACTIVITY_KEY = 'novi.lastActive'

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
