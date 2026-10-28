#!/usr/bin/env node
/* The touch rig: the app at phone size (390×844, Playwright's mobile Chromium with touch, WebGPU on),
   driven by real touch events through the DevTools protocol (Input.dispatchTouchEvent), so the
   browser's own touch → pointer path runs, multi-finger included. Each gesture in DESIGN.md "Touch"
   is one check; the app's state (`__fe.input`, `__fe.state`) is the verdict. Exits 1 on a failure.

     node fractal-engine/test/run-touch.mjs              # every check
     node fractal-engine/test/run-touch.mjs --shots      # and a JPEG per check in design/shots/touch-*.jpg
     node fractal-engine/test/run-touch.mjs --only grab  # checks whose name holds the word
     node fractal-engine/test/run-touch.mjs --size 820x1180 (a tablet) --headed
     node fractal-engine/test/run-touch.mjs --desktop    # the mouse and keys instead, 1280×800: unchanged?

   The browser profile is Playwright's, fresh and thrown away: nothing reaches iori's lineage or
   Metasurface layout. `__fe.dry` is still set, and lifted only where a check needs the lineage to grow.
   GPU load: one page — run it alone (the Mac has frozen under two heavy renders at once). */
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
const [W, H] = opt('--size', '390x844').split('x').map(Number);
const ONLY = opt('--only', null);

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

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
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

// fingers: the protocol takes the whole set of touching points each time; a point that is new is
// pressed, one that is gone is lifted
function fingers(cdp) {
  const on = new Map();
  const send = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...on.entries()].map(([id, [x, y]]) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
  const F = {
    async down(id, x, y) { on.set(id, [x, y]); await send('touchStart'); },
    async move(id, x, y) { on.set(id, [x, y]); await send('touchMove'); },
    // one finger of several: a touchEnd naming the finger lifted (the others stay down)
    async up(id) {
      const p = on.get(id);
      on.delete(id);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: on.size && p ? [{ x: p[0], y: p[1], id }] : [] });
    },
    async upAll() { on.clear(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); },
    // a straight stroke of several fingers together: from [[x, y], …] to [[x, y], …] in n steps
    async stroke(ids, from, to, n = 12, ms = 16) {
      for (let k = 1; k <= n; k++) {
        ids.forEach((id, i) => on.set(id, [from[i][0] + ((to[i][0] - from[i][0]) * k) / n, from[i][1] + ((to[i][1] - from[i][1]) * k) / n]));
        await send('touchMove');
        await sleep(ms);
      }
    },
    async tap(points, hold = 60) {
      for (const [i, [x, y]] of points.entries()) on.set(100 + i, [x, y]);
      await send('touchStart');
      await sleep(hold);
      await F.upAll();
    },
  };
  return F;
}

const { chromium } = loadPlaywright();
const srv = await serve();
const base = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch({ channel: 'chromium', headless: !flag('--headed'),
  args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const DESK = flag('--desktop');
const ctx = await browser.newContext(DESK ? { viewport: { width: 1280, height: 800 } } : { viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack || e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}/fractal-engine/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__fe && window.__fe.state && window.__fe.state.n > 4, null, { timeout: 60000 });
await page.evaluate(() => { window.__fe.dry = true; });
const cdp = await ctx.newCDPSession(page);
const T = fingers(cdp);
const fe = (f, a) => page.evaluate(f, a);
const input = () => fe(() => window.__fe.input);
const settle = async (frames = 24) => { const n0 = await fe(() => window.__fe.state.n); await page.waitForFunction((n) => window.__fe.state.n >= n || window.__fe.state.n < 2, n0 + frames, { timeout: 20000 }).catch(() => {}); };
const shot = async (name) => { if (flag('--shots')) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `touch-${name}.jpg`), type: 'jpeg', quality: 72, scale: 'css' }); } };
const cx = DESK ? 640 : W / 2, cy = DESK ? 400 : H / 2;

