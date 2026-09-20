# Iris Engine — working notes

A photoreal, fully procedural human iris for the browser (WebGL2, no build step), with a fitter that
recreates real iris photographs as loadable **iris IDs**. Everything in this folder is the engine;
`../meta-iris.html` is the original realtime experiment it grew from (linked from the header).

## Run

```bash
python3 iris-engine/serve.py 8768
```

Then open http://localhost:8768/iris-engine/. In Claude Code the launch config is `iris-engine`.
The server also accepts `POST /save/<name>.json` and writes into `iris-engine/ref/` — that is how
the bench, the alignments and the texture study land in the repo. Any static server works for
viewing; only saving needs `serve.py`.

## Files

| path | what |
|---|---|
| `index.html` | the engine: shaders (bake, bundle, photo, post, blit), genome, presets, ID import/export, UI |
| `fit.js` | the fitter: alignment, pose solve, scoring, global fit, structure detection, refinement, bench, casebook, texture study |
| `serve.py` | dev server with the save endpoint |
| `study/00-summary-and-spec.md` | **the spec**: decisions, phase logs, benchmarks, roadmap — read this first |
| `study/01…06-*.md` | anatomy/optics, colour, rendering literature, photography, procedural synthesis, texture study |
| `ref/*.jpg` + `ref/ATTRIBUTION.md` | 43 Wikimedia Commons reference photos (licences verified) |
| `ref/refs.json` | the reference list with colour category and notes |
| `ref/align.json` | stored alignments per photo (pupil, limbus, catchlight; normalised) |
| `ref/cases.json` | the casebook: alignment + pose + genome (ID) + scores + texture stats per photo |
| `ref/bench-<tag>.json`, `ref/texture-study.json` | bench runs and the texture study data |

## The shell

A Windows 98 style top bar with six mode windows — CAMERA, MATERIAL, RELIEF, FLOW, FIT, DESIGN — that float, drag
by their title bar, roll up, close and remember their layout. Knobs are scrubbers: drag the ruler (one width = the
whole range), wheel for fine steps, double-click to reset. **Presets ▾** holds the ten colour genomes, **Fitted ▾**
every fitted case from the casebook ranked by MATCH. The quality select, ID ↓ / ↑ and CAP 4K sit in the bar.

## The panel (what the knobs mean)

- **Presets** ICE … D·BR: the ten chapter-02 eye colours (starting genomes). **FIT·09 / 25 / 26 / 35**: whole fitted irides
  from the casebook, editable with every slider below. SEED re-rolls structure;
  NEW SEED randomises. Everything below is a gene of the current iris.
- **PUPIL** (mm), **ELEV / LIGHT / SIZE / ROOM / LID** (studio light), **EV / F-STOP / FOCUS / KELVIN /
  GRAIN / BLOOM** (camera), **SUN / SOFT / RING / TWIN** (source shape).
- **PIGM / STROMA / PHEO / YELLOW / MIE / RING** (material), **WARP / COLLAR / CRYPT / FURROW / RELIEF**
  (structure). Every value transitions exponentially; bake-affecting genes re-bake while they move.
- **GRID** (mm grid), **REFRACT** (physical indices on/off), **HIPPUS**, **ATLAS** (baked maps),
  **MAPS** (sampled height / material), **FIELD** (seeded background fibre field on/off).
- **ID ↓ / ID ↑**: the iris ID as JSON (and in the URL hash when short). **QUALITY** select: DRAFT / NORMAL / FINE /
  ULTRA / CAPTURE (atlas, field grids, fit resolution, splats, shader steps, accumulation). **FILMIC / REF / CAP 4K**.
- On a fitted iris the material sliders modify the fitted fields relative to the fit; **FIT·COL / FIT·REL / FIT·FLOW**
  blend each layer between the fitted fields (1) and the seeded default (0); **NEW SEED** re-rolls only the procedural share.
- The eye looks toward the cursor; wheel changes the camera distance.

Debug views 1–12 are listed in the comment at the top of the photo shader (`state.debug`).

## Designing (DESIGN tab)

DESIGN ON (or **D**) fixes a frontal camera; wheel zooms the view about the cursor, space-drag pans, Escape resets.
Tools: PAINT / ADD / SUB / SMOOTH / SMEAR on the selected LAYER (any coarse field: materials, height, brightness,
flow direction, warp, spacing, coherence, presence weights); DENT / BUMP / STREAK stamps become relief splats;
COLOR stamps carry a material tuple (the COLOUR input and PICK / Alt-click convert through the LUT, so mixing is
pigment mixing); REPEAT paints n-fold around the ring; FLOW elongates stamps along the strands. UNDO (Ctrl-Z), CLEAR.
Keys: B A X S M N U K C I select tools, [ ] size. Every stroke is numbers in the ID (fields, splats, paint splats).

