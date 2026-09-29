"""Heads-up display for the camera window: glass panels, anti-aliased Segoe UI
text (rendered once by Pillow and cached), hand skeletons and progress rings."""
import math
import os
import time
from functools import lru_cache

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

import gestures as g


def hex_bgr(h):
    h = h.lstrip("#")
    return (int(h[4:6], 16), int(h[2:4], 16), int(h[0:2], 16))


WHITE = hex_bgr("#F5F7FA")
MUTED = hex_bgr("#A3ACB8")
DARK = hex_bgr("#0E1116")
PANEL = hex_bgr("#151A21")
ACCENT = {
    "APPS": hex_bgr("#4DA3FF"),
    "MEDIA": hex_bgr("#FF7A59"),
    "SLIDES": hex_bgr("#3DDC97"),
    "DRAW": hex_bgr("#C77DFF"),
    "MOUSE": hex_bgr("#FF5FA2"),
    "LOCKED": hex_bgr("#8A94A6"),
}
# Drawing palette: (name, BGR colour); None = eraser
PALETTE = (("Purple", hex_bgr("#C77DFF")), ("Cyan", hex_bgr("#4DE3FF")),
           ("Green", hex_bgr("#3DDC97")), ("Yellow", hex_bgr("#FFD166")),
           ("Red", hex_bgr("#FF5F6D")), ("White", hex_bgr("#F5F7FA")), ("Eraser", None))
SWATCH_GAP, SWATCH_R, PALETTE_Y = 54, 17, 106
LEFT_COLOR = hex_bgr("#FFB84D")
RIGHT_COLOR = hex_bgr("#4DE3FF")
MODE_ORDER = (("APPS", "1"), ("MEDIA", "2"), ("SLIDES", "3"), ("DRAW", "4"), ("MOUSE", "5"),
              ("LOCKED", "0"))
HINTS = {
    "MEDIA": (("Swipe →", "Next track"), ("Swipe ←", "Previous track"),
              ("Still open palm", "Play / pause"), ("Thumb up / down", "Volume")),
    "SLIDES": (("Swipe →", "Next slide"), ("Swipe ←", "Previous slide")),
    "DRAW": (("Index finger", "Draw"), ("Touch a colour", "Pick colour"),
             ("Pinch", "Lift pen"), ("Hold open palm", "Clear"), ("P key", "Save PNG")),
    "MOUSE": (("Point", "Move cursor"), ("Pinch + release", "Click"),
              ("Pinch + move", "Drag"), ("Pinch + hold still", "Right click"),
              ("Two fingers up / down", "Scroll")),
    "LOCKED": (("1 finger", "Apps"), ("2 fingers", "Media"), ("3 fingers", "Slides"),
               ("4 fingers", "Draw"), ("5 fingers", "Mouse"), ("Hold fist 1 s", "Lock")),
}
KEYS = (("A M S D O", "mode"), ("L", "lock"), ("C", "settings"), ("H", "panel"), ("Q", "quit"))
HAND_CONNECTIONS = ((0, 1), (1, 2), (2, 3), (3, 4), (0, 5), (5, 6), (6, 7), (7, 8),
                    (5, 9), (9, 10), (10, 11), (11, 12), (9, 13), (13, 14), (14, 15),
                    (15, 16), (13, 17), (0, 17), (17, 18), (18, 19), (19, 20))
TIPS = (4, 8, 12, 16, 20)
AA = cv2.LINE_AA

_FONT_FILES = {"regular": ("segoeui.ttf",), "semibold": ("seguisb.ttf", "segoeuib.ttf"),
               "bold": ("segoeuib.ttf",)}


# ---- primitives ---------------------------------------------------------
@lru_cache(maxsize=None)
def font(size, weight="regular"):
    fonts_dir = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
    for name in _FONT_FILES[weight]:
        path = os.path.join(fonts_dir, name)
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


@lru_cache(maxsize=2048)
def _text_mask(text, size, weight):
    f = font(size, weight)
    asc, desc = f.getmetrics()
    w = max(int(math.ceil(f.getlength(text))) + 2, 1)
    img = Image.new("L", (w, asc + desc + 2), 0)
    ImageDraw.Draw(img).text((1, 1), text, font=f, fill=255)
    return np.asarray(img, np.float32) / 255.0


