import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Markdown } from '../components/study/Markdown'
import { PackQuiz } from '../components/study/PackQuiz'
import '../components/study/study-pack.css'
import { fetchStudyPack } from '../lib/packs'
import { LoadingRegion, Sk, SkText } from '../components/Skeleton'
import { friendlyError } from '../lib/errors'

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
      setError(friendlyError(err, 'Could not load this study pack.'))
    } finally {
      setLoading(false)
    }
  }, [packId])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <LoadingRegion label="Loading your study pack…" className="sp">
        <header className="sp-head">
          <Sk w={60} h={12} />
          <Sk w="65%" h={34} r={8} style={{ marginTop: 6 }} />
          <Sk w="45%" h={12} />
        </header>
        <section className="hm-card card-pad sp-section">
          <Sk w={110} h={16} />
          <SkText lines={5} h={12} gap={10} widths={['100%', '97%', '92%', '98%', '60%']} />
        </section>
        <section className="sp-section">
          <Sk w={120} h={16} />
          <ul className="sp-concepts">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="hm-card sp-concept">
                <span className="sk-row" style={{ justifyContent: 'space-between' }}>
                  <Sk w="45%" h={14} />
                  <Sk w={54} h={12} />
                </span>
                <SkText lines={2} widths={['95%', '70%']} />
              </li>
            ))}
          </ul>
        </section>
        <section className="sp-section">
          <Sk w={150} h={16} />
          {[0, 1].map((i) => (
            <div key={i} className="sp-question">
              <span className="sk-row" style={{ alignItems: 'flex-start' }}>
                <Sk w={26} h={26} r="50%" />
                <SkText lines={2} h={13} widths={['85%', '50%']} />
              </span>
              <span className="sk-stack" style={{ gap: 8, marginTop: 14 }}>
                {[0, 1, 2].map((j) => <Sk key={j} h={42} r={12} />)}
              </span>
            </div>
          ))}
        </section>
      </LoadingRegion>
    )
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
          <Link to="/packs" className="hm-buddy-cta">Back to study packs</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="sp">
      <header className="sp-head">
        <Link to={`/packs?pack=${packId}`} className="hm-muted-link">← Study Packs</Link>
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
