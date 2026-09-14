# versions/ — the engine's version archive (spec §22)

One directory per engine version: the **source that produced the numbers**, the **numbers**, and the
**fitted IDs**. The point is to be able to answer, months later, *which change moved which statistic on
which eye* — and to reload the exact engine that did it.

```
versions/
  index.json            registry: id, date, engine, note, mean metrics (written by snapshot.py)
  <id>/
    manifest.json       id, date, engine version, note, feature flags, src sha256s, per-case summary
    src/                index.html fit.js ui.js design.js serve.py — verbatim copies
    bench/*.json        the bench rows, exactly as BENCH ISO wrote them
    cases.json.gz       the fitted IDs (fields, splats, ridges, materials) for every case
```

## Workflow per version

1. Work in `iris-engine/`, in the normal tree.
2. Bench it: in the fit window press **BENCH ISO**, or from the console
   `__irisEngine.fit.benchIsolated({ iters: 120, ver: 'v63-contrast' })` — with `ver` the rows also land
   in `versions/v63-contrast/bench/`. (`localStorage.irisVersion` sets a default `ver` for the button.)
3. Seal it:
   ```bash
   python3 iris-engine/versions/snapshot.py v63-contrast --note "E3: hemispheric AO at bake, floor to ABL, gapShadow fitted" \
       --features gapShadow=fitted ao=hemispheric layers=2
   ```
   With no `--bench` it takes the newest `ref/bench-*.json`.
4. Review:
   ```bash
   python3 iris-engine/versions/compare.py              # mean table, arrows vs the previous version
   python3 iris-engine/versions/compare.py --cases      # per-case MATCH2
   python3 iris-engine/versions/compare.py --metric specAgree --cases
   python3 iris-engine/versions/compare.py --diff v62 v63
   ```

## What the columns mean, and which feature each one tests

| metric | reads | moved by |
|---|---|---|
| `match2` | ¼ SSIM₄ + ¼ SSIM₂ + ¼ grad + ¼ (1 − ΔE/40) | everything; the headline |
| `match` | the old score (SSIM₄ + ΔE) | kept for continuity with v36–v62 |
| `ssim` / `ssim2` | structure at quarter / half resolution | layout: bundle-scale placement |
| `grad` | gradient-vector agreement | edges: relief and strand sharpness |
| `hcorr` | Pearson r of the photo's height proxy vs the baked relief | the relief layer (splats, ridges) |
| `sigmaRatio` | σ(L\*) render / photo | **contrast**: 1.0 is the target; 0.66–0.88 at v62 |
| `darkErr` | mean L\* the render is *brighter* over the photo's darkest 15 % | **floors**: occlusion, gap shadow, ABL thinning |
| `bandDL` / `bandWorst` | mean ΔL\* per radial band (6) | the radial profile: material band gains, thickness |
| `specAgree` | angular power-spectrum intersection per zone, 0..1 | **strand detail** at every scale at once |
| `hfRatio` | share of angular power at 30–90 µm, render / photo | **strand energy**: 1.0 = as much strand detail as the photo |
| `spacingRatio` | strand spacing from the whitened spectral peak, render / photo | the `spacing` field (1.0 = right scale) |
| `hfLap` | the cheap tangential-Laplacian version of `hfRatio` | the same thing, and it is what the optimiser actually minimises |
| `contrastRender/Photo`, `ridgeGap*` | the 06 texture targets | the two-material split and the ridge transfer |
| `coverage`, `vmaxMin` | how much of the tissue the photograph shows (1.0 = out to the limbus at every angle) | the photo and the crop, not the engine — but every other number is measured only inside it |
| `resolvedMm` | the finest spacing the photograph resolves at this quality | fit resolution: at NORMAL (640 px) it is ≈ 70 µm, so the strand band is only half visible |

**The photographed extent matters.** `map.vmax` is the largest tissue v actually sampled at each angle;
past it every unwrap is neighbour fill. Ref 35 is only photographed out to v 0.74–0.88, so its peripheral
zone is reported as `UNPHOTOGRAPHED` and left out of the means rather than scored against fill. Comparing
two versions whose `coverage` differs means comparing different regions — check that column first.

A version that moves `match2` without moving any diagnostic moved the optimiser, not the engine.

`specAgree`, `hfRatio` and `spacingRatio` are the ones SSIM cannot see: quarter- and half-res SSIM are blind
below ≈ 0.08 mm, while the strands are 0.035–0.07 mm. They are the acceptance numbers for the detail
phases (F2–F4).

## Restoring a version

`versions/<id>/src/` is a complete engine (it needs `ref/` and `study/`, which are not copied — they are
inputs, not outputs). To run an old version: copy its `src/*` over `iris-engine/`, or serve that
directory. `manifest.json` carries the sha256 of every source file, so a snapshot can be verified.
