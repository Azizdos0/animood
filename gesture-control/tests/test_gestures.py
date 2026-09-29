import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import config
import gestures as g


def hand(thumb="out", fingers=(1, 1, 1, 1), thumb_dir="side"):
    """Build a synthetic upright right-hand-like set of 21 landmarks.
    fingers: extended flags for index..pinky."""
    lm = [(0.5, 0.9)] * 21
    lm = list(lm)
    lm[0] = (0.5, 0.9)                       # wrist
    lm[9] = (0.5, 0.6)                       # middle mcp (hand size 0.3)
    lm[17] = (0.62, 0.65)                    # pinky mcp
    xs = (0.42, 0.5, 0.56, 0.62)
    for i, (ext, x) in enumerate(zip(fingers, xs)):
        pip, tip = 6 + 4 * i, 8 + 4 * i
        lm[pip - 1] = (x, 0.62)
        lm[pip] = (x, 0.55)
        lm[tip] = (x, 0.35) if ext else (x, 0.66)
    # thumb: 2 mcp, 3 ip, 4 tip
    lm[2] = (0.44, 0.78)
    lm[3] = (0.40, 0.72)
    if thumb == "out":
        lm[4] = {"side": (0.30, 0.68), "up": (0.40, 0.40), "down": (0.40, 1.05)}[thumb_dir]
    else:
        lm[4] = (0.50, 0.70)                 # tucked toward palm
    return lm


def test_open_palm_counts_five():
    assert g.count_fingers(hand("out", (1, 1, 1, 1))) == 5


def test_fist_counts_zero():
    assert g.count_fingers(hand("in", (0, 0, 0, 0))) == 0


def test_finger_counts_1_to_4():
    assert g.count_fingers(hand("in", (1, 0, 0, 0))) == 1
    assert g.count_fingers(hand("in", (1, 1, 0, 0))) == 2
    assert g.count_fingers(hand("in", (1, 1, 1, 0))) == 3
    assert g.count_fingers(hand("in", (1, 1, 1, 1))) == 4


def test_thumb_direction():
    assert g.thumb_direction(hand("out", (0, 0, 0, 0), "up")) == "up"
    assert g.thumb_direction(hand("out", (0, 0, 0, 0), "down")) == "down"
    assert g.thumb_direction(hand("out", (0, 0, 0, 0), "side")) is None
    assert g.thumb_direction(hand("out", (1, 0, 0, 0), "up")) is None


def test_pinch():
    lm = hand("out", (1, 0, 0, 0))
    lm[4], lm[8] = (0.5, 0.4), (0.51, 0.41)
    assert g.is_pinch(lm)
    assert not g.is_pinch(hand("out", (1, 1, 1, 1)))


def test_hold_timer_fires_once_and_rearms():
    h = g.HoldTimer(1.0)
    assert h.update(3, now=0) is None
    assert h.update(3, now=0.5) is None
    assert h.update(3, now=1.0) == 3
    assert h.update(3, now=2.0) is None          # already fired
    assert h.update(None, now=2.1) is None
    assert h.update(3, now=2.2) is None          # re-armed, timing restarts
    assert h.update(3, now=3.3) == 3


def test_hold_timer_resets_on_change():
    h = g.HoldTimer(1.0)
    h.update(2, now=0)
    h.update(3, now=0.9)
    assert h.update(3, now=1.5) is None
    assert h.update(3, now=2.0) == 3


def test_swipe_right_left_and_cooldown():
    s = g.SwipeDetector(distance=0.25, window=0.4, cooldown=1.0)
    assert s.update(0.3, now=0.0) is None
    assert s.update(0.4, now=0.1) is None
    assert s.update(0.6, now=0.2) == "right"
    assert s.update(0.2, now=0.4) is None        # cooldown
    s.update(0.8, now=2.0)
    assert s.update(0.4, now=2.2) == "left"


def test_slow_drift_is_not_swipe():
    s = g.SwipeDetector(distance=0.25, window=0.4, cooldown=0.0)
    x = 0.2
    for i in range(30):
        assert s.update(x, now=i * 0.1) is None
        x += 0.02


