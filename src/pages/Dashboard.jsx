import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import laptopMascot from '../assets/laptop_mascot.webp'
import { BuddyCard } from '../components/home/BuddyCard'
import { GoalRing } from '../components/home/GoalRing'
import { ProgressCard } from '../components/home/ProgressCard'
import { QuoteCard, ScheduleCard, StatCards } from '../components/home/RailCards'
import { Recommendations } from '../components/home/Recommendations'
import { StudyPacks } from '../components/home/StudyPacks'
import '../components/home/home.css'
import { useAuth } from '../context/auth-context'
import {
  fetchRecommendations,
  fetchStudySets,
  fetchStudyStats,
  fetchSubjectProgress,
  fetchTodayActivity,
} from '../lib/home'
import { formatBytes, listMaterials } from '../lib/materials'

const STATUS_LABEL = {
  uploaded: { text: 'Waiting to process', tone: 'badge' },
  extracting: { text: 'Reading it', tone: 'badge badge-warn' },
  embedding: { text: 'Indexing', tone: 'badge badge-warn' },
  generating: { text: 'Writing your reviewer', tone: 'badge badge-warn' },
  ready: { text: 'Ready', tone: 'badge badge-ok' },
  failed: { text: 'Failed', tone: 'badge' },
}

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const [mats, today, progress, studyStats, studySets, recommendations] =
        await Promise.all([
        listMaterials(user.id),
        fetchTodayActivity(user.id),
        fetchSubjectProgress(user.id),
        fetchStudyStats(user.id),
        fetchStudySets(user.id),
        fetchRecommendations(user.id),
      ])
      setMaterials(mats)
      setActivity(today)
      setSubjects(progress)
      setStats(studyStats)
      setPacks(studySets)
      setRecs(recommendations)
      setError(null)
    } catch (err) {
      setError(err?.message ?? 'Could not load your home page.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    load()
  }, [load])

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

        {/* Uploads stay listed while pack generation does not exist - without
            this there is no way to see what you have added. */}
        <section className="hm-section">
          <header className="hm-card-head">
            <h2 className="hm-section-title">Your material</h2>
            <Link to="/upload" className="hm-muted-link">Add another</Link>
          </header>

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
                  <li key={material.id} className="hm-card hm-material">
                    <span className="hm-material-type">
                      {TYPE_LABEL[material.source_type] ?? 'File'}
                    </span>
                    <span className="hm-material-meta">
                      <span className="hm-material-title">{material.title}</span>
                      <span className="hm-sub">
                        {formatBytes(material.file_size_bytes)}
                        {material.file_size_bytes ? ' · ' : ''}
                        {new Date(material.created_at).toLocaleDateString()}
                      </span>
                    </span>
                    <span className={status.tone}>{status.text}</span>
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
