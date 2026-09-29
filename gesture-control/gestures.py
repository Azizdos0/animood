"""Pure gesture logic. Landmarks are a list of 21 (x, y) tuples, normalized 0-1
(MediaPipe order: 0 wrist, 4 thumb tip, 8 index tip, 12 middle tip, 16 ring tip,
20 pinky tip). No camera or OS calls here, so everything is unit-testable."""
import math
import time
from collections import deque

WRIST, THUMB_TIP, THUMB_IP, THUMB_MCP = 0, 4, 3, 2
INDEX_MCP, INDEX_TIP = 5, 8
MIDDLE_MCP = 9
PINKY_MCP = 17
FINGER_TIPS = (8, 12, 16, 20)
FINGER_PIPS = (6, 10, 14, 18)

# Tunable thresholds
PINCH_RATIO = 0.30        # thumb-index distance / hand size below this = pinch
THUMB_VERTICAL_MARGIN = 0.6  # thumb tip must sit this many hand-sizes above/below its base
SWIPE_DISTANCE = 0.28     # normalized screen width travelled within the window
SWIPE_WINDOW = 0.45       # seconds
SWIPE_COOLDOWN = 1.0
STILL_MAX_TRAVEL = 0.06   # palm may move this much and still count as "still"

# Mouse mode
MOUSE_ZONE = (0.30, 0.18, 0.72, 0.62)  # part of the camera frame mapped to the whole screen
PINCH_ON, PINCH_OFF = 0.28, 0.40       # pinch hysteresis (fraction of hand size)
DRAG_START = 0.03         # hand travel (frame fraction) while pinched that starts a drag
LONG_PRESS = 0.8          # pinch held still this long = right click
CLICK_FREEZE = 0.12       # a click lands where the cursor was this long before the pinch
RELEASE_FREEZE = 0.15     # cursor holds still briefly after a pinch is released
SCROLL_GAIN = 2500        # wheel units per full frame-height of hand movement
SCROLL_STEP = 40          # smallest wheel amount sent at once


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def hand_size(lm):
    return max(dist(lm[WRIST], lm[MIDDLE_MCP]), 1e-6)


def finger_states(lm):
    """Return [thumb, index, middle, ring, pinky] booleans (True = extended)."""
    # Finger extended when the tip is farther from the wrist than the PIP joint.
    # Distance-based, so it also works when the hand is tilted.
    fingers = [dist(lm[t], lm[WRIST]) > dist(lm[p], lm[WRIST]) * 1.05
               for t, p in zip(FINGER_TIPS, FINGER_PIPS)]
    # Thumb: tip farther from the pinky base than the IP joint is.
    thumb = dist(lm[THUMB_TIP], lm[PINKY_MCP]) > dist(lm[THUMB_IP], lm[PINKY_MCP]) * 1.1
    return [thumb] + fingers


def count_fingers(lm):
    return sum(finger_states(lm))


def thumb_direction(lm):
    """'up' / 'down' if only the thumb is out and pointing vertically, else None."""
    s = finger_states(lm)
    if not s[0] or any(s[1:]):
        return None
    dy = (lm[THUMB_TIP][1] - lm[THUMB_MCP][1]) / hand_size(lm)
    if dy < -THUMB_VERTICAL_MARGIN:
        return "up"
    if dy > THUMB_VERTICAL_MARGIN:
        return "down"
    return None


def is_pinch(lm):
    return dist(lm[THUMB_TIP], lm[INDEX_TIP]) / hand_size(lm) < PINCH_RATIO


def palm_center(lm):
    return lm[MIDDLE_MCP]


class HoldTimer:
    """Fires once when `value` has stayed the same (and not None) for `duration` s.
    Re-arms only after the value changes or disappears."""

    def __init__(self, duration):
        self.duration = duration
        self.value = None
        self.since = 0.0
        self.fired = False

    def update(self, value, now=None):
        now = time.monotonic() if now is None else now
        if value != self.value:
            self.value, self.since, self.fired = value, now, False
            return None
        if value is None or self.fired:
            return None
        if now - self.since >= self.duration:
            self.fired = True
            return value
        return None

    def progress(self, now=None):
        now = time.monotonic() if now is None else now
        if self.value is None or self.fired:
            return 0.0
        return min((now - self.since) / self.duration, 1.0)

    def reset(self):
        self.value, self.fired = None, False


