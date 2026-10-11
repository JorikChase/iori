# Handoff — owner decisions D40–D44, M7 closed, performance pass, dense desk

2026-10-10 (evening) · repo `data_moshine/` (local git, no remote) · app folder `moshine/`
Previous handoff: [2026-10-10-m5-m7-timeline-cache-audio.md](2026-10-10-m5-m7-timeline-cache-audio.md) (its invariants
and gotchas all still hold; read its "Invariants" and "Gotchas" sections).

## In one paragraph

The owner answered the open questions (spec §0 D40–D44): a lock does nothing, the Looks cards stay, the UI must be
dense, our own code stays but must be fast, and the app stays public while M7 and M8 are open. This session made locks
inert inside the loop, closed M7 with the export mix (clicks land at 0 ms error after a Bloom Insert), made the 1080p
Mosh Loop 2.5× faster (13.7 → 5.4 ms) without changing a bit, took the mask and stretch costs off the frame path, and
re-laid the desk so the picture, the stack and the timeline use the whole window. Every row passes: 141 node tests,
31 T0 and 10 T1 rows (`ref/bench-dense.json`), fidelity budgets.

## Read in this order

1. This file.
2. The previous handoff (invariants, gotchas, the deploy steps).
3. `study/SPEC.md` §0 D40–D44 and §13 (M7 done, M9 split into 9 and 9b).
4. `HANDOFF.md` M7 step 5 and the R3 lock note for file-level detail.

## What changed, with evidence

| Step | What | Evidence |
|---|---|---|
| D40 locks | Both loop twins take `lock` (keep coverage of the lock masks, `masks.js rasterLock`) and mix the history back to the loop's input under it after the code stage. Lock masks enter `depSig`; include masks still mix after the state. | `tests/r3-masks.test.mjs` (history under a lock equals the source every frame); `sequenceParity` exact with a keyframed lock |
| D44 headers | `serve.py` and the bench send production's headers (no COOP/COEP); `--coi` opts in for the bake. | `ref/bench-noncoi.json`: the whole bench passes non-isolated |
| M7 step 5 | `export.js audioPlan`: the export hears the audible audio clips. One untouched clip passes through; anything else is mixed in 1 s blocks and encoded by our own WebCodecs `AudioEncoder` (AAC/Opus). | T1 `exportMix`, `audioReactive`; `ref/bench-m7.json` |
| Encoder delay | WebCodecs labels the first packet 0 although it starts with 2112 priming samples (Apple AAC), so files played 44 ms late. `encoderDelay()` measures it once (a burst encoded and decoded) and the packets are shifted back; Mediabunny then writes the edit list. | `exportMix`: clicks at 0 ms error before and after the stretch, pass-through too |
| Matcher | Candidate-parallel: one workgroup per block, one lane per candidate with the CPU's own sequential MAD, a (cost, index) minimum that equals the sequential scan, the block and a sub-pel window in workgroup memory sized per block size. 1080p match 12.0 → 3.8 ms, loop 13.7 → 5.4 ms. CPU twin unchanged. | T0 `matchParity` (new cases: block 4/8/32, quarter-pel, temporal: all exact); T4 `stageCost1080` |
| WSOLA | Padded buffer instead of a bounds-checked accessor: identical output, 1.5–2.3× faster. Stretches run in `stretch-worker.js` for playback and export; `mixBlock` takes an async stretcher (inline in node). | T0 `stretchWorker` (worker bytes = inline bytes) |
| Mask raster | Each shape and stroke segment is evaluated only where it reaches, max-combined: 512×288 with a 60-point stroke 110 → ~5 ms, bit-identical to the old raster. Masks resolve only their scalars; coverage is memoised per edit, so opacity animation reuses it. | node test against the old raster (40 random masks); T4 `evalOverhead` (keyframed opacity 17.2 → 5.5 ms/frame) |
| D41 desk | `ui.js densify()`: the timeline is as tall as its rows (≤ 45 %), the stack column takes the letterbox width (330 px .. 50 %), lanes 34 px, header 124 px. With nothing selected, the stack shows the mosh under the playhead. Audio clips show gain. Phone: tools wrap, the dock scrolls. | `study/ux/density/` before/after at 1440, 1920, 1024, 390 |

