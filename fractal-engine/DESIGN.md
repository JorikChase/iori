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
not as the soft band they are. (Sites and soft walls: Q3.1 below.)

**Q3.1 — your sites, moved sites, soft walls. Decided with iori 2026-10-27, built the same day.**
- *Drop.* Hold still on open ground (450 ms): a hairline ring fills clockwise around the cursor; full,
  the formula you had becomes a site there — its own thumbnail (the current view), its breeding axes
  its two most sensed parameters (score pxPerUnit × own scale, as the grab ranks them; each spans
  ~240 px of change across the cell; sensed on the spot when no pass has run). Moving > 5 px first
  makes it an ordinary drag; a click moves the crosshair. The drop changes no formula: no lineage node.
- *Move.* Drag a site's disc: it moves, the formula under the crosshair follows live, one node on
  release if it changed. A click on a disc puts the crosshair on the site (the pure formula).
- *Remove.* Drag a disc off the square (24 px past its edge): yours is crossed out and gone on release;
  a family shows a dashed line to its home and goes back there.
- *Reset.* Double-click a corner mark: the families home, your sites stay. The corner marks are bright
  while the layout differs from the default.
- *Any formula can be a site* — a hybrid schedule unrolls into one iteration (iterations ÷ the word's
  length), a fixed c becomes a translate, drivers/shading/slice stay with it at its own site and drop
  across its walls. Same structure as a neighbour (ops, schedule, drivers, shading): parameters blend
  (c and slice too).
- *Chimera sites are hard* (the format allows no mix inside a mix, and the GPU interpreter has one
  level): a chimera is the whole of its cell and none of anyone else's — crossing its wall is a cut at
  the bisector, drawn as one hard hairline. Exception: a chimera whose whole chain is a constant-weight
  `blend` stays soft — its species join the wall's blend at its weight × theirs (exact). A stroke laid
  in space lays a chimera's first species (the heaviest, for a blend) in its place.
- *At most 24 sites* (11 families + 13 yours); at 24 the ring does not appear.
- *Stored* in this browser's localStorage (`fractal-engine.surface.v1`: moved families by id, your
  sites whole with their thumbnails), beside the lineage; `__fe.dry` writes nothing.
- *Soft walls.* The walls are drawn as the band they are: marching-squares contours of the leading
  weight max πⱼ at 0.6, 0.8, 0.95 (faint where the blend is even, brighter where a cell turns pure;
  ±2.5, 8.5, 18 px off a wall at 700 px), 160² grid (96² while a site moves). Hard edges are gone except
  around chimeras.
- Tests (test/metasurface.test.mjs): hard chimera cut and drawing, a blend chimera spliced and
  continuous, same-structure parameter blend, schedule unroll and c → translate, move/remove/home/reset,
  layout round-trip, the 24 cap, coincident sites, sensed axes, contours where πⱼ says. Verified in the
  page: hold-drop, drag, fling off (yours gone, a family home), corner reset, sensed axes; lineage untouched.

Not yet: touch for drop/move (a hold on touch already belongs to the crosshair drag start; desktop
decides); a chimera that blends softly through a field mix
(needs one more level of mix nesting in the interpreter).

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
- **Reused subgraphs (instances): later** — the next stretch once the driver dataflow is proven (built 2026-10-30: "Subgraphs").

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

**V3 built 2026-10-27 — the drivers in the graph.** core/drive-edit.js (unit-tested): addDriver (free, on
an input, or between a binding and its source — the old source becomes its input; a free remap reads the
iteration), connectDriver (loops refused, re-sorted), disconnectDriver, removeDriverNode (a bypass; what
loses a required input goes too, bindings with nothing to take their source go), setDriverParam,
bindTrace (each binding's value along the orbit — the band's live tick), handleRange, drivenOps.
ui/drivegraph.js draws the lane, its glyphs (ui/glyphs.js DRIVE_GLYPHS) and the links.
- *Where:* the lane is a dashed hairline inside the repeat zone, right of the chains (the zone widens);
  orbit readings in its first column, maths and remaps one column past what they read; the start, fields,
  time and param nodes in a row above the zone. Inputs on a node's top, its output below; bindings are
  dashed hairlines from a driver to the notch on its op (to the band while the op is selected).
- *Gestures as built:* hold the empty lane or top row — the ring of 19 driver types (param is not in it);
  hold an input dot, a driver link or a binding's hairline — the ring again, inserted there; drag from an
  output dot onto an input — linked; onto a selected op's dimension line — bound, band = the line's own
  range (±75 px at the sensed metric, in the parameter's range; a bound line keeps its band); rest on an
  op for ¼ s during that drag — its lines open (passing over one does not: the first cut selected every op
  the drag crossed). A bound line is rescaled so its band fills the middle two thirds: drag an end — lo
  or hi, the middle — both, click — selected (Delete unbinds); the orbit's values at the view's centre
  as a faint span and a tick (redrawn a few times a second while time drives). Pull an op's line up or
  down off itself and drop it in the zone or the top row — a param node reading it. Click a driver — its
  switches (wave, tissue out, math op, clamp) as glyphs and its numbers as lines below the zone; Delete
  removes it. Every edit is one lineage node (graphEdit / shadeCommit; `__fe.dry` respected).
- *Strip and structure:* driven ops carry a notch in the strip and the unfolded graph; a driven formula
  shows L as a hairline under the strip's count (a tick from 1 to 16, log).
- *Grab and drift:* the grab ranks the drivers' parameters with the ops' (sense already measured them;
  bound parameters are not offered) and edits them; idle herding wanders them too (pins by the same ids).
  The lens still offers op parameters only.
- Verified in the app (own tab on a /v3/ copy, `__fe.dry`, synthetic pointer events): a reading added
  from the lane's ring; bound onto scale's line by drag (band 1.56–3.44 from the line's range); hi end and
  middle dragged (setBand), band clicked and Deleted (unbind); a remap inserted on the binding's hairline
  (r0 → remap0 → scale), i0 wired into the remap by drag, its clamp toggled; noise added from the top row
  ring and its f dragged; a driver Deleted (bypass); fold.sphere's rmin pulled into a param node; the
  strip's notch and the L readout present; the grab ranked bind/A2.s/lo and node/remap0/lo between the
  ops' parameters and moved them; idle herding moved the band's ends. 42 unit tests pass.
- Trap: reloading a test tab whose hash holds a test formula calls remember() before `__fe.dry` can be
  set — four test nodes reached the shared lineage and were removed by hand from localStorage. Load test
  formulas with setFormula after setting dry, never through the hash.

Open: the lens on driver parameters (the drive program would need the lens's ov offsets); touch; the
band's live value is the centre's orbit only (no hover read-out under the cursor); a param node's `of`
is fixed (pull another line to read another); per-tile L; clock controls (pause, scrub); a cue while the
drivers' shader variant compiles; time in thumbnails.

## Drivers → colour (C), decided 2026-10-27

iori liked the shading colours and picked this over collage, instances and V polish. Decisions:
- **Shared drivers:** the driver lane's nodes are visible to the shading frame. Any driver's output
  can feed a ramp, math or mix input, so one noise can bend the shape and paint it, in sync. No
  shading-only driver nodes.
- **Everything in colour can animate:** ramp offset (colour flows along the terraces), hue rotation
  (the whole ramp turns around the hue ring), any ramp parameter (scale, offset, stop positions …)
  bound with bands like formula parameters, and a glow pulse.

**IR.** A shading node's input may name a driver: `in: { v: 'd:<driveNodeId>' }`. Shading parameters
bind like formula ones: `shade.bind: [{ to: '<shadeNodeId>.<param>', from: driveNodeId, lo, hi }]`, the
targets being a ramp's `map.scale`, `map.offset`, `map.hue` (new: a hue rotation in turns, applied
after interpolation by rotating Oklab a,b so lightness stays put), a stop's `stops.<k>.t`, a math's
`c`, a mix's `f`, and `out.gain` (new: the glow's strength, 1 by default — the pulse). Removing a
driver drops the shading links and bindings that use it (a linked input falls back as removeNode does).
Notation, JSON and hash carry it inside `shade=`.

**Evaluation.** At the hit point: world, time and param drivers exact (the hit is the world point the
last orbit started from); orbit readings from the last iteration's fill. Push splats: world, time,
param exact; orbit readings from the walk. A formula whose shading is time-driven is animated (the
governor keeps rendering, as for a time-driven formula). GPU: the shading interpreter reads the drive
program's registers kept from the hit's orbit; the drive program runs for shading even when no formula
parameter is bound (a colour-only drive), in the driven shader variant.

**UI.** The driver outputs run as a second bus into the shading frame, beside the readings bus; drag
from a driver dot to a shading input links it; a shading node's parameters are dimension lines that
take drag-to-bind with bands exactly as ops' do; the ramp editor gains a hue-rotation line; the outputs
gain the glow's gain line.

**Phases:** C1 core + GPU (IR, CPU evaluator, notation, edits, packing, interpreter, push, parity with
driven-colour cases, tests) → C2 UI (the bus, links, bands on shading lines, hue line, gain line,
verify in the app) → deploy when iori asks.

**C built 2026-10-27 — drivers → colour.**
- *Core (core/shade.js):* a number input may be `'d:<driver id>'`; `shade.bind` binds `<node>.map.scale |
  .map.offset | .map.hue | .stops.<k>.t | .c | .f` and `out.gain` (`shadeTarget` names them and their
  ranges: a stop between its neighbours, the gain 0..16); `map.hue` (turns) rotates Oklab a, b after
  interpolation (`hueTurn`; lightness kept, back in gamut); `out.gain` scales the glow. New keys are
  written only when used (hue ≠ 0, gain ≠ 1, a non-empty bind), so every existing formula keeps its
  notation and id. `evalShade(shade, readings, drivers)` takes the drivers' registers (`boundShade`
  applies the bindings) and returns `gain` too. validateShade checks the links and bindings against the
  formula's drive; the GPU keeps four driven stops (validation refuses more).
- *The orbit (core/drive.js, core/cpu.js):* `driveRuns(f)` — the drive program runs when something is
  bound *or* the shading reads a driver (`colourDrivers`); the per-iteration nodes refill every
  iteration when either reads one. `iterate` returns `drv`, the registers at the last fill (the start
  of the last iteration) — what the shading reads at the hit. A colour-only drive leaves the orbit
  untouched (tested bit for bit). `timeDriven` counts a clock the shading reads.
- *Edits:* core/shade-edit.js `linkDriver`, `bindShade`, `unbindShade`, `setShadeBand`, `setGain`,
  `shadeBindables`; every shading edit carries the bindings on their stops (a stop dragged past another
  keeps its binding; a removed stop or node takes its own). Removing a driver (core/drive-edit.js
  removeDriverNode, core/graph.js removeDriver) applies `dropDriverRefs`: links and bindings follow the
  bypass (a remap's input takes its place), else an optional input is left open and a required one reads
  the fold index; `addDriver(f, t, { bind })` inserts on a shading binding too.
- *GPU:* the shading program grew to four vec4 per node (the fourth: the hue) and a second header vec4
  (gain, bindings), plus a bindings table after the stops (core/shade.js packShade; gpu/wgsl.js takes
  the offsets from it, so DR_BASE and friends follow). An input ≤ −2 reads `drvReg[−2 − i]` — the
  registers the hit's orbit left — and the bindings apply per node; both only in the drivers' variant
  (`DRIVE_ON`), so elsewhere a driver reads 0 and every parameter keeps its own value (until the variant
  compiles, as V2). `drives(f)` (gpu/pack.js) = the program runs (the variants: march, push, loop, lens,
  JIT); `shapes(f)` = something bound (sensing, the step factor, the grid). render.js multiplies the glow
  by the gain; push splats read the walk's registers.
- *Parity (test/parity.html, PASS):* four driven shading graphs (every binding kind, a driven input on
  every port kind, constant/cardinal/B-spline ramps with hues) on 4096 random readings and registers:
  max channel error median 1.3–4.1e-7, p99 ≤ 2.1e-6, none off. Whole orbits (three formulas: colour
  only, colour and shape from the same noise, a bulb painted by its trap and iteration; the clock at
  1.37 s), the GPU's registers through its shading vs `iterate(...).drv` + evalShade: 0 iteration
  mismatches, median 1.4e-7–2.8e-6, p99 ≤ 8.9e-5, off (> 1e-2) 0, 0, 2 of 2048. The undriven suites
  unchanged (the new layout included); the colour formulas in the forward suite give the same estimates.
- *Speed:* an undriven shaded Mandelbox at 1440×900, still frames: 188/189 ms a frame before, 165/179
  after (same view, back to back — noise, no cost). A colour-driven one (noise into the ramp, the clock
  turning its hue) 159 ms. The JIT rows for the colour formulas: interpreter 14–22 ms, JIT ×1.8–2.1.
- *UI (C2, ui/shadegraph.js, app.js):* the drivers' bus is a dashed hairline under the readings' bus,
  each driver's link from its output dot down to the input it feeds; drag a driver's output dot onto a
  shading input — linked; onto a shading line — bound, the band the line's range (±75 px at the line's
  drag speed); onto a stop tick — bound, the band between its neighbours. Rest on a shading node (or
  the glow output) for ¼ s during the drag — its lines or editor open. The ramp editor's lines are now
  scale, offset and the hue turn; the bar shows the hue turned. Click the glow output — its gain line.
  Bound lines carry bands exactly as ops' do (ends drag lo/hi, middle both, click selects, Delete
  unbinds; a tick at the value the centre's orbit gives); a bound stop's band sits on the bar's own axis
  above it. Shading bindings draw as the drivers' binding hairlines, held — the ring inserts a driver.
