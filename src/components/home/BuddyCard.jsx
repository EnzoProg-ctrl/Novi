import { MascotRig } from '../MascotRig'
import { IconArrowRight } from './HomeIcons'
import { useUpload } from '../../context/upload-context'

/**
 * The buddy's nudge. The name is real, from the student's own buddy row.
 *
 * Both labels open the add-material pop-up. "Start Studying" predates practice
 * sessions; now that they exist it could point somewhere more useful.
 */
export function BuddyCard({ buddyName, hasMaterial }) {
  const { openUpload } = useUpload()
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
        <button type="button" className="hm-buddy-cta" onClick={openUpload}>
          {hasMaterial ? 'Start Studying' : 'Add material'}
          <IconArrowRight width={14} height={14} />
        </button>
      </div>
    </section>
  )
}
