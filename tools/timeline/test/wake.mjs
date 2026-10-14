// Auto-wake check: embeds wake after dwelling in view, flicking past wakes nothing, the live budget holds.
//   node tools/timeline/test/wake.mjs [http://localhost:8792]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('../../audio-test/node_modules/playwright');
const BASE = process.argv[2] || 'http://localhost:8792';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const frames = () => page.evaluate(() => [...document.querySelectorAll('.item iframe')].map(f => ({ kind: f.closest('.item').classList.contains('page') ? 'page' : 'embed', auto: !!f.dataset.auto, ready: f.classList.contains('ready') })));
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) process.exitCode = 1; };

await page.goto(BASE + '/timeline.html#2026-09', { waitUntil: 'load' });
await page.waitForTimeout(400);
ok((await frames()).length === 0, 'nothing live right after landing (dwell not reached)');
await page.waitForTimeout(2500);
let f = await frames();
ok(f.length >= 1, `woke after dwelling: ${f.length} live (${f.map(x => x.kind).join(', ')})`);
ok(f.filter(x => x.kind === 'embed').length <= 2 && f.filter(x => x.kind === 'page').length <= 1, 'within budget: ≤ 2 players, ≤ 1 page');
ok(f.every(x => x.auto), 'woken quietly (no autoplay)');

// flick through a lot of 2025: nothing new should wake mid-flick
await page.evaluate(() => { location.hash = '#2025-01'; });
await page.waitForTimeout(300);
const before = await page.evaluate(() => document.querySelectorAll('.item iframe').length);
for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(40); }
const during = await page.evaluate(() => document.querySelectorAll('.item iframe').length);
ok(during <= before, `flicking 27,000 px woke nothing new (${before} → ${during})`);
await page.waitForTimeout(2500);
f = await frames();
ok(f.filter(x => x.kind === 'embed').length <= 2 && f.filter(x => x.kind === 'page').length <= 1, `after settling: ${f.length} live, still within budget`);

// a press plays, and the budget never puts a pressed one to sleep
const pressed = await page.evaluate(() => { const b = [...document.querySelectorAll('.item.embed .wake')].find(b => { const r = b.getBoundingClientRect(); return r.top > 0 && r.bottom < innerHeight; }); if (!b) return false; b.click(); return true; });
if (pressed) {
  await page.waitForTimeout(300);
  f = await frames();
  ok(f.some(x => !x.auto), 'a press starts a playing frame');
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 500); await page.waitForTimeout(1200); }
  f = await frames();
  ok(f.some(x => !x.auto) || (await page.evaluate(() => !document.querySelector('.item.pressed'))), 'the pressed frame was not slept by the budget (it may have scrolled out and unmounted)');
}
await browser.close();
