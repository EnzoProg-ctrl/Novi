import { Link } from 'react-router-dom'
import { formatTime } from '../../lib/calendar-dates'
import { MascotRig } from '../MascotRig'
import { IconArrowRight, IconCalendarDay, IconPlay } from './HomeIcons'
import { LoadingRegion, Sk, SkText } from '../Skeleton'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/** Why this pack is next: the heading, its badge, and the icon beside it. */
function framing(focus, resuming) {
  if (focus.reason === 'scheduled') {
    const now = focus.startsAt <= new Date()
    return {
      Icon: IconCalendarDay,
      heading: now ? 'Your planned session' : `Planned for ${formatTime(focus.startsAt)}`,
      badge: now ? 'On now' : 'Today',
    }
  }
  if (focus.reason === 'resume' || resuming) {
    return { Icon: IconPlay, heading: 'Pick up where you left off', badge: 'In Progress' }
  }
  return { Icon: IconPlay, heading: 'Ready when you are', badge: null }
}

/**
 * The one thing to study next, at the top of Home. Chosen by
 * fetchTodaysFocus (today's planned session, then an unfinished session,
 * then the latest pack).
 * `session` is the unfinished sitting for this pack, when there is one, so
 * the block can show how far along it is.
 */
export function NextUp({ focus, session, loading }) {
  if (loading) {
    return (
      <LoadingRegion label="Loading what to study next…" className="hm-next">
        <div className="hm-next-body">
          <SkText lines={2} h={16} gap={14} widths={['40%', '60%']} />
          <Sk w="55%" h={8} r={5} />
          <Sk w={150} h={46} r={12} />
        </div>
      </LoadingRegion>
    )
  }
  if (!focus?.pack) return null

  const { pack } = focus
  const canPractise = pack.questions > 0
  const resuming = Boolean(session && session.total > 0)
  const { Icon, heading, badge } = framing(focus, resuming)
  const to = canPractise
    ? `/pack/${pack.id}/practice${focus.focusTopicId ? `?topic=${focus.focusTopicId}` : ''}`
    : `/pack/${pack.id}`
  const action = !canPractise ? 'Open pack' : resuming || focus.reason !== 'latest' ? 'Continue' : 'Start practice'
  const name = pack.subject ? `${pack.subject} – ${pack.title}` : pack.title

  return (
    <section className="hm-next" aria-labelledby="hm-next-title">
      <div className="hm-next-body">
        <div className="hm-next-head">
          <span className="hm-next-icon"><Icon width={16} height={16} /></span>
          <h2 id="hm-next-title" className="hm-next-title">{heading}</h2>
          {badge && <span className="hm-next-badge">{badge}</span>}
        </div>

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
          <p className="hm-next-meta">
            {canPractise
              ? `${plural(pack.questions, 'question', 'questions')} · ${plural(pack.concepts, 'key concept', 'key concepts')}`
              : 'Read the summary and key concepts.'}
          </p>
        )}

        <Link to={to} className="hm-next-cta">
          {action}
          <IconArrowRight width={18} height={18} />
        </Link>
      </div>

      <MascotRig pose="laptop" className="hm-next-art" />
    </section>
  )
}
