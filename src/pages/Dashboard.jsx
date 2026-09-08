import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { useAuth } from '../context/auth-context'
import { formatBytes, listMaterials } from '../lib/materials'

const STATUS_LABEL = {
  uploaded: { text: 'Waiting to process', tone: 'badge' },
  extracting: { text: 'Reading it', tone: 'badge badge-warn' },
  embedding: { text: 'Indexing', tone: 'badge badge-warn' },
  generating: { text: 'Writing your reviewer', tone: 'badge badge-warn' },
  ready: { text: 'Ready', tone: 'badge badge-ok' },
  failed: { text: 'Failed', tone: 'badge' },
}

const TYPE_LABEL = {
  pdf: 'PDF',
  pptx: 'Slides',
  docx: 'Document',
  image: 'Image',
  text: 'Notes',
  link: 'Link',
}

export function Dashboard() {
  const { user, buddy } = useAuth()
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      setMaterials(await listMaterials(user.id))
      setError(null)
    } catch (err) {
      setError(err?.message ?? 'Could not load your material.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  const firstName = user?.user_metadata?.display_name?.split(' ')[0]

  return (
    <div className="page">
      <section className="greeting card card-pad">
        <div className="greeting-orb">
          <Mascot size={64} />
        </div>
        <div>
          <h1 className="greeting-title">
            {firstName ? `Hey ${firstName}` : 'Hey there'}
          </h1>
          <p className="hint">
            {materials.length === 0
              ? `${buddy?.name ?? 'Your buddy'} is ready when you are. Upload something to study and we will take it from there.`
              : `${buddy?.name ?? 'Your buddy'} is holding on to ${materials.length} ${
                  materials.length === 1 ? 'item' : 'items'
                } for you.`}
          </p>
        </div>
        <Link to="/upload" className="btn btn-primary">Upload material</Link>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Your material</h2>
          {materials.length > 0 && (
            <Link to="/upload" className="btn btn-secondary">Add another</Link>
          )}
        </div>

        {error && <div className="msg msg-error">{error}</div>}

        {loading ? (
          <div className="card card-pad empty">
            <p className="hint">Loading your material...</p>
          </div>
        ) : materials.length === 0 ? (
          <div className="card card-pad empty">
            <Mascot size={56} mood="calm" />
            <h3>Nothing here yet</h3>
            <p className="hint">
              Upload a lecture PDF, a slide deck, or a photo of your notes. That is all Novi
              needs to start building your reviewer.
            </p>
            <Link to="/upload" className="btn btn-primary">Upload your first material</Link>
          </div>
        ) : (
          <ul className="material-list">
            {materials.map((material) => {
              const status = STATUS_LABEL[material.status] ?? STATUS_LABEL.uploaded
              return (
                <li key={material.id} className="card material-row">
                  <div className="material-icon">{TYPE_LABEL[material.source_type] ?? 'File'}</div>
                  <div className="material-meta">
                    <span className="material-title">{material.title}</span>
                    <span className="hint">
                      {formatBytes(material.file_size_bytes)}
                      {material.file_size_bytes ? ' · ' : ''}
                      {new Date(material.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <span className={status.tone}>{status.text}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="section">
        <div className="card card-pad next-up">
          <h3>Coming next</h3>
          <p className="hint">
            Processing turns each upload into summaries, key concepts, and practice questions.
            That runs in a Supabase Edge Function so the API keys stay off the browser, and it
            is the next piece to build.
          </p>
        </div>
      </section>
    </div>
  )
}
