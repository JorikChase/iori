// Checks for the live studies in kalivoda/: they load when their exhibition opens, render,
// respond, open in the large view, and what a frame costs. Frames are saved to out/s-*.jpg.
// Usage (with the studies restored to the page, see README.md): node tools/kalivoda-studies/studies-test.js [baseUrl]
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(__dirname, '../audio-test/node_modules/playwright'));
const BASE = process.argv[2] || 'http://127.0.0.1:8799/kalivoda/';
const OUT = path.join(__dirname, '../kalivoda-audit/out');
fs.mkdirSync(OUT, { recursive: true });
const save = (name, dataUrl) => fs.writeFileSync(path.join(OUT, name), Buffer.from(dataUrl.split(',')[1], 'base64'));

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
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const r = { errors };
    const loadedBefore = await page.evaluate(() => Object.keys(window.__studies || {}));
    r.loadedBeforeOpen = loadedBefore;

    for (const [name, nth] of [['shards', 2], ['surface', 6]]) {
      // open the exhibition; the study module loads then
      await page.evaluate(n => { const d = document.querySelectorAll('details.ex')[n - 1]; d.open = true; d.scrollIntoView(); }, nth);
      await page.waitForFunction(n => window.__studies && window.__studies[n], name, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(600);
      const ok = await page.evaluate(n => !!(window.__studies && window.__studies[n]), name);
      if (!ok) { r[name] = { loaded: false }; continue; }
      const s = {};
      // frame cost: 60 frames without readback, then one readback to wait for the GPU
      s.msPerFrame = await page.evaluate(n => { const a = window.__studies[n]; a.stop(); a.snap(); const t = performance.now(); a.run(1); a.snap(); return +((performance.now() - t) / 61).toFixed(2); }, name);
      s.stats = await page.evaluate(n => window.__studies[n].stats(), name);
      if (name === 'shards') {
        save(`s-${prof.name}-shards-0.jpg`, await page.evaluate(() => window.__studies.shards.snap()));
        // the lamp lingers left, then right: the paper should keep both
        await page.evaluate(() => { const a = window.__studies.shards; a.lampTo(-.6, .5); a.run(5); a.lampTo(.5, .1); a.run(5); });
        save(`s-${prof.name}-shards-10s.jpg`, await page.evaluate(() => window.__studies.shards.snap()));
        await page.evaluate(() => { const a = window.__studies.shards; a.lampTo(0, .9); a.run(8); });
        save(`s-${prof.name}-shards-18s.jpg`, await page.evaluate(() => window.__studies.shards.snap()));
      } else {
        save(`s-${prof.name}-surface-calm.jpg`, await page.evaluate(() => { const a = window.__studies.surface; a.run(2); return a.snap(); }));
        save(`s-${prof.name}-surface-shake.jpg`, await page.evaluate(() => { const a = window.__studies.surface; a.shake(1); a.run(1.2); return a.snap(); }));
        save(`s-${prof.name}-surface-touch.jpg`, await page.evaluate(() => { const a = window.__studies.surface; a.poke(.35, .6); a.poke(.62, .4, -.008); a.run(.7); return a.snap(); }));
      }
      // the large view: click the tile, check the canvas moved into the viewer, then close
      await page.evaluate(n => { const t = document.querySelector(`.study[data-artefact="${n}"]`); t.scrollIntoView({ block: 'center' }); }, name);
      await page.waitForTimeout(300);
      await page.click(`.study[data-artefact="${name}"]`);
      await page.waitForTimeout(900);
      s.viewer = await page.evaluate(() => { const lb = document.getElementById('lb'); const c = lb.querySelector('canvas'); return { open: lb.open, canvasInViewer: !!c, size: c ? [c.width, c.height] : null, caption: lb.querySelector('figcaption').textContent }; });
      s.msPerFrameLarge = await page.evaluate(n => { const a = window.__studies[n]; a.stop(); a.snap(); const t = performance.now(); a.run(1); a.snap(); a.start(); return +((performance.now() - t) / 61).toFixed(2); }, name);
      // interact in the large view
      const box = await page.evaluate(() => { const c = document.querySelector('#lb canvas'); const b = c.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
      if (box) {
        await page.mouse.move(box[0] + box[2] * .3, box[1] + box[3] * .4);
        await page.mouse.down();
        for (let k = 0; k < 12; k++) { await page.mouse.move(box[0] + box[2] * (.3 + .03 * k), box[1] + box[3] * (.4 + .02 * k)); await page.waitForTimeout(30); }
        await page.mouse.up();
        await page.waitForTimeout(700);
      }
      await page.screenshot({ path: path.join(OUT, `s-${prof.name}-${name}-viewer.jpg`), type: 'jpeg', quality: 82 });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      s.afterClose = await page.evaluate(n => ({ canvasBackInTile: !!document.querySelector(`.study[data-artefact="${n}"] canvas`), viewerOpen: document.getElementById('lb').open }), name);
      await page.screenshot({ path: path.join(OUT, `s-${prof.name}-${name}-tile.jpg`), type: 'jpeg', quality: 82 });
      // closing the exhibition stops the study
      await page.evaluate(n => { document.querySelectorAll('details.ex')[n - 1].open = false; }, nth);
      await page.waitForTimeout(300);
      s.frameCountWhileClosed = await page.evaluate(async n => { const a = window.__studies[n]; const f0 = a.stats().frames; await new Promise(r => setTimeout(r, 500)); return a.stats().frames - f0; }, name);
      r[name] = s;
    }
    res[prof.name] = r;
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'studies.json'), JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
