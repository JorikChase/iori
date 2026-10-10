# 13. The anatomy ledger — every feature of the iris, and how the engine builds it from zero

Written 2026-10-10 from the discussion with iori that fixed the project's order (below). One row per feature of the
natural iris. Each row says what the feature IS (numbers from study/01 and study/08 §1.3), which **level** of the
model owns it, how it is **generated procedurally** so a person with no photograph can build it, what a **photograph
can fit** of it, how it is **edited**, and what the **engine has today** (checked against the code on 2026-10-10 at
grep level — a row saying "legacy knob" means the procedural engine of index.html has it and the layer model does
not). Nothing in this file is built by writing it; it is the map the plan is drawn on.

## 0. The decisions this ledger rests on (iori, 2026-10-10)

1. **The engine is the product.** First priority: a renderer and a system that reliably renders these irises on the
   web, polished, extensible. Then fitting streamlined (upload a photo, start working). Then strands that float,
   combable and colourable. Far future: the Soulmake app (an iris and a Flame Strains flame as one object).
2. **The strands are a distorted Gabor at several heights on the polar.** Per depth level a carrier field
   (orientation · spacing · phase · amplitude) on the polar grid, domain-warped by turbulence, with Blender-hair
   children controls (clump, roughness, kink, parting). The field is the source of truth; a strand curve is
   *extracted* from a crest (actualize) when someone wants to edit it alone, and remembers where it came from.
3. **Edit points stand in a column.** A displacement handle at (u, v) exists on every level; lifting a lower level
   carries the levels above it. Heights the photo cannot determine are set to the class default and marked
   *unplaced*; the person lifts them.
4. **Inference fills what it can, the person does the rest.** Everything the photo resolves is fitted with
   provenance `measured`/`traced`; what it does not is `grown` from the fields and drawn distinct.
5. **One camera.** The default view and the probe are one continuous camera: orbit and zoom outside the eye, WASD
   inside the probe range above the surface, the same light, colour and texture on both paths. The light is a
   **front box light on the camera — a submarine's headlamps**: it flies with the viewer.
6. **All anatomy accounted for**, built procedurally, achievable from zero. This file is that account.
7. Photographs come from an iris-photography studio (ring flash, isolated, full-resolution file requested); fits run
   in the browser.

Legend for the *today* column: **have** = in the layer model · **legacy** = a knob in the procedural engine only ·
**partial** · **none**.

## 1. The level stack

Heights are relative to the anterior border layer's surface (0). Orientation is the Gabor carrier's prior before the
photo moves it. "Seen" says where a photograph shows the level at all — everything else about that level is grown.

| level | anatomy | orientation prior | default height | seen in a photo | today |
|---|---|---|---|---|---|
| **S−2 posterior lattice** | the posterior stroma's two arc families (Rohen/Wyatt), each sweeping ≈ 100° root → margin, clockwise and counter-clockwise: a scissor lattice that dilates without slack | two carriers crossing at ≈ ±50° off radial | −300…−400 µm; the floor of the deepest crypts | only as the texture of large crypt floors, if at all | none |
| **S−1 deck** | radial trabeculae of the mid-stroma: vessel + thick collagen sheath columns, 100–300 µm apart, the loose stroma between them | radial, gentle spiral | −150…−250 µm (crypt floors ≈ 110 µm in today's fits, iori kept it) | inside crypts as parallel fibres with dark veins between | **have** (`fibres` + `veins` sets, parents, roots) |
| **S0 sheet** | the anterior border layer: a 20–70 µm dense sheet of fibroblasts + melanocytes, radial streaks, ABL fibre crimp ≈ 45° off radial (Girard 2024), isotropic speckle (measured: directional share 0.01 at 5–9 µm) | radial with a 45° crimp component | 0 | everywhere outside crypts: streaks (fitted as `guides`), speckle (the measured `ablTex`) | **have** (guides, ablTex); crimp none |
| **S+1 half-freed bundles** | anterior collagen bundles partly free along their length on a thin ABL (light irides); Wölfflin nodules are knots of the same collagen | radial | 0…+40 µm | the loose-weave look of the ciliary zone in light eyes | partial (the lift rule, opt-in) |
| **S+2 bridges** | vessel-sheath columns left spanning a crypt after the stroma around them was lost; anchored at both rims, taut, following the iris bow; bathed in aqueous | the deck's direction across the hole | ≈ 0, arc with `sag` | the brightest lines beside the darkest pixels; the separator rule (a strand crossing the gap) | **have** (roots → bridges, braid B1, `floatMm`/`sagMm`) |
| **S+3 membrane remnants** | threads of the fetal pupillary membrane that never resorbed: arise from the **collarette only**, never the margin; arc over the pupillary zone; end back on the iris, in a free club, or on the lens. Most newborns have some; a sizeable minority of adults keep visible ones | from the collarette inward, free | +100…+500 µm, free per control point | a bright thread with a cast shadow displaced from it | **none** — new class |

The ABL's speckle is **albedo, never displacement** (iori's rule: the height field is built from strand geometry,
plateau shell and base only). The sheet carries no Gabor of its own at the speckle scale; its streaks are S0's
carrier.

