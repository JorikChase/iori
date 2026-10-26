// The sensing pass: a sparse grid of rays from the camera, each marched to the surface, where the
// dual-number orbit gives, for every parameter of the formula, how fast the surface moves along its
// normal: (∂DE/∂θ) / |∇DE|. Divided by the pixel footprint at that depth it is a speed in pixels per
// unit of θ; its RMS over the grid is the parameter's metric. A control reparameterised by it moves
// the image by the same number of pixels per unit of hand motion, calm or chaotic.
//
// The same pass returns the Lyapunov exponent at every hit, whose median centres the λ colour scale.

import { INTERP, DUAL } from './wgsl.js';
import { paramTangents, TAN_FLOATS } from './pack.js';

const SENSE = INTERP + DUAL + /* wgsl */ `
struct SV {
  pos: vec4f,    // xyz camera, w tan(fov/2)
  right: vec4f,  // xyz, w aspect
  up: vec4f,     // xyz, w max distance
  fwd: vec4f,    // xyz, w step scale
  grid: vec4f,   // x columns, y rows, z max steps, w epsilon scale
};
@group(1) @binding(0) var<uniform> sv: SV;
@group(1) @binding(1) var<storage, read> tans: array<vec4f>;
@group(1) @binding(2) var<storage, read_write> outp: array<vec4f>;

@compute @workgroup_size(64)
fn sense(@builtin(global_invocation_id) gid: vec3u) {
  let cols = u32(sv.grid.x);
  let rows = u32(sv.grid.y);
  let i = gid.x;
  if (i >= cols * rows) { return; }
  let j = gid.y;
  tanOi = u32(tans[j * 5u].x);
  for (var k = 0u; k < 4u; k++) { tanRec[k] = tans[j * 5u + 1u + k]; }
  let uv = (vec2f(f32(i % cols), f32(i / cols)) + 0.5) / vec2f(f32(cols), f32(rows)) * 2.0 - 1.0;
  let th = sv.pos.w;
  let rd = normalize(sv.fwd.xyz + sv.right.xyz * uv.x * th * sv.right.w - sv.up.xyz * uv.y * th);
  let pixelAngle = 2.0 * th / f32(rows);
  let unsafeScale = select(1.0, 0.3, (head.flags & FLAG_UNSAFE) != 0u);
  var t = 0.0;
  var hit = false;
  for (var s = 0; s < i32(sv.grid.z); s++) {
    let d = de(sv.pos.xyz + rd * t) * sv.fwd.w * unsafeScale;
    if (d < max(t * pixelAngle * sv.grid.w * 0.05, 1e-6)) { hit = true; break; }
    t = t + d;
    if (t > sv.up.w) { break; }
  }
  let o = j * cols * rows + i;
  if (!hit) { outp[o] = vec4f(t, 0.0, 0.0, 0.0); return; }
  let p = sv.pos.xyz + rd * t;
  let d = iterateDual(p, cFor(p), (head.flags & FLAG_JULIA) == 0u);
  let g = length(deGrad(d));
  outp[o] = vec4f(t, deTan(d.t, d.q, d.qdr), d.lyap, max(g, 1e-12));
}
`;

export async function createSense(R, { cols = 32, rows = 20 } = {}) {
  const { device, headBuf, opsBuf, formulaLayout } = R;
  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
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

  let busy = false;
  // v: { pos, right, up, fwd, tanHalfFov, aspect, maxDist, stepScale, maxSteps, epsScale }
  // returns { params: [{ oi, op, key, value, pxPerUnit, hits }], lyap: { median, p10, p90 }, hits }
  // pixel speeds are in the units of pixelHeight (pass CSS pixels for hand motion)
  async function sense(formula, v, pixelHeight) {
    if (busy) return null;
    busy = true;
    try {
      const tg = paramTangents(formula);
      const nRows = Math.max(1, tg.list.length);
      const n = cols * rows;
      const tanBuf = device.createBuffer({ size: tg.buf.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      const outBuf = device.createBuffer({ size: n * nRows * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
      const readBuf = device.createBuffer({ size: n * nRows * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(tanBuf, 0, tg.buf);
      device.queue.writeBuffer(svBuf, 0, new Float32Array([
        ...v.pos, v.tanHalfFov, ...v.right, v.aspect, ...v.up, v.maxDist, ...v.fwd, v.stepScale,
        cols, rows, v.maxSteps, v.epsScale,
      ]));
      const group = device.createBindGroup({
        layout,
        entries: [{ binding: 0, resource: { buffer: svBuf } }, { binding: 1, resource: { buffer: tanBuf } }, { binding: 2, resource: { buffer: outBuf } }],
      });
      const enc = device.createCommandEncoder();
      const cp = enc.beginComputePass();
      cp.setPipeline(pipe);
      cp.setBindGroup(0, formulaGroup);
      cp.setBindGroup(1, group);
      cp.dispatchWorkgroups(Math.ceil(n / 64), nRows);
      cp.end();
      enc.copyBufferToBuffer(outBuf, 0, readBuf, 0, n * nRows * 16);
      device.queue.submit([enc.finish()]);
      await readBuf.mapAsync(GPUMapMode.READ);
      const o = new Float32Array(readBuf.getMappedRange().slice(0));
      readBuf.unmap();
      [tanBuf, outBuf, readBuf].forEach((b) => b.destroy());

      // the pixel footprint at depth t: t · (2 tan(fov/2) / pixel height)
      const pixelAngle = (2 * v.tanHalfFov) / pixelHeight;
      const hitsAt = [];
      const lam = [];
      for (let i = 0; i < n; i++) if (o[i * 4 + 3] > 0) { hitsAt.push(i); lam.push(o[i * 4 + 2]); }
      const params = tg.list.map((t, j) => {
        let sum = 0;
        for (const i of hitsAt) {
          const k = (j * n + i) * 4;
          const speed = o[k + 1] / o[k + 3] / (o[k] * pixelAngle);
          if (Number.isFinite(speed)) sum += speed * speed;
        }
        return { oi: t.oi, op: t.op, key: t.key, value: t.value, pxPerUnit: Math.sqrt(sum / Math.max(hitsAt.length, 1)) };
      });
      lam.sort((a, b) => a - b);
      const q = (f) => lam[Math.min(lam.length - 1, Math.floor(lam.length * f))] ?? 0;
      // the hit points themselves, so a caller can measure what a step really did
      const points = hitsAt.map((i) => {
        const uv = [((i % cols) + 0.5) / cols * 2 - 1, (Math.floor(i / cols) + 0.5) / rows * 2 - 1];
        const d = [0, 1, 2].map((k) => v.fwd[k] + v.right[k] * uv[0] * v.tanHalfFov * v.aspect - v.up[k] * uv[1] * v.tanHalfFov);
        const l = Math.hypot(...d);
        const t = o[i * 4];
        return { t, x: [0, 1, 2].map((k) => v.pos[k] + (d[k] / l) * t), grad: o[i * 4 + 3] };
      });
      return { params, lyap: { median: q(0.5), p10: q(0.1), p90: q(0.9) }, hits: hitsAt.length, points, pixelAngle };
    } finally {
      busy = false;
    }
  }
  return { sense, cols, rows };
}
