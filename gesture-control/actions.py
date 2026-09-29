"""Things the gestures actually do: launch apps and press media/slide keys."""
import os
import subprocess
import sys
import webbrowser


def launch(path):
    """Open an app, file, shortcut or URL. Returns (ok, message)."""
    path = (path or "").strip()
    if not path:
        return False, "slot not set (press C)"
    try:
        if path.lower().startswith(("http://", "https://")):
            webbrowser.open(path)
        else:
            path = os.path.expandvars(os.path.expanduser(path))
            if sys.platform.startswith("win"):
                os.startfile(path)  # noqa: S606 - user-chosen path, by design
            elif sys.platform == "darwin":
                subprocess.Popen(["open", path])
            else:
                subprocess.Popen(["xdg-open", path])
        return True, "opened"
    except Exception as exc:  # bad path, no permission, ...
        return False, f"failed: {exc}"


def press(key):
    """Press a keyboard key (PyAutoGUI names: 'playpause', 'right', ...)."""
    import pyautogui  # imported lazily so tests/settings don't need it

    pyautogui.press(key)


MEDIA_KEYS = {
    "play_pause": "playpause",
    "next": "nexttrack",
    "previous": "prevtrack",
    "volume_up": "volumeup",
    "volume_down": "volumedown",
}
SLIDE_KEYS = {"next": "right", "previous": "left"}
