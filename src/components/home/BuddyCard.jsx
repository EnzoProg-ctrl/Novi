import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MascotRig } from '../MascotRig'
import { IconArrowRight } from './HomeIcons'
import { useUpload } from '../../context/upload-context'
import { MAX_MESSAGE_CHARS } from '../../lib/chat'
import { Sk } from '../Skeleton'

/**
 * The buddy's corner of Home. The name is real, from the student's own buddy
 * row.
 *
 * With material, it is a way into AI Chat: a question typed here opens a new
 * chat with it already sent (Chat reads it from the navigation state). Home's
 * other buttons cover uploading and practising. Before any material, adding
 * some is the only useful next step, so that stays the button.
 */
export function BuddyCard({ buddyName, hasMaterial, loading = false }) {
  const { openUpload } = useUpload()
  const navigate = useNavigate()
  const name = buddyName ?? 'Novi'
  const [question, setQuestion] = useState('')

  function ask(event) {
    event.preventDefault()
    const text = question.trim()
    // Nothing typed: just open AI Chat.
    navigate('/chat', text ? { state: { ask: text } } : undefined)
  }

  return (
    <section className="hm-card hm-buddy" aria-label={`A note from ${name}`}>
      <MascotRig pose="front" className="hm-buddy-avatar" />

      <div className="hm-buddy-text">
        <p className="hm-buddy-name">{name}</p>
        {loading ? (
          // The message depends on whether there is material yet; guessing
          // would flash "Add material" at students who already have some.
          <span className="sk-stack" style={{ gap: 7, marginTop: 6 }} aria-hidden="true">
            <Sk w="90%" h={11} />
            <Sk w="70%" h={11} />
            <Sk w="100%" h={38} r={12} style={{ marginTop: 6 }} />
          </span>
        ) : hasMaterial ? (
          <>
            <p className="hm-buddy-line">
              You&apos;ve got this!<br />Stuck on something? Ask me.
            </p>
            <form className="hm-buddy-ask" onSubmit={ask} aria-label={`Ask ${name}`}>
              <input
                className="hm-buddy-input"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={`Ask ${name} anything…`}
                aria-label={`Ask ${name} a question`}
                maxLength={MAX_MESSAGE_CHARS}
                enterKeyHint="send"
                autoComplete="off"
              />
              <button
                type="submit"
                className="hm-buddy-send"
                aria-label={question.trim() ? `Send to ${name}` : `Open chat with ${name}`}
                title={question.trim() ? 'Send' : 'Open AI Chat'}
              >
                <IconArrowRight width={16} height={16} />
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="hm-buddy-line">
              Add something to study<br />and we&apos;ll begin.
            </p>
            <button type="button" className="hm-buddy-cta" onClick={openUpload}>
              Add material
              <IconArrowRight width={14} height={14} />
            </button>
          </>
        )}
      </div>
    </section>
  )
}