## 2. The structures — the frame the levels sit in

| feature | anatomy and numbers | level / class | procedural generator | from the photo | edit | today |
|---|---|---|---|---|---|---|
| **pupil margin** | r = pupil/2, z 0.7 mm anterior of the root; slightly polygonal when dilated; centre drifts 0.1–0.3 mm nasal-superior on constriction, temporal-inferior on dilation; ellipticity 0.98 head-on | frame | margin curve r_m(θ) with low harmonics + a dilation scalar | the fitter's pupil marker, `solvePose` | drag the marker; the PUPIL slider | **have** (fit marker, pupil slider); polygonal margin none |
| **pupillary ruff** | the posterior pigment epithelium curling onto the front: a 50–100 µm black bead, ≈ 70 scallops (55–85), amplitude 20–50 µm rising with dilation; the pupil edge is never a clean circle | structure (terrain class `ruff`) | ≈ 70 beads with relief along r_m(θ), deck fibres ending individually over it, the sheet ending earlier | the terrain's `ruffWidth` from the beads; T1 in spec §31 asks for the margin built like the natural one | bead count / amplitude knobs; a bead brush | partial (terrain class, RUFF_W scallop in the legacy shader; T1 open) |
| **pupillary zone** | r 0.33–0.58 (1.5 mm wide); smoother, denser; often a different tone (sphincter beneath); fine radial Schwalbe folds margin → collarette that deepen on dilation | S0 carrier with its own spacing (finer) | circumferential tone band × radial fold carrier; fold depth × d | the terrain's `pupillary` class; the sheet guides | tone, fold depth, fold count | partial (terrain class; folds legacy only) |
| **sphincter ring** | smooth muscle, 100 µm thick, 0.75–1.0 mm wide, in the posterior stroma of the pupillary zone; invisible itself; in blue eyes a lighter inner ring | material layer under S0 | an annulus of altered stroma density under the pupillary zone (K2 material) | the pupillary zone's mean tone vs the ciliary zone | width, density | none (K2) |
| **collarette** | the attachment scar of the fetal membrane; r ≈ pupil radius + 1.5 mm (1.2–1.8), raised 50–150 µm, zigzag with 20–40 irregular scallops, amplitude 0.2–0.4 mm radial; the iris's thickest point (0.6–0.7 mm); often a different hue (orange-brown in green/hazel eyes); moves outward with the pupil | structure (terrain class `collarette`) | a ridge curve vc(u) with 20–40 lobes + harmonic jitter; height; its own material; the minor arterial circle beneath it (vessels end or kink here) | fitted (`collarette` in fit.js, the genome's vc(u)); terrain class | drag lobes; height, hue | **have** (fitted ridge; terrain class) |
| **ciliary zone** | r 0.58–1.0, 2.5–3 mm wide; radially fibrous, lower density; carries crypts, furrows, spots, nodules | S0/S−1 carriers | the main Gabor stack | the plateau class; guides; fibres in crypts | the stack's knobs | **have** |
| **crypts of Fuchs** | holes in the ABL and anterior stroma; two rings — central crypts flanking the collarette (r 0.5–0.65) and peripheral near the root (r 0.85–0.95); diamond/oval, 0.2–1.5 mm (area 0.015–0.300 mm²), 3–12 per eye; depth = full ABL + 100–300 µm; sharp edges, dark matte floor, rims catch raking light; 9 % of Europeans have none, 22 % have many; most frequent upper-temporal | structure: hole outlines; expose S−1 and S−2 | outlines (Fourier) seeded on the two rings with the prevalence table; walls, floor level, rim strength; the deck visible inside; bridges across | **have** (84 outlines on eye 26; `hole b* < local threshold`); terrain `crypt`, `flank`, `septum` | outline handles; add/remove a crypt; depth | **have** (fitted); crypt brush none |
| **crypt walls and rim** | the ABL's cut edge: an overhang, a thin bright rim (8 µm in the engine after cd94185), the flank darker than the plateau | structure | undercut (`T.underMm`), lip (`T.lipMm`), rim strength along the outline | rim strength measured (`rimFromPhoto`), flank class | rim width, undercut | **have** |
| **contraction furrows** | 2–5 concentric arcs in the outer ciliary zone (r 0.70–0.95), each 60–300°, 50–100 µm wide, 20–60 µm deep, deeper by (1 + 1.5 d); total length 43 → 58 mm light → dark; lower quadrants first; > 180° in 82 % of Europeans, 47 % of East Asians | structure: a crease that folds S0 and S+1 | arcs with depth and a lighter rim; the fold ring | FURROW fitted in the legacy fitter; not in the layer model | arc handles, depth | legacy (knob + fit); layer model none |
| **iris root** | r = 6.0 mm, z 4.2; thickness 0.5 mm; the major arterial circle; hidden under the scleral overhang | frame | the carriers' origin; the limbal shadow | the limbus marker, `u_limb` axes (K1) | drag the limbus marker | **have** |
| **iris bow and thickness** | a truncated cone plus a 0.2 mm convex bulge peaking at 60 % of the annulus; thickness 0.5 root → 0.65 collarette → 0.2 margin; everything rises toward the cornea on dilation | frame | the surface the levels are stacked on | pose solve | bulge knob | **have** (pose); thickness field legacy only |

