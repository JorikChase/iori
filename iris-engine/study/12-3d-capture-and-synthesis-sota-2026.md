# 12. Measuring and copying the iris in 3D — the state of the art as of 2026-09-25

Research pass (four web surveys, 2026-09-25) for the question: *is there anything that measures and renders the whole
iris — strands, bridges over crypts, the terrain — in 3D, unrecognisable from a natural iris at any scale?* And the
side question: what does the World (Worldcoin) Orb actually capture, and does World hold the largest iris database?
Everything below is [WEB] unless marked; UNVERIFIED where the agent could not read the primary source.

## 1. The World Orb

- **A 2-D near-infrared image, nothing more.** Eye camera: Sony IMX296 global-shutter sensor (TfH says 1.8 MP, the
  datasheet says 1.58 MP) behind a custom NIR telephoto with a liquid lens (0.4 mm focus precision, ms autofocus),
  steered by a 2-axis gimbal mirror; 79 NIR LEDs at **740 / 850 / 940 nm** (multispectral), eye-safe per EN 62471.
  A wide RGB-IR camera (Omnivision OX05B1S, 5 MP) finds the eyes; a **time-of-flight and a thermal camera exist for
  face liveness only** — no stereo, relief or 3-D iris data is captured.
  [world.org/blog/engineering/opening-orb-look-inside-world-biometric-imaging-device; biometricupdate.com 2023-01-30]
- **Pipeline** (`open-iris`, MIT, github.com/worldcoin/open-iris): DeepLabv3+/MobileNetV2 segmentation → Daugman
  rubber-sheet normalisation → **2-D Gabor phase bits** (> 10,000 bits; press says 12,800) → fractional Hamming
  distance. The iris code is a quantised phase signature, not a reconstructible image.
  [world.org/blog/engineering/iris-recognition-inference-system, 2023-06-05]
- **Custody.** Since 2024–25 images stay on the Orb in memory and go to the user's phone encrypted (Personal Custody);
  the central iris-code store was deleted 2024-05 and the codes live as secret shares across three parties (AMPC).
  The image opt-in (Data Custody) is being retired. World therefore holds, by design, **neither images nor usable
  templates centrally**. [world.org announcements 2024-05-15, updated 2025-01]
- **Scale.** ≈ 18 M Orb-verified humans (2026-04), > 1,500 Orbs in 23 countries. **India's Aadhaar holds both irides of
  ≈ 1.38 billion residents, images retained** — two orders of magnitude more, and it is images. UAE's border system
  (IrisGuard) is the most *searched*; US DHS OBIM ≈ 3 M iris pairs. **World does not have the largest iris database,
  and what it has is not iris texture.** [uidai.gov.in; world.org 2026-04-17; cl.cam.ac.uk/~jgd1000/UAEdeployment.pdf]
- Regulatory (brief): Kenya illegal (High Court 2025-05); Spain AEPD halt 2024-03; Portugal CNPD ban 2024; Hong Kong
  stop order 2024-05; Bavaria deletion order 2024-12-19; Brazil ANPD ban on paid scans 2025-01, upheld 2025-08.
- **For us: nothing.** An Orb frame is a NIR texture at recognition resolution (ISO/NIST ask ≥ 8 px/mm; we work at
  ≥ 100 px/mm in colour with depth). The one transferable idea is the multispectral NIR: at 850–940 nm melanin is
  nearly transparent, so a NIR frame shows the stroma *structure* of a dark-brown iris that the colour photo hides
  (the Sci Rep 2018 Wölfflin-nodule result, study/02).

## 2. Rendering and synthesis, 2024 → 2026-09: nothing does strand-level 3-D

- **Khademi, Kundu, An, Fix, Colmenares — *Reconstructing Realistic and Relightable Eyes*, WACV 2026.** Explicit cornea
  mesh + Instant-NGP field; a network predicts the ray after Snell refraction so near-field point lights relight
  correctly. 11 subjects on an 18-camera / 16-light NIR stage plus fringe projection. Iris relief only implicitly in
  the radiance field; no strands, no editable structure; no code found. **The closest academic neighbour**, and it is
  a per-subject neural bake, not a model. [openaccess.thecvf.com/content/WACV2026/…Khademi…]