const results = [];
async function check(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  if (DESK !== name.startsWith('desktop')) return;
  let ok = false, note = '';
  try { const r = await fn(); ok = r === true || (r && r.ok); note = r && r.note ? r.note : ''; }
  catch (e) { note = e.message.split('\n')[0]; }
  await T.upAll().catch(() => {});
  await sleep(150);
  results.push([name, ok, note]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(26)} ${note}`);
}
const cam = () => fe(() => JSON.parse(JSON.stringify(window.__fe.state.cam)));
const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

await settle(40);
await shot(DESK ? 'desktop-arrive' : 'arrive');

if (DESK) {
  const M = page.mouse;
  await check('desktop: drag looks', async () => {
    const c0 = await cam();
    await M.move(cx, cy); await M.down(); await M.move(cx + 80, cy + 20, { steps: 6 }); await M.up();
    const c1 = await cam();
    return { ok: c1.yaw !== c0.yaw && dist(c0.pos, c1.pos) === 0, note: `yaw ${(c1.yaw - c0.yaw).toFixed(3)}` };
  });
  await check('desktop: wheel moves', async () => {
    const c0 = await cam();
    await M.move(cx, cy); await M.wheel(0, -200); await sleep(100);
    const c1 = await cam();
    return { ok: dist(c0.pos, c1.pos) > 0, note: `moved ${dist(c0.pos, c1.pos).toExponential(2)}` };
  });
  await check('desktop: hold grabs at the cursor', async () => {
    await M.move(cx + 10, cy + 10); await M.down(); await sleep(700);
    const a = await input();
    await page.keyboard.down('Shift'); await sleep(300);
    const b = await input();
    await page.keyboard.up('Shift'); await sleep(100);
    await M.up();
    return { ok: a.grab && a.grab.x === cx + 10 && a.grab.y === cy + 10 && b.lens, note: a.grab ? `grab at (${a.grab.x}, ${a.grab.y}), Shift lens ${b.lens}` : 'no grab' };
  });
  await check('desktop: dblclick, Tab, no key row', async () => {
    const m0 = (await input()).mode;
    await M.dblclick(cx, cy + 200); await sleep(500);
    const m1 = (await input()).mode;
    await page.keyboard.press('Tab'); await sleep(200);
    const keys = await fe(() => document.querySelectorAll('#structure [data-key]').length);
    const s = (await input()).structure;
    await page.keyboard.press('Tab'); await page.keyboard.press('KeyP'); await page.keyboard.press('KeyP');
    return { ok: m1 !== m0 && s && keys === 0, note: `${m0} → ${m1}, structure ${s}, keys ${keys}` };
  });
  await check('desktop: long hold, ring at the cursor', async () => {
    await M.move(cx - 200, cy); await M.down(); await sleep(2600);
    const a = await input();
    await M.up();
    return { ok: !!a.ring, note: `ring ${!!a.ring}` };
  });
}

await check('pan two fingers', async () => {
  const c0 = await cam();
  await T.down(1, cx - 40, cy); await T.down(2, cx + 40, cy);
  await T.stroke([1, 2], [[cx - 40, cy], [cx + 40, cy]], [[cx + 20, cy + 50], [cx + 100, cy + 50]]);
  await T.upAll();
  const c1 = await cam();
  return { ok: dist(c0.pos, c1.pos) > 0 && Math.abs(c0.yaw - c1.yaw) < 1e-9, note: `moved ${dist(c0.pos, c1.pos).toExponential(2)}, yaw kept` };
});

await check('pinch forward', async () => {
  const c0 = await cam();
  await T.down(1, cx - 30, cy); await T.down(2, cx + 30, cy);
  await T.stroke([1, 2], [[cx - 30, cy], [cx + 30, cy]], [[cx - 120, cy], [cx + 120, cy]]);
  await T.upAll();
  const c1 = await cam();
  const fwd = await fe(() => { const c = window.__fe.state.cam, cp = Math.cos(c.pitch); return [Math.sin(c.yaw) * cp, Math.sin(c.pitch), Math.cos(c.yaw) * cp]; });
  const along = c1.pos.reduce((s, v, i) => s + (v - c0.pos[i]) * fwd[i], 0);
  return { ok: along > 0, note: `along the view ${along.toExponential(2)}` };
});

await check('look one finger', async () => {
  const c0 = await cam();
  await T.down(1, cx, cy); await T.stroke([1], [[cx, cy]], [[cx + 80, cy + 30]], 8); await T.upAll();
  const c1 = await cam();
  return { ok: c1.yaw !== c0.yaw && dist(c0.pos, c1.pos) === 0, note: `yaw ${(c1.yaw - c0.yaw).toFixed(3)}` };
});

await check('tap two fingers: parent', async () => {
  // grow the lineage by one real grab drag (the profile is Playwright's own)
  await fe(() => { window.__fe.dry = false; });
  const t0 = await fe(() => window.__fe.state.text);
  await T.down(1, cx + 60, cy + 120); await sleep(900);
  const g = await input();
  await T.stroke([1], [[cx + 60, cy + 120]], [[cx + 140, cy + 120]], 8); await T.upAll();
  await sleep(200);
  const t1 = await fe(() => window.__fe.state.text);
  await fe(() => { window.__fe.dry = true; });
  await T.tap([[cx - 40, cy], [cx + 40, cy]]);
  await sleep(500);
  const t2 = await fe(() => window.__fe.state.text);
  await T.tap([[cx - 40, cy], [cx, cy + 40], [cx + 40, cy]]);
  await sleep(500);
  const t3 = await fe(() => window.__fe.state.text);
  return { ok: !!g.grab && t1 !== t0 && t2 === t0 && t3 === t1, note: `grab ${g.grab && g.grab.key} at (${g.grab && g.grab.x},${g.grab && g.grab.y}); edit, back, forward` };
});

await check('a document set mid-morph wins', async () => {
  // two fingers start the 350 ms morph to the parent; a document set during it must stay
  const t0 = await fe(() => window.__fe.state.text);
  await T.tap([[cx - 40, cy], [cx + 40, cy]]);
  const during = await fe(() => !!window.__fe.state.trans);
  const bulb = await fe(() => { window.__fe.setFormula('bulb 8 · +c ×10 bail=2'); return window.__fe.state.text; });
  await sleep(700);
  const t1 = await fe(() => window.__fe.state.text);
  await fe((t) => window.__fe.setFormula(t), t0);
  await settle(10);
  return { ok: during && t1 === bulb, note: `morph under way ${during}, after it: ${t1 === bulb ? 'the new document' : t1.slice(0, 40)}` };
});

await check('grab aims at the centre', async () => {
  await T.down(1, 70, H - 160); await sleep(900);
  const g = await input();
  await shot('grab');
  const t0 = await fe(() => window.__fe.state.text);
  await T.stroke([1], [[70, H - 160]], [[150, H - 160]], 8);
  const t1 = await fe(() => window.__fe.state.text);
  await T.upAll();
  return { ok: !!g.grab && g.grab.x === cx && g.grab.y === cy && t1 !== t0, note: g.grab ? `reticle at (${g.grab.x}, ${g.grab.y}), drag edits ${g.grab.key}` : 'no grab' };
});

await check('second finger tap: next op', async () => {
  await T.down(1, cx, cy + 200); await sleep(900);
  const a = await input();
  await T.down(2, cx + 100, cy + 100); await sleep(60); await T.up(2);
  await sleep(100);
  const b = await input();
  await T.upAll();
  return { ok: !!a.grab && b.grab && b.grab.k !== a.grab.k, note: a.grab ? `${a.grab.key} → ${b.grab && b.grab.key}` : 'no grab' };
});

await check('second finger double tap: pin', async () => {
  const p0 = (await input()).pins;
  await T.down(1, cx, cy + 200); await sleep(900);
  const a = await input();
  for (let i = 0; i < 2; i++) { await T.down(2, cx + 100, cy + 100); await sleep(50); await T.up(2); await sleep(90); }
  const b = await input();
  await T.upAll();
  return { ok: !!a.grab && b.pins === p0 + 1 && b.grab && b.grab.k === a.grab.k, note: `pins ${p0} → ${b.pins}, attention ${a.grab && a.grab.key} → ${b.grab && b.grab.key}` };
});

await check('second finger rests: lens', async () => {
  await T.down(1, cx, cy + 200); await sleep(900);
  await T.down(2, cx + 100, cy + 100); await sleep(700);
  const a = await input();
  await T.stroke([1], [[cx, cy + 200]], [[cx + 40, cy + 170]], 6);
  await settle(8);
  await shot('lens');
  await T.up(2); await sleep(100);
  const b = await input();
  await T.upAll();
  return { ok: a.lens && !b.lens && !!b.grab, note: `lens ${a.lens} while resting, ${b.lens} after; grab carries on` };
});

await check('double tap: mode', async () => {
  const m0 = (await input()).mode;
  await T.tap([[cx, cy + 100]]); await sleep(120); await T.tap([[cx + 6, cy + 104]]);
  await sleep(600);
  const m1 = (await input()).mode;
  return { ok: m1 !== m0, note: `${m0} → ${m1}` };
});

await check('loop: pinch zoom, twist roll', async () => {
  await fe(() => window.__fe.setMode('loop'));
  await settle(20);
  const w0 = await fe(() => JSON.parse(JSON.stringify(window.__fe.state.loopWin)));
  await T.down(1, cx - 60, cy); await T.down(2, cx + 60, cy);
  await T.stroke([1, 2], [[cx - 60, cy], [cx + 60, cy]], [[cx - 90, cy - 60], [cx + 90, cy + 60]]);
  await T.upAll();
  await settle(20);
  await shot('loop');
  const w1 = await fe(() => JSON.parse(JSON.stringify(window.__fe.state.loopWin)));
  await fe(() => window.__fe.setMode('pull'));
  return { ok: w1.hh < w0.hh && dist(w0.e1, w1.e1) > 0.01, note: `hh ×${(w1.hh / w0.hh).toFixed(2)}, roll ${dist(w0.e1, w1.e1).toFixed(2)}` };
});

await check('loop knobs: second finger tap', async () => {
  await fe(() => window.__fe.setMode('loop'));
  await settle(10);
  await T.down(1, cx, cy + 100); await sleep(500);
  const a = await input();
  await T.down(2, cx + 100, cy); await sleep(50); await T.up(2); await sleep(100);
  const b = await input();
  await T.stroke([1], [[cx, cy + 100]], [[cx + 60, cy + 60]], 6);
  await shot('knobs');
  await T.upAll();
  await fe(() => window.__fe.setMode('pull'));
  return { ok: a.grab && a.grab.knobs && b.grab && b.grab.key !== a.grab.key, note: `${a.grab && a.grab.key} → ${b.grab && b.grab.key}` };
});

await check('three fingers: slice', async () => {
  const s0 = await fe(() => JSON.stringify(window.__fe.state.formula.slice || null));
  const P = [[cx - 60, cy], [cx, cy - 40], [cx + 60, cy]];
  for (const [i, [x, y]] of P.entries()) await T.down(1 + i, x, y);
  await T.stroke([1, 2, 3], P, P.map(([x, y]) => [x + 60, y]));
  await T.upAll();
  const s1 = await fe(() => JSON.stringify(window.__fe.state.formula.slice || null));
  return { ok: s1 !== s0, note: `slice ${s1}` };
});

await check('corner tap: structure', async () => {
  await T.tap([[20, H - 20]]);
  await sleep(300);
  const a = await input();
  await shot('structure');
  await T.tap([[20, 20]]);
  await sleep(200);
  const b = await input();
  return { ok: a.structure && !b.structure, note: `on ${a.structure}, off ${!b.structure}` };
});

await check('ring: hold, pinch farther', async () => {
  await T.down(1, cx, cy); await sleep(2600);
  const a = await input();
  await shot('ring');
  await T.down(2, cx + 50, cy + 50);
  await T.stroke([2], [[cx + 50, cy + 50]], [[cx + 140, cy + 140]], 8);
  await sleep(300);
  const b = await input();
  await T.upAll();
  return { ok: !!a.ring && b.ring && b.ring.scale > a.ring.scale, note: a.ring ? `scale ${a.ring.scale} → ${b.ring && b.ring.scale}` : 'no ring' };
});


// ---- the structure layer's keys, the Metasurface, the lineage by finger --------------------------------
const keyAt0 = (k) => fe((k) => { const r = document.querySelector(`#structure [data-key="${k}"]`); if (!r) return null; const b = r.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, k);
// a key of the structure layer's row, the layer opened by its corner if it is not up
const keyAt = async (k) => { let at = await keyAt0(k); if (!at) { await T.tap([[20, H - 20]]); await sleep(300); at = await keyAt0(k); } return at; };

await check('keys: Lyapunov, drift', async () => {
  await T.tap([[20, H - 20]]); await sleep(300);
  const at = await keyAt('lyap');
  if (!at) return { ok: false, note: 'no key row' };
  const a = await input();
  await T.tap([at]); await sleep(200);
  const b = await input();
  await T.tap([await keyAt('drift')]); await sleep(200);
  const c = await input();
  await settle(12);
  await shot('keys');
  await T.tap([await keyAt('lyap')]); await T.tap([await keyAt('drift')]);
  return { ok: b.lyap !== a.lyap && c.drift !== b.drift, note: `L ${a.lyap}→${b.lyap}, drift ${b.drift}→${c.drift}` };
});

await check('lineage dot tap', async () => {
  const dots = await fe(() => [...document.querySelectorAll('#structure .lg .hit')].map((r) => { const b = r.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2, r.dataset.id]; }));
  if (dots.length < 2) return { ok: false, note: `${dots.length} dots` };
  const t0 = await fe(() => window.__fe.state.text);
  await T.tap([[dots[0][0], dots[0][1]]], 80);
  await sleep(600);
  const t1 = await fe(() => window.__fe.state.text);
  await T.tap([[dots.at(-1)[0], dots.at(-1)[1]]], 80);
  await sleep(600);
  return { ok: t1 !== t0, note: `${dots.length} dots, tap returned to the root` };
});

