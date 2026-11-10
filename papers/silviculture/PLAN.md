# Paper 0.3 — Synthetic Silviculture (plan, 2026-11-06)

iori's choices (2026-11-06): a sub-paper in the series (not a doc, not a paper 0 chapter); this stretch explains and
measures what exists, with no new engine features; the state of the art (SOTA) is shown as **interactive, rendered
examples, stacked one after another**, not as a table alone.

Research: `papers/study/2026-11-06-silviculture-sota.md` (plants, forests, ecology numbers) and
`papers/study/2026-11-06-world-generation-sota.md` (terrain, learned worlds, evaluation). Earlier:
`2026-10-11-research-brief.md` §5, `2026-10-13-landscape-research.md`.

## Page

`silviculture.html` (hidden), code in `papers/silviculture/`. Same shell as 0.1/0.2, registered in
`pages.meta.json`, listed in `papers/series.py`, pointer from fractals.html §3.1 and ch 8. Reuses
`papers/fractals/silviculture-*.js` and `landscape-*.js` by import; it does not fork them.

## Contents

1. **What silviculture means here.** Growth as a search for light; the three scales (module, plant, ecosystem).
2. **The lineage, live and stacked.** One figure per idea, same seed, each adding one rule to the one before.
   Every reduced re-implementation lists its liberties.
   1. L-system (Lindenmayer 1968, Prusinkiewicz): rewriting, no environment.
   2. Space colonisation (Runions 2007): branches compete for space.
   3. Self-organising tree (Pałubicki 2009): buds, the shadow pyramid, Borchert–Honda vigour.
   4. Branch modules (Makowski 2019): our engine, one tree.
   5. The ecosystem: shared shadow, seeding, senescence, succession (ours).
   6. Light stamps (iLand, Seidl 2012): each tree stamps light influence onto a 2 m grid; a plot large enough for gaps.
   7. Microclimate under the canopy (Ecoclimates 2022), reduced.
   8. Fire through ground, ladder and crown fuel (Fire in Paradise 2021 / Scintilla 2024), reduced.
   9. Roots and the root plate (Rhizomorph 2023), reduced.
   10. Learned trees (SIGGRAPH Asia 2025 transformer, latent L-systems): not runnable in a page; the figure shows our
       tree written as the branch-token sequence those models generate, and says they are trained on procedural trees.
3. **The ground, live and stacked.** Stream power (Cordonnier 2016) → implicit solve (FastScape) → our 10 km region →
   stochastic transport at plot scale (McDonald & Cordonnier 2026, reduced). Learned terrain (InfiniteDiffusion 2026)
   and video world models (Genie 3, Matrix-Game 3) as a stated comparison: what they do that we cannot, and the reverse.
4. **The scorecard.** Forest laws beside the river laws, ours measured live, published systems' reported values
   ("not reported" where none): Reineke −1.605 and Yoda −3/2 measured separately on the thinning phase without
   storm/age deaths; Horton R_n 3.6–4.8, R_d 1.56–1.94; Leonardo 1.8–2.3; height–diameter 0.73; box dimension
   1.32–1.91; canopy-gap exponent 1.66–2.50 (needs ≥ 100 m plot); Hack, τ, Horton, hypsometry.
5. **What we adopt next**, ranked (from both reports).

## Correction to paper 0

fractals.html §3.1 says Makowski's model reproduces the −3/2 mass law. Makowski's figure is density against trunk
diameter (Reineke). Our measured −2.3 to −3.1 is mass against density with every death counted. Fix the sentence and
re-measure both forms (phase 1).

## Phases

- P1: shell, ch 1, the scorecard measurements, the paper 0 correction.
- P2: lineage 2.1–2.5.
- P3: lineage 2.6–2.10.
- P4: ground ch 3.
- P5: SOTA comparison text, ch 5, refs, phone check, deploy.

## Status

**P1 done (2026-11-06, uncommitted).** `silviculture.html` (hidden, registered, in series.py and paper 0 ch 8.2),
`papers/silviculture/{paper.js,paper.css,thinning.js}`; ch 1 written, ch 2/3/5 as planned lists, ch 4 scorecard with
the live self-thinning figure (`#fig-thinning`, `__silviculture.figs.get('fig-thinning').advance(n)` for a hidden
pane). Numbers from `node tools/silviculture/measure.mjs` (5 seeds, ~25 s, writes measure.json): dense plantation
576 seedlings, fit after density < 0.9·peak. Yoda −1.65…−1.92, Reineke tolerant −1.93…−2.16 / pioneer −1.39…−1.45,
βB 2.96–3.04, H–D 0.74–0.88, R_n 2.94–3.64, R_d 1.77–2.00, R_l 1.70–2.08, box 1.38–1.44 (tolerant 200 yr) /
1.22–1.29 (pioneer 45 yr), θ≥5 cm 2.14–2.50, θ≥20 cm 2.16–2.43 (14–22 stems), Leonardo built in, gaps not measurable.
fractals.html §3.1 corrected (Makowski checked the diameter form; the −2.3…−3.1 sentence replaced with a pointer).
Preview: launch entry `silviculture` serves a scratchpad mirror (launcher cannot read ~/Desktop).

