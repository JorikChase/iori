#!/usr/bin/env node
// tools/gallery.mjs — render every preset (styles and the twelve legacy ones) on the test clip and write contact
// strips plus an HTML index, so a person can judge whether each preset does what its name promises.
//
//   node moshine/tools/gallery.mjs [--only "Fluid,09 Acid Wash"]      -> tests/media/gallery/index.html
//
// Uses the fidelity bench's 320x176 source (tests/media/fidelity/clip/src.rgb: testsrc2, a cut at 90, a zooming
// Mandelbrot). Source 2: the clip reversed (motion hijack) or the colour-bars fixture (presets that use an image).
// Runs the CPU reference loop (bit-identical to the GPU for the classic path; float effects within D28 tolerance).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLoopRef } from '../engine-ref.js';
import { PRESETS, LEGACY, normalize } from '../config.js';
import { fixture } from '../fixtures.js';
import { toHalfArray, fromHalfArray } from '../util.js';

const APP = dirname(dirname(fileURLToPath(import.meta.url))), OUT = join(APP, 'tests', 'media', 'gallery'), SRC = join(APP, 'tests', 'media', 'fidelity', 'clip', 'src.rgb');
if (!existsSync(SRC)) { console.error('run node moshine/tools/fidelity.mjs first (it writes the 320x176 clip source)'); process.exit(2); }
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => { if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]); return acc; }, []));
const W = 320, H = 176, FB = W * H * 3, CUT = 90, T0 = CUT - 20, SHOW = [CUT - 5, CUT + 3, CUT + 15, CUT + 30, CUT + 45];
mkdirSync(OUT, { recursive: true });
const raw = readFileSync(SRC), N = Math.floor(raw.length / FB);
const frame = (k) => { k = Math.max(0, Math.min(N - 1, k)); const o = new Float32Array(W * H * 4); for (let i = 0; i < W * H; i++) { o[i * 4] = raw[k * FB + i * 3] / 255; o[i * 4 + 1] = raw[k * FB + i * 3 + 1] / 255; o[i * 4 + 2] = raw[k * FB + i * 3 + 2] / 255; o[i * 4 + 3] = 1; } return fromHalfArray(toHalfArray(o)); };
const bars = fromHalfArray(toHalfArray(fixture('bars', { w: W, h: H }).frame(0)));
const all = { ...Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, { cfg: v, group: 'style' }])), ...Object.fromEntries(Object.entries(LEGACY).map(([k, v]) => [k, { cfg: v, group: 'legacy' }])) };
const names = args.only ? String(args.only).split(',') : Object.keys(all);
const cache = new Map(), F = (k) => { if (!cache.has(k)) cache.set(k, frame(k)); return cache.get(k); };
const rows = [];
for (const name of names) {
  const { cfg, group } = all[name], c = normalize(cfg), t0 = Date.now();
  const src2 = c.estimate.source === 'source2' ? (k) => F(2 * CUT + 40 - k) : c.reset.source === 'source2' || c.ops.some((o) => o.op === 'map') ? () => bars : null;
  const L = createLoopRef({ w: W, h: H }, c), strip = Buffer.alloc(W * SHOW.length * H * 3); L.begin(T0);
  for (let t = T0; t <= SHOW[SHOW.length - 1]; t++) {
    const r = L.step(t, { src: F(t), src2: src2 ? src2(t) : undefined }), col = SHOW.indexOf(t);
    if (col >= 0) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let k = 0; k < 3; k++) strip[((y * W * SHOW.length) + col * W + x) * 3 + k] = Math.round(Math.min(1, Math.max(0, r.display[(y * W + x) * 4 + k])) * 255);
  }
  const file = name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() + '.png', rawf = join(OUT, file.replace('.png', '.rgb'));
  writeFileSync(rawf, strip);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W * SHOW.length}x${H}`, '-i', rawf, '-frames:v', '1', join(OUT, file)]);
  rows.push({ name, group, file, cfg: c, secs: (Date.now() - t0) / 1000 });
  console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
const summary = (c) => [c.estimate.method === 'flow' ? 'flow' : `block ${c.block}`, c.estimate.source !== 'self' ? `motion from ${c.estimate.source}` : '', `${c.warp.sampling}${c.warp.interp === 'smooth' ? ' smooth' : ''}`,
  c.residual.gain > 0 ? `${c.residual.mode} residual` : 'no residual', c.bloom.repeat > 0 ? `bloom ${c.bloom.repeat}/${c.bloom.every}` : '', c.reset.honourCut > 0 ? `honour cuts ${c.reset.honourCut}` : '',
  c.reset.gop > 0 ? `gop ${c.reset.gop} keep ${c.reset.gopKeep}` : '', c.reset.source === 'source2' ? 'reset to image' : '', c.ops.length ? 'ops: ' + c.ops.map((o) => o.op).join(', ') : '',
  c.inLoop.length ? 'in-loop: ' + c.inLoop.map((o) => o.fx).join(', ') : '', c.post.length ? 'post: ' + c.post.map((o) => o.fx).join(', ') : ''].filter(Boolean).join(' · ');
writeFileSync(join(OUT, 'index.html'), `<!DOCTYPE html><meta charset="utf-8"><title>MOSHINE preset gallery</title>
<style>body{background:#111;color:#ddd;font:13px/1.4 system-ui;margin:16px}h2{font-size:15px;margin:22px 0 4px;color:#fff}p{margin:0 0 6px;color:#aaa}img{display:block;width:100%;max-width:1600px;image-rendering:pixelated;border:1px solid #333}.k{color:#f0a040}</style>
<h1>MOSHINE preset gallery</h1><p>Test clip: testsrc2, a hard cut at frame ${CUT}, a zooming Mandelbrot. Columns: frames ${SHOW.map((t) => t - CUT).map((d) => (d < 0 ? d : '+' + d)).join(', ')} relative to the cut. The loop starts 20 frames before the cut.</p>
${rows.map((r) => `<h2>${r.name} <span class="k">${r.group}</span></h2><p>${summary(r.cfg)}</p><img src="${r.file}" alt="${r.name}">`).join('\n')}`);
console.log(`wrote ${rows.length} strips -> moshine/tests/media/gallery/index.html`);
