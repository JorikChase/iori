# The fly-down's field, exported (landscape analysis step 1, 2026-11-13)

Step 1 of the landscape-analysis plan (IORI MASTER; iori approved it as "send step 1 to fly-down"). The aim is to export in 3D the field the renderer actually draws, so the shader rules no longer have to be ported to Python by hand (`rimcut.py`, `forkmap.py`).

## Pipeline

1. **`flydown.js` `F.probeField(o)`** builds a second program from the walk variant's own source:
   - It renames the variant's `main` and appends a probe `main`.
   - So it runs the same `tissueH`, `fdHn`, `fdGround`, `fdSdStrands` / `fdRope` and `fdRimFrame` / `fdRimLip`, with the same uniforms (`T.bind`), the same flags and the same baked edge maps.
   - It first grows the pages under the box at the chosen level (`level 2` = 1 µm texels) and holds the planner (`F.hold`) so nothing evicts them.
   - It has two passes:
     - **ground** (N×N): the march's ground at each column, in the order of the walk's step loop. That is: rim cut-back, then the healed ground under bands, then the sheet's ridges.
     - **sdf** (N×N×NZ): the strands' SDF plus the rim lip at each layer's height, four layers per draw.
   - A 1 × 1 mm box at 2 µm takes 0.5 s on this Mac.
2. **`tools/flydown/fieldprobe.js`** runs the probe from the page:
   - `FP.run(name, {uv, half, step, level})` saves through `serve.py` `POST /save/field/…` into `study/field/raw/`. This folder is untracked; a box is about 150 MB.
   - `FP.bake()` ticks the fly-down by hand until the edge maps are baked. The ropes need them, and the pane's rAF stalls while it is hidden.
3. **`study/flydown/field/mesh.py <raw>`** runs marching cubes (skimage) and writes `ground.ply`, `strands.ply` and `all.ply`, closed at the box faces, 1 unit = 1 mm, z = height above the sheet. It also writes `stats.json`.
   - It needs `/usr/bin/python3` (numpy, scipy, opencv), with `pip install --user scikit-image`.
   - **`slabs.py <raw> [µm]`** writes closed cutaway slabs through the rows with the most rope.
4. **Blender 5.2** (MCP):
   - The PLYs are read with numpy into meshes: tissue grey, strands orange.
   - Lighting: a 12° raking sun plus a weak fill, EEVEE, about 3 s a frame.
   - Renders run one at a time.

Renders: `crypt26a/renders/`. Sheet: `crypt26a/field-crypt26a-sheet.jpg`.

## Eye 26, uv (0.44, 0.59): first numbers

The box is the default fly-down: ropes, forks and tiers on, rims off (the walls are height-map cliffs).

