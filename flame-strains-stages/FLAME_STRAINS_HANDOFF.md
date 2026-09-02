# FLAME STRAINS — Handoff Context

One file: `flame-strains.html` (self-contained WebGL2, no dependencies, lives in
`~/Desktop/code/iori/` next to `flame-simulation.html` and `AUTOMATA_CATALOG.md`).
A volumetric flame engine in which any 2D cellular automaton burns as a "strain"
inside one fire — composable, colourable, self-driving. ~120 fps at full
resolution (320×256×12) on the user's M-series MacBook.

Three snapshots ship with this document (in `flame-strains-stages/`):

| Snapshot | What it is |
|---|---|
| `stage1-engine-core.html` | The base engine: shell-stack fluid carrier + 9 hardcoded strains, mix budget, raymarcher, axis fix |
| `stage2-catalog-automode.html` | Kernels-as-code / automata-as-data (~55 catalog systems), per-slot editors, materials & fireworks, traces, auto mode + thermostat v1 |
| `stage3-current.html` | Current: per-strain colour ramps + harmony director, save/load, layers mode, per-shell fire colours, automata-only fire, brutal UI, thin smoke |

---

## 1. The user's directives, in order (the spec, in their words)

These are the decisions that shaped the engine. When in doubt, THESE win over
any implementation detail below.

1. **The founding brief**: many 2D automata algorithms; build a flame that can
   have the properties of any 2D cellular automaton — orbit it with a camera,
   change the automaton type, or run several at once composed "on one field".
   Previous attempts (rotated planes, voxels needing pixel-sized microvoxels)
   failed. Wanted "state of the art… the base for such a living flame engine to
   seamlessly burn any automaton type". A 2D engine first was acceptable *only*
   with a clear path to 3D. → led to the shell-manifold architecture (§2).
2. Platform choice, their words: "if 2d we can do the webgl, but if we have
   massively parallel processes running on single threaded cores we should swap
   to webgpu" → WebGL2 chosen (every pass is one fragment draw; rules are pure
   `neighborhood → state` GLSL so a WGSL port stays mechanical).
3. Start from **flame-simulation.html** as the archetype (NOT
   procedural-flame.html — "that simulation isnt very procedural"). Langton's
   ant explicitly requested as a test automaton.
4. **"each automaton a percentage slider to the base spawned fuel"** with
   presets and free mixing → the mix system: the root *births* strains in
   slider proportions.
5. **"why is the base flame still not burning the langton"** + "add more types"
   + "sliders move proportionally to fit into the fuel ratio" → per-strain
   combustion responses (ants burn into embers), proportional 100% budget where
   pure fire keeps the remainder, 4 more automata.
6. **"lets not clip the bottom of the flame"** → rounded root fade.
7. **"lets use these automata"** — `AUTOMATA_CATALOG.md` (written by another
   agent; Part 1 = 10 kernels & 7 schedulers, Part 2 = ~350 systems, Part 3 =
   coverage table; framing: "the catalog is a lookup table for implementation
   decisions… most are data, not code") → the kernel refactor: ~55 systems as
   one-line data entries on 8 kernels.
8. **Falling sand, water, fireworks with many colors, traces behind automata**;
   **auto mode on A** ("really subtly… sliders constantly slowly move… all the
   properties… even render properties and fire properties, everything needs to
   be exposed and randomly nudged often"); **thermostat** ("the overall
   temperature never got so hot that the flame would go full white… subtly
   remove the fuel automatically"); research request: particles that don't burn
   but fill the flame with liquid or form static particles; sand falling from
   the flame; liquid slowly filling the droplet shape.
9. **Colour control per strain** + "randomly assign it using the colors
   button". Mid-turn corrections: "water automata dont flow down to the bottom
   of the droplet shape and sand does so neither" (cause: the drift pass was
   lifting them; movers are now drift-exempt) and **"we want to be able to
   assign each automata a different color ramp"** → the 14-ramp system.
10. **Save/load; burger toggle for the whole UI; auto mode changes colors
    slowly; "make the strain coloring functional as now its always the same
    color on all the automata"** (cause: tint was added on top of the
    yellow-white fire palette; fix: strain colour *replaces* fire colour where
    the strain lives).
