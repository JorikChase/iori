#!/usr/bin/env node
// tools/fidelity.mjs — the fidelity bench (spec §12.5, decision D30). Compares MOSHINE's simulated mosh with a
// real MPEG-4 ASP mosh made by libavcodec, on the same source pixels.
//
//   node moshine/tools/fidelity.mjs [--tag m2] [--q 4] [--only clip,fixture] [--sweep] [--cfg '<json>' | --preset NAME] [--codec mpeg4|h264]
//   --codec h264: libx264 at constant QP (--q is then the QP, default 24), one reference frame, no B-frames, IDR at
//   the cut; scored on the mosh scenario only (duplicated H.264 packets repeat frame_num and are dropped by the decoder).
//
// Per input (a fixture with exact motion, and tests/media/cut.mp4):
//   1. source frames -> src.rgb (8-bit, 16-aligned 320x176), the pixels both pipelines start from
//   2. ffmpeg: mpeg4, fixed qscale, -g 9999 -bf 0, an I-frame forced at the cut
//   3. tools/bin/mvtool: clean decode with exported vectors; the real mosh (every I-frame after the first
//      dropped); the real bloom (the same plus packet cut+5 duplicated 20 times)
//   4. our Mosh Loop (CPU reference; bit-identical to the GPU, D28) on the same source sequence
//   5. metrics: estimator vs the encoder's vectors; SSIM-8 / PSNR of the simulation against the real mosh, next
//      to two baselines that any simulation must beat: "frozen" (the last A frame) and "clean" (B decoded normally)
// Writes ref/fidelity-<tag>.json, tests/media/fidelity/<input>/sheet-<scenario>.png (sim | real | frozen | clean)
// and lab sets (tests/media/fidelity/index.json) for the lab's Fidelity window.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from '../fixtures.js';
import { createLoopRef, luma, pyramid, levelsFor, matchBlocks } from '../engine-ref.js';
import { normalize, PRESETS } from '../config.js';
import { compare, fromU8, to8 } from '../metrics.js';
import { toHalfArray, fromHalfArray } from '../util.js';

const APP = dirname(dirname(fileURLToPath(import.meta.url))), MEDIA = join(APP, 'tests', 'media'), OUT = join(MEDIA, 'fidelity'), MV = join(APP, 'tools', 'bin', 'mvtool');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => { if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]); return acc; }, []));
const CODEC = args.codec === 'h264' ? 'h264' : 'mpeg4', W = 320, H = 176, Q = +(args.q || (CODEC === 'h264' ? 24 : 4)), N = 60, DUP = 20, tag = args.tag || 'dev';
if (!existsSync(MV)) { console.error('build the reference decoder first: sh moshine/tools/build-mvtool.sh'); process.exit(2); }
const sh = (cmd, a) => execFileSync(cmd, a, { stdio: ['ignore', 'pipe', 'pipe'] });
const frameBytes = W * H * 3;
const readFrames = (p) => { const b = readFileSync(p), n = Math.floor(b.length / frameBytes); return Array.from({ length: n }, (_, i) => b.subarray(i * frameBytes, (i + 1) * frameBytes)); };
const jsonl = (p) => readFileSync(p, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const rgba = (rgb) => { const o = new Float32Array(W * H * 4); for (let i = 0; i < W * H; i++) { o[i * 4] = rgb[i * 3]; o[i * 4 + 1] = rgb[i * 3 + 1]; o[i * 4 + 2] = rgb[i * 3 + 2]; o[i * 4 + 3] = 1; } return o; };

// ------------------------------------------------------------------------------------------------ inputs
function prepare(name) {
  const dir = join(OUT, CODEC === 'h264' ? name + '-h264' : name); mkdirSync(dir, { recursive: true });
  const src = join(dir, 'src.rgb'); let cut;
  if (name === 'fixture') {
    const f = fixture('cut', { w: W, h: H }), buf = Buffer.alloc(f.count * frameBytes); cut = f.cut;
    for (let t = 0; t < f.count; t++) { const fr = f.frame(t); for (let i = 0; i < W * H; i++) for (let k = 0; k < 3; k++) buf[t * frameBytes + i * 3 + k] = Math.round(fr[i * 4 + k] * 255); }
    writeFileSync(src, buf);
  } else {
    const clip = join(MEDIA, 'cut.mp4'); if (!existsSync(clip)) throw new Error('no tests/media/cut.mp4 (sh moshine/tools/make-media.sh)');
    sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', clip, '-an', '-vf', `scale=${W}:${H}:flags=area`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', src]); cut = 90;
  }
  const enc = join(dir, CODEC === 'h264' ? 'enc.mkv' : 'enc.avi');
  const codecArgs = CODEC === 'h264'
    ? ['-c:v', 'libx264', '-preset', 'medium', '-qp', String(Q), '-bf', '0', '-g', '9999', '-keyint_min', '9999', '-sc_threshold', '0', '-x264-params', 'ref=1', '-pix_fmt', 'yuv420p', '-f', 'matroska']
    : ['-c:v', 'mpeg4', '-q:v', String(Q), '-g', '9999', '-bf', '0', '-f', 'avi'];
  sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', '30', '-i', src,
    ...codecArgs.slice(0, -2), '-force_key_frames', `expr:eq(n,${cut})`, '-an', ...codecArgs.slice(-2), enc]);
  const run = (out, extra) => { sh(MV, [enc, join(dir, out + '.rgb'), '--mvs', join(dir, out + '.jsonl'), ...extra]); return { frames: readFrames(join(dir, out + '.rgb')), meta: jsonl(join(dir, out + '.jsonl')) }; };
  const clean = run('clean', []), mosh = run('mosh', ['--drop-keys-after', '0']), bloom = CODEC === 'h264' ? null : run('bloom', ['--drop-keys-after', '0', '--dup', `${cut + 5}:${DUP}`]);
  const types = clean.meta.map((m) => m.type).join('');
  return { name, dir, cut, src: readFrames(src), clean, mosh, bloom, types, fx: name === 'fixture' ? fixture('cut', { w: W, h: H }) : null };
}

