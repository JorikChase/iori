# fractal engine tests

## Unit tests (CPU, no browser)

```bash
node --test fractal-engine/test/
```

## GPU parity, headless

`parity.html` checks the WGSL interpreter against `core/` (forward orbits, inverse steps, duals,
overrides, JIT, shading, the collage); `compile-time.html` times the shader compiles. Both need WebGPU, so they
run in a browser. `run-parity.mjs` runs them from the shell, without the Browser pane:

```bash
node fractal-engine/test/run-parity.mjs              # parity: progress lines, then a per-suite table
node fractal-engine/test/run-parity.mjs --compile    # parity, then compile times
node fractal-engine/test/run-parity.mjs --compile-only
node fractal-engine/test/run-parity.mjs --only collage   # one suite: parity.html?suite=collage (~45 s)
```

Flags: `--rows` prints every row (default: failing rows only), `--json <file>` saves the raw
`window.__parity`, `--timeout <s>` (900) caps the page, `--stall <s>` (240) gives up when no progress
line arrives, `--headed` shows the window. Exit 0 = pass, 1 = a suite failed, 2 = the page never
finished (no WebGPU, error, timeout).

- It serves the repo root on a random localhost port and launches Playwright's full Chromium in new
  headless mode with WebGPU on (Metal on the Mac). The headless shell has no WebGPU.
- Playwright is the one in `tools/audio-test/node_modules` (`npm i` there once). A worktree without
  it uses the main checkout's copy; `PLAYWRIGHT_DIR` points elsewhere.
- One page at a time, one browser: the Mac has frozen under two heavy GPU loads at once. Don't run it
  alongside another GPU-heavy render.
- The collage suite (K2) compiles the collage's march, walk and step shaders in both variants, then
  diffs its program against `core/collage.js` on the cases in `collage-cases.js`: forward rows
  (estimate, shares, piece, seam, colour), keep rows (push's keep rule), step rows (the measured L).
- The page's `ok` is the verdict. The per-suite split repeats the page's thresholds; if parity.html
  changes them, the runner prints a note until `SUITES` in `run-parity.mjs` is updated.

## Touch, headless

`run-touch.mjs` drives the app at phone size (390×844, Playwright's mobile Chromium, WebGPU on) with real
touch events through the DevTools protocol, one check per gesture in DESIGN.md "Touch"; the verdict is
`__fe.input` and `__fe.state`. `--desktop` runs the mouse-and-keys checks at 1280×800 instead (the
desktop behaviour, unchanged).

```bash
node fractal-engine/test/run-touch.mjs               # 33 checks, the overlay toggles included (~3 min)
node fractal-engine/test/run-touch.mjs --shots       # and design/shots/touch-*.jpg
node fractal-engine/test/run-touch.mjs --only graph  # checks whose name holds the word
node fractal-engine/test/run-touch.mjs --desktop
node fractal-engine/test/run-touch.mjs --size 820x1180   # a tablet
```

- A finger lifted while others stay down is a `touchEnd` naming that finger; a `touchMove` without it
  lifts nothing.
- The browser profile is Playwright's own, so nothing reaches iori's lineage or Metasurface layout;
  `__fe.dry` is still set and lifted only for the check that grows the lineage.
- GPU-heavy like parity: run it alone.
