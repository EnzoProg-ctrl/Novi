import { Link } from 'react-router-dom'
import { IconBrain, IconCards, IconClock, IconFlame, IconPencil, IconSparkle, IconUpload } from './HomeIcons'

/**
 * How each recommendation kind presents itself.
 *
 * `to` is only set where the destination actually exists. The others render an
 * inert button rather than a link into a screen that has not been built, which
 * would fall through the catch-all route.
 */
const KINDS = {
  review_topic: { Icon: IconCards, tone: 'violet', action: 'Review' },
  practice_more: { Icon: IconBrain, tone: 'pink', action: 'Practice' },
  revisit_material: { Icon: IconPencil, tone: 'amber', action: 'Revisit' },
  new_material: { Icon: IconUpload, tone: 'blue', action: 'Add material', to: '/upload' },
  take_break: { Icon: IconClock, tone: 'blue', action: 'Take a break' },
  keep_streak: { Icon: IconFlame, tone: 'amber', action: 'Keep going' },
}

const FALLBACK = { Icon: IconCards, tone: 'violet', action: 'Open' }

export function Recommendations({ items = [], loading }) {
  return (
    <section className="hm-section" aria-label="Recommended for you">
      <header className="hm-card-head hm-rec-head">
        <div className="hm-rec-heading">
          <span className="hm-rec-spark"><IconSparkle width={17} height={17} /></span>
          <div>
            <h2 className="hm-section-title">Recommended for You!</h2>
            <p className="hm-sub">Based on your recent activity</p>
          </div>
        </div>
        {items.length > 0 && <span className="hm-muted-link">See All</span>}
      </header>

      {loading ? (
        <p className="hm-empty-line">Loading recommendations…</p>
      ) : items.length === 0 ? (
        <div className="hm-card hm-rec-empty">
          <p className="hm-empty-line">
            Nothing to suggest yet. Once you have studied a little, Novi will
            recommend what to work on next.
          </p>
        </div>
      ) : (
        <div className="hm-recs">
          {items.map((item) => {
            const kind = KINDS[item.kind] ?? FALLBACK
            const { Icon } = kind
            return (
              <article key={item.id} className="hm-card hm-rec">
                <span className={`hm-rec-icon is-${kind.tone}`}><Icon /></span>
                <p className="hm-rec-title">{item.title}</p>
                {item.rationale && <p className="hm-rec-body">{item.rationale}</p>}
                {kind.to ? (
                  <Link to={kind.to} className="hm-rec-cta">{kind.action}</Link>
                ) : (
                  <span className="hm-rec-cta is-inert">{kind.action}</span>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
