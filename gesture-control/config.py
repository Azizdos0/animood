"""Load and save the user's settings (the 5 finger-count apps etc.)."""
import json
import os
import tempfile

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
NUM_APPS = 5


def default_config():
    return {
        "camera_index": 0,
        "hold_seconds": 1.0,
        "apps": [{"label": "", "path": ""} for _ in range(NUM_APPS)],
    }


def _clean_app(entry):
    if not isinstance(entry, dict):
        return {"label": "", "path": ""}
    return {
        "label": str(entry.get("label", "")).strip(),
        "path": str(entry.get("path", "")).strip(),
    }


def load_config(path=CONFIG_PATH):
    """Read config.json, falling back to defaults for anything missing/broken."""
    cfg = default_config()
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return cfg
    if not isinstance(data, dict):
        return cfg
    if isinstance(data.get("camera_index"), int):
        cfg["camera_index"] = data["camera_index"]
    hold = data.get("hold_seconds")
    if isinstance(hold, (int, float)) and 0.3 <= hold <= 5:
        cfg["hold_seconds"] = float(hold)
    apps = data.get("apps")
    if isinstance(apps, list):
        for i, entry in enumerate(apps[:NUM_APPS]):
            cfg["apps"][i] = _clean_app(entry)
    return cfg


def save_config(cfg, path=CONFIG_PATH):
    """Write atomically so a crash can't leave a half-written file."""
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path) or ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise
