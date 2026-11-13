import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarToolbar } from '../components/calendar/CalendarToolbar'
import { DayView } from '../components/calendar/DayView'
import { MonthView } from '../components/calendar/MonthView'
import { SessionDetails } from '../components/calendar/SessionDetails'
import { SessionForm } from '../components/calendar/SessionForm'
import { StudyGoals } from '../components/calendar/StudyGoals'
import { UpcomingList, UpcomingSessions } from '../components/calendar/UpcomingSessions'
import { WeekView } from '../components/calendar/WeekView'
import '../components/calendar/calendar.css'
import { IconPlus } from '../components/home/HomeIcons'
import '../components/home/home.css'
import { Modal } from '../components/Modal'
import { IconClose } from '../components/app/AppIcons'
import '../components/study/packs-page.css'
import { useAuth } from '../context/auth-context'
import { usePreferences } from '../context/preferences-context'
import { addDays, shiftDate, startOfDay, startOfWeek } from '../lib/calendar-dates'
import { goalJustReached } from '../lib/progress-metrics'
import {
  createScheduledSession,
  deleteScheduledSession,
  fetchPackOptions,
  fetchScheduledSessions,
  fetchWeeklyGoal,
  saveWeeklyGoal,
  setSessionCompleted,
  updateScheduledSession,
} from '../lib/schedule'
import { friendlyError } from '../lib/errors'

const byStart = (a, b) => a.start - b.start

/**
 * The Calendar: plan study sessions, see what is coming up, and track the
 * weekly goal.
 *
 * `sessions` is the one copy of the student's planned sessions. The grid, the
 * upcoming list, the goal and the pop-ups all derive from it, and every save
 * updates it from the row the database returns, so nothing can drift apart.
 */
