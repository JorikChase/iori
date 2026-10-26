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

**P2 done 2026-10-26** — push, and the toggle (P or double-click; `&m=push` in the URL):

- `gpu/wgsl.js` now holds one op table read two ways: `opFwd` (pull's `iterate`) and `opInv` (one
  random preimage or failure). The bulb inverse enumerates its valid polar branches analytically
  (every t = (±θ + 2πk)/n inside [0, π], φ shifted by π for −).
- `gpu/push.js`: 32,768 walkers × 24 steps a frame (48 still). Each sample is a Gaussian splat whose
  covariance rides the walk, Σ ← JΣJᵀ + ε²I, J the inverse step's Jacobian by replayed-seed finite
  differences (a jump across a fold edge restarts Σ); ε is one pixel's footprint at the focus
  distance. The projected covariance gets the thin-lens circle of confusion added, so depth of field
  is free; the footprint is capped (energy kept). Fixed-point atomic histogram → float accumulation
  (decay while drifting) → flame log-density tonemap: colour = mean colour landed, brightness = log
  of how much, density gain normalised by samples per pixel.
- The chaos game backs up instead of retrying: one random attempt per step, a dead end pops a
  16-deep history. Retrying in place picks uniformly among a point's live preimages, so thin branches
  swallow the walk — the Sierpiński tetrahedron collapsed onto one edge, the KIFS
  `abs · sort · scale 3 · + -2 -2 0` produced no samples. Measured on the CPU (24³ voxel entropy of
  30k samples): tetrahedron 4.6 → 10.2 bits at ~2 steps per sample; that KIFS 0 samples → 11.8 bits.
  Same walk in `core/cpu.js push()` (unit test: coverage entropy) and on the GPU.
- `c=x,y,z` in the notation fixes the constant (a Julia set) for both engines. Without it pull uses
  c = the point (Mandelbrot type) and push uses the point the camera looks at, so push shows the
  Julia set of where you are. Formulas without `+c` are the same set in both modes.
- Parity: forward unchanged after the refactor; inverse — the GPU's preimage of a forward image,
  mapped forward on the CPU, returns to it: 0 wrong over 6 formulas × 4096, error ≤ 3e-6.
- Shots: `design/shots/p2-kifs-pull.jpg` / `p2-kifs-push.jpg` (one formula, mineral and nebula),
  `p2-tetra-push.jpg`, `p2-mandelbox-julia-push.jpg` (inside the Julia Mandelbox of the arrive view).

Measured with the pane visible: push ~22 ms a frame at 0.5 internal scale. Not yet: the toggle is
instant (P6 brings computed transitions); in push, fly speed and collision still read pull's
distance estimate, which for `+c` formulas is the Mandelbrot-type set, not the Julia set shown;
autofocus likewise.

**P3 done 2026-10-26** — dual numbers, the Lyapunov channel (L), the parameter metric:

- `gpu/wgsl.js` `DUAL`: `opTan` is every op's tangent map — the derivative of `opFwd` along a
  direction, through c, and, for the op owning the selected parameter, through its packed record.
  `pack.js paramTangents()` differentiates each record by its parameter on the CPU in float64, so
  Euler angles and normalised normals need no derivative code on the GPU. `iterateDual` carries five
  columns through one orbit: three for the position gradient (c follows the point when it is the
  point), one for the selected parameter, one renormalised each iteration at fixed c for the
  Lyapunov exponent; `deTan` / `deGrad` differentiate the estimate exactly as `deOf` computes it.
- Pull normals are now the gradient of the distance estimate from one dual orbit (finite-difference
  normals remain only as a fallback); the same orbit gives λ at every hit. The L channel colours by
  λ about this view's own median (calm cool and dark, chaotic hot and glowing): on the arrive view
  the sphere-fold pits run hot, the box faces calm (`design/shots/p3-lyapunov.jpg`).
- `gpu/sense.js`: a 32×20 ray grid marched to the surface; per parameter, the surface's normal speed
  (∂DE/∂θ)/|∇DE| over the pixel footprint gives pixels per unit; RMS over the hits is the metric.
  Runs when the camera settles. `__fe.nudge(oi, key, px)` moves a parameter by on-screen pixels;
  P4's handles will use it.
