/**
 * The buddy's outfits. Each is the same mascot paintings with different
 * clothes, cut into layers by scripts/build_mascot_rigs.py --outfit <id> into
 * src/assets/rig/<id>/. An outfit becomes choosable on its own once all of
 * its layers are there; until then the buddy wears the default look.
 *
 * Ids match the check constraint on public.buddies.mascot_variant.
 */

export const OUTFITS = [
  { id: 'default', label: 'Classic' },
  { id: 'smart_casual', label: 'Smart casual' },
  { id: 'formal', label: 'Formal' },
  { id: 'uniform', label: 'School uniform' },
]

/** Every layer image, keyed like '../assets/rig/front-body.webp' or '../assets/rig/formal/front-body.webp'. */
const LAYERS = import.meta.glob('../assets/rig/**/*.webp', { eager: true, import: 'default' })

/** The layer names each pose is made of (file names without .webp). */
export const POSE_LAYERS = {
  waving: { body: 'waving-body', parts: { hand: 'waving-hand', lines: 'waving-lines' } },
  'waving-sm': { body: 'waving-sm-body', parts: { hand: 'waving-sm-hand', lines: 'waving-sm-lines' } },
  front: { body: 'front-body', parts: { 'paw-l': 'front-paw-l', 'paw-r': 'front-paw-r' } },
  laptop: { body: 'laptop-body', parts: { paw: 'laptop-paw', music: 'laptop-music', hearts: 'laptop-hearts' } },
  'laptop-sm': { body: 'laptop-sm-body', parts: { music: 'laptop-sm-music' } },
  sleeping: { body: 'sleeping-body', parts: { z1: 'sleeping-z1', z2: 'sleeping-z2', z3: 'sleeping-z3' } },
  // Home's buddy card: writing notes on a clipboard, the paw and pen scribbling.
  writing: { body: 'writing-body', parts: { hand: 'writing-hand' } },
}

const ALL_LAYER_NAMES = Object.values(POSE_LAYERS).flatMap((p) => [p.body, ...Object.values(p.parts)])

const fileFor = (outfit, name) =>
  LAYERS[outfit && outfit !== 'default' ? `../assets/rig/${outfit}/${name}.webp` : `../assets/rig/${name}.webp`]

/** The image for one layer in this outfit, or the default look's if the outfit lacks it. */
export function layerSrc(outfit, name) {
  return fileFor(outfit, name) ?? fileFor('default', name)
}

/** Outfits whose layers are all present, in display order. Classic always is. */
export const AVAILABLE_OUTFITS = OUTFITS.filter(
  (o) => o.id === 'default' || ALL_LAYER_NAMES.every((name) => fileFor(o.id, name)),
)

/** A saved outfit the app can show, or 'default'. */
export function usableOutfit(id) {
  return AVAILABLE_OUTFITS.some((o) => o.id === id) ? id : 'default'
}
