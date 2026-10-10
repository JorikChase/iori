# 15. The eye file — ID v3 (draft for iori's approval, 2026-10-10; study/14 phase 1)

One file holds everything an eye is. One reader loads it, and the Load button, `?eye=`, the session file, the fitter's
result and later Soulmake all go through that reader. Every section that a later phase fills (levels' carrier fields,
column handles, materials, dynamics) is present and typed from the first version, empty where nothing has filled it yet.

## 0. What an eye is today, measured on eye 26

| file | size | gzipped | holds |
|---|---|---|---|
| `data/tissue-26.json` | 5 487 KB | 1 525 KB | 84 outlines (1 157 KB) · 896 fibres (643) · 1 657 veins (481) · 1 552 guides (1 767) · 620 sfib (350) · 635 svein (358) · 67 beads (13) · margin 720 pts (15) · 9 242 colour cells (625) · roots graph (74) · z, mm, grade, lut, edgeMm, ablTex, rimRGB (< 1) |
| `data/case-26.json` | 1 330 KB | ≈ 560 | the legacy genome (580 KB: 32 globals, collarette, 5 furrows, 394 bundles, 4 727 splats) · 12 encoded fields 256 × 64 u8 (747 KB) · align · view · scores · texture stats |
| `data/tissue-26.cal.bin` | 609 KB | — | head JSON (v 2, dialKey, measured, quality) · light grid k rgb + s rgb + weight at the fit's 640 × 462, 10 bits · de-light grid 1 588 × 239, 11 bits · stats |
| session file | small | — | `{ format: 'iris-session', v: 1, engine, saved, quality, camera, tissue | id, journal }` |
| legacy ID (`exportID`) | ≈ 1 MB | — | `{ v: 2, engine, genome, fields, provenance, view }` — the procedural renderer's own file; frozen |

Three requests per eye, ≈ 2.7 MB over the wire, four loaders (the button, `?eye=`, the session, the review tool), and the
journal's op set: `actualize add addParent delete deleteParent insertParentPoint join move moveParentPoint
removeParentPoint set setParams split`. Provenance strings in use: `measured inferred seeded painted deck`.

## 1. Principles

1. **One file, one reader.** `eyefile.js` reads and writes; nothing else parses an eye. The legacy `exportID` v2 stays
   as the procedural renderer's file and is marked frozen; the v3 file carries it inside as a section until phases 2–3
   replace what it still does (the fit frame, the fallback renderer).
2. **Slots before content.** Every section below exists in v3.0. A reader never asks "is there a levels section"; it
   asks "is this level's carrier filled" (`filled: false` until phase 2).
3. **Provenance on everything** that was measured, traced, inferred, seeded, grown, painted or placed by hand, at the
   finest grain that is cheap: per curve, per handle, per cell block, per section.
4. **Binary where it is big, JSON where a person reads it.** A small JSON head indexes binary sections (the cal.bin
   already works this way). Nothing in git is JSON: `tools/eyefile_dump.py` renders any section as JSON on demand for
   reading and diffing.
5. **Determinism is the contract.** A loaded eye's render is a function of (file, engine version, quality, view) and
   nothing else — the phase 0 gate, written into the format: the file carries the `dialKey` its measurements were made
   with, and a mismatch means "measure again (editor) or refuse (viewer)", never "use them anyway".
6. **Forward compatible.** Readers ignore sections they do not know; writers pass through sections they did not change,
   byte for byte. Each section carries the engine version that wrote it.

## 2. The container

```
magic  "IRIS"  4 bytes       version u16 = 3   minor u16
headLen u32                  head: UTF-8 JSON, padded to 4 bytes
sections: concatenated binary blobs, each 4-byte aligned, located by head.sections[i].{name, off, len, enc, sha1}
```

`enc` ∈ `json` · `u8` · `u16` · `i16` · `f16` · `f32` · `delta-u16` (first value absolute, then deltas, zigzag) ·
`gz` (a gzipped inner section, for the legacy blob only — Caddy already gzips the file on the wire). File extension
`.iris`; MIME `application/octet-stream`; in git `data/26.iris`, served as `26-<sha1 first 8>.iris` with an immutable cache.

## 3. The head (JSON, read by people)

```json
{ "format": "iris-eye", "v": 3, "minor": 0, "engine": "0.9.5-yellow", "quality": "normal",
  "eye": { "id": "26", "name": "green, crypts", "created": "…", "modified": "…" },
  "ref": { "file": "26-green-crypts-isolated.jpg", "source": "https://commons.wikimedia.org/…", "author": "…", "licence": "CC BY-SA 4.0",
           "natural": [3840, 2774], "fit": [1280, 925], "isolated": true, "sha1": "…" },
  "dialKey": "…", "measured": "2026-10-10T…", "scores": { "match2": 90.35, "strandCorr": 0.426, "cellDab": 1.97, "ruler": null },
  "provenance": { "frame": "measured", "structures": "traced", "levels": "traced+inferred", "materials": "measured", "measurements": "measured" },
  "sections": [ { "name": "frame", "off": 0, "len": 1234, "enc": "json", "sha1": "…" }, … ] }
