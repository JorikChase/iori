# 09 — UI shell: Windows 3.11 Program Manager, gaze rules, native photo overlay

Status: **PLAN, agreed 2026-09-19. Built so far: U0 (`gaze.js`, §5), the fit contract test (§7.1), U2 (`ui31.js` behind `?ui=31`, §7.2), U3 (`overlay.js`, §7.3).** A parallel session works on the renderer; this plan is
written so the UI work cannot move a bench number (§7).

## 1. Diagnosis of the current shell (ui.js "Win98", spec §20.2)

Evidence from the running page (desktop 1024×768 and phone 375×812) and the code:

1. **Input leaks into the eye.** `pointerdown / pointermove / pointerup / wheel` are on `window`
   (index.html ≈ 2823–2836) and guard only `#ui-panel`, which the shell hides — the w98 windows live on
   `body`. Measured: a wheel event on a scrubber changes the value *and* the camera zoom (110 → 121); a pointer
   move over a window moves the gaze target. By the code, pressing any control sets `isPointerDown` → pupil
   constricts to 2.5 mm and accumulation resets. design.js:241 carries the same stale guard.
2. **Window management.** Five windows default to `right:12px` at y 44/360/480/560/640 while Camera is 447 px
   tall → overlapping on first open. No clamp on viewport resize, no tile/cascade/snap, title buttons 16×14 px.
3. **Phone.** Top bar is 569 px wide in a 375 px viewport, clipped, not scrollable (Quality, ID, CAP, Fitted
   unreachable). Open windows cover the iris. The scrubbers themselves work well on touch.
4. **Fit photo canvas.** 640×480, composited per pixel in JS (fit.js `draw()`), covers the iris, shows the
   photo at a quarter of its resolution, render and photo can't be judged in place.
5. **Idiom.** Gradient captions, × button, Tahoma = Windows 98. 3.11 is a different system (§3).

## 2. Decisions (iori, 2026-09-19)

| Fork | Decision |
|---|---|
| 3.11 fidelity | **Full Program Manager**: menu bar, MDI windows, minimise to labelled desktop icons, Tile/Cascade, status bar, own 16-colour icon set + pixel font. The mode-button top bar goes away. |
| Gaze while on UI | **Freeze while a control is held; drift to centre when idle on UI.** |
| Phone / touch | **One bottom sheet (≤ 40 % height) + icon strip** on phones only (short side < 600 px). **Tablets get the desktop MDI in both orientations** (amended 2026-09-19), with touch sizing (40 px rows, 30 px captions). Layout follows the screen, sizing follows the pointer type. |
| Photo overlay camera | **Locked to the fitted pose** while the overlay is on; wheel/pinch zooms photo and render together. |

## 3. Windows 3.11 reference (what U1 must measure and reproduce)

- **Window frame**: 1 px black outline, sizing border in the frame colour with corner notches, flat caption
  (active navy `#000080`, inactive white with black text), title centred in the bold System font;
  **control-menu box** at the left (grey box with a long bar; double-click closes; menu: Restore, Move, Size,
  Minimize, Maximize, Close); **▼ minimise / ▲ maximise** at the right; no ×.
- **Buttons**: 1 px black rounded-corner outline (corner pixels missing), white top-left / dark-grey
  bottom-right bevel 2 px, default button = extra black ring, pressed = bevel inverted + label shifts 1 px,
  focus = dotted rectangle around the label.
- **Menus**: bar inside the window under the caption, bold System font, underlined accelerators, drop-downs
  with 1 px black border and no shadow, selected item navy/white, separators, check marks, `…` for dialogs.
- **Program Manager**: group windows holding 32×32 icons with labels beneath; minimised windows become icons
  along the bottom-left of the desktop, labelled, left to right; Window menu: Cascade, Tile, Arrange Icons,
  numbered window list.
