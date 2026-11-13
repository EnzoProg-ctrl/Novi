import { periodLabel, rangeFor } from '../../lib/calendar-dates'
import { Select } from '../Select'
import { IconChevronLeft, IconChevronRight } from './CalendarIcons'
import { SESSION_TYPES } from './sessionTypes'

const VIEW_LABEL = { month: 'Month', week: 'Week', day: 'Day' }

export function CalendarToolbar({
  view,
  date,
  now,
  packs,
  filter,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  onFilterChange,
}) {
  const unit = VIEW_LABEL[view].toLowerCase()
  const { start, end } = rangeFor(view, date)
  const showingToday = now >= start && now < end

  return (
    <div className="cal-toolbar">
      <div className="cal-toolbar-row">
        {/* Today sits with the view buttons, so only the arrows and the date
            share the centre and the date is truly centred. */}
        <div className="cal-lead">
          <div className="cal-seg" role="group" aria-label="Calendar view">
            {Object.entries(VIEW_LABEL).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`cal-seg-btn${view === value ? ' is-active' : ''}`}
                aria-pressed={view === value}
                onClick={() => onViewChange(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="cal-today"
            onClick={onToday}
            aria-label={showingToday ? 'Today (already showing)' : 'Go to today'}
          >
            Today
          </button>
        </div>

        <div className="cal-nav">
          <button type="button" className="cal-icon-btn" onClick={onPrev} aria-label={`Previous ${unit}`}>
            <IconChevronLeft />
          </button>
          <h2 className="cal-period" aria-live="polite">{periodLabel(view, date)}</h2>
          <button type="button" className="cal-icon-btn" onClick={onNext} aria-label={`Next ${unit}`}>
            <IconChevronRight />
          </button>
        </div>

        <div className="cal-filter">
          <Select
            className="pk-select"
            ariaLabel="Filter by study pack"
            value={filter}
            onChange={onFilterChange}
            options={[
              { value: 'all', label: 'All study packs' },
              ...packs.map((pack) => ({ value: pack.id, label: pack.title })),
            ]}
          />
        </div>
      </div>

      <ul className="cal-legend" aria-label="Session types">
        {SESSION_TYPES.map(({ value, label, tone, Icon }) => (
          <li key={value} className={`cal-legend-item tone-${tone}`}>
            <span className="cal-legend-mark"><Icon /></span>
            {label}
          </li>
        ))}
      </ul>
    </div>
  )
}
