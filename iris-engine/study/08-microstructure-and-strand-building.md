# 08 — Building the micro-tissue: literature, what the engine lacks, and a strand-builder proposal (2026-09-18)

Question from iori: how could the irides be micro-detailed and micro-*built* — strand-building tools, displacement
brushes — while staying procedural; are there state-of-the-art iris-building algorithms or papers on synthetic irises?

Status of this chapter: sections 1–2 are findings, section 3 is a **proposal** (nothing decided).
Verification tags: **[READ]** primary full text read · **[PAGE]** landing page / abstract confirmed ·
**[2ND]** details only from a secondary source · **[MEM]** added from memory, not re-verified in this survey.

## 1. Literature

**The short answer.** Nobody has published a generative, anatomy-driven model of iris fibres, crypts and relief
beyond Zuo, Schmid & Chen (2007). Research went two ways that both avoid building tissue: graphics *captures*
geometry and patch-synthesises the rest (Disney), biometrics *hallucinates* 2-D near-infrared images (GANs,
diffusion). The state of the art for **building** is in production, not in papers: explicit strand geometry baked
to depth (Weta, Houdini tools, TexturingXYZ).

### 1.1 Graphics

| work | what it does | reusable |
|---|---|---|
| Lefohn, Budge, Shirley, Caruso, Reinhard 2003, IEEE CG&A — *An Ocularist's Approach to Human Iris Synthesis* [READ] [pdf](https://escholarship.org/content/qt8d88d3qc/qt8d88d3qc.pdf) | 30–70 hand-painted translucent layers from a typed library (stroma, collarette, sphincter, limbus, pupil) on stacked cones under a refracting cornea. No fibre generation. | typed layer library; depth from alternating sharp/cloudy translucent layers |
| Lam & Baranoski 2006, CGF/EG — ILIT [PAGE] [pdf](http://www.npsg.uwaterloo.ca/resources/docs/eg06.pdf); Kravchenko et al. 2017 CAVW interactive follow-up [PAGE] | spectral Monte Carlo light transport in layered iris. Colour only. | melanin (ABL, stroma) → colour; already covered by chapter 02 |
| François, Gautron, Breton, Bouatouch 2009, IEEE TVCG — *Image-Based Modeling of the Human Eye* [PAGE] [doi](https://doi.org/10.1109/TVCG.2009.24) | one photo → un-refract → relief + scattering by a "bright is deep"-type model → subsurface texture mapping. Bérard 2014 calls it not physically correct. | the same proxy the engine's `heightFromPhoto` uses — and §25.5 found the same failure |
| Bérard, Bradley, Nitti, Beeler, Gross 2014, SIGGRAPH Asia — *High-Quality Capture of Eyes* [READ] [pdf](https://la.disneyresearch.com/wp-content/uploads/High-Quality-Capture-of-Eyes-Pub-Paper.pdf) | iris mesh: rings every **0.025 mm**, **600 samples per ring**, triangulated through the refracting cornea, ~10 dilation poses; measured "significant out-of-plane deformation" from the dilator. No synthesis. | fidelity target (~25 µm radial); dilation bulges out of plane |
| Bérard, Bradley, Gross, Beeler 2016, SIGGRAPH — *Lightweight Eye Capture Using a Parametric Model* [PAGE; details from the authors' patent US10217265B2, READ] | polar patch synthesis 1024×256, 64² patches placed **saliency-first**, exemplars from the **same radius band**; each patch carries height *differentials* + dilation trajectories, assembled by a Laplacian solve; light irides fibrous, brown smooth. | radius-banded priors; salient features first, statistics for the rest; relief amplitude tied to melanin |
| Pamplona, Oliveira, Baranoski 2009, ACM TOG [READ] [pdf](https://www.inf.ufrgs.br/~oliveira/pubs_files/PLR/PLR_paper.pdf) | tracked points keep (distance to pupil edge)/(local width) ≈ constant; radial remap; no relief. | already in chapter 05 §4.1 |
| Sagar et al. 1994; Wood et al. (SynthesEyes, UnityEyes, 3DMM eye region); Jimenez 2012/2013; Epic MetaHuman eye; Chiang & Burley 2018 (iris caustics) [PAGE] | shading and rigs; all *consume* iris maps | none builds microstructure |
| EyeNeRF (Li 2022), Schwartz 2020, Relightable Gaussian Codec Avatars (Saito 2024), URAvatar 2024 [PAGE] | neural appearance of the whole eye | none models stroma structure |

### 1.2 Biometrics

- **Zuo, Schmid, Chen 2007, IEEE TIFS — *On Generation and Analysis of Synthetic Iris Images*** [PAGE + 2ND; paywalled;
  [CITeR dataset page](https://citer.clarkson.edu/research-resources/biometric-dataset-collections-2/synthetic-iris-model-based/) READ].
  The only anatomy-first generator. (1) continuous fibres in 3-D cylindrical coordinates (r, θ, z); (2) projection
  to the image, depth controls blur and visibility; (3) a **semi-transparent top layer with an irregular edge** and a
  collarette bump; (4) root blur + smooth noise; (5) lids, lashes. 40 random parameters. A caption states crypts "are
  associated with fibers" — they emerge from gaps in the fibre clusters and the top layer. Internals (fibre path
  generation) unverified.
- **Shah & Ross 2006, ICIP — feature agglomeration** [READ] [pdf](https://www.cse.msu.edu/~rossarun/pubs/ShahIrisSynthesis_ICIP2006.pdf):
  jittered periodic cubic splines as radial fibres, **LIC of Gaussian noise along the splines** (L = 25 px), spline
  collarette, spline-blob crypts at the collarette, partial-arc furrows. The closest published precedent to this engine.
- **Wecker, Samavati, Gavrilova 2010, Computers & Graphics** [READ] [pdf](https://giv.cpsc.ucalgary.ca/pdf/iris-synthesis-cg2010-wecker.pdf):
  polar unwrap, reverse-subdivision pyramid, swap detail bands between compatible irides. Band-wise detail transfer.
- Cui 2004 (PCA + SR), Makthal & Ross 2005 (MRF), Wei/Tan/Sun 2008 (patches), Venugopalan & Savvides 2011 and Galbally
  2013 (image from iris code) [PAGE] — no structure.
- GAN / diffusion: iDCGAN, Iris-GAN, RaSGAN, CIT-GAN, iWarpGAN, Tinsley/Czajka/Flynn 2022
  ([arXiv 2211.05629](https://arxiv.org/abs/2211.05629)), DeformIrisNet → **EyePreserve**
  ([arXiv 2312.12028](https://arxiv.org/html/2312.12028v5), READ: learned dilation warps beat both the rubber sheet and
  the biomechanical shell for large pupil changes), Zhang et al. 2025 colour-iris guided diffusion
  ([arXiv 2503.11930](https://arxiv.org/abs/2503.11930), 1,757 colour irides, dataset public). Surveys: Yadav & Ross
  2024 ([2404.17105](https://arxiv.org/abs/2404.17105)), Sawilska & Trokielewicz 2025
  ([2506.02626](https://arxiv.org/abs/2506.02626)) [READ]. Almost all NIR, 2-D, no relief, no controllable structure.

### 1.3 Anatomy and biomechanics (numbers for rules)

- **Rohen 1951 / Wyatt 2000** (Vision Research 40:2167) [PAGE; equations 2ND via Thainimit & Alexandre 2013,
  [pdf](https://www.di.ubi.pt/~lfbaa/pubs/iscit2013.pdf)]: collagen of the *posterior* stroma runs in two families of
  arcs, clockwise and counter-clockwise, root → pupil margin, each sweeping ≈ 90°; Wyatt's optimum sweep **100–110°**.
  A scissor lattice that changes pupil size without slack. Validated on animals, not on human irides.
- **Tan, Tun, Braeu, Perera, Girard 2024, bioRxiv** [READ] [link](https://www.biorxiv.org/content/10.1101/2024.12.30.630843.full):
  crypt area **0.015–0.300 mm²**; ABL 0.04 mm, iris ≈ 0.40 mm, sphincter 0.10, dilator 0.04, root 0.20; ABL dense
  (solid fraction 0.9), stroma spongy (0.5).
- Edwards et al. 2016 (R. Soc. Open Sci.), Sturm & Larsson 2009, Sidhartha et al. grading [PAGE]: crypts = lacunae of
  the ABL, Wölfflin nodules = collagen bundles, furrows = fold rings; grading scales usable as parameter ranges.
- Not found anywhere: crypt depth / surface roughness statistics (AS-OCT), FEM models with stromal fibre orientation.

### 1.4 Production and tools — where the building actually happens

- **Weta, *Alita: Battle Angel*** (fxguide 2019, [READ](https://www.fxguide.com/fxfeatured/weta-digitals-remarkable-face-pipeline-alita-battle-angel/)):
  the iris modelled as actual fibres, **8.5 M polygons per iris**, Houdini simulation of strands pupil → periphery so
  they "break and move" with dilation; reference = ring-flash photos of 50–60 staff.
- **Kumodot (Marcelo Souza), 80.lv** [READ] [link](https://80.lv/articles/learn-to-make-procedural-dragon-eye-in-houdini):
  curves copied around the pupil curve, noise along and across, two independent fibre sets shaped by ramps, Sweep with
  width varying along the length, merged with VDBFromPolys, **height baked to a depth map** and re-applied as
  displacement. Exactly a strand → heightfield bake.
- **IrisGen** (Amir Arashi, Houdini, 2025) [PAGE]: separate anterior and posterior stroma decks + collagen bundles,
  controls for fibres, crypts, radial and contraction furrows, procedural ID maps.
- **Anže Orehek, Procedural Iris V2** (Blender / Houdini) [READ] [link](https://ao3d.si/projects/procedural-iris-v2/):
  the user draws collarette, furrow and crypt shapes; the system meshes veins *around* them with density control.
- **TexturingXYZ UHD Iris** [READ]: per iris two high-poly fibre meshes (top and bottom), height, 6 ID maps, AO, albedos.
  **Chris Jones** eye kit: hand-sculpted 16-bit iris height + fibre albedo + melanin map.
- Open-source shaders (lighttransport/procedural-eyeball-shader, eduroa/ProceduralEyeShader_Unreal, Shadertoy):
  noise-grade.

### 1.5 Adjacent algorithms that transfer [MEM — not re-verified in this survey]

- **Evenly-spaced streamlines** (Jobard & Lefer 1997; farthest-point seeding, Mebarki et al. 2005): grows curves along a
  vector field at a prescribed separation `d_sep`, terminating where they come closer than `d_test`. It is the explicit
  counterpart of LIC: same flow field, same spacing field, but the output is curves with identity — and the
  termination rule produces strands that taper into their neighbours, which reads as merging.
- **Hair grooming** (guide curves + interpolated children with clump / noise / frizz; Blender curves sculpt: add,
  delete, comb, pinch, grow/shrink, density; XGen, Houdini groom): the mature toolset for "build strands by hand but
  stay procedural". A *clump* of children around a guide is a fibre bundle.
- **Ridge / centreline tracing** (Steger 1998 curvilinear structures; Frangi 1998 vesselness): photo → strand
  centrelines with width, the fitting counterpart of explicit strands.
- **Venation by space colonisation** (Runions et al. 2005 [PAGE]): candidate for the vascular arcades at the
  collarette. No iris application found — an extrapolation.

## 2. What the engine has, and what that cannot do

Everything fine in the engine is an implicit texture; nothing is a strand.

| layer | representation | editable as |
|---|---|---|
| strands, 3 scales × 1–3 depth layers | LIC of seeded value noise along `flowDir`, thresholded to coverage (`lic`, `fs-bake`) | fields: direction, spacing, warp, coherence, brightness |
| F2 placement | per-cell plane wave, four cells blended (`strandCarrier`) | phase and spacing per ≈ 0.1 mm cell |
| openings, relief | 2,000–8,000 additive Gaussians, then a switch nonlinearity (kOpen, ×3 depth) | DENT / BUMP / STREAK stamps |
| bundles | the only explicit curves: CPU polylines → MAX-blended ribbons (brightness, height) | not in the designer |
| crypts, furrows, collarette | analytic lenses, arcs, Fourier ring | object lists |

1. **A strand has no identity.** It cannot be picked, moved, branched, thickened, or made to pass over another. Real
   stroma is a layered mesh of sheathed vessels that branch, form arcades at the collarette and bridge over crypts;
   the E1 layers imitate the layering with a product of complements.
2. **The perception–distortion wall (§23.1) is a consequence of seeded strands.** A pixel loss flattens what it cannot
   place. F2 gave stripes a phase; a curve has a *position* — the thing a fitter can own.
3. **Openings are a separate field from the strands.** Anatomically a crypt is where the ABL and the upper decks are
   missing, bounded by strands that part around it (Zuo; Tan et al.: ABL 0.04 mm, solid 0.9, over a spongy stroma).
   In the engine a Gaussian dent multiplies coverage by 0.15 and `g_openWarp` fakes the parting — R0 (§26.1) measured
   the result: an opening is a switch, a bump is invisible.
4. **Resolution.** CAPTURE's atlas is ≈ 6 µm/texel tangentially (mid-iris), 3.9 µm radially: a 35–70 µm strand is 6–12
   texels — an explicit strand with a real cross-section is resolvable. The sub-strand decade (F3) is not bakeable and
   needs a per-pixel evaluation — which needs a strand-local frame (along, across) that LIC cannot provide and a
   rasterised strand provides for free.

The infrastructure for explicit curves exists: the bundle ribbon pass, the splat pass (thousands of quads into
RGBA16F), the object texture, the polar coordinate map for brushes, the undo stack, deterministic seeding.

## 3. Proposal: Phase S — the strand builder (not decided)

**Principle: every tool emits primitives, never pixels.** A brush stroke adds or edits strands, splats or sculpt
strokes — numbers in the ID, replayed by the bake at any quality. That is what keeps hand-built micro-tissue
procedural, resolution-independent, diffable and usable as a dataset.

### 3.1 Representation

- **Guides** (explicit, stored): ≈ 100–300 splines in (u, v) with per-point width, deck (depth), pigment. They replace
  the bundle objects and the coarse/medium LIC scales.
- **Children** (generated, not stored): fine strands grown deterministically from `seed` by evenly-spaced streamlines
  over the existing `flowDir` / `spacing` fields, attracted to guides by a clump parameter, with noise / frizz /
  taper / break-up genes. Stored: the grower's genes. ≈ 1,500–5,000 strands, 50–150 k points, one instanced draw.
- **Ownership**: every child is assigned to a guide at birth (its clump parent), so a guide *has* children.
- **Actualize** (iori, 2026-09-18 — the fallback if fitting and guides fail): per guide, `children` is either
  `'grown'` or a list of explicit splines. ACTUALIZE freezes a guide's grown children into editable splines with the
  same spline controls as the guide (points, width, deck, pigment), stored in the guide's local frame (arc length s,
  offset n) so moving the guide still carries them; RE-GROW discards them and returns to the genes. Only actualized
  guides cost bytes (≈ 20 children × 16 points ≈ 1 KB each); S6 (strands from the photo) can write actualized
  children directly.
- **Overrides** (stored sparsely): a single child touched by a brush becomes explicit (its id, its points); deletions
  are a list of ids. Untouched children regenerate identically.

Decided by iori 2026-09-18: guides + children + actualize; LIC and curves coexist behind `strandModel`, A/B by bench;
strand brushes before displacement brushes. Sequencing against R1 open (see the round discussion).
- **Decks**: posterior arcs (Rohen/Wyatt two-handed lattice, ≈ 100° sweep), anterior near-radial trabeculae, and the
  **ABL as a translucent sheet with holes** on top (melanin lives here: brown = dense sheet, blue = almost none —
  Bérard 2016's and TexturingXYZ's rule). Crypts are no longer dents: they are where the sheet has a hole *and* the
  grower was kept out (an obstacle field — the negative part of the splat field, which Phase R1 places from the photo).
- **Bake**: a depth-tested ribbon pass in atlas space writes coverage, height (tube profile), tangent, strand id hash,
  across-coordinate and deck. Real over/under crossings; per-strand colour variation; anisotropic sheen from the true
  tangent; and the strand-local frame F3 needs.

### 3.2 Tools

| strand tools (groom-style) | displacement tools (sculpt-style) |
|---|---|
| ADD / DENSITY (seed the grower locally), CUT, COMB (exists for the field; also moves control points), PINCH (clump → bundle), PART (push strands aside → opening), WIDTH, LIFT / SINK (deck, height), ARCADE (join two strands into a loop at the collarette) | STANDARD, CLAY, CREASE (furrows), PINCH, INFLATE, along-flow anisotropic stamp, procedural alphas (crypt rim, nodule, fold); stored as **strokes** (polyline + brush genes) and rasterised through the splat / ribbon passes |

R0's caveat stands: under a ring flash bumps do not move the image, so displacement brushes serve the relief view and
other lighting; the photo match is carried by strands, the sheet and openings.

### 3.3 Phases (each: A/B against LIC behind a `strandModel` switch, bench NORMAL + CAPTURE, one change per version)

- **S0 — measure.** Trace centrelines on the super-macro sectors in `ref-staging/` (1–2 µm/px): width and length
  distributions, branching angles, crossings per mm², number of visible decks, clump sizes → priors for the grower.
- **S1 — strand pass.** Instanced ribbon rasteriser with depth + the new targets; grower = evenly-spaced streamlines on
  the existing fields; one deck; LIC stays the default until curves win on the bench and in the casebook.
- **S2 — decks and the ABL sheet.** Posterior arcs, anterior radial deck, sheet with holes; openings emerge; the
  `openMask` hack retires step by step. Consumes R1's opening placement.
- **S3 — guides and children.** Clumping replaces bundle objects and the coarse/medium LIC.
- **S4 — strand brushes** in DESIGN. **S5 — sculpt strokes.**
- **S6 — strands from the photo.** Ridge tracing → guides and children placed where the photo's are (F2's phases seed
  the streamlines at the carrier crests). The resolvable band stops being "seeded".
- **S7 — F3**, per-pixel fibrils in the strand frame.

Interaction with the agreed order (v81 opening darkness → v82 F2 on a fixed-mm grid → R1): none of it is wasted —
R1's opening placement becomes S2's obstacle field, v82's grid becomes S6's seeds.

## 4. S0 measured (2026-09-18): strand statistics from the super-macro sectors

`tools/strand_stats.py` (run with `/usr/bin/python3`; output `study/s0-strands/<id>.json`, `summary.json`, overlays).
Four eyes from `ref-staging/` (three super-macro sectors at 0.7–0.9 µm/px, one sector at 1.8 µm/px), in-focus
28–36 % of each frame (3.6–24.7 mm² of tissue). Two ridge populations by scale-normalised Hessian ridges with
non-maximum-suppressed centrelines: **child** (σ 6–18 µm) and **guide** (σ 30–85 µm). Overlays checked by eye: child
centrelines follow the visible strands; guides follow the cream bundles.

**Scale caveat.** No frame shows the whole iris, so µm/px comes from a circle fitted to the pupil edge and an
*assumed* 3.0 mm pupil: every length below carries ≈ ±30 %. Ratios do not. (roy7A0y8ZyQ shows the limbus too — a
two-circle calibration is the obvious refinement.) Widths are FWHM on defocus-limited images: upper bounds.

| | child (4 eyes, medians) | guide (4 eyes, medians) | scale-free |
|---|---|---|---|
| width (FWHM) | 49–64 µm (p10 27–37, p90 105–123) | 111–130 µm (p90 250–350) | guide / child ≈ 2.2 |
| spacing, centre to centre across the flow | 91–117 µm (p10 51–62) | 203–235 µm | width / spacing ≈ 0.53 for both |
| visible run length | 123–182 µm (p90 350–675) | 237–336 µm (p90 540–880) | run / spacing ≈ 1.5 |
| tortuosity (arc / chord) | 1.03–1.05 | 1.03–1.06 | |
| waviness: RMS / wavelength | ≈ 10–14 µm / 230–340 µm | ≈ 9–17 µm / 160–340 µm | amplitude / wavelength ≈ 0.05 |
| angle to radial (unsigned) | median 12–24°, p90 45–71° | median 9–23°, p90 32–78° | |
| endpoints lying next to another strand (< 0.6 spacing) | **76–80 %** | 66–72 % | |
| centreline length per area | 8.0–11.6 mm/mm² | 4.3–4.5 mm/mm² | |
| ridge area coverage | 0.34–0.36 | 0.37–0.39 | |
| L* on ridge / in gaps | ΔL* 8–14 | ΔL* 9–18; guides 2–3.5 L* brighter than children | a*, b* differ by < 2.5 |

Not measured reliably: junction density and arm counts (NMS centrelines break at junctions — the endpoint statistic
above is the usable substitute), deck count, widths below ≈ 25 µm.

**What it says about the grower.**
1. **Two populations at a factor ≈ 2.2 in both width and spacing, each filling about half of its spacing** — a
   self-similar hierarchy, which is what guides + clumped children produce. It also matches the engine's LIC ladder
   (spacing × 3 × 9) less well than a ×2 ladder would.
2. **Strands end beside other strands** (three in four endpoints). That is the termination rule of evenly-spaced
   streamlines (stop when closer than `d_test` to a neighbour), so that grower produces the right kind of ending by
   construction; free-floating ends should be rare (≈ 20–25 %).
3. **Runs are short: ≈ 1.5 spacings between interruptions** (median; p90 ≈ 4–6). Even allowing for broken tracing,
   the tissue is a mesh of short overlapping runs, not long combed fibres — `d_test / d_sep` should be high (≈ 0.8)
   and seeding dense, and a guide is a chain of such runs rather than one 4 mm line.
4. **Near-radial with a broad oblique tail**: a median of 10–25° off radial with a tenth of the strands beyond 45–70°.
   A purely radial flow field cannot produce that tail; an oblique second deck (the Rohen/Wyatt arcs of §1.3) or
   arcades can. The sign of the angle was not measured — that is the test for two-handed arcs.
5. **Waviness is gentle**: amplitude ≈ 5 % of a ≈ 0.3 mm wavelength (tortuosity 1.03–1.06). One low-amplitude
   sinusoidal gene per strand with a random phase; more would overdo it at this pupil size (it must grow as the
   pupil dilates and the strands slacken).
6. **Budget.** Iris area ≈ 100 mm² → ≈ 1,000 mm of child centreline and ≈ 450 mm of guide centreline: 2,000–5,000
   child runs and 150–300 guides of 2–4 mm (chains of runs) — the counts assumed in §3.1 hold; ≈ 80 k points.
7. **Material**: ridge ↔ gap is a luminance split (ΔL* 8–18) with almost no chroma difference, and guides are only
   slightly brighter than children — per-strand *pigment* should be a small luminance-side variation, the colour
   stays with the per-cell material fields.

**Grower priors for S1** (mm; from the medians, to be scaled by the `spacing` field): child `d_sep` 0.10, width 0.05,
`d_test/d_sep` 0.8, run length ~ exponential with mean ≈ 0.2; guide spacing 0.22, width 0.12; wave amplitude 0.014,
wavelength 0.3; direction = flow field ± a deviation with median ≈ 15°.

## 5. S1 built (2026-09-19): the grower and the strand pass, behind `strandModel`

**Code.** `strands.js` — `IrisStrands.grow(opts)`: evenly-spaced streamlines over the engine's *effective* `flowDir`
and `spacing` fields (the same values `uploadFields` sends, FIT·FLOW blend included), in the polar domain with a
local-mm metric, periodic in u; spatial hash; `d_sep` = `growSep` × spacing (1.6 → ≈ 0.09 mm), stop at `growTest`
(0.8) × `d_sep` from a neighbour, run length ~ exponential (`growRun` 0.7 mm), seeded wander off the flow
(`growWander` 0.25 rad), a wave per strand (`growWave` 0.014 mm at ≈ 0.3 mm), width `growWidth` (0.53) × `d_sep`.
Pure function of (seed, genes, fields): deterministic (checked), ≈ 45 ms for ≈ 2,100–2,300 strands / 28 k points,
7.9 mm of centreline per mm² (S0: 8.0–11.6), coverage in the strand texture 0.34 (S0: 0.34–0.36).
`index.html` — strand pass (`vs/fs-strand`: tapered ribbons with a soft-edged tube profile into an RGBA16F target,
MAX-blended: r coverage, g tube height, b brightness), `growStrands` (cached on seed + genes + field checksums; the
mesh is rebuilt only when the strands or the atlas size change), `bakeCurvesProgram` (below), `LIC / CURVES` button
in the Flow window, `E.setStrandModel`, `E.strands`, `E.readStrandTex`, `E.strandModelOverride` (0 | 1 | null — forces
the model for A/B benches, where every case starts from a fresh genome *and* a fresh state). `genome.globals.
strandModel` 1 = curves; absent = LIC. S1 replaces only the **top layer's fine scale** (`cF`); coarse and medium
LIC, lower layers, bundles and openings are untouched (guides = S3, decks = S2).

**Two lessons.**
1. *Any* code added to `fs-bake` — even a branch a uniform switches off — changes the compiled shader's float
   arithmetic: the LIC bench drifted by ± 0.3 MATCH2 on two eyes (25: 68.1 → 68.4, 26: 69.5 → 69.1). The curves code
   is therefore a **separately compiled variant** (`//STRAND_DECL//` and `//STRAND_FINE//` markers filled by
   `bakeCurvesProgram`, compiled on first use); the LIC shader differs from v83's only in comments. A marker must be
   alone on its line (a trailing explanation became code and the variant failed to link — the stale atlas then
   scored 7–22 on three eyes).
2. `resetForFreshFit` deletes unknown `state` keys, so a bench switch cannot live in `state`.

**A/B at NORMAL on v83 code (data `study/audit-s1/ab-normal-v83.json`).**

| | 09 | 25 | 26 | 35 | mean MATCH2 | strandCorr | B3 part corr |
|---|---|---|---|---|---|---|---|
| LIC | 60.4 | 68.1 | 69.5 | 66.8 | **66.20** — bit-identical to v83 | 0.15–0.22 | 0.29–0.40 |
| CURVES | 60.6 | 67.7 | 68.9 | 66.7 | 65.98 | 0.10–0.20 | 0.25–0.39 |

Neutral, as the oracle (§27) predicts: these curves are *unplaced* — and in curves mode the fine scale no longer
carries F2's fitted phase, which the LIC path does. A strand model earns points only when the photo places the
strands. Not yet benched at CAPTURE (where the fine scale is resolved and F2 matters more — expect a larger deficit
until placement exists).

**Next: S6-lite before S2–S5** — seed the grower from the photo: in cells where F2's `place` confidence is high,
seed streamlines on the carrier's crests (x′ = (k − φ/2π) · placeSpacing in the cell's local frame), most confident
cells first, generic seeding afterwards; bench against LIC + F2 at both qualities, judged on the B3 part
correlation. Then guides from B1/B2 ridge tracing (the oracle's larger prize).
