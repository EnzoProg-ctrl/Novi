import { useCallback, useEffect, useMemo, useState } from 'react'
import { clearRecoveryPending, isRecoveryPending, RECOVERY_STORAGE_KEY, setRecoveryPending } from '../lib/auth-redirect'
import { commitDelete } from '../lib/pendingDelete'
import { supabase } from '../lib/supabase'
import { ACTIVITY_KEY, AuthContext, SIGNED_OUT_NOTICE_KEY } from './auth-context'

/**
 * Signed out after this long with no activity in Novi. The session token
 * itself refreshes quietly, so without this a forgotten browser would stay
 * signed in indefinitely.
 */
const IDLE_LIMIT_MS = 7 * 24 * 60 * 60 * 1000

const readLastActive = () => {
  try {
    return Number(localStorage.getItem(ACTIVITY_KEY)) || 0
  } catch {
    return 0
  }
}
const markActive = () => {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(Date.now()))
  } catch {
    /* storage blocked: the idle check simply can't run */
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [buddy, setBuddy] = useState(null)
  const [loadingSession, setLoadingSession] = useState(true)
  // Two-step verification: which level this session has, and which it could
  // reach. Recorded per access token, so a new token is never read with the
  // old token's answer.
  const [assurance, setAssurance] = useState({ token: null, current: null, next: null })
  // Which user (and verification level) the buddy in state belongs to. Tracked
  // as a key rather than a boolean because the effect that would flip a
  // `loadingBuddy` flag only runs *after* the render in which the session first
  // appears; during that render buddy is still null, and a boolean flag would
  // already read false, long enough for ProtectedRoute to bounce a student who
  // has a buddy to /buddy/new. The level is part of the key because a student
  // with two-step verification can only read their buddy after the second step.
  const [buddyLoadedFor, setBuddyLoadedFor] = useState(null)
  // A password reset link's session that hasn't saved a new password yet.
  const [recovery, setRecovery] = useState(isRecoveryPending)

  const userId = session?.user?.id ?? null
  const token = session?.access_token ?? null
  const assurancePending = Boolean(token) && assurance.token !== token
  const aalCurrent = assurance.current
  const buddyKey = userId ? `${userId}:${aalCurrent}` : null
  const buddyPending = Boolean(userId) && (assurancePending || buddyLoadedFor !== buddyKey)
  // Signed in with a password, but has an authenticator and hasn't entered a code yet.
  const needsMfa = !assurancePending && assurance.current === 'aal1' && assurance.next === 'aal2'

  // Restore any existing session, then track sign in / sign out.
  // The callback stays synchronous on purpose: calling back into supabase-js
  // from inside onAuthStateChange can deadlock the client.
  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session ?? null)
      setLoadingSession(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryPending()
        setRecovery(true)
      } else if (event === 'SIGNED_OUT') {
        clearRecoveryPending()
        setRecovery(false)
      }
      setSession(nextSession)
      setLoadingSession(false)
    })

    // Another tab opened a reset link, saved the password or cancelled.
    const onStorage = (e) => {
      if (e.key === null || e.key === RECOVERY_STORAGE_KEY) setRecovery(isRecoveryPending())
    }
    window.addEventListener('storage', onStorage)

    return () => {
      active = false
      sub.subscription.unsubscribe()
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  // The session's verification level (decoded from the token; no network call).
  useEffect(() => {
    if (!token) {
      setAssurance({ token: null, current: null, next: null })
      return
    }
    let active = true
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (!active) return
      setAssurance({ token, current: data?.currentLevel ?? 'aal1', next: data?.nextLevel ?? 'aal1' })
    })
    return () => {
      active = false
    }
  }, [token])

  // Load the student's buddy whenever the signed-in user (or their level) changes.
  useEffect(() => {
    if (!userId) {
      setBuddy(null)
      setBuddyLoadedFor(null)
      return
    }
    if (assurancePending) return

    let active = true
    const key = `${userId}:${aalCurrent}`
    supabase
      .from('buddies')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error) console.error('Could not load buddy:', error.message)
        setBuddy(data ?? null)
        setBuddyLoadedFor(key)
      })

    return () => {
      active = false
    }
  }, [userId, assurancePending, aalCurrent])

  const signUp = useCallback(async ({ email, password, displayName }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName?.trim() || null } },
    })
    if (error) throw error
    if (data.session) markActive()
    // With email confirmation on, Supabase returns a user but no session.
    return { needsEmailConfirmation: !data.session, user: data.user }
  }, [])

  const signIn = useCallback(async ({ email, password }) => {
    // A real sign-in starts a fresh inactivity clock. (Not onAuthStateChange:
    // it also reports SIGNED_IN when a saved session is restored on load,
    // which would reset the clock and the idle check could never fire.)
    markActive()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    // Knowing the password ends any reset that was left half done.
    clearRecoveryPending()
    setRecovery(false)
  }, [])

  const signOut = useCallback(async () => {
    // A deletion still waiting out its undo time goes through now, while the
    // session that can delete it still exists.
    await commitDelete().catch(() => {})
    // Revokes the session on the server too (every device's refresh token).
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setBuddy(null)
    try {
      localStorage.removeItem(ACTIVITY_KEY)
    } catch {
      /* nothing to clear */
    }
  }, [])

  /** The second step at sign-in: a code from the student's authenticator app. */
  const verifyMfa = useCallback(async (code) => {
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) throw error
    const factor = data?.totp?.find((f) => f.status === 'verified')
    if (!factor) throw new Error('No authenticator app is set up for this account.')
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
    if (verifyError) throw verifyError
    // onAuthStateChange delivers the upgraded session; the level follows it.
  }, [])

  /** Re-reads the verification level, e.g. after turning two-step on or off in Settings. */
  const refreshAssurance = useCallback(async () => {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    const { data: current } = await supabase.auth.getSession()
    setAssurance({
      token: current.session?.access_token ?? null,
      current: data?.currentLevel ?? 'aal1',
      next: data?.nextLevel ?? 'aal1',
    })
  }, [])

  /**
   * Fetches the account as the server has it now. The signed-in user is a copy
   * taken when the session was last issued, so a change made outside this tab
   * (an email change confirmed from an inbox) only shows after this. A new
   * session arrives through onAuthStateChange; failures are ignored, since the
   * old copy is still usable.
   */
  const refreshUser = useCallback(async () => {
    const { error } = await supabase.auth.refreshSession()
    if (error) console.warn('Could not refresh the account:', error.message)
  }, [])

  // ── Sign out after a week without activity ───────────────────
  useEffect(() => {
    if (!userId) return

    const signOutIfIdle = () => {
      const last = readLastActive()
      if (!last) {
        markActive() // first visit since this check existed
        return
      }
      if (Date.now() - last <= IDLE_LIMIT_MS) return
      try {
        sessionStorage.setItem(SIGNED_OUT_NOTICE_KEY, 'You were signed out after a week without activity. Sign in again to continue.')
      } catch {
        /* the notice is a nicety */
      }
      signOut().catch(() => {})
    }

    signOutIfIdle()
    // Record activity at most once a minute.
    let lastWrite = 0
    const onActivity = () => {
      if (Date.now() - lastWrite < 60_000) return
      lastWrite = Date.now()
      markActive()
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      signOutIfIdle()
      onActivity()
    }
    window.addEventListener('pointerdown', onActivity, { passive: true })
    window.addEventListener('keydown', onActivity)
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(signOutIfIdle, 15 * 60 * 1000)
    return () => {
      window.removeEventListener('pointerdown', onActivity)
      window.removeEventListener('keydown', onActivity)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [userId, signOut])

  const createBuddy = useCallback(
    async ({ name, personality, greeting }) => {
      if (!userId) throw new Error('You need to be signed in to create a buddy.')

      const { data, error } = await supabase
        .from('buddies')
        .upsert(
          {
            user_id: userId,
            name: name.trim(),
            personality,
            greeting: greeting?.trim() || null,
          },
          { onConflict: 'user_id' },
        )
        .select()
        .single()

      if (error) throw error
      setBuddy(data)
      return data
    },
    [userId],
  )

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      buddy,
      needsMfa,
      // Signed in through a password reset link, new password not saved yet.
      recoveryPending: Boolean(session) && recovery,
      // Treat the app as still loading until we know who the user is, how they
      // signed in, and whether they have a buddy, so routing never flashes the
      // wrong screen.
      loading: loadingSession || assurancePending || buddyPending,
      signUp,
      signIn,
      signOut,
      verifyMfa,
      refreshAssurance,
      refreshUser,
      createBuddy,
    }),
    [session, buddy, needsMfa, recovery, loadingSession, assurancePending, buddyPending, signUp, signIn, signOut, verifyMfa, refreshAssurance, refreshUser, createBuddy],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
