import { Link } from 'react-router-dom'
import { IconPackAtom, IconPackBook, IconPackGrid, IconPlus } from './HomeIcons'
import { LoadingRegion, Sk, SkText } from '../Skeleton'
import { useUpload } from '../../context/upload-context'

/** Cycled so packs are visually distinguishable; not tied to subject meaning. */
const TONES = [
  { tone: 'green', Icon: IconPackGrid },
  { tone: 'blue', Icon: IconPackAtom },
  { tone: 'pink', Icon: IconPackBook },
  { tone: 'violet', Icon: IconPackGrid },
]

function relativeDay(iso) {
  if (!iso) return null
  const then = new Date(iso)
  const days = Math.floor((Date.now() - then.getTime()) / 86400000)
  if (days <= 0) return 'Updated today'
  if (days === 1) return 'Updated yesterday'
  if (days < 7) return `Updated ${days} days ago`
  const weeks = Math.floor(days / 7)
  if (weeks === 1) return 'Updated 1 week ago'
  if (weeks < 5) return `Updated ${weeks} weeks ago`
  return `Updated ${then.toLocaleDateString()}`
}

export function StudyPacks({ packs = [], loading }) {
  const { openUpload } = useUpload()
  return (
    <section className="hm-section" aria-label="Recent study packs">
      <header className="hm-card-head">
        <h2 className="hm-section-title">Recent Study Packs</h2>
        {packs.length > 0 && <span className="hm-muted-link">See All</span>}
      </header>

      {loading ? (
        <LoadingRegion label="Loading your study packs…" className="hm-packs">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="hm-card hm-pack">
              <Sk w={40} h={40} r={10} style={{ marginBottom: 14 }} />
              <SkText lines={3} widths={['75%', '55%', '35%']} />
            </div>
          ))}
        </LoadingRegion>
      ) : (
        <>
          {packs.length === 0 && (
            <p className="hm-empty-line">
              No study packs yet. Upload material and Novi will build your first one.
            </p>
          )}

          <div className="hm-packs">
            {packs.map((pack, i) => {
              const { tone, Icon } = TONES[i % TONES.length]
              return (
                <Link key={pack.id} to={`/packs?pack=${pack.id}`} className="hm-card hm-pack">
                  <span className={`hm-pack-icon is-${tone}`}><Icon /></span>
                  <p className="hm-pack-subject">{pack.subject ?? pack.title}</p>
                  <p className="hm-pack-topic">{pack.subject ? pack.title : 'Study pack'}</p>
                  <p className="hm-pack-meta">{relativeDay(pack.updatedAt)}</p>
                </Link>
              )
            })}

            <button type="button" className="hm-pack hm-pack-add" onClick={openUpload}>
              <IconPlus width={22} height={22} />
              <span className="hm-pack-subject">Add New</span>
              <span className="hm-pack-topic">Study Pack</span>
            </button>
          </div>
        </>
      )}
    </section>
  )
}
