// platform.js — capability probe and device tier, v0 (static signals only; the dynamic micro-benchmarks
// and the real-time governor arrive in M4, spec §10). Cached per session; never blocks on slow probes.

const GiB = 1024 ** 3, MiB = 1024 ** 2;

/** Probe what this browser and device can do. Pass an adapter if one exists already. */
export async function probe(adapter) {
  const r = {
    api: 'none', adapter: '', features: [], limits: {},
    deviceMemory: navigator.deviceMemory ?? null, cores: navigator.hardwareConcurrency ?? null,
    coi: self.crossOriginIsolated === true, ios: /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    webcodecs: { video: typeof VideoDecoder === 'function' && typeof VideoEncoder === 'function', audio: typeof AudioDecoder === 'function' && typeof AudioEncoder === 'function', h264dec: null, h264enc: null },
    opfs: !!(navigator.storage && navigator.storage.getDirectory), score: 0, tier: 0,
  };
  if ('gpu' in navigator) {
    adapter = adapter || (await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }));
    if (adapter) r.api = 'webgpu';
    else if ((adapter = await navigator.gpu.requestAdapter({ featureLevel: 'compatibility' }))) r.api = 'webgpu-compat';
    if (adapter) {
      const i = adapter.info || {}; r.adapter = [i.vendor, i.architecture, i.description].filter(Boolean).join(' ');
      r.features = [...adapter.features].sort();
      for (const k of ['maxBufferSize', 'maxStorageBufferBindingSize', 'maxTextureDimension2D', 'maxComputeWorkgroupStorageSize', 'maxComputeInvocationsPerWorkgroup']) r.limits[k] = adapter.limits[k];
    }
  }
  if (r.api === 'none') { try { if (document.createElement('canvas').getContext('webgl2')) r.api = 'webgl2'; } catch (e) {} }
  if (r.webcodecs.video) {
    const cfg = { codec: 'avc1.640028', width: 1920, height: 1080 };
    try { r.webcodecs.h264dec = (await VideoDecoder.isConfigSupported({ codec: cfg.codec, codedWidth: 1920, codedHeight: 1080 })).supported; } catch (e) { r.webcodecs.h264dec = false; }
    try { r.webcodecs.h264enc = (await VideoEncoder.isConfigSupported({ ...cfg, bitrate: 8e6, framerate: 30 })).supported; } catch (e) { r.webcodecs.h264enc = false; }
  }
  // static score (spec §10.1) -> tier 0..3
  let s = { webgpu: 3, 'webgpu-compat': 2, webgl2: 1, none: 0 }[r.api];
  if (r.limits.maxBufferSize >= GiB && r.limits.maxStorageBufferBindingSize >= 512 * MiB) s += 1;
  if (r.limits.maxTextureDimension2D >= 16384) s += 0.5;
  if (r.features.includes('shader-f16')) s += 0.5;
  if (r.deviceMemory !== null) s += r.deviceMemory >= 8 ? 1 : r.deviceMemory <= 2 ? -1 : 0;
  if (r.ios) s -= 1;
  if (r.cores >= 8) s += 0.5;
  if (r.webcodecs.h264dec && r.webcodecs.h264enc) s += 0.5;
  r.score = s; r.tier = s >= 5.5 ? 3 : s >= 4 ? 2 : s >= 2 ? 1 : 0;
  return r;
}

/** Initial limits per tier (spec §10.2); the governor adjusts these at run time from M4 on. */
export const TIER_LIMITS = [
  { preview: [854, 480], fps: 24, export: [1280, 720], ring: 4, gpuBudget: 128 * MiB },
  { preview: [1280, 720], fps: 30, export: [1920, 1080], ring: 8, gpuBudget: 256 * MiB },
  { preview: [1920, 1080], fps: 60, export: [3840, 2160], ring: 16, gpuBudget: 768 * MiB },
  { preview: [3840, 2160], fps: 60, export: [7680, 4320], ring: 32, gpuBudget: 2 * GiB },
];

/**
 * Probe v1: measured numbers to go with the static score (spec §10.1, dynamic part). About a second, in the
 * background after the page is up. Returns { loop1080Ms, alloc128, alloc256, adapterMaxBufferMiB, encFps, decFps, tier, ms }.
 */
