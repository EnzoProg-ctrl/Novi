import { useUpload } from '../../context/upload-context'
import { IconUpload } from './HomeIcons'

/**
 * The top of Home for a student with nothing uploaded yet: the one thing to
 * do first. Takes the place of "Pick up where you left off", which has
 * nothing to show until a pack exists.
 */
export function FirstStep() {
  const { openUpload } = useUpload()
  return (
    <section className="hm-card hm-first" aria-labelledby="hm-first-title">
      <span className="hm-first-icon" aria-hidden="true"><IconUpload width={24} height={24} /></span>
      <div className="hm-first-text">
        <h2 id="hm-first-title" className="hm-first-title">Start with your first study material</h2>
        <p className="hm-sub">
          Upload notes, slides, a document or a photo. Novi turns it into a study pack with a
          summary, key concepts and practice questions.
        </p>
      </div>
      <button type="button" className="btn btn-primary hm-first-cta" onClick={openUpload}>
        <IconUpload width={18} height={18} />
        Upload material
      </button>
    </section>
  )
}
