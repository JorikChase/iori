/* Recorder on the AudioWorklet capture: no ScriptProcessor is ever created; a ~4 s take spans exactly tap to tap
   (event timeStamps) and is 4 s ±0.03 s; the level meter follows the bursts; and two timing numbers, measured the
   same way on the ScriptProcessor version (commit 01b20f4, served in place of rec.html) for comparison:
     align    where a burst onset lands in the take vs when the fake microphone emitted it (s; + = take starts early;
              includes the fake microphone's own stream delay, so it is a comparison, not an absolute)
     meter    burst emitted -> level readout above -30 dB (s)
   Source: bursts.wav (2 s silence + 1 s 330 Hz tone, repeating) from the injected microphone. */
const { execSync } = require('child_process');
const OLD_REV = '01b20f4';   // last commit with the ScriptProcessor capture
const HOOKS = `(() => {
  window.__SP = 0; window.__WKN = 0; window.__MICT = null; window.__UPS = []; window.__LV = [];
  const P = (window.BaseAudioContext || window.AudioContext).prototype, sp = P.createScriptProcessor;
  if (sp) P.createScriptProcessor = function () { window.__SP++; return sp.apply(this, arguments); };
  const N = window.AudioWorkletNode;
  if (N) { const W = function (c, n, o) { window.__WKN++; return new N(c, n, o); }; W.prototype = N.prototype; window.AudioWorkletNode = W; }
  addEventListener('pointerup', (e) => window.__UPS.push(e.timeStamp), true);
  let up = false; const poll = () => { const S = window.__S; if (S && S.live) { const on = S.lvl > -30; if (on && !up) window.__LV.push(performance.now()); up = on; } requestAnimationFrame(poll); };
  requestAnimationFrame(poll);
})();`;

async function run(lib, old) {
  const W = lib.VIEW.width, H = lib.VIEW.height; const C = { x: W / 2, y: Math.round(H * .45) };
  const br = await lib.browser();
  const ctx = await br.newContext(lib.ENGINE === 'webkit' ? { viewport: lib.VIEW, deviceScaleFactor: lib.DPR, hasTouch: true } : { viewport: lib.VIEW, deviceScaleFactor: lib.DPR, hasTouch: true, isMobile: true, permissions: ['microphone'] });
  if (old) { const src = execSync(`git show ${OLD_REV}:audio/t/rec.html`, { cwd: lib.ROOT, maxBuffer: 1 << 26 }).toString();
    await ctx.route('**/audio/t/rec.html', r => r.fulfill({ body: src, contentType: 'text/html; charset=utf-8' })); }
  const page = await ctx.newPage(); const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const port = +(process.env.AT_PORT || 8794);
  await page.addInitScript(HOOKS);
  await page.addInitScript(`(() => { const MD = window.MediaDevices && MediaDevices.prototype; if (!MD) return; const real = MD.getUserMedia;
    MD.getUserMedia = async function (c) { if (!c || !c.audio) return real.call(this, c);
      const ac = new (window.__MIC_AC = window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
      const buf = await ac.decodeAudioData(await (await fetch('http://127.0.0.1:${port}/tools/audio-test/signals/bursts.wav')).arrayBuffer());
      const src = ac.createBufferSource(); src.buffer = buf; const dst = ac.createMediaStreamDestination(); src.connect(dst);
      await ac.resume(); src.start(); window.__MICT = { perf: performance.now(), ct: ac.currentTime }; window.__MIC = { ac, src, buf }; return dst.stream; }; })();`);
  await page.goto(`http://127.0.0.1:${port}/audio/t/rec.html`, { waitUntil: 'load' }); await page.waitForTimeout(800);
  await page.mouse.click(C.x, C.y); await page.waitForFunction(() => __S.rec === true, null, { timeout: 8000 });
  await page.waitForTimeout(400); await page.mouse.click(C.x, C.y);            // a short take: the microphone is now live
  await page.waitForFunction(() => !__S.rec && !__S.tail, null, { timeout: 4000 }); await page.waitForTimeout(700);
  const n0 = await page.evaluate(() => __UPS.length);
  await page.mouse.click(C.x, C.y); await page.waitForTimeout(4000); await page.mouse.click(C.x, C.y);
  const stopAt = await page.evaluate(() => performance.now());
  await page.waitForFunction(() => !__S.tail && !__S.cur, null, { timeout: 4000 });
  const savedIn = await page.evaluate((a) => performance.now() - a, stopAt);
  await page.waitForTimeout(800);
  const got = await page.evaluate(async (n0) => {
    const ups = __UPS.slice(n0), list = await AT.takes.list(), m = list.find(t => t.kind === 'rec'), t = await AT.takes.get(m.id), d = t.data, sr = t.sr;
    /* burst onsets in the take: first loud sample after >= 50 ms of quiet */
    const on = []; let quiet = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > 0.05) { if (quiet >= sr * .05) on.push(i / sr); quiet = 0; } else quiet++; }
    const t0 = __S.t0, mic = __MICT, span = (ups[1] - ups[0]) / 1000;
    /* emitted: the fake microphone's burst onsets on the wall clock (2 s, 5 s, 8 s ... after its start) */
    const em = []; for (let k = 0; k < 12; k++) em.push(mic.perf + (2 + 3 * k) * 1000);
    const align = on.map(x => { const e = em.reduce((b, v) => Math.abs(v - (t0 + x * 1000)) < Math.abs(b - (t0 + x * 1000)) ? v : b, em[0]); return +(x - (e - t0) / 1000).toFixed(4); });
    const meter = __LV.map(v => { const prev = em.filter(e => e <= v + 50); return prev.length ? +((v - prev[prev.length - 1]) / 1000).toFixed(4) : null; }).filter(v => v !== null && v < 0.5);
    return { dur: +t.dur.toFixed(5), span: +span.toFixed(5), lastSpan: +__S.lastSpan.toFixed(5), sr, onsets: on.map(v => +v.toFixed(4)), align, meter,
      sp: __SP, wkn: __WKN, lvl: __S.lvl };
  }, n0);
  await br.close();
  return { ...got, savedIn: +(savedIn / 1000).toFixed(3), errors };
}

module.exports = async (lib) => {
  const dir = lib.outDir('worklet-rec');
  const now = await run(lib, false), before = await run(lib, true);
  const mean = (a) => a.length ? +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(4) : null;
  const checks = { noScriptProcessor: now.sp === 0 && before.sp > 0, worklet: now.wkn >= 1, take4s: lib.near(now.dur, 4, 0.03), tapToTap: lib.near(now.dur, now.span, 0.0011),
    meterMoves: now.meter.length >= 1, alignCloser: now.align.length >= 1 && before.align.length >= 1 && Math.abs(mean(now.align)) < Math.abs(mean(before.align)), noErrors: !now.errors.length };
  const summary = { lengthErr: { now: +(now.dur - now.span).toFixed(5), before: +(before.dur - before.span).toFixed(5) },
    align: { now: mean(now.align), before: mean(before.align) }, meter: { now: mean(now.meter), before: mean(before.meter) }, savedAfterStop: { now: now.savedIn, before: before.savedIn } };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, summary, now, before });
};
