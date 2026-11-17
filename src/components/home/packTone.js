import { IconPackAtom, IconPackBook, IconPackGrid } from './HomeIcons'

const PACK_TONES = [
  { tone: 'green', Icon: IconPackGrid },
  { tone: 'blue', Icon: IconPackAtom },
  { tone: 'pink', Icon: IconPackBook },
  { tone: 'violet', Icon: IconPackGrid },
]

/** Same pack, same colour, wherever it is shown. */
export function toneFor(id) {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return PACK_TONES[hash % PACK_TONES.length]
}
