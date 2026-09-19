# 06 — Instrument UI: the dish as an optical machine

Scope: look, controls and interaction model of the petri instrument, from the owner's brief of a precise Blade Runner 2049 style of lenses, mechanics and analogue computers.

Verification: claims about the film's screen graphics come from the sources in §9 (Territory Studio, vfxblog, Maxon, Architosh, Deadline). Anything from memory or inference is marked **[unverified]**.

---

## 1. The BR2049 screen-graphics language, as reusable principles

### 1.1 World logic

Territory Studio (creative director Andrew Popplestone, creative lead Peter Eszenyi) designed the screens with supervising art director Paul Inglis. The premise is the Blackout, after which technology took another path. Popplestone was asked to "imagine a world where digital technology no longer exists" (Territory case study). Villeneuve's direction, per vfxblog: "abstract, organic, optical, physical". No LED walls, no touch-screen gloss. The team researched E-Ink microcapsules and bioluminescence, then spent weeks shooting through lenses, cine projectors, microfiche and card systems, plus macro photography of fruit and bone, before touching CG.

P1: **every readout looks produced by a mechanism** — a projected slide, a lens stack, a card, a meter. A UI element needs a plausible physical cause (a ring rotates, a plate slides, a lamp warms up).

P2: **nothing decorative**. vfxblog reports all graphics were story-specific. Every glyph is a live value, a scale, or a label. No fake hex dumps.

### 1.2 Faction palettes

- **LAPD**: utilitarian, military-referenced, worn. Warping, ghosting, colour degradation, screen burn; the baseline scan used a washed-out green on 4:3 CRTs (vfxblog). K's spinner screens are deliberately dilapidated to signal his status (Territory, Maxon).
- **Wallace Corp**: per Territory, the screens are pure, minimal, geometric black and white. The remembered amber is the *architecture's light*: Dennis Gassner's Wallace office is a platform in a concrete box surrounded by water, caustic light moving over wood, inspired by a Kyoto temple (Deadline). So our "Wallace" theme is near-monochrome graphics under an amber lamp, not orange widgets.
- **K's apartment**: small, low-contrast, domestic; Joi's projector rides a ceiling rail **[unverified]**. Lesson: one light source, one moving mechanism.

P3: **theme = lamp, not paint**. Palette comes from illuminant and substrate (e-ink paper, green phosphor, amber tungsten), graphics in one ink.

### 1.3 Typography **[unverified as to specific typefaces]**

Conventions: condensed grotesque capitals with wide tracking, small sizes, tabular numerals, serial and part codes, mixed scripts. The Market signage mixes kanji, Latin, Cyrillic and Arabic, and the Denabase shows Japanese error messages, reading as ageing hardware (Territory, vfxblog).

P4: **labels are engraved, values are displayed**. Two voices: static (caps, tracked, low contrast) and live (mono, tabular, brighter).

### 1.4 Layout grammar

Sparse, asymmetric, mostly black. One dominant image, thin rules, registration marks at corners, small label clusters at the edges, scales on one or two sides only.

P5: **one subject per screen; chrome is under 25% of the pixels and under 10% of the luminance.**

### 1.5 Motion grammar

The morgue sequence is the template: lenses physically shift into position before each new magnification is revealed (Maxon). Moves are discrete and staged. Derived rules:

- **Stepped moves**: travel → overshoot by 1–2% → settle (critically damped spring, 180–320 ms).
- **Refresh wipes**: values re-ink like e-paper, a 60–90 ms inverse flash or top-down wipe on change, not a fade.
- **Rack focus** between magnifications: the image defocuses, the turret moves, focus is re-found with slight hunting.
- **Lens breathing**: 0.5–1.5% field-of-view change when focus moves.
- **Scan lines / shutter bars** only during capture or reads.

P6: **latency is staged, never hidden**. If the engine needs 300 ms to stream bricks for a new rung, the turret takes 300 ms to rotate.

### 1.6 Texture

Territory built in age with warping, ghosting, colour degradation and glitches. Our list: optical blur at panel edges, 1 px chromatic fringing on bright strokes, dust and fine scratches on a glass layer, moiré only when two scales overlap, faint light leaks, stacked glass planes with 2–6 px parallax against pointer/gyro.