await check('surface: rest + draw walks', async () => {
  await T.tap([await keyAt('surface')]); await sleep(400);
  const a = await input();
  await shot('surface');
  const t0 = await fe(() => window.__fe.state.text);
  await T.down(1, cx - 120, cy + 150); await sleep(120);
  await T.down(2, cx - 60, cy - 60);
  const b = await input();
  await T.stroke([2], [[cx - 60, cy - 60]], [[cx + 60, cy + 20]], 10);
  await T.up(2); await sleep(1600);
  await T.up(1);
  const t1 = await fe(() => window.__fe.state.text);
  return { ok: !!a.surf && b.surf && b.surf.stroke === 'walk' && t1 !== t0, note: `stroke ${b.surf && b.surf.stroke}, walked` };
});

await check('surface: two rest = field', async () => {
  await T.down(1, cx - 120, cy + 150); await T.down(2, cx - 80, cy + 160); await sleep(100);
  await T.down(3, cx - 60, cy - 60);
  const b = await input();
  await T.upAll();
  return { ok: b.surf && b.surf.stroke === 'field', note: `stroke ${b.surf && b.surf.stroke}` };
});

await check('surface: two-finger tap closes', async () => {
  const a = await input();
  await T.tap([[cx - 40, cy], [cx + 40, cy]]); await sleep(200);
  const b = await input();
  await T.tap([[20, H - 20]]); await sleep(200);
  return { ok: !!a.surf && !b.surf, note: `open ${!!a.surf}, after ${!!b.surf}` };
});

