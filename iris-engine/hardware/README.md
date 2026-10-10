# iris-engine/hardware — the capture rig

The rig exists to give the fitter **several views of the same iris that disagree exactly where depth is**: a
parallax sweep (known angles), a focus stack (absolute height), single-flash frames from known directions (tube
profile, cast shadows under bridges), one NIR frame, and two pupil states. The engine's job is to explain all of
them at once; the rig's job is to make the disagreement large against the measured noise floor.

Research and the numbers behind every choice: `../study/12-3d-capture-and-synthesis-sota-2026.md` (§3 instruments,
§5 algorithm, §6 P1 parallax floor, §7 prices, §8 print-first). This folder is the build.

## What we have

- Camera: **Fujifilm X-T2** (APS-C 23.6 × 15.6 mm, 6000 × 4000, 3.9 µm pitch, 14-bit RAF, PC-sync port, 2.5 mm
  remote port, interval timer, electronic shutter, X Acquire tethering).
- Printer: **FDM, Prusa-compatible, ASA** (0.4 mm nozzle assumed; 0.1–0.2 mm layers). No resin printer yet — a resin
  printer is planned later, and only one part (the 1:1 phantom) waits for it.
- CAD: Blender on this machine → `gen/` is a Blender Python generator, every dimension a parameter, STL out.

## The measurement, and what fixes its numbers

| quantity | value | where it comes from |
|---|---|---|
| noise floor of dense flow on iris texture | **0.2 px** | P1 control pair, study/12 §6 |
| wanted signal for a 150 µm bridge | ≥ 2 px (10× floor) | — |
| object sampling at 2× on the X-T2 | 2.0 µm/px, 11.8 × 7.9 mm field | pitch / magnification |
| parallax needed | ≥ 4 µm → **≥ 1.5° of view angle** | Δz · θ |
| planned sweep | ±12° in 2° steps → 16 px at the ends | arc / fixation arc |
| depth of field at 2×, f/5.6 nominal (f/17 effective) | ≈ 0.2 mm | focus step 0.1 mm, 8–10 slices over the iris bow |
| diffraction at 2×, f/17 effective | ≈ 11 µm on the iris | fine for 30–60 µm strands |
| eye rotation vs camera arc | equivalent for Δz·θ; the arc has a known angle, fixation ±0.5° | both kept |

## Scale invariance — why the first phantom is 10× and needs no macro lens

Parallax angles, focus geometry and refraction are scale-free. A phantom printed at **10× (120 mm iris)** photographed at
0.2× with a plain 50 mm lens at ≈ 30 cm gives 20 µm/px, which is *exactly* 2 µm/px at 1:1. Bridges of 100 µm become 1 mm,
crypts 1–3 mm deep, strands 0.5 mm wide — all printable on a 0.4 mm nozzle. The cornea at 10× is a 78 mm-radius shell; a
bought **150 mm acrylic hemisphere (≈ 75 mm radius, 3 mm wall) filled with water** has front power (1.49−1)/75 mm = 6.5 D,
back power (1.333−1.49)/72 mm = −2.2 D, net ≈ 4.3 D — the real cornea scaled by 10 is 43/10 = 4.3 D. So the 10× phantom
tests the refraction correction too. Everything (arc or turntable, focus stack, flash directions, reconstruction, the
comparison against known geometry) is proven at 10× with the kit lens **before a single macro part is bought**.

## Parts (see `prints/` for each print's spec, `BOM.md` for what is bought)

