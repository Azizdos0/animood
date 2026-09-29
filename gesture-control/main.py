"""Hand-gesture computer control.  Left hand picks the mode, right hand acts.

Keys: A M S D pick a mode, L lock, C settings, H hide panel, X clear drawing,
P save drawing, Q / Esc quit.
"""
import os
import subprocess
import sys
import threading
import time
import urllib.request

# Media Foundation opens much faster without hardware transforms.
os.environ.setdefault("OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS", "0")
import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision

import actions
import config
import gestures as g
import ui

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(HERE, "hand_landmarker.task")
MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
             "hand_landmarker/float16/1/hand_landmarker.task")
WINDOW = "Gesture Control"
FRAME_W, FRAME_H = 1280, 720

MODES = {1: "APPS", 2: "MEDIA", 3: "SLIDES", 4: "DRAW", 5: "MOUSE", 0: "LOCKED"}
KEY_MODES = {ord("a"): "APPS", ord("m"): "MEDIA", ord("s"): "SLIDES",
             ord("d"): "DRAW", ord("o"): "MOUSE", ord("l"): "LOCKED"}
MODE_TITLES = {"APPS": "Apps", "MEDIA": "Media", "SLIDES": "Slides", "DRAW": "Draw",
               "MOUSE": "Mouse", "LOCKED": "Locked"}

HOLD_APP = 1.0         # seconds to hold N fingers to open an app
HOLD_PLAYPAUSE = 0.8   # seconds of still open palm
HOLD_CLEAR = 1.5       # seconds of open palm to clear drawing
VOLUME_REPEAT = 0.25   # seconds between volume steps while thumb held
MODE_FRAMES = 3        # frames a left-hand count must repeat before it counts at all
MODE_HOLD = 0.5        # seconds to hold 1-5 fingers to switch mode (then it stays)
LOCK_HOLD = 1.0        # seconds to hold a fist to lock (longer: fists happen by accident)
BRUSH = 5
ERASER = 36            # eraser diameter in px
COLOR_HOVER = 0.3      # seconds the fingertip rests on a colour to pick it
PEN_UP_FRAMES = 3      # frames of "not drawing" before the pen lifts


def ensure_model():
    if os.path.exists(MODEL_PATH):
        return
    print("Downloading hand model (~8 MB, one time)...")
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)


def make_landmarker():
    opts = vision.HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=vision.RunningMode.VIDEO,
        num_hands=2,
        min_hand_detection_confidence=0.6,
        min_hand_presence_confidence=0.6,
        min_tracking_confidence=0.6)
    return vision.HandLandmarker.create_from_options(opts)


def split_hands(result, swap):
    """Return (left_lm, right_lm) as lists of (x, y); None when absent.
    On the mirrored frame the Hand Landmarker reports each hand with the opposite
    label, so it is flipped here. The "swap hands" setting flips it back for
    cameras that already mirror their image."""
    hands = {"Left": None, "Right": None}
    for lms, cats in zip(result.hand_landmarks, result.handedness):
        label = cats[0].category_name
        if not swap:
            label = "Right" if label == "Left" else "Left"
        if hands[label] is None:
            hands[label] = [(p.x, p.y) for p in lms]
    return hands["Left"], hands["Right"]


