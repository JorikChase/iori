# Round handoff — the CAPTURE audit (2026-09-18, v78 → v82)

One round of work, start to finish: what it set out to do, what it measured, what it changed, what it got wrong,
and exactly where the next round (Phase R, R1) picks up. The living start-here stays `HANDOFF.md`; the full log is
spec **§25–§26** in `study/00-summary-and-spec.md`. Commits: `c0412ae`, `a709795`, `b66a2e5`, `f68bfcb`.

## 1. The question the round started from

At the end of v76/v77, CAPTURE fitted strands better than NORMAL (strandCorr 0.37–0.51 vs 0.20–0.28) yet scored
lower (MATCH2 54.7 vs 61.5). The per-eye rows showed energy shifted from coarse to fine at CAPTURE: B1 (0.3–1 mm)
held only 0.51–0.66 of the photo's energy (NORMAL 0.78–0.95), the strand band overshot (hfRatio 1.6–2.0), and the
rendered strands were ≈ 25 % too tight (spacingRatio 0.69–0.96). Handoff item 1 was "coarse-band deficit at CAPTURE".

The working hypothesis: **scale leaks** — radii written in texels, which halve in mm when CAPTURE doubles the
proxies, grids and atlas.

## 2. What iori decided this round

| when | decision |
|---|---|
| start | Bench **both** qualities every version; **CAPTURE leads** (presets promoted from CAPTURE once it beats NORMAL). |
| start | **Audit first, then fix** only what the audit measures, one version each. |
| start | **Multi-start guard before F2b.** |
| after v78 | v79: fit splats through the 3× opening deepening (keep the look). F2 grid 256×64 (my recommendation — later reversed by data, see v81/v82). |
| after v79 | **Relief from the image, now** (Phase R). Ablate E3's height weight. |
| after R0 | R1 = **soft surrogate + Adam**; ownership **split by shape**; **bumps from the proxy**; fix the opening leak first. |
| after the leak correction | **Skip** the opening-darkness fix (it was 0.02–0.06, not 0.10–0.15). |

## 3. Versions, in order

All sealed in `versions/` (`python3 versions/compare.py` for the table). MATCH2 means over the four isolated eyes.

| version | change | NORMAL | CAPTURE | verdict |
|---|---|---|---|---|
| v76 / v77 | baseline | 61.5 | 54.7 | — |
| **v78 / v78c** | `heightFromPhoto` blur radii scale with the proxy (were texels) | 61.5 (bit-identical) | 53.9; height r 0.91 → 0.79 | kept — correct, but not the B1 driver |
| v79 / v79c | splats fitted against the engine's own baked relief, through the openDepth nonlinearity (`fit.reliefLoop`) | **48.4** | **49.4** | **rejected**; switch kept, default off |
| v80a / v80a-c | E3 height weight 0 | 61.0 | **49.8** (height r 0.45) | ablation: the term is a useful regulariser |
| v80b / v80b-c | E3 height weight 20 | 61.5 | 53.9 | identical to 60; weight stays 60 |
| v81 / v81c | F2 placement fields on a fixed **256×64** grid; NaN guard | 61.5 (bit-identical) | **50.1** | negative at CAPTURE |
| **v82 / v82c** | fixed placement grid at **512×128** | 61.4, strandCorr 0.24 → **0.29** | 53.9 (bit-identical to v78c) | **default** |

Net: headline scores unchanged; the cause of the CAPTURE gap is now known, two false leads are closed, and fitted
IDs are portable between qualities.

## 4. What was measured, and what it means

### 4.1 Scale audit (`fit.scaleAudit`, v76 code — `study/audit-25/scale-audit-v76.json`)

Same 1280 px photo for both passes, so only grids/proxies/atlas differ.

- Height proxy: corr 0.99, ratios 1.0 — clean (control).
- `heightFromPhoto`: coarse RMS 0.57–0.92 at CAPTURE — **leak**, fixed in v78.
- Splats: median σ 0.075–0.084 → 0.050–0.064 mm — not a scale leak (4.3).
- `placementFromPhoto`: mean `place` 0.17–0.31 → 0.38–0.48 — first read as coherence bias; **v81 showed the finer
  phase is real** (4.5).
- Same ID rendered at CAPTURE: B3 corr → ≈ 0 — **leak**: `setQuality` bilinearly resampled cell-relative phases.
  Fixed by the fixed placement grid (v81/v82).
- Renderer, B1: identical at both qualities for one genome — **the renderer is not the B1 culprit.**
- 16 NaN cells in `place` (eye 25, CAPTURE): 0/0 in the block confidence — guarded in v81.

### 4.2 Staged band trace (`fit.trace = fit.traceBands = true` — `trace-bands.json`)

