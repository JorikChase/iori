# Iris Engine — from the eye file to the pixel (research note, 2026-11-12)

Read-only map of the engine at `claude/iris-flydown-e6eec4` ff01054, written for the iris automaton
(`papers/iris-automaton/`, paper draft `drawing-an-iris.html`). Paths are relative to `iris-engine/`. In
`shaders.js` the whole of fs-photo is line 17 (one escaped string); "fs-photo Lnnn" counts its expanded lines.

## 1. The eye file (`data/NN.iris`, v3)

- Container (`eyefile.js:44-58`): `"IRIS"`, u16 version 3, u32 head length, JSON head (`eye`, `ref`, `dialKey`,
  `scores`, `provenance`, `sections[{name, off, len, enc}]`), sections encoded `json | gz | bytes | table` (columnar
  u8/f64/q5/q5d per curve).
- Sections: `frame` (fit size, `align` pupil + limbus, view, grade, lut, edgeMm, texture) · `structures` (margin 720 xy,
  beads, crypt/island `outlines` with rim) · `levels` (`deck/fibres` xy w r z zc mat lum, `deck/veins`, `sheet/guides`,
  `sheet/sfib`, `sheet/svein`, `bridges/graph`) · `materials` (rimMat, rimLum, channels) + `materials/cells` (~9k cells,
  matS/lumS, matG/lumG) · `albedo` (ABL micro-texture spec) · `relief` (`mm`: wall, rimW, rimOff, pit, depth; `z`) ·
  `dynamics` · `measurements` (bytes: shipped light + de-light grids) · `legacy` (gz v2 genome incl. collarette) ·
  `journal` · `scores`.
- No colours are stored: every curve/cell carries `mat` (Ma, Ds, pheo, yellow, mie) + `lum`; `IrisMaterials.colourOf`
  makes rgb inside `T.load` (`tissue.js:619-631`). The photograph is not in the file (`head.ref.file` → `ref/`).
- Sidecars (study/flydown/seedtex.py, printprep.py), tissue uv unless noted: `.seed.png` 8192×1024 finest-band
  residual · `.steer.png` 2048×256 (RG coherence·(cos2φ, sin2φ), B crypt, A slope) · `.steer2.png` (downhill, envelope,
  iris) · `.phasor.png` 2560×288 · `.grain.png` · `.seed.json` (octaves, fibre λ ≈ 22–25 µm) · `.strands.png` (strand id
  + length from the margin) · `.print.png/.jpg/.json` (preview space). Eye 25 has no seed/steer/phasor/grain.
