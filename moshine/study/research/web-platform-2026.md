# DATAMOSHINE: Web Platform Capability Research (October 2026)

Status: research snapshot, compiled 2026-10-09. Every row cites a source and the date the source was published or accessed. "Accessed 2026-10-09" means the live page (caniuse, web3dsurvey, npm/jsDelivr metadata, bug trackers) was read on that date.

Browser versions current on 2026-10-09: Chrome 155 stable (released 2026-10-06, two-week cadence) [[superchargebrowser release calendar](https://www.superchargebrowser.com/library/chrome-149-whats-coming-tab-users.md), accessed 2026-10-09]; Firefox 157 (2026-09-29) [[firefox.com 157.0 notes](https://www.firefox.com/en-US/firefox/157.0/releasenotes/)]; Safari 27.0 (September 2026) [[WebKit blog 18325](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/)]; Safari Technology Preview 254 (2026-10-08) [[WebKit blog 18420](https://webkit.org/blog/18420/release-notes-for-safari-technology-preview-254/)].

Scope: this feeds the engineering spec for a static-hosted TypeScript video editor (WebGPU compute with fallback, WebCodecs with fallback, frame-by-frame streaming of long videos, per-device limits, render cache, audio time-stretch, optional ffmpeg.wasm "authentic codec" bake).

---

## A. Support matrices

### A.1 WebGPU per browser / OS

| Browser / OS | Status (2026-10) | Since | Notes and source |
|---|---|---|---|
| Chrome / Edge: Windows x64, macOS, ChromeOS | Shipped, on by default | Chrome 113 (2023-04) | [gpuweb Implementation Status, updated 2026-10-02](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status); [caniuse webgpu](https://caniuse.com/webgpu) (accessed 2026-10-09, 87.82% global) |
| Chrome: Windows ARM64 | Behind `chrome://flags/#enable-unsafe-webgpu` | – | gpuweb wiki (2026-10-02) |
| Chrome: Linux | Shipped only for Intel Gen12+ (Chrome 144) and NVIDIA driver 535.183.01+ on Wayland (Chrome 147); others need command-line flags | 144 / 147 | gpuweb wiki (2026-10-02); [Chrome 147-148 WebGPU post](https://developer.chrome.com/blog/new-in-webgpu-147-148) |
| Chrome: Android | Shipped for ARM/Qualcomm/Intel GPUs on Android 12+ (Chrome 121, 2024-01-18); Imagination on Android 16+ (Chrome 139); Samsung Xclipse still TBD | 121 | [Chrome 121 post](https://developer.chrome.com/blog/new-in-webgpu-121) (2024-01-18); gpuweb wiki (2026-10-02) |
| Chrome: compatibility mode (GL ES 3.1 on Android, D3D11 exploration) | Shipped Chrome 146 (2026-02-25), opt-in via `requestAdapter({featureLevel: "compatibility"})`, restricted subset of spec | 146 | [Chrome 146 post](https://developer.chrome.com/blog/new-in-webgpu-146) |
| Safari macOS 26 (Tahoe), iOS 26, iPadOS 26, visionOS 26 | Shipped, on by default, incl. compute shaders | Safari 26.0 (2025-09-15) | [WebKit Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/); gpuweb wiki (2026-10-02). caniuse marks Safari 26.x as "partial" ([caniuse](https://caniuse.com/webgpu), accessed 2026-10-09) without a stated reason; treat as full for core API |
| Safari 26.2 / 27.0 additions | 26.2 (2025-12-12): WebGPU inside WebXR, GPUTexture directly as attachments. 27.0: WGSL `clip_distances` | – | [Safari 26.2](https://webkit.org/blog/17640/webkit-features-for-safari-26-2/); [Safari 27.0](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/) |
| WKWebView (iOS 26) | Apple engineer states WebGPU in WKWebView "will work when it's enabled by default", and it is enabled by default in iOS 26; third-party trackers still list WebView support as not-default. VERIFY by prototype in a WKWebView | – | [Apple Developer Forums thread 770862](https://developer.apple.com/forums/thread/770862); [caniwebview WebGPU](https://caniwebview.com/features/web-feature-webgpu/) (accessed 2026-10-09) |
| Firefox: Windows | Shipped | 141 (2025-07-22) | [Mozilla GFX: Shipping WebGPU on Windows in Firefox 141](https://mozillagfx.wordpress.com/2025/07/15/shipping-webgpu-on-windows-in-firefox-141/) (2025-07-15) |
| Firefox: macOS Apple Silicon | Shipped | 145 | gpuweb wiki (2026-10-02) |
| Firefox: macOS (Intel and all others) | Shipped | 147 (2026-01-13) | gpuweb wiki (2026-10-02); [Firefox 147 coverage](https://www.webpronews.com/firefox-147-released-webgpu-support-enhanced-security-and-more/) |
| Firefox: Linux | NOT shipped in release; on by default in Nightly; release channel works behind `dom.webgpu.enabled` (confirmed Firefox 152); Mozilla "expects 2026" | – | gpuweb wiki (2026-10-02); [gpuweb issue 6331](https://github.com/gpuweb/gpuweb/issues/6331) |
| Firefox: Android | Behind flag, "expected 2026" | – | gpuweb wiki (2026-10-02); [caniuse](https://caniuse.com/webgpu) lists Firefox Android 157 as disabled by default |
| Samsung Internet | Shipped | 24+ | [caniuse](https://caniuse.com/webgpu) (accessed 2026-10-09) |

Note on caniuse vs reality for Firefox: caniuse still flags Firefox desktop 2-160 as "disabled by default" because its data is not OS-aware; the gpuweb wiki (maintained by implementers) is authoritative for Windows/macOS shipping.

#### A.1.1 WebGPU optional features and limits

| Item | Chrome | Safari | Firefox | Source |
|---|---|---|---|---|
| `shader-f16` | Shipped (Chrome 120+); Linux NVIDIA f16 added Chrome 155-156 (2026-10-07) | ~100% of Safari adapters (iOS 100%, macOS 99.8%) | ~93% of Firefox adapters | [web3dsurvey shader-f16](https://web3dsurvey.com/webgpu/features/shader-f16) (accessed 2026-10-09; 93.98% overall; Linux 74%, Android 86%); [Chrome 155-156 post](https://developer.chrome.com/blog/new-in-webgpu-155-156) |
| `subgroups` | Shipped Chrome 134 (2025-02-26); ~83% of Chrome adapters | Effectively not available (0.42% of Safari adapters) | Effectively not available (0.02%) | [Chrome 134 post](https://developer.chrome.com/blog/new-in-webgpu-134); [web3dsurvey subgroups](https://web3dsurvey.com/webgpu/features/subgroups) (accessed 2026-10-09; 68.5% overall) |
| `timestamp-query` | Shipped Chrome 121; results quantized to 100 µs | ~92.7% of Safari adapters | ~99.97% | [Chrome 121 post](https://developer.chrome.com/blog/new-in-webgpu-121); [web3dsurvey timestamp-query](https://web3dsurvey.com/webgpu/features/timestamp-query) (98.78% overall, accessed 2026-10-09) |
| Compute shaders | Yes | Yes (explicitly called out in Safari 26.0 release notes) | Yes | [WebKit 26.0 post](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) |
| `importExternalTexture(VideoFrame)` | Yes since Chrome 116 (2023); `display-p3` color space since 121 | Yes since Safari 26.0 | Windows: enabled Firefox 144 ([bug 1983594](https://bugzilla.mozilla.org/show_bug.cgi?id=1983594), RESOLVED FIXED); macOS: shipped per [meta bug 1827116](https://bugzilla.mozilla.org/show_bug.cgi?id=1827116); Linux ([bug 2008705](https://bugzilla.mozilla.org/show_bug.cgi?id=2008705)) and Android ([bug 2008706](https://bugzilla.mozilla.org/show_bug.cgi?id=2008706)) still open | [Chrome 116 post](https://developer.chrome.com/blog/new-in-webgpu-116/); [caniuse copyExternalImageToTexture(VideoFrame)](https://caniuse.com/mdn-api_gpuqueue_copyexternalimagetotexture_videoframe_source) (accessed 2026-10-09) |
| `copyExternalImageToTexture(VideoFrame)` | Partial Chrome 116-143, full from 144 | Safari 26.0+ (alpha-preservation bug fixed in STP 254, 2026-10-08) | Not supported through Firefox 160 per caniuse | [caniuse](https://caniuse.com/mdn-api_gpuqueue_copyexternalimagetotexture_videoframe_source) (accessed 2026-10-09); [STP 254 notes](https://webkit.org/blog/18420/release-notes-for-safari-technology-preview-254/) |
| Spec default limits | `maxTextureDimension2D` 8192, `maxStorageBufferBindingSize` 128 MiB (134,217,728), `maxBufferSize` 256 MiB (268,435,456) | same | same | [W3C WebGPU spec](https://www.w3.org/TR/webgpu/); [MDN GPUSupportedLimits](https://developer.mozilla.org/en-US/docs/Web/API/GPUSupportedLimits) |
| Tiered (bucketed) limits for anti-fingerprinting | Chrome/Dawn always enables `useTieredLimits`; reported values are rounded down to tier buckets | Safari exposes "Apple GPU"-style generic adapter info | Firefox buckets renderer strings | [Dawn commit: tiered limits](https://git.axiodl.com/encounter/dawn-cmake/commit/2e48f011b085cdbd0acafdef7045dc6fc0583aa6); [scrappey WebGPU fingerprinting](https://scrappey.com/qa/anti-bot/what-is-webgpu-fingerprinting) |

Real-world distribution of the three limits that matter for a video pipeline (web3dsurvey, accessed 2026-10-09):

| Limit | ≥ default | ≥ 512 MiB / 16384 | ≥ 1 GiB | ≥ 2 GiB | Source |
|---|---|---|---|---|---|
| `maxBufferSize` (all) | 100% ≥ 256 MiB | 100% ≥ 512 MiB | 87% ≥ ~1.2 GiB | 78% ≥ 2 GiB (Safari only 30%; Adreno 6xx 9%) | [web3dsurvey maxBufferSize](https://web3dsurvey.com/webgpu/limits/maxBufferSize) |
| `maxBufferSize` iOS | 100% ≥ 256 MiB | 98% ≥ 322 MiB | 79% ≥ 1 GiB | – | [iOS breakdown](https://web3dsurvey.com/webgpu/limits/maxBufferSize/platform/iOS) |
| `maxBufferSize` Android | 100% ≥ 256 MiB | – | 100% ≥ 1 GiB | 77% ≥ 2 GiB (Adreno 5xx/6xx cap at 1 GiB; Adreno 7xx 75%; Mali Valhall 100%) | [Android breakdown](https://web3dsurvey.com/webgpu/limits/maxBufferSize/platform/Android) |
| `maxStorageBufferBindingSize` (all) | 100% ≥ 128 MiB | 98% ≥ 256 MiB | 92% ≥ 1 GiB | 77-79% ≥ 2 GiB | [web3dsurvey maxStorageBufferBindingSize](https://web3dsurvey.com/webgpu/limits/maxStorageBufferBindingSize) |
| `maxStorageBufferBindingSize` iOS | 100% ≥ 128 MiB | 99% ≥ 512 MiB | 80% ≥ 1 GiB | – | [iOS breakdown](https://web3dsurvey.com/webgpu/limits/maxStorageBufferBindingSize/platform/iOS) |
| `maxTextureDimension2D` | 100% ≥ 8192 | 98-100% ≥ 16384 (Android 98%, Linux 97%) | – | – | [web3dsurvey maxTextureDimension2D](https://web3dsurvey.com/webgpu/limits/maxTextureDimension2D) |

Engineering consequence: design all GPU buffers so that the default limits (256 MiB buffer, 128 MiB storage binding, 8192 px texture) are sufficient; request higher limits opportunistically and only unlock "large tile" paths when granted. A single 8K×8K RGBA8 texture is 256 MiB and will not fit the default storage binding; 4K×4K RGBA8 (64 MiB) and 4K×2K RGBA16F (64 MiB) do.

### A.2 WebGL2 as compute fallback

| Capability | Support | Source |
|---|---|---|
| WebGL 2.0 | Chrome 56+, Firefox 51+, Safari 15+ (macOS and iOS), Edge 79+; 97.13% global | [caniuse webgl2](https://caniuse.com/webgl2) (accessed 2026-10-09) |
| Transform feedback, float render targets (`EXT_color_buffer_float`), multiple render targets, 3D textures | Core WebGL2 / extension; present in Safari 15+ since WebGL2 is ANGLE-on-Metal there | [caniuse webgl2](https://caniuse.com/webgl2) |

Fragment-shader "compute" (ping-pong FBOs, float textures) is the universally available compute path and is what DATAMOSHINE should use on Firefox Linux/Android, older Android, and any adapter where `navigator.gpu.requestAdapter()` returns null.

### A.3 WebCodecs per browser / OS

| Browser / OS | VideoDecoder / VideoEncoder | AudioDecoder / AudioEncoder | Since | Source |
|---|---|---|---|---|
| Chrome / Edge desktop (Win, macOS, Linux, ChromeOS) | Yes | Yes | 94 (2021) | [caniuse webcodecs](https://caniuse.com/webcodecs) (accessed 2026-10-09; 95.55% global) |
| Chrome Android | Yes | Yes | 94 | caniuse (accessed 2026-10-09) |
| Safari macOS / iOS 16.4-18.7 | Video classes only | No | 16.4 (2023) | caniuse (partial) |
| Safari macOS / iOS 26.0+ | Yes | Yes (AudioEncoder/AudioDecoder added in 26.0) | 26.0 (2025-09-15) | [WebKit 26.0 post](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) |
| Safari 26.4 / 27.0 / STP 254 | 26.4: fixed H.264 VideoDecoder output order; 27.0: color-space override for hardware VideoDecoder; STP 254: `hevc` option in VideoEncoder config, `transfer` option in chunk/frame constructors, fix for flush() hang when codec buffers > 4 frames | – | 2026-03-24 / 2026-09 / 2026-10-08 | [26.4](https://webkit.org/blog/17862/webkit-features-for-safari-26-4/); [27.0](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/); [STP 254](https://webkit.org/blog/18420/release-notes-for-safari-technology-preview-254/) |
| Firefox desktop (Win, macOS, Linux) | Yes | Yes | 130 (2024-09) | [Bugzilla 1908572](https://bugzilla.mozilla.org/show_bug.cgi?id=1908572); [Phoronix Firefox 130](https://www.phoronix.com/news/Firefox-130) |
| Firefox Android | NOT shipped (Nightly only) | No | – | caniuse (Firefox Android 157: no); [codec dataset 2026](https://webcodecsfundamentals.org/datasets/codec-analysis-2026/): "Firefox Android 0% (API gap)" |
| Samsung Internet | Yes | Yes | 17+ | caniuse |
| `MediaStreamTrackProcessor` (camera/video-element frames as VideoFrame stream) | Chrome 94+ (partial), Safari 18+, Firefox: none through 158 | – | – | [caniuse MediaStreamTrackProcessor](https://caniuse.com/mdn-api_mediastreamtrackprocessor) (accessed 2026-10-09) |

### A.4 Codec coverage (WebCodecs `isConfigSupported`, real sessions)

Source: webcodecsfundamentals.org Codec Support Dataset, 7.66 M sessions, 2.43 B tests (published 2026-03, updated 2026-10) [[analysis](https://webcodecsfundamentals.org/datasets/codec-analysis-2026/)]. Per-codec pages accessed 2026-10-09. Percentages are of sessions on that browser/OS that returned `supported: true`.

Decode:

| Codec | Chrome Win / mac / Linux / Android | Safari mac / iOS | Firefox Win / mac / Linux / Android | Edge Win | Source |
|---|---|---|---|---|---|
| H.264 High (`avc1.640028`) | 100 / 99.8 / 98.2 / 99.7 | 99.9 / 100 | 100 / 100 / 98.2 / 0 | 100 | [avc1.640028](https://webcodecsfundamentals.org/codecs/avc1.640028.html) |
| HEVC (`hvc1.1.6.L93.B0`) | 83.8 / 96.6 / 58.1 / 75.8 | 91.4 / 85.2 | 0 / 0.8 / 1.9 / 0.3 | 56.8 (needs HEVC Video Extension) | [hevc](https://webcodecsfundamentals.org/codecs/hevc.html) |
| VP8 | 100 / 100 / 99.4 / 99.6 | 100 / 100 | 100 / 100 / 98.6 / 0.9 | 100 | [vp8](https://webcodecsfundamentals.org/codecs/vp8.html) |
| VP9 profile 0 | 99.87% overall ("as universal as H.264") | yes | yes | yes | [analysis](https://webcodecsfundamentals.org/datasets/codec-analysis-2026/) |
| AV1 main 8-bit (`av01.0.08M.08`) | 100 / 100 / 99.1 / 99.6 | 27.0 / 32.7 (hardware only: M3+/A17 Pro+; Apple ships no software AV1 decoder) | 99.9 / 99.9 / 98.4 / 2.1 | 100 | [av01.0.08M.08](https://webcodecsfundamentals.org/codecs/av01.0.08M.08.html) |

Encode:

| Codec | Chrome Win / mac / Linux / Android | Safari mac / iOS | Firefox Win / mac / Linux / Android | Edge Win | Source |
|---|---|---|---|---|---|
| H.264 High | 99.4 / 99.8 / 96.1 / 96.5 | 99.8 / 100 | 95.8 / 100 / 98.8 / 0 | 99.8 | [avc1.640028](https://webcodecsfundamentals.org/codecs/avc1.640028.html) |
| HEVC | 40.1 / 48.1 / 23.3 / 45.0 (hardware only) | 91.4 / 85.2 | 0 / 0 / 0.8 / 0.2 | 0 | [hevc](https://webcodecsfundamentals.org/codecs/hevc.html) |
| VP8 | 100 / 100 / 100 / 100 | 99.9 / 100 | 100 / 99.9 / 99.7 / 0.8 | 100 | [vp8](https://webcodecsfundamentals.org/codecs/vp8.html) |
| VP9 profile 0 | 99.99% overall | yes | yes (software by default; hardware only with `gfx.vp9.hw.enabled`) | yes | [analysis](https://webcodecsfundamentals.org/datasets/codec-analysis-2026/); [GetStream codec notes](https://getstream.io/resources/projects/webrtc/advanced/codecs/) |
| AV1 8-bit | 100 / 100 / 86.0 / 87.5 | 27.3 / 32.8 | 100 / 99.8 / 99.6 / 2.0 | 99.7 | [av01.0.08M.08](https://webcodecsfundamentals.org/codecs/av01.0.08M.08.html) |
| AV1 10-bit | ~8% overall encode (vs ~91% decode) | – | – | – | [analysis](https://webcodecsfundamentals.org/datasets/codec-analysis-2026/) |

Audio (WebCodecs `AudioEncoder` / `AudioDecoder`):

| Codec | Encode | Decode | Notes | Source |
|---|---|---|---|---|
| Opus | 97.2% | 97.3% | Universal; recommended default | [analysis](https://webcodecsfundamentals.org/datasets/codec-analysis-2026/) |
| AAC-LC (`mp4a.40.2`) | 91.9% | 97.3% | Chromium: Windows, macOS, Android, iOS, ChromeOS but NOT desktop Linux; Firefox: never; Safari 26+: yes | [Mediabunny supported formats](https://mediabunny.dev/guide/supported-formats-and-codecs); [analysis](https://webcodecsfundamentals.org/datasets/codec-analysis-2026/) |
| MP3, FLAC | 0% | ~97% | No browser exposes an MP3/FLAC encoder via WebCodecs; use a WASM/JS encoder (Mediabunny ships extension packages) | [analysis](https://webcodecsfundamentals.org/datasets/codec-analysis-2026/) |
| Vorbis | 3.8% | 96.5% | – | [codec table](https://webcodecsfundamentals.org/datasets/codec-support-table/) |

### A.5 VideoEncoder options actually exposed

| Option | Spec / Chrome | Safari | Firefox | Source |
|---|---|---|---|---|
| `bitrateMode: "constant" | "variable" | "quantizer"` | All three in Chrome; per-frame quantizer shipped Chrome 117 for AV1, VP9, AVC | Not documented as supported; VERIFY via `isConfigSupported` | VERIFY | [MDN configure()](https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder/configure); [Chromium intent: per-frame quantizer](https://groups.google.com/a/chromium.org/g/blink-dev/c/UZWH1LuwBas) |
| Per-frame `quantizer` ranges in `encode()` options | `vp9`/`av1`: 0-63, `avc`/`hevc`: 0-51 (`hevc` registration exists; Chrome exposure unverified) | – | – | [MDN encode()](https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder/encode) |
| `latencyMode: "quality" | "realtime"` | Both | Both, but Safari 27.0/27.0.1 H.264 Main/High in `"quality"` mode deadlocks after 4 queued frames (B-frame lookahead + 4-frame input cap); `"realtime"` or Baseline works. Fixed upstream ([WebKit PR 74602](https://github.com/WebKit/WebKit/pull/74602)), shipped in STP 254 (2026-10-08) | Both | [Mediabunny issue 541](https://github.com/Vanilagy/mediabunny/issues/541); [STP 254](https://webkit.org/blog/18420/release-notes-for-safari-technology-preview-254/) |
| `scalabilityMode` (L1T1..L1T3) | Yes | – | – | MDN configure() |
| `hardwareAcceleration` | `no-preference` tries hardware, falls back to software; `prefer-hardware` fails to configure if hardware is unavailable | – | – | [W3C Media WG minutes 2023-03-07](https://www.w3.org/2023/03/07-mediawg-minutes.html) |
| Key-frame control | `encode(frame, {keyFrame: true})` forces IDR; no GOP-length parameter beyond this | same | same | MDN encode() |
| B-frames | Not exposed by the spec. Chrome's software H.264 (OpenH264) emits no B-frames; Safari VideoToolbox in `"quality"` mode does reorder (hence the bug above). Hardware encoders decide. | – | – | [bloggeek H.264 hardware support](https://bloggeek.me/webrtc-h264-video-codec-hardware-support/); Mediabunny issue 541 |
| `avc: {format: "annexb" | "avc"}`, `hevc: {format: ...}` | Chrome yes; STP 254 added `hevc` config option in Safari | – | – | [W3C AVC registration](https://www.w3.org/TR/webcodecs-avc-codec-registration/); STP 254 |
| Software encode resolution cap (Chrome) | Chrome caps software encode at ~2160p (max 4096×2176) | – | – | [Media WG minutes 2023-03-07](https://www.w3.org/2023/03/07-mediawg-minutes.html) |
| Chrome software H.264 encoder | OpenH264 compiled into Chrome; hardware via MediaFoundation / VideoToolbox / MediaCodec | VideoToolbox only | OpenH264 plugin (downloaded from Cisco) or platform encoders | [bloggeek H.264 glossary](https://bloggeek.me/webrtcglossary/h-264/) |
| Android concurrency | MediaCodec instance limits are device-dependent; Android Media Performance Class 30 devices must support 6 concurrent 8-bit hardware decoders | – | – | [Android MPC](https://source.android.com/docs/compatibility/17/mpc) |

---

## B. Fallback ladder recommendation

### B.1 Decode ladder (per clip, chosen at import)

1. WebCodecs `VideoDecoder` with hardware (`hardwareAcceleration: "no-preference"`), fed by Mediabunny demuxer, output `VideoFrame` → `importExternalTexture` (zero copy) on Chrome 116+, Safari 26+, Firefox Win/macOS 144+. Covers H.264 and VP8/VP9 nearly everywhere; HEVC on Safari and most Chrome (not Linux/Firefox); AV1 on Chrome/Firefox desktop and recent Apple silicon only (A.4).
2. Same, but `VideoFrame` → `copyExternalImageToTexture` (one GPU copy) where `importExternalTexture` is absent or the WGSL `texture_external` path is undesirable (Firefox Linux/Android lacks both; use `VideoFrame.copyTo()` into a CPU buffer → `writeTexture`).
3. `<video>` element + `requestVideoFrameCallback` + `drawImage`/`texImage2D`/`copyExternalImageToTexture(HTMLVideoElement)` for any container/codec the media stack can play but WebCodecs cannot (older Safari 16.4-18.7 audio, Firefox Android). Frame-accurate seeking is unreliable; only for preview, not export.
4. WASM software decode (libav.js `webcodecs` variants or web-demuxer + ffmpeg.wasm) for codecs the browser lacks (HEVC on Firefox/Linux, AV1 on Intel Macs/older iPhones, ProRes, DNxHD, MPEG-2). Expect 10-25× slower than native (D).
5. Transcode-on-import: if (4) is needed, transcode once to H.264 High or VP9 into the OPFS cache (E) rather than decoding repeatedly.

### B.2 Encode ladder (export)

1. WebCodecs `VideoEncoder`, codec priority by target container: MP4 → H.264 High (99%+ encode everywhere, A.4) with `latencyMode: "quality"` on Chrome/Firefox and `"realtime"` on Safari < 27.1 (workaround for the deadlock in A.5); WebM → VP9 (99.99%) or AV1 where `isConfigSupported` says yes; HEVC only on Safari or when Chrome reports hardware support. Prefer `bitrateMode: "quantizer"` on Chrome for datamosh-style constant-quality control; fall back to `"variable"`.
2. Audio: `AudioEncoder` Opus everywhere; AAC only where supported (not Firefox, not Linux). Ship Opus-in-MP4 as the default MP4 audio track and AAC when available; verify Opus-in-MP4 playback on the target players (H).
3. ffmpeg.wasm (libx264/libvpx/libaom) only for the opt-in "authentic codec" bake or formats WebCodecs cannot write (D). Never the default export path.
4. `MediaRecorder` (canvas.captureStream) as last resort for preview exports; codec and quality are not controllable enough for production.

### B.3 Compute ladder (pixel ops)

1. WebGPU core: storage buffers/textures, compute shaders, `shader-f16` if granted (do not depend on `subgroups`: ~0% on Safari/Firefox).
2. WebGPU compatibility mode (Chrome 146+ on Android GL ES 3.1): request `featureLevel: "compatibility"` when the core adapter is null; keep shaders inside the compatibility subset (no storage textures in fragment stage assumptions, limited bindings) [[Chrome 146](https://developer.chrome.com/blog/new-in-webgpu-146)].
3. WebGL2 fragment-shader compute with float FBO ping-pong and transform feedback (Firefox Linux/Android, Safari < 26, old Android).
4. CPU (WASM SIMD + Workers) for tiny previews only.

Tier selection is per `requestAdapter()` result plus the probe in G.

---

## C. Libraries

| Library | Version (2026-10-09) | License | Streams large inputs? | Fragmented MP4 out? | Verdict |
|---|---|---|---|---|---|
| [Mediabunny](https://github.com/Vanilagy/mediabunny) ([docs](https://mediabunny.dev/)) | 1.61.3 ([jsDelivr registry](https://data.jsdelivr.com/v1/package/npm/mediabunny)) | MPL-2.0 | Yes: `BlobSource` (chunked reads from `File`, 8 MiB cache), `UrlSource` (range requests, prefetch), `ReadableStreamSource`, `CustomSource` with `'fileSystem'` prefetch profile (works with OPFS `FileSystemFileHandle.getFile()` or sync access handles) [[reading guide](https://mediabunny.dev/guide/reading-media-files)] | Yes: `fastStart: 'fragmented'` with `minimumFragmentDuration` (default 1 s); also `false` (moov at end, lowest memory), `'in-memory'`, `'reserve'` (needs `maximumPacketCount`). `StreamTarget` writes chunks with byte offsets, honors backpressure, works with `FileSystemWritableFileStream` [[writing guide](https://mediabunny.dev/guide/writing-media-files); [output formats](https://mediabunny.dev/guide/output-formats)] | PRIMARY. Pure TS, zero deps, tree-shakable (≈5 kB min for a muxer), reads/writes MP4, MOV, WebM, MKV, HLS, TS, WAV, MP3, Ogg, FLAC, ADTS; wraps WebCodecs encode/decode with backpressure; extensions for AAC/MP3/FLAC codecs; 7.3k stars; sponsored by Remotion and Mux |
| [mp4-muxer](https://github.com/Vanilagy/mp4-muxer), [webm-muxer](https://github.com/Vanilagy/webm-muxer) | deprecated | MIT | – | – | DO NOT USE: both explicitly deprecated in favour of Mediabunny; no bug fixes [[migration guide](https://vanilagy.github.io/mp4-muxer/MIGRATION-GUIDE.html)] |
| [mp4box.js](https://github.com/gpac/mp4box.js/) | 2.4.1 ([jsDelivr](https://data.jsdelivr.com/v1/package/npm/mp4box)); 1.0.0 (2025-06-19) added TypeScript | BSD-3-Clause | Yes: `appendBuffer` with `fileStart`, progressive parsing; `discardMdatData` default true since 1.0; 7 GB+ files reported | Segmentation for MSE (`setSegmentOptions`), limited muxing | SECONDARY: use for ISOBMFF box-level inspection/diagnostics (e.g. "authentic" datamosh needs raw NAL access) if Mediabunny's API is insufficient; not a general muxer [[GPAC 1.0.0 announcement](https://gpac.io/2025/06/19/announcing-mp4box-js-1-0-0-with-typescript-support/)] |
| [jswebm](https://github.com/jscodec/jswebm) | 0.1.2 (4 versions ever, [jsDelivr](https://data.jsdelivr.com/v1/package/npm/jswebm)) | not stated on npm | Sequential `queueData()` only; no seeking API documented | No | AVOID: effectively unmaintained; Mediabunny's Matroska demuxer supersedes it |
| [web-demuxer](https://github.com/ForeverSc/web-demuxer) | 4.0.0 | MIT (wrapper) + LGPL (FFmpeg libs) | Yes: `File` or URL, `seek()`/`read()` emit `EncodedVideoChunk`; mini WASM 493 kB gz (mov/mp4/mkv/webm/m4v), full 1131 kB gz (adds avi/flv/mpegts/asf/mpeg) | No (demux only) | OPTIONAL: fallback demuxer for AVI/FLV/MPEG-TS/ASF that Mediabunny does not read (Mediabunny does read MPEG-TS) [[README](https://cdn.jsdelivr.net/npm/web-demuxer@latest/README.md)] |
| [libav.js](https://github.com/Yahweasel/libav.js) | 6.10.9 | LGPL (FFmpeg) + 0BSD wrapper | Yes (virtual FS, streaming reads) | Via libavformat | OPTIONAL: lighter LGPL alternative to ffmpeg.wasm (1.5-3 MiB builds); encoders libvpx, libopenh264, libopus; libaom "effectively unusable"; no x264/x265/SVT-AV1; threaded variant needs SAB |
| [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker) | current | MIT | n/a | n/a | REQUIRED for GitHub Pages if any SAB/threads path is used (D.3) |
| [detect-gpu](https://www.npmjs.com/package/detect-gpu) | 5.0.70 | MIT | n/a | n/a | USE for tiering (G) |

---

## D. ffmpeg.wasm assessment

### D.1 Facts

| Topic | Finding | Source |
|---|---|---|
| Versions | `@ffmpeg/ffmpeg` 0.12.15 (2025-01-07), `@ffmpeg/core` / `@ffmpeg/core-mt` 0.12.10 (wraps core 0.12.6, 2024-12-25); FFmpeg base is 5.1.4 (upgraded in 0.12.8, 2024-12-17). No release in 2025-2026 to date. (A blog claims "0.13"; npm registry shows 0.12.x only.) | [GitHub releases](https://github.com/ffmpegwasm/ffmpeg.wasm/releases); [jsDelivr @ffmpeg/core](https://data.jsdelivr.com/v1/package/npm/@ffmpeg/core); [jsDelivr @ffmpeg/ffmpeg](https://data.jsdelivr.com/v1/package/npm/@ffmpeg/ffmpeg) (accessed 2026-10-09); [ClearRec guide 2026-05-26](https://www.clearrec.app/blog/ffmpeg-wasm-complete-guide-2026) |
| Builds | `core` (single-thread) and `core-mt` (pthreads, requires `SharedArrayBuffer`, i.e. cross-origin isolation). MT is ~2× faster than ST per the maintainers, 3-4× per ClearRec | [ffmpeg.wasm performance docs](https://ffmpegwasm.netlify.app/docs/performance/); ClearRec 2026 |
| Performance vs native | Maintainers' benchmark (WebM → MP4): native 5.2 s, core 128.8 s (0.04×), core-mt 60.4 s (0.08×). ClearRec (M3 Pro, 60 s 1080p, MT): libx264 preset fast 33 s (1.8× realtime), libvpx-vp9 66 s (0.9×), libaom-av1 195 s (0.3×); stream-copy trim 0.4 s. Independent WebCodecs-vs-ffmpeg.wasm comparisons: 7.5-10× in favour of WebCodecs | [performance docs](https://ffmpegwasm.netlify.app/docs/performance/); ClearRec 2026; [dev.to benchmark](https://dev.to/mengyuxuan/webcodecs-is-10x-faster-than-ffmpegwasm-and-sometimes-worse-37jk); [remotion webcodecs-benchmark](https://github.com/remotion-dev/webcodecs-benchmark) |
| Bundle size | Official core WASM is tens of MB raw (ClearRec: ST ~12 MB gz, MT ~30 MB gz, ~80 MB resident); load 4 s warm / 10 s cold. VERIFY exact numbers against the CDN before committing; a custom build (fewer codecs) can be far smaller | ClearRec 2026; [GitHub issue 866](https://github.com/ffmpegwasm/ffmpeg.wasm/issues/866) |
| Memory / file limits | 2 GB hard limit per FAQ ("might become 4 GB"); ClearRec: ~2 GB practical, 350 MB for 1 min 1080p; iOS Safari caps WASM around 2 GB and jetsam kills tabs earlier (E) | [FAQ](https://ffmpegwasm.netlify.app/docs/faq); ClearRec 2026 |
| Encoders in official build | libx264, libx265, libvpx (VP8/VP9), libaom (AV1), MPEG-4, MJPEG, ProRes; audio AAC, MP3 (lame), Opus, Vorbis, FLAC, PCM, AC3. Built with `--enable-gpl --enable-libx264 --enable-libx265 --enable-libmp3lame` | ClearRec 2026; [OpenTranscribe build notes](https://docs.opentranscribe.app/docs/developer-guide/ffmpeg-wasm-build/); [caracola-ai LGPL rebuild](https://github.com/caracola-ai/ffmpeg-wasm) |
| Licensing | `@ffmpeg/ffmpeg` wrapper is MIT; `@ffmpeg/core` "follows FFmpeg's licenses". Because the official core links x264/x265 with `--enable-gpl`, the shipped WASM is GPL-2.0+. Distributing it from a web page is distribution: the app must satisfy GPL for the combined work or use an LGPL build without x264/x265 (then H.264 only via libopenh264, which is BSD) | [FAQ](https://ffmpegwasm.netlify.app/docs/faq); [FFmpeg license](https://en.wikipedia.org/wiki/FFmpeg); [phpboyscout: An encoder on borrowed time](https://phpboyscout.uk/an-encoder-on-borrowed-time/) |
| Patents | H.264/HEVC patent pools (Via LA, Access Advance/VCL Advance) license encoders/decoders; the AVC "free internet video" royalty-free term historically still required signing a license. Cisco's OpenH264 royalty coverage applies only to Cisco-distributed binaries, not to a WASM you compile. Legal review needed before shipping any WASM H.264/HEVC encoder commercially; VP8/VP9/AV1 avoid this | [Via LA AVC](https://www.via-la.com/licensing-2/avc-h264/); [StreamingMedia: MPEG LA no-royalty](https://www.streamingmedia.com/Articles/News/Featured-News/MPEG-LA-Continues-No-Royalty-Licensing-Of-Free-H.264-Video-65731.aspx); [OpenH264](https://en.wikipedia.org/wiki/OpenH264) |
| Safari | SAB works on Safari 15.2+ with COOP/COEP, but MT build is reported unstable on iOS; memory pressure kills long jobs; iPhone 16 Pro ≈ 50% of M3 MacBook throughput | ClearRec 2026; [dev.to hosted vs wasm](https://dev.to/javidjamae/ffmpegwasm-vs-a-hosted-ffmpeg-api-where-browser-side-breaks-21k9) |

### D.2 Standalone WASM encoders (alternatives)

| Encoder | License | Size | Notes | Source |
|---|---|---|---|---|
| [h264-mp4-encoder](https://github.com/TrevorSundberg/h264-mp4-encoder) (minih264 + libmp4v2) | MIT wrapper; minih264 public domain; libmp4v2 MPL 1.1 | ~1.7 MB JS (single-file base64 WASM); [mattdesl/mp4-wasm-encoder](https://github.com/mattdesl/mp4-wasm-encoder) variant ~200 kB | Baseline-class encoder, `speed` 0-10; fine for "authentic H.264 artifacts" bakes at low cost; quality below x264 | GitHub README (accessed 2026-10-09) |
| libav.js `webm-vp9` / `h264-aac` variants | LGPL | 1.5-3 MiB | libvpx VP8/VP9 and OpenH264 H.264; recommended LGPL path for "authentic VP9/H.264" without GPL | [libav.js](https://github.com/Yahweasel/libav.js) |
| [rav1e_js](https://github.com/rust-av/rav1e_js) | BSD-2 | build-from-source | AV1 via rav1e in WASM; no maintained npm artifact; slow (rav1e 8-15× slower than x264 natively) | GitHub; [forasoft encoder comparison](https://www.forasoft.com/learn/video-encoding/articles/encoder-implementations-x264-x265-svt-av1-libaom-vvenc) |
| SVT-AV1 WASM | BSD-2 | – | No maintained browser package found as of 2026-10-09; SVT-AV1 relies on wide SIMD/threads that WASM lacks | search result; treat as unavailable |
| libaom via ffmpeg.wasm / libav.js | BSD | included | 0.3× realtime at 1080p on M3 Pro (ClearRec); libav.js calls it "effectively unusable" | ClearRec 2026; libav.js README |

### D.3 Cross-origin isolation on a static host

- SAB requires `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` (or `credentialless`); supported Chrome 68/92+, Firefox 79+, Safari 15.2+ [[caniuse sharedarraybuffer](https://caniuse.com/sharedarraybuffer), 96.94%, accessed 2026-10-09].
- GitHub Pages cannot set response headers [[dannadori Medium](https://dannadori.medium.com/how-to-deploy-ffmpeg-wasm-application-to-github-pages-76d1ca143b17)]. `coi-serviceworker` (MIT) registers a service worker that injects COOP/COEP; cost: one forced reload on first visit, script must be same-origin and un-bundled, every cross-origin resource needs CORP/CORS headers, HTTPS required [[coi-serviceworker README](https://github.com/gzuidhof/coi-serviceworker)]. Cloudflare Pages / Netlify / Vercel can set the headers natively and are preferable if hosting is flexible.
- COI also unlocks `performance.measureUserAgentSpecificMemory()` (G) and high-resolution timers; it blocks un-CORP'd third-party iframes/images, so keep the app free of third-party embeds.

### D.4 When to use ffmpeg.wasm in DATAMOSHINE

Use it only for: (a) the opt-in "authentic codec bake" (x264/x265/libvpx/libaom bitstreams with real encoder decisions, e.g. for I-frame removal / P-frame duplication moshing that must survive a real decoder), (b) importing containers/codecs outside Mediabunny + WebCodecs (AVI, MPEG-2, ProRes, DNxHD, old FLV), (c) stream-copy remuxes that need exotic bitstream filters. Load lazily from a separate chunk; default to the single-thread core when `crossOriginIsolated === false`; run inside a Worker; chunk jobs to keep peak memory under ~1 GB on mobile; never put it on the default export path. If GPL is unacceptable, swap the official core for libav.js (LGPL) or an LGPL custom build without x264/x265.

---

## E. Memory and storage architecture

### E.1 Memory facts

| Item | Finding | Source |
|---|---|---|
| WASM memory64 | Chrome 133+ (no flag); Firefox 134+ (intent-to-ship 2024-11-18); Safari: not in 27.0; added in Safari Technology Preview 252 (2026-09) together with multi-memory. JS API caps a memory64 memory at 16 GB. 64-bit pointers lose some engine optimisations (perf hit) | [reintech 2026 guide](https://reintech.io/blog/webassembly-browser-support-2026-compatibility-guide); [Mozilla intent](https://groups.google.com/a/mozilla.org/g/dev-platform/c/I-MywEnFxKc); [caniuse wf-wasm-memory64](https://caniuse.com/wf-wasm-memory64); [SciChart memory64 post](https://www.scichart.com/blog/memory64-unlocking-webassemblys-true-potential-with-16gb-of-in-browser-memory/) |
| Per-tab limits, desktop Chrome | 64-bit renderer historically ~4 GB practical per tab; individual ArrayBuffers/wasm memories up to 16 GB addressable but allocation is best-effort; large ArrayBuffers (> 2 GB) are "very unstable" | [Chromium issue 41133247](https://issues.chromium.org/issues/41133247); [Chromium issue 41082096](https://issues.chromium.org/issues/41082096) |
| Per-tab limits, iOS Safari | No fixed limit: min(WebKit memory-pressure limit, jetsam limit); reported ~3 GB on iPhone 15 Pro, ~1.5 GB on iPhone 12 Pro (drops after days of uptime), 100-200 MB of JS heap can crash low-RAM devices on iOS 26.2; WASM memory ~2 GB cap; jetsam kills then auto-reloads the tab | [pooled issue 207](https://github.com/Nehanth/pooled/issues/207); [Godot issue 70621](https://github.com/godotengine/godot/issues/70621); [Apple forums 766309](https://developer.apple.com/forums/thread/766309); [WebKit wasm compiler memory repro](https://github.com/frankhinek/webkit-wasm-compiler-memory-repro) |
| GPU memory | Not queryable. Chrome exposes memory-heap info via adapter info only as a developer aid (Chrome 121). Use adapter limits (A.1.1) plus probe allocation (G) | [Chrome 121 post](https://developer.chrome.com/blog/new-in-webgpu-121) |

### E.2 Storage facts

| API | Chrome/Edge | Firefox | Safari | Source |
|---|---|---|---|---|
| OPFS (`navigator.storage.getDirectory`) | 86+ | 111+ | 15.2+ | [web.dev OPFS](https://web.dev/articles/origin-private-file-system); [WebKit OPFS post](https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/) |
| `createSyncAccessHandle` (dedicated worker only) | 102+ | 111+ | 16.4+ | web.dev OPFS; search summary (accessed 2026-10-09) |
| `FileSystemFileHandle.createWritable` (OPFS) | 86+ | 111+ | 26.0+ ("File System WritableStream API") | [caniuse createWritable](https://caniuse.com/mdn-api_filesystemfilehandle_createwritable) (92.2%, accessed 2026-10-09); [WebKit 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) |
| `showSaveFilePicker` / `showOpenFilePicker` (local disk, streaming writes) | 86+/105+ desktop only | Never (Mozilla position: harmful) | Never; no mobile browser | [caniuse native-filesystem-api](https://caniuse.com/native-filesystem-api) (30.22%, accessed 2026-10-09) |
| Quota | 60% of disk per origin (best-effort and persistent) | Best-effort: min(10% disk, 10 GiB per site group); persistent (`navigator.storage.persist()`, prompts user): 50% disk, 8 TiB cap | ~60% of disk for browser apps and Home-Screen web apps (macOS 14+/iOS 17+); 15% inside non-browser apps' web views; cross-origin frames 1/10 | [MDN Storage quotas (modified 2026-01-05)](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) |
| Eviction | LRU under pressure, skips persistent origins | same | Also proactively deletes script-written data of origins with no user interaction for 7 days of Safari use; eviction is all-or-nothing per origin (IDB + Cache + OPFS together) | MDN Storage quotas (2026-01-05) |
| OPFS vs IndexedDB throughput | 100 MB write: ~90 ms via sync access handle vs ~850 ms IDB; 5-15× faster in general (no structured clone, no transaction log) | – | – | [RxDB OPFS](https://rxdb.info/rx-storage-opfs.html); [Loft Tools OPFS](https://lofttools.com/blog/opfs-origin-private-file-system/) |

### E.3 Proposed architecture for long videos and the render cache

1. Source media never fully loads into memory. Imported `File`s are read via Mediabunny `BlobSource` (chunked, 8 MiB cache); optionally copied into OPFS once (streaming copy via `createWritable` or sync handle in a worker) so the handle survives reloads and the clip can be range-read without keeping a `File` reference alive.
2. Decode is pull-based: the timeline requests frame N, the demuxer seeks to the previous keyframe, the `VideoDecoder` decodes forward, and a bounded ring of `VideoFrame`s (close them aggressively; each 1080p NV12 frame is ~3 MB, 4K ~12 MB, GPU-backed frames also count against driver memory) feeds the GPU. Budget rings by tier (G): e.g. 8 frames on mobile, 32 on desktop.
3. Render cache lives in OPFS, not IndexedDB: one file per cached segment (e.g. 1-second GOP, fMP4 fragment or raw/compressed frames), written from a worker with `createSyncAccessHandle` (Chrome 102+, Firefox 111+, Safari 16.4+). Index (segment → byte range, hash of effect graph) in a small IndexedDB or a JSON file in OPFS. Keep per-segment files < 256 MiB so a Safari cross-origin-frame quota or Android limits never apply to a single write. Size the cache from `navigator.storage.estimate()`; request `persist()` on Firefox to escape the 10 GiB group cap; evict LRU ourselves to stay under 50% of `quota`.
4. Cached rendered frames should be stored encoded (H.264 High / VP9 at high bitrate, or lossless-ish AV1 where encode is fast) rather than raw: raw 1080p RGBA is 8.3 MB/frame = 250 MB/s at 30 fps, which exhausts even a 60%-of-disk quota quickly and overwhelms OPFS throughput on mobile. Encoding to the cache via a second `VideoEncoder` is cheap on hardware encoders.
5. Export is streamed: Mediabunny `Output` with `StreamTarget` → `showSaveFilePicker().createWritable()` on Chrome/Edge desktop (zero RAM growth), otherwise → OPFS file via `createWritable` (Safari 26+, Firefox 111+) then handed to the user as a `File` from `getFile()` + `<a download>`; use `fastStart: 'fragmented'` for arbitrary length with bounded memory, or `fastStart: false` (moov at end) when the output must be a conventional progressive MP4 and the whole file is on OPFS anyway. Avoid `'in-memory'` for anything beyond short clips.
6. GPU memory budget: derive from granted `maxBufferSize`/`maxStorageBufferBindingSize` (A.1.1) and the tier; keep total live GPU allocations under ~min(512 MiB, 25% of estimated RAM) on mobile and ~1-2 GiB on desktop, since `device.lost` is the only signal of over-allocation.
7. WASM memory: build ffmpeg.wasm/libav.js as memory32 (memory64 absent on Safari release); cap `MAXIMUM_MEMORY` at 2 GB and process in chunks.

---

## F. Audio stack

| Component | Choice | License | Support / notes | Source |
|---|---|---|---|---|
| Engine | WebAudio + `AudioWorklet` for real-time preview; `OfflineAudioContext` for export mixing | – | AudioWorklet: Chrome 66+, Firefox 76+, Safari 14.1+/iOS 14.5+ (97.13%) | [caniuse AudioWorklet](https://caniuse.com/mdn-api_audioworklet) (accessed 2026-10-09) |
| Decode | `AudioDecoder` (WebCodecs) via Mediabunny; fallback `AudioContext.decodeAudioData` (loads whole file into memory; fine for short clips only) | – | AudioDecoder: Chrome 94+, Firefox 130+, Safari 26+ | A.3 |
| Time-stretch (primary) | [signalsmith-stretch](https://www.npmjs.com/package/signalsmith-stretch) 1.3.2, official WASM + AudioWorklet build of Signalsmith Stretch | MIT | Hybrid spectral approach; best 0.75-1.5× stretch, multi-octave pitch shift, formant options; the C++ core is header-only MIT | [Signalsmith Stretch](https://signalsmith-audio.co.uk/code/stretch/); [jsDelivr versions](https://data.jsdelivr.com/v1/package/npm/signalsmith-stretch) (accessed 2026-10-09); [PracticeSession deep dive](https://www.practicesession.app/blog/signalsmith-stretch-deep-dive/) |
| Time-stretch (fast/cheap alternative) | [SoundTouchJS](https://github.com/cutterbl/SoundTouchJS) `@soundtouchjs/audio-worklet` (+ `@soundtouchjs/stretch-phase-vocoder`) | MPL-2.0 | WSOLA-style, 128-sample AudioWorklet blocks, AudioParam automation; good for modest tempo changes, artefacts on extreme stretch | [npm @soundtouchjs/audio-worklet](https://www.npmjs.com/package/@soundtouchjs/audio-worklet); GitHub (accessed 2026-10-09) |
| Time-stretch (highest quality) | [rubberband-wasm](https://github.com/Daninet/rubberband-wasm) | GPL-2.0 or paid commercial licence | Reference-quality R3 engine; GPL makes it unsuitable unless the whole app is GPL or a licence is bought | GitHub README (accessed 2026-10-09) |
| Pitch-shift only | [phaze](https://github.com/olvb/phaze) phase-vocoder AudioWorklet | see repo | Real-time pitch shifting; useful for "datamosh" pitch effects | GitHub (accessed 2026-10-09) |
| Encode for export | `AudioEncoder` Opus everywhere; AAC-LC where supported (Chrome Win/macOS/Android/ChromeOS, Safari 26+; not Linux Chrome, never Firefox); MP3 via Mediabunny `@mediabunny/mp3-encoder` extension (no browser MP3 encoder) | – | See A.4 | [Mediabunny supported formats](https://mediabunny.dev/guide/supported-formats-and-codecs); [codec analysis 2026](https://webcodecsfundamentals.org/datasets/codec-analysis-2026/) |

Recommendation: ship signalsmith-stretch as the default stretcher inside an AudioWorklet (preview) and as an offline WASM pass (export), SoundTouchJS as the low-CPU fallback on tier-0/1 devices, and keep Rubber Band out of the default bundle.

---

## G. Device tiering heuristic

### G.1 Signals available

| Signal | Chrome/Edge | Firefox | Safari | Source |
|---|---|---|---|---|
| `GPUAdapter.info` (`vendor`, `architecture`, `device`, `description`) | Sync since Chrome 128; also `GPUDevice.adapterInfo` | Bucketed/generic | Generic ("apple" / "Apple GPU"-class strings) | [Chrome 128 post](https://developer.chrome.com/blog/new-in-webgpu-128); [MDN GPUAdapterInfo](https://developer.mozilla.org/en-US/docs/Web/API/GPUAdapterInfo); [gpuweb issue 2195](https://github.com/gpuweb/gpuweb/issues/2195) |
| `GPUAdapter.limits` | Tiered buckets (Dawn `useTieredLimits`) | Tiered | Tiered | A.1.1 |
| `GPUAdapter.features` (`shader-f16`, `subgroups`, `timestamp-query`) | Yes | Yes | Yes | A.1.1 |
| `navigator.deviceMemory` (0.25-8, capped) | Yes | No (WONTFIX) | No | [Bugzilla 1629868](https://bugzilla.mozilla.org/show_bug.cgi?id=1629868) |
| `navigator.hardwareConcurrency` | Real | Real (Firefox 131+ no clamp by default) | Clamped (reports a small fixed value) | [MDN hardwareConcurrency](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/hardwareConcurrency); [testmu guide](https://www.testmuai.com/learning-hub/navigator-hardwareconcurrency/) |
| `performance.memory` | Chrome only, non-standard, coarse | No | No | – |
| `performance.measureUserAgentSpecificMemory()` | Chrome 89+, requires cross-origin isolation | No | No | [web.dev](https://web.dev/articles/monitor-total-page-memory-usage) |
| WebGL `RENDERER` string via `WEBGL_debug_renderer_info` + benchmark table | Full | Bucketed | "Apple GPU" | [detect-gpu](https://www.npmjs.com/package/detect-gpu) 5.0.70 (MIT): tier 0-3 from GFXBench fps (≥15/30/60) |
| `VideoDecoder.isConfigSupported` / `VideoEncoder.isConfigSupported` | `supported` plus echoed config; Chrome returns hardware vs software only indirectly (configure with `prefer-hardware` and see if it throws) | yes | yes | A.5; [MDN codec selection](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Codec_selection) |
| Screen / UA | `screen.width*devicePixelRatio`, `navigator.userAgentData` (Chromium), touch points | – | – | – |

### G.2 Proposed tiering (to be calibrated by prototype)

Compute a tier on first run (cache the result in `localStorage`, re-probe on `device.lost` or version change):

1. Static score:
   - GPU API: WebGPU core = 3, WebGPU compat = 2, WebGL2 = 1, none = 0.
   - Limits: `maxBufferSize ≥ 1 GiB` and `maxStorageBufferBindingSize ≥ 512 MiB` → +1; `maxTextureDimension2D ≥ 16384` → +0.5; `shader-f16` → +0.5.
   - Memory: `deviceMemory ≥ 8` → +1, `≤ 2` → −1 (Chromium only); iOS → assume 1.5-3 GB tab budget (E.1) → −1 unless `architecture` indicates Metal-3-class (A17/M-series).
   - CPU: `hardwareConcurrency ≥ 8` → +0.5 (ignore on Safari).
   - detect-gpu tier (fallback when WebGPU is absent or info is generic): maps 0-3 directly.
   - Codec: hardware H.264 decode+encode confirmed via `isConfigSupported` + `prefer-hardware` configure → +0.5; AV1 decode absent → cap "AV1 import" feature.
2. Dynamic micro-benchmarks (≤ 300 ms total, run in a worker):
   - GPU: a 1080p 4-pass compute/fragment chain timed with `timestamp-query` when available else `performance.now()` around `queue.onSubmittedWorkDone()`; derive frames/s.
   - Allocation probe: try allocating a 512 MiB then 1 GiB `GPUBuffer` (mappedAtCreation false) and immediately destroy; failure or `device.lost` → downgrade.
   - Decode probe: decode 30 frames of an embedded 1080p H.264 test clip; measure throughput; < 60 fps → cap preview to 720p.
3. Tier → limits table (initial proposal; prototype must tune):

| Tier | Typical devices | Max preview res / fps | Max export res | Max clip length without proxy | Frame ring | GPU budget | OPFS cache |
|---|---|---|---|---|---|---|---|
| 0 | WebGL1-only, Firefox Android, very old Android | 480p / 24 | 720p | 2 min (proxy beyond) | 4 | 128 MiB | 1 GiB |
| 1 | WebGPU compat or WebGL2 on mobile, Adreno 5xx/6xx (1 GiB buffer cap), Intel UHD, Firefox Linux | 720p / 30 | 1080p | 10 min | 8 | 256 MiB | 4 GiB |
| 2 | Apple A14-A16, Adreno 7xx, Mali Valhall, Intel Iris Xe, Apple M1/M2, mid NVIDIA/AMD | 1080p / 60 | 4K | unbounded (streamed) | 16 | 768 MiB | 25% of quota |
| 3 | Apple M3+/A17 Pro+, discrete NVIDIA/AMD, 16 GB+ RAM, 2 GiB buffer limits | 4K / 60 | 8K (texture ≥ 16384 required) | unbounded | 32 | 2 GiB | 25% of quota |

Rationale for the caps: Chrome refuses software encode above ~2160p (A.5), Safari's practical tab memory on older iPhones is ~1.5 GB (E.1), and 78% of adapters but only 30% of Safari adapters grant a 2 GiB buffer (A.1.1), so 8K paths must be gated on actual granted limits rather than tier alone.

---

## H. Risks and things to verify by prototype

1. Safari H.264 `latencyMode: "quality"` deadlock (27.0/27.0.1) [[Mediabunny 541](https://github.com/Vanilagy/mediabunny/issues/541)]: ship a Safari-version check that forces `"realtime"` or Baseline until the STP 254 fix reaches a release; confirm with `flush()` timeouts.
2. Firefox Linux: no WebGPU in release, no `importExternalTexture`/`copyExternalImageToTexture(VideoFrame)` on Linux or Android ([bug 2008705](https://bugzilla.mozilla.org/show_bug.cgi?id=2008705), [2008706](https://bugzilla.mozilla.org/show_bug.cgi?id=2008706)): verify the `VideoFrame.copyTo()` → `writeTexture` path and its cost (expect 1 CPU copy per frame; measure fps at 1080p).
3. Firefox Android: no WebCodecs, no WebGPU; decide whether to support it at all (likely "preview only" via `<video>` + WebGL2) or show an unsupported banner.
4. Safari AV1: only ~27-33% of sessions decode AV1 and Apple ships no software decoder [[dataset](https://webcodecsfundamentals.org/datasets/codec-analysis-2026/)]: AV1 imports on Safari need the WASM decode fallback (dav1d via libav.js/ffmpeg.wasm) or a transcode-on-import prompt; measure dav1d-in-WASM throughput on an iPhone 13.
5. HEVC: absent on Firefox, ~58% on Linux Chrome, 57% on Edge Windows (needs paid HEVC Video Extension): same fallback as AV1 plus licensing caution.
6. WebGPU limits on mobile: verify that the app runs entirely within spec defaults (256 MiB buffer / 128 MiB binding / 8192 texture) on an Adreno 6xx phone and an iPhone 12, since 20% of iOS adapters do not grant ≥ 1 GiB [[web3dsurvey iOS](https://web3dsurvey.com/webgpu/limits/maxBufferSize/platform/iOS)].
7. `subgroups` must be optional (Safari 0.4%, Firefox 0.02%); keep two WGSL variants or none.
8. `copyExternalImageToTexture(VideoFrame)` partial support in Chrome 116-143 (reason undocumented on caniuse): test on Chrome 143 and older enterprise builds; prefer `importExternalTexture`.
9. `importExternalTexture` returns a one-frame-lifetime texture bound to the `VideoFrame`; verify that frames are closed only after the submitted queue completes to avoid driver stalls (Chrome) or black frames (Safari).
10. WKWebView WebGPU on iOS 26 is asserted but not proven [[Apple forums 770862](https://developer.apple.com/forums/thread/770862)]: test if an embedded (Capacitor/PWA-in-app) distribution is planned; also note the 15% quota inside non-browser apps.
11. `showSaveFilePicker` absent on Safari/Firefox/mobile: verify the OPFS-then-download path for multi-GB exports (does `<a download>` of a 4 GB OPFS `File` stream or buffer? test Safari 26 and Firefox 157), and whether Safari's 7-day no-interaction eviction can delete an in-progress cache.
12. Firefox quota: best-effort 10 GiB per site group; test `navigator.storage.persist()` UX and fall back to a smaller cache if denied.
13. iOS memory: measure actual jetsam threshold with 1080p and 4K pipelines on an iPhone 12-class device; implement a watchdog (`device.lost`, `pagehide`, decode errors) that checkpoints render progress to OPFS so a reload resumes.
14. ffmpeg.wasm: measure real bundle size and cold load on the chosen CDN; confirm `core-mt` works on iOS Safari 26 under `coi-serviceworker`; decide GPL vs LGPL build before any public release; do a legal review of H.264/HEVC patent exposure for a WASM encoder shipped to end users.
15. `coi-serviceworker` first-load reload and third-party-resource breakage (fonts, analytics) under COEP: confirm nothing in the static site is cross-origin without CORP, or use `COEP: credentialless` on Chrome/Firefox (not supported in Safari; verify current status).
16. Per-frame `quantizer` mode on Safari/Firefox: `isConfigSupported({bitrateMode: "quantizer"})` must be probed; have a VBR fallback with per-segment bitrate retargeting.
17. Chrome software encode cap ~4096×2176: 8K exports must verify hardware availability (`prefer-hardware` configure) or tile/transcode; measure.
18. Opus-in-MP4 playback compatibility in external players (QuickTime, iOS Photos, Windows Media Player) if Opus is the only audio encoder available (Firefox, Linux): decide whether to bundle a WASM AAC encoder (patent-encumbered; FDK-AAC licence) or ship WebM for those cases.
19. Memory64 absent in Safari release: ensure no dependency chooses a memory64 WASM build; revisit when Safari ships (STP 252 added it).
20. Android MediaCodec concurrency: opening many `VideoDecoder`s (multi-clip timeline) can fail on devices allowing < 6 concurrent hardware sessions [[Android MPC](https://source.android.com/docs/compatibility/17/mpc)]; implement a decoder pool with LRU reuse and software fallback (`prefer-software`) when `configure` rejects.
21. Timestamp-query is quantized to 100 µs on Chrome ([Chrome 121](https://developer.chrome.com/blog/new-in-webgpu-121)); for the tier micro-benchmark use multi-pass batches long enough (≥ 10 ms) to be meaningful.

---

## Source index (all accessed 2026-10-09 unless noted)

- caniuse: [webgpu](https://caniuse.com/webgpu), [webcodecs](https://caniuse.com/webcodecs), [webgl2](https://caniuse.com/webgl2), [sharedarraybuffer](https://caniuse.com/sharedarraybuffer), [native-filesystem-api](https://caniuse.com/native-filesystem-api), [createWritable](https://caniuse.com/mdn-api_filesystemfilehandle_createwritable), [MediaStreamTrackProcessor](https://caniuse.com/mdn-api_mediastreamtrackprocessor), [copyExternalImageToTexture VideoFrame](https://caniuse.com/mdn-api_gpuqueue_copyexternalimagetotexture_videoframe_source), [AudioWorklet](https://caniuse.com/mdn-api_audioworklet), [wasm memory64](https://caniuse.com/wf-wasm-memory64)
- gpuweb: [Implementation Status (2026-10-02)](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status), [issue 6331 Firefox 152 Linux flag](https://github.com/gpuweb/gpuweb/issues/6331), [W3C WebGPU spec](https://www.w3.org/TR/webgpu/)
- Chrome: [WebGPU 121 (2024-01-18)](https://developer.chrome.com/blog/new-in-webgpu-121), [128](https://developer.chrome.com/blog/new-in-webgpu-128), [134 (2025-02-26)](https://developer.chrome.com/blog/new-in-webgpu-134), [146 (2026-02-25)](https://developer.chrome.com/blog/new-in-webgpu-146), [147-148](https://developer.chrome.com/blog/new-in-webgpu-147-148), [155-156 (2026-10-07)](https://developer.chrome.com/blog/new-in-webgpu-155-156); [per-frame quantizer intent](https://groups.google.com/a/chromium.org/g/blink-dev/c/UZWH1LuwBas); [Media WG minutes 2023-03-07](https://www.w3.org/2023/03/07-mediawg-minutes.html)
- WebKit: [Safari 26.0 (2025-09-15)](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/), [26.2 (2025-12-12)](https://webkit.org/blog/17640/webkit-features-for-safari-26-2/), [26.4 (2026-03-24)](https://webkit.org/blog/17862/webkit-features-for-safari-26-4/), [26.5](https://webkit.org/blog/17938/webkit-features-for-safari-26-5/), [26.6](https://webkit.org/blog/18178/webkit-features-for-safari-26-6/), [27.0](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/), [STP 254 (2026-10-08)](https://webkit.org/blog/18420/release-notes-for-safari-technology-preview-254/), [WebKit PR 74602](https://github.com/WebKit/WebKit/pull/74602), [OPFS post](https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/), [Apple forums WKWebView WebGPU](https://developer.apple.com/forums/thread/770862)
- Mozilla: [Firefox 141 WebGPU (2025-07-15)](https://mozillagfx.wordpress.com/2025/07/15/shipping-webgpu-on-windows-in-firefox-141/), [Firefox 157 notes (2026-09-29)](https://www.firefox.com/en-US/firefox/157.0/releasenotes/), [MDN Firefox 157](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/157), [bug 1827116](https://bugzilla.mozilla.org/show_bug.cgi?id=1827116), [bug 1983594](https://bugzilla.mozilla.org/show_bug.cgi?id=1983594), [bug 1908572 WebCodecs](https://bugzilla.mozilla.org/show_bug.cgi?id=1908572), [bug 1629868 deviceMemory](https://bugzilla.mozilla.org/show_bug.cgi?id=1629868), [memory64 intent (2024-11-18)](https://groups.google.com/a/mozilla.org/g/dev-platform/c/I-MywEnFxKc)
- MDN: [VideoEncoder.configure](https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder/configure), [VideoEncoder.encode](https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder/encode), [Storage quotas (2026-01-05)](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [GPUAdapterInfo](https://developer.mozilla.org/en-US/docs/Web/API/GPUAdapterInfo), [codec selection](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Codec_selection)
- Data: [webcodecsfundamentals codec analysis 2026](https://webcodecsfundamentals.org/datasets/codec-analysis-2026/) and per-codec pages; [web3dsurvey WebGPU features/limits](https://web3dsurvey.com/webgpu/features/shader-f16)
- Libraries: [Mediabunny](https://github.com/Vanilagy/mediabunny) ([reading](https://mediabunny.dev/guide/reading-media-files), [writing](https://mediabunny.dev/guide/writing-media-files), [output formats](https://mediabunny.dev/guide/output-formats), [codecs](https://mediabunny.dev/guide/supported-formats-and-codecs)), [mp4box.js](https://github.com/gpac/mp4box.js/), [mp4-muxer migration](https://vanilagy.github.io/mp4-muxer/MIGRATION-GUIDE.html), [web-demuxer](https://github.com/ForeverSc/web-demuxer), [jswebm](https://github.com/jscodec/jswebm), [libav.js](https://github.com/Yahweasel/libav.js), [ffmpeg.wasm releases](https://github.com/ffmpegwasm/ffmpeg.wasm/releases), [ffmpeg.wasm performance](https://ffmpegwasm.netlify.app/docs/performance/), [ffmpeg.wasm FAQ](https://ffmpegwasm.netlify.app/docs/faq), [ClearRec guide (2026-05-26)](https://www.clearrec.app/blog/ffmpeg-wasm-complete-guide-2026), [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker), [h264-mp4-encoder](https://github.com/TrevorSundberg/h264-mp4-encoder), [mp4-wasm-encoder](https://github.com/mattdesl/mp4-wasm-encoder), [rav1e_js](https://github.com/rust-av/rav1e_js), [signalsmith-stretch](https://signalsmith-audio.co.uk/code/stretch/), [SoundTouchJS](https://github.com/cutterbl/SoundTouchJS), [rubberband-wasm](https://github.com/Daninet/rubberband-wasm), [phaze](https://github.com/olvb/phaze), [detect-gpu](https://www.npmjs.com/package/detect-gpu)
- Memory: [Chromium 41133247](https://issues.chromium.org/issues/41133247), [Chromium 41082096](https://issues.chromium.org/issues/41082096), [pooled 207 iOS memory](https://github.com/Nehanth/pooled/issues/207), [Godot 70621](https://github.com/godotengine/godot/issues/70621), [RxDB OPFS](https://rxdb.info/rx-storage-opfs.html)
- Licensing: [Via LA AVC](https://www.via-la.com/licensing-2/avc-h264/), [Access Advance](https://accessadvance.com/about/), [OpenH264](https://en.wikipedia.org/wiki/OpenH264), [phpboyscout x264/GPL](https://phpboyscout.uk/an-encoder-on-borrowed-time/)