// ---- the graph by finger -----------------------------------------------------------------------------
const openGraph = async (text) => {
  if (text) { await fe((t) => window.__fe.setFormula(t), text); await settle(6); }
  await fe(() => window.__fe.graph(true)); await sleep(500);
};

await check('graph: press = thumbnail, select', async () => {
  await openGraph('abs · sort · scale 3 · + -2 -2 0 | bulb 8 · +c ×9 AAB seed=7');
  const g = (await input()).graph, q = g.nodes[1];
  await T.down(1, q.x, q.y); await sleep(700);
  const a = (await input()).graph;
  await T.upAll(); await sleep(200);
  const b = (await input()).graph;
  await shot('graph');
  return { ok: a.hover === q.id && a.thumb && b.selected === q.id, note: `hover ${a.hover}, thumbnail ${a.thumb}, selected ${b.selected}` };
});

await check('graph: letter drag cycles', async () => {
  const g = (await input()).graph, L = g.letters[0];
  const w0 = await fe(() => window.__fe.state.formula.schedule);
  await T.down(1, L.x, L.y); await sleep(60);
  await T.stroke([1], [[L.x, L.y]], [[L.x, L.y - 22]], 6);
  await T.upAll(); await sleep(200);
  const w1 = await fe(() => window.__fe.state.formula.schedule);
  return { ok: w1 !== w0 && w1.length === w0.length, note: `${w0} → ${w1}` };
});

