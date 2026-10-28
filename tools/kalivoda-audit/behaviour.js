// Behaviour checks for kalivoda/: tips hidden at rest and revealed by a rattle, touch count,
// render pausing, header state, the photo viewer, GPU frame cost.
// Usage: node tools/kalivoda-audit/behaviour.js [baseUrl]
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(__dirname, '../audio-test/node_modules/playwright'));
const BASE = process.argv[2] || 'http://127.0.0.1:8799/kalivoda/';
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const PROFILES = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
];

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
  const res = {};
  for (const prof of PROFILES) {
    const ctx = await browser.newContext({ viewport: prof.viewport, deviceScaleFactor: prof.deviceScaleFactor, isMobile: !!prof.isMobile, hasTouch: !!prof.hasTouch });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    let kb = 0; page.on('response', async r => { try { kb += (await r.body()).length / 1024; } catch (e) {} });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__rods && window.__rods.rods.length > 0, null, { timeout: 30000 });
    await page.waitForTimeout(2500);
    const r = {};
    r.loadKB = Math.round(kb);
    r.gpuMsAtRest = +(await page.evaluate(() => { const R = window.__rods; R.capture(0, 0, 1, 1); R.capture(0, 0, 1, 1); const t = performance.now(); for (let i = 0; i < 20; i++) R.capture(0, 0, 1, 1); return (performance.now() - t) / 20; })).toFixed(1);
    r.tipsAtRest = await page.evaluate(() => window.__rods.tipsOnScreen());
    r.rodLen = await page.evaluate(() => { const L = window.__rods.rods.map(x => x.L); return [Math.min(...L).toFixed(2), Math.max(...L).toFixed(2)]; });
    await page.screenshot({ path: path.join(OUT, `b-${prof.name}-rest.jpg`), type: 'jpeg', quality: 80 });

    // brisk swipe (mouse on desktop, a sideways drag on the phone)
    const W = prof.viewport.width, H = prof.viewport.height;
    await page.evaluate(() => window.__rods.stats.reset());
    const steps = 24;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      await page.mouse.move(W * (0.12 + 0.76 * t), H * (0.45 + 0.05 * t));
      await page.waitForTimeout(14);
    }
    let maxTips = 0;
    for (let k = 0; k < 20; k++) { maxTips = Math.max(maxTips, await page.evaluate(() => window.__rods.tipsOnScreen())); if (k === 5) await page.screenshot({ path: path.join(OUT, `b-${prof.name}-rattle.jpg`), type: 'jpeg', quality: 80 }); await page.waitForTimeout(120); }
    r.swipe = { pairsTouched: await page.evaluate(() => window.__rods.stats.pairs.size), maxTipsVisible: maxTips, peakTilt: +(await page.evaluate(() => Math.max(...window.__rods.rods.map(x => Math.hypot(x.tx, x.tz))))).toFixed(3) };
    await page.waitForTimeout(3500);

    // vigorous back and forth
    await page.evaluate(() => window.__rods.stats.reset());
    for (let rep = 0; rep < 4; rep++) for (const [a, b] of [[0.15, 0.85], [0.85, 0.15]]) for (let k = 0; k <= 16; k++) { await page.mouse.move(W * (a + (b - a) * k / 16), H * 0.55); await page.waitForTimeout(12); }
    maxTips = 0;
    for (let k = 0; k < 20; k++) { maxTips = Math.max(maxTips, await page.evaluate(() => window.__rods.tipsOnScreen())); await page.waitForTimeout(120); }
    r.vigorous = { pairsTouched: await page.evaluate(() => window.__rods.stats.pairs.size), maxTipsVisible: maxTips };


    // scroll into the content: render pauses, header turns solid
    await page.evaluate(() => document.getElementById('exhibitions').scrollIntoView());
    await page.waitForTimeout(600);
    r.afterScroll = await page.evaluate(() => ({ renderActive: window.__rods.active, headerSolid: document.getElementById('hdr').classList.contains('solid') }));
    await page.screenshot({ path: path.join(OUT, `b-${prof.name}-exhibitions.jpg`), type: 'jpeg', quality: 80 });

    // open an exhibition, open a photo in the viewer, step to the next one
    await page.click('details.ex:nth-of-type(2) summary');
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, `b-${prof.name}-open.jpg`), type: 'jpeg', quality: 80 });
    await page.click('details.ex:nth-of-type(2) .strip button');
    await page.waitForTimeout(900);
    r.viewer = await page.evaluate(() => { const lb = document.getElementById('lb'); return { open: lb.open, src: lb.querySelector('img').getAttribute('src'), caption: lb.querySelector('figcaption').textContent }; });
    await page.screenshot({ path: path.join(OUT, `b-${prof.name}-viewer.jpg`), type: 'jpeg', quality: 80 });
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    r.viewer.afterNext = await page.evaluate(() => document.getElementById('lb').querySelector('img').getAttribute('src'));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    r.viewer.closed = await page.evaluate(() => !document.getElementById('lb').open);

    await page.evaluate(() => document.getElementById('contact').scrollIntoView());
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `b-${prof.name}-contact.jpg`), type: 'jpeg', quality: 80 });
    r.errors = errors;
    res[prof.name] = r;
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'behaviour.json'), JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
