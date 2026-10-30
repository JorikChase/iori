# App icons + loading animation designer — plan for discussion

2026-10-30. Research done, nothing built. Icon claims were not tested on a device; "inferred" marks
what no source confirms. Start with the Decisions block, then the Open questions in each project.

## Decisions (iori, 2026-10-30)

- The logos should all be connected somehow, but they do not have to be the same.
- If the new logos beat the 3die logo, they replace the 3die icon in the apps.
- No iori.me / 3die.fr manifest split until the logos are done.
- The animation designer gets as much control as possible.
- The preset library must contain at least every Claude loading animation (CLI, desktop app dots,
  claude.ai). iori sent four frames of the desktop app's orange dots as reference.
- Loaders are for future design and development work, not for opening the apps. The apps should not
  need long load times, so no loader goes into them as part of this project.

## Project A: per-app icons

### Today

| Install from | Manifest | Icon | Result |
|---|---|---|---|
| 3die.fr | root `manifest.json`, `id: /` | painted 3die | "3DIE / IORI" |
| iori.me | same file on both hosts | painted 3die | a separate app, same name, wrong brand |
| /audio/ | own, scope `/audio/` | painted 3die | installs as itself, with the wrong icon |
| /moshine/, /fractal-engine/, /iris-engine/ | root | painted 3die | Chrome most likely installs the whole site and opens `/` (inferred) |
| dash | own | own copy of the 3die icon | fine, unchanged by this project |

The head block comes from `build_seo_block` in `site.py`; `"manifest"` in the registry already
works per page. There is no per-app art; `moshine/HANDOFF.md` still lists `moshine/icon.svg` as awaited.

### What decides the icon

- iOS/iPadOS Safari, and most likely the Mac's Add to Dock: `apple-touch-icon` on the page
  (per page, it beats the manifest). 180 px opaque PNG. Frozen after install until re-added.
- Chrome/Edge/Android/Windows: the manifest, keyed by `id`. Needs 192 + 512, maskable on Android
  (content within a 40% radius). From Chrome 144, icon changes go through a review dialog; under 10%
  pixel change auto-applies. Android refreshes its WebAPK while closed, charging, on Wi-Fi.
- Firefox on iOS ignores declared icons (open bug). Firefox desktop has no manifest install.
- Several PWAs on one origin work through `scope`/`id`. web.dev discourages it. Permissions and
  storage are shared across the origin.
- No dark/tinted variants for web icons on any platform: no icon `media`, and `monochrome` only
  covers shortcuts and badges. Any such look is baked into the PNG.
- One iOS 26 report claims a glass band on web-clip icons, against our earlier finding of no glass.
  Needs a device test.
- Dynamic icons are unreliable: JS-swapped touch icons have mixed reports, late blob manifests are
  unconfirmed. A per-fractal shortcut needs a static stub page with its own `id`, manifest and icon.

### Two jobs per brand (existing rule)

Each brand needs two drawings: the **app icon** (rich, works 120–1024 px) and the **mark** (survives
16 px, used for the tab). Art must be square; app icons go opaque, full bleed, composed to the squircle.

### Tasks

**A0. Pipeline, with placeholder art**
- `forge.py`: `APPS` table and `build-apps`, reusing `compose()`/`save()`. Writes
  `<app>/icon/ios/{180,167,152,120}.png`, `android/{any,maskable}-{192,512}.png`,
  `favicon/{16,32,48}.png`. Source sheets in `tools/icon-forge/sheets/` (not deployed).
- `site.py`: registry field `"icons"`, replacing the hardcoded `{up}icon/...` links. Set `manifest`
  + `icons` on every page of each app, incl. `moshine/lab.html`, `fractal-engine/paper.html`.
- `site.py` stamps `?v=` into manifests and `audio/build.py` (hand-copied today).
- `server_setup.sh`: `*/icon/*` joins `@icons` in both vhosts, or those files get no cache rule.

**A1. Manifests: only after the art in A4 is done**
- `fractal-engine/`, `iris-engine/`, `moshine/manifest.json`: `id`/`start_url`/`scope` = the folder,
  `orientation: any`, dark background.
- Root, last of all: one manifest per host via a Caddy rewrite, as `robots.txt` does (`server_setup.sh:284`). Keep
  `id: /` so existing installs update in place. iori.me stops being called "3DIE / IORI".

