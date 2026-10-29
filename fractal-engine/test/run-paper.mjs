#!/usr/bin/env node
/* The paper rig: paper.html in Playwright's Chromium with WebGPU, scrolled figure by figure. Every figure
   must start when it is in view (its engine ready, no error, no NaN in its drawings, its line of notation
   shown), never more than two at once, and none once the references are in view. Then the cover: a tap
   enters a figure, a touch hold there edits it, a tap outside covers it again; the notation figure draws a
   typed formula; nothing reached localStorage or the figure's URL. Exits 1 on a failure.

     node fractal-engine/test/run-paper.mjs             # desktop, 1280×800
     node fractal-engine/test/run-paper.mjs --phone     # 390×844, mobile Chromium with touch
     node fractal-engine/test/run-paper.mjs --shots     # and design/shots/paper-<figure>.jpg
     node fractal-engine/test/run-paper.mjs --only loop # figures whose id holds the word (and the rest of the checks)
     node fractal-engine/test/run-paper.mjs --page metafractal.html   # another paper that embeds the figures (and
                                                                      # its own figures must draw)

   GPU load: one or two engines at a time, but run it alone (the Mac has frozen under two heavy renders). */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SHOTS = path.resolve(HERE, '..', 'design', 'shots');
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const PHONE = flag('--phone');
const ONLY = opt('--only', null);
const PAGE = opt('--page', 'fractal-engine/paper.html');
const TAG = PAGE === 'fractal-engine/paper.html' ? 'paper' : path.basename(PAGE, '.html');

function loadPlaywright() {
  const dirs = [process.env.PLAYWRIGHT_DIR, path.join(ROOT, 'tools', 'audio-test')];
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8' }).trim();
    dirs.push(path.join(path.dirname(common), 'tools', 'audio-test'));
  } catch {}
  for (const d of dirs.filter(Boolean)) {
    try { return createRequire(path.join(d, 'package.json'))('playwright'); } catch {}
  }
  console.error('playwright not found: run `npm i` in tools/audio-test, or set PLAYWRIGHT_DIR'); process.exit(2);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.ttf': 'font/ttf' };
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { chromium } = loadPlaywright();
const srv = await serve();
const base = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch({ channel: 'chromium', headless: !flag('--headed'),
  args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 }, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack || e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}/${PAGE}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__paper, null, { timeout: 20000 });
await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });

const results = [];
async function check(name, fn) {
  let ok = false, note = '';
  try { const r = await fn(); ok = r === true || (r && r.ok); note = r && r.note ? r.note : ''; }
  catch (e) { note = e.message.split('\n')[0]; }
  results.push([name, ok, note]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(22)} ${note}`);
}
const live = () => page.evaluate(() => window.__paper.live());
const toFig = (id) => page.evaluate((id) => document.querySelector(`figure[data-fig="${id}"]`).scrollIntoView({ block: 'center', behavior: 'instant' }), id);
// a figure's engine: ready, its error, NaN in its drawings, its line, how many frames it has blended
const engine = (id) => page.evaluate((id) => {
  const F = window.__paper.figs.get(id);
  let fe = null;
  try { fe = F.iframe && F.iframe.contentWindow.__fe; } catch { /* not loaded */ }
  if (!fe || !fe.ready) return null;
  const d = F.iframe.contentDocument, svg = ['grab', 'structure'].map((k) => d.getElementById(k).innerHTML).join('');
  return { error: fe.error || null, nan: (svg.match(/NaN/g) || []).length, line: F.line.textContent, n: fe.state.n, mode: fe.state.mode };
}, id);

await check('nothing runs unseen', async () => { await sleep(1200); const l = await live(); return { ok: l.length === 0, note: `live at the top: ${l.length}` }; });

const ids = await page.evaluate(() => [...window.__paper.figs.keys()]);
let most = 0;
for (const id of ids) {
  if (ONLY && !id.includes(ONLY)) continue;
  await check(`figure ${id}`, async () => {
    await toFig(id);
    const t0 = Date.now();
    let e = null;
    while (Date.now() - t0 < 45000) {
      most = Math.max(most, (await live()).length);
      e = await engine(id);
      if (e && e.n > 8 && e.line) break;
      await sleep(250);
    }
    if (!e) return { note: 'never started' };
    await sleep(600);
    e = await engine(id);
    if (flag('--shots')) {
      fs.mkdirSync(SHOTS, { recursive: true });
      await page.locator(`figure[data-fig="${id}"]`).screenshot({ path: path.join(SHOTS, `${TAG}-${PHONE ? 'phone-' : ''}${id}.jpg`), type: 'jpeg', quality: 72, scale: 'css' });
    }
    const l = await live();
    return { ok: l.includes(id) && !e.error && !e.nan && !!e.line, note: `${((Date.now() - t0) / 1000).toFixed(1)} s, live ${l.join(',')}${e.error ? ' error ' + e.error : ''}${e.nan ? ` NaN×${e.nan}` : ''}` };
  });
}
// a page's own figures (metafractal.html, radiance-fields.html): each draws once in view
const locals = await page.evaluate(() => [...document.querySelectorAll('figure.local')].map((f) => f.id));
for (const id of locals) {
  await check(`page figure ${id}`, async () => {
    await page.evaluate((id) => document.getElementById(id).scrollIntoView({ block: 'center', behavior: 'instant' }), id);
    await sleep(1500);
    const r = await page.evaluate((id) => {
      const el = document.getElementById(id), st = el.querySelector('.status');
      // a 2-D canvas with more than one colour on it, or a status line the figure wrote after drawing
      const inked = [...el.querySelectorAll('canvas')].some((c) => {
        const ctx = c.getContext('2d'); if (!ctx || !c.width) return false;
        const d = ctx.getImageData(0, 0, c.width, c.height).data; let lo = 255, hi = 0;
        for (let i = 0; i < d.length; i += 4 * 97) { lo = Math.min(lo, d[i]); hi = Math.max(hi, d[i]); }
        return hi - lo > 40;
      });
      return { inked, status: st ? st.textContent : '' };
    }, id);
    if (flag('--shots')) { fs.mkdirSync(SHOTS, { recursive: true }); await page.locator(`#${id}`).screenshot({ path: path.join(SHOTS, `${TAG}-${PHONE ? 'phone-' : ''}${id}.jpg`), type: 'jpeg', quality: 72, scale: 'css' }); }
    return { ok: r.inked || !!r.status, note: r.status.slice(0, 90) };
  });
}
await check('at most two at once', async () => ({ ok: most <= 2, note: `most live: ${most}` }));
await check('none past the figures', async () => {
  await page.evaluate(() => document.getElementById('references').scrollIntoView({ behavior: 'instant' }));
  await sleep(800);
  const n = await page.evaluate(() => document.querySelectorAll('figure.engine iframe').length);
  return { ok: n === 0, note: `iframes: ${n}` };
});

