/* Analyzer on the AudioWorklet capture: no ScriptProcessor; the loudness numbers for a 1 kHz sine at -20 dBFS from the
   microphone match the ScriptProcessor version (commit 01b20f4) — momentary -23.0 LUFS, short-term, integrated,
   RMS, peak — read after the same 3.5 s of listening. */
const { execSync } = require('child_process');
const OLD_REV = '01b20f4';
const HOOKS = `(() => { window.__SP = 0; window.__WKN = 0;
  const P = (window.BaseAudioContext || window.AudioContext).prototype, sp = P.createScriptProcessor;
  if (sp) P.createScriptProcessor = function () { window.__SP++; return sp.apply(this, arguments); };
  const N = window.AudioWorkletNode; if (N) { const W = function (c, n, o) { window.__WKN++; return new N(c, n, o); }; W.prototype = N.prototype; window.AudioWorkletNode = W; } })();`;
async function run(lib, old) {
  const W = lib.VIEW.width, H = lib.VIEW.height, CTL = [W / 2, Math.round(H * .55)];
  const br = await lib.browser();
  const page = await lib.open(br, 'ana', { wait: 300, wav: 'tone1k_m20.wav' });
  if (old) { const src = execSync(`git show ${OLD_REV}:audio/t/ana.html`, { cwd: lib.ROOT, maxBuffer: 1 << 26 }).toString();
    await page.route('**/audio/t/ana.html', r => r.fulfill({ body: src, contentType: 'text/html; charset=utf-8' })); }
  await page.addInitScript(HOOKS); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(800);
  await page.mouse.click(...CTL); await page.waitForFunction(() => __S.run, null, { timeout: 6000 }); await page.waitForTimeout(3500);
  const r = await page.evaluate(() => ({ mom: __S.mom, sh: __S.sh, intg: __S.intg, rms: __S.rms, pk: __S.pk, blocks: __S.kwBlocks.length, sp: __SP, wkn: __WKN }));
  const errors = page.errors; await br.close();
  const f = (v) => +v.toFixed(3);
  return { mom: f(r.mom), sh: f(r.sh), intg: f(r.intg), rms: f(r.rms), pk: f(r.pk), blocks: r.blocks, sp: r.sp, wkn: r.wkn, errors };
}
module.exports = async (lib) => {
  const dir = lib.outDir('worklet-ana');
  const now = await run(lib, false), before = await run(lib, true);
  const same = ['mom', 'sh', 'intg', 'rms', 'pk'].every(k => lib.near(now[k], before[k], 0.1));
  const checks = { noScriptProcessor: now.sp === 0 && before.sp > 0, worklet: now.wkn >= 1, momentary: lib.near(now.mom, -23, 0.2), sameAsBefore: same, noErrors: !now.errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, now, before });
};
