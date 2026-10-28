# Lukáš Kalivoda — portfolio page (`kalivoda/`)

Started 2026-10-25. A one-page site for the Prague glass artist, hosted at
`https://3die.fr/kalivoda/` (registered in `pages.meta.json` as `kalivoda/index.html`,
category `artist`). It is self-contained — `index.html`, `rods.js`, `img/` — so it can
move to his own domain later; only the generated SEO/MENU blocks tie it to 3die.fr.

## What it is
An interactive rendering of his *Lom toku* installation ((A)VOID Gallery, Prague,
Aug–Sep 2023): a cloud of thin bevelled glass rods hanging on threads from a steel
frame, with fans blowing through it. Here the cursor is the fan. The spectrum is
split continuously from red to magenta. His studio portrait hangs behind the glass.

Reference photos of the real piece (Martin Fryč, opening night) are in `img/lom-toku-2023-*.jpg`.

## How it is built (`rods.js`)
- **three.js 0.160** via the same jsdelivr importmap the other 3die pages use.
- **Layers.** Background (portrait, frame, threads, HDR lamps) → `rtBg`. Back three
  rows of rods read `rtBg` and draw into `rtMid` (MSAA). Front three rows read `rtMid`
  and draw on the canvas. So rods refract rods, one level deep. Both targets are
  half-float; the final copy and the front rods apply an ACES tonemap.
- **Glass shader.** Each rod is an `InstancedMesh` of a `RoundedBoxGeometry`
  (22 × 6 mm, 1.5 mm bevel, unit height scaled per rod). Per fragment the face
  normal is bent into a shallow lens across its width (`bulge`), then NS = 20
  spectral samples (`s` from 0 = red to 1 = magenta, hue = 0.86·s) each refract with
  ior = 1.50 + 0.25·(s − ½): a parallel-slab displacement (`thick` × real thickness)
  plus a normal-based deviation (`prism`). Samples are weighted by the hue colour and
  normalised per channel (`uNorm`) so undeflected glass is neutral. A 4×4 Bayer
  dither shifts each pixel's sample positions so the fringes are continuous.
  Highlights from three point lights are sampled spectrally too (`specDisp`).
- **Framing (2026-10-26).** Only glass is in view. The camera is fitted so the
  cloud's width spans the screen edge to edge (screen width on a desktop, screen
  height on a phone), measured at the back row, and the lowest rod top sits just past
  the top (desktop) or left (phone) edge. The steel rack is built but not added to the
  scene; the threads are always off screen.
- **Lamps.** Placed by screen position (`addLamp(nx, ny, z)`, re-placed in `layout()`),
  so they stay in view in both orientations. A low warm "sun" right of centre (the
  afternoon sun through the vault door) and three smaller lamps. They are the bright small sources the
  dispersion is visible on — the portrait alone is too soft to show it.
- **Physics.** Each rod is a rigid pendulum (thread + rod, ω0² = g·d / (L²/12 + d²))
  with swing (tx, tz) and a slow twist about its axis. 120 Hz substeps.
  Wind = ambient fans from the right with coherent turbulence + pointer puffs
  (broad Gaussian blobs, σ ≈ 16 cm, carrying the pointer's velocity capped at 1.4 m/s,
  drifting and decaying; overlapping puffs *average*, never add) + page scroll on a
  phone (`scrollGain`). Swing is capped at 1.2 rad (the thread catches).
  **Touch budget:** iori wants a gust to knock one or two rods together at most.
  The response is steep (rods of different lengths dephase, so past a threshold
  touches cascade), so pairs that touched in the last 3.5 s are tracked and new
  gusts soften to 55 % after one pair and 12 % at `touchBudget` (2). Measured
  2026-10-26: still air 0 pairs; brisk desktop swipe 0–1; five vigorous back-and-forth
  rounds 0; phone scroll flick 0; phone side swipe 0. Defaults: amb 0.16, kw 2.0,
  kd 0.7, puff 0.42, cap 1.4, scroll 0.14. Contacts: capsule–capsule closest points between grid neighbours
  (≤3 columns, ≤2 rows), impulse with restitution 0.32 + positional correction.
- **Sound.** Each contact above a threshold rings a synthesised glass clink (three
  sine partials, length-dependent pitch). Off by default; the `sound` button in the
  top bar turns it on (first user gesture creates the AudioContext).
- **Phone.** Portrait viewport → the camera rolls 90° so the rods lie across the
  screen from the left; the portrait plane counter-rotates and swaps to the portrait
  crop. The canvas has `touch-action: pan-y`, so vertical swipes scroll the page
  normally and the scroll velocity itself blows along the rods; horizontal drags
  make puffs like the mouse.

