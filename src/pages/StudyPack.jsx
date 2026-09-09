import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Markdown } from '../components/study/Markdown'
import '../components/study/study-pack.css'
import { fetchStudyPack } from '../lib/packs'

const TYPE_LABEL = {
  multiple_choice: 'Multiple choice',
  true_false: 'True or false',
  short_answer: 'Short answer',
  fill_blank: 'Fill in the blank',
  flashcard: 'Flashcard',
}

function Question({ question, index }) {
  const [revealed, setRevealed] = useState(false)
  const choices = Array.isArray(question.choices) ? question.choices : null

  return (
    <li className="sp-question">
      <div className="sp-q-head">
        <span className="sp-q-number">{index + 1}</span>
        <p className="sp-q-prompt">{question.prompt}</p>
      </div>

      <div className="sp-q-meta">
        <span className="badge">{TYPE_LABEL[question.type] ?? question.type}</span>
        <span className="sp-q-difficulty" title={`Difficulty ${question.difficulty} of 5`}>
          {'●'.repeat(question.difficulty)}
          <span className="sp-q-dim">{'●'.repeat(Math.max(0, 5 - question.difficulty))}</span>
        </span>
      </div>

      {choices && (
        <ul className="sp-choices">
          {choices.map((choice) => {
            const isAnswer = revealed && choice === question.correct_answer
            return (
              <li key={choice} className={`sp-choice${isAnswer ? ' is-answer' : ''}`}>
                {choice}
              </li>
            )
          })}
        </ul>
      )}

      {revealed ? (
        <div className="sp-answer">
          <p className="sp-answer-line">
            <span className="sp-answer-label">Answer</span>
            {question.correct_answer}
          </p>
          {question.explanation && <p className="hm-sub">{question.explanation}</p>}
        </div>
      ) : (
        <button type="button" className="sp-reveal" onClick={() => setRevealed(true)}>
          Show answer
        </button>
      )}
    </li>
  )
}

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

      {pack.questions.length > 0 && (
        <section id="questions" className="sp-section" aria-label="Practice questions">
          <div className="hm-card-head">
            <h2 className="sp-section-title">Practice questions</h2>
            <span className="hm-sub">{pack.questions.length} questions</span>
          </div>
          <ul className="sp-questions">
            {pack.questions.map((question, i) => (
              <Question key={question.id} question={question} index={i} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
