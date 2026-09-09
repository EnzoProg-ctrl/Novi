import { Link } from 'react-router-dom'
import { IconPackAtom, IconPackBook, IconPackGrid, IconPlus } from './HomeIcons'

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
  return (
    <section className="hm-section" aria-label="Recent study packs">
      <header className="hm-card-head">
        <h2 className="hm-section-title">Recent Study Packs</h2>
        {packs.length > 0 && <span className="hm-muted-link">See All</span>}
      </header>

      {loading ? (
        <p className="hm-empty-line">Loading your study packs…</p>
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
                <Link key={pack.id} to={`/pack/${pack.id}`} className="hm-card hm-pack">
                  <span className={`hm-pack-icon is-${tone}`}><Icon /></span>
                  <p className="hm-pack-subject">{pack.subject ?? pack.title}</p>
                  <p className="hm-pack-topic">{pack.subject ? pack.title : 'Study pack'}</p>
                  <p className="hm-pack-meta">{relativeDay(pack.updatedAt)}</p>
                </Link>
              )
            })}

            <Link to="/upload" className="hm-pack hm-pack-add">
              <IconPlus width={22} height={22} />
              <p className="hm-pack-subject">Add New</p>
              <p className="hm-pack-topic">Study Pack</p>
            </Link>
          </div>
        </>
      )}
    </section>
  )
}
