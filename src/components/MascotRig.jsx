import frontBody from '../assets/rig/front-body.webp'
import frontPawL from '../assets/rig/front-paw-l.webp'
import frontPawR from '../assets/rig/front-paw-r.webp'
import laptopBody from '../assets/rig/laptop-body.webp'
import laptopHearts from '../assets/rig/laptop-hearts.webp'
import laptopMusic from '../assets/rig/laptop-music.webp'
import laptopPaw from '../assets/rig/laptop-paw.webp'
import sleepingBody from '../assets/rig/sleeping-body.webp'
import sleepingZ1 from '../assets/rig/sleeping-z1.webp'
import sleepingZ2 from '../assets/rig/sleeping-z2.webp'
import sleepingZ3 from '../assets/rig/sleeping-z3.webp'
import wavingBody from '../assets/rig/waving-body.webp'
import wavingHand from '../assets/rig/waving-hand.webp'
import wavingLines from '../assets/rig/waving-lines.webp'
import wavingSmBody from '../assets/rig/waving-sm-body.webp'
import wavingSmHand from '../assets/rig/waving-sm-hand.webp'
import wavingSmLines from '../assets/rig/waving-sm-lines.webp'
import './mascot-rig.css'

/**
 * Each pose is its illustration cut into layers: the body, plus the parts that
 * move (a hand, a paw, the drawn Zs). Every layer keeps the full canvas of the
 * original, so they stack in one box, line up exactly, and at rest composite
 * back to the original artwork. How each part moves lives in mascot-rig.css.
 *
 * `waving-sm` is the square avatar framing of the waving pose, for small spots.
 */
const POSES = {
  waving: { size: [1278, 1230], body: wavingBody, parts: { hand: wavingHand, lines: wavingLines } },
  'waving-sm': { size: [320, 320], body: wavingSmBody, parts: { hand: wavingSmHand, lines: wavingSmLines } },
  front: { size: [1230, 1278], body: frontBody, parts: { 'paw-l': frontPawL, 'paw-r': frontPawR } },
  laptop: {
    size: [1316, 1195],
    body: laptopBody,
    parts: { paw: laptopPaw, music: laptopMusic, hearts: laptopHearts },
  },
  sleeping: { size: [1536, 1024], body: sleepingBody, parts: { z1: sleepingZ1, z2: sleepingZ2, z3: sleepingZ3 } },
}

export function MascotRig({ pose, className = '', size, alt = '' }) {
  const rig = POSES[pose]
  const [w, h] = rig.size

  return (
    <span
      className={`rig rig-${pose}${className ? ` ${className}` : ''}`}
      style={size ? { width: size } : undefined}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      <img className="rig-body" src={rig.body} width={w} height={h} alt="" draggable="false" />
      {Object.entries(rig.parts).map(([name, src]) => (
        <img key={name} className={`rig-part rig-${name}`} src={src} alt="" draggable="false" />
      ))}
    </span>
  )
}
