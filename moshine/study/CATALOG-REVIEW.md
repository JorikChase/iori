# Effect catalogue review

> **Status 2026-10-09 (M3):** every v1 row below is implemented, except the timeline objects (Mosh Cut, Bloom Insert, hold, Transform & Blend) which arrive with the timeline in M5, and audio triggers (M7). Where each reference operation lives: [coverage.md](coverage.md).

2026-10-09 · Review of the 44-row research catalogue ([research/datamoshing-techniques.md](research/datamoshing-techniques.md) §D) against the product model in [SPEC.md](SPEC.md). Each row gets a verdict: **keep**, **merge** (into another node or a parameter), **generalise**, **new** (missing from the research), or **ask** (owner decision). The wireframe's Effects window ([ux/wireframe.html](ux/wireframe.html)) lists the same rows.

## 1. Test method

Every row was checked against six questions:

1. **Does it map onto the engine primitives?** (previous output, source, field, block state, secondary source, audio features)
2. **Is it a node, a parameter of another node, or a modulator?** Duplicated parameters across nodes are a smell.
3. **Is it stateful?** Stateful nodes cost checkpoints; keep the count low.
4. **Does it belong inside the Mosh Loop, after it, or both?**
5. **Is there a user-facing name a glitch artist would recognise?**
6. **What is the minimal parameter set?** Everything else goes behind "advanced".

## 2. Verdicts

### Core loop

| Research row | Verdict | Result |
|---|---|---|
| 1 Mosh (I-frame drop) | keep | **Mosh Loop** group node. Owns `prev`. Children: field source, field ops, hold, warp, residual/refresh, in-loop artifacts, reset. |
| 2 Keyframe / Reset | keep | **Reset** child. Modes: hard, random blocks, sweep. Params: gop (0 = never), fraction, autoOnCut, **image source** (absorbs row 23). |
| 3 Bloom | keep | **Bloom** child. Params: repeat, acceleration, decay, holdSource. Gains a **trigger input** (hits, onsets, every n, manual). |
| 4 Pulse | merge | Bloom with trigger "every n frames, length c". No separate node. |
| 5 Residual paint-in | keep | **Residual** child. Luma-only default, chroma toggle. |
| 6 Intra block refresh | keep | **Intra refresh** child. sadThreshold, rate, codeThroughDCT. |
| 7 Skip / freeze | merge | Flag computed by the estimate node, `skipThreshold` lives on **Warp**. |
| 8 Lost sectors | keep | Child inside the loop *and* available as a post effect. Stateful (timers). |
| 9 Vector mismatch | merge | `mismatchRate` parameter on **Field ▸ Noise**. |
| 25 Scene-cut auto-mosh | merge | `sceneCut` on the estimate node plus `autoOnCut` on Reset. |
| 26 Runaway / fluid | merge | `matchAgainst: source | output` on the estimate node. |
| — | **new** | **Mosh Cut**: a transition object placed at a join between two media clips. Semantics: keep A's last output as history, estimate the field on B, no reset. The most common datamosh in the wild is exactly this and it deserves a first-class timeline object, not a hidden Reset setting. |

### Field (motion vector) operations

| Research row | Verdict | Result |
|---|---|---|
| 10 Pan / add | keep | **Field ▸ Pan** |
| 11 Multiply / axis kill | keep | **Field ▸ Multiply** (gx, gy). Replaces legacy "Motion multiplier". |
| 12 Spatial gain fields | keep | **Field ▸ Spatial gain**, one node with a `type` select (ramps, sin/cos envelopes, tapered, mirror). |
| 13 Synthetic fields | keep | **Field ▸ Synthetic** (zoom, zoomSin, rotate, shear, slam), `blend` with the estimated field. |
| 14 Temporal average | keep v2 | Needs a ring of fields. Stateful. |
| 15 Spatial average | keep | **Field ▸ Smooth** (radius). Replaces legacy "Vector smoothing". |
| 16 Gravity | keep v2 | Stateful accumulator. |
| 17 Selective amplify | keep | Needs a per-frame histogram reduction. v1 with percentile computed on a 1/4-res field. |
| 18 Random damage | keep v2 | A macro that drives other field ops; ships once they are stable. |
| 19 Noise / diffusion | keep | **Field ▸ Noise** (amplitude, granularity, coherence, mismatchRate). Replaces legacy "Vector noise". |
| 20 Quantise / precision | merge | `pel` on **Warp**. |
| 21 Sort | keep v2 | Row sort in compute. |

### Sources and masks

| Research row | Verdict | Result |
|---|---|---|
| 22 Motion transplant | keep | `source2` input on the estimate node. "Motion Hijack" template. |
| 23 Still as I-frame | merge | Reset's image source. |
| 24 Mosh map | generalise | Any parameter can be modulated by a layer's luminance ("map" modulator). Not a per-effect feature. |
| — Optical flow | keep | `method: block | flow` on the estimate node (D7). |

