import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconArrowRight, IconBrain, IconCards, IconClock, IconPackBook, IconPencil, IconSparkle, IconUpload } from './HomeIcons'
import { LoadingRegion, Sk, SkText } from '../Skeleton'
import { useUpload } from '../../context/upload-context'
import { recommendationHref, recordRecommendationEvent } from '../../lib/recommendations'
import { PHONE_QUERY, useMediaQuery } from '../../lib/useMediaQuery'
import { IconChevronRight } from '../app/AppIcons'

/** How each kind presents itself. Every kind leads somewhere that exists. */
const KINDS = {
  continue_session: { Icon: IconClock, tone: 'blue', action: 'Continue' },
  practice_more: { Icon: IconBrain, tone: 'pink', action: 'Practice' },
  revisit_material: { Icon: IconPencil, tone: 'amber', action: 'Review' },
  review_topic: { Icon: IconCards, tone: 'violet', action: 'Refresh' },
  start_pack: { Icon: IconPackBook, tone: 'blue', action: 'Start' },
  new_material: { Icon: IconUpload, tone: 'blue', action: 'Add material' },
}
const FALLBACK = { Icon: IconCards, tone: 'violet', action: 'Open' }
/** How many show before "See All": two side by side, or three stacked on phones. */
const FIRST = 2
const FIRST_PHONE = 3

/**
 * "Recommended for You": what to study next, from the recommend function.
 * Each card says why, from the student's own record, and opens the place to
 * do it. Shown, opened and dismissed are recorded once each, to learn what
 * actually helps.
 */
export function Recommendations({ items = [], loading, error, onRetry, onDismiss, hasPacks = true }) {
  const { openUpload } = useUpload()
  const [expanded, setExpanded] = useState(false)
  const first = useMediaQuery(PHONE_QUERY) ? FIRST_PHONE : FIRST
  const visible = expanded ? items : items.slice(0, first)

  // "Shown" once per recommendation actually on screen.
  const shown = useRef(new Set())
  useEffect(() => {
    for (const item of visible) {
      if (shown.current.has(item.id)) continue
      shown.current.add(item.id)
      recordRecommendationEvent(item.id, 'shown', { detail: { position: items.indexOf(item) + 1 } })
    }
  }, [visible, items])

  return (
    <section className="hm-section" aria-label="Recommended for you">
      <header className="hm-card-head hm-rec-head">
        <div className="hm-rec-heading">
          <span className="hm-rec-spark"><IconSparkle width={17} height={17} /></span>
          <div>
            <h2 className="hm-section-title">Recommended for You</h2>
            <p className="hm-sub">Based on your answers, packs and plans.</p>
          </div>
        </div>
        {items.length > first && (
          <button type="button" className="hm-muted-link hm-rec-more" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
            {expanded ? 'Show less' : 'See All'}
            {!expanded && <IconArrowRight width={16} height={16} />}
          </button>
        )}
      </header>

      {loading ? (
        <LoadingRegion label="Loading recommendations…" className="hm-recs">
          {[0, 1].map((i) => (
            <div key={i} className="hm-card hm-rec">
              <Sk w={44} h={44} r={12} />
              <span className="hm-rec-text"><SkText lines={2} widths={['75%', '55%']} /></span>
              <Sk w={92} h={36} r={999} />
            </div>
          ))}
        </LoadingRegion>
      ) : error ? (
        <div className="hm-card hm-rec-empty">
          <p className="hm-empty-line">Recommendations couldn&apos;t be loaded right now.</p>
          <button type="button" className="hm-muted-link hm-rec-retry" onClick={onRetry}>Try again</button>
        </div>
      ) : items.length === 0 ? (
        <div className="hm-card hm-rec-empty">
          <p className="hm-empty-line">
            {hasPacks
              ? 'Nothing to suggest right now. Answer some practice questions and Novi will point out what to work on next.'
              : 'Suggestions show up here once you have a study pack and have answered a few of its practice questions.'}
          </p>
        </div>
      ) : (
        <div className="hm-recs">
          {visible.map((item) => {
            const kind = KINDS[item.kind] ?? FALLBACK
            const { Icon } = kind
            const href = recommendationHref(item)
            const opened = () => recordRecommendationEvent(item.id, 'opened')
            // "Start a pack" reads best as just the pack's name; the button says Start.
            const title = item.kind === 'start_pack' && item.pack?.title ? item.pack.title : item.title
            // Phones show the card as a row with a chevron; the label stays for screen readers.
            const cta = (
              <>
                <span className="hm-rec-cta-text">{kind.action}</span>
                <IconArrowRight className="hm-rec-cta-arrow" width={15} height={15} />
                <IconChevronRight className="hm-rec-chev" width={20} height={20} />
              </>
            )
            return (
              <article key={item.id} className="hm-card hm-rec">
                <span className={`hm-rec-icon is-${kind.tone}`}><Icon /></span>
                <span className="hm-rec-text">
                  <p className="hm-rec-title">{title}</p>
                  {item.reason && <p className="hm-rec-body" title={item.reason}>{item.reason}</p>}
                </span>
                {item.action?.type === 'upload' ? (
                  <button
                    type="button"
                    className="hm-rec-cta"
                    aria-label={`${kind.action}: ${title}`}
                    onClick={() => {
                      opened()
                      openUpload()
                    }}
                  >
                    {cta}
                  </button>
                ) : href ? (
                  <Link to={href} className="hm-rec-cta" onClick={opened} aria-label={`${kind.action}: ${title}`}>{cta}</Link>
                ) : (
                  <span className="hm-rec-cta is-inert">{kind.action}</span>
                )}
                <button
                  type="button"
                  className="hm-rec-dismiss"
                  onClick={() => onDismiss?.(item.id)}
                  aria-label={`Not now: ${item.title}`}
                  title="Not now"
                >
                  ×
                </button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
