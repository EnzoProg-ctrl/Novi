import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { setWeekStart } from '../lib/calendar-dates'
import { supabase } from '../lib/supabase'
import { useAuth } from './auth-context'
import { DEFAULT_PREFERENCES, PreferencesContext } from './preferences-context'

// Preference key -> profiles column.
const COLUMNS = {
  defaultSessionMinutes: 'default_session_minutes',
  defaultBreakMinutes: 'default_break_minutes',
  weekStartsOn: 'week_starts_on',
  practiceSessionSize: 'practice_session_size',
  chatQuizSize: 'chat_quiz_size',
  replyLength: 'reply_length',
  questionTypes: 'question_types',
  educationLevel: 'education_level',
  school: 'school',
  course: 'course',
  notifySessionReminders: 'notify_session_reminders',
  notifyWeeklyGoal: 'notify_weekly_goal',
  theme: 'theme',
  accent: 'accent_color',
  fontScale: 'font_scale',
}
const SELECT = Object.values(COLUMNS).join(', ')

/**
 * A copy is kept in localStorage only so the right theme and week start apply
 * on the very first paint (see the script in index.html). The database is the
 * record; this cache is never treated as proof that anything was saved.
 */
const CACHE_KEY = 'novi.preferences'

function readCache(userId) {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')
    return cached && (!userId || cached.userId === userId) ? { ...DEFAULT_PREFERENCES, ...cached.prefs } : null
  } catch {
    return null
  }
}

function writeCache(userId, prefs) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ userId, prefs }))
  } catch {
    /* private mode or blocked storage: fine, the database still has it */
  }
}

function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* ignore */
  }
}

const fromRow = (row) =>
  Object.fromEntries(
    Object.entries(COLUMNS).map(([key, col]) => [key, row?.[col] ?? DEFAULT_PREFERENCES[key]]),
  )

const toRow = (patch) =>
  Object.fromEntries(Object.entries(patch).map(([key, value]) => [COLUMNS[key], value]))

const prefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches

/** Appearance lives on <html>, outside React's tree; signed-out pages get the defaults. */
function applyAppearance(prefs) {
  const root = document.documentElement
  const set = (name, value) => (value ? root.setAttribute(name, value) : root.removeAttribute(name))
  if (!prefs) {
    set('data-theme', null)
    set('data-accent', null)
    set('data-font', null)
    return
  }
  const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && prefersDark())
  set('data-theme', dark ? 'dark' : null)
  set('data-accent', prefs.accent !== 'coral' ? prefs.accent : null)
  set('data-font', prefs.fontScale !== 'medium' ? prefs.fontScale : null)
}

export function PreferencesProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [prefs, setPrefs] = useState(() => readCache() ?? DEFAULT_PREFERENCES)
  const [status, setStatus] = useState(userId ? 'loading' : 'idle')
  const [loadedFor, setLoadedFor] = useState(null)
  const prefsRef = useRef(prefs)
  useEffect(() => {
    prefsRef.current = prefs
  })

  // Weekly views read this through startOfWeek. Assigning it during render is
  // idempotent and means children rendered in this pass already use it.
  setWeekStart(prefs.weekStartsOn)

  const load = useCallback(async () => {
    if (!userId) return
    setStatus('loading')
    const { data, error } = await supabase.from('profiles').select(SELECT).eq('id', userId).maybeSingle()
    if (error) {
      setStatus('error')
      return
    }
    const next = fromRow(data)
    setPrefs(next)
    writeCache(userId, next)
    setLoadedFor(userId)
    setStatus('ready')
  }, [userId])

  useEffect(() => {
    if (userId) {
      const cached = readCache(userId)
      if (cached) setPrefs(cached)
      load()
    } else {
      setPrefs(DEFAULT_PREFERENCES)
      setStatus('idle')
      setLoadedFor(null)
      clearCache()
    }
  }, [userId, load])

  // Apply appearance, and follow the OS while the theme is "system".
  useEffect(() => {
    const active = userId ? prefs : null
    applyAppearance(active)
    if (!active || active.theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyAppearance(active)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [userId, prefs])

  /**
   * Optimistic: the change shows at once, and only the keys in `patch` roll
   * back if the save fails (so a failed save never undoes a different one).
   */
  const updatePreferences = useCallback(
    async (patch) => {
      if (!userId) throw new Error('You need to be signed in.')
      const before = Object.fromEntries(Object.keys(patch).map((k) => [k, prefsRef.current[k]]))
      setPrefs((current) => ({ ...current, ...patch }))
      const { data, error } = await supabase
        .from('profiles')
        .update(toRow(patch))
        .eq('id', userId)
        .select(SELECT)
        .single()
      if (error) {
        setPrefs((current) => ({ ...current, ...before }))
        throw error
      }
      const saved = fromRow(data)
      setPrefs(saved)
      writeCache(userId, saved)
      return saved
    },
    [userId],
  )

  const value = useMemo(
    () => ({
      prefs,
      status: userId && loadedFor !== userId && status !== 'error' ? 'loading' : status,
      reload: load,
      updatePreferences,
    }),
    [prefs, status, userId, loadedFor, load, updatePreferences],
  )

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}
