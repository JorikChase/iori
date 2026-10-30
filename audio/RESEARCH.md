# Build one core, distrust the microphone

**A serious DAW is buildable as an iOS/iPadOS PWA in October 2026, with one exception that shapes the whole design: on iOS 27 a live microphone damages playback, and no fix is scheduled.** With echo cancellation on, all output crackles. With it off, output is clean but moves to the quiet earpiece, and that is the mode the app's `shared.js` uses today. Everything else fits: one AudioContext in the shell, same-origin iframes, SharedArrayBuffer, WASM SIMD in AudioWorklet, OPFS and Wake Lock. Web MIDI, Ableton Link, stereo mic capture, file pickers and background audio do not. The recommended architecture is one deterministic WASM DSP core hosted in the worklet for playback and in a Worker for bounce, with the 128-frame budget capped at about 15% until real devices prove more is safe. The synth keeps seed-and-branch as its front door and adds a real engine underneath, with independent envelopes, a 10-lane mod list, unison and macros. The drum rack treats a pad as a note, a chain and a cached render, so the timeline stays MIDI whatever the pad holds. Quality tiering turns out to be narrow: only per-voice oversampling, voice count, ladder solver accuracy and wavetable frames need to differ, because the master chain costs about 1% of a quantum. No iPhone AudioWorklet benchmark was found anywhere, so every voice count below is an estimate, and the measurement list near the end decides what survives.

## Four labels separate what is known from what is reasoned

**[V]** means verified in a primary source: a vendor manual, a standard, WebKit Bugzilla, a WebKit post or WebKit source. **[P]** means probed or benchmarked by the research team on 30 October 2026 on an M3 Pro Mac, in Playwright WebKit 27.2 and Chromium 156 or in the `jsc` and Node shells. It proves engine logic, and proves nothing about iOS hardware, memory, timing or the audio session. **[R]** means reported: a review, forum post, retailer page, search excerpt or single-developer test. **[I]** means inferred, which covers every recommendation that goes beyond its sources. The two most consequential claims were rechecked at the source while writing: WebKit bug 326286 and the storage policy post. The repo claims were checked in the working tree: `audio/shared.js` line 214, the absence of COOP/COEP headers, and the discarded `persist()` result.

Sections run platform, DSP, synth, rack, then DAW screens, because each one constrains the next.

## iOS 27 permits almost everything except a clean open microphone

