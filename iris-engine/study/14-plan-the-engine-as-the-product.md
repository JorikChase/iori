# 14. The plan — the engine as the product (2026-10-10)

Drawn on `study/13-anatomy-ledger.md`. iori's order: a reliable web renderer first, then upload-and-fit, then
floating, combable, colourable strands; Soulmake far later. Decisions folded in: the strands are a distorted Gabor at
several heights on the polar; edit points stand in a column and lift like fabric; inference fills what it can;
one camera with a front box light; "dynamics" means both the structure of strands and their motion with the pupil;
everything buildable from zero. The capture rig (study/12, `hardware/`) is parked. The 2-D detector (study/11 §5.6)
pauses; it is resumed only inside phase 5, where it is the automatic first pass, and only where that pass fails
visibly in the overlay.

Eight phases. Each has a goal, its steps, a **gate** that is measured and not argued, the files it owns, and what
iori decides or does. Phases are sequential except where marked; one phase is roughly two to four sessions.

## The invariants (from HANDOFF.md, still binding)

- A new rendering path is a **separately compiled shader variant**, never a branch in an existing bake.
- The bench and the contract run on a **fresh page**; `__uiContract.reach()` and `compare()` are `[]` before and after.
- Every eye republished with every change that moves its numbers; every number in the plan's section, wrong ones kept
  and corrected.
- Build a control before writing a conclusion. Look at a texture alone before trusting its numbers.
- Comments on their own line; grep `//.*gl\.` after shader edits.

## Phase 0 — the floor (half a session)

**Goal:** know what is deployed, commit what is loose, and remove the one bug that makes the renderer unreliable.

1. Commit the untracked research as a record: `study/12`, `hardware/`, `study/p1-parallax/`, `tools/parallax_*.py`,
   `study/13`, this file.
2. Hash the served `iris-engine/` against local; list what is local since `cd94185`. iori decides the deploy.
3. **The path-dependent measured load** (handoff 2026-09-28 §6): up to 1 MATCH2 between two loads of the same eye,
   the Load button's path differing from the review path. Find what `__irisTissueUI.load()` carries between eyes.
   This is phase 1's precondition: a loader that gives different eyes on the same file cannot be the product's loader.

**Gate:** eye 09 then eye 25 then eye 09 again on one page score within 0.05 MATCH2 of their fresh-page numbers.

## Phase 1 — ID v3: one eye file, one way in (2–3 sessions)

**Goal:** a versioned eye file that holds everything an eye is, with slots for what phases 2–7 add, loaded by one
code path that the page, the session file, the fitter and later Soulmake all use.

Today an eye is three files: `data/tissue-NN.json` (6.4 MB: outlines, fibres, veins, guides, sfib, svein, beads,
margin, cells, roots, ablTex), `tissue-NN.cal.bin` (0.5 MB measurements) and `data/case-NN.json` (1.3 MB legacy
genome), plus the legacy ID (`exportID`, v2) and the session file (`iris-session` v1, journal). No depth per level,
no materials, no fields.

1. **Schema** `iris-eye` v3, sections: `frame` (pose, pupil, limbus, bow), `structures` (margin curve, ruff beads,
   collarette ridge, crypt outlines with walls and rim, furrow arcs), `levels[]` (one per ledger §1 level: carrier
   fields orientation/spacing/phase/amplitude on the polar grid, turbulence, children params, height field, the
   column handles; extracted curves with `from`), `materials` (slots per sample class, RGB cells until K2), `albedo`
   (ablTex spec), `dynamics` (anchored flags, d-rules), `measurements` (the cal.bin, inline binary), `journal`,
   `provenance` everywhere. Empty slots are present and typed.
