# Landscape analysis step 2: the fly-down against the anatomy (2026-11-13)

iori: "please proceed with the next steps". This is step 2 of IORI MASTER's landscape-analysis plan: the field the renderer draws, measured against the references in `study/flydown/ref/README.md`.

## Method

- Three eyes (26, 09, 35), three boxes each, 0.8 × 0.8 mm at 2 µm.
- The fly-down at its defaults after `e17b26b`: rooted tubes, flared rope ends.
- The boxes were picked by `FP.pick`: the boxes that best combine band area and crypt area (crypt share capped at a half), not overlapping.
- Each box was probed with kind and column passes (`FP.run(…, {kind, col})`).
- Crypt areas come from the whole eye's baked crypt map (`FP.crypts`). That map is the layer model's measurement of the photograph, so this column checks the input, not the renderer.
- Numbers come from `study/flydown/field/scorecard.py`. Per-box values are in `scorecard.json`, and the table is in `scorecard.md`.

## Results

| | Rope width mid-span (ref 40–60 µm) | Rope width at the ends (ref 80–120 µm) | End / mid (ref ~2×) | Floating height mid / end | Rope spacing (ref 150–250 µm) | The eye's crypts in the ref area range (0.015–0.3 mm²) | Visible free flakes per box | Wall fins under 8 µm, per mm of wall |
|---|---|---|---|---|---|---|---|---|
| Eye 09 | 16.5 (low) | 37.9 (low) | 2.3 ✓ | 14 / 42 | 278 (high) | 77 of 117 (median 0.035) | 9.7 | 4.4 |
| Eye 26 | 20.0 (low) | 40.0 (low) | 2.0 ✓ | 18 / 58 | 179 ✓ | 76 of 126 (median 0.079) | 14.7 | 8.1 |
| Eye 35 | 12.6 (low) | 29.1 (low) | 2.3 ✓ | 10 / 46 | 161 ✓ | 120 of 168 (median 0.034) | 8.7 | 5.1 |
| All 9 boxes | 16.5 (low) | 36.2 (low) | 2.2 ✓ | 14 / 46 | 192 ✓ | 273 of 411 (median 0.042) | 11.0 | 5.2 |

## What it says

1. **The taper's shape is right, but the ropes are 2.5–3× too thin everywhere.**
   - Mid-span is 13–20 µm against 40–60 µm; the ends are 29–40 µm against 80–120 µm.
   - The width comes from the band's half-width in the band map (`bridge.png` above 0.42), capped at ropeR = 28 µm. The photo's bands are narrower than the bridges the reference measures.
   - A fix means a rope wider than its band: overhanging the crypt on both sides, or a minimum radius. That is a visual choice for iori.
2. **Rope spacing is right** for eyes 26 and 35. Eye 09's ropes sit further apart (278 µm).
3. **Crypt areas are mostly in range.** Two-thirds of the crypts lie in Tan's 0.015–0.3 mm² range.
   - About 45 are larger, up to 4 mm². Most are likely neighbouring crypts merged in the map: a band lies inside its crypt in the layer model, so crypts joined by bands count as one.
   - This is the input, not the renderer.
4. **Faults left after the flake fix:**
   - about 11 visible free strand pieces per 0.64 mm² box (tubes along strand lines that end mid-crypt);
   - about 5 wall fins thinner than 8 µm per mm of crypt wall (the comb; rims are off).

## Not done

- Step 3, the automatic fault detectors, has not been started. Faults 4 and fins are its natural first checks.
- Fine-fibre counts per bundle (ref 3–6, at most 20–25 µm each) are not measured. The probe's 2 µm step resolves 8 µm tubes, but not a count per bundle.

## Thicker ropes (2026-11-13, iori: "Yes, thicken them")

**Change:** the rope's radius cap `ropeR` goes from 28 to 36 µm. It is a setting, so the shader stays the same size.

**Measure:** a rope **core** is a vertical run of floating rope solid of 20 µm or more. The loose fibres between ropes are at most 18 µm. The footprint width used before mixed the two, so it under-read the ropes. Same 9 boxes, before (`scorecard-before.md`) and after (`scorecard-after.md`):

| | Core mid-span (ref 40–60 µm) | Core at the ends (ref 80–120 µm) | Visible free flakes per box |
|---|---|---|---|
| Before (cap 28) | 30 µm | 50 µm | 11.0 |
| After (cap 36) | 36 µm | 54 µm | 11.4 |

### Not reaching 40–60

Mid-span is limited by the band's own width in the photo, not by the cap. A rope's radius is min(band half-width, cap). With a 44 µm cap, eye 35 stayed at 30 µm mid-span. The cap changes nothing where the band is narrower than the rope.

Getting past that means a rope wider than its band. This was tried and **not kept**:
- **What:** a 24 µm minimum radius. The rope overhung the crypt beside a narrow band, and took the band's top from a baked band-top map so it did not drop to the crypt floor.
- **Why dropped:**
  - Rope cores came out the same as without it (36 µm mid-span on three boxes).
  - The overhang's cut-off edges left new floating rope pieces: 16 per box against 12 without it.
  - It cost two more map reads per rope sample.
- **Recoverable:** the code is in the session scratchpad only; the bake (a box mean of band heights) and the shader changes are described here.

### The Metal compiler limit, eased

- The walk variant's surface normal evaluated the strand field four times, and every copy was inlined.
- It is now a loop whose bound is a uniform (`u_fdFour` = 4), so the compiler cannot unroll it: one copy instead of four. The probe's per-layer loop does the same.
- This is what made room. Before, two more map reads in `fdRope` crashed the compiler (XPC_ERROR_CONNECTION_INTERRUPTED), and that took WebGL down in the Browser pane for that origin.
- **Test without risk:** compile in headless Playwright WebKit (on this Mac it uses the same Metal compiler) before loading in the pane. The scripts used were `wk-compile.cjs` and `wk-variant.cjs` in the session scratchpad. `tools/flydown/webkit-probe.cjs` is the committed relative.

`thick-ropes-section.jpg` shows a section across a band on eye 26, before and after.
