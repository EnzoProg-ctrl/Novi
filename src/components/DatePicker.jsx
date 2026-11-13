import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { addDays, addMonths, dateKey, monthGrid, parseLocal, sameDay, startOfDay } from '../lib/calendar-dates'
import { IconCalendar, IconChevronRight } from './app/AppIcons'
import './select.css'
import './date-picker.css'

const fmt = (options) => new Intl.DateTimeFormat(undefined, options)
const triggerFormat = fmt({ weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
const monthFormat = fmt({ month: 'long', year: 'numeric' })
const dayFormat = fmt({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
const weekdayShort = fmt({ weekday: 'short' })
const weekdayLong = fmt({ weekday: 'long' })

const toDate = (key) => (key ? parseLocal(key, '00:00') : null)
const sameMonth = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
const PANEL_WIDTH = 296
const PANEL_HEIGHT = 352

/**
 * Date field used instead of the native <input type="date">, whose calendar
 * is drawn by the browser and can't match Novi. Same contract as the native
 * input: `value` and `onChange` use "YYYY-MM-DD" strings.
 *
 * A button opens a small calendar (the WAI-ARIA date picker dialog pattern):
 * arrows move by day and week, Page Up/Down by month (with Shift, by year),
 * Home/End to the week's ends, Enter picks, Escape closes. Weeks start on the
 * day chosen in Settings, like every other calendar in Novi.
 */
export function DatePicker({
  id,
  value,
  onChange,
  labelledBy,
  describedBy,
  invalid = false,
  min,
  max,
  placeholder = 'Pick a date',
  disabled = false,
}) {
  const autoId = useId()
  const baseId = id ?? `date-${autoId}`
  const panelId = `${baseId}-panel`
  const valueId = `${baseId}-value`
  const monthId = `${baseId}-month`

  const selected = toDate(value)
  const minDate = toDate(min)
  const maxDate = toDate(max)
  const outOfRange = (d) => Boolean((minDate && d < minDate) || (maxDate && d > maxDate))

  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => selected ?? startOfDay(new Date()))
  const [focus, setFocus] = useState(view)
  const [place, setPlace] = useState(null)
  const [up, setUp] = useState(false)
  const wrapRef = useRef(null)
  const buttonRef = useRef(null)
  const panelRef = useRef(null)
  // Only keyboard moves (and opening) pull focus onto a day; clicking the
  // month arrows leaves it on the arrow so it can be clicked again.
  const focusDay = useRef(false)

  function openPanel() {
    if (disabled) return
    // Fixed to the button's position on screen, like Select, so a card or
    // pop-up around it can't clip it. Opens upwards when there is more room.
    const rect = buttonRef.current.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom
    const openUp = below < PANEL_HEIGHT + 12 && rect.top > below
    const alignRight = rect.left + PANEL_WIDTH > window.innerWidth - 8
    setUp(openUp)
    setPlace({
      ...(alignRight ? { right: Math.max(8, window.innerWidth - rect.right), left: 'auto' } : { left: Math.max(8, rect.left) }),
      ...(openUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
    })
    let start = selected ?? startOfDay(new Date())
    if (minDate && start < minDate) start = minDate
    if (maxDate && start > maxDate) start = maxDate
    setView(start)
    setFocus(start)
    focusDay.current = true
    setOpen(true)
  }

  function close(refocus = true) {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  function pick(day) {
    if (outOfRange(day)) return
    close()
    const key = dateKey(day)
    if (key !== value) onChange(key)
  }

  function moveTo(day) {
    focusDay.current = true
    setFocus(day)
    if (!sameMonth(day, view)) setView(day)
  }

  function shiftMonth(step) {
    const next = addMonths(view, step)
    setView(next)
    setFocus(addMonths(focus, step))
  }

  useLayoutEffect(() => {
    if (!open || !focusDay.current) return
    focusDay.current = false
    panelRef.current?.querySelector(`[data-day="${dateKey(focus)}"]`)?.focus({ preventScroll: true })
  }, [open, focus, view])

  // A click elsewhere closes it; so do scrolling and resizing underneath,
  // since the panel is fixed to where the button was.
  useEffect(() => {
    if (!open) return
    const onDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) close(false)
    }
    const onScroll = (event) => {
      if (!panelRef.current?.contains(event.target)) close(false)
    }
    const onResize = () => close(false)
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function onButtonKey(event) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      openPanel()
    }
  }

  function onPanelKey(event) {
    if (event.key === 'Escape') {
      // Stop it reaching a surrounding pop-up, which would close too.
      event.preventDefault()
      event.stopPropagation()
      close()
    }
  }

  function onGridKey(event) {
    const weekStart = monthGrid(focus).find((week) => week.some((d) => sameDay(d, focus)))?.[0] ?? focus
    const moves = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      Home: () => weekStart,
      End: () => addDays(weekStart, 6),
      PageUp: () => addMonths(focus, event.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focus, event.shiftKey ? 12 : 1),
    }
    if (moves[event.key]) {
      event.preventDefault()
      moveTo(moves[event.key]())
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      pick(focus)
    }
  }

  const today = startOfDay(new Date())
  const weeks = monthGrid(view)

  return (
    <span ref={wrapRef} className={`nv-select nv-date is-block${open ? ' is-open' : ''}`}>
      <button
        ref={buttonRef}
        id={baseId}
        type="button"
        className="nv-select-trigger input nv-date-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        aria-labelledby={labelledBy ? `${labelledBy} ${valueId}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openPanel())}
        onKeyDown={onButtonKey}
      >
        <span id={valueId} className={`nv-select-value${selected ? '' : ' nv-date-placeholder'}`}>
          {selected ? triggerFormat.format(selected) : placeholder}
        </span>
        <IconCalendar className="nv-date-icon" width={17} height={17} />
      </button>

      <div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-modal="false"
        aria-labelledby={monthId}
        className={`nv-date-panel${open ? ' is-open' : ''}${up ? ' is-up' : ''}`}
        style={place ?? undefined}
        onKeyDown={onPanelKey}
        onBlur={(event) => {
          if (open && !wrapRef.current?.contains(event.relatedTarget)) close(false)
        }}
      >
        <div className="nv-date-head">
          <button type="button" className="nv-date-nav" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <IconChevronRight width={18} height={18} style={{ transform: 'scaleX(-1)' }} />
          </button>
          <span id={monthId} className="nv-date-month" aria-live="polite">{monthFormat.format(view)}</span>
          <button type="button" className="nv-date-nav" onClick={() => shiftMonth(1)} aria-label="Next month">
            <IconChevronRight width={18} height={18} />
          </button>
        </div>

        {open && (
          <table role="grid" className="nv-date-grid" aria-labelledby={monthId} onKeyDown={onGridKey}>
            <thead>
              <tr>
                {weeks[0].map((d) => (
                  <th key={d.getDay()} scope="col" abbr={weekdayLong.format(d)}>{weekdayShort.format(d)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={dateKey(week[0])}>
                  {week.map((d) => {
                    const isSelected = selected && sameDay(d, selected)
                    const blocked = outOfRange(d)
                    const classes = [
                      'nv-date-day',
                      sameMonth(d, view) ? '' : 'is-outside',
                      sameDay(d, today) ? 'is-today' : '',
                      isSelected ? 'is-selected' : '',
                      blocked ? 'is-blocked' : '',
                    ].filter(Boolean).join(' ')
                    return (
                      <td key={dateKey(d)} role="gridcell" aria-selected={isSelected || undefined}>
                        <button
                          type="button"
                          className={classes}
                          data-day={dateKey(d)}
                          tabIndex={sameDay(d, focus) ? 0 : -1}
                          aria-label={dayFormat.format(d)}
                          aria-current={sameDay(d, today) ? 'date' : undefined}
                          aria-disabled={blocked || undefined}
                          onClick={() => pick(d)}
                        >
                          {d.getDate()}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="nv-date-foot">
          <button type="button" className="nv-date-today" onClick={() => pick(today)} disabled={outOfRange(today)}>
            Today
          </button>
          {selected && (
            <span className="nv-date-chosen">{triggerFormat.format(selected)}</span>
          )}
        </div>
      </div>
    </span>
  )
}