```

The photo itself is never in the file; `ref` names it and its licence (Commons attribution travels with the eye).

## 4. The sections

| # | section | enc | holds today (source) | typed slots for later | est. size |
|---|---|---|---|---|---|
| 1 | **frame** | json | pose: pupil / limbus / catch in normalised photo coordinates (`case.align`); view: rot, viewRect, zoom, pupilOff, limb, pupil, lid, lightAngle, lightElev, srcType, srcSize, ambient, ev, fstop, focus, kelvin, sat (`case.view`); `edgeMm`; `grade` {chroma, hue}; `lut` {yellowEdgeNm}; iris bow (cone + bulge) | thickness field; camera presets | 2 KB |
| 2 | **structures** | mixed | `margin`: 720 points (delta-u16 uv) + circle; `beads`: 67 {uv, w, r, z, zc, rgb}; `collarette`: the genome's `coll`; `outlines`: 84 polylines (delta-u16) + rim strength per point (u8) + island flag; `furrows`: the legacy 5 arcs; `spots`, `nodules`: empty lists | ruff bead count/amplitude; furrow depth/d-rule; sphincter annulus; root ring | 250 KB |
| 3 | **levels[]** | mixed | six entries in the ledger's order (S−2 lattice, S−1 deck, S0 sheet, S+1 freed, S+2 bridges, S+3 membrane), each `{ id, class, heightMm, orientationPrior, filled, fields, curves, parents, graph, handles, children }`. Today's curves move in by class: `fibres` + `veins` → deck.curves; `guides` + `sfib` + `svein` → sheet.curves; `roots.bridges` → bridges.graph; `T.parents` → the level's parents. A curve: uv (delta-u16), w (u16 µm), payload val/base (f16) or rgb (u8 × 3), z/zc (i16 µm), `provenance`, `parent`, `inst`, `from`, `anchored` | `fields`: orientation (u8 angle), spacing (u16 µm), phase (u16), amplitude (u8), confidence (u8) on the polar grid 512 × 128 fixed, plus turbulence {scales, amount, seed}; `handles`: column handles {uv, dz per level}; `children`: clump, roughness, kink, parting, taper, braid | 1.1 MB raw, ≈ 700 KB gz (all levels) |
| 4 | **materials** | mixed | `cells`: 9 242 {uv, sheet rgb, ground rgb} (u16 uv, u8 rgb) (`tissue.cells`); `rimRGB`; the per-sample palette indices the curves carry | K2: melanin, stroma, pigment, mie per cell (u8 each) and per strand; a material table | 90 KB |
| 5 | **albedo** | json | `ablTex` {amp[4], exp, gain, var, octVar[4], perPixel, src}; the default spectrum for an eye without one | per-region exponents | 1 KB |
| 6 | **relief** | json | `mm` {wall, rimW, rimOff, pit[2], bodyBlur, guideColBlur, depth}; `z` {model, rK, zMaxMm, provenance}; dials that reach the bake (deckZ, sheetZ, wallZ, delight, rimK, ablMm, underMm, lipMm, restMm, drape, dipMm, layered) — exactly the `dialKey`'s inputs, so the key is derivable | fabric-lift falloff; per-level height defaults | 1 KB |
| 7 | **dynamics** | json | pupil radius at capture; `anchored` default per class | d-rules (crypt widening, furrow depth, ruff separation, drift); per-curve anchored flags live on the curves | 1 KB |
| 8 | **measurements** | binary | today's cal.bin v2 body: light grid (k rgb + s rgb + weight, 10 bits, step 1 at 640 × 462) and de-light grid (1 588 × 239, 11 bits) with their heads, plus `debiasStats` | step 2 light grid; 8-bit de-light | 600 KB → ≈ 250 KB after S4 |
| 9 | **legacy** | gz json | the v2 genome (globals, coll, crypts, furrows, spots, nodules, bundles, splats, blend, ridges, fitted) and the 12 encoded fields — what `renderCaseThumb` / `frameFromCase` import today | shrinks as phases 2–3 take over placement (fields) and relief (splats); dropped in a later major | 1.3 MB → ≈ 560 KB gz |
| 10 | **journal** | json | `{ v: 1, primitives: primKey, ops: [...] }` — the op list as `T.journal()` writes it; replayed after load | new op types: `lift`, `comb`, `paint`, `material`, `addCrypt` … | 0–50 KB |
| 11 | **scores** | json | the last review's numbers and the ruler's; informational, never read by the renderer | — | 1 KB |

Total first cut ≈ **2.1 MB over the wire** (gzip on the way) against today's 2.7 MB in three requests; the 150 KB goal of
T5 is reached by S4 steps, named per section above, not by this format change.

## 5. The loader and the module boundary

```js
// eyefile.js — the only parser
IrisEye.read(bytes | json | url)  → eye            // validates magic, version, section hashes; unknown sections kept
IrisEye.write(eye, { json: false }) → bytes | json // passes through sections it did not touch
IrisEye.fromToday(tissueJson, caseJson, calBin)    // the migration writer (also tools/eyefile_pack.py offline)

