import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Markdown } from '../study/Markdown'
import { MascotRig } from '../MascotRig'
import { IconCheck, IconCopy, IconNotes, IconQuiz, IconRefresh, IconThumbDown, IconThumbUp } from './ChatIcons'

const timeOf = (date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** Novi's profile picture, beside replies and in the chat header. */
export function NoviAvatar({ size = 32 }) {
  return (
    <span className="ch-avatar" style={{ width: size, height: size }}>
      <MascotRig pose="laptop-sm" />
    </span>
  )
}

export function UserMessage({ message, initials }) {
  const attachment = message.metadata?.attachment ?? null
  return (
    <li className={`ch-msg is-user${message.pending ? ' is-pending' : ''}`}>
      <div className="ch-msg-body">
        {attachment && (
          <span className="ch-sent-file" title={attachment.title}>
            <IconNotes width={15} height={15} />
            <span>{attachment.title}</span>
          </span>
        )}
        <div className="ch-bubble">{message.content}</div>
        <span className="ch-meta">{message.pending ? 'Sending…' : timeOf(message.createdAt)}</span>
      </div>
      <span className="ch-user-avatar" aria-hidden="true">{initials}</span>
    </li>
  )
}

/**
 * A reply from Novi. Controls appear only where they work: copy always,
 * feedback once the reply is saved, regenerate on the latest reply only.
 */
export function BuddyMessage({ message, canRegenerate, busy, isLast, onRegenerate, onFeedback, onAskCount, arrived = null }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked: nothing useful to show */
    }
  }

  const feedback = message.metadata.feedback ?? null
  const sources = message.metadata.used_material ? message.metadata.sources ?? [] : []
  const quiz = message.metadata.quiz ?? null
  const ask = message.metadata.ask_quiz_count ?? null

  return (
    // `arrived`: this reply just replaced "Novi is typing" ('morph' or 'fade').
    <li className={`ch-msg is-buddy${arrived ? ` is-arrived is-arrived-${arrived}` : ''}`}>
      <NoviAvatar />
      <div className="ch-msg-body">
        <div className="ch-bubble">
          <Markdown content={message.content} className="ch-md" />
          {sources.length > 0 && (
            <p className="ch-source">
              From your study material: {sources.join(', ')}
            </p>
          )}
          {quiz && (
            <div className="ch-quiz">
              <span className="ch-quiz-icon"><IconQuiz /></span>
              <span className="ch-quiz-text">
                <span className="ch-quiz-title">{quiz.created ? 'New study pack' : 'Added to your pack'}</span>
                <span className="ch-quiz-sub" title={quiz.pack_title}>
                  {quiz.pack_title} · {quiz.added} {quiz.added === 1 ? 'question' : 'questions'}
                </span>
              </span>
              <span className="ch-quiz-actions">
                <Link to={`/pack/${quiz.pack_id}/practice`} className="ch-quiz-cta">Start practice</Link>
                <Link to={`/pack/${quiz.pack_id}`} className="ch-quiz-link">View pack</Link>
              </span>
            </div>
          )}
        </div>
        {ask && isLast && (
          <div className="ch-ask" role="group" aria-label="How many practice questions?">
            <span className="ch-ask-label">How many practice questions?</span>
            <span className="ch-ask-options">
              {(ask.options ?? [5, 10, 20, 30, 50]).map((n) => (
                <button key={n} type="button" className="ch-ask-btn" disabled={busy} onClick={() => onAskCount(n, ask.topic)}>
                  {n}
                </button>
              ))}
            </span>
          </div>
        )}
        <div className="ch-actions">
          <span className="ch-meta">{timeOf(message.createdAt)}</span>
          <button type="button" className="ch-icon-btn" onClick={copy} aria-label={copied ? 'Copied' : 'Copy reply'} title={copied ? 'Copied' : 'Copy'}>
            {copied ? <IconCheck width={16} height={16} /> : <IconCopy width={16} height={16} />}
          </button>
          {canRegenerate && (
            <button type="button" className="ch-icon-btn" onClick={onRegenerate} disabled={busy} aria-label="Regenerate reply" title="Regenerate">
              <IconRefresh width={16} height={16} />
            </button>
          )}
          <button
            type="button"
            className={`ch-icon-btn${feedback === 'up' ? ' is-on' : ''}`}
            onClick={() => onFeedback(message, feedback === 'up' ? null : 'up')}
            aria-label="Helpful"
            aria-pressed={feedback === 'up'}
            title="Helpful"
          >
            <IconThumbUp width={16} height={16} />
          </button>
          <button
            type="button"
            className={`ch-icon-btn${feedback === 'down' ? ' is-on' : ''}`}
            onClick={() => onFeedback(message, feedback === 'down' ? null : 'down')}
            aria-label="Not helpful"
            aria-pressed={feedback === 'down'}
            title="Not helpful"
          >
            <IconThumbDown width={16} height={16} />
          </button>
        </div>
      </div>
    </li>
  )
}

/** Past this, a reply is a long one (a big quiz, say): say so, so it never looks stuck. */
const SLOW_REPLY_MS = 10_000

/**
 * Novi at the laptop while a reply is on its way, so it feels like someone is
 * writing back. The art is flipped to face the conversation.
 */
export function TypingIndicator({ name = 'Novi' }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_REPLY_MS)
    return () => clearTimeout(t)
  }, [])

  return (
    <li className="ch-msg is-buddy is-typing">
      <span className="ch-typing-art" aria-hidden="true">
        <span className="ch-typing-flip">
          <MascotRig pose="laptop" />
        </span>
      </span>
      <div className="ch-typing-pill" role="status">
        <span className="ch-dots" aria-hidden="true"><span /><span /><span /></span>
        <span key={slow ? 'slow' : 'typing'} className="ch-typing-text">
          {slow ? `${name} is still typing. This one takes a moment…` : `${name} is typing…`}
        </span>
      </div>
    </li>
  )
}
