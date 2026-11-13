import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SessionDetails } from '../components/calendar/SessionDetails'
import { SessionForm } from '../components/calendar/SessionForm'
import '../components/calendar/calendar.css'
import '../components/home/home.css'
import { Modal } from '../components/Modal'
import { PackProgress } from '../components/progress/PackProgress'
import { ProgressHeader, RangeForm } from '../components/progress/ProgressHeader'
import { GoalForm, WeeklyGoalCard } from '../components/progress/WeeklyGoalCard'
import { RecentSessions, RecentTable } from '../components/progress/RecentSessions'
import { StatCards } from '../components/progress/StatCards'
import { StudyTimeChart } from '../components/progress/StudyTimeChart'
import { SubjectBreakdown } from '../components/progress/SubjectBreakdown'
import '../components/progress/progress.css'
import '../components/study/packs-page.css'
import { IconClose } from '../components/app/AppIcons'
import { useAuth } from '../context/auth-context'
import { usePreferences } from '../context/preferences-context'
import { addDays, startOfDay } from '../lib/calendar-dates'
import { fetchActiveDays, fetchActivity, fetchPackCompletion, fetchSittings } from '../lib/progress'
import {
  bucketActivity,
  chartBuckets,
  compareStudyTime,
  completedIn,
  goalFor,
  goalJustReached,
  inRange,
  packProgress,
  packsStudied,
  resolveRange,
  streaks,
  subjectBreakdown,
  sumSeconds,
} from '../lib/progress-metrics'
import {
  deleteScheduledSession,
  fetchScheduledSessions,
  fetchWeeklyGoal,
  saveWeeklyGoal,
  setSessionCompleted,
  updateScheduledSession,
} from '../lib/schedule'
import { friendlyError } from '../lib/errors'

/**
 * One independently loaded piece of data. Each card depends on only the
 * sources it needs, so one failed request leaves the rest of the page working.
 * Responses that arrive after a newer request started are ignored.
 */
function useResource(load, key) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const latest = useRef(0)
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })

  const run = useCallback(async () => {
    const id = ++latest.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await loadRef.current()
      if (id === latest.current) setState({ data, error: null, loading: false })
    } catch (err) {
      if (id === latest.current) {
        setState((s) => ({ data: s.data, error: friendlyError(err, 'Something went wrong.'), loading: false }))
      }
    }
  }, [])

  useEffect(() => {
    run()
  }, [run, key])

  const setData = useCallback((update) => {
    setState((s) => ({ ...s, data: typeof update === 'function' ? update(s.data) : update }))
  }, [])

  return { ...state, reload: run, setData }
}

const byStart = (a, b) => a.start - b.start