class App:
    def __init__(self, cfg):
        self.cfg = cfg
        self.mode = "LOCKED"
        self.mode_deb = g.Debouncer(MODE_FRAMES)
        self.mode_target, self.mode_since = None, 0.0
        self.mode_block = None      # count that just fired; must be released first
        self.mode_key = None
        self.app_hold = g.HoldTimer(HOLD_APP)
        self.pp_hold = g.HoldTimer(HOLD_PLAYPAUSE)
        self.clear_hold = g.HoldTimer(HOLD_CLEAR)
        self.still = g.StillnessTracker()
        self.swipe = g.SwipeDetector()
        self.canvas = None
        self.has_ink = False
        self.pen = g.PenStabilizer()
        self.pen_up_frames = PEN_UP_FRAMES
        self.cursor = None          # (x, y, pen_down) in DRAW mode
        self.color_idx = 0          # index into ui.PALETTE
        self.color_hover = g.HoldTimer(COLOR_HOVER)
        self.mouse = g.MouseLogic(*actions.screen_size())
        self.last_volume = 0.0
        self.last_seen = time.monotonic()
        self.toast, self.toast_until = "", 0.0
        self.settings_proc = None

    def say(self, text, secs=1.6):
        self.toast, self.toast_until = text, time.monotonic() + secs

    # ---- mode selection -------------------------------------------------
    def update_mode_from_left(self, left, now=None):
        """Modes latch and toggle:
        - show 1-5 fingers once (held briefly) -> that mode, and it stays even
          after the left hand is lowered or leaves the frame;
        - show the *same* fingers again -> Locked;
        - hold a fist -> Locked.
        After a pose fires it must be released (hand lowered or changed) before
        it can fire again, so holding it doesn't flip back and forth."""
        now = time.monotonic() if now is None else now
        n = g.count_fingers(left) if left is not None else None
        stable = self.mode_deb.update(n)
        if self.mode_block is not None and stable != self.mode_block:
            self.mode_block = None
        target = None
        if stable is not None and stable != self.mode_block:
            wanted = MODES[stable]
            target = "LOCKED" if wanted == self.mode else wanted
            if target == self.mode:          # fist while already locked
                target = None
        key = (stable, target)
        if key != self.mode_key:
            self.mode_key, self.mode_target, self.mode_since = key, target, now
        elif target and now - self.mode_since >= self.mode_hold_time(stable):
            self.set_mode(target)

    @staticmethod
    def mode_hold_time(count):
        return LOCK_HOLD if count == 0 else MODE_HOLD

    def mode_progress(self, now=None):
        """(target mode, 0-1) while a mode switch is charging, else (None, 0)."""
        if not self.mode_target:
            return None, 0.0
        now = time.monotonic() if now is None else now
        p = (now - self.mode_since) / self.mode_hold_time(self.mode_key[0])
        return self.mode_target, min(p, 1.0)

    def set_mode(self, mode):
        self.mode = mode
        self.mode_target, self.mode_key = None, None
        self.mode_block = self.mode_deb.current   # the pose showing now must be released
        for h in (self.app_hold, self.pp_hold, self.clear_hold):
            h.reset()
        self.swipe.update(None)
        self.still.update(None)
        self.lift_pen()
        self.pen_up_frames = PEN_UP_FRAMES
        self.cursor = None
        self.color_hover.reset()
        actions.mouse(self.mouse.reset())   # never leave a mouse button held down
        self.say(f"{MODE_TITLES[mode]} mode")

    # ---- per-mode right-hand handling ----------------------------------
    def handle_right(self, right, frame_w, frame_h):
        now = time.monotonic()
        if right is None:
            for h in (self.app_hold, self.pp_hold, self.clear_hold):
                h.update(None, now)
            self.still.update(None)
            self.swipe.update(None)
            self.lift_pen()
            self.pen_up_frames = PEN_UP_FRAMES
            self.cursor = None
            self.color_hover.update(None, now)
            actions.mouse(self.mouse.update(None, now))
            return
        n = g.count_fingers(right)
        px, py = g.palm_center(right)

        if self.mode == "APPS":
            picked = self.app_hold.update(n if 1 <= n <= 5 else None, now)
            if picked:
                app = self.cfg["apps"][picked - 1]
                ok, msg = actions.launch(app["target"])
                label = app["name"] or f"slot {picked}"
                self.say(f"Opening {label}" if ok else f"Slot {picked}: {msg}")

        elif self.mode == "MEDIA":
            direction = self.swipe.update(px, now)
            if direction:
                actions.ACTIONS["next_track" if direction == "right" else "prev_track"]()
                self.say("Next track  ▶▶" if direction == "right" else "◀◀  Previous track")
            still = self.still.update((px, py), now)
            if self.pp_hold.update("palm" if n == 5 and still else None, now):
                actions.ACTIONS["play_pause"]()
                self.say("Play / pause")
            thumb = g.thumb_direction(right)
            if thumb and now - self.last_volume > VOLUME_REPEAT:
                actions.ACTIONS["volume_up" if thumb == "up" else "volume_down"]()
                self.last_volume = now
                self.say("Volume up" if thumb == "up" else "Volume down", 0.7)

        elif self.mode == "SLIDES":
            direction = self.swipe.update(px, now)
            if direction:
                actions.ACTIONS["slide_next" if direction == "right" else "slide_prev"]()
                self.say("Next slide  →" if direction == "right" else "←  Previous slide")

        elif self.mode == "DRAW":
            self.draw(right, n, frame_w, frame_h, now)

        elif self.mode == "MOUSE":
            actions.mouse(self.mouse.update(right, now))

    def draw(self, right, n, w, h, now):
        if self.canvas is None or self.canvas.shape[:2] != (h, w):
            self.canvas = np.zeros((h, w, 3), np.uint8)
        if self.clear_hold.update("palm" if n == 5 else None, now):
            self.clear_canvas()
        states = g.finger_states(right)
        pointing = states[1] and not states[2] and not states[3] and not states[4]
        x, y = right[g.INDEX_TIP][0] * w, right[g.INDEX_TIP][1] * h
        # Fingertip resting on a palette swatch picks that colour (no ink there).
        slot = ui.palette_hit(x, y, w)
        picked = self.color_hover.update(slot, now)
        if picked is not None:
            self.pick_color(picked)
        if slot is not None:
            self.lift_pen()
            self.pen_up_frames = PEN_UP_FRAMES
            self.cursor = (int(x), int(y), False)
            return
        # Hysteresis: the pen goes down at once but only lifts after a few
        # frames of "not drawing", so a one-frame misread doesn't break a stroke.
        if pointing and not g.is_pinch(right):
            self.pen_up_frames = 0
        else:
            self.pen_up_frames += 1
        if self.pen_up_frames < PEN_UP_FRAMES:
            self.ink(self.pen.down(x, y, now))
            px, py = self.pen.position()
            self.cursor = (int(px), int(py), True)
        else:
            self.lift_pen()
            self.cursor = (int(x), int(y), False)

    def pick_color(self, idx):
        self.lift_pen()
        self.color_idx = idx
        self.say(ui.PALETTE[idx][0])

    def erasing(self):
        return ui.PALETTE[self.color_idx][1] is None

    def brush(self):
        return ERASER if self.erasing() else BRUSH

    def ink_color(self):
        return (0, 0, 0) if self.erasing() else ui.PALETTE[self.color_idx][1]

    def ink(self, pts):
        if len(pts) >= 2:
            arr = (np.array(pts) * 16).astype(np.int32)   # 4-bit sub-pixel precision
            cv2.polylines(self.canvas, [arr], False, self.ink_color(), self.brush(),
                          cv2.LINE_AA, 4)
            if not self.erasing():
                self.has_ink = True

    def lift_pen(self):
        if self.canvas is not None:
            self.ink(self.pen.up())
        else:
            self.pen.up()

    def clear_canvas(self):
        if self.canvas is not None:
            self.canvas[:] = 0
        self.has_ink = False
        self.say("Canvas cleared")

    def save_drawing(self):
        if not self.has_ink:
            self.say("Nothing to save yet")
            return
        name = time.strftime("drawing_%Y%m%d_%H%M%S.png")
        cv2.imwrite(os.path.join(HERE, name), self.canvas)
        self.say(f"Saved {name}")

    def open_settings(self):
        if self.settings_proc and self.settings_proc.poll() is None:
            return
        self.settings_proc = subprocess.Popen([sys.executable, os.path.join(HERE, "settings_ui.py")])
        self.say("Settings opened")

    def reload_if_settings_closed(self):
        if self.settings_proc and self.settings_proc.poll() is not None:
            self.settings_proc = None
            self.cfg = config.load()
            self.say("Settings updated")


