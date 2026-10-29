#!/usr/bin/env node
/* The colour sheets: every scheme in schemes.mjs on five formulas, one 480×300 render at a time (one
   page, one browser — the Mac has lagged and once frozen under batch GPU load), then a sheet per family
   in design/colour/sheet-<family>.jpg (the top row is today's look, no shading graph).

     node fractal-engine/design/colour/render-sheet.mjs                 # every family
     node fractal-engine/design/colour/render-sheet.mjs --only film     # one family
     node fractal-engine/design/colour/render-sheet.mjs --probe         # today's row only (framing)
     node fractal-engine/design/colour/render-sheet.mjs --samples 48

   The browser profile is Playwright's own and __fe.dry is set: nothing reaches iori's lineage. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse, format } from '../../core/index.js';
import { parseCollage, formatCollage } from '../../core/collage.js';
import { FAMILIES, schemeShade } from './schemes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const CELLS = path.join(HERE, 'cells');
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const W = 480, H = 300, SAMPLES = +opt('--samples', 40), ONLY = opt('--only', null);

const BOX = 'fold.box 1 · fold.sphere .5 1 · scale 2.5 · +c ×12 bail=100';
// the five columns: [label, document text, camera [yaw, pitch, distance from the origin, (looking at
// the origin) | or [x, y, z, yaw, pitch]]
export const COLUMNS = [
  ['mandelbox cave', process.env.CAVET || BOX, (process.env.CAVE || '0.5,0.2,3.0').split(',').map(Number)],
  ['bulb', 'bulb 8 · +c ×10 bail=4', [0.55, -0.35, 1.75]],
  ['menger / kifs', 'abs · fold.plane 1 -1 0 · fold.plane 0 1 -1 · rotate 10 15 0 · scale 2 · translate -1 -1 -1 ×12 bail=30', [0.6, -0.4, 2.1]],
  ['chimera', '[fold.box 1 · fold.sphere .5 1 · scale 2 ‖ bulb 8] axis .3 2 0 1 · +c ×10 bail=8', [0.55, -0.3, 3.1]],
  ['collage', `{ bulb 8 · +c ×10 bail=2 } at .6 0 0 ∪ .3 { ${BOX} } at -.6 0 0 size .25`, [1.35, -0.3, 3.2]],
];

const camOf = (c) => {
  if (c.length === 5) return c;
  const [yaw, pitch, d] = c, fwd = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  return [...fwd.map((v) => -v * d), yaw, pitch];
};
const isCollage = (t) => t.trim().startsWith('{');
function withShade(text, shade) {
  if (isCollage(text)) { const c = parseCollage(text); if (shade) c.shade = shade; else delete c.shade; return formatCollage(c); }
  const f = parse(text);
  if (shade) f.shade = shade; else delete f.shade;
  return format(f);
}

function loadPlaywright() {
  const dirs = [process.env.PLAYWRIGHT_DIR, path.join(ROOT, 'tools', 'audio-test')];
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8' }).trim();
    dirs.push(path.join(path.dirname(common), 'tools', 'audio-test'));
  } catch {}
  for (const d of dirs.filter(Boolean)) { try { return createRequire(path.join(d, 'package.json'))('playwright'); } catch {} }
  console.error('playwright not found'); process.exit(2);
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml' };
function serve() {
  const srv = http.createServer((req, res) => {
    const p = path.normalize(path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    fs.readFile(p.endsWith(path.sep) ? path.join(p, 'index.html') : p, (err, buf) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || (p.endsWith(path.sep) ? 'text/html' : 'application/octet-stream'), 'Cache-Control': 'no-store' }).end(buf);
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

const srv = await serve();
const base = `http://127.0.0.1:${srv.address().port}`;
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ channel: 'chromium', headless: !flag('--headed'), args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('page error:', e.message));
fs.mkdirSync(CELLS, { recursive: true });

const families = FAMILIES.filter((F) => !ONLY || F.id === ONLY);
const rows = [{ id: 'today', shade: null }, ...(flag('--probe') ? [] : families.flatMap((F) => F.schemes.map((s) => ({ id: s.id, shade: schemeShade(s) }))))];
const t0 = Date.now();

// --diag: each reading's spread on each formula. The reading becomes t through a known map and is
// written as the colour (1 − t, t, 0), so g / (r + g) gives t back whatever the light; percentiles of t
// over the lit pixels, mapped back to the reading's own units.
const DIAG = { col: [1, 0, false], trap: [1 / 24, 16 / 24, true], depth: [1, 0, false], facing: [1, 0, false], lyap: [0.25, 0.5, false] };
const diagShade = (reading) => ({ nodes: [{ id: 'r', type: reading, in: {}, p: {} }, { id: 'ramp', type: 'ramp', in: { v: 'r' },
  p: { stops: [{ t: 0, c: [1, 0, 0, 1] }, { t: 1, c: [0, 1, 0, 1] }], interp: 'linear', space: 'rgb', map: { scale: DIAG[reading][0], offset: DIAG[reading][1], mode: 'clamp', log: DIAG[reading][2], invert: false } } }], out: { color: 'ramp' } });
if (flag('--diag')) {
  const sp = await browser.newPage();
  for (const [ci, [label, text, cam0]] of COLUMNS.entries()) {
    const cam = camOf(cam0);
    await page.goto(`${base}/fractal-engine/?embed=1#${encodeURIComponent(text)}&c=${cam.join(',')}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__fe && window.__fe.state && window.__fe.state.n > 2, null, { timeout: 90000 });
    await page.evaluate(() => { window.__fe.dry = true; window.__fe.hold(true); for (const e of document.body.querySelectorAll('*')) if (!e.contains(document.getElementById('field')) && e.id !== 'field') e.style.visibility = 'hidden'; });
    const line = [];
    for (const rd of Object.keys(DIAG)) {
      await page.evaluate(async ([t, c]) => { window.__fe.setFormula(t, true); window.__fe.setCamera(c.slice(0, 3), c[3], c[4]); if (t.trim().startsWith('{')) await window.__fe.collage(t); }, [withShade(text, diagShade(rd)), cam]);
      await page.evaluate((n) => window.__fe.run(n, 1), 16);
      const png = await page.locator('canvas#field').screenshot({ type: 'png' });
      const q = await sp.evaluate(async (src) => {
        const im = new Image(); im.src = src; await im.decode();
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data, ts = [];
        for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] > 40) ts.push(d[i + 1] / (d[i] + d[i + 1]));
        ts.sort((a, b) => a - b);
        return [0.05, 0.25, 0.5, 0.75, 0.95].map((p) => ts[Math.floor(p * (ts.length - 1))] ?? NaN);
      }, 'data:image/png;base64,' + png.toString('base64'));
      const [sc, of, lg] = DIAG[rd];
      line.push(`${rd} ${q.map((t) => { const v = (t - of) / sc; return lg ? '2^' + v.toFixed(1) : v.toFixed(2); }).join(' ')}`);
    }
    console.log(label.padEnd(15), '\n   ' + line.join('\n   '));
  }
  await browser.close(); srv.close(); process.exit(0);
}
for (const [ci, [label, text, cam0]] of COLUMNS.entries()) {
  if (process.env.COL && +process.env.COL !== ci) continue;
  const cam = camOf(cam0);
  const hash = encodeURIComponent(text) + '&c=' + cam.join(',');
  await page.goto(`${base}/fractal-engine/?embed=1#${hash}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__fe && window.__fe.state && window.__fe.state.n > 2, null, { timeout: 90000 });
  await page.evaluate(() => {
    window.__fe.dry = true; window.__fe.hold(true);
    // the field alone: the hairlines, corners and the site's menu hidden
    const keep = new Set();
    for (let e = document.getElementById('field'); e; e = e.parentElement) keep.add(e);
    for (const e of document.body.querySelectorAll('*')) if (!keep.has(e) && !e.contains(document.getElementById('field'))) e.style.visibility = 'hidden';
  });
  for (const r of rows) {
    const out = path.join(CELLS, `${r.id}-${ci}.jpg`);
    if (r.id === 'today' && fs.existsSync(out) && !flag('--probe')) continue;
    await page.evaluate(async ([t, c]) => {
      window.__fe.setFormula(t, true);
      window.__fe.setCamera(c.slice(0, 3), c[3], c[4]);
      if (t.trim().startsWith('{')) await window.__fe.collage(t);
    }, [withShade(text, r.shade), cam]);
    await page.evaluate((n) => window.__fe.run(n, 1), SAMPLES);
    await page.locator('canvas#field').screenshot({ path: out, type: 'jpeg', quality: 88 });
    console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s  ${label}  ${r.id}`);
  }
}
await page.evaluate(() => window.__fe.release());

// the sheets: a 2-D canvas page (no GPU), cells read back as data URLs
const sheetOf = async (title, ids, file) => {
  const LW = 120, CW = 320, CH = 200, TOP = 40;
  const cells = ids.map((id) => COLUMNS.map((_, ci) => { const p = path.join(CELLS, `${id}-${ci}.jpg`); return fs.existsSync(p) ? 'data:image/jpeg;base64,' + fs.readFileSync(p).toString('base64') : null; }));
  const sp = await browser.newPage({ viewport: { width: LW + CW * COLUMNS.length, height: TOP + CH * ids.length }, deviceScaleFactor: 1 });
  await sp.setContent('<body style="margin:0;background:#000"><canvas id="c"></canvas></body>');
  await sp.evaluate(async ({ cells, ids, cols, title, LW, CW, CH, TOP }) => {
    const c = document.getElementById('c'); c.width = LW + CW * cols.length; c.height = TOP + CH * ids.length;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#ccc'; g.font = '13px ui-monospace, monospace';
    g.fillText(title, 10, 16);
    cols.forEach((l, i) => g.fillText(l, LW + i * CW + 6, TOP - 8));
    for (const [r, row] of cells.entries()) {
      g.fillStyle = '#ccc'; g.fillText(ids[r], 10, TOP + r * CH + CH / 2);
      for (const [i, src] of row.entries()) {
        if (!src) continue;
        const im = new Image(); im.src = src; await im.decode();
        g.drawImage(im, LW + i * CW, TOP + r * CH, CW - 2, CH - 2);
      }
    }
  }, { cells, ids, cols: COLUMNS.map((c) => c[0]), title, LW, CW, CH, TOP });
  await sp.locator('#c').screenshot({ path: file, type: 'jpeg', quality: 86 });
  await sp.close();
  console.log('sheet', path.relative(ROOT, file));
};
if (flag('--probe')) await sheetOf('today (no shading graph)', ['today'], path.join(HERE, 'probe.jpg'));
else for (const F of families) await sheetOf(`${F.title} — top row: today's look`, ['today', ...F.schemes.map((s) => s.id)], path.join(HERE, `sheet-${F.id}.jpg`));
await browser.close();
srv.close();
