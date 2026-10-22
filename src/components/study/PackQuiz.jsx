import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { gradeAnswer } from '../../lib/practice'
import { AnswerPanel } from './AnswerPanel'

const TYPE_LABEL = {
  multiple_choice: 'Multiple choice',
  true_false: 'True or false',
  short_answer: 'Short answer',
  fill_blank: 'Fill in the blank',
  flashcard: 'Flashcard',
}

const isFinal = (verdict) => verdict === true || verdict === false
const storageKey = (packId) => `novi.quiz.${packId}`

/**
 * Answers survive a reload, otherwise refreshing the page would be a free
 * second attempt. Browser storage can be unavailable (private windows,
 * blocked site data), in which case the quiz simply starts fresh.
 */
function loadAnswers(packId, questions) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(packId)) ?? '{}')
    const ids = new Set(questions.map((q) => q.id))
    return Object.fromEntries(Object.entries(saved).filter(([id]) => ids.has(id)))
  } catch {
    return {}
  }
}

function saveAnswers(packId, answers) {
  try {
    if (Object.keys(answers).length === 0) localStorage.removeItem(storageKey(packId))
    else localStorage.setItem(storageKey(packId), JSON.stringify(answers))
  } catch {
    /* not persisted; the quiz still works for this visit */
  }
}

function Question({ question, index, state, onChange }) {
  const verdict = state?.verdict ?? null

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

      <div className="sp-q-body">
        <AnswerPanel
          question={question}
          verdict={verdict}
          given={state?.given ?? null}
          onAnswer={(value, selfGraded) => {
            // One attempt per question: once marked, it stays marked until
            // the whole quiz is retaken.
            if (isFinal(verdict)) return
            onChange({ verdict: selfGraded ?? gradeAnswer(question, value), given: value })
          }}
          onReveal={() => onChange({ verdict: 'reveal', given: null })}
        />
      </div>
    </li>
  )
}

/**
 * The pack's questions as a quiz on the page. One attempt per question; the
 * correct answer shows straight after. Retaking is unlocked only once every
 * question has been answered.
 *
 * Nothing here is recorded against progress: practice sessions are what count
 * toward mastery and streaks.
 */
export function PackQuiz({ pack }) {
  const { questions } = pack
  const [answers, setAnswers] = useState(() => loadAnswers(pack.id, questions))
  // Bumped on retake so every panel remounts with a clean input.
  const [round, setRound] = useState(0)
  const sectionRef = useRef(null)

  useEffect(() => {
    saveAnswers(pack.id, answers)
  }, [pack.id, answers])

  const answered = questions.filter((q) => isFinal(answers[q.id]?.verdict)).length
  const correct = questions.filter((q) => answers[q.id]?.verdict === true).length
  const complete = answered === questions.length
  const score = Math.round((correct / questions.length) * 100)

  function retake() {
    setAnswers({})
    setRound((r) => r + 1)
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section id="questions" ref={sectionRef} className="sp-section" aria-label="Practice questions">
      <div className="hm-card-head">
        <h2 className="sp-section-title">Practice questions</h2>
        <Link to={`/pack/${pack.id}/practice`} className="sp-practice-link">
          Practise for progress
        </Link>
      </div>
      <p className="hm-sub sp-questions-note">
        {complete
          ? `Quiz complete: ${correct} of ${questions.length} correct.`
          : `${answered} of ${questions.length} answered · one try per question. A practice session also counts toward your mastery and streak.`}
      </p>

      <ul className="sp-questions" key={round}>
        {questions.map((question, i) => (
          <Question
            key={question.id}
            question={question}
            index={i}
            state={answers[question.id]}
            onChange={(next) => setAnswers((all) => ({ ...all, [question.id]: next }))}
          />
        ))}
      </ul>

      {complete && (
        <div className="hm-card card-pad sp-quiz-done" role="status">
          <div>
            <p className="sp-quiz-score">
              {correct}<span> / {questions.length}</span>
            </p>
            <p className="hm-sub">{score}% correct</p>
          </div>
          <button type="button" className="hm-buddy-cta" onClick={retake}>
            Retake quiz
          </button>
        </div>
      )}
    </section>
  )
}
