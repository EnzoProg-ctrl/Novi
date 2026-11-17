import { IconClock, IconFlame } from '../home/HomeIcons'
import { LoadingRegion, Sk } from '../Skeleton'
import { CardError } from './CardStatus'
import { IconCrosshair, IconLayers } from './ProgressIcons'

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
          </LoadingRegion>
        ) : (
          <p className="pg-stat-value">{children}</p>
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

/** "0 min", "45 min", "1 h 20 min": the number large, its unit small. */
function PracticeTime({ seconds }) {
  if (seconds > 0 && seconds < 30) return <>&lt; 1 <span>min</span></>
  const minutes = Math.round(Math.max(0, seconds) / 60)
  if (minutes < 60) return <>{minutes} <span>min</span></>
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? <>{h} <span>h</span> {m} <span>min</span></> : <>{h} <span>h</span></>
}

/**
 * The period at a glance: streak, practice time, questions answered and how
 * many were right. All but the streak follow the period chosen on the chart.
 */
export function StatCards({ streak, streakState, totalSeconds, answered, accuracy, activityState, sittingsState }) {
  return (
    <div className="pg-stats">
      <Stat tone="coral" Icon={IconFlame} label="Study Streak" state={loadingOnce(streakState)} onRetry={streakState.reload}>
        {streak.current} <span>{streak.current === 1 ? 'day' : 'days'}</span>
      </Stat>

      <Stat tone="violet" Icon={IconClock} label="Practice Time" state={periodState(activityState)} onRetry={activityState.reload}>
        <PracticeTime seconds={totalSeconds} />
      </Stat>

      <Stat tone="green" Icon={IconLayers} label="Questions Practiced" state={periodState(activityState)} onRetry={activityState.reload}>
        {answered} <span>{answered === 1 ? 'question' : 'questions'}</span>
      </Stat>

      <Stat tone="blue" Icon={IconCrosshair} label="Accuracy" state={periodState(sittingsState)} onRetry={sittingsState.reload}>
        {accuracy == null ? <span title="No answers in this period yet">—</span> : `${accuracy}%`}
      </Stat>
    </div>
  )
}
