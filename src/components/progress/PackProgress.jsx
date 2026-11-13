import { Link } from 'react-router-dom'
import { useUpload } from '../../context/upload-context'
import { IconPackAtom, IconPackBook, IconPackGrid } from '../home/HomeIcons'
import { CardError } from './CardStatus'
import { LoadingRegion, Sk } from '../Skeleton'

const SHOWN = 4
const ICONS = [
  { Icon: IconPackBook, tone: 'coral' },
  { Icon: IconPackAtom, tone: 'violet' },
  { Icon: IconPackGrid, tone: 'green' },
  { Icon: IconPackBook, tone: 'blue' },
]

/**
 * Learning progress per pack: questions answered correctly at least once, out
 * of the pack's questions. Most recently practised first.
 */
export function PackProgress({ rows, state }) {
  const { openUpload } = useUpload()

  return (
    <section className="hm-card pg-card" aria-labelledby="pg-packs-title">
      <div className="pg-card-head">
        <h2 id="pg-packs-title" className="hm-card-title">Study Pack Progress</h2>
        {rows.length > 0 && <Link to="/packs" className="hm-muted-link">View all</Link>}
      </div>

      {state.error && !state.data ? (
        <CardError onRetry={state.reload}>Pack progress could not be loaded.</CardError>
      ) : state.loading && !state.data ? (
        <LoadingRegion label="Loading pack progress…" as="ul" className="pg-packs">
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <div className="pg-pack">
                <Sk w={36} h={36} r={10} />
                <span className="pg-pack-body">
                  <Sk w={`${70 - i * 12}%`} h={12} />
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
        <>
          <ul className="pg-packs">
            {rows.slice(0, SHOWN).map((pack, i) => {
              const { Icon, tone } = ICONS[i % ICONS.length]
              return (
                <li key={pack.id}>
                  <Link to={`/pack/${pack.id}`} className="pg-pack">
                    <span className={`pg-pack-icon tone-${tone}`}><Icon width={18} height={18} /></span>
                    <span className="pg-pack-body">
                      <span className="pg-pack-top">
                        <span className="pg-pack-title">{pack.title}</span>
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
                        <span className={`tone-${tone}`} style={{ width: `${pack.percent}%` }} />
                      </span>
                      <span className="pg-pack-meta">{pack.correct} of {pack.total} questions correct</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
          <p className="pg-note">Progress counts each question you have answered correctly at least once.</p>
        </>
      )}
    </section>
  )
}