- Parity (`test/parity.html`, 7 formulas × 1024 points outside the set, vs CPU float64 central
  differences in `core/cpu.js deGrad / deParam / lyapunovOrbit`): gradient angle median 0.000°,
  ∂DE/∂θ median relative error ≤ 6e-5 over 39 parameters, λ median error ≤ 5e-7. PASS.
- The metric, measured (`__fe.metricCheck(3)` on the arrive view): raw sensitivities span 6×
  (scale 291, sphere rmin 490, rfix 749, box l 1,772 px per unit); a step sized by the metric for
  3 px moved the surface 2.5–3.2 px on all four (first order: the box limit under-predicts most).

Not yet: push has no λ or metric (the sensing pass reads pull's surface); the metric is RMS over
the whole view, not per region — P4's attention editing will want it local to the cursor.

**P4 done 2026-10-26** — the grab (`design/shots/p4-grab.png`):

- A press held still (≤ 5 px) for 280 ms becomes a grab at the cursor; the camera does not turn
  while it decides, drift stops while it lasts, release ends it, Esc reverts it. A grab whose press
  was released while its sensing pass ran is dropped (it used to arrive orphaned and edit on the
  next move).
- Attention: `gpu/sense.js` now takes arbitrary rays. 5×5 rays within ±8 px of the cursor give every
  parameter's local speed (px per unit); ranked by speed × the parameter's own scale (|value|, at
  least 0.1, or 10 for angles) so lengths and degrees compete fairly. The first is the attention
  op; scroll passes attention along the ranking. Sideways drag sets value₀ + Δx / local px-per-unit:
  one pixel of hand motion moves the surface about one pixel, whichever parameter it is.
- `ui/overlay.js` draws, in hairlines over the field: the attention op's handle as its own geometry
  in world space at the first iteration (plane quad + normal, box edges, the sphere fold's two radii,
  scale as nested squares |s| : 1, rotated vs unrotated axes, the translation arrow, the power's ring
  and n petals, the twist helix; flame variations fall back to their glyph); the reticle — outer ring
  plus the world axes' great circles through the held point — with 24 Lyapunov ticks sampled on the
  ring (length and brightness by λ about the view's median); the point's orbit, compressed radially
  into the reticle (true direction and order, distance through R·tanh(d/1.5R), since iterates leave
  the frame within a step or two), branch changes in teal; a dimension line with the op's glyph and
  the value — the only number on screen. `ui/glyphs.js`: one hairline glyph per op.
- Verified in the pane by dispatched pointer events: hold → grab (box limit first on the arrive
  view, 1,593 px per unit there), +40 px → l 1 → 1.025, attention passes to the sphere's rfix, Esc
  restores the formula, a click released mid-sensing leaves no grab, jitter inside the slop does not
  turn the camera. Every handle checked in Node for real on-screen geometry.

Not yet: hover preview (the handle appears only on hold); a handle is drawn where its op acts on the
first iteration, so an op whose geometry is behind the camera (the box at the origin, seen from
inside the box) shows only its dimension line; editing in push (the sensing reads pull's surface);
vertical drag does nothing yet.

**P5 done 2026-10-26** — the atlas lens, the lineage, the structure layer:

- Overrides: every op record is now read through `rec()`, which adds ovD · (d record/dθ) for up to two
  parameters per invocation. Exact for parameters whose record is linear in them — all but rotation
  angles and plane normals (not offered by the lens). Parity: GPU with overrides vs CPU with the value
  changed, median relative error ≤ 7e-6 over four parameter pairs.
- The lens (Shift during a grab): the view becomes the map of two parameters — the attention one and a
  second from the same op if it has one, else the next in the ranking. Each pixel is a parameter pair
  coloured by how many CSS pixels the surface would be from the held point under it (the key colour on
  the surface, dark away from it, a hairline at every doubling of distance) — the held point's own
  Mandelbrot set. Its span is the screen over the local metric, so the map covers exactly what a drag
  across the screen reaches. Moving travels it (both parameters change, the field updates live in a
  circular inset at bottom right); releasing Shift closes it and the grab continues from there.
  `design/shots/p5-lens.jpg`: box limit × sphere rfix on the arrive view.
- `ui/lineage.js`: every formula as a node {text, camera, mode, thumbnail}; going back and editing
  starts a branch, nothing is overwritten. Commits on the end of an edit and on a mode toggle;
  ⌘Z / ⇧⌘Z go to the parent / newest child; thumbnails are 192 px JPEGs drawn from the canvas 16
  frames after the commit. Kept in localStorage (`fractal-engine.lineage.v1`, 600 nodes, 160
  thumbnails), a per-browser convenience — the URL still carries the formula. Verified: 1 → 2 → 3,
  back to 2, edit → 4 as a branch of 2; thumbnails non-blank.
- `ui/structure.js` (Tab): the depth ruler (one notch per iteration, the bright notch the depth reached
  at the view's centre, with its number), the op strip (glyphs, slot gaps, the attention op framed,
  ×N and schedule), the lineage (dots and hairlines, the big dot is now; hover for a thumbnail, click to
  return). Terrace bands switch on with it and off without it.

Not yet: lens on touch (it needs a modifier key); the lens map is computed once when it opens, so it
does not follow an edit made inside it; the strip and ruler are not interactive.

**P6 done 2026-10-26** — the loop, herding, transitions:

- `gpu/loop.js`: Crutchfield's feedback map I′(y) = T(blur(I(A·y))) with the formula's forward map F as
  the optics A — the Hutchinson operator of F's inverse branches acting on images, so the escape-time
  picture grows frame by frame out of its seed instead of being computed. Formulas with two slots sum
  both pull-backs (the beam splitter). The screen is a window on a plane, sampled orthographically:
  exact for planar maps; for 3-D formulas the shadow of the dynamics (filled silhouettes with halos —
  the 3-D structure needs a sparse 3-D loop, not built). Through the camera's perspective instead, an
  expanding 3-D map sent almost every pull-back off-screen and the loop died to noise.
- Tone per pass (the monitor's knobs): hue rotation, saturation, gain, contrast about a pivot in the
  dark, decay, a 5-tap blur; seeds of noise sparks and the field (fed in every pass as a secondary
  input; the whole image on entry). Measured on the Douady rabbit: gain × decay just below 1 gives
  nested escape-time halos (`design/shots/p6-loop-rabbit-halos.jpg`); at or above 1 the set saturates
  (`p6-loop-rabbit.jpg`); contrast about mid-grey kills a dark image (its steady state is negative).
- Loop is the third mode (P cycles pull → push → loop; `&m=loop`). Its window is its own camera:
  scroll zooms, drag pans, shift-drag rolls (the optical machine's distance, offset, roll); drift
  rolls it slowly. A hold grabs two hairline knobs at a time (gain/hue, contrast/blur,
  saturation/decay, noise/field), drag turns them, scroll moves to the next pair.
- Herding: when drift is on and the hand is still, every unpinned parameter does an Ornstein–Uhlenbeck
  walk about its home value (reset at every edit) with noise of 6 px/√s over its metric — every
  parameter wanders the same ~8 px on screen. Measured over 30 s: 0.5–11.8 px. F in a grab pins the
  region: the parameters scoring at least a quarter of the top one there stop wandering (on the arrive
  view: box l, rfix, scale frozen; rmin kept moving); F on a pin removes it; pins show with Tab.
- Transitions, never a crossfade: a lineage jump within one structure morphs parameters and camera
  (350 ms eased; measured 6 intermediate formulas); a jump across structures or a mode change flows —
  the old image runs through the new formula's map in the loop for 380 ms (measured 32 frames), then
  the new mode takes over.

Not yet: a sparse 3-D loop; knobs on touch need the hold (no MIDI); the flow from push starts from the
last pull image, not the push image; pins are per page (not saved in the lineage).
Next: P7 (breed — MAP-Elites archive, the neighbour ring, constant-speed walks).

## Sources

Light Herder: thelightherder.com (build chronology 2020–2026), Hackaday 2026-08-27, CDM
"light-herder-4k". Crutchfield, *Space-Time Dynamics in Video Feedback*, Physica 10D (1984).
fractbox-engine (op-list IR with per-op derivative rules, WebGPU). Hvidtfeldt's *Distance Estimated
3D Fractals* series. Munafo on perturbation and bilinear approximation. MERL Design Galleries;
Draves, Electric Sheep; Lomas, Species Explorer; MAP-Elites. Territory Studio, Blade Runner 2049.
