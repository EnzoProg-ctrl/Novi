import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { MascotRig } from '../components/MascotRig'
import { BuddyCard } from '../components/home/BuddyCard'
import { GoalRing } from '../components/home/GoalRing'
import { ProgressCard } from '../components/home/ProgressCard'
import { QuoteCard, ScheduleCard, StatCards } from '../components/home/RailCards'
import { ContinueSection } from '../components/home/ContinueSection'
import { Recommendations } from '../components/home/Recommendations'
import { StudyPacks } from '../components/home/StudyPacks'
import '../components/home/home.css'
import { useAuth } from '../context/auth-context'
import { useUpload } from '../context/upload-context'
import { LoadingRegion, Sk, SkCircle, SkText } from '../components/Skeleton'
import {
  fetchInProgress,
  fetchStudySets,
  fetchStudyStats,
  fetchSubjectProgress,
  fetchTodayActivity,
} from '../lib/home'
import { formatBytes, listMaterials, processMaterial } from '../lib/materials'
import { getDeleteSnapshot, hiddenMaterialIds, scheduleDelete, subscribeDeletes } from '../lib/pendingDelete'
import { friendlyError } from '../lib/errors'
import { fetchRecommendations, recordRecommendationEvent } from '../lib/recommendations'

const STATUS_LABEL = {
  uploaded: { text: 'Waiting to process', tone: 'badge' },
  extracting: { text: 'Reading it', tone: 'badge badge-warn' },
  embedding: { text: 'Indexing', tone: 'badge badge-warn' },
  generating: { text: 'Writing your reviewer', tone: 'badge badge-warn' },
  ready: { text: 'Ready', tone: 'badge badge-ok' },
  failed: { text: 'Failed', tone: 'badge' },
}

/** Statuses the pipeline never moves on from. */
const TERMINAL_STATUS = new Set(['ready', 'failed'])

const TYPE_LABEL = {
  pdf: 'PDF', pptx: 'Slides', docx: 'Document', image: 'Image', text: 'Notes', link: 'Link',
}

