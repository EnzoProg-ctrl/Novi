import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import './select.css'

/**
 * Dropdown used everywhere instead of the native <select>.
 *
 * A native select's list is drawn by the operating system, so it cannot be
 * animated or styled consistently. This keeps what made the native one good:
 * a real button that a <label htmlFor> activates, the WAI-ARIA listbox
 * pattern for assistive tech, and the same keys (arrows, Home/End, Enter or
 * Space, Escape, and typing to jump to an option).
 *
 * Options are { value, label, hint? }. `hint` is shown muted beside the label
 * in the list only (for example a duration). `onChange` receives the option's
 * own value, so numbers stay numbers.
 */
export function Select({
  id,
  value,
  options,
  onChange,
  labelledBy,
  ariaLabel,
  describedBy,
  className = '',
  block = false,
  disabled = false,
  invalid = false,
}) {
  const autoId = useId()
  const baseId = id ?? `sel-${autoId}`
  const listId = `${baseId}-list`
  const valueId = `${baseId}-value`
  const hiddenLabelId = `${baseId}-label`

  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [up, setUp] = useState(false)
  const [place, setPlace] = useState(null)
  const wrapRef = useRef(null)
  const buttonRef = useRef(null)
  const listRef = useRef(null)
  const typed = useRef({ text: '', at: 0 })

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value))
  const selected = options[selectedIndex]
  const labelIds = `${labelledBy ?? hiddenLabelId} ${valueId}`

  function openList(start = selectedIndex) {
    if (disabled) return
    // The list is position: fixed, placed from the button's position on screen.
    // That way it never stretches, scrolls or gets clipped by a card or pop-up
    // around it. It opens upwards when there is clearly more room above.
    const rect = buttonRef.current.getBoundingClientRect()
    const needed = Math.min(options.length * 38 + 12, 292)
    const below = window.innerHeight - rect.bottom
    const openUp = below < needed && rect.top > below
    const alignRight = rect.left + Math.max(rect.width, 240) > window.innerWidth - 8
    setUp(openUp)
    setPlace({
      minWidth: rect.width,
      ...(alignRight ? { right: window.innerWidth - rect.right, left: 'auto' } : { left: rect.left }),
      ...(openUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
    })
    setActive(start)
    setOpen(true)
  }

  function close(refocus = true) {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  function choose(index) {
    const option = options[index]
    close()
    if (option && option.value !== value) onChange(option.value)
  }

  // Focus the list once it is shown, so the keyboard drives it.
  useLayoutEffect(() => {
    if (open) listRef.current?.focus({ preventScroll: true })
  }, [open])

  // Keep the active option in view when moving through a long list.
  useEffect(() => {
    if (!open) return
    document.getElementById(`${baseId}-opt-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, baseId])

  // A click elsewhere closes it, without stealing focus back. So does scrolling
  // or resizing what is underneath, as a native dropdown does, since the list
  // is fixed to where the button was.
  useEffect(() => {
    if (!open) return
    const onDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) close(false)
    }
    const onScroll = (event) => {
      if (event.target !== listRef.current) close(false)
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

  /** Jump to the next option starting with what has been typed recently. */
  function typeAhead(key, from) {
    const now = Date.now()
    const t = typed.current
    t.text = now - t.at < 600 ? t.text + key.toLowerCase() : key.toLowerCase()
    t.at = now
    const n = options.length
    for (let step = t.text.length > 1 ? 0 : 1; step <= n; step++) {
      const i = (from + step) % n
      if (String(options[i].label).toLowerCase().startsWith(t.text)) return i
    }
    return -1
  }

  function onButtonKey(event) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      openList(event.key === 'ArrowUp' ? Math.max(0, selectedIndex - 1) : selectedIndex)
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const i = typeAhead(event.key, selectedIndex)
      if (i >= 0) openList(i)
    }
  }

  function onListKey(event) {
    const last = options.length - 1
    const move = (i) => {
      event.preventDefault()
      setActive(Math.min(last, Math.max(0, i)))
    }
    switch (event.key) {
      case 'ArrowDown': return move(active + 1)
      case 'ArrowUp': return move(active - 1)
      case 'Home': return move(0)
      case 'End': return move(last)
      case 'PageDown': return move(active + 5)
      case 'PageUp': return move(active - 5)
      case 'Enter':
      case ' ':
        event.preventDefault()
        return choose(active)
      case 'Escape':
        // Stop it reaching a surrounding pop-up, which would close too.
        event.preventDefault()
        event.stopPropagation()
        return close()
      case 'Tab':
        return close(false)
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const i = typeAhead(event.key, active)
          if (i >= 0) move(i)
        }
    }
  }

  return (
    <span ref={wrapRef} className={`nv-select${block ? ' is-block' : ''}${open ? ' is-open' : ''}`}>
      {!labelledBy && <span id={hiddenLabelId} className="sr-only">{ariaLabel}</span>}
      <button
        ref={buttonRef}
        id={baseId}
        type="button"
        className={`nv-select-trigger ${className}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={labelIds}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onButtonKey}
      >
        <span id={valueId} className="nv-select-value">{selected?.label}</span>
        <svg className="nv-select-chevron" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        tabIndex={-1}
        aria-labelledby={labelledBy ?? hiddenLabelId}
        aria-activedescendant={open ? `${baseId}-opt-${active}` : undefined}
        className={`nv-select-list${open ? ' is-open' : ''}${up ? ' is-up' : ''}`}
        style={place ?? undefined}
        onKeyDown={onListKey}
        onBlur={(event) => {
          if (!wrapRef.current?.contains(event.relatedTarget)) close(false)
        }}
      >
        {options.map((option, i) => (
          <li
            key={String(option.value)}
            id={`${baseId}-opt-${i}`}
            role="option"
            aria-selected={i === selectedIndex}
            className={`nv-select-option${i === active ? ' is-active' : ''}${i === selectedIndex ? ' is-selected' : ''}`}
            onPointerMove={() => setActive(i)}
            onClick={() => choose(i)}
          >
            <span className="nv-select-option-label">{option.label}</span>
            {option.hint && <span className="nv-select-option-hint">{option.hint}</span>}
            {i === selectedIndex && (
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </li>
        ))}
      </ul>
    </span>
  )
}
