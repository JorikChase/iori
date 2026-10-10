# Coverage matrix — every reference operation and where MOSHINE provides it

2026-10-09 · M3 · spec §1.1 (state of the art: coverage) · sources: [research/datamoshing-techniques.md](research/datamoshing-techniques.md) §B

Status: **v1** = available now; **partial** = the effect is reachable but not with the reference's exact semantics
(the note says how); **v2 / v3** = planned (CATALOG-REVIEW.md); **n/a** = tooling or not an image operation.
Names in the MOSHINE column are checked against `config.js` by `tests/coverage.test.mjs` for every v1 and partial
row: `ops.<op>.<param>=<value>`, `inLoop.<fx>` / `post.<fx>`, `<stage>.<param>`, `block`, `seed`,
`preset:<name>`, `legacy:<name>`.

## Frame-list and bitstream tools

| Reference operation | Source | MOSHINE | Status |
|---|---|---|---|
| Delete the I-frame at a cut | Avidemux, FFmpeg datamosh bsf | `estimate.zeroOnCut` `reset.honourCut` | v1 |
| Drop every n-th keyframe / all after the first | FFmpeg datamosh bsf | `reset.gop` `reset.gopKeep` `reset.honourCut` | v1 |
| Copy/paste a P-frame N times (bloom) | Avidemux, moshy pdupe, Otomad Datamosh | `bloom.repeat` `bloom.hits` | v1 |
| … extending the clip by the duplicates | Avidemux | timeline Bloom Insert (M5) | v2 |
| Pulse: c frames every n | moshy ppulse, tomato pulse | `bloom.every` `bloom.phase` `bloom.repeat` | v1 |
| I-frame transplant from another clip | automosh, Otomad Datamix | `reset.source=source2` | v1 |
| Combine clips / segment lists | Supermosh, Datamosher Pro Combine | multi-clip timeline (M5) | v2 |
| Frame order: random, reverse, invert, overlap, jiggle, shuffle, scramble, stutter | tomato, Otomad, Datamosher Pro | frame-order ops (catalogue 42) | v2 |
| Corrupted macroblocks | datamosh (PyPI) | `ops.lost` `post.blockdrag` | v1 |
| Raw macroblock reorder | ffglitch `mb` | `post.blockdrag.mode=shuffle` | v1 |
| Seeded, byte-identical results | datamosh (PyPI) | `seed` | v1 |
| Smear / drift / cross-infect / decay | videobeaux crossmosh | `preset:Pure smear` `ops.pan` `estimate.source=source2` `post.echo` | v1 |
| qscale 2–5 smooth vs 10–20 chaotic | crossmosh | `residual.dead` `inLoop.dct.quality` | partial |
| Authentic bake through a real codec | moshy bake, Supermosh | opt-in bake export (M9), fidelity bench `tools/fidelity.mjs` | v3 |
| prep / isplit / inspect | moshy | lab overlays, metrics | n/a |

## ffglitch motion-vector API and scripts

