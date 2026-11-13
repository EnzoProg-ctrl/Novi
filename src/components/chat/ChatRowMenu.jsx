import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IconPencil, IconTrash } from './ChatIcons'

const GAP = 6
const EDGE = 8

/**
 * The Rename / Delete menu for one conversation in Recent Chats.
 *
 * Positioned `fixed` from its ⋯ button, so a scrolling panel or a pop-up
 * around it can never clip it. It is rendered next to the button that opened
 * it, which keeps it inside the same <dialog> when the list is shown in the
 * drawer or in "See all" (a dialog sits above everything else on the page).
 *
 * Follows the WAI-ARIA menu pattern: focus moves to the first item, arrow
 * keys move between items, Escape closes and returns focus to the button.
 */
export function ChatRowMenu({ anchor, title, onRename, onDelete, onClose }) {
  const ref = useRef(null)
  const [place, setPlace] = useState(null)

  // Under the button, aligned to its right edge; above it if there is not
  // enough room below; always inside the viewport.
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return
    const a = anchor.getBoundingClientRect()
    // Rendered at top/left 0 first, so this is where "0" really is. Normally
    // the viewport corner, but a transformed ancestor (the drawer while it
    // slides in) moves it.
    const m = ref.current.getBoundingClientRect()
    const below = window.innerHeight - a.bottom
    const top = below < m.height + GAP + EDGE && a.top > below ? a.top - m.height - GAP : a.bottom + GAP
    const left = Math.min(Math.max(EDGE, a.right - m.width), window.innerWidth - m.width - EDGE)
    setPlace({ top: Math.max(EDGE, top) - m.top, left: left - m.left })
  }, [anchor])

  // Focus the first item once the menu is placed: while it is still hidden
  // for measuring, the browser would ignore the focus.
  const focused = useRef(false)
  useEffect(() => {
    if (!place || focused.current) return
    focused.current = true
    ref.current?.querySelector('[role="menuitem"]')?.focus()
  }, [place])

  useEffect(() => {
    const closeAndReturn = () => {
      onClose()
      anchor?.focus()
    }
    const onDown = (event) => {
      // The ⋯ button toggles the menu itself.
      if (ref.current?.contains(event.target) || anchor?.contains(event.target)) return
      onClose()
    }
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      // Keep a surrounding drawer or pop-up open: only the menu closes.
      event.preventDefault()
      event.stopPropagation()
      closeAndReturn()
    }
    const onScroll = (event) => {
      if (!ref.current?.contains(event.target)) onClose()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onClose)
    }
  }, [anchor, onClose])

  const onMenuKey = (event) => {
    const items = [...ref.current.querySelectorAll('[role="menuitem"]')]
    const i = items.indexOf(document.activeElement)
    const go = (n) => {
      event.preventDefault()
      items[(n + items.length) % items.length]?.focus()
    }
    if (event.key === 'ArrowDown') go(i + 1)
    else if (event.key === 'ArrowUp') go(i - 1)
    else if (event.key === 'Home') go(0)
    else if (event.key === 'End') go(items.length - 1)
    else if (event.key === 'Tab') onClose()
  }

  return (
    <div
      ref={ref}
      className="ch-row-menu"
      role="menu"
      aria-label={`Options for ${title}`}
      style={place ? { top: place.top, left: place.left } : { top: 0, left: 0, visibility: 'hidden' }}
      onKeyDown={onMenuKey}
      onClick={(event) => event.stopPropagation()}
    >
      <button type="button" role="menuitem" className="ch-row-menu-item" onClick={onRename}>
        <IconPencil width={16} height={16} />
        <span>Rename</span>
      </button>
      <span className="ch-row-menu-sep" role="separator" />
      <button type="button" role="menuitem" className="ch-row-menu-item is-danger" onClick={onDelete}>
        <IconTrash width={16} height={16} />
        <span>Delete</span>
      </button>
    </div>
  )
}
