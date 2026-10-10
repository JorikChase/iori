# Timeline editors, effect stacking, and render caching: research for DATAMOSHINE

Status: research note, 2026-10-09. Feeds the engineering spec. Claims are cited inline; items marked `[unverified]` are from working knowledge and should be checked before they become requirements.

Context: DATAMOSHINE is a browser-based (TypeScript, WebGPU, WebCodecs) editor whose job is applying stackable, keyframeable datamosh/glitch effects on timeline tracks ("channels"), with a scrubbable live preview and a render cache. Procedurality (effect stacks, keyframes, modulators, maybe node graphs) is the priority; the timeline is the primary tool.

Contents

- A. Feature matrix across editors
- B. Minimal timeline feature set for an effects-first editor (v1 / v2 / v3)
- C. Effect stacking and modulation paradigms, with a recommendation
- D. Reusable libraries, with license and verdict
- E. Render cache / checkpoint architecture for recurrent effects
- F. Project file format recommendation
- G. Open questions

---

## A. Feature matrix across editors

Editors surveyed: DaVinci Resolve (Edit page), Premiere Pro, Final Cut Pro, CapCut desktop, Kdenlive, Shotcut, Olive 0.2. Blender's VSE and After Effects appear as reference points in later sections.

Legend: Y = yes, first-class; P = partial / via workaround; N = no; ? = not confirmed in sources.

| Feature | Resolve | Premiere | FCP | CapCut | Kdenlive | Shotcut | Olive 0.2 |
|---|---|---|---|---|---|---|---|
| Track model | Unlimited V/A tracks | Unlimited V/A tracks | Trackless "magnetic" primary storyline + connected clips, roles instead of tracks | Main track + overlay tracks, "main track magnet" toggle | Unlimited typed A/V tracks | Multi-track V1..Vn / A1..An, blend modes per video track | Multi-track |
| Ripple trim | Y (Trim mode T, context-sensitive) | Y (Ripple tool B) | Y (default trim behaviour of magnetic timeline) | P (magnetic main track only) | Y (Ripple tool) | Y (global "Ripple" toggle, "Ripple All Tracks") | Y (Ripple tool) `[unverified]` |
| Roll trim | Y | Y (Rolling tool N) | Y (Trim tool) | N/? | Y (drag edit point) | P | Y (Rolling tool) `[unverified]` |
| Slip / slide | Y / Y | Y (Y) / Y (U) | Y / Y (Trim tool) | N/? | Slip Y / slide ? | N | Y / Y `[unverified]` |
| Dynamic (JKL) trim | Y (W) | P | P | N | N | N | N |
| Split / blade | Y (B tool; Cmd+\ split; Cmd+B) | Y (Razor C; Cmd+K add edit) | Y (Blade B; Cmd+B; Shift+Cmd+B all) | Y (split button / Cmd+B) `[unverified]` | Y (Razor tool) | Y (S) | Y (Razor) |
| Snapping | Y (N) | Y (S) | Y (N) | Y (auto-snap toggle) | Y (magnet) | Y (clips stick to edges/playhead) | Y |
| Markers | Y (M, duration, colour, notes) | Y (M) | Y (M; to-do/chapter) | Y | Y (guides + clip markers) | Y (markers + ranges, ripple-markers option) | Y |
| Zoom/scroll | Cmd +/-, Shift+Z fit | +/-, \ fit | Cmd +/-, Shift+Z | Y | Y | +/- and slider | Y |
| JKL shuttle | Y | Y | Y (L repeated = faster) | ? | Y | Y | Y |
| Nested / compound clips | Compound clip, Fusion clip | Nested sequence | Compound clip (Opt+G) | Compound clip | Sequences (nested timelines) | P (open MLT XML as clip) | Y (sequence as clip) |
| Adjustment layers | Adjustment clip (processes composite below) | Adjustment layer | P (Motion "adjustment layer" title hack) | Y (adjustment layer) | P (track effects + master effects) | P (track filters + Output filters) | P (nodes) |
| Per-clip vs per-track effects | Per-clip (Inspector, Fusion, Color nodes); timeline-level grade on Color page | Per-clip (Effect Controls) | Per-clip (Inspector) | Per-clip + effect clips on own track | Per-clip, per-track, master | Per-clip, per-track, Output | Per-clip node graph |
| Effect stack ordering | Inspector order; Color page node tree (serial/parallel/layer) | Top-to-bottom; fixed effects (Motion, Opacity) render after standard effects | Top-to-bottom in Inspector | Top-to-bottom | Top-to-bottom, drag to reorder, effect zones | Top-to-bottom, drag to reorder | Explicit node connections |
| Keyframes + curve editor | Inspector keyframes; unified Keyframe & Curves editor (Resolve 21) with 4-point Bezier | Effect Controls keyframes, temporal interpolation (linear/Bezier/hold), basic velocity graph; no full graph editor | Inspector + Video Animation editor with curves | Keyframes + keyframe graph editor | Keyframes in stack and on clip; interpolation types | Keyframes panel (discrete/linear/smooth, eases) | Curve editor (Bezier) |
| Speed ramps | Retime controls + retime curves (Bezier in 21) | Time Remapping (rubber band) + Rate Stretch | Retime editor (Cmd+R) | Curve Speed with presets (Montage, Hero, Bullet) | Time Remap effect | Time Remap filter + Speed property | Speed/time nodes `[unverified]` |
| Audio waveforms | Y | Y | Y | Y | Y (rewritten in 25.04, 2x faster) | Y | Y |
| Render cache / proxies | Smart/User cache, Fusion output & Color output caches, proxies, optimized media | Preview files; red/yellow/green render bar; proxies | Background rendering, proxies | Proxies | Timeline preview zones (red/yellow/green), proxies | Proxies, preview scaling; no persistent render cache | Disk cache per sequence, background caching |
| Link/unlink A/V | Cmd+Shift+L toggle linked selection | Cmd+L; sync offset tracked after unlink | Detach (Ctrl+Shift+S) / Expand (Ctrl+S) | Separate/extract audio | Split A/V on insert; group/ungroup | Detach audio | Y |
| Multi-select | Click, Cmd-click, lasso, track select | Lasso, Shift-click, Track Select (A) | Lasso, range select (R) | Lasso, Shift-click | Lasso, Shift-click, groups | Click, Shift-click | Lasso |
| Node graph | Fusion page (per clip), Color page nodes | N | N | N | N | N | Y (core model) |
| License / platform | Proprietary; free tier | Proprietary | Proprietary (macOS) | Proprietary | GPL-3 `[unverified]` | GPL-3 | GPL-3, alpha |

Sources for the matrix:

