import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { IconMoon, IconSun } from '../components/app/AppIcons'
import { BuddyCard } from '../components/home/BuddyCard'
import { NextUp } from '../components/home/NextUp'
import { ProgressCard } from '../components/home/ProgressCard'
import { StreakCard } from '../components/home/StreakCard'
import { Recommendations } from '../components/home/Recommendations'
import { StudyPacks } from '../components/home/StudyPacks'
import { UploadStatus } from '../components/home/UploadStatus'
import '../components/home/home.css'
import { useAuth } from '../context/auth-context'
import { useUpload } from '../context/upload-context'
import {
  fetchInProgress,
  fetchStudySets,
  fetchStudyStats,
  fetchSubjectProgress,
} from '../lib/home'
import { fetchTodaysFocus } from '../lib/focus'
import { listMaterials, processMaterial } from '../lib/materials'
import { getDeleteSnapshot, hiddenMaterialIds, scheduleDelete, subscribeDeletes } from '../lib/pendingDelete'
import { friendlyError } from '../lib/errors'
import { fetchRecommendations, recordRecommendationEvent } from '../lib/recommendations'

/** Statuses the pipeline never moves on from. */
const TERMINAL_STATUS = new Set(['ready', 'failed'])

function greetingFor(date = new Date()) {
  const h = date.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

/**
 * Home: what to study next first, then the buddy, recommendations and packs.
 * Kept to what helps a student study; managing uploads lives on Study Packs,
 * and only uploads still processing (or failed) show here.
 */
export function Dashboard() {
  const { user, buddy } = useAuth()

  const [allMaterials, setMaterials] = useState([])
  const [subjects, setSubjects] = useState([])
  const [stats, setStats] = useState(null)
  const [allPacks, setPacks] = useState([])
  const [focus, setFocus] = useState(null)
  // Loaded on their own: a recommendation failure must not take Home down.
  const [recs, setRecs] = useState({ items: [], loading: true, error: false })
  const [allInProgress, setInProgress] = useState([])
  // Material waiting out its undo time (lib/pendingDelete) is hidden, along
  // with its pack and any session in it, as if already deleted.
  const deletes = useSyncExternalStore(subscribeDeletes, getDeleteSnapshot)
  const hidden = hiddenMaterialIds(deletes)
  const materials = hidden.size ? allMaterials.filter((m) => !hidden.has(m.id)) : allMaterials
  const packs = hidden.size ? allPacks.filter((p) => !hidden.has(p.materialId)) : allPacks
  const inProgress = hidden.size ? allInProgress.filter((s) => !hidden.has(s.materialId)) : allInProgress
  const hiddenPacks = new Set(allPacks.filter((p) => hidden.has(p.materialId)).map((p) => p.id))
  const visibleRecs = hiddenPacks.size ? recs.items.filter((r) => !hiddenPacks.has(r.pack?.id)) : recs.items
  const visibleFocus = focus?.pack?.materialId && hidden.has(focus.pack.materialId) ? null : focus
  const [retryingId, setRetryingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async (silent = false) => {
    if (!user) return
    if (!silent) setLoading(true)
    try {
      const [mats, progress, studyStats, studySets, resumable, next] =
        await Promise.all([
        listMaterials(user.id),
        fetchSubjectProgress(user.id),
        fetchStudyStats(user.id),
        fetchStudySets(user.id),
        fetchInProgress(user.id),
        fetchTodaysFocus(user.id),
      ])
      setMaterials(mats)
      setSubjects(progress)
      setStats(studyStats)
      setPacks(studySets)
      setInProgress(resumable)
      setFocus(next)
      setError(null)
    } catch (err) {
      setError(friendlyError(err, 'Could not load your home page.'))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  // Recommendations: the function reuses its last batch unless something
  // changed, so asking on every visit is cheap. A refresh keeps the cards on
  // screen; only a first load with nothing to show is an error.
  const loadRecs = useCallback(async () => {
    if (!user) return
    setRecs((r) => ({ ...r, loading: r.items.length === 0, error: false }))
    try {
      setRecs({ items: await fetchRecommendations(user.id), loading: false, error: false })
    } catch {
      setRecs((r) => ({ items: r.items, loading: false, error: r.items.length === 0 }))
    }
  }, [user])
  useEffect(() => {
    loadRecs()
  }, [loadRecs])

  function dismissRec(id) {
    setRecs((r) => ({ ...r, items: r.items.filter((item) => item.id !== id) }))
    recordRecommendationEvent(id, 'dismissed')
  }

  // A finished upload adds a material that is now processing; show it, and the
  // polling below takes over from there.
  const { uploads } = useUpload()
  useEffect(() => {
    if (uploads > 0) load(true)
  }, [uploads, load])

  // Processing runs server-side after upload, so poll while any material is
  // still moving through extract -> embed -> generate. Chained timeouts rather
  // than an interval, so a slow request can never stack up behind itself.
  const processing = materials.some((m) => !TERMINAL_STATUS.has(m.status))
  useEffect(() => {
    if (!processing) return
    const timer = setTimeout(() => load(true), 3000)
    return () => clearTimeout(timer)
  }, [materials, processing, load])

  // When processing finishes there is a new pack to recommend.
  const wasProcessing = useRef(false)
  useEffect(() => {
    if (wasProcessing.current && !processing) loadRecs()
    wasProcessing.current = processing
  }, [processing, loadRecs])

  /**
   * Runs a failed material through processing again. The function marks it as
   * processing before it answers, so the reload below picks that up and the
   * polling above follows it from there.
   */
  async function retry(material) {
    setRetryingId(material.id)
    try {
      await processMaterial(material.id)
    } catch (err) {
      setError(friendlyError(err, 'Could not restart processing. Try again in a moment.'))
    } finally {
      setRetryingId(null)
      load(true)
    }
  }

  // A failed upload can be removed here (hidden now, deleted after the undo
  // time); everything else is deleted from Study Packs.
  async function remove(material) {
    try {
      await scheduleDelete([material])
    } catch (err) {
      setError(friendlyError(err, 'Could not remove that upload.'))
    }
  }

  // Deleting (from Study Packs) or planning a session changes what is next.
  useEffect(() => {
    const reload = () => {
      load(true)
      loadRecs()
    }
    const reloadFocus = () => load(true)
    window.addEventListener('novi:materials-changed', reload)
    window.addEventListener('novi:schedule-changed', reloadFocus)
    return () => {
      window.removeEventListener('novi:materials-changed', reload)
      window.removeEventListener('novi:schedule-changed', reloadFocus)
    }
  }, [load, loadRecs])

  const firstName = user?.user_metadata?.display_name?.split(' ')[0]
  const focusSession = visibleFocus?.pack ? inProgress.find((s) => s.packId === visibleFocus.pack.id) : null

  return (
    <div className="hm">
      <header className="hm-greeting">
        <h1>
          {greetingFor()}{firstName ? `, ${firstName}` : ''}!
          {/* Sun by day, moon from 6pm, matching the greeting. */}
          {new Date().getHours() < 18
            ? <IconSun className="hm-greet-icon" width={26} height={26} />
            : <IconMoon className="hm-greet-icon" width={24} height={24} />}
        </h1>
        <p className="hm-sub">Ready to make progress today?</p>
      </header>

      {error && <div className="msg msg-error">{error}</div>}

      <NextUp focus={visibleFocus} session={focusSession} loading={loading} />

      <div className="hm-row">
        <BuddyCard buddyName={buddy?.name} personality={buddy?.personality} hasMaterial={materials.length > 0} loading={loading} />
        <StreakCard streakDays={stats?.streakDays ?? 0} loading={loading} />
        <ProgressCard subjects={subjects} loading={loading} />
      </div>

      <Recommendations
        items={visibleRecs}
        loading={recs.loading}
        error={recs.error}
        onRetry={loadRecs}
        onDismiss={dismissRec}
      />

      <UploadStatus materials={materials} retryingId={retryingId} onRetry={retry} onRemove={remove} />

      <StudyPacks packs={packs} loading={loading} />
    </div>
  )
}