2. **Writer and reader** in one module (`eyefile.js`): the four eyes exported from today's loaded state; the reader
   is the only loader (Load button, URL `?eye=`, session file, the fitter's result all go through it). The legacy
   `exportID` stays for the legacy renderer and is marked frozen.
3. **Budget**: quantised binary sections streamed by class (S4 of the start-eye plan); target ≤ 2 MB per eye now,
   the 150 KB target of T5 stays the long goal and is measured each phase.
4. **Module boundary** for Soulmake: `IrisEngine.mount(canvas, eyeFile, opts)` and `unmount()`; the page becomes a
   client of it. No UI code inside the module.

**Gate:** the four eyes round-trip (today's load → write → read → review) bit-identical on MATCH2, strandCorr,
cellΔab; one eye file loads with no other request; the contract is `[]`.

## Phase 2 — the Gabor stack: levels, fields, crests (3–4 sessions)

**Goal:** the strands become fields on the polar at several heights; today's curves become extracted crests of them;
an iris can be generated from zero.

1. **The carrier per level** in `tissue.js` as a new bake variant: orientation, spacing, phase, amplitude on a fixed
   polar grid per level (F2's lesson: the grid is fixed at every quality, phases are cell-relative), a turbulence
   warp of (u, v) before evaluation (curl noise, two scales = turbulence and roughness), the children envelope
   (clump: amplitude and spacing tighten toward a guide; kink/wave: phase modulation; parting: a phase jump along a
   line; braid: B1 as is). Orientation priors per level from the ledger: ±50° lattice at S−2, radial elsewhere,
   circumferential under the sphincter, 45° crimp component on S0.
2. **Crests → curves.** A crest tracer on the evaluated field (NMS across the carrier, follow along it) yields
   curves in the shape today's `fibres`/`guides` have (xy, w, z, rgb, provenance `grown`). Parents become the
   field's guides: a parent spline is an amplitude ridge; its `count`/`spreadMm` are the envelope. Actualize keeps
   its meaning: a crest frozen into a curve with `from`.
3. **Fit side — demodulation per level.** Port F2's `placementFromPhoto` to the tissue grid: orientation, spacing
   and phase measured where the photo shows the level (deck inside the terrain's crypt class, sheet on the plateau),
   confidence per cell; below confidence the field is the prior. Today's traced fibres and guides are kept as
   `measured` curves and the field is fitted to pass through them (the field explains the curves, not the reverse).
4. **The new levels:** S−2 posterior lattice (rendered only where a crypt floor is deeper than the deck), S+3
   membrane remnants (a class with collarette anchors, free control points, three end types; none fitted yet,
   generated from zero).
5. **From zero:** `generate(seedSpec)` builds structures and fields with the ledger's prevalence tables; the ten
   procedural presets are re-expressed through it.

**Gate:** (a) eye 26 and 09 with the deck and sheet rebuilt as field + crests score ≥ today's strandCorr and within
0.5 MATCH2; (b) a from-zero iris passes the probe at 0.2 mm (study/11 §32: no table, no walls) and iori judges it in
the overlay beside eye 26; (c) a texture-only debug view of every level shows no shear or seam at u = 0.

## Phase 3 — depth: L1, L2, L3 and the fabric lift (3 sessions)

**Goal:** strands at heights, rendered as tubes up close, the four eyes republished on the layered model.

1. **L1 the depth pass.** Every crest a height from its class default (ledger §1), moved by evidence: weave
   (over/under at crossings, today 86 % with cycles unresolved), brightness, position against a hole's edge; bridge
   candidates by iori's criteria drawn for iori before anything lifts; heights the evidence cannot set are flagged
   `unplaced` and drawn distinct. Arcs: `float` + `sag` per crest; per-point heights only on S+3.
2. **The column and the fabric lift.** Handles on the polar grid, one column across levels; a lift of level k by h
   at (u, v) raises every level above by h · falloff(distance / spacing_k); nothing interpenetrates. An op in the
   journal.
3. **L2 the renderer.** The segment grid traced in the photo shader where a screen pixel is finer than a slab
   texel; a K-layer stack (the baked slab per level) beyond; the same per-pixel texture, colour chain and light on
   both; the switch per tile, never per frame.
4. **L3** the four eyes republished layered; `T.layered` becomes the default; the flat path kept one version.

**Gate:** MATCH2 on the four eyes not below the flat model; hcorr ≥ 0.74 (L0's number on eye 26); the section cut
and the probe show tubes with air under bridges; a lift op undoes bit-identically.

## Phase 4 — one camera, submarine light (2 sessions)

**Goal:** the default view and the probe are one camera; a person zooms from the whole eye to a strand's surface with
no seam, and inside the chamber flies with WASD under a headlamp.

1. One camera state: position, look, up; `zoomPhoto` becomes a distance along the look ray. Outside the cornea the
   ray refracts and the orbit behaves as today (T2: orbit about the point under the cursor). Crossing the cornea
   (the probe range) turns refraction off for the view ray and switches input to WASD + mouse look; the transition
   is one frame of identical pixels (the cornea's refraction is continuous at the surface).
2. **The light:** a front box light attached to the camera (area, size and intensity knobs; the flash's spectrum).
   Outside the eye it is today's ring flash seen through the cornea; inside it is the headlamp. SOFTNESS stays off
   by default.
3. The probe's exact path and the viewport's accumulated path produce the same picture of the same tile (phase 3.3
   made the texture agree; here the light and the colour chain agree). `T.probe(opts)` remains as the offline API.
4. Contract rows and `controls.json` for the camera; the gaze rules (gaze.js) still hold outside the eye.

**Gate:** a scripted flight from 110 mm to 0.3 mm above a bridge of eye 26 with per-frame band contrast continuous
(no step > 5 % at the switch); fresh-page contract `[]`; iori flies it.

## Phase 5 — the fit on the page (3–4 sessions)

**Goal:** drop a studio photograph, watch the eye grow, work on it. Nothing leaves the device.

1. **T8.0** measure the native fitter on eye 26: seconds, peak memory (a float32 Lab of a 2000² crop is 48 MB).
2. **T8.1** Pyodide in a Worker: `layer_proof.py` unchanged, numpy + opencv wheels fetched on first drop and cached;
   the same JSON out; time it. Fall back to OpenCV.js + a JS port only if the Worker cannot hold it on the iPad.
3. **T8.2** the pipeline on the page: drop → mask (studio photos are isolated; `isIsolated`, `renderMask`,
   `rimFromPhoto` handle a lid or a highlight; T8.3) → align (`autoAlign`) → the layer fit in stages, each stage
   re-baking what has arrived (holes → fibres → veins → guides → beads → the carrier demodulation of phase 2 →
   texture calibration automated from the sheet dump → de-bias → measure); stop and resume at any stage; the eye file
   of phase 1 written at the end; the fit never yields with `setTimeout` (MessageChannel).
4. **The first pass** is today's detector plus phase 2's demodulation. P3b and later detector steps resume only where
   the overlay shows the first pass failing on the new photos.
5. Progress and status in the Fit window; the photo and the file stay in the browser; a one-line statement on the
   page that nothing is uploaded.

**Gate:** a studio photograph (iori's own, from the studio session) from drop to a loaded eye with no console error,
scores within 1 MATCH2 of the offline route on eye 26, time and peak memory recorded on desktop and iPad.

## Phase 6 — materials and the editor (3–4 sessions)

**Goal:** comb, lift, colour, add and remove, every change an op.

1. **K2 materials:** melanin, stroma, pigment (and mie) per sample instead of RGB; the spectral LUT at render; the
   per-photo grade stays in `view`. Generated strands stop being pale. The sphincter ring as a material annulus.
2. **The top-view editor** (Design window under the layer model): comb = a brush that bends the orientation field
   and the crests follow; lift = the column handle of phase 3 with a shadow preview; colour = a material brush on
   samples or on a selected strand; actualize on click; add/remove a crypt (outline brush), spot, nodule, furrow
   brushes (the three "—" rows of the feature ledger); select by provenance.
3. Every edit through `T.apply`/`T.undo`; the session file and the eye file carry the journal; `tools/brush_probe.js`
   says which tools change the picture.

**Gate:** every control in ledger §4 reachable (contract rows); a combed, lifted, recoloured eye 26 saved, reloaded
and bit-identical; cellΔab on the four eyes not worse under materials than under RGB (K0 gate).

## Phase 7 — dynamics (2 sessions)

**Goal:** the pupil scalar d moves the layered model the way the ledger §5 says.

Crypts widen with d (outlines scaled across v); furrows deepen and lengthen; ruff scallops separate; Schwalbe
folds deepen; collarette outward; pupil centre drift; the bow rises; **anchored strands** hold their length (a
bridge goes slack or taut, the arc re-solved), **free** strands (S+3) follow their anchors only. Hippus as before.

**Gate:** eye 26 at pupil 2, 4, 8 mm with no tearing of any level; the Warsaw dilation videos (study/12 §4) as a
visual reference for the crypt and furrow rules; iori judges.

## Phase 8 — from zero, polished (2 sessions, then ongoing)

**Goal:** a person with no photograph makes an iris, and the page is the product.

Presets re-expressed through `generate()`; the ledger §2–§3 prevalence tables as the randomiser; the casebook
generators (§7) as named variants added one at a time; the start eye and the cold-load timeline (S0–S2 of the
start-eye plan) on desktop, tablet and phone; the device pass of the shell.

**Gate:** cold load to a usable eye under 2 s on desktop and 5 s on a phone; a from-zero eye and a fitted eye are
told apart by iori only at the probe scale.

## What stays parked, and why

| item | state | resumes when |
|---|---|---|
| the capture rig (study/12 §8, `hardware/`) | research committed, no parts bought | iori wants measured depth as a claim; phase 3's inference is the stand-in |
| the 2-D detector P3b–P4 | paused | phase 5, only where the first pass fails visibly on the studio photos |
| Soulmake | not started | phase 1's module boundary and eye file are the only work done for it |
| mammals, pathologies beyond S+3 | ledger §7 | phase 8, one at a time |

## Order, and what each phase hands the next (re-sorted 2026-10-10: materials first, iori)

0 floor → **1 eye file** (+ 1b the legacy pruned from the load path) → **2 materials** (K2 per sample, K2b lateral
subsurface) → **3 Gabor stack** (+ 3b the grain smear) → **4 depth** → **5 one camera** → **6 fit on the page** →
**7 editor** (comb, lift, colour, brushes) → **8 dynamics** → **9 from zero, polished**. The phase texts below keep
their original numbers (2 Gabor, 3 depth, 4 camera, 5 fit, 6 materials + editor, 7 dynamics, 8 from zero); this list is
the order they run in. iori: "materials are a large part of good rendering so it should take priority".

Phases 5 and 6 of the list (camera, fit) can run in parallel in two sessions under the two-sessions-one-tree rule.

**1b — the legacy pruned from the load path (added 2026-10-10).** iori sees the old engine for a couple of seconds on
init: the stand-in frame is the procedural renderer with the eye's globals, then the layer model arrives. Inventory every
legacy path still executed on a load (the procedural bake, LIC strands, splat upload, the F2 carrier bake, the legacy
fitter's case import), keep only what the layer model needs (today: the frame and the fallback), remove or defer the
rest, and measure the cold-load timeline before and after (S0 of the start-eye plan). Gate: the layer model is the first
picture on screen, no procedural frame before it; the contract `[]`.

**K2b — lateral subsurface (added 2026-10-10, iori: "shouldn't they have subsurface?").** The colour model is vertical
only: light goes down through melanin and stroma and comes back at the same pixel. Add lateral transport: a tissue-space
scattering of the irradiance weighted by stroma density and depth before the albedo, so crypt walls glow from light
entering the sheet beside them and thin strands are translucent at their edges. Gate: crypt-wall brightness profiles
against the photos by region (`tools/crisp` samples them), cellΔab not worse.

**3b — the grain smear (added 2026-10-10).** Softness off shows the photo's grain. The texture study measured that the
photo's own speckle is isotropic at 5–9 µm and 43 % directional at 14–37 µm in crypts (11 % on the sheet): the photo turns
grain into short streaks at that scale and the render does not. A line-integral-convolution pass on the baked region
texture, in polar space, along the S0 orientation field (the flow field until the carrier exists), brightness-gated so
bright pixels propagate, a slight sharpen across the direction, iterated; **albedo only, never the displacement**; a
separately compiled bake variant. Gate: the render's directional share per band matches the photo's by region, and no
further. Whole-eye bake only (iori); no analytic per-pixel variant.

## What iori does

- Phase 0: the deploy decision. Phase 1: approves the schema's section list before the writer is built. Phase 2:
  judges the from-zero iris beside eye 26 in the overlay. Phase 3: looks at the drawn bridge candidates before any
  lift. Phase 4: flies the camera. Phase 5: brings the studio photographs (both eyes, the full-resolution file).
  Phase 6: names the brushes that are missing. Phase 7–8: judges.
