import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import { usePreferences } from '../context/preferences-context'
import { formatTime } from '../lib/calendar-dates'
import { supabase } from '../lib/supabase'
import { IconClose } from './app/AppIcons'
import { MascotRig } from './MascotRig'
import './session-reminder.css'

const LEAD_MS = 10 * 60 * 1000 // show this long before the start
const GRACE_MS = 5 * 60 * 1000 // and keep showing this long after it
const REFRESH_MS = 5 * 60 * 1000
const DISMISSED_KEY = 'novi.dismissedReminders'

function readDismissed() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(DISMISSED_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

/**
 * In-app reminder before a planned session, while Novi is open in a tab.
 *
 * This is the whole of Novi's notification delivery today: there is no email,
 * push, or background job, so nothing reaches a student whose tab is closed.
 * It needs no browser permission because it never leaves the page.
 */
export function SessionReminder() {
  const { user } = useAuth()
  const { prefs } = usePreferences()
  const enabled = Boolean(user) && prefs.notifySessionReminders

  const [upcoming, setUpcoming] = useState([])
  const [now, setNow] = useState(() => Date.now())
  const [dismissed, setDismissed] = useState(readDismissed)

  const load = useCallback(async () => {
    if (!enabled) return
    const from = new Date(Date.now() - GRACE_MS).toISOString()
    const to = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from('scheduled_sessions')
      .select('id, title, starts_at')
      .eq('user_id', user.id)
      .is('completed_at', null)
      .gte('starts_at', from)
      .lte('starts_at', to)
      .order('starts_at', { ascending: true })
      .limit(20)
    // A failed check just means no reminder this round; the next one retries.
    if (!error) setUpcoming(data ?? [])
  }, [enabled, user])

  useEffect(() => {
    if (!enabled) return
    load()
    const refresh = setInterval(load, REFRESH_MS)
    const tick = setInterval(() => setNow(Date.now()), 30_000)
    const onChange = () => load()
    const onVisible = () => document.visibilityState === 'visible' && load()
    window.addEventListener('novi:schedule-changed', onChange)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(refresh)
      clearInterval(tick)
      window.removeEventListener('novi:schedule-changed', onChange)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, load])

  if (!enabled) return null

  const due = upcoming.find((s) => {
    const start = Date.parse(s.starts_at)
    return !dismissed.has(s.id) && now >= start - LEAD_MS && now <= start + GRACE_MS
  })
  if (!due) return null

  const start = new Date(due.starts_at)
  const minutes = Math.round((start.getTime() - now) / 60000)
  const when = minutes > 1 ? `in ${minutes} minutes` : minutes >= -1 ? 'now' : `${-minutes} minutes ago`

  function dismiss() {
    const next = new Set(dismissed).add(due.id)
    setDismissed(next)
    try {
      sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]))
    } catch {
      /* ignore */
    }
  }

  return (
    <aside className="nv-reminder" role="status" aria-label="Session reminder">
      <MascotRig pose="waving-sm" size={44} className="nv-reminder-art" />
      <div className="nv-reminder-body">
        <p className="nv-reminder-kicker">Starting {when}</p>
        <p className="nv-reminder-title">{due.title}</p>
        <p className="nv-reminder-time">{formatTime(start)}</p>
        <Link to="/calendar" className="nv-reminder-link" onClick={dismiss}>Open calendar</Link>
      </div>
      <button type="button" className="nv-reminder-close" onClick={dismiss} aria-label="Dismiss reminder">
        <IconClose width={16} height={16} />
      </button>
    </aside>
  )
}
