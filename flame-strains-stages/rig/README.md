# flame-strains capture rig

Runs `flame-strains.html` under a scripted clock and saves frames + probe
logs, so a change can be judged on a contact sheet instead of by eye.

Why it exists: a hidden or occluded browser tab throttles
`requestAnimationFrame` to ~1 fps and timers to 1/s (1/min after five
minutes), which makes the engine look broken in any automation. `rig.js`
replaces the frame clock with a MessageChannel loop, which Chrome does not
throttle, and does all waiting from inside that loop.

## Use

1. Serve the project dir (the repo already has `.claude/launch.json` →
   `python3 -m http.server 8777`).
2. Serve this folder with CORS and a POST endpoint for frames:
   `python3 upload.py` (port 8790; frames land in `shots/`).
3. Open `http://localhost:8777/flame-strains.html?...` and, in the console
   (or through any browser automation), run:
   `eval(await (await fetch('http://localhost:8790/rig.js')).text())`
   then take one screenshot / focus the tab to kick the first frame.
4. Drive it:
   - `await __wait(ms)` — waits inside the sim loop
   - `await __cap('name.jpg')` — captures the WebGL canvas inside the frame
     callback (works without preserveDrawingBuffer) and POSTs it
   - `__snap()` — live probe: coverage, target, gains, heat, smoke, exposure
   - `__tr()` — the 2 s trace as rows
   - `__key('d')`, `__preset('wildfire')`, `__setSlider('fuel', 0.1)`

Engine hooks it relies on: `window.__P`, `__HEAT`, `__GOV`, `__LUM`.