11. **Per-shell (atlas layer) fire colouring** ("rather than coloring each of
    the atlases a random color ramp"); **toggle: each automaton in its own
    atlas layer**; thermostat complaints ("flame always gets too strong…
    fuel slider doesnt appear to have an effect") → hot-fraction-of-flame
    metric; fuel became the master budget gating strain emission too.
12. **"i think it would be most natural if the fire only burned from the
    automata"** → automata-only fire mode is the DEFAULT (faint pilot ring
    ignites the root; only 'pure fire' preset re-enables the abstract fuel
    column). Follow-up: "the center automata injection can be stronger as it
    was with the pure fire injection" → ~30× spawn boost in the old jet's
    ring/band.
13. **Colour harmony**: "ensure the color combinations… pair well together by
    design? random colors but complementary. maybe batches of similar colored
    textures… complimentarily assigned? both options" → harmony director
    (base hue + analogous/complementary/split/triadic scheme drives fire ramp,
    shell strata, and strain batches).
14. **UI**: "scrollable… brutal and minimal with no unnecessary elements and
    descriptions" → monospace, square, no prose, tooltips only.
15. **"lets remove the ground plane"** → no floor; flame floats in the dark.
16. **"too much smoke… we want to see and inspect the structures inside"** →
    smoke extinction cut to ~⅓, smoke tones darkened toward bg, colour takes
    over from grey at lower temperatures.

Standing themes across all of it: *everything exposed as sliders; everything
randomizable but tasteful; nothing should jump — drift, don't pop; the automata
are the point — they must stay visible, colourful, and burnable; endless
variety ("always new and surprising flame") without whiteout or die-out.*

## 2. Architecture (current file, ~2,300 lines, all inline)

**The manifold.** Automata stay strictly 2D. The volume is K=12 concentric
shells around the flame axis; each shell is a 320×256 (θ, height) grid wrapping
in θ, tiled into ONE 2D atlas (tiles have 1-texel pad columns; every pass
writes pads as wrapped cells so hardware bilinear filtering crosses the seam).
Cone: H=2.6, R0=0.7, radius profile tapers to the tip. `toCell()` maps world →
(θ-cell, y-cell, continuous shell coord). URL overrides: `?nt=&ny=&k=` plus any
P key (e.g. `?preset=hypnosis&steps=64`).

**The carrier** is flame-simulation.html's stable-fluids loop per shell
(buoyancy, curl, spin memory, vorticity confinement, Jacobi pressure, gradient,
advection) + weak radial coupling/expansion + per-shell & top cooling + small
in-plane thermal diffusion. Wind is a world vector projected on shell tangents;
swirl is azimuthal. Fuel: in `fireMode 0` (default) only a faint pilot ring at
the root (share 0.2×fuel); in mode 1 the classic fuel column with share =
(100 − Σmix)%. `uEmit = emitG × min(1.35, fuel/1.5)` — fuel gates strain
emission, so fuel 0 puts EVERYTHING out.

**Strains: kernels + data** (the catalog's thesis). One state texture; alpha =
slot id (1–9); one multiplexed step pass dispatches per cell on
`uSlotK[slot]`. Kernels: 1 LIFE (B/S/C outer-totalistic — all life-like AND
Generations rules), 2 TURMITE (turn-mask agents as CA), 3 CYCLIC (n, threshold),
4 EMBER, 5 GRAY-SCOTT (F,k), 6 WOLFRAM (8-bit rule; rows climb with the flame),
7 FOREST (Drossel–Schwabl), 8 CRYSTAL, 9 MATERIAL (Margolus falling
sand/water/oil/stone; movers are drift-exempt; water quenches, hot sand glows),
10 FIREWORK (rockets climb → flash → 8-spark ring; per-rocket hue). `CATALOG`
= ~60 `[name, kernel, params, hue, group]` rows; each of 9 slots binds one
entry + editable copy (params, ramp, hue/sat/bright/spread, emission,
aggression, flammability). Ghost traces = negative slot ids (glowing fade or
solid/wall mode).

**Ecology**: rules see carrier heat (burn/spark/ignite/melt as graded per-tick
rates ×flammability), emit heat back (`T = max(T, emit)`), contest dead ground
(habitable heat window, per-kernel aggression), decay to ash, sterile core >
1.35. Spawn: per-5×5-block nuclei in the root band ∝ mix sliders, ~30× denser
in the core injector ring; materials spawn high (rain). Layered mode
(`P.layered`): slot i owns shell `round((i−1)(K−1)/8)` — spawn/burst/brush
confined there.

**Render**: jittered single-scattering raymarch through the cone; rising domain
warp; trilinear sampling (θ-wrap, shell lerp); near-axis samples blend toward
the shaded 4-point ring average (kills the axis artifact — colours must be
averaged AFTER shading, not T before); root/tip fades; fire palette = 5
uniform stops, PER SHELL (`uPalS`, hue-turned by shell signatures × `shellVar`);
strain tint REPLACES fire colour where present (glow>1 adds); smoke = thin dark
veil; `col/(1+0.12col)` shoulder. Atlas inspector on **T** (density → strains →
axial slice → flat debug).

**Colour system**: strains draw through 4-stop ramps (14 named: fire, gold,
sunset, rose, violet, neon, ice, ocean, emerald, acid, forest, rainbow, mono,
ember) + per-slot hue shift/sat/bright/spread; kernel maps its state → ramp
position (age, dying phase, trail colour, temperature, V, per-rocket hue…).
**Harmony director**: every random roll picks a base hue + scheme
(analogous/complementary/split/triadic); the fire ramp leans to a partner hue,
shells lean to scheme hues, slots are assigned in batches sharing ramp+hue
aimed at scheme hues. 🎨 = new harmony everywhere; 🎲 = new mix (2–5 systems,
random shares ≤ ~95).

**Auto mode (A)**: hides UI; random-walks every slider (inside the middle 70%
of its range, τ≈14 s), slot params/colours, mix shares (fire keeps 25–70%);
slot swaps every 30–100 s (burst), palette morphs every 45–135 s over 12 s +
continuous per-stop hue walk; ramp swaps pick harmonically; traces toggle;
camera orbits/breathes. `emitG`/`exposure` excluded from the walk (thermostat
owns them).

**Thermostat** (on by default, always in auto): a 32×32 probe pass samples the
density atlas every 12 frames (readPixels); metric = hot(T>0.7)/warm(T>0.3) —
the hot fraction OF THE FLAME (target 0.30). Trims emission first, then fuel,
then exposure (exponential, floors 0.15/0.15/0.4); recovers toward BASE (the
user's slider values) when cool. Sliders visibly follow trims whenever the
panel is open. Stat line shows "hot N% of flame".

**Save/Load**: full snapshot (P, slots incl. ramps/params, palette, camera) as
downloaded JSON + last 12 in localStorage ("recent…" select). **Burger ☰ / H**
toggles the panel (scrollable, brutal monospace). Keys: 1-9 slot select
(+editor accordion), 0 erase, R seed, X burst, D random mix, G random colours,
T atlas, A auto, Space pause.

## 3. Known behaviours & tuning notes

- Whiteout physics: strain emission is the runaway term; thermostat handles it,
  but presets with mix totals > ~90 deliberately starve/darken the flame.
- Crystal + cool base (< ~15% fire) = grey frost shroud (feature-ish; sliders
  control it).
- Discrete drift (`drift` slider) uses stochastic rounding — patterns tear in
  shear; that's "the fire at work". Movers (9/10) are exempt or gravity loses.
- The Margolus partition alternates offset with the strain tick counter; y<0 is
  a wall; sand sinks through water; liquids level by per-block chance.
- Life-like colonies need: dead-substrate decay LOW (0.006), colonizers land as
  live spores, carrier in-plane diffusion — remove any of these and colonies
  starve (this was debugged twice; don't regress).
- Burn = graded rates (`×uBurn×flammability×(heat−threshold)`), never coin
  flips per tick — at 24+ Hz hard thresholds annihilate everything instantly.
- Perf levers: `scale`, `steps`, DPR cap 2, K/NT/NY via URL. Sim ≈ 23 passes
  over ~1M cells; raymarch dominates.
- Strain Hz default 24 (slider), sim at display rate.

## 4. Testing rig (cloud container, swiftshader)

`test.py <urlparams> <shot[:sec]>…` — headless Chromium
(`/opt/pw-browsers/chromium-1194/...`, flags `--use-angle=swiftshader
--enable-unsafe-swiftshader`), screenshots + console/pageerror capture. Use
tiny configs (`?nt=128&ny=96&k=6&steps=32&scale=0.4&substeps=8`) — swiftshader
runs ~1 fps; `substeps` multiplies sim steps per frame to fast-forward time.
`window.__P` / `__HEAT` exposed for probing. The atlas view (T) is the best
debugging surface; `window.__probeRays()` reads temperatures along rays.

## 5. Backlog (discussed with the user, not yet built)

- Auto-exposure with log tonemap: map the probe's running p95 T to the ramp top;
  overflow → bloom instead of flat white.
- Materials: density-ordered displacement (oil floats/sand sinks via one
  comparison); temperature phase change (water↔steam, sand→glass, stone→lava).
- K4 kernel (separable big-radius blur) → Lenia / SmoothLife / multi-scale
  Turing ("nebulas"); noise-type selector (value/simplex/worley/ridged) for
  warp & smoke.
- Radial (cross-shell) material flow; WebGPU only if real-3D materials happen.
- Site integration: register in `pages.meta.json`, run `python3 site.py all`
  (see AGENTS.md; SEO block is generated — never hand-write inside markers).

## 6. File map (in ~/Desktop/code/iori/)

- `flame-strains.html` — the engine (current = stage 3).
- `flame-strains-stages/stage{1,2,3}-*.html` — the three snapshots.
- `AUTOMATA_CATALOG.md` — the reference the kernel design follows.
- `flame-simulation.html` — the 2D archetype the carrier is ported from.
- `voxel-flames-3d.html` — earlier true-3D fluid attempt (atlas + DDA ideas
  came from here).

---

## 7. Stage 4 (2 Sept 2026): the combustion economy, smoke, HDR render

Snapshot: `stage4-economy.html`. Diagnosis that led here (frames, traces,
plan): the "Flame Strains Diagnosis" artifact; short version: in every
earlier stage the visible flame was the strain population's footprint,
strains pinned heat with `max(T, emit)`, nothing culled them, so the flame
filled the cone (stages 1/2 whited out, stage 3 went grey), and the
thermostat's hot/warm ratio could not see any of it.

**Fixed-step sim.** `update()` accumulates real time and runs the carrier at
`SIM_HZ = 60` (max 3 steps/frame, backlog dropped); strain ticks at `P.hz`
inside that; the governor and auto mode run per sim step. Dissipation,
lifetimes and gains no longer depend on the display rate.

**Energy per cell.** Colonising kernels (1 LIFE, 3 CYCLIC, 5 GS, 6 WOLFRAM,
7 FOREST, 8 CRYSTAL) keep a reserve in `.b` (`hasEnergy`, `energyOf`,
`vigourOf`); every rule now preserves `s.b`. `initStrain`/`deadOf` set it to
1; colonised cells inherit 0.9× the parent's. Each strain tick spends
`uSpend·(0.5+0.5·heat)·(1+3·rim)`; the root band (y < 0.3·NY) recharges at
`1.5·spend` (sustains, never immortal). `uSpend = spendGain/(life·hz)`, so
`P.life` (slider "life", 8 s) is a cell's lifetime away from the root.
Emission and tint dim with vigour; at zero the cell becomes ASH
(`ashOf`: slot 0, `.g` = amount; `isAsh`). Any ALIVE cell that dies also
leaves ash; substrate fading to empty does not; movers do not.

**Heat is a source, not a floor.** `advectDensFs`: `if (E > T) T += (E−T)·
uHeatRate` with `uHeatRate = 1−exp(−60·dt)` (nearly instant heating; cooling
can win once a cell is gone). Pilot ring unchanged. `uEmit = emitG·clamp(0.35
+0.65·fuelS/1.5, 0.2, 1.3)` — fuel is energy too, but never gates emission to
zero.

**Smoke channel.** Density atlas `.g`. Sources: ash (`uSmokeGain` 0.02 per
step per unit ash) and water quench; advected, diffused in-plane (0.12) and
radially (`uCouple`, no expansion term — that multiplied it); decays with
`exp(−dt/P.smokeLife)`; capped at 1; lifts at 0.15× the hot-gas buoyancy.

**Governor (`governor()`, replaces the thermostat).** `fuelS` follows
`P.fuel` with τ 1.2 s. Size target = `P.size·min(fuelS/1.5, 1.6)`; coverage
= live-strain fraction of the atlas (probe `.a`). `spawnGain = max(0, 1−
ratio²)` (τ 0.6 s), `spendGain = 1+4·max(0, ratio−1)` (τ 1 s). Never touches
a slider; `P.thermo` off ⇒ gains 1. Exposure: `senseLum` samples the HDR
frame, p90 of 4-sample maxima is held at 0.6 (τ 2.5 s, range 0.2–16),
`P.exposure` is an offset, `?autoExpo=0` disables. Stat line: `size cov% /
target% · heat · expo`. Default `size` 0.10 — that IS the 22-second look;
0.24 already reads as fill.

**Render.** Raymarch writes linear HDR radiance + transmittance (alpha) to
`hdr` (canvas-sized RGBA16F), then bright pass → 2× separable blur at ¼
res → composite (exposure, ACES, 1/2.2, background added after tonemap so it
stays authored-colour). Palettes/ramps are linearised per sample by `toLin`
(hue only; magnitude kept; negative channels clamped — un-clamped they made
NaN that the blur spread over the whole frame). Emission-absorption
integral: gas emits `fire·(0.15+1.2·s(0.1,0.8,T)+1.8·hotCore²)`, strains
replace 75 % of the hue and add 30 % (`Es = toLin(st)·(0.4+0.9·s)·glow`),
emission density `uDens·body·min(1,(shell+0.5)/2)` (inner shells are a
sliver, not a column), all ×4. Extinction `uDens·(absorb·body + 0.2·smoke·Sm
+ 2.5·pres)`: the gas is nearly transparent, smoke absorbs, a strain cell is
matter (front hides back — that is the crispness). Lit smoke = `smokeCol·0.12
+ fire·0.6·s(T)`. Fades: tip 0.78–1.0, root 0–0.02, rim over the outer 3
shells. Spin "magic" rainbow is ×0.12 (as an emitter it out-shone the fire).
Axis blend radius 0.03–0.12. Spawn never on the outer two shells; core
injector ×8 (was ×30); sterile 1.1; scorch thresholds lowered so the core
can burn each strain.

**Sliders added:** fire → size, life, smoke life; render → absorb, bloom;
smoke now scales real smoke. `drift` default 0.3. `BASE` and the trim
write-back are gone (nothing trims sliders any more).

**Rig:** `flame-strains-stages/rig/` (README) — MessageChannel frame clock
for hidden tabs, canvas capture + upload server, probe trace. Use it before
believing any screenshot from automation.

**Open tuning:** exposure metric is still noisy across presets (swings 3–15);
the root can still bunch when a preset spawns heavily; ramps summed in the
core read "tinsel" with 9-strain presets — the harmony director should bias
presets toward fewer hues; `pure fire` is a small jet.
