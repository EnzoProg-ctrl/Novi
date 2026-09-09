import { Link } from 'react-router-dom'
import capybara from '../../assets/capybara-avatar.webp'
import { IconBrain, IconCards, IconPencil } from '../home/HomeIcons'
import { IconChevronRight, IconStar } from './PackIcons'

/**
 * Detail for the selected pack.
 *
 * Favourites, Analytics, Notes and Settings appear where the design puts them
 * but are inert: none has a table or a screen behind it yet. They are rendered
 * rather than hidden so the layout does not shift when each one lands.
 */

const TABS = [
  { id: 'contents', label: 'Contents' },
  { id: 'analytics', label: 'Analytics', soon: true },
  { id: 'notes', label: 'Notes', soon: true },
  { id: 'settings', label: 'Settings', soon: true },
]

function relativeDay(iso) {
  if (!iso) return null
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'Updated today'
  if (days === 1) return 'Updated yesterday'
  if (days < 7) return `Updated ${days} days ago`
  const weeks = Math.floor(days / 7)
  return weeks === 1 ? 'Updated 1 week ago' : `Updated ${weeks} weeks ago`
}

export function PackDetail({ pack, tone, Icon }) {
  if (!pack) {
    return (
      <aside className="pd pd-empty">
        <p className="hm-empty-line">Select a study pack to see what is inside it.</p>
      </aside>
    )
  }

  const rows = [
    {
      key: 'concepts',
      Icon: IconCards,
      tone: 'green',
      label: 'Key concepts',
      sub: 'Review key terms and ideas',
      count: `${pack.concepts} ${pack.concepts === 1 ? 'concept' : 'concepts'}`,
      to: `/pack/${pack.id}#concepts`,
    },
    {
      key: 'questions',
      Icon: IconBrain,
      tone: 'blue',
      label: 'Practice questions',
      sub: 'Test your understanding',
      count: `${pack.questions} ${pack.questions === 1 ? 'question' : 'questions'}`,
      to: `/pack/${pack.id}#questions`,
    },
    {
      key: 'summary',
      Icon: IconPencil,
      tone: 'violet',
      label: 'Summary',
      sub: 'A concise review of the main topics',
      count: `${pack.summaries} ${pack.summaries === 1 ? 'summary' : 'summaries'}`,
      to: `/pack/${pack.id}#summary`,
    },
    {
      key: 'notes',
      Icon: IconPencil,
      tone: 'amber',
      label: 'Notes',
      sub: 'Your personal notes',
      count: 'Soon',
      soon: true,
    },
  ]

  return (
    <aside className="pd" aria-label={`Details for ${pack.title}`}>
      <header className="pd-head">
        <span className={`hm-pack-icon is-${tone}`}><Icon /></span>
        <div className="pd-head-text">
          <h2 className="pd-title">{pack.title}</h2>
          <p className="hm-sub">{relativeDay(pack.updatedAt)}</p>
        </div>
        <span className="pd-star is-soon" title="Favourites are not available yet">
          <IconStar />
        </span>
      </header>

      {pack.excerpt && <p className="pd-excerpt">{pack.excerpt}</p>}

      <div className="pd-stats">
        <div className="pd-stat is-green">
          <span className="pd-stat-value">{pack.concepts}</span>
          <span className="pd-stat-label">Concepts</span>
        </div>
        <div className="pd-stat is-blue">
          <span className="pd-stat-value">{pack.questions}</span>
          <span className="pd-stat-label">Questions</span>
        </div>
        <div className="pd-stat is-violet">
          <span className="pd-stat-value">{pack.summaries}</span>
          <span className="pd-stat-label">
            {pack.summaries === 1 ? 'Summary' : 'Summaries'}
          </span>
        </div>
      </div>

      <div className="pd-actions">
        {/* No practice screen exists yet, so this stays inert rather than
            leading somewhere that would bounce the student out. */}
        <span className="pd-primary is-soon" aria-disabled="true">
          Continue Studying
          <span className="nv-soon">Soon</span>
        </span>
        <Link to={`/pack/${pack.id}`} className="pd-secondary">View Pack</Link>
      </div>

      <nav className="pd-tabs" aria-label="Pack sections">
        {TABS.map((tab) => (
          <span
            key={tab.id}
            className={`pd-tab${tab.soon ? ' is-soon' : ' is-active'}`}
            aria-current={tab.soon ? undefined : 'true'}
            aria-disabled={tab.soon ? 'true' : undefined}
          >
            {tab.label}
            {tab.soon && <span className="nv-soon">Soon</span>}
          </span>
        ))}
      </nav>

      <ul className="pd-contents">
        {rows.map((row) => {
          const inner = (
            <>
              <span className={`hm-pack-icon is-${row.tone}`}><row.Icon width={17} height={17} /></span>
              <span className="pd-row-text">
                <span className="pd-row-label">{row.label}</span>
                <span className="hm-sub">{row.sub}</span>
              </span>
              <span className="pd-row-count">{row.count}</span>
              {!row.soon && <IconChevronRight width={16} height={16} />}
            </>
          )
          return (
            <li key={row.key}>
              {row.soon ? (
                <span className="pd-row is-soon" aria-disabled="true">{inner}</span>
              ) : (
                <Link to={row.to} className="pd-row">{inner}</Link>
              )}
            </li>
          )
        })}
      </ul>

      <div className="pd-cheer">
        <img src={capybara} alt="" width="320" height="320" />
        <div>
          <p className="pd-cheer-line">You&apos;ve got this! Keep going.</p>
          <p className="pd-cheer-quote">&ldquo;Progress looks good on you.&rdquo; — Novi</p>
        </div>
      </div>
    </aside>
  )
}
