# Gesture Control

Control your Windows PC with your hands through a webcam: media remote, slide
clicker, app launcher and air drawing. Built with OpenCV + MediaPipe.

## Setup
```
cd gesture-control
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
python main.py
```
Use Python 3.9-3.12 (MediaPipe does not support newer versions yet).

## How it works
**Left hand picks the mode** (hold the finger count for about 0.6 s):

| Left hand | Mode |
|---|---|
| 1 finger | APPS |
| 2 fingers | MEDIA |
| 3 fingers | SLIDES |
| 4 fingers | DRAW |
| Fist | LOCKED (nothing triggers) |

**Right hand does the action:**

| Mode | Gesture | Action |
|---|---|---|
| APPS | Hold 1-5 fingers up for 1 s | Opens the app in that slot |
| MEDIA | Swipe right / left | Next / previous track |
| MEDIA | Open palm, held still | Play / pause |
| MEDIA | Thumb up / down (other fingers folded) | Volume up / down |
| SLIDES | Swipe right / left | Next / previous slide |
| DRAW | Index finger only | Draw |
| DRAW | Pinch | Lift the pen |
| DRAW | Hold open palm | Clear the canvas |

**Keyboard** (click the camera window first): `A M S D` pick a mode, `L` locks,
`C` opens the app settings, `X` clears the drawing, `P` saves it to `drawings/`, `Q` quits.

## Choosing your 5 apps
Press `C` in the camera window, or run `python main.py --settings`. For each
finger count, pick a program with **Browse...** (an `.exe`, a shortcut, any
file) or type a URL such as `https://youtube.com`. **Test** opens it without
gestures; **Save** stores the choice in `config.json`.

`config.json` also has `camera_index` (try 1 if the wrong camera opens) and
`hold_seconds` (0.3-5, how long to hold a finger count before an app opens).

## Tests
```
pip install pytest
python -m pytest
```
Covers finger counting, swipes, hold timing and config. The camera and window
code has to be tried by hand on a real webcam.

## Tips
- Good front light and a plain background help a lot.
- Keep your hands about an arm's length from the camera, palms facing it.
- If swipes fire too easily or not enough, adjust `SwipeDetector` in `gestures.py`.