- **No SIGGRAPH 2024 / 2025 / 2026, SIGGRAPH Asia, Eurographics, CVPR/ICCV/ECCV paper** on iris microstructure, fibre
  synthesis, or eye + Gaussian splatting was found (kesen.realtimerendering.com/sig2026.html has no eye paper). The
  refractive/reflective 3DGS line (Ref-DGS, RefracGS, 2024–25) has never been pointed at an eye.
- **Biomechanics** is where the new anatomy is: Girard lab — ABL fibre crimp pattern **≈ 45° off radial** (bioRxiv
  2024.04.24.591028); crypt areas 0.015–0.300 mm² and their FEM (bioRxiv 2024.12.30.630843, already in study/08);
  **active-strain iris model, J. R. Soc. Interface, 2026-08 (doi 10.1098/rsif.2025.1363)** — sphincter/dilator as
  active strain, UNVERIFIED whether the mesh is usable for us (full text blocked).
- Generative: EyePreserve v5 (2025-05) still 2-D dilation warps; gradient-guided GAN latent edits (arXiv 2511.09749);
  diffusion inpainting of occlusions (arXiv 2607.21545, 2026); PAD hybrids (ICCV 2025). All flat NIR.
- Production: MetaHuman 5.6 eyes are still diffuse + normal + refracting cornea mesh, no photo fit; TexturingXYZ iris
  packs (scan heightmap + albedo) unchanged; no Weta/ILM eye talk surfaced for *Fire and Ash* (absence of press, not
  evidence of absence).
- **Verdict.** The two lines — neural per-subject eye capture and 2-D biometric synthesis — have not met. A
  procedural, editable, depth-peeled strand model fitted to a real eye and holding up under magnification is
  unoccupied ground. It also means there is no published number for "indistinguishable at microscope scale"; we
  would be defining the test.

## 3. Measuring the iris in 3-D — what each instrument actually resolves

| modality | lateral | axial | strands? | bridges? | access |
|---|---|---|---|---|---|
| clinical AS-OCT (Anterion, CASIA2) | ≈ 30–45 µm | < 10 µm | marginal | no | clinic, €50–150 k |
| µOCT / Gabor-domain OCM | ≈ 2 µm isotropic | 2 µm | yes | yes | lab only, 1 mm FOV, never applied to iris (UNVERIFIED) |
| in-vivo confocal (HRT/Confoscan) | 1 µm | — | — | — | cornea-contact geometry, no iris literature |
| Scheimpflug (Pentacam) | coarse | 10 µm | no | no | "iris detail poor" per reviews |
| Disney 2014 refraction-aware MVS | ~25 µm ring pitch, 600/ring [study/08] | not published | surface relief yes | not as gaps | rig, weeks of software |
| shape-from-focus macro z-stack, refraction-corrected | < 10 µm optical | step-limited, < 20 µm | yes | **yes (occlusion order)** | DIY €2–4 k |
| multi-flash photometric stereo, cross-polarised | image-limited | normals, not depth | tube profile yes | via shadows | DIY, same rig |
| dilation sequence (dark → bright) | image | none directly | — | slack/tension tells attached vs free | free |
| NIR frame (850 nm) | image | none | shows stroma under melanin | — | converted body €300–700 |

Sources: Anterion (Sci Rep 2022, s41598-022-04784-0); CASIA2 vendor; iris-surface smoothness index from AS-OCT
(Sci Rep 2021, PMC8055699 — an aggregate roughness curve, not crypts); ABL/stroma thickness by OCT (J Clin Med 2022,
PMC9655842); GDOCM review (Appl. Sci. 2019, PMC7063741); AS-OCT review on Scheimpflug iris detail (NBK554035);
NIST IDQT 2021 (≥ 8 px/mm, ~22 lp/mm lenses). **No 2023–26 paper estimates iris 3-D or strand layering from one or
few photos** — the "Iris" monocular-depth model is a name collision.

What this means for the bridge question (§32 probe): the only instruments that see a strand *and the gap under it*
are µOCT (unavailable) and **focus stacking** — at 5× f/2.8 the depth of field is ≈ 20–30 µm, so a z-stack through a
crypt records which slice each fibre is sharp in; a bridge is a fibre sharp 100–200 µm above the slice where the crypt
floor is sharp. That is the same over/under decision Z1 now *infers* from crossing brightness (86 % right, cycles
unresolved), turned into a measurement. The living eye's micro-saccades (≈ 20–40 ms intervals) limit a stack to short
strobed bursts and a fixation target; an ocularist's prosthetic eye or a donor eye is the calibration object.

