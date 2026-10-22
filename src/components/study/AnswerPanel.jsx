import { useState } from 'react'
import './practice.css'

const TRUE_FALSE = ['True', 'False']

// Generated answers vary in case ("True" vs "true"), so comparisons for
// highlighting ignore it, the same way grading does.
const same = (a, b) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()

/**
 * The answering part of a question, shared by practice sessions and the study
 * pack page so both behave the same.
 *
 * Controlled: the parent owns `verdict` (null, 'reveal', true or false) and
 * `given`, and decides what an answer means through `onAnswer(answer,
 * selfGraded)`. Key it by question so typed input resets between questions.
 */
export function AnswerPanel({ question, verdict, given, busy = false, onAnswer, onReveal }) {
  const [typed, setTyped] = useState('')
  const answered = verdict === true || verdict === false

  const choices =
    question.type === 'multiple_choice' && Array.isArray(question.choices)
      ? question.choices
      : question.type === 'true_false'
        ? TRUE_FALSE
        : null

  function check(event) {
    event.preventDefault()
    if (typed.trim()) onAnswer(typed.trim())
  }

  return (
    <div className="pr-answer-area">
      {choices ? (
        <ul className="pr-choices">
          {choices.map((choice) => {
            const chosen = answered && same(given, choice)
            // The right answer is always shown once answered, picked or not.
            const isAnswer = answered && same(choice, question.correct_answer)
            return (
              <li key={choice}>
                <button
                  type="button"
                  className={`pr-choice${chosen ? ' is-chosen' : ''}${isAnswer ? ' is-answer' : ''}${
                    chosen && verdict === false ? ' is-wrong' : ''
                  }`}
                  disabled={answered || busy}
                  onClick={() => onAnswer(choice)}
                >
                  {choice}
                </button>
              </li>
            )
          })}
        </ul>
      ) : question.type === 'fill_blank' ? (
        <form className="pr-blank" onSubmit={check}>
          <input
            className={`input pr-blank-input${answered ? (verdict ? ' is-right' : ' is-wrong') : ''}`}
            value={answered ? (given ?? '') : typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={answered || busy}
            placeholder="Type the missing word"
            aria-label="Your answer"
          />
          {!answered && (
            <button className="hm-buddy-cta" disabled={!typed.trim() || busy}>
              Check
            </button>
          )}
        </form>
      ) : verdict === null ? (
        // Longer answers are graded by the student: string matching would mark
        // perfectly good wording wrong.
        <div className="pr-self">
          <p className="hm-sub">Answer it in your head, then check yourself.</p>
          <button type="button" className="hm-buddy-cta" onClick={onReveal}>
            Show the answer
          </button>
        </div>
      ) : null}

      {verdict === 'reveal' && (
        <div className="pr-reveal">
          <p className="pr-answer"><span>Answer</span> {question.correct_answer}</p>
          {question.explanation && <p className="hm-sub">{question.explanation}</p>}
          <div className="pr-self-grade">
            <button type="button" className="pr-grade is-yes" disabled={busy} onClick={() => onAnswer(null, true)}>
              I got it right
            </button>
            <button type="button" className="pr-grade is-no" disabled={busy} onClick={() => onAnswer(null, false)}>
              I got it wrong
            </button>
          </div>
        </div>
      )}

      {answered && (
        <div className={`pr-verdict${verdict ? ' is-right' : ' is-wrong'}`} role="status">
          <p className="pr-verdict-line">
            {verdict ? 'Correct' : 'Not quite'}
            {!verdict && <> — the answer is <strong>{question.correct_answer}</strong></>}
          </p>
          {question.explanation && <p className="hm-sub">{question.explanation}</p>}
        </div>
      )}
    </div>
  )
}