function greetingFor(date = new Date()) {
  const h = date.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function Dashboard() {
  const { user, buddy } = useAuth()

  const [allMaterials, setMaterials] = useState([])
  const [activity, setActivity] = useState(null)
  const [subjects, setSubjects] = useState([])
  const [stats, setStats] = useState(null)
  const [allPacks, setPacks] = useState([])
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
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [confirming, setConfirming] = useState(false)
  // The selection circles only show after "Select", so the list stays calm
  // until the student actually wants to remove something.
  const [selectMode, setSelecting] = useState(false)
  const selectButtonRef = useRef(null)
  const listRef = useRef(null)
  const focusAfter = useRef(null) // 'list' | 'select' once the mode changes
  const [deleting, setDeleting] = useState(false)
  const [retryingId, setRetryingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async (silent = false) => {
    if (!user) return
    if (!silent) setLoading(true)
    try {
      const [mats, today, progress, studyStats, studySets, resumable] =
        await Promise.all([
        listMaterials(user.id),
        fetchTodayActivity(user.id),
        fetchSubjectProgress(user.id),
        fetchStudyStats(user.id),
        fetchStudySets(user.id),
        fetchInProgress(user.id),
      ])
      setMaterials(mats)
      setActivity(today)
      setSubjects(progress)
      setStats(studyStats)
      setPacks(studySets)
      setInProgress(resumable)
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
      setRecs({ items: await fetchRecommendations(), loading: false, error: false })
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
  const { uploads, openUpload } = useUpload()
  useEffect(() => {
    if (uploads > 0) load(true)
  }, [uploads, load])

  // Processing runs server-side after upload, so poll while any material is
  // still moving through extract -> embed -> generate. Chained timeouts rather
  // than an interval, so a slow request can never stack up behind itself.
  useEffect(() => {
    const busy = materials.some((m) => !TERMINAL_STATUS.has(m.status))
    if (!busy) return
    const timer = setTimeout(() => load(true), 3000)
    return () => clearTimeout(timer)
  }, [materials, load])

  // When processing finishes there is a new pack to recommend.
  const processing = materials.some((m) => !TERMINAL_STATUS.has(m.status))
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

  const selected = materials.filter((m) => selectedIds.has(m.id))
  const selecting = selectMode && materials.length > 0

  const toggle = (id) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const clearSelection = () => {
    setSelectedIds(new Set())
    setConfirming(false)
  }

  function startSelecting() {
    // Straight to the first circle, so the keyboard can carry on from here.
    focusAfter.current = 'list'
    setSelecting(true)
  }

  function stopSelecting(refocus = true) {
    // Back to "Select", since the circle that had focus is about to go.
    focusAfter.current = refocus ? 'select' : null
    clearSelection()
    setSelecting(false)
  }

  useLayoutEffect(() => {
    const target = focusAfter.current
    focusAfter.current = null
    if (target === 'list') listRef.current?.querySelector('.hm-check input')?.focus()
    else if (target === 'select') selectButtonRef.current?.focus()
  }, [selectMode])

  const allSelected = materials.length > 0 && selected.length === materials.length
  const toggleAll = () => {
    setConfirming(false)
    setSelectedIds(allSelected ? new Set() : new Set(materials.map((m) => m.id)))
  }


  // Hidden at once, deleted after the undo time (the toast offers Undo).
  async function handleDelete() {
    setDeleting(true)
    try {
      await scheduleDelete(selected)
      stopSelecting(false)
    } catch (err) {
      setError(friendlyError(err, 'Could not delete those materials.'))
    } finally {
      setDeleting(false)
    }
  }

  // Once a deletion has gone through (or failed), packs and sessions change
  // on the server too, so reload everything.
  useEffect(() => {
    const reload = () => {
      load(true)
      loadRecs()
    }
    window.addEventListener('novi:materials-changed', reload)
    return () => window.removeEventListener('novi:materials-changed', reload)
  }, [load, loadRecs])

  const firstName = user?.user_metadata?.display_name?.split(' ')[0]

  return (
    <div className="hm">
      <div className="hm-main">
        <header className="hm-greeting">
          <h1>
            {greetingFor()}{firstName ? `, ${firstName}` : ''}! <span aria-hidden="true">☀️</span>
          </h1>
          <p className="hm-sub">Ready to make progress today?</p>
        </header>

        {error && <div className="msg msg-error">{error}</div>}

        <div className="hm-row">
          <BuddyCard buddyName={buddy?.name} hasMaterial={materials.length > 0} loading={loading} />
          <GoalRing done={activity?.sessions_count ?? 0} loading={loading} />
          <ProgressCard subjects={subjects} loading={loading} />
        </div>

        <StudyPacks packs={packs} loading={loading} />

        <Recommendations
          items={visibleRecs}
          loading={recs.loading}
          error={recs.error}
          onRetry={loadRecs}
          onDismiss={dismissRec}
        />

        <ContinueSection items={inProgress} loading={loading} />

        {/* Uploads stay listed while pack generation does not exist - without
            this there is no way to see what you have added. */}
        <section
          className="hm-section"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && selecting && !deleting) {
              event.preventDefault()
              stopSelecting()
            }
          }}
        >
          <header className="hm-card-head">
            <h2 className="hm-section-title">Your material</h2>
            {!selecting && (
              <span className="hm-head-actions">
                {materials.length > 0 && !loading && (
                  <button ref={selectButtonRef} type="button" className="hm-muted-link hm-select-btn" onClick={startSelecting}>
                    Select
                  </button>
                )}
                <button type="button" className="hm-muted-link" onClick={openUpload}>Add another</button>
              </span>
            )}
          </header>

          {selecting && (
            <div className="hm-selectbar" role="region" aria-label="Select materials">
              <span className="hm-selectbar-count" role="status">
                {selected.length === 0 ? 'Select materials to delete' : `${selected.length} selected`}
              </span>

              {!confirming && (
                <button type="button" className="hm-selectbar-link" onClick={toggleAll}>
                  {allSelected ? 'Clear all' : 'Select all'}
                </button>
              )}

              {confirming ? (
                <>
                  <span className="hm-selectbar-warn">
                    Delete {selected.length === 1 ? 'this material' : 'these materials'} and
                    {selected.length === 1 ? ' its' : ' their'} study {selected.length === 1 ? 'pack' : 'packs'}? You&rsquo;ll have 5 seconds to undo.
                  </span>
                  <button
                    type="button"
                    className="hm-selectbar-danger"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button
                    type="button"
                    className="hm-selectbar-ghost"
                    onClick={() => setConfirming(false)}
                    disabled={deleting}
                  >
                    Keep
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="hm-selectbar-danger"
                    onClick={() => setConfirming(true)}
                    disabled={selected.length === 0}
                  >
                    Delete
                  </button>
                  <button type="button" className="hm-selectbar-ghost" onClick={() => stopSelecting()}>
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}

          {loading ? (
            <LoadingRegion label="Loading your material…" as="ul" className="hm-materials">
              {[0, 1, 2].map((i) => (
                <li key={i} className="hm-card hm-material">
                  <SkCircle size={20} />
                  <Sk w={44} h={22} r={6} />
                  <span className="hm-material-meta"><SkText lines={2} widths={['60%', '35%']} /></span>
                  <Sk w={64} h={22} r={999} />
                </li>
              ))}
            </LoadingRegion>
          ) : materials.length === 0 ? (
            <div className="hm-card hm-empty">
              <p className="hm-empty-line">
                Nothing here yet. Upload a lecture PDF, a slide deck, or a photo of your notes.
              </p>
              <button type="button" className="hm-buddy-cta" onClick={openUpload}>Upload your first material</button>
            </div>
          ) : (
            <ul ref={listRef} className={`hm-materials${selecting ? ' is-selecting' : ''}`}>
              {materials.map((material) => {
                const status = STATUS_LABEL[material.status] ?? STATUS_LABEL.uploaded
                return (
                  <li
                    key={material.id}
                    className={`hm-card hm-material${selectedIds.has(material.id) ? ' is-selected' : ''}`}
                    // In select mode the whole row toggles, not just the circle
                    // (the circle itself stays the control for the keyboard).
                    onClick={
                      selecting
                        ? (event) => {
                            if (event.target.closest('button, a, label, input')) return
                            setConfirming(false)
                            toggle(material.id)
                          }
                        : undefined
                    }
                  >
                    {selecting && (
                      <label className="hm-check">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(material.id)}
                          onChange={() => {
                            setConfirming(false)
                            toggle(material.id)
                          }}
                        />
                        <span className="hm-check-dot" aria-hidden="true" />
                        <span className="sr-only">Select {material.title}</span>
                      </label>
                    )}

                    <span className="hm-material-type">
                      {TYPE_LABEL[material.source_type] ?? 'File'}
                    </span>
                    <span className="hm-material-meta">
                      <span className="hm-material-title">{material.title}</span>
                      <span className="hm-sub">
                        {material.status === 'failed' && material.error_message
                          ? material.error_message
                          : <>
                              {formatBytes(material.file_size_bytes)}
                              {material.file_size_bytes ? ' · ' : ''}
                              {new Date(material.created_at).toLocaleDateString()}
                            </>}
                      </span>
                    </span>
                    <span
                      className={status.tone}
                      title={material.error_message ?? undefined}
                    >
                      {status.text}
                    </span>
                    {material.status === 'failed' && (
                      <button
                        type="button"
                        className="btn btn-secondary hm-retry"
                        onClick={() => retry(material)}
                        disabled={retryingId === material.id}
                        aria-label={`Try processing ${material.title} again`}
                      >
                        {retryingId === material.id ? 'Starting…' : 'Try again'}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <aside className="hm-rail">
        <MascotRig pose="laptop" className="hm-hero-art" />
        <ScheduleCard sessions={[]} />
        <StatCards streakDays={stats?.streakDays ?? 0} monthMinutes={stats?.monthMinutes ?? 0} loading={loading} />
        <QuoteCard />
      </aside>
    </div>
  )
}
