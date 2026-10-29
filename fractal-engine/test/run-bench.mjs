#!/usr/bin/env node
/* The benchmark rig: fixed scenes, cameras and a fixed resolution, timed on the GPU, with a quality guard.

     node fractal-engine/test/run-bench.mjs                     # every scene, guarded against the reference
     node fractal-engine/test/run-bench.mjs --only box-cave,bulb
     node fractal-engine/test/run-bench.mjs --no-guard          # timings only
     node fractal-engine/test/run-bench.mjs --ref <commit>      # guard against another commit
     node fractal-engine/test/run-bench.mjs --retime-ref        # re-time the reference in this run (A/B)
     node fractal-engine/test/run-bench.mjs --json out.json --size 1440x900 --samples 64

   Per pull scene it drives the renderer directly (__fe.view, __fe.engines; the live loop is stopped):
     compile   ms for the structure JIT and the literal JIT of the scene's formula (a collage: its march)
     still     the march pass's GPU time (timestamp queries) per still frame (shadows, 5-tap AO, literal
               JIT), median over the run, and the wall time to `--samples` samples: the converged still
     moving    the same for moving frames (no shadows, 2-tap AO, structure JIT)
   Push and the loop run through the app's own step(); their time is wall time per frame (submit → done).

   The guard: every pull scene's image after `--samples` still samples and after one moving sample,
   tonemapped as the display pass does, against the same scene rendered by the reference commit with the
   same seeds. Pass: PSNR ≥ 40 dB and SSIM ≥ 0.99 for each (DESIGN.md "Performance" says why). Same
   seeds, so an unchanged renderer is bit-identical (PSNR ∞). Push and the loop are stochastic in their
   atomics and are not image-guarded.

   The reference: by default the commit "fractal engine bench: the rig" (the first with the hooks). Its
   fractal-engine/ is extracted once into fractal-engine/bench-ref/<hash>/ (git-ignored) and rendered there; its
   images and timings are cached beside it. Images: fractal-engine/bench-ref/<hash>/<scene>-{still,moving}.png and
   fractal-engine/bench-ref/current/ for this tree.

   GPU load: one browser, one page, one scene at a time — the Mac froze under two heavy renders at once.
   A full run is ~2 minutes of continuous GPU; --only runs a short burst. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
// outside test/: `node --test fractal-engine/test/` would run the extracted tree's rigs
const REF_DIR = path.join(HERE, '..', 'bench-ref');
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const [W, H] = opt('--size', '1440x900').split('x').map(Number);
const SAMPLES = +opt('--samples', 64);
const MOVING = +opt('--moving', 16);
const GUARD = !flag('--no-guard');
const PSNR_MIN = 40, SSIM_MIN = 0.99;
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();

// ---------- scenes ----------------------------------------------------------------------------------
// cam: [pos, yaw, pitch], or [distance, yaw, pitch] looking at the origin (the app's frameAt). The two
// slowest scenes (a frame near a second at baseline) take fewer samples: a long run of second-long
// dispatches is the load that froze the Mac.
const BOX = 'fold.box 1 · fold.sphere .5 1 · scale 2.5 · +c ×12 bail=100';
const SCENES = [
  { id: 'box-cave', doc: BOX, cam: [[-1.979, -1.43, -2.071], -1.156, -0.2] },
  { id: 'bulb', doc: 'bulb 8 · +c ×10 bail=4', cam: [2.4, 0.6, -0.35] },
  { id: 'menger', doc: 'abs · sort · scale 3 · translate -2 -2 · fold.plane 0 0 -1 -1 ×8 bail=50', cam: [2.6, 0.5, -0.4] },
  { id: 'kifs', doc: 'abs · fold.plane 1 -1 0 · fold.plane 0 1 -1 · rotate 10 15 0 · scale 2 · translate -1 -1 -1 ×12 bail=30', cam: [3.2, 0.4, -0.3] },
  { id: 'driven-bulb', doc: { driven: 0 }, cam: [2.4, 0.6, -0.35] },
  { id: 'driven-box', doc: { driven: 1 }, cam: [[-1.979, -1.43, -2.071], -1.156, -0.2], samples: 16, moving: 4 },
  { id: 'chimera', samples: 16, moving: 4, doc: '[fold.box 1 · fold.sphere .5 1 · scale 2.5 ‖ abs · sort · scale 3 · + -2 -2 0] axis .5 1.5 1 1 0 0 · +c ×12 bail=100', cam: [[-1.979, -1.43, -2.071], -1.156, -0.2] },
  { id: 'collage3', doc: { collage: 'three: turn, polar, chamfer cut' }, cam: [3.4, 0.5, -0.45] },
  { id: 'cl-union', doc: { collage: 'union quad' }, cam: [2.2, 0.5, -0.45] },
  { id: 'push-chimera', mode: 'push', doc: '[fold.box 1 · fold.sphere .5 1 · scale 2.5 ‖ abs · sort · scale 3 · + -2 -2 0] axis .5 1.5 1 1 0 0 · +c ×12 bail=100', cam: [6, 0.5, -0.3] },
  { id: 'push-box', mode: 'push', doc: BOX, cam: [6, 0.5, -0.3] },
  { id: 'loop', mode: 'loop', doc: BOX, cam: [[-1.979, -1.43, -2.071], -1.156, -0.2] },
];

// ---------- the page side -----------------------------------------------------------------------------
// every function below runs in the page (page.evaluate), so it may use only its arguments

async function pageSetup(sc) {
  const fe = window.__fe;
  fe.dry = true;
  fe.quiet(true);
  window.requestAnimationFrame = () => 0;   // the live loop stops: the rig submits every frame itself
  await new Promise((r) => setTimeout(r, 50));
  const { R } = fe.engines;
  let doc = sc.doc, collage = false;
  if (doc.driven != null) doc = (await import('/fractal-engine/test/driven-cases.js')).DRIVEN[doc.driven][0];
  const compile = {};
  const t0 = performance.now();
  if (doc.collage) {
    const { COLLAGES } = await import('/fractal-engine/test/collage-cases.js');
    await fe.collage(COLLAGES.find((c) => c[0] === doc.collage)[1]);
    compile.collage = performance.now() - t0;
    // the pieces' JITs, where the renderer has them (it draws with the interpreter's march until then)
    if (R.collageJitReady) { const t = performance.now(); await R.collageJitReady(); compile.jit = performance.now() - t; }
    collage = true;
  } else fe.setFormula(doc, true);
  // the camera: a position, or a distance from the origin along -forward
  const [a, yaw, pitch] = sc.cam;
  const cp = Math.cos(pitch), fwd = [Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp];
  fe.setCamera(Array.isArray(a) ? a : fwd.map((v) => -v * a), yaw, pitch);
  fe.hold(true);
  fe.state.mode = sc.mode || 'pull';
  if (!collage) {
    // setFormula started the structure JIT in the background: the time until it draws; then the literal
    // JIT, which the live loop starts once the view is still (the rig stopped the loop: it starts it)
    while (R.pipelineKind === 'interpreter' && performance.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 5));
    compile.structure = performance.now() - t0;
    const t = performance.now();
    await R.compileJit(fe.state.formula);
    compile.literal = performance.now() - t;
  }
  await fe.sense();
  // what sets the march's step: the measured drivers' factor L, and the unsafe flag (steps × 0.3)
  const head = R.packed && new Uint32Array(R.packed.head);
  return { compile, pipeline: R.pipelineKind, L: fe.state.sensed ? fe.state.sensed.step || 1 : null, unsafe: !!(head && head[2] & 2) };
}

// n frames of the pull view straight into the renderer; seeds 0…n-1 so every run draws the same samples
async function pagePull({ moving, n, w, h }) {
  const fe = window.__fe, { R } = fe.engines;
  R.resize(w, h);
  R.setTiming(true);
  const v = fe.view(moving);
  const gpu = [], wall = [];
  // two frames to warm the pipeline (not counted), then the run from sample 0
  for (let i = 0; i < n + 2; i++) {
    const k = i < 2 ? 0 : i - 2;
    v.frame = k; v.blend = 1 / (k + 1);
    const t0 = performance.now();
    R.frame(v);
    await R.device.queue.onSubmittedWorkDone();
    const ms = performance.now() - t0, g = await R.marchMs();
    if (i >= 2) { wall.push(ms); gpu.push(g); }
  }
  R.setTiming(false);
  const a = await R.readAccum();
  // the display pass's tonemap (gpu/render.js DISPLAY): exposure, ACES, sRGB, 8 bits
  const ex = v.exposure, out = new Uint8Array(a.w * a.h * 3);
  const aces = (x) => Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
  const srgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  for (let i = 0, j = 0; i < a.data.length; i += 4) for (let c = 0; c < 3; c++) out[j++] = Math.round(255 * srgb(aces(a.data[i + c] * ex)));
  let s = '';
  for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
  // a moving frame never takes the literal JIT (gpu/render.js pipeFor)
  const kind = R.pipelineKind;
  return { gpu, wall, w: a.w, h: a.h, img: btoa(s), pipeline: moving && kind === 'literal' ? 'structure' : kind };
}

// n frames of push or the loop through the app's own step(); wall time per frame
async function pageStep(n) {
  const fe = window.__fe;
  fe.state.n = 0;
  const wall = [];
  for (let i = 0; i < n + 2; i++) {
    const t0 = performance.now();
    await fe.run(1, 1);
    if (i >= 2) wall.push(performance.now() - t0);
  }
  return { wall };
}

// ---------- the node side -------------------------------------------------------------------------------

function loadPlaywright() {
  const dirs = [process.env.PLAYWRIGHT_DIR, path.join(ROOT, 'tools', 'audio-test')];
  try { dirs.push(path.join(path.dirname(git('rev-parse', '--path-format=absolute', '--git-common-dir')), 'tools', 'audio-test')); } catch {}
  for (const d of dirs.filter(Boolean)) {
    try { return createRequire(path.join(d, 'package.json'))('playwright'); } catch {}
  }
  console.error('playwright not found: run `npm i` in tools/audio-test, or set PLAYWRIGHT_DIR'); process.exit(2);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
// roots in order: a file missing from the first (a reference tree holds only fractal-engine/) comes from the next
function serve(roots) {
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const tryRoot = (k) => {
      if (k >= roots.length) { res.writeHead(404).end(); return; }
      let p = path.normalize(path.join(roots[k], rel));
      if (!p.startsWith(roots[k])) { res.writeHead(403).end(); return; }
      if (rel.endsWith('/')) p = path.join(p, 'index.html');
      fs.readFile(p, (err, buf) => {
        if (err) { tryRoot(k + 1); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(buf);
      });
    };
    tryRoot(0);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

function png(file, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]));
}
function readPng(file) {
  const b = fs.readFileSync(file);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  const idat = [];
  for (let o = 8; o < b.length;) { const n = b.readUInt32BE(o), t = b.toString('ascii', o + 4, o + 8); if (t === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + n)); o += 12 + n; }
  const raw = zlib.inflateSync(Buffer.concat(idat)), rgb = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) raw.copy(rgb, y * w * 3, y * (w * 3 + 1) + 1, (y + 1) * (w * 3 + 1));
  return { w, h, rgb };
}

// PSNR over the 8-bit RGB; SSIM on luma in 8×8 windows stepped by 4 (the standard constants)
function compare(a, b) {
  if (a.w !== b.w || a.h !== b.h) return { psnr: 0, ssim: 0, note: 'size differs' };
  let se = 0, worst = 0;
  for (let i = 0; i < a.rgb.length; i++) { const d = a.rgb[i] - b.rgb[i]; se += d * d; if (Math.abs(d) > worst) worst = Math.abs(d); }
  const mse = se / a.rgb.length, psnr = mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
  const luma = (x) => { const L = new Float32Array(x.w * x.h); for (let i = 0; i < L.length; i++) L[i] = 0.299 * x.rgb[i * 3] + 0.587 * x.rgb[i * 3 + 1] + 0.114 * x.rgb[i * 3 + 2]; return L; };
  const A = luma(a), B = luma(b), C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2;
  let sum = 0, n = 0;
  for (let y = 0; y + 8 <= a.h; y += 4) for (let x = 0; x + 8 <= a.w; x += 4) {
    let ma = 0, mb = 0;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const k = (y + j) * a.w + x + i; ma += A[k]; mb += B[k]; }
    ma /= 64; mb /= 64;
    let va = 0, vb = 0, cov = 0;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const k = (y + j) * a.w + x + i, da = A[k] - ma, db = B[k] - mb; va += da * da; vb += db * db; cov += da * db; }
    va /= 63; vb /= 63; cov /= 63;
    sum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2)); n++;
  }
  return { psnr, ssim: sum / n, worst };
}

const samplesOf = (sc) => Math.min(SAMPLES, sc.samples || SAMPLES);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
const sum = (a) => a.reduce((x, y) => x + y, 0);
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's';

// one tree (this one, or a reference's), every scene: timings and images into outDir
async function benchTree(chromium, roots, outDir, scenes, label) {
  fs.mkdirSync(outDir, { recursive: true });
  const srv = await serve(roots);
  const base = `http://127.0.0.1:${srv.address().port}`;
  // --enable-webgpu-developer-features: timestamps at full resolution (not quantised to 100 µs)
  const browser = await chromium.launch({ channel: 'chromium', headless: !flag('--headed'),
    args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--enable-webgpu-developer-features'] });
  const results = {};
  try {
    for (const sc of scenes) {
      const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`${base}/fractal-engine/`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__fe && (window.__fe.ready || window.__fe.error), null, { timeout: 60000 });
      const r = { errors };
      Object.assign(r, await page.evaluate(pageSetup, sc));
      if (!sc.mode) {
        for (const [kind, moving, n] of [['still', false, samplesOf(sc)], ['moving', true, Math.min(MOVING, sc.moving || MOVING)]]) {
          const p = await page.evaluate(pagePull, { moving, n, w: W, h: H });
          r[kind] = { gpuMs: median(p.gpu), wallMs: median(p.wall), totalMs: sum(p.wall), n, pipeline: p.pipeline };
          // the guard's moving image is one sample alone: what a moving frame shows
          const im = moving ? await page.evaluate(pagePull, { moving: true, n: 1, w: W, h: H }) : p;
          png(path.join(outDir, `${sc.id}-${kind}.png`), im.w, im.h, Buffer.from(im.img, 'base64'));
        }
      } else {
        const p = await page.evaluate(pageStep, MOVING * 2);
        r.step = { wallMs: median(p.wall), n: p.wall.length };
      }
      results[sc.id] = r;
      const f = (x) => (x == null || Number.isNaN(x) ? '—' : x.toFixed(1));
      console.log(`${secs()}  ${label.padEnd(8)} ${sc.id.padEnd(13)} ` + (r.still
        ? `still ${f(r.still.gpuMs)} ms (${r.still.pipeline}) → ${r.still.n} spp ${(r.still.totalMs / 1000).toFixed(2)} s   moving ${f(r.moving.gpuMs)} ms (${r.moving.pipeline})   compile ${Object.entries(r.compile).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' ')}   L ${r.L == null ? '—' : r.L.toFixed(2)}${r.unsafe ? ' unsafe' : ''}`
        : `${sc.mode} ${f(r.step.wallMs)} ms/frame (wall)`) + (errors.length ? `   errors: ${errors.length}` : ''));
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ size: [W, H], samples: SAMPLES, results }, null, 1));
  return results;
}

const only = opt('--only') ? opt('--only').split(',') : null;
const scenes = SCENES.filter((s) => !only || only.includes(s.id));
const { chromium } = loadPlaywright();

let ref = null, refHash = null;
if (GUARD) {
  refHash = opt('--ref') ? git('rev-parse', opt('--ref')) : git('log', '-1', '--format=%H', '--grep=^fractal engine bench: the rig');
  if (!refHash) { console.error('no reference commit: pass --ref <commit>, or --no-guard'); process.exit(2); }
  const dir = path.join(REF_DIR, refHash.slice(0, 10));
  const cached = fs.existsSync(path.join(dir, 'results.json')) && JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8'));
  const missing = scenes.filter((s) => !cached || !cached.results[s.id] || cached.size[0] !== W || cached.size[1] !== H || (!s.mode && cached.results[s.id].still.n !== samplesOf(s)));
  ref = cached ? cached.results : {};
  if (missing.length || flag('--retime-ref')) {
    const tree = path.join(dir, 'tree');
    if (!fs.existsSync(path.join(tree, 'fractal-engine'))) {
      fs.mkdirSync(tree, { recursive: true });
      execFileSync('sh', ['-c', `git archive ${refHash} fractal-engine | tar -x -C "${tree}"`], { cwd: ROOT });
    }
    console.log(`${secs()}  reference ${refHash.slice(0, 10)}`);
    const todo = flag('--retime-ref') ? scenes : missing;
    Object.assign(ref, await benchTree(chromium, [tree, ROOT], dir, todo, 'ref'));
    fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify({ size: [W, H], samples: SAMPLES, results: ref }, null, 1));
  }
}

console.log(`${secs()}  this tree`);
const curDir = path.join(REF_DIR, 'current');
const cur = await benchTree(chromium, [ROOT], curDir, scenes, 'current');

// ---------- the report ----------------------------------------------------------------------------------
let ok = true;
const pad = (s, n) => String(s).padEnd(n);
const f1 = (x) => (x == null || Number.isNaN(x) ? '—' : x.toFixed(1));
const gain = (a, b) => (a && b ? `×${(a / b).toFixed(2)}` : '');
console.log(`\n${W}×${H}; GPU ms per frame (median, march pass); converged = wall time to ${SAMPLES} still samples (16 for driven-box, chimera)` + (ref ? `; reference ${refHash.slice(0, 10)}` : ''));
console.log(pad('scene', 14) + pad('still', 18) + pad('converged s', 16) + pad('moving', 18) + (ref ? pad('guard still', 22) + 'guard moving' : ''));
for (const sc of scenes) {
  const c = cur[sc.id], r = ref && ref[sc.id];
  if (c.errors.length) { ok = false; console.log(`  ${sc.id}: page errors\n    ` + c.errors.join('\n    ')); }
  if (!c.still) { console.log(pad(sc.id, 14) + `${sc.mode} ${f1(c.step.wallMs)} ms wall` + (r && r.step ? `  (ref ${f1(r.step.wallMs)} ${gain(r.step.wallMs, c.step.wallMs)})` : '')); continue; }
  let line = pad(sc.id, 14)
    + pad(`${f1(c.still.gpuMs)}${r ? ` ${gain(r.still.gpuMs, c.still.gpuMs)}` : ''}`, 18)
    + pad(`${(c.still.totalMs / 1000).toFixed(2)}${r ? ` ${gain(r.still.totalMs, c.still.totalMs)}` : ''}`, 16)
    + pad(`${f1(c.moving.gpuMs)}${r ? ` ${gain(r.moving.gpuMs, c.moving.gpuMs)}` : ''}`, 18);
  if (ref) for (const kind of ['still', 'moving']) {
    const q = compare(readPng(path.join(curDir, `${sc.id}-${kind}.png`)), readPng(path.join(REF_DIR, refHash.slice(0, 10), `${sc.id}-${kind}.png`)));
    const pass = q.psnr >= PSNR_MIN && q.ssim >= SSIM_MIN;
    if (!pass) ok = false;
    c[`guard_${kind}`] = q;
    line += pad(`${pass ? 'ok' : 'FAIL'} ${q.psnr === Infinity ? '∞' : q.psnr.toFixed(1)} dB ${q.ssim.toFixed(4)}`, 22);
  }
  console.log(line);
}
if (flag('--json')) fs.writeFileSync(opt('--json'), JSON.stringify({ size: [W, H], samples: SAMPLES, ref: refHash, current: cur, reference: ref }, null, 1));
console.log(`\n${ok ? 'PASS' : 'FAIL'}  (${secs().trim()})`);
process.exit(ok ? 0 : 1);
