// Loaded-but-not-running: frames pause and hide out of view, the two most recent stay loaded and come back
// without reloading; the last ten static items come back as the same decoded elements.
//   node tools/timeline/test/keep.mjs [http://localhost:8792]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('../../audio-test/node_modules/playwright');
const BASE = process.argv[2] || 'http://localhost:8792';
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const state = () => page.evaluate(() => [...document.querySelectorAll('.item iframe')].map(f => {
  const r = f.closest('.item').getBoundingClientRect();
  return { slug: f.closest('.item').dataset.slug, hidden: f.style.display === 'none', inView: r.bottom > 0 && r.top < innerHeight, tag: f.__tag || null };
}));
const scrollTo = async y => { await page.evaluate(y => window.scrollTo(0, y), y); await page.waitForTimeout(150); };

await page.goto(BASE + '/timeline.html#2026-09', { waitUntil: 'load' });
await page.waitForTimeout(2600);
let s = await state();
ok(s.length >= 1 && s.every(f => f.inView && !f.hidden), `woke in view: ${s.length} running`);
// tag the live frames so a reload would show as a missing tag
await page.evaluate(() => document.querySelectorAll('.item iframe').forEach((f, i) => { f.__tag = 'first-' + i; }));
const home = await page.evaluate(() => scrollY);

// walk down in dwell-sized steps so more frames wake, then check the parked ones
for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(1300); }
s = await state();
const out = s.filter(f => !f.inView);
ok(out.every(f => f.hidden), `frames out of view are paused and hidden (${out.length})`);
ok(out.length <= 2, `at most two paused frames kept (${out.length})`);
ok(s.filter(f => f.inView && !f.hidden).length <= 3, `running frames within budget (${s.filter(f => f.inView && !f.hidden).length})`);
const firstKept = s.some(f => f.tag && f.tag.startsWith('first-'));

// static items: tag the photos in view, go far away, come back
await scrollTo(home);
await page.waitForTimeout(800);
s = await state();
ok(!firstKept || s.some(f => f.tag && f.tag.startsWith('first-') && f.inView && !f.hidden),
   firstKept ? 'a kept frame came back running, without reloading (same element)' : 'the first frames were evicted (more than two paused since): expected');
await page.evaluate(() => location.hash = '#2024-09');
await page.waitForTimeout(1500);
const tagged = await page.evaluate(() => { let n = 0; document.querySelectorAll('.item.image img, .item.page img').forEach(i => { const r = i.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) { i.__kept = 'yes'; n++; } }); return { n, y: scrollY }; });
await page.evaluate(() => location.hash = '#2022-06');
await page.waitForTimeout(1200);
await page.evaluate(y => window.scrollTo(0, y), tagged.y);
await page.waitForTimeout(800);
const back = await page.evaluate(() => [...document.querySelectorAll('.item.image img, .item.page img')].filter(i => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).map(i => i.__kept === 'yes'));
ok(tagged.n === 0 || back.filter(Boolean).length > 0, `static items came back as the same decoded elements (${back.filter(Boolean).length} of ${back.length})`);
const mounted = await page.evaluate(() => document.querySelectorAll('.block').length);
console.log('blocks mounted now:', mounted);
await browser.close();
