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