## 3. Surface marks and colour

| feature | anatomy and numbers | level / class | procedural generator | from the photo | edit | today |
|---|---|---|---|---|---|---|
| **ABL melanin** | the visible colour: dense melanin → brown; sparse → stroma scattering dominates → blue/grey; intermediate → green/hazel; thicker ABL in brown eyes | material (K2) | a melanin density field on the polar + the spectral LUT | `materialFromPhoto`, cell colours; gamut study: ΔE 2–5 reachable | PIGMENT / STROMA / PHEO / YELLOW / MIE knobs; a colour brush | **have** as RGB cells; K2 materials none |
| **stroma scattering** | 300–500 µm of forward-scattering collagen, Rayleigh-ish short-wavelength component against the black epithelium: "lit from within" | material | the LUT's stroma / mie axes | fitted | knobs | **have** |
| **posterior pigment epithelium** | 36–55 µm, densely melanotic: the opaque black terminator; its absence (albinism) makes the iris pink and transilluminant | material (fixed) | a constant black backdrop; an albinism switch | — | casebook | **have** (implicit) |
| **central heterochromia** | a ring of a different colour round the pupil: an ABL density gradient; very common | material | a radial melanin profile with a step at the collarette | the profile Δab per band | profile curve | partial (RING knob, legacy) |
| **sectoral heterochromia** | a pie wedge of a different colour | material | a sector mask on the melanin field | cell colours already carry it | sector brush | **have** (cells); brush none |
| **freckles / naevi** | melanocyte patches on the ABL: freckle 0.2–1 mm flat; naevus 1–3 mm slightly raised, may distort adjacent crypts; lower-temporal bias; 58 % of Europeans have ≥ 1 | S0 overlay + a small lift | spots seeded by prevalence; a naevus lifts S0 and bends the neighbouring carriers | dark + saturated = pigment, not pit (the b* rule) | spot brush | legacy (SPOT knob); layer model none |
| **Wölfflin nodules** | whitish-yellow collagen knots, 0.1–0.3 mm, 10–30 regularly spaced in the outer fifth; 37 % of light-eyed Europeans, 0 % East Asians | S+1 knots | beads on the S+1 carrier, cream material | bright soft round blobs in the periphery | nodule brush | legacy (knob); layer model none |
| **Brushfield spots** | denser, brighter, mottled, 0.1–1.0 mm at r 0.6–0.75; Down syndrome | casebook | as nodules, inner ring | — | casebook | none |
| **the collarette's hue** | orange-brown line in green/hazel eyes | material on the collarette ridge | its own material slot | measured on the ridge's cells | hue knob | **have** (cells) |
| **ABL speckle** | isotropic grain of the border layer, 5–75 µm bands, strength ∝ brightness^e (0.05–0.81 per eye) | albedo texture, never height | the measured `ablTex` spectrum; a default spectrum from zero | measured per eye (`abl_texture.py`) | amount, exponent | **have** |
| **vessels** | radial arterioles from the major circle to the minor circle at the collarette, each in a thick collagen sheath; **normally invisible** under the ABL; seen in albinism, atrophy, rubeosis, thin blue irides | hidden layer under S0; the *geometry* of S−1's columns | the vessel tree IS the parent spline set of S−1: dichotomous branching toward the pupil, anastomoses in the ciliary zone | never directly; their sheaths are the fitted trabeculae | tree knobs (branch rate, spacing) | none as vessels; their sheaths **have** |
| **limbal ring** | 0.5–1 mm dark annulus; ≈ 55 % optical (grazing refraction, Fresnel loss, scleral overhang), the rest pigment; fades with age | frame / optics | half from the refraction path, half from a peripheral pigment gradient; age scalar | `limbal` in fit.js | width, opacity | **have** |

