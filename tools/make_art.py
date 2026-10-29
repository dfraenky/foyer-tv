"""Draws Foyer's icon (Android, LG, Samsung, the site) and the TV banner (Pillow). Usage: python3 tools/make_art.py"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, "app/assets/fonts/InterVariable.ttf")
STOPS = [(0.0, (22, 26, 58)), (0.55, (44, 36, 92)), (1.0, (86, 52, 128))]   # night blue -> indigo -> plum
WARM = ((255, 222, 160), (255, 150, 104))   # the lit doorway: top, bottom


def gradient(w, h, angle=35):
    """Diagonal three-color gradient."""
    img = Image.new("RGB", (w, h))
    px = img.load()
    a = math.radians(angle)
    dx, dy = math.cos(a), math.sin(a)
    lo = min(0, w * dx, h * dy, w * dx + h * dy)
    hi = max(0, w * dx, h * dy, w * dx + h * dy)
    for y in range(h):
        for x in range(w):
            t = ((x * dx + y * dy) - lo) / (hi - lo)
            for i in range(len(STOPS) - 1):
                t0, c0 = STOPS[i]
                t1, c1 = STOPS[i + 1]
                if t <= t1:
                    f = (t - t0) / (t1 - t0)
                    px[x, y] = tuple(round(c0[k] + (c1[k] - c0[k]) * f) for k in range(3))
                    break
    return img


def warm(w, h):
    """The doorway's light: warm, from pale gold at the top to amber at the bottom."""
    img = Image.new("RGBA", (w, h))
    px = img.load()
    for y in range(h):
        f = y / max(1, h - 1)
        c = tuple(round(WARM[0][k] + (WARM[1][k] - WARM[0][k]) * f) for k in range(3))
        for x in range(w):
            px[x, y] = c + (255,)
    return img


def mark(size, bg=True):
    """The mark: a lit, arched doorway (a foyer's entrance) and its light on the floor, on the night squircle (bg)."""
    s = size * 4
    img = gradient(s, s).convert("RGBA") if bg else Image.new("RGBA", (s, s), (0, 0, 0, 0))
    if bg:
        mask = Image.new("L", (s, s), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 0.23), fill=255)
        img.putalpha(mask)
    x0, x1, top, bottom = s * 0.33, s * 0.67, s * 0.17, s * 0.69
    r = (x1 - x0) / 2
    door = Image.new("L", (s, s), 0)
    dd = ImageDraw.Draw(door)
    dd.ellipse((x0, top, x1, top + 2 * r), fill=255)
    dd.rectangle((x0, top + r, x1, bottom), fill=255)
    # The light on the floor: a trapezoid widening towards the viewer, fading out.
    floor = Image.new("L", (s, s), 0)
    fd = ImageDraw.Draw(floor)
    depth = s * 0.16
    for i in range(int(depth)):
        f = i / depth
        half = r + (s * 0.2) * f
        fd.line((s / 2 - half, bottom + i, s / 2 + half, bottom + i), fill=int(150 * (1 - f) ** 1.6))
    light = warm(s, s)
    glow = door.filter(ImageFilter.GaussianBlur(s * 0.05)).point(lambda v: int(v * 0.55))
    if bg:
        halo = Image.new("RGBA", (s, s), WARM[1] + (0,))
        halo.putalpha(glow)
        img.alpha_composite(halo)
    floor_layer = light.copy()
    floor_layer.putalpha(floor)
    img.alpha_composite(floor_layer)
    door_layer = light.copy()
    door_layer.putalpha(door)
    img.alpha_composite(door_layer)
    return img.resize((size, size), Image.LANCZOS)


def font(px, weight=600):
    f = ImageFont.truetype(FONT, px)
    try:
        axes = f.get_variation_axes()
        values = []
        for a in axes:
            name = a["name"] if isinstance(a["name"], str) else a["name"].decode()
            values.append(weight if "eight" in name else 32 if "ptical" in name else a.get("default", 0))
        f.set_variation_by_axes(values)
    except Exception:
        pass
    return f


def banner(w=640, h=360):
    s = 4
    img = gradient(w * s, h * s, angle=20).convert("RGBA")
    m = mark(int(h * 0.5 * s), bg=False)
    d = ImageDraw.Draw(img)
    f = font(int(h * 0.15 * s), 650)
    text = "Foyer"
    box = d.textbbox((0, 0), text, font=f)
    gap = -int(m.width * 0.2)   # the doorway sits in the middle of its square: closer to the name
    total = m.width + gap + (box[2] - box[0])
    x = (w * s - total) // 2
    img.alpha_composite(m, (x, int((h * s - m.height) / 2)))
    y = (h * s - (box[3] - box[1])) // 2 - box[1]
    d.text((x + m.width + gap - box[0], y), text, font=f, fill=(255, 255, 255, 255))
    return img.resize((w, h), Image.LANCZOS)


if __name__ == "__main__":
    res = os.path.join(ROOT, "app/res/drawable-nodpi")
    os.makedirs(res, exist_ok=True)
    mark(192).save(os.path.join(res, "icon.png"))
    banner().save(os.path.join(res, "banner.png"))
    site = os.path.join(ROOT, "docs/assets")
    os.makedirs(site, exist_ok=True)
    mark(512).save(os.path.join(site, "icon-512.png"))
    mark(180).save(os.path.join(site, "apple-touch-icon.png"))
    mark(64).save(os.path.join(site, "favicon-64.png"))
    mark(80).save(os.path.join(ROOT, "webos/icon.png"))
    mark(130).save(os.path.join(ROOT, "webos/largeIcon.png"))
    mark(512).save(os.path.join(ROOT, "tizen/icon.png"))
    print("ok")
