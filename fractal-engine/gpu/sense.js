// The sensing pass: rays from the camera, each marched to the surface, where the dual-number orbit
// gives, for every parameter of the formula, how fast the surface moves along its normal:
// (∂DE/∂θ) / |∇DE|. Divided by the pixel footprint at that depth it is a speed in pixels per unit of
// θ. Over a grid of the whole view its RMS is the parameter's metric (a control reparameterised by it
// moves the image by the same number of pixels per unit of hand motion); over a few rays under the
// cursor it says which op dominates there — attention editing.
//
// The same pass returns the Lyapunov exponent at every hit: its median centres the λ colour scale,
// and around the cursor it draws the reticle's ticks.

//
// A collage's pass (COLLAGE_SENSE, senseCollage below) spends one march per ray, not one per row. The rays
// march once; at a hit every piece runs its dual orbit once. Then one more orbit per row: a piece's op or driver
// parameter, in that piece's region alone. The placements, repetitions and joins need no orbit of their own:
// core/collage-sense.js takes the pieces' values and gradients through them by the chain rule. The drive's
// values at the hit come back too, with their gradients by central differences (a world field's are smooth, and
// a difference of the drive costs no orbit).

import { INTERP, DUAL, COLLAGE, withDrive, withCollage } from './wgsl.js';
import { paramTangents, pack, shapes, drives, packCollage, collageSenseRows, CS_ROW_FLOATS } from './pack.js';
import { normalize } from '../core/formula.js';
import { normCollage } from '../core/collage.js';
import { readCollageSense, CS_RAY, CS_PIECE, CS_VALUES, CS_DVALUES } from '../core/collage-sense.js';

const SENSE = INTERP + DUAL + /* wgsl */ `
struct SV {
  pos: vec4f,    // xyz camera, w tan(fov/2)
  right: vec4f,  // xyz, w aspect
  up: vec4f,     // xyz, w max distance
  fwd: vec4f,    // xyz, w step scale
  tune: vec4f,   // x pixel rows (for the hit threshold), y max steps, z epsilon scale, w ray count
};
@group(1) @binding(0) var<uniform> sv: SV;
@group(1) @binding(1) var<storage, read> tans: array<vec4f>;
@group(1) @binding(2) var<storage, read_write> outp: array<vec4f>;
@group(1) @binding(3) var<storage, read> uvs: array<vec2f>;

@compute @workgroup_size(64)
fn sense(@builtin(global_invocation_id) gid: vec3u) {
  let n = u32(sv.tune.w);
  let i = gid.x;
  if (i >= n) { return; }
  let j = gid.y;
  tanSelect(tans[j * 6u]);
  for (var k = 0u; k < 5u; k++) { tanRec[k] = tans[j * 6u + 1u + k]; }
  let uv = uvs[i];
  let th = sv.pos.w;
  let rd = normalize(sv.fwd.xyz + sv.right.xyz * uv.x * th * sv.right.w - sv.up.xyz * uv.y * th);
  let pixelAngle = 2.0 * th / sv.tune.x;
  let unsafeScale = select(1.0, 0.3, (head.flags & FLAG_UNSAFE) != 0u);
  var t = 0.0;
  var hit = false;
  for (var s = 0; s < i32(sv.tune.y); s++) {
    let d = de(sv.pos.xyz + rd * t) * sv.fwd.w * unsafeScale * drvStep();
    if (d < max(t * pixelAngle * sv.tune.z, 1e-6)) { hit = true; break; }
    t = t + d;
    if (t > sv.up.w) { break; }
  }
  let o = j * n + i;
  if (!hit) { outp[o] = vec4f(t, 0.0, 0.0, 0.0); return; }
  let p = sv.pos.xyz + rd * t;
  let p4 = embed(p);
  let d = iterateDual(p4, cFor(p4), (head.flags & FLAG_JULIA) == 0u);
  let g = length(deGrad(d));
  outp[o] = vec4f(t, deParamTan(d), d.lyap, max(g, 1e-12));
}
`;