class SwipeDetector:
    """Detects fast horizontal palm motion. Returns 'left'/'right'/None.
    Directions are as seen by the user (frame must already be mirrored)."""

    def __init__(self, distance=None, window=None, cooldown=None):
        self.distance = SWIPE_DISTANCE if distance is None else distance
        self.window = SWIPE_WINDOW if window is None else window
        self.cooldown = SWIPE_COOLDOWN if cooldown is None else cooldown
        self.points = deque()
        self.last_fire = -1e9

    def update(self, x, now=None):
        now = time.monotonic() if now is None else now
        if x is None:
            self.points.clear()
            return None
        self.points.append((now, x))
        while self.points and now - self.points[0][0] > self.window:
            self.points.popleft()
        if now - self.last_fire < self.cooldown:
            return None
        dx = x - self.points[0][1]
        if abs(dx) >= self.distance:
            self.last_fire = now
            self.points.clear()
            return "right" if dx > 0 else "left"
        return None


class StillnessTracker:
    """True when the palm has barely moved over the last `window` seconds."""

    def __init__(self, window=0.6, max_travel=STILL_MAX_TRAVEL):
        self.window, self.max_travel = window, max_travel
        self.points = deque()

    def update(self, pos, now=None):
        now = time.monotonic() if now is None else now
        if pos is None:
            self.points.clear()
            return False
        self.points.append((now, pos))
        while self.points and now - self.points[0][0] > self.window:
            self.points.popleft()
        if now - self.points[0][0] < self.window * 0.8:
            return False
        xs = [p[1][0] for p in self.points]
        ys = [p[1][1] for p in self.points]
        return (max(xs) - min(xs)) < self.max_travel and (max(ys) - min(ys)) < self.max_travel


class Debouncer:
    """Stabilises a noisy per-frame value: it only changes after `frames`
    consecutive identical readings."""

    def __init__(self, frames=4):
        self.frames, self.current, self.candidate, self.count = frames, None, None, 0

    def update(self, value):
        if value == self.current:
            self.candidate, self.count = value, 0
            return self.current
        if value == self.candidate:
            self.count += 1
        else:
            self.candidate, self.count = value, 1
        if self.count >= self.frames:
            self.current, self.candidate, self.count = value, None, 0
        return self.current


class OneEuroFilter:
    """Smooths jittery 1-D signals (used for the drawing fingertip)."""

    def __init__(self, min_cutoff=1.0, beta=8.0, d_cutoff=1.0):
        self.min_cutoff, self.beta, self.d_cutoff = min_cutoff, beta, d_cutoff
        self.x_prev = self.dx_prev = self.t_prev = None

    @staticmethod
    def _alpha(cutoff, dt):
        tau = 1.0 / (2 * math.pi * cutoff)
        return 1.0 / (1.0 + tau / dt)

    def __call__(self, x, t=None):
        t = time.monotonic() if t is None else t
        if self.x_prev is None:
            self.x_prev, self.dx_prev, self.t_prev = x, 0.0, t
            return x
        dt = max(t - self.t_prev, 1e-6)
        dx = (x - self.x_prev) / dt
        a_d = self._alpha(self.d_cutoff, dt)
        dx_hat = a_d * dx + (1 - a_d) * self.dx_prev
        cutoff = self.min_cutoff + self.beta * abs(dx_hat)
        a = self._alpha(cutoff, dt)
        x_hat = a * x + (1 - a) * self.x_prev
        self.x_prev, self.dx_prev, self.t_prev = x_hat, dx_hat, t
        return x_hat

    def reset(self):
        self.x_prev = self.dx_prev = self.t_prev = None


