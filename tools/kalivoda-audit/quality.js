// Image difference of URL variants against the default render, on one fixed pose.
// Usage: node tools/kalivoda-audit/quality.js [baseUrl] [variant ...]
// Writes out/q-<profile>-<variant>.png and a ×8 difference map out/qd-<profile>-<variant>.png.
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(__dirname, '../audio-test/node_modules/playwright'));
const BASE = process.argv[2] || 'http://127.0.0.1:8799/kalivoda/';
const VARIANTS = process.argv.slice(3);
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const PROFILES = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
];
const slug = v => (v || 'default').replace(/[^a-z0-9=.]+/gi, '_');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
  const cmp = await (await browser.newContext()).newPage();
  for (const prof of PROFILES) {
    const shots = {};
    for (const v of ['', ...VARIANTS]) {
      const ctx = await browser.newContext({ viewport: prof.viewport, deviceScaleFactor: prof.deviceScaleFactor, isMobile: !!prof.isMobile, hasTouch: !!prof.hasTouch });
      const page = await ctx.newPage();
      await page.goto(BASE + (v ? '?' + v : ''), { waitUntil: 'load' });
      await page.waitForFunction(() => window.__rods && window.__rods.rods.length > 0, null, { timeout: 30000 });
      await page.waitForTimeout(1500);   // portrait texture
      shots[v] = await page.evaluate(() => window.__rods.pose());
      fs.writeFileSync(path.join(OUT, `q-${prof.name}-${slug(v)}.png`), Buffer.from(shots[v].split(',')[1], 'base64'));
      await ctx.close();
    }
    for (const v of VARIANTS) {
      const r = await cmp.evaluate(async ([a, b]) => {
        const load = u => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = u; });
        const [A, B] = await Promise.all([load(a), load(b)]);
        const w = Math.min(A.width, B.width), h = Math.min(A.height, B.height);
        const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
        const sameSize = A.width === B.width && A.height === B.height;
        g.drawImage(A, 0, 0, w, h); const da = g.getImageData(0, 0, w, h).data;
        g.drawImage(B, 0, 0, w, h); const db = g.getImageData(0, 0, w, h).data;
        const hist = new Uint32Array(256); let se = 0;
        const out = g.createImageData(w, h);
        for (let i = 0; i < da.length; i += 4) {
          let m = 0;
          for (let k = 0; k < 3; k++) { const d = Math.abs(da[i + k] - db[i + k]); se += d * d; m = Math.max(m, d); }
          hist[m]++; const q = Math.min(255, m * 8); out.data[i] = q; out.data[i + 1] = q; out.data[i + 2] = q; out.data[i + 3] = 255;
        }
        g.putImageData(out, 0, 0);
        const n = w * h; const pct = p => { let acc = 0; for (let k = 0; k < 256; k++) { acc += hist[k]; if (acc >= p * n) return k; } return 255; };
        const mse = se / (n * 3);
        return { sameSize, psnr: +(10 * Math.log10(255 * 255 / Math.max(mse, 1e-9))).toFixed(1), p99: pct(0.99), p999: pct(0.999), max: pct(1), over8: +(100 * (n - [...hist.slice(0, 9)].reduce((a, b) => a + b, 0)) / n).toFixed(3), diff: c.toDataURL('image/png') };
      }, [shots[''], shots[v]]);
      fs.writeFileSync(path.join(OUT, `qd-${prof.name}-${slug(v)}.png`), Buffer.from(r.diff.split(',')[1], 'base64'));
      console.log(`${prof.name.padEnd(8)} ${v.padEnd(32)} PSNR ${r.psnr} dB  p99 ${r.p99}  p99.9 ${r.p999}  max ${r.max}  >8/255: ${r.over8}%${r.sameSize ? '' : '  (resized to compare)'}`);
    }
  }
  await browser.close();
})();