### 1.7 Sound **[unverified — inferred, not from interviews]**

Relays, solenoid clunks, servo whirr pitched to travel, lens-ring clicks, transformer hum under the lamp, card shuffles in the archive. Dry, short, quiet, over a deep room tone.

### 1.8 The two precedent interactions

**Morgue bone scan ("enhance").** Per Maxon/vfxblog: pelvic-bone tissue at escalating magnification and abstraction, styled as a futuristic electron microscope in a mechanical/optical frame; lens elements move between steps; the serial number is the payoff. It played live on set so actors performed against it. K directs the operator verbally to go closer, echoing Deckard's Esper **[unverified, from memory]**. Take: (a) zoom is a ladder of rungs with a mechanical transition; (b) each rung changes *rendering character*, not just scale; (c) a reticle marks the target before the move, so it reads as intent; (d) commands are terse verbs: *closer, back, hold*.

**Denabase microfiche reader.** Territory describes a mechanical DNA card archive blending microfiche reader and database UI; vfxblog adds backlit cards and K reading hundreds by eye. Take: records are *physical transparencies* pulled from a drawer and slid under a lamp; browsing is lateral travel with detents; comparison is two plates on a light table. This is our Dish ID archive.

---

## 2. Real instruments to borrow mechanics from

| Source | Mechanic to steal | Why it matters here |
|---|---|---|
| Cine focus ring (≈300° throw vs ≈90° on stills lenses) | long throw, hard stops, engraved distance scale, witness mark | focus z: long throw = precision without modifier keys |
| Stills lens DOF scale | paired aperture marks either side of the index | depth of field in µm read against the focus scale |
| Aperture ring | click stops; de-clicked on cine lenses | detent vs smooth is a user mode |
| Knurling | each ring feels different | each ring gets its own tick density and width |
| Microscope nosepiece | 4–5 objectives, positive detent, parfocal | zoom rungs; keep focus z across rungs |
| Coaxial coarse/fine focus | fine knob inside coarse, graduated in µm | two-rate drag on one control |
| Mechanical XY stage | coaxial knobs, verniers reading 0.1 mm | stage jog and readout convention |
| Stage micrometer / eyepiece graticule | crosshair, divided scale, counting grid | reticles true to scale at every rung |
| Filter slider / condenser turret | positions BF / DF / Ph / DIC with detent | illumination selector |
| Condenser iris | continuous; contrast vs resolution | merged into the aperture ring |
| Optical comparator / profile projector | ground-glass screen, rotating protractor bezel, digital readout | layout A is this machine |
| Microfiche reader | glass carrier sliding under a fixed lens; grid index (A1…G14) | archive navigation |
| Hasselblad / Arri viewfinder | frame lines, centre cross, data strip outside the image | capture overlays sit *outside* the picture |
| Analogue computer patch panel | jacks, cords, 10-turn coefficient dials | genome bay: layers as modules, expressions as patches |
| Nixie / VFD / flip-dot | segmented digits, per-digit change with audible flip | counters (sim time, op count) |
| Moving-coil meter | needle with ballistics (VU: ~300 ms rise), mirrored scale | bounded metrics (meshedness 0–1, occupancy %) |
| Strip-chart recorder | paper moves, pens write, event marker pen in the margin | metrics over time + op marks |
| Oscilloscope phosphor | persistence decay, intensity ∝ dwell | oscillation-period display, phase portraits |

---

## 3. Control inventory mapped to the engine

Precision mode is uniform everywhere: **Shift = ×0.1, Alt = ×0.01, double-click/Enter on any readout = type a value with units**. Wheel always means "this control's natural axis".

