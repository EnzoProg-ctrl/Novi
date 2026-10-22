"""
Cuts each mascot illustration into animatable layers for MascotRig.

    python scripts/build_mascot_rigs.py      (needs numpy and Pillow)

Re-run after replacing any of the source illustrations; if a pose changes,
the polygons and pivots below (and the matching percentages in
src/components/mascot-rig.css) need re-measuring against the new artwork.

Every layer keeps the full canvas size of its source, so layers stack exactly
by sharing one box, and a pivot can be written as a percentage of that box.
At rest, the layers composite back to the original artwork pixel for pixel.
"""
import json
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src', 'assets')
OUT = os.path.join(SRC, 'rig')
os.makedirs(OUT, exist_ok=True)


def load(name):
    return np.array(Image.open(f'{SRC}/{name}').convert('RGBA')).astype(np.float64)


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
    Fills `hole` with colour grown inward from its opaque surroundings, so a
    part that moves never reveals a gap behind it. Onion-peel fill, then a few
    smoothing passes confined to the hole.
    """
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
img = load('capybara_landingpage.webp')
H, W = img.shape[:2]
# The hand waves at the wrist. Swinging the whole arm from the shoulder opened a
# gap beside the head; a wave is mostly the hand anyway.
cuff = [(1022, 604), (1160, 700)]                    # where the paw meets the sleeve
hand = poly_mask(img.shape, [
    cuff[0], (1031, 585), (1040, 556), (1053, 539), (1073, 514), (1097, 488),  # head side
    (1125, 478), (1170, 480), (1212, 505), (1236, 560), (1238, 640), (1205, 700),  # over background
    cuff[1],
])
# A band of paw just above the cuff stays on the body, so the wrist never opens
# up while the hand turns over it.
band = hand & poly_mask(img.shape, [cuff[0], (1038, 581), (1176, 677), cuff[1]])
alpha = img[..., 3] > 0
lines = rect_mask(img.shape, (1065, 255, 1250, 472)) & alpha
body = erase(erase(img, hand & ~band), lines)
save(body, 'waving-body')
save(take(img, hand), 'waving-hand')
save(take(img, lines), 'waving-lines')
pivots['waving'] = {'size': [W, H], 'hand': [1090, 652], 'lines': [1150, 380]}

AV_SCALE, AV_OFFSET = 0.25696, (0, 9)
for part, arr in [('body', body), ('hand', take(img, hand)), ('lines', take(img, lines))]:
    save_small(arr, f'waving-sm-{part}', AV_SCALE, AV_OFFSET, 320)
pivots['waving-sm'] = {
    'size': [320, 320],
    'hand': [1090 * AV_SCALE + AV_OFFSET[0], 652 * AV_SCALE + AV_OFFSET[1]],
    'lines': [1150 * AV_SCALE + AV_OFFSET[0], 380 * AV_SCALE + AV_OFFSET[1]],
}

# ── Facing front (buddy card): paws held up, pumped in turn ──────
img = load('facingfront_mascot.webp')
H, W = img.shape[:2]
paw_l = ellipse_mask(img.shape, (250, 650, 480, 885))
paw_r = ellipse_mask(img.shape, (755, 650, 1005, 885))
body = inpaint(erase(img, paw_l | paw_r), paw_l | paw_r)
save(body, 'front-body')
save(take(img, paw_l), 'front-paw-l')
save(take(img, paw_r), 'front-paw-r')
pivots['front'] = {'size': [W, H], 'paw_l': [395, 880], 'paw_r': [860, 880]}

# ── Laptop: typing paw, music lines, drifting hearts ─────────────
img = load('laptop_mascot.webp')
H, W = img.shape[:2]
paw = poly_mask(img.shape, [
    (842, 888), (900, 878), (952, 886), (968, 930), (965, 1000), (952, 1032),
    (905, 1052), (800, 1054), (770, 1036), (757, 990), (765, 948), (800, 912),
])
music = poly_mask(img.shape, [(1140, 270), (1310, 270), (1310, 505), (1185, 505), (1165, 400), (1140, 400)]) & dilate(coral(img), 1)
hearts = rect_mask(img.shape, (12, 990, 212, 1082)) & dilate(coral(img), 1)
body = inpaint(erase(img, paw), paw)
save(erase(erase(body, music), hearts), 'laptop-body')
save(take(img, paw), 'laptop-paw')
save(take(img, music), 'laptop-music')
save(take(img, hearts), 'laptop-hearts')
pivots['laptop'] = {'size': [W, H], 'paw': [935, 900], 'music': [1150, 420], 'hearts': [110, 1040]}

# ── Sleeping: the drawn Zs drift up one after another ────────────
img = load('sleeping.webp')
H, W = img.shape[:2]
r, g, b, a = (img[..., i] for i in range(4))
# Everything drawn in the Zs' corner of the canvas (shaped to stay clear of the
# head, since the Zs' highlights share its colours); then split
# by dividing lines rather than boxes so no edge pixels fall between them.
zone = poly_mask(img.shape, [(1140, 125), (1480, 125), (1480, 440), (1190, 440),
                             (1172, 410), (1150, 390), (1140, 390)])
zs = zone & (a > 0)
ys, xs = np.mgrid[0:H, 0:W]
z3 = zs & (xs >= 1305)
z2 = zs & (xs < 1305) & (ys < 345)
z1 = zs & (xs < 1305) & (ys >= 345)
save(erase(img, z1 | z2 | z3), 'sleeping-body')
for i, z in enumerate((z1, z2, z3), 1):
    save(take(img, z), f'sleeping-z{i}')
pivots['sleeping'] = {'size': [W, H]}

# Pivots in canvas pixels; mascot-rig.css uses them as percentages of `size`.
print(json.dumps(pivots, indent=1))
