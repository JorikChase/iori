# Fractal engine — design

Status 2026-10-25: design agreed; **P0 built** (see "State" at the end). This is the brief a build
session starts from. Wireframes in `design/` (black, hairline; open them in a browser).

## One sentence

A procedural fractal designer where the object is a radiance field, the controls are the
mathematics drawn as a technical drawing of itself, and the screen is empty until touched.

## Principles (from the Light Herder's optical feedback machine, abstracted)

Dave Blair's 4K video-feedback device (2026) is the most intuitive fractal instrument that exists.
It has no formula: a camera films a monitor through a beam-splitter, so each frame is warped by an
affine map (distance = scale, roll = rotation, monitor angle = a second map), passed through the
tone knobs (the nonlinearity), blurred and delayed. That is Crutchfield's iterated map (1984), and
with the beam-splitter it is a two-branch IFS, which is why rotating the lower monitor yields fern
and Sierpiński forms. Hue per pass = flame colouring. Gain past one = Lyapunov exponent crossing zero.

What it teaches, independent of knobs:

1. One control, one physical meaning. Nothing is "parameter 7".
2. The response is motion, not a jump. Motion is what teaches the hand.
3. The image is the feedback channel. You never read a number to know what happened.
4. Gesture scale matches structural scale: big slow gestures for structure, small ones for tone.
5. Form and look are one mechanism (contrast *is* the nonlinearity, hue *is* iteration colour).
6. It is alive and you herd it; it is not a form you fill in.

The test every element must pass: *can you find it by touching the image; does the image move when
you use it; can you see, in the image, what it did?*

## Architecture

### One object: the orbit

Every engine produces `orbit = sequence of (point, Jacobian, branch taken, distance)`. Renderers are
readings of the trace. Colour, density, surface, legibility (which op touched this pixel) and the
Lyapunov exponent are all statistics of the trace, so look is separate from geometry by construction.

### One library, three engines, one drawing

```
Transform library (JSON, one entry per op): affine · rotate · scale · plane/box/sphere fold ·
bulb · complex power · flame variations · inversion · twist …
each op: params, WGSL body, inverse branch, Jacobian rule (unchanged | mul_scale | mul_k | bulb)

   PULL  per pixel, forward       PUSH  per sample, inverse branch     LOOP  per image
   escape-time 2-D, DE raymarch   chaos game → atomic histogram,       texture feedback: sum of
   3-D, deep zoom opt-in          each sample + Jacobian = a splat     affine warps · tone curve ·
                                                                        blur, 2-D and sparse 3-D
                     └──────────── radiance field (density, emission) ────────────┘
                       sparse bricks (petri) + anisotropic Gaussians; volume march or splat
```