## 4. Data

Public sets ranked for *fitting* (resolution across the iris, colour, same-eye pupil states, 3-D):

1. **Disney High-Quality Eye Capture dataset** — one blue-eyed subject, both eyes: eyeball mesh, **iris mesh sequence
   across dilation states**, iris + sclera textures, limbus opacity map, reference photo. Password-protected download
   (studios.disneyresearch.com/download-high-quality-eye-capture-data-set/); licence not stated on the page. **The
   only public 3-D iris ground truth.** [la.disneyresearch.com/datasets/high-quality-eye-capture-dataset/, verified]
2. **Warsaw BioBase Pupil Dynamics v3** — 159 NIR videos, 42 subjects, 25 fps × 30 s dark → bright → dim: the only
   controlled same-eye dilation sequences. [zbum.ia.pw.edu.pl]
3. **Zhang et al. 2025** colour diffusion set (HF `fatdove/Iris_Database`, CC BY 4.0) — synthetic colour irides,
   resolution UNVERIFIED.
4. UBIRIS.v2 (11,102 colour, 261 subjects, but ≈ 140 px across the iris); MICHE-I (phone, up to 2320×4128); CSIP;
   VISOB (158 k phone selfies); UPOL (384, 576×768, slit-lamp optics). All far below 600 px across the iris.
5. NIR: CASIA-IrisV4 (54,601), ND-IRIS-0405 (64,980), CASIA-Iris-Degradation CX1 (dilation + off-angle), Notre Dame
   and Warsaw post-mortem (RGB + NIR pairs of the same eye). None has a 3-D companion.
6. AS-OCT sets (Whole-Eye OCT 6,621 volumes UNVERIFIED id; AIDK 1,168; Multi-Disease 848) — iris cross-sections with
   masks: relief-depth priors, no texture. Multi-view face sets (NeRSemble 7.1 MP, RenderMe-360, FaceScape) put the
   iris in a few hundred pixels at best. Gaze sets are useless here.
7. Wikimedia Commons (86 + 462 files, per-file CC) — what `ref/` already uses. Suren Manvelyan: not licensed.

**Our own rig** (one visible + one NIR station, ≈ €1,900–3,600): Laowa 25 mm f/2.8 2.5–5× (€400–500, 40 mm working
distance) or MP-E 65; WeMacro rail (€280–320, 1 µm steps) for the z-stack; twin flash with linear polariser film +
rotating polariser on the lens (kills the corneal specular — study/04 already assumes this); chin rest + forehead bar;
second body converted to 850 nm. **Eye safety is a real gate:** ISO 15004-2:2024 Group 1 limits (retinal thermal
H = 5.0·t^0.75 J/cm² for 0.25–2500 s) and IEC 62471 — compute the irradiance of the flash and the NIR LEDs before a
volunteer sits down. Calibrate depth on a printed relief target and a prosthetic eye first.

**GDPR.** An iris photograph processed to identify is Art. 4(14) biometric data; Art. 9 prohibits unless **explicit
consent** (9(2)(a)); DPIA when "at scale" (no fixed number — do one if more than a handful of volunteers). ÚOOÚ is
strict on "freely given" (employment guidance; volunteers with no dependency are lower risk). **A fitted iris ID is
not an escape:** the whole point of the ID is that it reconstructs a recognisable iris, so it is re-identifying and
remains biometric data. Minimise instead: encrypt raw stacks, keep the minimum set for re-fitting, delete the rest.
[gdpr-info.eu/art-9; edpb.europa.eu research questionnaire reply; epravo.cz]

## 5. The algorithm we are actually after

The spec's own results say a single photo cannot deliver the 3-D copy: relief through the renderer failed (§25.5), the
crossing order is inferred at 86 % with weaves that no single height field can satisfy (§32.2), and the probe showed
that 70 % of the iris was a table because the *model* had no data to put there (§32.7). Adding priors does not fix an
underdetermined problem; adding **observations** does. The engine already has the right half — an explicit primitive
model (curves with r, z, material, provenance) rendered through a refracting cornea, a fitter, an op journal. What is
missing is the other half: **several views of the same eye that disagree exactly where depth is**, and a fitter that
explains all of them at once.

