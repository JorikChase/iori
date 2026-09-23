# 07 — The automata think tank: many small dishes, run in parallel, headless

iori, 2026-09-22: *"we need to do an automata think tank and have it ready for testing small
interactions in parallel — we need this for the future schemes we will be engineering when on mvp"*.
The think tank has four first uses: seed replicates, the whole catalogue, competitions, and parameter
sweeps. Tests run headless (decided).

## 1. What the time is actually spent on (measured before designing)

The Tero fixture dish (draft, 1024², adaptive Physarum, 3 000 steps after the network had grown):

| | time | share |
|---|---|---|
| GPU stepping — 0.52 ms/step, of which the kernels are 0.52 ms | 1.65 s | 71 % |
| graph updates — CPU worker: extract ~60 ms + adapt ~8 ms, every 300 steps | 0.68 s | 29 % |

A single cell pass at 2048² is 98 % of a step (`T4.kernelCost`). Three consequences decide the design:

1. **The GPU is saturated by a full-size dish.** Running several full-size dishes at once does not
   make any of them faster: GPU work is cells × steps. The speed-up comes from **fewer cells**, which
   means small dishes.
2. **The CPU graph time is free to overlap.** While one dish's worker extracts its graph, other dishes
   can step. That hides up to 29 % on adaptive runs.
3. **"Sped-up time" is not a free knob.** There is no rendering in tests, and the step is at the
   explicit-diffusion stability limit (dn ≤ 0.16). Faster means less work per step, fewer submits, and
   hidden waits — never a larger dt.

The hidden in-app pane throttled timers (the scorecard ran ~4× slower). Headless Chrome removes that.

## 2. Phases

| phase | what | exact? | status |
|---|---|---|---|
| **K1** headless runner | `node petri/tools/bench.mjs`. Uses the installed Chrome headless with WebGPU on Metal, no downloads. Drives it over the DevTools protocol, starts its own serve.py, and passes `?bench` so there is no render loop. | same numbers as in-app (fixture summary, replay hash, DLA D identical) | **done**: full scorecard 318 s against ~15 min in the hidden pane |
| **K2** micro-dish | `createEngine({dishMm, cellMm, device})`: a dish of any size at a chosen cell size, sharing a GPU device. Full-size tiers are unchanged. | `T0.microDish`: replay, containment, interleaved = solo | **done** |
| **K3** tank scheduler | `tank.js` + `tank-suites.js`: a spec goes in and a results table comes out. Dishes step round-robin on one device, and graph updates overlap the other dishes' stepping. `bench.mjs --tank <suite>` | exact by construction (own engine per dish) | **done** |
| **K4** batched submits | Up to 32 steps per command buffer from a uniform ring. Batches stop before pending ops and graph updates. | `T0.batchExact`: batched = one submit per step, same hashes as v7 | **done**: catalogue 94 organisms × 3000 steps went 8.6 → 4.2 s, which is now the GPU limit |
| **K5** atlas | Many dishes in one dispatch. | — | **dropped**: its condition was that per-dispatch overhead dominates. After K4 the small dishes are GPU-bound (~15 µs of kernel per 192² step), so an atlas would do the same GPU work. |

Measured along the way: with one submit per step, running dishes in parallel barely helped
(catalogue 9.6 s one dish at a time against 8.6 s with 8). The ~30 µs cost of each submit, serialized
on the CPU, was the cost, not the GPU. That is what made K4 the lever and K5 unnecessary.

Each phase landed with its own test: `T0.microDish` (a dish interleaved on a shared device hashes like the
same dish alone) and `T0.batchExact` (batched stepping = one submit per step).

## 3. The experiment spec (K3)

Declarative, so a scheme after the MVP is data rather than code:

```js
// tank-suites.js — a suite is a function returning a spec
competitions: () => ({
  name: 'competitions', dish: { dishMm: 8, nutrient: 0.8, agar: 0.5 },   // micro-dish + medium
  steps: 4000, sample: 4000,                                             // run length, cadence
  vary: { pair: [[a, b], ...] },                                         // cartesian product
  seed: (v) => 23, medium: (v) => ({}),                                  // per-variant Dish ID parts
  ops: (v) => [inoculate a at (-2.5, 0), inoculate b at (2.5, 0)],       // mm
  measure: ['census'],                                                   // MEASURES registry: census, shape, tero, hash
  parallel: 32, summarise: (rows) => ...,
})
```

