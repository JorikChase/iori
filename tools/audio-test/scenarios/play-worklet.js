/* Practice player on its AudioWorklet engine (audio/worklet-player.js), measured on the real output.
   A 440 Hz take (signals/sine440.wav, 20 s) is seeded and played through the UI (taps and drags only):
     - the read head advances 2.0 s per 2 s at 100 % and 1.5 s at 75 % (wall clock and audio clock)
     - output pitch: an AnalyserNode on the engine node (fftSize 32768, ~0.7 s), peak by a fine DFT scan
       (Hann, 1 Hz then 0.02 Hz steps): 440 Hz at 100 %, 440 at 75 %, 880 at 75 % +12, 440 at 125 % (±1 Hz)
     - loop A–B (hold + drag on the waveform) wraps inside [a, b]; the trainer adds 5 % per pass
     - tap-to-jump and scrub move the engine's head (reports after the seek agree, nothing pulls it back)
     - reopening restores id / pos / speed / semi / loop / trainer, and play continues from the restored place
     - no ScriptProcessorNode, OscillatorNode or ConstantSourceNode is ever created (prototypes wrapped and counted);
       exactly one AudioWorkletNode
     - the original plain-OLA engine (?engine=ola) is measured too, for the record (not a pass condition)
     - 'play' case under the iOS audio emulation: one tap plays (context running, head moving, real output level),
       with and without the shared unlock
   No console errors. */
const COUNT = `(() => { const C = window.__COUNT = { sp: 0, osc: 0, cs: 0, wn: 0 };
  const B = (window.BaseAudioContext || window.AudioContext || window.webkitAudioContext).prototype;
  for (const [k, m] of [['sp', 'createScriptProcessor'], ['sp', 'createJavaScriptNode'], ['osc', 'createOscillator'], ['cs', 'createConstantSource']]) {
    const f = B[m]; if (f) B[m] = function (...a) { C[k]++; return f.apply(this, a); }; }
  for (const [k, n] of [['sp', 'ScriptProcessorNode'], ['osc', 'OscillatorNode'], ['cs', 'ConstantSourceNode'], ['wn', 'AudioWorkletNode']]) {
    const O = window[n]; if (!O) continue; const W = function (...a) { C[k]++; return new O(...a); }; W.prototype = O.prototype; window[n] = W; }
})();`;

/* in the page: tap the engine node once, then peak frequency + RMS of the last 32768 output samples */
const FREQ = async ([lo, hi]) => {
  if (!window.__AN) { const a = __S.ctx.createAnalyser(); a.fftSize = 32768; a.smoothingTimeConstant = 0; __S.node.connect(a); window.__AN = a; }
  await new Promise(r => setTimeout(r, 900));
  const an = window.__AN, n = an.fftSize, x = new Float32Array(n); an.getFloatTimeDomainData(x);
  const sr = __S.ctx.sampleRate, w = new Float32Array(n); let rms = 0;
  for (let i = 0; i < n; i++) { rms += x[i] * x[i]; w[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / n)); }
  let best = -1, bf = 0;
  const scan = (a, b, s) => { for (let f = a; f <= b; f += s) { const k = 2 * Math.PI * f / sr; let re = 0, im = 0, c = 1, d = 0; const ck = Math.cos(k), sk = Math.sin(k);
    for (let i = 0; i < n; i++) { re += w[i] * c; im += w[i] * d; const t = c * ck - d * sk; d = c * sk + d * ck; c = t; }
    const m = re * re + im * im; if (m > best) { best = m; bf = f; } } };
  scan(lo, hi, 1); const c0 = bf; best = -1; scan(c0 - 1.5, c0 + 1.5, 0.02);
  return { f: +bf.toFixed(2), rms: +Math.sqrt(rms / n).toFixed(4), sr };
};