| Reference operation | Source | MOSHINE | Status |
|---|---|---|---|
| `add` / `sub` (constant offset), mv_pan | MV2DArray, mv_pan | `ops.pan.x` `ops.pan.y` | v1 |
| `mul` / `div`, `_h` / `_v` variants | MV2DArray | `ops.multiply.gx` `ops.multiply.gy` | v1 |
| `assign` (replace the field) | MV2DArray | `ops.synthetic.mode=mix` `ops.synthetic.blend` | v1 |
| `fill` / `clear` / stop | MV2DArray, dd_stop | `ops.multiply.gx=0` `ops.skip` | v1 |
| `largest_sq`, `compare_gt` masks, dd_MultiplyFastest | MV2DArray | `ops.amplify.which=fastest` `ops.amplify.pct` | v1 |
| masks `not` / `and` / `or` / `xor` | MV2DMask | `ops.map` (image-driven masks) | partial |
| `reverse_h` / `reverse_v`, mirror, rotate180 | MV2DArray, dd_mirrorX/Y | field mirror op | v2 |
| `swap_hv` | MV2DArray | field swap op | v2 |
| `sort` | MVArray | field sort (catalogue 21) | v2 |
| mv_sink_and_rise (kill one axis) | ffglitch tutorial | `ops.multiply.gx=0` `preset:Sink and rise` | v1 |
| mv_average, dd_AverageBastard (temporal mean) | ffglitch, dd_GlitchAssist | temporal average (catalogue 14) | v2 |
| dd_gravity (per-block accumulators) | dd_GlitchAssist | gravity (catalogue 16) | v2 |
| dd_circular / wave (`x *= sin(i)`, `y *= cos(j)`) | dd_GlitchAssist | `ops.gain.shape=sinX` `ops.gain.shape=sinY` (both axes share one gain) | partial |
| dd_slamZoom, zoomIn / zoomOut | dd_GlitchAssist | `ops.synthetic.kind=zoom` `preset:Slam zoom` | v1 |
| dd_shear | dd_GlitchAssist | `ops.synthetic.kind=shearX` `ops.synthetic.kind=shearY` | v1 |
| dd_doubleSpeed | dd_GlitchAssist | `ops.multiply.gx=2` | v1 |
| dd_slice (per-row field shifts) | dd_GlitchAssist | `post.slice` (image rows, not field rows) | partial |
| dd_RandomDamage (random op held n frames) | dd_GlitchAssist | random damage (catalogue 18) | v2 |
| ringBuffer, delay, randomiser | dd_GlitchAssist | temporal field buffer | v2 |
| mb_type_midi (inter → intra progressively) | ffglitch | `intra.rate` `intra.mad` | v1 |
| pict_types (decide I vs P per frame) | ffglitch | `reset.gop` `reset.gopKeep` | v1 |
| gmc (global motion) | ffglitch MPEG-4 | `ops.synthetic` | v1 |
| q_dct / q_dc / qscale (quantisation) | ffglitch MPEG-2 | `inLoop.dct.quality` `inLoop.dct.cutoff` `inLoop.dct.dcOnly` | v1 |
| DCT coefficient scramble / DC delta | ffglitch MPEG-2, JPEG dqt | DCT coefficient glitch (catalogue 28) | v2 |
| pixelsort.js | ffgac | pixel sort (catalogue 33) | v2 |
| MIDI / ZeroMQ live control | ffglitch fflive | live rack + MIDI (M10) | v2 |

## Datamosh 2 (After Effects)

| Reference operation | Source | MOSHINE | Status |
|---|---|---|---|
| Default | Datamosh 2 | `preset:Xvid classic` | v1 |
| Multiply | Datamosh 2 | `ops.multiply` | v1 |
| Add to x and y, Move vertical, Move horizontal | Datamosh 2 | `ops.pan.x` `ops.pan.y` | v1 |
| Zoom | Datamosh 2 | `ops.synthetic.kind=zoom` | v1 |
| Zoom sin (zoom modulated over time) | Datamosh 2 | `ops.synthetic.strength` with keyframes now, LFO modulator in M5 | partial |
| Shear | Datamosh 2 | `ops.synthetic.kind=shearX` | v1 |
| Swap (motion from another clip) | Datamosh 2 | `estimate.source=source2` | v1 |
| Random, Random Blocks 1–4 | Datamosh 2 | `ops.noise.amp` `ops.noise.cell` | v1 |
| Multiply by X / Y / inverse X / inverse Y | Datamosh 2 | `ops.gain.shape=rampX` `ops.gain.shape=rampY` `ops.gain.shape=invX` `ops.gain.shape=invY` | v1 |
| … "no Y" / "no X" variants | Datamosh 2 | `ops.gain.shape=rampX` then `ops.multiply.gy=0` | v1 |
| … by X & Y, inverse X & Y, X & inverse Y | Datamosh 2 | two chained gain ops (`ops.gain.shape=rampX` then `ops.gain.shape=rampY`) | v1 |
| Average / Average X and Y / Average previous 3, 5, 10, 15 / Add previous 3, 5, 10 | Datamosh 2 | temporal average and sum (catalogue 14) | v2 |
| Average 1–4 neighbours | Datamosh 2 | `ops.smooth.radius` | v1 |
| Mirror, Mirror left / right / top / bottom | Datamosh 2 | field mirror op (`ops.gain.shape=mirrorL` only masks a half) | v2 |
| Sweep horizontal / vertical (+ opposite) | Datamosh 2 | moving push: `ops.pan` with `ops.gain` mask, animated (M5 modulators) | v2 |
| Middle sin, Outside sin, Oscillate sin X / Y | Datamosh 2 | `ops.gain.shape=sinX` `ops.gain.shape=sinY` `ops.gain.shape=radial` `ops.gain.phase` | partial |
| Outside half sin, tapered sin V1–V3, Cos X & sin Y | Datamosh 2 | per-axis gain shapes | v2 |
| Remove Frames marker | Datamosh 2 | `estimate.zeroOnCut` `reset.honourCut` | v1 |
| Hijack Motion | Datamosh 2 | `ops.multiply` and every field op | v1 |
| Swap Motion | Datamosh 2 | `estimate.source=source2` | v1 |
| Mosh Maps (greyscale intensity map) | Datamosh 2 | `ops.map` | v1 |
| Intensity | Datamosh 2 | `bloom.repeat` | v1 |
| Acceleration | Datamosh 2 | `bloom.accel` | v1 |
| Blend (moshed vs clean) | Datamosh 2 | `residual.gain` `reset.blocks` | v1 |
| Threshold (motion sensitivity) | Datamosh 2 | `ops.skip.eps` `estimate.cutMad` | v1 |
| Mosh markers (where moshing happens) | Datamosh 2 | `bloom.hits`; effect clips and mosh hits on the timeline (M5) | partial |

