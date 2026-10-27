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

**P7 done 2026-10-26** — breeding (`design/shots/p7-ring.jpg`):

- `core/breed.js` (unit-tested): `mutate` steps D on-screen pixels in a random direction across the
  unpinned parameters (each moves D·zₖ / its px-per-unit, z a random unit vector), so a neighbour is a
  known visual distance away (tested at 10, 40, 120 px); `distancePx` measures two formulas apart by the
  metric; `features` takes a sensing pass to {surface fraction, median λ, quality = spread of hit depths
  ÷ their mean, penalised for an empty or full view}; `createArchive` is MAP-Elites 8×8 over (surface
  fraction, λ about the view's own median ± its spread × 3); `spread` picks elites far apart in feature
  space (farthest-point).
- The renderer can now draw and sense formulas that are not on screen: `renderThumb` borrows the
  formula buffers for one synchronous submission into its own small accumulation and gives them back
  before anything else can run, then reads back a JPEG; `sense(…, other = true)` does the same.
- The archive grows in the background whenever the hand is off (drift included): one candidate every
  150 ms — a parent (an elite 60 %, else the formula on screen), a step of 30–220 px, a 16×10 sensing
  pass. It belongs to one structure and roughly one view. Measured: 40 candidates in 129 ms filled 19
  of 64 cells (surface 6–97 %, λ 0.48–1.11).
- The ring (hold still 1.2 s, pull or push): four near neighbours (35, 60, 90, 130 px) and four archive
  elites chosen for spread (filled by far mutations when the archive is thin), placed around the
  cursor in the cyclic order of their feature direction (surface fraction → right, λ → down), evenly
  spaced; spoke length 110 + 110·tanh(D/160) px; thumbnails fill in as they render. Point to select,
  release to walk there, release at the centre or Esc to stay, scroll for farther or nearer. Measured:
  open with eight thumbnails in 196 ms.
- Walks keep a constant visual speed: parameters linear in time for D / 150 px/s (an archive elite
  224 px away took 1.7 s), then a lineage node. R replays the lineage from its root to here as a chain
  of walks along the existing nodes, adding none; any input stops it.
- Lineage across tabs: ids are now unique across tabs and every save merges with what is stored (two
  tabs used to overwrite each other's nodes). Before the replay fix, one test replay added ~12 duplicate
  nodes to the shared lineage; they are ordinary branches repeating history.

Not yet: structural mutations (adding, removing or swapping ops) — neighbours vary parameters only;
the archive's features are view-dependent, so it restarts after a flight; recorded animation paths
beyond lineage replay (P8 brings export).

**P8 done 2026-10-26** — final render and export:

- `gpu/jit.js`: one formula compiled into its own `iterate` — every parameter a literal, rotations
  and normals resolved, the schedule unrolled, no op-table reads, no switch; the same statements as
  the interpreter's `opFwd`. `withJit` swaps it into any shader source. Built in the background
  (`createComputePipelineAsync`) once the view is still, used for still frames and stills; live
  editing keeps the interpreter. Parity (`test/parity.html`, 2¹⁸ points × 9 estimates, 8 formulas):
  median relative error ≤ 6e-7, the same fold-edge tails; ×1.8–×12.5 faster (Mandelboxes ×9 and ×12.5,
  folds and powers ×2–3).
- Stills (⌘S or the frame glyph): 3840 px on the long side at the view's aspect, 64 samples, shadows,
  JIT; rendered as 512² off-axis tiles (the View gained a tile offset and full size, so each tile is
  exactly its window of the full frame) and assembled in an OffscreenCanvas → PNG download. Measured on
  the arrive view (3754×3840 in the tall test pane): seams invisible — the step across tile boundaries
  13.4 vs 12.7 between ordinary neighbouring columns; it took over 45 s.
- Video (film glyph): the lineage from its root to here, walked at 150 px/s by the metric at 30 fps
  (a structure change is a cut), rendered offline at 1920 px long side and 16 samples per frame into a
  PNG sequence through moshine's sink (`moshine/frames.js`, loaded only when a video starts: a folder
  the user picks, or a streamed ZIP64). Verified: a 4-frame test ZIP with four valid PNGs. Slow: ~11 s
  a frame, because every frame has new parameters and so runs on the interpreter (a JIT that keeps the
  structure but reads parameters from the buffer would fix it).
- Splats (dots glyph): push samples captured on the GPU with their walk covariance (an atomic append
  buffer bound to the walk), Σ eigendecomposed into scales and a rotation, branch colour through the
  key tint → 3DGS binary PLY, degree-0 SH (`core/export.js splatsToPly`). Verified on the tetrahedron:
  200,000 splats in 0.7 s, 13.6 MB, every one in the pull set, unit quaternions.
- Mesh (cube glyph): the distance estimate on a 128³ grid over the cube the camera sees at its focus
  distance (`R.deGrid`, in slabs), shifted half a cell, surface nets → binary STL
  (`core/export.js`, unit-tested watertight on a sphere). Verified on the arrive view: 451,048
  triangles, 22.5 MB, 0.4 s.
- The live view pauses during an export; a hairline at the bottom of the Tab layer fills as it runs.

Not yet: MP4/WebM encoding (the sequence is for an editor); splats with higher-order SH; a mesh
region other than the focus cube.

**Structure JIT, 2026-10-26.** A second JIT kind keeps everything the literal one bakes in — op types,
the unrolled schedule, the iteration count, no opcode switch — but reads parameter values from the op
buffer through `rec()` (so lens overrides still apply) and the bail radius from the head. Keyed by
`structureKey` (ops, schedule, iterations), it is rebuilt only when the structure changes, in the
background from `R.setFormula`; until it is ready the interpreter draws. Pipeline choice, every
frame: the literal JIT when the exact values match and the frame is still → the structure JIT →
the interpreter (`__fe.pipeline` says which). So live editing, drift, walks and every video frame now
run compiled. Parity: identical error to the literal JIT; ×2.1–×6.7 over the interpreter in the same
run where the literal JIT measured ×2.1–×8.1 (GPU timings vary run to run). The 4-frame video test:
2.2 s a frame, from 10.9 s.

## Sources

Light Herder: thelightherder.com (build chronology 2020–2026), Hackaday 2026-08-27, CDM
"light-herder-4k". Crutchfield, *Space-Time Dynamics in Video Feedback*, Physica 10D (1984).
fractbox-engine (op-list IR with per-op derivative rules, WebGPU). Hvidtfeldt's *Distance Estimated
3D Fractals* series. Munafo on perturbation and bilinear approximation. MERL Design Galleries;
Draves, Electric Sheep; Lomas, Species Explorer; MAP-Elites. Territory Studio, Blade Runner 2049.

## Next stretch (Q) — species, tissue, dimensions, the graph

Decided 2026-10-26: **tissue** means Voronoi tissue (cells, each its own family, soft walls); **new
species first** — chimeras mixed inside the iteration, before collages of finished shapes; **4-D and
multidimensionality are the base**, not an add-on; the **graph opens over the field in hairlines**.

The three ways to mix, kept distinct: *breed* (same structure, parameters interpolated — exact),
*chimera* (different structures, the point blended inside every iteration: p ← mix(F_A(p), F_B(p), w)
— new dynamics, distance estimate conservative via the larger dr), *collage* (finished distance
estimates joined by a field-weighted smooth-min — designed seams, later).

**The dimension model.** The orbit lives in ℝᴺ; the camera stays in 3-D. A *slice* — an origin O and
an orthonormal frame E (N×3) — embeds the world: x_N = O + E·x₃. Rotating the slice through the
higher axes is a control like any other (flying through the fourth dimension). 3-D formulas are N-D
formulas whose ops leave the extra axes alone. Quaternion and hypercomplex families become ordinary ops.

**Fields.** w(x) for every mix is a field: constant, axis, sphere, drawn gradient, fBm (paper 0's
Brownian noise), Voronoi tissue (k sites, each cell a species, soft walls of adjustable width), and
the fractal's own readings (orbit trap, escape depth, λ) — a formula that mixes itself by its own
dynamics. A tissue of k species generalises the mix to k branches weighted by the cells.

**Phases**
- **Q0 — N-D base.** State becomes a point in ℝᴺ through every layer: core ops (arrays, N×N
  Jacobians), the WGSL interpreter, duals, inverse branches, JIT, sensing, push, loop; the slice in
  the formula JSON and the notation; 4-D forms of every op (4-D rotation's six planes, 4-D folds, the
  hyperspherical bulb) plus quaternion ops (q², q·c). All parity suites re-run in N-D.
- **Q1 — chimera.** A `mix` op holding two (later k) sub-stacks run in the same iteration, weight from
  a field; DE by the larger dr; JIT codegen for nested stacks; the notation `[A ‖ B] w` and its JSON.
- **Q2 — fields and tissue.** The field library; Voronoi tissue with per-cell species and soft walls;
  self-fields (trap, depth, λ); the lens and the metric extend to field parameters.
- **Q3 — the family surface.** Presets for Mandelbulb, Mandelbox, Menger (conditional z-fold),
  Sierpiński, pseudo-Kleinian, Amazing Surf, KIFS, quaternion Julia, 4-D bulbs, flames; a Metasurface
  (natural-neighbour weights over Voronoi cells of presets) as a gesture surface: inside a cell, breed;
  across a wall, chimera; a stroke is a path — played in time (a walk) or laid in space (a field).
- **Q4 — the graph.** Formula v2 as a graph; the glyph strip unfolds into it over the field; glyph
  nodes, hairline edges, a repeat zone for the iteration body, a radial picker, live node thumbnails;
  compiled by the JIT; a register-machine interpreter so editing never waits for a compile.

**Q0 built 2026-10-26 — 4-D native.** N-D up to 8 stays a later representation change; every layer now
carries a vec4.
- *The slice.* `slice=w,xw,yw,zw` in the notation, `slice: {w, tilt:[3]}` in JSON: x₄ = T·(x, y, z, w₀),
  T the rotation by the three tilt angles (degrees) in the xw, yw, zw planes. `c` takes three or four
  numbers. With the default slice every 3-D formula is unchanged (all P-stretch parity holds as before).
- *Ops.* All ops act on four components (translate/fold.plane gain a w parameter, placed last so old
  formulas parse; fold.box, sphere, abs and invert act on w; sort, bulb and the flames leave it alone).
  New: `rotate4` (six plane angles), `sort4`, `bulb4` (hyperspherical, analytic inverse enumeration —
  every candidate verified, 218,800 of 218,800), `quat` (q², inverse ±√q computed from the imaginary
  size first when q₀ < 0, which removed float32 cancellation: 15 of 4096 wrong → 0).
- *GPU.* REC4 = 5 vec4 per op record, rotations packed as 4×4; the head carries the slice matrix and w₀;
  duals have three 4-D gradient columns started on the slice's axes; push walkers carry a symmetric
  4×4 Σ, splats project back through the slice with a Gaussian slab weight (`pushSlab` 0.1) on the
  distance off it; the loop maps each pixel through the slice and back; both JIT kinds emit vec4.
- *Gesture.* Option + wheel moves the slice along w (step scaled by the distance estimate at the
  camera); Option + drag tilts it toward w in the camera's right/up plane (the drag adds right/up's
  components to the three tilt angles — a small-angle composition, exact enough by hand). One lineage
  node when Option is released. `__fe.slice(dw, dx, dy)` drives it in tests.