@lru_cache(maxsize=512)
def _rounded_mask(w, h, r, thickness=-1):
    m = np.zeros((h, w), np.uint8)
    r = max(0, min(r, h // 2, w // 2))
    if r == 0:
        if thickness < 0:
            m[:] = 255
        else:
            cv2.rectangle(m, (0, 0), (w - 1, h - 1), 255, thickness)
    elif thickness < 0:
        cv2.rectangle(m, (r, 0), (w - 1 - r, h - 1), 255, -1)
        cv2.rectangle(m, (0, r), (w - 1, h - 1 - r), 255, -1)
        for c in ((r, r), (w - 1 - r, r), (r, h - 1 - r), (w - 1 - r, h - 1 - r)):
            cv2.circle(m, c, r, 255, -1, AA)
    else:
        t, a, b = thickness, w - 1 - r, h - 1 - r
        cv2.line(m, (r, 0), (a, 0), 255, t, AA)
        cv2.line(m, (r, h - 1), (a, h - 1), 255, t, AA)
        cv2.line(m, (0, r), (0, b), 255, t, AA)
        cv2.line(m, (w - 1, r), (w - 1, b), 255, t, AA)
        cv2.ellipse(m, (r, r), (r, r), 180, 0, 90, 255, t, AA)
        cv2.ellipse(m, (a, r), (r, r), 270, 0, 90, 255, t, AA)
        cv2.ellipse(m, (a, b), (r, r), 0, 0, 90, 255, t, AA)
        cv2.ellipse(m, (r, b), (r, r), 90, 0, 90, 255, t, AA)
    return m.astype(np.float32) / 255.0


def _blend(frame, x, y, mask, color, alpha=1.0):
    h, w = mask.shape
    H, W = frame.shape[:2]
    x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + w, W), min(y + h, H)
    if x0 >= x1 or y0 >= y1:
        return
    w2 = mask[y0 - y:y1 - y, x0 - x:x1 - x]
    if alpha != 1.0:
        w2 = w2 * np.float32(alpha)
    roi = frame[y0:y1, x0:x1]
    solid = np.empty_like(roi)
    solid[:] = color
    cv2.blendLinear(roi, solid, 1.0 - w2, w2, dst=roi)


def text_width(s, size=16, weight="regular"):
    return _text_mask(s, size, weight).shape[1]


def text(frame, s, x, cy, size=16, color=WHITE, weight="regular", anchor="l", alpha=1.0):
    """Draw text vertically centred on cy; anchor l/c/r is horizontal."""
    if not s:
        return 0
    m = _text_mask(s, size, weight)
    w = m.shape[1]
    x = int(x - w / 2) if anchor == "c" else int(x - w) if anchor == "r" else int(x)
    _blend(frame, x, int(cy - m.shape[0] / 2), m, color, alpha)
    return w


def panel(frame, x, y, w, h, color=PANEL, alpha=0.72, r=14, border=None, border_alpha=0.22):
    x, y, w, h = int(x), int(y), int(w), int(h)
    if w <= 0 or h <= 0:
        return
    _blend(frame, x, y, _rounded_mask(w, h, r), color, alpha)
    if border is not None:
        _blend(frame, x, y, _rounded_mask(w, h, r, 1), border, border_alpha)


def ring(frame, center, radius, progress, color, thickness=5):
    cv2.circle(frame, center, radius, DARK, thickness + 4, AA)
    cv2.circle(frame, center, radius, (70, 70, 70), thickness, AA)
    if progress > 0:
        cv2.ellipse(frame, center, (radius, radius), -90, 0, 360 * progress, color, thickness, AA)


# ---- composite pieces ---------------------------------------------------
def draw_hand(frame, lm, color, label, count):
    H, W = frame.shape[:2]
    pts = [(int(x * W), int(y * H)) for x, y in lm]
    for a, b in HAND_CONNECTIONS:
        cv2.line(frame, pts[a], pts[b], DARK, 5, AA)
        cv2.line(frame, pts[a], pts[b], color, 2, AA)
    for i, p in enumerate(pts):
        if i in TIPS:
            cv2.circle(frame, p, 7, DARK, -1, AA)
            cv2.circle(frame, p, 5, color, -1, AA)
        else:
            cv2.circle(frame, p, 3, WHITE, -1, AA)
    # name tag under the wrist
    tag = f"{label}  {count}"
    tw = text_width(tag, 14, "semibold") + 34
    wx, wy = pts[0]
    ty = wy + 22 if wy + 50 < H else wy - 50
    panel(frame, wx - tw // 2, ty, tw, 28, DARK, 0.75, r=14)
    cv2.circle(frame, (wx - tw // 2 + 15, ty + 14), 5, color, -1, AA)
    text(frame, tag, wx - tw // 2 + 26, ty + 14, 14, WHITE, "semibold")


def palette_centers(W):
    x0 = W // 2 - (len(PALETTE) - 1) * SWATCH_GAP // 2
    return [(x0 + i * SWATCH_GAP, PALETTE_Y) for i in range(len(PALETTE))]


def palette_hit(x, y, W):
    """Index of the swatch under (x, y) in frame pixels, or None."""
    for i, (cx, cy) in enumerate(palette_centers(W)):
        if (x - cx) ** 2 + (y - cy) ** 2 <= (SWATCH_R + 10) ** 2:
            return i
    return None


def _palette(frame, app):
    cs = palette_centers(frame.shape[1])
    x0, w = cs[0][0] - 36, cs[-1][0] - cs[0][0] + 72
    panel(frame, x0, PALETTE_Y - 30, w, 60, DARK, 0.72, r=30, border=WHITE, border_alpha=0.14)
    hover, prog = app.color_hover.value, app.color_hover.progress()
    for i, ((name, color), c) in enumerate(zip(PALETTE, cs)):
        if color is None:   # eraser: dark disc with a slash
            cv2.circle(frame, c, SWATCH_R, (58, 58, 58), -1, AA)
            cv2.circle(frame, c, SWATCH_R, WHITE, 2, AA)
            d = int(SWATCH_R * 0.55)
            cv2.line(frame, (c[0] - d, c[1] + d), (c[0] + d, c[1] - d), WHITE, 2, AA)
        else:
            cv2.circle(frame, c, SWATCH_R, color, -1, AA)
        if i == app.color_idx:
            cv2.circle(frame, c, SWATCH_R + 6, WHITE, 2, AA)
        if hover == i and prog > 0:
            cv2.ellipse(frame, c, (SWATCH_R + 6, SWATCH_R + 6), -90, 0, 360 * prog,
                        color or WHITE, 3, AA)


def _mouse_overlay(frame, app, right):
    H, W = frame.shape[:2]
    accent = ACCENT["MOUSE"]
    x0, y0, x1, y1 = app.mouse.zone
    rx, ry, rw, rh = int(x0 * W), int(y0 * H), int((x1 - x0) * W), int((y1 - y0) * H)
    panel(frame, rx, ry, rw, rh, accent, 0.07, r=18, border=accent, border_alpha=0.75)
    label = "Mouse area  =  whole screen"
    panel(frame, rx + 10, ry + 8, text_width(label, 12, "semibold") + 20, 24, DARK, 0.8, r=12)
    text(frame, label, rx + 20, ry + 20, 12, accent, "semibold")
    if right:
        tx, ty = int(right[g.INDEX_TIP][0] * W), int(right[g.INDEX_TIP][1] * H)
        pressed = app.mouse.pinch
        cv2.circle(frame, (tx, ty), 16, accent, 2, AA)
        cv2.circle(frame, (tx, ty), 5 if not pressed else 9, WHITE if not pressed else accent, -1, AA)
        label = app.mouse.label()
        if label:
            lw = text_width(label, 14, "semibold") + 24
            panel(frame, tx + 22, ty - 14, lw, 28, DARK, 0.85, r=14, border=accent, border_alpha=0.8)
            text(frame, label, tx + 22 + lw // 2, ty, 14, WHITE, "semibold", anchor="c")


def _draw_ink(frame, canvas):
    H, W = frame.shape[:2]
    # soft neon glow: blur a quarter-size copy (cheap) and add it back
    small = cv2.resize(canvas, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    glow = cv2.resize(cv2.GaussianBlur(small, (0, 0), 2.5), (W, H))
    cv2.addWeighted(frame, 1.0, glow, 1.2, 0, dst=frame)
    # paint the stroke on top, using its brightness as alpha (keeps AA edges clean)
    a = cv2.cvtColor(cv2.max(cv2.max(canvas[..., 0], canvas[..., 1]), canvas[..., 2]),
                     cv2.COLOR_GRAY2BGR)
    cv2.multiply(frame, cv2.bitwise_not(a), dst=frame, scale=1 / 255)
    cv2.add(frame, canvas, dst=frame)


def _top_bar(frame, mode, fps):
    H, W = frame.shape[:2]
    panel(frame, 0, 0, W, 64, DARK, 0.66, r=0)
    cv2.circle(frame, (30, 32), 7, ACCENT[mode], -1, AA)
    text(frame, "Gesture Control", 46, 32, 20, WHITE, "semibold")
    # mode pills, centred
    pills = []
    for name, hint in MODE_ORDER:
        wn, wh = text_width(name, 14, "semibold"), text_width(hint, 13, "regular")
        pills.append((name, hint, wn, wh, wn + wh + 44))
    total = sum(p[4] for p in pills) + 8 * (len(pills) - 1)
    x = (W - total) // 2
    for name, hint, wn, wh, pw in pills:
        active = name == mode
        if active:
            panel(frame, x, 15, pw, 34, ACCENT[name], 0.95, r=17)
        else:
            panel(frame, x, 15, pw, 34, PANEL, 0.5, r=17, border=WHITE, border_alpha=0.16)
        fg = DARK if active else MUTED
        text(frame, hint, x + 16, 32, 13, fg, "regular", alpha=0.75)
        text(frame, name, x + 28 + wh, 32, 14, DARK if active else WHITE, "semibold")
        x += pw + 8
    text(frame, f"{fps:4.0f} FPS", W - 24, 32, 14, MUTED, "semibold", anchor="r")


def _side_card(frame, app):
    H, W = frame.shape[:2]
    mode, accent = app.mode, ACCENT[app.mode]
    cw, x, y = 330, W - 330 - 20, 84
    if mode == "APPS":
        rows = len(app.cfg["apps"])
    else:
        rows = len(HINTS[mode])
    ch = 92 + rows * 44 + (40 if mode != "LOCKED" else 0)
    panel(frame, x, y, cw, ch, PANEL, 0.78, r=16, border=WHITE, border_alpha=0.12)
    if mode != "LOCKED":
        count = next(h for m, h in MODE_ORDER if m == mode)
        fy = y + ch - 26
        cv2.line(frame, (x + 20, fy - 20), (x + cw - 20, fy - 20), (60, 60, 60), 1, AA)
        text(frame, f"Left hand {count} again  →  Lock", x + 22, fy, 13, MUTED, "semibold")
    panel(frame, x, y + 14, 4, 50, accent, 1.0, r=2)
    who = "LEFT HAND  ·  PICK A MODE" if mode == "LOCKED" else "RIGHT HAND"
    text(frame, who, x + 22, y + 26, 12, MUTED, "semibold")
    text(frame, mode.capitalize(), x + 22, y + 52, 24, accent, "semibold")
    cv2.line(frame, (x + 20, y + 80), (x + cw - 20, y + 80), (60, 60, 60), 1, AA)
    ry = y + 104
    if mode == "APPS":
        held = app.app_hold.value
        prog = app.app_hold.progress()
        for i, a in enumerate(app.cfg["apps"]):
            n = i + 1
            on = held == n and prog > 0
            if on:
                panel(frame, x + 12, ry - 19, cw - 24, 38, accent, 0.18, r=10)
                panel(frame, x + 12, ry + 15, int((cw - 24) * prog), 4, accent, 1.0, r=2)
            cv2.circle(frame, (x + 36, ry), 13, accent if on else (70, 70, 70), -1, AA)
            text(frame, str(n), x + 36, ry, 14, DARK if on else WHITE, "semibold", anchor="c")
            name = a["name"] or ("Empty slot" if not a["target"] else a["target"])
            text(frame, name[:28], x + 62, ry, 16, WHITE if a["target"] else MUTED,
                 "semibold" if a["target"] else "regular")
            ry += 44
    else:
        for gesture, desc in HINTS[mode]:
            text(frame, gesture, x + 22, ry, 15, WHITE, "semibold")
            text(frame, desc, x + cw - 22, ry, 15, MUTED, anchor="r")
            ry += 44


def _bottom(frame, app, left, right, now):
    H, W = frame.shape[:2]
    # hand status chips
    x = 20
    for label, lm, color in (("Left", left, LEFT_COLOR), ("Right", right, RIGHT_COLOR)):
        val = str(g.count_fingers(lm)) if lm else "—"
        s = f"{label}"
        w = text_width(s, 14, "semibold") + text_width(val, 18, "bold") + 52
        panel(frame, x, H - 58, w, 38, DARK, 0.72 if lm else 0.45, r=19)
        cv2.circle(frame, (x + 19, H - 39), 6, color if lm else (80, 80, 80), -1, AA)
        tx = x + 32 + text(frame, s, x + 32, H - 39, 14, WHITE if lm else MUTED, "semibold")
        text(frame, val, tx + 10, H - 40, 18, color if lm else MUTED, "bold")
        x += w + 10
    # key hints, right aligned
    items = [(k, lbl, text_width(k, 12, "semibold") + 16, text_width(lbl, 13)) for k, lbl in KEYS]
    total = sum(kw + lw + 22 for _, _, kw, lw in items)
    x = W - 20 - total
    for k, lbl, kw, lw in items:
        panel(frame, x, H - 52, kw, 24, PANEL, 0.8, r=6, border=WHITE, border_alpha=0.3)
        text(frame, k, x + kw // 2, H - 40, 12, WHITE, "semibold", anchor="c")
        text(frame, lbl, x + kw + 6, H - 40, 13, MUTED)
        x += kw + lw + 22
    # toast
    if now < app.toast_until:
        fade = min(1.0, (app.toast_until - now) / 0.35)
        tw = text_width(app.toast, 18, "semibold") + 56
        tx, ty = (W - tw) // 2, H - 124
        panel(frame, tx, ty, tw, 46, DARK, 0.85 * fade, r=23,
              border=ACCENT[app.mode], border_alpha=0.9 * fade)
        text(frame, app.toast, W // 2, ty + 23, 18, WHITE, "semibold", anchor="c", alpha=fade)


def draw_hud(frame, app, left, right, fps, show_panel=True):
    H, W = frame.shape[:2]
    now = time.monotonic()
    accent = ACCENT[app.mode]

    if app.mode == "LOCKED":
        cv2.convertScaleAbs(frame, dst=frame, alpha=0.4)
    elif app.mode == "DRAW" and app.canvas is not None and app.has_ink:
        _draw_ink(frame, app.canvas)

    if left:
        draw_hand(frame, left, LEFT_COLOR, "Left", g.count_fingers(left))
        target, prog = app.mode_progress(now)
        if target and prog > 0:
            px, py = g.palm_center(left)
            c = (int(px * W), int(py * H))
            ring(frame, c, 46, prog, ACCENT[target], 6)
            label = target.capitalize()
            lw = text_width(label, 15, "semibold") + 24
            panel(frame, c[0] - lw // 2, c[1] - 14, lw, 28, DARK, 0.85, r=14)
            text(frame, label, c[0], c[1], 15, ACCENT[target], "semibold", anchor="c")
    if right:
        draw_hand(frame, right, RIGHT_COLOR, "Right", g.count_fingers(right))
        # progress ring around the palm for hold gestures
        prog, label = 0.0, None
        if app.mode == "APPS" and app.app_hold.value:
            prog, label = app.app_hold.progress(), str(app.app_hold.value)
        elif app.mode == "MEDIA":
            prog = app.pp_hold.progress()
        elif app.mode == "DRAW":
            prog = app.clear_hold.progress()
        if prog > 0:
            px, py = g.palm_center(right)
            c = (int(px * W), int(py * H))
            ring(frame, c, 46, prog, accent, 6)
            if label:
                cv2.circle(frame, c, 24, DARK, -1, AA)
                text(frame, label, c[0], c[1] - 2, 26, WHITE, "bold", anchor="c")

    if app.mode == "MOUSE":
        _mouse_overlay(frame, app, right)

    if app.mode == "DRAW":
        _palette(frame, app)
    if app.mode == "DRAW" and app.cursor:
        cx, cy, down = app.cursor
        erasing = app.erasing()
        color = WHITE if erasing else app.ink_color()
        tail = app.pen.tail()
        if down and not erasing and len(tail) >= 2:   # live preview of the newest bit
            arr = (np.array(tail) * 16).astype(np.int32)
            cv2.polylines(frame, [arr], False, color, app.brush(), AA, 4)
        if erasing:
            cv2.circle(frame, (cx, cy), app.brush() // 2, WHITE if down else MUTED, 2, AA)
        elif down:
            cv2.circle(frame, (cx, cy), 8, color, -1, AA)
            cv2.circle(frame, (cx, cy), 14, WHITE, 2, AA)
        else:
            cv2.circle(frame, (cx, cy), 14, MUTED, 2, AA)
            cv2.circle(frame, (cx, cy), 5, color, -1, AA)

    if app.mode == "LOCKED":
        sub = "Show 1–5 fingers on your left hand to unlock, or press A M S D O"
        bw, cy = text_width(sub, 18) + 64, int(H * 0.27)
        panel(frame, (W - bw) // 2, cy - 65, bw, 130, DARK, 0.8, r=20,
              border=WHITE, border_alpha=0.12)
        text(frame, "Locked", W // 2, cy - 22, 40, WHITE, "bold", anchor="c")
        text(frame, sub, W // 2, cy + 28, 18, MUTED, anchor="c")
    elif not left and not right and now - app.last_seen > 1.5:
        text(frame, "Raise your hands into view", W // 2, H // 2, 26, WHITE, "semibold",
             anchor="c", alpha=0.9)

    _top_bar(frame, app.mode, fps)
    if show_panel:
        _side_card(frame, app)
    _bottom(frame, app, left, right, now)