**Multi-observation inverse rendering of the tissue model.** One capture session of one eye yields, in one head
position: a cross-polarised focus stack (depth ordering, absolute z at 10–20 µm), 4–8 single-flash frames from known
directions (shading of every tube → radius and side profile; cast shadows → bridges), one NIR frame (structure under
melanin), and the same at a second pupil size (which strands are anchored, which slacken). The fitter — the tissue
model's own renderer made differentiable or driven by the existing coordinate-descent — minimises the residual over
*all* frames, with z carrying provenance `measured`. The Disney meshes are the first test (no hardware): render their
iris texture through our pipeline, fit, compare our z field to their mesh across their dilation states.

**Below the capture floor (≈ 10 µm) the copy is statistical, and can be.** Nothing images a living person's collagen
fibrils or melanocytes; at microscope scale the content is anatomy (fibre crimp 45° off radial, ABL solid fraction
0.9 vs stroma 0.5, crypt-area distribution) taken from ex-vivo data as priors — study/08 §1.3 plus the 2024–26 Girard
papers. "Unrecognisable from natural at any scale" therefore means: *measured* down to the rig's resolution, *seeded*
below it from population statistics, and the seam between the two invisible. That is a testable claim, unlike
"perfect fidelity", and it is the claim no one has made yet.

**Phases (proposed, not decided):**
- **M0 — Disney ground truth, this week, no hardware.** Request the dataset; fit their textures; measure our z against
  their mesh; sealed number. This is also the acceptance for Z1's inference.
- **M1 — rig v1 + safety sheet.** Laowa + rail + cross-polarised twin flash + chin rest; ISO 15004-2 irradiance
  calculation; depth calibration on a relief target and a prosthetic eye; then one volunteer under written consent.
- **M2 — shape-from-focus through the cornea.** Stack → per-texel z + confidence; corneal refraction correction
  (study/03 §2 already has the ray model); bridges as texels whose sharp slice lies above the floor's. Feeds Z1 as
  `measured`.
- **M3 — multi-flash normals.** Tube radius and profile from shading; cast shadows as the bridge oracle the probe
  wants.
- **M4 — the joint fitter.** T6 on all frames at once; knobs stay offsets (K1); the op journal records every fitted
  primitive as `measured`.
- **M5 — two pupil states.** Dilation frames; Pamplona rule + anchored/free strands; test against Warsaw dynamics.
- **M6 — clinic AS-OCT for two or three subjects** (partner clinic) to calibrate crypt depth and ABL thickness priors
  — the numbers study/08 §1.3 says nobody has published.
- **Below the floor:** the statistical layer from §1.3 and the Girard papers, gated by the probe at 0.2 mm and by a
  microscope-scale A/B once M2 gives us real slices to compare against.

## 6. P1 measured (2026-09-25): parallax in uncontrolled macro footage — not recoverable, and why

Correction to §4/§5 above: the three super-macro sectors in `ref-staging/` are Unsplash stills (Yukon Haughton), not
video frames, and at least two are different eyes — no parallax pair exists in the repo. So P1 ran on the best public
macro video found: *The Human EYE slow motion macro | IRIS in 4K*, Golemisoptics, 2019, BMPCC4K, 3840×2026, 30 fps,
1300 frames (fetched with yt-dlp, 52 MB, kept in the scratchpad only). Frames 810–1230 show the whole iris obliquely;
limbus fit gives **3.8 µm/px**, pupil 2.9 mm. Tools: `tools/parallax_survey.py` (per-frame pupil / sharpness / contact
sheet) and `tools/parallax_pair.py` (SIFT + RANSAC homography to remove the planar motion, DIS dense flow, cubic
smooth-field subtraction, residual split *along* and *across* the global motion direction — parallax can only live in
the along component, so the across component is the built-in noise floor). Outputs in `study/p1-parallax/golem/`.

| pair | pupil ratio | global shift | residual MAD along / across, whole iris | in a reflection-free sector |
|---|---:|---:|---:|---:|
| 1024 → 1025 (control, consecutive) | 1.002 | 0.2 px | 0.21 / 0.21 px | 0.18 / 0.19 |
| 1080 → 1152 | 1.017 | 3.8 px | 2.68 / 2.95 | 1.51 / 1.81 |
| 1024 → 1168 | 1.005 | 22.1 px | 3.45 / 3.27 | 1.54 / 1.58 |
| 1032 → 1216 | 1.070 | 28.0 px | 6.33 / 5.00 | 2.58 / 2.63 |

