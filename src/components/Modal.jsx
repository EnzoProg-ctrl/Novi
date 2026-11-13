import { useEffect, useRef } from 'react'
import './modal.css'

/**
 * A pop-up on the native <dialog> element: showModal() keeps focus inside,
 * makes the page behind inert and handles Escape.
 *
 * Controlled by `open`. When it turns false the exit animation plays, then the
 * dialog closes and `onClosed` fires; keep the content mounted until then so
 * nothing disappears mid-animation. `locked` blocks Escape and backdrop clicks,
 * e.g. while saving.
 */
export function Modal({ open, onRequestClose, onClosed, locked = false, labelledBy, describedBy, className = '', children }) {
  const ref = useRef(null)
  const pressedBackdrop = useRef(false)
  const onClosedRef = useRef(onClosed)
  useEffect(() => {
    onClosedRef.current = onClosed
  })

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open) {
      dialog.classList.remove('is-closing')
      if (!dialog.open) dialog.showModal()
      return
    }
    if (!dialog.open) return

    dialog.classList.add('is-closing')
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      dialog.classList.remove('is-closing')
      if (dialog.open) dialog.close()
      onClosedRef.current?.()
    }
    const onEnd = (event) => {
      if (event.target === dialog && event.animationName === 'nv-modal-out') finish()
    }
    dialog.addEventListener('animationend', onEnd)
    // In case the exit animation never reports back (e.g. it was skipped).
    const fallback = setTimeout(finish, 400)
    return () => {
      dialog.removeEventListener('animationend', onEnd)
      clearTimeout(fallback)
    }
  }, [open])

  const tryClose = () => {
    if (!locked) onRequestClose?.()
  }

  return (
    <dialog
      ref={ref}
      className={`nv-modal${className ? ` ${className}` : ''}`}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(event) => {
        event.preventDefault()
        tryClose()
      }}
      onMouseDown={(event) => {
        pressedBackdrop.current = event.target === ref.current
      }}
      onClick={(event) => {
        // Only the backdrop is the dialog element itself; the panel covers the rest.
        if (event.target === ref.current && pressedBackdrop.current) tryClose()
      }}
    >
      {children}
    </dialog>
  )
}
