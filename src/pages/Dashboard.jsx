import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import laptopMascot from '../assets/laptop_mascot.webp'
import { BuddyCard } from '../components/home/BuddyCard'
import { GoalRing } from '../components/home/GoalRing'
import { ProgressCard } from '../components/home/ProgressCard'
import { QuoteCard, ScheduleCard, StatCards } from '../components/home/RailCards'
import { ContinueSection } from '../components/home/ContinueSection'
import { Recommendations } from '../components/home/Recommendations'
import { StudyPacks } from '../components/home/StudyPacks'
import '../components/home/home.css'
import { useAuth } from '../context/auth-context'
import {
  fetchInProgress,
  fetchRecommendations,
  fetchStudySets,
  fetchStudyStats,
  fetchSubjectProgress,
  fetchTodayActivity,
} from '../lib/home'
import { deleteMaterials, formatBytes, listMaterials } from '../lib/materials'

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

  const [materials, setMaterials] = useState([])
  const [activity, setActivity] = useState(null)
  const [subjects, setSubjects] = useState([])
  const [stats, setStats] = useState(null)
  const [packs, setPacks] = useState([])
  const [recs, setRecs] = useState([])
  const [inProgress, setInProgress] = useState([])
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async (silent = false) => {
    if (!user) return
    if (!silent) setLoading(true)
    try {
      const [mats, today, progress, studyStats, studySets, recommendations, resumable] =
        await Promise.all([
        listMaterials(user.id),
        fetchTodayActivity(user.id),
        fetchSubjectProgress(user.id),
        fetchStudyStats(user.id),
        fetchStudySets(user.id),
        fetchRecommendations(user.id),
        fetchInProgress(user.id),
      ])
      setMaterials(mats)
      setActivity(today)
      setSubjects(progress)
      setStats(studyStats)
      setPacks(studySets)
      setRecs(recommendations)
      setInProgress(resumable)
      setError(null)
    } catch (err) {
      setError(err?.message ?? 'Could not load your home page.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  // Processing runs server-side after upload, so poll while any material is
  // still moving through extract -> embed -> generate. Chained timeouts rather
  // than an interval, so a slow request can never stack up behind itself.
  useEffect(() => {
    const busy = materials.some((m) => !TERMINAL_STATUS.has(m.status))
    if (!busy) return
    const timer = setTimeout(() => load(true), 3000)
    return () => clearTimeout(timer)
  }, [materials, load])

  const selected = materials.filter((m) => selectedIds.has(m.id))

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

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteMaterials(selected)
      clearSelection()
      // Packs and in-progress sessions change too, so reload everything.
      await load(true)
    } catch (err) {
      setError(err?.message ?? 'Could not delete those materials.')
    } finally {
      setDeleting(false)
    }
  }

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
          <BuddyCard buddyName={buddy?.name} hasMaterial={materials.length > 0} />
          <GoalRing done={activity?.sessions_count ?? 0} />
          <ProgressCard subjects={subjects} loading={loading} />
        </div>

        <StudyPacks packs={packs} loading={loading} />

        <Recommendations items={recs} loading={loading} />

        <ContinueSection items={inProgress} loading={loading} />

        {/* Uploads stay listed while pack generation does not exist - without
            this there is no way to see what you have added. */}
        <section className="hm-section">
          <header className="hm-card-head">
            <h2 className="hm-section-title">Your material</h2>
            {selected.length === 0 && (
              <Link to="/upload" className="hm-muted-link">Add another</Link>
            )}
          </header>

          {selected.length > 0 && (
            <div className="hm-selectbar" role="status">
              <span className="hm-selectbar-count">
                {selected.length} selected
              </span>

              {confirming ? (
                <>
                  <span className="hm-selectbar-warn">
                    Delete {selected.length === 1 ? 'this material' : 'these materials'} and
                    {selected.length === 1 ? ' its' : ' their'} study {selected.length === 1 ? 'pack' : 'packs'}? This cannot be undone.
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
                  >
                    Delete
                  </button>
                  <button type="button" className="hm-selectbar-ghost" onClick={clearSelection}>
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}

          {loading ? (
            <p className="hm-empty-line">Loading your material…</p>
          ) : materials.length === 0 ? (
            <div className="hm-card hm-empty">
              <p className="hm-empty-line">
                Nothing here yet. Upload a lecture PDF, a slide deck, or a photo of your notes.
              </p>
              <Link to="/upload" className="hm-buddy-cta">Upload your first material</Link>
            </div>
          ) : (
            <ul className="hm-materials">
              {materials.map((material) => {
                const status = STATUS_LABEL[material.status] ?? STATUS_LABEL.uploaded
                return (
                  <li
                    key={material.id}
                    className={`hm-card hm-material${selectedIds.has(material.id) ? ' is-selected' : ''}`}
                  >
                    <label className="hm-check">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(material.id)}
                        onChange={() => toggle(material.id)}
                      />
                      <span className="hm-check-dot" aria-hidden="true" />
                      <span className="sr-only">Select {material.title}</span>
                    </label>

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
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <aside className="hm-rail">
        <img className="hm-hero-art" src={laptopMascot} alt="" width="1316" height="1195" />
        <ScheduleCard sessions={[]} />
        <StatCards streakDays={stats?.streakDays ?? 0} monthMinutes={stats?.monthMinutes ?? 0} />
        <QuoteCard />
      </aside>
    </div>
  )
}