## Harness
- `?lab` shows sliders. URL overrides include `amb kw kd puff cap scroll touches spread thick prism bulge specdisp sun edge ior`.
  The lab panel has sliders (spread, thick, prism, edge, specDisp, sun, bulge, amb, kw,
  puffGain, portraitDim) and an fps/contacts readout. URL params override the same
  names at load.
- `window.__rods`: `rods`, `puffs`, `stats` (contacts, clinks, `pairs` = distinct touching pairs, `reset()`), `run(ms)` drives frames
  with timers when the Browser pane is hidden (hidden panes get no rAF, so the sim
  stands still), `shot(name, x, y, w, h, scale)` POSTs a full-res crop of the live
  canvas to `/save/<name>` — served by the scratchpad `serve.py` used for previews
  (see "Preview" below), `blow(v)` fakes scroll wind, `bench()` times the physics.
- Physics costs ~0.05 ms/frame for 192 rods and 2448 pairs; the frame is GPU-bound
  (≈9 ms at 2048×1536 in the pane).

## Preview
The desktop app's launcher cannot read `~/Desktop` (macOS privacy), so the
`kalivoda` entry in `.claude/launch.json` serves a mirror of the repo made by
`<scratchpad>/sync.sh` (rsyncs `kalivoda/`, `assets/menu.*`, icons). Re-run the sync
after every edit, then reload. Any static server from the repo root works too:
`python3 tools/serve_root.py 8792` → `http://127.0.0.1:8792/kalivoda/`.

## Content — draft, to confirm with Lukáš
Facts came from Galerie Kuzebauch's artist page, the Material Times interview
(2024) and Martin Fryč's exhibition listing. Registered `hidden: true` until he has
read it; drop the flag in `pages.meta.json` and run `python3 site.py all` to publish.
- Bio: born 1986; Hollarka; UMPRUM glass studio under Kopecký, then Plesl; Cigler's advice.
- Exhibitions list: Soft Cut (Kuzebauch 2025), Mirages in Water (Taiwan 2024 — date
  inferred from the listing id, unverified), Lom toku ((A)VOID 2023), Matter of
  Sensitivity (Portheimka 2020), Painting by Water (MeetFactory 2018), Glass to Face
  ((A)VOID Floating Gallery 2015, co-curated), IGS Nový Bor (year unknown).
- The Lom toku paragraph includes what iori saw (fans, lasers, caustics, fog); the
  sources only confirm wind and afternoon sun.
- Portrait: the studio photograph on his Kuzebauch artist page; photographer not
  credited there — ask him for the credit. Fryč photos are credited on the page.
- No contact details yet (none public). Add email / Instagram when he gives them.

## Next
- Lasers: a few beams through the cloud at night, caustics on a vault behind,
  fog volume — the finale of the real show. The HDR layer structure is ready for it
  (beams = emissive lines in `sceneBg`; the rods will already disperse them).
- Rods refracting more than one layer deep (three groups) if the GPU budget allows.
- A still of the installation for `og:image`.

## Photos and the old Glitch site (2026-10-26)
- Candidate photos (85, eight showing him) are in `tools/kalivoda-photos/` with
  sources and credits in its README. iori has not chosen yet.
- The earlier site iori made for him lived on Glitch and is gone. Uploaded files of
  Glitch projects are often still in the Wayback Machine; `tools/glitch-recover.py
  <project-name>` recovers them. The project's name is still unknown.

## 2026-10-28 rework (iori's notes)
- **Framing:** rod lengths are now computed in `layout()` from the frame: every rod reaches a
  little past the bottom edge (right edge on a phone) at its own depth, so at rest no tip is in
  view and a rattle swings them into view. Knobs `tipmin`/`tipspread` (0.4–5.4 % of the visible
  run). Measured: 0 tips at rest; a brisk swipe shows 30–70 on desktop, 10–30 on a phone.
- **Wind:** brush stronger (`puff` 0.6) and part of every gust blows into the screen (`pushin`
  0.45), which is what lifts the tips into view; `lever` 1.0 stops low swipes near the tips
  from overpowering. Touch budget softens gusts to 30 % after one touching pair, 5 % at two.
  Sweep result: a brisk desktop swipe touches 1–2 pairs; phone 0.
