import { IconClock, IconPackAtom, IconPackBook, IconPackGrid } from './HomeIcons'

const TONES = [
  { tone: 'green', Icon: IconPackGrid },
  { tone: 'violet', Icon: IconPackAtom },
  { tone: 'pink', Icon: IconPackBook },
]

export function ContinueSection({ items = [], loading }) {
  return (
    <section className="hm-section" aria-label="Continue where you left off">
      <header className="hm-card-head hm-rec-head">
        <div className="hm-rec-heading">
          <span className="hm-rec-spark is-plain"><IconClock width={17} height={17} /></span>
          <h2 className="hm-section-title">Continue Where You Left Off..</h2>
        </div>
        {items.length > 0 && <span className="hm-muted-link">View All</span>}
      </header>

      {loading ? (
        <p className="hm-empty-line">Loading…</p>
      ) : items.length === 0 ? (
        <div className="hm-card hm-rec-empty">
          <p className="hm-empty-line">
            Nothing in progress. Sessions you leave unfinished will wait for you here.
          </p>
        </div>
      ) : (
        <ul className="hm-continue">
          {items.map((item, i) => {
            const { tone, Icon } = TONES[i % TONES.length]
            return (
              <li key={item.id} className="hm-card hm-continue-row">
                <span className={`hm-pack-icon is-${tone}`}><Icon width={18} height={18} /></span>

                <span className="hm-continue-meta">
                  <span className="hm-continue-title">
                    {item.subject ? `${item.subject} – ${item.title}` : item.title}
                  </span>
                  <span className="hm-sub">
                    {item.modeLabel}
                    {item.total > 0 && ` · ${item.total} questions`}
                  </span>
                </span>

                <span className="hm-continue-track" aria-hidden="true">
                  <span className="hm-continue-fill" style={{ width: `${item.percent}%` }} />
                </span>

                <span className="hm-continue-count">
                  {item.done}/{item.total || '—'}
                </span>

                {/* Inert until a session screen exists to resume into. */}
                <span className="hm-continue-cta">Continue</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
