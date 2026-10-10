# Datamoshing techniques: bitstream reality, tool survey, pixel-space simulation, and an effect catalog for DATAMOSHINE

Status: research document (2026-10-09). Feeds the engineering spec for the DATAMOSHINE effect library.
Scope: how codec moshing really works, what existing tools expose, how pixel-space emulations are built, and a parameterised catalog of effects that fit a recurrent "previous output + motion field" WebGPU engine.

Engine context assumed throughout: motion is estimated per 16x16 block by GPU block matching (optionally refined to dense optical flow); the previous *output* frame is warped by the field and the residual is omitted; codec artifacts are separate passes; an optional ffmpeg.wasm "authentic bake" may exist.

---

## A. How codec moshing works at the bitstream level

### A.1 The decoder loop that every mosh exploits

A hybrid block codec reconstructs an inter frame as

```
F_t(x,y) = F_ref(x + mv_x(x,y), y + mv_y(x,y)) + residual_t(x,y)
```

where `F_ref` is a previously *reconstructed* picture (not the encoder's source), `mv` is one vector per block (or sub-block), and `residual` is a quantised transform-coded correction. I-frames (keyframes) reset the state; P-frames predict from earlier frames; B-frames predict from both directions. This formulation is given explicitly by the datamosh-glitch-studio README ([NullAITech](https://github.com/NullAITech/datamosh-glitch-studio)) and by Niccolò Fanton's Codrops article, which states the whole effect as `new frame = warp(previous frame, motion vectors) + residual` ([Codrops](https://tympanus.net/codrops/2026/09/02/breaking-the-frame-building-a-real-time-datamosh-effect-with-three-js/)).

When the reference is wrong the decoder has no way to know: Wikipedia's compression-artifact article notes that after bitstream damage "decoders continue to apply updates to the damaged picture for a short interval, creating a 'ghost image' effect, until receiving the next independently compressed frame" ([Wikipedia: Compression artifact](https://en.wikipedia.org/wiki/Compression_artifact)). Datamoshing is the deliberate exploitation of that behaviour.

### A.2 The three classic bitstream operations

| Operation | What is done to the file | What the decoder does | Resulting look | Sources |
|---|---|---|---|---|
| **I-frame removal ("transition" / "melt")** | Delete the keyframe at a cut (or every keyframe after the first). | P-frames of shot B apply their motion vectors and residuals to the last reconstructed picture of shot A. | Pixels of the old shot are dragged along the motion of the new shot; the residual slowly "paints in" the new shot's detail where blocks are intra-coded or where residual energy is high. Persists until the next surviving I-frame. | [glitchology](https://glitchology.com/datamoshing/), [Epidemic Sound](https://www.epidemicsound.com/blog/how-to-datamosh/), [Wikipedia](https://en.wikipedia.org/wiki/Compression_artifact) |
| **P-frame duplication ("bloom")** | Copy one P-frame (ideally one with strong motion) and paste it N times (20–50 is the usual range). | The same motion vectors + residual are applied repeatedly to an ever more displaced picture. | Motion continues in the same direction with no new content: pixels extrude, flare, "bloom" along the vector field, edges stretch into streaks; residual energy accumulates into saturated/blown-out colour. | [glitchology](https://glitchology.com/datamoshing/), [moshy pdupe/ppulse](https://github.com/GlitchTools/moshy), [tomato bloom/pulse](https://github.com/itsKaspar/tomato) |
| **Frame transplant / hijack between videos** | Replace one video's I-frame (or a run of P-frames) with another's bytes. Parker Higgins' automosh replaces "I-Frames with other I-Frames ... copying and pasting the bytes from one into the place of another, truncating or padding out the data so it fits exactly". | Motion from stream B is applied to picture content from stream A. | "All the motion from one video over all the stills of another". Caveat from the same source: P-frames "blend those two types of data together", so the texture of B leaks in via residuals. | [parkerhiggins.net](https://parkerhiggins.net/2017/07/making-mosh-ups-automated-datamoshing-from-multiple-video-sources/), [automosh.py](https://github.com/thisisparker/automosh/blob/master/automosh.py), Datamosh 2 "Swap Motion" ([aescripts](https://aescripts.com/datamosh/)) |

Secondary structural operations seen in tools (all re-orderings of the frame list in an AVI `movi` chunk, done without re-encoding by tomato.py):

- `random` (shuffle frame order), `reverse`, `invert` (swap each consecutive pair), `bloom` (duplicate frame n, c times), `pulse` (duplicate groups of c P-frames every n frames), `overlap` (copy groups of c frames taken from every n-th position, e.g. `[1 2 3 4 3 4 5 6 5 6 7 8 ...]`), `jiggle` (take frame from a Gaussian neighbourhood around current position), plus `-k` "kill frames with too much data" (default 0.7 of max frame size, which is how tomato detects and drops I-frames without parsing the codec) ([tomato README + source](https://github.com/itsKaspar/tomato)).
- Vegas-Datamosh / Otomad Helper adds **Datamix**: "replaces the first I-frames of a clip by a frame of another clip", i.e. a still image or other clip is used as the I-frame and the selected clip's P-frames run on top of it ([otomadhelper](https://otomadhelper.readthedocs.io/v4/mosh.html)).

### A.3 Preparing a "moshable" stream

Every tool first re-encodes to a stream with as few I-frames and no B-frames as possible:

- Avidemux recipe: MPEG-4 ASP (Xvid4), max I-frame interval "fill the field with 9s", B-frames 0, 3000–8000 kbps, AVI muxer; then reopen in *Copy* mode and delete I-frames / paste P-frames. "Avidemux can crash when pasting many frames ... paste in batches of 10" ([glitchology](https://glitchology.com/datamoshing/)).
- ffmpeg equivalent: `ffmpeg -i in.mp4 -c:v mpeg4 -vtag xvid -qscale:v 4 -g 9999 -bf 0 -an out.avi` (`-g` = GOP length, `-bf 0` disables B-frames) ([glitchology](https://glitchology.com/datamoshing/)).
- ffglitch's recommended encoder line for motion-vector work: `ffgac -i IN -vcodec mpeg4 -mpv_flags +nopimb+forcemv -qscale:v 1 -fcode 6 -g max -sc_threshold max` ([ffglitch-scripts tutorial](https://github.com/ramiropolla/ffglitch-scripts/blob/main/tutorial/readme.md)). `nopimb` suppresses intra macroblocks in P-frames, `forcemv` forces every block to carry a vector, `-fcode 6` widens the legal vector range, `-sc_threshold max` disables scene-cut keyframe insertion. These are exactly the conditions under which a mosh is "pure" motion: no intra patches, no missing vectors.
- Supermosh (browser) pre-encodes with libx264 at `-g 99999999 -bf 0 -flags:v +cgop -crf 15` so that the decode sequence contains exactly one keyframe per clip ([supermosh src/lib.ts](https://github.com/supermosh/supermosh.github.io/blob/main/src/lib.ts)).
- Why B-frames are removed: moshy's `prep` mode converts "into an AVI with no B-Frames (they're not good for moshing), and placing as few I-Frames as possible" ([moshy](https://github.com/GlitchTools/moshy)). B-frames reference *future* pictures, so deleting a keyframe breaks their backward reference too and decoders frequently refuse or conceal them.
- "Baking": after moshing, re-encode the decoded output so the glitch becomes real pixel content (moshy `bake`; glitchology's final x264 pass). The bake is what makes the result playable on YouTube, and is also the operation that an ffmpeg.wasm "authentic bake" in DATAMOSHINE would perform.

An FFmpeg-native keyframe-dropping bitstream filter was proposed in May 2024: `datamosh` bsf with a single `target` option, "positive values: drop the nth keyframe ... non-positive values: allow the first n keyframe(s) to pass through, then drop all subsequent keyframes" ([ffmpeg-devel patch](https://ffmpeg.org/pipermail/ffmpeg-devel/2024-May/326858.html)). It was a patch submission, not necessarily merged; treat as a reference for semantics, not a dependency.

### A.4 Why different codecs mosh differently

The mosh look is the sum of (a) the prediction structure, (b) the in-loop filters that are applied to the *reference* picture, (c) intra tools that inject fresh content, and (d) decoder error concealment. Codec facts below are from the respective Wikipedia articles unless noted; the "mosh consequence" column is inference from those facts.

| Codec | Block / partition structure | Vectors | In-loop filtering | Intra tools | Error resilience / concealment | Mosh consequence |
|---|---|---|---|---|---|---|
| **MPEG-4 Part 2 (Xvid/DivX, ASP)** | Fixed 16x16 macroblocks, optionally 4 x 8x8 vectors ("4MV"); 8x8 DCT ([Wikipedia MPEG-4 Part 2](https://en.wikipedia.org/wiki/MPEG-4_Part_2), [ffglitch MPEG-4 features](https://ffglitch.org/docs/0.10.2/features/mpeg4/)) | Half- or quarter-pel; range `±(1<<(4+fcode))` ([ffglitch](https://ffglitch.org/docs/0.10.2/features/mpeg4/)) | **None in-loop**: "lacks an in-loop deblocking filter" with only optional post-processing ([Wikipedia](https://en.wikipedia.org/wiki/MPEG-4_Part_2)) | Intra DC/AC prediction; GMC (global motion compensation) in ASP | Resync markers, data partitioning, RVLC | The canonical mosh: hard 16x16 (or 8x8) tiles slide as rigid slabs; block boundaries stay sharp forever because nothing smooths the reference; error accumulates visibly. This is why every tool (Avidemux, moshy, tomato, Datamosher Pro, ffglitch, Datamosh 2 via ffglitch) defaults to it. |
| **MPEG-2** | 16x16 MBs, 8x8 DCT | Half-pel, range `±(1<<(3+fcode))` ([ffglitch MPEG-2 features](https://ffglitch.org/docs/0.10.2/features/mpeg2/)) | None | Minimal | Slices | Same family as Xvid; ffglitch exposes q_dct, q_dc_delta, qscale, mv, mb for it, so DCT-level glitching is richest here. |
| **H.264 / AVC** | 16x16 MB with partitions down to 4x4; 4x4/8x8 integer transform ([Wikipedia AVC](https://en.wikipedia.org/wiki/Advanced_Video_Coding)) | Quarter-pel, up to 16 reference frames, B-frames usable as references | **Mandatory in-loop deblocking** on every 4x4 transform edge, boundary strength 0–4, adjusts up to 3 px each side ([forasoft](https://www.forasoft.com/learn/video-quality/glossary/terms-vqm/deblocking-filter), [Wikipedia](https://en.wikipedia.org/wiki/Advanced_Video_Coding)) | 9 directional modes for 4x4, 4 for 16x16 (spatial prediction from neighbours in the *current* picture) | FMO, ASO, redundant slices, data partitioning; FFmpeg `-ec guess_mvs` (iterative MV search), `deblock` (strong deblock on damaged MBs), `favor_inter` ([ffmpeg-codecs](https://ffmpeg.org/ffmpeg-codecs.html)) | Smoother, "soupier" mosh: the deblocker blurs block edges of the reference every frame, so repeated prediction turns tiles into soft smears; intra-predicted MBs in P-frames copy *corrupted* neighbours spatially, producing streaky directional fills; multi-ref prediction means some blocks pull from older (possibly clean) frames, so damage is patchy. Many decoders also refuse to decode after a missing IDR, so H.264 moshing usually needs an encoder that emits only one IDR (Supermosh's `-g 99999999`) and the mosh is done by *dropping the key chunk at decode time* rather than by file surgery. |
| **HEVC / H.265** | Coding tree units 16x16–64x64, TUs 4x4–32x32 (DCT + 4x4 DST) ([Wikipedia HEVC](https://en.wikipedia.org/wiki/High_Efficiency_Video_Coding)) | Quarter-pel, 8-tap luma interpolation, AMVP + merge mode (vectors inherited from neighbours) | Deblocking on 8x8 grid + **SAO** (sample adaptive offset) | 33 directional + planar + DC | Slices, tiles, WPP | Larger, variable-size slabs (up to 64x64 moving as one, down to 4x4 at edges); merge mode makes vector fields spatially coherent, so moshes drift as large sheets; SAO + deblock smooth even more than AVC. Not supported by any mainstream mosh tool. |
| **VP9** | 64x64 superblocks, quadtree down to 4x4 ([Wikipedia VP9](https://en.wikipedia.org/wiki/VP9)) | 1/8-pel; up to 3 references per frame from an 8-frame buffer; golden/altref frames; compound prediction | Loop filter adapted to block sizes | DC, TM, H, V + 6 oblique | Tiles; "superframes" | Behaves like HEVC-class: big coherent slabs, soft edges. The golden/altref references mean some blocks keep predicting from a stale *clean* frame, so a VP9 mosh partially self-heals in patches. |
| **AV1** | 128x128 superblocks, 10 partition shapes, down to 4x4 ([Wikipedia AV1](https://en.wikipedia.org/wiki/AV1)) | Up to 7 references, compound, **warped motion and global motion**, OBMC | Deblocking + **CDEF** (directional ringing suppression) + loop restoration (Wiener/guided) + film-grain synthesis | 56 directional angles, palette, intra block copy | Switch frames | Moshes would show affine/warped block motion rather than pure translation, OBMC-blended block borders, and heavy smoothing. Film-grain synthesis is applied *after* reconstruction, so the grain stays clean while the picture melts. No tooling exists; mentioned for completeness. |

Practical takeaway for DATAMOSHINE: the "classic" look that users expect is the MPEG-4 Part 2 look: rigid 16x16/8x8 tiles, no deblocking, 8x8 DCT residual texture, half/quarter-pel snapping. "H.264-style" is a distinct, softer look (deblocked reference, directional intra fills, partial multi-reference healing) and is worth exposing as a separate *style* preset rather than as the default.

### A.5 Where decoder error concealment enters

Real players rarely show raw garbage. FFmpeg's H.264 decoder exposes `-ec` with `guess_mvs` (iterative motion-vector search for damaged MBs), `deblock` (strong deblocking of damaged MBs) and `favor_inter` (predict from the previous frame rather than from the current frame) ([ffmpeg-codecs](https://ffmpeg.org/ffmpeg-codecs.html)). The visual signature of concealment in streams is frozen rectangles that later reappear elsewhere; Fanton models this as "lost sectors": rectangles on overlapping grids that freeze motion in that region for a hashed duration ([Codrops](https://tympanus.net/codrops/2026/09/02/breaking-the-frame-building-a-real-time-datamosh-effect-with-three-js/)). This is a cheap and very recognisable sub-effect to add to a pixel-space engine.

---

## B. Survey of tools and their feature sets

### B.1 Bitstream / frame-list tools

| Tool | Level | Operations | Parameters | Randomness | Notes | URL |
|---|---|---|---|---|---|---|
| **Avidemux** (manual) | Frame list, copy mode | Delete I-frame, copy/paste P-frame N times | GOP, B-frames, bitrate at encode | None | Crashes above ~10 pastes at a time | [glitchology](https://glitchology.com/datamoshing/) |
| **moshy** (Ruby, aviglitch) | AVI frame list | `prep`, `isplit`, `inspect`, `pdupe` (dupe P-frame at index, amount), `ppulse` (c frames every n, duplicated), `bake` | frame index, count, interval | None | "pdupe ... may need to set the interval 1 or 2 above or below" | [GitHub](https://github.com/GlitchTools/moshy) |
| **tomato.py** (Python) | AVI `movi` chunk reorder, codec-agnostic | void, random, reverse, invert, bloom, pulse, overlap, jiggle | `-c` count, `-n` position/spread, `-ff` keep first frame, `-a` audio, `-k` kill threshold (0–1, default 0.7) | `random.sample`, `random.gauss(0, n)` for jiggle; unseeded | Detects I-frames by chunk *size* | [GitHub](https://github.com/itsKaspar/tomato) |
| **automosh** (Python) | Byte-level I-frame transplant | Replace I-frames of A with I-frames of B, pad/truncate | — | — | Output "plays, but is pretty badly mangled" | [parkerhiggins.net](https://parkerhiggins.net/2017/07/making-mosh-ups-automated-datamoshing-from-multiple-video-sources/) |
| **Vegas-Datamosh / Otomad Helper** | Rendered selections | Datamosh (repeat N P-frames M times), Datamix (replace first I-frame with the frame before the selection), Layer, Scramble, Stutter, Shake | Frame Count, Frame Repeat, Layer count, Layering offset, Scramble Size | Scramble shuffles subclips | | [otomadhelper](https://otomadhelper.readthedocs.io/v4/mosh.html) |
| **datamosh (PyPI)** | AVI byte level + browser UI | Duplicated P-frames, deleted keyframes, reordered motion, corrupted macroblocks, loop-stretched audio; optional decoded effects (chroma subsampling, pixel sorting) | `MoshConfig` object, sliders, presets | **Seeded**: "identical inputs and the same seed will produce byte-identical results" | Requires AVI / MPEG-4 ASP, single keyframe | [PyPI](https://pypi.org/project/datamosh/) |
| **Supermosh** (browser) | Encoded-chunk list + WebCodecs | Build a sequence of segments `{name, from, to, repeat}` out of chunks of several clips; dropping a clip's key chunk = I-frame removal; `repeat` = P-frame duplication/bloom | width, height, segment ranges, repeat count | None | ffmpeg.wasm (libx264, `-g 99999999 -bf 0`) → mp4box demux → `VideoDecoder` fed `EncodedVideoChunk`s at 30 fps → canvas → `MediaRecorder`. Proof that WebCodecs tolerates delta chunks whose keyframe was skipped (in Chrome at least). | [supermosh.github.io](https://supermosh.github.io/), [src/lib.ts](https://github.com/supermosh/supermosh.github.io/blob/main/src/lib.ts) |
| **videobeaux crossmosh** | ffmpeg-driven | Modes: smear, drift, cross-infect, decay; A/B source blending | `--codec`, `--qscale` (2–5 smooth, 10–20 chaotic), `--gop` (100–300+), `--frames`, `--decay`, `--blend`, `--b_input` | — | "Datamoshing behavior is extremely sensitive to codec and GOP selection" | [docs](https://git.terata.org/eessppeelllloo/videobeaux/src/branch/python/docs/programs/effects/crossmosh.md) |
| **FFmpeg `datamosh` bsf (patch)** | Packet filter | Drop nth keyframe or all keyframes after first n | `target` | — | Patch, May 2024 | [ffmpeg-devel](https://ffmpeg.org/pipermail/ffmpeg-devel/2024-May/326858.html) |

### B.2 ffglitch (motion-vector / DCT scripting)

ffglitch is three programs: `ffedit` (bitstream editor), `fflive` (real-time player with scripting), `ffgac` (ffmpeg with glitch-friendly encoder flags). Supported codecs: JPEG, MPEG-2, MPEG-4 Part 2, PNG; **H.264 is not supported**, nor is Matroska/WebM as a container ([ffedit docs](https://ffglitch.org/docs/0.10.2/ffedit/), [codecs](https://ffglitch.org/docs/0.10.2/codecs/)).

Exposed features per codec ([MPEG-4](https://ffglitch.org/docs/0.10.2/features/mpeg4/), [MPEG-2](https://ffglitch.org/docs/0.10.2/features/mpeg2/)):

| Feature | MPEG-4 | MPEG-2 | Meaning |
|---|---|---|---|
| `info` | yes | yes | pict_type (I/P/B/S), per-MB flags: `I` intra, `q` qscale change, `f`/`b`/`d` forward/backward/direct MVs, `G` GMC, `4` four 8x8 MVs, `i` interlaced 16x8, `1`–`6` which DCT blocks changed |
| `mv` / `mv_delta` | yes | yes | Forward/backward MVs per MB, `[h, v]` or 4x`[h,v]`; `fcode` gives legal range; `overflow` = assert / truncate / ignore / warn |
| `q_dct`, `q_dct_delta`, `q_dc`, `q_dc_delta` | — | yes | Quantised DCT coefficients (DC + 63 AC in zig-zag) |
| `qscale` | — | yes | Quantiser per slice/MB |
| `mb` | yes | yes | Raw macroblock bytes (can be reordered) |
| `gmc` | yes | — | Global motion compensation params |
| `dqt`, `q_dc_delta` | JPEG | | Quantisation tables (DC coefficient glitch) |

Script shape (JavaScript on quickjs): `export function setup(args){ args.features=["mv"]; ... }` and `export function glitch_frame(frame){ const mvs = frame.mv?.forward; frame.mv.overflow="truncate"; ... }` ([tutorial scripts](https://github.com/ramiropolla/ffglitch-scripts/tree/main/tutorial/scripts/mpeg4)). `-sp "[x,y]"` passes parameters; `args.output` can rename the output; MIDI, SDL and ZeroMQ are built in for live control ([quickjs docs](https://ffglitch.org/docs/0.10.2/quickjs/)).

`MV2DArray` / `MVArray` API ([mv2darray](https://ffglitch.org/docs/0.10.2/quickjs/mv2darray), [mvarray](https://ffglitch.org/docs/0.10.2/quickjs/mvarray)): `subarray`, `fill`, `reverse`, `reverse_h`, `reverse_v`, `slice`, `dup`, `forEach(mv,i,j)`, `maskedForEach`, `map`, `largest_sq`, `smallest_sq`, `swap_hv`, `clear`, math ops `add/sub/mul/div/assign` with `_h`/`_v` variants and optional `MV2DMask`, `compare` ops (`compare_gt`, `compare_gt_v`...), masks with `not/and/or/xor`, `sort` (on MVArray).

What people actually do with it (from the tutorial and the dd_GlitchAssist port, [scripts repo](https://github.com/ramiropolla/ffglitch-scripts)):

| Script | Operation on the vector field | Parameters |
|---|---|---|
| `mv_pan` | `mvs.add(MV(pan_x, pan_y))` — constant offset: whole picture drifts | pan x,y (e.g. `[0,10]`) |
| `mv_sink_and_rise` | `mv[0] = 0` (kill horizontal) so only vertical motion survives; "rise"/"sink" = only up/down | — |
| `mv_average` | Running average over the last `tail_length` frames: `total_sum.add(cur); if len>tail: total_sum.sub(oldest); mvs.assign(total_sum).div(tail)` | tail_length (default 10, dd uses 20) |
| `dd_AverageBastard` | Add the *global mean* vector averaged over N frames to every block (adds inertia) | tail_length 20 |
| `dd_gravity` | Blocks with positive vertical motion keep falling: `old += cur; old -= gravity` (per-block accumulator via mask) | gravity 10 |
| `dd_circular` / `wave` | `mv.x *= sin(i); mv.y *= cos(j)` or `sin(i/M_W*2π)` — spatially modulated scaling | — |
| `dd_slamZoom` / `zoomIn/Out` | `mv = ((center - (j,i))/100) * ZOOM` — synthetic radial field, ignores content | ZOOM (-20) |
| `dd_MultiplyFastest` | `mask = mvs.compare_gt(0.1*largest); mvs.mul(MV(10,10), mask)` — amplify only the fastest 10 % of blocks | percentage, multiple |
| `dd_RandomDamage(*)` | Fire an operation with probability `(100-threshold)%` per frame and hold it for `nFrames` | threshold 95, nFrames 5 |
| `dd_mirrorX/Y`, `rotate180`, `swap`, `shear`, `slice*`, `stop*`, `doubleSpeed`, `ringBuffer`, `delay`, `randomiser` | Field-level geometric ops: reverse_h/v, swap_hv, scale, per-row shifts, zeroing, delay buffers | varies |
| `mb_type_midi` | Flip MB types from INTER to INTRA progressively (controls how fast the clean picture is "painted in") | frames to complete |
| `pict_types.js` | Decide I vs P per frame programmatically (`frame_num & 3 ? "P" : "I"`) | — |
| `pixelsort.js` | ffgac `vf_script` pixel sorter: `pix_fmt gbrp/yuv444p`, `trigger_by`, `sort_by` (h/s/l), `order` horizontal/vertical, `mode` threshold/random, `threshold [0.25,0.80]`, `clength 100` | MIDI-driven |

Datamosh 2 (After Effects) ships "helper tools" that are FFglitch 0.10.2 ([aescripts version history 2.7.0](https://aescripts.com/datamosh/)), so its algorithm list below is a direct map of ffglitch-style MV operations.

### B.3 Datamosh 2 for After Effects (Plugin Play, aescripts)

Headline: "60+ moshing algorithms, 16x more precision, 6 new parameters and a new marker workflow. Remove frames, hijack motion and swap motion from other clips." ([aescripts](https://aescripts.com/datamosh/)).

Workflow elements:
- **Mosh markers** (layer markers) define where moshing happens; multiple markers combine modularly.
- **Remove Frames** marker at the first frame of a clip = I-frame deletion ("pixels of the previous clip are transposed into the following clip's motion").
- **Hijack Motion**: apply one of the algorithms to the clip's own vectors.
- **Swap Motion**: "steal and inject motion from marked areas in your timeline" (motion transplant from another clip/region).
- **Mosh Maps**: a greyscale map layer controls mosh intensity per region (spatial mask), sold in a bundle with Depth Scanner for depth-driven moshing.
- **Four core parameters** besides algorithm choice: **Intensity** ("how aggressively frames are duplicated"), **Acceleration** ("how quickly the effect builds"), **Blend** ("how moshed frames mix with clean footage"), **Threshold** ("motion detection sensitivity") ([aaeplugins](https://aaeplugins.com/plugins/datamosh-2/)).
- "Two new moshing engines" / "16x more precise" tracking; real-time preview ([toolfarm](https://www.toolfarm.com/?p=69970)).

Full algorithm list as published on the product page ([aescripts](https://aescripts.com/datamosh/)), grouped by what they do to the vector field:

| Group | Algorithms | Vector-field semantics (inferred from names and the ffglitch scripts they map to) |
|---|---|---|
| Basic | Default, Multiply, Add to x and y, Move vertical, Move horizontal, Zoom, Zoom sin, Shear, Experimental, Swap | identity / scalar gain / constant offset / axis-only / synthetic radial field / radial field modulated by sin(t) / shear / swap from another clip |
| Random | Random, Random Blocks 1–4 | per-block random vectors, at four block granularities |
| Spatial (multiply by position) | Multiply by X, by X no Y, by Y, by Y no X, by inverse X (+ no Y), by inverse Y (+ no X), by X&Y, by inverse X&Y, by X & inverse Y, by Y & inverse X | gain ramps across the frame; "no Y" zeroes the other axis |
| Temporal averaging | Average, Average X and Y, Average previous 3/5/10/15, Add previous 3/5/10 | running mean (mv_average) or running sum over N frames (adds inertia/momentum) |
| Spatial averaging | Average 1/2/3/4 neighbors | box-filter the field over 1–4 block radius |
| Mirror | Mirror, Mirror left/right/top/bottom | reverse_h / reverse_v on a half of the field |
| Sweep | Sweep horizontal (+opposite), Sweep vertical (+opposite) | position-dependent constant push that scans across the frame |
| Sin and cos | Middle sin X/Y (+no other axis), Outside sin X/Y, Outside half sin X/Y, Oscillate sin X/Y/X&Y, Right/Left/Horizontal sin tapered V1–V3, Cos X & sin Y, Sin X & cos Y | spatial sinusoidal gain envelopes (centre-weighted, edge-weighted, half-period, tapered), and the `dd_circular`-style `mv.x*=sin(i); mv.y*=cos(j)` |

Note the absence of "bloom" as a named algorithm: in Datamosh 2 bloom is produced by **Intensity** (frame duplication aggressiveness) and **Acceleration**, applied from a marker; the older Datamosh 1 exposed bloom/P-frame duplication directly ([toolfarm Datamosh v2.x](https://www.toolfarm.com/?p=22167)).

### B.4 Datamosher Pro (Akascape)

GUI around ffmpeg + ffglitch + tomato/pymosh-style frame ops; MPEG-4/Xvid AVI internally ([README](https://github.com/Akascape/Datamosher-Pro)). Modes ([README](https://github.com/Akascape/Datamosher-Pro), [FFGLITCH modes wiki](https://github.com/Akascape/Datamosher-Pro/wiki/7.FFGLITCH-Modes)):

- Datamosh cuts: Void (clean output with distortion), Classic, Classic2, Combine (multiple videos with ffglitch transitions), Rise (removes I-frames selectively in ranges), Shuffle, Sort, Motion Transfer ("takes vector data from a secondary video and applies it atop the primary footage, though results are unpredictable").
- Frame repetition: Bloom, Water Bloom, Repeat, Glide, Pulse.
- ffglitch "Basic pack": Fluid ("plays with the average motion vector"), Stretch, Shift, Shear, Sink, Vibrate, Zoom, Slam Zoom, Noise, Mirror, Stop, Slice.
- Glitch Assist pack: Buffer, Delay, Invert-Reverse, Zoom, Slice (the dd_GlitchAssist scripts).
- Other: Echo, Random, Reverse, Invert, Overlap, Jiggle, Custom Script (JS/Python), Manual (delete/duplicate by frame input), FF Live preview.
- Advanced options: Glitch Size, Frame Frequency, First Frame, Kill Frames (the tomato `-k` threshold).

### B.5 mvtools (AviSynth / VapourSynth)

Not a mosh tool, but the richest *parameter catalog for block matching* and the ancestor of "motion compensate without residual" effects (MCompensate / MFlow). From the docs ([avisynth.org.ru mvtools](https://avisynth.org.ru/docs/english/externalfilters/mvtools.htm)):

| Parameter | Values / default | Meaning |
|---|---|---|
| `blksize` | 4, 8, 16 (default 8); `blksizeV` separately | Block size; larger = more coherent, blockier |
| `pel` | 1 or 2 (default 2) | Full- or half-pel precision (v2 adds 4 = quarter) |
| `search` | 0 one-time, 1 n-step, 2 logarithmic/diamond, 3 exhaustive, (4 hex, 5 UMH, 6/7 pure/exhaustive in v2) | Search strategy |
| `searchparam` | default 2 | Search radius / steps |
| `lambda` | 0 (SAD-only) or `1000*blksize²/64` (truemotion); 400–2000 recommended for 8x8 | Vector-coherence penalty: cost = SAD + lambda·|mv − predictor|. Higher = smoother, more "true-motion" field; too high misses real motion |
| `lsad` | `400*blksize²/64` | SAD limit above which predictors are distrusted |
| `pnew` | 50–100 recommended (`75*blksize²/64`) | Penalty for accepting a new vector vs. the predictor |
| `plevel` | 0,1,2 | How lambda scales across pyramid levels |
| `global` | bool | Add a global (pan) motion predictor |
| `overlap` | even, < blksize, default 0 | Block overlap for smoother warps |
| `chroma` | bool | Include chroma in SAD |
| `truemotion` | preset bool | Switch all of the above to coherent-field defaults |
| `delta` | 1 | Reference frame distance |
| `thSCD1` / `thSCD2` | 400 (per 8x8) / 130 (~51 %) | Scene-change detection: per-block SAD threshold and percentage of changed blocks |
| `thSAD` (compensate/degrain) | varies | Blocks with SAD above this are not compensated (left as source) |
| `sharp` | 0 bilinear, 1 bicubic, 2 Wiener | Subpixel interpolation kernel |
| `dct` | 0–10 | Use DCT/SATD instead of SAD for matching (robust to brightness change) |
| MFlow `time`, MMask `kind` (0 motion, 1 SAD, 2 occlusion), `ml` | | Fractional-time warp; masks from vector length, match error, or occlusion |

These are precisely the knobs a GPU block matcher should expose: block size, pel precision, search radius/strategy, coherence penalty (lambda), scene-change thresholds, and a per-block confidence (SAD) output that effects can use as a mask.

### B.6 Real-time / pixel-space simulations

| Tool | Platform | Motion source | Core loop | Exposed parameters | URL |
|---|---|---|---|---|---|
| **KinoDatamosh** (Keijiro, 2016) | Unity | Renderer motion vectors | Two buffers: block-res *displacement buffer* (RGHalf, 1/blockSize res) updated per frame; full-res *work buffer* = previous output warped by displacement, with DCT-like stripe noise and random re-injection of source | `blockSize` (int, min 4, default 16), `entropy` 0–1 (0.5), `noiseContrast` 0.5–4 (1), `velocityScale` 0–2 (0.8), `diffusion` 0–2 (0.4); `Glitch()` / `Reset()` | [GitHub](https://github.com/keijiro/KinoDatamosh), [shader](https://github.com/keijiro/KinoDatamosh/blob/master/Assets/Kino/Datamosh/Shader/Datamosh.shader), [C#](https://github.com/keijiro/KinoDatamosh/blob/master/Assets/Kino/Datamosh/Datamosh.cs) |
| **ompuco "Creating Your Own Datamoshing Effect"** | Unity | `_CameraMotionVectorsTexture` | Displace previous frame by current vectors; recycle pixels; blend; quantise sampling blocks; per-block noise | (blog is the reference for the TouchDesigner series; original is a Twitter/Patreon write-up) | [80.lv](https://80.lv/articles/learn-how-this-datamoshing-glitch-effect-was-made-in-unity), [Interactive Immersive part 1](https://interactiveimmersive.io/blog/content-inputs/datamoshing-in-touchdesigner/) |
| **Datamoshing in TouchDesigner (parts 1–3)** | TouchDesigner | Palette `opticalFlow` TOP (Threshold 0.1, Force 2–3 recommended) | GLSL Multi TOP with inputs [source, flow, Feedback TOP]; `col = texture(prev, uv + mot.rg)`; 32-bit float buffers, UV extend = repeat; interpolation set to nearest/mipmap to avoid noise | flow Threshold, Force, blend, block quantisation, per-block noise | [part 1](https://interactiveimmersive.io/blog/content-inputs/datamoshing-in-touchdesigner/), [part 2](https://interactiveimmersive.io/blog/touchdesigner-resources/datamoshing-in-touchdesigner-part-2/), [part 3](https://interactiveimmersive.io/blog/glsl/datamoshing-in-touchdesigner-part-3/) |
| **BUCK "Moshing" sandbox** | openFrameworks + GLSL | Optical flow of source footage | "displace pixels in a feedback loop, so the act of displacing pixels in a direction causes the optical flow to pick up and amplify any motions"; "new pixel colors are dripped in to keep the simulation from diffusing to a solid color"; blocky structure added | — | [buck.co](https://buck.co/sandbox/moshing) |
| **Codrops / niccolofanton data-mosh** (2026) | Three.js / WebGL | Velocity pass (object + camera reprojection) | One fragment shader = decoder: Catmull-Rom warp of history, gated luma-only quantised residual, block-centre vector sampling, half/quarter-pel snapping, skip threshold, neighbour-vector mismatch, lost sectors, keyframe (GOP) refresh, recovery fade | `blockSize` (8 px default), `blockiness` 0–1, `mvPrecision` (steps per px), `skipThreshold`, `mismatch`, `frozenBlocks`, `lostLayers` (≤4), `lostLife`, `lostScale`, `lostAspect`, `lostVariance`, `residualGain`, `residualQuant`, `motionGain`, `parallax`, `fadeDuration` (370 ms), GOP refresh interval, resolution scale | [Codrops](https://tympanus.net/codrops/2026/09/02/breaking-the-frame-building-a-real-time-datamosh-effect-with-three-js/), [GitHub](https://github.com/niccolofanton/data-mosh) |
| **Notch Motion Datamosh** | Notch | Scene motion vectors or external velocity image | Hold previous frame, displace by velocity | Blend Amount, Blend Mode, Velocity Amount, **Hold Time** (duration before refresh with a new frame), **Velocity Update Rate** (updates/s), Use Scene Motion Vectors, Affect Channels (RGBA); inputs: Velocity Image, Hold Time Image (per-region hold), Velocity Mask Image. "frame rate dependent" | [Notch manual](https://manual.notch.one/0.9.23/en/docs/nodes/post-fx/stylisation/motion-datamosh/) |
| **vvvv Datamosh (DX11)** | vvvv | Two textures + FrameDelay feedback | "NOT a real datamosh procedure, but simulates the real artifact side-effect"; Random + Damper to crossfade sources | — | [vvvv](https://vvvv.org/contribution/datamosh-(dx11)) |
| **Minecraft "Datamosh" shader** | GLSL 1.20 post | None (synthetic) | 8x8 macroblocks; "each macroblock updates on its own timing interval", drifts or jumps; per-block colour quantisation (heavier for displaced blocks); chroma reconstructed at lower res; brightness variation at block edges for DCT ringing; edge noise | — | [Modrinth](https://modrinth.com/shader/datamosh) |
| **JPG Bitcrunching / Datamosh (Unity asset)** | Unity | Motion vectors | "replicates the effect of lossy block encoding artefacts in motion" | encoding block size 4/8/16, RGB crunching, oversharpen | [Asset Store](https://assetstore.unity.com/packages/vfx/shaders/fullscreen-camera-effects/jpg-bitcrunching-datamosh-effect-built-in-urp-275021) |
| **datamosh-glitch-studio** | Python (web UI) | CPU block matching (block 16, search ±6, SAD on every 2nd row/pixel) | I/P-frame slicing, apply vectors, "liquid melt" with acceleration, audio-reactive preset | preset fields: slice_height, horizontal_shift_max, vertical_block_width, vertical_shift_max, color_shift_x/y, scanline_intensity/frequency, block_artifact_size/probability, bitflip_rate, ghost_blend, noise_intensity; **`--seed`** reproducible | [GitHub](https://github.com/NullAITech/datamosh-glitch-studio) |
| **Datamosh Music Video Maker** (itch, browser) | HTML5/GPU | Feedback only | Audio-reactive collage: "reacts in real time to your music (bass, mids, treble)" | Max Layers, Base Size, Global Mosh (feedback zoom/smear), Chaos Movement, Audio React, VHS Decay, Remix Layout (reshuffle) | [itch.io](https://aleatoric11.itch.io/datamosh) |

Observations across the simulation tools:

1. Every one is a *feedback loop*: output(t) = f(output(t−1), motion(t), source(t)). None stores a residual; "detail" comes from blending a little source back in (Buck's "drip", Codrops' 0.12 trickle, Kino's probabilistic source re-injection, Notch's Blend Amount) or from a deliberately incomplete residual (Codrops).
2. Block structure is added *after* the fact by quantising where the vector is sampled (block centre) and by snapping vector magnitudes to a pel grid, not by matching on blocks (except the engine proposed here and datamosh-glitch-studio).
3. Randomness is hash-based and stateless (Codrops `hash13(blockId, slot)`, Kino `UVRandom(uv + time)`), which is exactly what a keyframeable, scrub-safe timeline needs. Only the Python tools expose an explicit seed.
4. Reset/keyframe is a first-class control: Kino `Reset()`, Notch Hold Time, Codrops GOP refresh + `uKeyframe`, TouchDesigner Feedback reset.

---

## C. Pixel-space simulation methods

### C.1 Motion estimation options

| Method | Output | Cost / parallelism | Character of field | Fit for mosh engine | Sources |
|---|---|---|---|---|---|
| **Block matching (SAD/SSD, full/diamond/three-step search)** | One integer (or sub-pel) vector per block | Embarrassingly parallel per block; GPU full search achieves 204x speedups over CPU at 1024x768 ([hgpu](https://hgpu.org/?p=6421)); one workgroup per block with the reference window in shared memory is the standard layout | Piecewise-constant, noisy in flat regions, exactly what codecs produce | **Primary**. Matches the codec's own representation; SAD doubles as confidence/skip mask; lambda-style coherence term (mvtools) tames noise | [mvtools](https://avisynth.org.ru/docs/english/externalfilters/mvtools.htm), [datamosh-glitch-studio engine](https://github.com/NullAITech/datamosh-glitch-studio/blob/main/src/datamosh_glitch_studio/motion_vector_engine.py) |
| **Lucas–Kanade (local, gradient based)** | Dense, per pixel, least-squares within a window | Very cheap per pixel; pyramidal iterative LK runs in GLSL in real time ([Brown dense LK GPU](https://cs.brown.edu/courses/csci1290/2011/results/final/psastras/)); ~4.5x cheaper than Horn–Schunck at high resolution on FPGA ([PMC9269814](https://pmc.ncbi.nlm.nih.gov/articles/PMC9269814/)) | Sparse-reliable: good at textured corners, zero in flat areas (aperture problem) | Good as *refinement* of block vectors; raw LK gives the "liquid" look, not the blocky one | |
| **Horn–Schunck (global smoothness)** | Dense, smooth | Iterative Jacobi relaxation (tens of iterations per frame per pyramid level); Andrew Benson's Jitter shaders and most TouchDesigner/vvvv "optical flow" TOPs are HS-style single-pass gradient estimates | Smooth, fluid; fills flat regions by diffusion | The source of the "fluid" mosh (BUCK, TD). Offer as a style alternative | [cycling74 thread](https://cycling74.com/forums/andrew-benson-optical-flow-shaders), [ofxFlowTools](https://github.com/moostrik/ofxFlowTools) |
| **Farnebäck (polynomial expansion)** | Dense | Moderate; OpenCV standard | Smooth, robust to moderate displacement | Used by Yohan Chalier to apply motion of one clip to a *static reference image* without touching the file ([chalier.fr](https://chalier.fr/blog/datamoshing)). Good offline reference, awkward in WGSL | |
| **DIS (Dense Inverse Search)** | Dense | 300–600 Hz on one CPU core; patch-based inverse search + multi-scale densification + optional variational refinement ([arXiv 1603.03590](https://arxiv.org/abs/1603.03590), [OpenCV](https://docs.opencv.org/4.x/de/d4f/classcv_1_1DISOpticalFlow.html)) | Dense but patch-structured (patch size/stride are the knobs) | Best "dense but still blocky" candidate; maps well to compute shaders (patches = workgroups) | |
| **RAFT (learned)** | Dense, high accuracy | All-pairs 4D correlation volume + recurrent GRU updates ([arXiv 2003.12039](https://arxiv.org/abs/2003.12039)) | Smooth, accurate even for large displacement | Overkill; would need WebGPU inference. Only relevant for an "offline high quality" mode | |

Codec-specific note: a real encoder does not look for *true* motion, it looks for the block that minimises rate-distortion cost. That is why moshes show vectors pointing at "wrong" but similar-looking content (texture lock-ons). A pure SAD search with no coherence penalty reproduces this better than true-motion flow; mvtools' `truemotion=false` / `lambda=0` is literally that setting ([mvtools](https://avisynth.org.ru/docs/english/externalfilters/mvtools.htm)). Keep lambda as a user knob: 0 = codec-like chaos, high = fluid.

Block matching pseudocode suited to a WGSL compute pass (one workgroup per 16x16 block, search radius R, integer then half-pel refinement):

```
@workgroup_size(16,16)
fn bm(block_id, lid):
  // load reference window (16+2R)^2 of luma(prev_output or prev_source) into shared memory
  // load current 16x16 luma block into registers
  best = (0,0, sad=INF)
  for each candidate d in search pattern (full / diamond / 3-step), evaluated cooperatively:
      sad = sum_{p in block} |cur(p) - ref(p + d)|          // reduce across workgroup
      cost = sad + lambda * |d - predictor|                 // predictor = median of left/top/top-right (codec style) or 0
      if cost < best.cost: best = (d, cost)
  // optional half/quarter-pel refinement: test 8 neighbours of best at 1/2 px using bilinear ref
  // scene-change / skip classification
  skip   = best.sad < thSkip * 256
  intra  = best.sad > thIntra * 256                          // "no good match": codec would code intra
  write mv_field[block] = (best.d, best.sad, flags{skip,intra})
```

Important design choice: *which image to match against*. Matching `source(t)` against `source(t−1)` gives the honest field (what the encoder would have coded). Matching `source(t)` against `output(t−1)` makes the field "see" the already-moshed picture, which is what BUCK describes as the flow "picking up and amplifying" its own displacement ([buck.co](https://buck.co/sandbox/moshing)). Expose both; the first is the codec-faithful default, the second is the runaway "fluid" mode.

### C.2 The recurrent core (warp without residual)

The minimum viable mosh, as stated by Codrops ([Codrops](https://tympanus.net/codrops/2026/09/02/breaking-the-frame-building-a-real-time-datamosh-effect-with-three-js/)) and TouchDesigner part 3 ([Interactive Immersive](https://interactiveimmersive.io/blog/glsl/datamoshing-in-touchdesigner-part-3/)):

```
out(t) = history(t-1) sampled at (uv - mv(uv))        // backward warp (gather)
```

with two ping-pong history targets because a shader cannot read the target it writes (WebGL and WebGPU both). Everything else is layered on this:

```
mv      = field(blockCentre(uv)) * gain                    // one vector per block
mv      = round(mv * pelSteps) / pelSteps                  // half/quarter-pel snap (hard tears between slabs)
mv     *= (1 - skipMask) * (1 - lostMask)                  // frozen blocks
pred    = sampleHistory(uv - mv)                           // Catmull-Rom or nearest, see C.4
res     = residualModel(src, pred)                         // 0 for pure mosh; see C.3
out     = clamp(pred + res, 0, 1)
out     = mix(out, src, recover)                           // keyframe / fade back
```

Per-block state that survives frames (Kino's displacement buffer stores `(mv, rand, acc)` at block resolution ([Kino shader](https://github.com/keijiro/KinoDatamosh/blob/master/Assets/Kino/Datamosh/Shader/Datamosh.shader))) is the natural home for: accumulated motion, "age since last refresh", lost-sector timers, and bloom repeat counters. Keep it as a small `rgba16float` texture at `width/blockSize x height/blockSize`.

### C.3 Emulating what the codec does that the warp alone does not

| Codec phenomenon | Why it appears in a real mosh | Pixel-space emulation | Parameters |
|---|---|---|---|
| **Residual painting in the new shot** | P-frames carry quantised residual = source − prediction; where the mismatch is large the residual slowly restores the new content | Codrops' gate: compute high-pass of `src` and of `pred`; send `hc − hp` only where `|hc| > |hp|`, quantise to `residualQuant` steps, add as *luma only* (RGB residual "makes the held frame appear semi-transparent"). Alternative simpler models: `mix(pred, src, k)` with small k (Buck/TD "drip"), or add `quantise(src − pred) * gain` masked by `intra` flag | residualGain 0–1, residualQuant (steps, e.g. 8–64), chroma residual on/off, intraPaint rate |
| **Intra macroblocks** | Encoder codes a block intra when no match is good; in a mosh these are the sharp "correct" tiles that pop in | Where `sad > thIntra`, replace the tile with `src` (whole 16x16, optionally through the DCT-quantise pass so it looks coded). `nopimb` in ffgac disables this, so a "pure" toggle must exist | intraThreshold, intraRate (fraction per frame, à la `mb_type_midi`) |
| **Skip macroblocks** | Blocks with ~zero motion and small residual are not coded; they copy the reference verbatim | `skip = sad < thSkip && |mv| < eps` → copy history with zero displacement (Codrops `uSkipThreshold`) | skipThreshold px |
| **Bloom (P-frame duplication)** | Same vectors re-applied N times to an already displaced picture | Freeze the *field* for N frames (do not re-estimate) while continuing to warp history by it; optionally scale field by `accel^k` to mimic Datamosh 2 Acceleration | repeat N (1–50), accel 0.8–1.5, hold field vs. re-estimate |
| **I-frame drop at a cut** | Decoder keeps old reference | Do nothing special: the history is the old shot, the field is estimated on the new shot's source. Must *not* re-estimate against `output(t−1)` across the cut or the field will be garbage. Scene-cut detection (mvtools thSCD1/thSCD2) can trigger the mosh automatically | sceneCutThreshold, auto-mosh-on-cut |
| **GOP refresh / healing** | Next surviving keyframe restores the picture | `uKeyframe` pulse: `out = src`; plus optional partial refresh (every Nth frame copies source into a random subset of blocks) | gopLength, refreshMode {hard, random blocks, scanline sweep} |
| **Half/quarter-pel snapping** | Vectors are stored at fixed precision | `round(mv * steps)/steps` with steps 1, 2, 4 | pelPrecision {1,2,4,8} |
| **Wrong-vector / mismatch** | Block matcher locks on the wrong object | Sample a diagonal neighbour's vector for a hashed fraction of blocks (Codrops `uMismatch`) | mismatchRate 0–0.3 |
| **Lost sectors / packet loss** | Concealed slices stay frozen | Hash-driven rectangles on 1–4 overlapping grids; inside: motion = 0 (hold), optionally also residual = 0; blink with duty cycle | frozenBlocks 0–1, layers 1–4, life (frames), scale, aspect, variance, start delay |
| **Deblocking (H.264 style)** | In-loop filter smooths 4x4/8x8 edges of the *reference* | Apply a boundary-strength-weighted 1D smoothing across block edges to the history *before* it is fed back (so it accumulates) | deblockStrength 0–1, grid 4/8/16 |
| **DCT quantisation / blocking / ringing / mosquito** | 8x8 DCT, coarse quantisation, zeroed high frequencies | Compute pass: per 8x8 tile forward DCT → divide by Q·quality → round → inverse DCT (a "tile-wide reduction ... requires compute shaders") ([strayspark](https://www.strayspark.studio/blog/compression-artifacts-explained-dct-compute-shader)); apply in YCbCr; ringing and mosquito noise come for free from truncated high frequencies near edges ([Wikipedia](https://en.wikipedia.org/wiki/Compression_artifact)). Cheap fake: add `cos(k·u)` stripe bases with random amplitude per block (Kino's "DCT-ish noise") | quality 1–100 / qscale 1–31, luma/chroma Q matrices, DC-only mode, zero-AC-above index |
| **Chroma subsampling bleed** | 4:2:0 stores chroma at quarter resolution; "color leaking outside its lines, shown as a magenta or cyan ghost along a saturated border" ([forasoft](https://www.forasoft.com/learn/video-quality/articles-vqm/color-artifacts-bleeding-subsampling)) | Convert to YCbCr, downsample Cb/Cr by 2 (or more) with nearest/bilinear, optionally offset chroma by a vector, upsample, recombine. Apply inside the loop so it accumulates | subsample {4:4:4, 4:2:2, 4:2:0, custom N}, chromaOffset px, filter {nearest, bilinear} |
| **Colour quantisation / bit depth** | Low bitrate flattens DC values; Modrinth shader quantises "on a per-block basis ... blocks experiencing stronger displacement receive heavier quantization" | Posterise per block with levels ∝ 1/|mv| | levels 2–256, motionWeighted |

### C.4 Handling the recurrence correctly

- **Precision**: feed back in `rgba16float`. Codrops: "At 8 bit, repeated round trips quantise dark linear values until they collapse to black; half float preserves them" ([data-mosh index.ts](https://github.com/niccolofanton/data-mosh/blob/main/datamosh-demo/src/datamosh/index.ts)). TouchDesigner part 3 makes the same point (32-bit float TOP).
- **Resampling blur**: bilinear taps between texels blur a little each frame; at 60 fps the picture "melts into mush after a few dozen frames". Use Catmull-Rom (9-tap via bilinear trick) and clamp ([Codrops shader](https://github.com/niccolofanton/data-mosh/blob/main/datamosh-demo/src/datamosh/shaders.ts)). For the *codec* look, nearest sampling at integer/half-pel offsets is actually more faithful (codecs use fixed interpolation kernels, Xvid half-pel is a 2-tap average) and avoids the blur; offer `sampling {nearest, bilinear, catmull-rom, codec-6tap}`.
- **Edge handling**: TD part 3 sets UV extend to Repeat; codecs clamp (edge pixels replicate). Clamp is the faithful choice; mirror/repeat are creative options.
- **Timeline determinism**: because frame t depends on t−1, random seeking requires re-simulating from the last keyframe/reset. Make every random decision a pure hash of `(seed, blockId, frameIndex)` (Codrops style) so re-simulation is bit-identical, and cache history snapshots at mosh markers so scrubbing starts from the nearest snapshot. Notch flags its node as "frame rate dependent"; DATAMOSHINE should iterate in *frame index*, never wall-clock.
- **Motion source across cuts**: estimate the field from `source(t)` vs `source(t−1)`; on a detected cut (thSCD) estimate nothing (or zero) for that frame, then resume. Estimating `source(t)` vs `output(t−1)` is a separate "runaway" mode.
- **Field hold**: bloom and "Hold Time" need the field frozen for N frames; store the frozen field in the per-block state texture.
- **Reset**: a keyframe is `history = source`. Partial resets (random block subset, sweep) give the "healing" look of a stream recovering.

### C.5 Reference implementation sketch (KinoDatamosh) for the per-block state update

From the Kino shader ([Datamosh.shader](https://github.com/keijiro/KinoDatamosh/blob/master/Assets/Kino/Datamosh/Shader/Datamosh.shader)), block-resolution pass:

```
mv   = motionVectors(uv).rg * velocityScale * screenSize
mv  += (rand.xy - 0.5) * diffusion
mv   = round(mv)                                   // pixel snap
acc  = prevState.a
accUpdate = acc + min(|mv|, blockSize) * 0.005 + rand.z * lerp(-0.02, 0.02, quality)
accReset  = rand.z * 0.5 + quality
acc  = saturate(|mv| > blockSize ? accReset : accUpdate)   // big motion => re-roll
state = (mv / screenSize, hash(uv + |mv|), acc)
```

and the full-res mosh pass:

```
work = history(uv - disp.xy * 0.98)                // slight scale => gentle blur
dct  = cos(lerp(u, v, rand.y > 0.5) * freq(rand.x) / contrast) * rand.z * (1 - rand.x) * contrast
cw   = (acc > 0.5) ? dct : 0                        // stripe noise once a block has "aged"
cw   = (rand.w < lerp(0.2, 1, quality) && acc > 0.999) ? 1 : cw   // re-inject source
out  = lerp(work, src, cw)
```

The "entropy" knob (`quality = 1 − entropy`) therefore controls both how often blocks refresh to source and how much noise is added: a single musical control for "how broken".

---

## D. Effect catalog

Inputs legend: **P** = previous output (history), **S** = current source frame, **M** = motion field (block vectors + SAD/flags), **S2** = secondary source (another clip, still image, map layer), **B** = per-block state texture, **A** = audio features.
Feasibility is for a WebGPU pixel-space engine with a block-matching pass already in place: **easy** = fragment pass only; **medium** = needs per-block state, a compute pass, or multi-frame buffers; **hard** = needs sorting, CPU round-trips, codec, or ML.

| # | Effect | What it does | Inputs | Parameters (range, default) | Feasibility | Notes / sources |
|---|---|---|---|---|---|---|
| 1 | **Mosh (I-frame drop)** | Warp P by M, no residual; keeps old picture under new motion | P, S, M | gain 0–4 (1); blockSize 4/8/16/32 (16); pelPrecision 1/2/4 (2); sampling nearest/bilinear/catmull (nearest); sourceBlend 0–1 (0); edge clamp/mirror/repeat; matchAgainst source/output | easy | Core. [Codrops](https://tympanus.net/codrops/2026/09/02/breaking-the-frame-building-a-real-time-datamosh-effect-with-three-js/), [TD part 3](https://interactiveimmersive.io/blog/glsl/datamoshing-in-touchdesigner-part-3/) |
| 2 | **Keyframe / Reset** | Writes S into P (hard), or a subset of blocks (soft) | S, P | mode hard/randomBlocks/sweep; fraction 0–1; gop N frames (0 = never); auto-on-cut | easy | Kino `Reset()`, Codrops `uKeyframe`, Notch Hold Time |
| 3 | **Bloom (P-frame repeat)** | Freeze M for N frames and keep warping | P, M, B | repeat 1–60 (20); acceleration 0.5–1.5 (1.0); decay 0–1; holdResidual bool | medium | tomato `bloom -c`, moshy `pdupe`, Datamosh 2 Intensity/Acceleration |
| 4 | **Pulse** | Bloom every n frames for c frames (rhythmic) | P, M, B | every n 2–60; length c 1–30; phase; beatSync (A) | medium | tomato `pulse`, moshy `ppulse` |
| 5 | **Residual paint-in** | Gated, quantised luma high-pass of S added to prediction so new shot emerges | P, S, M | residualGain 0–1 (0.3); quantSteps 1–64 (16); chroma bool; intraThreshold (SAD) | easy | Codrops residualAt(); Fanton: RGB residual makes the frame "semi-transparent" |
| 6 | **Intra block refresh** | Blocks with bad matches (high SAD) are replaced by S (optionally DCT-coded) | S, M | sadThreshold; rate/frame 0–1; codeThroughDCT bool | easy | ffglitch `nopimb` disables; `mb_type_midi` script drives rate |
| 7 | **Skip / freeze blocks** | Zero motion where |mv| < thr | M | skipThreshold px 0–4 (0.5) | easy | Codrops `uSkipThreshold` |
| 8 | **Lost sectors (packet loss)** | Hash-driven rectangles that hold their content | P, B | density 0–1; layers 1–4; life frames; scale; aspect; variance; startDelay | easy | Codrops step 8; FFmpeg `-ec` behaviour |
| 9 | **Vector mismatch** | Fraction of blocks use a neighbour's vector | M | rate 0–0.3 (0.05) | easy | Codrops `uMismatch` |
| 10 | **MV transform: pan / add** | `mv += (x,y)` | M | x,y px −64..64 | easy | ffglitch `mv_pan`; Datamosh 2 "Add to x and y", "Move vertical/horizontal", "Sweep" |
| 11 | **MV transform: multiply / axis kill** | `mv *= (gx, gy)`; gy=0 → "sink and rise" | M | gx, gy −4..4 | easy | ffglitch `mv_sink_and_rise`; Datamosh 2 "Multiply", "no X/no Y" variants |
| 12 | **MV transform: spatial gain fields** | Multiply by position ramps, sin/cos envelopes, tapered windows, mirror halves | M | field type {X, Y, invX, invY, middleSin, outsideSin, oscillate, tapered, mirrorL/R/T/B}; frequency; phase; amplitude | easy | Datamosh 2 full "Spatial", "Sin and cos", "Mirror" families; `dd_circular`, `dd_wave` |
| 13 | **MV transform: synthetic fields** | Replace M with zoom/radial, rotate, shear, slam-zoom (ignores content) | M | type {zoom, zoomSin, rotate, shear, slam}; strength; centre | easy | `dd_slamZoom`, `dd_zoomIn/Out`, Datamosh 2 "Zoom", "Zoom sin", "Shear" |
| 14 | **MV temporal average / inertia** | Running mean or sum over N frames | M, ring buffer of fields | N 2–30 (10); mode mean/sum; addGlobalMean bool | medium | ffglitch `mv_average`; Datamosh 2 "Average previous 3/5/10/15", "Add previous"; `dd_AverageBastard` |
| 15 | **MV spatial average** | Box/bilateral blur of the field over k blocks | M | radius 1–4 | easy | Datamosh 2 "Average 1–4 neighbors" |
| 16 | **MV gravity / accumulate** | Per-block accumulators: falling blocks keep falling | M, B | gravity px/frame; mask by direction | medium | `dd_gravity` |
| 17 | **MV selective amplify** | Multiply only fastest/slowest p % of blocks | M | percentile; multiplier | easy | `dd_MultiplyFastest/Slowest`, `BlurFastest` |
| 18 | **MV random damage** | With probability p per frame, apply one of 10–17 for n frames | M, seed | probability 0–1; holdFrames; op list | easy | `dd_RandomDamage(*)` |
| 19 | **MV noise / diffusion / random blocks** | Add hashed random vectors per block | M, seed | amplitude px; blockGranularity 1–4; temporalCoherence | easy | Kino `diffusion`; Datamosh 2 "Random Blocks 1–4" |
| 20 | **MV quantise / precision** | Snap vectors to 1, 1/2, 1/4 px | M | steps | easy | Codrops `uMvPrecision`; ffglitch `fcode` range |
| 21 | **MV sort / vector sorting** | Sort vectors along rows/columns by magnitude or angle (vector-field analogue of pixel sort) | M | axis; key {mag, angle, x, y}; threshold | medium (field is small: a few thousand blocks, one workgroup can sort a row) | ffglitch `MVArray.sort`; Datamosher Pro "Sort" |
| 22 | **Motion transplant / hijack** | Use M estimated on S2 to warp P (or S) | P, S2, M(S2) | blend A/B field 0–1; timeOffset; scale | easy if S2 is decoded in sync | Datamosh 2 "Swap Motion"; Datamosher Pro "Motion Transfer"; automosh; crossmosh `--b_input` |
| 23 | **Still image as I-frame (Datamix)** | History initialised from a still/other clip, driven by this clip's motion | S2, M | — | easy | Otomad "Datamix"; chalier Farnebäck-on-still |
| 24 | **Mosh map (spatial mask)** | Greyscale layer scales mosh intensity per region; also per-region hold time | S2 (map), M | gain map; holdTime map | easy | Datamosh 2 Mosh Maps; Notch Hold Time / Velocity Mask images |
| 25 | **Scene-cut auto-mosh** | Detect cut (block SAD %), start mosh automatically | S, M | thSCD1 (per-block), thSCD2 (% blocks) | easy | mvtools thSCD1/2 (400, 130) |
| 26 | **Runaway / fluid mode** | Estimate M against P instead of S(t−1) | P, S | lambda (coherence) 0–2000; threshold; force | medium | BUCK; TD opticalFlow Threshold 0.1, Force 2–3 |
| 27 | **DCT quantise (JPEG/MPEG block coding)** | 8x8 (or 4x4/16x16) DCT → quantise → IDCT in YCbCr; produces blocking, ringing, mosquito noise | S or P | quality 1–100 / qscale 1–31; blockSize 4/8/16; chromaQ multiplier; zeroAboveIndex 1–63; inLoop bool | medium (compute pass) | [strayspark](https://www.strayspark.studio/blog/compression-artifacts-explained-dct-compute-shader), [soarify JPEG shader](https://soarify.itch.io/jpeg) |
| 28 | **DCT coefficient glitch** | Scale/zero DC, swap AC, inject coefficients (ffglitch q_dct style) | S/P | dcScale; acScramble; dcDelta | medium | ffglitch MPEG-2 `q_dct`, JPEG `dqt`, `q_dc_delta` |
| 29 | **Fake DCT stripes** | Add per-block cos basis noise, amplitude ∝ block age | P, B | contrast 0.5–4 (1); entropy 0–1 (0.5) | easy | Kino `_Contrast`, `_Quality` |
| 30 | **Chroma subsampling / bleed** | Downsample and optionally displace Cb/Cr | S/P | scheme 4:2:0/4:2:2/N; offset px; filter | easy | [forasoft](https://www.forasoft.com/learn/video-quality/articles-vqm/color-artifacts-bleeding-subsampling) |
| 31 | **Deblocking (in-loop)** | Smooth block edges of history before feedback | P | strength 0–1; grid 4/8/16; bS from |mv| diff | easy | H.264 deblock semantics ([forasoft](https://www.forasoft.com/learn/video-quality/glossary/terms-vqm/deblocking-filter)) |
| 32 | **Colour quantise / posterise** | Reduce levels per block, motion-weighted | P, M | levels 2–256; motionWeight | easy | Modrinth datamosh shader |
| 33 | **Pixel sort** | Sort runs of pixels along an angle by lightness/hue/sat between thresholds | S/P, mask | interval {threshold, random, edges, waves, file, none}; lower 0–1 (0.25); upper 0–1 (0.8); sortBy {lightness,hue,saturation,intensity,minimum}; angle; randomness % (0); charLength | hard-ish (row sort in compute: one workgroup per row with local bitonic sort is feasible for ≤4096 px rows; arbitrary angle needs a rotated pass) | [ASDFPixelSort](https://github.com/kimasendorf/ASDFPixelSort), [satyarth/pixelsort](https://github.com/satyarth/pixelsort), [three.js bitonic](https://threejs.org/examples/webgpu_compute_sort_bitonic.html) |
| 34 | **Slit-scan / time displacement** | Each row/column (or map value) samples a different past frame | ring buffer of S or P, map | depth 1–120 frames (30); direction; map layer; modes Wave/Stretch/TimeWarp | medium (frame ring buffer, texture array) | [SuperSlitScanner](https://akascape.gumroad.com/l/superslitscanner), [AE Time Displacement](https://helpx.adobe.com/ca/after-effects/desktop/apply-effects-and-animation-presets/list-of-effects/time-effects.html) |
| 35 | **Echo / feedback trails** | `out = mix(S, P, decay)` optionally warped by M (motion-blur smear) | S, P, M | decay 0–0.99; warpByMotion bool; blend mode | easy | AE Echo; TD Feedback+Level |
| 36 | **Frame blend / ghost** | Blend current with cached previous source frames | S ring | frames 2–8; weights | easy | |
| 37 | **Displacement by motion (non-recurrent)** | Warp S (not P) by M×gain — a motion-blur-like smear that never accumulates | S, M | gain | easy | TD part 3 first version (`texture(src, uv + mot)`) |
| 38 | **Block drag / block shuffle** | Random blocks copy from a displaced location or swap with another block | S/P | probability; maxOffset; blockSize | easy | Modrinth shader "drift or suddenly jump"; ffglitch `mb` reorder; datamosh-glitch-studio block_artifact_* |
| 39 | **Slice shift / tear** | Horizontal bands shifted by random offsets, interlace field offset | S/P | sliceHeight; maxShift; fieldOffset ±0.25 line; probability | easy | datamosh-glitch-studio slice_height / horizontal_shift_max; [BabylonJS interlace thread](https://forum.babylonjs.com/t/how-do-i-create-an-interlaced-shader-effect/40973) |
| 40 | **RGB / chroma split** | Per-channel offsets (optionally along M) | S/P, M | dx, dy per channel; alongMotion | easy | datamosh-glitch-studio color_shift_x/y |
| 41 | **Audio-reactive drive** | Map bass/mid/treble/onsets to any parameter above (gain, bloom trigger, keyframe, random damage probability) | A | band → param mapping; smoothing; threshold | easy (parameter modulation) | [Datamosh Music Video Maker](https://aleatoric11.itch.io/datamosh), datamosh-glitch-studio `audio_reactive_beat` |
| 42 | **Frame order ops (random/reverse/invert/overlap/jiggle)** | Operate on the *source* frame sequence before moshing | S sequence | c, n, spread | easy at the timeline level | tomato modes |
| 43 | **Authentic bake** | Encode to MPEG-4 ASP (or x264 single-IDR) with ffmpeg.wasm, drop/duplicate packets, decode back | S sequence | codec; qscale; gop; bf=0; dropKeyAfter n; dupe frame/count | hard (10–100x slower than native; 2 GB wasm memory; mpeg4 encoder is built into libavcodec, libx264 needs a GPL build) | [moshy bake](https://github.com/GlitchTools/moshy), [ffmpeg.wasm-core](https://github.com/ffmpegwasm/ffmpeg.wasm-core), [Supermosh](https://github.com/supermosh/supermosh.github.io/blob/main/src/lib.ts), [simonwillison video-compressor notes](https://tools.simonwillison.net/video-compressor) |
| 44 | **WebCodecs mosh (no wasm)** | Encode with `VideoEncoder` (keyFrame only at start), demux chunks, drop key chunks / repeat delta chunks, decode with `VideoDecoder` | S sequence | keyframe interval; segment list | medium, browser-dependent | Supermosh proves the decode path; behaviour on a skipped key chunk is implementation-defined ([MDN VideoDecoder.decode](https://developer.mozilla.org/en-US/docs/Web/API/VideoDecoder/decode)) |

### D.1 Parameter conventions worth adopting

- **Block size** is universally 4/8/16 (Kino default 16, Codrops 8, mvtools 8, Xvid 16 with 4MV=8). Expose 4–32 with 16 default; the matcher can run at 16 and sub-sample to 8 for the warp.
- **Motion gain** ("Velocity Amount", "Force", `velocityScale`) 0–2 with ~1 default; values > 1 are the "overdrive" look.
- **Entropy / Intensity / Blend / Threshold** are the four controls every consumer tool converges on (Kino, Notch, Datamosh 2). Keep them as top-level macro knobs mapped onto the fine parameters.
- **Hold / GOP / repeat** are counted in frames, not seconds (Notch's warning about frame-rate dependence).
- **Randomness**: stateless hashes keyed on `(globalSeed, effectSeed, blockId, frameIndex)`; expose `seed` per effect (PyPI datamosh and datamosh-glitch-studio both expose seeds; the shader tools use hashes). "Random damage" needs a per-event hash on `(seed, floor(frameIndex / hold))`.
- **Spatial masks** (Mosh Map, Velocity Mask, Hold Time Image) should be a generic "modulate parameter by layer luminance" facility rather than per-effect features.

---

## E. Open questions and risks

1. **Block matching vs. codec vectors.** A SAD matcher on RGB/luma with no rate term will produce noisier fields than Xvid's (which uses a predictor + bit-cost penalty). Validate visually against an ffglitch `mv` JSON export of the same clip (ffedit `-f mv -e mv.json`) to tune lambda/predictor so the field "looks coded". Risk: too-true motion looks like motion blur, not a mosh.
2. **Residual model.** Omitting the residual gives a pure smear that never resolves into the new shot. Real moshes *do* resolve over time (intra blocks, residual energy). The Codrops gate is one model; the intra-refresh-by-SAD model is another; neither is validated against a real decode. Build an A/B harness: same clip through ffmpeg.wasm bake vs. simulation.
3. **Recurrence and the timeline.** Scrubbing, keyframed parameters and nested effects on a recurrent effect require deterministic re-simulation from snapshots. Decide snapshot cadence (every mosh marker? every N frames?) and memory budget (one `rgba16float` 1080p frame ≈ 16 MB; block state is negligible).
4. **Precision drift.** Feedback must be 16-bit float; the DCT pass must clamp; Catmull-Rom can overshoot. Nearest sampling with integer/half-pel vectors is the only option that is drift-free, and it is also the most codec-faithful; make it the default and treat smooth sampling as a style.
5. **Stacking order.** Effects that live *inside* the loop (deblock, chroma subsample, DCT quantise, colour quantise) accumulate; the same effects *after* the loop do not. The track UI needs to express "in-loop" vs "post" placement, or each artifact effect needs an `inLoop` toggle.
6. **H.264/HEVC/VP9/AV1 looks.** The classic look is Xvid. Softer looks need deblocking in the loop, directional intra fills and multi-reference "healing" blocks. No tool models these; it is an opportunity but also unverified aesthetics. Evidence for codec differences in this document is structural (what the standards do), not visual A/B.
7. **Authentic bake feasibility.** ffmpeg.wasm is 10–100x slower than native and memory-limited (~2 GB), single-threaded unless cross-origin isolated; libx264 requires a GPL build, but libavcodec's native `mpeg4` encoder (what ffglitch and Datamosher Pro use) is normally present. Supermosh shows an alternative: libx264 via ffmpeg.wasm only for *encoding*, then WebCodecs for decoding with dropped key chunks. Whether `VideoDecoder` tolerates delta chunks after a skipped key chunk is browser/hardware dependent; it must be feature-detected and may differ between software and hardware decoders.
8. **Motion transplant sync.** "Swap motion" needs the secondary clip decoded and block-matched at the same frame cadence and resolution; crossmosh warns "mismatched resolutions may create unpredictable smear patterns". Define resampling of the secondary field (scale vectors with resolution).
9. **Pixel sort on GPU.** Per-row sorts at 4K width exceed workgroup shared-memory sizes in a single pass; need multi-pass bitonic or restrict to ≤2048-pixel segments (interval-bounded sorting naturally limits segment length). Angle other than 0/90 requires a rotate-sort-rotate round trip.
10. **Audio features.** Need an analysis pass (FFT bands, onset) exposed as timeline curves; otherwise audio-reactive effects are not renderable offline. Decide whether analysis is baked to keyframe curves at import.
11. **Licensing of reference code.** KinoDatamosh is Unlicense/MIT-style (both notices appear), niccolofanton/data-mosh is MIT, ffglitch scripts are in a public repo, lygia is Prosperity/Patron licensed (not permissive for commercial use). Reimplement in WGSL rather than port lygia.
12. **Perceptual tuning constants.** Fanton: "none of these constants is derived ... came from moving sliders until the result looked like a corrupted file." Expect the same; plan a preset library ("Xvid classic", "YouTube H.264", "stream packet loss", "bloom", "fluid") rather than exposing only raw numbers.

---

## Source index

Bitstream and classic workflow: [glitchology](https://glitchology.com/datamoshing/) · [Epidemic Sound](https://www.epidemicsound.com/blog/how-to-datamosh/) · [Wikipedia: Compression artifact](https://en.wikipedia.org/wiki/Compression_artifact) · [moshy](https://github.com/GlitchTools/moshy) · [tomato](https://github.com/itsKaspar/tomato) · [automosh / mosh-ups](https://parkerhiggins.net/2017/07/making-mosh-ups-automated-datamoshing-from-multiple-video-sources/) · [chalier.fr](https://chalier.fr/blog/datamoshing) · [FFmpeg datamosh bsf patch](https://ffmpeg.org/pipermail/ffmpeg-devel/2024-May/326858.html) · [ffmpeg-codecs (`ec`)](https://ffmpeg.org/ffmpeg-codecs.html) · [Otomad Helper / Vegas-Datamosh](https://otomadhelper.readthedocs.io/v4/mosh.html) · [Supermosh](https://supermosh.github.io/) and [source](https://github.com/supermosh/supermosh.github.io/blob/main/src/lib.ts) · [datamosh (PyPI)](https://pypi.org/project/datamosh/) · [videobeaux crossmosh](https://git.terata.org/eessppeelllloo/videobeaux/src/branch/python/docs/programs/effects/crossmosh.md)

Codecs: [MPEG-4 Part 2](https://en.wikipedia.org/wiki/MPEG-4_Part_2) · [H.264/AVC](https://en.wikipedia.org/wiki/Advanced_Video_Coding) · [HEVC](https://en.wikipedia.org/wiki/High_Efficiency_Video_Coding) · [VP9](https://en.wikipedia.org/wiki/VP9) · [AV1](https://en.wikipedia.org/wiki/AV1) · [forasoft: deblocking](https://www.forasoft.com/learn/video-quality/glossary/terms-vqm/deblocking-filter) · [forasoft: chroma bleeding](https://www.forasoft.com/learn/video-quality/articles-vqm/color-artifacts-bleeding-subsampling)

ffglitch: [docs home](https://ffglitch.org/docs/0.10.2/) · [ffedit](https://ffglitch.org/docs/0.10.2/ffedit/) · [MPEG-4 features](https://ffglitch.org/docs/0.10.2/features/mpeg4/) · [MPEG-2 features](https://ffglitch.org/docs/0.10.2/features/mpeg2/) · [quickjs](https://ffglitch.org/docs/0.10.2/quickjs/) · [MV2DArray](https://ffglitch.org/docs/0.10.2/quickjs/mv2darray) · [MVArray](https://ffglitch.org/docs/0.10.2/quickjs/mvarray) · [ffglitch-scripts](https://github.com/ramiropolla/ffglitch-scripts)

Tools: [Datamosh 2 (aescripts)](https://aescripts.com/datamosh/) · [aaeplugins summary](https://aaeplugins.com/plugins/datamosh-2/) · [toolfarm Datamosh 2](https://www.toolfarm.com/?p=69970) · [toolfarm Datamosh v2.x](https://www.toolfarm.com/?p=22167) · [Datamosher Pro](https://github.com/Akascape/Datamosher-Pro) · [Datamosher Pro ffglitch modes](https://github.com/Akascape/Datamosher-Pro/wiki/7.FFGLITCH-Modes) · [mvtools](https://avisynth.org.ru/docs/english/externalfilters/mvtools.htm) · [KinoDatamosh](https://github.com/keijiro/KinoDatamosh) · [Codrops article](https://tympanus.net/codrops/2026/09/02/breaking-the-frame-building-a-real-time-datamosh-effect-with-three-js/) · [niccolofanton/data-mosh](https://github.com/niccolofanton/data-mosh) · [Interactive Immersive part 1](https://interactiveimmersive.io/blog/content-inputs/datamoshing-in-touchdesigner/), [part 2](https://interactiveimmersive.io/blog/touchdesigner-resources/datamoshing-in-touchdesigner-part-2/), [part 3](https://interactiveimmersive.io/blog/glsl/datamoshing-in-touchdesigner-part-3/) · [80.lv on ompuco](https://80.lv/articles/learn-how-this-datamoshing-glitch-effect-was-made-in-unity) · [BUCK moshing](https://buck.co/sandbox/moshing) · [Notch Motion Datamosh](https://manual.notch.one/0.9.23/en/docs/nodes/post-fx/stylisation/motion-datamosh/) · [vvvv Datamosh DX11](https://vvvv.org/contribution/datamosh-(dx11)) · [Modrinth Datamosh shader](https://modrinth.com/shader/datamosh) · [Unity JPG bitcrunch/datamosh](https://assetstore.unity.com/packages/vfx/shaders/fullscreen-camera-effects/jpg-bitcrunching-datamosh-effect-built-in-urp-275021) · [datamosh-glitch-studio](https://github.com/NullAITech/datamosh-glitch-studio) · [Datamosh Music Video Maker](https://aleatoric11.itch.io/datamosh)

Optical flow and GPU: [LK vs HS FPGA study](https://pmc.ncbi.nlm.nih.gov/articles/PMC9269814/) · [DIS](https://arxiv.org/abs/1603.03590) · [OpenCV DIS](https://docs.opencv.org/4.x/de/d4f/classcv_1_1DISOpticalFlow.html) · [RAFT](https://arxiv.org/abs/2003.12039) · [Dense LK on GPU (Brown)](https://cs.brown.edu/courses/csci1290/2011/results/final/psastras/) · [GPU block matching SAD](https://hgpu.org/?p=6421) · [Andrew Benson flow shaders thread](https://cycling74.com/forums/andrew-benson-optical-flow-shaders) · [ofxFlowTools](https://github.com/moostrik/ofxFlowTools) · [lygia opticalFlow sampler](https://github.com/patriciogonzalezvivo/lygia/blob/main/sample/opticalFlow.glsl)

Adjacent effects: [strayspark DCT compute shader](https://www.strayspark.studio/blog/compression-artifacts-explained-dct-compute-shader) · [soarify JPEG shader](https://soarify.itch.io/jpeg) · [ASDFPixelSort](https://github.com/kimasendorf/ASDFPixelSort) · [satyarth/pixelsort](https://github.com/satyarth/pixelsort) · [three.js WebGPU bitonic sort](https://threejs.org/examples/webgpu_compute_sort_bitonic.html) · [SuperSlitScanner](https://akascape.gumroad.com/l/superslitscanner) · [AE Time effects](https://helpx.adobe.com/ca/after-effects/desktop/apply-effects-and-animation-presets/list-of-effects/time-effects.html) · [TD slit-scan tutorial](https://derivative.ca/community-post/tutorial/glsl-slit-scan-effect-touchdesigner/74007) · [interlace shader thread](https://forum.babylonjs.com/t/how-do-i-create-an-interlaced-shader-effect/40973)

Browser feasibility: [ffmpeg.wasm-core](https://github.com/ffmpegwasm/ffmpeg.wasm-core) · [in-browser ffmpeg performance notes](https://tools.simonwillison.net/video-compressor) · [MDN VideoDecoder.decode](https://developer.mozilla.org/en-US/docs/Web/API/VideoDecoder/decode)