class PenStabilizer:
    """Turns a noisy fingertip track (pixels) into a smooth ink line.

    1. One Euro filter   - removes high-frequency jitter.
    2. Lazy brush        - the pen trails the finger on a short "string", so tiny
                           wobbles inside `lazy_radius` px never reach the ink.
    3. Catmull-Rom curve - anchor points are joined with a spline instead of
                           straight segments, so fast strokes stay round.
    `down(x, y)` returns the new points to ink; `up()` flushes the last piece."""

    def __init__(self, min_cutoff=2.0, beta=0.01, lazy_radius=4.0, spacing=3.0):
        self.fx, self.fy = OneEuroFilter(min_cutoff, beta), OneEuroFilter(min_cutoff, beta)
        self.lazy_radius, self.spacing = lazy_radius, spacing
        self.pen = None
        self.anchors = []

    def position(self):
        return self.pen

    def down(self, x, y, t=None):
        t = time.monotonic() if t is None else t
        tx, ty = self.fx(x, t), self.fy(y, t)
        if self.pen is None:
            self.pen = (tx, ty)
            self.anchors = [self.pen, self.pen]
            return []
        px, py = self.pen
        d = math.hypot(tx - px, ty - py)
        if d > self.lazy_radius:
            k = 1 - self.lazy_radius / d
            self.pen = (px + (tx - px) * k, py + (ty - py) * k)
        if math.dist(self.pen, self.anchors[-1]) < self.spacing:
            return []
        self.anchors.append(self.pen)
        self.anchors = self.anchors[-4:]
        if len(self.anchors) < 4:
            return []
        return _catmull_rom(*self.anchors)

    def up(self):
        pts = []
        if self.pen is not None and len(self.anchors) >= 3:
            a = self.anchors
            pts = _catmull_rom(a[-3], a[-2], a[-1], a[-1])
        self.pen, self.anchors = None, []
        self.fx.reset()
        self.fy.reset()
        return pts

    def tail(self):
        """Points from the end of the committed ink to the live pen. The spline
        needs one point of look-ahead, so this last bit is drawn as a preview
        each frame to avoid any visible lag behind the fingertip."""
        if self.pen is None:
            return []
        start = self.anchors[-2:] if len(self.anchors) >= 4 else self.anchors[1:]
        return start + [self.pen]


def _catmull_rom(p0, p1, p2, p3):
    """Points on the Catmull-Rom segment p1 -> p2 (inclusive), ~2 px apart."""
    n = max(2, int(math.dist(p1, p2) / 2))
    out = []
    for i in range(n + 1):
        s = i / n
        s2, s3 = s * s, s * s * s
        out.append(tuple(
            0.5 * (2 * b + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s2
                   + (-a + 3 * b - 3 * c + d) * s3)
            for a, b, c, d in zip(p0, p1, p2, p3)))
    return out