## Datamosher Pro

| Reference operation | Source | MOSHINE | Status |
|---|---|---|---|
| Classic, Classic2 | Datamosher Pro | `preset:Xvid classic` `preset:Pure smear` | v1 |
| Rise (remove I-frames selectively in ranges) | Datamosher Pro | `reset.honourCut` `reset.gopKeep`, keyframed | v1 |
| Motion Transfer | Datamosher Pro | `estimate.source=source2` | v1 |
| Shuffle, Sort (frames) | Datamosher Pro | frame-order ops | v2 |
| Bloom, Repeat, Pulse | Datamosher Pro | `bloom.repeat` `bloom.every` | v1 |
| Water Bloom | Datamosher Pro | `bloom.repeat` `warp.interp=smooth` `legacy:10 Water Ripple` | v1 |
| Glide | Datamosher Pro | `bloom.accel` | v1 |
| Fluid (average motion) | Datamosher Pro | `preset:Fluid` `ops.smooth` | v1 |
| Stretch, Shift, Shear, Sink, Zoom, Slam Zoom, Noise, Stop | Datamosher Pro | `ops.multiply` `ops.pan` `ops.synthetic.kind=shearX` `ops.synthetic.kind=zoom` `ops.noise` | v1 |
| Vibrate | Datamosher Pro | `ops.noise.hold` | v1 |
| Mirror | Datamosher Pro | field mirror op | v2 |
| Slice | Datamosher Pro | `post.slice` | partial |
| Buffer, Delay | Datamosher Pro (Glitch Assist) | temporal field buffer | v2 |
| Invert-Reverse | Datamosher Pro | `ops.multiply.gx=-1` | v1 |
| Echo | Datamosher Pro | `post.echo` | v1 |
| Custom script (JS / Python) | Datamosher Pro | sandboxed expressions (M5 v2) | v2 |
| Manual delete / duplicate by frame | Datamosher Pro | `bloom.hits` | v1 |
| Glitch size, Frame frequency, Kill frames threshold | Datamosher Pro | `block` `bloom.every` `estimate.cutMad` | v1 |

## mvtools (block-matching catalogue)

| Reference operation | Source | MOSHINE | Status |
|---|---|---|---|
| blksize | mvtools | `block` | v1 |
| pel 1 / 2 / 4 | mvtools | `estimate.pel` `warp.pel` | v1 |
| searchparam (radius) | mvtools | `estimate.search` | v1 |
| search type (exhaustive, diamond, hex, UMH) | mvtools | fixed hierarchical search (D29) | n/a |
| lambda, truemotion | mvtools | `estimate.lambda` | v1 |
| plevel | mvtools | `estimate.lambda` fades by 2^-level per pyramid level (D29) | v1 |
| global (pan predictor) | mvtools | global motion predictor | v2 |
| overlap | mvtools | `warp.interp=smooth` | partial |
| chroma in SAD, DCT/SATD matching | mvtools | chroma and SATD costs | v2 |
| thSCD1 / thSCD2 | mvtools | `estimate.cutMad` `estimate.cutFrac` | v1 |
| thSAD (do not compensate bad blocks) | mvtools | `intra.mad` `intra.rate` | v1 |
| sharp (interpolation kernel) | mvtools | `warp.sampling` | v1 |
| MFlow | mvtools | `preset:Fluid` `estimate.method=flow` | v1 |
| MMask (motion, SAD, occlusion) | mvtools | lab overlays; `ops.map` takes an image | partial |

