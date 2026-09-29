"""Pure gesture logic. No camera, no OpenCV, so it can be unit-tested anywhere.

Landmarks are the 21 MediaPipe hand points; anything with .x and .y works.
Indexes: 0 wrist, 1-4 thumb, 5-8 index, 9-12 middle, 13-16 ring, 17-20 pinky.
"""
import math
from collections import deque

WRIST = 0
THUMB = (1, 2, 3, 4)
FINGERS = {  # name -> (pip, tip)
    "index": (6, 8),
    "middle": (10, 12),
    "ring": (14, 16),
    "pinky": (18, 20),
}


def _dist(a, b):
    return math.hypot(a.x - b.x, a.y - b.y)


def hand_size(lm):
    """Wrist to middle-finger knuckle: a scale that works at any distance."""
    return max(_dist(lm[0], lm[9]), 1e-6)


def extended_fingers(lm):
    """Set of extended finger names. Rotation-independent: a finger counts as
    extended when its tip is farther from the wrist than its middle joint."""
    out = set()
    for name, (pip, tip) in FINGERS.items():
        if _dist(lm[tip], lm[WRIST]) > _dist(lm[pip], lm[WRIST]) * 1.05:
            out.add(name)
    # Thumb folds sideways, so compare distance to the pinky knuckle instead.
    if _dist(lm[4], lm[17]) > _dist(lm[3], lm[17]) * 1.05:
        out.add("thumb")
    return out


def count_fingers(lm):
    return len(extended_fingers(lm))


def is_pinch(lm, threshold=0.3):
    return _dist(lm[4], lm[8]) / hand_size(lm) < threshold


def thumb_direction(lm):
    """'up' / 'down' when only the thumb is out and it points vertically."""
    if extended_fingers(lm) != {"thumb"}:
        return None
    dx = lm[4].x - lm[2].x
    dy = lm[4].y - lm[2].y  # image y grows downward
    size = hand_size(lm)
    if abs(dy) < abs(dx) or abs(dy) / size < 0.6:
        return None
    return "up" if dy < 0 else "down"


class HoldTracker:
    """Fires a value once after it has been shown continuously for hold_seconds.
    It will not fire again until the value changes (or the hand disappears)."""

    def __init__(self, hold_seconds):
        self.hold_seconds = hold_seconds
        self._value = None
        self._since = 0.0
        self._fired = False

    def reset(self):
        self._value = None
        self._fired = False

    def update(self, value, now):
        """Returns (fired_value_or_None, progress 0..1)."""
        if value is None:
            self.reset()
            return None, 0.0
        if value != self._value:
            self._value = value
            self._since = now
            self._fired = False
        if self._fired:
            return None, 1.0
        progress = min((now - self._since) / self.hold_seconds, 1.0)
        if progress >= 1.0:
            self._fired = True
            return value, 1.0
        return None, progress


class SwipeDetector:
    """Detects a quick horizontal wrist movement. x is normalised 0..1 in the
    mirrored frame, so 'right' means toward the user's right."""

    def __init__(self, window=0.35, min_dx=0.25, max_slope=0.6, cooldown=0.8):
        self.window = window
        self.min_dx = min_dx
        self.max_slope = max_slope
        self.cooldown = cooldown
        self._pts = deque()
        self._blocked_until = 0.0

    def reset(self):
        self._pts.clear()

    def update(self, x, y, now):
        self._pts.append((now, x, y))
        while self._pts and now - self._pts[0][0] > self.window:
            self._pts.popleft()
        if now < self._blocked_until or len(self._pts) < 3:
            return None
        dx = self._pts[-1][1] - self._pts[0][1]
        dy = self._pts[-1][2] - self._pts[0][2]
        if abs(dx) >= self.min_dx and abs(dy) <= abs(dx) * self.max_slope:
            self._pts.clear()
            self._blocked_until = now + self.cooldown
            return "right" if dx > 0 else "left"
        return None

    def is_moving(self, threshold=0.06):
        if len(self._pts) < 2:
            return False
        a, b = self._pts[0], self._pts[-1]
        return math.hypot(b[1] - a[1], b[2] - a[2]) > threshold


class Cooldown:
    """Rate limiter, e.g. for repeating volume changes while a thumb is held."""

    def __init__(self, seconds):
        self.seconds = seconds
        self._last = -1e9

    def ready(self, now):
        if now - self._last >= self.seconds:
            self._last = now
            return True
        return False


MODES = {1: "APPS", 2: "MEDIA", 3: "SLIDES", 4: "DRAW"}