- *Glyphs.* rotate4, sort4, bulb4, quat — the 3-D glyph with an inner second figure.
- Parity (all PASS): forward DE median ≤ 2e-6 on the 4-D formulas (quat Julia, bulb4, rotate4/sort4
  KIFS, a tilted Mandelbox slice); inverse 0 wrong on every op; dual gradient 0.000° median; JIT
  literal/structure identical to the interpreter, quat Julia ×19.8 compiled. 18 unit tests.

Not yet: N > 4; a tilt stored as a full frame (three plane angles cannot reach every 3-plane in ℝ⁴
without composition order mattering); a hairline readout of w while it moves.

**Q1 built 2026-10-26 — the chimera.** `[A ‖ B] w k nx ny nz nw r` (also `||`): two op lists run on the
same point in the same iteration and blended, p → (1 − ω)F_A(p) + ωF_B(p) — new species, not a collage.
- *The weight* is a field over the orbit point (Q2 adds the field library and spatial tissue):
  ω = σ(logit w + k·(n̂·p) + r·(|p| − 1)). k = r = 0 is the constant w exactly; w = 0 or 1 is one pure
  species whatever the field; k and r draw a smooth wall (linear along n̂, radial around |p| = 1).
- *IR.* The sub-stacks are slots after the scheduled ones, two per mix in order of appearance, so the
  JSON stays `{op: 'mix', p}` with no references (`mixKids` in core/formula.js derives them; normalize
  hands each mix its `kids`, not enumerable). Four slots allow one mix per formula; no mix inside a mix.