| Control | Physical metaphor | Engine parameter | Interaction | Precision mode |
|---|---|---|---|---|
| Objective turret | 5-position nosepiece 1×/4×/10×/40×/100× | view scale rung; LOD/brick tier; render character per rung | click objective; `1`–`5`; `[` `]`; pinch crosses a rung at threshold with detent | continuous "zoom tube" 0.8–1.25× within a rung via Ctrl+wheel |
| Focus ring | cine focus ring, 300° throw, hard stops at slab top/bottom | focus plane z (µm) through agar slab | drag along ring; wheel over viewport; `Q`/`E` | coaxial fine ring: 1 tick = 1 µm at 100×, scaled per rung |
| Aperture ring | click-stop iris | DOF width + contrast transfer (render only) | drag; `A`/`Shift+A` | de-click toggle for smooth |
| Illumination selector | condenser slider BF / DF / PH / DIC / FL | render mode + channel mapping (FL: which field is which fluorophore) | click position; `I` cycles | FL sub-wheel selects excitation channel |
| Lamp | rheostat with warm-up | exposure/gain | drag; `L` + wheel | numeric EV |
| XY stage | coaxial stage knobs + verniers | view centre (x, y mm) | drag viewport = pan; arrows jog; two-finger pan | arrows = 1 vernier division of current rung; type `r 12.5 θ 40` |
| Tool rack | instrument tray: needle, loop, pipette, stencil, flake tweezers, repellent dropper, antibiotic disc forceps, obstacle, scalpel (agar scratch) | placement op type + its parameters (species, dose, radius, depth, dilution) | click/`T` then letter; long-press on touch opens tool parameters | each tool has a parameter card with numeric fields |
| Time transport | tape transport + time-lapse intervalometer | sim dt multiplier; pause; step; seek to checkpoint | `Space`, `,` `.` step, jog wheel scrubs | seek by typed sim time `t=36h12m` |
| Strip chart | paper recorder with margin event pen | harness metric history; op timeline marks | hover = readout; drag = scrub; click mark = select op | zoom time axis with wheel; pen assignment per metric |
| Genome bay | cartridges in slots + patch panel | layer stack order, algorithm per layer, parameter expressions | drag cartridge between slots; pull to eject; patch cords link outputs to params | 10-turn dial per coefficient; expression text field |
| Specimen archive | slide drawer / fiche carrier | Dish ID list; load, fork, compare, import/export, URL hash | open drawer, slide cards laterally; drop file to import | fiche grid address (C7) + text search |
| Telemetry | meters, counters, scope | fractal dimension, front velocity, meshedness, biomass, oscillation period, brick occupancy, step ms | read-only; click to pin to strip chart | click toggles units/sig-figs; copy value |
| Capture | shutter release + film back | still, 4K tiled still, time-lapse sequence | `C`; hold for burst; mode dial | frame lines, tile count, interval typed |

Notes:

- Render character per rung is the bone-scan lesson: 1× reads as a photographed dish, 10× as stereo-microscope texture, 100× as phase-contrast cytoplasmic streaming.
- Parfocality: a rung change keeps z, then hunts ±2% for 200 ms (cosmetic).
- Scale-dependent metrics (fractal dimension) draw their measurement window as a bracket on the reticle.

---

## 4. Precision placement

### 4.1 Coordinates

