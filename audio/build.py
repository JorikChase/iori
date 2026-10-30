#!/usr/bin/env python3
"""Stamp the Audio Tools service worker.

Writes sw.js from sw.src.js with VERSION = a hash of every file the app ships
and FILES = the precache list. Run after any change under audio/:

    python3 audio/build.py

`site.py heads` rewrites index.html's <head>, so run this after `site.py all`
(the deploy order in AGENTS.md does both in sequence).
"""
import hashlib, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
# app files beside the shell, precached when present (worklet modules, the wheel component)
OPTIONAL = ["worklet-capture.js", "worklet-player.js", "wheel.js"]
FILES = ["./", "index.html", "manifest.json", "shared.js"] + [f for f in OPTIONAL if os.path.exists(os.path.join(HERE, f))] + sorted(
    "t/" + f for f in os.listdir(os.path.join(HERE, "t")) if f.endswith(".html"))
ICONS = ["../icon/android/launchericon-192x192.png?v=2026-09-27",
         "../icon/android/launchericon-512x512.png?v=2026-09-27"]

def main():
    h = hashlib.sha256()
    for f in FILES:
        if f == "./":
            continue
        with open(os.path.join(HERE, f), "rb") as fh:
            h.update(f.encode()); h.update(fh.read())
    src = open(os.path.join(HERE, "sw.src.js"), encoding="utf-8").read()
    version = h.hexdigest()[:12]
    out = src.replace("'__VERSION__'", json.dumps(version)).replace("__FILES__", json.dumps(FILES + ICONS))
    with open(os.path.join(HERE, "sw.js"), "w", encoding="utf-8") as fh:
        fh.write(out)
    print(f"[audio] sw.js version {version}, {len(FILES)} files precached")

if __name__ == "__main__":
    main()