- *DE.* dr after the mix is the larger branch's plus |F_B − F_A|·|∇ω|·dr — a bound on the blend's
  stretch, its Jacobian being (1 − ω)J_A + ωJ_B + (F_B − F_A)∇ωᵀ. The colour index records the species
  that leads (branch 1 or 2), not the sub-stacks' own branches.
- *Inverse (push).* No closed form: one species' inverse is a first guess, Newton on the blend refines
  it (exact Jacobian from the tangents), up to four guesses alternating species, giving up after two
  non-shrinking steps. Push's splat Jacobian replays answer by linearisation from the kept solution
  (`mixKeep`/`mixReplay`, the RNG restored after) instead of solving Newton five times: box×bulb
  928 → 205 ms a frame at scale 0.5 (box alone 7, bulb 21). Push still costs ×10 on chimeras.
- *GPU.* WGSL has no recursion, so the mix is never an opFwd/opInv/opTan case: `fwdAt`, `invAt` and the
  dual loop dispatch on code 22 and run the sub-stacks with the per-op functions (`runKid`, `kidInv`,
  `kidTan`, `mixTan`). Shaders with INVERSE include DUAL. Both JIT kinds unroll the sub-stacks inline
  on copies of (p, dr) and read the weight from the record.
- Parity (all PASS) with chimera cases in every suite: forward DE median ≤ 6e-7 (constant blend,
  field walls, a chimera in the second slot of an AAB schedule); inverse 0 wrong (KIFS×Sierpiński,
  affine with a 4-D rotation, box×bulb; 47–100 % found by one attempt); dual gradient 0.000° median;
  lens overrides on w and k exact; JIT literal/structure identical. 19 unit tests (notation, pure
  species at w = 0/1, the blend's Jacobian against differences, push preimages verified).
- The CPU push walk now caps its total steps: a formula whose preimages always escape after a step
  or two never empties the stack and looped forever (pre-existing, found by a contracting test formula).

Not yet: k-way tissue and spatial (world-point) fields — Q2; the glyph strip shows the sub-stacks as
plain slots (the graph in Q4 nests them); breeding mutates w/k/r like any parameter but never adds or
removes a mix.

**Q2 built 2026-10-26 — fields and tissue.** The chimera takes two to seven species, `[A ‖ B ‖ …]`, and
a field after the bracket weighs them (core/fields.js, the WGSL a bit-for-bit copy):
- *Kinds* — one op each, so parameters, sensing, the lens, the grab and breeding all work unchanged:
  `.3` (mix, constant), `axis w g nx ny nz nw at`, `sphere w g r cx cy cz cw at`, `noise w g f o seed at`
  (4-D value-noise fBm), `tissue n size soft seed at` (Voronoi: n sites in a box of half-size `size`,
  site j a cell of species j mod k, soft walls from a softmax over −|x − xⱼ|²/(soft·size)), and the
  self-fields `trap w g t` (least |p|² so far, the start included), `depth w g` (iteration i/n — a sharp
  depth is a schedule; checked against AAABB), `lyap w g` (the running stretch log dr/(i+1)).
- *Scalar fields to species:* u = (k − 1)·σ(logit w + s(x)), shared between the two species u falls
  between; for two species ω_B = σ(logit w + s), and w = 0 or 1 is one pure species.
- *Frames:* `at` 0 reads the field at the orbit point every iteration (new dynamics); `at` 1 at the
  world point the orbit started from (a spatial tissue; tissue's default). The orbit frame reads the
  field inside the ball of radius 2 and on its sphere beyond, so an escaping orbit sees it change with
  direction only: noise read far out met species |p| apart and float32 orbits lost each other in a few
  iterations (CPU vs GPU 0.4 apart after 12 at gain 2; with the clamp 2e-4). Gains ≥ 2 inside the
  ball are still float32-sensitive in their tails — that is the species, not the code.
- *Eight slots* (A–H; head 432 bytes, `slotStart`/`slotLen`); sub-stacks are the trailing slots, the
  species count a hidden parameter `s` the brackets set. Counts, seeds, octaves and frames are
  `discrete`: never sensed, lensed, grabbed or bred.
- *DE, revised:* dr after a mix is Σ ωᵢ·drᵢ — the bound on |Σ ωᵢJᵢ|. Q1's "larger dr" was looser and
  wrong in pure cells (a bulb-3 cell beside bulb-8 took 8r⁷: estimate 260× too small, camera "inside").
  The field's own stretch Σ Fᵢ∇ωᵢᵀ is *not* in dr: the strict term grows with |p| along escaping orbits
  and drove the estimate to 1e-15 far outside the set. Steep walls can therefore be overstepped a
  little (visible as flares at tissue seams); the Jacobian (Lyapunov, push Newton) keeps the term.
- *Duals:* one `mixTan` call for all five columns (calling it per column inlined the field code ~25×
  and Metal compiled the parity shader for minutes, hanging the page). A world field moves with the
  start's columns, trap with the iterate that set it (tracked per column), lyap with ddr; the field's
  own parameter by a central difference through the record (`tanEps`).
- *Push:* a world field is read at the preimage itself; self-fields at the walk's iteration, with the
  walk point's own trap. Tissue push of bulb 8/bulb 3: 785 ms a frame at scale .5.
- Parity (all PASS, async pipelines and progress in the console now): forward medians ≤ 3.4e-5 for
  every kind and frame; inverse 0 wrong (tissue both frames, noise, trap; 54–90 % found); dual
  gradients 0.000° median, parameters ≤ 3.2e-5, λ ≤ 1.5e-6; lens overrides on tissue size/soft, noise
  f/g, trap t/w exact. 21 unit tests (gradients of every kind against differences, the radius clamp's
  chain rule, the tissue Jacobian, world vs orbit frame, depth as a schedule, push through a tissue).
- Seen in the app: bulb 8 / bulb 3 tissue (cells and seams), a noise-driven bulb chimera (organic),
  the metric senses tissue size and soft, the grab edits them (ranges clamp: soft ≤ 2, size ≤ 32 …).

Not yet: a strict, usable bound for steep walls (a per-field Lipschitz safety factor would cost speed
everywhere); site placement by hand (Q3's Metasurface); drawn fields; tissue-of-tissues.

**Q3 built 2026-10-26 — families and the Metasurface.**
- *Families* (core/presets.js, unit-tested and raymarch-checked on the CPU: each fills 21–75 % of its
  framed view): Mandelbulb, 4-D bulb, quaternion Mandelbrot, quaternion Julia, Mandelbox, Mandelbox
  −1.5, Amazing Surf (x/y box folds as plane pairs), 4-D-rotated Mandelbox, Menger (the conditional
  z-fold is `fold.plane 0 0 -1 -1`: after the next abs, reflecting equals subtracting 2), Sierpiński,
  KIFS. All single-slot; Julia types add their constant by `translate`, so every family composes with
  every other. Each names its camera distance and one or two breeding axes. Pseudo-Kleinian needs its
  own slab estimate (with r/dr it fills space) — not yet; flames are push-only — not on the surface.
- *The Metasurface* (core/metasurface.js, ui/metasurface.js; M or Esc): the families as Voronoi cells
  on a square over the dimmed field — hairline cells, each site its family's thumbnail, its breeding
  axes as ticks, the crosshair with hairline spokes to the sites it draws on.
  - Inside a cell: the family bred — its axes sweep ± span/2 with the offset from the site across the
    cell's radius (horizontal, vertical).
  - Across a wall: soft weights πⱼ ∝ exp(−(dⱼ − d_min)/0.035) (a cell is pure until ~0.1 from its
    wall); sites of one structure blend their parameters (exact breeding), different structures become
    a chimera with constant weights — the new field `blend a b c …` (relative weight per species;
    also in the notation). At most four species; iterations blend linearly, bail and view
    geometrically. Pure at every site; continuous across a wall (unit-tested on the estimate).
  - Drag: the formula follows the crosshair live (≤ every 30 ms), the camera reframes the origin at
    the blended view; release keeps it (one lineage node).
  - Shift-drag: a stroke played in time — the crosshair travels it at half the surface a second,
    every step a formula (a box → Amazing Surf walk passed 11), one node at the end.
  - Option-drag: a stroke laid in space — 2–7 species sampled evenly along it (the leading species at
    each sample, bred), ordered across the visible world along the stroke's own screen direction by a
    world-frame `axis` ramp spanning the view. A bulb → Sierpiński → Menger stroke laid the bulb
    upper right and the sponge lower left.
- *Estimate type, revised:* a chimera uses the escape-time estimate only if every species is a power
  family; a mixed one (an IFS beside a bulb) uses r/dr — escape-time read the IFS's bounded orbits as
  inside (estimate 0) and the blend rendered almost black.
- *Fixed:* `mix.blend` had no opcode and packed as NaN (the shader silently skipped the op); a unit
  test now checks every op has one. Parity (all PASS) gained blend cases in every suite. 24 unit tests.

Not yet: moving sites or dropping the current formula onto the surface as a new site; touch gestures
for strokes (desktop modifiers only); pseudo-Kleinian's own estimate; walls are drawn as cell edges,
not as the soft band they are.

**Q4 built 2026-10-26 — the graph.** Decided with iori: today's formula as an editable network now,
with the hooks formula v2 needs; it unfolds from the strip; ops come from a radial picker; a node's
thumbnail is the field without it.
- *core/graph.js* (unit-tested): `tree(f)` puts each chimera's species back where they belong;
  `flatten` is its exact inverse; ids are paths (`B3` op 3 of chain B, `B3.1` its species 1,
  `B3.1.0` that species' first op); `ports(n)` types every port (point in/out, number or int per
  parameter, per-species point ports and a field weight on a chimera) — the v2 hook. Edits by id:
  insert, remove (the last op of a species takes the species; a chimera left with one dissolves;
  a scheduled chain is never emptied), move (no chimera inside a chimera), setParam (clamped), fork (the
  op there and its copy as two species — the orbit is unchanged until one changes), addSpecies,
  setField (shared parameters kept), unwrap, setIters, bypass (for thumbnails).
- *One drawing, two scales* (ui/graph.js): chains top to bottom side by side, a chimera's fork, its
  species, the join at its field's glyph, the repeat zone with its loop up the right side and
  `×N schedule` below. Folded, it is the structure layer's strip — so the strip always shows the real
  network (species, fields, schedule); click it, or G, and it unfolds leftward over the dimmed field.
- *Editing:* hover a node — the field without it, as a thumbnail; click — selected, its parameters as
  dimension lines to its left (no words: a tick for a bounded value, the number while held), dragged
  at the sensed metric; drag a node onto an edge — moved there; Delete — removed; hold an edge — the
  ring of 22 op glyphs and the mix glyph (fork), release on one; hold a field — the ring of nine
  fields and the plus (another species); drag the count — iterations, one per 12 px. Every edit is
  one lineage node; G, Esc or a press outside folds it.
- Verified in the app with real and synthetic input: the thumbnail without `scale`, a parameter drag
  (3 → 3.71), rotate4 inserted from the picker, a fourth species from the field ring, abs moved below
  sort, Delete, ×9 → ×12; the strip redrawn with four species after folding. `__fe.dry` keeps test
  edits out of the lineage (shared through localStorage).

Not yet: formula v2 itself (fields or node outputs driving parameters, reused subgraphs); adding or
removing scheduled chains and editing the schedule word in the graph (the notation does it); the unfold
animation is timer-driven and stalls while the pane is hidden; touch.

## Shading (Q5) — decided 2026-10-27

iori: shading nodes for colour and a ramp node with full functionality. Decisions:
- **Placement:** next to the formula graph, visually its own frame, but in principle the same chain:
  the formula's readings flow out of the repeat zone into the shading network (one IR, one strip).
- **Ramp:** stops (add, drag, delete, any number up to 16, colour and alpha each), interpolation
  (constant, linear, ease, B-spline, cardinal) in a colour space (RGB, HSV, Oklab), input mapping
  (scale, offset, clamp / repeat / mirror, log, invert), and presets (fire, ice, film, mono — iori's
  taste runs to one hue with highlights, or iridescent).
- **Colour picking:** a hairline hue ring around a held stop — angle is hue, distance from the stop is
  saturation, scroll is lightness. No panels.
- **Storage:** in the formula (JSON `shade`, the notation's `shade=` token, the hash) — so the URL,
  lineage, breeding and exported splats/stills reproduce the colour exactly.

**IR — a typed dataflow (the first real formula-v2 graph).** `formula.shade = { nodes, out }`:
nodes in topological order, each `{ id, type, in: { port: nodeId }, p: {…} }`; `out = { color, glow }`
name the nodes feeding the outputs. Types:
- readings (no inputs, one number out): `col` (the fold colour index, 0..1), `trap` (least |p|²),
  `depth` (iterations done ÷ iterations), `lyap` (λ along the orbit), `facing` (n·v), `species` (the
  leading chimera species ÷ (k − 1), 0 without a chimera), `w` (the hit point's place in 4-D along w)
- `ramp`: number in → colour (rgba) out; p: stops [{ t, c: [r, g, b, a] }], interp, space, map
  { scale, offset, mode, log, invert }
- `math`: numbers a, b → number; p: op (add, sub, mul, min, max, pow, sin, bands — terraces of the
  input in steps of b), c (a constant used when b is unconnected)
- `mixc`: colours a, b, number f → colour; p: mode (mix, multiply, screen, add)
- the outputs: `color` (surface albedo, a colour) and `glow` (a number scaling the glow, or a colour
  tinting it). Without `shade` the formula renders as before (the key colour tinted by the fold index).

**GPU:** the shading program packed after the op records in the ops buffer (no new binding) and run
by a small register interpreter in the shading step (one vec4 register per node). Push splats take
the same program with the readings they have (col; the others 0). Parity: the CPU evaluator against
the GPU's on random readings.

**Phases:** S1 core (IR, notation, CPU evaluator, ramp maths, presets, tests) → S2 GPU (interpreter,
readings incl. species, push colour, parity) → S3 UI (the shading frame beside the graph, wiring by
hold-on-port rings, the ramp editor: bar, stops, hue ring, glyph toggles for interpolation / space /
mode, mapping as dimension lines, preset ring) → S4 verify, docs, deploy.

**S3 built 2026-10-27 — the shading frame.** core/shade-edit.js (unit-tested): shadeOn/Off, addNode
(free, or inserted on an input's link — the old source becomes its input where the kinds allow, unfed
required inputs take the fold index or the surface colour), connect (type-checked; nodes re-sorted
topologically, loops refused), disconnect (optional inputs only), removeNode (a bypass: its own input
takes its place), setNodeParam, stops (add sampled from the ramp, move, remove, recolour), setRamp,
applyPreset. ui/shadegraph.js draws the frame left of the formula's repeat zone (scaled together),
the readings bus out of the zone along its top, readings as glyphs, ramps as their own gradients,
maths and mixes by op, the outputs (colour, glow) at the bottom, ports as dots, links as curves; the
folded strip carries it small beside the formula's.
Editing: plus in an empty frame starts it; click selects; drag from an output dot to an input dot
links; hold a link or input dot — a ring of only the types that fit it; hold empty frame — a free
node; hold a ramp — the presets as colour arcs; Delete removes a node or the selected stop. A selected
math or mix shows its op glyph (click cycles) and its constant as a dimension line. A selected ramp
opens its editor below the frame: the bar (click adds a stop), stop ticks with swatches (drag moves,
hold opens the hue ring: angle hue, distance saturation, scroll lightness, shift-scroll alpha, live),
scale and offset as dimension lines, and a row of toggles: interpolation, colour space, mapping mode,
log, invert. `__fe.shadeView` exposes the placed frame for tests.

## Formula v2 — drivers (V), decided 2026-10-27

iori chose formula v2 over collage, own Metasurface sites and shading polish. Decisions:
- **What drives a parameter — all four:** orbit readings (per iteration, inside the loop: new
  dynamics), world fields (read at the start point: the shape varies across space), time (a clock:
  parameters animate on their own) and other parameters (one op's value feeding another's, through
  maths).
- **The distance estimate:** an automatic step factor — the engine measures how steep the drivers are
  and shortens the raymarch step where they are, so driven shapes stay correct at the cost of speed
  only where they vary.
- **Wiring:** select an op, its parameters are dimension lines; drag from a driver's output dot onto a
  line and the line becomes a port. A driven line shows its range as a band.
- **Reused subgraphs (instances): later** — the next stretch once the driver dataflow is proven.

**IR — the shading dataflow's form, a second program.** `formula.drive = { nodes, bind }`, nodes in
topological order exactly as in `shade` (`{ id, type, in: { port: nodeId }, p }`), and
`bind: [{ to: '<graph path id>.<param>', from: nodeId, lo, hi }]` — the parameter becomes
lo + v·(hi − lo), so the band drawn on the line *is* [lo, hi] (a param-to-param link is the band
[0, 1], the identity). One binding per parameter; the op keeps its own value for when it is unbound.
Node types (numbers only):
- orbit readings, evaluated before each driven op every iteration: `i` (iteration ÷ iterations),
  `r` (|p|), `trap` (least |p|² so far), `lyap` (running λ), `px py pz pw` (the point's coordinates)
- world fields, evaluated once at the orbit's start: `axis`, `sphere`, `noise`, `tissue` (core/fields.js
  read as scalars — tissue gives the cell index ÷ (n − 1) and a wall distance), `x y z w` (the start)
- `time`: seconds, with p { rate, wave (saw, sine, tri), phase } → 0..1 — the video exporter feeds it
  the frame's time, lineage and URLs store the program, never the clock
- `param`: another op's own (unbound) value, by path id — the link between parameters
- `math`: shared with shading (add, sub, mul, min, max, pow, sin, bands), plus `remap` (lo, hi, clamp)
Static classification: a binding whose sources are all world/time/param is per-pixel and hoisted out of
the loop; only orbit readings run per iteration. Limits: 32 nodes, 16 bindings.
Notation `drive=…` (alongside `shade=`), JSON, hash; graph path ids survive edits (insert/remove/move
rewrite the bindings' targets; removing a bound op drops its bindings). Breeding and the lens treat lo,
hi and every driver's parameters as ordinary parameters; structure (bindings, node types) is never bred.

**Evaluation and the GPU.** A third program in the ops buffer after the shading program, run by the
same register interpreter (one f32 register per node, readings filled per iteration). Before a driven
op runs, the interpreter overwrites its record's slot with the driven value. Parameters that pack
resolves non-linearly (rotate/rotate4 angles → matrix, fold.plane normal → unit vector, twist degrees)
gain a shader-side rebuild used only when the record carries a "driven" bit, so undriven formulas cost
nothing. Duals: the driver's gradient wrt the point (world fields' analytic gradients from Q2; orbit
readings through the iterate's columns) enters the Jacobian as ∂F/∂θ·∇θ — the same form as the
chimera's field stretch. JIT: driven parameters become live expressions, hoisted ones computed once.
Push: world, time and param drivers exact (read at the preimage, like Q2's world frame); orbit
readings from the walk's own iteration and point (the Q2 self-field rule).

**The step factor.** Like Q2, ∂F/∂θ·∇θ stays out of dr (it destroyed the estimate far outside the set);
instead the raymarch divides its step by L = 1 + Σ |∂DE/∂θᵢ|·|∇θᵢ| — the sensing pass already computes
∂DE/∂θ per parameter, the drivers' gradients come from the duals. First cut: L per screen tile from
the previous frame's sense pass (the governor smooths it), measured against a brute-force CPU march on
driven test formulas; a hairline readout of L in the structure layer. If tiles flicker, fall back to
one L for the frame.

**UI.** Drivers live in a lane inside the repeat zone, right of the chain (orbit readings belong in
the loop); world fields, time and param nodes on the zone's outside edge, top. Hold empty lane — a ring
of driver types; drag from an output dot onto a selected op's dimension line — bound (band = the line's
current visible range); drag the band's ends to set lo and hi; a live tick on the band shows the value
under the cursor; Delete on a band unbinds. The folded strip marks a driven op with a small notch.
Time-driven formulas never count as still (the governor keeps rendering; idle drift stays off).

**Phases**
- **V1 core** — core/drive.js: IR, normalize, notation `drive=`, CPU evaluator inside the CPU orbit
  (per-iteration and hoisted), graph.js edits keep bindings, breeding/lens on bands, tests (a driven
  bulb power by `i` equals a hand-unrolled schedule; world-driven parameters against differences).
- **V2 GPU** — the drive program packed and interpreted, the driven-bit rebuilds, duals, push, JIT,
  the step factor; parity (forward, inverse, dual) with driven cases in every suite.
- **V3 UI** — the driver lane, rings, drag-to-line binding, bands, the strip notch, time in the
  governor and the video exporter.
- **V4** verify in the app, docs, deploy when iori asks.

Open: whether shading may read driver outputs as readings (cheap once both programs share registers);
instances/subgraphs next.

**V1 built 2026-10-27 — the drivers on the CPU.** core/drive.js (the IR, normalize/validate, the
reference evaluator `evalDrive`, the orbit runtime `driveRuntime`, path ids `opPaths`, `remapDrive`,
the drivers' continuous parameters `driveParams`); `drive=` in the notation (base64url of the canonical
JSON, like `shade=`); JSON, hash and exported state carry it; an empty drive is no drive (same id).
- *Settled in building:* orbit readings are read once at the **start** of each iteration, before its
  ops (not before each op) — every driven op in an iteration, species included, sees the same values,
  and the GPU fills the registers once per iteration. A driven value is clamped to its parameter's range.
  `remap` maps [lo, hi] → 0..1 (the band maps it back). World fields as numbers: axis g·n̂·x, sphere
  g·(|x − c| − r), noise g·fBm, tissue `out` cell (the softmax-weighted cell index ÷ (n − 1),
  continuous) or wall (gap of the two nearest site distances ÷ size). `time` waves saw, sine, tri.
  Bindings are stored sorted by target (the same drive written in another order has the same id).
- *core/cpu.js:* the running drivers ride on the orbit context (`ctx.drv`: op → its driven parameters);
  every forward, inverse, Jacobian and chimera path reads parameters through it, so a formula without a
  drive runs exactly as before. iterate/de/lyapunov/lyapunovOrbit/jacobian take `opts.time`. Push: the
  hoisted drivers are read at the walk point and the orbit readings at the walk's iteration and point —
  an approximation for world drivers (the true start is unknown mid-walk), as Q2's world fields are.
- *core/graph.js:* every edit maps old path ids to new ones by walking the tree before and after (nodes
  keep their old `id` through an edit), so bindings follow moved ops, copies (fork, addSpecies, addChain)
  get copies — a fork still changes nothing — and removed ops or parameters (setField) take theirs
  away; a `param` driver whose op is gone becomes a `math` constant of the value it last read. New edits:
  bind, unbind, setBand, setDriver, removeDriver.
- *core/breed.js:* metric entries may name a driver parameter (`{ drive: 'bind/A2.s/lo' | 'node/n/f' }`);
  mutate and distancePx move them, pins by the same ref; structure is never bred.
- Tests: test/drive.test.mjs (6) — a bulb driven by `i` equals the hand-unrolled ABCDEF schedule bit
  for bit; |p|-driven scale replayed by hand; world, start, time, param and chimera-species/field-weight
  drivers equal the plain formula with the value written in; Lyapunov and Jacobian see driven values;
  undriven and own-value bands leave orbits and the push walk identical; notation/hash/state round
  trips; every validation error; every graph edit; breeding. 35 tests pass in all.

V2 must add: the drive program in the ops buffer and its interpreter (registers once per orbit for
hoisted nodes, once per iteration for the rest); the driven-bit rebuilds; duals (∇θ: fields' analytic
gradients, readings through the iterate's columns); push; JIT; the step factor; parity against
`evalDrive`/`iterate` with driven cases. Sensing (gpu/pack.js paramTangents, gpu/sense.js) enumerates
op parameters only — the lens, grab and breeding metric need the drivers' parameters (driveParams) as
sensed entries, and a sensed op parameter that is bound should be skipped (its own value does nothing).

**V2 built 2026-10-27 — the drivers on the GPU.**
- *Pack (gpu/pack.js):* the drive program after the shading program (DRIVE_AT; header, a 64-bit mask of
  driven ops, three vec4 per node, ten per binding: op, node, band, own value, range, mode, the record's
  derivative in the parameter). FLAG_DRIVE; head words 105/106 carry the clock and the step factor 1 / L
  (render's setClock / setStep, kept across formulas). Rotations, 4-D rotations and plane folds (the
  records that are not linear in their parameters) carry their raw parameters and are rebuilt on the GPU;
  four such ops, eight such bindings (validateDrive refuses more). paramTangents leaves bound parameters
  out and adds the drivers' (band ends, node parameters) plus, for sensing, a frozen row.
- *WGSL (gpu/wgsl.js):* one f32 register per node; hoisted nodes once per orbit (startOrbit → driveStart,
  then the first driveIter), orbit readings at the start of every iteration; rec() adds (v − own)·drec for
  a driven op, or reads its rebuilt record (drvNL, refreshed once per register update). Duals: every
  register carries its derivative along columns 0–3 (world axes, the sensed parameter) in forward mode —
  readings through the iterate's own tangents, fields by their gradients, maths by their partials, a
  sensed node parameter by a central difference — and a driven op's record moves with them (drvE into
  opTan; a driven chimera field's weights nudged along it). λ holds the drivers, as the CPU does. Push
  reads the drivers at the walk point (the V1 rule); the loop at the window's point.
- *Variants, not branches:* every hook is gated by `const DRIVE_ON = false`; `withDrive(source)` flips it.
  Undriven formulas compile and run exactly as before; a driven one gets the drivers' variant of each
  pipeline (march, lens, grid, sense, walk, loop; the JIT builds from it), compiled in the background the
  first time (gpu/render.js `variant`) — meanwhile it draws with its own values (3–7 s, once a session).
- *JIT:* driven ops read rec() (live) in both kinds, hoisted values are computed once; structureKey knows
  whether anything is driven.
- *Time:* the app's clock goes to the head every frame while a formula reads it (core/drive.js
  timeDriven); such a formula is never still (a soft trail, like the drift); the video walk sets i / 30.
- *The step factor:* measured, not bounded — at every sensed hit L = |∇DE| / |∇DE with the drivers held|
  (the frozen row), the march divides its steps by the 90th percentile, capped at 16. One L per frame
  (the per-tile form was not needed for the first cut). Validated against a brute-force CPU march
  (test/drive-gpu.test.mjs): a noise-driven Mandelbox scale (±0.2) — the plain march oversteps 4+ of 48
  rays, with 1 / L none; L ≈ 2.3 there. In the app a ±0.4 noise scale measured L = 5.1.
- *App:* sense hands back `driveParams` and `step`; R.setStep(step) after every sense; breeding's metric
  includes the drivers' parameters.
- Parity (test/parity.html, all PASS; the seven cases in test/driven-cases.js cover every node kind and
  rebuild mode, a chimera's species and field weight, a linked parameter): forward medians 6e-8–1.3e-4,
  p99 ≤ 0.9 % but 4 % for the noise-and-|p| Mandelbox (scale¹² amplifies float32's noise, a few 1e-6 off —
  driven rows pass at median < 3e-4, p99 < 5 %); inverse 0 wrong in all five; dual gradient median ≤ 0.008°,
  ∂DE/∂θ (driver parameters included) median ≤ 3.4e-4, λ ≤ 4e-6; JIT literal/structure = interpreter.
- Speed (ms per 2¹⁸ × 9 estimates, interpreter / structure / literal): undriven unchanged against the
  pre-V2 build run back to back (Mandelbox 6.5/1.2/0.9 then and now within noise). Driven: bulb by i
  4.5/1.6/1.8 → 10.3/4.4/4.3; Mandelbox by noise and |p| → 24.7/10.9/10.7; rotation by sphere, trap, λ
  6.5/1.3/0.9 → 39/20/21; KIFS planes by px and two tissues 6.8/1.3/0.9 → 48/29/30; chimera 38/19/18 →
  87/44/40. Compile (uncached): undriven as before (march 2.8 → 3.2 s), driven march 7.1 s.
- Traps: (1) the first form inlined the drive code into every rec() and every field call — Metal took
  minutes; keep each heavy function at one call site (mixTan's nudged weights share one fieldAt) and the
  hooks behind DRIVE_ON. (2) Metal miscompiled drvBuild's dynamically indexed local arrays once fwdAt was
  in the same shader (a rotate4 read back as a 3-D rotation): the rebuild uses vectors, selects and
  Givens rows. (3) Chrome caches compiled shaders by the generated code — a comment does not bust it;
  test/compile-time.html injects a nonce branch.

V3 needs: the UI (lane, bands, binding by drag, the strip notch); the lens, grab and drift on driver
parameters (sense returns them; overrides would need the drive program to take ov offsets); a per-tile L
if one L per frame proves too slow on mixed scenes; clock controls (pause, scrub) and the clock in
thumbnails (0 today); a hairline cue while the drivers' variant compiles.
