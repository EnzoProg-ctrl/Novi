const STATUS_TEXT = {
  uploaded: 'Waiting to start',
  extracting: 'Reading it',
  embedding: 'Indexing',
  generating: 'Writing your study pack',
  failed: 'Failed',
}

/**
 * Uploads that aren't a study pack yet: still processing, or failed with a
 * way to try again. Shows nothing once everything is ready; the packs
 * themselves are listed under Recent Study Packs and managed on Study Packs.
 */
export function UploadStatus({ materials = [], retryingId, onRetry, onRemove }) {
  const pending = materials.filter((m) => m.status !== 'ready')
  if (pending.length === 0) return null

  return (
    <section className="hm-uploads" aria-label="Uploads in progress">
      <ul className="hm-uploads-list" aria-live="polite">
        {pending.map((m) => {
          const failed = m.status === 'failed'
          return (
            <li key={m.id} className={`hm-upload${failed ? ' is-failed' : ''}`}>
              {!failed && <span className="hm-upload-spinner" aria-hidden="true" />}
              <span className="hm-upload-meta">
                <span className="hm-upload-title" title={m.title}>{m.title}</span>
                <span className="hm-upload-state">
                  {failed ? (m.error_message || 'This upload could not be turned into a study pack.') : STATUS_TEXT[m.status] ?? 'Processing'}
                </span>
              </span>
              {failed && (
                <button
                  type="button"
                  className="btn btn-secondary hm-retry"
                  onClick={() => onRetry(m)}
                  disabled={retryingId === m.id}
                  aria-label={`Try processing ${m.title} again`}
                >
                  {retryingId === m.id ? 'Starting…' : 'Try again'}
                </button>
              )}
              {failed && (
                <button
                  type="button"
                  className="btn btn-ghost hm-retry"
                  onClick={() => onRemove(m)}
                  aria-label={`Remove ${m.title}`}
                >
                  Remove
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