- **Performance:** pixel ratio capped at 1.5, rods drawn nearest-first (early depth reject),
  12 spectral samples (`ns`), rendering pauses when the hero is off screen or the tab hidden,
  still frame under reduced motion, minified three.js, only the portrait the orientation needs.
  Retina desktop 22 → 11–14 ms; phone size 8 → 4–5 ms; load 3.9 → 1.1–1.25 MB.
- **Page:** name only in the hero; header with Exhibitions / About / Contact / Sound that turns
  solid off the hero; exhibitions as `<details>` rows with a photo strip, short text, facts,
  credits and sources; full-screen viewer in `site.js` (arrows, swipe, Esc); three-sentence
  About; contact via Galerie Kuzebauch. Photos are built by `tools/kalivoda-photos/build_ex.sh`.
- **Test rig:** `node tools/kalivoda-audit/behaviour.js` (tips, touches, pause, header, viewer,
  frame cost, captures in `tools/kalivoda-audit/out/`).
- **Per-section artefacts:** proposal in `tools/kalivoda-studies/ARTEFACTS.md`.

### To confirm with Lukáš before publishing
- His own email or Instagram (only the gallery is listed now) and whether Galerie Kuzebauch
  represents him.
- Studio portrait photographer; Sedlec photo source (strednicechy.cz, no credit given).
- Skleňák 2025 has no published title; MATCHES venue wording; the Lom toku fans, lasers and
  fog come from iori's visit, not from a written source.
- International Glass Symposium, Nový Bor: year unknown, left off the page.

## 2026-10-28 live studies — parked, next step for the review rounds
Taken off the page before the first deploy (iori's call). Code, proposal, test and the steps to
put them back are in `tools/kalivoda-studies/` (README.md). Notes below describe them as built.
- `tools/kalivoda-studies/artefacts/` (was `kalivoda/artefacts/`): `gl.js` (WebGL2 helpers), `surface.js` (Chvění hladiny), `shards.js`
  (Jemný řez). Each exports `mount(canvas)` → `{start, stop, resize, setFull, snap, run, stats,
  destroy}`; returns null without WebGL2 + half-float targets, and the tile then hides.
- Wiring in `site.js`: a `.study` button is the first tile of its strip; the module is imported
  the first time the exhibition opens, runs only while the tile is on screen, stops when the
  entry closes. Clicking moves the live canvas into the viewer (`setFull(true)` enables touch);
  closing puts it back. `window.__studies` exposes the APIs for the harness.
- **Surface**: 256² damped wave equation (192² on phones) inside the rim, wall driven by a
  "floor" vibration that the cursor raises; touch drops ripples in the large view. View: two
  lamps reflected, base refracted per channel, wall folds the view into receding rings,
  meniscus dome, caustics from the height Laplacian.
- **Shards**: 30 panes turned 55–89° about vertical, projected from the lamp onto paper each
  frame (Fresnel transmission per pane, edge = dark core + displaced bright line), exposure
  accumulates and fades over ~40 s (photogram), panes glint toward the viewer. Lamp = cursor;
  drifts on its own after 2.5 s idle.
- Cost (M3 Pro): tile 0.1–0.3 ms, large view 0.4 ms (surface) / 1.3 ms (shards) per frame.
- Test: `node tools/kalivoda-studies/studies-test.js` (frames in `out/s-*.jpg`, numbers in `out/studies.json`).

## Next steps (review rounds)
1. Send the deployed link to Lukáš; collect his corrections to the facts, credits and contact.
2. Show him the two parked studies (water surface, shard light) and decide which go on the page.
3. Then the rest of `tools/kalivoda-studies/ARTEFACTS.md` (MATCHES flame front first).
4. Drop `hidden` in `pages.meta.json` when he approves, run `python3 site.py all`, deploy.

## 2026-10-28 mobile fixes (after iori's phone test)
- Hero no longer jumps while scrolling on a phone: the canvas is `100lvh` (large viewport), the
  camera is fitted to the canvas size, and `resize` re-fits only when that size really changes,
  so the browser bar showing and hiding no longer re-fits rods and photo.
- Scroll wind on phones: saturating response (`1 - e^{-1.5|v|}`, v in 900 px/s units) × `scroll`
  0.55, varied across the cloud, half of it into the screen. Measured on a 390×844 phone page:
  slow scroll 0.06 rad / 6 tips, medium 0.10 / 30, flick 0.11 / 40, no touching pairs.
- Contact: Instagram `@kalivoda.lukas` (the handle given in Martin Fryč's Lom toku text; the
  account is empty, confirm with Lukáš), gallery email, Galerie Kuzebauch link; links are
  underlined with an arrow. His own email is not public anywhere; ask him for it.