def test_stillness():
    t = g.StillnessTracker(window=0.5, max_travel=0.05)
    r = False
    for i in range(10):
        r = t.update((0.5 + 0.001 * i, 0.5), now=i * 0.1)
    assert r
    for i in range(10, 20):
        r = t.update((0.5 + 0.05 * (i - 9), 0.5), now=i * 0.1)
    assert not r


def test_debouncer():
    d = g.Debouncer(3)
    out = [d.update(v) for v in (2, 2, 3, 2, 2, 2)]
    assert out == [None, None, None, None, None, 2]


def test_one_euro_smooths_jitter():
    f = g.OneEuroFilter(min_cutoff=1.0, beta=0.0)
    vals = [f(100 + (3 if i % 2 else -3), t=i * 0.033) for i in range(60)]
    assert max(vals[30:]) - min(vals[30:]) < 3


def test_landmark_smoother_steadies_still_hand_and_follows_motion():
    s = g.LandmarkSmoother()
    base = hand()
    out = None
    for i in range(60):   # still hand with +-0.004 jitter
        j = 0.004 if i % 2 else -0.004
        out = s([(x + j, y) for x, y in base], t=i / 30)
    assert abs(out[8][0] - base[8][0]) < 0.002
    for i in range(60, 75):  # fast move to the right
        out = s([(x + 0.3, y) for x, y in base], t=i / 30)
    assert abs(out[8][0] - (base[8][0] + 0.3)) < 0.01
    assert s(None) is None


def test_mode_latches_after_one_hold_and_survives_hand_down():
    import main
    app = main.App(config.load(os.devnull))
    four = hand("in", (1, 1, 1, 1))
    t = 0.0
    for _ in range(12):                      # ~0.4 s of 4 fingers: not yet
        app.update_mode_from_left(four, t)
        t += 1 / 30
    assert app.mode == "LOCKED"
    for _ in range(10):                      # keep holding past 0.5 s
        app.update_mode_from_left(four, t)
        t += 1 / 30
    assert app.mode == "DRAW"
    for lm in [hand("in", (1, 1, 0, 0))] * 3 + [hand("in", (0, 0, 0, 0))] * 5 + [None] * 60:
        app.update_mode_from_left(lm, t)     # lowering the hand: brief poses, then gone
        t += 1 / 30
    assert app.mode == "DRAW"
    fist = hand("in", (0, 0, 0, 0))
    for _ in range(40):                      # a deliberate 1 s+ fist locks
        app.update_mode_from_left(fist, t)
        t += 1 / 30
    assert app.mode == "LOCKED"


def run(app, lm, frames, t):
    for _ in range(frames):
        app.update_mode_from_left(lm, t)
        t += 1 / 30
    return t


def test_same_fingers_twice_toggles_lock():
    import main
    app = main.App(config.load(os.devnull))
    four, two = hand("in", (1, 1, 1, 1)), hand("in", (1, 1, 0, 0))
    t = run(app, four, 25, 0.0)
    assert app.mode == "DRAW"                # once: opens Draw
    t = run(app, four, 90, t)
    assert app.mode == "DRAW"                # still holding: no flip-flop
    t = run(app, None, 10, t)                # lower the hand
    t = run(app, four, 25, t)
    assert app.mode == "LOCKED"              # twice: locks
    t = run(app, None, 10, t)
    t = run(app, four, 25, t)
    assert app.mode == "DRAW"                # and again unlocks
    t = run(app, None, 10, t)
    t = run(app, two, 25, t)
    assert app.mode == "MEDIA"               # a different count just switches
    t = run(app, two, 60, t)
    assert app.mode == "MEDIA"