// ------------------------------------------------------------------------------------------------ the simulation, aligned to a real decode
/**
 * The real decode skips the dropped I-frame; duplicates repeat a packet. The sim sequence: tau 0 = the last A frame
 * (the Mosh Loop clip's I-frame), tau 1 = the cut frame (no output in the real stream), then one step per real
 * output frame j >= cut, fed with the source frame of that output's packet. sim(tau) is compared with real(j = tau + cut - 2).
 */
function simulate(inp, real, cfg, { bloomAt = null } = {}) {
  const seq = [inp.cut - 1, inp.cut], realIdx = [];
  for (let j = inp.cut; j < real.meta.length; j++) { seq.push(real.meta[j].pkt); realIdx.push(j); }
  let c = normalize(cfg);
  if (bloomAt !== null) { const tau = seq.indexOf(bloomAt); c = normalize({ ...c, bloom: { ...c.bloom, repeat: DUP + 1, every: 0, hits: [tau], residual: true } }); }
  const L = createLoopRef({ w: W, h: H }, c), out = [], srcF = new Map();
  // the frames exactly as the GPU sees them after an rgba16float upload, so the bench measures what the app renders
  const S = (k) => { if (!srcF.has(k)) srcF.set(k, fromHalfArray(toHalfArray(rgba(fromU8(inp.src[k]))))); return srcF.get(k); };
  L.begin(0);
  for (let tau = 0; tau < seq.length; tau++) { const r = L.step(tau, { src: S(seq[tau]) }); if (tau >= 2) out.push(r.out); }
  return { out, seq, realIdx, cfg: c };
}

function score(inp, real, sim, n = N) {
  const frozen = rgba(fromU8(real.frames[inp.cut - 1])), per = [];
  for (let i = 0; i < Math.min(n, sim.out.length); i++) {
    const j = sim.realIdx[i], R = rgba(fromU8(real.frames[j])), C = rgba(fromU8(inp.clean.frames[real.meta[j].pkt]));
    const s = compare(to8(sim.out[i]), R, W, H), z = compare(frozen, R, W, H), cl = compare(C, R, W, H);
    per.push({ i, j, pkt: real.meta[j].pkt, sim: s, frozen: z, clean: cl });
  }
  const mean = (a, b, k, m) => { const x = per.slice(a, b); return x.length ? +(x.reduce((s, r) => s + r[k][m], 0) / x.length).toFixed(4) : null; };
  const bands = [[0, 10], [10, 30], [30, 60]], summary = {};
  for (const [a, b] of bands) summary[`${a}-${b}`] = Object.fromEntries(['sim', 'frozen', 'clean'].map((k) => [k, { ssim: mean(a, b, k, 'ssim'), psnr: mean(a, b, k, 'psnr') }]));
  const wins = per.filter((r) => r.sim.ssim > Math.max(r.frozen.ssim, r.clean.ssim)).length;
  return { summary, winRate: +(wins / per.length).toFixed(3), frames: per.length, per };
}