iOS 27 shipped in September 2026 ([9to5Mac](https://9to5mac.com/2026/09/17/webkit-blog-breaks-down-whats-new-with-safari-27-for-developers-including-mcp-support/)), and Safari 27.2 is dated 26 October ([WebKit](https://webkit.org/blog/18515/webkit-features-for-safari-27-2/)). The last iOS 26 feature release is 26.6 ([WebKit](https://webkit.org/blog/18178/webkit-features-for-safari-26-6/)). **Plan for 27 as the baseline and treat 26.x as a fallback** [I]. Safari 27.0 fixed a SIMD thunk corruption bug ([WebKit](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/)) and 27.2 fixed valid AAC/M4A files failing `decodeAudioData` ([WebKit](https://webkit.org/blog/18515/webkit-features-for-safari-27-2/)), so 26.x carries real engine risk for this app [I].

| Capability | 26.6 | 27.x | Evidence | Consequence |
|---|---|---|---|---|
| Web MIDI | No | No | [V] [caniuse](https://caniuse.com/midi), [bug 107250](https://bugs.webkit.org/show_bug.cgi?id=107250) open and unassigned | On-screen input only; `.mid` files still work |
| AudioWorklet, 128 frames fixed | Yes | Yes; `renderSizeHint` ignored | [P] | 2.67 ms per quantum at 48 kHz |
| Iframe builds nodes on the parent's context | Untested on iOS | Works in engine | [P] | Shell-owned context is viable |
| SharedArrayBuffer with COOP + COEP `require-corp` | Expected | Works in engine | [V] [bug 229559](https://bugs.webkit.org/show_bug.cgi?id=229559), [P] | Needed for ring buffers; headers not yet deployed |
| COEP `credentialless` | No | No | [V] [caniuse](https://caniuse.com/mdn-http_headers_cross-origin-embedder-policy_credentialless) | All subresources need CORP or CORS |
| WASM SIMD in worklet | Yes | Yes | [V] [caniuse](https://caniuse.com/wasm-simd), [P] | Baseline for the core |
| Relaxed SIMD, memory64 | No / unverified | No / unverified | [V] [features.json](https://github.com/WebAssembly/website/blob/main/features.json), [STP 251](https://webkit.org/blog/18194/release-notes-for-safari-technology-preview-251/) | Do not use |
| OfflineAudioContext with worklet | Untested on iOS | Works in engine | [P] | Usable, but a Worker is the better bounce host |
| OPFS sync handle in Worker | Yes | Yes | [R] version floor conflicts | Audio storage path |
| `createWritable` | Yes | Yes | [V] [caniuse](https://caniuse.com/mdn-api_filesystemfilehandle_createwritable); leak [R] | Avoid for repeated large writes |
| File pickers | No | No | [P], [R] | `<input type=file>` in, share sheet out |
| Quota | Up to 60% of disk per origin, 80% overall | No newer statement | [V] [WebKit 2023](https://webkit.org/blog/14403/updates-to-storage-policy/) | Generous, but evictable |
| Wake Lock in standalone | Yes (18.4+) | Yes | [V] [bug 254545](https://bugs.webkit.org/show_bug.cgi?id=254545) | Hold during transport and capture |
| Stereo mic via `getUserMedia` | No | No | [V] [bug 210231](https://bugs.webkit.org/show_bug.cgi?id=210231) | Mono mic; stereo arrives by file import |
| USB input selection | Unreliable | Unreliable | [V] [bug 211192](https://bugs.webkit.org/show_bug.cgi?id=211192) | Do not promise interfaces |
| `outputLatency` | Yes (18.4+) | Yes | [V] [caniuse](https://caniuse.com/mdn-api_audiocontext_outputlatency) | A hint, not the truth |
| Audio with screen locked | Unreliable | Unreliable | [R] [Apple Forums](https://developer.apple.com/forums/thread/805900) | Design for recovery |
| Ableton Link | No | No | [R] [ricochet PR](https://github.com/MohamedFekryyy/ricochet/pull/3) | Tap tempo only |

### The microphone is a mode, not a track input

[Bug 326286](https://bugs.webkit.org/show_bug.cgi?id=326286), titled as a regression from iOS 26.2 to 27, was NEW, unassigned and severity Major when last modified on 21 October [V]. With an echo-cancelled mic live, **every playback path crackles**, including Web Audio and `<audio>`. With echo cancellation off, output is clean but **routes to the earpiece at much lower volume**. `applyConstraints` on a live track changes neither. The report notes that native `playAndRecord` without voice processing is clean on the same device, which places the fault in the web stack rather than the hardware [I]. [Bug 311451](https://bugs.webkit.org/show_bug.cgi?id=311451) is the older sibling: after capture starts, output on iOS and iPadOS drops in sample rate and **stereo folds to mono**, with or without echo cancellation, seen from 26.4 and persisting onto 27 [V]. One commenter says the damage lasts for the rest of the session [R]. Neither bug has a public plan.

The app's `CONS` at `audio/shared.js:214` sets all three processing flags off, the earpiece mode on iOS 27, so speaker overdubbing is probably already quiet today [I]. Taken together, three things follow, and all are inferences. Recording with the transport stopped is the least affected path. Monitoring during an overdub is a guide signal and not a reference, which audiophile friends must be told. Master capture, an internal tap on the app's own graph, avoids the whole problem and needs no permission. Whether wired headphones escape the earpiece route is untested, and it is the first device test.

The claim that a second `getUserMedia` call mutes an earlier stream comes only from a search snippet, but the app's own `audio/MATRIX.md` S13 note records a shell-held stream muting a tool's capture [R]. This argues for one mic owner in the shell, which reverses the current "each tool asks itself" rule, and it needs an explicit test [I].

### Memory is the second hard wall, and it fails silently

No limit is documented. Reports run from about 100 MB on an iPhone SE 3 ([lapcat](https://lapcatsoftware.com/articles/2026/1/7.html)) to about 3 GB on an iPhone 15 Pro, and the same iPhone 12 Pro drifted between 1.5 and 3 GB ([Apple Forums](https://developer.apple.com/forums/thread/761666)) [R]. Going over reloads the page with **no catchable error** ([pooled #207](https://github.com/Nehanth/pooled/issues/207)) [R]. Stereo Float32 at 48 kHz costs 23 MB per minute, so eight stereo five-minute tracks need 922 MB and cannot live in RAM on most phones [I]. An iOS 27 Simulator test found WebKit charges a shared memory's declared maximum against a process pool of about 6 GiB at construction ([kandelo #1410](https://github.com/Automattic/kandelo/pull/1410)) [R], so declare modest maximums and avoid `memory.grow()`, which is reported to kill the tab ([emscripten-discuss](https://groups.google.com/g/emscripten-discuss/c/SlmrsE9hpwE)) [R]. Suggested budgets until measured, all judgement calls: under 1 GB total on iPhone 15 Pro and newer, under 500 MB on iPhone 12 to 14, under 100 MB on SE-class devices, and no single Float32Array over about 256 MB [I].

### Storage is generous, evictable, and split by install

WebKit gives browser apps up to 60% of disk per origin and 80% overall, gives Home Screen apps the same, evicts whole origins least-recently-used first, and grants `persist()` on heuristics such as running as a Home Screen app ([WebKit, 2023](https://webkit.org/blog/14403/updates-to-storage-policy/)) [V, no newer Apple statement]. The 7-day rule does not delete first-party data in Home Screen apps by WebKit's own 2020 expectation ([WebKit](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)) [V, old]. Safari and Home Screen copies reportedly keep separate OPFS and IndexedDB ([Synthetixis](https://synthetixis.com/writing/pwa-ios-2026)) [R], so assume recordings do not follow an install. A Mac test on 26.5.2 found `createWritable` left a full temp copy of every file, 2.8 GB in one session, against zero for a sync handle ([kamiru-art #27](https://github.com/kamiru-art/mxm_video_converter/pull/27)) [R]. `persist()` is already called in `audio/index.html:169` and `audio/shared.js:153`, but its result is thrown away.

### Platform decisions

| Decision | Recommendation | Basis |
|---|---|---|
| Audio context | One 48 kHz context in the shell; read back the real rate; tools build parent-realm nodes through a shell API; no tool owns a context | [P] iframe tests; [R] [close() leak](https://github.com/Automattic/kandelo/pull/1410); [V] [shared destination](https://github.com/WebKit/WebKit/commit/b36fd0e044efbc40c7310dbb48144c8afc935ace) |
| Worklet shape | One processor hosting a WASM graph rather than many nodes | [I]: each node adds a JS call on one shared thread |
| Isolation | COOP `same-origin` and COEP `require-corp` on every `/audio/*` document and Worker; the service worker must preserve them on cached responses; review the analytics request noted in `sw.src.js` | [P] an iframe without COEP is refused; headers absent from repo, checked |
| Mic | One owner in the shell; treat as a session mode; close the track at take end; mono only; trust `getSettings()` | [V] bugs 326286, 311451, 210231; [I] |
| Audio storage | PCM in OPFS through sync handles in a Worker; metadata in IndexedDB; streaming into a SAB ring | [R], [I] |
| WASM memory | Fixed size, modest maximum, failure at startup rather than mid-session | [R], [I] |
| Durability | Show `persisted()` state; incremental writes during capture; flush on `visibilitychange`; project export to Files | [V] eviction policy; [I] |
| Session continuity | Wake Lock during transport; after foregrounding, verify audio flows by `currentFrame` or meter, since a context can read `running` while silent ([bulbro #64](https://github.com/mkusher/bulbro/pull/64)); keep a tap-to-restart control | [V], [R] |
| Imports | Parse WAV and AIFF directly in a Worker to keep 24-bit and avoid forced resampling; `decodeAudioData` only for compressed formats | [V] [spec](https://webaudio.github.io/web-audio-api/#dom-baseaudiocontext-decodeaudiodata), [P] |
| Exports | Render to file, then share on a fresh tap, as MATRIX E19 already does; stems as one zip | [V] [Web Share](https://w3c.github.io/web-share/); multi-file share untested |
| Native shell | Not now. It is the only route to hardware MIDI and LinkKit, and it would also bypass the mic bug, so keep it as the escape hatch if 326286 stays open | [I]; native clean per [326286](https://bugs.webkit.org/show_bug.cgi?id=326286) |

## One WASM core buys determinism, not scalar speed

**Scalar WASM was no faster than clean typed-array JS on either JavaScriptCore or V8** [P]. The case for WASM rests on three other results. Explicit 128-bit SIMD gave about 3× on voice kernels, the cold first block was 4 to 20× cheaper, and p99.99 block time was about 6× better than allocating JS on JSC [P/I]. WASM also keeps floating point deterministic apart from NaN bits and relaxed SIMD ([WebAssembly design](https://raw.githubusercontent.com/WebAssembly/design/main/Nondeterminism.md)) [V], which is what bit-exact bounce needs.

| Kernel, M3 Pro, ns per voice-sample | JS (JSC) | WASM scalar | WASM SIMD | % of quantum, best |
|---|---|---|---|---|
| 2 PolyBLEP + SVF | 4.3 | 4.2 | 1.4 | 0.007% |
| 4 cubic wavetable reads + SVF | 10.6 | 10.0–10.6 | no gather, not vectorised | 0.05% |
| 2 PolyBLEP + ZDF ladder | not run | 36–39 | scalar only | 0.17% |
| True peak 4×12, per channel | not run | 9.8 | 5.6 | 0.026% |
| FDN8 Householder | not run | 4.7 | no gain | 0.023% |

These are synthetic kernels on a laptop P-core, without modulation, envelopes or voice management [P]. The real limit is the scheduler. Ableton's AudioPerfLab shows the performance controller can place light work on efficiency cores, where a 0.5 ms task exceeds 3 ms and misses the 2.7 ms deadline; its fix uses native workgroup APIs a web page cannot call ([AudioPerfLab](https://raw.githubusercontent.com/Ableton/AudioPerfLab/master/README.md)) [V for native, I for Safari's thread]. WebKit's worklet thread uses `QOS::UserInteractive`, and no real-time policy appears in the excerpt read ([AudioWorkletThread.cpp](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/Modules/webaudio/AudioWorkletThread.cpp)) [V]. **So cap peak load at about 15% of a quantum as measured on a P-core, roughly 400 µs, and raise it only with device evidence** [I]. A steady load may help, by AudioPerfLab's Minimum Load logic, and bursty voice starts are the risk [I].

| Voice recipe | ns/sample | Voices at 15% cap | Voices at 50% cap |
|---|---|---|---|
| 2 osc, 2 wavetable reads each, SVF | 10.5 | about 300 | about 1000 |
| 2 PolyBLEP + ZDF ladder | 36 | about 85 | about 290 |
| 3 wavetable osc, ladder, 2× OS, mod matrix | about 125 | about 25 | about 80 |

All of this is scaled from Mac figures and assumes a similar iPhone P-core [I]. Suggested product limits before testing are **16–32 voices in Reduced on iPhone and 32–64 in Full on M5 iPad** [I]. Single-core Geekbench separates A19 Pro and M5 by only about 5–10% ([cpu-monkey](https://www.cpu-monkey.com/en/compare_cpu-apple_a19_pro-vs-apple_m5)) [R]. **The iPad therefore does not get a much faster worklet thread.** Its advantage is spare cores and sustained thermals, which a single worklet cannot use, so realtime Full on iPad needs Workers rendering frozen tracks ahead through a SharedArrayBuffer ring [I].

### Algorithm choices

**Oscillators.** Mipmapped wavetables beat plain PolyBLEP by a wide margin in this session's measurements. The table gives in-band alias power for a static sawtooth at 48 kHz [P], and it ignores mip crossfades, fast pitch modulation and table morphing.

| Method | 1014 Hz | 7043 Hz |
|---|---|---|
| Naive | -16.8 dB | -7.2 dB |
| PolyBLEP 2-point | -36.8 dB | -23.0 dB |
| PolyBLEP + 2× OS | -57.6 dB | -47.0 dB |
| PolyBLEP + 4× OS | -77.1 dB | -68.2 dB |
| Wavetable, 1 mip/octave, linear read | -99.1 dB | -123.1 dB |
| Wavetable, 1 mip/octave, cubic read | -136.1 dB | -178.2 dB |

The price is top-octave bandwidth: at one mip per octave a note just above a boundary loses up to an octave of harmonics unless it runs at 2× [I]. Vital uses 2048-sample frames and 11 bins ([wavetable.h](https://raw.githubusercontent.com/mtytel/vital/main/src/synthesis/lookups/wavetable.h)) [V] with 2× as the shipped default [R]. Urs Heckmann prefers 3–4 tables per octave and no oversampling ([KVR](https://www.kvraudio.com/forum/viewtopic.php?p=7139015)) [R]. A 256-frame table at 11 mips costs 22.5 MB, so frame count needs a cap in Reduced [I]. WASM SIMD has no gather, so SIMD helps PolyBLEP far more than wavetable reads [P]. Keep PolyBLEP for hard sync, PWM and cheap voices.

**Saturation.** ADAA with 4× "makes aliasing practically a non-issue even for a hard clipper", while 2× alone gains only 6 dB on a 1/f spectrum ([Vicanek](https://www.vicanek.de/articles/AADistortion.pdf)) [V]. An 8-coefficient polyphase IIR half-band reached -101 dB for a 20k/28k transition at 96 kHz with about 3.6 samples of low-frequency delay, against 79 FIR taps for 100 dB [P]. IIR rotates phase, so a dry/wet saturator needs a matching allpass on the dry path or an FIR [I]. HIIR is the reference library ([de Soras](https://ldesoras.fr/prod.html)) [V]; check its licence in the archive.

**Filters.** A trapezoidal SVF is the default because it is linear, closed-form and cheap ([Zavalishin](https://www.native-instruments.com/fileadmin/ni_media/downloads/pdf/VAFilterDesign_2.1.0.pdf)) [V, contents only]. The nonlinear ZDF ladder cost about 30 ns, roughly 7× the SVF voice [P]. Linearise from the previous sample in Reduced ([Mystran](https://www.kvraudio.com/forum/viewtopic.php?p=8500128)) and solve twice in Full ([Heckmann](https://www.kvraudio.com/forum/viewtopic.php?p=8500294)) [R]. Update coefficients every 16–32 samples with interpolation, because a per-sample `tan()` was outside the bench [I].

**Glue compressor.** Use stepped G-series timings: attack 0.1 to 30 ms, release 0.1 to 1.2 s plus Auto, ratios 2, 4 and 10:1 ([Sound On Sound](https://www.soundonsound.com/reviews/ssl-xlogic-g-series-compressor)) [R]. Build it feed-forward, peak-detecting and stereo-linked, as [Bonedo](https://www.bonedo.de/artikel/ssl-bus-comp-classic-test/) describes [R]; one clone's claim of a feedback topology is unverified ([KVR](https://www.kvraudio.com/product/g-bus-compressor-by-studio9-plugins)). A 2026 paper says the hardware's release depends on recent input history ([arXiv summary](https://huggingface.co/papers/2606.18573.md)) [R], which favours a two-stage release that combines fast and slow envelopes [I]. A 60–120 Hz sidechain high-pass and a 6 dB knee are suggested defaults, not specifications [I]. No verified open SSL circuit model was found. CTAGDRC is GPL-3.0, so it is a reference only ([CTAGDRC](https://github.com/p-hlp/CTAGDRC)).

**Limiter.** Compute per-sample gain, take a moving minimum, smooth it with a finite average no longer than the hold, and delay the audio to match ([Signalsmith](https://signalsmith-audio.co.uk/writing/2022/limiter/)) [V]. Feed it from a 4× interpolated sidechain and leave the audio path otherwise only delayed. That sidechain cost 5–10 ns per channel [P]. Target -1 dBTP, the [R128](https://tech.ebu.ch/docs/r/r128-2014.pdf) ceiling, since 4× can under-read by 0.688 dB ([BS.1770-5](https://www.itu.int/dms_pubrec/itu-r/rec/bs/R-REC-BS.1770-5-202311-I!!PDF-E.pdf)) [V]. Use 8× for a ceiling tighter than about -0.3 dBTP [I].

**Loudness.** A simple 38 Hz high-pass plus +4 dB shelf is acceptable only if the high-pass is second-order: 0.043 dB maximum error, against 6.6 dB at 20 Hz for first-order [P]. The exact BS.1770-5 coefficients cost the same two biquads, so use them, and recompute for other rates from [libebur128](https://raw.githubusercontent.com/jiixyj/libebur128/master/ebur128/ebur128.c)'s prototypes [V]. The real gap between a simple and a standard meter is gating at -70 LKFS and -10 dB relative over 400 ms blocks with 75% overlap [V]; a track that is half silence reads 3 LU low without it [I]. The standard's dB TP label requires at least 192 kHz, so 4× at 44.1 kHz falls just short on a literal reading [I], another reason to fix the engine at 48 kHz.

**Dither.** Apply TPDF as the last step before 16-bit quantisation, with independent seeded generators per channel. At 24 bits it is correctness, not audibility, and 32-bit float gets none [I, from [dither theory](https://en.wikipedia.org/wiki/Dither)]. Synth-only material with digital silence and pure tones is where truncation shows most [I]. Neither the Logic iPad nor the Cubasis export pages read mention dither ([Apple](https://support.apple.com/guide/logicpro-ipad/aiff-and-wave-file-options-lpip13845bbf/ipados)), so a default-on TPDF is a quiet differentiator, not a parity item [R, absence only].

**SRC and stretch.** Use r8brain-free-src, MIT with 49–218 dB stop-band ([README](https://github.com/avaneev/r8brain-free-src)) [V], or BSD libsamplerate, compiled to WASM for imports and exports. Signalsmith Stretch is MIT and ships a WASM/AudioWorklet release ([GitHub](https://github.com/Signalsmith-Audio/signalsmith-stretch)) [V], but has no dedicated transient handling ([design notes](https://signalsmith-audio.co.uk/writing/2023/stretch-design/)) [V], so test it on drums before committing. Rubber Band is GPL or commercial ([Breakfast Quay](https://breakfastquay.com/rubberband/)) [V].

**Reverb and delay.** An 8-line Householder FDN measured about 5 ns per sample [P], and with diffusion and modulation about 15–30 ns is expected [I]. Follow the [Signalsmith design](https://signalsmith-audio.co.uk/writing/2021/lets-write-a-reverb/) for Reduced. DAFx 2020 argues 16 is the lowest useful order for high quality ([paper](https://dafx2020.mdw.ac.at/Proceedings/papers/DAFx2020_paper_51.pdf)) [V], which sets Full. A [Dattorro plate](https://ccrma.stanford.edu/~dattorro/EffectDesignPart1.pdf) is a cheap alternative voice, with delays scaled 1.61× for 48 kHz [V]. Reverb should not be the tier-limited item.

### Tiers change little, because the cost is in the voices

| Component | Reduced (iPhone realtime) | Full (M5 iPad realtime, any export) |
|---|---|---|
| Oscillator | Wavetable 1×, 2–3 mips/octave, cubic | Wavetable 2×, half-band down, frame and mip crossfade |
| Voice filter | SVF; ladder linearised at 1× | Ladder 2 solves at 2× |
| Saturation | ADAA1 + 2×, 6-coef IIR (-75 dB) | ADAA1 + 4×, 8–10 coefs |
| Glue compressor | Same; detection every 4 samples | Same; detection per sample |
| Reverb | 8 lines + diffusion | 16 lines + diffusion |
| Limiter | 4× sidechain, 1.5 ms lookahead | 8× sidechain, 5 ms lookahead |
| Meter | Full BS.1770, 4× true peak | Same; 8× in export |
| Voices | 16–32 | 32–64 |
| SRC, dither | Export only | Export only |

Every cell is inferred from the measurements above and is unproven by listening. The Reduced master chain sums to about 1% of a quantum on M3 Pro [I], so nothing in it is worth tiering further. No listening test has established that Reduced is distinguishable from Full.

### Bit-exact bounce needs nine rules and one honest exception

Keep all DSP in one WASM module with no JS DSP and no `Math` calls, and use your own polynomial `sin`, `tanh` and `exp`. Process a fixed internal block; 32 divides the 128-frame quantum exactly, and it matches the coefficient update interval [I]. Timestamp every event in samples, and record live gestures at the sample where they were applied. Seed all randomness per track and voice, including drift, unison phase and dither. Make voice allocation a pure function of the event stream, and define the start state. Fix the engine at 48 kHz and convert afterwards. Treat tier as part of render state. Sum buses in fixed order with no relaxed SIMD. Host bounce in a plain Worker: it avoids [the offline postMessage race](https://jackschaedler.github.io/offline-audio-worklet-repro), avoids a single huge buffer, can stream to OPFS and can report progress [I]. `OfflineAudioContext` allocates its whole buffer up front and reports failure only when `startRendering()` rejects ([WebKit source](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/Modules/webaudio/OfflineAudioContext.cpp)) [V].

**A Full export cannot null against Reduced playback**, so offer two modes: *As heard*, exact and test-enforced, and *Full quality*, close but not identical. CI should compare SHA-256 of 32-bit float output between worklet capture and Worker bounce, and also compare iPhone against M5 on the same fixture [I].

### DSP and engine decisions

| Decision | Recommendation | Basis |
|---|---|---|
| Core language | Small custom C, Rust or Zig core to WASM with `-msimd128` and explicit lanes | [P] kernels; [I] on tier and null-test control |
| Libraries | MIT only in the shipped core: r8brain, Signalsmith Stretch, libebur128. Read Surge and Vital (GPL-3.0) for ideas, never for code | [V] licences |
| Faust, Elementary, Csound | Prototype only; do not ship as the core | [I]; Csound's LGPL is [awkward](https://forum.csound.com/t/re-csnd-csound-wasm-and-the-lgpl-how-to-use-and-comply-in-a-web-app/2370) |
| Load cap | 15% of a quantum at P-core speed, peak | [I] from AudioPerfLab |
| Warm-up | Render a few hundred silent blocks through the real DSP before transport start | [P] cold blocks about 27–35× steady state |
| Denormals | Flush or offset in feedback paths anyway; Apple Silicon showed no slowdown but also no flushing | [P] |
| Governor | Choose tier from a measured warm-up benchmark, not device model. Shed in the order oversampling, voice cap, stealing. Never change tier inside a held note. Mark any governed passage non-reproducible | [I] |
| Load sensing | Worklet scope has no `performance` [P]; test `Date.now` resolution and underrun detection | [P], open |
| Frozen tracks on iPad | Worker renders ahead through a SAB ring | [I] |

## Seed and branch stays the door; the engine behind it grows up

The existing synth has 31 genes in 5 categories, up to 6 parked branches, setups, layers (drive, crush, filter, comb) and a gene spiral (`audio/MATRIX.md` Y4–Y13). It builds on native `OscillatorNode` and `BiquadFilterNode`, and `audio/t/synth.html` loads no worklet module of its own, so it can neither be bit-exact nor reach the tiers above [I]. **Moving voices into the WASM core is the prerequisite for everything else in this report.**

Synplant shows why the concept works and where it stops. It is a two-oscillator FM subtractive synth with a seed holding one sound and up to 12 branches mapped to the notes of an octave, where distance from the seed is mutation amount ([manual p.4](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=4)) [V, 1.2 manual via a mirror]. Lidström says the synth is built to give interesting results when mutated ([CDM](https://cdm.link/?p=117612)) [R]. Genes are normalised with 0.5 commonly neutral, and `fx_size` is excluded from growth to avoid disruption ([manual p.15](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=15)) [V], so genes are not equal. Atonality barely affects short branches and drastically affects long ones ([manual p.6](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=6)) [V]. Its mutation function is not public, and whether it is deterministic per seed is unknown. The official Synplant 2 PDF could not be retrieved, so the V2 gene list and voice count remain unconfirmed.

"Fully featured" has a fairly stable meaning across the comparison set. Ordered by frequency of appearance, it is two morphing oscillators plus sub, noise and FM, wavetable as an extension, independent amp and mod envelopes, at least two synced LFOs, a modulation list, unison with gain compensation, mono, legato, glide and poly with a visible voice count, per-voice drive then shared effects, and four to eight macros [I, from the set below]. Synplant's shared envelope is its most conspicuous limit by comparison. Animoog Z runs 16 voices, a 10-lane MOD page with Solo and Enable ([App Store](https://apps.apple.com/app/id1586841361)) [V], and three LFOs ([MusicRadar](https://www.musicradar.com/reviews/moog-animoog-z)) [R]. Drambo offers up to 16 voices per rack, with morph groups and scenes reducing many controls to one slider ([App Store](https://apps.apple.com/us/app/drambo/id1469365718)) [V]. A reported Bitwig pitfall, stacked voices getting 16× louder ([Synthtopia](https://www.synthtopia.com/?p=140751)) [R], is why unison needs gain compensation.

Small-screen instruments rarely remove depth. They hide it behind pages and single gestures, and the strongest pattern is "hide by gesture, reveal by page" [I]. Reviewers still find Synplant's DNA editing tricky ([MusicTech](https://www.musictech.net/reviews/plug-ins/sonic-charges-synplant-2-review/)) [R], and Lidström says V2 added knobs and graphs because the V1 spiral was deliberately hard ([CDM](https://cdm.link/synplant-2-hands-on/)) [R]. The spiral works as an overview, not as the editor.

**Note entry has no controlled evidence behind it.** No study comparing piano, pads, strips and isomorphic grids on phones was found. At 44 pt on a 390 × 844 pt phone a portrait piano fits about one octave, against 2.7 in landscape, while a 5 × 5 grid gives 78 pt pads [I, arithmetic]. Shipped practice favours in-key pads: Ableton Note's 25 pads ([App Store](https://apps.apple.com/dk/app/id1633243177)) and Koala's 10 grid scales ([docs](https://metawork-studio.github.io/koala-documentation/mobile/5-sequence.html)) [V]. Reviews call Animoog's strip keyboard best on iPad ([MusicRadar](https://www.musicradar.com/reviews/moog-animoog-z)) [R]. "Scale lock" hides two features, a layout that omits notes (Koala) and pitch snap on a continuous surface (Animoog), and they should be specified separately [I]. Velocity is the biggest missing input on a phone, and Koala's height-on-key mapping, where lower on the key is louder, is a shipped substitute [V].

**Jamming depends on capture.** Note's Capture keeps what you just played ([App Store](https://apps.apple.com/dk/app/id1633243177)) [V], which removes arming altogether. EP-133's hold-to-overdub is next best ([guide](https://teenage.engineering/guides/ep-133/play-and-record)) [V]. The app already keeps a passive 4-minute audio capture (MATRIX Y14). Adding a rolling MIDI event buffer beside it gives both the audio and the notes for any moment [I]. SunVox users name parameter editing while playing an on-screen keyboard as a pain point ([Audiobus forum](https://forum.audiob.us/discussion/comment/334712/)) [R], so latching needs to be a first-class control.

### Synth decisions

| Decision | Recommendation | Basis |
|---|---|---|
| Engine | Move voices into the WASM core; keep gene mapping in JS, sending resolved parameters as sample-stamped events | [I] |
| Patch compatibility | Version the gene schema; new genes default to neutral so old seeds keep their identity | [R] Synplant kept backward compatibility ([CDM](https://cdm.link/?p=117612)); expect sound changes from the port |
| Oscillators | 2 wavetable oscillators with morph, sub, noise, FM B→A | [V] Synplant genes; [I] |
| Envelopes, LFOs | Independent amp and mod envelopes; 2 LFOs now, a third if the mod list needs it | [I]; Synplant limit |
| Modulation | List of 8–10 lanes with Solo and Enable, not a graph; depths are genes, so branches can mutate motion | [V] Animoog; depths as genes has no source [I] |
| Mutation | Pure function of seed vector, branch direction and length, using a seeded PRNG; per-gene weight and lock; a pitch-stability gene playing Atonality's role | [V] `fx_size`, Atonality; [I] |
| Inheritance | Keep single-parent. Do not add crossover until single-parent is exhausted | [I]; no source shows crossover |
| Branch play modes | Two explicit modes: branches per note, and one branch across all notes | [V] mapping; [R] clone to all ([SOS](https://www.soundonsound.com/reviews/sonic-charge-synplant-2?amp)) |
| Depth reveal | Performance surface first, editor one gesture away, gene spiral as overview, grouped knobs with graphs as the editor | [R], [I] |
| Macros | 4–8, one always on the jam surface | [I] |
| Note input | Phone: 5 × 5 in-key pads with a chromatic toggle. Landscape or scrolling strip for piano. iPad: scrollable strip with scale snap, plus 12-branch pads | [I]; A/B with thumbs |
| Velocity | Y position on pad; slide after press for per-note modulation | [V] Koala; [R] Animoog ([Engadget](https://www.engadget.com/moog-animoog-z-i-os-softsynth-music-app-170019893.html)) |
| Capture | Always-on rolling MIDI buffer with one-tap keep; hold to overdub | [V], [I] |
| Audio-to-patch | Defer. Genopatch took a decade of work and months of training per [Lidström](https://cdm.link/?p=117612) | [R] |
| Library | Small tag set from day one; plain-text patches | [R] untagged browsing criticised; [V] `.synp` is text ([manual p.8](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=8)) |

## A pad is a note, a chain and a cached render

Ableton's Drum Rack is a note router, not a sound engine: 128 pads, one per MIDI note, each fronting device chains, with **Receive**, **Play** and **Choke** controls, 16 choke groups and up to six returns ([Ableton](https://www.ableton.com/en/manual/instrument-drum-and-effect-racks/)) [V]. Dropping a new sample replaces only the Simpler and keeps the effects [V]. Bitwig's Drum Machine works the same way, with up to 128 full chains ([Bitwig](https://www.bitwig.com/userguide/latest/advanced_device_concepts/)) [V]. So a synth is just another chain behind a note, and the Receive and Play split is what lets one data model cover samples and synths [I].

Two product families exist. Pad samplers such as Koala, MPC and EP-133 bind a sound to a pad, and track samplers such as Digitakt and Octatrack bind it to a sequencer track. This rack is a pad sampler. Record is a pad gesture in the fastest products. On Koala you hold a free pad and release to stop ([docs](https://metawork-studio.github.io/koala-documentation/mobile/2-general-overview.html)) [V]. EP-133 adds the two things that gesture lacks, a threshold and hands-free mode ([TE](https://teenage.engineering/guides/ep-133/functions)) [V], and both matter when one hand holds the phone [I]. Octatrack's volatile recorder buffers ([manual](https://www.manualsdir.com/manuals/657165/elektron-octatrack.html?page=60)) [R] are the warning: a take must be saved immediately. Lost samples are the most damaging complaint class found ([Blip forum](https://www.blipinteractive.co.uk/community/discussion/comment/12562)) [R]. Digitakt's years without free slicing ended in a much-requested Slice machine ([Elektron](https://www.elektron.se/release-notes/digitakt-ii), [MusicRadar](https://www.musicradar.com/music-tech/samplers/digitakt-iis-new-firmware-update-adds-a-major-user-requested-feature-and-finally-lets-it-step-out-of-the-shadow-of-the-original)), so slicing is non-negotiable [I]. Koala users ask for pattern MIDI export ([wishlist](https://hiphopdrumsamples.com/blogs/hip-hop-producer-blog/koala-sampler-feature-wishlist)) [R], which is cheap here because hits are already MIDI.

Geometry favours 4 × 4. With 8 pt margins and 6 pt gaps on a 390 pt phone, 4 × 4 gives about 89 pt pads and 8 × 8 about 42 pt, below Apple's 44 pt [I, arithmetic]. No usability study supports this; it is convergent practice, with Koala at 64 pads in four banks of 16 ([docs](https://metawork-studio.github.io/koala-documentation/mobile/2-general-overview.html)) [V].

**The CPU tradeoff has no benchmark behind it.** Evidence is anecdotal ([Ableton forum](https://forum.ableton.com/viewtopic.php?p=1720171)) [R]. The reasoning is solid, though [I]. A live pad keeps pitch, velocity and patch editable, costs per voice and scales badly with fast rolls and long tails. A rendered pad costs about a buffer read but freezes timbre. The hybrid gives both: the pad stores the patch and a cached render, plays the cache by default, and goes live only where variation matters or headroom exists. MPC's four layers per pad ([manual](https://www.manualslib.com/manual/1282429/Akai-Mpcx.html?page=41)) [R] is a sensible ceiling for velocity-layered caches.

The cache must respect the bounce rules [I]. A cached render is a function of patch, seed, pitch, velocity layer and tier, so key it on a hash of all five, render it with the same core, and treat a cache hit as part of render state. Otherwise *As heard* stops being reproducible when a cache goes stale.

GM percussion places kick at 36, snare 38, closed hat 42 and open hat 46 ([Wikipedia](https://en.wikipedia.org/wiki/General_MIDI)) [R]. Ableton calls 36 C1 ([Ableton](https://www.ableton.com/en/manual/converting-audio-to-midi/)) [R], while GM tables and EP-133 call it C2 ([TE](https://teenage.engineering/guides/ep-133/system)) [V]. **Write numbers, never derive from names.** The formula `36 + 16 × bank + pad index`, counted from the bottom-left, gives bank A 36–51 and makes Ableton kits land correctly if their default layouts follow GM [I]. Whether Drum Rack ignores the channel of an imported `.mid` is unverified. Test it with a real round trip, which this repo's LiveBridge setup allows.

### Drum rack decisions

| Decision | Recommendation | Basis |
|---|---|---|
| Data model | Pad = receive note, play pitch, choke, play mode, source (sample or patch), chain, send levels | [V] Ableton; [I] |
| Layout | 4 × 4 per view, banks A–D for 64; iPad shows two banks or 8 × 8; bank buttons outside the grid, no swipe on pads | [V] Koala; [I] mis-trigger reasoning |
| Note map | `36 + 16 × bank + pad`; default kit in GM positions (kick pad 1, snare 3, closed hat 7, open hat 11, 1-based) | [I] |
| Note labels | Ableton naming plus the number | [I] |
| Choke | Numbered groups, 6 on phone | [V] Koala 6, Ableton 16; [I]. Bitwig's pairwise targets are richer but harder |
| Play modes | One-shot, gate, loop with hold toggle; mono or poly per pad | [R] Koala; [V] EP-133 |
| Record gesture | Hold empty pad; optional threshold; a hands-free latch | [V] |
| Sources | Two only, Mic and Master, as one persistent toggle | [I]; Octatrack's many routes confuse ([Elektronauts](https://www.elektronauts.com/t/struggling-octatrack-newbie-needs-advice/138507)) [R] |
| Master capture | Internal tap on the shell graph; no OS permission and no mic route change | [I] |
| Other apps' audio | Out of scope | [R] even Koala's support is unverified ([tutorial](https://djkokumoproductions.netlify.app/tut-koala)) |
| Edit safety | Pad settings stay metadata; keep raw takes; no destructive crop (EP-133's cannot be undone, [TE](https://teenage.engineering/guides/ep-133/modes)); global undo | [V], [I] |
| Re-record | New take inherits pitch, envelope, choke and effects | [V] Ableton swap rule |
| Slicing | Equal, transient and manual, up to 64 slices, chromatic from 36 to match Slice to New MIDI Track | [V] [Ableton](https://www.ableton.com/en/live-manual/12/converting-audio-to-midi/), [Digitakt II](https://www.gearnews.com/elektron-digitakt-ii-review/) [R] |
| Sends | 2–3 shared rack sends, not 6 | [I]; EP-133 lives with one master FX |
| Per-pad FX | Two slots | [V] Note's two-effect recipe; [I] |
| Synth pads | Cached render by default, up to 4 velocity layers, live per pad; caps per pad and global, with stealing | [I] |
| Timeline data | MIDI always. Pad pitch stays in pad metadata; a melodically played synth pad exports as a separate pitched track | [I] |
| Export | `.mid` plus rendered WAVs named with note, such as `A07_F#1_42_closedhat.wav`. A synth patch cannot travel to Ableton in any format found | [I] |

## The phone screens focus one column at a time

**Logic Pro does not run on iPhone** [R], so its evidence is tablet evidence. The phone-native data points are GarageBand, Note, Auxy, Koala, BandLab, FL Studio Mobile and Cubasis. Logic Pro 13 was announced for November and its iPad changes were not established ([MusicRadar](https://www.musicradar.com/music-tech/apple-goes-all-in-on-ai-with-logic-pro-13-introducing-an-intelligent-assistant-that-can-control-your-daw)) [R].

### Channel strips: peek on hold, open on tap, no modes

Nobody fits a full strip on a phone. Apps split into shrunken desktop mixers (Logic, Cubasis) and fixed recipes (Note, Koala, Auxy, GarageBand). Logic's Setup and Mix modes make one slot gesture mean edit the chain or perform the mix, and holding a slot in Mix mode opens a mini view of key parameters in place ([Apple](https://support.apple.com/guide/logicpro-ipad/work-with-plug-ins-in-the-mixer-lpip806df382/ipados)) [V]. Cubasis has eight inserts per track, eight global send buses, and slot colour for state ([Steinberg](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/EFFECTS.html)) [V]. Note gives each track exactly two effects, FX1 feeding FX2 ([Note manual](https://www.ableton.com/en/note/manual)) [V]. Reconstructed from documented steps, adding an insert takes about three taps plus a pick in Logic, and about two to three in Cubasis [I]. No measured study exists.

A hidden global mode is the weak part of Logic's design for a gesture app [I]. Hold for a peek and tap to open reach the same places without one. A chain of two visible slots that expands to eight sits between Note's simplicity and what an expert expects, and each slot's colour shows empty, active or bypassed [I].

### Automation: touch the control, perform, confirm

Serious apps offer perform and draw paths, and differ in choosing the parameter. Logic uses a per-track pop-up ([Apple](https://support.apple.com/guide/logicpro-ipad/automation-parameters-lpipbf8cb678/ipados)) [V], and Cubasis a drop-down that highlights parameters holding data, with Goto source ([Steinberg](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/IS_Automation.html)) [V]. FL starts a clip by tweaking the control ([Image-Line](https://www.image-line.com/fl-studio-learning/fl-studio-mobile-online-manual/html/plugins/FL%20Studio%20Mobile_Playlist.htm)) [R]. Note shows a **dotted line** of the captured move, and tapping Add commits it ([Note manual](https://www.ableton.com/en/note/manual)) [V]. Combining FL's pick-by-touch with Note's preview removes the parameter list altogether [I]. Attach automation to clips, as Note and FL do, since Logic's track and region split is heavy for a phone and clip-attached data survives copying [I]. Finger strokes create many points, so simplify on stroke end, as Cubasis's Reduce does by command [V, I].

With time running downward, the lane is a vertical strip with value left to right, and a thumb can trace it straight down. No shipping example was found, and no data compares draw-first with perform-first on phones [I].

### Piano roll: vertical is unoccupied ground

Every mainstream piano roll found keeps time horizontal, and Note's manual mentions landscape use [V]. Time-downward layouts exist only in trackers such as [SunVox](https://apps.apple.com/au/app/sunvox/id324462544) and falling-note trainers [R]. That is an opportunity and also a lack of evidence, and one search cannot prove no small iOS app does it. Pitch on the horizontal axis matches a keyboard, and a keyboard docked at the bottom doubles as the pitch ruler [I]. Portrait gives time the long axis but pitch only about eight keys at 44 pt, so scale-fold and pitch zoom matter more than in a landscape roll [I].

The risk is occlusion: a thumb at the lower edge hides what is about to play, so playhead position must be tested first [I]. SunVox moves its cursor by drag, so a finger does not cover the target ([Tape Op](https://new.tapeop.com/reviews/gear/110/sunvox-modular-music-studio)) [R]. Several mechanics are worth copying. Logic's dwell-to-zoom works after about a second on a note ([Apple](https://support.apple.com/guide/logicpro-ipad/trim-notes-lpipb3614476/ipados)), its last length becomes the default ([Apple](https://support.apple.com/guide/logicpro-ipad/add-notes-lpip3d423c4b/ipados)), and setting quantize to Off restores timing ([Apple](https://support.apple.com/guide/logicpro-ipad/quantize-timing-lpipaab75231/ipados)) [V]. Cubasis redraws velocities in one stroke ([Steinberg](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/ED_MIDI.html)) [V]. Avoid persistent tool modes and tap-on-note-deletes when tap also means audition [I]. Dwell gestures compete with one another, so map the whole vocabulary before building any of it [I].

### Overdub: store raw takes, shift by a per-route offset

Cubasis is the clearest model on wired audio: an Audio Recording Offset Compensation with an automatic Calibrate button using output-to-input loopback, redone after any interface or buffer change ([Steinberg](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/SETUP.html)) [V]. Logic's Low Latency Monitoring disables PDC on focused and record-enabled tracks, bypasses plug-ins over a limit and marks casualties in orange ([Apple](https://support.apple.com/guide/logicpro-ipad/record-with-low-latency-monitoring-mode-lpip828e667e/ipados)) [V]. For Bluetooth, TakeOne's vendor method plays 16 sweeps, cross-correlates, takes the median, leaves the take raw and shifts the timeline, and flags takes when the route changes ([Musevv](https://www.musevv.com/blog/how-i-solved-bluetooth-audio-latency-on-ios.html)) [R].

AirPods figures are not comparable: about 130 ms output ([OpenH1](https://github.com/OpenH1/OpenH1/pull/276)), near 160 ms drifting ([Apple Forums](https://developer.apple.com/forums/thread/679274)), and 230–310 ms round trip ([Musevv](https://www.musevv.com/blog/how-i-solved-bluetooth-audio-latency-on-ios.html)) [R]. iOS's reported value is said to be often unreliable or zero on Bluetooth (same source), and one community test saw a reported 154 ms gap yield only about 30 ms audibly ([Apple Community](https://discussions.apple.com/thread/256097737)) [R]. Input latency is not exposed by `outputLatency` at all [I].

**Calibration itself runs through the broken path** [I]. Loopback needs the mic open while audio plays. Echo cancellation would attenuate the chirp, so it must be off, and on iOS 27 that moves output to the earpiece, so a speaker calibration may measure the wrong route. Ship a tap-to-click fallback, the method a Steinberg user describes ([forum](https://forums.steinberg.net/t/incorporate-some-kind-of-delay-compensation-for-bluetooth-or-ability-to-move-audio-by-msecs/1004415)) [R], and verify loopback on a device before relying on it.

### Range bounce: a drag sets the range, the sheet inherits it

Logic's Cycle fills export Start and End ([Apple](https://support.apple.com/guide/logicpro-ipad/export-a-project-to-an-audio-file-lpipbde89132/ipados)) [V], and its stems go as uncompressed files in one ZIP ([Apple](https://support.apple.com/guide/logicpro-ipad/export-tracks-as-individual-audio-files-lpip1f5dd156/ipados)) [V]. Cubasis offers WAV, AIFF, FLAC, M4A, MP3 and MIDI, with effect tail on by default and off for seamless loops, plus separate files, dry, normalise and mono ([Steinberg](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/MEDIA.html)) [V]. Users report extra milliseconds on exported loops ([store chart page](https://clickyourapp.com/charts/app-store/com.steinberg.cubasis3/)) [R], the trap a sample-accurate range with an explicit tail switch avoids [I]. Stem size follows from 23 MB per stereo minute, so render stems one at a time or in chunks to OPFS [I]. That removes much of the case for "iPhone warns, iPad exports": both can export, and the difference becomes time and heat, not feasibility [I]. Encoding M4A depends on WebCodecs `AudioEncoder`, listed from Safari 26 by one note ([music-os #67](https://github.com/dcromp/music-os/issues/67)) [R], so confirm it first.

### Project and takes: a date grid, take stacks, a trash

Apps either inherit a file browser or build a media store, and no in-app music tag system was confirmed. A PWA has no file system to inherit, so a simple date-ordered grid with waveform thumbnails suits an icon-led UI [I]. Logic has the only well-documented mobile take system: folders, a pop-up, renaming, colour while recording and Quick Swipe Comping ([Apple](https://support.apple.com/guide/logicpro-ipad/intro-to-takes-and-comps-lpip458ce486/ipados)) [V]. Cubasis's Hub ([Steinberg](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/MEDIA.html)) cuts time to sound, and its Trash folder protects gesture-triggered deletes [V].

### Ableton: stems and MIDI first, `.als` by template second

Note itself ships one-way, through Ableton Cloud or an `.ablbundle` opened in Live 11.2.5+ ([Note manual](https://www.ableton.com/en/note/manual)) [V]. `.als` files are gzipped, undocumented, version-specific XML ([expressive-liveset](https://github.com/swwallowws/expressive-liveset)) [R], and newer Live opens older sets but not the reverse ([Ableton](https://help.ableton.com/hc/en-us/articles/360000841004)) [R]. Ableton's official export library is an iOS static library by licence request, covering audio and MIDI tracks, session or arrangement clips and tempo, with no automation or devices ([docs](https://ableton.github.io/export/)) [V]; a web app cannot link it [I], and whether it is still licensed is unknown. Auxy shipped on it ([CDM](https://cdm.link/auxy-ableton-export-tweaks/)) [V].

For the web, the route is template cloning: gunzip a set saved by Live and inject content. expressive-liveset does this in MIT Rust that builds for `wasm32-unknown-unknown`, targeting schema `12.0_12402` [R]. **Whether it writes audio clips was not established**, which matters because audio clips are the point of the export. fmtals is an MIT C++ alternative, young and unproven ([fmtals](https://github.com/adriensalon/fmtals)) [R]. Live Lite's 8-track, 8-scene limit forces demo mode when exceeded ([docs](https://ableton.github.io/export/)) [V], so warn before export. Link needs UDP multicast, and every browser project checked wraps the C++ SDK in a local process ([ricochet PR](https://github.com/MohamedFekryyy/ricochet/pull/3)) [R], which an iOS PWA cannot run [I]. How Ableton's licence applies to generated sets is a question for iori.

### One-off hints: fire on need, dismiss by doing

NN/g finds pushed tutorials do not improve performance, and recommends pull help triggered by a signal of need, easy to dismiss and to recall ([NN/g](https://www.nngroup.com/articles/onboarding-tutorials/)) [V, 2023]. Its overlay guidance is one action per tip, no chains, visuals with minimal text, and a look distinct from the UI, since users tried to tap annotations ([NN/g](https://www.nngroup.com/articles/mobile-instructional-overlay/)) [V, 2014, tablets]. ArcGIS's required-action walkthrough shows novel interactions still justify teaching by doing [V]. A TU Dresden study reportedly rates tutorials as effective for unfamiliar interactions [R, URL unconfirmed], so the NN/g line is not absolute. Norman and Nielsen's discoverability critique ([paper](https://kawilliams.github.io/teaching/hci/papers/gesture-interfaces.pdf)) [R] means hints alone are not enough: every critical function needs at least one visible path [I]. No DAW-specific onboarding research was found.

### DAW screen decisions

| Decision | Recommendation | Basis |
|---|---|---|
| Strip | One tall strip in focus, reached by a gesture from its track, with no row of strips on phone | [I] |
| Insert chain | 2 visible slots, expandable to 8; colour-coded state; hold to peek, tap to open, hold-drag to reorder | [V] Note, Cubasis, Logic; [I] |
| Sends | 2–3 global return buses; level on the focused strip | [V] Cubasis model; [I] |
| Master | Inserts, then the limiter post-fader | [V] Cubasis |
| Reset, multi-touch | Double-tap resets; multiple fingers move multiple faders | [V] [Logic](https://support.apple.com/guide/logicpro-ipad/mixer-gestures-lpip70ec7de4/ipados) |
| Automation arm | Touch the control during playback; dotted preview; confirm | [V] Note, [R] FL; [I] combination |
| Automation default | Touch behaviour (returns on release), Latch as the option; clip-attached; values sample-stamped | [R] [Logic](https://support.apple.com/guide/logicpro-ipad/write-automation-in-real-time-lpip38f0b9e0/ipados); [I] |
| Stroke cleanup | Automatic simplification at stroke end; a marker on any automated control | [V] Cubasis; [I] |
| Piano roll | Build vertical; prototype playhead position before anything else | [I], untested |
| Note editing | Modeless: tap adds, edge drag trims, dwell zooms, long press deletes; rotated one-stroke velocity lane; velocity colour; non-destructive quantize | [V]; [I] |
| Numeric entry | Through the app's existing wheel, keeping exact values one gesture away | Project convention |
| Take offset | Per-route value, keyed by output; applied as clip metadata on raw takes, so recalibration fixes old takes | [R], [I] |
| Calibration | Chirp loopback where it works; tap-to-click fallback; `outputLatency` as a hint read repeatedly | [V] Cubasis; [R] TakeOne; [I] |
| Route change | Mark takes suspect; never trust a stale offset | [R] TakeOne |
| Monitoring | No input monitoring on Bluetooth; warn on it for overdubs; headphones-first flow | [V] [Cubasis](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/SETUP.html); [I] |
| AirPods mic | Prefer the built-in mic with AirPods on A2DP if a page can hold that state; HFP is forced otherwise | [R]; unverified on web |
| PDC | From day one; limiter lookahead reported; low-latency mode that bypasses latent effects and shows them | [V] Logic; [I] |
| Range | Drag along the time axis; the export sheet inherits it, with no numeric fields on the default path | [V] Logic; [I] |
| Export formats | WAV 24-bit at 48 kHz default, 16-bit with TPDF, 32-bit float, M4A if encoder is confirmed, FLAC if cheap, `.mid`; no MP3 | [I]; Note's [fixed preset](https://www.ableton.com/en/note/manual) shows simple defaults work |
| Export toggles | Tail, dry, normalise off by default, As heard or Full | [V] Cubasis, Logic; [I] |
| Stems | Per track, post-fader, one ZIP, rendered in chunks | [V] Logic; [I] |
| Project browser | Date grid with thumbnails; launch offers new and last; continuous autosave, since a jetsam reload warns of nothing | [V] Cubasis; [R], [I] |
| Takes | Stacked in the track column, colour while recording, auto-named by time, swipe comp later | [V] Logic; [I] |
| Delete | Soft delete to a Trash | [V] Cubasis |
| Ableton phase 1 | Zip of per-track WAV stems and `.mid`, delivered by share sheet | [I]; lowest risk |
| Ableton phase 2 | `.als` by template clone with audio stems and dry MIDI, after proving audio clips; pick the lowest template version you can test; warn at 8 tracks or 8 scenes | [R], [I] |
| `.als` import | Do not build; Note itself is one-way | [V] |
| Link | Do not attempt; tap tempo and nudge | [R], [I] |
| Hints | One trigger, one hint, once, stored per gesture; dismissed by performing it; a failed attempt also fires it; ghost hand path over the real target; one "show me" gesture; none for pinch, scroll or drag | [V] NN/g; [I] |
| Post-hoc naming | A brief label after uncommon gestures, as Cubasis's undo does | [V] [Cubasis](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/ED_MIDI.html) |

## What must be measured on a real device, in priority order

The first four rows can each change the architecture, so run them before building screens. The app's `tools/audio-test` harness covers engines and emulation, not the hardware facts below. Run tests on iOS 26.6 and 27.2, an iPhone 15 Pro or newer, an older iPhone and an M5 iPad.

| Rank | Measure | Method | Decides |
|---|---|---|---|
| 1 | Playback with the mic open | Backing track through speaker, wired, USB-C and AirPods, using the current constraints and with echo cancellation on. Record route, level, crackle and stereo width, then check whether output recovers after the track stops | Overdub flow; headphones rule; whether the native shell moves up |
| 2 | Real worklet load | Run the session's kernels in an AudioWorklet in Safari and standalone. Compare JS, WASM and SIMD; step load until underrun; log p99.9 during heavy DOM work | The 15% cap; voice counts; whether efficiency-core placement applies |
| 3 | Isolation and shell | SAB, COEP iframes, SW-cached offline launch, iframe nodes on the parent's context and survival through GC, all in standalone | Whether the shell architecture survives |
| 4 | Memory ceiling | Step total allocation in 100 MB increments with typed arrays and WASM, per device; note whether failure is a reload or a rejection | Budgets; streaming window; fixed memory size |
| 5 | Sustained thermal load | 20–30 minutes at the chosen cap, watching underruns and speed | Whether tier targets hold beyond a demo |
| 6 | Latency truth | Compare `outputLatency` with measured round trip per route. Check loopback calibration with the mic on, including whether it measures the earpiece path | Calibration design; per-route offsets |
| 7 | OPFS streaming | Sustained read and write from a Worker, N tracks playing while one records; `createWritable` temp-copy leak on iOS | Track count; storage path |
| 8 | Bounce | Worker and `OfflineAudioContext` speed, peak memory, failure mode at the limit; hash equality with worklet capture and between iPhone and M5 | Bounce host; determinism claim |
| 9 | Interruption | Screen lock, app switch, phone call, route change; recovery time; whether 26.0.1's standalone failures persist | Recovery UI; flush strategy |
| 10 | Touch to sound | Pad tap to output on speaker and wired, multi-touch limit, simultaneous pad hits | Playability; pad layout. No web touch latency figure was found |
| 11 | Pad voice cost | Live synth pads against cached renders in fast rolls and long tails | Cache default; voice caps |
| 12 | Share and storage | Large ZIP, multi-file share, M4A encode, `persist()` result, `estimate()` | Export path; durability messaging |
| 13 | Interface on thumbs | Vertical roll occlusion and playhead position; pad grid against strip against piano | Piano roll and note input |
| 14 | Inputs | USB input selection, stereo capture, AirPods mic route | Whether any interface claim can ever be made |
| 15 | Listening | Blind Reduced against Full on fixtures | Whether the tier split is audible at all |

Separately, on a Mac with Live: round-trip a generated `.mid` and `.als` through LiveBridge, checking channel handling, kit mapping and audio clips.

## Conclusion

The research reverses the instinctive priority. Synth voices are cheap, and master-chain quality is close to free on both devices. What is expensive is everything around them: an unfixed mic path, a silent memory kill, and a scheduler the app cannot influence. A web DAW on iOS therefore wins by being an excellent instrument and an honest recorder, leaning on internal capture, cached renders and post-hoc alignment, rather than by imitating a native tracking rig. The iPad's edge is also not what a "full mode" implies: it has no meaningfully faster audio thread, only spare cores that a Worker-rendered architecture can use.

Two choices make the rest cheap. Deterministic rendering from one core makes bounces, stems, cached pads and tier switching the same problem. Storing everything raw with metadata makes calibration, quantize, comping and pad edits reversible. One external event would change the plan: a WebKit fix for bug 326286 would reopen speaker overdubbing, while a long wait would make the thin native shell worth building, since it is also the only door to hardware MIDI and Link.
