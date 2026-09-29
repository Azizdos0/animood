"""Hand-gesture control: media remote, slide clicker, app launcher, air drawing.

LEFT hand (finger count) picks the mode, RIGHT hand performs the action.
    1 finger = APPS   2 = MEDIA   3 = SLIDES   4 = DRAW   fist = LOCKED
Keyboard: A/M/S/D pick a mode, L locks, C opens app settings, X clears the
drawing, P saves it, Q quits.
"""
import argparse
import os
import time

import actions
import gestures as g
from config import NUM_APPS, load_config

MODE_KEYS = {ord("a"): "APPS", ord("m"): "MEDIA", ord("s"): "SLIDES", ord("d"): "DRAW", ord("l"): "LOCKED"}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--settings", action="store_true", help="only open the app-slot settings window")
    args = parser.parse_args()

    if args.settings:
        from settings_ui import open_settings

        open_settings()
        return

    import cv2
    import mediapipe as mp
    import numpy as np

    cfg = load_config()
    cap = cv2.VideoCapture(cfg["camera_index"])
    if not cap.isOpened():
        raise SystemExit("Could not open the camera. Change camera_index in config.json?")

    hands = mp.solutions.hands.Hands(
        max_num_hands=2, min_detection_confidence=0.7, min_tracking_confidence=0.6
    )
    drawer = mp.solutions.drawing_utils

    mode = "LOCKED"
    mode_hold = g.HoldTracker(0.6)
    app_hold = g.HoldTracker(cfg["hold_seconds"])
    palm_hold = g.HoldTracker(0.7)
    clear_hold = g.HoldTracker(0.8)
    swipe = g.SwipeDetector()
    volume_rate = g.Cooldown(0.25)
    canvas = None
    prev_pt = None
    message, message_until = "", 0.0

    def flash(text, seconds=1.5):
        nonlocal message, message_until
        message, message_until = text, time.time() + seconds

    print(__doc__)
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame = cv2.flip(frame, 1)  # mirror so it behaves like a mirror
        h, w = frame.shape[:2]
        if canvas is None or canvas.shape[:2] != (h, w):
            canvas = np.zeros((h, w, 3), dtype=np.uint8)
        now = time.time()

        result = hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        left = right = None
        if result.multi_hand_landmarks:
            for lms, handed in zip(result.multi_hand_landmarks, result.multi_handedness):
                # The frame is already mirrored, which is what MediaPipe expects,
                # so its label matches the user's real left/right hand.
                label = handed.classification[0].label
                if label == "Left":
                    left = lms.landmark
                else:
                    right = lms.landmark
                drawer.draw_landmarks(frame, lms, mp.solutions.hands.HAND_CONNECTIONS)

        # ---- left hand chooses the mode ----
        if left is not None:
            fired, _ = mode_hold.update(g.count_fingers(left), now)
            if fired is not None:
                mode = "LOCKED" if fired == 0 else g.MODES.get(fired, mode)
        else:
            mode_hold.update(None, now)

        # ---- right hand acts within the mode ----
        progress = 0.0
        if right is None or mode == "LOCKED":
            app_hold.update(None, now)
            palm_hold.update(None, now)
            clear_hold.update(None, now)
            swipe.reset()
            prev_pt = None
        else:
            fingers = g.extended_fingers(right)
            count = len(fingers)
            wrist = right[0]
            swipe_dir = swipe.update(wrist.x, wrist.y, now)

            if mode == "APPS":
                fired, progress = app_hold.update(count if 1 <= count <= NUM_APPS else None, now)
                if fired is not None:
                    slot = cfg["apps"][fired - 1]
                    ok_launch, msg = actions.launch(slot["path"])
                    flash(f"{fired}: {slot['label'] or 'empty'} - {msg}")

            elif mode == "MEDIA":
                if swipe_dir:
                    key = "next" if swipe_dir == "right" else "previous"
                    actions.press(actions.MEDIA_KEYS[key])
                    flash("Next track" if key == "next" else "Previous track")
                direction = g.thumb_direction(right)
                if direction and volume_rate.ready(now):
                    actions.press(actions.MEDIA_KEYS["volume_up" if direction == "up" else "volume_down"])
                    flash(f"Volume {direction}", 0.5)
                still_palm = count == 5 and not swipe.is_moving()
                fired, progress = palm_hold.update("palm" if still_palm else None, now)
                if fired:
                    actions.press(actions.MEDIA_KEYS["play_pause"])
                    flash("Play / pause")

            elif mode == "SLIDES":
                if swipe_dir:
                    key = "next" if swipe_dir == "right" else "previous"
                    actions.press(actions.SLIDE_KEYS[key])
                    flash("Next slide" if key == "next" else "Previous slide")

            elif mode == "DRAW":
                tip = (int(right[8].x * w), int(right[8].y * h))
                if fingers == {"index"} and not g.is_pinch(right):
                    if prev_pt is not None:
                        cv2.line(canvas, prev_pt, tip, (0, 255, 255), 6)
                    prev_pt = tip
                    cv2.circle(frame, tip, 8, (0, 255, 255), -1)
                else:
                    prev_pt = None
                fired, progress = clear_hold.update("clear" if count == 5 else None, now)
                if fired:
                    canvas[:] = 0
                    flash("Canvas cleared")

        # ---- draw the overlay ----
        mask = canvas.any(axis=2)
        frame[mask] = canvas[mask]
        cv2.rectangle(frame, (0, 0), (w, 70), (0, 0, 0), -1)
        cv2.putText(frame, f"MODE: {mode}", (12, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)
        hint = {
            "LOCKED": "Left hand: 1=Apps 2=Media 3=Slides 4=Draw",
            "APPS": "Right hand: hold up 1-5 fingers",
            "MEDIA": "Swipe = track, palm = pause, thumb up/down = volume",
            "SLIDES": "Swipe right = next, swipe left = previous",
            "DRAW": "Index = draw, pinch = lift, hold palm = clear",
        }[mode]
        cv2.putText(frame, hint, (12, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 200), 1)
        if progress > 0:
            cv2.rectangle(frame, (12, h - 30), (12 + int(200 * progress), h - 14), (0, 255, 0), -1)
        if now < message_until:
            cv2.putText(frame, message, (12, h - 45), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
        cv2.imshow("Gesture Control", frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key in MODE_KEYS:
            mode = MODE_KEYS[key]
            flash(f"Mode: {mode}")
        elif key == ord("x"):
            canvas[:] = 0
        elif key == ord("p"):
            os.makedirs("drawings", exist_ok=True)
            path = os.path.join("drawings", time.strftime("drawing_%Y%m%d_%H%M%S.png"))
            cv2.imwrite(path, canvas)
            flash(f"Saved {path}")
        elif key == ord("c"):
            from settings_ui import open_settings

            if open_settings():
                cfg = load_config()
                app_hold = g.HoldTracker(cfg["hold_seconds"])
                flash("Settings saved")

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