- Verified in the app (own tab on a /c/ copy of the mirror, `__fe.dry`, the formula set with setFormula,
  synthetic pointer events): noise → the ramp's input (linked, its bus link drawn); the clock → the hue
  line (band −0.25..0.25, a live tick), noise → stop 4 (band between its neighbours); the hue band's end
  and the stop band's middle dragged; the glow output clicked, noise → its gain line, the band clicked
  and Deleted, the unbound gain dragged (1 → 1.2); a drag resting on the ramp opened its editor and
  bound its scale; the image animates with the clock. 47 unit tests pass (test/colour-drive.test.mjs:
  5 new). iori's lineage stayed at 138 nodes throughout.
- *Deviations:* splats exported as PLY read the drivers at the splat's point as an orbit's start (the
  walk's iteration is unknown there); the GPU's push reads them at the walk point (the V2 rule). Four
  driven stops at most. The live tick shows the centre's orbit only.

Open: the bound line's live span (an op's shows the orbit's range; a shading line has one value per
hit); a param node may not read a shading parameter; the lens on shading parameters; touch; time in
thumbnails (the clock reads 0 there, so a hue turned by time shows its start).

## Collage (K), decided 2026-10-27

The third way to mix (see "Next stretch (Q)"): *finished* distance estimates of two or more formulas
joined by a smooth minimum — designed seams. Breed interpolates parameters of one structure, a chimera
blends inside every iteration (a new dynamics); a collage leaves every piece's dynamics alone and
decides only where one surface meets the next and what the seam looks like. Decided with iori:
- **Joins — all four:** smooth union; smooth intersection and subtraction (the same kernels for
  carving); stairs and chamfer (terraced and bevelled seams, hg_sdf's forms); and the field morph
  d = (1 − w)·a + w·b, where a field decides which piece is there.
- **Varying seams come from the drivers.** Seam width, stair count's width, the morph weight and every
  placement number are ordinary parameters; a collage-level drive (world fields, the start point,
  time, param, math, remap — V's nodes without the orbit readings, since a collage has no orbit of its
  own) binds them with bands. A morph whose w is bound to a tissue driver is the "tissue of pieces".
  No join carries a field slot of its own.
- **Placement — all four:** each piece has a rigid placement and a uniform scale (the estimate stays
  exact: s·d(x′/s)); repetition (grid with counts, mirror, polar); its own 4-D slice (free: a piece is a
  whole formula, slice included); and a hand-placed gizmo in the UI (the affine frame, later).
- **A piece is any full formula** — iterations, schedule, bail, c, slice, chimeras, tissue, drivers,
  its own shade. Collages do not nest (no collage inside a piece); the joins fold left to right.
- **Graph:** pieces side by side, each its own repeat zone, a join node below each neighbouring pair
  with its kernel's glyph and the seam width as a dimension line.
- **Push:** each piece walks its own attractor; samples go through its slice, repetition and
  placement into the world and are kept by the collage — faded by the piece's share of the join there
  (a sample deep inside another piece of a union, or carved away by a subtraction, has share 0).
  Fillets get no splats of their own.
- **Colour — both:** every piece keeps its shade, blended across seams by the join weights; a
  collage-level shade, when set, wins, and gains two readings: `piece` (which piece leads, blended at
  seams, 0..1) and `seam` (how deep into a fillet, 1 on its middle).

**IR.** A collage is its own document beside the formula (`isCollage(x)`: it has `pieces`):
```
{ v: 1,
  pieces: [{ f: <formula JSON>, place: { tx ty tz, rx ry rz (degrees, Rz·Ry·Rx), s, g (grow) },
             rep: null | { kind: 'grid', cx cy cz (0 = not along that axis), nx ny nz (copies each side) }
                       | { kind: 'mirror', mx my mz (0/1), ox oy oz (where the copies sit) }
                       | { kind: 'polar', n, r (radius), axis (0 x, 1 y, 2 z) } }, …],   1..8 pieces
  joins: [{ op: union | inter | sub | morph, k: quad | cubic | exp | circ | stairs | chamfer | hard,
            r (seam width), n (stairs), w (morph weight) }, …],                       pieces − 1
  shade?: { nodes, out }    the collage's own colour (wins over the pieces')
  drive?: { nodes, bind }   bindings to 'J<j>.r|w', 'P<i>.tx|…|s' and the repetition's continuous
                            numbers 'P<i>.cx|…|ox|…|r'; param nodes read the same names }
```
A world point x reaches piece i as rep(R⁻¹(x − t)/s) (repetition in the piece's own frame, so the
array moves, turns and scales with it); d_i = s·DE_i(that point) with DE_i the formula's own estimate
(through its slice), less its growth g. The joins fold: D₀ = d₀, D_j = join_j(D_{j−1}, d_j).

*Found in building:* a fractal's estimate is unsigned — 0 inside for escape time, small and positive for
r/dr — so a piece has no inside, and max(a, −b) never carves (inside the cutter −b = 0). Every piece
therefore has a growth g ≥ 0 (d − g, a thicker piece): a subtraction's or intersection's cutter needs
g > 0, and its cut surface sits g out from the fractal's. K3's UI should give a new cutter a visible
default g (a fraction of its size).

**Kernels** (a, b → d and the partials g_a, g_b; r = 0 or `hard` is min/max exactly):
quad d = mix(b, a, h) − r·h(1 − h), h = clamp(½ + ½(b − a)/r) — g = (h, 1 − h); cubic d = min − h³r/6,
h = max(r − |a − b|, 0)/r — g = (1 − h²/2, h²/2) toward the smaller; exp d = min − r·ln(1 + e^{−|a−b|/r})
— g the softmax; circ (IQ's circular profile, r scaled by 1/(1 − √½)); stairs (hg_sdf: n steps across
r); chamfer min(a, b, (a + b − r)·√½). intersection = −union(−a, −b); subtraction a ∖ b = −union(−a, b).
morph: g = (1 − w, w). Every union kernel has g ≥ 0 and g_a + g_b = 1 (so the result stays
1-Lipschitz when the pieces are), except chamfer (√2 on its bevel: the step factor must cover it).
A driven join or placement makes the estimate non-Lipschitz as V's driven parameters do: the same
measured step factor L covers it on the GPU.

**Readings.** A join's share for its left side is |g_a| / (|g_a| + |g_b|); folding gives every piece a
weight (they sum to 1). `piece` = Σ ωᵢ·i/(n − 1); `seam` = the largest over joins of
clamp(1 − |a − b|/r) (the morph's 4w(1 − w)).

**Notation.** Pieces in braces, each written in the formula notation; after a piece its placement
words; between pieces the join: a symbol (∪ ∩ ∖ ~, or union inter sub morph, `\` for ∖), the kernel
word when it is not quad, then r (and n for stairs) — or w for a morph:
```
{ bulb 8 · +c ×10 } at .7 0 0 ∪ .3 { fold.box 1 · fold.sphere .5 1 · scale 2.5 · +c ×12 bail=100 } at -.7 0 0 size .1
{ menger … } polar 6 1.5 y ∖ stairs .2 4 { bulb 8 · +c ×10 } shade=… drive=…
```
Placement words: `at tx ty tz`, `turn rx ry rz`, `size s`, `grow g`, `grid cx cy cz nx ny nz`, `mirror xz ox oz`
(the axes word, then an offset per axis named), `polar n r [x|y|z]`; trailing defaults left out.
`shade=` and `drive=` after the last brace belong to the collage; inside a brace, to the piece.

**Phases**
- **K1 core (CPU)** — core/collage.js (IR, normalize/validate, notation, hash and URL, kernels with
  partials, placement and repetition, the estimate, weights and readings, the collage drive, push
  with the keep rule, colour blending), core/collage-edit.js (the tree with ids P<i>/J<j>, add,
  remove, move pieces, set joins/placement/repetition, edit a piece by any graph.js edit, bind/unbind
  with bindings following the pieces), tests.
- **K2 GPU** (after the drivers/shading session lands) — a collage program in the ops buffer: one
  op list per piece behind a piece index, the placements and joins as a small stack program in the
  march; the drive program for collage bindings; `piece` and `seam` added to shade.js READINGS and the
  shading interpreter; push per piece with the keep rule; parity against collageAt; the step factor.
- **K3 UI** — pieces side by side in the graph, join nodes with kernel glyphs and the seam width as a
  dimension line, the gizmo (the affine frame) for placement, repetition as ghosted copies; the app's
  hash, lineage and breeding learn the collage document.
- **K4** verify in the app, docs, deploy when iori asks.

**K3 decided with iori, 2026-10-27:**
- **Starting a collage:** drag a thumbnail from the lineage or the breed archive onto the field, or hold
  on a Metasurface site (Q3.1's hold-to-drop, but the site's formula is *added*, not swapped in). The
  formula on screen becomes piece 1; the new one lands where it was dropped (on the surface under the
  cursor, else at the view's focus), joined by a quad smooth union of a modest r. Up to 8 pieces.
- **Placing by hand:** click a surface to select the piece that leads there (the `piece` reading);
  its affine frame appears in hairlines — drag an axis to move along it, the ring to turn, the frame's
  corner to scale, Shift snaps. The numbers show as dimension lines while dragging. A new cutter
  (sub/inter) gets a visible default grow g (a fraction of its size).
- **Repetition while editing:** with a piece selected, its repetition cells are drawn as hairlines —
  grid boxes, mirror planes, polar spokes — the original's frame solid, the copies' ghosted. The render
  itself already shows every copy; nothing else is dimmed.
- **Breeding:** two collages with the same piece count breed piece by piece (each piece as a formula
  breeds today), placements and join numbers interpolated; a differing kernel or op is taken from one
  parent. Different counts, or a collage × a formula, do not breed. Collages go into the hash, URL and
  lineage like formulas.

**K1 built 2026-10-27 — the collage on the CPU.** core/collage.js (IR, normCollage/validateCollage,
canonical and hash, the kernels `smin`/`joinEval` with their partials, `toPiece`/`fromPiece`,
`repFold`/`repCopies`, `pieceDE`, `collageAt` → { d, dists, w, piece, seam, lead }, `collageGrad`
(central differences, the duals' reference), `drivenAt` (the collage drive through core/drive.js's
evalDrive at the world point), `collageColour`, `collagePush`, the notation `parseCollage`/
`formatCollage`, `parseAny`/`formatAny`/`fromURLHashAny` for text that may be either); core/
collage-edit.js (collageTree with ids P<i>/J<j>, joinPorts, addPiece, removePiece, movePiece,
editPiece (any core/graph.js edit on one piece), setPlace, setRep, setRepParam, setJoin,
setJoinParam, bindCollage, unbindCollage, setCollageDriver, collageParams/get/set for breeding and the
grab). Nothing outside these two files changed except core/index.js's exports; the app, the GPU and
formula.js's own URL hash do not know collages yet (K2/K3).
- *Settled in building:* a join keeps only the numbers its kind reads (r unless hard or morph, n for
  stairs, w for morph), so one look has one id. A missing join is a smooth union. Joins between
  positions: moving a piece leaves them where they are. Removing a piece takes the join that tied it in
  (the one before it; for the first piece, the one after). Push hands each base sample to one copy of
  its repetition, round robin, and drops a copy whose point does not fold back to the drawn one (it lies
  in another copy's cell); samples carry M (3×4, world from orbit) for the splat's axes and `off` for
  the slab weight. Repetition takes the nearest copy only — a piece wider than its cell is overstepped
  at the cell wall (as hg_sdf); K2 may check the neighbour across the nearest wall.
- Tests: test/collage.test.mjs (12) — kernels (hard = min exactly, shares ≥ 0 summing to 1, partials
  against differences away from the kinks, the quad's r/4 at the seam's middle), complements and the
  morph, exact placement with a point piece, every repetition against the nearest copy's distance and
  every copy folding back, the union's gradient = the share-weighted gradients, three pieces folded, the
  grown cutter, pieces that are chimeras / sliced / driven, the collage drive (axis → seam width, tissue
  → morph, param links, time; orbit readings refused), push (on the placed, mirrored piece; both copies
  sampled; carving and intersection fade samples; M's scale), colour (collage shade wins, pieces blend),
  notation round trips with hash and URL, edits with the drive following. 54 tests pass in all.

K2 needs from the shading session: `piece` and `seam` in shade.js READINGS (collageColour already passes
them in the readings object; evalShade ignores them until then).

**K2 built 2026-10-27 — the collage on the GPU.** Nothing of a formula's shaders changed: a collage
runs in shader variants of its own, written from the formula's by one rewrite.
- *Layout* (gpu/pack.js packCollage): every piece packs as the formula it is — its head, and its ops
  region (op records, shading and drive programs, OPS_FLOATS each) behind the piece index; a ninth
  region and head are the collage's own (its shade, its drive's nodes, laid out as a formula's); after
  the nine regions the collage program — header, four vec4 per piece (placement, repetition), two per
  join, two per binding. A binding names a flat program index (collageSlot: piece i's numbers at
  16·i + their place, join j's at 128 + 8·j + theirs), so the GPU overlays driven values on the vec4 it
  reads (clRead). The renderer's head and ops buffers are sized for eight pieces; a formula uses the
  first head and region.
- *The rewrite* (gpu/wgsl.js withCollage): `head.` → `heads[hp].`, `ops[` → `ops[pb + `, the uniform
  becomes `array<Head, 9>`, and `de` / `drvStep` are renamed out of the way. hp and pb are private
  indices that clSelect(i) sets, so every function of the interpreter, the duals, the inverse and the
  shading runs on whichever piece is selected; the collage's own code (COLLAGE, appended after the
  rewrite) reads its program by absolute index. One call site of `iterate`: collageAt loops over the
  pieces (placement, fold, slice, the orbit, s·DE − g), then folds the joins (clJoin/clSmin — every
  kernel, the complements, the morph) into the shares, piece, seam and lead, as collageAt does.
- *The drive* (clDrive): at the world point, the drive's nodes through the formula's own node
  evaluator (drvNode, the collage's region selected, drvStart = (x, 0)), then every binding clamped to
  its parameter's range; time reads the clock every head carries (setClock writes them all).
- *Readings:* `piece` (8) and `seam` (9) in core/shade.js READINGS and TYPE_CODE, in the GPU's
  Readings and shadeRun; a formula reads 0. ui/glyphs.js has a glyph for each. collageColour on the GPU:
  the collage's shade with the share-weighted readings plus piece and seam, or every piece's own shade
  (its region selected) or the engine's colour (clFallback, the includer's: render's tint) blended by
  the shares — one call site of shadeRun.
- *Pull* (gpu/render.js COLLAGE_MARCH, setCollage, collageReady): the march steps by the collage's
  estimate × clStep; the hit takes its normal by central differences of the collage (normalAt — the
  duals do not cross the joins and folds yet), every piece with a share > 1e-3 runs its dual orbit once
  for λ (blended by the shares), terraces read the lead piece's trap, the glow the shares' fold index
  (and the collage's shade when it has one). No JIT for collages: the interpreter draws them. deGrid
  (the mesh export) and renderStill work on a collage; the lens, the sensing pass and thumbnails do not.
- *Push* (gpu/push.js COLLAGE_WALK, entry cwalk): walker wi walks piece wi mod n (every piece its own
  attractor, the walkers shared alike); a sample goes through clKeep — the piece's slice (off for the
  slab weight), copy (age mod copies: round robin) of its repetition, dropped when it does not fold back,
  the placement — and is kept when its share there is ≥ 1e-3; the splat's weight is slab × share, its
  covariance G·Σ·Gᵀ with G = s·R·L (the M of collagePush, the slice part applied by the walk). A piece
  with its own c walks with it, the others with the app's (core/cpu.js push would take opts.c over the
  piece's: on the GPU a Julia piece keeps its own, the choice closest to what the CPU draws when no c is
  forced). The collage's own shade colours every splat (a splat reads only its fold index). Captured
  samples carry weight and piece.
- *The step factor:* static (collageStepFactor, packed): √½ per chamfer join (√2 on its bevel,
  compounding join by join) and 0.3 if any piece is not pull-safe, as a formula's march does. Measured
  (R.collageStep(points) → { step, ratios }): at the caller's points, clSteep's |∇D| with the drive
  live over |∇D| with its values held at the point (central differences, clFreeze) — the 90th
  percentile, ≥ 1, capped at 16; the caller hands it to setStep (written into every head; the march
  reads the collage's own head). It covers the collage's drive only: a piece's own drive program is not
  measured inside a collage (sense.js measures a formula alone).
- *App:* `__fe.collage(textOrDoc)` draws a collage in place of the formula (pull and push) until the next
  setFormula (`__fe.collage(null)` goes back), resolving once the march has compiled; deAt (the camera's
  clearance) reads the CPU collage, the sensing pass is skipped meanwhile. Nothing else in the app knows.
  Seen drawing headless (Playwright, `__fe.dry`): a bulb ∪ shrunk Mandelbox ∖ grown bulb in pull and push.
- *Tests:* test/collage-cases.js (19 collages: every kernel, inter/sub with grown cutters, the morph,
  three pieces with turn + polar + chamfer cut, grid, mirror, chimera and sliced pieces, a driven piece,
  the collage drive — axis → seam, time → placement, tissue → morph, a param link — its own shade
  reading piece/seam/depth, the pieces' own shades); parity.html's collage suite (34 rows: the six
  collage shaders compile in both variants; forward — median rel error 1–8e-7, p99 ≤ 2.3e-4 (the driven
  piece 9e-4), no iteration, share or colour mismatches beyond 2 colour points of 2048; keep — no fold
  or keep disagreement, places to 1e-7; step — L to 1e-5, an undriven collage exactly 1);
  `run-parity.mjs --only collage` runs it alone (~45 s); test/collage-gpu.test.mjs (5: the pack against
  pack() of every piece, binding slots, the static step, the rewrite, the readings). Compile times on
  this Mac: march 4.5 s (drive 8.9 s), walk 3.9 s (14.6 s), step 1.5 s (2.5 s).
- *Traps:* JS's Math.round rounds halves up, WGSL's round() to even — the grid fold uses floor(x + ½).
  The rewrite would also hit code appended after it, so the collage's own code must be appended after
  withCollage, and the copied walk body rewritten by hand (`head.` only — it has no op reads). A
  WGSL-side fold-back tolerance of 1e-4·max(1, |q|) (the CPU's 1e-6 is below float32). The CPU's push of
  the box ‖ bulb blend chimera finds no preimages (the keep rows use a KIFS ‖ abs·sort chimera).
- *K3 needs:* the UI (graph nodes, gizmo, ghosted copies) and the app's hash, lineage, breeding, grab
  and lens learning the collage document; a sensing pass for collages (hits for collageStep, the metric
  of placement and join parameters — the duals through the joins would give both, and an exact normal);
  the JIT per piece (the structure JIT keyed by every piece's structure); a decision on what a collage's
  shade may read of drivers (core/collage.js collageColour passes none, so GPU and CPU agree on none; a
  piece's shade that reads its drivers sees whatever registers the last piece left); push colour
  readings beyond the fold index (piece and seam on splats); the neighbour across the nearest cell wall
  for repetitions wider than their cell (K1's note).

**K3 built 2026-10-27 — the collage in the app.** The app's document is a formula or a collage; every
tool that knew formulas now knows both, and K3's decisions above are all in.
- *The document* (app.js): `state.collage` (normalised) beside `state.formula`, which in a collage is the
  picked piece's formula (piece 0 when none is). `setDoc(text)` replaces the document with either;
  `setFormula(text)` is the formula tools' edit — on a collage it lands in the picked piece, so the grab's
  op parameters, a piece's own graph, the slice (Option-drag) and the Metasurface's crosshair all edit a
  piece with their existing code. `state.pick` is the piece (an index), `'C'` (the collage's own shading:
  a one-op proxy formula carries its shade into the shading frame) or null. Hash and URL carry the
  collage's notation; `restore`, the walk, the morph, replay, the video and the exports read either
  (core/state.js: a PLY or PNG state may hold a collage, its own canonical JSON and hash). `__fe.setFormula`
  replaces the document (tests load collages through it too).
- *Starting:* `dropPiece(text, x, y)` — from a lineage dot dragged onto the field (followed on the window:
  hovering redraws the structure layer), a breed-ring neighbour carried out past its thumbnail (60 px
  beyond it: it follows the hand; formulas only), or a Metasurface site held still for 450 ms (the drop ring
  fills around the site; a click still goes there, a drag still moves it). The piece lands centred on the
  surface under the cursor (else at the focus), sized to a quarter of the view there by its natural radius
  (the surface marched in from 16 along the six axes, cached), joined by a quad union a tenth of its size.
  Eight pieces at most; a collage dropped on a collage is refused.
- *Picking and placing* (ui/gizmo.js): a click (still, under 280 ms) traces the CPU collage and picks the
  piece that leads there; open ground unpicks, as Esc does. The frame: three axes along the piece's turned
  frame, as long as the piece (natural radius × size) but kept 50–170 px on screen, the bars at their tips
  saying x, y, z (one, two, three); a ring in the screen's plane; a corner bracket between x and y. An
  axis drag moves along that axis (the screen drag projected on the axis), the ring turns about the line of
  sight (Rodrigues, back to Rz·Ry·Rx degrees by `eulerXYZ`), the corner scales by the distance from the
  origin; Shift snaps a move to a tenth of the frame's length (a power of ten), a turn to 15°, a size to two
  figures. While dragging: the move as a dimension line from where it started, the turn as an arc in
  degrees, the size along the corner. The lines carry a faint dark halo of themselves (a bright piece
  swallowed white hairlines).
- *Repetition while a piece is picked:* `repCells` — a grid's boxes (a zero cell width spans the piece's
  radius on that axis), a mirror's planes, polar's axis, spokes and sector walls; the original's cell and
  frame solid, the copies' cells and small frames ghosted (dashed); 125 cells at most, nearest first.
- *The graph* (ui/collagegraph.js; G, or the Tab strip): pieces side by side, each its own formula drawn
  as the strip draws one (its repeat zone, ×iterations, a repetition's glyph at the zone's corner); the
  fold as hairlines into a join node under each neighbouring pair; the output below the last join. A
  join's glyph is the join itself — marching squares of the kernel's zero set over two half planes meeting
  at a right angle (union, intersection, subtraction corners, the fillet, the stairs, the bevel, a morph's
  tilted line) — and under it the seam width as a dimension line exactly as wide as the seam is on screen
  at the focus (clamped 6–140 px; the stairs' steps as ticks; a morph's weight on a fixed line). Drag it:
  the end follows the hand. Click a join: its numbers below (r, n, w); hold it: the ring of the four ops
  (with its kernel) and the seven kernels (with its op), each drawn as its own contour. Click a piece:
  picked, its placement and repetition as dimension lines below, grouped behind glyphs (translate,
  rotate, scale, grow, the repetition's kind); translation and growth move a world pixel at the focus per
  pixel, turns ½° a pixel, size 0.5 % a pixel, counts a step per 14 px. Hold a piece: the ring of
  repetitions (none, grid 2.5 radii, mirror x 1.2 radii out, polar 6 at 2 radii). Click a picked piece's
  op: its own formula graph opens on that op (the existing editor, editing the piece); G or Esc comes back.
  Click the output: the collage's shading in the existing shading frame (pick 'C'). Delete removes the
  picked piece. Every edit goes through core/collage-edit.js. A new subtraction's or intersection's
  cutter with no growth grows a tenth of its size (`withJoin`).
- *The collage's drivers:* a row above the pieces (ui/drivegraph.js draws it; no lane). Hold the row:
  the ring of the drivers a collage may have (start x y z w, the four fields, time, math, remap — a remap
  reads the driver before it); drag a driver's dot onto a selected line or a seam line: bound over the
  line's own range (a band, its ends dragged); onto another's input: linked. Click a driver: its numbers
  and switches below; Delete removes it (and a remap left with nothing to read), or the selected band.
  core/collage-edit.js gained `removeCollageDriver` and `connectCollageDriver`.
- *Breeding* (core/collage-breed.js): `lerpCollage(a, b, t)` — same count only; a piece of one structure
  interpolates as a formula does (`lerpFormula`: parameters, c, slice, bail; its drivers and shading from
  the nearer parent), of two structures comes whole from the nearer parent; placements, a repetition of
  one kind and a join of one op and kernel interpolate (counts rounded); a differing kernel, op or
  repetition kind comes from the nearer parent (a below ½). It drives the walk and the morph between two
  collages of one `collageStructure`. `mutateCollage` steps D pixels across the metric — the collage's own
  numbers (`{ ref: 'P0.tx' | 'J0.r' }`) and every piece's op parameters (`{ piece, oi, key }`) — so the
  breed ring, the archive and the drift's herding work on collages unchanged.
- *Sensing* (core/collage-sense.js, the minimum): a CPU pass over the collage — sphere-traced rays,
  central differences of the estimate in x and in every parameter, speed = |∂D/∂θ| / |∇D| / (t · pixel
  angle) as the GPU's duals measure it; λ the leading piece's Lyapunov exponent at its point. 12×8 rays
  for the view (~30 ms for two pieces), 16×10 without parameters for the archive and the ring (~7 ms), the
  grab's 25 + 24 rays at the cursor. A driven collage's step factor is the GPU's (`R.collageStep` at the
  hits, then `R.setStep`). The grab ranks and edits collage numbers and pieces' op parameters (no orbit is
  drawn: the piece's orbit lives in its own frame). Thumbnails: `R.renderThumb` draws collages (the
  collage march, compiled once and shared with the live view); the lineage's are the canvas as before.
- *Left out on purpose:* the loop (a collage has no one map to feed back through: P skips it, a flow into
  or out of a collage cuts) and the JIT (the interpreter draws collages).
- *Tests:* test/collage-k3.test.mjs (7): breeding (ends exact, placements and parameters at t, the kernel
  and the repetition's kind from one parent, counts and formulas refused, structure), the metric and
  mutation (ids, values, clamping, a neighbour exactly D px away, pins), the CPU sensing (hits, the lead,
  every parameter, 3 px by the metric moving the surface ~3 px), the state document carrying a collage, the
  graph (layout, hit tests, the seam line, every kernel's contour), the gizmo's maths (Euler round trips,
  Rodrigues, every repetition's cells), the drive edits. 77 tests pass; parity 196 rows pass.
- *Seen in the app* (the Browser pane, a scratchpad mirror, `__fe.dry`, synthetic pointer events through
  the real handlers, the field and overlays composited by the page): a box dropped on a bulb; the axis drag
  with its dimension line; ring 30° snapped, corner, Shift; a grid's cells; the graph with the repetition
  ring, the join ring (sub → the cutter grew 0.026), the seam line dragged; a piece's own graph editing
  its op; the collage's shading on (a ramp reading `piece`); an axis driver bound to the seam width with its
  band; the breed ring of collages and a walk; the grab on a collage, Esc reverting; a lineage thumbnail
  dragged onto the field; a Metasurface site held into a third piece; a breed neighbour carried out of the
  ring; a collage's lineage node restored by ⌘Z / ⇧⌘Z; the collage from the URL on reload. Shots:
  `design/shots/k3-*.jpg` (dropped + frame + strip, the axis drag, grid cells, the join ring, the drivers'
  band, a site held on the Metasurface, a neighbour carried out of the ring).
- *Open (K3 leaves):* what a collage's shade may read of drivers — decided 2026-10-28, built in K3.1
  (below). The lens refuses collages (it varies one formula's op records in
  one pass); grab and breeding run on the CPU sensing pass — a GPU sensing pass for collages (the duals
  through the joins: an exact normal and the metric of every number at once) would replace it, and would
  let the drivers' parameters of pieces into the metric (they are not measured now). The JIT per piece;
  piece and seam readings on push splats (an exported splat cloud of a collage takes the collage's shading
  with col only, else the engine's colour); the neighbour across the nearest cell wall; dropping a collage
  onto a collage (its pieces could join, re-placed). The ring of drivers has no param node (a collage
  number's param node would come from pulling a line off itself, as a formula's does).

**K3.1 decided with iori, 2026-10-28: a collage's colour reads the collage's own drivers only** — its
world-point drivers (the fields, the start, time, math, remap; param nodes read collage numbers), never a
piece's. They are defined at every point, so the shade reads them at the hit, CPU and GPU alike; a
piece's drivers live in its own orbit and frame and would be ambiguous across a seam.
- *CPU* (core/collage.js): `collageDrivers(c, x, time)` — the collage's drive program at world point x
  (`start = (x, 0)`, its param nodes reading the collage's numbers), null when its shade reads none;
  `collageColour(…, opts)` takes `{ x, time }` and hands those registers to evalShade ('d:' inputs,
  shade.bind). `validateCollage` checks the shade against the collage's own drive: a 'd:' input or
  binding naming anything else — a piece's driver — is refused. `removeCollageDriver` drops the shade's
  links and bindings to a gone driver as a formula's edit does (core/shade.js dropDriverRefs).
- *GPU:* packCollage packs the shade with the collage's drive (a 'd:' input names its register in the
  drive program's order); `collageShadeDrives(c)` sets the program's second vec4 w and puts the march, walk,
  grid and thumbnails in the drivers' variant (where shNum/shBound read registers). `clShadeDrive(x)` runs
  the collage's drive nodes at x — whether or not anything shape-wise is bound — right before the shade:
  at the hit (collageColour now takes x), where the ray ended for the glow, at the splat's point for push.
- *UI:* the collage's shading frame (pick 'C') shows the collage's drivers, and only those: the proxy
  formula carries the collage's drive nodes (no bindings; a param node as the constant it reads) and the
  frame takes drags from their output dots — into a number input, onto a shading line or a stop — as a
  formula's does. The drivers are added, linked and removed in the collage's graph, not here. A splat
  export of a collage takes its shade with the drivers at each splat.
- *Tests:* collage-k3.test.mjs (8: the colour equals evalShade with the drive's registers at x across
  points and times, two points two colours, a piece's driver refused, removal following into the shade,
  the GPU flag and variant); parity's collage suite gained 'own shade: its drivers' (a sphere field through
  a ramp, the clock bound to its hue, x mixing in the seam's ramp, x also widening the seam).
- *Seen in the app:* the collage drawn with its colour varying across x by its drivers; its shading frame
  offering exactly its four drivers; a drag from the x driver's dot into a ramp's input linking `d:x`
  into the collage's shade (`design/shots/k31-shade-drivers.jpg`). Parity: 197 rows, the new one's colour
  median 2.8e-7, none off. Found on the way: the frame's unfold animation threw on the proxy's hidden op
  (fixed: the collage's shading opens without unfolding).

## Touch (T), decided 2026-10-28

The live site was hard to use on a phone: every interaction was built mouse-first. Desktop decides what
happens; touch adapts the gesture and the layout, never the behaviour, and adds no buttons.

**Audit.** What a phone did not have: the keyboard (Tab, G, M, P, L, R, Space, F, ⌘Z/⇧⌘Z, ⌘S, WASD/QE,
Esc, Delete, schedule letters), Shift (the lens, gizmo snap, loop roll, the walk stroke, hue alpha), Option
(the slice, the field stroke), the wheel (next op, ring distance, knob pairs, hue lightness, loop zoom),
double-click (the mode: iOS does not fire it reliably), hover (lineage and graph thumbnails, the edge's
plus). Already fine: one-finger look, pinch, hold-to-grab, the long-hold ring, knobs, Metasurface
drop/drag/fling, corner double-press, taps on the strip and in the graphs. Broken: a pinch in the loop
moved the 3-D camera; the "reticle centred on touch" decision was never built (`pointerType` read
nowhere); hit radii sized for a mouse; the structure layer and the breed ring laid out for a desktop.

**Decided with iori** (the four recommended answers, and the base map proposed with them):
- *A second finger is the modifier, everywhere.* In a grab, the lens, the knobs, the ring or a gizmo drag:
  resting = Shift (the lens opens after 280 ms, the gizmo snaps); a quick tap = one wheel notch (the next
  op, the next knob pair, farther neighbours); a double tap = F (pin). Esc-undo of a grab is the two-finger
  tap afterwards (the parent).
- *A touch grab aims at the crosshair in the centre of the screen* (DESIGN's "centred on touch"): hold
  anywhere, the grab senses what is at the centre and draws its reticle, handle and orbit there; the
  finger only drags. Nothing hides under the thumb.
- *The keys with no gesture are a hairline glyph row in the structure layer*, above the exports:
  Lyapunov (two orbits parting), replay (the lineage walked), the Metasurface (its square, two sites, a
  wall), drift (a wandering line). Bright while on. Shown only on a coarse pointer or after a touch.
- *The slice:* three fingers — drag tilts it (Option-drag), pinch moves it along w (Option-wheel).
- *The graphs are fully editable:* pinch and pan inside (the drawing scales, hairlines stay hairline);
  pinched closed past 0.6, the graph folds back to the strip; the press is the hover (the thumbnail of the
  op without it); fling an op node off the frame = Delete; a vertical drag on a schedule letter steps it
  through the chains' letters.
- *Base map:* two-finger pan = sideways and up (WASD/QE), pinch = along the view (as before); double tap =
  the mode (P); two-finger tap = the parent, three-finger tap = the newest child (⌘Z / ⇧⌘Z, Procreate's
  convention); tap a gate corner mark = the structure layer (Tab: the only chrome becomes its switch); in
  the loop pinch zooms its window, pan moves it, twist rolls it; in the ring a pinch brings farther or
  nearer neighbours.

**Built** (app.js "touch" section; `ui/structure.js`, `ui/glyphs.js` KEY_GLYPHS, `ui/gizmo.js` slop):
- `touchDown/touchModMove/touchModUp` (the modifier finger, outside `pointers`, so the grabbing finger
  stays the only one the grab reads; a modifier cancels the hold's 1.2 s ring timer), `multiMove` (two and
  three fingers, inert until they travel past 12 px so taps never nudge the view), `touchEnd` (taps:
  lineage, corners, double tap). A finger left of two carries the look on from where it is (it used to
  jump to the first finger's start).
- The ring on a phone opens in the middle of the screen and the finger points from where it pressed;
  spokes shorten so the farthest neighbour fits (`fit` = (min side / 2 − 44) / 220, ≤ 1: a desktop window
  over 528 px is unchanged). A ring reopened by a pinch stays unopened if the fingers lift while it senses.
- Metasurface: fingers already down rest while a new one draws — one resting = a walk (Shift), two = a
  field (Option). A finger carrying the crosshair or a site is not resting. While the surface is open on a
  touch screen only the structure layer's key row answers (on a phone the strip lies under the square).
- Over the Metasurface and the graphs a two-finger tap is Esc (the selection first, then the view); on a
  graph a three-finger tap is Delete (stops, bands, drivers, shading nodes, ops — every kind the key
  removes; the fling covers op nodes). A press outside a graph's zone folds it on release for a finger
  (on press for the mouse), so a pinch may start there.
- The hue ring: with a stop held, the second finger sets lightness (up/down) and alpha (sideways) — the
  scroll and shift-scroll.
- Gizmo: hit slop ×2.5 for a finger; a resting second finger snaps.
- Structure layer on a narrow screen (< 600 px): the lineage has the bottom to itself (as many columns as
  fit), the exports and the key row rise above it.
- iOS: no page pinch (`gesturestart`/`gesturechange` refused), no callout or tap highlight, no overscroll,
  no context menu from a long press; a dblclick synthesised from a double tap is ignored (touchEnd has it).
- `__fe.input`: what the hand holds (grab, lens, ring, modifier, pins, mode, surface stroke, a graph's
  view with its nodes and letters on screen) for the rig.

**Verified** — `test/run-touch.mjs`: Playwright's mobile Chromium at 390×844 with WebGPU, real touch
events through the DevTools protocol (`Input.dispatchTouchEvent`, a lifted finger is a touchEnd naming
it), so the browser's own touch → pointer path runs. 27 checks, all pass: pan, pinch, look, the two- and
three-finger lineage taps, the centre aim, second-finger tap / double tap / rest (next op, pin, lens),
double tap mode, loop pinch + twist, loop knob pairs, the three-finger slice, the corner switch, the ring
and its pinch, the key row (L, drift), a lineage dot tapped, surface walk and field strokes and its close,
the graph's press thumbnail, letter drag, pinch zoom and fold, fling and three-finger Delete, the hue ring's
second finger, Esc, and the gizmo by finger with a resting finger's snap. `--desktop` (1280×800, mouse and
keys): drag, wheel, hold-grab at the cursor with Shift's lens, dblclick, Tab without the key row, the ring —
unchanged. Shots: `design/shots/touch-*.jpg` (`--shots`). The profile is Playwright's own and thrown away;
`__fe.dry` is lifted only to grow the lineage for the lineage check.

**Still open:**
- On a real iPhone: Safari's edge swipes (back/forward) and the home indicator were avoided by design, but
  only emulation was run — the first phone session should confirm the corner marks sit clear of the rounded
  screen corners and that three-finger gestures are not taken by iOS (its text-editing undo).
- ⌘S's 4K still, the exports and the replay work by tapping the structure layer; video/splat/mesh exports
  on a phone are untested for memory.
- The graphs' hit radii are the desktop's: small nodes need a pinch first (the out-port of a shading node
  sits 8 px under its centre). A finger-sized hit test in graph space is the next refinement.
- Desktop keys still have no touch gesture: Esc while the field is idle (nothing to undo there), Delete of
  a collage piece by fling in the collage graph (the three-finger tap does it), the schedule letter keys
  (the drag replaces them), WASD's speed (shift).
- A tablet with a keyboard gets both; nothing chooses one.
- *Fixed 2026-10-28 (core/carry.js):* `growArchive` called `mutate` with the previous document's metric
  right after a document switch (`ops[m.oi]` of an op that was not there, a page error). The sensed metric
  now carries the structure it was measured for: a pass stores it only if that document is still on
  screen, and setDoc / setCollage drop it for a document of another structure (breeding, herding, the
  ring and walks wait for the next pass). And a morph or walk no longer overwrites a document set while
  it runs (restore's 350 ms morph ended with its own target): the transition's own frames are flagged,
  any other document stops it where it is; a flow carries on. Tests: test/carry.test.mjs (5), the rig's
  'a document set mid-morph wins', and the rig now fails on any page error (it saw both before the fix).

## Overlay toggles, decided 2026-10-28

On an iPhone iori could not find the graph, the Metasurface or the shading: on touch they hid behind the
structure layer's key row and keys. And iori could not see how a piece had been added (a hold on a
Metasurface site adds one, a tap swaps the picked piece's formula, and nothing on screen says which).

**Decided with iori** (binding):
- *One corner mark unfolds a row of hairline glyphs*, which folds again after a choice or 4 s. The mark is
  the page's **menu icon**: the site burger that `site.py menu` generates. On this page only it is
  restyled as three white hairlines (0.55, bright while the row is out, a hairline × while the site's menu
  is open). app.css does this from outside the generated region: its rules out-rank `assets/menu.css` by
  specificity, and app.js only listens to the checkbox. `site.py`, the MENU region and every other page
  are untouched.
- *The site menu stays reachable by a second press of the mark* (iori's choice over "the row's last
  glyph"): the first press unfolds the row (the checkbox's own toggle is prevented), a second press while
  the row is out folds it and lets the checkbox open the site's menu, and a third press closes the menu as
  on every other page. Escape folds the row (menu.js's Escape still closes the menu).
- *The toggles, the same set on every device* (desktop decides): the graph (G), the shading frame, the
  drivers' lane, the Metasurface (M), the collage, the structure layer (Tab, or a gate corner on touch),
  Lyapunov (L) and the mode (P and the loop). A glyph is dim (0.45) while off and bright (1, a 1.2 stroke)
  while on, with a faint dark halo so a dim one reads over a bright field. Every key keeps working; the
  row only shows them.
- *Layout adapts:* the row runs leftward from the mark along the top when it fits (desktop, tablet, a
  phone on its side), else down the right side (a phone upright). Glyphs sit 46 px apart for a finger
  (38 with a mouse) and each hit is that whole square. The row grows from wherever the mark is, at the
  top right, 50 px in, which keeps it clear of the rounded corners, the dynamic island, the home indicator
  and Safari's edge swipes. In landscape the mark moves in by the safe-area inset (less 24 px).
- *The collage glyph:* two overlapping contours, bright while the scene is a collage. Tapped in a
  collage it opens the collage graph. Tapped before there is one, it opens the Metasurface in "add a
  piece" mode, so the first piece is added the same way as the rest.
- *"Add a piece":* the collage graph has a plus (in a circle) left of its pieces. It opens the Metasurface
  in "add a piece" mode, where the crosshair only points (the picked piece's formula is not swapped) and a
  plus rides beside it. A tap on a site adds that site's formula as the collage's next piece. A tap or a
  drag on open ground adds the formula there. Each new piece goes where the view looks: the centre, as a
  touch grab aims. A hold on a site still adds the piece where the finger was. Opened from the graph's
  plus, the collage graph comes back with the new piece in it. Outside this mode a tap on a site still
  swaps and a hold still adds. No plus once the collage is full (MAX_PIECES).

**What the shading and drivers toggles mean.** They fold a part of the formula's graph away rather than
opening something else. Inside the graph, the shading glyph folds the shading frame away or back. The
formula's network takes the room (`graphPlacement` drops the frame's width from the scale). Drawing and hit
tests skip the frame, and its selection goes. The drivers glyph does the same to the lane: the network
is laid out without it, the lane and its bindings' hairlines are not drawn, and a bound line's band still
shows on its op. With the graph closed, either glyph opens the graph with that part back on. In a collage
the shading glyph opens the collage's own shading (pick 'C'), and the drivers glyph opens the collage
graph (its drivers' row). The folds last for the session (`panes`, not in the hash). The collage's own
shading always shows both.

**The structure layer's key row stays.** The new row does not replace it: on a coarse pointer, L, R, M
and drift remain in the structure layer above the exports. Replay and drift have no glyph in the new
row; they are not overlays.

**One drawing at a time:** a toggle that opens the graph, the collage graph or the Metasurface first
closes the others and any grab, ring or lens (`clearOverlays`). A graph left that way does not bounce
back to the collage graph.

**Built:** `ui/toggles.js` (the glyphs, `toggleLayout`, `drawToggles`); app.js "the overlay toggles"
(`toggleOn`, `pressToggle`, `unfoldRow`/`foldRow`, the checkbox listener, `panes`, `shadeShown`,
`driveShown`); `openSurface(add)`, `addFromSurface`, `surfaceTo`'s pointing-only branch and the plus at
the crosshair (ui/metasurface.js); `cvPlus` in the collage graph; `#toggles` in index.html (outside the
generated regions) and its rules in app.css. `__fe.input.toggles` = { row, on, panes, add };
`__fe.input.cgraph.plus` is the plus on screen.

**Verified:** `node --test` 83/83. `run-touch.mjs` 33/33 at 390×844 by real touch events, 5 of them new
(the mark unfolds and folds by itself; a second press opens the site menu and a third closes it; graph,
Metasurface, structure and Lyapunov on and off; the modes pull → push → loop → pull; the shading frame
folded away and back while the network widens, then the lane; the collage glyph's add mode → 2 pieces,
the graph's plus → 3 pieces, back in the collage graph). `--desktop` 11/11: the same five by mouse, plus
G and M beside the row. No page errors. `run-parity.mjs` exit 0. Shots: `design/shots/touch-toggles-*.jpg`
and `touch-desktop-toggles-*.jpg`.

**Still open:**
- On a real iPhone: the mark's place against the dynamic island in landscape, and whether a tap on the
  hidden checkbox is ever taken as a scroll (the page refuses scrolling).
- In add mode a walk or field stroke (resting fingers, Shift, Option) still plays its formulas as it
  always did. Only taps and drags add.
- The row has no glyph for replay, drift or the exports (they stay in the structure layer).

## Hover labels, 2026-10-28

The graphs are glyphs with no text, so iori asked for names on demand: *"hover label text on mouse steady
or finger holding on button elements in the node graph"*.

- **When.** A mouse resting still (within 3 px) for 400 ms on a control, or a finger held still (within
  the tap slop, 12 px) for 400 ms. A move, a press, the wheel or a key takes the label away. A second
  finger takes it away too, since two fingers are a gesture, not a hold. A drag in progress (a node, a
  value, a band, a link) shows its value, not a name.
- **What.** Every control a press acts on:
  - the formula's graph: op nodes, the edges and their plus, the schedule letters, the count, both pluses,
    the selected op's lines;
  - the shading frame: nodes, ports, links, the outputs, the ramp editor's toggles, lines, stops and bar,
    the hue ring;
  - the drivers: nodes, ports, links, bindings, the selected driver's switches and lines, the bands;
  - the collage graph: pieces, their ops, joins (op and kernel: "smooth union · quad"), seam lines,
    placement lines, the plus, the output;
  - the rings of choices (ops, fields, driver and node types, ramp presets, joins, repetitions): the item
    pointed at;
  - the overlay toggles, and the structure layer's strip, key row and exports.

  The name is one to three words. An op is its notation ("fold.box"). On a desktop the key follows,
  dimmer, where there is one (graph G, structure Tab, Lyapunov L, the mode P, the Metasurface M, replay R,
  drift Space, the still ⌘S).
- **One table.** `ui/labels.js` holds every word: `LABELS` (keyed by glyph id, or a short id of its own),
  `KEYS`, `PARAMS` for the dimension lines (`<op>.<key>` first, then the key alone), and `joinLabel`. The
  documentation uses the same names.
- **Read off the presses' own hit tests.** `graphLabelAt`, `shadeLabelAt`, `driveLabelAt`, `cvLabelAt` and
  `pickerLabel` in app.js test in the same order as `graphDown`, `shadeDown`, `driveDown` and `cvDown`, so
  a label names what a press at that point would act on. The toggles and the structure layer's rows are
  found by their `data-*` attributes under the point. Labels are listened for on the window in the capture
  phase and only draw. They never take a press, so a hold does exactly what it did before: a node's
  thumbnail, the ring of ops at 300 ms, the grab at 280 ms and the breed ring at 1.2 s on the field, and
  fling-delete.
- **Look.** 11 px mono, white, over a faint dark halo (`paint-order: stroke`), no box, in its own layer
  (`#labels`, above the toggles). With a mouse it sits right of the element (left where the screen ends).
  It sits above the middle of a dimension line, where the value shows while held, and below a glyph of the
  toggle row. With a finger it sits about 55 px above the finger, beside the hover thumbnail (which is
  left of the node), never over it. It is always kept on screen.

**Verified:** `node --test` 83/83; `run-parity.mjs` exit 0; `run-touch.mjs` 37/37 at 390×844 and `--desktop`
14/14, no page errors. Shots: `design/shots/touch-labels-hold.jpg`, `touch-desktop-labels-*.jpg`. The rig gains `labels:` checks (every control of a shaded, driven,
two-chain formula and of a two-piece collage named; the toggle and key rows; a finger hold names the op
above the finger beside its thumbnail and selects as before; a second finger and a field hold show none
while the grab and ring still open), and `--desktop` the same sweep plus resting, a tremor, a move and the
toggle row with its key.

## The paper (docs), decided 2026-10-28

The engine's documentation is a research paper with live figures, in paper 0's format:
**`fractal-engine/paper.html`** (iori.me/fractal-engine/paper.html, registered hidden until iori has read it).
Ten chapters in DESIGN's order (the orbit and notation; pull, push, loop; derivatives and the metric; grab,
lens, lineage, breeding; 4-D, chimera, fields, Metasurface, graph; shading, drivers, drivers → colour;
collage joins, placement and repetition; exports and state; touch and the toggles; what is not built). Each
tool: what it is, the maths in a line (a folded "The mathematics" box for more), a desktop/touch table, and
a live figure. 28 numbered references (`python3 papers/fractals/refs.py fractal-engine/paper.html`).
Names follow `ui/labels.js` (the hover labels) where the two meet.

**Decided with iori** (the four recommended answers): the URL beside the engine; figures are the real
engine with every gesture, covered until a click or tap enters them; the maths as a line plus a folded box,
with citations; hidden first.

**Built:**
- *Embed mode* (app.js `EMBED`, `?embed`): the engine as it is, but nothing is stored — the lineage is in
  memory only (`createLineage({ store: false })`: it neither reads nor writes the reader's), the Metasurface
  starts at its default layout and is never saved, the URL hash is never written — and the site's menu stays
  shut (the mark only folds the toggles' row; app.css hides the menu's panel). `&view=D [&yaw= &pitch=]`
  frames the origin, `&win=H` puts the loop's window on the origin, `&open=` opens structure, lyap, graph,
  shade, drive, surface or cgraph (`openEmbed`). Remember and the drag-made nodes still run, into the
  figure's own lineage, so ⌘Z and the lineage section work inside a figure.
- *The figures* (`paper/figures.js`): one entry per figure — its document (shade/drive programs built
  through core/, so the notation is the engine's own), view and what is open; `figureSrc` writes the iframe's URL.
- *The page* (`paper/paper.js`, `paper/paper.css`; ../papers/fractals/paper.css for the look): a figure is
  an iframe created once it has stayed in view 350 ms and removed as soon as it leaves, so its GPU device,
  pipelines and JIT go with it; at most two live (the farther from the screen's middle gives way). A cover
  ("click/tap to enter") keeps the wheel and the finger for the page until the reader enters; a press
  outside, the mouse leaving or the figure leaving covers it again. Under every figure, its document as the
  engine has it now (read from the same-origin iframe twice a second; hover: which shader draws it). The
  notation figure takes a typed formula. One GPUDevice per figure: sharing one would need app.js as an
  instance factory (its state is module-level), far from a small change.
- *Test rig* `test/run-paper.mjs` (`--phone`, `--shots`, `--only`): every figure starts in view with no
  error, no NaN in its drawings and its line shown; never more than two live; none past the figures; a tap
  enters, a touch hold grabs at the centre and edits, a tap outside covers; the notation figure draws a typed
  formula; no `fractal-engine.*` key in localStorage and no figure's hash rewritten; no page errors.
  Shots: `design/shots/paper-*.jpg`.

**Found while writing it:**
- A collage's repetition is measured in the piece's own units, before its size (`polar 6 4` at `size .25`
  is a ring of radius 1). Units given in world terms made copies overlap inside one cell: a white ring
  and no copies. The paper says so in 7.2.
- *Bug, fixed 2026-10-28:* a shading network fed only by drivers (an input linked `in: { v: 'd:nz' }`, no
  reading) laid the whole formula graph out as NaN. ui/shadegraph.js layoutShade puts readings at depth 0;
  with none, row 0 was a hole in a sparse array, `rows.map` kept it as undefined, Math.max gave NaN for the
  frame's width, and the shared unit u was NaN for every node. Counted with Array.from now
  (test/colour-drive.test.mjs: a driver-only network and the edit that makes one lay out finite). Figure 17
  links the noise straight into its ramp again.
- The drift wandered one collage's turn fast (77° in 7 s), the grid whose copies overlapped (above); in the
  well-formed figures a turn moved a degree or two. Possibly the CPU metric of a turn when the surface
  barely moves with it; not looked into.

**Verified:** `run-paper.mjs` 29/29 desktop (every figure starts in 1.4–5.4 s) and 29/29 `--phone`;
`node --test` 83/83; `run-parity.mjs` PASS; `run-touch.mjs` 33/33 (the embed changes leave the app alone).
In the Browser pane: no console errors over all 21 figures, never more than two live, none at the
references; a tap enters at 375×812, a touch grab aims at the centre and edits, a press outside covers.
`python3 site.py check` passes. Shots: `design/shots/paper-*.jpg`.

Not yet: the paper is not linked from the engine itself (a glyph in the structure layer could open it);
figures share no GPUDevice; the toggles figure cannot show the site menu's second press (embed folds only).

## Papers 0.1 and 0.2, 2026-10-29

iori asked for the engine's illustrations in the fractal paper and for a radiance-fields paper. Decided with
iori (the recommended answers): a sub-paper **Metafractal: The Space of Fractals Is Fractal**
(`metafractal.html`, paper 0.1) built on the engine's figures, with a bridge in paper 0 (section 1.6, one live
engine and the link); a sub-paper **Radiance Fields: Elements and Morphs** (`radiance-fields.html`, paper 0.2)
with small new 2-D figures for the elements and engine figures for the morphs; both hidden, listed in
`papers/series.py` (papers/index.html and the stubs' series lists) and in paper 0's chapter 8.

- *Engine figures on any page:* `paper/figures.js figureSrc` builds absolute URLs from its own module, so a page
  anywhere loads `fractal-engine/paper/paper.js` and writes `<figure class="engine" data-fig="…">`. New entries:
  `pushJulia` (the arrival Mandelbox pushed: the Julia-type set of the point looked at), `tetraPull` (the
  tetrahedron pulled, beside `push`; both now framed at yaw 0.6, pitch −0.5 so the centre ray hits the solid and
  a touch grab finds a surface — at 0.5/−0.6 it passed through a hole).
- *Metafractal's own figures* (`papers/metafractal/julia.js`, WebGL2, drawn on demand): the parameter plane beside
  the Julia set of the crosshair's c (drift along the main cardioid when untouched; the readout says connected or
  dust), and Tan Lei's similarity — M and J_c around a Misiurewicz point (i, ≈ −0.1011 + 0.9563 i, −2) zoomed
  together. Boundaries are drawn by the distance estimate, so hairlines stay crisp to 10⁻⁴.
- *Radiance Fields' own figures* (`papers/radiance/fields.js` pure, `figures.js` Canvas 2D): a ray through a
  density (σ, T, the weights, exact vs NeRF's α quadrature, a sharpness slider from fog to surface); view
  dependence as circular harmonics with cameras; one shape in four representations at one budget, with errors;
  three morphs (densities, distances, Gaussians). Measured on shape A (mean |error|, budgets 64 / 256 / 1024
  numbers): voxels 5.6 / 2.6 / 0.9 %, distance grid 2.7 / 0.8 / 0.2 %, k-means Gaussians 4.7 / 3.1 / 2.3 %,
  lowest frequencies 4.8 / 1.6 / 0.4 %.
- *Rig:* `run-paper.mjs --page metafractal.html | radiance-fields.html` — every engine figure, every page figure
  draws (`figure.local`), the grab on a pull figure. Verified: engine paper 29/29; Metafractal 16/16 desktop and
  phone; Radiance Fields 13/13 desktop and phone; no page errors. Shots `design/shots/metafractal-*.jpg`,
  `radiance-fields-*.jpg`.

Open: paper 0's bridge embed uses paper 0's own iframe embed (no tap-to-enter cover, like its iris and flame
embeds); Metafractal's open item — the box-counting dimension of a lens map's zero set — is measurable with the
engine and not done; the engine has no view-dependent emission (Radiance Fields §7).


## Performance, 2026-10-29

iori asked whether the GPU is used optimally. It had never been profiled; this stretch measured first, then
kept only what the bench showed paying with the image unchanged.

**The rig** (`test/run-bench.mjs`, test/README.md "Performance, headless"). Fixed scenes, cameras and size
(1440×900, dpr 1) on this Mac (M3 Pro, Metal, headless Chromium). The live loop is stopped and the rig
submits frames itself, one at a time. Per pull scene: the march pass's GPU time from timestamp queries
(median), still frames (shadows, 5-tap AO, literal JIT) and moving frames (structure JIT); the wall time to
a converged still (64 samples; 16 for the two slowest scenes, so the Mac never runs a long chain of
second-long dispatches); compile times. Push and the loop: wall time per frame through the app's own step().

**The guard.** Every pull scene is rendered with the same seeds by a reference commit (default: the rig's
own commit, 6295557) and by this tree. The images are compared tonemapped as the display shows them (8-bit
sRGB): pass at PSNR ≥ 40 dB and SSIM ≥ 0.99 (luma, 8×8 windows), both still (converged) and moving (one
sample). Why these: with the same seeds an unchanged renderer is bit-identical (∞ dB), so the guard sees only
what a change does. Float reassociation (a compiler ordering a sum differently) lands at 55–111 dB; 40 dB is
an RMS error under 2.6/255, below what shows on screen, and SSIM 0.99 catches a structural change (a missed
surface, a shifted edge) that PSNR would average away. Push and the loop are stochastic in their atomics and
are timed, not image-guarded; parity's inverse and keep rows check push's maths against the CPU.

**Baseline** (GPU ms per frame; compile ms cold, the first run before Metal's shader cache held them):

| scene | still | converged | moving | cold compile |
|---|---|---|---|---|
| Mandelbox cave | 37.7 | 2.48 s | 31.7 | — |
| bulb | 6.1 | 0.45 s | 4.1 | — |
| Menger | 8.5 | 0.61 s | 7.5 | structure 1218, literal 1148 |
| KIFS | 7.7 | 0.55 s | 7.5 | 1158, 1130 |
| driven bulb (iteration → power) | 45.9 | 3.01 s | 34.9 | — |
| driven Mandelbox (noise → scale, r → fold) | 589.5 | 9.45 s (16) | 402.6 | literal 3052 |
| chimera (box ‖ Menger, axis field) | 717.7 | 11.51 s (16) | 423.4 | 2162, 1921 |
| three-piece collage | 28.8 | 1.91 s | 27.3 | march 259 |
| bulb ∪ Mandelbox collage | 427.3 | 27.44 s | 232.2 | — |
| push, chimera | 1078.5 wall | | | |
| push, Mandelbox | 9.5 wall | | | |
| loop | 1.0 wall | | | |

What the baseline said: the plain formulas were already fast (the JITs); every slow case was the same
pathology — private arrays indexed by a loop variable (they live in memory, not registers) and work redone
per column or per binding inside the orbit. Driven formulas were ×10–15 a march step over undriven ones
with the same step count, the chimera ×20, push on a chimera ×110 over push on the box.

**Kept** (each its own commit "fractal engine perf: …"; ratios against the baseline, same run conditions):

| change | effect | guard |
|---|---|---|
| chimera forward weights alone (`fieldAtF`: no gradients, no tissue site array, two vec4 registers); the JIT's species in registers | chimera 718 → 188 ms | 65 dB |
| the JIT inlines the drive program (registers per node and binding, code by node type, a driven row written out as `drvRec` sums it) | driven Mandelbox 590 → 290 | ∞ |
| the duals load a driven op's record motion only for a driven op | → 252 | ∞ |
| the duals fill all four columns' record motion in one walk over the bindings | → 238 | ∞ |
| push's blend Jacobian runs each species once for all four columns | push chimera 1078 → 240 ms | parity |
| the chimera's tangent runs each species once for all its dual columns | chimera → 152 | 65 dB (unchanged) |
| collage pieces get structure JITs (dispatched at `collageAt`'s one call site, built in the background) | three-piece 28.8 → 13.2, bulb ∪ box 427 → 140 | 55–111 dB |

**Now** (2026-10-29, after all of the above):

| scene | still | converged | moving | vs baseline (still) |
|---|---|---|---|---|
| Mandelbox cave, bulb, Menger, KIFS | 37.6, 6.2, 8.7, 7.7 | as before | as before | ×1.00 (∞ dB) |
| driven bulb | 25.1 | 1.66 s | 23.0 | ×1.83 |
| driven Mandelbox | 238.1 | 3.83 s (16) | 188.2 | ×2.48 |
| chimera | 151.7 | 2.45 s (16) | 114.8 | ×4.73 |
| three-piece collage | 13.2 | 0.92 s | 12.7 | ×2.18 |
| bulb ∪ Mandelbox collage | 140.0 | 9.03 s | 84.5 | ×3.05 |
| push, chimera | 239.4 wall | | | ×4.51 |

The governor turns these into resolution: the same 18 / 45 ms targets now afford more pixels on the slow cases.

**Tried and reverted** (no gain, or a gain not worth what it cost):
- *A two-pass march (march into a hit buffer, shade in a second dispatch)*: the hypothesis was that the hit
  shading's register footprint throttles the whole kernel. ×1.00–1.08, and the image no longer bit-identical.
  The strip experiment that suggested it measured removed work, not register pressure.
- *Workgroup shape*: 8×8 (now) = 8×4; 16×4 and 16×8 ~5 % slower; 4×4 twice as slow.
- *Unrolled `solve4`* (push's Newton): ~2 %, within noise.
- *Removing the tissue site array from `drvField`, shrinking the drivers' private arrays*: nothing.

**Not done, and why:**
- *Over-relaxed sphere tracing, iteration LOD, temporal reuse while moving*: each changes the image. The glow
  is summed per march step, so fewer steps change the glow itself. Asking iori first, with before/after images.
- *Pixel-footprint stopping*: the march already stops at ε = t · pixel angle · 0.6.
- *A pipeline cache, precompiling variants*: macOS's Metal shader cache already makes every repeat compile
  ~20–40 ms (cold 1–3 s); only a device's first visit pays.
- *Skipping far collage pieces (bounding volumes)*: the join must give exactly the near piece's value when the
  far one is out of reach, kernel by kernel (exp never does exactly); open.
- *A JIT for the dual numbers*: built, see "The dual numbers compiled" below.

Open: the collage lens and the collage's CPU sensing pass (~30 ms) are untouched; the collage JIT's cold
compile is ~5 s (the interpreter draws meanwhile, as for a formula); a new drive wiring now recompiles the
structure JIT (the wiring is baked in), where a band edit does not.

### The dual numbers compiled, 2026-10-30

`gpu/jit.js jitDual` writes `iterateDual` for one formula beside `iterate`, in the same pipeline, for both JIT
kinds: the interpreter draws until it is ready, exactly as before, and `gpu/wgsl.js` did not change. One op is
one block: what its forward map and tangents share is computed once, a branch that leaves the tangents alone
holds no code (the sphere fold's outside, a fold plane's far side), and a fold's sign flips all columns at once.
What it leaves out: the selected-parameter column, the colour and the Trace's branches, which nothing at a hit
reads. Chimeras unroll (species in registers, each once for all columns); drivers inline with their derivatives
as `driveInline` inlines them forward. A rebuilt op or a chimera's own record keeps the interpreter's
`driveIterDual` and `mixTan` inside the compiled loop, every other op stays compiled. A collage piece compiles
to λ's column alone (its normal comes from differences of the collage's estimate).

**Before and after** (same run, reference d354f0a re-timed beside this tree; GPU ms per frame; guard against
d354f0a, every pixel the same seeds):

| scene | still | converged | moving | guard (still, moving) |
|---|---|---|---|---|
| Mandelbox cave | 37.8 → 29.8 ×1.27 | 2.50 → 2.00 s | 32.1 → 24.0 ×1.34 | 76, 67 dB |
| bulb | 6.2 → 5.6 ×1.11 | 0.46 → 0.45 s | 4.2 → 3.3 ×1.26 | 78, 64 dB |
| Menger | 8.7 → 5.4 ×1.61 | 0.62 → 0.42 s | 7.5 → 4.6 ×1.65 | 75, 61 dB |
| KIFS | 7.8 → 4.7 ×1.65 | 0.65 → 0.38 s | 8.0 → 5.2 ×1.53 | 101, 106 dB |
| driven bulb | 27.5 → 8.6 ×3.19 | 1.86 → 0.64 s | 24.5 → 5.5 ×4.45 | 87, 84 dB |
| driven Mandelbox | 245.4 → 124.4 ×1.97 | 3.97 → 2.01 s (16) | 217.0 → 73.5 ×2.95 | 68, 64 dB |
| chimera | 156.8 → 77.5 ×2.02 | 2.54 → 1.26 s (16) | 124.2 → 46.3 ×2.68 | 67, 64 dB |
| three-piece collage | 13.8 → 14.3 ×0.97 | 0.96 → 0.98 s | 12.5 → 13.1 ×0.95 | ∞ |
| bulb ∪ Mandelbox collage | 149.7 → 123.4 ×1.21 | 9.71 → 8.07 s | 90.6 → 64.1 ×1.41 | ∞ |

SSIM ≥ 0.9999 throughout. Push and the loop do not run the duals: unchanged. The three-piece collage is 3–5 %
slower (seen in every run: its pieces are light, and three compiled orbits behind a switch cost about what one
interpreter did); it stays, for the heavy collages' gain. These ran beside the audio rigs (load average 340–480):
the ratios are one run's, the absolute numbers somewhat above the table before this one.

**Compile** (cold, ms; a nonce past Metal's cache, `test/compile-time.html`, the JIT runs in the background
either way). The interpreter's `opFwd` and five inlined `opTan` leave the shader with the interpreter's dual:

| JIT | structure | literal |
|---|---|---|
| Mandelbox | 2016 → 700 | 1847 → 554 |
| bulb | 1751 → 605 | 1725 → 544 |
| Menger | 1810 → 523 | 1803 → 606 |
| driven Mandelbox | 3686 → 952 | 3365 → 813 |
| chimera | 2388 → 1404 | 2482 → 1337 |

The collage JIT is unchanged within noise (three pieces 8554 → 8658, union 7935 → 8363, under the same load). A
repeat compile stays ~30 ms; a first frame still draws with the interpreter.

**Kept, each its own commit:** plain chains (both kinds); the chimera; the drivers; collage pieces' λ.

**Measured and left out:**
- *Dual without literal rows*: the literal kind's rows pay 1–14 % (KIFS 5.6 → 4.9): kept.
- *Dropping λ's column when nothing reads it*: ~1 % on plain and driven formulas, ~5 % on the chimera; it would
  need a second pipeline per look. Not done.
- *Skipping a collage's dual orbits when nothing reads λ* (a flag in its head): 127.5 → 126.5 ms; λ's column
  alone is already almost free there. Reverted.
- *The chimera's weights in registers* (`fieldAt` still returns its arrays): with the weights stubbed out, the
  ceiling, 79.9 → 79.5 ms. Not done.
- *A sensing JIT*: the pass takes 3 ms (box), 14 ms (driven, chimera) on the whole-view grid. Not worth a compile
  per structure: `gpu/sense.js` stays on the interpreter, so the selected-parameter column is never compiled.

## Colour defaults and the gizmo's axes, 2026-10-29

iori noticed that adding a colour ramp changed the colour at once, and wanted the gizmo to move pieces
anywhere. Decided with iori:
- **Keep the look, then choose.** A new ramp starts as the colour the field already has: core/shade-edit.js
  addNode copies the ramp that colours the link it lands on (a ramp, or a mix's first colour followed up; free,
  the surface's), parameters and input. A math (× 1) and a mix (a colour with itself) already kept it. shadeOn
  takes the view's look (key, iridescence, spread, hue), so starting the frame keeps the colour too (the old
  tint's facing term, `cosv · 0.35`, is not in the graph: a small shift where the surface turns away).
- **The presets ring opens beside the new ramp** and stays open: a tap on a gradient takes it, a tap anywhere
  else shuts it, Escape too. Gradients only; a mouse at rest or a finger held names one (ui/labels.js
  `preset.*`). Holding a ramp opens the same ring as before (point and release).
- **The presets: iori's picks, in the ring's order** — oil, malachite, bone, prism, strata, beetle, abyss
  (core/shade.js RING_PRESETS). Chosen from four families on comparison sheets (design/colour/sheet-*.jpg, five
  formulas each — a Mandelbox cave, a bulb, a KIFS, a chimera, a collage — rendered one 480×300 image at a time
  by design/colour/render-sheet.mjs; the candidates are design/colour/schemes.mjs). A preset is a ramp *and*
  its reading (PRESET_READING): applying one feeds the ramp that reading when a reading fed it (the one it
  leaves goes when nothing else reads it); a math or a driver feeding it stays. fire, ice, film and mono stay
  in RAMP_PRESETS (documents and tests name them) but are off the ring.
- *What the sheets taught* (render-sheet.mjs --diag measures each reading's spread over the lit pixels): the
  fold index barely moves on folding formulas (0.39–0.49 on the Mandelbox, 0.50–0.54 on the KIFS) and is 0 on
  the bulb; depth is near 1 on the Mandelbox and KIFS; the orbit trap spans 3–4 octaves everywhere (centred
  between 2^−3 and 2^0 by formula) and facing 0.2–0.85. So the presets read log trap with repeat or mirror
  (terraces and strata whatever the formula) or facing (the films).
- **Gizmo: local or world.** A tap on the frame's centre dot flips its axes between the piece's own and the
  world's (ui/gizmo.js gizmoGeometry(…, world)); the world frame draws dimmer (.gz.wd), so the state reads
  without words. Dragging the centre moves the piece freely in the screen's plane through its origin (a pixel
  is `depth / k` world units there; Shift or a resting second finger snaps each screen direction to the axis
  drag's step). Nothing new on screen. Finger slop × 2.5 for the dot; a finger held past the label's 0.4 s names
  the state ("local axes" / "world axes") and does not flip it. The other handles are named too (move along x,
  turn, scale). The state is the session's, not the document's.
- Verified: node --test 88/88 (test/colour-presets.test.mjs: 3 new); run-touch 39/39 and --desktop 16/16 (new
  in both: 'gizmo: centre tap = world, drag moves', 'graph: new ramp keeps the look, presets beside it' — the
  colour before and after the add equal on sample readings, the ring open with seven gradients, oil taken by a
  tap with its reading); paper.html §6.1 and the collage table updated. Shots: design/shots/touch-*ramp-presets,
  touch-*gizmo-world.

Open: the open ring can cover part of the formula's strip on a narrow screen; the facing term of the old tint.

## Closing examples, 2026-10-29

From the research brief `papers/study/2026-10-29-examples-research.md`, iori chose the recommended set.

- *Engine paper, chapter 10 "Examples: As Published, and One Step Further"* (old 10 → 11): seven pairs, the
  original beside one step (`.fe-pair`, two engines side by side, each square; stacked on a phone): Mandelbulb →
  a tissue of powers 8/5; Mandelbox −1.5 → a polar collage ring of seven; Menger → Menger ‖ Sierpiński at .5;
  quaternion Julia → c on a sine clock; Amazing Surf → one-hue terraces and its inner rotate on a clock; the arrival
  hall in one hue (Horsthuis's "Fractal Nature" manner) → its scale driven by noise through space; a bulb Julia
  pulled → pushed (splats). New refs: Fragmentarium, Mandelbulber 2, knighty 2010, Abalo's gallery, Horsthuis.
- *Measured, and why two steps changed:* a Mandelbox chimera with shading drew at 0.6–1.1 s a frame (surf ‖ box at
  .5; a tissue of box 2.5 ‖ box −1.5), so neither belongs on a page; the steps became a clock and a noise driver
  (22 ms a frame). The one-hue ramp reads the trap in bands, mapped ×0.35 mirrored (×1.8 clamped went white).
  Framing chosen by a CPU coverage scan (11×11 rays): Surf at yaw 0, pitch −0.5, distance 8 (64 %).
- *paper.js:* a figure refused by the two-engine cap (a pair scrolled in while the last pair still ran) used to
  wait forever; `fill()` now starts waiting visible figures, nearest the middle first, whenever one stops.
  A sweep once a second also stops running figures out of view and fills free slots, in case the observer missed
  a change. And the pairs' grid columns are `minmax(0, 1fr)` with `min-width: 0` on the figures: a grid item grew to
  its one-line formula, the page became wider than a phone, the phone zoomed out (innerHeight 1905 at 390 wide) and
  three engines counted as visible. The rig now checks the page fits the screen after the figures ran.
- *Metafractal 0.1, chapter 7 "Maps Elsewhere"* (old 7 → 8), `papers/metafractal/contemporary.js`: the trainability
  map (Sohl-Dickstein's smallest case: width-4 tanh, one data point, 300 steps, per pixel in a fragment shader;
  tap to zoom, "measure the border" box-counts the image — 1.46 on the GPU in float32 where a float64 CPU run gave
  1.44; he reports 1.41); Hofstadter's butterfly (the trace of q transfer matrices at θ = π/2q, Chambers' P(E),
  every p/q to q ≤ 64) with the bands' total width at the golden mean's Fibonacci approximants: 5.66 … 0.17 → 0;
  the Rauzy fractal (200,000 tribonacci prefixes on the contracting plane, the left eigenvector of the complex
  root) and its lattice copies tiling the plane. Refs checked: Avila–Jitomirskaya math/0503363; Baake, Gähler,
  Mazáč, Sadun arXiv:2411.15503 ("On the long-range order of the Spectre tilings").
- *Radiance Fields 0.2, chapter 7 "Fractals That Hold Light and Matter"* (old 7 → 8), `papers/radiance/sierpinski.js`:
  an electron on generation 4 of the gasket (123 sites, H = −A, Jacobi in the page, residual 1e-14), one state's
  |ψ|² or the microscope's view at an energy (states within ±0.12 summed) drawn as additive emission; the enzyme's
  geometry (hexamers of three dimers at the odd entries of Pascal's triangle mod 2: 3^k; symmetric contacts fill the
  triangle) with mass ∝ size^1.585. The enzyme is drawn as geometry, not chemistry, and the text says so.

Open: orbit density as a medium; a sun-and-fog look preset for open landscapes. (The seed estimate, the Mandalay fold
and the kaliset: "New families", below.)

## Planned, in the paper, 2026-10-30

iori: *"put the planned features into the docs so we can just fill it in once the features are there."* The engine
paper's last chapter (it replaced "What Is Not Built Yet") is **11. Planned**: 31 stubs in four groups (new capability,
speed, finishing touches, further out), each the template of a tool section: a title, a line or two in the future
tense, an empty desktop/touch table, a figure slot, a folded maths box only where the maths is known. To fill one in:
move its `div.planned` to its chapter as an `<h3 id>` section and drop the tag, write the walkthrough and the gestures,
add the figure to `paper/figures.js` and replace `.fe-slot` with a `figure.engine`, run `run-paper.mjs` (the same note
stands as a comment at the chapter's head). A stub has no figure element, so it starts no engine. Over-relaxed
stepping, far-iteration LOD and temporal reuse are tagged "not decided": each changes the image, and iori decides.

## New families, 2026-10-30

iori chose: the Kleinian families, Mandalay and the kaliset here; orbit density as a medium and a collage as a seed
each a stretch of their own, later; the lattice families' sites stand **inside** a hall.

**The seed estimate.** An orbit at scale 1 never escapes, so r/dr has nothing to measure and fills space. A seed is an
op (`seed.slab nx ny nz d t k`, `seed.sphere r k`, `seed.pillar r k`) that does nothing to the point: the estimate
reads it at the orbit's end, |v(p)/dr − t|, v the distance to the shape. As an op, its parameters are sensed, lensed,
grabbed, bred and driven with no new code. `head.sliceW.w` (word 107) names it, FLAG_SEED says there is one.
- *Rules.* The first seed of a formula is the one read. An escaped orbit keeps r/dr. A seed in a chimera's species
  speaks only where that species leads (`seedSpecies`, third record row against `Trace.sp`): read everywhere, a slab
  drew sheets through a tissue's box cells. A hard switch, so a seam can step.
- *Duals.* `seedRead` gives v, its gradient and the divisor; `deTan` differentiates them. A seed's own parameter and a
  driven seed's motion go by a central difference through the record (`seedStep`, not `recStep`, which skips row 0,
  where `kleinian` keeps a: the first driven row was 4° off). The JIT writes `drvV` back at the orbit's end so a driven
  seed reads its value.
- *Plain formulas pay nothing.* The new cases and the read sit between `FAMILIES` marks and behind `SEED_ON`; `withJit`
  strips both from a formula without them (a JIT's structure is fixed). Before that, box-cave stills cost 5–8 %
  (repeated A/B against ce1df0f); after, 45–46 ms against 45–47. Only the interpreter carries them.

**The ops.**

| family | formula | estimate | push |
|---|---|---|---|
| pseudo-Kleinian (Theli-at, knighty) | `fold.cell .92 .91 .92 · fold.sphere 0 1 · seed.slab` | ½\|z\|/dr; Lipschitz p99 1.02, max 1.9 | median sample 2e-8 from the set |
| its pillars ("thingy") | `… · translate .1 .12 · seed.pillar .08` | max(ρ − r, \|ρz\|/\|p\|)/dr | as above |
| Apollonian (iq) | `wrap 1 1 1 · invert · scale 1.1 · seed.slab 0 1 0 0 0 .4` | k\|y\|/dr; at iq's k = ¼ p99 .54, max 1.3, so .4 stays under 1 at p99 | 4e-8 |
| Kleinian (Leys, Maskit slice) | `kleinian a b bx bz` | min(y, a − y, .3)/max(dr, 2), its own seed; p99 1.25, max 11–13 at the wrap's seam | 3e-17 |
| Mandalay (DarkBeam, knighty) | `fold.mandalay fo g · fold.sphere · scale · +c` | r/dr, the box family's; heuristic (below) | axis-wise branches |

The figures are a CPU prototype's: 20,000 point pairs a half-estimate apart, 4,000 walk samples.
- `fold.cell` is the box fold with a limit per axis; `wrap` the lattice, l = 0 leaving an axis alone; `fold.sphere` now
  takes rmin 0, the bare k = max(rfix²/|p|², 1). (The literal JIT drops that branch: a constant 1/0 does not compile.)
- `kleinian` is one op because its estimate reads a and its inverse needs the whole step. Parameters a, b are the
  trace's real and imaginary parts on Maskit's slice: the two axes that move the group. The source's 2-cycle bail-out is
  left out: without it dr only grows, so the estimate only falls, and interiors run the full iterations (×40).
  Implemented from the published maths and Mandelbulber 2's `fractal_jos_kleinian.cpp` (the sine separation line).
- *Mandalay's bound.* `fold.mandalay` is checked against Mandelbulber's `transf_mandalay_fold_v1` written out
  axis by axis (unit test). 50.2 % of [−4, 4]³ lies on rank-2 branches, where one axis takes another's value: no
  isometry, stretch up to √3 where dr counts 1. Mandelbulber counts 1 too; nothing overstepped visibly. Those branches
  have images of no volume, so a generic point's preimages are all axis-wise (diagonal 49.8 %, the rest 3 in 200,000:
  edges): the inverse tries the axis-wise forms at random and checks each forward (16 tries), and a point on a sheet is a
  dead end the walk backs out of. Forward's images that lie on sheets are not found: the inverse suite finds ≥ 33 %.
- *Push.* No walk survives from the unit ball into `fold.sphere 0 1` (nothing inside the sphere has a preimage: 0 samples
  in the first test), so a seeded formula's walks start in a ball of radius 3 (`spawnRadius`, CPU and app). Push on
  these reads as star clusters and limit-set webs, sparse beside pull.

**The kaliset** is a shading node, `kali` (cx, cy, cz, f, n, mode mean|min): Kali's map from the hit point, so any species
takes it. `Readings` gained `x`, the world point, in pull, the glow, push's splats and the collage. Selected, its four
values are dimension lines; n and mode are JSON/notation only, and it cannot be driven yet (no `shadeTarget`).

**The Metasurface.** Five sites (16 families; `MAX_SITES` 29 keeps your 13). `eye: { pos, yaw, pitch }` in a preset is a
camera inside it, chosen by a CPU coverage scan (random poses, 35 rays; coverage × depth range); `formulaAt` returns the
weighted eye, `frameFor` blends it with the frame by weight, from the direction the surface opened with. At a site the
camera is exact. Walking between two halls, a blended camera can land on a surface right at a bisector: a black frame or
two in the drag, none at rest. Lamp and fog scale with the estimate at the camera, so a hall needs a camera with a
sound estimate: at d 0.05 the Apollonian was almost black, hence k .4 and a pose at .07.

**Verified** (2026-10-30): unit 103; parity all PASS (10 forward and JIT rows of these families, 5 inverse, 10 dual, 6
override, 2 kaliset, a collage of a seeded piece and a Kleinian piece); touch 39/39, desktop 16/16, paper 45/45 both; bench
guard ∞ dB on every plain and driven scene, plain scenes ×0.99–1.02 against the reference. The touch rig needed reruns
twice: two unnamed checks on the first run after a shader change, and "labels: finger hold" (its thumbnail, 250 ms
timing) once, which passed 4/4 twice and in the next full run. Shots: design/shots/families-*.jpg.

**Not yet:** a collage as a seed; orbit density as a medium; `kali` driven; a per-family look (a preset is only its formula, so
these open in the default key colour); `fold.mandalay` in 4-D; Mandelbulber's Kleinian variants; 3-D Kleinian DE tightening
at the wrap's seam (an overstep there is possible; none seen).

**In the paper (2026-10-30):** the Kleinian, Mandalay and kaliset stubs are filled: 5.6 Seeds (four figures, each family's
Metasurface eye), 5.7 The Mandalay Fold, 6.4 The Kaliset; figures `fm*` in `paper/figures.js` (`cam` writes `&c=`). The limits
are stated there: Mandalay's estimate is a heuristic, Kleinian's jumps at the wrap's seam. The Apollonian figure's eye is
tilted down to 0.2 and keeps the engine's colours: the ring's ramps left it dark. paper.js: when both slots are full, a
waiting figure more than 80 px nearer the middle takes the farther one's place (two pairs fit on one screen in 5.6).

## Subgraphs, 2026-10-30

Deferred since the drivers; iori asked for it. A run of ops, or a part of the shading or driver network, used in
several places, so that an edit to one reaches them all.

**Decided with iori** (every recommended answer):
- *What:* ops, shading and drivers, on one mechanism; ops first.
- *Semantics:* linked. Structure and unexposed numbers are shared, so an edit in any use reaches every use. Exposed
  numbers belong to each use. Detach turns one use back into plain ops and leaves the others linked. No subgraph inside
  a subgraph; a chimera subgraph cannot sit in a species (no mix inside a mix).
- *Gestures:* Shift-click, or a second finger, grows a run; its bracket's plus wraps it. Double-click or double tap opens
  a use in place in a dashed frame; Esc or a two-finger tap closes it. Shift-drag, or a second finger resting, copies a use
  onto an edge; the edge's ring also lists the subgraphs. Hold a use: the ring with detach.
- *Library:* a definition lives in its formula, so a URL or an export reproduces it alone. A local shelf keeps saved
  ones; placing one copies it in, with no live link across formulas.
- *Exposed:* pull a line off itself and drop it on the dashed frame: a dot there, a number of its own. A folded use shows
  them as ordinary dimension lines, draggable and bindable with bands. Pull it back inside: shared again. One number,
  one inner parameter.
- *Notation and breeding:* `a( fold.sphere .5 1 · scale ^2 ) · +c · a( 2.5 )`. A shared number is one gene moving
  every use; an exposed number is bred per use; structure is never bred.

**A link, not an op.** The brief expected instances to be inlined at compile time. This goes one step further: they are
never un-inlined. The slots stay plain ops at all times; a subgraph is a list laid over them:
```
formula.sub = [{ id: 'a', n: 3, uses: ['A1', 'A5', 'B3.0.0'], expose: ['2.s', '0.1.0.w'] }, …]
```
`uses` are the path ids (core/graph.js) of each use's first op, `expose` paths relative to the run. The first use speaks
for the rest: `normalize` copies every other number from it (`syncSub`), `format` writes only its numbers. So:
- core/cpu.js, the GPU interpreter, both JITs, the duals, push, the loop and sensing never hear of it. An instanced formula
  packs byte for byte as its inlined form (`test/subgraph-gpu.test.mjs`, with `structureKey`). Plain formulas are
  untouched by construction: no key, no id change, no shader change.
- Path ids stay what they were, so bindings on ops inside a use need nothing new.
- A use's ops are real, so detach is removing a list entry, and an older reader of a JSON state still draws it.
- *The cost:* the eight slots and 64 ops count every use. Instances save no GPU space, and a chimera subgraph used twice
  takes its species' slots twice.

**Keeping the link through edits** (core/graph.js). `tree` tags each use's nodes in a WeakMap, so a tag survives splices and
not copies. `finish` compares each use's shape with the one it started from: the use that changed is the new run, every
other is rebuilt from it, keeping its own ids (so bindings stay with their use) and its exposed numbers; what was exposed
follows its member. This covers every existing edit (insert, remove, move, fork, addSpecies, setField, unwrap) without
touching them, except that fork and unwrap hand a member's tag on. `setParam` writes a shared number to every use. New:
`wrap`, `place`, `detach`, `removeUse`, `moveUse`, `insertIn` (a run's two ends, which the chain's own edges cannot say),
`expose`, `unexpose`, `exposedOf`, `defOf`, `placeDef`.

**What writes by flat op index** (the grab, the lens, breeding, herding): `reduceMetric` keeps each shared number once, at
the first use, carrying the sum of what its copies move (an upper bound: their partials may cancel, so a step of D pixels
never moves more than D); `masterParam` sends a write there. `withParam` and collages' `withMetric` go through it. The lens
varies one op record in a pass, so its preview of a shared number moves the first use only; the value applied on release is
exact.

**Bindings.** They stay per use: a binding on an op inside a use belongs to that use, and a placed use copies the first
use's. A bound number needs no exposing.

**Shading and drivers** (core/netsub.js). The same link over nodes: `net.sub = [{ id, uses: [[node ids]…], expose }]`, inside
`shade` and `drive`, so it rides `shade=` and `drive=`. A use lists its nodes member by member; its last node is its output.
The first use's parameters and its links between members reach the others; links in from outside belong to each use. Settled
in building: only a first use is edited, so opening any use opens the first; a member removed goes from every use; a node held
onto an open frame's empty ground is a member of every use; a folded use is drawn as its output and shows no input dots, so
its outside links are wired with it open. A placed use starts as a free copy, reading what the first reads, its output
unconnected.

**The drawing.** A folded use is the run's own glyphs, shrunk, between brackets (`useGlyph`), with its letter; the strip draws
the same, so the strip remains the network. Open, the ops are drawn in place inside the dashed frame, the rest of the
graph kept in sight. Names in ui/labels.js.

**The shelf.** `fractal-engine.shelf.v1` in this browser, eight subgraphs at most, the newest first, `__fe.dry` writes nothing.
Hold a use: the ring's second item keeps it. Rings of edges and of the frames' empty ground list what fits. An op subgraph
comes in with its numbers; a shading or driver one loses its links from outside (a required input takes the fold index or the
surface colour; a remap, the iteration).

**Other systems.** Hash, URL and lineage carry the text; `canonical` adds `sub` only when there is one, so wrapping makes a new
id and plain formulas keep theirs. Exports carry it through `canonical`. A collage piece may hold subgraphs (a piece is a
formula), but no link crosses pieces. Metasurface sites keep theirs at their own site and drop them across walls, as drivers
and shading do. `addChain` and `addSpecies` copy a use as plain ops.

**Verified.** `node --test`: 116 pass (test/subgraph.test.mjs: 11, every edit, the notation with chimeras and species, exposed
numbers, bindings, breeding, collages, states, the networks, the shelf; test/subgraph-gpu.test.mjs: pack and `structureKey` equal
the inlined form's). `run-parity.mjs`: all suites pass, four subgraph formulas in forward and JIT. `run-touch.mjs` 45/45 and
`--desktop` 22/22 with no page errors: wrap, the ring, open, expose, an own line, copy, detach, Delete, names, the shading frame
and the driver lane, by mouse and by real touches. `run-paper.mjs` 51/51. `run-bench.mjs`: plain scenes ∞ dB, ×0.98–1.00 against
the reference. Shots: design/shots/touch-sub-*.jpg, touch-desktop-sub-*.jpg.

*Parity's case depth.* The first cases ran ×8 (16 op groups, scales 2–2.4) and failed forward (median 1.22e-2). The same text
written out plain gives the same numbers to the digit: that depth is past float32 for any formula, so the cases run ×4.

**Not yet:** a number tied to two inner parameters; subgraphs inside subgraphs; a link across collage pieces; a ramp's stops as
exposed numbers (only the lines: map, c, f and the drivers' numbers); a shading or driver use's outside links edited while folded;
placing a network use directly on a link (it starts free); removing a shelf entry (the ninth pushes out the oldest); a lens that
moves a shared number in every use during the preview; the rig does not yet exercise the shelf's gestures in the app (its core
is unit-tested); a real-device touch pass.


**In the paper (2026-10-30):** the subgraphs stub is filled: 5.8 Subgraphs, figures `sbField`, `sbGraph` (one run used twice, an
exposed scale; the graph figure folds the shading pane so the network takes the room). The limits are stated there.
