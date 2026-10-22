import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Markdown } from '../components/study/Markdown'
import { PackQuiz } from '../components/study/PackQuiz'
import '../components/study/study-pack.css'
import { fetchStudyPack } from '../lib/packs'

export function StudyPack() {
  const { packId } = useParams()
  const [pack, setPack] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setPack(await fetchStudyPack(packId))
      setError(null)
    } catch (err) {
      setError(err?.message ?? 'Could not load this study pack.')
    } finally {
      setLoading(false)
    }
  }, [packId])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return <p className="hm-empty-line">Loading your study pack…</p>
  }

  if (error) {
    return <div className="msg msg-error">{error}</div>
  }

  if (!pack) {
    return (
      <div className="sp">
        <div className="hm-card hm-rec-empty">
          <p className="hm-empty-line">
            That study pack does not exist, or it is not yours.
          </p>
          <Link to="/dashboard" className="hm-buddy-cta">Back to home</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="sp">
      <header className="sp-head">
        <Link to="/dashboard" className="hm-muted-link">← Home</Link>
        <h1 className="sp-title">{pack.title}</h1>
        <p className="hm-sub">
          {pack.subject && <>{pack.subject} · </>}
          {pack.material?.title && <>From {pack.material.title} · </>}
          {new Date(pack.createdAt).toLocaleDateString()}
          {pack.model && <> · Written by {pack.model}</>}
        </p>
      </header>

      {pack.summary && (
        <section id="summary" className="hm-card card-pad sp-section" aria-label="Summary">
          <h2 className="sp-section-title">Summary</h2>
          <Markdown content={pack.summary} />
        </section>
      )}

      {pack.concepts.length > 0 && (
        <section id="concepts" className="sp-section" aria-label="Key concepts">
          <h2 className="sp-section-title">Key concepts</h2>
          <ul className="sp-concepts">
            {pack.concepts.map((concept) => (
              <li key={concept.id} className="hm-card sp-concept">
                <div className="sp-concept-head">
                  <p className="sp-concept-term">{concept.term}</p>
                  <span
                    className="sp-importance"
                    title={`Importance ${concept.importance} of 5`}
                    aria-label={`Importance ${concept.importance} of 5`}
                  >
                    {'★'.repeat(concept.importance)}
                  </span>
                </div>
                <p className="sp-concept-def">{concept.definition}</p>
                {concept.example && (
                  <p className="hm-sub sp-concept-example">e.g. {concept.example}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {pack.questions.length > 0 && <PackQuiz key={pack.id} pack={pack} />}
    </div>
  )
}
