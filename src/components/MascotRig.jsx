import { useContext } from 'react'
import { AuthContext } from '../context/auth-context'
import { layerSrc, POSE_LAYERS, usableOutfit } from '../lib/outfits'
import './mascot-rig.css'

/**
 * Each pose is its illustration cut into layers: the body, plus the parts that
 * move (a hand, a paw, the drawn Zs). Every layer keeps the full canvas of the
 * original, so they stack in one box, line up exactly, and at rest composite
 * back to the original artwork. How each part moves lives in mascot-rig.css.
 *
 * `waving-sm` is the square avatar framing of the waving pose, for small spots.
 * `laptop-sm` is Novi's AI Chat profile picture: the laptop pose's head and
 * headphones, mirrored to face the conversation.
 *
 * Canvas size of each pose's layers, in pixels: */
const POSE_SIZES = {
  waving: [1278, 1230],
  'waving-sm': [320, 320],
  front: [1230, 1278],
  laptop: [1316, 1195],
  'laptop-sm': [320, 320],
  sleeping: [1536, 1024],
  writing: [1000, 1250],
}

/**
 * `outfit` picks the clothes (see lib/outfits.js); by default it is the
 * signed-in student's buddy's, and the default look when signed out.
 */
export function MascotRig({ pose, className = '', size, alt = '', outfit }) {
  // Read directly, not through useAuth: the mascot also appears where no one
  // is signed in.
  const auth = useContext(AuthContext)
  const wearing = usableOutfit(outfit ?? auth?.buddy?.mascot_variant)
  const layers = POSE_LAYERS[pose]
  const [w, h] = POSE_SIZES[pose]

  return (
    <span
      className={`rig rig-${pose}${className ? ` ${className}` : ''}`}
      style={size ? { width: size } : undefined}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      <img className="rig-body" src={layerSrc(wearing, layers.body)} width={w} height={h} alt="" draggable="false" />
      {Object.entries(layers.parts).map(([name, file]) => (
        <img key={name} className={`rig-part rig-${name}`} src={layerSrc(wearing, file)} alt="" draggable="false" />
      ))}
    </span>
  )
}
