/**
 * "Did you mean name@gmail.com?" under an email field, with a one-tap fix.
 * "Keep mine" is for the rare real address that only looks like a typo.
 */
export function EmailSuggestion({ suggestion, onUse, onKeep }) {
  if (!suggestion) return null
  return (
    <div className="msg msg-info email-suggest" role="status">
      <p>
        Did you mean <strong>{suggestion}</strong>?
      </p>
      <span className="email-suggest-actions">
        <button type="button" className="btn btn-secondary email-suggest-btn" onClick={() => onUse(suggestion)}>
          Use this
        </button>
        <button type="button" className="email-suggest-keep" onClick={onKeep}>
          Keep mine
        </button>
      </span>
    </div>
  )
}
