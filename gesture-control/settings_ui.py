"""Settings window: choose the 5 apps. Run standalone or via `C` in main.py."""
import tkinter as tk
from tkinter import filedialog, ttk

import actions
import config

BG, CARD, FIELD, HOVER = "#0E1116", "#161B22", "#1F2630", "#2A3340"
FG, MUTED, ACCENT, ACCENT_HOVER = "#E8EAED", "#9AA3AD", "#4DA3FF", "#6DB5FF"
OK, ERR = "#3DDC97", "#FF7A59"


def style_window(root):
    root.configure(bg=BG)
    s = ttk.Style(root)
    s.theme_use("clam")
    s.configure(".", background=BG, foreground=FG, font=("Segoe UI", 10),
                bordercolor=BG, focuscolor=BG)
    s.configure("Card.TFrame", background=CARD)
    s.configure("TLabel", background=BG, foreground=FG)
    s.configure("Card.TLabel", background=CARD, foreground=FG)
    s.configure("CardMuted.TLabel", background=CARD, foreground=MUTED, font=("Segoe UI", 9))
    s.configure("Muted.TLabel", background=BG, foreground=MUTED)
    s.configure("Title.TLabel", background=BG, foreground=FG, font=("Segoe UI Semibold", 20))
    s.configure("Badge.TLabel", background=ACCENT, foreground=BG, anchor="center",
                font=("Segoe UI Semibold", 13), width=3, padding=(0, 6))
    s.configure("TEntry", fieldbackground=FIELD, foreground=FG, insertcolor=FG,
                bordercolor=FIELD, lightcolor=FIELD, darkcolor=FIELD, padding=7)
    s.map("TEntry", bordercolor=[("focus", ACCENT)], lightcolor=[("focus", ACCENT)])
    s.configure("TButton", background=FIELD, foreground=FG, bordercolor=FIELD,
                lightcolor=FIELD, darkcolor=FIELD, padding=(14, 7), relief="flat")
    s.map("TButton", background=[("active", HOVER)], lightcolor=[("active", HOVER)],
          darkcolor=[("active", HOVER)])
    s.configure("Accent.TButton", background=ACCENT, foreground=BG,
                font=("Segoe UI Semibold", 10), bordercolor=ACCENT,
                lightcolor=ACCENT, darkcolor=ACCENT)
    s.map("Accent.TButton", background=[("active", ACCENT_HOVER)],
          lightcolor=[("active", ACCENT_HOVER)], darkcolor=[("active", ACCENT_HOVER)])
    s.configure("TCheckbutton", background=BG, foreground=FG, indicatorbackground=FIELD,
                indicatorforeground=ACCENT, indicatorrelief="flat")
    s.map("TCheckbutton", background=[("active", BG)],
          indicatorbackground=[("selected", FIELD), ("active", HOVER)])


def main():
    actions.enable_dpi_awareness()
    cfg = config.load()
    root = tk.Tk()
    root.title("Gesture Control · Settings")
    root.resizable(False, False)
    style_window(root)

    outer = ttk.Frame(root, padding=(28, 24, 28, 22))
    outer.grid()
    ttk.Label(outer, text="App slots", style="Title.TLabel").grid(sticky="w")
    ttk.Label(outer, style="Muted.TLabel",
              text="In Apps mode, hold up 1–5 fingers on your right hand for a second "
                   "to open that slot.\nA slot can be an .exe, a shortcut, any file, or a URL."
              ).grid(sticky="w", pady=(2, 16))

    status = tk.StringVar()
    status_lbl = ttk.Label(outer, textvariable=status, style="Muted.TLabel")
    names, targets = [], []

    for i in range(config.SLOTS):
        app = cfg["apps"][i]
        n, t = tk.StringVar(value=app["name"]), tk.StringVar(value=app["target"])
        names.append(n)
        targets.append(t)

        card = ttk.Frame(outer, style="Card.TFrame", padding=(14, 10))
        card.grid(sticky="ew", pady=4)
        ttk.Label(card, text=str(i + 1), style="Badge.TLabel", anchor="center",
                  width=3).grid(row=0, column=0, rowspan=2, padx=(0, 14), ipady=4)
        ttk.Label(card, text="Name", style="CardMuted.TLabel").grid(row=0, column=1, sticky="w")
        ttk.Label(card, text="App, file or URL", style="CardMuted.TLabel").grid(
            row=0, column=2, sticky="w", padx=(10, 0))
        ttk.Entry(card, textvariable=n, width=16).grid(row=1, column=1)
        ttk.Entry(card, textvariable=t, width=46).grid(row=1, column=2, padx=(10, 10))

        def browse(t=t, n=n):
            path = filedialog.askopenfilename(
                parent=root, title="Choose an app or file",
                filetypes=[("Apps & shortcuts", "*.exe *.lnk *.bat *.url"), ("All files", "*.*")])
            if path:
                t.set(path)
                if not n.get():
                    n.set(path.replace("\\", "/").rsplit("/", 1)[-1].rsplit(".", 1)[0])

        def test(t=t, n=n, i=i):
            ok, msg = actions.launch(t.get())
            label = n.get() or f"slot {i + 1}"
            status.set(f"✓  Opened {label}" if ok else f"✕  {label}: {msg}")
            status_lbl.configure(foreground=OK if ok else ERR)

        ttk.Button(card, text="Browse…", command=browse).grid(row=1, column=3, padx=(0, 6))
        ttk.Button(card, text="Test", command=test).grid(row=1, column=4)

    swap = tk.BooleanVar(value=cfg["swap_hands"])
    ttk.Checkbutton(outer, text="Swap left and right hands (if they're reversed on your camera)",
                    variable=swap).grid(sticky="w", pady=(14, 0))

    bar = ttk.Frame(outer)
    bar.grid(sticky="ew", pady=(18, 0))
    bar.columnconfigure(0, weight=1)
    status_lbl.grid(in_=bar, row=0, column=0, sticky="w")

    def save(_=None):
        cfg["apps"] = [{"name": n.get().strip(), "target": t.get().strip()}
                       for n, t in zip(names, targets)]
        cfg["swap_hands"] = swap.get()
        config.save(cfg)
        root.destroy()

    ttk.Button(bar, text="Cancel", command=root.destroy).grid(row=0, column=1, padx=(0, 8))
    ttk.Button(bar, text="Save", style="Accent.TButton", command=save).grid(row=0, column=2)
    root.bind("<Escape>", lambda _: root.destroy())
    root.bind("<Control-s>", save)
    root.mainloop()


if __name__ == "__main__":
    main()