// ------------------------------------------------------------------------------------------------ the estimator against the encoder's vectors
function vectors(inp, cfg) {
  const c = normalize(cfg), e = c.estimate, bw = W / 16, bh = H / 16, errs = [], codecTruth = []; let inter = 0, equal = 0, tp = 0, fp = 0, fn = 0;
  const P = (k) => pyramid(luma(rgba(fromU8(inp.src[k])), W, H), W, H, levelsFor(16));
  for (const m of inp.clean.meta) {
    if (m.type !== 'P' || m.i === 0 || m.i === inp.cut) continue;
    const est = matchBlocks(P(m.i), P(m.i - 1), { block: 16, search: e.search, lambda: e.lambda, pel: e.pel, cutMad: e.cutMad }).field;
    const acc = new Map();      // any partition size (H.264: 16x16 down to 4x4), area-weighted mean per 16x16 macroblock
    for (const v of m.mvs) { if (v[7] >= 0) continue; const b = Math.floor(v[3] / 16) * bw + Math.floor(v[2] / 16), a = v[0] * v[1], e = acc.get(b) || [0, 0, 0]; e[0] += (-v[4] / v[6]) * a; e[1] += (-v[5] / v[6]) * a; e[2] += a; acc.set(b, e); }
    const codec = new Map([...acc].map(([b, e]) => [b, [e[0] / e[2], e[1] / e[2]]]));
    const tr = inp.fx ? inp.fx.field(m.i) : null;
    for (let b = 0; b < bw * bh; b++) {
      const cv = codec.get(b), simIntra = est[b * 4 + 2] > c.intra.mad;
      if (!cv) { if (simIntra) tp++; else fn++; continue; }
      if (simIntra) fp++;
      inter++; const d = Math.hypot(est[b * 4] - cv[0], est[b * 4 + 1] - cv[1]); errs.push(d); if (d === 0) equal++;
      if (tr) codecTruth.push(Math.hypot(cv[0] - tr[b * 2], cv[1] - tr[b * 2 + 1]));
    }
  }
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(3) : null; };
  return { interBlocks: inter, equalToCodec: +(equal / Math.max(1, inter)).toFixed(3), epeMedian: q(errs, 0.5), epeP90: q(errs, 0.9),
    intra: { codecIntraBlocks: tp + fn, recall: +(tp / Math.max(1, tp + fn)).toFixed(3), precision: +(tp / Math.max(1, tp + fp)).toFixed(3) },
    ...(codecTruth.length ? { codecVsTruth: { median: q(codecTruth, 0.5), p90: q(codecTruth, 0.9) } } : {}) };
}