**P2 done (2026-11-06, uncommitted).** Chapter 2 §2.1–2.5 live: `lineage.js` (one WebGL context drawn into each
figure's 2-D canvas; same seed, wall, camera, instrument), `skeleton.js` (common skeleton + measure()), `lsystem.js`
(ABOP Fig. 2.6), `colonise.js` (Runions 2007), `selforg.js` (Pałubicki 2009; C = 2 and fixed internode are our
constants, swept), `modules.js` (paper 0's Sim + the wall as `sim.extraDep`, a no-op hook added to
silviculture-core.js lightPass). Numbers: `node tools/silviculture/lineage-measure.mjs` → lineage.json (3 seeds).
Rig: `__silviculture.make[id](el).advance(n)` in a hidden pane. §2.6 lists the rest of the lineage (phase 3).

**P3 done (2026-11-06, uncommitted).** §2.6–2.10 live. `stand.js` (individual trees, two species, height-ordered
Gaussian light stamps on a 2 m grid, CHM at 1 m, gaps < 10 m 20 m²–1 ha, discrete power-law MLE; microclimate
cooling 4 °C × cover scaled by the warmest day, tolerant seedlings need ≤ 31 °C; fire CA over ground/ladder/crown fuels,
CROWN 0.05) drawn by `standfig.js` (modes light/micro/fire, `#fig-light/#fig-micro/#fig-fire`, hooks advance/ignite/
state). `roots.js` (shoot = self-org 15 yr, roots by space colonisation toward soil water; sand/rock/clay; plate,
pit, storm hinge) and `learned.js` (n-gram over depth-first branch tokens, 915-token vocabulary, valid-token
back-off; teachers = 8 self-org trees beside the wall) as lineage methods `roots` and `learned`. Numbers from
`node tools/silviculture/stand-measure.mjs` (3 seeds, a few minutes, writes stand.json): 16 ha / 300 yr stems
536–600, BA 41–44, ≥30 cm 155–169, top 32 m, λ 2.64–2.80 ±0.25–0.29 from 39–49 gaps (1 ha: 1–3 gaps), pioneers
extinct; micro cooling 3.1 (26 °C)…4.7 (34 °C), switch to pioneers between 34 and 38 °C; fire a threshold: strong
wind burns 71–77 %, with ladder 20–21 % crown fire and ~half the trees killed, ladder cleared → 0 % crown in all 9
runs, no pioneer return (no outside seed); roots: sand 3.8–4.0 m deep, plate r 2.4–2.5; rock 0.7 m, r 3.4–3.6;
clay 1 m, r 3.3–3.5; pit 6.4–8.4 m³; learned order 6: h 28–46 m vs teachers 15 m, lean either side, 0–251
segments in the wall. Refs +9 (29 total).

**P4 done (2026-11-06, uncommitted).** Chapter 3 live, four figures drawn by `groundfig.js` (modes spl / region /
transport / score; hooks advance/state/redraw). `ground.js`: a grid that paper 0's kernels accept (flood, Rho8
receivers, flats, Braun–Willett stack, accumulate, imported from landscape-terrain.js), stream power in two solvers
(implicit / explicit), fBm and ridged noise, and `measureGround` = pits + fill + paper 0's computeStats on any 10 km
257² surface. `transport.js`: SimpleHydrology-style particles with a momentum field (McDonald 2020 → McDonald &
Cordonnier 2026 reduced), 160² × 10 m plot, mass budget exact. Region = paper 0's generator in its own worker.
Numbers from `node tools/silviculture/ground-measure.mjs` (3 seeds, ~15 min, writes ground.json): SPL 100 kyr Courant
47–55, steady 910–1010 m; explicit unstable at 100 kyr and 2 kyr (C 1.04–1.25), stable at 1 kyr (C 0.55–0.65);
large implicit steps stable but wrong transient (3 Myr max 940–1000 vs 1355–1448 m); no creep: θ 0.45, h 0.57, τ
1.46–1.49; with creep h 0.50–0.51, τ 1.27–1.29 (paper 0 avoids it with the A_DIFF 0.02 km² channel threshold). Region
257²/513²: h 0.56–0.58, τ 1.38–1.44, R_B 3.6–4.8, θ 0.41–0.84, HI 0.19–0.31, coast D 0.96–1.28. Transport: momentum
11–13 threads, 124–136 M m³ exported, fans 5–8 M; none: 8 threads, fans 23–28 M. Score: pits fBm 23–34 %, ridged
36–39 %, SPL/region ≤ 1 %; θ noise 0.02–0.14; h noise 0.29–0.49, τ 1.58–1.74; R_B passes for noise too (Kirchner
1993). Refs 42. Next: P5 (ch 5 ranking, SOTA comparison text, phone pass, deploy); optional: score InfiniteDiffusion
tiles with measureGround.

**P5 done (2026-11-07).** Chapter 5 written: 5.1 where the field stands (no successor to Makowski; learned trees
trained on simulators; no generator measures drainage laws), 5.2 ranked adoptions for paper 0 (Earth tiles through
measureGround; InfiniteDiffusion/Lochner tiles; stamps in a 4 ha plot with storms; fire with outside seed; canopy
cooling into decay; root plates by soil; Leonardo Δ; GPU particle transport; module LOD), 5.3 left out (strand wood,
glaciers, learned generators). Ch 4 gap row points at 2.6. Front matter, footer ("first published 7 November 2026"),
series.py state and fractals.html ch 8 list dated. Every figure (15) starts at phone width, no page overflow. The
page stays hidden like 0.1 and 0.2. Order matters: series.py rewrites pages without their SEO block, so run
`python3 site.py all` after it.