- Load: `IrisEye.fetch → read` → `__irisTissueUI.load({arrival, url})` → `T.proof()` → `T.load()` (every xy → tissue
  (u, v) through the fitter's map `F.getMap()`, margin harmonics, region `T.rect`/`T.size`) → shipped path
  `T.installMeasurements → T.bake → T.setOrigin`, or measured path `T.calibrate → bake → setOrigin → measureDelight →
  debias ×2` → `T.on = true`. Public: `IrisEngine.mount().load('26', {arrival: true})` (`engine-api.js:21`).

## 2. Passes

### Once per eye / per knob: `T.bake` (`tissue.js:876-1034`)
| pass | shader | in | out | scale |
|---|---|---|---|---|
| curves ×7 (fibres, floating, veins, guides, sfib, svein, outlines) | `CURVE_VS/FS` (`tissue.js:37-70`) | curves in (u, v) | nearest curve per texel (depth = distance): payload albedo (`toAlbedo` with measured light `T.irr`), distance/width | τ = max(3 µm, rect.w·2π·rOut/6144) ≈ 6 µm, 6144 wide |
| fill | `FILL_FS` | crypt outlines | winding inside | same |
| pack | `PACK_FS` (l. 258) | legacy height, de-light `T.srel`, fill, rim | packed | same |
| compose (4 MRT, mipmapped) | `COMPOSE_FS` (`tissue.js:76-245`) | all above | `o_alb` linear albedo (deck fibres × vein cut, ground cells in pits; sheet cells × guides × streaks × ABL grain, rim; ÷ srel), `o_aux` height mm + sheet coverage + mask, `o_slab` floating strands top/bottom/coverage, `o_slabAlb` | same |

With materials on, the procedural atlas bake (`bakeAtlas`, fs-bake) is skipped.

### Every accumulated sample: `render()` (`engine.js:1194-1262`)
1. `state.holdEye` → clear, nothing drawn (start eye still arriving).
2. Photo pass `drawPhotoFrame` (`engine.js:1062-1114`), ping-pong RGBA32F at canvas size (dpr 1.5 at normal), drawn
   only inside the eye's convex-hull fan (`eyeOutline`, `engine.js:1139`). Program = fs-photo patched by
   `IrisTissue.photoProgram()` (`tissue.js:263-449`), patched again by `flydown.js:172-365` under `?flydown=1`.
   - `main` (L598): per-pixel/frame subpixel jitter (none when `u_ref`); thin-lens DOF only if fstop < 64 (off);
     100 mm lens, 24 mm sensor, `zoomPhoto` 110 mm, orbit about a 13 mm pivot; light fixed in world (`lightStatic`).
   - `renderPass` (L526): cornea conicoid hit → Fresnel → refraction air → cornea → aqueous (`u_refract`) →
     `shadeInterior` → optional specular/room → limbal milk → limbus edge alpha.
   - `shadeInterior` (L344): `hitIris`, `irisCoords` (+ margin harmonics: v = 0 is the true margin), uv = atlasUV(angle,
     remapV(v, pupil)); analytic LOD from mm per px (≈ 18 µm/px at H = 1350); parallax march (`u_marchSteps` 10 + 4
     bisections against tissue height × `u_tisReliefK`, slab tests); normals from height differences; caustic on the
     light path; lid band; self-shadow march (7 steps); albedo = `tisAlb(uv)` × lognormal ABL texture; K2b subsurface
     (per-channel blurred normal, lifted shadow); lit = col·(key + ambient) + translucency + sheen.
3. Accumulate: running mean `mix(prev, col, 1/(n+1))`; `pace.samples()` 1–12 per rAF; converged at `Q.frames`
   (draft 64, normal 256, fine 384, ultra 512, capture 768); any motion → `resetAccumulation()`.
4. Post `drawPost` (fs-post, `shaders.js:15`): chromatic aberration 0 with the layer model; bloom 0.35 (16 taps > 1);
   × 2^EV; saturation; ACES; clamp; gamma 1/2.2; film grain 0.02 rehashed per frame; over white by alpha.
5. Print composite `IrisPrint.present()` only while a print runs (`print.js:249`).

### Fly-down (`?flydown=1`)
- Active when `F.wantsVariant()`: footprint < ½ fibre λ (≈ 11.8 µm per device px) or walk. At the 1800 px start view
  eyes 26 and 09 qualify, 35 and 25 do not.
- Request: 64×48 readback through debug 17 (uv + footprint). Generator `GEN_FS` (`flydown.js:70-168`): 128² pages in a
  4096² RGBA16F atlas, 5 levels 4 → 0.25 µm, inputs seed/steer/steer2/phasor/grain; out R detail D, G grain + birth
  jitter, B strand height, A fibre angle; ≤ 8 pages per tick. Variant: albedo × e^D, micro-relief, sheet ridges, crypt
  bridge tubes in march + shadow; pages fade in over `F.fade + F.spread`.

## 3. Switches (what renders a partial picture)
- `E.state.debug` n (+ `resetAccumulation`): 1 grid, 2 limbus shadow, 3 N·L, 4 exit radius, 5 height, 6 material,
  7 self-shadow, 8 caustic gain, 9 key irradiance, 10 caustic area, 11 entry cosine, 12 light |z|, 13 alignment mask,
  14 coordinate map (u, v, inside), 15 height view; fly-down only: 16 hit P, 17 request map, 18 (fdM, fdW, µm/px),
  19 detail alone, 20 page residency, 21 strand relief. Several read stale legacy terms under the layer model.
- Layer model: `IrisEngine.handle.on`. Bind-time: `T.ss`, `T.edgeMask`, `T.margin`, `T.k1`, `T.prune`, `T.ablDebug`.
  Need `T.bake()`: `T.depthMm`, `T.deckZ`, `T.sheetZ`, `T.wallZ`, `T.rimK`, `T.delight`, `T.payBlur`, …
- Engine state: `relief` (**set `E.state.relief` and `E.target.relief`** — the slider target pulls state back),
  `refract`, `specular`, `ambient`, light angles, post `ev sat tone grain bloom`.
- Fly-down: `F.on`, `F.genDbg` 1/2/3, `F.ridge`, `F.tube`, `F.hk`, `F.subGain`, … (`F.resetPages()` after; regenerated
  pages differ, so capture the as-shipped frame first).

## 4. Capture hooks used here
- `?ui=31&flydown=1&start=off`, then `await IrisEngine.mount().load(ref, {arrival: true})`; `IrisPrint.skip = true`
  and step until `IrisPrint.mode` is null.
- `E.resetAccumulation()`, then `E.stepFrame()` until `E.state.frameCount >= E.Q.frames`, then `gl.readPixels` on the
  default framebuffer (canvas is `preserveDrawingBuffer`); undrawn pixels have alpha 0 = the white page.
  `E.captureTiled` came out off-centre at the start view this time — not used.
- Per-pixel tissue (u, v): `E.drawPhotoFrame(fb, W, H, 0, tex, {debug: 14, fstop: 64, ref: 1})`, read FLOAT
  (`print.js:183-201`). Not used yet; it is how the automaton's anatomy would follow any other view.
- Rig: `tools/iris-automaton/serve.py 8791` (POST /save/… → `tools/iris-automaton/captures/`, gitignored).

## 5. The print's arrival rule (for comparison)
`printprep.py strand_field`: semi-Lagrangian trace of every point back along the outward strand tangent (+ 0.35 radial)
to the pupil margin (r < 1.04 r_p): the start angle u0 and the length S. `print.js:99-117`: 256 bundles round the
margin, forking ×2 at S = 1/3 and 2/3, each with its own start jitter and speed 0.7–1.15; T = Σ segments + a wobble +
0.06 between strands + 0.22·crypt between strands (crypt floors last); per pixel age = u − T drives droplet alpha,
sharpening LOD and the wet front; exact frame once age > 0.5.

## 6. What this means for an automaton
- The final pixel is not a sum of passes (lighting multiplies albedo, the march moves where albedo is read, ACES bends
  everything), so an exact automaton cannot add pass outputs. It can telescope complete pictures: the engine renders
  itself with parts off (flat → relief → fly-down) and each is a full frame.
- The anatomy a local rule needs (tangent, crest, crypt, radius, masks) is all in the eye file; at the start view a
  similarity maps it to pixels, elsewhere debug 14 does.