- **Icons**: 32×32 (and 16×16 for toolbox cells), 16-colour VGA palette, 1 px black outline, highlights
  top-left, dithered shading, dark-yellow/grey cast shadow bottom-right.
- **Other**: scroll bars with arrow buttons and a flat thumb; check box = square with ×; hourglass cursor;
  CTL3D grey dialogs (we use the grey 3-D dialog look for tool windows, as 3.11-era apps did).
- **Licence**: Microsoft's icons and fonts are copyrighted. We draw our own icons in the idiom and use an
  openly licensed pixel font (or our own bitmap subset); nothing is copied.

## 4. Information architecture

**Menu bar** (replaces the top bar; every current action keeps its element id):

- **File** — Open ID… (`idin-btn`), Save ID (`idout-btn`), Screenshot (`shot-btn`), Capture 4K, Exit to META IRIS
- **View** — Quality ▸ draft…capture (`quality-sel`), Camera free/fixed (`cam-btn`), Grid, Refraction, Filmic,
  REF, Atlas, Maps, Hippus
- **Eye** — Presets ▸, Fitted ▸ (ranked from cases.json), New seed
- **Fit** — Photo…, reference ▸, ★ Fit HQ, Auto align, Overlay ▸ (photo / render / diff / wipe / onion / blink),
  Bench ▸, Casebook
- **Window** — Cascade, Tile, Arrange Icons, 1 Camera … 6 Design
- **Help** — About Iris Engine (version, credits, ATTRIBUTION)

**Windows** (the six current modes): Camera, Material, Relief, Flow, Fit (a palette: buttons + score + log,
no canvas), Design (Paintbrush layout: two-column toolbox on the left edge, size box under it, colour/material
palette strip along the bottom). Minimised = desktop icon. **Status bar**: quality · fps · atlas · fit
progress · hint text for the control under the pointer.

**Scrubbers stay** (they are the good part on touch) dressed as 3.1 scroll bars: arrow buttons at both ends =
one step, double-click = default, tap the value = type a number.

The site burger stays bottom-left (`menu_pos: bl`, original styling); minimised icons and the phone icon strip
start to its right.

## 5. Gaze and input rules (U0)

One predicate, `inScene(e)`: the event target is the GL canvas **and** no UI element holds pointer capture.

- Look, press-to-constrict and wheel/pinch zoom act only when `inScene`.
- States: `TRACK` (pointer in scene: target = pointer, existing 0.08 smoothing) → pointer leaves →
  `HOLD` (target frozen at the last scene position) → after 1.0 s idle → `RETURN` (finite ease to centre over
  ≈ 3.5 s, smoothstep, then stop — a finite ease so accumulation converges; an exponential tail never ends) →
  `REST`. Re-entering the scene from any state → `TRACK` with a 0.3 s ease-in (no snap).
- **While any control is held (pointer captured by UI): the clock stops** — no drift during a drag; HOLD's
  timer resumes on release.
- Touch: no hover. Tap/drag on the scene = look there (+ constrict while down); release → HOLD → RETURN.
  Touches on UI never reach the eye.
- REF, DESIGN, overlay-locked, fitting and capturing keep their existing frozen-camera behaviour.
- design.js gets the same predicate in place of its `#ui-panel` guard.

Consequence: a few seconds after you start tuning, the iris is frontal, still and fully accumulated.

**U0 without touching index.html (revised 2026-09-19).** The renderer session moves on to S1b (strand tube
texture: strands.js and the strand shader inside index.html), so two sessions would edit one file in one working
tree. U0 can be done entirely from a new `gaze.js` loaded after ui.js:

- *Guards*: the app's listeners sit on `window` in the bubble phase, so a bubble listener on every shell window
  (and the top bar, menus, fit panel) that calls `stopPropagation()` for `pointerdown / pointermove / wheel`
  keeps those events from ever reaching them. Controls keep working (their own listeners run first); `pointerup`
  is let through so nothing stays pressed; menus close through a listener of the shell's own.
