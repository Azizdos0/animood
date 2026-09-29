import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import actions  # noqa: E402
from config import NUM_APPS, load_config, save_config  # noqa: E402


def test_missing_file_gives_defaults(tmp_path):
    cfg = load_config(str(tmp_path / "nope.json"))
    assert len(cfg["apps"]) == NUM_APPS
    assert all(a == {"label": "", "path": ""} for a in cfg["apps"])


def test_round_trip(tmp_path):
    p = str(tmp_path / "c.json")
    cfg = load_config(p)
    cfg["apps"][2] = {"label": "Notes", "path": r"C:\Windows\notepad.exe"}
    save_config(cfg, p)
    assert load_config(p)["apps"][2]["label"] == "Notes"


def test_garbage_is_ignored(tmp_path):
    p = tmp_path / "c.json"
    p.write_text(json.dumps({"apps": "oops", "hold_seconds": 99, "camera_index": "x"}))
    cfg = load_config(str(p))
    assert cfg["hold_seconds"] == 1.0 and cfg["camera_index"] == 0
    p.write_text("{not json")
    assert len(load_config(str(p))["apps"]) == NUM_APPS


def test_extra_apps_are_truncated(tmp_path):
    p = tmp_path / "c.json"
    p.write_text(json.dumps({"apps": [{"label": str(i), "path": "x"} for i in range(9)]}))
    assert len(load_config(str(p))["apps"]) == NUM_APPS


def test_launch_empty_slot():
    ok, msg = actions.launch("")
    assert not ok and "not set" in msg
