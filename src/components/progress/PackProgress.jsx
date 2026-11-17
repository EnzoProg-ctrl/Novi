import { Link } from 'react-router-dom'
import { useUpload } from '../../context/upload-context'
import { CardError } from './CardStatus'
import { LoadingRegion, Sk } from '../Skeleton'
import { IconAtom, IconBook, IconDatabase, IconLaptop } from './ProgressIcons'

const SHOWN = 4

/** An icon that fits the pack's subject, guessed from its title and subject. */
const SUBJECT_ICONS = [
  { test: /network|computer|software|program|coding|web|internet|it\b/i, Icon: IconLaptop, tone: 'coral' },
  { test: /data ?base|sql|data\b|storage/i, Icon: IconDatabase, tone: 'violet' },
  { test: /physic|chemi|science|biolog|atom|quantum/i, Icon: IconAtom, tone: 'green' },
]
const FALLBACK_TONES = ['blue', 'violet', 'coral', 'green']

function iconFor(pack, i) {
  const text = `${pack.title} ${pack.subject ?? ''}`
  return SUBJECT_ICONS.find((s) => s.test.test(text)) ?? { Icon: IconBook, tone: FALLBACK_TONES[i % FALLBACK_TONES.length] }
}

/**
 * Learning progress per pack: questions answered correctly at least once, out
 * of the pack's questions, with how many it has tried. Most recently
 * practised first.
 */
export function PackProgress({ rows, state }) {
  const { openUpload } = useUpload()

  return (
    <section className="hm-card pg-card" aria-labelledby="pg-packs-title">
      <div className="pg-card-head">
        <h2 id="pg-packs-title" className="pg-card-title">Study Pack Progress</h2>
        {rows.length > SHOWN && <Link to="/packs" className="hm-muted-link">View all</Link>}
      </div>

      {state.error && !state.data ? (
        <CardError onRetry={state.reload}>Pack progress could not be loaded.</CardError>
      ) : state.loading && !state.data ? (
        <LoadingRegion label="Loading pack progress…" as="ul" className="pg-packs">
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <div className="pg-pack">
                <Sk w={46} h={46} r={12} />
                <span className="pg-pack-body">
                  <Sk w={`${70 - i * 12}%`} h={13} />
                  <Sk h={6} r={4} />
                  <Sk w="40%" h={10} />
                </span>
              </div>
            </li>
          ))}
        </LoadingRegion>
      ) : rows.length === 0 ? (
        <div className="pg-empty">
          <p className="hm-empty-line">No study packs with questions yet.</p>
          <button type="button" className="hm-buddy-cta" onClick={openUpload}>Add material</button>
        </div>
      ) : (
        <ul className="pg-packs">
          {rows.slice(0, SHOWN).map((pack, i) => {
            const { Icon, tone } = iconFor(pack, i)
            return (
              <li key={pack.id}>
                <Link to={`/pack/${pack.id}`} className="pg-pack">
                  <span className={`pg-pack-icon tone-${tone}`}><Icon width={22} height={22} /></span>
                  <span className="pg-pack-body">
                    <span className="pg-pack-top">
                      <span className="pg-pack-title" title={pack.title}>{pack.title}</span>
                      <span className="pg-pack-pct">{pack.percent}%</span>
                    </span>
                    <span
                      className="pg-bar-track pg-bar-thin"
                      role="progressbar"
                      aria-label={`${pack.title}: ${pack.correct} of ${pack.total} questions answered correctly`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pack.percent}
                    >
                      <span style={{ width: `${pack.percent}%` }} />
                    </span>
                    <span className="pg-pack-meta">
                      <span>{pack.attempted ?? 0} attempted</span>
                      <span>{pack.correct} correct</span>
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
