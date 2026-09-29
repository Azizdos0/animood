"""Loads/saves config.json (the 5 app slots and a few options)."""
import json
import os

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")

DEFAULTS = {
    "apps": [
        {"name": "Browser", "target": "https://www.google.com"},
        {"name": "Notepad", "target": "notepad.exe"},
        {"name": "Calculator", "target": "calc.exe"},
        {"name": "", "target": ""},
        {"name": "", "target": ""},
    ],
    "swap_hands": False,   # set true if left/right are reversed on your camera
    "camera_index": 0,
}
SLOTS = 5


def load(path=CONFIG_PATH):
    cfg = json.loads(json.dumps(DEFAULTS))
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return cfg
    if isinstance(data, dict):
        for key in ("swap_hands", "camera_index"):
            if key in data:
                cfg[key] = data[key]
        apps = data.get("apps")
        if isinstance(apps, list):
            for i, app in enumerate(apps[:SLOTS]):
                if isinstance(app, dict):
                    cfg["apps"][i] = {"name": str(app.get("name", "")),
                                      "target": str(app.get("target", ""))}
    return cfg


def save(cfg, path=CONFIG_PATH):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
