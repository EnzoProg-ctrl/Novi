import { Link } from 'react-router-dom'
import { OUTFITS, usableOutfit } from '../../lib/outfits'
import { MascotRig } from '../MascotRig'

const capitalised = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')

/** The student's study buddy, with the way into "Edit your buddy". */
export function BuddySettingsCard({ buddy }) {
  if (!buddy) return null
  const outfit = OUTFITS.find((o) => o.id === usableOutfit(buddy.mascot_variant))?.label ?? 'Classic'

  return (
    <section className="hm-card st-card" aria-labelledby="st-buddy-title">
      <h2 id="st-buddy-title" className="st-card-title st-card-title-sm">AI Study Buddy</h2>
      <div className="st-buddy">
        <MascotRig pose="waving-sm" size={64} className="st-buddy-art" />
        <div className="st-buddy-text">
          <p className="st-profile-name">{buddy.name}</p>
          <p className="hm-sub">{capitalised(buddy.personality)} personality · {outfit} outfit</p>
        </div>
        <Link to="/buddy/new" className="btn btn-secondary st-edit">Edit Buddy</Link>
      </div>
    </section>
  )
}