export async function measure(gpu, P) {
  const t0 = performance.now(), out = { loop1080Ms: null, alloc128: null, alloc256: null, encFps: null, decFps: null };
  const { createMoshLoop } = await import('./engine.js'), { createImage, upload, F16 } = await import('./gpu.js'), { PRESETS } = await import('./config.js');
  // 1. the default Mosh Loop at 1280x720 on two noise frames, scaled to 1080p by pixel count
  try {
    const w = 1280, h = 720, a = createImage(gpu, w, h, F16), b = createImage(gpu, w, h, F16), px = new Float32Array(w * h * 4);
    for (let i = 0; i < px.length; i++) px[i] = ((i * 2654435761) >>> 0) / 4294967296; upload(gpu, a, px);
    for (let i = 0; i < px.length; i++) px[i] = ((i * 2246822519 + 7) >>> 0) / 4294967296; upload(gpu, b, px);
    const L = createMoshLoop(gpu, { w, h }, PRESETS['Xvid classic']); L.begin(0);
    for (let t = 0; t < 3; t++) L.step(t, { src: t & 1 ? b : a }); await gpu.device.queue.onSubmittedWorkDone();
    const s = performance.now(); for (let t = 3; t < 15; t++) L.step(t, { src: t & 1 ? b : a }); await gpu.device.queue.onSubmittedWorkDone();
    out.loop1080Ms = +(((performance.now() - s) / 12) * 2.25).toFixed(1); L.destroy(); a.destroy(); b.destroy();
  } catch (e) { console.warn('moshine probe: loop', e); }
  // 2. large allocations: the engine runs on a default-limits device (spec defaults, 256 MiB buffers), so this only
  // probes what that device can hold; adapter headroom is reported, not tested (it would need a second device)
  out.adapterMaxBufferMiB = Math.round((gpu.adapter.limits.maxBufferSize || 0) / 2 ** 20);
  for (const [k, mib] of [['alloc128', 128], ['alloc256', 256]]) {
    if (gpu.device.limits.maxBufferSize < mib * 2 ** 20) { out[k] = null; continue; }
    gpu.device.pushErrorScope('out-of-memory'); let buf = null;
    try { buf = gpu.device.createBuffer({ size: mib * 2 ** 20, usage: GPUBufferUsage.STORAGE }); } catch (e) {}
    out[k] = !(await gpu.device.popErrorScope()) && !!buf; buf?.destroy();
  }
  // 3. H.264 1280x720: encode 30 frames, decode them back (no asset needed)
  if (typeof VideoEncoder === 'function') try {
    const w = 1280, h = 720, cv = new OffscreenCanvas(w, h), g = cv.getContext('2d'), chunks = []; let meta = null;
    const enc = new VideoEncoder({ output: (c, m) => { chunks.push(c); if (m?.decoderConfig) meta = m.decoderConfig; }, error: () => {} });
    enc.configure({ codec: 'avc1.640028', width: w, height: h, bitrate: 6e6, framerate: 30, latencyMode: 'realtime' });
    const frame = (i) => { g.fillStyle = `hsl(${i * 12} 70% 50%)`; g.fillRect(0, 0, w, h); const f = new VideoFrame(cv, { timestamp: i * 33333 }); enc.encode(f, { keyFrame: i === 0 }); f.close(); };
    for (let i = 0; i < 5; i++) frame(i); await enc.flush(); chunks.length = 0;          // warm up: hardware encoders take a while to start
    const s = performance.now();
    for (let i = 0; i < 30; i++) { g.fillStyle = `hsl(${i * 12} 70% 50%)`; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect((i * 37) % w, (i * 19) % h, 200, 120); const f = new VideoFrame(cv, { timestamp: i * 33333 }); enc.encode(f, { keyFrame: i === 0 }); f.close(); }
    await enc.flush(); out.encFps = Math.round(30 / ((performance.now() - s) / 1000)); enc.close();
    let n = 0; const dec = new VideoDecoder({ output: (f) => { n++; f.close(); }, error: () => {} }); dec.configure(meta);
    const s2 = performance.now(); for (const c of chunks) dec.decode(c); await dec.flush(); out.decFps = Math.round(n / ((performance.now() - s2) / 1000)); dec.close();
  } catch (e) { console.warn('moshine probe: codec', e); }
  // measured caps on the static tier
  let tier = P.tier;
  if (out.loop1080Ms !== null && out.loop1080Ms > 66) tier = Math.min(tier, 1); else if (out.loop1080Ms !== null && out.loop1080Ms > 33) tier = Math.min(tier, 2);
  if (out.alloc256 === false) tier = Math.min(tier, 1);
  if (out.decFps !== null && out.decFps < 30) tier = Math.min(tier, 1);
  return { ...out, tier, ms: Math.round(performance.now() - t0) };
}