export const COLLAGE_SENSE = withCollage(INTERP + DUAL) + COLLAGE + /* wgsl */ `
fn clFallback(i: u32, col: f32, facing: f32) -> vec4f { return vec4f(1.0); }
const CS_RAY = ${CS_RAY}u;
const CS_ROW = ${CS_ROW_FLOATS / 4}u;
struct SV {
  pos: vec4f,    // xyz camera, w tan(fov/2)
  right: vec4f,  // xyz, w aspect
  up: vec4f,     // xyz, w max distance
  fwd: vec4f,    // xyz, w step scale
  tune: vec4f,   // x pixel rows, y max steps, z epsilon scale, w ray count
  mode: vec4u,   // x 0 the rays and their hits, 1 the rows
};
@group(1) @binding(0) var<uniform> sv: SV;
@group(1) @binding(1) var<storage, read> tans: array<vec4f>;
@group(1) @binding(2) var<storage, read_write> outp: array<vec4f>;
@group(1) @binding(3) var<storage, read> uvs: array<vec2f>;

fn csDir(i: u32) -> vec3f {
  let uv = uvs[i];
  let th = sv.pos.w;
  return normalize(sv.fwd.xyz + sv.right.xyz * uv.x * th * sv.right.w - sv.up.xyz * uv.y * th);
}

// piece i's dual orbit at world point x, its row selected (the one call site). Leaves the piece selected.
fn csDual(i: u32, x: vec3f, sel: vec4f) -> Dual {
  let P = clPlace(i);
  let v = clFold(P.A, P.B, ((x - P.t) * P.R) / P.s);
  clSelect(i);
  tanSelect(sel);
  let q = embed(v);
  return iterateDual(q, cFor(q), (heads[hp].flags & FLAG_JULIA) == 0u);
}

fn csRay(i: u32) {
  let rd = csDir(i);
  let pixelAngle = 2.0 * sv.pos.w / sv.tune.x;
  let k = clStep();
  var t = 0.0;
  var hit = false;
  for (var s = 0; s < i32(sv.tune.y); s++) {
    let d = de(sv.pos.xyz + rd * t) * sv.fwd.w * k;
    if (d < max(t * pixelAngle * sv.tune.z, 1e-6)) { hit = true; break; }
    t = t + d;
    if (t > sv.up.w) { break; }
  }
  let o = i * CS_RAY;
  outp[o] = vec4f(t, select(0.0, 1.0, hit), 0.0, 0.0);
  if (!hit) { return; }
  let x = sv.pos.xyz + rd * t;
  clDrive(x);
  let nb = clNB;
  for (var b = 0u; b < nb; b++) { outp[o + ${CS_VALUES}u + b / 4u][b % 4u] = clV[b]; }
  if (nb > 0u) {
    let h = 1e-3 * max(1.0, length(x));
    for (var a = 0u; a < 3u; a++) {
      var e = vec3f(0.0);
      e[a] = h;
      clDrive(x + e);
      var hi = clV;
      clDrive(x - e);
      for (var b = 0u; b < nb; b++) { outp[o + ${CS_DVALUES}u + a * 4u + b / 4u][b % 4u] = (hi[b] - clV[b]) / (2.0 * h); }
    }
    clDrive(x);
  }
  let np = min(u32(ops[CL_BASE].x), CL_MAXP);
  for (var p = 0u; p < np; p++) {
    let d = csDual(p, x, vec4f(0.0, 5.0, 0.0, 0.0));
    outp[o + ${CS_PIECE}u + 2u * p] = vec4f(deGrad(d), deOf(d.t));
    outp[o + ${CS_PIECE}u + 2u * p + 1u] = vec4f(d.lyap, 0.0, 0.0, 0.0);
  }
}

// one row at one ray: its piece's dual, the parameter's column selected
fn csRow(i: u32, j: u32, n: u32) {
  let r = outp[i * CS_RAY];
  if (r.y < 0.5) { return; }
  let x = sv.pos.xyz + csDir(i) * r.x;
  clDrive(x);
  let at = j * CS_ROW;
  for (var k = 0u; k < 5u; k++) { tanRec[k] = tans[at + 2u + k]; }
  let d = csDual(u32(tans[at].x), x, tans[at + 1u]);
  outp[n * CS_RAY + j * n + i] = vec4f(deGrad(d), deParamTan(d));
}

@compute @workgroup_size(64)
fn csense(@builtin(global_invocation_id) gid: vec3u) {
  let n = u32(sv.tune.w);
  if (gid.x >= n) { return; }
  if (sv.mode.x == 0u) { csRay(gid.x); } else { csRow(gid.x, gid.y, n); }
}
`;