- *Gaze*: `__irisEngine.target.mouseX / mouseY` are exposed. The controller leaves them alone while the pointer
  is in the scene (index.html keeps tracking), and drives them itself for HOLD → RETURN (finite ease to the
  canvas centre) → REST; while a control is held it writes nothing. Its state lives in its own object, never in
  `state`.
- One `<script src="gaze.js">` tag is the only edit to index.html, and it can wait: for testing, `?ui=31` style
  loading from ui.js (`document.createElement('script')`) needs no edit at all.

**U0 built 2026-09-19** as described: `gaze.js` (loaded by ui.js), plus design.js's stale `#ui-panel` guard
replaced by an `onUI` test on the shell's selectors (its listeners are capture-phase on `window`, which a
document-level guard cannot reach). Scripted check on the running app: pointer move over a window leaves the
gaze target alone and enters HOLD; wheel on a scrubber changes the value and not the zoom (wheel on the iris
still zooms); a control held for 3 s keeps the clock at 0; after release RETURN starts at 1 s and REST is
reached at the canvas centre by 4.5 s; a press on the iris constricts the pupil and releasing it over a window
still releases; in DESIGN a press on a window paints nothing, a press on the iris paints. The eye now starts
centred instead of looking into the top-left corner until the first pointer event. Timers run on wall-clock
time (a throttled tab renders ≈ 1 frame/s). Contract test with gaze.js loaded: `compare()` = `[]`.

When index.html is quiet again the guards can move into the listeners themselves (the cleaner form); behaviour
stays the same, and the contract test covers both.

## 6. Native photo overlay (U3)

- The photo is uploaded once as a GL texture at native resolution.
- A **separate program `fs-overlay`** draws to the default framebuffer after the post pass. No change to
  fs-bake, fs-photo or the post shader (the fs-bake float-shift gotcha cannot occur); the off-screen REF render
  that scoring reads back (`fit.render`) is untouched.
- Overlay on ⇒ camera locked to the solved pose (as `state.ref`), main view letterboxed to the photo's aspect:
  `solvePose` makes the render frame the photo frame, so registration is exact without warping.
- Modes: PHOTO · RENDER · DIFF (GPU, full resolution) · WIPE (draggable divider, replaces SPLIT) · ONION
  (opacity scrubber) · BLINK (A/B flicker at ≈ 2 Hz, the best alignment check).
- Wheel/pinch zooms and pans photo + render together through the view crop (`u_view`), up to 1:1 photo pixels.
- Markers (pupil cyan, limbus orange, catchlight yellow) become handles on the main canvas: DOM/SVG layer,
  44 px hit areas, pinch on a ring resizes it (wheel on desktop), same `fit.pupil / limbus / catch` state.
- POLAR and HEIGHT A/B stay in a small resizable window in U3; GL strips in U4.
- Designer D3 (photo overlay + clone source) reuses this overlay.

## 7. Isolation from the renderer work

- Files: `ui.css` (all shell CSS moves out of index.html), `ui.js` (shell, window manager, layouts),
  `overlay.js` (texture, program, modes, handles), `icons/` (sprite sheet + sources).
- index.html receives three hooks only — scene-only input (§5), one `overlay.draw()` call after post, the
  link/script tags — added after the renderer session has committed its index.html.
- Every element id stays (fit.js and design.js bind by id). Layout key `irisW31` (old `irisW98` ignored).
- **No benches and no `/save` from the UI session**: both dev servers write the same `ref/`. Renderer
  invariance is checked with a pixel hash of one deterministic REF frame before/after each phase; a BENCH ISO
  NORMAL (66.20 on v83) is run once at the end, coordinated with the renderer session.

### 7.1 Merge strategy and the fit contract test (added 2026-09-19)

