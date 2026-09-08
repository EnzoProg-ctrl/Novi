/**
 * Per-subject mastery. Each row averages the topic_mastery scores of the
 * topics in that subject, so it stays empty until practice actually happens.
 */
export function ProgressCard({ subjects = [], loading }) {
  return (
    <section className="hm-card hm-progress" aria-label="Your progress">
      <header className="hm-card-head">
        <p className="hm-card-title">Your Progress</p>
        {subjects.length > 0 && <span className="hm-muted-link">View All</span>}
      </header>

      {loading ? (
        <p className="hm-empty-line">Loading…</p>
      ) : subjects.length === 0 ? (
        <p className="hm-empty-line">
          Nothing measured yet. Practice questions will fill this in.
        </p>
      ) : (
        <ul className="hm-progress-list">
          {subjects.map(({ id, name, percent }) => (
            <li key={id}>
              <span className="hm-progress-name">{name}</span>
              <span className="hm-progress-track">
                <span className="hm-progress-fill" style={{ width: `${percent}%` }} />
              </span>
              <span className="hm-progress-value">{percent}%</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
