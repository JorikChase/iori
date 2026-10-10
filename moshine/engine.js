// engine.js — the Mosh Loop on the GPU (spec §5.4). Same semantics, stage order and state as
// createLoopRef() in engine-ref.js; one command submission per frame.
//
//   estimate -> field ops -> bloom hold -> warp -> code (residual / intra / refresh / reset) -> history
//
// State (what a checkpoint will hold in M6): history, previous luma pyramids, previous estimate, frozen field,
// previous source and the bloom's frozen previous source (codec residual).
import { createImage, storageBuffer, readBuffer, F16 } from './gpu.js';
import { createPyramid } from './nodes/pyramid.js';
import { createMatcher } from './nodes/match.js';
import { createFieldOps } from './nodes/fieldops.js';
import { createWarpNode } from './nodes/warp.js';
import { createCodeNode } from './nodes/code.js';
import { createFlow } from './nodes/flow.js';
import { createFxChain } from './nodes/fx.js';
import { createMaskMix } from './nodes/composite.js';
import { hash3 } from './util.js';
import { normalize } from './config.js';
import { resolveAll, holdAt } from './params.js';
import { levelsFor, EDGE } from './engine-ref.js';

export function createMoshLoop(gpu, { w, h }, cfg0) {
  let cfg = normalize(cfg0), R = null, S = null;

  function build(block) {
    if (R) destroy();
    const levels = levelsFor(block), nb = Math.ceil(w / block) * Math.ceil(h / block), geo = { w, h, block, levels };
    R = {
      block, levels, nb,
      hist: [createImage(gpu, w, h, F16, 'history 0'), createImage(gpu, w, h, F16, 'history 1')], pred: createImage(gpu, w, h, F16, 'prediction'),
      prevSrc: createImage(gpu, w, h, F16, 'previous source'), prevFrozen: createImage(gpu, w, h, F16, 'bloom previous source'), mc: createImage(gpu, w, h, F16, 'mc source'),
      codeOut: createImage(gpu, w, h, F16, 'code out'), display: createImage(gpu, w, h, F16, 'display'),
      flow: createFlow(gpu, geo), fxIn: createFxChain(gpu, geo, F16, 'in-loop'), fxPost: createFxChain(gpu, geo, F16, 'post'),
      pyr: [createPyramid(gpu, geo, 'src A'), createPyramid(gpu, geo, 'src B')], pyr2: [createPyramid(gpu, geo, 'src2 A'), createPyramid(gpu, geo, 'src2 B')],
      pyrH: createPyramid(gpu, geo, 'history'),
      est: [storageBuffer(gpu, nb * 16, 'estimate A'), storageBuffer(gpu, nb * 16, 'estimate B')], ops: [storageBuffer(gpu, nb * 16, 'ops A'), storageBuffer(gpu, nb * 16, 'ops B')],
      frozen: storageBuffer(gpu, nb * 16, 'frozen field'), frozenEst: storageBuffer(gpu, nb * 16, 'frozen estimate'), cut: storageBuffer(gpu, 16, 'cut counter'),
      lockMix: createMaskMix(gpu), match: createMatcher(gpu, geo), fieldops: createFieldOps(gpu, geo), warp: createWarpNode(gpu, geo), mcWarp: createWarpNode(gpu, geo), code: createCodeNode(gpu, geo),
    };
  }
  function destroy() {
    for (const k of ['hist', 'est', 'ops']) R[k].forEach((x) => x.destroy());
    for (const k of ['pyr', 'pyr2']) R[k].forEach((x) => x.destroy());
    for (const k of ['pred', 'prevSrc', 'prevFrozen', 'mc', 'codeOut', 'display', 'flow', 'fxIn', 'fxPost', 'pyrH', 'frozen', 'frozenEst', 'cut', 'lockMix', 'match', 'fieldops', 'warp', 'mcWarp', 'code']) R[k].destroy();
  }
  build(cfg.block);

  const api = {
    get config() { return cfg; },
    get resources() { return R; },
    /** Replace the config. A block-size change rebuilds the resources and restarts the loop. */
    setConfig(c) { cfg = normalize(c); if (cfg.block !== R.block) { build(cfg.block); if (S) api.begin(S.t0); } },
    /** Start (or restart) at frame t0: the next step(t0) is the I-frame. */
    begin(t0 = 0) { S = { t0, started: false, hi: 0, pi: 0, ei: 0, hasPrevEst: false, frozenOk: false, ever2: false, prevIsSrc: false, last: null }; R.fxIn.reset(); R.fxPost.reset(); },
    /**
     * Advance to frame t. inputs: { src: GPUTexture, src2?: GPUTexture } (rgba16float, w x h).
     * Returns { out: GPUTexture (the history), display: GPUTexture (after the post chain), field, est, hold, cutThresh }.
     */
    step(t, { src, src2 = null, lock = null }) {
      const c = resolveAll(cfg, t, cfg.clock), seed = cfg.seed | 0, dev = gpu.device, enc = dev.createCommandEncoder({ label: `mosh f${t}` });
      const resetSrc = c.reset.source === 'source2' && src2 ? src2 : src;
      const use2 = c.estimate.source === 'source2' && !!src2;
      const resSrc = use2 ? src2 : src;                 // the codec residual belongs to the motion source's stream
      enc.clearBuffer(R.cut);
      R.pyr[S.pi].encode(enc, src);
      if (use2) { R.pyr2[S.pi].encode(enc, src2); S.ever2 = true; }
      if (!S.started || t === S.t0) {
        enc.copyTextureToTexture({ texture: resetSrc }, { texture: R.hist[S.hi] }, [w, h]);
        enc.copyTextureToTexture({ texture: resSrc }, { texture: R.prevSrc }, [w, h]); S.prevIsSrc = resSrc === src;
        locked(enc, R.hist[S.hi]);
        const display = post(enc, R.hist[S.hi], null);
        dev.queue.submit([enc.finish()]);
        S.started = true; S.pi = 1 - S.pi;
        return (S.last = { out: R.hist[S.hi], display, field: null, est: null, hold: -1, cutThresh: 0 });
      }
      const k = holdAt(t, { ...c.bloom, hits: cfg.bloom.hits }, S.t0);
      const cutThresh = Math.floor(Math.fround(c.estimate.cutFrac) * R.nb);
      let field, est = null;
      if (k > 0 && S.frozenOk) field = R.frozen;
      else {
        const e = c.estimate; est = R.est[S.ei];
        if (e.source === 'none') enc.clearBuffer(est);
        else {
          const cur = use2 ? R.pyr2[S.pi] : R.pyr[S.pi];
          let ref;
          if (e.against === 'output') { R.pyrH.encode(enc, R.hist[S.hi]); ref = R.pyrH; } else ref = use2 ? R.pyr2[1 - S.pi] : R.pyr[1 - S.pi];
          if (e.method === 'flow') R.flow.encode(enc, cur, ref, est, R.cut, { cutMad: e.cutMad });
          else R.match.encode(enc, cur, ref, est, R.cut, { search: e.search, lambda: e.lambda, pel: e.pel, cutMad: e.cutMad, temporal: S.hasPrevEst ? R.est[1 - S.ei] : null });
        }
        field = R.fieldops.encode(enc, est, R.ops, c.ops.filter((o) => o.on !== false), { t, seed, src, src2 });
        if (k === 0) { enc.copyBufferToBuffer(field, 0, R.frozen, 0, R.nb * 16); enc.copyBufferToBuffer(est, 0, R.frozenEst, 0, R.nb * 16); enc.copyTextureToTexture({ texture: R.prevSrc }, { texture: R.prevFrozen }, [w, h]); S.frozenOk = true; }
      }
      const scale = k > 0 ? Math.fround(Math.fround(c.bloom.accel) ** k) : 1;   // same rounding as the CPU reference
      const wo = { field, cut: R.cut, edge: EDGE[c.warp.edge], sampling: c.warp.sampling, pel: c.warp.pel, scale, zeroOnCut: c.estimate.zeroOnCut, cutThresh, interp: c.warp.interp };
      R.warp.encode(enc, R.hist[S.hi], R.pred, wo);
      const codecRes = c.residual.mode === 'codec' && c.residual.gain > 0;     // the previous source under the same motion
      // the residual's motion compensation uses the ORIGINAL estimate: edited vectors keep the old residual (ffglitch semantics)
      if (codecRes) R.mcWarp.encode(enc, k > 0 && S.frozenOk ? R.prevFrozen : R.prevSrc, R.mc, { ...wo, field: k > 0 && S.frozenOk ? R.frozenEst : est, scale: 1, interp: 'block' });
      const gop = c.reset.gop | 0;
      const inLoop = c.inLoop.some((o) => o.on !== false);
      R.code.encode(enc, { src, resetSrc, pred: R.pred, mc: codecRes ? R.mc : null, res: resSrc, dst: inLoop ? R.codeOut : R.hist[1 - S.hi], field, cut: R.cut }, {
        t, seed, hard: gop > 0 && (t - S.t0) % gop === 0 && hash3(t, 5, seed * 4 + 1) < Math.fround(c.reset.gopKeep), cutThresh, dropCut: !!c.estimate.zeroOnCut, honourCut: c.reset.honourCut, intraMad: c.intra.mad, intraRate: c.intra.rate,
        blocks: c.reset.blocks, sweepBand: c.reset.sweepBand, sweepSpeed: c.reset.sweepSpeed, resGain: c.residual.gain, resSteps: c.residual.steps,
        resMode: c.residual.mode, resDead: c.residual.dead, allowCode: k <= 0 || !!c.bloom.residual,
      });
      if (inLoop) R.fxIn.encode(enc, R.codeOut, R.hist[1 - S.hi], c.inLoop, { t, seed, field });     // accumulates: feeds back
      locked(enc, R.hist[1 - S.hi]);
      enc.copyTextureToTexture({ texture: resSrc }, { texture: R.prevSrc }, [w, h]); S.prevIsSrc = resSrc === src;
      const display = post(enc, R.hist[1 - S.hi], field);
      dev.queue.submit([enc.finish()]);
      S.hi = 1 - S.hi; S.pi = 1 - S.pi;
      if (est) { S.ei = 1 - S.ei; S.hasPrevEst = true; }
      return (S.last = { out: R.hist[S.hi], display, field, est, hold: k, cutThresh });
      // lock refresh: the history is the source wherever the clip's lock masks hold (codeOut is free by now)
      function locked(e2, hist) { if (!lock) return; R.lockMix.encode(e2, src, hist, lock, R.codeOut); e2.copyTextureToTexture({ texture: R.codeOut }, { texture: hist }, [w, h]); }
      function post(e2, img, fld) { if (!c.post.some((o) => o.on !== false)) return img; R.fxPost.encode(e2, img, R.display, c.post, { t, seed, field: fld }); return R.display; }
    },
    /**
     * A checkpoint (M6): GPU copies of everything the next step reads — the history, the previous source and the
     * bloom's frozen one, the previous luma pyramids, the previous estimate, the frozen field — plus the stateful
     * effects' outputs and the loop's counters. restore() puts it back; stepping on from there gives the same bits as
     * never having stopped. parts: [{ name, kind: 'tex' | 'buf', obj, bytes? }] (step 3 moves them to CPU and OPFS).
     */
    snapshot() {
      if (!S || !S.started) return null;
      const enc = gpu.device.createCommandEncoder({ label: 'snapshot' }), parts = [];
      const tex = (name, t) => { const c = gpu.device.createTexture({ label: 'ckpt ' + name, size: [t.width, t.height], format: t.format, usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING }); enc.copyTextureToTexture({ texture: t }, { texture: c }, [t.width, t.height]); parts.push({ name, kind: 'tex', obj: c }); };
      const buf = (name, b) => { const c = storageBuffer(gpu, R.nb * 16, 'ckpt ' + name); enc.copyBufferToBuffer(b, 0, c, 0, R.nb * 16); parts.push({ name, kind: 'buf', obj: c }); };
      tex('hist', R.hist[S.hi]); tex('prevSrc', R.prevSrc);
      if (S.frozenOk) { tex('prevFrozen', R.prevFrozen); buf('frozen', R.frozen); buf('frozenEst', R.frozenEst); }
      if (!S.prevIsSrc) R.pyr[1 - S.pi].levels.forEach((p, l) => tex('pyr' + l, p));   // else: rebuilt from prevSrc on restore (same texels, same pyramid)
      if (S.ever2) R.pyr2[1 - S.pi].levels.forEach((p, l) => tex('pyr2_' + l, p));
      if (S.hasPrevEst) buf('est', R.est[1 - S.ei]);
      const fxIn = R.fxIn.snapshot(enc), fxPost = R.fxPost.snapshot(enc);
      gpu.device.queue.submit([enc.finish()]);
      const { last, ...state } = S;
      return { block: R.block, w, h, state, parts, fxIn, fxPost,
        get bytes() { return parts.reduce((n, p) => n + (p.kind === 'buf' ? p.obj.size : p.obj.width * p.obj.height * (p.obj.format === 'r32float' ? 4 : 8)), 0) + [...fxIn.tex, ...fxPost.tex].reduce((n, x) => n + (x ? x.width * x.height * 8 : 0), 0); },
        destroy() { parts.forEach((p) => p.obj.destroy()); [...fxIn.tex, ...fxPost.tex].forEach((x) => x?.destroy()); } };
    },
    restore(snap) {
      if (snap.block !== R.block || snap.w !== w || snap.h !== h) throw new Error('checkpoint from another geometry');
      if (!snap.state.ever2) for (const P of R.pyr2) for (const p of P.levels) gpu.device.queue.writeTexture({ texture: p }, new Float32Array(p.width * p.height), { bytesPerRow: p.width * 4 }, [p.width, p.height]);   // never written in that run
      S = { ...snap.state, last: null };
      const enc = gpu.device.createCommandEncoder({ label: 'restore' }), get = (n) => snap.parts.find((p) => p.name === n);
      const tex = (n, t) => { const p = get(n); if (p) enc.copyTextureToTexture({ texture: p.obj }, { texture: t }, [t.width, t.height]); };
      const buf = (n, b) => { const p = get(n); if (p) enc.copyBufferToBuffer(p.obj, 0, b, 0, R.nb * 16); };
      tex('hist', R.hist[S.hi]); tex('prevSrc', R.prevSrc); tex('prevFrozen', R.prevFrozen); buf('frozen', R.frozen); buf('frozenEst', R.frozenEst);
      if (S.prevIsSrc) R.pyr[1 - S.pi].encode(enc, R.prevSrc); else R.pyr[1 - S.pi].levels.forEach((p, l) => tex('pyr' + l, p));
      R.pyr2[1 - S.pi].levels.forEach((p, l) => tex('pyr2_' + l, p));
      buf('est', R.est[1 - S.ei]);
      R.fxIn.restore(enc, snap.fxIn); R.fxPost.restore(enc, snap.fxPost);
      gpu.device.queue.submit([enc.finish()]);
    },
    /** Read the last step's field / estimate (vec4 per block) and the cut counter. */
    async readLast() {
      const L = S && S.last; if (!L) return null;
      const [field, est, cut] = await Promise.all([L.field ? readBuffer(gpu, L.field, R.nb * 16) : null, L.est ? readBuffer(gpu, L.est, R.nb * 16) : null, readBuffer(gpu, R.cut, 4)]);
      return { field: field && new Float32Array(field), est: est && new Float32Array(est), cut: new Uint32Array(cut)[0], hold: L.hold, cutThresh: L.cutThresh };
    },
    destroy,
  };
  return api;
}
