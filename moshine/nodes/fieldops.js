// nodes/fieldops.js — the field operations (config.js OPS), one dispatch per op, ping-ponged buffers.
// Twin of engine-ref.js fieldOp() / lostAt(). Parameters are packed into two vec4s per op.
import { pipeline, computePipeline, dispatch, uniformBuffer, storageBuffer, L, HASH_WGSL, LUMA_WGSL } from '../gpu.js';
import { paintField, paintKey } from '../vectors.js';
import { OP_CODE } from '../config.js';

const WGSL = /* wgsl */`
struct P { blocks: vec2u, size: vec2u, block: u32, op: u32, t: u32, seed: u32, a: vec4f, b: vec4f };
@group(0) @binding(0) var<storage, read> inF: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> outF: array<vec4f>;
@group(0) @binding(2) var<uniform> p: P;
@group(0) @binding(3) var mapT: texture_2d<f32>;
@group(0) @binding(4) var<storage, read> paintF: array<vec4f>;   // R2: painted vectors for op 10 (vectors.js)
${HASH_WGSL}
${LUMA_WGSL}
const TAU = 6.283185307179586;

fn lostAt(bx: u32, by: u32) -> bool {
  let life = max(1u, u32(p.a.z)); let ch = max(1u, u32(p.a.w)); let cw = max(1u, u32(floor(p.a.w * p.b.x)));
  let layers = min(4u, max(1u, u32(p.a.y))); let s = p.seed * 4u + 2u;
  for (var l = 0u; l < layers; l++) {
    let ox = u32(floor(hash3(l, 1u, s) * f32(cw))); let oy = u32(floor(hash3(l, 2u, s) * f32(ch)));
    let cell = ((bx + ox) / cw) * 7919u + (by + oy) / ch;
    let shift = u32(floor(hash3(cell, l, s) * f32(life))); let epoch = (p.t + shift) / life;
    if (hash3(cell, epoch * 4u + l, s) < p.a.x) { return true; }
  }
  return false;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= p.blocks.x || id.y >= p.blocks.y) { return; }
  let bx = id.x; let by = id.y; let bw = p.blocks.x; let bh = p.blocks.y; let i = by * bw + bx;
  let f = inF[i]; var m = f.xy; var fl = u32(f.w);
  let u = (f32(bx) + 0.5) / f32(bw); let v = (f32(by) + 0.5) / f32(bh);
  switch p.op {
    case 10u: { let q = paintF[i]; if (p.a.x > 0.5) { if (q.z >= 0.5) { m = q.xy; } } else { m = m + q.xy; } }
    case 0u: { m = m + p.a.xy; }
    case 1u: { m = m * p.a.xy; }
    case 2u: {
      let cell = max(1u, u32(p.a.y)); let hold = max(1u, u32(p.a.z)); let th = p.t / hold; let cid = (bx / cell) * 7919u + by / cell;
      if (hash3(bx * 7919u + by, p.t, p.seed * 4u + 3u) < p.a.w) { m = inF[min(by + 1u, bh - 1u) * bw + min(bx + 1u, bw - 1u)].xy; }
      m.x = m.x + ((hash3(cid, th, p.seed * 4u) - 0.5) * 2.0) * p.a.x;
      m.y = m.y + ((hash3(cid, th, p.seed * 4u + 1u) - 0.5) * 2.0) * p.a.x;
    }
    case 3u: {
      let r = i32(p.a.x); var s = vec2f(0.0); var n = 0;
      for (var dy = -r; dy <= r; dy++) { for (var dx = -r; dx <= r; dx++) {
        let j = u32(clamp(i32(by) + dy, 0, i32(bh) - 1)) * bw + u32(clamp(i32(bx) + dx, 0, i32(bw) - 1));
        s.x = s.x + inF[j].x; s.y = s.y + inF[j].y; n++;
      } }
      m = s / f32(n);
    }
    case 4u: {
      let shape = u32(p.a.x); var g = 1.0;
      switch shape {
        case 0u: { g = u; } case 1u: { g = v; } case 2u: { g = 1.0 - u; } case 3u: { g = 1.0 - v; }
        case 4u: { g = 0.5 + 0.5 * sin(TAU * (p.a.z * u + p.a.w)); }
        case 5u: { g = 0.5 + 0.5 * sin(TAU * (p.a.z * v + p.a.w)); }
        case 6u: { let dx = u - 0.5; let dy = v - 0.5; g = max(0.0, 1.0 - 2.0 * sqrt(dx * dx + dy * dy)); }
        case 7u: { g = select(0.0, 1.0, u < 0.5); } case 8u: { g = select(0.0, 1.0, u >= 0.5); }
        case 9u: { g = select(0.0, 1.0, v < 0.5); } case 10u: { g = select(0.0, 1.0, v >= 0.5); }
        case 11u: { let c = max(1u, u32(floor(p.a.z + 0.5))); g = select(0.0, 1.0, ((bx / c + by / c) & 1u) == 1u); }
        default: {}
      }
      m = m * ((1.0 - p.a.y) + p.a.y * g);
    }
    case 5u: {
      let kind = u32(p.a.x); let k = p.a.y;
      let px = f32(bx * p.block) + f32(p.block) * 0.5; let py = f32(by * p.block) + f32(p.block) * 0.5;
      let dx = px - p.b.x * f32(p.size.x); let dy = py - p.b.y * f32(p.size.y);
      var sv = vec2f(0.0);
      if (kind == 0u) { sv = vec2f(dx * k, dy * k); }
      else if (kind == 1u || kind == 4u) {
        var a = k;
        if (kind == 4u) { let dm = 0.5 * f32(min(p.size.x, p.size.y)); let d = sqrt(dx * dx + dy * dy); a = (k * 10.0) * max(0.0, 1.0 - d / dm); }
        let c = cos(a); let s = sin(a);
        sv = vec2f(dx - (c * dx + s * dy), dy - (c * dy - s * dx));
      } else if (kind == 2u) { sv.x = (dy * k) * 4.0; }
      else if (kind == 3u) { sv.y = (dx * k) * 4.0; }
      if (p.a.w > 0.5) { m = m + sv * p.a.z; } else { m = m + (sv - m) * p.a.z; }
    }
    case 6u: { if (lostAt(bx, by)) { m = vec2f(0.0); fl = fl | 4u; } }
    case 7u: { if (max(abs(m.x), abs(m.y)) < p.a.x && f.z < p.a.y) { m = vec2f(0.0); fl = fl | 1u; } }
    case 8u: {
      let mb = f.x * f.x + f.y * f.y; let fastest = p.a.z < 0.5; let nb = bw * bh; var rank = 0u;
      for (var j = 0u; j < nb; j++) { let g = inF[j]; let mj = g.x * g.x + g.y * g.y; if ((fastest && mj > mb) || (!fastest && mj < mb) || (mj == mb && j < i)) { rank++; } }
      if (f32(rank) < p.a.x * f32(nb)) { m = m * p.a.y; }
    }
    case 9u: {
      var s = 0.0; var n = 0u;
      for (var y = by * p.block; y < min(p.size.y, by * p.block + p.block); y++) { for (var x = bx * p.block; x < min(p.size.x, bx * p.block + p.block); x++) {
        s = s + lumaOf(textureLoad(mapT, vec2i(i32(x), i32(y)), 0)); n++; } }
      var mm = clamp(((s / f32(n)) - 0.5) * p.a.w + 0.5, 0.0, 1.0); if (p.a.y > 0.5) { mm = 1.0 - mm; }
      m = m * ((1.0 - p.a.x) + p.a.x * mm);
    }
    default: {}
  }
  outF[i] = vec4f(m, f.z, f32(fl));
}`;

