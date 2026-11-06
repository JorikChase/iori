// GPU cost of one kalivoda hero frame (fenced, median of three runs of the least-disturbed of 10), across URL variants.
// Pin a rung with ?q=<n> (see LADDER in rods.js) or override ?dpr= ?ns= ?msaa= ?fmt=0.
// Usage: node tools/kalivoda-audit/perf.js [baseUrl] [variant ...]   (variant = query string, e.g. "ns=8&dpr=2")
const path = require('path');
const { chromium } = require(path.join(__dirname, '../audio-test/node_modules/playwright'));
const BASE = process.argv[2] || 'http://127.0.0.1:8799/kalivoda/';
const VARIANTS = process.argv.slice(3).length ? process.argv.slice(3) : [''];
const PROFILES = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
];
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
  for (const prof of PROFILES) for (const v of VARIANTS) {
    const ctx = await browser.newContext({ viewport: prof.viewport, deviceScaleFactor: prof.deviceScaleFactor, isMobile: !!prof.isMobile, hasTouch: !!prof.hasTouch });
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log('  error', e.message));
    await page.goto(BASE + (v ? '?' + v : ''), { waitUntil: 'load' });
    await page.waitForFunction(() => window.__rods && window.__rods.rods.length > 0, null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => { const R = window.__rods; const f = []; for (let k = 0; k < 3; k++) f.push(R.passes(10).frame); f.sort((a, b) => a - b); return { frame: f[1], px: R.passes(1).px, q: R.quality ? R.quality() : null }; });
    console.log(`${prof.name.padEnd(8)} ${(v || 'default').padEnd(28)} frame ${r.frame} ms  px ${r.px.join('×')}  rung ${r.q.level}/${r.q.ladder - 1} ${JSON.stringify(r.q.rung)}`);
    await ctx.close();
  }
  await browser.close();
})();
