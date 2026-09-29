# Hand-Gesture Computer Control

Control your Windows PC with a webcam: media remote, presentation clicker, app launcher and air drawing.
Built with OpenCV, MediaPipe Hand Landmarker, PyAutoGUI and Tkinter.

## Run

```
pip install -r requirements.txt
python main.py
```

First run downloads the ~8 MB hand model (`hand_landmarker.task`).

## Two hands

**Left hand picks the mode** (finger count): 1 = APPS, 2 = MEDIA, 3 = SLIDES, 4 = DRAW, 5 = MOUSE,
fist (held 1 s) = LOCKED. Show a count once to open that mode (it stays after you lower your hand);
show the same count again to lock.
**Right hand acts:**

| Mode | Right-hand gesture |
|------|--------------------|
| APPS | hold 1-5 fingers ~1 s to open that slot |
| MEDIA | swipe right/left = next/previous track, still open palm = play/pause, thumb up/down = volume |
| SLIDES | swipe right = next, left = previous |
| DRAW | index finger draws, touch a colour swatch (or press 1-7) to change colour / eraser, pinch lifts the pen, held open palm clears |
| MOUSE | point = move cursor, pinch + release = click, pinch + move = drag, pinch + hold still = right click, two fingers up/down = scroll |

Keys: `A M S D O` set a mode, `L` lock, `C` settings, `H` hide the side panel, `X` clear, `P` save drawing PNG, `Q`/`Esc` quit.

## Interface
The camera window has a HUD (`ui.py`): a mode bar with the active mode highlighted, live hand skeletons tagged
Left/Right with finger counts, a side card listing the gestures for the current mode (or your app slots),
a progress ring around your palm while a hold gesture charges, and toast messages for every action.
Text is rendered with Segoe UI through Pillow and cached, so the HUD costs about 4-10 ms per frame.

## Choosing your 5 apps
Press `C` (or run `python settings_ui.py`). Each slot takes an exe, shortcut, file or URL; **Test** opens it.
Saved to `config.json` (gitignored).

## Tuning
Thresholds are at the top of `gestures.py` (`SWIPE_DISTANCE`, `PINCH_RATIO`, ...) and the `HOLD_*` constants in `main.py`.
If left/right are reversed, tick "Swap hands" in settings.

## Tests
`python -m pytest` covers the pure logic (finger counting, thumb direction, pinch, holds, swipes, smoothing, config).
