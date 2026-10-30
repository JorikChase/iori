/* Stage 1 probe, worklet side. probe-load runs the bench kernels (tools/audio-test/bench/dsp/k.c, bench.js) and times
   each block; probe-tone is a steady level for the isolation tests.
   An AudioWorkletGlobalScope has no performance.now and no fetch, so the clock is Date.now (1 ms: mean load and lag
   are still right, single blocks are not) until the page hands over a SharedArrayBuffer that a spinning Worker keeps
   writing microseconds into. No allocation inside process(). */
const VMAX = 64, BIN = 10, BINS = 4096, WIN = 94, MAXWIN = 256;   // kernels hold 64 voices; 10 us bins; a lag window is 250 ms

function jsKernel(cap) {
  const bl = 128, out = new Float32Array(bl), st = new Float32Array(cap * 11);
  for (let i = 0; i < cap; i++) {
    const f = 110 * (1 + (i % VMAX) * 0.37), o = i * 11, g = 0.3, k = 0.7, a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    st[o] = i * 0.013 % 1; st[o + 1] = i * 0.031 % 1; st[o + 2] = f / sampleRate; st[o + 3] = f * 1.006 / sampleRate;
    st[o + 6] = a1; st[o + 7] = a2; st[o + 8] = a3; st[o + 9] = 0.1;
  }
  function blep(t, dt) { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; }
  return function (N) {
    out.fill(0);
    for (let n = 0; n < N; n++) {
      const o = n * 11, d1 = st[o + 2], d2 = st[o + 3], a1 = st[o + 6], a2 = st[o + 7], a3 = st[o + 8], g = st[o + 9];
      let p1 = st[o], p2 = st[o + 1], ic1 = st[o + 4], ic2 = st[o + 5];
      for (let i = 0; i < bl; i++) {
        const s = 2 * p1 - 1 - blep(p1, d1) + 2 * p2 - 1 - blep(p2, d2); p1 += d1; if (p1 >= 1) p1 -= 1; p2 += d2; if (p2 >= 1) p2 -= 1;
        const v3 = s - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3; ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2; out[i] += v2 * g;
      }
      st[o] = p1; st[o + 1] = p2; st[o + 4] = ic1; st[o + 5] = ic2;
    }
    return out[17];
  };
}

/* above 64 voices the kernel runs again: same cost per voice, smaller cache footprint than 64+ real voices */
function wasmKernel(bytes, fn) {
  const e = new WebAssembly.Instance(new WebAssembly.Module(bytes), { env: {} }).exports, f = e[fn];
  e.init(sampleRate); e.init4(); e.inittb();
  const out = new Float32Array(e.memory.buffer, e.outp(), 128);
  return function (N) { for (; N > VMAX; N -= VMAX) f(VMAX); if (N > 0) f(N); return out[17]; };
}

class Load extends AudioWorkletProcessor {
  constructor(opts) {
    super();
    const o = opts.processorOptions;
    this.hist = new Uint32Array(BINS); this.wins = new Float64Array(MAXWIN); this.clk = null; this.base = Date.now(); this.s = null; this.sink = 0;
    this.budget = 128 / sampleRate * 1e6;
    this.port.onmessage = (e) => this.msg(e.data);
    try {
      this.run = o.fn ? wasmKernel(o.bytes, o.fn) : jsKernel(o.cap);
      this.port.postMessage({ ready: true, quantum: 128, sr: sampleRate });
    } catch (err) { this.port.postMessage({ error: String(err) }); }
  }
  now() { return this.clk ? Atomics.load(this.clk, 0) : (Date.now() - this.base) * 1000; }
  msg(m) {
    if (m.cmd === 'idle') { this.s = null; return; }
    if (m.cmd === 'clock') { this.clk = m.sab ? new Int32Array(m.sab) : null; this.base = Date.now(); return; }
    if (m.cmd === 'step') {
      const blocks = (ms) => Math.max(WIN * 2, Math.round(ms / 1000 * sampleRate / 128));
      this.hist.fill(0); this.base = Date.now();
      this.s = { id: m.id, voices: m.voices, warm: Math.max(1, Math.round(m.warmMs / 1000 * sampleRate / 128)), left: Math.min(blocks(m.measureMs), WIN * MAXWIN), blocks: 0,
        sum: 0, max: 0, over: 0, gap: 0, last: 0, aT: 0, aF: 0, wmin: Infinity, wn: 0, nw: 0, nan: 0 };
    }
  }
  process(_, outs) {
    const s = this.s, t0 = this.now();
    if (!s) return true;
    const v = s.voices > 0 ? this.run(s.voices) : 0;
    const t1 = this.now(), dt = (t1 - t0) | 0;
    if (v !== v) s.nan++;
    this.sink = v;
    if (s.warm > 0) { if (--s.warm === 0) { s.aT = t0; s.aF = currentFrame; s.last = t0; } return true; }
    this.hist[Math.min(BINS - 1, Math.max(0, dt / BIN | 0))]++; s.sum += dt; s.blocks++; if (dt > s.max) s.max = dt; if (dt > this.budget) s.over++;
    const gap = (t0 - s.last) | 0; s.last = t0; if (gap > s.gap) s.gap = gap;
    // lag = wall clock ahead of rendered frames. The hardware buffer makes it saw-tooth, so each window keeps its
    // minimum: that only rises when frames were really lost, and it cannot be fooled by bursts of quanta
    const lag = ((t0 - s.aT) | 0) - (currentFrame - s.aF) / sampleRate * 1e6;
    if (lag < s.wmin) s.wmin = lag;
    if (++s.wn === WIN) { this.wins[s.nw++] = s.wmin; s.wn = 0; s.wmin = Infinity; }
    if (--s.left === 0) this.finish(s);
    return true;
  }
  finish(s) {
    this.s = null;
    const pct = (p) => { const n = Math.ceil(s.blocks * p); let c = 0; for (let i = 0; i < BINS; i++) { c += this.hist[i]; if (c >= n) return i * BIN; } return BINS * BIN; };
    const thr = this.clk ? 1500 : 2500;   // the 1 ms clock quantises each window
    let ref = this.wins[0], glitches = 0, lost = 0;
    for (let i = 1; i < s.nw; i++) { const d = this.wins[i] - ref; if (d > thr) { glitches++; lost += d; ref = this.wins[i]; } else if (d < 0) ref = this.wins[i]; }
    this.port.postMessage({ id: s.id, voices: s.voices, blocks: s.blocks, mean: s.sum / s.blocks, p50: pct(0.5), p99: pct(0.99), p999: pct(0.999),
      max: s.max, over: s.over, gap: s.gap, glitches, lost, nan: s.nan, budget: this.budget, clock: this.clk ? 'sab' : 'date' });
  }
}
registerProcessor('probe-load', Load);

/* a steady 0.25 and the worklet's own view of the platform */
class Tone extends AudioWorkletProcessor {
  constructor() {
    super();
    this.shared = null;
    const simd = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
    let wmem = false; try { wmem = !!new WebAssembly.Memory({ initial: 1, maximum: 2, shared: true }); } catch (e) { wmem = String(e); }
    this.port.onmessage = (e) => { if (e.data.sab) this.shared = new Int32Array(e.data.sab); else this.port.postMessage({ pong: true }); };
    this.port.postMessage({ sab: typeof SharedArrayBuffer, wmem, simd, sr: sampleRate });
  }
  process(_, outs) {
    if (this.shared) Atomics.add(this.shared, 0, 1);
    for (const c of outs[0]) c.fill(0.25);
    return true;
  }
}
registerProcessor('probe-tone', Tone);
