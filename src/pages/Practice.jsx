import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import '../components/study/practice.css'
import { useAuth } from '../context/auth-context'
import { fetchStudyPack } from '../lib/packs'
import {
  finishSession,
  gradeAnswer,
  isAutoGraded,
  recordAttempt,
  startOrResumeSession,
} from '../lib/practice'

const TRUE_FALSE = ['true', 'false']

export function Practice() {
  const { packId } = useParams()
  const { user, buddy } = useAuth()
  const navigate = useNavigate()

  const [pack, setPack] = useState(null)
  const [session, setSession] = useState(null)
  const [queue, setQueue] = useState([])
  const [index, setIndex] = useState(0)
  const [given, setGiven] = useState(null)
  const [verdict, setVerdict] = useState(null) // true | false | null
  const [tally, setTally] = useState({ answered: 0, correct: 0 })
  const [resumed, setResumed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState(null)

  const askedAt = useRef(Date.now())
  // Counts only this visit. A resumed session already carries earlier answers,
  // which must not be added to today's activity a second time.
  const visit = useRef({ answered: 0, correct: 0 })
  // Starting a session is not idempotent: two concurrent bootstraps both see
  // no open session and both create one. StrictMode double-invokes effects in
  // development, which is exactly how that surfaced.
  const bootstrapped = useRef(null)

  const load = useCallback(async () => {
    if (!user) return
    if (bootstrapped.current === packId) return
    bootstrapped.current = packId
    setLoading(true)
    try {
      const loaded = await fetchStudyPack(packId)
      if (!loaded) {
        setError('That study pack does not exist, or it is not yours.')
        return
      }

      const { session: s, answeredIds, resumed: didResume } =
        await startOrResumeSession(user.id, loaded.id)

      // Anything already answered in this session is skipped, so resuming
      // carries on rather than starting over.
      const remaining = loaded.questions.filter((q) => !answeredIds.has(q.id))

      setPack(loaded)
      setSession(s)
      setQueue(remaining)
      setResumed(didResume && answeredIds.size > 0)
      setTally({ answered: s.questions_answered ?? 0, correct: s.questions_correct ?? 0 })
      setError(null)
      askedAt.current = Date.now()
    } catch (err) {
      bootstrapped.current = null
      setError(err?.message ?? 'Could not start this practice session.')
    } finally {
      setLoading(false)
    }
  }, [user, packId])

  useEffect(() => {
    load()
  }, [load])

  const question = queue[index] ?? null
  const total = pack?.questions.length ?? 0
  const doneCount = total - queue.length + index

  const choices = useMemo(() => {
    if (!question) return null
    if (question.type === 'multiple_choice' && Array.isArray(question.choices)) {
      return question.choices
    }
    if (question.type === 'true_false') return TRUE_FALSE
    return null
  }, [question])

  async function submit(answer, selfGraded) {
    // 'reveal' is an intermediate state, not an answer. Guarding on
    // `verdict !== null` here silently swallowed every self-graded submission.
    const alreadyAnswered = verdict === true || verdict === false
    if (!question || alreadyAnswered || saving) return

    const correct = selfGraded ?? gradeAnswer(question, answer)
    setGiven(answer)
    setVerdict(correct)
    setSaving(true)

    try {
      const next = await recordAttempt({
        userId: user.id,
        session,
        question,
        givenAnswer: answer,
        isCorrect: Boolean(correct),
        timeTakenMs: Date.now() - askedAt.current,
      })
      visit.current.answered += 1
      if (correct) visit.current.correct += 1
      setSession((s) => ({ ...s, ...next }))
      setTally({ answered: next.questions_answered, correct: next.questions_correct })
    } catch (err) {
      setError(err?.message ?? 'Could not save that answer.')
    } finally {
      setSaving(false)
    }
  }

  async function next() {
    setGiven(null)
    setVerdict(null)
    askedAt.current = Date.now()

    if (index + 1 < queue.length) {
      setIndex(index + 1)
      return
    }

    try {
      await finishSession({ userId: user.id, session })
    } catch (err) {
      setError(err?.message ?? 'Could not close the session.')
    }
    setFinished(true)
  }

  if (loading) return <p className="hm-empty-line">Getting your questions ready…</p>
  if (error) {
    return (
      <div className="pr">
        <div className="msg msg-error">{error}</div>
        <Link to="/packs" className="hm-buddy-cta">Back to study packs</Link>
      </div>
    )
  }

  if (finished || queue.length === 0) {
    const answered = tally.answered
    const score = answered > 0 ? Math.round((tally.correct / answered) * 100) : 0
    return (
      <div className="pr pr-done">
        <div className="hm-card card-pad pr-summary">
          <h1 className="pr-done-title">
            {answered === 0 ? 'Nothing left to practise' : 'Session complete'}
          </h1>
          {answered > 0 && (
            <>
              <p className="pr-score">{tally.correct}<span> / {answered}</span></p>
              <p className="hm-sub">{score}% correct</p>
            </>
          )}
          <p className="hm-sub pr-done-note">
            {answered === 0
              ? 'You have already answered every question in this pack.'
              : `${buddy?.name ?? 'Novi'} recorded that against your progress.`}
          </p>
          <div className="pr-done-actions">
            <Link to={`/pack/${packId}`} className="hm-buddy-cta">Back to pack</Link>
            <Link to="/dashboard" className="pd-secondary">Home</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pr">
      <header className="pr-head">
        <div>
          <p className="hm-sub">{pack.title}</p>
          <h1 className="pr-title">Question {doneCount + 1} of {total}</h1>
        </div>
        <button type="button" className="pr-exit" onClick={() => navigate(`/pack/${packId}`)}>
          Save &amp; exit
        </button>
      </header>

      <div className="pr-progress" aria-hidden="true">
        <span style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} />
      </div>

      {resumed && index === 0 && (
        <p className="hm-sub pr-resumed">Picking up where you left off.</p>
      )}

      <section className="hm-card card-pad pr-card">
        <p className="pr-prompt">{question.prompt}</p>

        {choices ? (
          <ul className="pr-choices">
            {choices.map((choice) => {
              const chosen = given === choice
              const isAnswer = verdict !== null && choice === question.correct_answer
              return (
                <li key={choice}>
                  <button
                    type="button"
                    className={`pr-choice${chosen ? ' is-chosen' : ''}${isAnswer ? ' is-answer' : ''}${
                      chosen && verdict === false ? ' is-wrong' : ''
                    }`}
                    disabled={verdict !== null}
                    onClick={() => submit(choice)}
                  >
                    {choice}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : verdict === null ? (
          // Open-ended answers are graded by the student: string matching would
          // mark perfectly good wording wrong.
          <div className="pr-self">
            <p className="hm-sub">Answer it in your head, then check yourself.</p>
            <button type="button" className="hm-buddy-cta" onClick={() => setVerdict('reveal')}>
              Show the answer
            </button>
          </div>
        ) : null}

        {verdict === 'reveal' && (
          <div className="pr-reveal">
            <p className="pr-answer"><span>Answer</span> {question.correct_answer}</p>
            {question.explanation && <p className="hm-sub">{question.explanation}</p>}
            <div className="pr-self-grade">
              <button type="button" className="pr-grade is-yes" onClick={() => submit(null, true)}>
                I got it right
              </button>
              <button type="button" className="pr-grade is-no" onClick={() => submit(null, false)}>
                I got it wrong
              </button>
            </div>
          </div>
        )}

        {verdict === true || verdict === false ? (
          <div className={`pr-verdict${verdict ? ' is-right' : ' is-wrong'}`}>
            <p className="pr-verdict-line">
              {verdict ? 'Correct' : 'Not quite'}
              {!verdict && <> — the answer is <strong>{question.correct_answer}</strong></>}
            </p>
            {question.explanation && <p className="hm-sub">{question.explanation}</p>}
          </div>
        ) : null}

        {verdict === true || verdict === false ? (
          <button type="button" className="hm-buddy-cta pr-next" onClick={next} disabled={saving}>
            {index + 1 < queue.length ? 'Next question' : 'Finish session'}
          </button>
        ) : null}
      </section>

      <p className="hm-sub pr-tally">
        {tally.correct} correct of {tally.answered} answered
      </p>
    </div>
  )
}