## Fitting a photo (FIT PHOTO)

1. **PHOTO…** or a **reference photo**. **AUTO ALIGN** runs on load: isolated-on-black macros get
   an exact ellipse from the iris silhouette; whole-eye photos get the pupil (roundest dark blob over
   several thresholds), the limbus (RANSAC circle on radial edges, lids ignored) and the catchlight.
   Drag the markers to correct; wheel resizes. **SAVE ALIGN** stores it; **ALIGN ↓** writes `ref/align.json`.
2. **SOLVE POSE**: camera distance, view offset (render pupil on the photo pupil), tilt, pupil mm,
   key direction — analytic, from study/01.
3. **FIT GLOBAL**: starts from the best of the ten presets, then Nelder–Mead over the colour and zone
   genes against the radial L*a*b* profiles (+ a weak pixel term).
4. **DETECT STRUCTURES**: crypts and the collarette from the unwrapped photo into the object lists.
5. **REFINE OBJECTS**: per-crypt optimisation against pixels.
6. Views: PHOTO / RENDER / DIFF / SPLIT / **POLAR** (unwrapped photo over unwrapped render — the
   texture harness). Score line: **MATCH %** = ½ SSIM (quarter-res, iris mask) + ½ (1 − ΔE/40),
   plus PSNR, ΔL*, Δab. Speculars are excluded from every score.

## Testing

- **BENCH ISO**: the isolated-on-black macros only (no lids, sclera or perspective) — the engine's
  own errors. Use this first for every engine change.
- **BENCH ALL**: all 38 benchable references. **PHOTOS… (BULK)**: your own photos; the log reports
  the success rate at MATCH ≥ 80 and ≥ 60.
- Both write `ref/cases.json` and `ref/bench-<tag>.json`; **CASEBOOK** renders every case live
  (photo | render | diff, scores, auto-diagnosis). **STUDY** writes `ref/texture-study.json`.
- Cadence: BENCH ISO after every engine change (≈ 10 s), BENCH ALL before a phase closes, and read
  the casebook's worst cases for the next change.

## Where it stands (2026-09-12)

Bench v36: mean MATCH 37.4 % over 38 photos, best 59, none ≥ 60. BENCH ISO v58 (isolated set: exact
alignment, per-cell fields through the engine's coordinate map, ridge list, fitted relief splat field, photo-derived
rim sharpness and chroma gain): mean 67.5 %, three of four ≥ 60 %, best 74 %. Colour is within Δab 6 on the
blue / grey / hazel eyes; structure (SSIM median 0.15) is the gap. The texture study (study/06)
gives the numbers the fibre generator must hit.

## Roadmap (in order) — see HANDOFF.md for the current priority list and study/07 for the field/editing design

0. **Control fields + ID v2** (study/07): material, presence and flow fields on coarse polar grids;
   LIC strands along the flow; two-material shading; photo → fields; comb/warp/paint tools; provenance.


1. **Isolated set to ≥ 80 %** before whole-eye photos: exact alignment is free there, so everything
   that remains is the engine.
2. **Spectral colour** (done: 4-axis LUT with a yellow absorber; greens and ambers reachable).
3. **Fibre layer rewrite**: 35–70 µm strands (~500 around), ridge/gap ≈ 4× linear, local contrast
   ≈ 0.35, organised by the bundle objects; judged in POLAR, scored by BENCH ISO.
4. **Two-material shading**: strand vs gap materials, contact shadow in the gaps, anisotropic sheen.
5. **Fibrous collarette** (frill with feathered edges; the Fourier curve stays as the centreline).
6. **Fitter**: lid chords in the mask, source shape/size and rotation as fit parameters, bundle and
   furrow detection, joint refinement; unwrap through the engine's own forward path.
7. **Tiers, compact ID, casebook as a site page** (spec §3, §12).
   **→ Since 2026-09-20 the working roadmap is spec §31 (tissue layer model, tasks T1–T9); start at
   `handoffs/2026-09-20-tissue-layer-model.md`.**
8. **Afterthought, after everything above — all mammals** (spec §29): one system from lemur to horse with the
   human iris as one point in it. Not started; only "keep the doors open" rules apply until then.

Decisions and history: `study/00-summary-and-spec.md` §1–§16.