**A2. Audio**
- Update `ICONS` in `audio/build.py`, rebuild after `site.py all`. `addAll` fails the whole service
  worker install on one 404. Cache-first SW: the new manifest arrives about one launch late.

**A3. MOSHINE: client-facing, do it last and carefully**
- Add `manifest.json` to data_moshine as well, or a later rsync may delete it.
- Uninstalling any iori.me app can prompt a whole-origin wipe, which reaches MOSHINE's OPFS projects.
- Safari installs likely start with empty storage (old evidence). Clients move projects by `.mosh`.
- Burger-menu links leave the `/moshine/` scope. Decide what the installed app does with them.
- Existing installs are the root app and stay. Nothing migrates automatically.

**A4. Art**
- Direction, then 3die app/mark review, then the engines. iori draws the iori logo by hand.
- Each sheet checked with `forge.py board` at 16, 32, 60, 180 under the squircle and the 80% circle.

**A5. Verify and deploy**
- Device matrix: iPhone, iPad, Mac Safari, Chrome desktop, Android. Bump `ICON_VERSION`.

**Later**
- `shortcuts` per app (Android, desktop Chrome; not iOS).
- `file_handlers` for `.mosh` (Chrome/Edge desktop).
- Stub pages for per-preset shortcuts, e.g. one saved fractal with its own render as icon.

### Icon directions

1. **Shards of the mark**: every app is one more triangle from the 3die composition. One family.
2. **Made by the engine**: Fractal Engine, Iris Engine, MOSHINE and Audio each draw their own icon. A
   render pipeline, no drawing. Each app icon is a real output; marks are still drawn by hand.
3. **Hairline**: a single mathematical drawing per app on black. Same object at 16 and 1024.

Recommended: 2 for app icons, 3 for tab marks. They fit the existing rich-icon/simple-mark split, and
the iris and fractal are the strongest images already in the repo. Whatever is chosen, the family needs
one shared thread, since the logos may differ.

### Per-app art (iori, 2026-10-30)

Studies live in `tools/icon-forge/studies/`: `orb.cjs` renders the real Audio shader, `study.py` builds
the boards into `out/`. Nothing is wired into the site. Run `study.py orb|fractal|fractal2|iris`.

- **Audio: the main orb** (superseded by the blobs in round three). iori liked `rest-t31` and wanted more colours. `orb.cjs` adds six shells in the
  tool colours, icon render only, and pulls the orange and cream back so they all show. Candidates on
  `out/orb-colours-board.png`: `more6-o68-t31` keeps the original shape, `more6-o80-t36` is the most colourful.
- **MOSHINE: iori supplies moshed screenshots**, which get cropped and placed. Waiting on those.
- **Fractal Engine: most concise fractal.** Sierpinski 2, Menger 1/2 and Mandelbrot hold at 16 px. Sierpinski 1
  is the Triforce, so avoid it. The Julia dendrite has no interior and draws nothing. An IFS built from the
  3die mark's own triangles collapsed to dust across all 216 vertex orders. Dropped.
- **Iris Engine: renders composed as a pie.** iori likes the four fitted eyes (09 25 26 35), with and
  without instrument hairlines. Aligned per angle on pupil and limbus. The fitted eyes read best; the presets share one structure, so wedges blur together. "One eye, passes" gives a hard
  red wedge from the material pass. Instrument ticks vanish at home-screen sizes, so they would be for the
  large icon only. Full bleed loses the pupil at small sizes.

**Round two** (`study2.py orb|eye|petri|fill|centre|mark`, `orb.cjs mark`)

- **Audio, three colours cut like the mark:** the orb's flow melts the mark's triangles, using the real shell
  background. Best: `mark-tealredyellow`, the closest to the 3die mark, at flow .4. At .7 and up the shape
  stops reading as the mark.
- **Iris:** mark area gives 288°/34°/38°. `E` uses that with the material pass as the red wedge. `B` and
  `C` are the plain variations, `F` cuts the mark's straight triangles into eye 35. `G` on black fails.
- **Petri:** read as "use the Apollonian tile for Petri", to be confirmed. `amber + nuclei` reads most as cells.
  Added to the install list. The prototype crop is the only real Petri output in the repo.
- **Fractals that fill:** `Julia, full`, `Newton 3, audio`, `Kaliset`, `Gasket, inside`. Hilbert 5 and Pascal go
  to grey or half-empty at small sizes.
