# MOSHINE — Product and Engineering Specification

Version 0.1 (draft for discussion) · 2026-10-09

Companion research (cited below by section):
- [Datamoshing techniques](research/datamoshing-techniques.md) — bitstream reality, tool survey, pixel-space simulation, 44-row effect catalog
- [Timeline editors](research/timeline-editors.md) — feature matrix, effect stacking and modulation, render cache, project format
- [Web platform 2026](research/web-platform-2026.md) — WebGPU/WebCodecs support, fallback ladders, storage, audio, device tiering, risks

---

## 0. Decision log

Decisions taken in discussion on 2026-10-09. Items marked *assumed* were chosen by default and can be overturned.

| # | Decision | Choice |
|---|---|---|
| D1 | Mosh engine model | **Simulated pixel-space mosh** on WebGPU (warp previous output by a motion field, residual omitted, codec artifacts as separate passes). Bitstream moshing is not the core engine. |
| D2 | Clip length and resolution | **Device-tiered.** Capable machines handle arbitrary length via streaming. Weaker devices get a computed cap enforced at import with a warning. |
| D3 | Browsers | **Chrome, Safari, Firefox**, best effort, through a compatibility layer with fallback ladders. |
| D4 | Tauri / Rust | **Parked.** Moved to `legacy/`. The web engine can run inside a WebView later. |
| D5 | Preview | **Live preview with a scrubbable timeline** backed by a checkpoint cache. |
| D6 | Audio when duration changes | **Time-stretched to match** (see §9 for how duration changes are modelled). |
| D7 | Motion source | **Block matching primary, dense optical flow as a toggle.** |
| D8 | Editor scope | **Effects-first editor:** multiple video and audio channels, trim/split/move/snap/markers/zoom, effect stacks on any clip or channel, keyframes on every parameter. No titles, transitions or colour tools in v1. |
| D9 | Procedurality | **Ordered effect stack with modulation slots in the UI, DAG underneath.** Node view can be exposed later without a format change. |
| D10 | ffmpeg | **ffmpeg.wasm only as compatibility and opt-in "authentic bake" tier.** WebCodecs is the default media path. |
| D11 | Stack | **Clean HTML and plain ES modules, no build step, no framework, no TypeScript** (house infrastructure, decided 2026-10-09). JSDoc types for editor help. WGSL inline in JS modules. Tests follow the petri idiom: in-page harness plus a headless-Chrome bench script writing to `ref/`. |
| D12 | *assumed* Randomness | Everything seeded. A project file renders bit-identically on the same device regardless of scrub path. |
| D13 | *assumed* Export defaults | MP4 H.264 + Opus/AAC default; WebM VP9; PNG sequence. GIF later. |
| D14 | *assumed* Project format | Own versioned JSON (`moshine.project.v1`, file extension `.mosh`). OTIO export of the cut only, later. |
| D15 | Sharing and hosting | Ships as a folder app at `iori.me/moshine/` on the house Caddy VPS (registered in `pages.meta.json`, built with `site.py`). COOP/COEP set per path in the Caddyfile, so multithreaded WASM needs no service-worker trick. **Mosh ID** in the URL hash (stack + params + seed) replays deterministically, like the iris ID and the Dish ID. Projects as `.mosh` files. No server-side processing. |
| D16 | Visual idiom | **Program Manager house shell** (iris-engine / petri idiom). Decided 2026-10-09 after the wireframe review. |
| D17 | Live mode and MIDI/OSC | **v2, designed for now.** The engine clock, effect stack, modulators and triggers must not assume a timeline; a live rack hosts the same stack over camera/capture input with live audio features and MIDI mapping later. |
| D18 | Mosh timeline objects | **Accepted:** Mosh Cut transition at joins, mosh hits (H) as trigger markers, Bloom holds the field in time, Bloom Insert extends the clip with a hold segment and time-stretched audio. |
| D19 | Form factors | **One editor on desktop, tablet and phone.** No feature gating by device class. Preview quality, buffer sizes and import limits are governed in real time by the capability probe and measured frame cost (§10.6). Phone layout follows petri's bottom-sheet idiom. |
| D20 | Licence | **App source stays unlicensed-private inside the public site repo; ffmpeg.wasm as an LGPL build** (no x264). The authentic bake uses libavcodec's native mpeg4 encoder, which is the Xvid-style look. |
| D21 | Firefox Android and Linux | **Preview-only**: WebGL2 compute fallback and video-element decode, export disabled with a notice. |
| D22 | Checkpoint spills | **Lossless rgba16float everywhere**; the governor raises K and keeps fewer hot rather than going lossy. Scrubbed and played frames stay bit-identical. |
| D23 | Extra inputs | **Source picker on nodes in v1** (motion source, reset image, matte referencing a specific channel). The referenced channel counts as upstream for invalidation. |
| D24 | Audio playback | **Arrives in the audio milestone.** Audio features are extracted at import from the start so modulators and triggers work before anything is audible. |
| D25 | Priority | **State-of-the-art moshing first, editor second.** Defined in §1.2 and measured by the fidelity bench in §12.5. Milestones reordered accordingly (§13). |
| D26 | Name | **MOSHINE.** Folder `moshine/`, URL `iori.me/moshine/`. |
| D27 | Working values | **Display-referred (gamma-encoded) values inside the Mosh Loop**, like a codec's Y'CbCr; luma with BT.709 weights. Supersedes "linear working space" in §5.2 for the mosh stages; a linear path may return for compositing in M5. Decided 2026-10-09 during M1. |
| D28 | Precision | **Half-float storage rounds to nearest-even in the shader** before every store (Apple Metal truncates on conversion, which darkens feedback loops), and the CPU reference stores half floats too. GPU and CPU loops are bit-identical, so CPU parity is a hard test, not a tolerance. |
| D29 | Estimator tuning | λ coherence penalty scaled by 2^-level on the pyramid (mvtools plevel 2), sub-pel refinement by data only, scene-cut threshold 0.05 mean luma error on ≥ 50 % of blocks. Measured on fixtures with exact truth and on decoded H.264. |
| D30 | Fidelity reference | **Native libavcodec for the development bench** (`tools/mvtool.c` + FFmpeg 8 CLI), not ffmpeg.wasm: no LGPL ffmpeg.wasm build is published and the bench never ships to users. Same encoder and decoder code. The in-browser authentic bake stays planned for M9. Decided 2026-10-09 at the start of M2. |
| D31 | Codec residual | **Residual mode `codec`:** `pred + quantise(src − warp(prevSrc, field))` with a dead zone; during a bloom hold the trigger frame's residual is re-applied. Measured as the decisive fidelity term (study/fidelity.md). "Xvid classic" now = bilinear half-pel + codec residual (dead zone 0.03); the M1 look is kept as "Pure smear". |
| D32 | Dropped I-frame | **A detected cut that is not honoured is a dropped I-frame:** zero motion, no residual, no intra blocks. |
| D33 | Residual on edited vectors | **The codec residual is motion-compensated with the ORIGINAL estimate** (pre field-ops, unscaled) and taken from the motion source's own stream (source 2 when hijacking). Edited vectors therefore keep the old residual, which is what makes ffglitch-style edits visible; with the modified field the residual cancelled every edit. Found by the M3 preset gallery. |
| D34 | H.264 style | **"H.264 soft" = Xvid classic + quarter-pel**, measured against real x264 moshes (QP 24, one reference, no B-frames). Our in-loop deblock and DCT lowered the fit, so that look is the creative preset "Soft deblocked" with no fidelity claim. Modelling x264's own deblocking is an open thread. |
| D35 | Effects | **Image effects run in two ordered lists:** `inLoop` (applied to the history, accumulate) and `post` (applied to the display only). All twelve v1 effects are bit-identical GPU vs CPU on Apple Metal; loops that contain them are checked for closeness, replay is always bit-exact. |
| D36 | Media library | **Imports are copied once into OPFS** (`moshine-media/<content id>`), content ID = SHA-256 of the size and three 1 MiB samples (first, middle, last), so multi-GB files hash in milliseconds; an index file keeps name, size and probe info. Browsers without OPFS `createWritable` keep the clip for the session only. |
| D37 | Preview vs export | **The M4 preview plays decoded frames through the Mosh Loop at a governed resolution; seeking re-keys the mosh** (the frame you land on is the I-frame) until the checkpoint cache (M6). **Export always renders sequentially from the first frame of the range** at the chosen size, independent of the preview. |
| D38 | Export | **WebCodecs encode through Mediabunny, streamed into a positional writable** (save picker on Chrome/Edge, else an OPFS file handed over as a download); MP4 with the index at the end (`fastStart: false`) or WebM. **Source audio is passed through packet for packet** when the container accepts its codec (timing is unchanged in M4); otherwise it is dropped until the M7 mix. Safari H.264 uses `latencyMode: 'realtime'`. |
| D39 | Probe and governor | **Probe v1 measures** the default Mosh Loop at 720p (scaled to 1080p), H.264 encode and decode throughput (after a warm-up) and what the default-limits device can allocate, and caps the static tier with them. **The governor** moves preview scale (100, 75, 50, 37.5, 25 %) by the median frame time of a 20-frame window (down above 115 % of budget, up after 60 calm windows below 55 %); a manual pin overrides it. |
| D40 | Locks | **A lock does nothing** (owner, 2026-10-10). Lock masks refresh the Mosh Loop's history from its input every frame (both twins, the maskmix kernel, exact), so no mosh builds up underneath and turning a lock off reveals nothing hidden. Lock masks therefore enter the checkpoint signature; include masks still mix after the state. Supersedes the "optional in-loop refresh" of R3. |
| D41 | UI density | **Looks cards stay as they are; the editor is dense** (owner, 2026-10-10): remove empty space everywhere, as much utility per pixel as possible. Desktop decides behaviour; layouts adapt. |
| D42 | Own code, made fast | **Keep our own code over vendored libraries, and make it fast enough to justify that** (owner, 2026-10-10: "we like on prem but we need performant code built to make up for it"). The JS WSOLA stays (signalsmith-stretch is not vendored). Performance is first-class work, not polish: workers for audio and cache I/O, the matcher in workgroup shared memory, measured against T4 rows. |
| D43 | Public early | **The app stays public at iori.me/moshine/ while M7 and M8 are open**, so it can be tested on other devices (owner, 2026-10-10). M9 is split: its public part is done; the authentic bake, the v2 library and the docs become M9b. |
| D44 | Isolation | **iori.me sends no COOP/COEP for /moshine/ until the ffmpeg.wasm bake needs them** (this defers D15's per-path headers). `serve.py` and the bench match production by default; `--coi` opts in. Nothing in the app depends on isolation today (the bench passes non-isolated). |

Open decisions still needed from the owner are collected in §15.

---

## 1. Vision and scope

DATAMOSHINE is a browser-based, GPU-accelerated editor for datamosh and glitch aesthetics. Users drop in video and images, arrange them on a timeline, and stack procedural mosh effects whose every parameter can be keyframed and modulated. Preview is live and scrubbable; export is streamed to disk at any length the device can handle. It runs as a static web app with no server and no installation, and it stays usable on Safari and Firefox.

**What it is:** an effects-first video editor where the effect library is the product.

**What it is not (v1):** a story editor. No titles, transitions, colour grading, multicam, or speed ramps. Those are explicitly deferred (research: timeline-editors §B).

### 1.1 Definition of state of the art

"SOTA moshing" is a claim the lab must be able to check. It means three things, each with a test:

1. **Coverage.** Every operation exposed by the reference tools is available here: ffglitch's motion-vector scripting (add, multiply, pan, sink/rise, average, sort, random damage, masks), Datamosh 2's sixty-plus algorithms and its four macro knobs, Datamosher Pro's modes, Avidemux/moshy/tomato frame-list operations, mvtools' matcher parameters. A coverage matrix in `study/coverage.md` lists each reference operation and the node or parameter that provides it. Target: 100 % of the catalogue in [CATALOG-REVIEW.md](CATALOG-REVIEW.md) marked v1 and v2.
2. **Fidelity.** On the same clip, the simulated Xvid classic style must be close to a real MPEG-4 ASP bake with the same operation: the estimated field must track ffglitch's exported vectors within an end-point-error budget on real footage, and the smear after an I-frame drop must stay within a perceptual distance budget of the real decode over the first 60 frames. The budgets are set from the first measurements in M2 and tightened per release.
3. **Beyond the references.** Capabilities no reference tool has: real-time preview with scrubbing, dense optical flow as a style, H.264-soft and packet-loss styles, keyframed and modulated parameters, audio triggers, deterministic replay from a Mosh ID, and later live input. These are the reasons to use MOSHINE instead of the references.

### 1.2 Product principles

1. **Determinism.** Frame N is a pure function of (project file, frame index, seed, precomputed audio features, device). No wall clock, no unseeded random, no time-sliced oscillators.
2. **Procedurality.** Every parameter is animatable and modulatable. Presets are saved stacks, not magic numbers.
3. **Peak performance on the native path.** WebCodecs for decode/encode, WebGPU for compute, zero-copy frame import where the browser supports it. Fallbacks exist but never slow the fast path.
4. **Graceful degradation.** Capability is probed, not assumed. Limits are computed and shown, never discovered by crashing.
5. **Shareable.** One URL to run it, one file to hand a project over, one fragment to share a preset.

---

## 2. Legacy app assessment

The existing Tauri app (`src/`, `src-tauri/`) is a complete brutalist UI over a thin prototype:

- Backend transcodes to MPEG-4 Part 2 AVI via ffmpeg, parses RIFF, reorders chunks, remuxes with stream copy. Only 3 of 11 UI parameters do anything (I-frame destruction, bloom count, duplication interval). Three of four workflows run identical code.
- Output is not baked (stream copy), so the glitch depends on the player. Audio desyncs after bloom. The AVI `idx1` index is written back stale.
- No tests, no git, hardcoded paths.

**Carried forward:** the visual identity (brutalist black/red/yellow, Oswald + JetBrains Mono), the 12 preset names, the 11 parameter names as user-facing vocabulary (mapped in §6.5), and the four workflow names as project templates (§6.6). Everything else is replaced.

---

## 3. Architecture overview

### 3.1 Modules

Developed in `data_moshine/moshine/`, moved into the site repo as `iori/moshine/` when it works. Same shape as `petri/` and `iris-engine/`: one folder, plain ES modules, no build step.

```
moshine/
  index.html         the app shell (SEO block generated by site.py, ../assets/menu.js at the end)
  ui.css, ui.js      Program Manager shell: caption, menu bar, docked preview/stack/timeline, floating tool windows
  engine.js          node graph, scheduler, per-frame evaluation, checkpoint logic (platform-agnostic)
  nodes/*.js         one module per effect: schema, WGSL, CPU reference, lab notes
  engine-ref.js      CPU reference entry (Float32Array images), used by the harness and the tier-0 path
  gpu.js, gpu-gl2.js WebGPU backend (+ WebGL2 fallback), texture pools, readback
  media.js           import, demux, decode, encode, mux (Mediabunny + WebCodecs), ffmpeg.wasm adapter
  audio.js           feature extraction, time-stretch, preview playback, export mix
  timeline.js        data model, command bus, undo/redo, selection, snapping
  project.js         schema, validation, migrations, OPFS persistence, .mosh and Mosh ID
  platform.js        capability probe, tiers, storage quota, worker bootstrap
  workers/*.js       render, media, cache, encode, ffmpeg, audio workers
  lab.html, lab.js   algorithm lab (image sequences, overlays, GPU vs CPU diff, PNG export)
  harness.js         in-page tests T0 (parity, determinism, replay, catalogue smoke) and T4 (perf)
  tools/bench.mjs    headless Chrome runner writing ref/bench-<tag>.json (petri idiom)
  fixtures.js        procedural fixture generators (no binaries in the repo)
  vendor/            mediabunny, ffmpeg.wasm (lazy), pinned versions (time-stretch is our own WSOLA, D42)
  ref/               bench results, golden hashes
  study/             spec, research, decisions (this docs folder moves here)
  HANDOFF.md
legacy/tauri/        parked Tauri + Rust prototype (stays in data_moshine, not moved)
```

### 3.2 Worker topology

| Worker | Owns | Notes |
|---|---|---|
| main | DOM, canvas timeline, inspector, command bus | Never touches media bytes. |
| render | `GPUDevice`, OffscreenCanvas preview, graph evaluation, VRAM caches | WebGPU-in-worker must be feature-detected; fall back to main-thread device (research: web-platform §H). |
| media (pool) | Mediabunny demux, `VideoDecoder` per active clip | Decoder pool with LRU reuse; Android caps concurrent hardware sessions (web-platform §H.20). |
| cache | OPFS `createSyncAccessHandle`, checkpoint and encoded-cache I/O | 5–15× faster than IndexedDB (web-platform §E.2). |
| encode | `VideoEncoder`, `AudioEncoder`, Mediabunny `Output` → `StreamTarget` | Streams to disk; never buffers a whole export in memory. |
| ffmpeg | ffmpeg.wasm, lazily loaded | Only for the compat and bake paths (§8.4). |
| audio | AudioWorklet (preview), analysis (features at import), own WSOLA stretcher (D42) | Features are precomputed and stored with the project so modulators stay deterministic. |

Messages between workers carry `VideoFrame`s and `ArrayBuffer`s by transfer. Frames are closed by the last consumer; the render worker copies each decoded frame once into an owned `rgba16float`/`rgba8unorm` texture so that every node sees identical bytes regardless of the import path (timeline-editors §E.3 determinism).

---

## 4. Data model

All time is **integer frame count at the sequence timebase** (rational `{num, den}`). No floating-point time anywhere in the model.

```ts
type FrameIndex = number;                 // integer

interface Project {
  schema: "moshine.project.v1";
  id: string; name: string; created: string; modified: string;
  seed: number;                           // global seed
  media: MediaRef[];
  sequences: Sequence[]; activeSequence: string;
  presets?: EffectPreset[];
  ui?: UiState;                           // zoom, scroll, selection — kept separate so diffs stay clean
}

interface MediaRef {
  id: string; name: string; hash: string; // content hash: survives renames, keys the cache
  kind: "video" | "image" | "audio";
  width: number; height: number; fps?: {num:number; den:number};
  durationFrames?: number; keyframeIndex?: number[];
  audioFeatures?: string;                 // id of precomputed feature table
  storage: "opfs" | "handle" | "url";
}

interface Sequence {
  id: string; name: string;
  timebase: {num: number; den: number};   // e.g. 30000/1001
  width: number; height: number;
  durationFrames: FrameIndex;
  channels: Channel[];                    // ordered bottom-up
  markers: Marker[];
  exportRange?: {in: FrameIndex; out: FrameIndex};
}

interface Channel {
  id: string; name: string;
  kind: "video" | "effect" | "audio";
  locked: boolean; bypassed: boolean; solo: boolean;
  clips: Clip[];
  stack?: EffectInstance[];               // channel-level effects (applies to the whole channel)
}

type Clip = MediaClip | EffectClip | AudioClip;

interface ClipBase { id: string; range: {in: FrameIndex; out: FrameIndex}; label?: string; color?: string; }

interface MediaClip extends ClipBase {
  kind: "media"; mediaId: string;
  sourceIn: FrameIndex;                   // offset into source
  hold?: boolean;                         // still image or freeze: source frame does not advance
  stack: EffectInstance[];                // per-clip effects
}

interface EffectClip extends ClipBase {   // adjustment clip: processes the composite below it
  kind: "effect";
  stack: EffectInstance[];
  reset: "atIn" | "continue";             // recurrent state policy at the in-point
  warmup: number;                         // pre-roll steps before in-point
}

interface AudioClip extends ClipBase {
  kind: "audio"; mediaId: string; sourceIn: FrameIndex;
  gain: AnimatableValue; stretch?: StretchSegment[]; // §9
}

interface EffectInstance {
  id: string; type: string; version: number;
  enabled: boolean; seed: number;
  params: Record<string, AnimatableValue>;
  inputs?: Record<string, InputRef>;      // named extra inputs: matte, source2, map
  children?: EffectInstance[];            // for group effects (Mosh Loop, §5.4)
}

type InputRef = {channel: string} | {media: string} | {sequence: string};

type AnimatableValue =
  | { value: number | boolean | string | number[] }
  | { keys: Keyframe[]; mods?: Modulator[] }
  | { value: number; mods: Modulator[] };

interface Keyframe { frame: FrameIndex; value: number; interp: "hold"|"linear"|"easeIn"|"easeOut"|"easeInOut"|"bezier"; handles?: [number,number,number,number]; }

interface Modulator {
  type: "lfo" | "noise" | "randomHold" | "audio" | "macro" | "expr";
  mode: "add" | "multiply" | "replace";
  depth: number; clamp?: [number, number];
  params: Record<string, number | string>; // lfo: shape, rateHz|rateBeats, phase; noise: freq, octaves; randomHold: rate; audio: feature, band, smoothing; expr: source
  seed?: number;
}

interface Marker { id: string; frame: FrameIndex; color: string; note?: string; checkpointHint?: boolean; }
```

Rules:
- Channels composite bottom-up. An **effect clip** processes the composite of everything below it for its range (adjustment-clip semantics). Vertical channel order is global stack order; stack order inside a clip is local order (timeline-editors §C.4).
- Effect types carry a schema `version`; migrations are explicit functions in `project/migrations/`.
- The render cache is never inside the project file. It lives in OPFS keyed by content hashes.
- Every effect type is registered with a JSON schema for its params, default values, ranges, UI hints, and whether it is `stateful`.

---

## 5. Engine

### 5.1 Node graph

The engine evaluates a DAG per frame. The UI shows stacks; the engine sees nodes. Each `EffectInstance` becomes one node (or a subgraph for group effects). Edges are implied by stack order and by named `inputs`.

```ts
interface NodeSpec<P, S = void> {
  type: string; version: number;
  stateful: boolean;                      // true → participates in checkpointing (§7)
  inputs: InputDecl[];                    // "in" (composite below), "prev" (own previous output), "source2", "matte", "map", "motion"
  outputs: OutputDecl[];                  // "out", optionally "motion", "blockState"
  params: ParamSchema<P>;
  reset?(ctx: Ctx, p: P): S;
  step(ctx: Ctx, inputs: Textures, p: P, state?: S): { out: Texture; state?: S; aux?: Textures };
}
```

- Stateless nodes: `out_N = f(in_N, params(N))`. Random access is free.
- Stateful nodes: `(state_N, out_N) = step(state_{N-1}, in_N, params(N))`, `state_{-1} = reset()`. These are the only nodes that require sequential replay (§7).
- Group nodes (e.g. Mosh Loop) own the `prev` texture and run their children inside the loop.
- **Clock independence (D17).** Nodes receive `frame` from a `Clock` object. The timeline clock maps sequence frames; a live clock counts captured frames and feeds audio features from a live analyser. Nothing in a node, modulator or trigger reads the timeline directly, so the same stack runs in a future live rack.
- **External control (D17).** A modulator type `external` (MIDI CC, OSC, keyboard) is reserved in the schema now. In the timeline it records to keyframes; in live mode it drives the value.
- Parameters resolve per frame: keyframe interpolation → modulator slots applied in order (add/multiply/replace with depth and clamp) → range clamp. Modulators are pure functions of `(frame, seed, audioFeatures)`.

### 5.2 Textures and precision

- Working colour space: linear RGB in `rgba16float`. Feedback at 8-bit collapses to black (datamoshing §C.4).
- Block-resolution state: `rgba16float` at `(W/blockSize) × (H/blockSize)`, storing frozen field xy, age, accumulator.
- Decoded frames are copied once into an owned texture; `texture_external` is used only for that copy.
- Edge handling defaults to clamp (codec-faithful); mirror and repeat are creative options.
- Sampling for the warp defaults to **nearest at integer/half-pel**, which is both drift-free and codec-faithful. Bilinear, Catmull-Rom and a 6-tap "codec" kernel are style options (datamoshing §C.4).

### 5.3 Motion estimation node

Primary: **block matching** compute pass (datamoshing §C.1, mvtools parameters).

| Param | Range (default) | Notes |
|---|---|---|
| blockSize | 4 / 8 / 16 / 32 (16) | Matcher runs at this size; warp can subsample to 8. |
| searchRadius | 4–64 px (16) | Hierarchical (pyramid) search above 16. |
| pel | 1 / 2 / 4 (2) | Half-pel refinement by default. |
| lambda | 0–2000 (200) | Coherence penalty against the median predictor (left, top, top-right). `lambda = 0` reproduces codec-like wrong-but-similar lock-ons. |
| matchAgainst | source / output (source) | "output" is the runaway/fluid mode. |
| sceneCut | thSCD1 per block (400), thSCD2 % blocks (130/255) | On a detected cut the field is zeroed for that frame and the cut flag is exposed to downstream nodes. |

Outputs: motion texture `rg` = vector in px, `b` = SAD, `a` = flags (skip, intra, cut). SAD doubles as confidence.

Toggle: **dense optical flow** (pyramidal Lucas–Kanade, later DIS) producing a per-pixel field, block-averaged on request. Gives the "liquid" look (D7).

Validation target: fields should "look coded". The lab (§12.3) overlays the estimated field next to an ffglitch `mv` export of the same clip for tuning lambda and predictor (datamoshing §E.1).

### 5.4 Mosh Loop group node

The core recurrent effect. It is a **group effect** in the stack UI: a collapsible container whose children run inside the feedback loop, which resolves the "in-loop vs post" placement problem (datamoshing §E.5). Stage order inside the loop:

1. **Field source:** estimate on `in` (default), transplant from `source2` (Motion Hijack), or synthetic (zoom/rotate/shear/slam).
2. **Field transforms:** ordered child effects operating on the motion texture (pan, multiply, spatial gain, noise, quantise, spatial average, selective amplify, temporal average, gravity, sort).
3. **Field hold:** bloom and pulse freeze the field in block state for N frames.
4. **Warp:** `pred = sample(prev, uv − mv)` with sampling mode and pel snap.
5. **Residual and refresh:** residual paint-in, intra block refresh by SAD, skip/freeze blocks, lost sectors, vector mismatch.
6. **In-loop artifacts:** child effects applied to the history before feedback (deblock, chroma subsample, DCT quantise, posterise). The same effect types placed *after* the loop in the outer stack do not accumulate.
7. **Reset / keyframe:** hard (`history = source`), random-block subset, scanline sweep, GOP period, auto-on-cut, or `sourceBlend` trickle.

Top-level macro knobs on the group map onto child parameters: **Entropy, Intensity, Blend, Threshold** (datamoshing §D.1).

### 5.5 Determinism rules

- Per-frame randomness is `hash(globalSeed, effectSeed, blockId, frameIndex)`; per-event randomness hashes `(seed, floor(frame / hold))`.
- No atomics with nondeterministic order; fixed workgroup sizes; no reads from `texture_external` inside nodes.
- Export always renders sequentially from the sequence start and never uses checkpoints, so export correctness is independent of the cache.

---

## 6. Effect library

Catalog numbers refer to the research table (datamoshing §D).

### 6.1 v1 (ship with the engine)

| Group | Effects |
|---|---|
| Core loop | Mosh Loop (1) with Keyframe/Reset (2), Bloom (3), Pulse (4), Residual paint-in (5), Intra refresh (6), Skip (7), Lost sectors (8), Vector mismatch (9) |
| Field transforms | Pan/add (10), Multiply/axis kill (11), Spatial gain fields (12), Synthetic fields (13), Spatial average (15), Selective amplify (17), Noise/diffusion (19), Quantise/precision (20) |
| Sources | Motion transplant (22), Still as I-frame (23), Mosh map (24), Scene-cut auto-mosh (25) |
| Codec artifacts | DCT quantise (27), Chroma subsampling/bleed (30), Deblocking (31), Posterise (32), Fake DCT stripes (29) |
| Non-recurrent glitch | Echo/trails (35), Displacement by motion (37), Block drag (38), Slice tear/interlace (39), RGB split (40) |
| Modulators | LFO, seeded noise, random hold, audio envelope/band (41) |

### 6.2 v2

Temporal average/inertia (14), Gravity (16), Random damage (18), MV sort (21), Runaway mode (26), DCT coefficient glitch (28), Slit-scan/time displacement (34), Frame blend (36), Pixel sort (33), Frame-order ops (42), macro knobs and step sequencer modulators, sandboxed expressions.

### 6.3 v3 / opt-in

Authentic bake via ffmpeg.wasm (43), WebCodecs bitstream mosh (44), bitstream motion-vector extraction as an alternative field source.

### 6.4 Style presets

Preset stacks shipped with the app: **Xvid classic** (16 px blocks, nearest half-pel, no deblock), **H.264 soft** (in-loop deblock, 4/8 px grid, intra directional fill), **Stream packet loss** (lost sectors, skip), **Fluid** (optical flow, Catmull-Rom), **Bloom** (datamoshing §A.4, §E.6, §E.12). Plus the 12 legacy presets re-expressed as stacks.

### 6.5 Legacy parameter mapping

| Legacy UI | New home |
|---|---|
| Destruction rate | Keyframe/Reset `fraction` (probability a GOP boundary is not honoured) |
| Max interval | Keyframe/Reset `gop` |
| Bloom count, Duplication int. | Bloom `repeat`, Pulse `every` |
| Motion multiplier | Field Multiply `gx, gy` |
| Vector noise | Field Noise `amplitude` |
| Vector smoothing | Field Spatial average `radius` |
| Compression Q | DCT quantise `qscale` |
| Trellis quantization | DCT quantise `zeroAboveIndex` / matrix style (approximation; documented as such) |
| B-frame reordering | Frame-order ops (v2) |

### 6.6 Workflow templates

The four legacy workflows become **project templates** that pre-arrange channels and a default stack:

| Template | Channels | Default stack |
|---|---|---|
| Video Mutation | V1 media; E1 Mosh Loop | field from `in` |
| Image on Video | V1 still (hold); E1 Mosh Loop with `source2` = motion video channel | Still as I-frame + Motion transplant |
| Motion Hijack | V1 media A; V2 media B (bypassed from composite, used as `source2`); E1 Mosh Loop | Motion transplant |
| Echo Projection | V1 media; V2 still; E1 Mosh Loop | Keyframe/Reset sourcing the still as the reset image every `gop` frames |

(Semantics proposed; see §15.)

---

## 7. Render cache and scrubbing

From timeline-editors §E.3. Four layers:

1. **Decoded-source ring** per media clip around the playhead, GOP-aware seeking (Mediabunny `samplesAtTimestamps`), frames closed aggressively, ring size by tier (§10).
2. **Channel-output cache** for stateless channels: VRAM textures keyed by `hash(graph, frame, upstream)`. Only expensive stacks are cached.
3. **Checkpoint store** for stateful nodes: snapshots every K frames plus at every effect-clip in-point and marker. Hot in VRAM, spilled to CPU, then to OPFS as encoded blobs.
4. **Final-composite LRU**: what the preview shows; drives the green bar.

Scrub to frame N: for each channel bottom-up, stateless → evaluate directly; stateful → find nearest valid checkpoint k ≤ N (else `reset()` at clip in-point), replay k+1…N, deposit a checkpoint if `N − k ≥ K`. Start with fixed K = 16, instrument replay latency, then adapt.

Invalidation: a parameter edit at time t on a stateful node invalidates that node's checkpoints and all downstream caches for frames ≥ t **to the end of the clip**. Stack reorder, channel reorder, or seed change invalidates the whole clip range. Shown in the ruler: green cached, yellow stateless live, red needs sequential render, with a checkpoint tick row.

Reset semantics: default reset at the effect clip's in-point (splitting a clip creates a free checkpoint); optional `warmup` pre-roll; optional `continue` across a split.

Background fill: after ~500 ms idle, render outward from the playhead, prioritising export range, then ahead of playhead, then checkpoints across red regions. Cache keys include a device fingerprint (GPU vendor + browser major) so caches are never silently reused across machines.

---

## 8. Media pipeline

From web-platform §B, §C, §D, §E.

### 8.1 Import

- Files via drag-drop, file picker, or File System Access handle. Copied once into OPFS (streaming) so the handle survives reloads; content-hashed.
- Probe with Mediabunny: container, codecs, dimensions, fps, duration, keyframe index. `isConfigSupported` per track decides the decode ladder.
- Audio features extracted at import (§9) and stored with the media.
- Tier gate (§10): if duration × resolution exceeds the device cap, show the cap and offer proxy transcode or trim.

### 8.2 Decode ladder (per clip)

1. WebCodecs `VideoDecoder` fed by Mediabunny, `VideoFrame` → `importExternalTexture` (Chrome 116+, Safari 26+, Firefox Win/macOS).
2. Same, but `copyExternalImageToTexture`, or `VideoFrame.copyTo()` → `writeTexture` where zero-copy is absent (Firefox Linux/Android).
3. `<video>` + `requestVideoFrameCallback` for preview only, when WebCodecs cannot decode but the media stack can play.
4. WASM software decode (libav.js / ffmpeg.wasm) for HEVC on Firefox/Linux, AV1 on Safari without hardware, ProRes, MPEG-2, AVI.
5. If 4 is needed, transcode once to H.264 High into OPFS rather than decoding repeatedly.

### 8.3 Encode and export

- Sequential render from frame 0 in the render worker, encoded by `VideoEncoder` in the encode worker, muxed by Mediabunny `Output` with `StreamTarget`.
- Targets: MP4/H.264 High (default), WebM/VP9, MP4/AV1 or HEVC where `isConfigSupported` says yes. `bitrateMode: "quantizer"` on Chrome for constant quality; VBR fallback.
- Audio: Opus everywhere; AAC where supported (not Firefox, not Linux). Verify Opus-in-MP4 playback on common players; offer WebM when AAC is unavailable (web-platform §H.18).
- Disk: `showSaveFilePicker().createWritable()` on Chrome/Edge desktop; otherwise OPFS file then download. `fastStart: 'fragmented'` for unbounded length.
- Safari workaround: force `latencyMode: "realtime"` for H.264 until the encoder deadlock fix ships (web-platform §A.5, §H.1).
- Extras: PNG sequence (zip streamed), GIF (v2).

### 8.4 ffmpeg.wasm role (D10)

Lazy separate chunk, runs in its own worker. Used only for: unsupported containers/codecs on import (then transcode to OPFS), the opt-in **authentic bake** (encode to MPEG-4 ASP or x264 single-IDR, drop/duplicate packets, decode back, sequential only), and exotic remuxes. Single-thread core when `crossOriginIsolated === false`; multi-thread via `coi-serviceworker` on static hosts or real COOP/COEP headers on a host that sets them. GPL vs LGPL build is an open decision (§15).

---

## 9. Audio

- **Features at import:** per-frame RMS, band energies (bass/mid/high and N-band FFT), onset flags, stored with the media and referenced by audio modulators. Deterministic and offline.
- **Playback (preview):** WebAudio + AudioWorklet, scheduled from the sequence frame clock.
- **Time-stretch (D6, D42):** our own WSOLA (`stretch.js`), deterministic, used for playback and export; signalsmith-stretch was considered and declined (D42). It must run off the main thread (a worker) and be fast enough for long holds.

**How duration changes are modelled.** In the simulated engine, Bloom and Pulse *hold the motion field* while sequence time keeps running, so by default they do **not** insert frames and the duration does not change. The classic "picture keeps sliding while the video gets longer" is modelled at the **timeline level** by a `Bloom Insert` command: it splits the media clip at the playhead, inserts a `hold` segment of N frames (source frozen), ripples the rest of the channel, and inserts a matching `StretchSegment` on the linked audio clip. Audio in that segment is time-stretched by the same ratio. This keeps the engine pure and keeps every duration change visible and undoable on the timeline. (Decision requested in §15.)

---

## 10. Platform compatibility layer

From web-platform §A, §G.

### 10.1 Capability probe (first run, cached, re-run on `device.lost` or version change)

Static: WebGPU core / compat / WebGL2 / none; granted limits (`maxBufferSize`, `maxStorageBufferBindingSize`, `maxTextureDimension2D`); `shader-f16`; `deviceMemory` (Chromium only); `hardwareConcurrency`; detect-gpu tier when adapter info is generic; `isConfigSupported` for H.264/VP9/AV1/HEVC decode and encode, with `prefer-hardware` configure to detect hardware.

Dynamic (≤ 300 ms, in a worker): a 1080p 4-pass compute chain timed with timestamp queries; 512 MiB then 1 GiB buffer allocation probe; 30-frame 1080p H.264 decode throughput.

### 10.2 Tiers (initial; prototype must calibrate)

| Tier | Typical devices | Preview | Max export | Clip length | Frame ring | GPU budget | OPFS cache |
|---|---|---|---|---|---|---|---|
| 0 | WebGL-only, Firefox Android, old Android | 480p/24 | 720p | 2 min, proxy beyond | 4 | 128 MiB | 1 GiB |
| 1 | WebGPU compat or WebGL2 mobile, Intel UHD, Firefox Linux | 720p/30 | 1080p | 10 min | 8 | 256 MiB | 4 GiB |
| 2 | Apple A14–A16, M1/M2, Adreno 7xx, Iris Xe, mid dGPU | 1080p/60 | 4K | unbounded (streamed) | 16 | 768 MiB | 25 % quota |
| 3 | M3+/A17 Pro+, discrete NVIDIA/AMD, 16 GB+, 2 GiB buffers | 4K/60 | 8K | unbounded | 32 | 2 GiB | 25 % quota |

Import gate (D2): on tiers 0–1 the import dialog shows the cap and offers "transcode to proxy" or "trim". 8K is gated on actually granted limits, not on tier.

### 10.6 Real-time governor (D19)

Tier sets the starting point; a governor adjusts while running. Every second it reads the measured GPU frame time, decode throughput and free VRAM estimate and moves preview resolution (full, ¾, ½, ¼), decoded-frame ring size, checkpoint spacing K and hot checkpoint count up or down one step. Import limits are recomputed from the same numbers, not from a static table, so a phone with a strong GPU gets more than a laptop on battery. The status bar shows the current governor state; the user can pin preview quality.

### 10.3 Compute ladder

WebGPU core → WebGPU compatibility mode → WebGL2 (fragment ping-pong; float FBOs) → CPU (`engine-ref`, tiny previews only). All shaders stay inside spec default limits (256 MiB buffers, 128 MiB bindings, 8192 textures). `subgroups` are never required.

### 10.4 Storage

OPFS via sync access handles in the cache worker; `navigator.storage.persist()` requested on Firefox; LRU eviction to stay under 50 % of quota; Safari's 7-day eviction documented to users. WASM stays memory32 with a 2 GB cap.

### 10.5 Hosting

Folder app on the house Caddy VPS at `iori.me/moshine/`. Add a `handle /moshine/*` block in the Caddyfile with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (or `credentialless` where supported), so multithreaded WASM works without a service-worker reload. Everything the page loads must be same-origin or carry CORP: fonts self-hosted (Urbanist from `iris-engine/fonts`), vendor libraries copied into `vendor/`, the analytics tag the SEO block injects must be verified under COEP or excluded on this path. The `@appcode` cache rule already covers `*.js *.wasm *.woff2 *.bin` with no-cache.

---

## 11. Timeline and UI

From timeline-editors §B (v1 table), §C.4.

### 11.1 v1 timeline features

- Channels: video, effect, audio; unlimited; reorderable; lock / bypass / solo.
- Clips: drag move, edge trim (non-ripple), overwrite on drop, gaps allowed, split at playhead (Cmd+B) and blade (B).
- Snapping (N) to clip edges, markers, playhead, keyframes.
- Playhead: scrub, JKL shuttle (reverse degrades gracefully), arrow frame step, Home/End, Shift+Z fit, Cmd +/− zoom at cursor, trackpad scroll.
- Markers (M) with colour and note; markers are checkpoint hints.
- Selection: click, Shift range, Cmd toggle, marquee; Delete; Cmd+D; Cmd+C/V at playhead; unlimited undo/redo covering parameters and keyframes.
- Keyframes: stopwatch toggle, diamond lane under the clip, add/remove/drag, hold/linear/ease presets, next/previous navigation. Bezier editor in v2.
- Effect stack panel: ordered list, drag reorder, enable/disable, reset, group effects collapsible, copy/paste stack, save preset.
- Modulation slots per parameter with mode, depth, clamp; modulated value drawn as a ghost curve over the keyframe lane. Trigger modulators (onset, every n, mosh hits, manual) drive Bloom and Reset.
- **Mosh hits**: H places a hit marker while playing; hits are a trigger source.
- **Mosh Cut**: a transition object at a join between media clips (see [CATALOG-REVIEW.md](CATALOG-REVIEW.md)).
- Transform & Blend intrinsic on media clips (position, scale, rotation, opacity, blend mode, fit/fill).
- Render-status bar: green / yellow / red plus checkpoint ticks.
- Export range (I/O).

Deferred: ripple/roll/slip/slide, link/unlink, nesting, waveforms (v2), speed ramps (v3), proxies (v2).

### 11.2 Rendering technology and layout

Canvas for lanes, clips and keyframes (thousands of keyframes stay smooth); DOM for headers, inspector, menus. Keyboard defaults follow Resolve/Premiere.

Layout per form factor (D19), same features everywhere: desktop docks preview, stack and timeline with floating tool windows; tablet docks preview and timeline with the stack as a floating window; phone uses petri's bottom-sheet idiom, with preview on top and timeline, stack or effects as the sheet, and touch sizes from the house `--touch` tokens. Scrubbing, keyframes and hits must be usable with touch.

### 11.3 Visual identity

Two candidates, both built into the wireframe ([ux/wireframe.html](ux/wireframe.html), caption button toggles): the house **Program Manager** idiom shared with iris-engine and petri (navy caption, menu bar, grey windows, scrubber knobs, Urbanist, site burger as the caption control box, phone mode as a bottom sheet), or the legacy **brutalist** system (black / red / yellow, thick borders, mono). Decided: Program Manager (D16).

### 11.4 Preview

OffscreenCanvas from the render worker; quality scaling (full/half/quarter) decoupled from export; motion-field overlay toggle (arrows, block grid, SAD heatmap) shared with the lab.

---

## 12. Testing and the algorithm lab

This answers the original question of developing and testing the algorithms with images.

### 12.1 CPU reference

Every node has a TypeScript implementation in `engine-ref` operating on `Float32Array` images. It is the oracle for GPU parity tests and the tier-0 CPU path.

### 12.2 Fixtures

Procedurally generated, deterministic, no binaries in the repo: moving square, panning checkerboard, rotating gradient, textured noise with known block displacements, synthetic scene cut, 4:2:0-style colour edges. Each fixture ships its ground-truth motion field. One small CC0 real clip may be added for visual tests only.

### 12.3 Algorithm lab (`/lab`)

A developer page that loads an image sequence or a video, lets you pick a node chain and parameters, steps frames, shows the motion field overlay and SAD heatmap, diffs GPU against CPU, and exports PNG sequences. This is where the mosh look is tuned and where the A/B against an ffmpeg bake happens (datamoshing §E.2).

### 12.5 Fidelity bench (D25)

Reference: ffmpeg.wasm LGPL build in a worker encodes the input to MPEG-4 ASP (`-g 9999 -bf 0`, qscale fixed), exports per-macroblock vectors, and decodes the operated bitstream (I-frame dropped, P-frames duplicated) back to frames. The lab runs the same operation through the simulation and reports: field end-point error against the exported vectors (median and 90th percentile, per frame), perceptual distance between simulated and decoded frames over the first 60 frames after the operation, and the per-block intra and skip agreement. Results go to `ref/fidelity-<tag>.json` via `tools/bench.mjs`; budgets live in `study/00-summary-and-spec.md` and tighten per release. The coverage matrix (`study/coverage.md`) is checked by the catalogue smoke test: every reference operation names a node or parameter that exists.

### 12.4 Test suites

Runner: the petri idiom. `harness.js` runs in the page against `window.__dm` (GPU promises only, no timers), and `tools/bench.mjs` drives the installed Chrome headless and writes `ref/bench-<tag>.json`. Pure-JS suites (timeline commands, migrations, modulators) run under `node --test` as `tests/*.test.mjs`.

| Suite | Runner | What it asserts |
|---|---|---|
| Unit | `node --test` | engine-ref nodes vs analytic expectations on fixtures; modulators pure; timeline commands invertible under undo; project migrations round-trip |
| GPU parity | harness T0 | Each WGSL node within tolerance of engine-ref on fixtures |
| Determinism | harness T0 | Render frame N sequentially vs via checkpoint replay from random scrub paths: bit-identical; Mosh ID replays to the same hash |
| Golden | harness T0 | Per-frame hashes of preset stacks on fixtures; failures write side-by-side PNGs to `ref/` |
| Media | harness T1, run by hand in Safari and Firefox | Import/decode/encode ladders on short real clips; export plays back |
| Perf | harness T4 | Frames/s per tier for a reference stack; regression thresholds |

---

## 13. Milestones

Ordered for D25: the engine and its fidelity bench come first, the editor follows.

| M | Name | Scope | Exit criteria |
|---|---|---|---|
| 0 | Scaffold ✔ 2026-10-09 | Folder layout, git, `serve.py` + launch config, WebGPU hello in the shell, fixture generators, harness skeleton, `legacy/` move | Done: 14 node tests and 5 T0 rows pass headless (`ref/bench-m0.json`) |
| 1 | Engine core + lab ✔ 2026-10-09 | Block matching, Mosh Loop with Reset/Bloom/Residual/Intra/Lost sectors, field transforms, engine-ref, lab page with image-sequence and video in, PNG out, overlays | Done: 32 node tests, 15 T0 rows and the T1 real-footage row pass (`ref/bench-m1.json`); loop bit-identical GPU vs CPU |
| 2 | Fidelity bench ✔ 2026-10-09 | Native libavcodec reference (D30): real MPEG-4 ASP bake with I-frame drop and P-frame duplication, exported vectors; lab A/B view; vector and SSIM/PSNR metrics against baselines; sweep; first budgets | Done: `ref/fidelity-m2.json`, budgets in `tools/fidelity-budgets.json`, findings in `study/fidelity.md` |
| 3 | Effect library ✔ 2026-10-09 | Every v1 node in [CATALOG-REVIEW.md](CATALOG-REVIEW.md), optical flow style, style presets, legacy presets, coverage matrix | Done: 12 effects in-loop/post, flow, amplify, mosh map, smooth field; 14 styles + 12 legacy presets with a gallery; [coverage.md](coverage.md) 84 v1 + 10 partial rows resolved by test; H.264 fidelity bench |
| 4 | Media pipeline ✔ 2026-10-09 | Import to OPFS, decode ladder 1–2, streaming MP4 export, tier probe and governor v0 | Done: see the M4 section of HANDOFF.md and `ref/bench-m4-long.json` |
| 5 | Timeline v1 ✔ 2026-10-10 (core) | Data model, command bus, undo, canvas timeline, keyframes, effect stack, modulators and triggers, mosh hits, Mosh Cut, Bloom Insert, preview, Mosh ID | Done; the small §11.1 items were closed after step 7 (keyframe interp and navigation, stack copy and presets, effects browser, project Mosh ID). Left: fast J reverse (needs M6), pinch on a real device. Evidence: `ref/bench-m5-items.json`, `ref/bench-m5-step7.json` (timeline export = M4 export, seek = playback on edited real video, editor drags), 107 node tests |
| 6 | Cache and scrubbing ✔ 2026-10-10 | Four-layer cache, lossless checkpoints, invalidation, status bar, background fill | Met on this Mac (tier 3): 30 random seeks in a 5-minute 1080p sequence previewed at 540p, median 54 ms, worst 97 ms, all bit-exact (`ref/bench-m6-scrub.json`). Tier 2 not verified; levers are a preview proxy and the matcher. Layers 1 (decoded-source ring) and 2 (channel-output cache) were not needed and are not built |
| 7 | Audio ✔ 2026-10-10 | Features at import (from M1 for modulators), **playback**, Bloom Insert time-stretch, export mix | Done: T1 `audioReactive` (Onset bloom holds start on the clicks of `beat.mp4`, frames 6, 21, 36, 51) and `exportMix` (a 15-frame Bloom Insert exports with the mix: clicks before and after the stretch within 0 ms, audio ends 27 ms after the video, one AAC frame of padding); `ref/bench-m7.json` |
| 8 | Compatibility | Decode ladders 3–5, WebGL2 backend, Safari and Firefox QA, Firefox preview-only mode | Core flow works on Safari 26 and Firefox current on macOS; governor caps shown on an iPhone |
| 9 | Public ✔ 2026-10-10 (early, D43) | Move to `iori/moshine/`, `pages.meta.json`, site menu | Done: live at iori.me/moshine/ (iori `b222691`); lab hidden; no COOP/COEP (D44) |
| 9b | Bake and library | Authentic bake as opt-in export (ffmpeg.wasm, LGPL; then the `/moshine/*` COOP/COEP block), v2 library (dither, analog, pixel sort, slit-scan, sort, gravity, temporal average), docs | Bake matches the native reference within the fidelity budgets; site menu and analytics still work under COEP |
| 10 | Live rack (v2) | Capture input, live clock, output window, MIDI mapping, OSC bridge | A stack from the timeline runs live at 60 fps on tier 2 |

---

### 13.1 Owner requests (2026-10-10), to schedule after M6

| # | Request | Shape it will take |
|---|---|---|
| R1 ✔ | Remove the black borders between the docked windows | The desk's 4 px black gap and pane borders become the shell's grey bevel, with no black channel between panes (ui.css desk grid). |
| R2 ✔ | Paint the motion vectors of the moshes that have them | A vector brush on the preview, for a Mosh Loop on its effect clip: strokes write a per-clip vector field (direction and strength from the drag) that is added to, or replaces, the estimated field inside the brush, keyframeable over time. It enters the loop as a field op (GPU + CPU twins, D28) and is stored in the project as strokes, not pixels, so it stays deterministic and editable. |
| R3 ✔ (in-loop lock refresh ✔ D40; tracking and on-canvas handles still open) | Masks: limit where a mosh applies, and a lock brush that keeps the mosh off an area | Per effect clip: an include mask (mosh only here) and a lock mask (never here), painted with a brush or drawn as shapes, feathered, with keyframes or tracking over time. Applied at the loop's output as a mix with the clean composite (lock = always clean), and optionally as a refresh mask inside the loop (locked blocks reset from the source every frame). Stored as strokes and shapes in the project. |
| R4 (first pass ✔; masks ✔ with R3) | A streamlined, intuitive path: import, apply a preset, mask each mosh, keyframe its shape or properties | A guided first screen (drop a video → it is on the timeline and previewing), a preset strip with live thumbnails that applies to the selection with one click, mask and vector tools on the preview with obvious on-canvas handles, a stopwatch next to every control, and fewer windows open by default. Designed against the wireframe, tested on desktop, tablet and phone (D19). |
| R5 | App icon | The owner provides an SVG (`moshine/icon.svg`); it becomes the favicon, the caption control box image and the iori.me site-menu entry at the move (M9). |

## 14. Risks

Condensed from web-platform §H and datamoshing §E.

1. **Look fidelity.** A plain SAD matcher may produce fields that read as motion blur rather than mosh; the residual model is unvalidated. Mitigation: lab A/B vs real bake, lambda/predictor tuning, style presets.
2. **Firefox gaps.** No WebGPU on Linux release, no zero-copy frame import on Linux/Android, no WebCodecs on Android. Mitigation: ladders; decide support level (§15).
3. **Safari.** AV1 hardware-only, H.264 encoder deadlock in 27.0, 30 % of adapters grant 2 GiB buffers, 7-day storage eviction, tab memory ~1.5–3 GB on older iPhones.
4. **Checkpoint memory.** 1080p `rgba16float` is 16 MB; K = 16 on a 10 s clip is ~300 MB per stateful node if all hot. Mitigation: few hot, spill, budget by tier.
5. **ffmpeg.wasm licensing and size.** Official core is GPL (x264/x265). Decide before any public release.
6. **Decoder determinism across GPUs** is asserted, not measured. Caches are device-scoped; export never uses checkpoints.
7. **Speed ramps** conflict with recurrence; deferred to v3 by design.

---

## 15. Open decisions (owner input needed)

1. ~~Bloom duration model~~ resolved: Bloom holds the field; Bloom Insert extends the timeline (D18).
2. **Mosh Loop as a group effect** with in-loop children (§5.4) is what the wireframe shows; treated as accepted unless objected to.
3. ~~Audio playback~~ resolved: audio milestone (D24).
4. **Workflow template semantics** proposed in §6.6 are treated as accepted; adjust in the lab when the looks exist.
15. ~~Name~~ resolved: **MOSHINE** (D26).
5. ~~Checkpoint spills~~ resolved: lossless (D22).
6. ~~Licence and ffmpeg build~~ resolved: private app, LGPL ffmpeg (D20).
7. ~~Firefox Android and Linux~~ resolved: preview-only (D21).
8. ~~Extra inputs~~ resolved: source picker in v1 (D23).
9. ~~Hosting~~ resolved: house Caddy with per-path COOP/COEP (D15).
10. ~~Visual idiom~~ resolved: Program Manager (D16).
11. ~~Live mode~~ resolved: v2, designed for now (D17).
12. ~~Phone~~ resolved: one editor everywhere, governed in real time (D19).
13. ~~Mosh Cut between clips of different sizes~~ resolved by the model: every channel output is sequence-sized after Transform & Blend, and a Mosh Loop estimates its field on the composite below it, so there is never a size mismatch. Source-picker inputs are sequence-sized for the same reason.
14. **Hosting** is resolved by the house Caddy (D15); item 9 is closed.
16. ~~Looks grouping, signalsmith, locked areas, deploy before M7~~ resolved 2026-10-10: D40 (locks inert), D41 (Looks kept, dense UI), D42 (own code, made fast), D43 (public early).

---

## 16. Glossary

- **Channel:** a timeline track. Video, effect (adjustment), or audio.
- **Effect clip:** a ranged adjustment clip holding an effect stack; processes the composite below it.
- **Stateful / recurrent node:** a node whose output depends on its own previous output. Only these need checkpoints.
- **Checkpoint:** a snapshot of a stateful node's state at frame k.
- **Field:** the motion-vector texture, one vector per block.
- **Bloom:** holding the motion field for N frames (engine) or inserting N held frames (timeline `Bloom Insert`).
- **Tier:** device capability class 0–3 that sets limits.
