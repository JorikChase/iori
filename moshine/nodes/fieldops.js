// nodes/fieldops.js — the field operations (config.js OPS), one dispatch per op, ping-ponged buffers.
// Twin of engine-ref.js fieldOp() / lostAt(). Parameters are packed into two vec4s per op.
import { pipeline, computePipeline, dispatch, uniformBuffer, storageBuffer, L, HASH_WGSL, LUMA_WGSL } from '../gpu.js';
import { FIXED_WGSL, fieldOpQ } from '../fixed.js';
import { paintField } from '../vectors.js';
import { OP_CODE } from '../config.js';

// M8 (2026-10-11): integer arithmetic only (fixed.js), so every browser's compiler gives the same bits. Vectors are
// worked in 1/64 px; gain, synthetic and painted vectors come as a per-block table made in JavaScript (dmath.js).
// A block an op leaves alone keeps its exact input value.
const WGSL = /* wgsl */`
struct P { blocks: vec2u, size: vec2u, block: u32, op: u32, t: u32, seed: u32, a: vec4f, b: vec4f };
@group(0) @binding(0) var<storage, read> inF: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> outF: array<vec4f>;
@group(0) @binding(2) var<uniform> p: P;
@group(0) @binding(3) var mapT: texture_2d<f32>;
@group(0) @binding(4) var<storage, read> tab: array<vec4f>;    // per-block table: gain (q12), synthetic or painted vectors (VU)
${HASH_WGSL}
${LUMA_WGSL}
${FIXED_WGSL}
fn ai(k: u32) -> i32 { if (k < 4u) { return i32(p.a[k]); } return i32(p.b[k - 4u]); }

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
fn mulQ(m: vec2i, f: i32, sh: i32) -> vec2i { return vec2i(fdiv(m.x * f + (sh >> 1u), sh), fdiv(m.y * f + (sh >> 1u), sh)); }

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= p.blocks.x || id.y >= p.blocks.y) { return; }
  let bx = id.x; let by = id.y; let bw = p.blocks.x; let bh = p.blocks.y; let i = by * bw + bx;
  let f = inF[i]; var fl = u32(f.w); var out = f.xy; let mi = vec2i(vq(f.x), vq(f.y));
  switch p.op {
    case 10u: { let q = tab[i]; if (ai(0u) == 1) { if (q.z > 0.5) { out = fromVU(vec2i(q.xy)); } } else { out = fromVU(mi + vec2i(q.xy)); } }
    case 0u: { out = fromVU(mi + vec2i(ai(0u), ai(1u))); }
    case 1u: { out = fromVU(vec2i(mulQ(vec2i(mi.x, 0), ai(0u), 1024).x, mulQ(vec2i(mi.y, 0), ai(1u), 1024).x)); }
    case 2u: {
      let cell = u32(ai(1u)); let hold = u32(ai(2u)); let th = p.t / hold; let cid = (bx / cell) * 7919u + by / cell;
      var m = mi;
      if (hash3(bx * 7919u + by, p.t, p.seed * 4u + 3u) < p.a.w) { let g = inF[min(by + 1u, bh - 1u) * bw + min(bx + 1u, bw - 1u)]; m = vec2i(vq(g.x), vq(g.y)); }
      let amp = ai(0u);
      m.x = m.x + fdiv((2 * h12(cid, th, p.seed * 4u) + 1 - 4096) * amp, 4096);
      m.y = m.y + fdiv((2 * h12(cid, th, p.seed * 4u + 1u) + 1 - 4096) * amp, 4096);
      out = fromVU(m);
    }
    case 3u: {
      let r = ai(0u); var s = vec2i(0); var n = 0;
      for (var dy = -r; dy <= r; dy++) { for (var dx = -r; dx <= r; dx++) {
        let g = inF[u32(clamp(i32(by) + dy, 0, i32(bh) - 1)) * bw + u32(clamp(i32(bx) + dx, 0, i32(bw) - 1))];
        s = s + vec2i(vq(g.x), vq(g.y)); n++;
      } }
      out = fromVU(vec2i(rdiv(s.x, n), rdiv(s.y, n)));
    }
    case 4u: { out = fromVU(mulQ(mi, i32(tab[i].x), 4096)); }
    case 5u: {
      let sv = vec2i(tab[i].xy); let bq = ai(0u);
      if (ai(1u) == 1) { out = fromVU(mi + mulQ(sv, bq, 4096)); } else { out = fromVU(mi + mulQ(sv - mi, bq, 4096)); }
    }
    case 6u: { if (lostAt(bx, by)) { out = vec2f(0.0); fl = fl | 4u; } }
    case 7u: { if (max(abs(f.x), abs(f.y)) < p.a.x && f.z < p.a.y) { out = vec2f(0.0); fl = fl | 1u; } }
    case 8u: {
      // rank by |mv|^2 in quarter pixels (integers: exact everywhere), ties by index
      let qb = vec2i(clamp(i32(floor(f.x * 4.0 + 0.5)), -8191, 8191), clamp(i32(floor(f.y * 4.0 + 0.5)), -8191, 8191)); let mb = qb.x * qb.x + qb.y * qb.y;
      let fastest = ai(2u) == 0; let nb = bw * bh; var rank = 0u;
      for (var j = 0u; j < nb; j++) { let g = inF[j]; let qj = vec2i(clamp(i32(floor(g.x * 4.0 + 0.5)), -8191, 8191), clamp(i32(floor(g.y * 4.0 + 0.5)), -8191, 8191)); let mj = qj.x * qj.x + qj.y * qj.y;
        if ((fastest && mj > mb) || (!fastest && mj < mb) || (mj == mb && j < i)) { rank++; } }
      if (f32(rank) < p.a.x * f32(nb)) { out = fromVU(mulQ(mi, ai(1u), 1024)); }
    }
    case 9u: {
      var s = 0; var n = 0;
      for (var y = by * p.block; y < min(p.size.y, by * p.block + p.block); y++) { for (var x = bx * p.block; x < min(p.size.x, bx * p.block + p.block); x++) {
        s = s + i32(lumaOf(textureLoad(mapT, vec2i(i32(x), i32(y)), 0)) * 32768.0); n++; } }
      var mm = clamp(rdiv((rdiv(s, n) - 16384) * ai(3u), 32768) + 2048, 0, 4096); if (ai(1u) == 1) { mm = 4096 - mm; }
      let a = ai(0u); out = fromVU(mulQ(mi, (4096 - a) + rdiv(a * mm, 4096), 4096));
    }
    default: {}
  }
  outF[i] = vec4f(out, f.z, f32(fl));
}`;

