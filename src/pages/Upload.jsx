import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { useAuth } from '../context/auth-context'
import {
  ACCEPTED_EXTENSIONS,
  formatBytes,
  processMaterial,
  uploadMaterial,
  validateFile,
} from '../lib/materials'

export function Upload() {
  const { user, buddy } = useAuth()
  const navigate = useNavigate()
  const inputRef = useRef(null)

  const [file, setFile] = useState(null)
  const [title, setTitle] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

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
    if (!title.trim()) {
      // Default the title to the filename without its extension.
      setTitle(nextFile.name.replace(/\.[^.]+$/, ''))
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
    try {
      const material = await uploadMaterial({ userId: user.id, file, title })

      // Deliberately not awaited: processing takes ~15s and the dashboard
      // already shows live status. The request keeps running after we navigate.
      processMaterial(material.id).catch((err) => {
        // The function records its own failures on the material row, so this
        // only catches the case where the call never reached it.
        console.error('Could not start processing:', err?.message ?? err)
      })

      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err?.message ?? 'Upload failed. Try again.')
      setBusy(false)
    }
  }

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <h1>Add study material</h1>
        <p className="hint">
          {buddy?.name ?? 'Your buddy'} works from whatever your class actually covers. Slides,
          a lecture PDF, a document, or a clear photo of your notes all work.
        </p>
      </div>

      <form className="card card-pad" onSubmit={handleSubmit}>
        {error && <div className="msg msg-error drop-gap">{error}</div>}

        <div
          className={`dropzone${dragging ? ' is-dragging' : ''}${file ? ' has-file' : ''}`}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              inputRef.current?.click()
            }
          }}
          role="button"
          tabIndex={0}
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
              <Mascot size={48} mood="happy" />
              <p className="dropzone-title">{file.name}</p>
              <p className="hint">{formatBytes(file.size)} · click to choose a different file</p>
            </>
          ) : (
            <>
              <Mascot size={48} mood="calm" />
              <p className="dropzone-title">Drop a file here, or click to browse</p>
              <p className="hint">PDF, slides, documents, or images · up to 50 MB</p>
            </>
          )}
        </div>

        <div className="field drop-gap">
          <label className="label" htmlFor="title">Title</label>
          <input
            id="title"
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Week 5 — Binary Trees"
            maxLength={200}
          />
          <span className="hint">How this shows up on your dashboard.</span>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/dashboard')}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || !file}>
            {busy && <span className="spinner" />}
            {busy ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </form>
    </div>
  )
}