The mock is a separate static page; "merging" means building U0–U3 into the app. It goes in **behind a switch**:
the new shell is `ui31.js` + `ui.css` beside the untouched `ui.js`, chosen by `?ui=31` (then a stored
preference). Benches and automation keep loading the old shell until the contract test passes on the new one;
only then does the default flip, and `ui.js` stays in the repo one more version as the fallback.

**`tools/ui-contract/contract.js`** records what the fitter and our automation need from the page, without
saving anything (`runBench` with `save:false`, no POST): (1) every element id fit.js / design.js / index.html
look up, (2) the `__irisEngine` and `.fit` API surface, (3) a photo fit driven through the panel like a user
(FIT PHOTO → reference select → AUTO ALIGN → SOLVE POSE → score, view-button cycle), (4) a photo fit driven
through the API like a bench (ref 26, NORMAL, 20 iterations): the full bench row, genome fingerprint, hash of
the scored render, hash of the exported ID. `__uiContract.compare()` diffs a run against
`tools/ui-contract/baseline.json` and must return `[]`.

Baseline (git 9f6320e, Win98 shell): MATCH2 68.0, MATCH 67.5, SSIM 0.713, height r 0.806; identical in four
runs — two fresh loads, a repeat inside one page, viewports 692×1044 and 1280×720 (canvas 1038×1566 vs
1920×1080). ≈ 50 s per run. So: **the fit does not depend on the window or canvas size**, which is what lets the
shell change the layout freely.

What the test found, and what it means for the new shell:

- `fit.js` snapshots `state` / `target` when it loads (`STATE0`, `TARGET0`) and `resetForFreshFit` restores them
  and drops unknown keys. **The shell must not write to `state` before fit.js has loaded, and gaze / layout /
  overlay state must live outside `state`** (the phone re-centring must not persist in `state.view`).
- The current shell already loses one control: `fit-diag` (DIAG) is dropped by `dressFit`'s regrouping — the
  id is looked up by fit.js and is gone from the page. `casebook`, `cb-*`, `brush-cursor` are created lazily
  (expected misses). The new shell keeps every id, DIAG included.
- After a fit, `state ≠ target` for `ringR` (0.3448 vs 0.38), `pupilOff`, `srcType`, `sat`, `view`, `useRot`: once
  interactive frames run, the smoothing loop pulls `ringR` back to 0.38, so **an ID exported later differs from
  the ID that was scored**. Renderer-side issue, reported to that session, not fixed here. (One early run of the
  test showed a different state hash and ID with an identical render and genome; this drift is the likely cause.)
- The 2-D `fitcv` canvas is part of the contract (fit.js draws into it and reads pointer positions from it). U3
  keeps the element (hidden, still drawn on demand) while the overlay takes over the display.

### 7.2 U2 built (2026-09-19): the 3.11 shell in the app, behind the switch

`ui31.js` + `ui.css`. `?ui=31` selects it and is remembered (`localStorage.irisShell`), `?ui=98` goes back; the
default is still the Win98 shell. ui.js `document.write`s the stylesheet and the script, so the new shell runs
exactly where the old one did — after fit.js, before design.js (which needs the DESIGN pane to exist). Like the
old shell it moves the page's controls and never rebuilds them.

- Application caption + menu bar (File / View / Eye / Fit / Window / Help; status at the right), eight windows —
  Camera, Material, Relief, Flow, Fit, Design (Paintbrush layout), **Fit · Photo** (the fit panel with its 2-D
  canvas, until the native overlay of U3 replaces the display; DIAG is back) and **Control Panel** (font, touch
  sizing, magnetic snap mode and speed, gaze hold / return times, back to the Win98 shell).
- Window manager as in the mock: shortcuts always present, cascade spawn, 8 px magnetic snap with the eased pull,
  Tile / Cascade, bounds between the menu bar and the shortcut row, layout remembered (`localStorage.irisW31`).
- Phone: one bottom sheet + icon strip; the eye is re-centred above the sheet by translating the canvas element
  (page and render surround are both white, so there is no seam) — `state.view` is never touched.