export function gridUVs(cols, rows) {
  const uv = new Float32Array(cols * rows * 2);
  for (let i = 0; i < cols * rows; i++) {
    uv[i * 2] = ((i % cols) + 0.5) / cols * 2 - 1;
    uv[i * 2 + 1] = (Math.floor(i / cols) + 0.5) / rows * 2 - 1;
  }
  return uv;
}

export async function createSense(R, { cols = 32, rows = 20 } = {}) {
  const { device, headBuf, opsBuf, formulaLayout } = R;
  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    ],
  });
  const module = device.createShaderModule({ code: SENSE });
  const errs = (await module.getCompilationInfo()).messages.filter((m) => m.type === 'error');
  if (errs.length) throw new Error('wgsl: ' + errs.map((m) => `${m.lineNum}:${m.linePos} ${m.message}`).join('\n'));
  const pipe = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [formulaLayout, layout] }),
    compute: { module, entryPoint: 'sense' },
  });
  const formulaGroup = device.createBindGroup({
    layout: formulaLayout,
    entries: [{ binding: 0, resource: { buffer: headBuf } }, { binding: 1, resource: { buffer: opsBuf } }],
  });
  const svBuf = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const grid = gridUVs(cols, rows);

  // One pass at a time; a caller asking while one runs gets null.
  let busy = false;
  // v: { pos, right, up, fwd, tanHalfFov, aspect, maxDist, stepScale, maxSteps, epsScale }
  // uvs: ray directions as NDC pairs (x right, y down), default the whole-view grid
  // returns { params: [{ oi, op, key, value, pxPerUnit }] (bound parameters left out), driveParams:
  //   [{ drive (a core/drive.js ref), value, pxPerUnit }], step (the drivers' step factor L), rays: [{ uv, hit, t, x, grad, lambda,
  //   speeds }], lyap: { median, p10, p90 }, hits, points, pixelAngle }
  // speeds are in units of pixelHeight (pass CSS pixels for hand motion)
  // other: the formula is not the one on screen — upload it for this pass and give the buffers back
  async function sense(formula, v, pixelHeight, uvs = grid, other = false) {
    if (busy) return null;
    busy = true;
    try {
      const normalized = normalize(formula);
      // a driven formula senses in the drivers' variant (compiled once, in the background)
      const sensePipe = shapes(normalized) ? (await R.variant.ready('sense', withDrive(SENSE), [formulaLayout, layout], 'sense')) || pipe : pipe;
      if (other) { const pk = pack(formula); device.queue.writeBuffer(headBuf, 0, pk.head); device.queue.writeBuffer(opsBuf, 0, pk.ops); }
      // with drivers: their parameters too, and the frozen row (every driver held) for the step factor
      const tg = paramTangents(formula, { frozen: true });
      const nRows = Math.max(1, tg.list.length);
      const n = uvs.length / 2;
      const mk = (size, usage) => device.createBuffer({ size, usage });
      const tanBuf = mk(tg.buf.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
      const uvBuf = mk(Math.max(16, uvs.byteLength), GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
      const outBuf = mk(n * nRows * 16, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
      const readBuf = mk(n * nRows * 16, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
      device.queue.writeBuffer(tanBuf, 0, tg.buf);
      device.queue.writeBuffer(uvBuf, 0, uvs);
      device.queue.writeBuffer(svBuf, 0, new Float32Array([
        ...v.pos, v.tanHalfFov, ...v.right, v.aspect, ...v.up, v.maxDist, ...v.fwd, v.stepScale,
        pixelHeight, v.maxSteps, v.epsScale, n,
      ]));
      const group = device.createBindGroup({
        layout,
        entries: [tanBuf, outBuf, uvBuf].map((b, i) => ({ binding: [1, 2, 3][i], resource: { buffer: b } }))
          .concat([{ binding: 0, resource: { buffer: svBuf } }]),
      });
      const enc = device.createCommandEncoder();
      const cp = enc.beginComputePass();
      cp.setPipeline(sensePipe);
      cp.setBindGroup(0, formulaGroup);
      cp.setBindGroup(1, group);
      cp.dispatchWorkgroups(Math.ceil(n / 64), nRows);
      cp.end();
      enc.copyBufferToBuffer(outBuf, 0, readBuf, 0, n * nRows * 16);
      device.queue.submit([enc.finish()]);
      if (other && R.packed) { device.queue.writeBuffer(headBuf, 0, R.packed.head); device.queue.writeBuffer(opsBuf, 0, R.packed.ops); }
      await readBuf.mapAsync(GPUMapMode.READ);
      const o = new Float32Array(readBuf.getMappedRange().slice(0));
      readBuf.unmap();
      [tanBuf, uvBuf, outBuf, readBuf].forEach((b) => b.destroy());

      // the pixel footprint at depth t: t · (2 tan(fov/2) / pixel height)
      const pixelAngle = (2 * v.tanHalfFov) / pixelHeight;
      const rays = [];
      for (let i = 0; i < n; i++) {
        const uv = [uvs[i * 2], uvs[i * 2 + 1]];
        const hit = o[i * 4 + 3] > 0;
        const t = o[i * 4];
        const d = [0, 1, 2].map((k) => v.fwd[k] + v.right[k] * uv[0] * v.tanHalfFov * v.aspect - v.up[k] * uv[1] * v.tanHalfFov);
        const l = Math.hypot(...d);
        const ray = { uv, hit, t, x: [0, 1, 2].map((k) => v.pos[k] + (d[k] / l) * t), grad: o[i * 4 + 3], lambda: o[i * 4 + 2], speeds: [] };
        if (hit) {
          ray.speeds = tg.list.map((_, j) => {
            const k = (j * n + i) * 4;
            const s = o[k + 1] / o[k + 3] / (t * pixelAngle);
            return Number.isFinite(s) ? s : 0;
          });
        }
        rays.push(ray);
      }
      const hits = rays.filter((r) => r.hit);
      const rms = (j) => { let sum = 0; for (const r of hits) sum += r.speeds[j] * r.speeds[j]; return Math.sqrt(sum / Math.max(hits.length, 1)); };
      const params = [], driveParams = [];
      tg.list.forEach((t, j) => {
        if (t.drec) params.push({ oi: t.oi, op: t.op, key: t.key, value: t.value, pxPerUnit: rms(j) });
        else if (t.drive) driveParams.push({ drive: t.drive, value: t.value, pxPerUnit: rms(j) });
      });
      // The step factor L: how much steeper the driven estimate is than the same estimate with its
      // drivers held, |∇DE| / |∇DE held| at every hit — the measured form of 1 + Σ |∂DE/∂θ|·|∇θ|. The
      // raymarch divides its steps by the 90th percentile (one L per frame; gpu/render.js setStep).
      let step = 1;
      const fj = tg.list.findIndex((t) => t.frozen);
      if (fj > 0) {
        const L = [];
        for (let i = 0; i < n; i++) {
          const g = o[i * 4 + 3], g0 = o[(fj * n + i) * 4 + 3];
          if (g > 0 && g0 > 0 && rays[i].hit) L.push(Math.max(1, g / g0));
        }
        L.sort((a, b) => a - b);
        step = Math.min(16, L.length ? L[Math.floor(L.length * 0.9)] : 1);
      }
      const lam = hits.map((r) => r.lambda).sort((a, b) => a - b);
      const q = (f) => lam[Math.min(lam.length - 1, Math.floor(lam.length * f))] ?? 0;
      return {
        params, driveParams, step, rays, lyap: { median: q(0.5), p10: q(0.1), p90: q(0.9) }, hits: hits.length,
        points: hits.map((r) => ({ t: r.t, x: r.x, grad: r.grad })), pixelAngle,
      };
    } finally {
      busy = false;
    }
  }

  // ---------- a collage ----------------------------------------------------------------------------
  // its pipeline, once it has compiled (compiling in the background from the first ask, the CPU's pass stands
  // in until then: app.js senseDoc). One shader per drive-ness: every number comes from the buffers.
  const collageKey = (c) => {
    const d = normCollage(c).pieces.some((q) => drives(q.f));
    return [d ? 'csense+drive' : 'csense', d ? withDrive(COLLAGE_SENSE) : COLLAGE_SENSE, [formulaLayout, layout], 'csense'];
  };
  const collageReady = (c) => !!R.variant(...collageKey(c));
  const collageCompile = (c) => R.variant.ready(...collageKey(c));
  const csBufs = [0, 1].map(() => device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));

  // gpu/sense.js's shape for a collage (core/collage-sense.js readCollageSense), params: false for hits, the
  // normals and λ alone (no rows). other: not the collage on screen — upload it for this pass and give the
  // buffers back. null while another pass runs or the pipeline compiles.
  // time: the clock the heads carry (the collage's own drive is differentiated at it, core/collage-sense.js)
  async function senseCollage(collage, v, pixelHeight, uvs = grid, { other = false, params = true, time = R.clock || 0 } = {}) {
    if (busy) return null;
    const pipeC = R.variant(...collageKey(collage));
    if (!pipeC) return null;
    busy = true;
    try {
      const c = normCollage(collage);
      if (other) { const pk = packCollage(c); R.driveWords(pk.head); device.queue.writeBuffer(headBuf, 0, pk.head); device.queue.writeBuffer(opsBuf, 0, pk.ops); }
      const tg = params ? collageSenseRows(c) : { list: [], buf: new Float32Array(CS_ROW_FLOATS) };
      const n = uvs.length / 2, nRows = tg.list.length, size = (CS_RAY * n + n * nRows) * 16;
      const mk = (bytes, usage) => device.createBuffer({ size: bytes, usage });
      const tanBuf = mk(tg.buf.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
      const uvBuf = mk(Math.max(16, uvs.byteLength), GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
      const outBuf = mk(size, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
      const readBuf = mk(size, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
      device.queue.writeBuffer(tanBuf, 0, tg.buf);
      device.queue.writeBuffer(uvBuf, 0, uvs);
      const sv = new ArrayBuffer(96);
      new Float32Array(sv).set([...v.pos, v.tanHalfFov, ...v.right, v.aspect, ...v.up, v.maxDist, ...v.fwd, v.stepScale, pixelHeight, v.maxSteps, v.epsScale, n]);
      const groups = csBufs.map((b, mode) => {
        new Uint32Array(sv)[20] = mode;
        device.queue.writeBuffer(b, 0, sv);
        return device.createBindGroup({ layout, entries: [b, tanBuf, outBuf, uvBuf].map((buffer, i) => ({ binding: i, resource: { buffer } })) });
      });
      const enc = device.createCommandEncoder();
      const cp = enc.beginComputePass();
      cp.setPipeline(pipeC);
      cp.setBindGroup(0, formulaGroup);
      cp.setBindGroup(1, groups[0]);
      cp.dispatchWorkgroups(Math.ceil(n / 64));
      if (nRows) { cp.setBindGroup(1, groups[1]); cp.dispatchWorkgroups(Math.ceil(n / 64), nRows); }
      cp.end();
      enc.copyBufferToBuffer(outBuf, 0, readBuf, 0, size);
      device.queue.submit([enc.finish()]);
      if (other && R.packed) { device.queue.writeBuffer(headBuf, 0, R.packed.head); device.queue.writeBuffer(opsBuf, 0, R.packed.ops); }
      await readBuf.mapAsync(GPUMapMode.READ);
      const o = new Float32Array(readBuf.getMappedRange().slice(0));
      readBuf.unmap();
      [tanBuf, uvBuf, outBuf, readBuf].forEach((b) => b.destroy());
      return { ...readCollageSense(c, v, pixelHeight, uvs, o, tg.list, { params, time }), gpu: true };
    } finally {
      busy = false;
    }
  }
  return { sense, senseCollage, collageReady, collageCompile, cols, rows };
}
