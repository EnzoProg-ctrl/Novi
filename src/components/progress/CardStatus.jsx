import { LoadingRegion, Sk, SkText } from '../Skeleton'

/** A card's own error, so one failed request never blanks the page. */
export function CardError({ onRetry, children = 'This could not be loaded.' }) {
  return (
    <div className="pg-card-error" role="alert">
      <p>{children}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary pg-retry" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

/** Generic card body placeholder: a few lines of text. */
export function Skeleton({ lines = 3, label = 'Loading…' }) {
  return (
    <LoadingRegion label={label} className="pg-skel">
      <SkText lines={lines} h={12} gap={12} />
    </LoadingRegion>
  )
}

/** Bars of varying height on the chart's own axis, so the card keeps its size. */
const BAR_HEIGHTS = [38, 62, 24, 80, 46, 30, 56]

export function ChartSkeleton({ bars = 7 }) {
  return (
    <LoadingRegion label="Loading your study time…" className="pg-chart pg-chart-skel">
      <div className="pg-chart-grid">
        {[0, 1, 2, 3].map((i) => <div key={i} className="pg-gridline" />)}
      </div>
      <div className="pg-bars">
        {Array.from({ length: bars }, (_, i) => (
          <div key={i} className="pg-bar-col">
            <span className="pg-bar-hit">
              <Sk w="min(36px, 62%)" h={`${BAR_HEIGHTS[i % BAR_HEIGHTS.length]}%`} r="6px 6px 0 0" />
            </span>
            <span className="pg-bar-label"><Sk w={26} h={10} /></span>
          </div>
        ))}
      </div>
    </LoadingRegion>
  )
}

/** Ring and donut cards: a circle beside a few lines. */
export function RingSkeleton({ size = 112, lines = 3, label = 'Loading…' }) {
  return (
    <LoadingRegion label={label} className="pg-ring-skel">
      <Sk w={size} h={size} r="50%" />
      <SkText lines={lines} />
    </LoadingRegion>
  )
}