- Resolve trim modes, dynamic trim (W), JKL trimming, Trim mode (T): [Blackmagic Edit features](https://www.blackmagicdesign.com/products/davinciresolve/features/edit), [Ripple Training on dynamic trimming](https://www.rippletraining.com/?p=12210), [Premiumbeat on dynamic trim](https://www.premiumbeat.com/blog/dynamic-trim-tool-resolve/). Shortcuts (A/B/T/W, JKL, I/O, Cmd+\ split, M marker, N snapping, Shift+Z fit, Cmd+Shift+L linked selection, `,`/`.` nudge, E extend): [DaVinci Resolve Club shortcuts guide](https://davinciresolveclub.com/davinci-resolve-keyboard-shortcuts-guide/). Keyframe and curves editor in Resolve 21, retime curves with 4-point Bezier, Fusion properties keyframed inline on the Edit page: [jayaretv](https://jayaretv.com/news/new-keyframe-and-curves-editor-in-davinci-resolve-21/), [DaVinci Resolve Club on keyframes](https://davinciresolveclub.com/davinci-resolve-keyframes-curve-editor/). Adjustment clip vs Fusion composition: [tryuncle](https://tryuncle.com/learn/davinci-resolve/davinci-resolve-adjustment-clip-vs-fusion-composition). Cache levels: see section E.
- Premiere: effects apply top-to-bottom, fixed effects (Motion, Opacity, Time Remapping) listed in Effect Controls, stopwatch keyframes: [Adobe keyframes help](https://helpx.adobe.com/premiere-pro-next/add-video-effects/apply-video-effects/keyframes-in-premiere-pro.html), [Evergreen wiki on effects](https://helpwiki.evergreen.edu/wiki/index.php/Effects_-_Premiere_Pro), [O'Reilly "Using multiple effects"](https://www.oreilly.com/library/view/premiere-65-for/0321130081/0321130081_ch11lev1sec8.html). Fixed effects render after standard effects (video effects first, then Motion, then Opacity/alpha): [Adobe community thread](https://community.adobe.com/t5/premiere-pro-discussions/track-matte-key-am-i-doing-something-wrong/m-p/5181439/highlight/true). The graph editor is a long-standing feature request: [Adobe ideas](https://community.adobe.com/t5/idea-premiere-pro/advanced-&-user-friendly-graph-editor-for-premiere-pro-(speed-+-value)/idi-p/15387812). Tool keys (V, C, B, N, Y, U, A, R, P, H, Z, T; S snap; Q/W; Cmd+K): [Adobe default shortcuts](https://helpx.adobe.com/au/premiere-pro/using/default-keyboard-shortcuts.chromeless.html), [Premiumbeat beginner guide](https://www.premiumbeat.com/blog/beginners-guide-to-premiere-pro-shortcuts/). Link/unlink and tracked sync offset: [Adobe link multiple clips](https://helpx.adobe.com/premiere-pro-next/add-audio-effects/edit-audio/link-multiple-audio-clips.html). Render bar colours: [Adobe blog](https://blog.adobe.com/en/publish/2011/02/20/red-yellow-and-green-render-bars).
- FCP: magnetic timeline, compound clips, connected clips, Precision Editor, trim behaviours: [Apple FCP user guide](https://support.apple.com/guide/final-cut-pro/verb8fcfc133/mac), [Frame.io on the magnetic timeline](https://blog.frame.io/2017/10/16/fcpx-magnetic-timeline/). Shortcuts (JKL, Cmd+B, Shift+Cmd+B, N, Opt+G, Ctrl+Shift+S detach, Ctrl+R render): [Apple shortcuts](https://support.apple.com/guide/final-cut-pro/ver90ba5929/mac), [Premiumbeat FCPX cheat sheet](https://www.premiumbeat.com/blog/the-big-cheat-sheet-of-final-cut-pro-x-shortcuts/).
- CapCut: keyframe graph editor, Curve Speed presets, compound clips, adjustment: [CapCut "How to use CapCut"](https://capcut.com/resource/how-to-use-capcut), [CapCut tool cheat sheet (PDF)](https://litcommerce.com/wp-content/uploads/2026/03/CapCut-ToolCheat-Sheet.pdf).
- Kdenlive: tools (Select, Razor, Spacer, Slip, Ripple), track lock/mute/hide, keyframes on clip, preview zones red/yellow/green, Shift+G keyboard navigation: [Kdenlive timeline docs](https://docs.kdenlive.org/en/user_interface/timeline.html); effect stack, effect zone, keyframes: [Kdenlive effects docs](https://docs.kdenlive.org/en/effects_and_filters.html); 25.04 (OTIO import/export, rewritten waveforms, GPU filters): [kdenlive.org release](https://kdenlive.org/news/releases/25.04.0/).
- Shotcut: tracks, snapping, ripple, overwrite/insert/lift, markers, zoom, shortcuts: [Shotcut forum "About the Timeline"](https://forum.shotcut.org/t/about-the-timeline/12952); keyframes on audio filters, ripple markers: [Neowin release notes 23.11](https://www.neowin.net/software/shotcut-231129).
- Olive 0.2: node-based compositing, standard panels, timeline tools: [DebugPoint review](https://www.debugpoint.com/olive-0-2-video-editor-review/); GPL-3, alpha status: [GitHub](https://github.com/olive-editor/olive); `.ove` is XML: [filext](https://filext.com/file-extension/OVE).

Observations that matter for us:

1. Every editor converges on the same core vocabulary: select, blade, trim (ripple/roll/slip/slide), snap, markers, JKL, nudge with `,`/`.`, I/O, Shift+Z fit. There is no reason to invent new conventions; use Resolve/Premiere defaults where they agree (A/V select, B/C blade, N/S snap, M marker, JKL, I/O, Cmd+Z undo, Cmd+B/Cmd+K split).
2. Effect ordering is almost always a linear top-to-bottom stack per clip, with "fixed"/intrinsic effects (transform, opacity) applied at a fixed position after the user stack (Premiere) or in a fixed render order (After Effects: masks, effects, transforms, then blending/layer styles; see [School of Motion on collapse transformations](https://www.schoolofmotion.com/blog/collapse-transformations-continuously-rasterize-after-effects)). Only Olive and Resolve's Fusion page expose a real graph.
3. Keyframe UX has standardised on: stopwatch/diamond toggle per parameter, keyframe lane under the clip, a separate curve/graph editor with Bezier handles and presets. Resolve 21 and CapCut both recently invested here, so a lane + curve editor is table stakes even for a consumer tool.
4. Adjustment layers / "effect clips on their own track" (CapCut, Resolve adjustment clips, Premiere adjustment layers) are exactly DATAMOSHINE's "channel" model: an effect clip that processes everything composited below it for its time range. This is the dominant mental model for stacking effects over time, and it maps cleanly to a per-channel stack.
5. Render cache UI is consistently a coloured bar in the ruler: green = cached, yellow = can play unrendered, red = must render (Premiere, Kdenlive preview zones, Blender's yellow simulation-cache line).

---

## B. Minimal timeline feature set for an effects-first editor

Framing: DATAMOSHINE is not a story editor. Users will typically have one (or a few) source clips and spend most of their time arranging and animating effect clips on channels above them. The timeline must be excellent at (a) placing and moving effect ranges, (b) keyframing parameters, (c) showing where the cache is valid. Classic cut-editing features (ripple/roll/slip/slide, nesting, link/unlink audio) are secondary.

Data model assumptions used below (to be confirmed in the spec):

- A `Sequence` has a timebase (integer fps or rational), a duration, and ordered `Channels`.
- A `Channel` is either a media channel (holds `MediaClips` referencing decoded sources) or an effect channel (holds `EffectClips`). Channels composite bottom-up; an effect clip processes the composite of all channels below it for its range, exactly like an adjustment clip.
- An `EffectClip` holds an ordered effect stack (one or more effect instances), each with parameters that can be static, keyframed, or modulated.
- All time is stored as integer frame counts at the sequence timebase (see section F).

### v1: the core loop (must ship)

| Feature | Rationale |
|---|---|
| Media channel(s) + effect channels, unlimited count, reorderable, with lock / mute (bypass) / solo | Channel order is the effect stack order; bypass and solo are how users audition a mosh. Lock prevents accidental moves. Equivalent to Kdenlive track lock/mute/hide. |
| Clip move (drag), edge trim (plain, non-ripple), overwrite on drop, gap allowed | Effect ranges are usually edited independently; gaps are meaningful (no effect). Ripple behaviour would move unrelated effect clips. |
| Split at playhead (Cmd+B) and blade tool (B) | Needed to break an effect clip so two ranges get different stacks or to create a reset point for recurrent effects (section E). |
| Snapping (N toggle) to clip edges, markers, playhead, keyframes | Standard; snapping to keyframes matters more here than in cut editors (Blender 4.4 added snapping to retime keys for the same reason: [Blender 4.4 sequencer notes](https://developer.blender.org/docs/release_notes/4.4/sequencer/)). |
| Playhead scrubbing with frame-accurate preview; JKL shuttle; arrow-key frame step; Home/End; Shift+Z fit; Cmd +/- zoom; horizontal scroll with trackpad; zoom centred on cursor | Frame-step and scrub are how glitch artists inspect a mosh. JKL reverse play is a stress test for the cache; ship it but allow it to degrade (section E). |
| Markers (M) with colour and note, timeline-level | Cheap, universally expected, and they double as checkpoint hints. |
| Selection: click, Shift-click range, Cmd-click toggle, marquee; Delete; Cmd+D duplicate; Cmd+C/V with paste at playhead; Cmd+Z/Shift+Cmd+Z undo/redo | Every surveyed editor has these. Undo must cover parameter and keyframe edits, not just clip edits (Omniclip, Shotcut both advertise unlimited undo). |
| Per-parameter keyframes: stopwatch toggle, diamond lane under the clip in the timeline, add/remove/drag keyframes, hold/linear/ease-in-out/Bezier interpolation, "next/previous keyframe" navigation | Universal UX (Premiere stopwatch, Kdenlive double-click to add, drag off clip to delete). Bezier handles can come in v2 if the lane supports presets first. |
| Effect stack panel for the selected clip: ordered list, drag to reorder, enable/disable per effect, reset, copy/paste stack, save preset | Mirrors Premiere Effect Controls / Kdenlive effect stack / Shotcut filters. |
| Render-status bar in the ruler per channel or merged: green (cached), yellow (cheap, renders live), red (needs sequential render) | Premiere's three colours are well understood; we add the "recurrent" meaning to red (section E). |
| Export range (I/O) | Needed for render and for scoping cache work. |

Explicitly deferred from v1: ripple, roll, slip, slide; link/unlink; nesting; audio waveforms; speed ramps; proxies.

### v2: fluency

| Feature | Rationale |
|---|---|
| Ripple delete and ripple trim for media channels only (Shift+Delete, or a global "ripple" toggle à la Shotcut) | Once users cut source footage, ripple becomes necessary. Keep it off for effect channels by default. |
| Roll and slip for media clips (Trim tool T; slip via Y/Option-drag) | Slip is the only trim that is essential for footage; roll is cheap once ripple exists. |
| Curve editor (graph) for keyframes with Bezier handles, multi-select of keyframes, box-scale, presets | This is where Resolve 21 and CapCut both ended up; needed for serious animation. |
| Audio waveform on media channels and audio-reactive modulators (section C) | Waveforms guide placement of glitch hits on beats (Kapwing cites this exact user behaviour: [web.dev Kapwing case study](https://web.dev/case-studies/kapwing)). |
| Effect zone within a clip (Kdenlive-style in/out for an individual effect in a stack) | Lets a stack hold effects with different ranges without splitting the clip. Optional; split-clip covers most cases. |
| Proxies / preview resolution scaling (half/quarter) | Standard performance lever; interacts with cache keys. |
| Keyboard-driven nudge (`,` `.` 1 frame, Shift for 5/10) and "extend edit to playhead" (E) | Precision work on glitch hits. |
| Clip grouping and multi-clip keyframe editing | Secondary. |

### v3: structure and scale

| Feature | Rationale |
|---|---|
| Compound / nested sequences (sequence as clip) | Lets users re-mosh an already moshed result and keeps channel counts sane; also the natural unit for cache baking. Olive, FCP, Resolve, CapCut all have it. |
| Slide trims; dynamic JKL trimming | Pro polish; low value for effects work. |
| Speed ramps / time remapping | High value creatively but hostile to recurrent effects (frame N-1 is no longer a single well-defined frame). Only after the cache model is solid; see G. |
| Node view for the selected effect clip (section C) | Only if the stack + modulator model proves limiting. |
| Link/unlink A/V, roles | Needed only if DATAMOSHINE becomes a general editor. |
| OTIO export, FCPXML export | Section F. |

Rationale for the split: v1 is the smallest timeline that makes the effect-channel model usable and testable against the cache; v2 adds the things that make long sessions comfortable; v3 adds structure that is only valuable once projects grow.

---

## C. Effect stacking and modulation paradigms

### C.1 How the surveyed tools stack effects

| Paradigm | Examples | Ordering rule | Strengths | Weaknesses |
|---|---|---|---|---|
| Per-clip linear stack | Premiere Effect Controls, FCP Inspector, Kdenlive effect stack, Shotcut filters, CapCut | Top-to-bottom; intrinsic transform/opacity at a fixed position | Fast to learn, fits in a side panel, trivially serialised, maps directly to a shader chain | No fan-in/fan-out, no reuse of an intermediate result, mattes need special-case effects |
| Layer stack + render order + expressions | After Effects | Fixed per-layer order (masks, effects, transforms, matte, styles); effects top-to-bottom; expressions link any property to any other property | Keyframing and time arrangement stay in one view; expressions give procedural power without a graph | Render order is implicit and surprising (collapse transformations flips it); large comps become unreadable ([Prolost "Nodes vs Layers"](https://prolost.com/blog/2004/7/12/nodes-vs-layers.html), [CGHeven comparison](https://cgheven.com/blog/compositing-software-comparison-2026-nuke-after-effects-davinci-resolve)) |
| Effect clips on their own track / adjustment layers | CapCut effect track, Resolve adjustment clip, Premiere adjustment layer | Vertical track order is the stack order; each effect clip processes the composite below it for its range | Time range and stacking are visible in the same place; perfect for "apply this mosh from 0:04 to 0:09" | Per-track stack order is global for the range; reordering needs moving tracks |
| Colour node tree | Resolve Color page | Serial / parallel / layer mixer nodes, per clip or per timeline | Readable for a handful of nodes, supports fan-out via parallel mixer | Separate from the timeline; still DAG |
| Full compositing node graph | Fusion, Nuke, Olive 0.2, Blender compositor, Notch, TouchDesigner | Explicit edges | Non-destructive, readable at 40+ nodes with backdrops, reuse of intermediates, typed inputs (mattes, auxiliary buffers) | Slower for simple cases, needs a second editor view, timeline becomes secondary, harder to keyframe at a glance; DAGs cannot express feedback natively (Fusion thread: [BMD forum](https://forum.blackmagicdesign.com/viewtopic.php?p=745634)) |
| Chained DSL | Hydra, Noisemaker | Fluent chaining `src().modulate().out(o0)`, numbered buffers for feedback | Extremely compact; feedback is a first-class idea (`src(o0)` reads the previous frame) | Code, not UI; not keyframeable without wrapping |

Sources: Olive node description ([DebugPoint](https://www.debugpoint.com/olive-0-2-video-editor-review/)), Hydra feedback buffers ([hydra-synth README](https://github.com/hydra-synth/hydra-synth), [CDM on Hydra](https://cdm.link/?p=91363)), TouchDesigner Feedback TOP ([Derivative docs](https://docs.derivative.ca/Feedback_TOP)), Noisemaker DSL ([docs](https://docs.noisemaker.app/)), Shader Lab layer stack ("Effect layers transform everything below them, and they stack"; every parameter animatable on a timeline) ([basement.studio](https://eng.basement.studio/tools/shader-lab/about)), MasterSelects effect graphs with typed connections ([SourcePulse summary](https://www.sourcepulse.org/projects/26284920)).

### C.2 Modulators: what exists and how they attach

| Modulator | Where | Attachment model | Determinism |
|---|---|---|---|
| Keyframes with interpolation | All NLEs | Per parameter, stopwatch toggle | Pure function of time |
| Expressions (JS-like) | After Effects: `wiggle(freq, amp)`, `loopOut()`, `posterizeTime()`, `seedRandom(seed, timeless)`, property pick-whip links | Per parameter; expression result replaces/offsets keyframed value | `wiggle` and `random` are seeded per layer index and per frame, so re-evaluation is deterministic ([ProVideo Coalition on random numbers](https://www.provideocoalition.com/deeper_modes_of_expression_part_10_random_numbers/), [Adobe forum on random vs noise](https://community.adobe.com/t5/after-effects-discussions/random-vs-noise/m-p/3277468/highlight/true)) |
| LFO / oscillator operators | TouchDesigner LFO CHOP (time-sliced waveform), Wave CHOP; Notch modifiers | Export a channel to a parameter via drag or by naming channels `path:param` ([Derivative LFO CHOP](https://docs.derivative.ca/LFO_CHOP), [CHOP Export](https://docs.derivative.ca/CHOP_Export)) | LFO CHOP is stateful ("generates its waveform as it goes" when frequency changes); Wave CHOP is a pure function of time |
| Audio-reactive | Notch Sound Modifier, Sound FFT Modifier with drawn frequency region, FFT Region modifier ([Notch manual](https://manual.notch.one/2026.2/en/docs/reference/nodes/modifiers/sound-fft-modifier/)); TouchDesigner Audio Spectrum CHOP; Hydra `a.fft[n]` | Modifier node outputs a numeric value connected to a parameter with an operation (add/multiply/replace) | Deterministic if computed from the decoded audio track at frame time, not from a live input |
| Array sequencing and functions of time | Hydra: arrays cycle at a BPM with `.fast()`, `.smooth()`, `.ease()`; any numeric param accepts `() => f(time)` ([Hydra docs](https://hydra.ojack.xyz/docs/docs/learning/sequencing-and-interactivity/)) | Replace a literal with an array or function | Pure function of time |
| Signals (reactive values) | Motion Canvas signals: memoised dependencies, re-evaluated when inputs change ([Motion Canvas docs](https://motioncanvas.io/docs)) | Any property can be a signal derived from other signals | Pure |
| Simulation / feedback zones | Blender simulation zone (state carried frame to frame, cached while playing, baked for random access) ([Blender 4.2 manual](https://docs.blender.org/manual/en/4.2/modeling/geometry_nodes/simulation/simulation_zone.html)); TouchDesigner Feedback TOP; Notch Frame Feedback ([Notch manual](https://manual.notch.one/0.9.23/en/docs/nodes/post-fx/blur/frame-feedback/)); Sapphire S_Feedback ([Boris FX docs](https://borisfx.com/documentation/sapphire/ae/feedback/)) | A node or effect that reads its own previous output | Stateful; see section E |

### C.3 UX trade-offs, condensed

- Stacks win on learnability, panel real estate, serialisation, and direct mapping to a GPU pass list. They lose when an effect needs two inputs (matte, displacement map, a second clip) or when the same intermediate must feed two places.
- Node graphs win on expressiveness, readability at scale, and typed multi-input effects. They lose on time-visibility (the timeline becomes a secondary view), keyframing ergonomics, and first-run complexity. Olive is the only NLE that made the node graph primary; it is still alpha after years ([Olive GitHub](https://github.com/olive-editor/olive)).
- Modulators are orthogonal to both: Ableton/Bitwig-style "modulation slots" (an LFO, envelope follower, random, or macro that is dragged onto any parameter with a depth) are the proven UX for procedural parameter control in music software, and Notch/TouchDesigner implement the same idea as modifier nodes exported to parameters. Expressions (AE) are the escape hatch for power users.

### C.4 Recommendation for DATAMOSHINE

1. Primary model: effect channels as adjustment clips with a per-clip linear stack. Vertical channel order = global composition order, stack order within a clip = local order. This is what CapCut/Resolve/Premiere users already know and it serialises to an ordered pass list for WebGPU.
2. Parameters are "animatable values": a static value, a keyframe track (hold / linear / ease presets / cubic Bezier), plus zero or more modulation slots. Modulators are pure functions of `(t_frames, seed, audio_features(t))` and never carry hidden state. Provide in v1: LFO (sine/tri/square/saw with phase, rate in Hz or beats), seeded noise (1D value/Perlin), seeded random hold (sample-and-hold at a rate), and envelope follower on the sequence's audio (RMS or band energy, computed offline once per project so it is deterministic and cacheable). In v2: macro knobs (one parameter driving many), step sequencer (Hydra arrays), and a sandboxed expression (tiny expression language, not raw JS, evaluated per frame; expose `t`, `frame`, `seed`, `rand(i)`, `audio.band(n)`, `param("other")`).
3. Modulation combine mode per slot: add / multiply / replace, with depth and optional range clamp. Display the modulated value as a ghost curve over the keyframe lane (Bitwig does this and it is the clearest UX for "why is this value moving").
4. Keep the internal representation a DAG even in v1: each effect instance is a node with named inputs (`in`, optional `matte`, `prev` for recurrence) and a stack is just a chain. This lets a node view ship later without a format migration, and it lets a few effects declare extra inputs (a second channel as matte or displacement source) via a "source picker" in the stack UI before any node editor exists.
5. Determinism is a hard rule: given a project file, frame N renders identically on every machine and every scrub path. That rules out time-sliced LFOs (TouchDesigner's LFO CHOP style) and unseeded `Math.random()`. Random effects take a `seed` parameter; per-frame randomness is `hash(seed, frame, slot)`.
6. Recurrent effects (datamosh proper, feedback, trails, P-frame drift) are the only stateful nodes. They declare `stateful: true`, define `reset()` and `step(prevState, input, params) -> (state, output)`, and are handled by the checkpoint cache in section E.

---

## D. Reusable libraries

| Project | What it is | License | Maturity | Timeline UI | WebCodecs / WebGPU | Verdict for DATAMOSHINE |
|---|---|---|---|---|---|---|
| [Mediabunny](https://github.com/Vanilagy/mediabunny) | Pure-TS media toolkit: demux/mux (mp4, mov, webm, mkv, mp3, wav, ogg, aac, flac, ts), decode/encode via WebCodecs, conversion, HLS. Successor to mp4-muxer/webm-muxer; author says to migrate. `VideoSampleSink`, `CanvasSink`, `EncodedPacketSink`, `getSample(t)`, `samples(start,end)`, `samplesAtTimestamps([...])` ([media sinks guide](https://mediabunny.dev/guide/media-sinks)) | MPL-2.0 | High: 7.3k stars, zero deps, active | No | WebCodecs yes; no rendering | Adopt. Use for demux, frame-accurate decode, and export muxing. `EncodedPacketSink` is also the right entry point for bitstream-level datamosh (feeding modified packets to our own `VideoDecoder`). |
| [mp4-muxer / webm-muxer](https://mediabunny.dev/guide/introduction) | Predecessor muxers | MIT | Deprecated in favour of Mediabunny | No | WebCodecs | Do not adopt; use Mediabunny. |
| [WebAV](https://github.com/WebAV-Tech/WebAV) (`@webav/av-cliper`, `av-canvas`, `av-recorder`) | WebCodecs SDK with `IClip` / `Sprite` / `Combinator` model, interactive canvas | MIT | 2.1k stars, active, Chrome 102+ | Partial (canvas sprite editing, no timeline widget) | WebCodecs; Canvas2D/WebGL | Read for the clip/sprite/combinator abstractions and decoder pooling; unlikely to reuse code since we need WebGPU. |
| [Diffusion Studio core](https://github.com/diffusionstudio/core) | 2D motion-graphics/video engine: compositions, layers, clips, keyframes, built-in effects, transitions, masks, checkpoints; v4 moved to seconds-based timing | MPL-2.0 with a default watermark; paid license key removes it ([v3→v4 notes](https://docs.diffusion.studio/docs/v3-v4)) | 1.2k stars, active | No (engine only) | WebCodecs; Canvas2D (no WebGPU) | Do not adopt as engine (Canvas2D, watermark). Worth reading: keyframe API, clip range/delay model, "checkpoints" for state. |
| [Omniclip](https://github.com/omni-media/omniclip) | Full browser editor: trimming, splitting, transitions, filters, text, 4K export, WebRTC collaboration; keyframes on the roadmap; 2.0 in development | MIT | 1.5k stars, active | Yes (custom, @benev/slate) | WebCodecs; renderer undetermined | Read the timeline interaction code and unidirectional state model; MIT allows lifting pieces. No keyframes or effect stacks yet. |
| [OpenVideo / designcombo react-video-editor](https://github.com/designcombo/react-video-editor) | Next.js editor on `@openvideo/core`, `@openvideo/timeline`, `@openvideo/engine-pixi` (PixiJS v8), WebCodecs export | Dual: free for individuals and orgs up to 3 employees, company license otherwise | 1.8k stars | Yes (multi-track, drag, split, trim, snap) | WebCodecs; PixiJS v8 (WebGPU-capable) | Avoid code reuse (license); good reference for timeline/canvas interactions. |
| [MasterSelects](https://github.com/Sportinger/MasterSelects) | WebGPU-first browser NLE: zero-copy `texture_external` imports, GPU→WebCodecs export, "3-tier scrubbing cache", nested comps with pooled textures, 30 GPU effects, effect/colour/geometry node graphs with typed connections, proxies, multicam, Premiere sequence import, experimental FCPXML export, precompute checkpoints streamed to IndexedDB, durable branching history | AGPL-3.0-only | Alpha, single dev, ~450 stars, very active ([SourcePulse](https://www.sourcepulse.org/projects/26284920)) | Yes | WebGPU + WebCodecs | Closest architectural sibling. AGPL means no code reuse unless we accept AGPL. Study: scrubbing cache tiers, checkpoint streaming to IndexedDB, unified "retime contract" across preview/scrub/export. |
| [Tooscut](https://github.com/mohebifar/tooscut) | Browser NLE, Rust/WASM compositor on WebGPU, React 19, canvas-rendered timeline, keyframes with Bezier easing, File System Access API local-first | Elastic License 2.0 | 715 stars, early | Yes (canvas) | WebGPU + WebCodecs | Not reusable (ELv2 is source-available, not OSS). Reference for canvas timeline rendering. |
| [Shader Lab](https://github.com/basementstudio/shader-lab) (`@basementstudio/shader-lab`) | Layer stack of sources and effect layers (ASCII, CRT, pixel sort, displacement, chromatic aberration, ...) on WebGPU via three.js TSL; timeline with `duration`, `loop`, `tracks` of keyframes; `evaluateTimelineForLayers` | Apache-2.0 | New, active | Simple keyframe timeline | WebGPU (three.js) | Study the config schema (layers array + timeline tracks) and effect list; code reuse is possible under Apache-2.0 but it depends on three.js, which we do not want in the render path. |
| [Noisemaker](https://docs.noisemaker.app/) | GPU effect engine with WebGL2/WebGPU backends and a Hydra-like chain DSL (`noise().write(o0)`, `render(o0)`) | Not stated (Noise Factor LLC) | Powers commercial products | No | WebGPU/WebGL2 | Reference for DSL ergonomics only; license unclear. |
| [hydra-synth](https://github.com/hydra-synth/hydra-synth) | Live-coding video synth: chained sources/transforms, 4 output and 4 source buffers, feedback via `src(o0)`, array sequencing, functions of time, `a.fft` | AGPL-3.0 | Mature, widely used | No | WebGL | Not reusable (AGPL, WebGL). The modulation vocabulary (arrays with `.fast/.smooth`, `() => f(time)`) is the model for our modulators. |
| [Remotion](https://www.remotion.dev/) | React framework that renders compositions frame-by-frame to video; no visual timeline by design | Remotion License (free for individuals/small teams, paid for companies) `[unverified]` | Very mature | No ("code-based composition... with no visual timeline": [IMG.LY comparison](https://img.ly/remotion-alternative/)) | Headless Chrome render | Not a fit: it is a renderer for programmatic video; its player has a scrubber, not an editor. Design lesson: a composition is a pure function `frame -> image`, which is what our stateless path should be. |
| [Theatre.js](https://github.com/theatre-js/theatre) | Animation library: `@theatre/core` runtime, `@theatre/studio` visual sequence editor with keyframe lanes, inline value editing, graph editor, aggregate keyframes | Core Apache-2.0; Studio AGPL-3.0 (dev-time only) | 12.7k stars; development moved to a private repo ahead of 1.0 | Yes (sequence + graph editor for properties, not clips) | No | Studio is AGPL and the project is in a quiet period; do not depend on it. Its sequence editor (lanes, aggregate keyframes, inline value popups) is the UX reference for our keyframe lanes ([Theatre.js sequences docs](https://www.theatrejs.com/docs/0.5/manual/sequences)). |
| [Motion Canvas](https://motioncanvas.io/docs) | Generator-based TS animation library with a preview editor; signals (memoised reactive values) | MIT | Mature | Preview/scrub editor, not an NLE | Canvas2D | Not reusable as a timeline; signals are a clean model for derived/modulated parameters. |
| [@xzdarcy/react-timeline-editor](https://github.com/xzdarcy/react-timeline-editor) | React timeline component: rows, actions, drag/resize, grid and guide-line snapping, row reorder, decoupled engine runner (time, speed) | MIT | 800 stars, 40 open issues, little recent activity | Yes | No | Possible bootstrap for a prototype; not for production (we want a canvas/WebGL-rendered timeline for thousands of keyframes). |
| [@chatoctopus/timeline](https://github.com/ChatOctopus/timeline) | TS read/write for OTIO, FCPXML 1.8, Premiere/Resolve xmeml v5 with rational time math; no effects/keyframes, transitions flattened | MIT | Early (6 stars) | No | No | Candidate for an OTIO/FCPXML export adapter; small enough to fork. |
| [OpenTimelineIO](https://opentimelineio.readthedocs.io/en/latest/) | Interchange format and C++/Python API; no official JS build found | Apache-2.0 | ASWF project, approaching 1.0 ([ASWF review, Nov 2025](https://tac.aswf.io/meetings/2025-11-12/OpenTimelineIO_ASWF_Project_Review_Nov_2025.pdf)) | n/a | n/a | Export target only (section F). |
| Clipchamp (closed) | WebCodecs adopted over 12 months, FFmpeg WASM with WebCodecs codec stubs, SIMD 2.3x gains ([W3C talk](https://www.w3.org/2021/03/media-production-workshop/talks/soeren-balko-clipchamp-webcodecs.html), [web.dev case study](https://web.dev/case-studies/clipchamp)) | n/a | Product | Yes | WebCodecs | Lesson: keep an FFmpeg-WASM fallback path for codecs WebCodecs cannot decode. |
| Kapwing (closed) | Transcodes to low-res preview copies for in-browser editing; waveforms via Web Audio ([web.dev case study](https://web.dev/case-studies/kapwing)) | n/a | Product | Yes | WebCodecs | Lesson: generate preview proxies at import. |
| Descript (closed) | New media engine (4 years): WebAudio, WebGL compositing, WASM, WebCodecs, hardware encode 10x ([Descript blog](https://descript.com/blog/article/the-new-descript-how-we-multiplied-the-apps-speed-and-performance), [Syntax.fm interview](https://syntax.fm/show/655/supper-club-how-descript-built-a-next-gen-video-editor-in-the-browser-with-andrew-lisowski/transcript)) | n/a | Product | Yes | WebCodecs, WebGL | Lesson: one engine for web and desktop; streaming sources. |

Bottom line: adopt Mediabunny; write the timeline, effect stack, and cache ourselves (no permissively licensed, WebGPU-ready timeline exists); borrow UX from Theatre.js/Resolve for keyframes and from CapCut/Resolve adjustment clips for channels; study MasterSelects for cache architecture without copying code.

---

## E. Render cache and checkpoint architecture for recurrent effects

### E.1 How existing tools cache

- Premiere: preview files per timeline range, render bar green/yellow/red/none; yellow means it will render live frame-by-frame, red means it will drop frames without a preview file ([Adobe blog](https://blog.adobe.com/en/publish/2011/02/20/red-yellow-and-green-render-bars)).
- Resolve: Smart cache auto-renders clips with heavy effects during playback or after 5 s idle; User cache is manual; cache levels build up in order Fusion output → OFX/Fusion filter → Color node cache → Color output ([Beginners Approach](https://beginnersapproach.com/davinci-resolve-cache/), [DaVinci Resolve Club](https://davinciresolveclub.com/davinci-resolve-render-cache/), [dvresolve cache levels](https://dvresolve.com/tutorial/improving-resolves-performance-cache-levels/)). The layered cache is the key idea: cache at the boundary where expensive-but-stable work ends.
- After Effects: Global Performance Cache = RAM cache + persistent disk cache; frames that are cheap are not cached; disk cache is matched by content hash across projects and sessions ([Adobe improve performance](https://helpx.adobe.com/ee/after-effects/using/improve-performance.html), [Adobe memory and storage](https://helpx.adobe.com/after-effects/using/memory-storage1.html)).
- Kdenlive: explicit preview-render zones with red/yellow/green state in the ruler ([Kdenlive timeline docs](https://docs.kdenlive.org/en/user_interface/timeline.html)).
- Blender VSE: memory cache plus optional disk cache; simulation zones in geometry nodes are cached during playback (yellow line in the timeline) and baked to disk so frames can be rendered in non-sequential order ([Blender VSE intro](https://docs.blender.org/manual/en/4.3/editors/video_sequencer/introduction.html), [Blender simulation zone](https://docs.blender.org/manual/en/4.2/modeling/geometry_nodes/simulation/simulation_zone.html)).

### E.2 How existing tools handle recurrent (frame N depends on N-1) effects

They mostly do not; they warn:

- Sapphire S_Feedback: "The feedback is reinitialized whenever any non-consecutive frame is processed: either the first frame, reprocessing a given frame, or jumping to another frame", and recommends clearing the image cache before rendering ([Boris FX](https://borisfx.com/documentation/sapphire/ae/feedback/)).
- After Effects CC Time Blend only blends already-cached frames; users are told to preview from the first frame and clear the effect's cache after any change ([Creative COW thread](https://creativecow.net/forums/thread/after-glow-while-in-motion-ae-cs6/)).
- Notch Frame Feedback overlays the previous frame; scrubbing or jumping in time gives unexpected results because it references cached frames ([Notch manual](https://manual.notch.one/0.9.23/en/docs/nodes/post-fx/blur/frame-feedback/)).
- TouchDesigner Feedback TOP has a Reset parameter and Reset Pulse; it is a real-time operator with no notion of random access ([Derivative docs](https://docs.derivative.ca/Feedback_TOP)).
- Fusion/Nuke-style DAGs cannot express feedback at all; the Resolve forum thread on a "feedback / loop node" concludes it is not possible out of the box ([BMD forum](https://forum.blackmagicdesign.com/viewtopic.php?p=745634)).
- Blender simulation zones are the one mainstream example of a correct design: evaluate only when the frame advances, cache every evaluated frame while playing, bake the cache to disk to allow non-sequential rendering, and show cache validity in the timeline ([Blender manual](https://docs.blender.org/manual/en/4.2/modeling/geometry_nodes/simulation/simulation_zone.html)).

No public write-up was found describing checkpointed random access for feedback shaders specifically; the closest analogues are video GOP decoding (seek to the previous keyframe, decode forward: [Chrome WebCodecs best practices](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs)), Blender's simulation bake, and MasterSelects' "persistent precompute streams checkpoints to IndexedDB" ([MasterSelects README](https://github.com/Sportinger/MasterSelects)). The design below combines those.

### E.3 Proposed architecture

Terminology

- `frame N`: integer frame index at sequence timebase.
- Stateless node: `out_N = f(in_N, params(N))`. Random access is free given `in_N`.
- Stateful (recurrent) node: `(state_N, out_N) = step(state_{N-1}, in_N, params(N))`, with `state_{-1} = reset()`. Random access to N requires `state_{N-1}`.
- Checkpoint: a snapshot of `state_k` for a stateful node at frame k, keyed by a content hash.

Layers of cache (Resolve's layered idea, restricted to what we need)

1. Decoded-source cache. Per media clip, a ring of decoded `VideoFrame`s around the playhead plus the set of keyframe timestamps. Random access cost = distance to previous keyframe in the source GOP (WebCodecs: delta chunks need the preceding chunks; decode from the nearest key). Mediabunny's `samplesAtTimestamps` and `CanvasSink` with `poolSize` cover this; the frame-ring must `close()` frames aggressively ([Chrome WebCodecs guidance](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs)).
2. Channel-output cache (stateless). Per channel, per frame: a GPU texture (or compressed CPU copy) keyed by `hash(channel_graph_hash, frame, upstream_hash)`. Only cache channels whose stack is expensive (After Effects' rule: do not cache cheap frames). Invalidation on param change is exact: frames whose `params(N)` changed.
3. Checkpoint store (stateful). Per stateful node instance: checkpoints every K frames plus at every clip in-point and marker. Stored as GPU textures while hot, spilled to CPU and then to OPFS/IndexedDB as a compressed blob (MasterSelects streams precompute checkpoints to IndexedDB). Keyed by `hash(node_hash, params_hash_up_to_k, upstream_hash_up_to_k)`.
4. Final-composite cache. The frames actually shown; LRU in VRAM with a CPU spill. This is the "green" bar.

Scrub algorithm for frame N

```
for each channel bottom-up:
  if channel has no stateful node: evaluate at N (using caches 1-2)
  else:
    k = nearest checkpoint <= N for this node that is valid
    if none: k = clip.in - 1, state = reset()
    for f in (k+1 .. N): state, out = step(state, in_f, params(f))   // replay
    store checkpoint if (N - k) >= K
```

Replay cost is bounded by K frames of that node and its upstream. With K = 8 to 30 (same magnitude as a GOP), a scrub to an uncached frame costs tens of milliseconds of GPU time for typical glitch effects, which is acceptable; the UI should show a "replaying" indicator rather than freezing. During continuous forward playback no replay happens, and every K-th frame deposits a checkpoint for free. JKL reverse play is the worst case (every frame needs replay); mitigate by prefetching checkpoints behind the playhead during idle and by allowing reverse play to show the last composited frame if the budget is exceeded.

Invalidation rules (the part that differs from stateless caches)

- A parameter edit at time t on a stateful node invalidates all of that node's checkpoints at frames >= t, plus every downstream cache for frames >= t. It does not touch frames < t. Edits to a keyframe at t therefore invalidate "from t to the end of the clip", not "around t". Show this in the ruler: red from t to the clip's out-point.
- A parameter edit on a stateless node invalidates only frames where the evaluated value changed, but if a stateful node sits downstream, the invalidation becomes "from the first changed frame to the end of that stateful clip".
- Reorder of a stack, change of channel order, or change of a modulator seed invalidates the whole clip range for the affected nodes.
- Upstream media change (trim, slip) invalidates from the first affected frame forward.

Reset semantics

- Default: state resets at the effect clip's in-point (Sapphire's "first frame" rule). Splitting a clip therefore creates a hard reset and a guaranteed checkpoint; this is a feature for scrubbing cost, and it should be visible (a reset marker on the clip edge).
- Optional "warm-up" (pre-roll) count: run `step` W times before the in-point using the in-point input, so the effect does not visibly "start" at the cut. Cheap and deterministic.
- Optional "continue state across split" flag for users who split a clip only to change parameters: the second clip's `state_{in-1}` is the first clip's last state. Implement by treating the split as a soft boundary in the checkpoint store.

Background filling (Resolve smart cache behaviour)

- After idle (Resolve uses 5 s; we can use ~500 ms), a worker renders outward from the playhead, prioritising: the export range, then frames just ahead of the playhead, then checkpoints every K frames across red regions. Use a dedicated worker with its own `GPUDevice` if available, otherwise time-slice on the main device with `requestIdleCallback` budgets.
- The ruler bar reflects per-frame status: green (final composite cached), yellow (stateless only, renders live), red (uncached stateful region), with a thin checkpoint tick row underneath.

Determinism requirements (without these, checkpoints are wrong)

- Fixed timebase; no wall-clock inputs. All modulators are pure functions of `(frame, seed, precomputed audio features)`.
- GPU math must be identical between replay and playback: same workgroup sizes, no atomics with nondeterministic order, no reliance on `texture_external` sampling differences. Prefer copying external frames into our own `rgba8unorm`/`rgba16float` textures once per decoded frame so every consumer sees the same bytes.
- Decoder determinism: the same encoded stream decoded on the same device gives the same pixels, but hardware decoders on different GPUs may differ in rounding. Cache keys must include a device fingerprint so a checkpoint from another machine is never reused silently. For export, always render sequentially from frame 0 (no checkpoint use), which also makes export independent of checkpoint correctness.
- Memory budget: a 1080p `rgba8` state is ~8 MB; `rgba16float` is ~16 MB. With K = 16 and a 10 s clip at 30 fps that is 19 checkpoints = 150–300 MB per stateful node if all are kept hot. Keep at most a few hot in VRAM, spill the rest to CPU (ArrayBuffer) and to OPFS; budget by device memory and expose it in settings.

Datamosh-specific note

Bitstream datamosh (dropping I-frames, duplicating P-frames, swapping macroblock vectors) is recurrent by construction: the decoder's reference-frame state is the recurrence. Two implementation options, both of which fit the checkpoint model:

1. Bitstream path: build a modified packet sequence (Mediabunny `EncodedPacketSink` → our mutator → `VideoDecoder`). State = decoder reference frames; a checkpoint is "flush the decoder and re-feed from the last real keyframe of the modified stream". Random access cost is the distance to the previous keyframe in the modified stream, which can be arbitrarily large if the user removed keyframes, so the cache must insert synthetic checkpoints by snapshotting the decoded output and continuing with a motion-compensation shader rather than the real decoder. This is the hard case and argues for option 2 as the default.
2. Emulated path: decode normally, then run a WebGPU "mosh" node that takes the previous output and per-block motion vectors (either estimated by a block-matching compute pass or extracted from the bitstream when available) and applies them with bleed/blend parameters. State = previous output texture (+ optional accumulated vectors). Checkpoints are plain texture snapshots. This is what the architecture above assumes.

Recommendation: ship option 2 in v1 with optional motion vectors from the bitstream later; keep option 1 as an "authentic mosh" export-only mode where sequential rendering avoids the random-access problem entirely.

---

## F. Project file format

### F.1 What the surveyed editors persist

| Format | Owner | Shape | Effects / keyframes | Notes |
|---|---|---|---|---|
| OTIO (`.otio` JSON) | ASWF | Timeline → Stack → Track → Clip/Gap/Transition, `source_range`, `media_references`, `markers`, `effects`, `metadata` dict on every object. Effect schemas today: `Effect`, `TimeEffect`, `LinearTimeWarp(time_scalar)`, `FreezeFrame` only; no keyframe/animated-parameter schema ([schema fields](https://opentimelineio.readthedocs.io/en/latest/tutorials/otio-serialized-schema-only-fields.html)) | Essentially none; colour/CDL, spatial transforms, stream mapping are on the 2026 roadmap ([ASWF review](https://tac.aswf.io/meetings/2025-11-12/OpenTimelineIO_ASWF_Project_Review_Nov_2025.pdf)) | Unknown schemas round-trip via `UnknownSchema` and the original label is restored on write ([OTIO file format spec](https://opentimelineio.readthedocs.io/en/v0.15/tutorials/otio-file-format-specification.html)); media referenced externally, never embedded. Kdenlive 25.04 imports/exports OTIO but drops effects, filters, transitions ([kdenlive.org](https://kdenlive.org/news/releases/25.04.0/), [KDE discuss](https://discuss.kde.org/t/opentimelineio-metadata-and-effects/45813)). |
| FCPXML | Apple | XML; `resources` + `library/event/project/sequence/spine`; `asset-clip`, `adjust-transform`, keyframed `param` elements; version 1.11 for FCP 10.7+ ([Apple FCPXML reference](https://developer.apple.com/documentation/professional-video-applications/fcpxml-reference), [creating FCPXML](https://developer.apple.com/documentation/professional-video-applications/creating-fcpxml-documents)) | FCP-native effects and keyframes only | Rich but Apple-specific; MasterSelects exports it experimentally. |
| EDL (CMX3600) | legacy | Plain text, one video track, cuts and simple dissolves | None | Only for conforming. |
| Kdenlive `.kdenlive` | KDE | MLT XML (`tractor`, `playlist`, `producer`, `filter`) with `kdenlive:`-prefixed properties; MLT can render it directly ([Kdenlive file format](https://community.kde.org/Kdenlive/Development/File_format), [Kdenlive project files](https://docs.kdenlive.org/en/project_and_asset_management/file_management/project_files.html)) | MLT filters with keyframed properties as strings | Good example of "render description + editor metadata in one file". |
| Olive `.ove` | Olive | XML containing sequences, node graphs, colour management, media links ([filext](https://filext.com/file-extension/OVE)) | Nodes with keyframes | Nodes can be copied as text for sharing. |
| Shader Lab config | basement.studio | JSON: `layers: []` + `timeline: {duration, loop, tracks}` ([GitHub](https://github.com/basementstudio/shader-lab)) | Yes, per layer parameter | Closest in spirit to what we need. |
| MasterSelects | Sportinger | IndexedDB-backed continuous save with branching history | Yes | Not a file format you can hand around. |

### F.2 Recommendation

1. Native format: a versioned JSON document (`datamoshine.project.v1`), stored in OPFS/IndexedDB for autosave and exportable as a `.dmsh` file (JSON, optionally zipped with thumbnails and audio-feature caches). Reasons: every effect, keyframe, modulator, seed, and cache-key input must be first-class, and no interchange format models them. Shape:
   - `timebase: {num, den}` and all times as integer frame counts (never floats; @chatoctopus/timeline and OTIO both insist on rational time to avoid drift).
   - `media[]` with content hashes (so relinking and cache keys survive renames), duration, keyframe index summary, proxy references.
   - `channels[]` ordered bottom-up, each with `kind`, `clips[]`.
   - `clips[]` with `range` (in/out in sequence frames), `sourceRange` for media, `stack[]` of effect instances.
   - Effect instance: `{type, version, enabled, seed, params: {name: AnimatableValue}, inputs: {matte?: ChannelRef}}`.
   - `AnimatableValue: {value} | {keys: [{frame, value, interp, handles?}]} | {...plus mods: [{type, params, mode, depth}]}`.
   - `markers[]`, `exportRange`, `ui` (zoom, scroll, selection) kept in a separate `ui` block so diffs stay clean.
   - Every effect type carries a schema version; migrations are explicit functions.
2. Interchange: export to OTIO for the cut only (media channels, clip ranges, markers), with our effect channels serialised under `metadata.datamoshine` on the Track/Clip objects so a round trip through OTIO-aware tools preserves them as opaque data. Do not try to express effects as OTIO `Effect` schemas until the 1.0 schema work lands. Treat OTIO as a v3 export feature; import from OTIO/FCPXML (cuts only) is a nice-to-have for people who pre-cut in Resolve. `@chatoctopus/timeline` (MIT) is a reasonable base for the adapter.
3. Render-cache data is never part of the project file; it lives in OPFS keyed by content hashes (After Effects' persistent disk cache model), so a project can be opened on another machine and simply re-renders.

---

## G. Open questions

1. Checkpoint interval K: fixed (e.g. 16 frames) vs adaptive per node based on measured `step` cost and memory budget. Proposal: start fixed, instrument replay latency, then adapt.
2. Checkpoint storage format when spilled: raw `rgba8` vs `rgba16float` vs lossy (WebP/AVIF via `ImageEncoder`/canvas). Lossy spills break bit-exact determinism between a replayed frame and a played frame; is "visually identical" acceptable for preview if export always renders sequentially?
3. Speed ramps on channels that contain recurrent effects: does the recurrence step per source frame or per sequence frame? Per sequence frame is simpler and deterministic; per source frame matches what a real decoder would do. Defer speed ramps until this is decided (v3).
4. Should effect channels be allowed to reference a specific lower channel (matte / displacement source) in v1, or only "everything below"? Allowing it early keeps the DAG honest but complicates invalidation.
5. Audio: do we need audio playback in v1 at all, or only precomputed audio features for modulators? Audio-reactive modulation is a headline feature; audible playback can wait for v2 but the feature extraction (RMS, band energies per frame, onset flags) should be computed at import.
6. Bitstream datamosh (E.3 option 1): how far do we go? Extracting motion vectors from H.264/VP9 in the browser needs a WASM parser (FFmpeg `export_mvs`-style); is that v2 or v3, and does any permissively licensed JS/WASM parser expose macroblock vectors?
7. Timeline rendering technology: DOM/React (fast to build, slow at thousands of keyframes) vs canvas/WebGL (Tooscut, MasterSelects). Proposal: canvas for lanes/clips/keyframes, DOM for headers, inspectors, and menus.
8. Nesting (compound clips) interaction with the cache: a nested sequence containing stateful nodes must expose its own checkpoints; simplest is to bake a nested sequence to a cached stream when it is used as a clip.
9. Device fingerprint in cache keys: how strict? GPU vendor + driver + browser version is probably right; too strict throws away valid caches on every browser update.
10. OTIO export timing: wait for the 1.0 schema (spatial transforms, colour) before investing, or ship cut-only export early for conform workflows?
11. Determinism of hardware decoders across GPUs is asserted, not measured. Add a test that hashes decoded frames of a reference clip on several machines before relying on cross-machine cache sharing (or simply never share caches across machines).
