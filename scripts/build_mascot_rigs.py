"""
Cuts each mascot illustration into animatable layers for MascotRig.

    python scripts/build_mascot_rigs.py                     (needs numpy, Pillow, scipy;
                                                             opencv-python-headless for smooth fills)
    python scripts/build_mascot_rigs.py --outfit formal     (one outfit)

An outfit is the same four paintings with different clothes, in
src/assets/outfits/<outfit>/ (PNG or WebP, same file names and canvas sizes,
same pose). Its layers go to src/assets/rig/<outfit>/, where MascotRig finds
them; the cut lines and pivots below are shared, so the pose must not move.

Re-run after replacing any of the source illustrations; if a pose changes,
the polygons and pivots below (and the matching percentages in
src/components/mascot-rig.css) need re-measuring against the new artwork.

Every layer keeps the full canvas size of its source, so layers stack exactly
by sharing one box, and a pivot can be written as a percentage of that box.
At rest, the layers composite back to the original artwork pixel for pixel.
"""
import argparse
import json
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUTFITS = ('smart_casual', 'formal', 'uniform')
parser = argparse.ArgumentParser(description='Cut the mascot paintings into rig layers.')
parser.add_argument('--outfit', choices=OUTFITS, help='build one outfit instead of the default look')
parser.add_argument('--pose', choices=('waving', 'front', 'laptop', 'sleeping', 'writing'),
                    help='build only this pose (default: all)')
args = parser.parse_args()
outfit, only_pose = args.outfit, args.pose

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'src', 'assets')
SRC = os.path.join(ASSETS, 'outfits', outfit) if outfit else ASSETS
OUT = os.path.join(ASSETS, 'rig', outfit) if outfit else os.path.join(ASSETS, 'rig')
os.makedirs(OUT, exist_ok=True)


def load(name):
    """A source painting; an outfit may supply it as .png instead of .webp."""
    path = f'{SRC}/{name}'
    if outfit and not os.path.exists(path):
        png = path.rsplit('.', 1)[0] + '.png'
        path = png if os.path.exists(png) else path
    im = Image.open(path).convert('RGBA')
    if outfit:
        default = Image.open(f'{ASSETS}/{name}')
        if im.size != default.size:
            raise SystemExit(f'{path} is {im.size[0]}x{im.size[1]}; it must match the default art, '
                             f'{default.size[0]}x{default.size[1]}, so the moving parts line up.')
    return np.array(im).astype(np.float64)


def poly_mask(shape, points):
    m = Image.new('L', (shape[1], shape[0]), 0)
    ImageDraw.Draw(m).polygon(points, fill=255)
    return np.array(m) > 127


def ellipse_mask(shape, box):
    m = Image.new('L', (shape[1], shape[0]), 0)
    ImageDraw.Draw(m).ellipse(box, fill=255)
    return np.array(m) > 127


def rect_mask(shape, box):
    x0, y0, x1, y1 = box
    m = np.zeros(shape[:2], bool)
    m[y0:y1, x0:x1] = True
    return m


def coral(img):
    """The coral accent (Zs, sound lines, hearts): strong red, weak green."""
    r, g, b, a = img[..., 0], img[..., 1], img[..., 2], img[..., 3]
    return (a > 0) & (r > 170) & (g < 150) & (b < 140) & (r - g > 80)


def dilate(mask, px=1):
    im = Image.fromarray((mask * 255).astype(np.uint8))
    return np.array(im.filter(ImageFilter.MaxFilter(px * 2 + 1))) > 127


def take(img, mask):
    """Layer containing only the masked pixels."""
    out = img.copy()
    out[~mask, 3] = 0
    return out


def erase(img, mask):
    out = img.copy()
    out[mask, 3] = 0
    return out