- **The site burger is part of the frame** (iori, 2026-09-19): the application's control-menu box, top-left,
  shows the site favicon (the three 3die triangles) as a 16-colour bitmap rendered at the box's exact pixel
  size; it opens the site's links as a 3.11 menu, read from the generated `#site-menu` markup (so `site.py menu`
  stays the single source). The floating burger is hidden in this shell and the shortcut row starts at the left
  edge. On a phone the same menu also carries File … Help.
- Fonts load from Google Fonts on first use (Urbanist by default). Self-hosting woff2 subsets is still to do
  and needs iori's go-ahead to download the files.
- Contract test on the new shell: `compare()` returns one difference, `fit-diag` no longer missing — the fit
  through the panel, the bench row, the render hash, the fingerprint and the ID are identical to the baseline.

Open before the default flips: keyboard (Alt menus, F6), the hourglass during fits, casebook window in 3.11
chrome, U3 overlay.

### 7.3 U3 built (2026-09-19): the fit photo lies on the iris

`overlay.js`, loaded by ui31.js. It turned out simpler and safer than the `fs-overlay` GL program planned in §6:
the live engine canvas *is* the render, and the photograph is a DOM layer (the native-resolution `fit.img`)
positioned exactly over it; the blends are CSS — opacity (ONION), `clip-path` with a draggable divider (WIPE),
`mix-blend-mode: difference` (DIFF), a 2 Hz toggle (BLINK). No shader, no GL state and no part of the scored
off-screen render is involved, so there is nothing to collide with the renderer work.

- **Registration is exact by construction**: for the same pose the engine's image space is
  `sensor = (view.xy + frag/res − 0.5)·(aspect, 1)·24 mm`, so the photo frame spans the canvas height and
  `width = height · photoAspect`; with a view `[x, y, s, s]` the rectangle follows in closed form. Checked on
  ref 26: the limbus and pupil markers sit on the photo's and the render's boundaries on both sides of the wipe.
- **Camera locked to the fitted pose**: switching the overlay on solves the pose if the camera is free
  (`state.useRot`); gaze.js already leaves a fixed camera alone.
- **Zoom and pan go through the engine's view crop** (`state.view = [x, y, s, s]`, as DESIGN and the tiled capture
  do): wheel, pinch, drag, double-click = home. The render is re-rendered at true resolution at any zoom — up to
  three screen pixels per photo pixel — and zooming *out* works, which a portrait window needs (the pose fills
  the height and would cut the sides off; "home" shows the whole photo frame). The engine's own wheel (camera
  distance) and press (pupil) handlers are stopped while the overlay is on: they would break the locked pose.
- **The fitter never sees the zoom**: the pose's own view `[x, y, 1, 1]` is restored in the capture phase of any
  click on a fit control (verified: the SOLVE POSE handler saw `[…, 1, 1]` while the scene was zoomed 15×), when
  the overlay goes off, and the view is never written while a fit, a capture or DESIGN runs.
- **Markers are handles on the scene**: pupil (cyan: centre, radius), limbus (orange: centre, major axis with
  rotation, minor axis), catchlight (yellow); 44 px hit areas; they edit `fit.pupil / limbus / catch` and
  redraw the panel's canvas, exactly what dragging on the 2-D canvas did.
- Controls: Fit window ▸ *Overlay on the iris* (Off · Photo · Render · Diff · Wipe · Onion · Blink, ONION amount,
  Markers, Reset zoom) and Fit ▸ Overlay in the menu bar. While the overlay shows photo / render / diff the
  panel's own 2-D canvas is hidden (it is still drawn — fit.js needs it); POLAR and HEIGHT bring it back.
- Contract test with overlay.js loaded: unchanged (`fit-diag` is the only difference, as in §7.2).

