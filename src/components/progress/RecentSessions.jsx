import { Link } from 'react-router-dom'
import { formatDuration } from '../../lib/calendar-dates'
import { formatStudyTime } from '../../lib/progress-metrics'
import { IconChevronRight } from '../calendar/CalendarIcons'
import { IconCheck } from '../calendar/SessionTypeIcons'
import { CardError } from './CardStatus'
import { LoadingRegion, Sk, SkText } from '../Skeleton'
import { IconPlay } from './ProgressIcons'

const SHOWN = 6

const STATUS = {
  completed: { label: 'Completed', tone: 'done' },
  'in-progress': { label: 'In progress', tone: 'active' },
  planned: { label: 'Planned', tone: 'planned' },
  'not-marked': { label: 'Not marked', tone: 'past' },
}

const DATE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

function StatusBadge({ status }) {
  const s = STATUS[status]
  return (
    <span className={`pg-status is-${s.tone}`}>
      {status === 'completed' ? <IconCheck /> : <span className="pg-status-dot" aria-hidden="true" />}
      {s.label}
    </span>
  )
}

/** The action for a row, only where there is somewhere real to go. */
function RowAction({ row, onOpenSession }) {
  if (row.kind === 'planned') {
    return (
      <button type="button" className="pg-row-action" onClick={() => onOpenSession(row.session)} aria-label={`Open ${row.title}`}>
        Details <IconChevronRight width={14} height={14} />
      </button>
    )
  }
  if (!row.packId) return <span className="pg-muted" aria-label="No action: the study pack was deleted">—</span>
  return row.status === 'in-progress' ? (
    <Link to={`/pack/${row.packId}/practice`} className="pg-row-action">
      <IconPlay /> Resume
    </Link>
  ) : (
    <Link to={`/pack/${row.packId}`} className="pg-row-action" aria-label={`Open ${row.packTitle}`}>
      Open pack <IconChevronRight width={14} height={14} />
    </Link>
  )
}

/** The table itself, shared by the card and the "View all" pop-up. */
export function RecentTable({ rows, onOpenSession }) {
  return (
    <table className="pg-table">
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">Session</th>
          <th scope="col">Study pack</th>
          <th scope="col">Duration</th>
          <th scope="col">Status</th>
          <th scope="col"><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td data-label="Date">
              <span className="pg-date">{DATE.format(row.date)}</span>
              <span className="pg-time">{TIME.format(row.date)}</span>
            </td>
            <td data-label="Session" className="pg-cell-title">
              <span className="pg-row-title" title={row.title}>{row.title}</span>
              <span className="pg-row-kind">{row.detail}</span>
            </td>
            <td data-label="Study pack" className="pg-cell-pack">
              {row.packTitle ? (
                <span title={row.packTitle}>{row.packTitle}</span>
              ) : (
                <span className="pg-muted">{row.kind === 'practice' ? 'Deleted pack' : 'None'}</span>
              )}
            </td>
            <td data-label="Duration">
              {row.kind === 'planned' ? (
                <span title="Scheduled length">{formatDuration(Math.round(row.seconds / 60))}</span>
              ) : (
                <span title="Time spent answering">{formatStudyTime(row.seconds)}</span>
              )}
            </td>
            <td data-label="Status"><StatusBadge status={row.status} /></td>
            <td className="pg-cell-action"><RowAction row={row} onOpenSession={onOpenSession} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function RecentSessions({ rows, loading, error, onRetry, onOpenSession, onViewAll }) {
  return (
    <section className="hm-card pg-card" aria-labelledby="pg-recent-title">
      <div className="pg-card-head">
        <div>
          <h2 id="pg-recent-title" className="hm-card-title">Recent Sessions</h2>
          <p className="hm-sub pg-card-sub">Practice quizzes and planned sessions in this period.</p>
        </div>
        {rows.length > SHOWN && (
          <button type="button" className="hm-muted-link pg-link-btn" onClick={onViewAll}>
            View all ({rows.length})
          </button>
        )}
      </div>

      {error ? (
        <CardError onRetry={onRetry}>Your sessions could not be loaded.</CardError>
      ) : loading ? (
        <LoadingRegion label="Loading your sessions…" className="pg-table-skel">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="pg-table-skel-row">
              <SkText lines={2} widths={['80%', '55%']} gap={6} />
              <SkText lines={2} widths={[`${85 - i * 10}%`, '45%']} gap={6} />
              <Sk w="70%" h={12} />
              <Sk w={50} h={12} />
              <Sk w={84} h={22} r={999} />
              <Sk w={80} h={30} r={8} />
            </div>
          ))}
        </LoadingRegion>
      ) : rows.length === 0 ? (
        <div className="pg-empty">
          <p className="hm-empty-line">No sessions in this period. Plan one, or start a practice quiz.</p>
          <div className="pg-empty-actions">
            <Link to="/calendar" className="hm-buddy-cta">Plan a session</Link>
            <Link to="/packs" className="pd-secondary">Practise a pack</Link>
          </div>
        </div>
      ) : (
        <RecentTable rows={rows.slice(0, SHOWN)} onOpenSession={onOpenSession} />
      )}
    </section>
  )
}
