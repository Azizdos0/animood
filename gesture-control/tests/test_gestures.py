import os
import sys
from collections import namedtuple

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import gestures as g  # noqa: E402

P = namedtuple("P", "x y")

BASES = {"index": (5, 0.42), "middle": (9, 0.48), "ring": (13, 0.54), "pinky": (17, 0.60)}


def make_hand(extended=(), thumb="folded"):
    """Synthetic upright right-ish hand. Finger names in `extended` are out."""
    lm = [P(0.5, 0.9)] * 21
    lm = list(lm)
    for name, (mcp, x) in BASES.items():
        lm[mcp] = P(x, 0.6)
        lm[mcp + 1] = P(x, 0.5)
        if name in extended:
            lm[mcp + 2], lm[mcp + 3] = P(x, 0.42), P(x, 0.35)
        else:
            lm[mcp + 2], lm[mcp + 3] = P(x, 0.55), P(x, 0.62)
    lm[1], lm[2], lm[3] = P(0.45, 0.85), P(0.38, 0.78), P(0.32, 0.72)
    if thumb == "out":
        lm[4] = P(0.25, 0.66)
    elif thumb == "up":
        lm[2], lm[3], lm[4] = P(0.36, 0.78), P(0.36, 0.60), P(0.36, 0.45)
    elif thumb == "down":
        lm[2], lm[3], lm[4] = P(0.36, 0.60), P(0.36, 0.78), P(0.36, 0.93)
    else:
        lm[4] = P(0.44, 0.68)
    return lm


ALL = ("index", "middle", "ring", "pinky")


def test_fist_is_zero():
    assert g.count_fingers(make_hand()) == 0


def test_open_palm_is_five():
    assert g.count_fingers(make_hand(ALL, "out")) == 5


def test_each_count_one_to_four():
    for n in range(1, 5):
        assert g.count_fingers(make_hand(ALL[:n])) == n


def test_thumb_only_counts_one():
    assert g.extended_fingers(make_hand((), "out")) == {"thumb"}


def test_counting_is_rotation_independent():
    hand = make_hand(ALL[:2])
    rotated = [P(1 - p.y, p.x) for p in hand]  # 90 degree turn
    assert g.count_fingers(rotated) == 2


def test_thumb_direction():
    assert g.thumb_direction(make_hand((), "up")) == "up"
    assert g.thumb_direction(make_hand((), "down")) == "down"
    assert g.thumb_direction(make_hand((), "out")) is None
    assert g.thumb_direction(make_hand(("index",), "up")) is None


def test_pinch():
    hand = make_hand(("index",))
    assert not g.is_pinch(hand)
    hand[4] = P(hand[8].x + 0.01, hand[8].y + 0.01)
    assert g.is_pinch(hand)


def test_hold_fires_once_then_needs_change():
    h = g.HoldTracker(1.0)
    assert h.update(3, 0.0) == (None, 0.0)
    assert h.update(3, 0.5)[0] is None
    assert h.update(3, 1.0)[0] == 3
    assert h.update(3, 1.5)[0] is None  # no repeat while held
    assert h.update(None, 2.0)[0] is None
    assert h.update(3, 2.1)[0] is None
    assert h.update(3, 3.2)[0] == 3


def test_hold_resets_when_value_changes():
    h = g.HoldTracker(1.0)
    h.update(2, 0.0)
    h.update(3, 0.9)
    assert h.update(3, 1.5)[0] is None  # 3 has only been held 0.6s
    assert h.update(3, 2.0)[0] == 3


def test_swipe_right_and_left():
    s = g.SwipeDetector()
    got = [s.update(0.3 + 0.1 * i, 0.5, 0.05 * i) for i in range(6)]
    assert "right" in got
    s = g.SwipeDetector()
    got = [s.update(0.8 - 0.1 * i, 0.5, 0.05 * i) for i in range(6)]
    assert "left" in got


def test_slow_or_vertical_movement_is_not_a_swipe():
    s = g.SwipeDetector()
    assert not any(s.update(0.3 + 0.01 * i, 0.5, 0.1 * i) for i in range(20))
    s = g.SwipeDetector()
    assert not any(s.update(0.5, 0.2 + 0.1 * i, 0.05 * i) for i in range(6))


def test_swipe_cooldown():
    s = g.SwipeDetector(cooldown=1.0)
    first = [s.update(0.2 + 0.1 * i, 0.5, 0.05 * i) for i in range(6)]
    assert "right" in first
    again = [s.update(0.2 + 0.1 * i, 0.5, 0.3 + 0.05 * i) for i in range(6)]
    assert not any(again)


def test_cooldown():
    c = g.Cooldown(0.5)
    assert c.ready(0.0)
    assert not c.ready(0.2)
    assert c.ready(0.6)