Limits, stated: the live render shows the catchlight and the soft limbus edge that the scored render of an
isolated photo omits (`specular 0`, `edgeFade 0` are fit-render options the page cannot set from outside), so
DIFF is a visual aid, not the score; DESIGN switches the overlay off (its own photo layer is D3).

### 7.4 Acceptance run (2026-09-19, git c329611)

**Fits, old shell vs new shell** (`__uiContract.bench` per shell, then `benchCompare`; nothing saved):

| quality | photos | iterations | differences | MATCH2 |
|---|---|---|---|---|
| NORMAL | 09, 25, 26, 35 | 120 | **0** — every row metric, genome fingerprint, render hash and ID | 60.4 / 68.1 / 69.5 / 66.8, mean 66.2 = the published v83 |
| CAPTURE | 26 | 120 | **0** | 68.2 |

The 3.11 run had gaze.js and overlay.js loaded. ≈ 145 s per NORMAL run, ≈ 237 s per CAPTURE photo.

**Overlay registration** (`__uiContract.registration`): the iris outline is circle-fitted on the scored
off-screen render and on the live canvas mapped back through the overlay's rectangle. On the engine's flat
alignment mask (debug view 13, no shading) the two agree to **≤ 0.08 fit px, ≤ 0.17 CSS px** in all 40 cases:
four photos × {home, zoomed out + panned, s = 1, zoomed in} in a portrait window (692 × 1044) and a landscape one
(1280 × 800), and two photos on a phone (375 × 812) with a sheet open, where canvas and layer carry the same
`translateY(−283px)`. On the shaded live render the outline sits a constant 0.3 fit px higher at every zoom —
the lid shadow and the faded limbus edge, which the scored render of an isolated photo does not have; it is
not a mapping error (a mapping error would scale with the zoom and would show on the mask).

### 7.5 The photo is on the workspace by default (2026-09-19, after iori's review)

