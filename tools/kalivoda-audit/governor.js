// The quality governor on its own: load unpinned, let it calibrate, report the rung it chose,
// draws per second (the 60 fps cap) and its decisions. ?budget=<ms> stands in for a weaker GPU.
// Usage: node tools/kalivoda-audit/governor.js [baseUrl] [query ...]
const path = require('path');
const { chromium } = require(path.join(__dirname, '../audio-test/node_modules/playwright'));
const BASE = process.argv[2] || 'http://127.0.0.1:8799/kalivoda/';
const QS = process.argv.slice(3).length ? process.argv.slice(3) : [''];
const PROFILES = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
];
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
  for (const prof of PROFILES) for (const q of QS) {
    const ctx = await browser.newContext({ viewport: prof.viewport, deviceScaleFactor: prof.deviceScaleFactor, isMobile: !!prof.isMobile, hasTouch: !!prof.hasTouch });
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log('  error', e.message));
    await page.goto(BASE + (q ? '?' + q : ''), { waitUntil: 'load' });
    await page.waitForFunction(() => window.__rods && window.__rods.rods.length > 0, null, { timeout: 30000 });
    await page.waitForTimeout(3000);
    const d0 = await page.evaluate(() => window.__rods.quality().draws);
    await page.waitForTimeout(2000);
    const r = await page.evaluate(() => window.__rods.quality());
    console.log(`${prof.name.padEnd(8)} ${(q || 'default').padEnd(14)} rung ${r.level}/${r.ladder - 1} (base ${r.base}) ${JSON.stringify(r.rung)}  measured ${r.measured} ms  ${((r.draws - d0) / 2).toFixed(0)} draws/s  smallHdr ${r.smallHdr}`);
    for (const h of r.history) console.log(`           ${h.why.padEnd(8)} ${h.ms} ms  rung ${h.from} → ${h.to}`);
    await ctx.close();
  }
  await browser.close();
})();
