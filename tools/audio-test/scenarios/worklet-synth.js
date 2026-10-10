/* Synth on the AudioWorklet capture: no ScriptProcessor; the passive 4-minute ring gathers at real-time rate
   (gathered seconds per wall second and per audio-clock second, over 6 s of the seed playing), and the ring holds
   exactly what the batches carried. gaps = jumps in the batches' frame index (Chromium skips rendering a few quanta
   at start-up; nothing is lost, the samples stay contiguous): reported, not failed. Also measured on the
   ScriptProcessor version (commit 01b20f4) for comparison. */
const { execSync } = require('child_process');
const OLD_REV = '01b20f4';
const HOOKS = `(() => { window.__SP = 0; window.__WKN = 0;
  const P = (window.BaseAudioContext || window.AudioContext).prototype, sp = P.createScriptProcessor;
  if (sp) P.createScriptProcessor = function () { window.__SP++; return sp.apply(this, arguments); };
  const N = window.AudioWorkletNode; window.__B = { n: 0, gaps: 0, end: -1 };
  if (N) { const W = function (c, n, o) { window.__WKN++; const x = new N(c, n, o);   // watch the batches
    x.port.addEventListener('message', (e) => { const m = e.data, B = window.__B; if (B.end >= 0 && m.f !== B.end) { B.gaps++; (B.at = B.at || []).push([B.end, m.f - B.end, m.n]); } B.end = m.f + m.n; B.n += m.n; }); return x; };
    W.prototype = N.prototype; window.AudioWorkletNode = W; } })();`;
async function run(lib, old) {
  const W = lib.VIEW.width, H = lib.VIEW.height, SEED = { x: W / 2, y: Math.round(H * .56) };
  const br = await lib.browser(); const ctx = await br.newContext({ viewport: lib.VIEW, deviceScaleFactor: lib.DPR, hasTouch: true });
  if (old) { const src = execSync(`git show ${OLD_REV}:audio/t/synth.html`, { cwd: lib.ROOT, maxBuffer: 1 << 26 }).toString();
    await ctx.route('**/audio/t/synth.html', r => r.fulfill({ body: src, contentType: 'text/html; charset=utf-8' })); }
  await ctx.addInitScript(HOOKS);
  const page = await ctx.newPage(); const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(`http://127.0.0.1:${+(process.env.AT_PORT || 8794)}/audio/t/synth.html`, { waitUntil: 'load' }); await page.waitForTimeout(800);
  await page.mouse.click(SEED.x, SEED.y);
  await page.waitForFunction(() => __S.run && __S.ctx && __S.ctx.state === 'running' && __CAP().gathered > 0.5, null, { timeout: 8000 });
  const r = await page.evaluate(async () => { const c = __S.ctx, a = { g: __CAP().gathered, ct: c.currentTime, w: performance.now() };
    await new Promise(r => setTimeout(r, 6000));
    const b = { g: __CAP().gathered, ct: c.currentTime, w: performance.now() };
    return { rate: (b.g - a.g) / ((b.w - a.w) / 1000), rateAudio: (b.g - a.g) / (b.ct - a.ct), secs: (b.w - a.w) / 1000, sp: __SP, wkn: __WKN, gaps: __B.gaps, gapAt: __B.at, batchSec: __B.n / c.sampleRate, gathered: __CAP().gathered }; });
  await br.close();
  return { rate: +r.rate.toFixed(4), rateAudio: +r.rateAudio.toFixed(4), secs: +r.secs.toFixed(2), sp: r.sp, wkn: r.wkn, gaps: r.gaps, gapAt: r.gapAt, batchSec: +r.batchSec.toFixed(4), gathered: +r.gathered.toFixed(4), errors: errors.filter(e => !/service ?worker/i.test(e)) };
}
module.exports = async (lib) => {
  const dir = lib.outDir('worklet-synth');
  const now = await run(lib, false), before = await run(lib, true);
  const checks = { noScriptProcessor: now.sp === 0 && before.sp > 0, worklet: now.wkn >= 1, realTime: lib.near(now.rate, 1, 0.02), audioClock: lib.near(now.rateAudio, 1, 0.02), ringHoldsEveryBatch: lib.near(now.batchSec, now.gathered, 1e-6), noErrors: !now.errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, summary: { rate: { now: now.rate, before: before.rate } }, now, before });
};
