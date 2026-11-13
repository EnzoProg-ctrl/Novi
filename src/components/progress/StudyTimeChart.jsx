import { useState } from 'react'
import { Link } from 'react-router-dom'
import { axisFor, formatStudyTime } from '../../lib/progress-metrics'
import { CardError, ChartSkeleton } from './CardStatus'

const UNIT_WORD = { day: 'day', week: 'week', month: 'month' }

function axisLabel(seconds) {
  if (seconds === 0) return '0'
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  const h = seconds / 3600
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`
}

/**
 * Practice time per day (or week, or month, for longer periods). One series
 * only: the app records practice time, not a breakdown by activity, so the
 * chart does not invent categories.
 */
export function StudyTimeChart({ series, unit, totalSeconds, state }) {
  const [active, setActive] = useState(null)
  const max = Math.max(0, ...series.map((b) => b.seconds))
  const axis = axisFor(Math.max(max, 60))
  const ticks = Array.from({ length: axis.ticks + 1 }, (_, i) => i * axis.step)
  const best = series.reduce((top, b) => (b.seconds > (top?.seconds ?? 0) ? b : top), null)
  const tip = active != null ? series[active] : null
  const dense = series.length > 14

  return (
    <section className="hm-card pg-card pg-chart-card" aria-labelledby="pg-chart-title">
      <div className="pg-card-head">
        <div>
          <h2 id="pg-chart-title" className="hm-card-title">Study Time</h2>
          <p className="hm-sub pg-card-sub">Your study time over the selected period.</p>
        </div>
        <div className="pg-chart-meta">
          <span className="pg-legend-item"><span className="pg-swatch tone-coral" /> Practice questions</span>
          {!state.loading && !state.error && (
            <span className="pg-chart-total">Total <strong>{formatStudyTime(totalSeconds)}</strong></span>
          )}
        </div>
      </div>

      {state.error ? (
        <CardError onRetry={state.reload}>Your study time could not be loaded.</CardError>
      ) : state.loading ? (
        <ChartSkeleton bars={Math.min(series.length, 12)} />
      ) : (
        <>
          <p className="sr-only">
            {totalSeconds === 0
              ? 'No practice time recorded in this period.'
              : `${formatStudyTime(totalSeconds)} in total. Most on ${best.title}: ${formatStudyTime(best.seconds)}.`}
          </p>
          <div className={`pg-chart${dense ? ' is-dense' : ''}`} onMouseLeave={() => setActive(null)}>
            <div className="pg-chart-grid" aria-hidden="true">
              {ticks.slice().reverse().map((t) => (
                <div key={t} className="pg-gridline"><span>{axisLabel(t)}</span></div>
              ))}
            </div>

            <div className="pg-bars" role="list" aria-label={`Study time per ${UNIT_WORD[unit]}`}>
              {series.map((b, i) => (
                <div key={b.start.getTime()} className="pg-bar-col" role="listitem">
                  <button
                    type="button"
                    className={`pg-bar-hit${active === i ? ' is-active' : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    aria-label={`${b.title}: ${formatStudyTime(b.seconds)} of practice, ${b.answers} ${b.answers === 1 ? 'answer' : 'answers'}`}
                  >
                    <span className="pg-bar" style={{ height: `${(b.seconds / axis.max) * 100}%` }} />
                  </button>
                  <span className="pg-bar-label" aria-hidden="true">
                    {b.label}
                    {b.sub && <small>{b.sub}</small>}
                  </span>
                </div>
              ))}
            </div>

            {tip && (
              <div
                className="pg-tooltip"
                style={{ left: `${((active + 0.5) / series.length) * 100}%` }}
                aria-hidden="true"
              >
                <strong>{tip.title}</strong>
                <span>Practice · {formatStudyTime(tip.seconds)}</span>
                <span>{tip.answers} {tip.answers === 1 ? 'answer' : 'answers'}</span>
              </div>
            )}

            {totalSeconds === 0 && (
              <div className="pg-chart-empty">
                <p>No practice in this period yet.</p>
                <p className="hm-sub">Your study time appears here as you answer practice questions.</p>
                <Link to="/packs" className="hm-buddy-cta">Practise a study pack</Link>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
