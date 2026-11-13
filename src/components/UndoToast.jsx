import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  dismissDeleteFailure,
  getDeleteSnapshot,
  pauseDelete,
  resumeDelete,
  subscribeDeletes,
  undoDelete,
  UNDO_MS,
} from '../lib/pendingDelete'
import './undo-toast.css'

const isTyping = (el) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))

/**
 * "Deleted … Undo" while a deletion waits (lib/pendingDelete.js). Mounted once
 * in the app shell, so it stays on screen when the student changes page.
 *
 * The bar shows the time left. Pointing at or focusing the toast pauses it,
 * so the student isn't rushed, and Ctrl/Cmd+Z undoes from anywhere except a
 * text field (where it should undo typing).
 */
export function UndoToast() {
  const { pending, failure } = useSyncExternalStore(subscribeDeletes, getDeleteSnapshot)
  const [restored, setRestored] = useState(null) // key of the deletion just undone

  function undo() {
    if (pending && undoDelete()) setRestored(pending.key)
  }

  useEffect(() => {
    if (!pending || pending.committing) return
    const onKey = (event) => {
      if (event.key.toLowerCase() !== 'z' || !(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return
      if (isTyping(event.target)) return
      event.preventDefault()
      if (undoDelete()) setRestored(pending.key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending])

  // "Restored" and failure messages fade out by themselves.
  useEffect(() => {
    if (!restored) return
    const timer = setTimeout(() => setRestored(null), 2500)
    return () => clearTimeout(timer)
  }, [restored])
  useEffect(() => {
    if (!failure) return
    const timer = setTimeout(dismissDeleteFailure, 6000)
    return () => clearTimeout(timer)
  }, [failure])

  if (pending) {
    const count = pending.materials.length
    const message = count === 1
      ? <>Deleted <strong>{pending.materials[0].title}</strong> and its study pack.</>
      : <>Deleted <strong>{count} materials</strong> and their study packs.</>
    return (
      <div
        key={pending.key}
        className="nv-undo"
        role="status"
        onMouseEnter={pauseDelete}
        onMouseLeave={resumeDelete}
        onFocus={pauseDelete}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) resumeDelete()
        }}
      >
        <span className="nv-undo-text">{pending.committing ? 'Deleting…' : message}</span>
        <button type="button" className="nv-undo-btn" onClick={undo} disabled={pending.committing}>
          Undo
        </button>
        <span
          className="nv-undo-bar"
          aria-hidden="true"
          style={{
            animationDuration: `${UNDO_MS}ms`,
            animationPlayState: pending.paused || pending.committing ? 'paused' : 'running',
          }}
        />
      </div>
    )
  }

  if (failure) {
    return (
      <div key={failure.key} className="nv-undo is-error" role="alert">
        <span className="nv-undo-text">
          {failure.count === 1 ? "That material couldn't be deleted" : "Those materials couldn't be deleted"}, so
          {failure.count === 1 ? ' it is' : ' they are'} back in your list. Try again in a moment.
        </span>
        <button type="button" className="nv-undo-btn" onClick={dismissDeleteFailure}>OK</button>
      </div>
    )
  }

  if (restored) {
    return (
      <div key={restored} className="nv-undo is-done" role="status">
        <span className="nv-undo-text">Restored.</span>
      </div>
    )
  }

  return null
}
