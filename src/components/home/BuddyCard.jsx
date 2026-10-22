import { Link } from 'react-router-dom'
import { MascotRig } from '../MascotRig'
import { IconArrowRight } from './HomeIcons'

/**
 * The buddy's nudge. The name is real, from the student's own buddy row.
 *
 * "Start Studying" points at /upload: there is no practice session feature yet,
 * and adding material is genuinely the first step toward one. Worth revisiting
 * once sessions exist.
 */
export function BuddyCard({ buddyName, hasMaterial }) {
  const name = buddyName ?? 'Novi'

  return (
    <section className="hm-card hm-buddy" aria-label={`A note from ${name}`}>
      <MascotRig pose="front" className="hm-buddy-avatar" />

      <div className="hm-buddy-text">
        <p className="hm-buddy-name">{name}</p>
        <p className="hm-buddy-line">
          {hasMaterial ? (
            <>You&apos;ve got this!<br />Let&apos;s keep going.</>
          ) : (
            <>Add something to study<br />and we&apos;ll begin.</>
          )}
        </p>
        <Link to="/upload" className="hm-buddy-cta">
          {hasMaterial ? 'Start Studying' : 'Add material'}
          <IconArrowRight width={14} height={14} />
        </Link>
      </div>
    </section>
  )
}