const GAIN = ['rampX', 'rampY', 'invX', 'invY', 'sinX', 'sinY', 'radial', 'mirrorL', 'mirrorR', 'mirrorT', 'mirrorB', 'checker'];
const SYN = ['zoom', 'rotate', 'shearX', 'shearY', 'swirl'];
/** Pack one op's parameters into the two vec4s the shader reads. */
export function packOp(o) {
  switch (o.op) {
    case 'pan': return [o.x, o.y, 0, 0, 0, 0, 0, 0];
    case 'multiply': return [o.gx, o.gy, 0, 0, 0, 0, 0, 0];
    case 'noise': return [o.amp, o.cell, o.hold, o.mismatch, 0, 0, 0, 0];
    case 'smooth': return [o.radius, 0, 0, 0, 0, 0, 0, 0];
    case 'gain': return [GAIN.indexOf(o.shape), o.amount, o.freq, o.phase, 0, 0, 0, 0];
    case 'synthetic': return [SYN.indexOf(o.kind), o.strength, o.blend, o.mode === 'add' ? 1 : 0, o.cx, o.cy, 0, 0];
    case 'lost': return [o.density, o.layers, o.life, o.scale, o.aspect, 0, 0, 0];
    case 'skip': return [o.eps, o.mad, 0, 0, 0, 0, 0, 0];
    case 'amplify': return [o.pct, o.gain, o.which === 'slowest' ? 1 : 0, 0, 0, 0, 0, 0];
    case 'map': return [o.amount, o.invert ? 1 : 0, 0, o.contrast, 0, 0, 0, 0];
    case 'paint': return [o.mode === 'replace' ? 1 : 0, 0, 0, 0, 0, 0, 0, 0];
  }
  return [0, 0, 0, 0, 0, 0, 0, 0];
}

