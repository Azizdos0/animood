"""OS-level actions: key presses and launching apps."""
import os

import pyautogui

pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0


def enable_dpi_awareness():
    """Render crisp windows on high-DPI screens instead of blurry upscaling."""
    try:
        import ctypes
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except (AttributeError, OSError):
        pass


def press(key):
    pyautogui.press(key)


def screen_size():
    return tuple(pyautogui.size())


def mouse(events):
    """Apply MouseLogic events to the real cursor."""
    for e in events:
        kind = e[0]
        if kind == "move":
            pyautogui.moveTo(e[1], e[2])
        elif kind == "click":
            pyautogui.click()
        elif kind == "down":
            pyautogui.mouseDown()
        elif kind == "up":
            pyautogui.mouseUp()
        elif kind == "right_click":
            pyautogui.rightClick()
        elif kind == "scroll":
            pyautogui.scroll(e[1])


def launch(target):
    """Open an exe, shortcut, file or URL. Returns (ok, message)."""
    target = (target or "").strip().strip('"')
    if not target:
        return False, "empty slot"
    try:
        os.startfile(target)  # ShellExecute: exe, lnk, file, URL, or PATH name like calc.exe
        return True, "opened"
    except OSError as e:
        return False, str(e)


ACTIONS = {
    "next_track": lambda: press("nexttrack"),
    "prev_track": lambda: press("prevtrack"),
    "play_pause": lambda: press("playpause"),
    "volume_up": lambda: press("volumeup"),
    "volume_down": lambda: press("volumedown"),
    "slide_next": lambda: press("right"),
    "slide_prev": lambda: press("left"),
}
