import { formatStudyTime, percentOf } from '../../lib/progress-metrics'
import { IconClock, IconFlame } from '../home/HomeIcons'
import { LoadingRegion, Sk } from '../Skeleton'
import { CardError } from './CardStatus'
import { IconBars, IconCheckCircle, IconDown, IconUp } from './ProgressIcons'

function Stat({ tone, Icon, label, state, onRetry, children }) {
  return (
    <section className="hm-card pg-stat" aria-label={label}>
      <span className={`pg-stat-icon tone-${tone}`}><Icon /></span>
      <div className="pg-stat-body">
        <p className="pg-stat-label">{label}</p>
        {state?.error ? (
          <CardError onRetry={onRetry}>Could not load.</CardError>
        ) : state?.loading ? (
          <LoadingRegion label={`Loading ${label.toLowerCase()}…`} className="pg-skel">
            <Sk w="55%" h={26} r={6} />
            <Sk w="75%" h={11} />
          </LoadingRegion>
        ) : (
          children
        )}
      </div>
    </section>
  )
}

// Sources that do not depend on the period keep showing their data while a
// retry runs. Period-dependent ones show a skeleton instead: old rows filtered
// by the new dates would flash wrong numbers.
const loadingOnce = (s) => ({ loading: s.loading && s.data == null, error: s.data == null ? s.error : null })
const periodState = (s) => ({ loading: s.loading, error: s.error })

export function StatCards({
  range,
  streak,
  streakState,
  totalSeconds,
  comparison,
  activityState,
  completed,
  target,
  plannedState,
  goalState,
  packsStudied,
}) {
  const sessionsState = {
    loading: (plannedState.loading && !plannedState.data) || (goalState.loading && goalState.data == null),
    error: (!plannedState.data && plannedState.error) || (goalState.data == null && goalState.error),
  }
  const pct = percentOf(completed, target)

  return (
    <div className="pg-stats">
      <Stat tone="coral" Icon={IconFlame} label="Study Streak" state={loadingOnce(streakState)} onRetry={streakState.reload}>
        <p className="pg-stat-value">
          {streak.current} <span>{streak.current === 1 ? 'day' : 'days'}</span>
        </p>
        <p className="pg-stat-sub">
          {streak.current === 0
            ? 'Study today to start a streak'
            : streak.longest > streak.current
              ? `Longest: ${streak.longest} days`
              : 'Your longest streak yet'}
        </p>
      </Stat>

      <Stat tone="violet" Icon={IconClock} label="Total Study Time" state={periodState(activityState)} onRetry={activityState.reload}>
        <p className="pg-stat-value">{formatStudyTime(totalSeconds)}</p>
        <p className="pg-stat-sub">
          {comparison ? (
            <span className={`pg-trend is-${comparison.direction}`}>
              {comparison.direction === 'up' && <IconUp />}
              {comparison.direction === 'down' && <IconDown />}
              {comparison.text} vs {range.compareLabel}
            </span>
          ) : (
            'Time spent answering practice questions'
          )}
        </p>
      </Stat>

      <Stat
        tone="green"
        Icon={IconCheckCircle}
        label="Sessions Completed"
        state={sessionsState}
        onRetry={() => {
          if (plannedState.error) plannedState.reload()
          if (goalState.error) goalState.reload()
        }}
      >
        <p className="pg-stat-value">
          {completed} <span>of {target || '—'}</span>
        </p>
        <div className="pg-stat-progress">
          <div
            className="pg-bar-track"
            role="progressbar"
            aria-label="Sessions completed against goal"
            aria-valuemin={0}
            aria-valuemax={target || 0}
            aria-valuenow={Math.min(completed, target || 0)}
          >
            <span style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <span className="pg-stat-pct">{target ? `${pct}%` : '—'}</span>
        </div>
      </Stat>

      <Stat tone="blue" Icon={IconBars} label="Study Packs Studied" state={{ loading: activityState.loading || sessionsState.loading, error: activityState.error || sessionsState.error }}
        onRetry={() => {
          if (activityState.error) activityState.reload()
          if (plannedState.error) plannedState.reload()
        }}>
        <p className="pg-stat-value">
          {packsStudied} <span>{packsStudied === 1 ? 'pack' : 'packs'}</span>
        </p>
        <p className="pg-stat-sub">With practice or a completed session</p>
      </Stat>
    </div>
  )
}
