import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/auth-context'
import {
  ACCEPTED_EXTENSIONS,
  DEFAULT_QUESTION_COUNT,
  QUESTION_COUNTS,
  estimateWordCount,
  formatBytes,
  processMaterial,
  questionCapFor,
  uploadMaterial,
  validateFile,
} from '../../lib/materials'
import { IconClose } from '../app/AppIcons'
import { MascotRig } from '../MascotRig'
import './upload-dialog.css'

/**
 * The add-material pop-up.
 *
 * A native <dialog> shown with showModal(), so focus stays inside it, the page
 * behind is inert and Escape is handled by the browser. Closing is animated:
 * the parent moves `state` to 'closing', the exit animation plays, and only
 * then is the dialog actually closed.
 */
export function UploadDialog({ state, session, onRequestClose, onClosed, onUploaded }) {
  const ref = useRef(null)
  // True while a file is uploading; the pop-up must not close mid-upload.
  const locked = useRef(false)
  const pressedBackdrop = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (state === 'open' && !dialog.open) dialog.showModal()
    if (state === 'closing') {
      // In case the exit animation never reports back (e.g. it was skipped).
      const fallback = setTimeout(finishClose, 400)
      return () => clearTimeout(fallback)
    }
  }, [state]) // eslint-disable-line react-hooks/exhaustive-deps

  function finishClose() {
    if (ref.current?.open) ref.current.close()
    onClosed()
  }

  function tryClose() {
    if (!locked.current) onRequestClose()
  }

  return (
    <dialog
      ref={ref}
      className={`up-dialog${state === 'closing' ? ' is-closing' : ''}`}
      aria-labelledby="upload-title"
      onCancel={(event) => {
        // Escape: animate out like every other way of closing.
        event.preventDefault()
        tryClose()
      }}
      onMouseDown={(event) => {
        pressedBackdrop.current = event.target === ref.current
      }}
      onClick={(event) => {
        // The dialog element itself only receives clicks on the backdrop; the
        // panel inside covers everything else. A drag that merely ends on the
        // backdrop (e.g. selecting text in the title field) does not count.
        if (event.target === ref.current && pressedBackdrop.current) tryClose()
      }}
      onAnimationEnd={(event) => {
        if (event.target === ref.current && event.animationName === 'up-out') finishClose()
      }}
    >
      {state !== 'closed' && (
        <UploadForm
          key={session}
          onBusyChange={(busy) => { locked.current = busy }}
          onCancel={tryClose}
          onUploaded={onUploaded}
        />
      )}
    </dialog>
  )
}