- **Fractals centred:** `Apollonian 3 colours`, `Pentaflake 3`, `Tricorn`, `Rabbit 3-cycle`.
- **3die as a fractal:** solid recursion works where the attractor failed. `mark of marks 3` and
  `Sierpinski mark 2/3` are the keepers. `painted droste` is lovely large but muddy below 60 px.

**Round three: iori's picks** (`study3.py blob|short|family`, `orb.cjs blob`; side by side on `out/family-board.png`)

- **Iris Engine: `B`** (eye 26 leads, turned; `out/iris/r2-B.png`).
- **Petri default: the real crop** (`out/petri/petri-pick.png`), with Apollonian 3 colours and white depth 2 as options.
  It is a 512 px prototype output, enough for every required size but not an engine capture.
- **Audio: real blobs.** The drawn blobs (`audio-pick.png`) were too small; iori wants the real blobs covering most of
  the orb, with the 3die logo only a hint. `orb-search.cjs` keeps the real shells and searches each shell's time and
  threshold plus the orb's rotation against the mark's layout. `real-1` and `real-5` are kept, parameters in `orb-picks.json`
  (a new search overwrites `out/orb/real-*`, so the picks are saved apart). Search takes under 3 minutes, in software.
- **Audio optional icons:** one colour (top shell only) and two colours (top and cream shells) from both shapes, in
  the eight tool colours plus cream. `orb-search.cjs variants`, `study3.py variants`; `out/orb/variants/`, boards
  `out/orb-variants-real-*.png`. These go in the icon chooser.
- **Audio default: `real-1`** (`out/orb/audio-pick.png`), with `real-5` as an option. Art settled; icon sizes not built.
- **Fractal Engine default: seahorse in orange and teal** (`out/fractal/fractal-pick.png`). Tab mark not chosen.
- **Fractal Engine other variants:** Hilbert 5, carpet 4, multibrot 4, hexaflake. Hilbert 5 goes grey at
  16 px, so it needs Hilbert 3 as its tab mark.
- **Rejected:** every 3die-as-fractal study. Do not pursue.

### Icon gallery (built 2026-10-30, not deployed)

- Add or change an icon: put the source in `tools/icon-forge/sheets/`, list it in `tools/icon-forge/apps.json` (first
  variant = the default), run `forge.py apps` under `uv run --with pillow,numpy --no-project`, then `python3 site.py all`,
  then `python3 audio/build.py`. `fit` is `bleed` or `object`; `object` is shrunk for Android's maskable circle.
- `site.py icons` writes `<app>/icon/<slug>/index.html` + `manifest.json` and hidden registry entries. Each page is also
  the gallery. Sets `icon_gallery`, `touch_icon` and `manifest` on the app's page; the default keeps the app's `id`.
- Shared `install/install.js` + `.css` pick the steps; Chrome, Edge and Android get an Install button when
  `beforeinstallprompt` fires.
- The menu entry is "install app". Petri's and Iris's control boxes read it from the generated links, Fractal
  Engine's mark opens the menu on a second press, and Audio's burger shows on the home orb, not inside a tool.
- Rig: `tools/icon-forge/test/install-check.cjs`; `HEADED=1` runs Iris and Petri in a real window.
- MOSHINE: default `smear` (mosh-3-3), options `magenta`, `pink`, `block`, cropped by `study-mosh.py` from iori's
  screenshots in `studies/mosh-src/`. `moshine/icon/` exists only in this repo; `moshine/HANDOFF.md` warns about rsync.

### Icon chooser design

iori's call: choosing an icon and the how-to-install steps live behind a menu entry in each app. Ready when wanted,
invisible in normal use: no banner, no prompt, no first-visit offer.

- **One shared panel** (`js/install.js`, styled per app): the app's icons as a grid, then the steps for the
  visitor's browser, detected from the user agent. It opens only from the menu entry.
- **Entries:** the generated site burger (`site.py menu`) already sits in all five apps, so one entry there, shown
  only on pages with icon variants, covers everything. Petri's Help menu and MOSHINE's help can link to it too.
  Check first that the burger is reachable in each app's normal view.
- **Flow:** picking an icon opens that variant's stub, because iOS reads the icon from the page it is on. The stub
  shows the steps. Chrome, Edge and Android get a real Install button (`beforeinstallprompt`); iOS can only be
  told Share > Add to Home Screen, there is no API. Firefox gets a note on what it can't do.
- **Already installed** (`standalone`): the panel says so; changing the icon carries the storage warning below.