The runner expands `vary` into dishes, runs them in waves that fit the GPU memory budget, and writes
`petri/ref/tank-<name>.json`: one row per dish with its Dish ID, so every row replays alone.

### The four first suites

- **Seed replicates**: one organism and layout, n seeds. The Tero fixture at n = 21 (Tero's own n)
  instead of 3.
- **Whole catalogue**: all 94 organisms, each alone in a small dish, with growth, fill, front and
  morphotype recorded against the last sealed run. A real regression net, replacing the smoke test.
- **Competitions**: pairs (or groups) inoculated at fixed separations. Outcome: who owns the dish at
  the end, whether they coexist, and sector counts. All 94 × 93 pairs is too many, so the suite runs
  within-category pairs plus a sampled cross-category set.
- **Parameter sweeps**: one organism over a grid, e.g. nutrient × agar for the morphology diagram, or
  any `KPARAMS` pair.

## 4. Which tests may shrink (the validity rule)

A small dish is only a faster version of a test if the test does not measure scale:

- **Size-free:** determinism, conservation, containment, bare stays bare, catalogue liveness,
  competition outcome, and replicate spread. These go to micro-dishes directly.
- **Scale-dependent:**
  - DLA/box dimension, which needs about two decades of size;
  - the Tero fixture, whose 36 sources sit at a fixed density and 7.5 mm spacing;
  - resolution invariance.
  A smaller dish changes the answer, so these stay full-size or shrink only as far as a **shrink
  check** allows: run the metric at full size and at the candidate size, and adopt the small size only
  if the metric agrees within the row's own tolerance. The check is recorded like any other result.
  Nothing moves to a micro-dish on the argument that it is "probably fine".

## 5. Open questions

- GPU memory: a 256² micro-dish is ~2 MB of cell and substrate buffers plus its agent pool. The agent
  pool dominates, so K2 scales agents with the dish area. Budget about 64 dishes per wave to start;
  measure.
- Worker pool determinism: each dish's graph update still gates that dish's stepping at its fixed due
  step (the existing contract), so pool scheduling can reorder dishes but never results.

## 6. First results

- **Catalogue** (6 mm dishes, 3000 steps, 4.2 s for all 94): 88 alive. Six rules die out: seeds,
  day-night, diamoeba, anneal, brian-s-brain, transers. The full-dish smoke test keeps them alive
  (different inoculum and extent), so this is a protocol question for the suite, not an engine fault.
  Open.
- **Tero replicates, n = 21** (Tero's own n; full 45 mm dishes, 36 000 steps, 444 s, 6 at a time).
  Rows 2010–2012 reproduce the scorecard's three organisms exactly. Summary:

  | | mean ± SD | Tero Physarum (n = 21) |
  |---|---|---|
  | TL/MST | 1.69 ± 0.12 | 1.75 ± 0.30 |
  | MD/MST | 0.74 ± 0.07 (0.59–0.82) | 0.85 ± 0.04 |
  | FT | 0.92 ± 0.05 | 0.86 ± 0.04 |
  | coverage, worst organism | 75 % (seed 2020) | — |

  **The scorecard's n = 3 pass does not survive n = 21.** Under the same rule, MD's mean is just under
  the 0.75 band edge and one organism reaches 75 % < 80 %. Seeds 2010–2012 happen to sit in the good
  half. The honest reading: the fixture passes on length and fault tolerance, sits at the edge on path
  distance, and is not yet reliable on coverage. **Adopted 2026-09-23 (iori agreed):** the scored protocol is n = 21 through the tank — the stricter
  one, and Tero's own — so `T2.teroFixture` is red until path distance and coverage improve. The row
  costs ~7.5 min, which takes a full scorecard to ~13 min.

## 7. What the tank found first (2026-09-23)

**1. Coverage never stalled — the network flickers.** Across the 21 organisms every one peaks at
86–100 % coverage and then swings ±0.1 between samples; the scored final sample is a draw from that
swing. Real veins do not blink, so the target was the stability of the conducting network.

**2. Calibration on held-out organisms (seeds 3000–3004, never the scored 21).** A sweep of 8 settings
× 5 organisms: lowering the flux threshold `Qh` 0.5 → 0.3 with `betaD` 8 keeps weak tubes alive between
updates — coverage 0.82 → 0.91, swing 0.049 → 0.040. Criterion written before the run (coverage +0.03,
spread no worse, TL in band), plus one condition added after reading the table — no MD regression —
which is stricter, not looser. Out of sample on the 21: coverage min 0.75 → 0.833, but MD 0.739 →
0.637. Better organism, worse agreement on path distance.

**3. The path-distance deficit was the fixture's layout.** Our networks were as short as Tero's yet
gave shorter paths, which a layout makes possible: evenly spaced sources make the MST's own paths
roundabout and depress MD/MST for *any* network. Measured on the same model, six organisms each:

| layout | coverage | TL/MST | MD/MST | FT |
|---|---|---|---|---|
| even (`fixture36`) | 0.92 | 1.74 | 0.665 | 0.92 |
| clustered | 0.94 | 1.57 | 0.784 | 0.859 |
| Tero's Physarum | — | 1.75 ± 0.30 | 0.85 ± 0.04 | 0.86 ± 0.04 |

**4. The scored layout is now `fixtureTero`** — 36 clustered sources, chosen by a criterion that uses
only PUBLISHED layout statistics and no result of this engine: Tero's Delaunay graph costs TL/MST ≈
4.6 on his geometry; the clustered layout gives 4.50 and the even one 3.32, so the even layout was
demonstrably not his geometry (his sources are cities around Tokyo Bay). `fixture36` stays for the
history that versions up to v9 scored.

**Scored, n = 21, bands untouched:** coverage min 0.861, TL/MST 1.654 ± 0.127, MD/MST 0.785 ± 0.018,
FT 0.884 ± 0.041 — all four gates pass, and each metric sits near Tero's own value rather than merely
inside a band. MD remains the weakest (0.785 against 0.85).

**Reversible and worth a second opinion:** the row failed on MD *before* the layout was corrected, so
the correction is what turned it green. It rests on the Delaunay argument alone; if that argument does
not convince, revert to `fixture36` (sealed in v9) and the row goes red on MD again. Digitising Tero's
actual 36 city positions from the paper figure would settle it for good.

## 8. Tero's own geometry, digitised (2026-09-23)

iori asked for the paper, so the layout question is settled with his data instead of an argument. The
author PDF was fetched to the gitignored `ref-data/tero-2010/`; its figures are embedded CMYK JPEGs,
pulled out with a pure-Python reader (no poppler on this machine, and `sips` only rasterises page 1).
Fig. 1's t = 0 frame shows the plasmodium at Tokyo and 35 oat flakes on the Kanto map. Eroding the
panel drops the 1-px coastline and leaves the blobs; intensity-weighted centroids gave **36 blobs, as
the paper states**. Tokyo is the origin, y up, scaled isotropically to the same 34 mm extent the
synthetic fixtures used, so only the layout's SHAPE changed → `fixture.js TERO_CITIES` /
`fixtureTeroReal()`.

The digitisation checks out against a published, scale-free number that involves nothing of this
engine: the Delaunay graph over these points costs **TL/MST 4.82** against the paper's ~4.6 — where the
old even fixture gave 3.32 and last round's synthetic clustered stand-in gave 4.50.

**Scored on his geometry, n = 21, bands untouched:**

| | petri | Tero's Physarum (n = 21) |
|---|---|---|
| TL/MST | 1.799 ± 0.255 | 1.75 ± 0.30 |
| MD/MST | 0.835 ± 0.040 | 0.85 ± 0.04 |
| FT | 0.854 ± 0.050 | 0.86 ± 0.04 |
| coverage, worst organism | 0.861 | — |

Every metric now matches his mean AND his spread, on his layout, at his replicate count. This replaces
the layout argument of §7 with the thing itself; `fixtureTero` (synthetic) and `fixture36` (even) stay
for the history that v10 and v9 scored.