U3 had left the fit panel as its own *Fit · Photo* window with the 2-D canvas, and the overlay as something to
switch on — a conservative choice that missed the brief ("the photo should be overlaid on the iris natively, so
we don't render the images elsewhere"). Now:

- **One Fit window**, a palette: *Overlay on the iris*, score, FIT / SOURCE / ALIGN / TEST, the log, and the
  fitted ↔ procedural blends. The Photo window and its shortcut are gone. "Close photo" (`fit-close`) ends the
  session; minimising the window does not.
- **A photo the user loads appears on the iris by itself** (wipe), the camera locks to its pose, and the panel's
  PHOTO | RENDER | DIFF | SPLIT button drives the layer (SPLIT = wipe). Photos loaded by a fit or a bench do
  not trigger it (`state.fitting`, `fit.benchRunning`).
- The panel's own canvas is drawn as before (fit.js needs it) but shown only for **POLAR and HEIGHT**, which are
  strip views and not pictures of the eye; it then sits inside the Fit window while the photo stays on the iris.
- **Moved markers re-solve the pose at once**, so the render follows the handles.
- **The zoom guard covers the API too**: every function of `__irisEngine.fit`, plus `exportID` and
  `captureTiled`, puts the pose's view back before it runs (the click guard covers the buttons). Proof: the
  four-photo bench at 120 iterations, started from the console **with the overlay on and zoomed**, is identical
  to the old shell's — 0 differences.

- **During a fit the workspace shows the fitter's render** (found by iori on a FIT HQ run: the render half of
  the wipe was blank). The engine pauses its interactive loop while `state.fitting`, and FIT HQ's switch to
  CAPTURE re-allocates and clears the canvas, so nothing was drawn under the photo for the whole fit — the old
  panel had shown progress in its 2-D canvas. Now `fit.render`, the scored off-screen render itself (in the
  photo's frame by construction), is painted into a layer under the photo while a fit runs, so wipe / onion /
  diff / blink show the fit converging; DIFF is then the true scored difference. Zoom and pan stay available
  during a fit (both layers are DOM then; the view is only written once the engine is idle again).

## 8. Layout managers

- **Desktop (fine pointer or width ≥ 900 px)**: MDI. Windows clamp into the viewport on resize, snap to edges
  and to each other (8 px), Cascade / Tile / Arrange Icons, first-run layout is tiled down the right edge with
  only Camera open, positions remembered.
- **Phone (coarse pointer and width < 900 px)**: one window at a time as a bottom sheet ≤ 40 % of the height
  (a "maximised" window: caption + control box, body scrolls), icon strip above the sheet switches windows and
  collapses the sheet; menu bar collapses to a single control-menu button that opens the menus as a list;
  rows 40 px, caption 32 px; the eye is re-centred in the free area through the view crop.
- Chrome is drawn on an integer pixel unit (`--px`: 1 desktop, 2 coarse pointer) with
  `image-rendering: pixelated` for the icon sprites.

## 9. Phases

| Phase | Content | Touches |
|---|---|---|
| **U0** | `inScene` predicate, gaze state machine, wheel/press guards, design.js guard | index.html input block, design.js (small) |
| **U1** | 3.11 study: metrics sheet from reference screenshots, icon set 32 + 16 px (modes, tools, actions, app), font choice, **static mock page** `study/ui-31-mock.html` (desktop + phone) for approval | new files only |
| **U2** | Window manager, menu bar, desktop icons, status bar, both layout managers, scrubber dressing, `ui.css` | ui.js, ui.css, index.html tags |
| **U3** | `overlay.js`: native overlay, modes, locked camera, zoom/pan, marker handles; Fit window → palette | overlay.js, fit.js display code only (`draw()` and canvas handlers), one hook |
| **U4** | Design as Paintbrush (toolbox, palette strip), POLAR/HEIGHT as GL strips | ui.js, design.js, overlay.js |
| **U5** | Keyboard (Alt-menus, F6 next window, arrows on scrubbers), hourglass, About box, persistence, accessibility labels | ui.js |

Acceptance per phase: REF-frame pixel hash unchanged; no control moves the eye (scripted event test over every
window); phone 375×812 and desktop 1024×768 screenshots; all existing element ids resolve.

## 10. Mock

`study/ui-31-mock.html` (static, no engine, `noindex`; `?phone` / `?touch` force the layouts). It shows the application
caption + menu bar, the six tool windows with 3.11 frames, minimise-to-icon, Tile / Cascade, edge and window
snapping, scrubbers dressed as scroll bars (end arrows, double-click = default, tap the value to type), Design
as a Paintbrush tool box, the phone sheet, the gaze state machine (state shown in the status text) and the
overlay modes with marker handles on a drawn stand-in iris. Choices made in the mock, **agreed by iori 2026-09-19**:

- "Close" = "Minimise": a tool window is always either open or an icon on the desktop, never gone. One tap on
  an icon restores it (3.1 needs a double-click; a single tap is better on touch).
- Tool windows carry a control box and ▼ only (no ▲: nothing to maximise into).
- Status lives at the right end of the menu bar, not in a bottom bar (the bottom-left belongs to the burger
  and the icons; phones have no room for a second bar).
- The desktop stays white (§2 of the project memory: only the iris is visible).

Amendments from iori's review of the mock (2026-09-19):

- **The shortcuts never disappear.** All six icons stay in the bottom-left row whether their window is open or
  not; an open window's label is highlighted. Click: closed → open · open but behind → front · front → minimise.
  Windows are bounded between the menu bar and the icon row, so they can never cover the shortcuts.
- **Spawn cascade.** A window that would open on top of another steps one cascade unit left and down
  (unit = caption + frame = `--n`, 23 px desktop / 35 px touch, so the caption below stays fully readable),
  wrapping inside the bounds rather than leaving the viewport.
- **Magnetic snap, eased.** The snap rule is unchanged (to edges and neighbours); **range 8 px** (iori compared 8 / 12 / 16 / 24 in the mock and kept 8). Three behaviours are in
  the mock under Window ▸ Magnetic snap for comparison: *Hard* (jump), *Eased pull* (default: the drag stays
  1:1 and only the magnet's offset eases in and out, exponential, k = 22 s⁻¹), *Eased window* (the whole window
  eases to the snapped position and trails the pointer). Speeds 10 / 22 / 40 s⁻¹. Tile, Cascade and the drop
  glide with the same exponential (k = 16 s⁻¹).

### Font options

| Option | What it is | Licence | Fit to 3.11 | Cost |
|---|---|---|---|---|
| A. System stack, smoothing off (the mock) | bold Arial/Helvetica, `-webkit-font-smoothing: none` | none needed | right proportions, but only macOS renders it aliased — antialiased on Windows, Android, iOS | 0 KB |
| B. W95FA (FontsArena / Alina Sava, 2019) | outline re-creation of MS Sans Serif 8 pt bitmap, pixel squares | SIL OFL | the dialog font of 3.1/95; **regular only** — no bold for captions and menus; its shapes trace Microsoft's bitmap | ≈ 20 KB woff2 |
| C. Generic open pixel fonts (Pixelify Sans, Silkscreen, Tiny5, Jersey, VT323 …) | Google Fonts pixel faces | OFL | reads "retro game / terminal", not Windows | 10–30 KB |
| D. Oldschool PC Font Pack (Px437 …) | DOS / BIOS text-mode fonts | CC BY-SA 4.0 | the DOS box, not the GUI; monospaced | — |
| **E. Our own two-master bitmap face (recommended)** | drawn by us on a pixel grid and compiled to woff2 with fontTools: a bold 16 px-cell face in the role of *System* (captions, menus, buttons, touch sizing) and an 11 px-em face in the role of *MS Sans Serif 8* (labels, values, log) | ours | exact metrics and the two roles 3.1 really had; crisp on every platform when used at native size × integer | ≈ 1 day; ASCII + `· ★ ° µ × … ▸ ✓ ±` ≈ 110 glyphs per master, < 15 KB |

**Default font: Urbanist** (iori, 2026-09-19). **The font is a user setting** — every candidate goes into the settings and iori
picks the default. In the mock: View ▸ Font, three groups, stored per browser: *3.11 idiom* (system stack
aliased, Pixelify Sans, VT323), *Geometric, circular* (Jost, Poppins, Outfit, Questrial, Urbanist, Quicksand,
Comfortaa, Varela Round, Nunito), *DIN and Roboto* (Barlow, Barlow Semi Condensed, installed DIN Alternate /
Bahnschrift, Roboto, Roboto Condensed, Roboto Flex, Roboto Mono, Roboto Slab). Each entry carries its own
"bold" weight, smoothing and size so the chrome keeps its proportions. All web fonts are OFL / Apache; the mock
links Google Fonts on first use, the app will self-host woff2 subsets loaded only when chosen. In the app the
setting lives in a **Control Panel** window (font, touch sizing, magnetic snap, gaze return time). Option E (our
own bitmap face) stays possible as one more entry.

Bitmap faces are only crisp at their native pixel size times an integer, which is why E has two masters: the
desktop uses the small master for controls and the big one for captions/menus; touch sizing uses the big master
everywhere. A is the fallback in the stack either way.

## 11. Open points for the next discussion

- Font: option A–E above (E recommended; B as a quick interim for the small face).
- Whether Presets/Fitted also get a Program-Manager **group window** of eye icons (thumbnails rendered from
  the IDs) beside the menu entries.
- Desktop colour/pattern: the page must stay white around the iris (sclera blends into the page), so the
  "desktop" is white — 3.1 wallpaper patterns are out.
- With many windows open on a small desktop the iris is covered: re-centre the eye in the largest free
  rectangle (as the phone sheet does), or leave it to the user's Tile.