Yes: one static stub page per variant, e.g. `/audio/icon/orange/`, linked from a small gallery. Each stub has its
own `apple-touch-icon` and manifest (same `start_url`/`scope` as the app, its own `id`), so Add to Home Screen or
Install takes that icon. It is the only reliable route; JS icon swaps on one page have mixed reports.

- Generate the stubs from the registry as `hidden: true` pages.
- If iOS launches the stub rather than `start_url` (reports vary), the stub replaces itself with the app when
  `navigator.standalone` or `display-mode: standalone` is true. A stub is only ever seen in a browser.
- Each `id` is a separate install, so two variants can sit side by side. Changing an icon means adding the new
  one and removing the old.
- **iPhone result (2026-10-30, real device, test pages since removed):** each home-screen app has its own storage.
  Test A saw only A, Test B saw only B, across localStorage, IndexedDB, OPFS and Cache, and neither saw Safari's
  data. Two installs from one origin sat side by side with their own icons, and iOS launched `start_url`, so the stub
  redirect is not needed: a real stub just sets `start_url` to the app.
- **What follows:**
  - A first install is safe: choosing an icon costs nothing.
  - Changing icon gives a new empty app. The old one keeps its data until it is deleted, and deleting it loses that
    data. So the panel must say this, and offer a way to move work first: Audio needs export and import of its
    recordings, MOSHINE has `.mosh`.
  - This also applies to shipping the new default icon. Existing iPhone installs keep the old icon, and getting the
    new one means re-adding, so it needs the same warning. Never suggest "delete and re-add" without it.
  - Work done in Safari does not appear in an installed app either.
- On Chrome all variants share the origin's storage, so removing one can prompt a wipe that hits the rest.
- It settles the open picks: each app keeps one default and offers the others.

### Open questions

- Direction, and what is the one thread connecting the family?
- Does each app's tab show its own mark, or stay on the 3die triangle?
- Install scope for the apps: is Iris Engine worth an install, and does Petri join the list?

## Project B: loading animation designer

### Findings

**Claude Code's spinner** (read from the local 2.1.308 bundle, not executed)
- Glyphs `· ✢ ✳ ✶ ✻ ✽`. Index `round(5·(1−cos(2πt/2000))/2)`: about 410 ms on the end glyphs,
  130–165 ms between. The dwell comes from easing a discrete sequence.
- Verb shimmer: 3-cell highlight moved every 200 ms, 10 cells of padding each side. Direction and
  speed change while requesting.
- Stall: after 10 s without a token, intensity ramps over 10 s and colour lerps to red.
- Staged copy at 10/20/30/45 s. Reduced motion: a static dot dimming on a 2 s cosine.
- The claude.ai sparkle is unverified. Rebuild behaviours; do not ship Anthropic's verb list.

**Field**
- Libraries are preset lists or fixed-interval frames; Rive/Lottie are hand-keyed. None found combines
  staged time behaviour, terminal output and breeding. loading.io's editor was not inspected.

**Satisfaction**
- Everything periodic in t; noise walks a circle; stagger 5–15% of the period; one lead element.
- Nothing under 1 s, spinner 2–10 s, percent + a way to stop past 10 s (NN/g).
- Backward decelerating ribbing cut perceived duration 11% (Harrison).
- Test at 12–16 px. Reduced motion = slow opacity breathing.

**Repo**
- No real spinner on any live page.
- Fractal Engine: pipeline compile has no indicator, one Metal compile took minutes.
- Iris: accumulation bar, fit has no progress UI seen.
- MOSHINE: text notes, export reports `{frame,frames,fps,eta}`.
- Audio: tool-frame preload, `decodeAudioData`, worklet load, no indicator.
- Trap (inferred): synchronous shader compiles in Iris (`engine.js:13`) and MOSHINE (`gpu.js:92`)
  block the main thread, so only compositor CSS animation runs there.
- No reduced-motion handling in `audio/index.html`, `fractal-engine/app.css`, `fractal-engine/index.html`.

### Every Claude loader (required preset family)

From the desktop app's cached assets (2026-10-30). Dot motion is measured from sprite pixels, so rebuild
it procedurally; do not copy Anthropic's sprite sheets into this repo. Sizes are in 48 px frames, 30 fps,
clay #d97757. These are motion studies: rename and recolour before anything public.

