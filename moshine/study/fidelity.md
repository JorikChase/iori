# Fidelity bench — MOSHINE vs a real MPEG-4 ASP mosh

2026-10-09 · M2 · spec §1.1 (definition of state of the art), §12.5 · decision D30

## What is measured

Both pipelines start from the same 8-bit source pixels (320×176, 16-aligned).

- **Reference:** FFmpeg 8.0.1's native `mpeg4` encoder at fixed qscale 4, `-g 9999 -bf 0`, an I-frame forced at the
  scene cut. `tools/mvtool.c`, built against the same libavcodec, decodes it three ways: clean (with exported motion
  vectors), **mosh** (every I-frame after the first dropped), **bloom** (the mosh plus packet cut+5 fed 21 times).
- **Simulation:** the Mosh Loop on the CPU reference, which is bit-identical to the GPU (D28; the harness row
  `fidelitySets` replays every set on the GPU and matches the bench's SSIM to within its 4-decimal rounding). The loop's
  I-frame is the last scene-A frame; the cut frame is a dropped I-frame; each later step takes the source frame of the
  packet the real decoder used, so duplicated packets are held frames with the bloom holding the trigger's field and
  re-applying its residual.
- **Scores:** SSIM-8 and PSNR on BT.601 luma against the real decode, frame by frame, for 60 frames after the cut.
  Two baselines every simulation must beat: **frozen** (the last A frame: "nothing moves") and **clean** (B decoded
  normally: "no mosh"). Win rate = frames where the simulation beats both.
- **Vectors:** the estimator against the encoder's own exported vectors on the clean stream; intra agreement.
- Inputs: the `cut` fixture (colour bars, then a panning texture with a moving square; exact motion known) and
  `tests/media/cut.mp4` (testsrc2, then a zooming Mandelbrot; `tools/make-media.sh`).

```bash
sh moshine/tools/build-mvtool.sh && sh moshine/tools/make-media.sh
node moshine/tools/fidelity.mjs --tag <tag>            # exits non-zero if a budget fails
node moshine/tools/fidelity.mjs --tag <tag> --sweep    # coordinate ascent over the parameters below
```

Outputs: `ref/fidelity-<tag>.json`, contact sheets `tests/media/fidelity/<input>/sheet-<scenario>.png`
(columns: ours, real, frozen, clean; rows 1, 5, 15, 30, 60 frames after the cut), and lab sets for Lab ▸ Fidelity.

## Results (ref/fidelity-m2.json, default preset "Xvid classic")

| Input · scenario | SSIM ours / frozen / clean, frames 0–10 | frames 10–30 | Win rate |
|---|---|---|---|
| fixture · mosh | **0.908** / 0.357 / 0.189 | **0.851** / 0.270 / 0.280 | 100 % |
| fixture · bloom | **0.907** / 0.355 / 0.151 | **0.844** / 0.252 / 0.124 | 100 % |
| clip · mosh | **0.726** / 0.518 / 0.485 | **0.659** / 0.345 / 0.469 | 100 % |
| clip · bloom | **0.713** / 0.518 / 0.473 | **0.517** / 0.328 / 0.331 | 100 % |

Vectors: on the fixture 98.9 % of our vectors equal the encoder's (and both equal the true motion); on the clip
52.8 % are equal, median error 0, 90th percentile 3.9 px (smooth Mandelbrot gradients, where many vectors are equally
good and the encoder's EPZS predictors choose differently).

## What the bench taught us

The sweep objective is the mean SSIM of frames 0–10 and 10–30 over both inputs (mosh scenario).

| Step | Objective | Finding |
|---|---|---|
| Xvid classic as built in M1 (nearest, no residual) | 1.332 | Smears correctly but looks flat: the real mosh is not just moved pixels. |
| + bilinear half-pel sampling | 1.403 | The codec interpolates half-pel positions by averaging; nearest is the wrong kernel. |
| pel 1 instead of 2 | 1.343 | Half-pel motion matters. |
| λ 0 / 0.006 instead of 0.002 | 1.385 / 1.382 | The M1 coherence penalty is at its optimum. |
| detail residual (M1 model) | 1.369 | Worse than none. |
| **codec residual, dead zone 0.03** | **1.572** | The decisive term: a real P-frame is motion compensation **plus B's residual**, and that residual painted onto A is the ghost of the new shot showing through the smear. Modelled as `pred + quantise(src − warp(prevSrc, field))` with a dead zone (D31). |
| intra refresh by mad threshold | no gain | The encoder's intra decisions (255 of ~39 k blocks on the clip) do not follow our mad threshold (recall 0). |

The first sweep also exposed a semantic bug: at a detected cut the code stage added the cut frame's residual and
intra blocks, repainting B and undoing the mosh. A cut that is not honoured is now a **dropped I-frame**: no motion,
no residual, no intra (D32).

## H.264 (M3, ref/fidelity-m3-h264.json)

`node moshine/tools/fidelity.mjs --codec h264` encodes with libx264 at constant QP 24, one reference frame, no
B-frames and an IDR at the cut, and scores the mosh scenario (duplicated H.264 packets repeat `frame_num`, so the
decoder drops them; no bloom scenario). Default preset: "H.264 soft".

| Input · scenario | SSIM ours / frozen / clean, frames 0–10 | frames 10–30 | Win rate |
|---|---|---|---|
| fixture · mosh | **0.798** / 0.306 / 0.187 | **0.723** / 0.247 / 0.279 | 100 % |
| clip · mosh | **0.539** / 0.442 / 0.418 | **0.688** / 0.394 / 0.568 | 83 % |

The H.264 sweep (objective as above, mosh scenario, both inputs):

| Variant | Objective |
|---|---|
| Xvid classic | 1.363 |
| + quarter-pel (H.264 soft) | **1.374** |
| block 8 | 1.349 |
| + in-loop deblock (best of 3 settings) | 1.344 |
| + deblock + DCT 85 / 60 | 1.262 / 1.209 |

The first "H.264 soft" (block 8, in-loop deblock and DCT) scored 0.70 / 0.56 on the fixture, clearly below Xvid
classic on the same x264 reference, so it was renamed "Soft deblocked" and kept as a creative look (D34). Real x264
moshes are smoother than ours and drift toward B's colours faster; x264's deblocking (boundary strength from vectors
and residual, alpha/beta tables by QP) is the next thing to model.

## Budgets

`tools/fidelity-budgets.json` holds floors for the default preset; `fidelity.mjs` fails when one is broken. Raise them
when the simulation improves.

| Input · scenario | SSIM 0–10 ≥ | SSIM 10–30 ≥ | Win rate ≥ |
|---|---|---|---|
| fixture · mosh | 0.89 | 0.83 | 0.98 |
| fixture · bloom | 0.89 | 0.82 | 0.98 |
| clip · mosh | 0.71 | 0.64 | 0.95 |
| clip · bloom | 0.70 | 0.50 | 0.95 |
| H.264: fixture · mosh | 0.78 | 0.70 | 0.98 |
| H.264: clip · mosh | 0.52 | 0.67 | 0.80 |

## Open threads

1. **Intra decision model.** Replace the mad threshold with the encoder's rule (inter cost vs the block's own
   deviation from its mean, plus a bias); measure recall and precision against the exported intra blocks.
2. **Bloom, frames 10–30 on real footage (0.517)** is the weakest number: real duplicates compound residual and
   quantisation each pass. Try residual decay and per-duplicate requantisation.
3. **Vector agreement on smooth content.** Add the encoder's predictor set (left, top, top-right of the current frame,
   EPZS) as a second matcher mode and see whether agreement and SSIM rise together.
4. **More inputs and qscales.** Real camera footage with grain, q 2 and q 8 (high and low bitrate), x264 at other QPs.
6. **x264 deblocking model** (see the H.264 section) and H.264 intra prediction for the intra blocks.
5. **Cost measurements need a quiet machine.** Wall-clock T4 numbers rose from 14 to ~110 ms per 1080p frame while
   other GPU users were active (the M1 commit measured the same); switch T4 to timestamp queries.
