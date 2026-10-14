// A paused frame comes back running as the same element (no reload) when scrolled back into view.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('../../audio-test/node_modules/playwright');
const BASE = process.argv[2] || 'http://localhost:8792';
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(BASE + '/timeline.html#2026-09', { waitUntil: 'load' });
await page.waitForTimeout(2600);
const tag = await page.evaluate(() => { const f = document.querySelector('.item iframe'); if (!f) return null; f.__tag = 'same'; f.addEventListener('load', () => { f.__reloaded = true; }); return f.closest('.item').dataset.slug; });
ok(!!tag, 'a frame is running: ' + tag);
const y0 = await page.evaluate(() => scrollY);
await page.evaluate(y => window.scrollTo(0, y + innerHeight * 1.2), y0);      // just out of view
await page.waitForTimeout(400);
const away = await page.evaluate(slug => { const f = document.querySelector(`[data-slug="${slug}"] iframe`); return f ? { hidden: f.style.display === 'none', tag: f.__tag } : null; }, tag);
ok(away && away.hidden && away.tag === 'same', 'out of view: paused and hidden, still the same frame');
await page.evaluate(y => window.scrollTo(0, y), y0);
await page.waitForTimeout(400);
const back = await page.evaluate(slug => { const f = document.querySelector(`[data-slug="${slug}"] iframe`); return f ? { hidden: f.style.display === 'none', tag: f.__tag, reloaded: !!f.__reloaded } : null; }, tag);
ok(back && !back.hidden && back.tag === 'same' && !back.reloaded, 'back in view: running at once, same frame, no reload');
await browser.close();