// ------------------------------------------------------------------------------------------------ contact sheet + lab sets
function sheet(inp, real, sim, file) {
  const rows = [0, 4, 14, 29, 59].filter((i) => i < sim.out.length), cols = 4, out = Buffer.alloc(W * cols * H * rows.length * 3);
  const put = (r, c, rgb) => { for (let y = 0; y < H; y++) rgb.copy ? rgb.copy(out, ((r * H + y) * W * cols + c * W) * 3, y * W * 3, (y + 1) * W * 3) : null; };
  const u8 = (f) => { const b = Buffer.alloc(frameBytes); for (let i = 0; i < W * H; i++) for (let k = 0; k < 3; k++) b[i * 3 + k] = Math.round(Math.min(1, Math.max(0, f[i * 4 + k])) * 255); return b; };
  rows.forEach((i, r) => { const j = sim.realIdx[i]; put(r, 0, u8(sim.out[i])); put(r, 1, Buffer.from(real.frames[j])); put(r, 2, Buffer.from(real.frames[inp.cut - 1])); put(r, 3, Buffer.from(inp.clean.frames[real.meta[j].pkt])); });
  const raw = file.replace(/\.png$/, '.rgb'); writeFileSync(raw, out);
  sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W * cols}x${H * rows.length}`, '-i', raw, '-frames:v', '1', file]);
}
function labSet(inp, real, sim, scen, sets, sc) {
  const n = sim.seq.length, simSrc = Buffer.alloc(n * frameBytes), realA = Buffer.alloc(n * frameBytes);
  sim.seq.forEach((k, tau) => { Buffer.from(inp.src[k]).copy(simSrc, tau * frameBytes); const j = tau >= 2 ? sim.realIdx[tau - 2] : inp.cut - 1; Buffer.from(real.frames[j]).copy(realA, tau * frameBytes); });
  const base = `${inp.name}${CODEC === 'h264' ? '-h264' : ''}-${scen}`; writeFileSync(join(OUT, base + '-src.rgb'), simSrc); writeFileSync(join(OUT, base + '-real.rgb'), realA);
  // per-frame SSIM of the bench's own run, indexed by tau (tau = i + 2): [sim, frozen, clean]
  const curve = Array.from({ length: n }, (_, tau) => { const p = sc.per[tau - 2]; return p ? [+p.sim.ssim.toFixed(4), +p.frozen.ssim.toFixed(4), +p.clean.ssim.toFixed(4)] : null; });
  sets.push({ name: `${inp.name} · ${scen}`, input: inp.name, scenario: scen, w: W, h: H, count: n, src: base + '-src.rgb', real: base + '-real.rgb', cfg: sim.cfg, q: Q, curve, summary: sc.summary });
}

// ------------------------------------------------------------------------------------------------ sweep
const SWEEP = [
  ['sampling nearest', (c) => ({ ...c, warp: { ...c.warp, sampling: 'nearest' } })], ['sampling bilinear', (c) => ({ ...c, warp: { ...c.warp, sampling: 'bilinear' } })],
  ['pel 1', (c) => ({ ...c, estimate: { ...c.estimate, pel: 1 }, warp: { ...c.warp, pel: 1 } })], ['pel 2', (c) => ({ ...c, estimate: { ...c.estimate, pel: 2 }, warp: { ...c.warp, pel: 2 } })],
  ['lambda 0', (c) => ({ ...c, estimate: { ...c.estimate, lambda: 0 } })], ['lambda .002', (c) => ({ ...c, estimate: { ...c.estimate, lambda: 0.002 } })], ['lambda .006', (c) => ({ ...c, estimate: { ...c.estimate, lambda: 0.006 } })],
  ['residual off', (c) => ({ ...c, residual: { ...c.residual, gain: 0 } })],
  ...[0.01, 0.03, 0.06].map((d) => [`codec residual dead ${d}`, (c) => ({ ...c, residual: { gain: 1, steps: 32, mode: 'codec', dead: d } })]),
  ['detail residual .35', (c) => ({ ...c, residual: { gain: 0.35, steps: 16, mode: 'detail', dead: 0 } })],
  ['intra off', (c) => ({ ...c, intra: { ...c.intra, rate: 0 } })], ...[0.06, 0.12, 0.2].map((m) => [`intra all > ${m}`, (c) => ({ ...c, intra: { mad: m, rate: 1 } })]),
];
// H.264-specific groups (--codec h264 --sweep): partition size, quarter-pel, dead zone, in-loop deblock and DCT
const SWEEP_H264 = [
  ['block 16', (c) => ({ ...c, block: 16 })], ['block 8', (c) => ({ ...c, block: 8 })],
  ['pel 2', (c) => ({ ...c, estimate: { ...c.estimate, pel: 2 }, warp: { ...c.warp, pel: 2 } })], ['pel 4', (c) => ({ ...c, estimate: { ...c.estimate, pel: 4 }, warp: { ...c.warp, pel: 4 } })],
  ...[0, 0.01, 0.03, 0.06].map((d) => [`dead ${d}`, (c) => ({ ...c, residual: { gain: 1, steps: 32, mode: 'codec', dead: d } })]),
  ['no in-loop', (c) => ({ ...c, inLoop: [] })],
  ...[[0.5, 4], [0.9, 4], [0.9, 8]].map(([st, g]) => [`deblock ${st}/${g}`, (c) => ({ ...c, inLoop: [{ fx: 'deblock', strength: st, grid: g, alpha: 0.12, beta: 0.04 }] })]),
  ...[60, 85].map((q) => [`deblock + dct ${q}`, (c) => ({ ...c, inLoop: [{ fx: 'deblock', strength: 0.9, grid: 4, alpha: 0.12, beta: 0.04 }, { fx: 'dct', quality: q, chroma: 1.5, cutoff: 64 }] })]),
];
const objective = (results) => results.reduce((s, r) => s + r.summary['0-10'].sim.ssim + r.summary['10-30'].sim.ssim, 0) / results.length;

// ------------------------------------------------------------------------------------------------ main
const t0 = Date.now(), inputs = (args.only ? String(args.only).split(',') : ['fixture', 'clip']).map(prepare);
let base = args.cfg ? normalize(JSON.parse(args.cfg)) : normalize(PRESETS[args.preset || (CODEC === 'h264' ? 'H.264 soft' : 'Xvid classic')]);
const report = { tag, codec: CODEC, date: new Date().toISOString(), size: `${W}x${H}`, q: Q, frames: N, cfg: base, inputs: {} }, sets = [];

if (args.sweep) {
  // one parameter group at a time, keep the best (coordinate ascent on mean SSIM of frames 0-30 over all inputs)
  const LIST = CODEC === 'h264' ? SWEEP_H264 : SWEEP;
  const groups = CODEC === 'h264' ? [[0, 1], [2, 3], [4, 5, 6, 7], [8, 9, 10, 11, 12, 13]] : [[0, 1], [2, 3], [4, 5, 6], [7, 8, 9, 10, 11], [12, 13, 14, 15]], log = [];
  const evalCfg = (c) => objective(inputs.map((inp) => score(inp, inp.mosh, simulate(inp, inp.mosh, c), 30)));
  let best = evalCfg(base); log.push({ step: 'start', ssim: +best.toFixed(4) });
  for (let pass = 0; pass < 2; pass++) for (const g of groups) {
    let pick = null;
    for (const k of g) { const c = normalize(LIST[k][1](base)), v = evalCfg(c); log.push({ step: LIST[k][0], ssim: +v.toFixed(4) }); if (v > best + 1e-4) { best = v; pick = c; } }
    if (pick) base = pick;
    console.log(`sweep pass ${pass + 1} group ${g.join(',')}: best ${best.toFixed(4)}`);
  }
  report.sweep = { log, best: +best.toFixed(4), cfg: base }; report.cfg = base;
}

for (const inp of inputs) {
  const r = { cut: inp.cut, frameTypes: inp.types, vectors: vectors(inp, base), scenarios: {} };
  for (const [scen, real, opt] of [['mosh', inp.mosh, {}], ['bloom', inp.bloom, { bloomAt: inp.cut + 5 }]]) {
    if (!real) continue;
    const sim = simulate(inp, real, base, opt), s = score(inp, real, sim);
    sheet(inp, real, sim, join(inp.dir, `sheet-${scen}.png`)); labSet(inp, real, sim, scen, sets, s);
    r.scenarios[scen] = { summary: s.summary, winRate: s.winRate, frames: s.frames, perFrame: s.per.map((p) => ({ i: p.i, sim: +p.sim.ssim.toFixed(4), frozen: +p.frozen.ssim.toFixed(4), clean: +p.clean.ssim.toFixed(4) })) };
    console.log(`${inp.name} ${scen}: SSIM 0-10 sim ${s.summary['0-10'].sim.ssim} frozen ${s.summary['0-10'].frozen.ssim} clean ${s.summary['0-10'].clean.ssim} | 10-30 sim ${s.summary['10-30'].sim.ssim} frozen ${s.summary['10-30'].frozen.ssim} clean ${s.summary['10-30'].clean.ssim} | wins ${s.winRate}`);
  }
  console.log(`${inp.name} vectors: ${JSON.stringify(r.vectors)}`);
  report.inputs[inp.name] = r;
}
if (CODEC === 'mpeg4') writeFileSync(join(OUT, 'index.json'), JSON.stringify({ tag, sets }, null, 1));
// budgets (study/fidelity.md): floors that a change to the engine or the default preset must not break
const budgets = JSON.parse(readFileSync(join(APP, 'tools', 'fidelity-budgets.json'), 'utf8')), fails = [];
report.budgets = {};
for (const [key, b] of Object.entries(CODEC === 'h264' ? budgets.h264 || {} : budgets.floors)) {
  const [input, scen] = key.split('.'), sc = report.inputs[input]?.scenarios[scen]; if (!sc) continue;
  const got = { ssim0: sc.summary['0-10'].sim.ssim, ssim10: sc.summary['10-30'].sim.ssim, winRate: sc.winRate }, ok = got.ssim0 >= b.ssim0 && got.ssim10 >= b.ssim10 && got.winRate >= b.winRate;
  report.budgets[key] = { ...got, floor: b, pass: ok }; if (!ok) fails.push(key);
  console.log(`budget ${key}: ${ok ? 'pass' : 'FAIL'} (SSIM 0-10 ${got.ssim0} >= ${b.ssim0}, 10-30 ${got.ssim10} >= ${b.ssim10}, wins ${got.winRate} >= ${b.winRate})`);
}
writeFileSync(join(APP, 'ref', `fidelity-${tag}.json`), JSON.stringify(report, null, 1));
console.log(`saved moshine/ref/fidelity-${tag}.json and ${sets.length} lab sets in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (!args.sweep && !args.cfg && !args.preset && fails.length) { console.error('fidelity budgets failed: ' + fails.join(', ')); process.exit(1); }
