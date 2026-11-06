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