B1/B2/B3 ratio and corr plus height r after every fit stage and routed expert, NORMAL vs CAPTURE:

- **The splat stage is where CAPTURE loses B1.** At NORMAL it raises B1 corr on every eye (26: 0.19 → 0.41) and
  height r to 0.76–0.78; at CAPTURE it lowers B1 corr on every eye (25: 0.26 → 0.01).
- **E5 causes the strand overshoot.** It runs only at CAPTURE (evidence ≥ 0.2) and ends with `strandFine` 0.6 and
  `strandSharp` 1 — both upper bounds — on every eye: B3 ratio 0.26–0.31 → 0.59–0.85 with B3 corr flat.
- B1 is also lower at CAPTURE from the very first stage (same canonical genome) — a render-resolution effect, not
  quality: at 1280 px both qualities agree.

### 4.3 Why the splat stage fails (`splat-ablation.json`, `res-ablation.json`, `relief-probe.json`)

- Not the budget (2000 vs 8000), not the proxy size (1024 vs 2048), not the fit resolution (640 vs 1280 at either
  quality) — only the quality's grids.
- **Relief model mismatch.** Splats are fitted to `proxy − coarseModelOnGrid` (height field + ridges, splats added
  linearly) and reach r 0.995 on that model. The engine bakes something else (`index.html:1100`): strand-layer
  relief, seeded crypts/furrows, radial furrows, nodules and a **nonlinear** splat term (openings below −kOpen
  deepened by `openDepth` = 3). Model vs engine relief, eye 25: r 0.77 NORMAL, 0.65 CAPTURE; coarse part vs engine
  r 0.40–0.43. At CAPTURE the coarse model also carries 1.40× the proxy's amplitude (1.16× at NORMAL), so the
  splats are fitted to subtract coarse structure — which lands in the image as anti-correlated B1.

### 4.4 v79 and v80: height r is a heuristic

Fitting splats through the renderer (v79) made the engine's relief match the proxy at r 0.95–0.96 — and lost
13 MATCH2 at NORMAL, 4.5 at CAPTURE. The proxy says "bright = raised"; the engine forms the image mostly through
openings darkening material, stroma and occlusion. The v78 splats were wrong about relief but put dark openings
where the photo is dark. **Height r is a bad target for the splat field.** But as a regulariser inside E3 (collr,
fibreContrast) it earns its place: weight 0 costs 4 MATCH2 at CAPTURE; 20 and 60 are identical.

### 4.5 R0 — the engine's relief → image transfer (`fit.reliefTransferBench`, `relief-transfer-*.json`)

Uniform splat field offsets s, luminance relative to s = 0, pupil zone → limbus:

| s (mm) | +0.04 | +0.02 | −0.012 | −0.02 | −0.03 | −0.05 | −0.08 |
|---|---|---|---|---|---|---|---|
| zones 0–4 | 0.99–1.00 | 1.00 | 0.99–1.00 | 0.64–0.90 | 0.36–0.78 | 0.32–0.72 | 0.30–0.69 |
| limbal zone 5 | 1.00 | 1.00 | 1.00 | 0.88–0.95 | 0.79–0.93 | 0.76–0.92 | 0.76–0.92 |

- **Bumps are invisible** under the ring flash (≤ 1 %).
- **Openings are a switch**: nothing above −12 µm, then ≈ 0.4–0.6× within 20 µm, saturated by −50 µm.
- Per-pixel spread within a zone ± 0.05–0.14: local and nearly uniform, so a per-zone curve is a usable model.

### 4.6 Placement grid (v81 → v82)

v81 put the placement fields on a fixed 256×64 grid (NORMAL's), which fixed the resampling leak (audit: `place`
consistent across qualities, same ID keeps its B3 corr) but lost 3.8 MATCH2 at CAPTURE (strandCorr 0.44 → 0.35).
`placementFromPhoto` reads the full-resolution photo (`hiResPolar`, 4096×512) at every quality, so the fine grid
does not need to follow the quality: v82 fixes it at 512×128 — NORMAL unchanged in score with better strands,
CAPTURE bit-identical to v78c.

## 5. What this round got wrong (corrected in the spec)

1. **"Openings are 0.10–0.15 darker at CAPTURE"** (§26.1 item 3). That compared two *different fits*. On one genome
   probed at both qualities (`leak-probe2.json`), CAPTURE with two strand layers equals NORMAL exactly; the third
   layer darkens openings by 0.02–0.06. iori's "fix first" decision was made on the wrong number and then reversed.
2. **"`place` inflation at CAPTURE is coherence bias"** (§25.1). Partly true of short windows, but the phase was
   real; v81 paid 3.8 MATCH2 for that reading.