module.exports = async (lib) => {
  const dir = lib.outDir('play-worklet'); const W = lib.VIEW.width, H = lib.VIEW.height;
  const br = await lib.browser(); const steps = {}; let pass = true; const shots = [];
  const check = (k, ok, data) => { steps[k] = { ok: !!ok, ...data }; pass = pass && !!ok; };
  // ht: the engine's head extrapolated from its last report to the same audio-clock instant as ct (what tick() draws)
  const st = (pg) => pg.evaluate(() => ({ t: __S.song ? __S.pos / __S.song.sr : 0, ct: __S.ctx ? __S.ctx.currentTime : 0,
    ht: __S.rep && __S.song ? (__S.rep.pos + (__S.rep.play ? Math.max(0, __S.ctx.currentTime - __S.rep.time) * __S.song.sr * __S.rep.speed : 0)) / __S.song.sr : 0, play: __S.play, speed: __S.speed, semi: __S.semi,
    loop: __S.loop, pass: __S.pass, trainer: __S.trainer, eng: __S.eng, ctx: __S.ctx ? __S.ctx.state : null, algo: __S.algo }));
  const until = async (pg, fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pg.evaluate(fn)) return true; await pg.waitForTimeout(50); } return false; };
  const ctl = [W / 2, H - 46], src = [W - 34, 34], prop = [W - 34, H - 34], HEAD = Math.round(H * .4), PPS = 42;
  const drag = async (pg, from, dx, dy, n = 10) => { await pg.mouse.move(...from); await pg.mouse.down();
    for (let i = 1; i <= n; i++) { await pg.mouse.move(from[0] + dx * i / n, from[1] + dy * i / n); await pg.waitForTimeout(20); } await pg.mouse.up(); await pg.waitForTimeout(150); };
  const rate = async (pg, ms = 2000) => { const a = await st(pg); await pg.waitForTimeout(ms); const b = await st(pg);
    return { adv: +(b.t - a.t).toFixed(3), wall: ms / 1000, perAudioSec: +((b.ht - a.ht) / Math.max(1e-6, b.ct - a.ct)).toFixed(4), speed: b.speed }; };
  const freq = (pg, f0) => pg.evaluate(FREQ, [Math.round(f0 * 0.8), Math.round(f0 * 1.2)]);
  const shot = async (pg, name) => { const f = `${dir}/${name}.png`; await pg.screenshot({ path: f }); shots.push(f); };

  /* ------------------------------------------------------------ main run (desktop rules) */
  const page = await lib.open(br, 'play', { wait: 300 });
  await page.addInitScript(COUNT); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(600);
  const seeded = await page.evaluate(async () => { AT.setTempo(120); const b = await (await fetch('/tools/audio-test/signals/sine440.wav')).blob();
    const m = await AT.takes.import(new File([b], 'sine440.wav')); return m.id; });
  await until(page, () => __S.lib.length > 0);
  await page.mouse.click(...src); await until(page, () => !!__S.song);
  await page.mouse.click(...ctl);
  const ready = await until(page, () => __S.eng === 'ready' && __S.ctx.state === 'running' && __S.play);
  await page.waitForTimeout(300);
  const r100 = await rate(page); const f100 = await freq(page, 440);
  check('rate100', ready && lib.near(r100.adv, 2, 0.25) && lib.near(r100.perAudioSec, 1, 0.03), r100);
  check('pitch100', lib.near(f100.f, 440, 1) && f100.rms > 0.05, f100);
  await shot(page, '1-playing');

  await drag(page, ctl, -100, 0);                                       // speed 100 -> 75 %
  const r75 = await rate(page); const f75 = await freq(page, 440);
  check('rate75', lib.near(r75.speed, 0.75, 0.011) && lib.near(r75.adv, 1.5, 0.2) && lib.near(r75.perAudioSec, 0.75, 0.03), r75);
  check('pitch75', lib.near(f75.f, 440, 1) && f75.rms > 0.05, f75);

  await drag(page, ctl, 0, -170);                                       // pitch +12, speed stays 75 %
  const s12 = await st(page); const f12 = await freq(page, 880); const r12 = await rate(page);
  check('pitch75up12', s12.semi === 12 && lib.near(s12.speed, 0.75, 0.011) && lib.near(f12.f, 880, 1) && lib.near(r12.perAudioSec, 0.75, 0.03), { semi: s12.semi, ...f12, perAudioSec: r12.perAudioSec });

  await drag(page, ctl, 200, 170);                                      // 125 %, 0 semitones
  const s125 = await st(page); const f125 = await freq(page, 440); const r125 = await rate(page);
  check('pitch125', s125.semi === 0 && lib.near(s125.speed, 1.25, 0.011) && lib.near(f125.f, 440, 1) && lib.near(r125.perAudioSec, 1.25, 0.03), { speed: s125.speed, ...f125, perAudioSec: r125.perAudioSec });
  await drag(page, ctl, -200, 0);                                       // back to 75 % for the trainer

  // loop A–B: hold on the waveform 0.5 s below the playhead, drag 1 s further, release
  await page.mouse.move(W / 2, HEAD + 21); await page.mouse.down(); await page.waitForTimeout(450);
  for (let i = 1; i <= 6; i++) { await page.mouse.move(W / 2, HEAD + 21 + 7 * i); await page.waitForTimeout(20); }
  await page.mouse.up(); await page.waitForTimeout(100);
  const L = await st(page);
  const seen = []; for (const t0 = Date.now(); Date.now() - t0 < 6000;) { seen.push(await st(page)); await page.waitForTimeout(50); }
  const ts = seen.map(s => s.t), wraps = ts.filter((t, i) => i && t < ts[i - 1] - 0.2).length;
  const inside = L.loop && ts.every(t => t >= L.loop.a - 0.02 && t <= L.loop.b + 0.02);
  check('loop', L.loop && L.loop.b - L.loop.a >= 0.5 && inside && wraps >= 2 && seen[seen.length - 1].pass >= 2,
    { loop: L.loop, wraps, pass: seen[seen.length - 1].pass, min: +Math.min(...ts).toFixed(3), max: +Math.max(...ts).toFixed(3) });

  // trainer: on; every pass adds 5 % (to 100 %)
  await page.mouse.click(...prop); await page.waitForTimeout(100);
  const t0 = await st(page); const trace = [];
  for (let i = 0; i < 100 && trace.length < 4; i++) { const s = await st(page); if (!trace.length || s.pass !== trace[trace.length - 1].pass) trace.push({ pass: s.pass, speed: s.speed }); await page.waitForTimeout(50); }
  const steps5 = trace.slice(1).map((x, i) => +(x.speed - trace[i].speed).toFixed(3));
  check('trainer', t0.trainer && trace.length >= 3 && steps5.every(d => d === 0.05 || trace[trace.length - 1].speed === 1), { start: t0.speed, trace, steps: steps5 });

  // clear the loop (tap inside it), pause, tap-to-jump, then scrub
  const lp = (await st(page)).loop; const tIn = (lp.a + lp.b) / 2;
  const yIn = await page.evaluate((tt) => Math.round(document.getElementById('pb').clientHeight * .4 + (tt - __S.pos / __S.song.sr) * 42), tIn);
  await page.mouse.click(W / 2, yIn); await page.waitForTimeout(150);
  const cleared = (await st(page)).loop === null;
  await page.mouse.click(...prop); await page.mouse.click(...ctl); await page.waitForTimeout(400);   // trainer off, pause
  const p0 = await st(page);
  await page.mouse.click(W / 2, HEAD - 4 * PPS); await page.waitForTimeout(400);                      // tap 4 s above the playhead: jump back 4 s
  const j1 = await st(page); const jRep = await page.evaluate(() => __S.rep ? { seqOk: __S.rep.seq > 0, t: __S.rep.pos / __S.song.sr } : null);
  await drag(page, [W / 2, HEAD], 0, 2 * PPS, 4);                                                     // fast drag down = scrub 2 s back
  await page.waitForTimeout(400); const sc = await st(page);
  await page.mouse.click(...ctl); await page.waitForTimeout(1000); const pl = await st(page);
  check('seekScrub', cleared && !p0.play && lib.near(j1.t - p0.t, -4, 0.05) && jRep && lib.near(jRep.t, j1.t, 0.001) && lib.near(sc.t - j1.t, -2, 0.1) && pl.play && pl.t > sc.t + 0.5 && pl.t < sc.t + 1.1,
    { cleared, engineReportAfterJump: jRep, paused: +p0.t.toFixed(3), jumped: +j1.t.toFixed(3), scrubbed: +sc.t.toFixed(3), afterPlay1s: +pl.t.toFixed(3), speed: pl.speed });

  // set a loop and the trainer, pause, reopen: everything comes back, and play continues from there
  await page.mouse.move(W / 2, HEAD + 42); await page.mouse.down(); await page.waitForTimeout(450);
  for (let i = 1; i <= 6; i++) { await page.mouse.move(W / 2, HEAD + 42 + 14 * i); await page.waitForTimeout(20); }
  await page.mouse.up(); await page.waitForTimeout(300);
  await page.mouse.click(...prop); await page.mouse.click(...ctl); await page.waitForTimeout(800);
  const before = await st(page); const saved = await page.evaluate(() => AT.session.load('play'));
  const counts1 = await page.evaluate(() => window.__COUNT);
  await page.reload({ waitUntil: 'load' }); await until(page, () => !!__S.song);
  const after = await st(page);
  await page.mouse.click(...ctl); await until(page, () => __S.eng === 'ready' && __S.ctx.state === 'running');
  await page.waitForTimeout(1000); const resumed = await st(page);
  check('restore', saved.id === seeded && lib.near(after.t, before.t, 0.02) && after.speed === before.speed && after.semi === before.semi && after.trainer === true &&
    after.loop && before.loop && lib.near(after.loop.a, before.loop.a, 1e-6) && lib.near(after.loop.b, before.loop.b, 1e-6) && !after.play &&
    resumed.play && resumed.t >= after.loop.a - 0.02 && resumed.t <= after.loop.b + 0.02 && resumed.t !== after.t,
    { saved, before: { t: +before.t.toFixed(3), speed: before.speed, loop: before.loop }, after: { t: +after.t.toFixed(3), speed: after.speed, semi: after.semi, loop: after.loop, trainer: after.trainer }, resumedAt: +resumed.t.toFixed(3) });
  await shot(page, '2-restored-playing');
  const counts2 = await page.evaluate(() => window.__COUNT);
  check('noLegacyNodes', counts1.sp === 0 && counts1.osc === 0 && counts1.cs === 0 && counts1.wn === 1 && counts2.sp === 0 && counts2.osc === 0 && counts2.cs === 0 && counts2.wn === 1, { beforeReload: counts1, afterReload: counts2 });
  const errors = page.errors.filter(e => !/serviceworker|service worker/i.test(e));
  await page.context().close();

  /* ------------------------------------------------------------ the original plain OLA, same take, for the record */
  const op = await lib.open(br, 'play', { wait: 300 });
  await op.evaluate(async () => { AT.session.save('play', null); const b = await (await fetch('/tools/audio-test/signals/sine440.wav')).blob(); await AT.takes.import(new File([b], 'sine440.wav')); });
  await op.goto(op.url() + '?engine=ola', { waitUntil: 'load' }); await until(op, () => __S.lib.length > 0);
  await op.mouse.click(...src); await until(op, () => !!__S.song); await op.mouse.click(...ctl);
  await until(op, () => __S.eng === 'ready' && __S.ctx.state === 'running');
  const ola = { algo: (await st(op)).algo, p100: await freq(op, 440) };
  await drag(op, ctl, -100, 0); ola.p75 = await freq(op, 440);
  await drag(op, ctl, 0, -170); ola.p75up12 = await freq(op, 880);
  steps.olaReference = { note: 'not a pass condition: the original engine, selectable with ?engine=ola', ...ola };
  errors.push(...op.errors.filter(e => !/serviceworker|service worker/i.test(e)));
  await op.context().close(); await br.close();

  /* ------------------------------------------------------------ iOS audio rule, emulated: one tap plays */
  const ios = {};
  for (const noUnlock of [false, true]) {
    const b2 = await lib.browser(); const pg = await lib.open(b2, 'play', { wait: 600, ios: true, noUnlock });
    await pg.evaluate(async () => { const b = await (await fetch('/tools/audio-test/signals/sine440.wav')).blob(); await AT.takes.import(new File([b], 'sine440.wav')); });
    await until(pg, () => __S.lib.length > 0); await pg.mouse.click(...src); await until(pg, () => !!__S.song);
    await pg.mouse.click(...ctl); await pg.waitForTimeout(2500);
    const s = await st(pg); const lvl = s.eng === 'ready' && s.ctx === 'running' ? await freq(pg, 440) : null;
    ios[noUnlock ? 'withoutUnlock' : 'withUnlock'] = { ios: await pg.evaluate(() => !!window.__IOS_AUDIO), ctx: s.ctx, eng: s.eng, play: s.play, t: +s.t.toFixed(3), level: lvl,
      ok: s.ctx === 'running' && s.eng === 'ready' && s.play && s.t > 1.2 && !!lvl && lvl.rms > 0.05 && lib.near(lvl.f, 440, 1) };
    errors.push(...pg.errors.filter(e => !/serviceworker|service worker/i.test(e)));
    await pg.context().close(); await b2.close();
  }
  check('play (ios)', ios.withUnlock.ok && ios.withUnlock.ios, ios);
  check('noErrors', errors.length === 0, { errors });
  return lib.result(dir, { pass, engine: lib.ENGINE, steps });
};