def open_camera(index):
    """Media Foundation first (30 fps at 720p on most webcams; DirectShow often
    gives only 10), DirectShow as a fallback."""
    for backend in (cv2.CAP_MSMF, cv2.CAP_DSHOW):
        cap = cv2.VideoCapture(index, backend)
        if not cap.isOpened():
            continue
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_W)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_H)
        cap.set(cv2.CAP_PROP_FPS, 60)
        if cap.read()[0]:
            return cap
        cap.release()
    return cv2.VideoCapture()


class Camera:
    """Reads frames on a background thread so the main loop never waits on the
    driver and always processes the newest frame (no buffered lag)."""

    def __init__(self, index):
        self.cap = open_camera(index)
        self.ok = self.cap.isOpened()
        self.frame, self.seq = None, 0
        self.cond = threading.Condition()
        self.running = self.ok
        self.thread = threading.Thread(target=self._loop, daemon=True)
        if self.ok:
            self.thread.start()

    def _loop(self):
        misses = 0
        while self.running:
            ok, frame = self.cap.read()
            with self.cond:
                if ok:
                    self.frame, self.seq, misses = frame, self.seq + 1, 0
                else:
                    misses += 1
                    self.ok = misses < 100
                self.cond.notify_all()
            if not ok:
                time.sleep(0.01)

    def read(self, last_seq, timeout=0.5):
        """Wait for a frame newer than last_seq; returns (seq, frame)."""
        with self.cond:
            self.cond.wait_for(lambda: self.seq != last_seq or not self.ok, timeout)
            return self.seq, self.frame

    def release(self):
        self.running = False
        if self.thread.is_alive():
            self.thread.join(timeout=1)
        self.cap.release()