def inpaint(img, hole):
    """
    Fills `hole` (where a moving part was cut out) with what plausibly sits
    behind it, so the part never reveals a gap as it moves. Only where the
    rest of the figure surrounds the hole is it filled: a part that sticks out
    over the background (the waving hand's tip) leaves background behind,
    not a smudged copy of itself. Uses OpenCV's Telea inpainting when it's
    installed (smooth, follows edges); otherwise an onion-peel fill.
    """
    try:
        import cv2
        from scipy import ndimage
    except ImportError:
        return _onion_fill(img, hole)
    out = img.copy()
    rest = (out[..., 3] > 200) & ~hole
    # Behind the part: inside the figure's own outline, with small bites (where
    # the part crossed the figure's edge) closed over.
    yy, xx = np.mgrid[-24:25, -24:25]
    disk = (xx * xx + yy * yy) <= 24 * 24
    behind = ndimage.binary_fill_holes(ndimage.binary_closing(rest, structure=disk))
    fill = hole & behind
    rgb = np.clip(out[..., :3], 0, 255).astype(np.uint8)[..., ::-1]
    # Transparent pixels carry no real colour: give them the figure's nearest
    # colours first, so the fill never pulls in a white or black fringe.
    unknown = ((~rest) * 255).astype(np.uint8)
    rgb = cv2.inpaint(np.ascontiguousarray(rgb), unknown, 3, cv2.INPAINT_TELEA)
    # Telea leaves star-shaped streaks across a large hole; repeated blurring
    # inside the hole only (its surroundings held fixed) settles them into a
    # soft blend of the colours around it.
    smooth = rgb.astype(np.float32)
    for _ in range(40):
        smooth[fill] = cv2.blur(smooth, (9, 9))[fill]
    rgb = np.clip(smooth, 0, 255).astype(np.uint8)[..., ::-1]
    out[..., :3][fill] = rgb[fill]
    out[..., 3][fill] = 255
    return out


def _onion_fill(img, hole):
    out = img.copy()
    known = (out[..., 3] > 200) & ~hole
    todo = hole.copy()
    rgb = out[..., :3]
    offsets = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)]
    while todo.any():
        acc = np.zeros_like(rgb)
        cnt = np.zeros(known.shape)
        for dy, dx in offsets:
            k = np.roll(np.roll(known, dy, 0), dx, 1)
            c = np.roll(np.roll(rgb, dy, 0), dx, 1)
            acc += c * k[..., None]
            cnt += k
        ring = todo & (cnt > 0)
        if not ring.any():
            break
        rgb[ring] = acc[ring] / cnt[ring][:, None]
        known = known | ring
        todo = todo & ~ring
    for _ in range(12):
        acc = np.zeros_like(rgb)
        for dy, dx in offsets[:4]:
            acc += np.roll(np.roll(rgb, dy, 0), dx, 1)
        rgb[hole] = (acc[hole] / 4) * 0.6 + rgb[hole] * 0.4
    out[..., :3] = rgb
    out[hole, 3] = 255
    return out


def save(arr, name):
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA').save(
        f'{OUT}/{name}.webp', 'WEBP', quality=88, method=6)