## 4. The strands themselves — the Gabor stack's controls

What a person can turn, from zero, on every level of §1. The names follow Blender's hair children so iori's
intuition transfers; the right column says what each is in the carrier.

| control | in the carrier | anatomy it stands for | today |
|---|---|---|---|
| **spacing** | the frequency field | trabeculae 100–300 µm apart; finer in the pupillary zone | `placeSpacing` (F2, legacy); `spreadMm` on parents |
| **orientation** | the orientation field | radial; ±50° lattice at S−2; circumferential under the sphincter | the flow field; `fields` |
| **phase** | the phase field; a dislocation = a strand starting or ending | columns begin at the root and end at the collarette or branch | `phaseC/phaseS` (F2); `roots` |
| **amplitude / clump** | the envelope: crests pulled toward a guide, spacing tightening there | a bundle of fibrils in one sheath | `count`, `spreadMm`, `taperMm` |
| **turbulence** | domain warp of (u, v) before the carrier; curl noise | waviness, branching, the irregular weave | `wavinessMm`, `waveLenMm`; WARP (legacy) |
| **roughness** | the warp's fine scale per child | fibril-scale irregularity | none |
| **kink / wave / braid** | phase modulation; children twisting round the guide | the 45° crimp; braided bridges | `braid*` (B1) |
| **parting** | a phase jump along a line | a septum, a furrow, a crypt edge | terrain `septum`; none as a control |
| **length / taper** | the amplitude envelope along the guide | strands thin toward the collarette | `taperMm` |
| **float / sag** | the height arc of an extracted crest | a bridge's bow over a crypt | `floatMm`, `sagMm` |
| **lift (column)** | the displacement handle on every level at (u, v) | a naevus, a nodule, a lifted bundle | none — the editor |
| **width** | tube radius along the crest | 30–60 µm fibres, 100–300 µm bundles | `widthMm`, `rK` 0.6 calibration |
| **colour** | per-strand material (K2) | pigment on a strand, the pale generated strands fixed | none (RGB per sample only) |
| **actualize** | extract a crest into a curve, editable point by point, with `from` | — | **have** (`frozen`, `actualized`) |
| **provenance** | `measured` / `traced` / `inferred` / `grown` / `painted`, drawn distinct | — | **have** (strings on curves) |

## 5. Dynamics — one scalar d, pupil 2 → 8 mm

