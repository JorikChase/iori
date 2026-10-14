// scale.js — resolution independence (2026-10-13). A mosh is authored at the sequence's size; the preview (governed,
// often smaller) and the export (any size) render it at another working size. Everything a config measures in pixels
// scales with the working height / sequence height (`cfg.scale`), so the block grid, the search reach and every pixel
// offset cover the same part of the picture at any size: the preview shows what the export will be. Applied after
// keyframes and modulators are resolved (both loop twins and the evaluator's clip effects), so animated values scale
// too. scale 1 (or none) returns the config untouched: every exact path is unchanged at the sequence's own size.
// Already relative: painted vectors and masks (sequence space), gains, multiply, synthetic fields (relative to the
// distance from the centre), lost sectors (in blocks), the residual, the bloom.

const R = Math.round;
/** The block size at a working scale: the nearest power of two, 4 to 32 (the matcher averages exactly over power-of-two
  blocks, and 32 is the largest its workgroup memory holds; D45). Ties go to the larger block. */
export const scaledBlock = (b, s) => { if (!s || s === 1) return b; const v = b * s; let best = 4; for (const c of [8, 16, 32]) if (Math.abs(v - c) <= Math.abs(v - best)) best = c; return best; };
const px = (v, s) => v * s;                                          // a pixel distance
const pxi = (v, s, min = 0) => (v > 0 ? Math.max(min, R(v * s)) : v < 0 ? Math.min(-min, R(v * s)) : 0);   // a whole-pixel count

/** One field op (resolved) at scale s. */
export function scaleOp(o, s) {
  if (!s || s === 1) return o;
  switch (o.op) {
    case 'pan': return { ...o, x: px(o.x, s), y: px(o.y, s) };
    case 'noise': return { ...o, amp: px(o.amp, s) };
    case 'skip': return { ...o, eps: px(o.eps, s) };
  }
  return o;
}
/** One effect (resolved) at scale s. */
export function scaleFx(o, s) {
  if (!s || s === 1) return o;
  switch (o.fx) {
    case 'chroma': return { ...o, dx: px(o.dx, s), dy: px(o.dy, s) };
    case 'deblock': return { ...o, grid: Math.max(2, R(o.grid * s)) };
    case 'blockdrag': return { ...o, offset: px(o.offset, s) };
    case 'slice': return { ...o, height: pxi(o.height, s, 1), shift: px(o.shift, s), field: pxi(o.field, s) };
    case 'rgbsplit': return { ...o, dx: px(o.dx, s), dy: px(o.dy, s) };
  }
  return o;
}
/** A resolved Mosh Loop config at its own `scale`. */
export function scaleRes(c) {
  const s = c.scale; if (!s || s === 1) return c;
  return { ...c, block: scaledBlock(c.block, s),
    estimate: { ...c.estimate, search: Math.max(1, R(c.estimate.search * s)) },
    reset: { ...c.reset, sweepBand: pxi(c.reset.sweepBand, s, 1), sweepSpeed: px(c.reset.sweepSpeed, s) },
    ops: c.ops.map((o) => scaleOp(o, s)), inLoop: c.inLoop.map((o) => scaleFx(o, s)), post: c.post.map((o) => scaleFx(o, s)) };
}