Push and pull are the same formula in opposite directions: the inverse of an expanding map is a
contracting IFS (inverse iteration for Julia sets; a box fold's inverse branch is a flame transform).
One toggle gives the cave (pull) and the nebula (push) from one seed. The loop engine is the
Light Herder's machine on the GPU at 60 fps and is what gives the field its own time.

### Decisions

- A formula is data: seed + JSON; the whole scene fits in a URL hash; content-addressed gallery.
- Two shaders: an interpreter (op list in a GPU buffer, never recompiles) for live use, a JIT-compiled
  WGSL per formula for final renders, pixel-diffed against each other by the capture rig.
- Dual numbers in the shader w.r.t. position *and* parameters: normals, distance estimate, Lyapunov,
  and a metric on parameter space from one mechanism. The metric reparameterises every control
  (equal hand motion = equal visible change), gives constant-speed animation and the breed ring's
  notion of neighbour.
- Ops are local (point in, point out, Jacobian rule). Where an op breaks the DE (rotation inside the
  fold loop) the engine marks it and drops to safe stepping, visibly. Anything needing global
  knowledge is a renderer, not an op.
- Iteration depth is the scale ruler (coarse-to-fine is the object's nature, paper 0's thesis);
  progressive rendering goes by iteration count first, resolution second.
- Modules: a stack of cards collapses into one named card with exposed parameters. Twenty primitives,
  everything else a named composition. Formula as a line of text:
  `fold.box 1 · fold.sphere .5 1 · scale 2 · +c  ×12` — text, cards, JSON, URL are one object.
- WebGPU first, WebGL2 fallback; no build step; pure ES modules; governor from flame-strains for
  splat count and frame time; bricks from petri for memory.
- Exploration: MAP-Elites archive at thumbnail size, features = density, symmetry, mean Lyapunov,
  colour spread, box-count D; archive laid out smoothly; all on-device.
- Deep zoom (perturbation + bilinear approximation) is 2-D only and opt-in.

## UI language — minimal, brutal, the maths drawn as itself

Every stroke on screen is a mathematical object of the current formula drawn as a technical drawing
of itself. No icon stands for a thing; there is the thing.

- The field is the only colour. UI is monochrome hairline (0.75 px, white, low opacity), no fills,
  no panels, no words. Numbers are mono, 11 px, and appear only on a held handle as a dimension line.
- Blade Runner contribution: calibration/corner marks, dimension lines, hairline instrument drawing.
  No skeuomorphic knobs, no glow, no scanlines.
- **Fold plane**: the actual plane in space, in perspective, fold normal as an arc, value on a
  dimension line.
- **Affine frame**: the flame's origin and axes as an L with a dot.
- **Reticle (the orb)**: three gimbal rings at the cursor (desktop) or screen centre (touch), only
  while holding. Outer = camera, middle = fold frame, inner = lineage/time. Ring ticks are the
  Lyapunov exponent: dense and bright where the parameter is about to go chaotic. Read the danger
  before turning.
- **Orbit**: the real orbit of the held point, dots fading, branch changes in the field's second
  colour. This is the explainability layer: just the maths, shown.
- **Depth ruler**: one notch per iteration (one octave each), bright notch = current depth, the number.
- **Glyph strip**: the op stack without words (square with a crease = box fold, circle in circle =
  sphere fold, nested squares = scale, arc with arrowhead = rotate, dot with cross-hairs = +c),
  `×12` = hybrid schedule.
- **Lineage**: the history tree as dots and hairlines; big dot = now. Never destructive; returning to
  yesterday's fern is the hero feature the physical machine cannot have.
- **Atlas lens**: hold the modifier on a handle and the viewport *becomes* the parameter map of that
  op (the Mandelbrot is the map of the Julias, generalised), crosshair at the current point, the
  field shrinks to an inset. Drag to move, release to return. Rendered by the same engine, so exact.
- **Breed ring**: long hold → eight neighbours around the cursor; spoke length = metric distance.
  Choosing one walks there at constant visual speed.

Decided 2026-10-25:
- Default is the minimalist state: screen empty until touched; the dominant op's handle appears in
  place under the cursor. A **structure toggle** shows the depth ruler, glyph strip, lineage and rings.
- **Terrace rings** (iso-bands) appear only when needed: on the structure toggle, or while a handle
  that changes depth is held. Never by default.
- Hairlines stay white; only orbit branch dots take colour from the field.
- Reticle at the cursor on desktop, centred on touch. Desktop decides behaviour, touch adapts layout.

## UX

- Arrive: a living field, slowly drifting, camera inside it. No empty state, no modal, no tour.
  The first gesture (scroll, drag) does something.
- Fly is never a mode. Edit begins by grabbing something in the field. Breed is a long hold.
- Attention editing: the trace tells which op dominates under the cursor; holding edits that op at
  that scale.
- Transitions are computed through the field's own dynamics (the loop engine), under 400 ms, never a
  crossfade.
- Herding: drift on by default, pinnable per region; pins are how a composition is built.
- Capture = same state at 4K through the tile rig; animation = a recorded path through parameter
  space replayed at constant visual speed; export image, video, splats (3DGS), mesh.
- The power path is a line of text (command palette + notation). Shown only when asked.

## Screen states (design/)

1. `1-arrive.svg` — the field and four corner marks, nothing else.
2. `2-grab.svg` — holding: fold plane with dimension line, reticle with Lyapunov ticks, the orbit.
3. `3-lens.svg` — modifier held: the viewport is the parameter map; the field is an inset.
4. `4-breed.svg` — long hold: eight neighbours, spoke length = metric distance.
5. `5-structure.svg` — structure toggle on: ruler, glyph strip, lineage, terrace rings.

## Phased plan

Each phase ends in something that runs and is captured by the rig; iori judges the look.

- **P0 Notation + IR** — the op library (≈20 ops with Jacobian rules and inverse branches), the
  one-line notation ↔ JSON, a CPU reference backend, validation. No UI.
- **P1 Pull** — WebGPU interpreter, DE raymarch into a density/emission field, one key light, DOF,
  bands. Camera inside. Fly only. Arrive state.
- **P2 Push** — chaos game to histogram + Jacobian splats via the splat pipeline; the pull/push toggle
  on the same formula. Governor.
- **P3 Derivatives** — dual numbers for position and parameters; Lyapunov channel; parameter metric;
  reparameterised handles.
- **P4 Grab** — on-canvas handles (fold plane, affine frame), reticle, orbit trace, attention editing,
  dimension lines. The grab state.
- **P5 Lens + lineage** — atlas lens, history tree, URL state, the structure toggle.
- **P6 Loop** — texture-feedback engine, drift and herding, engine-computed transitions.
- **P7 Breed** — MAP-Elites archive, the ring, constant-speed walks and animation paths.
- **P8 Final render** — JIT WGSL, 4K tiles, video, splat and mesh export; interpreter/JIT diff tests.
- Later, opt-in: 2-D deep zoom (perturbation + BLA); GROW engine hooking the silviculture modules
  (BACKLOG #8); MIDI/physical controller mapped to the two gesture tiers.

Decided 2026-10-25: a standalone app in `fractal-engine/` on iori.me, registered in
`pages.meta.json` as `fractal-engine/index.html` (canonical `https://iori.me/fractal-engine/`),
added by hand since `scan` never auto-adds folder apps; register it once P1 has a page to show.
Paper 0 imports modules from here later, the way the landscape plan intends.

Open: whether real-time play or the 4K workstation is the primary target — decide after P1 shows
what a laptop does.

## State

**P0 done 2026-10-25** — `core/` (pure ES modules, no build step, no dependencies):

- `ops.js` — 17 ops, each with positional params + defaults/ranges, a `wRule` for the running
  derivative (`unchanged` isometries, `mul` with the factor returned by `fwd`, `plus` for `+c`,
  `none` for flame variations, which also makes the formula not `pullSafe`), `fwd`, an analytic
  `jac` where one is cheap (numeric central differences otherwise), and `inv` that picks one valid
  preimage at random (null when the point has none, or the op has no inverse). Folds: plane, box,
  sphere, abs, sort. Powers: bulb (triplex), complex power, inversion, twist. Affine: translate (`+`),
  `+c`, scale, rotate. Flames: spherical, swirl, sin, horseshoe, polar.
- `notation.js` — the one-line grammar (documented in the file header) ↔ formula JSON, exact
  inverses on normalised formulas; trailing defaults are left out when printing.
- `formula.js` — JSON shape, `normalize`, `validate` (every problem, not the first), `canonical`,
  `hash` (cyrb53, 14 hex digits: the gallery id), `toURLHash` (the URL carries the notation).
- `cpu.js` — the reference backend: `iterate` (pull orbit with trace), `de` (escape-time estimate for
  power formulas, r/|dr| for folds), `jacobian`, `lyapunov`, `push` (chaos game through the inverse
  branches, ops reversed, forward where no inverse exists; samples carry the inverse step's Jacobian
  and operator norm for splat covariance; redraws a dead branch chain up to 8 times), `stepInverse`.
- `rng.js` — sfc32, seed + formula → identical samples everywhere; a recording/replay pair so the
  inverse step can be differentiated numerically with its branch choices held fixed.
- `test/p0.test.mjs` — `node --test fractal-engine/test/` (12 tests, deploy-excluded): round trips,
  validation, Mandelbrot escape and DE, Mandelbox inside/outside, Sierpiński vertices fixed,
  analytic vs numeric Jacobians for every op, every inverse is a preimage on every branch, push
  samples stay in the pull set (>97 %) with contracting steps, Lyapunov = log 2 on the tetrahedron.

Measured: the Sierpiński push keeps 100 % of 400 samples in the set after the branch-redraw fix
(4 % before it, because a reflected preimage often lies on a side the next fold never produces).

**P1 done 2026-10-25** — the arrive state, live at `fractal-engine/` (registered hidden, noindex):

- `gpu/pack.js` packs a formula into an op buffer (16 floats per op, rotations and plane normals
  resolved on the CPU) and a uniform head (iters, schedule, slot table, flags). Structure edits
  rewrite buffers; nothing recompiles.
- `gpu/wgsl.js` is the interpreter: `iterate()` with the trace (final point, dr, iterations, escape,
  orbit trap, branch-record colour), `deOf()`, `de()`. Same DE rule as the CPU, which changed in
  P1: fold formulas use r/|dr| whether or not the orbit escaped (with 12 iterations most points near
  the surface never reach the bail radius), power formulas keep 0.5·r·log r/dr outside, 0 inside.
- `gpu/render.js`: one compute pass marches one jittered sample per pixel and blends it into an
  rgba32float ping-pong; a display pass does bilinear upscale, ACES, sRGB, dither. Lighting is a
  coloured lamp carried just off the camera with distance falloff — a sun-style directional light
  failed inside enclosed caves (shadows blackened nearly everything). Soft shadows and 5-tap AO only
  when still; moving frames use a 2-tap AO stand-in so stopping does not flash. Thin-lens DOF with
  CPU autofocus on the centre ray; fog and glow scaled to the clearance at the camera.
- `app.js`: fly only. Drag looks, scroll/pinch moves, WASD QE fly; every speed is the distance
  estimate at the camera, so a hall and a crevice feel the same under the hand; moves that would
  enter the surface are refused. Drift starts 4 s after the last input and steers toward the most
  open of five directions; space toggles it. The governor submits a frame only after the GPU
  finished the last one (a stalled queue froze this Mac once) and sets the internal resolution from
  measured GPU time. URL hash = notation `&c=` camera. No text on screen: the four corner marks,
  and a hairline "no" glyph when WebGPU is missing.
- Default: `fold.box 1 · fold.sphere .5 1 · scale 2.5 · +c ×12 bail=100` from inside a room found by
  sphere-tracing 14 directions from random points, facing a terraced amphitheatre
  (`design/shots/p1-arrive.jpg`).
- `test/parity.html` (open in a WebGPU browser; result in `window.__parity`): 8 formulas × 4096
  points, GPU vs CPU. Measured: zero iteration-count or escape mismatches; median relative DE error
  ≤ 2.5e-5; p99 ≤ 2e-4 except the Mandelbox (0.4–0.9 %, float32 branch flips at fold edges). PASS.
- `__fe` hooks (`setCamera`, `setLook`, `hold`, `run(n, scale)`) drive frames without animation
  frames; a hidden Browser pane gets none.

Measured in the hidden pane (unreliable timing): still frames with shadows ~150 ms at 0.6 internal
scale of a 1706×1786 canvas; moving frames ~25 ms at 0.35. Not yet: WebGL2 fallback, the capture
rig, look controls (P4/P5 bring handles), real frame timing with the pane visible.
Next: P2 (push: chaos game to histogram + Jacobian splats; the pull/push toggle).

## Sources

Light Herder: thelightherder.com (build chronology 2020–2026), Hackaday 2026-08-27, CDM
"light-herder-4k". Crutchfield, *Space-Time Dynamics in Video Feedback*, Physica 10D (1984).
fractbox-engine (op-list IR with per-op derivative rules, WebGPU). Hvidtfeldt's *Distance Estimated
3D Fractals* series. Munafo on perturbation and bilinear approximation. MERL Design Galleries;
Draves, Electric Sheep; Lomas, Species Explorer; MAP-Elites. Territory Studio, Blade Runner 2049.
