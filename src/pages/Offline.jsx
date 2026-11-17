import { useEffect, useState } from 'react'
import { IconChevronLeft } from '../components/calendar/CalendarIcons'
import { Logo } from '../components/Mascot'
import { AnswerPanel } from '../components/study/AnswerPanel'
import { Markdown } from '../components/study/Markdown'
import { getOfflinePack, listOfflinePacks } from '../lib/offlinePacks'
import { gradeAnswer } from '../lib/practice'
import '../components/home/home.css'
import '../components/study/practice.css'
import '../components/study/study-pack.css'
import '../components/offline/offline.css'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/** Practice a kept pack's questions. Answers stay on the screen: nothing is saved. */
function OfflineQuiz({ questions }) {
  const [index, setIndex] = useState(0)
  const [verdict, setVerdict] = useState(null)
  const [given, setGiven] = useState(null)
  const [tally, setTally] = useState({ answered: 0, correct: 0 })
  const question = questions[index]

  if (questions.length === 0) return <p className="hm-empty-line">This pack has no practice questions.</p>

  if (!question) {
    const score = tally.answered ? Math.round((tally.correct / tally.answered) * 100) : 0
    return (
      <div className="hm-card card-pad pr-summary">
        <h2 className="pr-done-title">Practice done</h2>
        <p className="pr-score">{tally.correct}<span> / {tally.answered}</span></p>
        <p className="hm-sub">{score}% correct. Offline answers aren&apos;t added to your progress.</p>
        <div className="pr-done-actions">
          <button
            type="button"
            className="hm-buddy-cta"
            onClick={() => {
              setIndex(0)
              setTally({ answered: 0, correct: 0 })
              setVerdict(null)
              setGiven(null)
            }}
          >
            Practice again
          </button>
        </div>
      </div>
    )
  }

  function submit(answer, selfGraded) {
    if (verdict === true || verdict === false) return
    const correct = selfGraded ?? gradeAnswer(question, answer)
    setGiven(answer)
    setVerdict(Boolean(correct))
    setTally((t) => ({ answered: t.answered + 1, correct: t.correct + (correct ? 1 : 0) }))
  }

  function next() {
    setIndex((i) => i + 1)
    setVerdict(null)
    setGiven(null)
  }

  return (
    <div className="off-quiz">
      <div className="pr-progress" aria-hidden="true">
        <span style={{ width: `${(index / questions.length) * 100}%` }} />
      </div>
      <section className="hm-card card-pad pr-card">
        <p className="hm-sub">Question {index + 1} of {questions.length}</p>
        <p className="pr-prompt">{question.prompt}</p>
        <AnswerPanel
          key={question.id ?? index}
          question={question}
          verdict={verdict}
          given={given}
          onAnswer={submit}
          onReveal={() => setVerdict('reveal')}
        />
        {(verdict === true || verdict === false) && (
          <button type="button" className="hm-buddy-cta pr-next" onClick={next}>
            {index + 1 < questions.length ? 'Next question' : 'See score'}
          </button>
        )}
      </section>
      <p className="hm-sub pr-tally">{tally.correct} correct of {tally.answered} answered</p>
    </div>
  )
}

const VIEWS = [
  { id: 'summary', label: 'Summary' },
  { id: 'concepts', label: 'Key concepts' },
  { id: 'quiz', label: 'Practice' },
]

function OfflinePack({ id, onBack }) {
  const [pack, setPack] = useState(undefined)
  const [view, setView] = useState('summary')

  useEffect(() => {
    let active = true
    getOfflinePack(id)
      .then((p) => active && setPack(p ?? null))
      .catch(() => active && setPack(null))
    return () => {
      active = false
    }
  }, [id])

  return (
    <div className="off-pack">
      <button type="button" className="off-back" onClick={onBack}>
        <IconChevronLeft width={16} height={16} /> All offline packs
      </button>
      {pack === undefined ? (
        <p className="hm-sub">Opening…</p>
      ) : pack === null ? (
        <p className="hm-empty-line">This pack is no longer on this device.</p>
      ) : (
        <>
          <header>
            {pack.subject && <p className="hm-sub">{pack.subject}</p>}
            <h1 className="off-title">{pack.title}</h1>
          </header>

          <nav className="off-tabs" aria-label="Pack sections">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`off-tab${view === v.id ? ' is-active' : ''}`}
                aria-pressed={view === v.id}
                onClick={() => setView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </nav>

          {view === 'summary' && (
            <section className="hm-card card-pad sp-section">
              {pack.summary ? <Markdown content={pack.summary} /> : <p className="hm-empty-line">This pack has no summary.</p>}
            </section>
          )}
          {view === 'concepts' && (
            pack.concepts.length === 0 ? (
              <p className="hm-empty-line">This pack has no key concepts.</p>
            ) : (
              <ul className="sp-concepts">
                {pack.concepts.map((c, i) => (
                  <li key={c.id ?? i} className="hm-card sp-concept">
                    <p className="sp-concept-term">{c.term}</p>
                    <p className="sp-concept-def">{c.definition}</p>
                    {c.example && <p className="sp-concept-def sp-concept-example">Example: {c.example}</p>}
                  </li>
                ))}
              </ul>
            )
          )}
          {view === 'quiz' && <OfflineQuiz questions={pack.questions} />}
        </>
      )}
    </div>
  )
}

/**
 * What Novi shows while the device is offline: the packs kept on this device,
 * readable and practisable with no internet. Needs no sign-in check, since it
 * only reads this device's own storage (cleared on sign out).
 */
export function Offline() {
  const [packs, setPacks] = useState(null)
  const [openId, setOpenId] = useState(null)

  useEffect(() => {
    listOfflinePacks()
      .then(setPacks)
      .catch(() => setPacks([]))
  }, [])

  return (
    <div className="off">
      <header className="off-bar">
        <Logo size={26} />
        <span className="off-status" role="status">You&apos;re offline</span>
      </header>

      <main className="off-main">
        {openId ? (
          <OfflinePack id={openId} onBack={() => setOpenId(null)} />
        ) : (
          <>
            <h1 className="off-title">Offline packs</h1>
            <p className="hm-sub off-intro">
              Packs you kept on this device work without internet. Practice answers here aren&apos;t
              added to your progress. Everything else comes back when you reconnect.
            </p>

            {packs === null ? (
              <p className="hm-sub">Loading…</p>
            ) : packs.length === 0 ? (
              <div className="hm-card card-pad off-empty">
                <p className="hm-empty-line">
                  No packs are kept on this device yet. When you&apos;re online, open a study pack and choose
                  <strong> Keep offline</strong>.
                </p>
              </div>
            ) : (
              <ul className="off-list">
                {packs.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="hm-card off-card" onClick={() => setOpenId(p.id)}>
                      <span className="off-card-title">{p.title}</span>
                      <span className="hm-sub">
                        {[p.subject, plural(p.concepts.length, 'concept', 'concepts'), plural(p.questions.length, 'question', 'questions')]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button type="button" className="btn btn-secondary off-retry" onClick={() => window.location.reload()}>
              Try to reconnect
            </button>
          </>
        )}
      </main>
    </div>
  )
}