def test_pen_stabilizer_makes_smooth_continuous_ink():
    import math
    import random
    random.seed(1)
    pen = g.PenStabilizer()
    ink = []
    for i in range(90):  # noisy circle, radius 150 px, drawn in 3 s
        a = i / 90 * 2 * math.pi
        x = 640 + 150 * math.cos(a) + random.uniform(-3, 3)
        y = 360 + 150 * math.sin(a) + random.uniform(-3, 3)
        ink += pen.down(x, y, t=i / 30)
    ink += pen.up()
    assert len(ink) > 100
    gaps = [math.dist(a, b) for a, b in zip(ink, ink[1:])]
    assert max(gaps) < 4                                  # continuous line
    radii = [math.dist(p, (640, 360)) for p in ink[len(ink) // 4:]]
    assert max(radii) - min(radii) < 12                   # jitter mostly gone
    assert pen.position() is None


def _shift(lm, dx, dy=0.0):
    return [(x + dx, y + dy) for x, y in lm]


def _pinched(lm, tip=8):
    lm = list(lm)
    lm[4] = lm[tip]
    return lm


def _kinds(events):
    return [e[0] for e in events]


def test_mouse_moves_clicks_and_freezes_during_pinch():
    m = g.MouseLogic(1920, 1080)
    point = hand("in", (1, 0, 0, 0))
    t, ev = 0.0, []
    for i in range(10):                       # move right
        ev += m.update(_shift(point, 0.01 * i), t)
        t += 1 / 30
    moves = [e for e in ev if e[0] == "move"]
    assert len(moves) > 3 and moves[-1][1] > moves[0][1]
    ev = []
    for _ in range(4):                        # quick pinch (~0.13 s)
        ev += m.update(_pinched(_shift(point, 0.09)), t)
        t += 1 / 30
    assert "move" not in _kinds(ev[1:])       # frozen while pinched
    ev = m.update(_shift(point, 0.09), t)     # release
    assert _kinds(ev) == ["click"]


def test_mouse_pinch_and_move_drags():
    m = g.MouseLogic(1920, 1080)
    point = hand("in", (1, 0, 0, 0))
    t, ev = 0.0, []
    m.update(point, t)
    for i in range(30):                       # pinch held 1 s while moving
        t += 1 / 30
        ev += m.update(_pinched(_shift(point, 0.004 * i)), t)
    k = _kinds(ev)
    assert k.count("down") == 1 and "move" in k[k.index("down"):]
    t += 1 / 30
    assert _kinds(m.update(point, t)) == ["up"]


def test_mouse_long_press_right_clicks_once():
    m = g.MouseLogic(1920, 1080)
    point = hand("in", (1, 0, 0, 0))
    m.update(point, 0.0)
    ev, t = [], 0.0
    for _ in range(40):                       # pinch held still for 1.3 s
        t += 1 / 30
        ev += m.update(_pinched(point), t)
    assert _kinds(ev).count("right_click") == 1 and "down" not in _kinds(ev)
    t += 1 / 30
    assert m.update(point, t) == []           # release: no extra left click


def test_mouse_scroll():
    m = g.MouseLogic(1920, 1080)
    two = hand("in", (1, 1, 0, 0))
    ev, t = [], 0.0
    for i in range(10):                       # two fingers moving up
        ev += m.update(_shift(two, 0, -0.01 * i), t)
        t += 1 / 30
    scrolls = [e[1] for e in ev if e[0] == "scroll"]
    assert scrolls and all(s > 0 for s in scrolls)
    assert "move" not in _kinds(ev[1:])


def test_mouse_hand_lost_while_dragging_releases_button():
    m = g.MouseLogic(1920, 1080)
    point = _pinched(hand("in", (1, 0, 0, 0)))
    for i in range(20):
        m.update(_shift(point, 0.005 * i), i / 30)
    assert m.dragging
    assert m.update(None, 1.0) == [("up",)]


def test_config_roundtrip_and_bad_file(tmp_path):
    p = tmp_path / "c.json"
    cfg = config.load(str(p))                     # missing file -> defaults
    assert len(cfg["apps"]) == 5
    cfg["apps"][3] = {"name": "X", "target": "C:/x.exe"}
    config.save(cfg, str(p))
    assert config.load(str(p))["apps"][3]["target"] == "C:/x.exe"
    p.write_text("not json")
    assert len(config.load(str(p))["apps"]) == 5