**Ropes** (the band's strand solid that floats over the ground):
- Footprint 0.216 mm².
- Width across:
  - mid-span (more than 80 µm along the footprint from where the band still sits on the sheet): median **27 µm**, p10–p90 8–53, n = 66;
  - ends (less than 30 µm from there): median **18 µm**, 8–37, n = 2587.
- Mid / end width ratio: **1.5**. The reference has the opposite: thinnest mid-span, about 2× at the ends.
- Height (floating solid in the column): mid 10 µm, ends 20 µm.
- Caveat: in this box the bands are short, so mid-span samples are few (66).
- The reference measures 40–60 µm mid-span and 80–120 µm at the ends (`study/flydown/ref/README.md`).

**Crypt tubes** (the crypts' fine floating strands):
- Footprint 0.059 mm².
- Width 8 µm (median), height 6 µm. That is the 4 µm radius `F.tube`.

**Flakes** (6-connected pieces of the whole solid apart from the main body): **184**.

| Size | Count |
|---|---|
| under 1 000 µm³ | 133 |
| 1 000–10 000 µm³ | 42 |
| 10 000–100 000 µm³ | 9 |
| largest | about 37 000 µm³ |

- All 184 are strand pieces that touch nothing.
- A 1 µm re-probe of the central 0.5 mm finds the same count: 78 at 1 µm against 74 at 2 µm in that patch. So the flakes are in the field, not sampling breaks.

**Comb fins** on the crypt walls: 15 walls (slope above 1.5, outside bands, at least 30 µm tall).
- High-pass roughness on the wall pixels (h minus h blurred at σ 8 µm): **8.1 µm RMS**, p95 17 µm.
- In the mid-wall slice, what an opening removes:

  | Fins thinner than | Count | Share of the wall band's area |
  |---|---|---|
  | 4 µm | 38 | 0.8 % |
  | 8 µm | 86 | 2.3 % |
  | 12 µm | 88 | 4.7 % |

- The mid-wall contour is **1.20×** as long as its σ 8 µm smoothed version.
- The far wall's vertical striations show in `01-raking-34.jpg`.

## Not done here (steps 2 and 3, later)

- Metrics against the anatomy.
- Automatic fault detectors.

## Fixes from these numbers (2026-11-13, iori: "do 1 and 2, fix the flakes and the taper")

Measured on the same box, before and after (`crypt26a/` and `crypt26a-fix/`):
- `flakes.py` names the rule behind each free piece. It uses the probe's kind pass (`kind: true`), which reads `g_fdSdK` at the nearest surface.
- The probe now also writes a per-column pass (`col.f32`): distance to the band's end, sheet coverage, strand height and the band value.

### Flakes

- **Cause:** of the 184 free pieces, 145 were the crypts' fine tubes (`fdSdStrands`, kind 1), holding all the free volume. They were 200–490 µm long and cut off in mid-air, for two reasons:
  - the depth test (`-hh > 2R + 4 µm`);
  - the coverage fade (R → 0 between sheet coverage 0.3 and 0.6, still at half the crypt's depth).
- The other 39 were rope crumbs of about 3 voxels each, 800 µm³ in all.
- **Fix:** no depth test. Between coverage 0.3 and 0.45 the tube sinks to the ground; between 0.45 and 0.6 it thins away, buried. Both ends are now rooted.
- **Result:**

  | Free pieces | Before | After |
  |---|---|---|
  | 1 000 µm³ and over (visible) | 51 | 16 |
  | Their volume | 342 000 µm³ | 74 000 µm³ |

- **Left over:**
  - Small pieces went up from 133 to 402. Most are 1–2 voxels, where a strand line itself fades out mid-crypt.
  - The remaining visible tubes run along lines that end mid-crypt.

### Taper

- **Cause:** near a band's ends, the band widens, so the rope forked into a ladder of thin ropes. The ends read as thinner than mid-span, the opposite of the reference.
- **Fix:**
  - The bake adds a second channel to the band map (G): for each band texel, the distance to where the band meets the sheet (not crypt, not band). It costs one more distance transform in the worker.
  - Within 90 µm of a band's end, `fdRope` grows the rope to up to 1.7 × ropeR and stops forking. The end becomes one wide stadium running into the sheet.
  - The shader cost is one more band-map read per rope sample.
- **Result** (medians on the rope's medial axis):

  | Distance from the band's end | Width before | Width after | Floating height before | Floating height after |
  |---|---|---|---|---|
  | 0–40 µm | 21.5 µm | 34.2 µm | 18 µm | 56 µm |
  | 40–90 µm | 20.0 µm | 28.3 µm | 20 µm | 28 µm |
  | 90–150 µm | 23.3 µm | 23.3 µm | 22 µm | 22 µm |
  | 150–400 µm | 23.7 µm | 24.0 µm | 22 µm | 22 µm |

- Mid-span stays about 24 µm across. The reference measures 40–60 µm, but the width there is set by the band's own width in the photo (`bridge.png`), which the rope does not override.

### Also fixed: a load race

- **Problem:** the edge-map bake could start before the eye's band image had loaded, and its result was then kept as fresh. The band map came out empty, and the ropes quietly vanished until something forced a new bake. It happened once in this session.
- **Fix:** `rimKey` now includes `bridgeGen`, which is bumped when the band image changes, so such a bake is dropped and redone.

Renders: `crypt26a-fix/flakes-taper-before-after.jpg`.