One canonical frame: dish-centre origin, millimetres, +x right, +y up, z = 0 at the agar surface, negative into the slab. The readout always shows both cartesian `X +12.50 Y −03.25 mm` and polar `R 12.92 mm θ 345.4°` (θ clockwise from an index notch at 12 o'clock). The rim carries an engraved degree ring. A Dish ID stores cartesian only.

### 4.2 Snapping

Snap sources, each toggled on a "stops" lever bank: grid (pitch per rung: 10/2.5/1/0.25/0.1 mm), concentric rings (5 mm), angles (15°, Shift 1°), existing inocula centres and edges, colony front (nearest point on the biomass iso-contour), equal spacing. Snap radius is 8 CSS px at any zoom. When snapped, the crosshair gap *clicks shut* with a tick; `Ctrl` suspends snapping.

### 4.3 Numeric entry and nudging

Typing a digit while a tool is armed opens the entry strip: `12.5, -3.25`, `r12.9 a345`, relative `@+0.5,0`, with unit suffixes `mm`/`um`. Arrow keys nudge by one micrometer click: 100 µm at 1×, 25 µm at 4×, 10 µm at 10×, 2.5 µm at 40×, 1 µm at 100×; Shift ÷10. Each click plays a detent and advances a drawn vernier by one division.

### 4.4 Ghost preview

The armed tool projects its footprint at true scale: needle = 0.3 mm disc with depth tail; loop = 2 mm ring; pipette = wetted disc from volume, with falloff as 3 iso-rings; stencil = mask outline; antibiotic disc = 6 mm circle plus dashed predicted diffusion radius at +24 h. SVG draws the ghost at low zoom; at high zoom the engine draws it from the same op struct so it matches what will be written. Under 6 px it becomes a fixed-size marker.

### 4.5 Depth

A side-on **slab gauge** beside the reticle shows surface, slab thickness and tool tip. `D`+wheel or the pen barrel button sets stab depth; typed as `z-1.2`. Surface-only tools grey it out.

### 4.6 Strokes

Loop streak, scratch and repellent line are stroke ops: a polyline resampled at fixed arc length (0.1 mm) with per-sample pressure. Dilution model: the loop carries a load `L` that decays with deposited length, `L(s) = L0 · exp(−s/λ)`; lifting and "flaming" (key `F`) resets to zero, crossing a previous streak reloads from what it touches. That reproduces four-quadrant streak plates. Pen pressure → contact width; mouse speed → width. A 0.3 mm trailing-string stabiliser; Shift constrains to lines and arcs.

### 4.7 Undo as a timeline

No stack, just the op list: id, sim time `t`, tool, parameters, geometry. Undo disables the last op and re-simulates from the nearest checkpoint ≤ `t`. Any op can be selected on the chart margin, edited, moved in time or muted; the downstream chart goes dashed until re-simulated. Ops are stamped in *sim* time and the engine is deterministic per seed, so a Dish ID reproduces exactly; wall-clock is metadata.

### 4.8 Touch and pen

One finger = tool action (pan when none armed); two = pan/zoom with rung detents; long-press = a loupe 60 px above the finger with reticle and coordinates. Pointer Events give `pressure`, `tiltX/Y`, `twist`; use `getCoalescedEvents()` for stroke fidelity. Palm rejection: ignore `touch` pointers while a `pen` pointer is down.

### 4.9 Accessibility

Keyboard-complete: every control is focusable with `role="slider"`/`radiogroup`/`listbox` and `aria-valuetext` with units. A keyboard reticle (arrows + Enter) places ops without a pointer. `prefers-reduced-motion`: cuts instead of travel, no breathing, parallax or flicker. `prefers-contrast` or a manual switch: pure-white ink, 2 px rules. Text ≥ 11 px; live values 7:1. Colour is never the only channel (pens differ by dash). Every sound has a visual tick.

---

## 5. Screen composition

### A — "Eyepiece"

A profile-projector face: circular viewport dominant, concentric engraved rings around it (degree bezel, focus, aperture), turret at top, everything else in the four corners.

```
+--------------------------------------------------------------+
| DISH 7F3A-C7   SEED 0091            T+036:12:40  x64  [>][||]|
|            .--------[ 1x 4x (10x) 40x 100x ]--------.        |
|  TOOLS   /   .- - - - - degree bezel - - - - -.      \  TELEM|
|  needle |   /                                  \      | D 1.71|
|  loop   |  |              +                     |     | v 0.42|
|  pipet  |  |          dish viewport             |     | M 0.18|
|  disc   |  |                                    |     | B 3.2e6
|  ...    |   \                                  /      | P 98 s|
|          \   '- focus ring ==|== aperture ring-'     /       |
|           '------------------------------------------'       |
| X +12.50 Y -03.25  R 12.92 th 345.4  Z -0.00  [strip chart ~~]|
+--------------------------------------------------------------+
```

Strength: iconic; rings sit where a lens's rings are. Weakness: a circle wastes ~21% of a square and far more of 16:9; at 100× the circle is pure vignette.

### B — "Bench"

```
+------------------------------------------+-------------------+
|                                          | TURRET  o o (o) o |
|                                          | FOCUS  ====|===== |
|              dish viewport               | APERT  ..|....... |
|            (square, reticle)             | ILLUM  BF DF PH.. |
|                                          +-------------------+
|                                          | TOOL RACK         |
|                                          | GENOME BAY [][][] |
+------------------------------------------+ TELEMETRY  meters |
| STRIP CHART ~~~~~|~~~~^~~~~~|~~~~~  ops: ' '  '   '    > x64 |
+--------------------------------------------------------------+
```

Strength: efficient, familiar, easy to build and test. Weakness: reads as skinned software; the rack competes with the specimen.

### C — "Archive reader"

```
+--------------------------------------------------------------+
| [drawer: |7F3A|7F3B|8C01|....]   lamp (*)      DISH 7F3A-C7  |
|  ___________________________________________________________ |
| | glass plate 2: overlays / reticle / annotations  ->slides | |
| |  _______________________________________________________  | |
| | | glass plate 1: specimen (viewport, full-bleed)        | | |
| | |                       +                               | | |
| | |_______________________________________________________| | |
| |___________________________________________________________| |
|  lens carriage: [1x|4x|10x|40x|100x]  focus =|=  iris .|.    |
|  strip chart ~~~~~~~|~~~~~~~   X.. Y.. R.. th..   telemetry  |
+--------------------------------------------------------------+
```

Panels are glass plates sliding over a full-bleed viewport; the specimen is one fiche among many, and swapping dishes is a lateral carriage move.

### Recommendation: **C as the frame, A's ring as the reticle.**

Full-bleed viewport (works at every rung), plates for tool rack / genome bay / archive that park off-screen (keeping chrome inside P5), a bottom lens carriage, and A's degree bezel kept as an *overlay graticule*: the dish rim at 1×, an eyepiece reticle above. B survives as the Phase-1 debug layout.

**Phone portrait**: viewport takes the top 100vw square; the lens carriage becomes one horizontal ring strip beneath it showing one ring at a time (turret / focus / aperture / lamp on a 4-position lever); plates become 45%-height bottom sheets with the viewport live above; the chart collapses to a 48 px sparkline; telemetry shows three pinned metrics. All drag controls sit in the bottom 40%.

---

## 6. Visual system spec

### 6.1 Colour tokens

```css
:root[data-theme="wallace"]{            /* amber lamp, black room */
  --bg:#070605; --panel:#0e0c09; --glass:rgba(255,190,110,.04);
  --ink:#f3e7d3;  /* live values: warm white, not orange */
  --ink-2:#b89a6a; /* engraved labels */
  --ink-3:#5e4e36; /* scales, minor ticks */
  --rule:#3a2f20; --accent:#ff9d2e; /* lamp, armed tool, index marks */
  --warn:#ff5a36; --ok:#d8c27a; --sel:rgba(255,157,46,.18);
}
:root[data-theme="lapd"]{               /* cold lab, worn phosphor */
  --bg:#06090a; --panel:#0b1012; --glass:rgba(150,210,220,.035);
  --ink:#dfe9e8; --ink-2:#86a0a3; --ink-3:#42565a;
  --rule:#1f2d30; --accent:#7fd6c8; /* washed green-cyan */
  --warn:#e8a23a; --ok:#9fc7a0; --sel:rgba(127,214,200,.16);
}
```

Rules: accent ≤ 3% of UI pixels; one warn colour; chart pens use ink at 100/70/45% plus dashes before a second hue. An optional "e-ink" daylight theme (ink on warm grey, no glow) is cheap and honours Territory's E-Ink research.

### 6.2 Type (all on Google Fonts, open licences)

- **Engraved labels**: *Barlow Condensed* (500/600), a grotesque inspired by California plates and signage, with a stamped-metal feel; alternates *Saira Condensed*, *Archivo* (variable width axis).
- **Live values**: *B612 Mono*, from the Airbus cockpit-display legibility project; alternates *IBM Plex Mono*, *JetBrains Mono*.
- **Body/help**: *IBM Plex Sans* / *Plex Sans Condensed*.
- **Secondary script**: *Noto Sans JP* / *IBM Plex Sans JP* for bilingual labels (焦点 FOCUS, 標本 SPECIMEN); real translations only, a localisation hook rather than set dressing.

Settings: labels 10–11 px caps, `letter-spacing:.14em`; values 13–15 px, `font-variant-numeric: tabular-nums slashed-zero; font-feature-settings:"zero","tnum"`; one large readout per plate at 28–32 px max.

### 6.3 Line, grid, marks

4 px base grid; plates align to 8. Lines: hairline 1 px `--rule`; scale major ticks 1 px `--ink-2` 10 px long, minor 1 px `--ink-3` 5 px, every tenth numbered; index/witness marks 2 px `--accent`. Use `vector-effect: non-scaling-stroke` and `shape-rendering: geometricPrecision`, snap to device pixels (`translate(.5,.5)` at DPR 1). Corner marks: 12 px L-shaped registration marks on every plate and on the capture frame; centre cross with a 6 px gap. Radii: 0 on plates, 2 px on keys. No drop shadows; depth is parallax plus a 1 px top highlight at 6% white.

### 6.4 Numbers

Fixed width always; signed quantities always show a sign, with a true minus (U+2212); leading zeros to a fixed field (`−03.25`); units in small caps after a thin space; 3 significant figures for metrics, 4 for positions; SI prefixes (`3.20 M`, not `3.2e6`); measurement window as a smaller trailing field (`D 1.71 ±.02 @ 0.1–4 mm`). Stale values drop to `--ink-3` with a `~` prefix. Sim time is `T+036:12:40`.

### 6.5 Icons

Prefer words. Tool-rack icons are 1.25 px-stroke orthographic side-views of the real implement on a 24 px grid, no fills, one accent dot at most, always with a text label.

### 6.6 Glow and film

UI glow: one `filter: drop-shadow(0 0 3px color-mix(in srgb,var(--ink) 35%,transparent))` on live values only, radius ≤ 0.25 em so digits stay separable. UI post: fringing ≤ 0.5 px, grain ≤ 2%, never warp text; ghosting and burn-in only on non-critical surfaces, off in high-contrast mode. The viewport is where the film lives: vignette, DOF from the aperture ring, radial chromatic aberration, grain, halation in fluorescence, all in the engine's tonemap pass and all off in capture's "scientific" preset. Rule: **the image may be cinematic; the numbers must be clinical.**

---

## 7. Implementation notes

**Layering.** WebGPU canvas full-bleed; above it one SVG overlay for reticle, bezel, ghosts and scales, its matrix set per frame from the engine camera; above that, DOM plates. DOM+SVG gives crisp text, accessibility, theming and scripted testing for free. Draw in-canvas only what must match simulation pixels: high-zoom ghosts, focus-plane indicator, measurement brackets. Strip chart and scope use an OffscreenCanvas in a worker; SVG paths with 10⁴ points per frame are too slow.

**Rotary controls.** One `<petri-ring>` custom element: SVG arc with ticks, `role="slider"`. Drag maps *tangentially* (plain horizontal drag also works) so users need not trace circles. `setPointerCapture` always; `requestPointerLock()` for unbounded mouse travel in fine mode. Inertia: velocity from the last 80 ms, `v *= exp(−dt/τ)`, τ≈250 ms, a small bounce at hard stops. Detents are potential wells: below a speed threshold the value falls into the nearest stop, so fast spins skip through and slow moves click in.

**Feedback.** `navigator.vibrate(8)` per detent where available (not iOS Safari; rely on audio and visuals there). One `AudioContext` resumed on first gesture; ticks are 3–5 ms filtered noise bursts from a pre-rendered `AudioBuffer`, pitch ±3%; servo whirr is a band-passed saw following ring velocity; cap 40 ticks/s; persisted master gain and mute.

**Smoothing.** Every displayed scalar passes through `y += (x−y)·(1−exp(−dt/τ))` with τ per class: needles 300 ms, counters 120 ms then quantised, camera 90 ms. The *engine* receives target values immediately plus the smoothed view; ops always use exact unsmoothed numbers.

**Performance budget.** Of a 16.6 ms frame the UI gets ≤ 2 ms main thread and ≤ 1 ms GPU. Telemetry text at 10 Hz, meters at 30 Hz; write only changed text nodes; animate `transform`/`opacity` only; `contain: layout paint` on plates; no `backdrop-filter` over the canvas (costly compositing), fake glass with a gradient; parked plates get `content-visibility:hidden`. Metrics are computed on GPU and read back through a ring of 3 staging buffers via `mapAsync`, never blocking. Over budget, the UI degrades first (chart to 5 Hz, parallax off) and lights a lamp.

**State.** One serialisable store: `view` (rung, x, y, z, aperture, illumination), `dish` (seed, ops[], genomes[]), `ui` (theme, plates, pens). Dish ID = hash of canonical `dish` JSON; the URL carries `#d=<base64url(deflate(dish))>&v=<view>` via `CompressionStream`, falling back above ~4 KB to a short id resolved from IndexedDB or file. `history.replaceState` debounced 500 ms. The archive lives in IndexedDB with thumbnail and metric summary; export is `.dish.json`, optionally embedded in a PNG text chunk.

**Testing.** Expose `window.__petri`: `state()`, `dispatch(op)`, `setView({...})`, `step(n)`, `seek(t)`, `metrics()`, `whenIdle()`, `capture({tiles})`, `ui.ring(name).rotate(deg)`, `ui.open(plate)`. The UI calls the same `dispatch`, so scripted and human runs share one path. `?harness=1` disables inertia, audio, smoothing and film for deterministic screenshots; Playwright drives real pointer sequences for ring and stroke code; readout formatting is snapshot-tested as pure functions.

---

## 8. Delivery plan and open questions

### Phase 1 — Debug UI (with the engine, week 1 onward)
Layout B in plain DOM: sliders, number fields, a canvas chart; `window.__petri`, store, URL hash, op list with mute/edit. Tokens and fonts only. Exit: every engine parameter reachable; a Dish ID round-trips.

### Phase 2 — Instrument shell
Layout C frame, plates, true-scale SVG reticle and bezel, staged turret transitions, numeric formatting, snapping, ghost previews, keyboard completeness, both themes, phone portrait. Rings work without inertia or sound. Exit: a streak plate placed by keyboard alone reproduces from its URL.

### Phase 3 — Mechanics, sound, film
Ring physics and detents, haptics, WebAudio set, rack focus and breathing, plate parallax, strip-chart pens and event marks, archive drawer with two-plate compare, capture modes (tiled 4K, time-lapse), viewport film stack, accessibility audits, performance governor.

### Open questions for the owner

1. Default theme: amber "Wallace" or cold "LAPD lab"? Is a daylight e-ink theme wanted?
2. Wear: pristine instrument or K's-spinner dilapidation? Proposal: pristine UI, worn housing.
3. Bilingual labels (JP/EN)? Real localisation or secondary script only?
4. Sound on by default, or opt-in?
5. Voice commands ("closer / back / hold") via Web Speech: homage or gimmick? (Chrome recognises server-side.)
6. Is the 1×–100× ladder literal optics, or labelled by field width (90 mm … 90 µm)?
7. Are physical units (mm, µm, hours) binding on the engine, or nominal?
8. How far should render character change per rung?
9. Archive identity: fiche addresses and codes (`7F3A-C7`), or names?
10. Is the phone a first-class placement device, or observe-only?
11. Should scientific capture strip film effects and burn in a scale bar and Dish ID strip?
12. Genome bay in v1: cartridge swapping only, or the full patch panel with expressions?

---

## 9. Sources

- Territory Studio, *Blade Runner 2049* case study — territorystudio.com/project/blade-runner-2049/
- vfxblog, "A visual journey through the screen graphics of 'Blade Runner 2049'" (8 Nov 2017) — vfxblog.com
- Maxon, "Blade Runner 2049" (Territory workflow article) — maxon.net/en/article/blade-runner-2049
- Architosh, "Territory Studio — Cinema 4D powers screen visuals in 'Blade Runner 2049'" (Jan 2018)
- Deadline, Dennis Gassner interview on the production design (Feb 2018); American Cinematographer, "Blade Runner 2049: Designing the Future"

Not verified by any source consulted: the film's typefaces; who designed the Joi emanator and memory-orb lab interfaces (hence not analysed here); the morgue dialogue; all sound attributions.
