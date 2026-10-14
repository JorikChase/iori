#!/usr/bin/env node
/* Screenshot every timeline "page" entry that has no picture yet and attach the shot as its poster.

     TIMELINE_TOKEN=... node tools/timeline/page_posters.mjs --api http://127.0.0.1:8796 --base http://localhost:8792
     TIMELINE_TOKEN=... node tools/timeline/page_posters.mjs                     # production API, live pages

   --base rewrites each page's address onto another host (a local static server) and keeps the path.
   --gpu renders with the machine's GPU (full Chromium, new headless mode): ~30 s for a heavy WebGL page.
   Without it WebGL runs in software (SwiftShader), which wedges on the heaviest pages; run those one at a
   time with --only /<path> --gpu. Each page gets --wait ms to settle (default 3500). Uses the Playwright
   that tools/audio-test already installs. */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('../audio-test/node_modules/playwright');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const API = arg('api', 'https://api.3die.fr'), BASE = arg('base', ''), WAIT = +arg('wait', 3500), ONLY = arg('only', '');
const TOKEN = process.env.TIMELINE_TOKEN;
if (!TOKEN) { console.error('set TIMELINE_TOKEN (log in once with tools/timeline/tlapi.py or the editor)'); process.exit(1); }
const H = { Authorization: 'Bearer ' + TOKEN };

const { entries } = await (await fetch(API + '/timeline/entries', { headers: H })).json();
const todo = entries.filter(e => e.kind === 'page' && !e.media.length && e.src && (!ONLY || e.src.includes(ONLY)));
console.log(`${todo.length} pages without a poster`);
// --gpu: the machine's GPU through the full Chromium in its new headless mode (fast for WebGL);
// default: software WebGL (SwiftShader), slower but works anywhere
const GPU = process.argv.includes('--gpu');
const LAUNCH = GPU
  ? { channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] }
  : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] };
let browser = await chromium.launch(LAUNCH);
let done = 0, failed = 0;
// a heavy WebGL page can wedge or kill software rendering: every page gets a hard limit, and a dead
// browser is replaced so the rest still run
const limit = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), ms))]);
async function one(e) {
  if (!browser.isConnected()) browser = await chromium.launch(LAUNCH);
  const url = BASE ? BASE.replace(/\/$/, '') + new URL(e.src).pathname : e.src;
  let page;
  try { page = await limit(browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: 'dark' }), 15000); }
  catch (err) { failed++; console.log('  skipped', url, 'no page'); try { await browser.close(); } catch (x) { } browser = await chromium.launch(LAUNCH); return; }
  try {
    // some pages stream big assets and never fire load: shoot whatever has drawn by then
    await page.goto(url, { waitUntil: 'load', timeout: 30000 }).catch(err => { if (!/Timeout/.test(err.message)) throw err; });
    await page.waitForTimeout(WAIT);
    const shot = await limit(page.screenshot({ type: 'jpeg', quality: 86, timeout: 20000 }), 25000);
    const fd = new FormData();
    fd.append('file', new Blob([shot], { type: 'image/jpeg' }), (new URL(e.src).pathname.replace(/\W+/g, '-') || 'page') + '.jpg');
    const r = await fetch(`${API}/timeline/entries/${e.id}/media`, { method: 'POST', headers: H, body: fd });
    if (!r.ok) throw new Error('upload ' + r.status);
    done++;
  } catch (err) { failed++; console.log('  skipped', url, String(err.message || err).slice(0, 80)); }
  finally { await limit(page.close(), 5000).catch(() => { }); }
}
const queue = [...todo];
await Promise.all(Array.from({ length: 3 }, async () => { while (queue.length) await one(queue.shift()); }));
await browser.close().catch(() => { });
console.log(`posters attached ${done}, skipped ${failed}`);