/** Pack one op's parameters into the two vec4s the shader reads (fixed.js fieldOpQ: integers where the kernel computes). */
export function packOp(o, geo, paint = null) { return fieldOpQ(o, geo, paint); }

/** Field-op runner. encode() applies ops in order: in -> a -> b -> a ...; returns the buffer holding the result. */
export function createFieldOps(gpu, { w, h, block }) {
  const P = pipeline(gpu, 'fieldops', () => computePipeline(gpu, 'fieldops', WGSL, [L.ro(0), L.rw(1), L.uni(2), L.tex(3), L.ro(4)]));
  const bw = Math.ceil(w / block), bh = Math.ceil(h / block), unis = [], tabs = []; let dt = null;
  const noTab = storageBuffer(gpu, 16, 'fieldops no table'), geo = { w, h, block };
  /** Op k's integer params and table; the table is made and uploaded only when the op's values change. */
  const prep = (k, o) => {
    const key = JSON.stringify(o); let T = tabs[k];
    if (T && T.key === key) return T;
    const q = fieldOpQ(o, geo, o.op === 'paint' ? paintField(o, geo) : null);
    if (q.table) { if (!T?.buf) T = { buf: storageBuffer(gpu, bw * bh * 16, 'fieldop table ' + k) }; gpu.device.queue.writeBuffer(T.buf, 0, q.table); }
    else if (!T) T = {};
    T.key = key; T.a = q.a; T.has = !!q.table; return (tabs[k] = T);
  };
  const dummyTex = () => (dt ||= gpu.device.createTexture({ size: [1, 1], format: 'rgba16float', usage: GPUTextureUsage.TEXTURE_BINDING }));
  return {
    /** maps: { src, src2 } textures for the mosh-map op (any texture is bound when there is no map op). */
    encode(enc, input, bufs, ops, { t, seed, src = null, src2 = null }) {
      let cur = input;
      while (unis.length < ops.length) unis.push(uniformBuffer(gpu, 64, 'fieldop uniform'));
      ops.forEach((o, k) => {
        const T = prep(k, o), u = new ArrayBuffer(64), U32 = new Uint32Array(u), F32 = new Float32Array(u);
        U32.set([bw, bh, w, h, block, OP_CODE[o.op], t, seed]); F32.set(T.a, 8);
        gpu.device.queue.writeBuffer(unis[k], 0, u);
        const out = bufs[k % 2];
        const map = o.op === 'map' ? (o.from === 'source' ? src : src2 || src) : src2 || src || dummyTex();
        dispatch(gpu, enc, P, [cur, out, unis[k], map, T.has ? T.buf : noTab], Math.ceil(bw / 8), Math.ceil(bh / 8), 'fieldop ' + o.op); cur = out;
      });
      return cur;
    },
    destroy() { unis.forEach((b) => b.destroy()); tabs.forEach((T) => T?.buf?.destroy()); noTab.destroy(); if (dt) dt.destroy(); },
  };
}