// the cover: a tap enters, a hold in the figure grabs at the centre and edits, a tap outside covers it again
// a pull figure to grab in (push has no grab; a touch grab aims at the centre, which must be surface)
const GRAB = ['grab', 'lens', 'lyap', 'tetraPull'].find((k) => ids.includes(k)) || ids[0];
await check('tap enters, hold edits', async () => {
  await toFig(GRAB);
  const box = await page.locator(`figure[data-fig="${GRAB}"] .fe-frame`).boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction((G) => { const F = window.__paper.figs.get(G); try { return F.iframe.contentWindow.__fe.ready; } catch { return false; } }, GRAB, { timeout: 45000 });
  const entered = await page.evaluate((G) => window.__paper.figs.get(G).el.classList.contains('entered'), GRAB);
  const t0 = await page.evaluate((G) => window.__paper.figs.get(G).iframe.contentWindow.__fe.state.text, GRAB);
  const cdp = await ctx.newCDPSession(page);
  const at = (x, y) => [{ x: box.x + x, y: box.y + y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(60, box.height / 2) });
  await sleep(700);
  for (let k = 1; k <= 10; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(60 + k * 8, box.height / 2) }); await sleep(30); }
  const grab = await page.evaluate((G) => window.__paper.figs.get(G).iframe.contentWindow.__fe.input.grab, GRAB);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
  const t1 = await page.evaluate((G) => window.__paper.figs.get(G).iframe.contentWindow.__fe.state.text, GRAB);
  return { ok: entered && !!grab && t1 !== t0, note: `entered ${entered}, grab ${grab ? grab.key : 'none'}, edited ${t1 !== t0}` };
});
await check('tap outside covers', async () => {
  const cap = await page.locator(`figure[data-fig="${GRAB}"] figcaption`).boundingBox();
  await page.touchscreen.tap(cap.x + 20, cap.y + 8);
  await sleep(200);
  const covered = await page.evaluate((G) => { const F = window.__paper.figs.get(G); return !F.el.classList.contains('entered') && !F.cover.hidden; }, GRAB);
  return { ok: covered };
});
if (ids.includes('notation')) await check('notation draws a formula', async () => {
  await toFig('notation');
  await page.fill('form.fe-try input', 'bulb 8 · +c ×10 bail=2');
  await page.click('form.fe-try button[type=submit]');
  await page.waitForFunction(() => { const F = window.__paper.figs.get('notation'); try { return F.iframe.contentWindow.__fe.ready; } catch { return false; } }, null, { timeout: 45000 });
  await sleep(1500);
  const text = await page.evaluate(() => window.__paper.figs.get('notation').iframe.contentWindow.__fe.state.text);
  return { ok: text.startsWith('bulb'), note: text };
});
await check('nothing stored', async () => {
  const r = await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('fractal-engine'));
    const hashes = [...window.__paper.figs.values()].filter((F) => F.iframe).map((F) => F.iframe.contentWindow.location.hash);
    const src = [...window.__paper.figs.values()].filter((F) => F.iframe).map((F) => F.iframe.src.split('#')[1] || '');
    return { keys, same: hashes.every((h, i) => h.slice(1) === src[i]) };
  });
  return { ok: r.keys.length === 0 && r.same, note: `localStorage ${r.keys.join(',') || 'clean'}, hashes ${r.same ? 'as loaded' : 'rewritten'}` };
});
await check('no page errors', async () => ({ ok: errors.length === 0, note: errors.slice(0, 3).join(' | ') }));

await browser.close();
srv.close();
const failed = results.filter((r) => !r[1]).length;
console.log(`\n${results.length - failed}/${results.length} pass${PHONE ? ' (phone)' : ''}`);
process.exit(failed ? 1 : 0);
