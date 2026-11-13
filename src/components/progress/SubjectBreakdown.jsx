import { formatStudyTime } from '../../lib/progress-metrics'
import { CardError, RingSkeleton } from './CardStatus'

const TONES = ['coral', 'violet', 'green', 'blue']
const R = 46
const CIRC = 2 * Math.PI * R

/**
 * Where the period's practice time went. Grouped by subject, or by study pack
 * where packs have no subject. This is time allocation, not mastery.
 */
export function SubjectBreakdown({ slices, totalSeconds, groupedByPack, state, onRetry }) {
  // Each slice starts where the previous ones end.
  const shares = slices.map((slice) => (totalSeconds > 0 ? slice.seconds / totalSeconds : 0))
  const arcs = slices.map((slice, i) => ({
    ...slice,
    tone: slice.isOther ? 'gray' : TONES[i % TONES.length],
    length: shares[i] * CIRC,
    offset: shares.slice(0, i).reduce((sum, s) => sum + s, 0) * CIRC,
  }))

  return (
    <section className="hm-card pg-card" aria-labelledby="pg-subject-title">
      <div className="pg-card-head">
        <h2 id="pg-subject-title" className="hm-card-title">Subject Breakdown</h2>
      </div>

      {state.error ? (
        <CardError onRetry={onRetry}>The breakdown could not be loaded.</CardError>
      ) : state.loading ? (
        <RingSkeleton size={128} lines={4} label="Loading the subject breakdown…" />
      ) : slices.length === 0 ? (
        <p className="hm-empty-line">No practice time in this period yet, so there is nothing to break down.</p>
      ) : (
        <>
          <div className="pg-donut-wrap">
            <div className="pg-donut">
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle className="pg-donut-track" cx="60" cy="60" r={R} />
                {arcs.map((a) => (
                  <circle
                    key={a.name}
                    className={`pg-donut-arc tone-${a.tone}`}
                    cx="60"
                    cy="60"
                    r={R}
                    // A hairline gap between slices, unless there is only one.
                    strokeDasharray={`${Math.max(0, a.length - (arcs.length > 1 ? 1.5 : 0))} ${CIRC}`}
                    strokeDashoffset={-a.offset}
                  />
                ))}
              </svg>
              <p className="pg-donut-center">
                <strong>{formatStudyTime(totalSeconds)}</strong>
                <span>total</span>
              </p>
            </div>

            <ul className="pg-legend">
              {arcs.map((a) => (
                <li key={a.name} className={`pg-legend-row tone-${a.tone}`}>
                  <span className="pg-swatch" aria-hidden="true" />
                  <span className="pg-legend-name" title={a.name}>{a.name}</span>
                  <span className="pg-legend-pct">{a.percent}%</span>
                  <span className="pg-legend-time">{formatStudyTime(a.seconds)}</span>
                </li>
              ))}
            </ul>
          </div>
          {groupedByPack && (
            <p className="pg-note">Grouped by study pack, since your packs don&apos;t have subjects yet.</p>
          )}
        </>
      )}
    </section>
  )
}
