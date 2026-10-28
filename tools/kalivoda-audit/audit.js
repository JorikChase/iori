// Audit rig for kalivoda/: screenshots at scroll stops, load weight, GPU frame cost.
// Usage: node tools/kalivoda-audit/audit.js [baseUrl]   (default http://127.0.0.1:8799/kalivoda/)
// Writes tools/kalivoda-audit/out/<profile>-<stop>.jpg and out/report.json.
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(__dirname, '../audio-test/node_modules/playwright'));

const BASE = process.argv[2] || 'http://127.0.0.1:8799/kalivoda/';
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const PROFILES = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  { name: 'laptop', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
  });
  const report = {};
  for (const prof of PROFILES) {
    const ctx = await browser.newContext({ viewport: prof.viewport, deviceScaleFactor: prof.deviceScaleFactor, isMobile: !!prof.isMobile, hasTouch: !!prof.hasTouch });
    const page = await ctx.newPage();
    const bytes = {};
    const reqs = [];
    page.on('response', async r => {
      try {
        const b = (await r.body()).length;
        const t = (r.headers()['content-type'] || '?').split(';')[0];
        bytes[t] = (bytes[t] || 0) + b;
        reqs.push([r.url().replace(BASE, ''), b]);
      } catch (e) { /* redirects etc. */ }
    });
    const consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    const t0 = Date.now();
    await page.goto(BASE, { waitUntil: 'load' });
    const loadMs = Date.now() - t0;
    await page.waitForFunction(() => window.__rods && window.__rods.rods.length > 0, null, { timeout: 30000 });
    await page.waitForTimeout(2500);

    const info = await page.evaluate(async () => {
      const R = window.__rods;
      const gl = document.getElementById('gl').getContext('webgl2');
      const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?';
      // GPU cost: capture() renders one full frame and reads 1 px back (forces the GPU to finish)
      R.capture(0, 0, 1, 1); R.capture(0, 0, 1, 1);
      const n = 20; let t = performance.now();
      for (let i = 0; i < n; i++) R.capture(0, 0, 1, 1);
      const frameMs = (performance.now() - t) / n;
      // rAF cadence while idle
      const cadence = await new Promise(res => { let k = 0; const s = performance.now(); const f = () => { if (++k < 60) requestAnimationFrame(f); else res((performance.now() - s) / 60); }; requestAnimationFrame(f); });
      const nav = performance.getEntriesByType('navigation')[0];
      const paint = performance.getEntriesByType('paint').map(p => [p.name, Math.round(p.startTime)]);
      const bench = R.bench ? R.bench(60) : null;
      const cv = document.getElementById('gl');
      return { renderer, frameMs, cadenceMs: cadence, dcl: nav && Math.round(nav.domContentLoadedEventEnd), paint, bench, canvasPx: [cv.width, cv.height], dpr: devicePixelRatio, docH: document.documentElement.scrollHeight, vh: innerHeight };
    });

    const stops = [['hero', 0], ['about', '#about'], ['lomtoku', '#lom-toku'], ['photos', '.photos'], ['exhibitions', '#exhibitions'], ['end', 'end']];
    for (const [label, target] of stops) {
      await page.evaluate(t => {
        let y = 0;
        if (t === 'end') y = document.documentElement.scrollHeight;
        else if (typeof t === 'string') { const el = document.querySelector(t); y = el.getBoundingClientRect().top + scrollY - (t === '.photos' ? 120 : 0); }
        window.scrollTo(0, y);
      }, target);
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(OUT, `${prof.name}-${label}.jpg`), type: 'jpeg', quality: 80 });
    }
    // frame cost while the canvas is covered by the opaque text sections (it still renders)
    const coveredMs = await page.evaluate(() => { const R = window.__rods; const n = 10; const t = performance.now(); for (let i = 0; i < n; i++) R.capture(0, 0, 1, 1); return (performance.now() - t) / n; });

    const totalKB = Math.round(Object.values(bytes).reduce((a, b) => a + b, 0) / 1024);
    report[prof.name] = { loadMs, totalKB, byType: Object.fromEntries(Object.entries(bytes).map(([k, v]) => [k, Math.round(v / 1024)])), biggest: reqs.sort((a, b) => b[1] - a[1]).slice(0, 8).map(([u, b]) => [u.slice(-70), Math.round(b / 1024)]), ...info, coveredFrameMs: coveredMs, consoleErrors };
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
