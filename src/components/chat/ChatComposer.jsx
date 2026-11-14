import { forwardRef, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { MAX_MESSAGE_CHARS } from '../../lib/chat'
import { ACCEPTED_EXTENSIONS, formatBytes } from '../../lib/materials'
import { IconBook, IconNotes, IconPaperclip, IconSend, IconX } from './ChatIcons'

const attachmentStatus = (status, buddyName) =>
  ({ uploading: 'Uploading…', reading: `${buddyName} is reading it…`, ready: 'Ready to send' })[status]

/**
 * The message box. Enter sends, Shift+Enter adds a line.
 *
 * The paperclip attaches a file, which appears here and is read straight
 * away, or picks an existing study pack as context. A file can be sent once
 * Novi has read it; it then becomes the chat's study pack.
 */
export const ChatComposer = forwardRef(function ChatComposer(
  { value, onChange, onSubmit, busy, packs, packsLoading, pack, onPackChange, attachment, onAttach, onAttachAnyway, onRemoveAttachment, hint, buddyName = 'Novi' },
  textareaRef,
) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const fileRef = useRef(null)
  const menuId = useId()
  const hintId = useId()

  // Grow with the text up to a limit, then scroll.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [value, textareaRef])

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [menuOpen])

  const tooLong = value.length > MAX_MESSAGE_CHARS
  const fileBusy = attachment && (attachment.status === 'uploading' || attachment.status === 'reading')
  const fileReady = attachment?.status === 'ready'
  const canSend = (value.trim().length > 0 || fileReady) && !busy && !tooLong && !fileBusy

  const send = () => {
    if (canSend) onSubmit(value)
  }

  const onKeyDown = (event) => {
    // isComposing: Enter that confirms an IME candidate must not send.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send()
    }
  }

  const choose = (next) => {
    onPackChange(next)
    setMenuOpen(false)
    textareaRef.current?.focus()
  }

  const hintText = tooLong
    ? `That's ${value.length.toLocaleString()} characters. Messages can be up to ${MAX_MESSAGE_CHARS.toLocaleString()}.`
    : fileBusy
      ? `You can send once ${buddyName} has read your file.`
      : hint

  return (
    <form
      className="ch-composer"
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
    >
      {attachment ? (
        <div className="ch-context">
          <span className={`ch-file is-${attachment.status}`}>
            <span className="ch-file-icon">
              {fileBusy ? <span className="ch-spinner" aria-hidden="true" /> : <IconNotes width={16} height={16} />}
            </span>
            <span className="ch-file-text">
              <span className="ch-file-name" title={attachment.name}>{attachment.name}</span>
              <span className="ch-file-status" role="status">
                {attachment.status === 'failed'
                  ? attachment.error ?? 'This file could not be read.'
                  : attachment.existing
                    ? `Already in your packs as \u201c${attachment.existing}\u201d \u00b7 ${attachment.status === 'ready' ? 'using that pack' : `${buddyName} is still reading it\u2026`}`
                    : `${formatBytes(attachment.size)} · ${attachmentStatus(attachment.status, buddyName)}`}
              </span>
              {attachment.existing && onAttachAnyway && (
                <button type="button" className="ch-file-anyway" onClick={onAttachAnyway}>
                  Upload a new copy
                </button>
              )}
            </span>
            <button type="button" className="ch-chip-x" onClick={onRemoveAttachment} aria-label={`Remove ${attachment.name}`}>
              <IconX width={14} height={14} />
            </button>
          </span>
        </div>
      ) : pack ? (
        <div className="ch-context">
          <span className="ch-chip">
            <IconBook width={15} height={15} />
            <span className="ch-chip-text">Using <strong>{pack.title}</strong></span>
            <button type="button" className="ch-chip-x" onClick={() => onPackChange(null)} aria-label={`Stop using ${pack.title}`}>
              <IconX width={14} height={14} />
            </button>
          </span>
        </div>
      ) : null}

      <div className="ch-input-row">
        <div className="ch-attach" ref={menuRef}>
          <button
            type="button"
            className="ch-icon-btn ch-attach-btn"
            aria-label="Attach a file or use a study pack"
            title="Attach a file or use a study pack"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <IconPaperclip />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = '' // so choosing the same file again still fires
              if (file) onAttach(file)
            }}
          />
          {menuOpen && (
            <div className="ch-menu" id={menuId} role="dialog" aria-label="Attach a file or use a study pack">
              <button
                type="button"
                className="ch-menu-attach"
                disabled={Boolean(fileBusy)}
                onClick={() => {
                  setMenuOpen(false)
                  fileRef.current?.click()
                }}
              >
                <span className="ch-menu-attach-icon"><IconPaperclip width={16} height={16} /></span>
                <span>
                  <span className="ch-menu-title">Attach a file</span>
                  <span className="ch-menu-sub">PDF, PowerPoint, Word, notes or a photo, up to 50 MB.</span>
                </span>
              </button>

              <p className="ch-menu-title ch-menu-section">Or use a study pack</p>
              {packsLoading ? (
                <p className="ch-menu-empty">Loading your packs…</p>
              ) : packs.length === 0 ? (
                <p className="ch-menu-empty">No study packs yet.</p>
              ) : (
                <ul className="ch-menu-list">
                  {packs.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={`ch-menu-item${pack?.id === p.id ? ' is-on' : ''}`}
                        aria-pressed={pack?.id === p.id}
                        onClick={() => choose(p)}
                      >
                        <IconBook width={15} height={15} />
                        <span>{p.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {pack && (
                <div className="ch-menu-foot">
                  <button type="button" className="ch-menu-link" onClick={() => choose(null)}>
                    Don&apos;t use a pack
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <label className="sr-only" htmlFor="ch-input">Message {buddyName}</label>
        <textarea
          id="ch-input"
          ref={textareaRef}
          className="ch-input"
          rows={1}
          value={value}
          placeholder={fileReady ? 'Add a message, or just send the file…' : 'Type your message here...'}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          aria-describedby={hintText ? hintId : undefined}
          enterKeyHint="send"
        />

        <button type="submit" className="ch-send" disabled={!canSend} aria-label={busy ? `${buddyName} is replying` : 'Send message'}>
          <IconSend />
        </button>
      </div>

      {hintText && (
        <p id={hintId} className={`ch-hint${tooLong ? ' is-error' : ''}`}>{hintText}</p>
      )}
    </form>
  )
})