function UploadForm({ onBusyChange, onCancel, onUploaded }) {
  const { user, buddy } = useAuth()
  const inputRef = useRef(null)
  const measuring = useRef(null)

  const [file, setFile] = useState(null)
  const [title, setTitle] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [questionCount, setQuestionCount] = useState(DEFAULT_QUESTION_COUNT)
  // Null until known; only text files can be measured in the browser.
  const [wordCount, setWordCount] = useState(null)

  const cap = wordCount === null ? QUESTION_COUNTS.at(-1) : questionCapFor(wordCount)

  function chooseFile(nextFile) {
    if (!nextFile) return
    const problem = validateFile(nextFile)
    if (problem) {
      setError(problem)
      setFile(null)
      return
    }
    setError(null)
    setFile(nextFile)
    measure(nextFile)
    if (!title.trim()) {
      // Default the title to the filename without its extension.
      setTitle(nextFile.name.replace(/\.[^.]+$/, ''))
    }
  }

  async function measure(nextFile) {
    measuring.current = nextFile
    setWordCount(null)
    const words = await estimateWordCount(nextFile)
    // A different file may have been chosen while this one was being read.
    if (measuring.current !== nextFile) return
    setWordCount(words)
    if (words !== null) {
      // Pull the choice down if this file cannot support it.
      const fits = QUESTION_COUNTS.filter((n) => n <= questionCapFor(words))
      setQuestionCount((current) => (current <= fits.at(-1) ? current : fits.at(-1)))
    }
  }

  function handleDrop(event) {
    event.preventDefault()
    setDragging(false)
    chooseFile(event.dataTransfer.files?.[0])
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)

    const problem = validateFile(file)
    if (problem) {
      setError(problem)
      return
    }

    setBusy(true)
    onBusyChange(true)
    try {
      const material = await uploadMaterial({ userId: user.id, file, title })

      // Deliberately not awaited: processing takes ~15s and Home shows live
      // status. The request keeps running after the pop-up closes.
      processMaterial(material.id, { questionCount }).catch((err) => {
        // The function records its own failures on the material row, so this
        // only catches the case where the call never reached it.
        console.error('Could not start processing:', err?.message ?? err)
      })

      onBusyChange(false)
      onUploaded()
    } catch (err) {
      onBusyChange(false)
      setError(err?.message ?? 'Upload failed. Try again.')
      setBusy(false)
    }
  }

  return (
    <form className="up-panel" onSubmit={handleSubmit}>
      <header className="up-head">
        <div>
          <h2 id="upload-title" className="up-title">Add study material</h2>
          <p className="hint">
            {buddy?.name ?? 'Your buddy'} builds a study pack from whatever your class
            actually covers.
          </p>
        </div>
        <button
          type="button"
          className="up-close"
          onClick={onCancel}
          disabled={busy}
          aria-label="Close"
        >
          <IconClose />
        </button>
      </header>

      {error && <div className="msg msg-error">{error}</div>}

      <div
        className={`dropzone${dragging ? ' is-dragging' : ''}${file ? ' has-file' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            if (!busy) inputRef.current?.click()
          }
        }}
        role="button"
        tabIndex={0}
        aria-disabled={busy || undefined}
      >
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={ACCEPTED_EXTENSIONS}
          onChange={(event) => chooseFile(event.target.files?.[0])}
        />

        {file ? (
          <>
            <MascotRig key={file.name} pose="waving-sm" size={48} className="nv-anim-hop" />
            <p className="dropzone-title">{file.name}</p>
            <p className="hint">{formatBytes(file.size)} · click to choose a different file</p>
          </>
        ) : (
          <>
            <MascotRig pose="waving-sm" size={48} className={dragging ? 'nv-anim-bounce' : 'nv-anim-float'} />
            <p className="dropzone-title">Drop a file here, or click to browse</p>
            <p className="hint">PDF, slides, documents, or images · up to 50 MB</p>
          </>
        )}
      </div>

      <div className="field">
        <label className="label" htmlFor="upload-material-title">Title</label>
        <input
          id="upload-material-title"
          className="input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Week 5 — Binary Trees"
          maxLength={200}
          disabled={busy}
        />
        <span className="hint">How this shows up on your dashboard.</span>
      </div>

      <fieldset className="count-field">
        <legend className="label">Practice questions</legend>
        <div className="count-grid">
          {QUESTION_COUNTS.map((n) => {
            const tooMany = n > cap
            return (
              <label
                key={n}
                className={`count-option${questionCount === n ? ' is-selected' : ''}${
                  tooMany ? ' is-disabled' : ''
                }`}
              >
                <input
                  type="radio"
                  name="question-count"
                  value={n}
                  checked={questionCount === n}
                  disabled={tooMany || busy}
                  onChange={() => setQuestionCount(n)}
                  className="sr-only"
                />
                {n}
              </label>
            )
          })}
        </div>
        <span className="hint">
          {cap < QUESTION_COUNTS.at(-1)
            ? `This material is short, so ${cap} is the most ${buddy?.name ?? 'Novi'} can write without repeating itself.`
            : 'How many questions to write for this pack. You choose how many to answer each time you practise.'}
        </span>
      </fieldset>

      <div className="up-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy || !file}>
          {busy && <span className="spinner" />}
          {busy ? 'Uploading...' : 'Upload'}
        </button>
      </div>
    </form>
  )
}