await check('graph: pinch zooms, closed folds', async () => {
  await T.down(1, cx - 40, cy); await T.down(2, cx + 40, cy);
  await T.stroke([1, 2], [[cx - 40, cy], [cx + 40, cy]], [[cx - 120, cy], [cx + 120, cy]]);
  await T.upAll(); await sleep(150);
  const a = await input();
  await shot('graph-zoom');
  await T.down(1, cx - 150, cy); await T.down(2, cx + 150, cy);
  const mid = await input();
  await T.stroke([1, 2], [[cx - 150, cy], [cx + 150, cy]], [[cx - 10, cy], [cx + 10, cy]], 16);
  await T.upAll(); await sleep(200);
  const b = await input();
  return { ok: a.graph && a.graph.k > 1.5 && !!mid.graph && !b.graph, note: `×${a.graph && a.graph.k.toFixed(2)}, open under two fingers ${!!mid.graph}, then folded ${!b.graph}` };
});

await check('graph: fling a node = Delete', async () => {
  await openGraph();
  const g = (await input()).graph, n0 = g.nodes.length, q = g.nodes[0];
  await T.down(1, q.x, q.y); await sleep(60);
  await T.stroke([1], [[q.x, q.y]], [[q.x, 30]], 12);
  await T.upAll(); await sleep(300);
  const b = (await input()).graph;
  return { ok: b && b.nodes.length === n0 - 1, note: `${n0} → ${b && b.nodes.length} ops (from ${q.x | 0},${q.y | 0}, zone ${g.zone.map((v) => v | 0)})` };
});

