import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
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
import { ShareLinkForm, ShareLinksList } from '../components/study/ShareDialogs'
import { IconCheck } from '../components/app/AppIcons'
import { LoadingRegion, Sk, SkText } from '../components/Skeleton'
import { Modal } from '../components/Modal'
import { Select } from '../components/Select'
import { useAuth } from '../context/auth-context'
import { useUpload } from '../context/upload-context'
import { fetchPackList } from '../lib/packs'
import { friendlyError } from '../lib/errors'
import { downloadOffline } from '../lib/offlineExport'
import { getDeleteSnapshot, hiddenMaterialIds, scheduleDelete, subscribeDeletes } from '../lib/pendingDelete'
import '../components/modal.css'
// Shared card styles (hm-card, hm-sub) live with Home; pages load on their own now.
import '../components/home/home.css'

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

/** Favorites is design-only for now. Shared with Me holds packs added from a share link. */
const TABS = [
  { id: 'mine', label: 'My Packs' },
  { id: 'shared', label: 'Shared with Me' },
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

  const [allPacks, setPacks] = useState([])
  // A pack whose material is waiting out its undo time is hidden as if gone.
  const deletes = useSyncExternalStore(subscribeDeletes, getDeleteSnapshot)
  const hidden = hiddenMaterialIds(deletes)
  const packs = useMemo(
    () => (hidden.size ? allPacks.filter((p) => !hidden.has(p.material?.id)) : allPacks),
    [allPacks, hidden],
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // The selected pack lives in the link (/packs?pack=<id>), so Home, the pack
  // page and practice can all come back to the same pack.
  const [params, setParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState(() => params.get('pack'))
  const arrivedFor = useRef(params.get('pack'))
  // Bumped when a link selects a pack while this page is already open.
  const [arrivals, setArrivals] = useState(0)
  const select = (id) => {
    setSelectedId(id)
    setParams((p) => {
      const next = new URLSearchParams(p)
      next.set('pack', id)
      return next
    }, { replace: true })
  }
  // Which collection, also in the link (/packs?tab=shared) so a share link can land on it.
  const activeTab = params.get('tab') === 'shared' ? 'shared' : 'mine'
  const setTab = (id) => {
    setSelecting(false)
    setPicked(new Set())
    setSubjectId('')
    setParams((p) => {
      const next = new URLSearchParams(p)
      if (id === 'mine') next.delete('tab')
      else next.set('tab', id)
      next.delete('pack')
      return next
    }, { replace: true })
  }

  // Picking packs to share or download.
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState(() => new Set())
  const togglePick = (id) => {
    setConfirmingDelete(false)
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const stopSelecting = () => {
    setSelecting(false)
    setPicked(new Set())
    setConfirmingDelete(false)
  }
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [modal, setModal] = useState(null) // { kind: 'share' | 'links', open }
  const [modalBusy, setModalBusy] = useState(false)
  const closeModal = () => setModal((m) => (m ? { ...m, open: false } : m))
  const [downloading, setDownloading] = useState(false)
  const [toast, setToast] = useState(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

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
      setPacks(await fetchPackList(user.id, { subjectId: subjectId || null, sort, shared: activeTab === 'shared' }))
      setError(null)
    } catch (err) {
      setError(friendlyError(err, 'Could not load your study packs.'))
    } finally {
      setLoading(false)
    }
  }, [user, subjectId, sort, activeTab])

  useEffect(() => {
    load()
  }, [load])

  // A deletion went through (or failed and came back): the list changes.
  useEffect(() => {
    const reload = () => load()
    window.addEventListener('novi:materials-changed', reload)
    return () => window.removeEventListener('novi:materials-changed', reload)
  }, [load])

  const selected = useMemo(
    () => packs.find((p) => p.id === selectedId) ?? packs[0] ?? null,
    [packs, selectedId],
  )

  // A link to another pack while this page is open (the top-bar search, say):
  // select it as if the page had just opened with it.
  const linkedId = params.get('pack')
  useEffect(() => {
    if (!linkedId || linkedId === selectedId) return
    setSelectedId(linkedId)
    arrivedFor.current = linkedId
    setArrivals((n) => n + 1)
  }, [linkedId]) // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [loading, packs, arrivals])

  // Only offer subjects that actually have packs, so the filter can't come up empty.
  const subjects = useMemo(() => {
    const seen = new Map()
    for (const p of packs) {
      if (p.subjectId && !seen.has(p.subjectId)) seen.set(p.subjectId, p.subject)
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [packs])

  // Only finished packs can be shared or downloaded.
  const pickable = useMemo(() => packs.filter((p) => p.status === 'ready'), [packs])
  const pickedPacks = useMemo(() => pickable.filter((p) => picked.has(p.id)), [pickable, picked])

  // Deleting removes the material each pack was made from, along with the
  // pack. Hidden at once, deleted after the undo time (the toast offers Undo).
  const deletable = pickedPacks.filter((p) => p.material)
  async function handleDelete() {
    setDeleting(true)
    try {
      await scheduleDelete(deletable.map((p) => p.material))
      stopSelecting()
    } catch (err) {
      setToast({ id: Date.now(), tone: 'error', text: friendlyError(err, 'Those packs could not be deleted.') })
    } finally {
      setDeleting(false)
    }
  }

  async function handleDownload() {
    if (pickedPacks.length === 0 || downloading) return
    setDownloading(true)
    try {
      await downloadOffline(pickedPacks.map((p) => p.id))
      setToast({ id: Date.now(), text: 'Downloaded. Open the file in any browser, even offline.' })
    } catch (err) {
      setToast({ id: Date.now(), tone: 'error', text: friendlyError(err, 'The download could not be made. Try again.') })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="pk">
      <header className="pk-head">
        <div>
          <h1 className="pk-title">Study Packs</h1>
          <p className="hm-sub">Organize your learning with AI-powered study packs.</p>
        </div>
        <div className="pk-head-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setModal({ kind: 'links', open: true })}>
            Share links
          </button>
          {/* Packs are generated from uploaded material, so "new" means "upload". */}
          <button type="button" className="pk-create" onClick={openUpload}>
            <IconPlus width={18} height={18} />
            Create New
          </button>
        </div>
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
              <button
                key={tab.id}
                type="button"
                className={`pk-tab${activeTab === tab.id ? ' is-active' : ''}`}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                onClick={() => activeTab !== tab.id && setTab(tab.id)}
              >
                {tab.label}
              </button>
            )
          ))}
        </nav>

        <div className="pk-controls">
          {pickable.length > 0 && (
            <button
              type="button"
              className={`btn ${selecting ? 'btn-primary' : 'btn-secondary'} pk-select-toggle`}
              aria-pressed={selecting}
              onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            >
              {selecting ? 'Done' : 'Select'}
            </button>
          )}
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

      {selecting && (
        <div className="pk-selectbar" role="region" aria-label="Selected packs">
          <span className="pk-selectbar-count" aria-live="polite">
            {pickedPacks.length === 0
              ? 'Tick packs to share, download or delete'
              : `${pickedPacks.length} selected`}
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              setPicked(pickedPacks.length === pickable.length ? new Set() : new Set(pickable.map((p) => p.id)))
            }
          >
            {pickedPacks.length === pickable.length ? 'Clear all' : 'Select all'}
          </button>
          {confirmingDelete ? (
            <span className="pk-selectbar-actions">
              <span className="pk-selectbar-warn" role="alert">
                Delete {deletable.length === 1 ? 'this pack and the material it came from' : `these ${deletable.length} packs and their material`}? You&rsquo;ll have 5 seconds to undo.
              </span>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                Keep
              </button>
              <button type="button" className="btn pk-btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
            </span>
          ) : (
          <span className="pk-selectbar-actions">
            <button
              type="button"
              className="btn btn-ghost pk-delete"
              disabled={deletable.length === 0}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={pickedPacks.length === 0 || downloading}
              onClick={handleDownload}
            >
              {downloading ? 'Preparing…' : 'Download for offline'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pickedPacks.length === 0 || pickedPacks.length > 20}
              title={pickedPacks.length > 20 ? 'A link holds up to 20 packs' : undefined}
              onClick={() => setModal({ kind: 'share', open: true, packs: pickedPacks })}
            >
              Share link
            </button>
          </span>
          )}
        </div>
      )}

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
              : activeTab === 'shared'
                ? 'Nothing shared with you yet. When a classmate sends you a Novi share link, open it and their packs land here.'
                : 'No study packs yet. Upload material and Novi will build your first one.'}
          </p>
          {activeTab === 'mine' && (
            <button type="button" className="hm-buddy-cta" onClick={openUpload}>Upload material</button>
          )}
        </div>
      ) : (
        <ul className={`pk-list is-${view}`}>
          {packs.map((pack, i) => {
            const { tone, Icon } = TONES[i % TONES.length]
            const name = pack.subject ? `${pack.subject} – ${pack.title}` : pack.title
            const canPick = pack.status === 'ready'
            const isPicked = picked.has(pack.id)
            const active = selecting ? isPicked : selected?.id === pack.id
            return (
              <li key={pack.id}>
                <button
                  type="button"
                  className={`pk-card${active ? ' is-selected' : ''}${selecting ? ' is-picking' : ''}`}
                  aria-pressed={active}
                  aria-label={selecting ? `${isPicked ? 'Unselect' : 'Select'} ${name}` : undefined}
                  disabled={selecting && !canPick}
                  data-pack-id={pack.id}
                  onClick={() => (selecting ? togglePick(pack.id) : select(pack.id))}
                >
                  {selecting && (
                    <span className={`pk-card-check${isPicked ? ' is-on' : ''}`} aria-hidden="true">
                      {isPicked && <IconCheck width={14} height={14} />}
                    </span>
                  )}
                  <span className={`hm-pack-icon pk-card-icon is-${tone}`}><Icon /></span>
                  {/* Laid out by the view: a card in the grid, a single row in the list.
                      Long text is clamped or truncated, so title shows in full on hover. */}
                  <span className="pk-card-title" title={name}>{name}</span>
                  <span className="pk-card-counts">
                    <span>{pack.concepts} {pack.concepts === 1 ? 'concept' : 'concepts'}</span>
                    <span>{pack.questions} {pack.questions === 1 ? 'question' : 'questions'}</span>
                    <span>{pack.summaries} {pack.summaries === 1 ? 'summary' : 'summaries'}</span>
                  </span>
                  <span className="pk-card-meta">
                    {pack.sharedBy ? `From ${pack.sharedBy}` : relativeDay(pack.updatedAt)}
                  </span>
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

      <Modal
        open={Boolean(modal?.open)}
        onRequestClose={closeModal}
        onClosed={() => {
          setModal(null)
          setModalBusy(false)
        }}
        locked={modalBusy}
        labelledBy="pk-modal-title"
        className="pk-modal"
      >
        {modal?.kind === 'share' && (
          <ShareLinkForm
            packs={modal.packs}
            onClose={closeModal}
            onBusy={setModalBusy}
            onCreated={stopSelecting}
          />
        )}
        {modal?.kind === 'links' && user && <ShareLinksList userId={user.id} onClose={closeModal} />}
      </Modal>

      {toast && (
        <div key={toast.id} className={`nv-toast${toast.tone === 'error' ? ' is-error' : ''}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  )
}
