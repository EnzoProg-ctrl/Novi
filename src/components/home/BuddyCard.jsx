import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import buddyHead from '../../assets/ask-buddy-head.webp'
import { IconArrowRight } from './HomeIcons'
import { MAX_MESSAGE_CHARS } from '../../lib/chat'
import { Sk } from '../Skeleton'

/**
 * "Ask <buddy>": the way into AI Chat from Home, with or without material. A
 * question typed here opens a new chat with it already sent (Chat reads it
 * from the navigation state); sending with nothing typed just opens AI Chat.
 * Without material the buddy answers from general knowledge, and says so.
 */
export function BuddyCard({ buddyName, hasMaterial, loading = false }) {
  const navigate = useNavigate()
  const name = buddyName ?? 'Novi'
  const [question, setQuestion] = useState('')

  function ask(event) {
    event.preventDefault()
    const text = question.trim()
    navigate('/chat', text ? { state: { ask: text } } : undefined)
  }

  return (
    <section className="hm-card hm-ask" aria-labelledby="hm-ask-title">
      <img src={buddyHead} className="hm-ask-avatar" width={360} height={242} alt="" draggable="false" />
      <span className="hm-ask-divider" aria-hidden="true" />

      <div className="hm-ask-text">
        <h2 id="hm-ask-title" className="hm-ask-title">Ask {name}</h2>
        <p className="hm-sub">
          {loading || hasMaterial ? 'Need help understanding a topic?' : 'Ask anything. Add study material for answers from your own notes.'}
        </p>
      </div>

      {loading ? (
        <Sk className="hm-ask-form" h={46} r={12} />
      ) : (
        <form className="hm-ask-form" onSubmit={ask}>
          <input
            className="hm-ask-input"
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
            className="hm-ask-send"
            aria-label={question.trim() ? `Send to ${name}` : `Open chat with ${name}`}
            title={question.trim() ? 'Send' : 'Open AI Chat'}
          >
            <IconArrowRight width={20} height={20} />
          </button>
        </form>
      )}
    </section>
  )
}