// IrisEngine — the page becomes a client of it; no UI code inside
const h = IrisEngine.mount(canvas, { quality, view, light })
await h.load(eyeFile | url)        // one path: measurements installed when dialKey matches, else h.measure() (editor only)
h.unload(); h.on; h.camera; h.probe(opts); h.apply(op); h.undo(); h.journal(); h.export() → eye
```

`__irisTissueUI.load()`, `?eye=`, the session file's `tissue` block and `__t7.review` all become callers of `h.load`.
The fitter's result is written with `IrisEye.write` and read back through the same reader before it is scored (the
round-trip is part of the fit).

**Built 2026-10-10 (phase 1 step 4, first form).** `engine.js` holds the renderer, moved verbatim out of index.html (1 160
lines; the shaders stay as `<script type="x-shader">` tags). `engine-api.js` is `window.IrisEngine`: `mount(canvas)` →
the handle with `load('26' | 'data/26.iris' | { id } | { url }, { arrival })`, `unload`, `eye`, `on`, `eyes()`, `measure()`,
`quality`, `camera`, `apply/undo/journal/replay`, `probe`, `elevationAt`, `export()` (the file with the journal section
replaced, everything else byte for byte) and three named escape hatches (`_engine`, `_tissue`, `_loader`) so remaining direct
uses can be found. `__irisTissueUI.load({ url })` loads any eye file; the eye's id and its photograph's name come from the
file's head. Honest limits: the engine still creates and sizes its own canvas and syncs 23 page controls by id, so `mount`
accepts only `#gl` and throws for another canvas — the 1b worklist in study/14; arrival loads carry no photograph, so they
have no score (by design). Gate: contract `[]` after the move; loads by id, by url and on arrival through the facade give the
phase 0 numbers.

## 6. Migration and the gate

1. `tools/eyefile_pack.py NN` — offline: the three files of today → `data/NN.iris` (and `.iris.json` for diffing).
2. `eyefile.js` reader in the page; the Load button and `?eye=` switch to it; the three old files stay until the gate.
3. **Gate (phase 1):** the four eyes round-trip — today's load → `write` → `read` → review — bit-identical on MATCH2,
   strandCorr, cellΔab (the numbers of 2026-10-10: 26 90.354 · 09 88.117 · 25 91.397 · 35 88.316); one request per eye;
   the UI contract `compare()` and `reach()` both `[]`; the arrival path logs "shipped measurements installed".
4. Then the old files are deleted from `data/` and the writer becomes the only way an eye is published.

## 7. Decided (iori, 2026-10-10)

| # | question | decision |
|---|---|---|
| 1 | binary or JSON | **binary, always.** No JSON twin in git; `tools/eyefile_dump.py` prints a file's head and any section as JSON when a person needs to read or diff one |
| 2 | the legacy section | ships in v3.0 only for the fit frame and the fallback renderer, and **the legacy paths get pruned**: iori sees the old engine for a couple of seconds on init (the stand-in frame) — phase 1b inventories every legacy path still executed on load and removes what the layer model does not need; the section shrinks to what `frame` cannot yet carry and is dropped when the layered model is the default |
| 3 | the photo | never in the file; `ref` names it with its licence |
| 4 | handles | a dz per level per handle (the column stored as computed, any level overridable) |
| 5 | colours vs materials | **materials move up**: K2 (materials per sample) and K2b (lateral subsurface) become phase 2 of study/14, right after the file exists, so the material channels land while the format is young; curves keep rgb only until then |
| 6 | naming | as concise as the data allows: `data/26.iris` in git; served as `26-<sha1 first 8>.iris`, immutable cache |

Also decided the same day: the grain smear (study/14 phase 3 step 1b) is the **whole-eye baked** pass only; no analytic per-pixel variant for now.