## Real-time simulations

| Reference operation | Source | MOSHINE | Status |
|---|---|---|---|
| blockSize, velocityScale, diffusion | KinoDatamosh | `block` `ops.multiply` `ops.noise.amp` | v1 |
| entropy (random block refresh) | KinoDatamosh | `reset.blocks` | v1 |
| noiseContrast (DCT-like stripes) | KinoDatamosh | `inLoop.stripes.contrast` `post.stripes` | v1 |
| Reset() | KinoDatamosh | `reset.gop` | v1 |
| mvPrecision, skipThreshold, mismatch | Codrops data-mosh | `warp.pel` `ops.skip.eps` `ops.noise.mismatch` | v1 |
| frozenBlocks, lostLayers / Life / Scale / Aspect | Codrops data-mosh | `ops.lost.density` `ops.lost.layers` `ops.lost.life` `ops.lost.scale` `ops.lost.aspect` | v1 |
| residualGain, residualQuant | Codrops data-mosh | `residual.gain` `residual.steps` `residual.mode=detail` | v1 |
| GOP refresh | Codrops data-mosh | `reset.gop` | v1 |
| fadeDuration (recovery fade) | Codrops data-mosh | recovery fade | v2 |
| Blend Amount, Velocity Amount | Notch Motion Datamosh | `reset.blocks` `ops.multiply` | v1 |
| Hold Time, Velocity Update Rate | Notch Motion Datamosh | `bloom.repeat` `bloom.every` | v1 |
| Hold Time Image, Velocity Mask Image | Notch Motion Datamosh | `ops.map` | v1 |
| Optical-flow feedback with drip-in | BUCK, TouchDesigner series | `estimate.method=flow` `estimate.against=output` `reset.blocks` | v1 |
| per-block colour quantisation, heavier for moving blocks | Minecraft datamosh shader | `post.posterise.motion` | v1 |
| chroma at lower resolution | Minecraft shader | `post.chroma` `inLoop.chroma` | v1 |
| block-edge ringing | Minecraft shader | `inLoop.dct` `inLoop.stripes` | v1 |
| lossy block encoding in motion, RGB crunching | JPG Bitcrunching (Unity) | `inLoop.dct.quality` `post.posterise` | v1 |
| oversharpen | JPG Bitcrunching | sharpen | v2 |
| slice_height, horizontal_shift_max | datamosh-glitch-studio | `post.slice.height` `post.slice.shift` | v1 |
| color_shift_x / y | datamosh-glitch-studio | `post.rgbsplit.dx` `post.rgbsplit.dy` | v1 |
| block_artifact_size / probability | datamosh-glitch-studio | `post.blockdrag.prob` `post.blockdrag.offset` | v1 |
| ghost_blend | datamosh-glitch-studio | `post.echo` | v1 |
| scanlines, bitflips, noise grain | datamosh-glitch-studio | analog family (VHS, CRT) | v2 |
| interlace field offset | glitch shaders | `post.slice.field` | v1 |
| audio-reactive drive (bass, mids, treble) | Datamosh Music Video Maker, glitch-studio | audio modulators (M7) | v2 |

## Beyond the references (MOSHINE only)

| Capability | MOSHINE |
|---|---|
| Codec residual on edited vectors (ffglitch semantics, measured) | `residual.mode=codec` (D31) |
| Dropped-I-frame rule with scene-cut detection | `estimate.zeroOnCut` (D32) |
| Fidelity-tuned styles scored against real MPEG-4 and x264 moshes | `preset:Xvid classic` `preset:H.264 soft` |
| Deterministic replay, Mosh ID, bit-identical GPU and CPU | engine, D28 |
| In-loop vs post placement of every artifact pass | `inLoop.*` `post.*` |