class MouseLogic:
    """Right hand as a mouse. Returns a list of events per frame:
    ("move", x, y), ("click",), ("down",), ("up",), ("right_click",), ("scroll", n).

    - point with the index finger: move the cursor (a zone of the camera frame
      maps to the full screen, so small hand moves cover the whole screen)
    - thumb+index pinch and release: left click
    - pinch and move the hand: drag
    - pinch and hold still: right click (like a long-press on a touchscreen)
    - index+middle up, move hand up/down: scroll
    The cursor is frozen while pinching (and uses its position from just before
    the pinch), so fingers closing for a click don't drag the cursor off target.
    Drags follow the palm, which stays steady while the fingers are pinched."""

    def __init__(self, screen_w, screen_h, zone=MOUSE_ZONE):
        self.sw, self.sh, self.zone = screen_w, screen_h, zone
        self.fx, self.fy = OneEuroFilter(1.0, 0.004), OneEuroFilter(1.0, 0.004)
        self.history = deque()
        self.pos = None
        self.pinch = self.dragging = self.long_pressed = False
        self.pinch_start = self.freeze_until = 0.0
        self.anchor = self.palm_anchor = None
        self.scroll_prev, self.scroll_acc = None, 0.0
        self.scrolling = False
        self.flash, self.flash_until = "", 0.0

    def to_screen(self, x, y):
        x0, y0, x1, y1 = self.zone
        u = min(max((x - x0) / (x1 - x0), 0.0), 1.0)
        v = min(max((y - y0) / (y1 - y0), 0.0), 1.0)
        return u * (self.sw - 1), v * (self.sh - 1)

    def label(self, now=None):
        """Short state text for the HUD."""
        now = time.monotonic() if now is None else now
        if self.dragging:
            return "Drag"
        if self.scrolling:
            return "Scroll"
        return self.flash if now < self.flash_until else ""

    def reset(self):
        events = [("up",)] if self.dragging else []
        self.__init__(self.sw, self.sh, self.zone)
        return events

    def _move(self, x, y):
        if self.pos is not None and abs(x - self.pos[0]) < 1 and abs(y - self.pos[1]) < 1:
            return []
        self.pos = (x, y)
        return [("move", int(round(x)), int(round(y)))]

    def _past(self, t0):
        best = self.history[0]
        for h in self.history:
            if h[0] <= t0:
                best = h
        return best[1], best[2]

    def update(self, lm, t=None):
        t = time.monotonic() if t is None else t
        if lm is None:
            return self.reset()
        events = []
        sx, sy = self.to_screen(*lm[INDEX_TIP])
        sx, sy = self.fx(sx, t), self.fy(sy, t)
        self.history.append((t, sx, sy))
        while t - self.history[0][0] > 0.5:
            self.history.popleft()

        ri = dist(lm[THUMB_TIP], lm[INDEX_TIP]) / hand_size(lm)
        pinch = ri < (PINCH_OFF if self.pinch else PINCH_ON)   # hysteresis
        s = finger_states(lm)
        scroll_pose = s[1] and s[2] and not s[3] and not s[4] and not pinch
        palm = palm_center(lm)

        if pinch and not self.pinch:                      # pinch starts
            self.pinch_start = t
            self.anchor = self._past(t - CLICK_FREEZE)
            self.palm_anchor = palm
            events += self._move(*self.anchor)
        elif pinch and not self.dragging and not self.long_pressed:
            if dist(palm, self.palm_anchor) > DRAG_START:  # moved: it's a drag
                self.dragging = True
                events.append(("down",))
            elif t - self.pinch_start >= LONG_PRESS:        # held still: right click
                self.long_pressed = True
                events.append(("right_click",))
                self.flash, self.flash_until = "Right click", t + 0.6
        elif not pinch and self.pinch:                     # pinch released
            if self.dragging:
                events.append(("up",))
            elif not self.long_pressed:
                events.append(("click",))
                self.flash, self.flash_until = "Click", t + 0.4
            self.dragging = self.long_pressed = False
            self.freeze_until = t + RELEASE_FREEZE
        self.pinch = pinch

        if self.dragging:   # drag follows the palm, scaled like the cursor zone
            x0, y0, x1, y1 = self.zone
            dx = (palm[0] - self.palm_anchor[0]) / (x1 - x0) * self.sw
            dy = (palm[1] - self.palm_anchor[1]) / (y1 - y0) * self.sh
            events += self._move(min(max(self.anchor[0] + dx, 0), self.sw - 1),
                                 min(max(self.anchor[1] + dy, 0), self.sh - 1))

        # scroll
        self.scrolling = scroll_pose
        if scroll_pose:
            y = lm[MIDDLE_MCP][1]
            if self.scroll_prev is not None:
                self.scroll_acc += (self.scroll_prev - y) * SCROLL_GAIN
                n = int(self.scroll_acc / SCROLL_STEP) * SCROLL_STEP
                if n:
                    events.append(("scroll", n))
                    self.scroll_acc -= n
            self.scroll_prev = y
        else:
            self.scroll_prev, self.scroll_acc = None, 0.0

        frozen = self.pinch or scroll_pose or t < self.freeze_until
        if not frozen:
            events += self._move(sx, sy)
        return events


class LandmarkSmoother:
    """One Euro filter on all 21 landmarks of one hand: removes the frame-to-frame
    jitter when the hand is still, but adds almost no lag when it moves fast."""

    def __init__(self, min_cutoff=1.2, beta=15.0):
        self.filters = [(OneEuroFilter(min_cutoff, beta), OneEuroFilter(min_cutoff, beta))
                        for _ in range(21)]

    def __call__(self, lm, t=None):
        if lm is None:
            self.reset()
            return None
        t = time.monotonic() if t is None else t
        return [(fx(x, t), fy(y, t)) for (x, y), (fx, fy) in zip(lm, self.filters)]

    def reset(self):
        for fx, fy in self.filters:
            fx.reset()
            fy.reset()