def fit_frame(frame):
    """Scale the camera image to 1280 px wide so the HUD layout is consistent."""
    h, w = frame.shape[:2]
    if w != FRAME_W:
        frame = cv2.resize(frame, (FRAME_W, int(h * FRAME_W / w)), interpolation=cv2.INTER_LINEAR)
    return frame


def main():
    actions.enable_dpi_awareness()
    ensure_model()
    cfg = config.load()
    cam = Camera(cfg["camera_index"])
    if not cam.ok:
        sys.exit("Could not open the webcam (try camera_index 1 in config.json).")
    app = App(cfg)
    landmarker = make_landmarker()
    smooth_l, smooth_r = g.LandmarkSmoother(), g.LandmarkSmoother()
    cv2.namedWindow(WINDOW, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(WINDOW, FRAME_W, FRAME_H)
    t0 = last = time.monotonic()
    fps, show_panel, seq, last_ts = 0.0, True, 0, -1
    print("Running. Left hand: 1=APPS 2=MEDIA 3=SLIDES 4=DRAW fist=LOCKED. Q to quit.")
    try:
        while True:
            new_seq, raw = cam.read(seq)
            if not cam.ok:
                sys.exit("The webcam stopped sending frames.")
            if new_seq == seq:           # no new frame yet: keep the window responsive
                if (cv2.waitKey(1) & 0xFF) in (ord("q"), 27):
                    break
                continue
            seq = new_seq
            frame = fit_frame(cv2.flip(raw, 1))  # mirror: movement matches your view
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            now = time.monotonic()
            ts = max(int((now - t0) * 1000), last_ts + 1)   # must strictly increase
            last_ts = ts
            result = landmarker.detect_for_video(image, ts)
            left, right = split_hands(result, app.cfg["swap_hands"])
            left, right = smooth_l(left, now), smooth_r(right, now)

            fps = 0.9 * fps + 0.1 / max(now - last, 1e-3) if fps else 1 / max(now - last, 1e-3)
            last = now
            if left or right:
                app.last_seen = now

            app.reload_if_settings_closed()
            app.update_mode_from_left(left, now)  # fist (0 fingers) = LOCKED
            if app.mode != "LOCKED":
                app.handle_right(right, frame.shape[1], frame.shape[0])

            ui.draw_hud(frame, app, left, right, fps, show_panel)
            cv2.imshow(WINDOW, frame)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
            if cv2.getWindowProperty(WINDOW, cv2.WND_PROP_VISIBLE) < 1:
                break  # window closed with the X button
            if key in KEY_MODES:
                app.set_mode(KEY_MODES[key])
            elif key == ord("c"):
                app.open_settings()
            elif key == ord("h"):
                show_panel = not show_panel
            elif key == ord("x"):
                app.clear_canvas()
            elif key == ord("p"):
                app.save_drawing()
            elif app.mode == "DRAW" and ord("1") <= key < ord("1") + len(ui.PALETTE):
                app.pick_color(key - ord("1"))
    finally:
        landmarker.close()
        cam.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