export function Progress() {
  const { user } = useAuth()
  const { prefs } = usePreferences()

  const [preset, setPreset] = useState('this-week')
  const [custom, setCustom] = useState(null)
  const [now, setNow] = useState(() => new Date())
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  // Real clock, so "this week" and the streak roll over if the page stays open.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const todayKey = startOfDay(now).getTime()
  const range = useMemo(
    () => resolveRange(preset, new Date(todayKey), custom),
    // weekStartsOn is read inside resolveRange (via startOfWeek).
    [preset, custom, todayKey, prefs.weekStartsOn], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const week = useMemo(
    () => resolveRange('this-week', new Date(todayKey)),
    [todayKey, prefs.weekStartsOn], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const rangeKey = `${range.previous.start.getTime()}-${range.end.getTime()}`

  // One request covers the period and the one before it, for comparisons.
  const activity = useResource(() => fetchActivity(range.previous.start, range.end), rangeKey)
  const sittings = useResource(() => fetchSittings(user.id, range.start, range.end), rangeKey)
  const activeDays = useResource(() => fetchActiveDays(addDays(new Date(todayKey), -400)), todayKey)
  const packs = useResource(fetchPackCompletion, user?.id)
  const planned = useResource(() => fetchScheduledSessions(user.id), user?.id)
  const goal = useResource(() => fetchWeeklyGoal(user.id), user?.id)

  const notify = useCallback((text, tone = 'success') => {
    clearTimeout(toastTimer.current)
    setToast({ text, tone, id: Date.now() })
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  // ── Derived metrics ───────────────────────────────────────────
  const rows = activity.data ?? []
  const current = rows.filter((r) => inRange(r.day, range))
  const previous = rows.filter((r) => inRange(r.day, range.previous))
  const totalSeconds = sumSeconds(current)
  const comparison = activity.data ? compareStudyTime(totalSeconds, sumSeconds(previous)) : null

  const plannedList = planned.data ?? []
  const completedInRange = completedIn(plannedList, range)
  const target = goalFor(goal.data, range)
  const streak = streaks(activeDays.data ?? [], now)
  const studied = packsStudied(current, completedInRange)

  const { unit, buckets } = chartBuckets(range)
  const series = bucketActivity(current, buckets)

  const packMeta = (packs.data ?? []).map((p) => ({ id: p.study_set_id, title: p.title, subject: p.subject }))
  const breakdown = subjectBreakdown(current, packMeta)
  const hasSubjects = packMeta.some((p) => p.subject)
  const packRows = packProgress(packs.data ?? [])
  const weekCompleted = completedIn(plannedList, week).length

  // Recent sessions: practice sittings and planned sessions in the period.
  const secondsBySitting = new Map()
  for (const r of rows) {
    if (r.session_id) secondsBySitting.set(r.session_id, (secondsBySitting.get(r.session_id) ?? 0) + Number(r.seconds || 0))
  }
  const recent = [
    ...(sittings.data ?? []).map((s) => ({
      key: `practice-${s.id}`,
      kind: 'practice',
      date: new Date(s.started_at),
      title: 'Practice quiz',
      detail: `${s.questions_answered} answered`,
      packId: s.study_sets?.id ?? null,
      packTitle: s.study_sets?.title ?? null,
      seconds: secondsBySitting.get(s.id) ?? 0,
      status: s.ended_at ? 'completed' : 'in-progress',
    })),
    ...plannedList
      .filter((s) => s.start >= range.start && s.start < range.end)
      .map((s) => ({
        key: `planned-${s.id}`,
        kind: 'planned',
        date: s.start,
        title: s.title,
        detail: 'Planned session',
        packId: s.packId,
        packTitle: s.packTitle,
        seconds: (s.end - s.start) / 1000,
        status: s.completedAt ? 'completed' : s.end <= now ? 'not-marked' : 'planned',
        session: s,
      })),
  ].sort((a, b) => b.date - a.date)

  // ── Planned-session pop-ups ───────────────────────────────────
  const closeModal = () => setModal((m) => (m ? { ...m, open: false } : m))
  const currentSession = modal?.sessionId
    ? (plannedList.find((s) => s.id === modal.sessionId) ?? modal.snapshot)
    : null
  const openSession = (session) =>
    setModal({ open: true, kind: 'details', sessionId: session.id, snapshot: session })

  const replaceSession = (saved) =>
    planned.setData((all) => (all ?? []).map((s) => (s.id === saved.id ? saved : s)).sort(byStart))

  async function handleToggle(session) {
    setSaving(true)
    try {
      const saved = await setSessionCompleted(session.id, !session.completedAt)
      replaceSession(saved)
      activeDays.reload() // completing a session can extend the streak
      const next = plannedList.map((s) => (s.id === saved.id ? saved : s))
      notify(
        saved.completedAt && prefs.notifyWeeklyGoal && goalJustReached(next, saved, goal.data, new Date())
          ? `Weekly goal reached: ${goal.data} sessions this week!`
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
      planned.setData((all) => (all ?? []).filter((s) => s.id !== session.id))
      activeDays.reload()
      notify('Session deleted')
    } catch {
      notify('Could not delete the session', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleEditSave(input) {
    setSaving(true)
    try {
      const saved = await updateScheduledSession(modal.sessionId, input)
      replaceSession(saved)
      setModal({ open: true, kind: 'details', sessionId: saved.id, snapshot: saved })
      notify('Session updated')
    } catch (err) {
      notify('Could not save the session', 'error')
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function handleGoalSave(next) {
    setSaving(true)
    try {
      const saved = await saveWeeklyGoal(user.id, next)
      goal.setData(saved)
      closeModal()
      notify('Weekly goal updated')
    } catch (err) {
      notify('Could not save your goal', 'error')
      throw err
    } finally {
      setSaving(false)
    }
  }

  function applyRange(from, to) {
    setCustom({ from, to })
    setPreset('custom')
    closeModal()
  }

  const packOptions = packMeta.map((p) => ({ id: p.id, title: p.title }))

  return (
    <div className="pk pg">
      <ProgressHeader
        preset={preset}
        range={range}
        onPresetChange={(value) =>
          value === 'custom' ? setModal({ open: true, kind: 'range' }) : setPreset(value)
        }
        onOpenRange={() => setModal({ open: true, kind: 'range' })}
      />

      <StatCards
        range={range}
        streak={streak}
        streakState={activeDays}
        totalSeconds={totalSeconds}
        comparison={comparison}
        activityState={activity}
        completed={completedInRange.length}
        target={target}
        plannedState={planned}
        goalState={goal}
        packsStudied={studied.size}
      />

      <div className="pg-layout">
        <div className="pg-main">
          <StudyTimeChart
            series={series}
            unit={unit}
            totalSeconds={totalSeconds}
            state={activity}
          />
          <RecentSessions
            rows={recent}
            loading={sittings.loading || planned.loading}
            error={sittings.error || planned.error}
            onRetry={() => {
              if (sittings.error) sittings.reload()
              if (planned.error) planned.reload()
            }}
            onOpenSession={openSession}
            onViewAll={() => setModal({ open: true, kind: 'all' })}
          />
        </div>

        <aside className="pg-side" aria-label="Goals and breakdowns">
          <WeeklyGoalCard
            completed={weekCompleted}
            goal={goal.data}
            loading={goal.loading || planned.loading}
            error={goal.error || planned.error}
            onRetry={() => {
              if (goal.error) goal.reload()
              if (planned.error) planned.reload()
            }}
            onEdit={() => setModal({ open: true, kind: 'goal' })}
          />
          <SubjectBreakdown
            slices={breakdown}
            totalSeconds={totalSeconds}
            groupedByPack={!hasSubjects}
            state={activity.loading || packs.loading ? { loading: true } : { error: activity.error || packs.error }}
            onRetry={() => {
              if (activity.error) activity.reload()
              if (packs.error) packs.reload()
            }}
          />
          <PackProgress rows={packRows} state={packs} />
        </aside>
      </div>

      <Modal
        open={Boolean(modal?.open)}
        onRequestClose={closeModal}
        onClosed={() => setModal(null)}
        locked={saving}
        labelledBy="pg-modal-title"
        className={modal?.kind === 'all' ? 'pg-modal-wide' : ''}
      >
        {modal?.kind === 'range' && (
          <RangeForm range={range} onCancel={closeModal} onApply={applyRange} />
        )}
        {modal?.kind === 'goal' && (
          <GoalForm goal={goal.data} saving={saving} onCancel={closeModal} onSave={handleGoalSave} />
        )}
        {modal?.kind === 'details' && currentSession && (
          <SessionDetails
            session={currentSession}
            now={now}
            saving={saving}
            onClose={closeModal}
            onEdit={() => setModal({ ...modal, kind: 'form' })}
            onToggleComplete={() => handleToggle(currentSession)}
            onDelete={() => handleDelete(currentSession)}
          />
        )}
        {modal?.kind === 'form' && currentSession && (
          <SessionForm
            key={currentSession.id}
            session={currentSession}
            packs={packOptions}
            now={now}
            saving={saving}
            onCancel={() => setModal({ ...modal, kind: 'details' })}
            onSave={handleEditSave}
          />
        )}
        {modal?.kind === 'all' && (
          <div className="nv-modal-panel">
            <header className="nv-modal-head">
              <div>
                <h2 id="pg-modal-title" className="nv-modal-title">All sessions</h2>
                <p className="hint">{recent.length} in this period, newest first.</p>
              </div>
              <button type="button" className="nv-modal-close" onClick={closeModal} aria-label="Close">
                <IconClose />
              </button>
            </header>
            <RecentTable rows={recent} onOpenSession={openSession} />
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