3. **The starting hypothesis** (texel leaks explain the B1 deficit) was only a small part of it; the real driver was
   the relief model mismatch.

Rule taken from it: **compare qualities on one genome**, and treat an audit ratio as a symptom until a bench says
what it costs.

## 6. The code this round added or changed

| where | what |
|---|---|
| `fit.js:1522` `heightFromPhoto` | radii scale with the proxy (v78) |
| `fit.js:1777` `fitSplats` | `fit.reliefLoop` (default **off**, v79 rejected): base = engine relief without splats, φ/φ′/φ⁻¹ of the opening nonlinearity, per-row scale. Reusable for R1. |
| `fit.js:1133` | `fit.e3HeightWeight` (default 60) and `runBench({ e3HeightWeight })` |
| `fit.js:1902` `trace` | `fit.traceBands`: band ratio/corr + height r per stage; `trace('route-E*')` after each expert |
| `fit.js:2298–2356` | `fieldConsistency`, `reliefTransfer`, `reliefTransferBench`, `scaleAudit` |
| `fit.js:879` `placementFromPhoto` | placement grid `p`; frame angle `thetaAt` = bilinear of the quantised flow field at the cell centre (GL-exact clamp); NaN guard |
| `fit.js:859` `carrierPredict` | same frame as the bake |
| `index.html:1967–1969` | `GRIDS.p = [512, 128]` (never touched by `setQuality`), `PACK_GRID` (f2 → p) |
| `index.html` `FIELD_DEFS` | `place`, `placeSpacing`, `phaseC`, `phaseS` on grid p in pack f2 (r g b a); f1 channels 0/3 now unused |
| `index.html:900` `strandCarrier` | cell grid from `u_f2`; θ = `texture(u_f0, cc)` |

Probe data from this round: `study/audit-25/` (11 JSON files, 40–60 KB). Not committed on purpose:
`ref/cases.json`, `ref/bench-iso.json` (rewritten by every bench; they hold the last CAPTURE fits).
`ref/presets.json` is untouched (still the v76 NORMAL fits).

## 7. Where the next round starts: R1

Decided, not started. Build it as v83 (one change), bench both qualities.

- **Target:** the photo's polar luminance, band-limited to compact structure (≈ 0.09–1 mm; B1 + B2), not the height
  proxy.
- **Forward model:** I_pred(u, v) = I_base(u, v) · τ_z(S(u, v)), with I_base = render with the fitted *openings*
  removed (bumps kept) and τ_z the R0 curve per radial zone, probed on the current genome at the current quality.
- **Soft surrogate + Adam:** τ smoothed in s (start ≈ 0.02 mm wide, sharpen to ≈ 0.004 over the iterations) so
  gradients cross the flat parts; the splat gradient machinery in `fitSplats` is reusable — the loss gradient is
  B(residual) (Gaussian band-pass is symmetric) × I_base · τ′(S).
- **Ownership split by shape:** openings are negative splats only, σ capped (≈ 0.3 mm), initialised from compact
  dark DoG extrema of (photo − I_base); per-cell material stays smooth and is re-inverted afterwards
  (`materialFromPhoto` already runs after the splats in `fitGlobal`, `fit.js:1913`).
- **Bumps from the proxy:** keep the v78 target for the positive part (fit as now, keep positive splats).
- **Check:** one verification render; compare predicted vs actual band corr. Probe per quality (the 0.02–0.06 third-
  layer difference is absorbed that way).
- **Watch:** the stage order (splats before placement) means I_base has seeded strands at splat time — if openings
  start carving strand gaps, move placement before splats as its own version.

Then, in order: R2 ownership check · R4 height r recalibrated · E5 at CAPTURE (pinned bounds) · multi-start guard ·
F2b · population priors · SBVPI detection.

## 8. Running it

```bash
python3 iris-engine/serve.py 8768        # launch config "iris-engine"
```
In the page (`window.__irisEngine.fit` = F):
- bench: `E.setQuality('capture'); F.benchIsolated({ iters: 120, ver: 'v83c-…' })`, then
  `python3 iris-engine/versions/snapshot.py v83c-… --note "…" --features quality=capture …`
- audit: `F.scaleAudit()` → `ref/scale-audit.json`; transfer: `F.reliefTransferBench()`; staged bands:
  `F.fit.trace = F.fit.traceBands = true; F.fit.traceLog = []` before a fit.
- Browser pane is hidden/throttled: start work with a fire-and-forget async IIFE that POSTs a `…-done.json` to
  `/save/`, and wait for the file in bash. A NORMAL bench takes ≈ 2 min, CAPTURE ≈ 10 min.
- After anything touching loading/alignment/start of a fit: forward vs reversed bench must match.
