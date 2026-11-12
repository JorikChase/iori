# Iris automaton — handoff (2026-11-12)

Branch `claude/iris-automaton` (worktree `.claude/worktrees/iris-automaton`), based on `claude/iris-flydown-e6eec4`
ff01054. Nothing pushed, merged or deployed; no engine file and nothing of paper 0.4 touched.

## What exists
- `papers/iris-automaton/automaton.js` — the generic automaton: stages L0…LK (pictures), per-stage rules (schedule,
  gate, source, anisotropic 8-neighbour spread, ember, deposit), `step / run / depositsAt / compose`, `errorTo`.
  No DOM, no engine imports: runs in Node and the browser.
- `papers/iris-automaton/iris.js` — the iris stages (page, strands, stroma, crypts = graphite drawn from the flat
  render through the anatomy; pigment, relief, final = three engine renders) and the six rules (numbers in the paper's
  table).
- `papers/iris-automaton/data/<ref>/` — per eye 26, 09, 35, 25: `flat/relief/final.png` (384² crops), `fields.png`
  (θ, crest, crypt), `region.png` (0 page, 255 pupil, 1 + 253ρ iris), `sheet.json`; `data/convergence.json`. ~3.3 MB.
- `papers/iris-automaton/figures.js`, `paper.css`, `img/` — the paper's live and rendered figures.
- `drawing-an-iris.html` — the hidden paper draft, **not registered** in pages.meta.json (head has a provisional
  noindex SEO block). Chapters: pipeline, the automaton, proofs (bounded end, exact end, locality, generality),
  measurements, related work and limits.
- `papers/iris-automaton/PIPELINE.md` — the research note: every pass from the eye file to the pixel.
- `tools/iris-automaton/` — `serve.py 8791` (capture server), `prep.py` (crops + fields; reads the eye file through the
  read-only `study/flydown/rig.py`), `run.mjs` (convergence, spans, what fired, causality check → `out/<ref>.json`),
  `frames.mjs`, `png.mjs`, `capture.js` (the page-side grab helpers). `captures/`, `check/`, `out/*.png` are gitignored.

## Measured (384², seed 7)
All four eyes: final error 0 / 0 levels (mean / max, on the eye), T_end 763–778 steps (bound 2257), 0 causality
violations, ember 0.36–0.54 % of cell-stages, ~5 ms per step in Node. Seeds 3/11 and speed ×2 also end at 0. Browser
decoding matches Node exactly (fields once lost bits to canvas premultiplied alpha → region moved to its own PNG).

## Redo the data
1. `/usr/bin/python3 tools/iris-automaton/serve.py 8791 &`; open
   `http://localhost:8791/iris-engine/index.html?ui=31&flydown=1&start=off` (viewport 1200² → canvas 1800).
2. Paste `tools/iris-automaton/capture.js` into that page, then `await __eye('26')` etc., one eye at a time.
3. `/usr/bin/python3 tools/iris-automaton/prep.py 26 09 35 25 --stages flat,relief,final`
4. `node tools/iris-automaton/run.mjs 26 09 35 25`, then rebuild `data/convergence.json` from `out/*.json`.

## Open
- **Decision for iori:** own number (0.5, `drawing-an-iris.html`) or a chapter of 0.4. Then register (hidden),
  `papers/series.py`, `site.py all`, and put the real SEO block in.
- The hidden Browser pane gives no IntersectionObserver / rAF ticks; the figures were verified by starting them by hand
  (`figures.js` exports). Not yet seen running in a visible pane or on a phone.
- Other poses: read the anatomy through the engine's debug-14 (u, v) map instead of the start-view similarity.
- GPU port (one ping-pong pass per stage) if the engine adopts it; the print could take the strand stage's firing
  times as its arrival field — offered to the fly-down session, its call.
- Eyes 35 and 25 have an empty last stage at 1800 px (no fly-down at that footprint); a larger canvas would give them one.
