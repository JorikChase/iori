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

## The paper, headless

`run-paper.mjs` opens `paper.html` (the engine's documentation, live figures in iframes) and scrolls it
figure by figure: each must start in view with its engine ready, no error and no NaN in its drawings;
never more than two run at once; none once the references are in view. Then a tap enters a figure, a
touch hold edits it, a tap outside covers it; the notation figure draws a typed formula; nothing reaches
localStorage or a figure's URL.

```bash
node fractal-engine/test/run-paper.mjs            # desktop 1280×800 (~2 min)
node fractal-engine/test/run-paper.mjs --phone    # 390×844, mobile Chromium with touch
node fractal-engine/test/run-paper.mjs --shots    # and design/shots/paper-*.jpg
```

- GPU load: up to two engines; run it alone, as the other rigs.

## Performance, headless

`run-bench.mjs` times fixed scenes at a fixed size (1440×900): the Mandelbox cave, the bulb, Menger, a
KIFS, a driven bulb, a driven Mandelbox, a chimera, a three-piece collage, a bulb ∪ Mandelbox collage
(pull), push on the chimera and on the Mandelbox, and the loop. Per
pull scene: the march pass's GPU time from timestamp queries (still and moving frames), the wall time to
a converged still, and the JIT compile times. The guard renders every pull scene with the same seeds as
a reference commit and fails below PSNR 40 dB or SSIM 0.99 (DESIGN.md "Performance").

```bash
node fractal-engine/test/run-bench.mjs                    # every scene, guarded (~3 min of GPU)
node fractal-engine/test/run-bench.mjs --only chimera     # one scene: a short burst
node fractal-engine/test/run-bench.mjs --no-guard
node fractal-engine/test/run-bench.mjs --ref <commit> --retime-ref   # A/B against a commit in one run
```

- The reference defaults to the commit "fractal engine bench: the rig" (the first with the hooks it
  needs: `__fe.view`, `__fe.engines`, `__fe.quiet`, the renderer's `setTiming`/`marchMs`/`readAccum`).
  Its `fractal-engine/` is extracted into `fractal-engine/bench-ref/<hash>/` (git-ignored, outside test/ so `node --test` never finds its copies) and its images and
  timings are cached there; this tree's land in `fractal-engine/bench-ref/current/`.
- It stops the app's live loop and submits every frame itself, one at a time.
- GPU-heavy: run it alone, as the other rigs. The slowest scenes take 16 samples, not 64.
