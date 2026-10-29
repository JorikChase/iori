# Closing examples: what to replicate and how to go further (research brief, 2026-10-29)

For: the end of the engine paper (fractal-engine/paper.html), Metafractal (0.1) and Radiance Fields (0.2).
iori chose: classics replicated + classics advanced (engine paper); contemporary findings (0.1 / 0.2).
Geometry of Nature plates are left for paper 0.

Three research passes (web, primary sources where reachable). UNVERIFIED marks what a pass could not confirm.
Every candidate says: the source, what a faithful replicate needs, what the engine can already do, and the
step beyond. "Engine gap" marks work the engine needs first.

---

## A. Classics, replicated then advanced (engine paper, "Examples" chapter)

### A1. The Mandelbulb, power 8
- **Source.** White & Nylander, 2009; White's article (8 Nov 2009) credits the DE to David Makin:
  https://www.skytopia.com/project/fractal/2mandelbulb.html. Prehistory: Rucker 1987, Ruis 1997 (self-reported),
  White's power-2 thread Nov 2007 (https://www.skytopia.com/project/fractal/mandelbulb.html). Nylander's first
  power-8 render, Aug 2009 (AMS Notices 2022, https://www.ams.org/journals/notices/202204/rnoti-p624.pdf).
- **Formula.** zⁿ = rⁿ(sin nθ cos nφ, sin nθ sin nφ, cos nθ), θ = atan2(√(x²+y²), z), z ← zⁿ + c; dr ← n rⁿ⁻¹ dr + 1;
  DE = ½ log r · r/dr (Fragmentarium `Historical 3D Fractals/Mandelbulb.frag`, https://github.com/Syntopia/Fragmentarium).
- **Engine today.** `bulb 8 · +c` is this (check the θ convention against White's: the .frag notes north/south
  poles differ by convention).
- **Hard parts.** DE unreliable far out; thin regions overstep. knighty: bad DE where the origin's orbit trap is tiny
  (https://www.fractalforums.com/mandelbulb-implementation/better-de-estimate-using-orbit-traps).
- **Beyond.** A tissue whose cells are bulbs of different power (the engine's `[bulb 8 ‖ bulb 3] tissue` already);
  a driven power along the iteration (paper's figure 16); bulb × box as a chimera blended inside the iteration,
  where classic "hybrids" only alternate.

### A2. The Mandelbox, scale 2 and −1.5
- **Source.** Tglad (Tom Lowe), "Amazing fractal", fractalforums 1 Feb 2010
  (https://www.fractalforums.com/3d-fractal-generation/amazing-fractal/); definition
  https://sites.google.com/site/mandelbox/what-is-a-mandelbox: v ← s·ballFold(r, f·boxFold(v)) + c, s 2, r 0.5, f 1.
- **DE lineage.** JosLeys heuristic → Buddhi's running factor → Rrrola's 4-vector form
  (https://www.fractalforums.com/3d-fractal-generation/a-mandelbox-distance-estimate-formula/; Fragmentarium
  `Mandelbox.frag`): DE = (|p.xyz| − |S−1|)/p.w − |S|^(1−I).
- **Engine today.** `fold.box 1 · fold.sphere .5 1 · scale 2 · +c` and the −1.5 family preset. Our DE is r/|dr|;
  Rrrola's offset term is not in it (interiors of negative scales may "bloat" — check).
- **Beyond.** Box × Mandalay chimera; fold limit / minR driven per tissue cell; a −1.5 box with its own polar
  repetition in a collage ("cathedral rings").

### A3. Amazing Surf and Mandalay Box
- **Source.** Amazing Surf: Mandelbulber 2 `fractal_amazing_surf.cpp` (credited Kali, features DarkBeam): box fold on
  x, y only, ball fold with an optional cylinder mode. Mandalay: DarkBeam's fold adapted by knighty
  (fractalforums 'new' fractal type Mandalay); Tom Beddard's Aurullia series is Mandalay
  (https://www.creativeapplications.net/project/fractal-lab-webapp).
- **Engine today.** Amazing Surf is a preset (plane-pair folds). **Engine gap:** Mandalay's per-axis stepped fold on
  sorted |z| has no op; the cylinder ball fold neither.
- **Current practice.** Jorge Abalo's Mandelbulber 2 gallery, 2024–26: "Super Surf Land" (Amazing Surf Mod),
  amazingIFS, Mandalay Box V2, Kleinian V2, DOF and Monte-Carlo path tracing on most
  (https://fractal.batjorge.com/2024/06).
- **Beyond.** Surf × pseudo-Kleinian chimera; a kaliset bump/colour node (A6) on any species.

### A4. Kaleidoscopic IFS: Menger, Sierpiński
- **Source.** knighty, "Kaleidoscopic (escape time) IFS", 1 May 2010
  (https://www.fractalforums.com/sierpinski-gasket/kaleidoscopic-(escape-time-ifs)/); Fragmentarium
  `Kaleidoscopic IFS/Tetrahedron.frag`, `Menger.frag`.
- **Engine today.** Menger, Sierpiński and KIFS presets. Same DE family (|z|·S⁻ⁿ).
- **Hard.** Few iterations give "bubble" silhouettes.
- **Beyond.** End the iteration in a finished collage seed shape instead of a sphere (Mandelbulber's DIFS idea);
  interpolate the fold-plane set between tetrahedral and cubic as a chimera; breed the rotation pair.

### A5. Pseudo-Kleinian and Kleinian sphere packings — the big gap
- **Source.** Theli-at, "Kleinian drops" (2011, https://www.deviantart.com/theli-at/art/Kleinian-drops-192676501);
  knighty's recast as "scale-1 JuliaBox + something" (https://www.imaginary.org/node/2364); Fragmentarium
  `Knighty Collection/PseudoKleinian.frag`: p = 2·clamp(p, −CSize, CSize) − p; k = max(Size/|p|², 1); p *= k;
  DEfactor *= k; p += C; DE = |½|p.z − Offset.z|/DEfactor − DEoffset| (a plane seed, or the "Thingy").
  Kleinian: Jos Leys' escape-time algorithm, fractalforums 27 Oct 2016
  (https://www.fractalforums.com/3d-fractal-generation/an-escape-tim-algorithm-for-kleinian-group-limit-sets/),
  Mandelbulber `fractal_jos_kleinian.cpp`; Leys, "Sphere inversion fractals", Computers & Graphics 29(3) 2005.
  iq's Shadertoy "Apollonian" 4ds3zn (code UNVERIFIED, page 403).
- **Why it is a gap.** Scale 1: orbits never escape, so r/dr has nothing to measure. The DE is the distance to a
  seed shape in folded space over the accumulated inversion factor. DESIGN.md already notes "pseudo-Kleinian needs
  its own slab estimate".
- **Engine gap.** A "seed" estimate: the formula's DE = (distance to a seed shape at the end of the orbit)/DEfactor.
  Once there, the seed can be a finished collage — the step no other renderer has.
- **Beyond.** Collage seed (stairs-joined pillars in a Kleinian lattice); CSize driven per tissue cell; sphere
  inversion × quaternion step as a chimera. Apollonian sphere packing (dimension ≈ 2.4739) is the same machinery.

### A6. The kaliset
- **Source.** Kali, fractalforums 2011: p = |p|/(p·p) − c, c in [0, 2]
  (https://defgsus.github.io/blog/2021/10/12/kaliset-explorer.html); used as colouring and bump on DE fractals.
- **Engine today.** Probably `abs · invert · translate −c` with existing ops (check `invert` is p/|p|²).
- **Beyond.** As a shading reading/node, so any species gets kaliset colour — the forum trick made modular.

### A7. Quaternion Julia sets
- **Source.** Norton, SIGGRAPH 1982 (Computer Graphics 16(3) 61–67; exact title wording UNVERIFIED);
  Hart, Sandin, Kauffman, SIGGRAPH 1989 (https://history.siggraph.org/?p=119380); Sandin's account
  (https://www.evl.uic.edu/documents/sandin-raytracerjuliasetsbw.pdf). DE ½|q| log|q|/|q′|; classic c =
  (0.18, 0.88, 0.24, 0.16), slice w = 0 (Fragmentarium `QuaternionJulia.frag`).
- **Engine today.** `quat · translate …` preset; the 4-D slice.
- **Beyond.** Walk the slice and c with drivers (time); breed c; chimera with rotate4.

### A8. The looks people know (film, demoscene)
- **Julius Horsthuis**, Fractal Nature / Foreign Nature / Recombination (VR, 4096²/eye, Mandelbulb3D), cathedral-like
  enveloping landscapes, low sun, fog, film palettes, MB3D "DE combinate"
  (https://80.lv/articles/julius-horsthuis-the-beauty-of-fractal-art,
  https://nxtmuseum.com/artist/foreign-nature-julius-horsthuis, https://roadtovr.com/quest-fractal-art-recombination-horsthuis/).
  Exactly iori's taste (immersive caves, terraced, one hue, DOF). **Engine gap:** a sun + height fog + film LUT look
  preset (the lamp-at-camera is good for caves, not for skies).
- **Hal Tenny**, Mandelbulb3D megastructures used in Guardians of the Galaxy Vol. 2, assembled from many renders
  (https://www.deviantart.com/haltenny/journal/Guardians-of-the-Galaxy-Vol-2-update-2-666690192). The collage does
  natively what VFX compositing did.
- **Hartverdrahtet** (Akronyme Analogiker, Revision 2012 4k winner, https://www.pouet.net/prod.php?which=59086):
  one formula, sphere tracing, fake AO, god rays. The loop engine gives real feedback trails.
- **Fractal Lab** (Tom Beddard 2011, https://experiments.withgoogle.com/fractal-lab) — the engine's ancestor in
  the browser; Fragmentarium/Syntopia the DE theory; Mandelbulber 2 (Marczak), Mandelbulb3D (open source since
  2015, https://github.com/thargor6/mb3d) the formula libraries to check ours against.

### A9. Fractals as volumes and splats — open ground
- 3-D Nebulabrot as a 512³ volume (fractalforums "volumetric nebulabulb", 2010); Bourke's 3-D escape trajectories
  (https://paulbourke.net/fractals/trajectories/); a 4-D Buddhabrot viewer (https://albertlobo.com/fractals/buddhabrot-4d-viewer).
- No published work fitting fractals to 3D Gaussian splats was found (UNVERIFIED as absence). The engine's push
  already writes 3DGS files from the attractor: a first we can claim, carefully.
- **Engine gap.** Orbit density as a participating medium ("the bulb inside its own nebula").

---

## B. Contemporary findings (Metafractal 0.1, Radiance Fields 0.2)

### B1. Fractal trainability boundaries → 0.1 (strongest fit)
- Sohl-Dickstein, "The boundary of neural network trainability is fractal", arXiv:2402.06184 (2024), code
  https://github.com/Sohl-Dickstein/fractal. One hidden layer, width 16, mean-field scaling, 500 steps of full-batch
  GD in float64; image = grid of the two layers' learning rates, red diverged / blue converged. Box-counting
  dimensions 1.17 (linear) to 1.98. Follow-ups: transformers, arXiv:2501.04286 (2025); a cosine-perturbed
  quadratic already gives a fractal boundary, roughness controlling the dimension, arXiv:2406.13971 (2024).
- **Replicate.** Liu's 2-parameter loss in a fragment shader first (cheap, per-pixel like escape time), then a tiny
  network per pixel in WebGPU (float32 limits deep zoom).
- **Beyond.** Roughness slider: watch the boundary turn fractal; measure its dimension in the page as paper 0
  measures coastlines — the "parameter space is a map" thesis with a learning machine.

### B2. The Hofstadter butterfly and the Ten Martini problem → 0.1
- Quanta, 25 Aug 2025 (https://www.quantamagazine.org/ten-martini-proof-uses-number-theory-to-explain-quantum-fractals-20250825/):
  Ge, Jitomirskaya, You, Zhou extend Avila's global theory (arXiv 2306.16387, 2308.09321); original Ten Martini:
  Avila & Jitomirskaya, Annals (math/0504088).
- **Replicate.** For p/q, q ≤ ~100, transfer-matrix trace test (Chambers relation); 2-D canvas, CPU, < 1 s.
- **Beyond.** Gaps coloured by Chern number; the coupling λ as a second axis (Aubry–André transition at λ = 1) —
  a space of spectra.

### B3. The hat, the spectre, the Rauzy fractal → 0.1 coda
- Smith, Myers, Kaplan, Goodman-Strauss, arXiv:2303.10798 and 2305.17743 (2023). Their cut-and-project windows
  have fractal boundaries: Baake, Gähler, Mazáč, Mitchell, J. Math. Phys. 66 (2025), arXiv:2502.03268; the
  spectre's are of Rauzy type, arXiv:2411.15503. Rauzy fractal: tribonacci substitution, projected
  (https://en.wikipedia.org/wiki/Rauzy_fractal).
- **Replicate.** Rauzy: 10⁵–10⁶ points on canvas. Hat supertiles as SVG.
- **Beyond.** The Tile(a, b) family as a walk (periodic at three points, aperiodic elsewhere) — a metafractal walk.

### B4. The Sierpiński enzyme → 0.2 (or 0.1)
- Sendker et al. (Hochberg), "Emergence of fractal geometries in the evolution of a metabolic enzyme", Nature 2024,
  doi:10.1038/s41586-024-07287-2 (open: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11041685/). Citrate synthase of
  Synechococcus elongatus: dimers → hexamers → triangles of 18 → 54; cryo-EM to level 2, SAXS beyond; one
  substitution created it; assembly inactivates the enzyme; probably a harmless accident.
- **Replicate.** A tile-assembly simulation with the three contact types; a slider on the contact angle shows the
  symmetry break that makes the fractal (and the smooth lattice when it is symmetric).
- **Beyond (0.2).** Render the 54-mer as a density volume (PDB ids UNVERIFIED).

### B5. Electrons and light in a Sierpiński lattice → 0.2
- Kempkes et al., Nature Physics 15, 127 (2019): CO molecules on Cu(111) make a Sierpiński lattice for electrons;
  wavefunctions of dimension ≈ 1.58 (https://pmc.ncbi.nlm.nih.gov/articles/PMC6420065).
  Biesenthal et al., Science 376, 1114 (2022): fractal photonic topological insulator.
- **Replicate.** Tight-binding eigenvectors on a generation-4 Sierpiński graph (a few hundred sites), |ψ|² on canvas;
  or coupled-mode light propagation.
- **Beyond.** Light confined to a fractal as a radiance field: the engine's tetrahedron filled with |ψ|² as emission.

### B6. Also checked, not proposed
- MLC at Feigenbaum points (Dudko & Lyubich, arXiv:2309.02107, Publ. Math. IHÉS): a possible 0.1 zoom figure
  (period doubling toward c ≈ −1.4012, δ ≈ 4.669), needs double-float deep zoom.
- 3-D Kakeya (Wang & Zahl, arXiv:2502.17655, 2025): not drawable beyond a classical Besicovitch sidebar.
- Fractal dimensions of lightning, coral, lungs, rivers: not researched to primary sources here.

---

## Recommended set

**Engine paper, "Examples" (live figures, each: the original, our replicate, one step beyond):**
1. Mandelbulb power 8 → a tissue of powers (exists).
2. Mandelbox 2 and −1.5 → a polar "cathedral ring" collage (exists).
3. Menger / Sierpiński KIFS → fold-set chimera (exists).
4. Quaternion Julia → a time-driven slice walk (exists).
5. Amazing Surf "land" → surf × box chimera with terraced shading (exists; Mandalay needs an op).
6. "Foreign Nature, live": an immersive one-hue terraced cave with DOF in the Horsthuis manner, travelling across
   a tissue into a second species (exists; a sun/fog look preset would help).
7. Splats: the bulb or the tetrahedron as a 3DGS cloud (exists; the "first" claim stated carefully).
Needs engine work first: pseudo-Kleinian / Kleinian / Apollonian (seed estimate), Mandalay fold, kaliset as a
shading node, orbit-density volume.

**0.1 Metafractal:** B1 trainability map (Liu's loss first), B2 butterfly, B3 Rauzy coda.
**0.2 Radiance Fields:** B5 Sierpiński electrons as emission; B4 the enzyme as a density.