## Invariants added this session

- **A lock is inert.** Anything new that reads or writes the loop history must keep `lock` applied after it, or mosh
  will build up under a lock again. Stateful clip FX (echo, freeze) still keep state under a lock; only their output
  is masked.
- **The matcher's choice is "the first candidate in list order with the strictly lowest cost".** The GPU gets it by a
  lexicographic (cost, index) minimum. Any new candidate must take the same list position on both twins.
- **Never reorder a MAD sum.** Each candidate's MAD is one sequential sum in CPU order; a pixel-parallel reduction
  would change the vectors on near ties. Parallelise over candidates or blocks, not pixels.
- **Mask caches assume every edit calls `invalidate()`.** Shape signatures are cached per revision. The editor's
  timeline `onChange` does it; a new edit path that bypasses the command bus must call it too.
- **Workgroup memory costs occupancy.** Size shared arrays to the block size (one pipeline per size). A 9 KB array cost
  more than the shared reads saved.

## Gotchas this session

- `bench.mjs --expr` wraps the expression; an IIFE needs `return await (...)` in front or it returns undefined.
- WGSL rejects a constant infinity (`bitcast<f32>(0x7f800000u)`): use `3.0e38` as the sentinel.
- `analyseAudio(video, fps)` wants a rational frame rate (`toRational(v.fps)`); a plain number gives a one-row table
  and silent onsets.
- zsh treats `echo =====` as an equals expansion; use another separator in shell scripts.
- Timing on this Mac is noisy while Jump Desktop streams: `stageCost1080` takes the minimum of 7 trials.

## M8 (2026-10-10/11)

State and how to run it: [`study/m8.md`](../study/m8.md). `tools/xbench.mjs` drives Safari itself (safaridriver),
Zen = Gecko 157 (WebDriver BiDi, `--headed`) and Playwright WebKit. **Chrome, Safari 26.6.2, Zen and WebKit all pass
41/41 with 0 console errors**; exports (MP4/AAC, WebM/Opus, pass-through) are in sync at 0 ms in each. Fixes on the
way: exact integer luma, WebKit's AAC descriptor, Opus never shifted, Firefox's VideoFrame copy. Deployed (iori
`8ff85d6`). Left in M8: an iPhone; cross-engine identity of noise/smooth field ops, the M3 effects and flow.

## Open threads, by value

1. **M8 on the live site** (D43): Safari 26 and Firefox on macOS, then an iPhone for the governor caps. Check the
   encoder delay there (Opus pre-skip, Safari's AAC encoder).
2. **More speed (D42):** the cache I/O worker (writes still on the main thread), the probe's tier caps now that the
   loop is 2.5× faster (re-run the probe on a few devices), `evalOverhead` static-mask residue (~1.4 ms per frame with
   20 painted masks).
3. **FX contraction fixes** (echo, rgbsplit, other M3 kernels): `sequenceParity` `fxMix` is still "close".
4. **Masks:** tracking and on-canvas handles.
5. **R5** when `moshine/icon.svg` arrives, then **M9b** (bake, v2 library, docs; COOP/COEP then).
6. Small: AAC tail padding (27 ms of silence after the video; the edit list could trim it), the tablet letterbox (the
   stack floats there), and the empty bottom of a tall stack pane at full HD (smaller now with the 480 px cap).

## Owner answers after this session

- The stack column is capped at 480 px (it took up to half the width at full HD).
- Include masks stay as they are: only locks are inert inside the loop.

## Deploy

**Live at https://iori.me/moshine/ since 2026-10-10 20:28** (iori commit `7b997ed`, a copy of data_moshine `68b5ae9`).
Same steps as the previous handoff ("Deployed"); `server_setup.sh` ran, Caddy validated and restarted. Checked live:
`stretch-worker.js` is served as JavaScript, the new matcher and `densify` are in the served files, the demo renders
the dense desk with no console errors. The iori tree had another track's uncommitted work (`fractals.html`,
`audio/build.py`); it was left out of the commit.
