/* Why the port: capture while the main thread is busy. The recorder records a steady 440 Hz sine (sine440.wav) for
   ~3 s while the page's main thread is blocked 120 ms out of every 150 (the shell, two tool frames and their WebGL
   share it on a phone). Every break in the sine in the take is counted (a sample that the 440 Hz recurrence
   x[i+1] = 2cos(w)x[i] - x[i-1] does not predict). Measured on the AudioWorklet version and on the ScriptProcessor
   version (commit 01b20f4): the worklet take must have no break. */
const { execSync } = require('child_process');
const OLD_REV = '01b20f4';
async function run(lib, old) {
  const W = lib.VIEW.width, H = lib.VIEW.height; const C = { x: W / 2, y: Math.round(H * .45) };
  const br = await lib.browser();
  const page = await lib.open(br, 'rec', { wait: 300, wav: 'sine440.wav' });
  if (old) { const src = execSync(`git show ${OLD_REV}:audio/t/rec.html`, { cwd: lib.ROOT, maxBuffer: 1 << 26 }).toString();
    await page.route('**/audio/t/rec.html', r => r.fulfill({ body: src, contentType: 'text/html; charset=utf-8' })); await page.reload({ waitUntil: 'load' }); }
  await page.waitForTimeout(800);
  await page.mouse.click(C.x, C.y); await page.waitForFunction(() => __S.rec === true, null, { timeout: 8000 });
  await page.waitForTimeout(400); await page.mouse.click(C.x, C.y);
  await page.waitForFunction(() => !__S.rec && !__S.tail, null, { timeout: 4000 }); await page.waitForTimeout(700);
  await page.mouse.click(C.x, C.y); await page.waitForTimeout(200);
  await page.evaluate(() => { window.__BUSY = setInterval(() => { const t = performance.now(); while (performance.now() - t < 120); }, 150); });
  await page.waitForTimeout(3000);
  await page.evaluate(() => clearInterval(window.__BUSY)); await page.waitForTimeout(300);
  await page.mouse.click(C.x, C.y);
  await page.waitForFunction(() => !__S.tail && !__S.cur, null, { timeout: 4000 }); await page.waitForTimeout(800);
  const r = await page.evaluate(async () => { const m = (await AT.takes.list()).find(t => t.kind === 'rec'), t = await AT.takes.get(m.id), d = t.data, sr = t.sr;
    const k = 2 * Math.cos(2 * Math.PI * 440 / sr); let breaks = 0, last = -1e9;
    for (let i = 1; i < d.length - 1; i++) { if (Math.abs(d[i + 1] - (k * d[i] - d[i - 1])) > 0.01) { if (i - last > 64) breaks++; last = i; } }   // one count per break, not per sample
    return { dur: +t.dur.toFixed(3), breaks }; });
  await br.close(); return r;
}
module.exports = async (lib) => {
  const dir = lib.outDir('worklet-busy');
  const now = await run(lib, false), before = await run(lib, true);
  const checks = { noBreaks: now.breaks === 0, took: now.dur > 3 };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, summary: { breaks: { now: now.breaks, before: before.breaks } }, now, before });
};
