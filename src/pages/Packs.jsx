import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import '../components/study/packs-page.css'
import {
  IconPackAtom,
  IconPackBook,
  IconPackGrid,
  IconPlus,
} from '../components/home/HomeIcons'
import { IconGridView, IconListView } from '../components/study/PackIcons'
import { useAuth } from '../context/auth-context'
import { fetchPackList } from '../lib/packs'

/** Cycled for visual variety; not tied to subject meaning. */
const TONES = [
  { tone: 'green', Icon: IconPackGrid },
  { tone: 'blue', Icon: IconPackAtom },
  { tone: 'pink', Icon: IconPackBook },
  { tone: 'violet', Icon: IconPackGrid },
  { tone: 'amber', Icon: IconPackBook },
]

const SORTS = [
  { value: 'updated', label: 'Recently Updated' },
  { value: 'created', label: 'Recently Created' },
  { value: 'title', label: 'Title A–Z' },
]

/** Only "My Packs" has anything behind it; the others are design-only for now. */
const TABS = [
  { id: 'mine', label: 'My Packs' },
  { id: 'shared', label: 'Shared with Me', soon: true },
  { id: 'favourites', label: 'Favorites', soon: true },
]

const VIEW_KEY = 'novi.packs.view'

function relativeDay(iso) {
  if (!iso) return null
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'Updated today'
  if (days === 1) return 'Updated yesterday'
  if (days < 7) return `Updated ${days} days ago`
  const weeks = Math.floor(days / 7)
  if (weeks === 1) return 'Updated 1 week ago'
  if (weeks < 5) return `Updated ${weeks} weeks ago`
  return `Updated ${new Date(iso).toLocaleDateString()}`
}

export function Packs() {
  const { user } = useAuth()

  const [packs, setPacks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [subjectId, setSubjectId] = useState('')
  const [sort, setSort] = useState('updated')
  const [view, setView] = useState(() => {
    // Per-viewer convenience only; a failed read must not break the page.
    try {
      return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'
    } catch {
      return 'grid'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view)
    } catch { /* private mode, not worth surfacing */ }
  }, [view])

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      setPacks(await fetchPackList(user.id, { subjectId: subjectId || null, sort }))
      setError(null)
    } catch (err) {
      setError(err?.message ?? 'Could not load your study packs.')
    } finally {
      setLoading(false)
    }
  }, [user, subjectId, sort])

  useEffect(() => {
    load()
  }, [load])

  // Only offer subjects that actually have packs, so the filter can't come up empty.
  const subjects = useMemo(() => {
    const seen = new Map()
    for (const p of packs) {
      if (p.subjectId && !seen.has(p.subjectId)) seen.set(p.subjectId, p.subject)
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [packs])

  return (
    <div className="pk">
      <header className="pk-head">
        <div>
          <h1 className="pk-title">Study Packs</h1>
          <p className="hm-sub">Organize your learning with AI-powered study packs.</p>
        </div>
        {/* Packs are generated from uploaded material, so "new" means "upload". */}
        <Link to="/upload" className="pk-create">
          <IconPlus width={18} height={18} />
          Create New
        </Link>
      </header>

      <div className="pk-toolbar">
        <nav className="pk-tabs" aria-label="Pack collections">
          {TABS.map((tab) => (
            tab.soon ? (
              <span key={tab.id} className="pk-tab is-soon" aria-disabled="true">
                {tab.label}
                <span className="nv-soon">Soon</span>
              </span>
            ) : (
              <span key={tab.id} className="pk-tab is-active" aria-current="page">
                {tab.label}
              </span>
            )
          ))}
        </nav>

        <div className="pk-controls">
          <label className="sr-only" htmlFor="pk-subject">Filter by subject</label>
          <select
            id="pk-subject"
            className="pk-select"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">All Subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <label className="sr-only" htmlFor="pk-sort">Sort packs</label>
          <select
            id="pk-sort"
            className="pk-select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <div className="pk-view" role="group" aria-label="View">
            <button
              type="button"
              className={`pk-view-btn${view === 'grid' ? ' is-active' : ''}`}
              aria-pressed={view === 'grid'}
              aria-label="Grid view"
              onClick={() => setView('grid')}
            >
              <IconGridView />
            </button>
            <button
              type="button"
              className={`pk-view-btn${view === 'list' ? ' is-active' : ''}`}
              aria-pressed={view === 'list'}
              aria-label="List view"
              onClick={() => setView('list')}
            >
              <IconListView />
            </button>
          </div>
        </div>
      </div>

      {error && <div className="msg msg-error">{error}</div>}

      {loading ? (
        <p className="hm-empty-line">Loading your study packs…</p>
      ) : packs.length === 0 ? (
        <div className="hm-card pk-empty">
          <p className="hm-empty-line">
            {subjectId
              ? 'No packs in that subject yet.'
              : 'No study packs yet. Upload material and Novi will build your first one.'}
          </p>
          <Link to="/upload" className="hm-buddy-cta">Upload material</Link>
        </div>
      ) : (
        <ul className={`pk-list is-${view}`}>
          {packs.map((pack, i) => {
            const { tone, Icon } = TONES[i % TONES.length]
            return (
              <li key={pack.id}>
                <Link to={`/pack/${pack.id}`} className="pk-card">
                  <span className={`hm-pack-icon is-${tone}`}><Icon /></span>

                  <span className="pk-card-body">
                    <span className="pk-card-title">
                      {pack.subject ? `${pack.subject} – ${pack.title}` : pack.title}
                    </span>
                    <span className="pk-card-counts">
                      {pack.concepts} concepts
                      <span className="pk-dot">•</span>
                      {pack.questions} questions
                      <span className="pk-dot">•</span>
                      {pack.summaries} {pack.summaries === 1 ? 'summary' : 'summaries'}
                    </span>
                    <span className="pk-card-meta">{relativeDay(pack.updatedAt)}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
