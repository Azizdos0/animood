"""Small settings window: choose which app each finger count (1-5) opens."""
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

import actions
from config import NUM_APPS, load_config, save_config, CONFIG_PATH


def open_settings(config_path=CONFIG_PATH):
    """Blocks until the window closes. Returns True if the user saved."""
    cfg = load_config(config_path)
    saved = {"value": False}

    root = tk.Tk()
    root.title("Gesture Control - App Slots")
    root.resizable(False, False)
    frame = ttk.Frame(root, padding=12)
    frame.grid()

    ttk.Label(
        frame,
        text="Hold up 1-5 fingers (right hand, APPS mode) to open the app in that slot.",
    ).grid(row=0, column=0, columnspan=5, pady=(0, 8), sticky="w")
    for col, head in enumerate(("Fingers", "Name", "App / file / URL")):
        ttk.Label(frame, text=head, font=("", 9, "bold")).grid(row=1, column=col, sticky="w")

    names, paths = [], []
    for i in range(NUM_APPS):
        name_var = tk.StringVar(value=cfg["apps"][i]["label"])
        path_var = tk.StringVar(value=cfg["apps"][i]["path"])
        names.append(name_var)
        paths.append(path_var)
        r = i + 2
        ttk.Label(frame, text=str(i + 1)).grid(row=r, column=0, padx=(0, 8), pady=3)
        ttk.Entry(frame, textvariable=name_var, width=16).grid(row=r, column=1, padx=4)
        ttk.Entry(frame, textvariable=path_var, width=48).grid(row=r, column=2, padx=4)

        def browse(pv=path_var, nv=name_var):
            chosen = filedialog.askopenfilename(
                title="Choose an app or file",
                filetypes=[("Apps & shortcuts", "*.exe *.lnk *.bat"), ("All files", "*.*")],
            )
            if chosen:
                pv.set(chosen)
                if not nv.get().strip():
                    nv.set(chosen.replace("\\", "/").rsplit("/", 1)[-1].rsplit(".", 1)[0])

        def test(pv=path_var):
            ok, msg = actions.launch(pv.get())
            if not ok:
                messagebox.showwarning("Could not open", msg, parent=root)

        ttk.Button(frame, text="Browse...", command=browse).grid(row=r, column=3, padx=2)
        ttk.Button(frame, text="Test", command=test).grid(row=r, column=4, padx=2)

    def save():
        cfg["apps"] = [
            {"label": names[i].get().strip(), "path": paths[i].get().strip()}
            for i in range(NUM_APPS)
        ]
        save_config(cfg, config_path)
        saved["value"] = True
        root.destroy()

    buttons = ttk.Frame(frame)
    buttons.grid(row=NUM_APPS + 2, column=0, columnspan=5, pady=(10, 0), sticky="e")
    ttk.Button(buttons, text="Cancel", command=root.destroy).grid(row=0, column=0, padx=4)
    ttk.Button(buttons, text="Save", command=save).grid(row=0, column=1)

    root.mainloop()
    return saved["value"]
