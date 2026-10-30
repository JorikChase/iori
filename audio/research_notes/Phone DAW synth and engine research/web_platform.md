# Web platform limits for a DAW as an iOS/iPadOS PWA (researched 2026-10-30)

Evidence labels used throughout:
- **[PRIMARY]** WebKit blog, Bugzilla, WebKit source, W3C, caniuse/MDN data.
- **[REPORT]** a dated developer report, not confirmed by Apple.
- **[PROBE]** my own run on 2026-10-30 in Playwright WebKit (reports version 27.2) and Chromium 156 on macOS. This is the WebKit engine on a Mac, NOT iOS. It proves API shape and engine logic. It proves nothing about iOS audio hardware, memory, timing or the audio session.
- **[UNVERIFIED]** no source for this OS version.
- **[DEVICE TEST]** must be measured on a real iPhone and iPad.

## Capability table (the objective)

### Takeaway
The brief's "newest = iOS 26" is out of date. iOS 27 shipped in September 2026 and Safari 27.2 is the current release, so the table covers both 26.6 and 27.x. Most of the architecture holds: one parent AudioContext, same-origin iframes, SharedArrayBuffer, WASM SIMD. The serious blocker is microphone use during playback, which got worse on iOS 27 and is open and unassigned.

### Cited Findings
- iOS 27 / Safari 27.0 shipped in September 2026 — [9to5Mac, 2026-09-17](https://9to5mac.com/2026/09/17/webkit-blog-breaks-down-whats-new-with-safari-27-for-developers-including-mcp-support/). Safari 27.1 is dated 2026-10-23 — [WebKit](https://webkit.org/blog/18486/webkit-features-for-safari-27-1/). Safari 27.2 is dated 2026-10-26 and described as available now — [WebKit](https://webkit.org/blog/18515/webkit-features-for-safari-27-2/). The last iOS 26 feature release is 26.6, 2026-07-27 — [WebKit](https://webkit.org/blog/18178/webkit-features-for-safari-26-6/).

| Capability | iOS/iPadOS 26.6 | iOS/iPadOS 27.x | Evidence | Device test? |
|---|---|---|---|---|
| Web MIDI | No | No | PRIMARY (caniuse, bug 107250 open) | No |
| AudioWorklet, one context, parent page | Yes | Yes | PRIMARY + PROBE | Node count, yes |
| Render quantum | 128 fixed | 128 fixed; `renderSizeHint` ignored | PROBE (engine) | Confirm |
| Iframe builds nodes on parent's context | Not tested on iOS | Works in engine | PROBE only | Yes, quick |
| SharedArrayBuffer with COOP + COEP `require-corp` | Expected yes | Works in engine | PRIMARY (bug 229559) + PROBE | Confirm in standalone |
| COEP `credentialless` | No | No | PRIMARY (caniuse) | No |
| WASM SIMD | Yes (16.4+) | Yes | PRIMARY; PROBE in worklet | Confirm in worklet |
| WASM threads (shared memory) | Yes (15.2+) | Yes | PRIMARY; PROBE in worklet | Yes |
| WASM memory64 | Unverified | Unverified; added in STP 251/252 | PRIMARY for STP only | Do not rely on it |
| OfflineAudioContext with AudioWorklet | Not tested on iOS | Works in engine | PROBE only | Yes: speed, memory |
| OPFS, sync access handle in Worker | Yes | Yes | REPORT for version floor | Throughput, yes |
| OPFS `createWritable` | Yes (26.0+) | Yes | PRIMARY (caniuse) | Temp-copy leak, yes |
| `showOpenFilePicker` and friends | No | No | PROBE (engine) | No |
| Quota | Up to 60% of disk per origin; 80% overall | No newer statement found | PRIMARY (2023 policy) | Check with `estimate()` |
| `persist()` | Heuristic; favours Home Screen | Same | PRIMARY (2023 policy) | Check result |
| Screen Wake Lock in standalone | Yes (18.4+) | Yes | PRIMARY (bug 254545) | Light |
| Stereo mic via getUserMedia | No | No | PRIMARY (bug 210231 open) | Confirm |
| Mic open without degrading output | No | No, and worse | PRIMARY bug text, REPORT content | **Yes, first test** |
| USB audio input selection | Unreliable | Unreliable | PRIMARY (bug 211192 reopened) | Yes |
| `navigator.audioSession` | Yes (16.4+) | Yes | PRIMARY | Routing, yes |
| `outputLatency` | Yes (18.4+) | Yes | PRIMARY (caniuse) | Accuracy, yes |
| Web Audio running with screen locked | Unreliable | Unreliable | REPORT | Yes |
| Web Share | Yes | Yes | PRIMARY (caniuse); files not confirmed | Yes |
| `decodeAudioData` resamples to context rate | Yes | Yes | PROBE (engine) | No |

### Inferences
- On a Mac, the WebKit engine answers the structural questions (iframes, realms, SAB, worklet scope). iOS can still differ in the audio session, hardware, memory and timing layers.
- The app has no COOP/COEP headers today. Neither `server_setup.sh`, `redirects-3die.caddy`, `audio/sw.src.js` nor `audio/shared.js` mentions them, so SharedArrayBuffer is not available to it yet.
- Plan for iOS 27 as the baseline. Treat the 26.x column as a fallback.

### Gaps
Device test list, in priority order:
1. Play a backing track through speaker, wired, and AirPods with the mic open, using the app's current constraints. Measure route, level and crackle on iOS 26.6 and 27.2.
2. Run the iframe and SAB probes in Safari and in standalone mode.
3. Count how many worklet nodes and how much WASM load fit before underruns on an iPhone and an iPad.
4. Find the maximum stable total allocation per device, stepping in 100 MB.
5. Time OfflineAudioContext bounces, and check peak memory.
6. Measure OPFS read and write throughput from a Worker.
7. Test screen lock, app switch and phone-call interruption and recovery.
8. Compare `outputLatency` to a measured round trip on speaker, wired and AirPods.

## Web MIDI on iOS Safari: supported or not, as of the newest release? Any workaround?

### Takeaway
Not supported on any iOS version through 27.2, and no WebKit work is visible. There is no pure-web workaround on iOS.

### Cited Findings
- Caniuse lists Safari on iOS as unsupported for 3.2–26.6, 27.0 and 27.1–27.2 — [caniuse](https://caniuse.com/midi).
- WebKit bug 107250 is NEW, unassigned, P2, last modified 2025-07-30, with no Apple statement on the page — [WebKit Bugzilla](https://bugs.webkit.org/show_bug.cgi?id=107250).
- The "Web MIDI for Safari" extension adds the API through CoreMIDI, on macOS only and only with Safari 18.4+ — [caniuse](https://caniuse.com/midi).
- One source says Apple refused over fingerprinting; I found no Apple statement confirming this in Bugzilla — [supersimplepiano, 2026](https://www.supersimplepiano.com/blog/web-midi-browser-compatibility-2026).
- `requestMIDIAccess` is undefined in the WebKit 27.2 engine — [PROBE] local run, 2026-10-30.
- A 27 October 2026 research note lists on-screen input, audio-to-MIDI (Basic Pitch) and a WKWebView shell with Core MIDI as the alternatives — [dcromp/music-os #67](https://github.com/dcromp/music-os/issues/67).

### Inferences
- MIDI inside the app (pads, sequencer, keyboard) is unaffected. Only external hardware is out.
- MIDI file import and export work without the API, since they are plain files. Ableton hand-off can use `.mid` files.
- A thin native shell is the only real route to hardware MIDI. That leaves the pure PWA path.

### Gaps
- Whether Bluetooth MIDI can be reached any other way. Web Bluetooth is reported as absent, in a secondary source only — [dcromp/music-os #67](https://github.com/dcromp/music-os/issues/67).

## AudioWorklet on WebKit: bugs, render quantum, many nodes, global scope limits, iframes

### Takeaway
AudioWorklet is solid enough to build on. The render quantum is 128 frames, and an iframe can create nodes on the parent's context in the WebKit engine. All worklet code in a context shares one thread, so the budget is about 2.67 ms per quantum at 48 kHz for everything combined.

### Cited Findings
**Render quantum**
- A processor saw 128 frames per quantum in WebKit 27.2 and Chromium 156. `renderQuantumSize` is absent from the WebKit context, and `renderSizeHint: 256` had no effect; Chromium honoured it — [PROBE] local run, 2026-10-30.
- `renderSizeHint` was added in Chrome 153 — [Classmethod](https://dev.classmethod.jp/en/articles/chrome-153-webaudio-render-size-hint-latency/). I found no WebKit statement on it.

**Threading**
- The WebKit worklet thread is named "WebCore: AudioWorklet", and uses `QOS::UserInteractive` for real-time contexts and `QOS::Default` otherwise — [AudioWorkletThread.cpp](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/Modules/webaudio/AudioWorkletThread.cpp). The excerpt I read shows no real-time scheduling policy, only that QoS.
- Multiple contexts route through one shared destination per web content process, because each extra thread risked underruns on the single high-priority audio thread — [WebKit commit](https://github.com/WebKit/WebKit/commit/b36fd0e044efbc40c7310dbb48144c8afc935ace).
- A September 2026 report found `close()` on a context with a worklet did not stop its render thread on desktop WebKit (1 to 5 threads over four boots). One shared context stayed at 1. A reduced page did not reproduce it, and iOS was not measured — [Automattic/kandelo #1410](https://github.com/Automattic/kandelo/pull/1410).

**Recent fixes, release mapping unclear**
- Safari Technology Preview 251 (2026-08-26) fixed `currentFrame` reporting 0 for a worklet created while suspended (184081765), early processor teardown after `process()` returns false (184107806), missing `processorerror` details (184224032), and stale audio on destination ring buffer underrun (183305574). It also fixed reverse playback of buffers over 2^23 frames (184439324) and `ConvolverNode.buffer = null` not releasing memory (184434803) — [WebKit](https://webkit.org/blog/18194/release-notes-for-safari-technology-preview-251/).
- Safari 26.5 fixed a CSP bypass in AudioWorklet contexts — [Apple](https://support.apple.com/en-us/127121).
- Safari 26.0 added a privacy change blocking known fingerprinting scripts from reading web audio back — [search summary of WebKit 26.0 notes](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/). My own fetch of that post did not surface this, so treat it as lightly verified.

**Global scope, WebKit 27.2 engine vs Chromium 156 — [PROBE]**
| In AudioWorkletGlobalScope | WebKit | Chromium |
|---|---|---|
| `WebAssembly`, `Atomics` | Present | Present |
| Shared `WebAssembly.Memory` | Constructs | Constructs |
| SIMD module validates | Yes | Yes |
| `SharedArrayBuffer` | Only when isolated | Only when isolated |
| `fetch`, `performance` | Absent | Absent |
| `TextDecoder`, `TextEncoder` | Present | Absent |

**Iframes on the parent's context — [PROBE], same in WebKit 27.2 and Chromium 156**
- From a same-origin iframe, all of these worked: `parent.ctx.createGain()`, `new GainNode(parent.ctx)`, `new AudioWorkletNode(parent.ctx, 'p')`, `new parent.AudioWorkletNode(...)`, and `parent.ctx.audioWorklet.addModule()` called from the iframe.
- The node belongs to the realm of the constructor used: the iframe's `new GainNode` gives an iframe-realm node, while `parent.ctx.createGain()` gives a parent-realm node.
- A worklet node and a gain node built with the iframe's constructors kept sounding (level 0.25 before and after) when the iframe was removed, with the parent holding references. Reconnecting them still worked.
- A context owned by the iframe behaved differently: Chromium closed it when the iframe was removed, while WebKit left it `suspended`.

### Inferences
- Use one context in the parent and build nodes through a parent-side engine API. Parent-realm nodes avoid any dependence on iframe lifetime, even though the probe survived removal over only 0.8 s and did not test garbage collection.
- Never let a tool iframe own a context. It matches the recorded leak report and the shared destination design.
- For many tracks, one processor hosting a WASM graph is safer than dozens of nodes. Each node adds a JS call per quantum on one shared thread. This is reasoning, not a measurement.
- Budget is fixed by the quantum: 128 / 48000 = 2.67 ms, which also has to absorb the browser's own native nodes.
- Lower-quality iPhone mode has a natural lever in voice count and oversampling, not in the quantum.
- Use `currentFrame` for timing inside a worklet, since `performance` is absent.

### Gaps
- No source gives a maximum AudioWorkletNode count or a CPU figure on any iPhone. [dcromp/music-os #67](https://github.com/dcromp/music-os/issues/67) also lists this as unknown.
- I could not confirm which of the STP 251 fixes are in 27.0–27.2. The 27.0 post was read in full, but its resolved list did not surface these items.
- No current, specific iOS AudioWorklet glitch bug was found. Older reports exist, such as DOM work causing underruns in WKWebView — [bug 190552](https://bugs.webkit.org/show_bug.cgi?id=190552) — and its relevance today is unknown.

## SharedArrayBuffer with COOP/COEP; iframes; Caddy; WASM SIMD and threads in AudioWorklet

### Takeaway
SAB works with COOP `same-origin` plus COEP `require-corp`, and every same-origin iframe must also send the COEP header or it will not load. Safari has no `credentialless`. WASM SIMD and shared memory work inside AudioWorklet in the engine; helper threads cannot start from the worklet.

### Cited Findings
- WebKit enabled SAB when COOP/COEP are present, keyed to the process's cross-origin isolation mode — [bug 229559](https://bugs.webkit.org/show_bug.cgi?id=229559).
- Caniuse lists COEP `credentialless` as unsupported in Safari through 27 — [caniuse](https://caniuse.com/mdn-http_headers_cross-origin-embedder-policy_credentialless).
- Safari 27.0 tightened this: `structuredClone()` and `postMessage()` throw `DataCloneError` for SAB outside isolated contexts (174562553). It also improved worker isolation enforcement (176175488) and SAB cloning and agent cluster assignment (176465817), and `WebAssembly.Memory`/`Module` cloning now matches SAB behaviour (176792374) — [WebKit 27.0](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/).
- Under an isolated parent, `crossOriginIsolated` was true in both parent and iframe, and SAB existed in both. An iframe served without COEP was refused ("Refused to display ... because of Cross-Origin-Embedder-Policy") and access threw `SecurityError`. Both engines — [PROBE] local run, 2026-10-30.
- A SAB sent to a worklet by `port.postMessage` arrived as a real `SharedArrayBuffer` in the WebKit 27.2 engine — [PROBE] local run. That supersedes the 2022 comment that postMessage was still broken — [bug 237144](https://bugs.webkit.org/show_bug.cgi?id=237144). The `processorOptions` route was fixed in r290531 — [bug 237144](https://bugs.webkit.org/show_bug.cgi?id=237144).
- `postMessage` of a `WebAssembly.Module` to a worklet was fixed on 2022-11-18 — [bug 220038](https://bugs.webkit.org/show_bug.cgi?id=220038).
- WASM SIMD is supported from iOS 16.4 — [caniuse](https://caniuse.com/wasm-simd). Shared memory, threads and atomics are listed from Safari and iOS 15.2 — [web-features](https://web-platform-dx.github.io/web-features-explorer/features/wasm-threads.json).
- Safari 27.0 fixed SIMD thunk v128 argument corruption (176035764) — [WebKit 27.0](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/). So iOS 26.x may carry that bug.
- Measured on the iOS 27 Simulator, WebKit charges a shared memory's declared maximum against a process-wide pool of about 6 GiB at construction, even if unused. The pool model is the author's reading of failures, not engine code — [Automattic/kandelo #1410](https://github.com/Automattic/kandelo/pull/1410).
- The wasm-bindgen threaded worklet example states it needs the isolation headers — [wasm-bindgen](https://rustwasm.github.io/wasm-bindgen/examples/wasm-audio-worklet.html).
- Memory64 is new in STP 251 and, with multiple memories, STP 252 — [STP 251](https://webkit.org/blog/18194/release-notes-for-safari-technology-preview-251/), [STP 252](https://webkit.org/blog/18304/release-notes-for-safari-technology-preview-252/).

### Inferences
- Caddy config for `/audio/*` needs both headers on every HTML document, including all tool pages. Workers should carry COEP too.
- The service worker must keep those headers on cached responses, or a precached page opened offline loses isolation. `audio/sw.src.js` needs checking for this.
- Applying `require-corp` only under `/audio/` keeps the rest of 3die.fr unaffected. Any cross-origin asset there needs CORP or CORS, and the analytics request noted in `sw.src.js` needs review.
- Declare modest `maximum` values for shared WASM memory. A desktop-sized maximum can fail on iOS before any memory is touched.
- Run DSP helpers as dedicated Workers started from the page, sharing memory with the worklet. Workers are not defined in a worklet scope by spec, and I did not probe that.

### Gaps
- `Atomics.wait` inside the worklet was not tested. Use a lock-free ring buffer and avoid it.
- Relaxed SIMD on iOS: no source found.
- Standalone mode plus isolation on a real device: no source found. [DEVICE TEST]
- A vendor guide reports isolated iframe setups working in Chrome but failing on iPhone and Safari. Those are cross-domain embeds, not same-origin — [Shen.ai](https://developer.shen.ai/getting-started/web-troubleshooting).

## OfflineAudioContext limits on iOS: max length, memory, AudioWorklet, speed

### Takeaway
No fixed maximum length exists. The limit is memory, since the whole render buffer is allocated up front. AudioWorklet works offline in the engine. No iOS speed figure exists.

### Cited Findings
- WebKit validates channels, nonzero length and sample rate with `NotSupportedError`. If the render buffer cannot be allocated, the constructor does not throw. It logs a console warning, and `startRendering()` later rejects with `NotSupportedError` — [OfflineAudioContext.cpp](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/Modules/webaudio/OfflineAudioContext.cpp). No limit on context count appears in that file.
- A 2021 leak made large contexts fail on iOS 14: 4000 × 44100 frames failed at the second instance. It was fixed in r275668, and WebKit's Chris Dumez noted the test had to yield so GC could run — [bug 224279](https://bugs.webkit.org/show_bug.cgi?id=224279).
- In WebKit 27.2 on a Mac, a worklet processor rendered offline with correct output. A one-hour stereo context constructed. 3000 and 8000 Hz were accepted, 768000 Hz was rejected, 32 channels were accepted and 33 rejected — [PROBE] local run. On the Mac, a 300 s stereo oscillator through one biquad took 201 ms, which says nothing about iPhone speed.
- An offline context constructed from inside an iframe could load a worklet module — [PROBE] local run.
- The claim that Safari refuses more than 10 channels or rates below 44100 — [standardized-audio-context](https://www.npmjs.com/package/standardized-audio-context) — is contradicted by the probe on the 27.2 engine, so it is likely out of date.

### Inferences
- Memory cost of the output alone: stereo Float32 at 48 kHz is 23 MB per minute. A 5-minute bounce needs 115 MB, and a 1-hour context 1.38 GB.
- Always check the `startRendering()` rejection, since construction success means nothing.
- For long bounces and all stems, render in chunks, or run the engine in a Worker from WASM and stream to OPFS. That avoids the single large buffer and gives progress reporting. This suits the planned "iPhone warns, iPad exports" split.
- Stems multiply the output buffer by the number of channels unless rendered one by one or in chunks.
- Yield between renders so GC can release buffers.

### Gaps
- No iOS measurement of offline speed, or of the maximum length before failure. [DEVICE TEST]
- Whether a jetsam kill or a clean rejection comes first at the limit on iOS. [DEVICE TEST]

## Storage: quotas, eviction, persist(), 7-day rule, large-file performance

### Takeaway
Quota is generous (up to 60% of disk per origin), and Home Screen apps get the browser quota. Home Screen apps are not expected to lose data to the 7-day rule, but "persistent" is granted by heuristic, so check it. Use a sync access handle in a Worker for audio data, and treat Safari and Home Screen data as separate.

### Cited Findings
- Policy from Safari 17 / iOS 17: browser apps get an origin quota up to 60% and overall quota up to 80% of total disk. Other apps get 15% and 20%. Cross-origin frames get 10% of the main frame's origin quota. Exceeding origin quota gives `QuotaExceededError` — [WebKit, 2023-08-10](https://webkit.org/updates). I found no later Apple statement, so this is assumed to still hold on 26 and 27.
- Home Screen web apps have the same origin and overall quotas as a browser app — [WebKit](https://webkit.org/updates).
- Eviction triggers are overall quota, system pressure, or prolonged inactivity. It is usually whole-origin, least recently used first. An origin with an active page, or in persistent mode, is excluded — [WebKit](https://webkit.org/updates).
- `persist()` is granted by heuristics, such as being opened as a Home Screen Web App; `estimate()`'s quota can change with usage and visit frequency — [WebKit](https://webkit.org/updates).
- The 7-day cap on script-writable storage counts days of Safari use without interaction. Home Screen apps "have their own counter of days of use", reset by use, and WebKit does not expect first-party data there to be deleted — [WebKit, 2020-03-24](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/). The 2023 policy mentions inactivity with no specific duration — [WebKit](https://webkit.org/updates).
- One 2023 iPhone reported over 38 GB of quota from `estimate()` — [dbushell](https://dbushell.com/2023/10/02/storage-apis-downloading-files-for-offline-access/).
- `createWritable` is supported from iOS 26.0 — [caniuse](https://caniuse.com/mdn-api_filesystemfilehandle_createwritable).
- `createSyncAccessHandle` works only in dedicated Workers; version floors conflict among secondary sources (15.2 vs 16.4) — [search summary of developer sources](https://dev.to/helloashish99/opfs-the-browsers-built-in-filesystem-explained-o5i).
- A 2026 report says Safari 26.5 keeps a full temp copy of every file written with `createWritable` and never deletes it: 271 files and 763 MB left per run, 2.8 GB in one session, and 0 with a sync handle. Tested on Safari 26.5.2 on a Mac mini, not iOS — [kamiru-art #27](https://github.com/kamiru-art/mxm_video_converter/pull/27).
- STP 251 fixed quota over-charging for positioned writes through `FileSystemWritableFileStream` (183489019) and Cache Storage size accounting corruption (183578693) — [STP 251](https://webkit.org/blog/18194/release-notes-for-safari-technology-preview-251/).
- Safari 27.0 fixed IndexedDB recovery in workers after a network process crash (177219395), long waits behind a suspended background transaction (178769599), and `removeEntry()` (175745157) — [WebKit 27.0](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/).
- Safari 26.0 made sites added to the Home Screen open as web apps by default, with no manifest needed — [WebKit 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/).
- A secondary source says Safari and Home Screen copies of an origin keep separate cookies, IndexedDB and OPFS, and a second says service workers and CacheStorage were shared in its testing, unverified on 26 — [Synthetixis](https://synthetixis.com/writing/pwa-ios-2026).
- Writing 100 MB through a sync handle took about 90 ms in one developer's test, unverified — [search summary of developer sources](https://dev.to/helloashish99/opfs-the-browsers-built-in-filesystem-explained-o5i).

### Inferences
- Store audio in OPFS as raw or packed PCM through a sync handle in a Worker, and keep metadata in IndexedDB. Avoid `createWritable` for repeated large writes until the temp-copy report is checked on iOS.
- Show `persisted()` state in the app, and treat a false result as a reason to prompt the user to export. Eviction is whole-origin, so a project can vanish entirely.
- The existing `if(standalone)persist()` in `audio/index.html` matches the heuristic. Its result is currently discarded.
- Offer a project export to Files, since no browser storage should be the only copy of someone's recordings.
- If the user recorded in Safari and then installs to the Home Screen, assume the recordings do not follow.

### Gaps
- No Apple statement on quota or eviction for iOS 26 or 27. The 7-day exemption is from 2020 and has not been re-verified by Apple. Synthetixis says it did not re-verify on iOS 26.
- No sustained OPFS throughput figure for iPhone. [DEVICE TEST]

## Memory ceilings per tab; safe Float32Array size; jetsam

### Takeaway
No documented limit exists. Reports range from about 100 MB on old low-RAM devices to about 3 GB on recent Pro iPhones, and the limit drifts on the same device. Going over reloads the page with no catchable error. Keep audio on disk and hold a small window in memory.

### Cited Findings
- iPhone 12 Pro, iOS 17.5.1: about 1.5 GB, about 3 GB right after a reset, back to about 1.5 GB after 2–3 days. iPhone 15 Pro and Pro Max: consistently about 3 GB. No Apple reply — [Apple Forums, 2024](https://developer.apple.com/forums/thread/761666).
- iOS 26.2: iPhone SE (3rd gen) pages crashed at about 100 MB and iPad (8th gen) at about 200 MB, varying by run. That test filled JS arrays with strings, so typed arrays may behave differently — [lapcat, 2026-01-22](https://lapcatsoftware.com/articles/2026/1/7.html).
- Going over reloads the page without an exception, and `try/catch` cannot catch it. The `increased-memory-limit` entitlement is native only and no web API raises the limit — [Nehanth/pooled #207, 2026-09-28](https://github.com/Nehanth/pooled/issues/207). That page is a research note, not a measurement of the test phone.
- `memory.grow()` past the limit is reported to kill the tab rather than return failure — [search summary of emscripten-discuss](https://groups.google.com/g/emscripten-discuss/c/SlmrsE9hpwE).
- A post about three years old says above about 350 MB crashes an iPhone tab — [Superpowered](https://superpowered.com/riding-the-latest-waves-on-the-web). This conflicts with the 3 GB reports and is old.
- A 2,048 MB WASM memory request failed on iOS 16.2 — [Godot #70621](https://github.com/godotengine/godot/issues/70621).
- A jetsam kill was seen above 1.5 GB, per a search snippet from a WebKit bug (one of [227636](https://bugs.webkit.org/show_bug.cgi?id=227636) or [221530](https://bugs.webkit.org/show_bug.cgi?id=221530); not read in full).
- WebKit's desktop engine constructed a 1-hour stereo `AudioBuffer` (1.38 GB) — [PROBE] local run. This does not say an iPhone can.

### Inferences
- Stereo Float32 at 48 kHz is 23 MB per minute. Eight stereo tracks of 5 minutes is 922 MB, which already exceeds the safe budget on many phones.
- Working budgets I suggest until measured: iPhone 15 Pro and newer, total under 1 GB; iPhone 12–14 class, under 500 MB; low-RAM devices such as SE and older iPads, under 100 MB. These are deliberately cautious judgement calls, not sourced limits.
- Largest single Float32Array: keep it under about 256 MB (roughly 11 minutes stereo) and use tiles or chunks for anything longer. This too is a judgement call.
- Stream playback from OPFS into a SAB ring buffer for the worklet, and hold only pre-roll, the visible waveform peaks and active clips in memory.
- Save project state often, since a jetsam reload loses anything unsaved with no warning.
- Prefer a fixed WASM memory over `memory.grow()`, so that failure happens at startup rather than mid-session.

### Gaps
- No current iOS 26 or 27 measurement of typed array or WASM limits per device. [DEVICE TEST]
- iPad M-series limits: no reliable report found. Do not assume they scale with RAM.
- `navigator.deviceMemory`-style detection on Safari: not researched here. Treat device class detection as open.

## Microphone: stereo, sample rates, voice processing flags, AirPods, audioSession

### Takeaway
Capture is mono on iPhone. Opening the mic also degrades playback, and iOS 27 made it worse: with echo cancellation on, output crackles; with it off, output moves to the quiet earpiece. The app's current constraints turn it off. This is the largest risk to overdubbing.

### Cited Findings
**Playback with the mic open**
- [Bug 326286](https://bugs.webkit.org/show_bug.cgi?id=326286) (reported 2026-10-04, last modified 2026-10-21, NEW, unassigned, Major, iOS 27, rdar://189580741): with an echo-cancelled mic live, all playback paths crackle, including Web Audio and `<audio>`. With echo cancellation off, output is clean but quieter and routed to the earpiece. Clean on iOS 18.7 and 26.2. Confirmed by a second reporter on iPhone 16 Pro, iOS 27.0.1. Native `playAndRecord` without voice processing is clean on the same device. `latencyHint`, sharing one context and creation order do not help. `applyConstraints({echoCancellation:false})` on a live track changes nothing. A new track with EC off moves output to the receiver and removes the crackle. Rates read 48 kHz throughout.
- [Bug 311451](https://bugs.webkit.org/show_bug.cgi?id=311451) (2026-04-03, last modified 2026-10-08, NEW, unassigned, rdar://174529097): after capture starts, output on iOS and iPadOS has a reduced sample rate and stereo folded to mono, with or without `echoCancellation: false`. Last seen on iOS 26.4; persists on the 27 beta; on 27 it became crackle. On AirPods, background music becomes tinny with static. A commenter reports it affecting the rest of the session. No Apple comment.
- [Bug 218012](https://bugs.webkit.org/show_bug.cgi?id=218012) (RESOLVED CONFIGURATION CHANGED, commenters disagree): on iOS 18.6, `getUserMedia` still changes output routing even with all three flags off. `play-and-record` routes to the receiver until capture actually begins. Setting `play-and-record` before capture and `playback` afterward helped on 16.4 beta 2 but only sometimes for others.
- Safari 27.0 changed session handling: WebProcess `AudioSession` stays active while mic capture is live (180505014) — [WebKit 27.0](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/).
- Safari 27.2 fixed `getUserMedia` audio requests failing permanently with `NotAllowedError` after the system audio service resets — [WebKit 27.2](https://webkit.org/blog/18515/webkit-features-for-safari-27-2/).

**Stereo and flags**
- [Bug 210231](https://bugs.webkit.org/show_bug.cgi?id=210231): "No support for stereo audio streams with getUserMedia. No channelCount constraint". NEW, from 2020. A 2026-09-17 comment says it is still open "in late 2026". The original says a stereo source defaults to one channel, left only, with no summing.
- Addpipe says Safari supports only 1-channel audio — [addpipe](https://blog.addpipe.com/recording-true-stereo-audio-using-getusermedia/).
- A 2025 report contradicts this on macOS only: Safari 26 with `echoCancellation: false` recorded stereo even with `channelCount: 1`. No replies — [Apple Forums](https://developer.apple.com/forums/thread/804765).
- A 2026 project notes iOS records one channel regardless, though the hardware has been capable of stereo since iOS 14. It flags the MediaRecorder side as unverified — [folkfriend #67](https://github.com/petrushy/folkfriend/pull/67).
- `autoGainControl` and `noiseSuppression` were unsupported in Safari 11 in 2017, with `sampleRate` fixed at 44100 — [addpipe, 2017](https://blog.addpipe.com/getusermedia-audio-constraints/). Current iOS status: no reliable source. A recent GitHub claim that only `echoCancellation` is adjustable could not be checked against WebKit.

**Inputs**
- [Bug 211192](https://bugs.webkit.org/show_bug.cgi?id=211192) (REOPENED, last modified 2026-04-07): USB inputs appear in `enumerateDevices`, but selecting one often still captures the built-in mic, from iOS 13 through 26.3. Some Apple-certified headsets work.
- [Bug 311639](https://bugs.webkit.org/show_bug.cgi?id=311639) (2026-04-07, MOVED): traced for one device to its USB input volume range. The fix "will be handled below WebKit level", with no ship date given.

**AirPods and session API**
- AirPods removed from the ears make capture migrate to the new default mic, with a `configurationchange` event — [WebKit commit](https://github.com/WebKit/WebKit/commit/71ef02a300c45e9080fe75177c6c5a3dc18a0cd1).
- `configurationchange` also fires when echo cancellation mode changes — [WebKit 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/). Safari 27.0 defers it until unmute when dropped during muting (180728609) — [WebKit 27.0](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/).
- `navigator.audioSession` is in Safari from 16.4 on iOS, Chrome lacks it, and Firefox has it only in preview — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/audioSession).
- Types are `auto`, `playback`, `transient`, `transient-solo`, `ambient`, `play-and-record`. On interruption, contexts are suspended and mic tracks muted, with a `statechange` event — [W3C WD, 2024-11-13](https://www.w3.org/TR/audio-session/).
- Default type reads `auto` in the WebKit engine, and the API is absent in Chromium — [PROBE] local run.

**Permissions**
- Mic permission in standalone apps reportedly does not persist; a 2026-10-12 comment reports this, and new bug 327237 was filed — [bug 215884](https://bugs.webkit.org/show_bug.cgi?id=215884).

### Inferences
- `audio/shared.js` line 214 uses all three flags off. On iOS 27 that is the mode reported to route output to the earpiece. Overdubbing through the speaker may be quiet or unusable now, and the current recorder may already show it. This is the first device test.
- Recording without playback looks least affected. Treat the mic as a session mode: stop or warn about playback quality, and record first, overdub with headphones second.
- Wired headphones or a USB-C interface may avoid the earpiece route, but no report tested this.
- Expect the worst for a stereo recording feature. Mono mic is the honest spec; stereo input comes from file import. Stereo from a USB interface on iOS should not be promised.
- A second `getUserMedia` call can mute an earlier stream, per a search snippet from a WebKit thread (one of [185448](https://bugs.webkit.org/show_bug.cgi?id=185448) or [179964](https://bugs.webkit.org/show_bug.cgi?id=179964); not read in full, version unknown). So one mic owner in the parent suits the engine-in-shell design, and it reverses the current "each tool asks itself" rule in `shared.js`. The MATRIX S13 note records that the shell-held stream could mute a tool's capture, so test this explicitly. Sharing the same MediaStream through the engine differs from a second call, but that needs checking.
- Treat `getSettings()` as truth, never the constraints requested.

### Gaps
- Whether `echoCancellation: false` truly delivers raw capture on iOS, without voice processing. WebKit's iOS selection logic could not be read: the source path I tried returned 404, and the older code found only shows VoiceProcessingIO selection — [WebKit source, older](https://webkit.googlesource.com/WebKit/+/bd7e93c893eb44db2876c16023a672cb30f5f59d/Source/WebCore/platform/mediastream/mac/CoreAudioCaptureSource.cpp).
- AirPods capture rate and whether the output falls to a hands-free profile. No primary source. My expectation of reduced quality is general Bluetooth knowledge plus bug 311451's comment. [DEVICE TEST]
- Capture sample rates on current iOS, other than 48 kHz in bug 326286.
- Whether a fix for 326286 is scheduled. Both bugs have radars and no public plan.

## Background audio and screen lock; Wake Lock in standalone

### Takeaway
Wake Lock works in standalone since 18.4, and is the practical answer: keep the screen on during sessions. Background and lock-screen Web Audio is unreliable, and iOS 26 reports are not encouraging. Design the app to recover, not to run in the background.

### Cited Findings
- Screen Wake Lock works in Home Screen apps from iOS/iPadOS 18.4 (2025-03-31). A December 2025 report of a 26.1 regression was retracted by its author — [bug 254545](https://bugs.webkit.org/show_bug.cgi?id=254545).
- `AudioContext` suspended in background despite `audioSession.type = "playback"`: fixed, landed 2024-03-01, regressed in 17.2–17.3, and a reporter says 17.5 resolved it — [bug 261554](https://bugs.webkit.org/show_bug.cgi?id=261554).
- The context can be resumed with `resume()` after backgrounding, which works if it can autoplay, as when the page is capturing audio — [bug 231105](https://bugs.webkit.org/show_bug.cgi?id=231105).
- Standalone background audio bug reported fixed around iOS 15.4.1 — [bug 198277](https://bugs.webkit.org/show_bug.cgi?id=198277).
- iOS 26.0.1 reports (November 2025) on Home Screen PWAs: audio won't start; `resume()` in a click fails; `InvalidStateError: Failed to start the audio device`; works once after restart; sequential playback stops on lock. No Apple reply or known fix — [Apple Forums](https://developer.apple.com/forums/thread/805900).
- An `<audio>` element on lock screen worked until paused for 30 seconds, after which only foregrounding recovered it — [Apple Forums](https://developer.apple.com/forums/thread/762582).
- A project found a context can read `running` while silent after a lock. Its fix: flag on hide, then `suspend()` and `resume()` the same context on foreground, with gesture-triggered resume kept synchronous — [mkusher/bulbro #64](https://github.com/mkusher/bulbro/pull/64).
- A 2026 issue says lock-screen WebAudio on iOS does not behave like native media — [flutter_soloud #489](https://github.com/alnitak/flutter_soloud/issues/489).
- Interruptions suspend contexts and mute mics, and `statechange` fires — [W3C](https://www.w3.org/TR/audio-session/).

### Inferences
- Do not promise background recording or playback.
- Hold a wake lock during transport and recording, and re-request it on `visibilitychange`, since locks release when hidden. The app already has `wakeLock` code in `shared.js`.
- Stop safely on `visibilitychange`: flush the recording to OPFS at once, and keep incremental writes during capture so a kill loses seconds only.
- After foregrounding, verify audio is really flowing, using a meter or `currentFrame` advance, not just `state`.
- The 26.0.1 reports suggest a "tap to restart audio" recovery UI is needed.

### Gaps
- Behaviour of mic capture in the background on iOS 26 and 27, and of a live worklet during a lock: no direct source.
- Whether the 26.0.1 standalone failures persist in 26.6 or 27.x. [DEVICE TEST]

## AudioContext sample rate, outputLatency/baseLatency, Bluetooth latency

### Takeaway
Request 48 kHz explicitly. `outputLatency` exists since 18.4, but its accuracy on Bluetooth is unproven, so plan a user-run latency calibration for overdub alignment.

### Cited Findings
- `outputLatency` is supported on iOS Safari from 18.4 through 27.2 — [caniuse](https://caniuse.com/mdn-api_audiocontext_outputlatency). A third-party tool's claim that Safari lacks it — [mousetesting](https://mousetesting.com/en/tools/audio-latency-test) — is out of date.
- The spec definition is the time from the graph handing a buffer to the host system to the first sample being processed by the output device — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency).
- Since 2020 WebKit honours `AudioContextOptions.sampleRate` on Cocoa, using a resampler when it differs from hardware — [changeset 267014](https://trac.webkit.org/changeset/267014/webkit).
- WebKit 27.2 on a Mac accepted 8000, 44100 and 96000 Hz. Default was 48000, `baseLatency` 0.00267 s (128 frames), and `outputLatency` read 0 before audio was running. `setSinkId` is absent on the context — [PROBE] local run.
- On iOS 27 devices all reported rates were 48 kHz, including with the mic open — [bug 326286](https://bugs.webkit.org/show_bug.cgi?id=326286).
- The underlying iOS value is reported as often unreliable or zero for Bluetooth — [musevv](https://www.musevv.com/blog/how-i-solved-bluetooth-audio-latency-on-ios.html).
- Reports of AirPods output delay vary: about 130 ms on iPhones — [OpenH1 #276](https://github.com/OpenH1/OpenH1/pull/276) — and 230–310 ms for an iOS Bluetooth round trip — [musevv](https://www.musevv.com/blog/how-i-solved-bluetooth-audio-latency-on-ios.html). These are not comparable measurements.
- `outputLatency` is described as including Bluetooth earbuds — [web.dev](https://web.dev/articles/audio-output-latency).
- An old iOS bug where the context rate differed from the one requested had a recreate-the-context workaround — [gist](https://gist.github.com/aarongeorge/5249e062ad4bac1204c009185e4793bf). It may no longer apply.

### Inferences
- Create the context with `sampleRate: 48000` and read back the real value. Lock the project rate to it, matching the 48 kHz default under discussion.
- Read `outputLatency` repeatedly while running, not once, and listen for route changes.
- Compensate recorded takes with a measured offset. Offer a loopback or tap calibration per output route, and store it per route.
- Warn about Bluetooth for overdubbing and for monitoring, since 130 ms or more is unusable for playing in time.
- Input latency is not exposed by `outputLatency`. It needs the calibration too.

### Gaps
- Real `baseLatency` and `outputLatency` on iPhone speaker, wired and AirPods: no measured iOS 26 or 27 data. [DEVICE TEST]
- `latencyHint` effect on iOS: only that it does not cure bug 326286.
- Whether a 44.1 kHz hardware route or a rate change mid-session occurs on iOS 26 or 27.
- Published iPhone Safari round-trip latency: reported as absent — [dcromp/music-os #67](https://github.com/dcromp/music-os/issues/67).

## File System Access, Web Share with files, importing stereo files via decodeAudioData

### Takeaway
No user-file pickers: import through `<input type=file>`, export through Web Share or download. `decodeAudioData` keeps stereo but resamples to the context's rate, and decodes the whole file into memory.

### Cited Findings
- `showOpenFilePicker`, `showSaveFilePicker` and `showDirectoryPicker` are undefined in the WebKit 27.2 engine, and OPFS `getDirectory` is present — [PROBE] local run.
- A 2026 capability class also lists the pickers as Chromium only — [pub.dev](https://pub.dev/documentation/blit/latest/blit_web/WebStorageCapabilities-class.html).
- Safari 26.0 added the File System WritableStream API — [WebKit 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/). On iOS this means OPFS, as there is no picker to get a user-file handle.
- Web Share is supported on iOS Safari through 27.2 — [caniuse](https://caniuse.com/web-share).
- `share()` rejects with `NotAllowedError` without transient activation or for a blocked file type — [W3C Web Share](https://w3c.github.io/web-share/). `canShare()` is not a guarantee.
- A guide reports activation can expire on slower devices — [dev.to](https://dev.to/abidali671/share-an-audio-clip-straight-to-whatsapp-from-a-web-app-navigatorshare-with-files-user-1lo4). A 2026 PR reports Safari can deny access to the share getters, so wrap them in try/catch — [lazyxu/xdrive #2931](https://github.com/lazyxu/xdrive/pull/2931).
- The app's own harness passes share-after-render with a second tap inside a gesture: first tap renders, second tap within 6 s shares the WAV. That is Chromium, WebKit and iOS emulation, not a device — [MATRIX.md E19](/Users/iori/Desktop/code/iori/audio/MATRIX.md).
- A 44.1 kHz stereo WAV decoded through a 48 kHz OfflineAudioContext gave 48000 Hz, 48000 frames, 2 channels, in both engines — [PROBE] local run. Resampling to the context rate is what the [Web Audio spec](https://webaudio.github.io/web-audio-api/#dom-baseaudiocontext-decodeaudiodata) requires.
- Safari 27.0 fixed MP4/Opus decoding (170196423) and WebM with more than two channels (82160691) — [WebKit 27.0](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/). Safari 27.2 fixed `decodeAudioData` failing with `EncodingError` on valid AAC/M4A files — [WebKit 27.2](https://webkit.org/blog/18515/webkit-features-for-safari-27-2/). So iOS 26.x may reject some valid M4A files.
- `AudioData.copyTo` exists in WebKit (fix in 27.0, 178609688), and a note lists WebCodecs `AudioEncoder` from Safari 26 — [WebKit 27.0](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/), [dcromp/music-os #67](https://github.com/dcromp/music-os/issues/67).

### Inferences
- To import without resampling, read the header for the file's rate and decode through an `OfflineAudioContext` at that rate. The probe shows arbitrary rates are accepted on the desktop engine. Resample deliberately with a known-quality resampler when the file enters a project.
- For WAV and AIFF, parse directly in a Worker and skip `decodeAudioData`. It avoids resampling and keeps 24-bit intact, which matters to an audiophile audience.
- Long files need the same memory care as bounces. A 10-minute stereo file decodes to 230 MB.
- Export flow: render to a file first, then share on a fresh tap, as E19 does. Stems: a single zip in one share, since multi-file behaviour is untested.
- Offer "Save to Files" through the share sheet. There is no silent save.

### Gaps
- Multi-file `share()`, large file size limits, and standalone vs Safari differences on iOS: no source found. [DEVICE TEST]
- Quality of WebKit's `decodeAudioData` resampler: no source.
- `AudioDecoder` (WebCodecs) availability for audio on iOS 26 and 27: not confirmed. If it is present it would allow streaming decode.
- Browser `<input type=file>` behaviour in standalone with very large files (does it copy to memory or to a temp file): no source.
- Sharing files into the PWA (Web Share Target) on iOS: not researched, and I expect it to be unavailable. Needs a check.
