import { useState } from 'react'
import { Link } from 'react-router-dom'
import { axisFor, formatRange, formatStudyTime } from '../../lib/progress-metrics'
import { IconCalendar } from '../app/AppIcons'
import { CardError, ChartSkeleton } from './CardStatus'
import { IconBars } from './ProgressIcons'

const UNIT_WORD = { day: 'day', week: 'week', month: 'month' }

function axisLabel(seconds) {
  if (seconds === 0) return '0m'
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  const h = seconds / 3600
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`
}

/**
 * Practice time per day (or week, or month, for longer periods). One series
 * only: the app records practice time, not a breakdown by activity, so the
 * chart does not invent categories.
 */
export function StudyTimeChart({ series, unit, totalSeconds, state, range, onOpenRange }) {
  const [active, setActive] = useState(null)
  const max = Math.max(0, ...series.map((b) => b.seconds))
  // An empty chart still shows a useful scale: 0m, 30m, 1h.
  const axis = max === 0 ? { max: 3600, step: 1800, ticks: 2 } : axisFor(Math.max(max, 60))
  const ticks = Array.from({ length: axis.ticks + 1 }, (_, i) => i * axis.step)
  const best = series.reduce((top, b) => (b.seconds > (top?.seconds ?? 0) ? b : top), null)
  const tip = active != null ? series[active] : null
  const dense = series.length > 14

  return (
    <section className="hm-card pg-card pg-chart-card" aria-labelledby="pg-chart-title">
      <div className="pg-card-head">
        <div>
          <h2 id="pg-chart-title" className="pg-card-title">Practice Activity</h2>
          <p className="hm-sub pg-card-sub">Your practice activity for {formatRange(range.start, range.end)}.</p>
        </div>
        {/* Picks the period every card on the page follows. */}
        <button
          type="button"
          className="pg-range-btn"
          onClick={onOpenRange}
          aria-label={`Period: ${formatRange(range.start, range.end)}. Change the period`}
        >
          <IconCalendar width={17} height={17} />
          <span>{formatRange(range.start, range.end)}</span>
        </button>
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
                <span className="pg-empty-icon"><IconBars width={22} height={22} /></span>
                <p>No practice activity yet.</p>
                <p className="hm-sub">Start practicing to see your study activity here.</p>
                <Link to="/packs" className="pg-cta">Practice a study pack</Link>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