await check('graph: three-finger tap = Delete', async () => {
  const g = (await input()).graph, q = g.nodes[0], n0 = g.nodes.length;
  await T.tap([[q.x, q.y]]); await sleep(200);
  const a = (await input()).graph;
  await T.tap([[cx - 60, cy + 200], [cx, cy + 240], [cx + 60, cy + 200]]); await sleep(300);
  const b = (await input()).graph;
  return { ok: a.selected === q.id && b && b.nodes.length === n0 - 1, note: `selected ${a.selected}, ${n0} → ${b && b.nodes.length} ops` };
});

await check('graph: hue ring, second finger', async () => {
  // a shaded formula: one ramp on the orbit's count; select the ramp, hold a stop, a second finger sets
  // lightness (up) and alpha (sideways)
  await fe(async () => {
    const F = await import('./core/index.js'), S = await import('./core/shade.js');
    const f = { ...F.normalize(F.parse('fold.box 1 · fold.sphere .5 1 · scale 2.5 · +c ×12 bail=100')), shade: { nodes: [{ id: 'c', type: 'col' }, { id: 'r1', type: 'ramp', in: { v: 'c' }, p: S.rampPreset('fire') }], out: { color: 'r1' } } };
    window.__fe.graph(false);
    window.__fe.setFormula(F.format(F.normalize(f)));
  });
  await openGraph();
  let sv = await fe(() => window.__fe.shadeView);
  const r1 = sv.items.find((q) => q.id === 'r1');
  await T.tap([[r1.x, r1.y - 6]]); await sleep(250);   // above its output dot
  sv = await fe(() => window.__fe.shadeView);
  if (!sv.editor) return { ok: false, note: `no ramp editor (selected ${sv.selected})` };
  const st = sv.editor.stops[1] || sv.editor.stops[0];
  const t0 = await fe(() => window.__fe.state.text);
  await T.down(1, st.x, st.y); await sleep(500);
  const a = await fe(() => window.__fe.shadeView.hue);
  await shot('hue');
  await T.down(2, cx, cy + 250);
  await T.stroke([2], [[cx, cy + 250]], [[cx + 60, cy + 150]], 8);
  await T.up(2); await sleep(100);
  await T.upAll(); await sleep(300);
  const t1 = await fe(() => window.__fe.state.text);
  await fe(() => window.__fe.graph(false));
  return { ok: a && t1 !== t0, note: `ring ${a}, stop's colour changed ${t1 !== t0}` };
});

await check('graph: two-finger tap = Esc', async () => {
  // a selected op: the first tap lets the selection go, the second folds the graph
  await openGraph();
  const q = (await input()).graph.nodes[0];
  await T.tap([[q.x, q.y]]); await sleep(200);
  const a = (await input()).graph;
  await T.tap([[cx - 40, cy + 200], [cx + 40, cy + 200]]); await sleep(200);
  const b = await input();
  await T.tap([[cx - 40, cy + 200], [cx + 40, cy + 200]]); await sleep(200);
  const c = await input();
  return { ok: a.selected === q.id && b.graph && b.graph.selected === null && !c.graph, note: `selected ${a.selected}, then ${b.graph && b.graph.selected}, then closed ${!c.graph}` };
});

// ---- the collage's gizmo by finger, its snap by a resting finger -----------------------------------------
await check('gizmo: finger drag, rest snaps', async () => {
  if ((await input()).structure) { await T.tap([[20, H - 20]]); await sleep(200); }
  await page.waitForFunction(() => !window.__fe.state.trans, null, { timeout: 5000 });
  await fe(() => window.__fe.collage('{ bulb 8 · +c ×10 bail=2 } at .6 0 0 ∪ .3 { fold.box 1 · fold.sphere .5 1 · scale 2.5 · +c ×12 bail=100 } at -.6 0 0 size .25'));
  await fe(() => window.__fe.setCamera([0, 0, -6], 0, 0)); await settle(20);
  await page.waitForFunction(() => !!window.__fe.state.collage, null, { timeout: 5000 });
  await fe(() => window.__fe.pick(0)); await sleep(200);
  const G = await fe(() => window.__fe.gizmo);
  if (!G) return { ok: false, note: 'no gizmo ' + JSON.stringify(await input()) };
  await shot('gizmo');
  const c0 = await fe(() => JSON.stringify(window.__fe.state.collage.pieces[0].place));
  // the corner, pressed 12 px off (a finger's slop), then with a resting finger
  const [x, y] = G.corner;
  await T.down(1, x + 12, y + 8); await sleep(60);
  const a = await input();
  await T.down(2, 40, H - 200);
  await T.stroke([1], [[x + 12, y + 8]], [[x + 60, y + 50]], 8);
  const s = await fe(() => window.__fe.state.collage.pieces[0].place.s);
  await T.upAll(); await sleep(200);
  const c1 = await fe(() => JSON.stringify(window.__fe.state.collage.pieces[0].place));
  await fe(() => window.__fe.collage(null));
  return { ok: a.gz === 'corner' && c1 !== c0 && String(+s.toPrecision(2)) === String(s), note: `held ${a.gz}, scale ${s} (two figures: snapped)` };
});