def save_small(arr, name, scale, offset, size):
    """The square avatar crop: the full art scaled and offset onto a canvas."""
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')
    w, h = round(im.width * scale), round(im.height * scale)
    small = im.resize((w, h), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(small, offset)
    canvas.save(f'{OUT}/{name}.webp', 'WEBP', quality=90, method=6)


pivots = {}

# ── Waving (landing hero + the square avatar) ─────────────────────
# The waving paw's edge against the head, from the cuff up to the top of the
# paw. The outfits were drawn separately and their heads sit closer to the
# paw, so each traces its own; past the top the outline is shared.
WAVING_HEAD_SIDE = {
    None:           [(1022, 604), (1031, 585), (1040, 556), (1053, 539), (1073, 514), (1097, 488), (1125, 478)],
    'smart_casual': [(1038, 592), (1046, 566), (1057, 539), (1074, 511), (1097, 484), (1126, 474)],
    'formal':       [(1028, 602), (1034, 575), (1040, 550), (1058, 514), (1088, 493), (1124, 483)],
    'uniform':      [(1022, 602), (1027, 585), (1040, 549), (1058, 518), (1083, 498), (1121, 486)],
}


WAVING_BAND_DROP = {'uniform': 16}


def build_waving():
    """Waving pose and its square avatar."""
    img = load('capybara_landingpage.webp')
    H, W = img.shape[:2]
    # The hand waves at the wrist. Swinging the whole arm from the shoulder opened a
    # gap beside the head; a wave is mostly the hand anyway.
    head_side = WAVING_HEAD_SIDE[outfit]
    # On a bare forearm the strip that stays put is moved down off the paw's
    # dark lower edge onto the plain arm, where it doesn't show as the hand turns.
    drop = WAVING_BAND_DROP.get(outfit, 0)
    cuff = [(head_side[0][0] - drop // 2, head_side[0][1] + drop), (1160, 700 + drop)]  # where the paw meets the sleeve
    hand = poly_mask(img.shape, [
        cuff[0], *head_side,                                            # head side
        (1170, 480), (1212, 505), (1236, 560), (1238, 640), (1205, 700),  # over background
        cuff[1],
    ])
    # A band of paw just above the cuff stays on the body, so the wrist never opens
    # up while the hand turns over it.
    inner = [(1038, 581 + drop), (1176, 677 + drop)]
    band = hand & poly_mask(img.shape, [cuff[0], inner[0], inner[1], cuff[1]])
    alpha = img[..., 3] > 0
    lines = rect_mask(img.shape, (1065, 255, 1250, 472)) & alpha
    hole = hand & ~band
    body = erase(inpaint(erase(img, hole), hole), lines)
    save(body, 'waving-body')
    # Across that band the hand fades out (fully there at its top edge, gone
    # at the cuff), so as it turns it blends into the wrist instead of
    # showing a second edge. Bare forearms showed that edge most.
    (cx0, cy0), (cx1, cy1) = cuff
    nx, ny = cy1 - cy0, -(cx1 - cx0)                      # normal to the cuff line
    norm = (nx * nx + ny * ny) ** 0.5
    ys, xs = np.mgrid[0:H, 0:W]
    dist = ((xs - cx0) * nx + (ys - cy0) * ny) / norm      # distance from the cuff line
    band_top = abs(((inner[0][0] - cx0) * nx + (inner[0][1] - cy0) * ny) / norm)
    fade = np.clip(np.abs(dist) / max(band_top, 1), 0, 1)
    hand_layer = take(img, hand)
    hand_layer[..., 3] = hand_layer[..., 3] * np.where(band, fade, 1)
    save(hand_layer, 'waving-hand')
    save(take(img, lines), 'waving-lines')
    pivots['waving'] = {'size': [W, H], 'hand': [1090, 652], 'lines': [1150, 380]}

    AV_SCALE, AV_OFFSET = 0.25696, (0, 9)
    for part, arr in [('body', body), ('hand', hand_layer), ('lines', take(img, lines))]:
        save_small(arr, f'waving-sm-{part}', AV_SCALE, AV_OFFSET, 320)
    pivots['waving-sm'] = {
        'size': [320, 320],
        'hand': [1090 * AV_SCALE + AV_OFFSET[0], 652 * AV_SCALE + AV_OFFSET[1]],
        'lines': [1150 * AV_SCALE + AV_OFFSET[0], 380 * AV_SCALE + AV_OFFSET[1]],
    }


# ── Facing front (buddy card): paws held up, pumped in turn ──────
# Each raised paw, from its top down to the sleeve cuff, as an oval box
# (x0, y0, x1, y1). The outfits were drawn separately, with paws a little
# higher and narrower than Classic's, so each has its own: one shared oval
# carried chunks of sweater and chin along with the paw.
FRONT_PAWS = {
    None:           ((250, 650, 480, 885), (755, 650, 1005, 885)),
    'smart_casual': ((260, 630, 475, 820), (740, 630, 965, 820)),
    'formal':       ((275, 650, 480, 835), (750, 650, 975, 835)),
    'uniform':      ((285, 612, 525, 866), (720, 612, 965, 866)),
}


# Outfits whose arms are bare below a short sleeve: their moving paws are cut
# by fur colour and feathered where they meet the arm.
BARE_ARMS = {'uniform'}


def is_fur(img):
    """Warm fur: its green is 0.60-0.65 of its red, in light or deep shadow.
    Knits and collars sit at 0.77 or above, maroon ties and crest edges at
    0.33-0.45, so a band of 0.5-0.7 keeps only fur."""
    r, g, b, a = (img[..., i] for i in range(4))
    return (a > 120) & (g >= b) & (g < 0.7 * r) & (g > 0.5 * r) & (r < 250)


def forearm_paw(img, box, reach=40, feather=26):
    """The fur inside a paw's oval, extended `reach` px down the arm, with an
    alpha fade over its lowest `feather` px. Returns (mask, fade 0..1)."""
    from scipy import ndimage
    x0, y0, x1, y1 = box
    region = ellipse_mask(img.shape, box) | ellipse_mask(img.shape, (x0, y0 + reach, x1, y1 + reach))
    fur = is_fur(img) & region
    lab, n = ndimage.label(fur)
    if n == 0:
        raise SystemExit(f'no fur in front paw box {box}')
    sizes = ndimage.sum(fur, lab, range(1, n + 1))
    paw = lab == (int(np.argmax(sizes)) + 1)
    paw = dilate(ndimage.binary_fill_holes(ndimage.binary_closing(paw, iterations=4)), 2) & region
    ys = np.arange(img.shape[0])[:, None].repeat(img.shape[1], 1)
    bottom = y1 + reach
    fade = np.clip((bottom - ys) / feather, 0, 1)
    return paw, np.where(paw, fade, 0)


def build_front():
    """Facing-front pose."""
    img = load('facingfront_mascot.webp')
    H, W = img.shape[:2]
    left, right = FRONT_PAWS[outfit]
    paw_l = ellipse_mask(img.shape, left)
    paw_r = ellipse_mask(img.shape, right)
    fade_l = fade_r = None
    if outfit in BARE_ARMS:
        # Bare forearms: the oval cut across the arm and caught collar and
        # sleeve-stripe pieces. Take the fur only, reaching a little further
        # down the arm, and fade it out at the bottom so the arm has no step.
        paw_l, fade_l = forearm_paw(img, left)
        paw_r, fade_r = forearm_paw(img, right)
    if fade_l is None:
        hole = paw_l | paw_r
    else:
        # The faded strip at the bottom keeps the real arm underneath; only
        # the part that moves fully is filled behind.
        hole = (paw_l & (fade_l >= 1)) | (paw_r & (fade_r >= 1))
    body = inpaint(erase(img, hole), hole)
    save(body, 'front-body')
    for paw, fade, name in ((paw_l, fade_l, 'front-paw-l'), (paw_r, fade_r, 'front-paw-r')):
        layer = take(img, paw)
        if fade is not None:
            layer[..., 3] = layer[..., 3] * fade
        save(layer, name)
    pivots['front'] = {'size': [W, H], 'paw_l': [395, 880], 'paw_r': [860, 880]}


# ── Laptop: typing paw, music lines, drifting hearts ─────────────
# Where to look for the typing paw. Smart casual's pink knit is close to fur
# in colour, so its box starts just above the paw to keep the sweater out.
LAPTOP_PAW_BOX = {'smart_casual': (700, 898, 985, 1085)}


def fur_paw_mask(img, seed, box):
    """The connected patch of fur (warm browns) around `seed`, inside `box`
    (x0, y0, x1, y1), with its creases filled in and its soft edge included."""
    from scipy import ndimage
    r, g, b, a = (img[..., i] for i in range(4))
    # Fur's green is 0.60-0.65 of its red, in light or deep shadow; the mauve
    # sweater and its cuff sit at 0.73-0.77 and maroon at 0.33-0.45.
    fur = (a > 160) & (g >= b) & (g < 0.7 * r) & (g > 0.5 * r) & (r < 250)
    region = np.zeros(fur.shape, bool)
    x0, y0, x1, y1 = box
    region[y0:y1, x0:x1] = True
    lab, _ = ndimage.label(fur & region)
    sx, sy = seed
    near = lab[sy - 25:sy + 25, sx - 25:sx + 25]
    labels, counts = np.unique(near[near > 0], return_counts=True)
    if len(labels) == 0:
        raise SystemExit(f'no fur found near {seed}; check the laptop painting')
    pick = labels[np.argmax(counts)]
    paw = ndimage.binary_fill_holes(ndimage.binary_closing(lab == pick, iterations=4))
    return dilate(paw, 3) & region


def build_laptop():
    """Laptop pose and the AI Chat avatar."""
    img = load('laptop_mascot.webp')
    H, W = img.shape[:2]
    # The typing paw, found by its fur colour: each outfit's painting puts it
    # in a slightly different spot, and a fixed outline left part of the paw
    # behind on the body. Bounded on the right by the wrist (the pivot) so the
    # forearm and sleeve stay put.
    paw = fur_paw_mask(img, seed=(860, 990), box=LAPTOP_PAW_BOX.get(outfit, (700, 840, 985, 1085)))
    music = poly_mask(img.shape, [(1140, 270), (1310, 270), (1310, 505), (1185, 505), (1165, 400), (1140, 400)]) & dilate(coral(img), 1)
    hearts = rect_mask(img.shape, (12, 990, 212, 1082)) & dilate(coral(img), 1)
    # Feather the join at the wrist: across the last 34px before the cut the
    # paw layer fades out and the body keeps the real fur, so the tap never
    # opens a hard seam where the paw meets the forearm.
    wrist_x, feather = 985, 34
    xs = np.arange(img.shape[1])[None, :].repeat(img.shape[0], 0)
    band = paw & (xs >= wrist_x - feather)
    hole = paw & ~band
    body = inpaint(erase(img, hole), hole)
    save(erase(erase(body, music), hearts), 'laptop-body')
    paw_layer = take(img, paw)
    ramp = np.clip((wrist_x - xs) / feather, 0, 1)
    paw_layer[..., 3] = paw_layer[..., 3] * np.where(band, ramp, 1)
    save(paw_layer, 'laptop-paw')
    save(take(img, music), 'laptop-music')
    save(take(img, hearts), 'laptop-hearts')
    pivots['laptop'] = {'size': [W, H], 'paw': [935, 900], 'music': [1150, 420], 'hearts': [110, 1040]}

    # The AI Chat avatar: head, headphones and sound lines, cropped square and
    # mirrored so Novi faces the conversation. The paw holds still at this size;
    # the sound lines stay a layer so they can pulse while Novi is typing.
    LS_BOX, LS_SIZE = (380, 100, 1260, 980), 320


    def save_avatar(arr, name):
        im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')
        im = im.crop(LS_BOX).transpose(Image.FLIP_LEFT_RIGHT).resize((LS_SIZE, LS_SIZE), Image.LANCZOS)
        im.save(f'{OUT}/{name}.webp', 'WEBP', quality=90, method=6)


    save_avatar(erase(img, music), 'laptop-sm-body')
    save_avatar(take(img, music), 'laptop-sm-music')
    pivots['laptop-sm'] = {
        'size': [LS_SIZE, LS_SIZE],
        'music_pct': [(LS_BOX[2] - 1150) / (LS_BOX[2] - LS_BOX[0]) * 100,
                      (420 - LS_BOX[1]) / (LS_BOX[3] - LS_BOX[1]) * 100],
    }


# ── Sleeping: the drawn Zs drift up one after another ────────────
def build_sleeping():
    """Sleeping pose."""
    img = load('sleeping.webp')
    H, W = img.shape[:2]
    r, g, b, a = (img[..., i] for i in range(4))
    # Everything drawn in the Zs' corner of the canvas (shaped to stay clear of the
    # head, since the Zs' highlights share its colours); then split
    # by dividing lines rather than boxes so no edge pixels fall between them.
    zone = poly_mask(img.shape, [(1140, 125), (1480, 125), (1480, 440), (1190, 440),
                                 (1172, 410), (1150, 390), (1140, 390)])
    # An outfit's painting comes without Zs (anything in their corner is
    # cleared); it reuses the default's three drawn Zs, which don't change.
    zsource = img
    if outfit:
        zsource = np.array(Image.open(f'{ASSETS}/sleeping.webp').convert('RGBA')).astype(np.float64)
        img = erase(img, zone & (a > 0))
        a = zsource[..., 3]
    zs = zone & (a > 0)
    ys, xs = np.mgrid[0:H, 0:W]
    z3 = zs & (xs >= 1305)
    z2 = zs & (xs < 1305) & (ys < 345)
    z1 = zs & (xs < 1305) & (ys >= 345)
    save(erase(img, z1 | z2 | z3), 'sleeping-body')
    for i, z in enumerate((z1, z2, z3), 1):
        save(take(zsource, z), f'sleeping-z{i}')
    pivots['sleeping'] = {'size': [W, H]}


# ── Writing notes (Home's buddy card): a still picture, no moving parts ──
# Where the writing paw and pen sit in each painting: the pen from cap to tip,
# and an oval around the paw. Outfits were drawn separately, so each has its
# own; the paintings share one canvas (1000x1250, feet on the bottom margin).
WRITING_HANDS = {
    None:           {'cap': (392, 528), 'tip': (556, 724), 'paw': (360, 600, 537, 762)},
    'smart_casual': {'cap': (398, 550), 'tip': (557, 738), 'paw': (376, 616, 547, 784)},
    'formal':       {'cap': (397, 560), 'tip': (562, 738), 'paw': (386, 640, 547, 795)},
    'uniform':      {'cap': (400, 562), 'tip': (562, 742), 'paw': (376, 630, 542, 800)},
}


def pen_paw_mask(img, hand, pen_width=38):
    """The paw and the whole pen, and nothing around them: fur inside the
    paw's oval (its largest piece, so a bit of forearm or head fur beside it
    stays put), pen colours along the pen, and the cap's red found near the
    cap point (it sits at a slightly different spot in each painting). Grown
    a few pixels so the paw's soft dark outline moves with it."""
    from scipy import ndimage
    H, W = img.shape[:2]
    red, g, b, a = (img[..., i] for i in range(4))
    r = pen_width // 2

    oval = Image.new('L', (W, H), 0)
    ImageDraw.Draw(oval).ellipse(hand['paw'], fill=255)
    fur = (a > 120) & (g >= b) & (g < 0.7 * red) & (g > 0.5 * red) & (np.array(oval) > 127)
    lab, n = ndimage.label(fur)
    if n:
        sizes = ndimage.sum(fur, lab, range(1, n + 1))
        fur = lab == (int(np.argmax(sizes)) + 1)

    line = Image.new('L', (W, H), 0)
    dl = ImageDraw.Draw(line)
    dl.line([hand['cap'], hand['tip']], fill=255, width=pen_width)
    for x, y in (hand['cap'], hand['tip']):
        dl.ellipse((x - r, y - r, x + r, y + r), fill=255)
    pen = (np.array(line) > 127) & (a > 120) & (
        ((red > 175) & (g > 175) & (b > 175))                      # white barrel
        | ((abs(red - g) < 25) & (abs(g - b) < 25) & (red < 140))  # grey grip
        | ((red > 180) & (g < 120) & (b < 120)))                   # red cap and tip

    cx, cy = hand['cap']
    near_cap = np.zeros((H, W), bool)
    near_cap[max(0, cy - 75):cy + 60, max(0, cx - 60):cx + 60] = True
    # The cap's red, not the head's orange fur beside it.
    cap_red = near_cap & (a > 40) & (red > 200) & (g < 110) & (b < 110) & (red - g > 110)

    # A light closing knits the pieces together. No hole filling: on a bare
    # arm it would grab the shirt caught between the paw and the forearm.
    mask = ndimage.binary_closing(fur | pen | dilate(cap_red, 1), iterations=2)
    return dilate(mask, 3)


def build_writing():
    """Writing-notes pose: the paw and pen move as one layer, scribbling."""
    img = load('writing_mascot.png')
    hand = pen_paw_mask(img, WRITING_HANDS[outfit])
    save(inpaint(erase(img, hand), hand), 'writing-body')
    save(take(img, hand), 'writing-hand')
    paw = WRITING_HANDS[outfit]['paw']
    pivots['writing'] = {'size': [1000, 1250], 'hand_wrist': [paw[0] + 30, paw[3] - 20]}


# Each pose is built from one painting. An outfit can arrive a pose at a
# time: poses whose painting isn't there yet are skipped (the app shows the
# default look for them until they are).
SECTIONS = [
    ('capybara_landingpage.webp', build_waving),
    ('facingfront_mascot.webp', build_front),
    ('laptop_mascot.webp', build_laptop),
    ('sleeping.webp', build_sleeping),
    ('writing_mascot.png', build_writing),
]
for source, build in SECTIONS:
    if only_pose and build.__name__ != f'build_{only_pose}':
        continue
    stem = source.rsplit('.', 1)[0]
    if outfit and not any(os.path.exists(f'{SRC}/{stem}.{ext}') for ext in ('webp', 'png')):
        print(f'skipped {stem}: not in {SRC} yet', file=sys.stderr)
        continue
    build()

# Pivots in canvas pixels; mascot-rig.css uses them as percentages of `size`.
print(json.dumps(pivots, indent=1))
