import { useEffect, useId, useRef, useState } from 'react'
import { MAX_TITLE_CHARS } from '../../lib/chat'
import { Modal } from '../Modal'
import { IconX } from './ChatIcons'
import { friendlyError } from '../../lib/errors'

/**
 * Rename a conversation. Prefilled with the current title; the change is only
 * kept once the server has saved it, and a failure leaves the typed name in
 * place so it can be retried.
 */
export function RenameDialog({ open, conversation, onCancel, onSave, onClosed }) {
  const titleId = useId()
  const inputId = useId()
  const errorId = useId()
  const inputRef = useRef(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  // Fresh each time it opens, with the name selected so typing replaces it.
  useEffect(() => {
    if (!open || !conversation) return
    setValue(conversation.title)
    setError(null)
    setSaving(false)
    // After this render has re-enabled the input (it is disabled while saving).
    const t = setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
    return () => clearTimeout(t)
  }, [open, conversation])

  const submit = async (event) => {
    event.preventDefault()
    if (saving) return
    const clean = value.trim()
    if (!clean) {
      setError('Enter a name for this conversation.')
      inputRef.current?.focus()
      return
    }
    if (clean.length > MAX_TITLE_CHARS) {
      setError(`Names can be up to ${MAX_TITLE_CHARS} characters.`)
      return
    }
    if (clean === conversation.title) {
      onCancel()
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(clean)
    } catch (err) {
      setError(friendlyError(err, "The new name couldn't be saved. Try again."))
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onRequestClose={onCancel} onClosed={onClosed} locked={saving} labelledBy={titleId} className="ch-dialog">
      <form className="nv-modal-panel" onSubmit={submit} noValidate>
        <div className="nv-modal-head">
          <h2 id={titleId} className="nv-modal-title">Rename conversation</h2>
          <button type="button" className="nv-modal-close" onClick={onCancel} disabled={saving} aria-label="Close">
            <IconX />
          </button>
        </div>

        <div className="field">
          <label className="label" htmlFor={inputId}>Conversation name</label>
          <input
            ref={inputRef}
            id={inputId}
            className="input"
            value={value}
            maxLength={MAX_TITLE_CHARS}
            onChange={(event) => {
              setValue(event.target.value)
              if (error) setError(null)
            }}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? errorId : undefined}
            disabled={saving}
            autoComplete="off"
            enterKeyHint="done"
          />
          {error && <p id={errorId} className="ch-dialog-error" role="alert">{error}</p>}
        </div>

        <div className="nv-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Confirm before deleting. The conversation stays in the list until the
 * server confirms; a failure is shown here with the button ready to retry.
 */
export function DeleteDialog({ open, conversation, busy, error, onCancel, onConfirm, onClosed }) {
  const titleId = useId()
  const textId = useId()
  const cancelRef = useRef(null)

  // Start on Cancel, the safe choice, so a stray Enter never deletes.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => cancelRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  return (
    <Modal
      open={open}
      onRequestClose={onCancel}
      onClosed={onClosed}
      locked={busy}
      labelledBy={titleId}
      describedBy={textId}
      className="ch-dialog"
    >
      <div className="nv-modal-panel">
        <div className="nv-modal-head">
          <h2 id={titleId} className="nv-modal-title">Delete conversation?</h2>
          <button type="button" className="nv-modal-close" onClick={onCancel} disabled={busy} aria-label="Close">
            <IconX />
          </button>
        </div>
        <p id={textId} className="ch-dialog-text">
          Are you sure you want to delete &ldquo;{conversation?.title}&rdquo;? This action cannot be undone.
        </p>
        {error && <p className="ch-dialog-error" role="alert">{error}</p>}
        <div className="nv-modal-actions">
          <button ref={cancelRef} type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="btn ch-btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete conversation'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