| # | part | printed / bought | needed for |
|---|---|---|---|
| P1 | stepped relief target (0.1 / 0.2 / 0.4 / 0.8 mm; and a 10× version) | print | focus and parallax scale calibration |
| P2 | **phantom 10×**: engine tissue model at 120 mm, bridges, crypts, sheet; water-filled acrylic dome; turntable base with 2° detents | print + bought dome | end-to-end proof without a volunteer |
| P3 | extension tube 2× / 3× with knife-edge baffles, M42 male at the camera end, clamp socket for a 40.5→58 step-up ring at the lens end | print + adapter + step ring | the 1:1 optics |
| P4 | corneal shroud: matte cone lens → 15 mm short of the eye, two flash ports, polariser index marks | print | kills the room's reflection in the cornea (P1's finding) |
| P5 | chin rest + forehead bar, rack-adjustable, keyed to the bench | print + 2 M8 rods | subject at the tube's focus every session |
| P6 | fixation arc: LEDs at 0°, ±3°, ±6°, ±9°, ±12° of gaze, 1 m from the eye is not needed — 300 mm with a printed arc | print + LEDs | known eye rotation → parallax |
| P7 | flash arc: 8 detent positions at 45° azimuth, 30° elevation; polariser film holder with index | print | multi-flash photometric stereo with one speedlite |
| P8 | focus axis: 8 mm rods + LM8UU + M8 (1.25 mm/turn, printed knob with 10 detents = 0.125 mm) — or Tr8×2 + NEMA 17 + ESP32 firing the 2.5 mm remote | print + rods + bearings (+ stepper) | focus stack |
| P9 | camera arc (optional after P6): radius = working distance, detents every 2° over ±12° | print | known-angle parallax when fixation is not enough |
| P10 | bench: 2020 extrusion or a printed keyed baseplate that P3/P5/P7/P8 lock into | print + extrusion | repeatability |
| R1 | phantom 1:1 in resin under a clear resin dome (7.8 mm) | **waits for the resin printer** | microscope-scale test |

## FDM / ASA rules that the generator bakes in

- Shrinkage ≈ 0.6 %: scale 1.006 in the slicer, or the generator emits a `shrink` parameter; enclosure on, no draft.
- Threads: **M42 × 1** prints fine at 0.12 mm layers (chase with the adapter). **Filter threads (0.5 / 0.75 mm pitch)
  do not** — every lens interface is a bought step ring held in a printed clamp socket with three M3 grub screws.
- Optical black: ASA black is ≈ 5 % reflectance; baffle edges are knife edges (0.4 mm single wall), and the tube
  interior gets flocking paper or matte black spray where the shroud faces the eye.
- Bridges in the 10× phantom: 1 mm wide × 3 mm span print as pure bridging in ASA at 0.1 mm layers with the part
  fan up; longer spans get sacrificial supports designed by the generator, not by the slicer.
- Detents: printed ball-and-groove with a 6 mm steel ball + spring, or a spring-loaded printed pawl — both give
  repeatability of ≈ 0.2°; the angle itself comes from the printed geometry.
- Tolerances: 0.2 mm clearance on sliding fits, 0.0 on press fits, LM8UU housings at 15.0 mm.

## Order of work

1. **P1 + P2** (stepped target, 10× phantom, turntable) and the 50 mm kit lens: run the sweep, the focus stack and the
   flash positions; reconstruct offline in Python; compare to the exported geometry. This is the proof of the
   algorithm, with zero macro optics and zero volunteers.
2. **P3 + P1** with a used EL-Nikkor 50 (or Laowa 65): confirm 2 µm/px and the 1:1 depth of field on the stepped target.
3. **P4 + P5 + P6**: first human eye (second person needed — manual focus at 2× cannot be done on one's own eye),
   written consent, ISO 15004-2 sheet for the actual flash power and distance.
4. **P7 + P8**: photometric stereo and the focus stack on the eye.
5. **P9 / P10** when repeatability, not signal, is the limit.
6. **R1** when the resin printer arrives.

## Open

- Does the shop have the XC 50-230 (Raynox DCR-250 on it reaches ≈ 1.8× at 125 mm working distance with autofocus —
  the cheapest 1:1 optics if so)?
- Who is the first subject.
- Tube length is set once the actual lens is in hand (reversed 50 mm: extension ≈ f·(1+m), working distance ≈ f·(1+1/m)).