**Reading.** (1) The residual is isotropic — along equals across in every pair — so none of it is parallax. (2) It does
not scale with the shift (3.8 px and 22 px of motion give the same 1.5 px), so it is not geometric at all: it is the
flow's own error on soft, compressed texture, plus defocus drift between frames. (3) Over the whole iris the maps are
dominated by structures that *do* move differently from the tissue — the window and the eyelashes **reflected in the
cornea** — at 3–6 px. Those are the true enemy of any uncontrolled footage: the corneal reflection of the room has its
own parallax, larger than the iris's. (4) The physics is not refuted, it is simply out of reach here: the biggest
same-pupil motion is 22 px = 84 µm on the iris = **0.4° of eye rotation**, which puts a 150 µm bridge at 1 µm =
**0.28 px**, five times under this footage's 1.5 px floor and barely above the 0.2 px floor of the control.

**What it fixes for the rig.** The control pair is the honest noise floor of dense flow on this kind of texture when
nothing changes: **≈ 0.2 px**. A measurement wants ≥ 10× that, so ≥ 2 px of relative shift for a 150 µm bridge. At
2 µm/px that is 4 µm of parallax, i.e. **≥ 1.5° of eye rotation or a camera baseline ≥ 3 % of the working distance**
(1.5 mm at 50 mm). The rail plan in §5 (±10 mm at 50 mm) gives 15 px at the ends of the sweep — 75× the floor, with
the sweep's intermediate stops as consistency checks. And two things this video lacked are not optional: cross-polarised
flash (kills the corneal reflection *and* freezes the eye, so defocus and reflections stop competing with the tissue)
and RAW stills instead of 4:2:0 video. Nothing else needs to change in the plan; P1 turned "should be visible" into a
number, and the number says: not from YouTube, yes from the rig.

## 7. The bare-minimum rig, priced in Czechia (2026-09-25; X-T2 already owned)

| line | bare minimum | Kč | one step up | Kč |
|---|---|---:|---|---:|
| 2× optics | used EL-Nikkor 50 mm f/2.8 reversed on an M42 helicoid (36–90 mm) + tubes + M42→FX adapter; extension ≈ 150 mm, working distance ≈ 75 mm | ~1,750 | Laowa 65 mm f/2.8 2× APO, X-mount, new (Heureka 10,390–11,390) | 10,400 |
| rail | 4-way manual macro rail (Neewer/Andoer, Amazon.de, ~1 mm marks) or DIY M8 carriage (1.25 mm/turn) | 600–900 | same | 900 |
| flash | used Yongnuo YN560 III/IV (Bazoš 1,000–1,600) + PC-sync cord to the X-T2 sync port | ~1,250 | 2× used Godox TT600 + XT-16 | ~3,200 |
| polarisation | A4 linear film (Oehling ~500–700) over the flash + cheap 49/52 mm CPL on the lens as analyser | ~770 | same | 770 |
| chin rest | DIY: board, two M8 rods, printed chin cup + forehead bar | ~500 | AliExpress CR-7 ophthalmic chin rest ($148) | 3,100 |
| misc | fixation LED, dimmable desk lamp (pupil control), printed stepped relief target, 24 mm glass doll eye | ~650 | same | 650 |
| **total** | | **≈ 5,500** | | **≈ 19,000** |

Notes. Extension tubes on the XF 60 macro do not reach 2× (≈ 1:1). Raynox DCR-250 on an XC 50-230 at 230 mm reaches
≈ 1.8× at ≈ 125 mm working distance with autofocus — the cheapest route *if that zoom is already owned*. A 10–20 W LED
cannot freeze the eye at 1/250 at effective f/17; flash does it at 1/32 power. Diffraction at 2×, f/5.6 nominal
(f/17 effective): ≈ 11 µm on the iris, fine for 30 µm strands. Laowa 25 mm 2.5–5× (~9,000) only if the 5× sectors are
pursued. X-T2: interval timer + electronic shutter built in; free tethering via X Acquire. Eye safety: a speedlite at
1/8 power through two polarisers puts on the order of 1 mJ/cm² on the cornea per flash — orders below ISO 15004-2
Group 1 — but the number gets computed for the actual head, distance and power before a volunteer sits down.

## 8. Print-first rig (iori, 2026-09-25: "as much as possible with 3D printing")

