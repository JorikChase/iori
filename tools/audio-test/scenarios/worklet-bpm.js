/* BPM detector on the AudioWorklet capture: no ScriptProcessor; recording click120.wav for ~4 s keeps the raw pcm
   (real clicks, not silence) and the library take is as long as the recording (from the moment the microphone is
   live to the stop tap), minus what is still in flight when the context closes. The same loss is measured on the ScriptProcessor version (commit 01b20f4). */
const { execSync } = require('child_process');
const OLD_REV = '01b20f4';
const HOOKS = `(() => { window.__SP = 0; window.__WKN = 0; window.__DOWNS = [];
  const P = (window.BaseAudioContext || window.AudioContext).prototype, sp = P.createScriptProcessor;
  if (sp) P.createScriptProcessor = function () { window.__SP++; return sp.apply(this, arguments); };
  const N = window.AudioWorkletNode; if (N) { const W = function (c, n, o) { window.__WKN++; return new N(c, n, o); }; W.prototype = N.prototype; window.AudioWorkletNode = W; }
  addEventListener('pointerdown', (e) => window.__DOWNS.push(e.timeStamp), true);
  const t = setInterval(() => { if (window.__S && __S.rec && !window.__RECAT) { window.__RECAT = performance.now(); clearInterval(t); } }, 1); })();`;
async function run(lib, old) {
  const W = lib.VIEW.width, H = lib.VIEW.height, REC = [34 + (W - 68) / 3, H - 28];
  const br = await lib.browser();
  const page = await lib.open(br, 'bpm', { wait: 300, wav: 'click120.wav' });
  if (old) { const src = execSync(`git show ${OLD_REV}:audio/t/bpm.html`, { cwd: lib.ROOT, maxBuffer: 1 << 26 }).toString();
    await page.route('**/audio/t/bpm.html', r => r.fulfill({ body: src, contentType: 'text/html; charset=utf-8' })); }
  await page.addInitScript(HOOKS); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(800);
  await page.mouse.click(...REC); await page.waitForFunction(() => __S.rec && __S.pcmN > 0, null, { timeout: 6000 });
  await page.waitForTimeout(4000);
  const live = await page.evaluate(() => { let p = 0; __S.pcm.forEach(b => { for (let i = 0; i < b.length; i++) { const a = Math.abs(b[i]); if (a > p) p = a; } }); return { pk: p, n: __S.pcmN }; });
  await page.mouse.click(...REC);
  await page.waitForFunction(() => !!__S.takeId, null, { timeout: 8000 }).catch(() => {});
  const r = await page.evaluate(async () => { const m = (await AT.takes.list()).find(t => t.id === __S.takeId);
    return { dur: m ? m.dur : 0, span: (__DOWNS[__DOWNS.length - 1] - __RECAT) / 1000, n: __S.n, bpm: __S.res && __S.res.bpm, sp: __SP, wkn: __WKN }; });
  const errors = page.errors; await br.close();
  return { dur: +r.dur.toFixed(4), span: +r.span.toFixed(4), loss: +(r.span - r.dur).toFixed(4), bpm: r.bpm && +r.bpm.toFixed(1), pcmPeak: +live.pk.toFixed(3), sp: r.sp, wkn: r.wkn, errors };
}
module.exports = async (lib) => {
  const dir = lib.outDir('worklet-bpm');
  const now = await run(lib, false), before = await run(lib, true);
  const checks = { noScriptProcessor: now.sp === 0 && before.sp > 0, worklet: now.wkn === 1, realPcm: now.pcmPeak > 0.3, takeKept: now.dur > 3.5,
    lossSmall: now.loss >= -0.01 && now.loss < 0.1, tempo: !!now.bpm && Math.abs(now.bpm - 120) < 2, noErrors: !now.errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, summary: { loss: { now: now.loss, before: before.loss } }, now, before });
};
