import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AnswerPanel } from '../components/study/AnswerPanel'
import { LoadingRegion, Sk, SkText } from '../components/Skeleton'
import '../components/study/practice.css'
import { useAuth } from '../context/auth-context'
import { usePreferences } from '../context/preferences-context'
import { fetchStudyPack } from '../lib/packs'
import {
  fetchTopicName,
  findOpenSession,
  finishSession,
  gradeAnswer,
  orderForPractice,
  recordAttempt,
  startSession,
} from '../lib/practice'
import { friendlyError } from '../lib/errors'
import { recommendationFromSearch, recordRecommendationEvent } from '../lib/recommendations'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Session lengths offered before a sitting. A pack no bigger than the
// smallest option just starts, since there is nothing to choose.
const SESSION_SIZES = [5, 10, 15, 20]

export function Practice() {
  const { packId } = useParams()
  const { user, buddy } = useAuth()
  const { prefs } = usePreferences()
  const navigate = useNavigate()
  const location = useLocation()
  // ?topic= practises one topic of the pack (a recommendation opens it so);
  // ?rec= is the recommendation, told when the sitting starts and finishes.
  const topicParam = new URLSearchParams(location.search).get('topic')
  const focusTopicId = topicParam && UUID.test(topicParam) ? topicParam : null
  const recId = recommendationFromSearch(location.search)
  const [topicName, setTopicName] = useState(null)
  // What this sitting covers: the topic's questions, or the whole pack.
  const focusRef = useRef(null)
  const [sittingSize, setSittingSize] = useState(0)
  // The default session length from Settings (null = ask). A ref so loading
  // reads the latest value without restarting the session bootstrap.
  const practiceSize = useRef(prefs.practiceSessionSize)
  useEffect(() => {
    practiceSize.current = prefs.practiceSessionSize
  }, [prefs.practiceSessionSize])

  const [pack, setPack] = useState(null)
  const [session, setSession] = useState(null)
  const [queue, setQueue] = useState([])
  // Ordered questions waiting on the "how many?" choice; null once chosen.
  const [pool, setPool] = useState(null)
  // Answered in this session before this visit, so progress counts them.
  const [startAnswered, setStartAnswered] = useState(0)
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

  function begin(s, questions, alreadyAnswered) {
    if (recId) recordRecommendationEvent(recId, 'started', { sessionId: s.id })
    setSession(s)
    setQueue(questions)
    setIndex(0)
    setStartAnswered(alreadyAnswered)
    setTally({ answered: s.questions_answered ?? 0, correct: s.questions_correct ?? 0 })
    askedAt.current = Date.now()
  }

  const load = useCallback(async () => {
    if (!user) return
    const bootKey = `${packId}|${focusTopicId ?? ''}`
    if (bootstrapped.current === bootKey) return
    bootstrapped.current = bootKey
    setLoading(true)
    try {
      const loaded = await fetchStudyPack(packId)
      if (!loaded) {
        setError('That study pack does not exist, or it is not yours.')
        return
      }
      setPack(loaded)
      setError(null)

      // A topic with no questions left in this pack falls back to the whole pack.
      let focus = focusTopicId
      let sitting = loaded.questions
      if (focus) {
        const onTopic = loaded.questions.filter((q) => q.topic_id === focus)
        if (onTopic.length > 0) {
          sitting = onTopic
          fetchTopicName(focus).then(setTopicName).catch(() => {})
        } else {
          focus = null
        }
      }
      focusRef.current = focus
      setSittingSize(sitting.length)

      const open = await findOpenSession(user.id, loaded.id, focus)
      if (open) {
        // Anything already answered in this session is skipped, and the
        // session's own target still applies, so resuming carries on toward
        // the length the student chose rather than switching to the whole pack.
        const answered = open.answeredIds.size
        const ordered = await orderForPractice(
          sitting.filter((q) => !open.answeredIds.has(q.id)),
        )
        const target = open.session.target_count
        const left = target == null ? ordered.length : Math.max(0, target - answered)
        const remaining = ordered.slice(0, left)

        if (remaining.length === 0 && answered > 0) {
          // Every question was answered but "Finish" was never pressed, e.g.
          // the tab closed on the last one. Close it now; otherwise the pack
          // would reopen onto this finished session forever.
          await finishSession({ userId: user.id, session: open.session })
          begin(open.session, [], answered)
          setFinished(true)
          return
        }

        begin(open.session, remaining, answered)
        setResumed(answered > 0)
        return
      }

      const ordered = await orderForPractice(sitting)
      if (ordered.length <= SESSION_SIZES[0]) {
        begin(await startSession(user.id, loaded.id, null, focus), ordered, 0)
        return
      }
      // A default length from Settings skips the "how many?" question.
      const preferred = practiceSize.current
      if (preferred) {
        const target = preferred >= ordered.length ? null : preferred
        begin(await startSession(user.id, loaded.id, target, focus), ordered.slice(0, preferred), 0)
        return
      }
      setPool(ordered)
    } catch (err) {
      bootstrapped.current = null
      setError(friendlyError(err, 'Could not start this practice session.'))
    } finally {
      setLoading(false)
    }
  }, [user, packId, focusTopicId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function choose(size) {
    if (!pool || saving) return
    setSaving(true)
    try {
      // "All" is stored as null so the session follows the pack as it is.
      const target = size >= pool.length ? null : size
      const s = await startSession(user.id, pack.id, target, focusRef.current)
      begin(s, pool.slice(0, size), 0)
      setPool(null)
    } catch (err) {
      setError(friendlyError(err, 'Could not start this practice session.'))
    } finally {
      setSaving(false)
    }
  }

  function again() {
    setFinished(false)
    setResumed(false)
    setGiven(null)
    setVerdict(null)
    setQueue([])
    setSession(null)
    visit.current = { answered: 0, correct: 0 }
    bootstrapped.current = null
    load()
  }

  useEffect(() => {
    load()
  }, [load])

  const question = queue[index] ?? null
  const total = startAnswered + queue.length
  const doneCount = startAnswered + index

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
      setError(friendlyError(err, 'Could not save that answer.'))
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
      if (recId) {
        recordRecommendationEvent(recId, 'completed', {
          sessionId: session.id,
          detail: {
            answered: tally.answered,
            correct: tally.correct,
            accuracy: tally.answered ? Number((tally.correct / tally.answered).toFixed(3)) : null,
          },
        })
      }
    } catch (err) {
      setError(friendlyError(err, 'Could not close the session.'))
    }
    setFinished(true)
  }

  if (loading) {
    return (
      <LoadingRegion label="Getting your questions ready…" className="pr">
        <header className="pr-head">
          <span className="sk-stack" style={{ gap: 8 }}>
            <Sk w={140} h={12} />
            <Sk w={190} h={24} r={8} />
          </span>
          <Sk w={110} h={36} r={12} />
        </header>
        <Sk h={6} r={4} />
        <section className="hm-card card-pad pr-card">
          <SkText lines={2} h={16} gap={10} widths={['92%', '60%']} />
          <span className="sk-stack" style={{ gap: 9 }}>
            {[0, 1, 2, 3].map((i) => <Sk key={i} h={48} r={12} />)}
          </span>
        </section>
      </LoadingRegion>
    )
  }
  if (error) {
    return (
      <div className="pr">
        <div className="msg msg-error">{error}</div>
        <Link to={`/packs?pack=${packId}`} className="hm-buddy-cta">Back to study packs</Link>
      </div>
    )
  }

  if (pool) {
    const sizes = SESSION_SIZES.filter((n) => n < pool.length)
    return (
      <div className="pr">
        <header className="pr-head">
          <div>
            <p className="hm-sub">{pack.title}{topicName ? ` · ${topicName}` : ''}</p>
            <h1 className="pr-title">How many questions this time?</h1>
          </div>
          <button type="button" className="pr-exit" onClick={() => navigate(`/packs?pack=${packId}`)}>
            Back
          </button>
        </header>

        <section className="hm-card card-pad pr-card">
          <div className="pr-pick">
            {sizes.map((n) => (
              <button
                key={n}
                type="button"
                className="pr-pick-btn"
                disabled={saving}
                onClick={() => choose(n)}
              >
                <strong>{n}</strong>
                <span>questions</span>
              </button>
            ))}
            <button
              type="button"
              className="pr-pick-btn"
              disabled={saving}
              onClick={() => choose(pool.length)}
            >
              <strong>All {pool.length}</strong>
              <span>the whole pack</span>
            </button>
          </div>
          <p className="hm-sub">
            {buddy?.name ?? 'Novi'} starts with questions you haven&rsquo;t tried yet, then the
            ones you missed.
          </p>
          <p className="hm-sub">
            Always the same number? <Link to="/settings#study">Set a default in Settings</Link> to skip this step.
          </p>
        </section>
      </div>
    )
  }

  if (finished || queue.length === 0) {
    const answered = tally.answered
    const score = answered > 0 ? Math.round((tally.correct / answered) * 100) : 0
    // Once a sitting is over the student can always go again; "more" when the
    // sitting covered only part of the pack.
    const partial = answered > 0 && answered < sittingSize
    return (
      <div className="pr pr-done">
        <div className="hm-card card-pad pr-summary">
          <h1 className="pr-done-title">
            {answered === 0 ? 'Nothing left to practice' : 'Session complete'}
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
            {answered > 0 ? (
              <>
                <button type="button" className="hm-buddy-cta" onClick={again}>
                  {partial ? 'Practice more' : 'Practice again'}
                </button>
                <Link to={`/pack/${packId}`} className="pd-secondary">Back to pack</Link>
              </>
            ) : (
              <>
                <Link to={`/pack/${packId}`} className="hm-buddy-cta">Back to pack</Link>
                <Link to={`/packs?pack=${packId}`} className="pd-secondary">Study packs</Link>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pr">
      <header className="pr-head">
        <div>
          <p className="hm-sub">{pack.title}{topicName ? ` · ${topicName}` : ''}</p>
          <h1 className="pr-title">Question {doneCount + 1} of {total}</h1>
        </div>
        <button type="button" className="pr-exit" onClick={() => navigate(`/packs?pack=${packId}`)}>
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

        <AnswerPanel
          key={question.id}
          question={question}
          verdict={verdict}
          given={given}
          busy={saving}
          onAnswer={submit}
          onReveal={() => setVerdict('reveal')}
        />

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