Printing changes the rig from "cheapest parts that fit" to "parts designed around the measurement". What cannot be
printed: glass (lens, polariser film, CPL), the camera, the flash, steel rods / bearings / lead screw, a stepper and
its driver, LEDs. Everything else is a print, and four of the prints are better than what money buys.

**Printed parts, in the order they matter**

1. **Extension tube + reversing mount** (replaces the helicoid). A fixed tube from an M42→FX adapter (~200 Kč) to the
   lens's 40.5 mm filter thread, printed, matte black, with **knife-edge baffles** every 20 mm — cleaner than any
   helicoid. Reversed 50 mm: extension ≈ 150 mm → 2×, working distance ≈ 75 mm; a second tube at 200 mm → 3×.
   Focus is not in the lens: the rig moves. Cost: adapter + filament.
2. **Corneal shroud.** P1's real finding: the cornea mirrors the room, and that reflection has more parallax than the
   iris. A printed matte cone from the lens front to ≈ 15 mm short of the eye, black inside, with two slotted ports
   for the flash heads. Then the cornea reflects only black and the (cross-polarised) flash. No commercial equivalent.
3. **Chin rest + forehead bar**: two printed columns on a printed base, rack teeth for height, chin cup and forehead
   pad printed, the whole thing keyed to the bench so the eye lands at the tube's focus every session.
4. **Camera carriage on an arc, not a rail.** An arc of radius = working distance (≈ 75 mm at 2×, printed in two
   segments) centred on the iris, with **detents every 2° over ±12°**. The camera swings about the iris, so the iris
   stays centred and the view angle is known from the print, not from a micrometer. Parallax for a 150 µm bridge at
   12°: 31 µm = **16 px at 2 µm/px** (P1's floor: 0.2 px). A straight rail (8 mm rods + LM8UU + M8 screw, or a Tr8×2
   lead screw on a NEMA 17 from the 3D-printer parts bin, 10 µm/step) stays as the **focus axis** for the z-stack.
5. **Fixation arc.** A printed arm with LEDs at 0°, ±3°, ±6°, ±9° of gaze. The eye rotates by a known angle — a second,
   independent parallax source that costs one LED per position, and the one that tests the "eye rotation" case of §5.
6. **Flash arc with polariser clips.** One used speedlite moved between printed detent positions on a ring (8 positions
   at 45°, 30° elevation), film holder printed with an index mark so the film axis crosses the lens CPL. That is M3's
   multi-flash photometric stereo for the price of one flash.
7. **Calibration targets.** A stepped relief (0.1 / 0.2 / 0.4 / 0.8 mm) for the focus axis and the parallax scale.
8. **The iris phantom — the piece that makes the pipeline testable end to end.** Our own tissue model (ref 26, or a
   seeded iris) printed in resin at 12 mm: sheet, crypts, tubes, **bridges of 100 µm spanning 300 µm**, under a
   clear-resin dome of 7.8 mm radius as a cornea (n ≈ 1.5, close enough to 1.376 to test the refraction correction).
   Its geometry is known to the micron because we generated it, so capture → reconstruct → compare is a closed loop
   with no volunteer, no consent, no blinking. Needs an MSLA/SLA printer (25–50 µm); FDM only for the stepped target.

**Bought**: EL-Nikkor 50 (or Laowa 65), M42→FX adapter, polariser film + CPL, used speedlite + PC-sync cord, 2020
extrusion or 8 mm rods for the bench, LM8UU + M8 or Tr8×2 + NEMA 17 + driver + ESP32 (~600 Kč, optional), LEDs.
Estimated total **≈ 4,000–5,000 Kč** with the reversed enlarger lens, motorised focus included.

**Generator**: a Blender Python script (the CAD on this machine) with every dimension a parameter — working distance,
arc radius and detent pitch, tube length per magnification, shroud length, chin-rest height — exporting STLs, in
`tools/iris-rig/`. The phantom is exported from the engine's tissue model through the same script.

**Order**: tube + stepped target (prove the optics on the X-T2 with any 50 mm) → shroud + chin rest → arc + fixation arc
→ flash arc → phantom (as soon as a resin printer is reachable). Open: is a resin printer available (phantom, dome),
and who is the first subject (manual focus at 2× cannot be done on one's own eye).


The build lives in `hardware/` (README, BOM, prints/, gen/); §7–8 above are the research record.
