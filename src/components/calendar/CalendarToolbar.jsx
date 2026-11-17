import { periodLabel, rangeFor } from '../../lib/calendar-dates'
import { Select } from '../Select'
import { IconChevronLeft, IconChevronRight } from './CalendarIcons'
import { SESSION_TYPES } from './sessionTypes'

const VIEW_LABEL = { month: 'Month', week: 'Week', day: 'Day' }

/** View switch, what the colours mean, and the study pack filter. */
export function CalendarToolbar({ view, packs, filter, onViewChange, onFilterChange }) {
  return (
    <div className="cal-toolbar">
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

      <ul className="cal-legend" aria-label="Session types">
        {SESSION_TYPES.map(({ value, label, short, tone, Icon }) => (
          <li key={value} className={`cal-legend-item tone-${tone}`} title={label}>
            <span className="cal-legend-mark"><Icon width={15} height={15} /></span>
            {short}
          </li>
        ))}
      </ul>

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
  )
}

/** The period and its arrows, at the top of the calendar card. Today appears only when away from it. */
export function CalendarNav({ view, date, now, onPrev, onNext, onToday }) {
  const unit = VIEW_LABEL[view].toLowerCase()
  const { start, end } = rangeFor(view, date)
  const showingToday = now >= start && now < end

  return (
    <div className="cal-nav">
      <button type="button" className="cal-icon-btn" onClick={onPrev} aria-label={`Previous ${unit}`}>
        <IconChevronLeft />
      </button>
      <h2 className="cal-period" aria-live="polite">{periodLabel(view, date)}</h2>
      <button type="button" className="cal-icon-btn" onClick={onNext} aria-label={`Next ${unit}`}>
        <IconChevronRight />
      </button>
      {!showingToday && (
        <button type="button" className="cal-today" onClick={onToday}>Today</button>
      )}
    </div>
  )
}