| effect | rule (study/01 §5) | in the model | today |
|---|---|---|---|
| annulus width 5 → 2 mm | tissue coordinates (distance from root) remapped non-linearly by d | the polar grid's v is tissue distance; carriers rescale | **have** (polar is tissue v) |
| ciliary zone compresses, buckles into furrows | furrow depth × (1 + 1.5 d); furrows continuous when dark | furrow arcs' depth and length from d | legacy knob only |
| crypts widen on dilation | they are the vents; iris volume −1.2 mm³ | outlines scaled across v by d; bridges keep their length → slack or taut | none in the layer model |
| pupillary zone thickens and shortens | Schwalbe folds deepen, ruff scallops separate | fold depth and bead amplitude from d | partial (legacy RUFF_W) |
| collarette moves outward | ≈ proportional to pupil radius | vc(u) from d | **have** (genome collarette follows the pupil — verify under the layer model) |
| pupil centre drift | 0.1–0.3 mm temporal-inferior with d | margin centre from d | none |
| whole iris rises toward the cornea | thickness +20 % | the bow's z from d | none |
| hippus | small spontaneous oscillation | d(t) | **have** (HIPPUS) |
| anchored vs free strands | a bridge of collagen holds its length; a membrane thread is slack | per-strand `anchored` flag; the arc solves for the new span | none — open (study/12 M5) |

## 6. The viewing model (decided today, not anatomy — kept here so the plan has it)

| piece | rule | today |
|---|---|---|
| one camera | physically placed; outside the cornea it refracts and orbits; inside the chamber (the probe range) WASD, no refraction; the switch at the cornea is invisible | two cameras (viewport + `probe()`), two renderers |
| the renderer switch | traced crests where a screen pixel is finer than a slab texel, the baked slab beyond; same light, colour and texture on both | L2 open; the exact path fades the texture, the viewport keeps it |
| the light | a front box light on the camera (submarine headlamps); shadows under bridges and membrane threads come from the viewer's own light | the probe has its own light; the viewport has the flash |

## 7. Casebook — pathologies and variants, as generators for later

Each is one or two rules on the structures above; none is in the engine. Coloboma (keyhole margin, intact ruff) ·
Lisch nodules (0.5–2 mm domes, NF1) · Brushfield spots · iris atrophy (moth-eaten S0, sphincter and epithelium
showing) · ectropion uveae (the black epithelium everted onto the front) · persistent pupillary membrane (S+3, now a
level) · rubeosis (vessels on the surface, margin and angle) · albinism (no epithelium, pink, vessels visible) ·
naevus / melanoma (raised, distorts the pupil) · iridodialysis (D-pupil, black crescent at the root) · corectopia /
polycoria · arcus senilis and the Kayser–Fleischer ring (cornea, erase the limbal ring) · cataract behind the pupil.
Mammals remain an afterthought (spec §29).

## 8. Open, to decide before the plan

| question | proposed default |
|---|---|
| "strand dynamics" — dilation and animation, or the structural behaviour (branching, ending, crossing)? | both: the carriers give the structure, d gives the motion |
| lifting rule — upper levels ride up rigidly, or deform like fabric over a finger? | fabric: a lifted column raises the levels above with a falloff of one spacing |
| how many S−1 sub-levels inside a deep crypt? | one deck + the S−2 lattice floor; add a second deck only if a crypt's photo shows two fibre layers |
| the posterior lattice's visibility | rendered only where a crypt floor is deeper than the deck; otherwise it is the base's texture |
| the membrane remnant's end | three end types: on the iris, free club, on the lens (not rendered — the lens is black) |

## Sources

study/01 §3–§7 (eophtha anatomy of the uvea; Edwards 2016; Sturm & Larsson 2009; Sidhartha grading), study/08 §1.3
(Rohen 1951 / Wyatt 2000 lattice; Tan–Girard 2024 crypt areas and layer thicknesses; Girard 2024 ABL crimp),
study/12 §2–§3 (no published height of bridges or membrane remnants). Code checked: `tissue.js` (parents,
instances, actualize, braid, layered stroma), `terrain.js` (classes), `fit.js` (collarette, furrow, limbal, pupil),
`index.html` (legacy knobs CRYPT, FURROW, COLLAR, WARP, SPOT, nodules, RING, RUFF_W).
