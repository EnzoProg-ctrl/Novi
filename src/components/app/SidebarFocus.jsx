import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/auth-context'
import { useUpload } from '../../context/upload-context'
import { formatTime } from '../../lib/calendar-dates'
import { fetchTodaysFocus } from '../../lib/focus'
import { getDeleteSnapshot, hiddenMaterialIds, subscribeDeletes } from '../../lib/pendingDelete'
import { IconArrowRight, IconCards, IconPackAtom, IconPackBook, IconPackGrid } from '../home/HomeIcons'
import { LoadingRegion, Sk, SkText } from '../Skeleton'
import { IconChevronRight, IconDoc, IconQuestion, IconTarget } from './AppIcons'

const TONES = [
  { tone: 'green', Icon: IconPackGrid },
  { tone: 'blue', Icon: IconPackAtom },
  { tone: 'pink', Icon: IconPackBook },
  { tone: 'violet', Icon: IconPackGrid },
]

/** Same pack, same colour, wherever the card is shown. */
function toneFor(id) {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return TONES[hash % TONES.length]
}

// Kept short: the sidebar leaves little room beside the icon.
function subtitleFor(focus) {
  if (focus.reason === 'scheduled') {
    return focus.startsAt <= new Date() ? 'Planned session, on now' : `Today, ${formatTime(focus.startsAt)}`
  }
  if (focus.reason === 'resume') return 'Pick up where you left off'
  return 'Your latest study pack'
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * Sidebar card pointing at the one pack worth opening next (see
 * fetchTodaysFocus for how it is chosen). The header opens the Calendar,
 * where sessions are planned.
 */
export function SidebarFocus({ onNavigate }) {
  const { user } = useAuth()
  const { uploads, openUpload } = useUpload()
  const { pathname } = useLocation()

  const [focus, setFocus] = useState(null)
  const [status, setStatus] = useState('loading')

  const load = useCallback(async () => {
    if (!user) return
    try {
      setFocus(await fetchTodaysFocus(user.id))
      setStatus('ready')
    } catch {
      // Keep showing what was there; only a first load with nothing shows the error.
      setStatus((prev) => (prev === 'ready' ? prev : 'error'))
    }
  }, [user])

  // Refresh quietly after navigating (a practice session may have just ended),
  // after an upload, and whenever the schedule changes.
  useEffect(() => {
    load()
  }, [load, pathname, uploads])

  useEffect(() => {
    window.addEventListener('novi:schedule-changed', load)
    window.addEventListener('novi:materials-changed', load)
    return () => {
      window.removeEventListener('novi:schedule-changed', load)
      window.removeEventListener('novi:materials-changed', load)
    }
  }, [load])

  // While its material waits out the undo time, the pack shows as loading:
  // it is gone if not undone, and back as it was if it is.
  const deletes = useSyncExternalStore(subscribeDeletes, getDeleteSnapshot)
  const pendingRemoval = Boolean(focus?.pack?.materialId && hiddenMaterialIds(deletes).has(focus.pack.materialId))

  const pack = focus?.pack
  const { tone, Icon } = pack ? toneFor(pack.id) : TONES[0]
  const canPractise = pack && pack.questions > 0

  return (
    <section className="nv-focus" aria-labelledby="nv-focus-title">
      <Link to="/calendar" className="nv-focus-head" onClick={onNavigate} aria-describedby="nv-focus-sub">
        <span className="nv-focus-target"><IconTarget width={19} height={19} /></span>
        <span className="nv-focus-heading">
          <span id="nv-focus-title" className="nv-focus-title">Today&apos;s Focus</span>
          <span id="nv-focus-sub" className="nv-focus-sub">
            {status === 'ready' && focus ? subtitleFor(focus) : 'Your next study session'}
          </span>
        </span>
        <IconChevronRight className="nv-focus-chev" width={17} height={17} />
      </Link>

      {status === 'loading' || pendingRemoval ? (
        <LoadingRegion label="Loading today's focus…" className="nv-focus-pack">
          <span className="nv-focus-pack-head">
            <Sk w={36} h={36} r={10} />
            <SkText lines={2} h={11} widths={['90%', '60%']} />
          </span>
          <SkText lines={2} h={10} widths={['80%', '45%']} />
        </LoadingRegion>
      ) : status === 'error' ? (
        <div className="nv-focus-pack nv-focus-empty">
          <p>Today&apos;s focus could not be loaded.</p>
          <button type="button" className="nv-focus-retry" onClick={load}>Try again</button>
        </div>
      ) : !pack ? (
        <>
          <p className="nv-focus-pack nv-focus-empty">
            Add study material and Novi will build a pack to focus on.
          </p>
          <button type="button" className="nv-focus-cta" onClick={() => { onNavigate?.(); openUpload() }}>
            Add material
            <IconArrowRight width={17} height={17} />
          </button>
        </>
      ) : (
        <>
          <Link to={`/pack/${pack.id}`} className="nv-focus-pack" onClick={onNavigate}>
            <span className="nv-focus-pack-head">
              <span className={`hm-pack-icon nv-focus-icon is-${tone}`}><Icon width={18} height={18} /></span>
              <span className="nv-focus-pack-title" title={pack.title}>{pack.title}</span>
            </span>
            <span className="nv-focus-counts">
              <span><IconCards width={14} height={14} />{plural(pack.concepts, 'concept', 'concepts')}</span>
              <span><IconQuestion width={14} height={14} />{plural(pack.questions, 'question', 'questions')}</span>
              <span><IconDoc width={14} height={14} />{plural(pack.summaries, 'summary', 'summaries')}</span>
            </span>
          </Link>
          <Link
            to={canPractise ? `/pack/${pack.id}/practice${focus.focusTopicId ? `?topic=${focus.focusTopicId}` : ''}` : `/pack/${pack.id}`}
            className="nv-focus-cta"
            onClick={onNavigate}
          >
            {canPractise ? (focus.reason === 'latest' ? 'Start Studying' : 'Continue Studying') : 'Open Pack'}
            <IconArrowRight width={17} height={17} />
          </Link>
        </>
      )}
    </section>
  )
}
