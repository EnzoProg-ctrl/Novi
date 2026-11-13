import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import '../components/study/packs-page.css'
import {
  IconPackAtom,
  IconPackBook,
  IconPackGrid,
  IconPlus,
} from '../components/home/HomeIcons'
import { PackDetail } from '../components/study/PackDetail'
import { IconGridView, IconListView } from '../components/study/PackIcons'
import { LoadingRegion, Sk, SkText } from '../components/Skeleton'
import { Select } from '../components/Select'
import { useAuth } from '../context/auth-context'
import { useUpload } from '../context/upload-context'
import { fetchPackList } from '../lib/packs'
import { friendlyError } from '../lib/errors'

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
  const { openUpload } = useUpload()
  const { user } = useAuth()

  const [packs, setPacks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // The selected pack lives in the link (/packs?pack=<id>), so Home, the pack
  // page and practice can all come back to the same pack.
  const [params, setParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState(() => params.get('pack'))
  const arrivedFor = useRef(params.get('pack'))
  const select = (id) => {
    setSelectedId(id)
    setParams((p) => {
      const next = new URLSearchParams(p)
      next.set('pack', id)
      return next
    }, { replace: true })
  }
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
      setError(friendlyError(err, 'Could not load your study packs.'))
    } finally {
      setLoading(false)
    }
  }, [user, subjectId, sort])

  useEffect(() => {
    load()
  }, [load])

  const selected = useMemo(
    () => packs.find((p) => p.id === selectedId) ?? packs[0] ?? null,
    [packs, selectedId],
  )

  // Arriving with a pack in the link: bring it into view once. On narrower
  // screens its details sit below the list, so show those instead.
  useEffect(() => {
    const id = arrivedFor.current
    if (loading || !id) return
    arrivedFor.current = null
    if (!packs.some((p) => p.id === id)) return
    if (window.matchMedia('(max-width: 1080px)').matches) {
      document.querySelector('.pk .pd')?.scrollIntoView({ block: 'start' })
      return
    }
    const card = document.querySelector(`.pk-card[data-pack-id="${CSS.escape(id)}"]`)
    const box = card?.getBoundingClientRect()
    if (box && (box.top < 0 || box.bottom > window.innerHeight)) card.scrollIntoView({ block: 'center' })
  }, [loading, packs])

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
        <button type="button" className="pk-create" onClick={openUpload}>
          <IconPlus width={18} height={18} />
          Create New
        </button>
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
          <Select
            id="pk-subject"
            className="pk-select"
            ariaLabel="Filter by subject"
            value={subjectId}
            onChange={setSubjectId}
            options={[{ value: '', label: 'All Subjects' }, ...subjects.map((s) => ({ value: s.id, label: s.name }))]}
          />

          <Select
            id="pk-sort"
            className="pk-select"
            ariaLabel="Sort packs"
            value={sort}
            onChange={setSort}
            options={SORTS}
          />

          <div className="pk-view" role="group" aria-label="View">
            <button
              type="button"
              className={`pk-view-btn${view === 'grid' ? ' is-active' : ''}`}
              aria-pressed={view === 'grid'}
              aria-label="Grid view"
              title="Grid view"
              onClick={() => setView('grid')}
            >
              <IconGridView />
            </button>
            <button
              type="button"
              className={`pk-view-btn${view === 'list' ? ' is-active' : ''}`}
              aria-pressed={view === 'list'}
              aria-label="List view"
              title="List view"
              onClick={() => setView('list')}
            >
              <IconListView />
            </button>
          </div>
        </div>
      </div>

      {error && <div className="msg msg-error">{error}</div>}

      <div className="pk-split">
      {loading ? (
        <>
          <LoadingRegion label="Loading your study packs…" as="ul" className={`pk-list is-${view}`}>
            {[0, 1, 2, 3, 4].map((i) => (
              <li key={i}>
                <div className="pk-card">
                  <Sk className="pk-card-icon" w={38} h={38} r={10} />
                  <span className="pk-card-title"><Sk w={`${78 - i * 9}%`} h={13} /></span>
                  <span className="pk-card-counts"><Sk w="85%" h={11} /></span>
                  <span className="pk-card-meta"><Sk w={90} h={10} /></span>
                </div>
              </li>
            ))}
          </LoadingRegion>
          <aside className="pd" aria-hidden="true">
            <span className="sk-row" style={{ alignItems: 'flex-start' }}>
              <Sk w={44} h={44} r={12} />
              <SkText lines={2} h={13} widths={['65%', '40%']} />
            </span>
            <SkText lines={3} widths={['100%', '95%', '70%']} />
            <div className="pd-stats">
              {[0, 1, 2].map((i) => <Sk key={i} h={62} r={12} />)}
            </div>
            <div className="pd-actions">
              <Sk h={44} r={12} />
              <Sk h={44} r={12} />
            </div>
            {[0, 1, 2].map((i) => (
              <span key={i} className="sk-row">
                <Sk w={32} h={32} r={9} />
                <SkText lines={2} widths={['50%', '35%']} />
              </span>
            ))}
          </aside>
        </>
      ) : packs.length === 0 ? (
        <div className="hm-card pk-empty">
          <p className="hm-empty-line">
            {subjectId
              ? 'No packs in that subject yet.'
              : 'No study packs yet. Upload material and Novi will build your first one.'}
          </p>
          <button type="button" className="hm-buddy-cta" onClick={openUpload}>Upload material</button>
        </div>
      ) : (
        <ul className={`pk-list is-${view}`}>
          {packs.map((pack, i) => {
            const { tone, Icon } = TONES[i % TONES.length]
            const name = pack.subject ? `${pack.subject} – ${pack.title}` : pack.title
            return (
              <li key={pack.id}>
                <button
                  type="button"
                  className={`pk-card${selected?.id === pack.id ? ' is-selected' : ''}`}
                  aria-pressed={selected?.id === pack.id}
                  data-pack-id={pack.id}
                  onClick={() => select(pack.id)}
                >
                  <span className={`hm-pack-icon pk-card-icon is-${tone}`}><Icon /></span>
                  {/* Laid out by the view: a card in the grid, a single row in the list.
                      Long text is clamped or truncated, so title shows in full on hover. */}
                  <span className="pk-card-title" title={name}>{name}</span>
                  <span className="pk-card-counts">
                    <span>{pack.concepts} {pack.concepts === 1 ? 'concept' : 'concepts'}</span>
                    <span>{pack.questions} {pack.questions === 1 ? 'question' : 'questions'}</span>
                    <span>{pack.summaries} {pack.summaries === 1 ? 'summary' : 'summaries'}</span>
                  </span>
                  <span className="pk-card-meta">{relativeDay(pack.updatedAt)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {!loading && packs.length > 0 && (
        <PackDetail
          pack={selected}
          tone={TONES[packs.findIndex((p) => p.id === selected?.id) % TONES.length].tone}
          Icon={TONES[packs.findIndex((p) => p.id === selected?.id) % TONES.length].Icon}
        />
      )}
      </div>
    </div>
  )
}