export function Calendar() {
  const { user } = useAuth()
  // Subscribing re-renders the grid when the week start or defaults change.
  const { prefs } = usePreferences()

  const [view, setView] = useState('month')
  const [now, setNow] = useState(() => new Date())
  const [selected, setSelected] = useState(() => startOfDay(new Date()))
  const [filter, setFilter] = useState('all')

  const [sessions, setSessions] = useState([])
  const [packs, setPacks] = useState([])
  const [goal, setGoal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // { open, kind: 'form' | 'details' | 'all', sessionId?, snapshot?, prefill? }
  // Kept until the exit animation finishes, so the content never blanks mid-close.
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  // The real clock, so "today" and "upcoming" stay right if the page is left
  // open across midnight or past a session's start.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const [rows, packList, weekly] = await Promise.all([
        fetchScheduledSessions(user.id),
        fetchPackOptions(user.id),
        fetchWeeklyGoal(user.id),
      ])
      setSessions(rows)
      setPacks(packList)
      setGoal(weekly)
      setError(null)
    } catch (err) {
      setError(friendlyError(err, 'Could not load your calendar.'))
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const notify = useCallback((text, tone = 'success') => {
    clearTimeout(toastTimer.current)
    setToast({ text, tone, id: Date.now() })
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  // If the filtered pack is deleted elsewhere, fall back to everything.
  const activeFilter = filter !== 'all' && !packs.some((p) => p.id === filter) ? 'all' : filter
  const visible = useMemo(
    () => (activeFilter === 'all' ? sessions : sessions.filter((s) => s.packId === activeFilter)),
    [sessions, activeFilter],
  )

  const upcoming = useMemo(
    () => visible.filter((s) => !s.completedAt && s.end > now).sort(byStart),
    [visible, now],
  )

  // The goal counts every pack: filtering the view should not change progress.
  const weekStart = startOfWeek(now)
  const weekEnd = addDays(weekStart, 7)
  const completedThisWeek = sessions.filter(
    (s) => s.completedAt && s.start >= weekStart && s.start < weekEnd,
  ).length

  // ── Pop-ups ───────────────────────────────────────────────────
  const openNew = (prefill = {}) =>
    setModal({ open: true, kind: 'form', prefill: { date: selected, ...prefill } })
  const openDetails = (session) =>
    setModal({ open: true, kind: 'details', sessionId: session.id, snapshot: session })
  const openEdit = (session) =>
    setModal({ open: true, kind: 'form', sessionId: session.id, snapshot: session })
  const closeModal = () => setModal((m) => (m ? { ...m, open: false } : m))

  const current =
    modal?.sessionId
      ? (sessions.find((s) => s.id === modal.sessionId) ?? modal.snapshot)
      : null

  // ── Mutations ─────────────────────────────────────────────────
  async function handleSave(input) {
    setSaving(true)
    try {
      const editing = modal?.sessionId
      const saved = editing
        ? await updateScheduledSession(editing, input)
        : await createScheduledSession(user.id, input)
      setSessions((all) =>
        (editing ? all.map((s) => (s.id === saved.id ? saved : s)) : [...all, saved]).sort(byStart),
      )
      if (editing) {
        // Back to the details, now showing the change.
        setModal({ open: true, kind: 'details', sessionId: saved.id, snapshot: saved })
        notify('Session updated')
      } else {
        closeModal()
        // Bring the new session into view.
        setSelected(startOfDay(saved.start))
        notify('Session scheduled')
      }
      return true
    } catch (err) {
      notify('Could not save the session', 'error')
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleComplete(session) {
    setSaving(true)
    try {
      const saved = await setSessionCompleted(session.id, !session.completedAt)
      const next = sessions.map((s) => (s.id === saved.id ? saved : s))
      setSessions(next)
      notify(
        saved.completedAt && prefs.notifyWeeklyGoal && goalJustReached(next, saved, goal, new Date())
          ? `Weekly goal reached: ${goal} sessions this week!`
          : saved.completedAt ? 'Marked as completed' : 'Marked as not done',
      )
    } catch {
      notify('Could not update the session', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(session) {
    setSaving(true)
    try {
      await deleteScheduledSession(session.id)
      closeModal()
      setSessions((all) => all.filter((s) => s.id !== session.id))
      notify('Session deleted')
    } catch {
      notify('Could not delete the session', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleGoalSave(next) {
    const saved = await saveWeeklyGoal(user.id, next)
    setGoal(saved)
    notify('Weekly goal updated')
  }

  // ── Calendar navigation ───────────────────────────────────────
  const selectDate = (date) => setSelected(startOfDay(date))
  const showDay = (date) => {
    setSelected(startOfDay(date))
    setView('day')
  }

  const viewProps = {
    date: selected,
    selected,
    now,
    sessions: visible,
    loading,
    onSelectDate: selectDate,
    onOpenSession: openDetails,
    onCreateAt: (date, startTime) => openNew({ date: startOfDay(date), startTime }),
  }

  return (
    <div className="pk cal">
      <header className="pk-head">
        <div>
          <h1 className="pk-title">Calendar</h1>
          <p className="hm-sub">Plan your study sessions and stay on track.</p>
        </div>
        <button type="button" className="pk-create" onClick={() => openNew()}>
          <IconPlus width={18} height={18} />
          Schedule Session
        </button>
      </header>

      <CalendarToolbar
        view={view}
        date={selected}
        now={now}
        packs={packs}
        filter={activeFilter}
        onViewChange={setView}
        onPrev={() => setSelected((d) => shiftDate(view, d, -1))}
        onNext={() => setSelected((d) => shiftDate(view, d, 1))}
        onToday={() => setSelected(startOfDay(new Date()))}
        onFilterChange={setFilter}
      />

      {error && (
        <div className="msg msg-error cal-error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-secondary" onClick={load}>Try again</button>
        </div>
      )}

      <div className="cal-layout">
        <section className="hm-card cal-board" aria-label="Calendar">
          {view === 'month' && <MonthView {...viewProps} onShowDay={showDay} />}
          {view === 'week' && <WeekView {...viewProps} />}
          {view === 'day' && <DayView {...viewProps} />}
        </section>

        <aside className="cal-side" aria-label="Upcoming sessions and goals">
          <UpcomingSessions
            sessions={upcoming}
            now={now}
            loading={loading}
            onOpen={openDetails}
            onViewAll={() => setModal({ open: true, kind: 'all' })}
            onSchedule={() => openNew()}
          />
          <StudyGoals
            completed={completedThisWeek}
            goal={goal}
            loading={loading}
            onSave={handleGoalSave}
          />
        </aside>
      </div>

      <Modal
        open={Boolean(modal?.open)}
        onRequestClose={closeModal}
        onClosed={() => setModal(null)}
        locked={saving}
        labelledBy="cal-modal-title"
      >
        {modal?.kind === 'form' && (
          <SessionForm
            key={modal.sessionId ?? 'new'}
            session={current}
            prefill={modal.prefill}
            packs={packs}
            now={now}
            saving={saving}
            onCancel={() =>
              current ? setModal({ ...modal, kind: 'details' }) : closeModal()
            }
            onSave={handleSave}
          />
        )}
        {modal?.kind === 'details' && current && (
          <SessionDetails
            session={current}
            now={now}
            saving={saving}
            onClose={closeModal}
            onEdit={() => openEdit(current)}
            onToggleComplete={() => handleToggleComplete(current)}
            onDelete={() => handleDelete(current)}
          />
        )}
        {modal?.kind === 'all' && (
          <div className="nv-modal-panel">
            <header className="nv-modal-head">
              <div>
                <h2 id="cal-modal-title" className="nv-modal-title">Upcoming sessions</h2>
                <p className="hint">
                  {upcoming.length === 0
                    ? 'Nothing planned yet.'
                    : `${upcoming.length} planned, soonest first.`}
                </p>
              </div>
              <button type="button" className="nv-modal-close" onClick={closeModal} aria-label="Close">
                <IconClose />
              </button>
            </header>
            <UpcomingList sessions={upcoming} now={now} onOpen={openDetails} />
          </div>
        )}
      </Modal>

      {toast && (
        <div key={toast.id} className={`nv-toast${toast.tone === 'error' ? ' is-error' : ''}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  )
}
