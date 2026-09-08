import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [buddy, setBuddy] = useState(null)
  const [loadingSession, setLoadingSession] = useState(true)
  // Which user the buddy in state belongs to. Tracked as an id rather than a
  // boolean because the effect that would flip a `loadingBuddy` flag only runs
  // *after* the render in which the session first appears — during that one
  // render buddy is still null, and a boolean flag would already read false,
  // long enough for ProtectedRoute to bounce a student who has a buddy to
  // /buddy/new. Comparing against userId closes that window.
  const [buddyLoadedFor, setBuddyLoadedFor] = useState(null)

  const userId = session?.user?.id ?? null
  const buddyPending = Boolean(userId) && buddyLoadedFor !== userId

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

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoadingSession(false)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // Load the student's buddy whenever the signed-in user changes.
  useEffect(() => {
    if (!userId) {
      setBuddy(null)
      setBuddyLoadedFor(null)
      return
    }

    let active = true

    supabase
      .from('buddies')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error) console.error('Could not load buddy:', error.message)
        setBuddy(data ?? null)
        setBuddyLoadedFor(userId)
      })

    return () => {
      active = false
    }
  }, [userId])

  const signUp = useCallback(async ({ email, password, displayName }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName?.trim() || null } },
    })
    if (error) throw error
    // With email confirmation on, Supabase returns a user but no session.
    return { needsEmailConfirmation: !data.session, user: data.user }
  }, [])

  const signIn = useCallback(async ({ email, password }) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setBuddy(null)
  }, [])

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
      // Treat the app as still loading until we know both who the user is
      // and whether they have a buddy, so routing never flashes the wrong screen.
      loading: loadingSession || buddyPending,
      signUp,
      signIn,
      signOut,
      createBuddy,
    }),
    [session, buddy, loadingSession, buddyPending, signUp, signIn, signOut, createBuddy],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