**The dots iori screenshotted: `WorkingMark`**
| Loop | Frames | Motion |
|---|---|---|
| default | 40 | 3 dots in a line, outer pair pinches in while the centre swells |
| think | 110 | 3 dots orbit a tilted ring, passing and merging |
| search | 20 | 3 dots spin edge-on, flat, the fastest |
| read | 60 | 2 large dots and a tiny third cycle a triangle |
| code | 75 | 4-dot square, opposite pair sweeps through a diagonal, then two pairs |
| write | 60 | 3 squashed dots in a travelling wave |
| compose | 62 | feather glyph |
| blocked | 30 | amber dot with a ring |

- State machine: a 10-frame grow from one dot, then `in`, `loop`, `out`, next `in`. Switches wait for a
  seam (think 54; code 18/37/56) or the loop end. Reduced motion is a static frame.
- The mapping is the idea worth keeping: each kind of work has its own motion.

**Others**
- Spark strips, frames@ms: thinking 9@90, writing 8@90, waiting 16@600, shimmer 15@100, entrance 6@70,
  exit 6@70, orbiting 18@100, tickle 7@40.
- ShimmerText: 3 s linear, band ease cubic-bezier(.714,.121,.211,.888), hold 15%.
- Three dots: 3 px, 1.8 s, opacity .29→1→.29. Quiet dots: 1.9 s, .15 s stagger, 2.5 px bounce.
- Ring spinner 1 s. Web glyph spinner `· ✢ ✶ ✻ ✽`, 1.2 s, up then back. Skeleton sweep 2 s, breathe 1↔.6.
- Status dot: 3 s, scale .86↔1. Halo: 2.5 s, opacity .3, scale 1.5.
- CLI: see Findings above.

**Not seen**: the node and main spark sheets were not cached, mobile apps were not inspected, and which
mark a given account gets is flag-controlled. The pictogram flipbooks are illustrations, not loaders.

### Model

A loader is a pure function, so it is seekable, loops exactly, and can be exported or bred:

```
field(t, i, ctx) → {x, y, s, a, rot, glyph, hue}     ctx: elapsed e, progress p

{ period, n, seed,
  layers: [{ layout, phase, ease, mods: [...], render }],
  stages: [{ after: 10, set: {...} }],
  determinate: "p→sweep" }
```

- Layout: ring, line, grid, curve, cells.
- Phase: `i/n`, golden, distance, noise.
- Mods: bounce, wave, trail, noise-loop, shimmer, quantise-to-glyphs.
- Stages are the part others lack: a loader that changes as the wait grows.
- Add transitions: a state graph with grow, in, loop, out and seams, as `WorkingMark` has.
- Stateful types (automata, physics) bake to frames; periodicity is prototyped.

### Tasks

**B0. Engine**: `loaders/core.js`, operators, Canvas2D and text renderers. Deterministic: `t` in, frame out.
**B1. Presets**: the Claude family above plus the 14 below as JSON, each proven at 16, 32 and 128 px. Bounce-check the loop seam.
**B2. Designer, maximum control**: every operator parameter is editable, none is hidden behind a preset.
- Stack the levels: sliders, per-parameter curves and keyframes, a node graph, and a raw expression
  or code field on any parameter. Each level writes the same JSON.
- Per-element overrides, so one dot can break the pattern.
- Stage, timeline scrub, stage simulator (fake 1 s / 10 s / 60 s wait), size preview, reduced-motion
  preview. Shareable through JSON in the URL `#`.
**B3. Exports**: terminal `{interval, frames}`, CSS keyframes, SVG, GIF/APNG, single-file JS, sampled
Lottie. Each renderer declares capabilities; the UI greys out what a graph can't reach.
**B4. Breeding**: live 9-up grid, mutate/cross/swap operators, branchable lineage. Auto-reject seam
jumps, flicker, and anything illegible at 16 px.
**B5. Shaders**: WebGL/WebGPU renderer, Julia Breath, later CPPN-style time-based breeding.
**B6. Library for future work**: a searchable preset library with exports ready to copy into new design
and development work. No app integration in this project, and size limits are a concern only for an
export that ships somewhere. The Repo findings above stay as reference for when a real wait appears.

### Starter presets

Cogitate · Tri-Fold · Hairline Orbit · Lissajous Trail · Depth Ruler · Julia Breath · Iris Dilate ·
Slime Bridge · Marquee Bulbs · Waveform Crawl · Datamosh Bar · Braille Rule · Morph Star · Reverse Ribbing

### Open questions

- Public tool on iori.me, or hidden? Default: hidden while it is a working tool.
- Does it need to output for real terminals, or is that only an aesthetic? Default: keep the export.