// ---- the overlay toggles (DESIGN.md "Overlay toggles"): the menu mark's row, by finger or mouse -----------
const markAt = () => fe(() => { const r = document.querySelector('#site-menu .menuToggle input').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
const glyphAt = (k) => fe((k) => { const e = document.querySelector(`#toggles [data-toggle="${k}"]`); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, k);
const tg = async () => (await input()).toggles;
const press = async ([x, y]) => { if (DESK) await page.mouse.click(x, y); else await T.tap([[x, y]]); await sleep(250); };
// the mark, then the glyph (the row is out for one choice)
async function pressToggle(k) {
  if (!(await tg()).row) await press(await markAt());
  const at = await glyphAt(k);
  if (!at) throw new Error(`no glyph ${k}`);
  await press(at);
}
async function toggleChecks(pre) {
  await check(`${pre}toggles: mark unfolds, folds by itself`, async () => {
    await fe(() => { window.__fe.graph(false); window.__fe.surface(false); });
    await press(await markAt());
    const a = await tg(), menu = await fe(() => document.querySelector('#site-menu .menuToggle input').checked);
    const n = await fe(() => document.querySelectorAll('#toggles [data-toggle]').length);
    await shot(`${DESK ? 'desktop-' : ''}toggles-row`);
    await sleep(4300);
    const b = await tg();
    return { ok: a.row && !menu && n === 8 && !b.row, note: `row ${a.row} (${n} glyphs), site menu ${menu}, folded ${!b.row}` };
  });
  await check(`${pre}toggles: second press = site menu`, async () => {
    const m = await markAt();
    await press(m);
    const a = await tg();
    await press(m);
    const b = await tg(), open = await fe(() => document.querySelector('#site-menu .menuToggle input').checked);
    await shot(`${DESK ? 'desktop-' : ''}toggles-menu`);
    await press(m);
    const shut = await fe(() => !document.querySelector('#site-menu .menuToggle input').checked);
    return { ok: a.row && !b.row && open && shut, note: `row ${a.row}, then site menu ${open} (row folded ${!b.row}), then closed ${shut}` };
  });
  await check(`${pre}toggles: each overlay, bright when on`, async () => {
    const seen = [];
    for (const k of ['graph', 'surface', 'structure', 'lyap']) {
      const a = (await tg()).on[k];
      await pressToggle(k);
      const b = await tg();
      if (k === 'surface') await shot(`${DESK ? 'desktop-' : ''}toggles-surface`);
      await pressToggle(k);
      const c = (await tg()).on[k];
      seen.push(`${k} ${a}→${b.on[k]}→${c}${b.row ? ' (row still out)' : ''}`);
      if (a || !b.on[k] || c || b.row) return { ok: false, note: seen.join(', ') };
    }
    // the mode: pull → push → loop → pull, its glyph each mode's own
    const modes = [(await input()).mode];
    for (let i = 0; i < 3; i++) { await pressToggle('mode'); await page.waitForFunction(() => !window.__fe.state.trans, null, { timeout: 5000 }).catch(() => {}); modes.push((await input()).mode); }
    seen.push(modes.join('→'));
    return { ok: new Set(modes.slice(0, 3)).size === 3 && modes[3] === modes[0], note: seen.join(', ') };
  });
  await check(`${pre}toggles: shading frame, drivers' lane`, async () => {
    await fe(() => window.__fe.setFormula('fold.box 1 · fold.sphere .5 1 · scale 2.5 · +c ×12 bail=100'));
    await pressToggle('shade');
    // (the frame is drawn once the graph has unfolded: 260 ms)
    const shDrawn = async () => { await sleep(150); return fe(() => !!document.querySelector('#grab .sh')); };
    const a = await tg(), z0 = (await input()).graph.zone, s0 = await shDrawn();
    await shot(`${DESK ? 'desktop-' : ''}toggles-graph`);
    await pressToggle('shade');
    const b = await tg(), z1 = (await input()).graph.zone, s1 = await shDrawn();
    await pressToggle('drive');
    const c = await tg();
    await pressToggle('shade'); await pressToggle('drive');
    const d = await tg();
    await pressToggle('graph');
    const e = await tg();
    // the network takes the room (at most its full scale: a desktop window may already show it so)
    const wider = z1[2] - z1[0] > z0[2] - z0[0] || (DESK && z1[2] - z1[0] === z0[2] - z0[0]);
    return { ok: a.on.graph && a.on.shade && s0 && !s1 && !b.on.shade && b.on.graph && wider && !c.on.drive && d.on.shade && d.on.drive && !e.on.graph,
      note: `opens with it ${a.on.shade && s0}; folded away ${!b.on.shade && !s1} (network ${(z0[2] - z0[0]) | 0} → ${(z1[2] - z1[0]) | 0} px); lane ${!c.on.drive ? 'away' : 'kept'}; both back ${d.on.shade && d.on.drive}; graph closed ${!e.on.graph}` };
  });
  await check(`${pre}toggles: collage, add a piece`, async () => {
    await fe(() => { window.__fe.collage(null); window.__fe.setFormula('fold.box 1 · fold.sphere .5 1 · scale 2.5 · +c ×12 bail=100'); window.__fe.setCamera([0, 0, -6], 0, 0); });
    await settle(10);
    const vw = DESK ? 1280 : W, vh = DESK ? 800 : H, L = Math.min(vw, vh) * 0.84;
    const scr = (at) => [vw / 2 + (at[0] * L) / 2, vh / 2 - (at[1] * L) / 2];
    const a = await tg();
    await pressToggle('collage');
    const b = await tg();
    const sites = await fe(() => window.__fe.surfaceSites());
    await shot(`${DESK ? 'desktop-' : ''}toggles-add`);
    await press(scr(sites[0].at)); await sleep(200);
    const c = await tg(), n1 = await fe(() => window.__fe.state.collage && window.__fe.state.collage.pieces.length);
    // the collage graph's plus: the Metasurface again, a tap on open ground adds the formula there
    await pressToggle('collage');
    const g = (await input()).cgraph;
    if (!g || !g.plus) return { ok: false, note: `no collage graph plus (${JSON.stringify(c)})` };
    await shot(`${DESK ? 'desktop-' : ''}toggles-cgraph`);
    await press(g.plus);
    const d = await tg();
    const pts = await fe(() => window.__fe.surfaceSites().map((s) => s.at));
    const ground = [[0.1, -0.9], [-0.9, 0.1], [0.9, 0.9], [-0.5, -0.5], [0.45, 0.05]].find((p) => pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.25));
    await press(scr(ground)); await sleep(300);
    const e = await input(), n2 = await fe(() => window.__fe.state.collage && window.__fe.state.collage.pieces.length);
    await shot(`${DESK ? 'desktop-' : ''}toggles-added`);
    await fe(() => { window.__fe.graph(false); window.__fe.collage(null); });
    return { ok: !a.on.collage && b.add === 'glyph' && !c.add && c.on.collage && n1 === 2 && d.add === 'graph' && n2 === 3 && !!e.cgraph && !e.surf,
      note: `add mode ${b.add} → ${n1} pieces, bright ${c.on.collage}; plus → ${d.add} → ${n2} pieces, back in the collage graph ${!!e.cgraph}` };
  });
}
await toggleChecks(DESK ? 'desktop: ' : '');
if (DESK) await check('desktop: keys beside the row', async () => {
  await page.keyboard.press('KeyG'); await sleep(200);
  const a = await tg();
  await page.keyboard.press('KeyG'); await page.keyboard.press('KeyM'); await sleep(200);
  const b = await tg();
  await page.keyboard.press('KeyM'); await sleep(200);
  return { ok: a.on.graph && b.on.surface && !b.on.graph, note: `G ${a.on.graph}, M ${b.on.surface}` };
});

console.log(`\n${results.filter((r) => r[1]).length}/${results.length} pass`);
if (errors.length) console.log('\npage errors:\n  ' + errors.join('\n  '));
await browser.close();
srv.close();
// a page error fails the run too
process.exit(results.every((r) => r[1]) && !errors.length ? 0 : 1);