/** Field-op runner. encode() applies ops in order: in -> a -> b -> a ...; returns the buffer holding the result. */
export function createFieldOps(gpu, { w, h, block }) {
  const P = pipeline(gpu, 'fieldops', () => computePipeline(gpu, 'fieldops', WGSL, [L.ro(0), L.rw(1), L.uni(2), L.tex(3), L.ro(4)]));
  const bw = Math.ceil(w / block), bh = Math.ceil(h / block), unis = [], paints = []; let dt = null;
  const noPaint = storageBuffer(gpu, 16, 'fieldops no paint');
  /** The painted field for op k, uploaded when its strokes, amount or mode change. */
  const paintBuf = (k, o) => {
    let b = paints[k]; const key = paintKey(o, { w, h, block });
    if (!b) { b = paints[k] = { buf: storageBuffer(gpu, bw * bh * 16, 'paint ' + k), key: null }; }
    if (b.key !== key) { gpu.device.queue.writeBuffer(b.buf, 0, paintField(o, { w, h, block })); b.key = key; }
    return b.buf;
  };
  const dummyTex = () => (dt ||= gpu.device.createTexture({ size: [1, 1], format: 'rgba16float', usage: GPUTextureUsage.TEXTURE_BINDING }));
  return {
    /** maps: { src, src2 } textures for the mosh-map op (any texture is bound when there is no map op). */
    encode(enc, input, bufs, ops, { t, seed, src = null, src2 = null }) {
      let cur = input;
      while (unis.length < ops.length) unis.push(uniformBuffer(gpu, 64, 'fieldop uniform'));
      ops.forEach((o, k) => {
        const u = new ArrayBuffer(64), U32 = new Uint32Array(u), F32 = new Float32Array(u);
        U32.set([bw, bh, w, h, block, OP_CODE[o.op], t, seed]); F32.set(packOp(o), 8);
        gpu.device.queue.writeBuffer(unis[k], 0, u);
        const out = bufs[k % 2];
        const map = o.op === 'map' ? (o.from === 'source' ? src : src2 || src) : src2 || src || dummyTex();
        dispatch(gpu, enc, P, [cur, out, unis[k], map, o.op === 'paint' ? paintBuf(k, o) : noPaint], Math.ceil(bw / 8), Math.ceil(bh / 8), 'fieldop ' + o.op); cur = out;
      });
      return cur;
    },
    destroy() { unis.forEach((b) => b.destroy()); paints.forEach((b) => b?.buf.destroy()); noPaint.destroy(); if (dt) dt.destroy(); },
  };
}
