import { Link } from 'react-router-dom'
import { formatTime } from '../../lib/calendar-dates'
import { toneFor } from './packTone'
import { IconArrowRight } from './HomeIcons'
import { LoadingRegion, Sk, SkText } from '../Skeleton'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/** Why this pack is next, as the block's heading. */
function headingFor(focus) {
  if (focus.reason === 'scheduled') {
    return focus.startsAt <= new Date()
      ? 'Your planned session is on now'
      : `Planned for ${formatTime(focus.startsAt)}`
  }
  if (focus.reason === 'resume') return 'Pick up where you left off'
  return 'Ready when you are'
}

/**
 * The one thing to study next, at the top of Home. Chosen by
 * fetchTodaysFocus (today's planned session, then an unfinished session,
 * then the latest pack), the same pick as the sidebar's Today's Focus.
 * `session` is the unfinished sitting for this pack, when there is one, so
 * the block can show how far along it is.
 */
export function NextUp({ focus, session, loading }) {
  if (loading) {
    return (
      <LoadingRegion label="Loading what to study next…" className="hm-card hm-next">
        <Sk w={48} h={48} r={12} />
        <span className="hm-next-body"><SkText lines={2} h={13} widths={['45%', '70%']} /></span>
        <Sk w={150} h={46} r={12} />
      </LoadingRegion>
    )
  }
  if (!focus?.pack) return null

  const { pack } = focus
  const { tone, Icon } = toneFor(pack.id)
  const canPractise = pack.questions > 0
  const resuming = Boolean(session && session.total > 0)
  const to = canPractise
    ? `/pack/${pack.id}/practice${focus.focusTopicId ? `?topic=${focus.focusTopicId}` : ''}`
    : `/pack/${pack.id}`
  const action = !canPractise ? 'Open pack' : resuming || focus.reason !== 'latest' ? 'Continue' : 'Start practice'
  const name = pack.subject ? `${pack.subject} – ${pack.title}` : pack.title

  return (
    <section className="hm-card hm-next" aria-labelledby="hm-next-title">
      <span className={`hm-pack-icon hm-next-icon is-${tone}`}><Icon /></span>

      <div className="hm-next-body">
        <h2 id="hm-next-title" className="hm-next-title">{headingFor(focus)}</h2>
        <p className="hm-next-pack" title={name}>{name}</p>
        {resuming ? (
          <div className="hm-next-progress">
            <span
              className="hm-next-track"
              role="progressbar"
              aria-label="Answered so far"
              aria-valuemin={0}
              aria-valuemax={session.total}
              aria-valuenow={session.done}
            >
              <span className="hm-next-fill" style={{ width: `${session.percent}%` }} />
            </span>
            <span className="hm-next-count">{session.done} of {session.total} answered</span>
          </div>
        ) : (
          <p className="hm-sub">
            {canPractise
              ? `${plural(pack.questions, 'question', 'questions')} · ${plural(pack.concepts, 'key concept', 'key concepts')}`
              : 'Read the summary and key concepts.'}
          </p>
        )}
      </div>

      <Link to={to} className="hm-next-cta">
        {action}
        <IconArrowRight width={18} height={18} />
      </Link>
    </section>
  )
}