### Codec artifact passes

| Research row | Verdict | Result |
|---|---|---|
| 27 DCT quantise | keep | In-loop child or post effect. Replaces legacy "Compression Q". |
| 28 DCT coefficient glitch | keep v2 | |
| 29 Fake DCT stripes | keep | Cheap, inside the loop (Kino style). |
| 30 Chroma subsampling | keep | |
| 31 Deblocking | keep | Defines the "H.264 soft" style. |
| 32 Posterise | keep | |

### Adjacent glitch

| Research row | Verdict | Result |
|---|---|---|
| 33 Pixel sort | keep v2 | GPU row sort; segments ≤ 2048 px. |
| 34 Slit-scan | keep v2 | Frame ring; stateful. |
| 35 Echo / trails | keep | Stateful but trivial. |
| 36 Frame blend | keep v2 | |
| 37 Displacement by motion | keep | Non-recurrent smear. |
| 38 Block drag | keep | |
| 39 Slice tear / interlace | keep | |
| 40 RGB split | keep | |
| — | **new** | **Dither** (ordered, Floyd–Steinberg, blue noise). The site already has a dither study page; artists pair dither with mosh constantly. v2. |
| — | **new** | **Analog** (VHS tracking, CRT, scanlines, tape dropout). Adjacent family, v2. |

### Utility (missing entirely from the research)

| Need | Verdict | Result |
|---|---|---|
| Different source sizes and aspect ratios on one timeline | **new v1** | **Transform & Blend** intrinsic on every media clip: position, scale, rotation, opacity, blend mode, fit/fill. Without it "Image on Video" cannot place a still over a clip. |
| Looks and masks | **new v1** | **Basic colour**: levels, invert, hue/sat, threshold. Tiny set; no grading. |
| Mattes from content | new v2 | **Luma / chroma key → matte** output usable as an effect input. |
| Procedural sources | new v2 | **Generator clips**: solid, gradient, noise, text, and later automata from the house catalogue as a source. |

### Modulation and time

| Research row | Verdict | Result |
|---|---|---|
| 41 Audio-reactive | keep | A **modulator type**, not an effect. Continuous (RMS, band) and **trigger** (onset). |
| — | **new** | **Trigger modulators**: onset, every n frames, mosh-hit markers, manual. Drive Bloom, Reset, Random damage. The research only had continuous modulators. |
| — | **new** | **Mosh hits**: a marker type placed with H while playing. The fastest way to "perform" a mosh on the timeline. |
| 42 Frame-order ops | keep v2 | Timeline-level commands on a clip (reverse, shuffle, jiggle). |
| — | keep | **Hold / freeze** clip property (v1). Bloom Insert uses it. |

### Opt-in

| Research row | Verdict |
|---|---|
| 43 Authentic bake | keep v3 (ffmpeg.wasm worker). |
| 44 WebCodecs bitstream mosh | keep v3, browser-dependent, feature-detected. |

### Resolved (2026-10-09)

| Candidate | Decision |
|---|---|
| **Live mode**: camera or screen capture as a source, live audio features, fullscreen or second-window output | v2 (milestone 10), designed for now: nodes take their frame from a Clock object, never from the timeline. |
| **MIDI / OSC control** of parameters and triggers | v2 with live mode; an `external` modulator type is reserved in the schema now. |

## 3. Node count after review

| | v1 | v2 | v3 |
|---|---|---|---|
| Stateful nodes | Mosh Loop, Bloom, Lost sectors, Echo | Temporal average, Gravity, Slit-scan, Frame blend | Authentic bake, Bitstream mosh |
| Stateless nodes | 19 | 9 | 0 |
| Modulators | LFO, Noise, Random hold, Audio continuous, Trigger (onset / every n / hits / manual), Map | Macro, Step sequencer, Expression | |

Four stateful nodes in v1 keeps the checkpoint budget small.

## 4. Parameter conventions adopted

- Block size 4 / 8 / 16 / 32, default 16. Motion gain 0–2, default 1. Hold, GOP and repeat counted in frames.
- Four macro knobs on every Mosh Loop: entropy, intensity, blend, threshold.
- Every random decision hashes `(globalSeed, effectSeed, blockId, frameIndex)`.
- Style presets: Xvid classic (default), H.264 soft, Packet loss, Fluid, Bloom.

## 5. Gaps still open

1. Mosh Cut semantics when the two clips differ in size: resample B's field to A's grid, or force Transform & Blend first.
2. Whether Lost sectors inside the loop and as a post effect should be one node with a placement flag or two nodes.
3. The "map" modulator reads a layer; which layers are legal sources (any lower channel, only matte channels, or any media)?
4. ~~Live mode and MIDI~~ resolved: v2, designed for now.
