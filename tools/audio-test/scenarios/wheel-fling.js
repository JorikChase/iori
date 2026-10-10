/* Wheel picker (audio/wheel.js), tap mode: a momentum flick.
   A fast upward flick on the minutes column (loop) -> momentum carries on after the finger lifts, the column settles
   exactly on a row (integer position, no motion), onChange fired once per row crossed (each call one row on, in
   order, with wrap), and the frame log of the first 60 frames after release has no long frames.
   Also: a flick on a bounded column stops at its end. Frames 0/100/250/600 ms after release go on the sheet. */
const PORT = +(process.env.AT_PORT || 8794);
async function openLab(lib, br, q = '') {
  const ctx = await br.newContext(lib.ENGINE === 'webkit' ? { viewport: lib.VIEW, deviceScaleFactor: lib.DPR, hasTouch: true } : { viewport: lib.VIEW, deviceScaleFactor: lib.DPR, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/audio/lab.html${q}`, { waitUntil: 'load' }); await page.waitForTimeout(400); page.errors = errors; return page;
}
module.exports = async (lib) => {
  const dir = lib.outDir('wheel-fling' + (lib.ENGINE === 'webkit' ? '-webkit' : '')); const br = await lib.browser(); const page = await openLab(lib, br); const shots = [];
  const open = (cfg) => page.evaluate((cfg) => {
    window.__ch = []; window.__done = 'pending';
    const two = (n) => Array.from({ length: n }, (_, i) => String(i).padStart(2, '0'));
    const cols = cfg.bounded ? [{ items: two(12), index: 2 }] : [{ items: two(24), index: 7, loop: true }, { items: two(60), index: cfg.m, loop: true }];
    window.__h = Wheel.open({ mode: 'tap', anchor: { x: 195, y: 420 }, columns: cols, separators: [':'],
      onChange: (ix) => __ch.push(ix.slice()), onDone: (ix) => { window.__done = ix; } });
    return __h.state();
  }, cfg);
  const flick = async (cx, dy, ms, steps = 6) => {
    /* the release time is taken in the page (no round trip between the last move and the lift: the wheel reads a
       finger that rested > 90 ms as stopped) */
    await page.evaluate(() => { Wheel.perf = []; window.__t0 = 0; addEventListener('pointerup', function f() { removeEventListener('pointerup', f, true); window.__t0 = performance.now(); }, true); });
    await page.mouse.move(cx, 470); await page.mouse.down();
    for (let k = 1; k <= steps; k++) { await page.mouse.move(cx, 470 + dy * k / steps); if (k < steps) await page.waitForTimeout(ms / steps); }
    await page.mouse.up();
  };
  /* 1. loop column */
  let st = await open({ m: 50 }); const colX = st.cols[1].x;
  await flick(colX, -160, 60);
  const atLift = await page.evaluate(() => ({ pos: __h.state().cols[1].pos, ch: __ch.length }));
  await page.waitForFunction(() => !__h.state().cols[1].moving, null, { timeout: 8000 });
  await page.waitForTimeout(150);
  const end = await page.evaluate(() => ({ t0: __t0, st: __h.state(), ch: __ch, perf: Wheel.perf.slice(), settleMs: Wheel.perf.length ? Wheel.perf[Wheel.perf.length - 1].t - __t0 : 0 }));
  const c1 = end.st.cols[1], seq = end.ch.map(v => v[1]);
  let stepOk = true; for (let i = 1; i < seq.length; i++) if ((seq[i] - seq[i - 1] + 60) % 60 !== 1) stepOk = false;
  const rowsTravelled = ((c1.idx - 50) % 60 + 60) % 60;   /* loop columns renormalise their position once settled */
  /* frame intervals: the first 60 frames after the lift (rAF timestamps), and the work done per frame */
  const after = end.perf.filter(f => f.t >= end.t0), fr = after.slice(1, 61), iv = fr.map(f => f.dt), work = after.map(f => f.work);
  const maxIv = Math.max(...iv), meanIv = iv.reduce((a, b) => a + b, 0) / Math.max(1, iv.length), long = iv.filter(v => v > 34).length;
  const maxWork = Math.max(...work), meanWork = work.reduce((a, b) => a + b, 0) / Math.max(1, work.length);
  await page.mouse.click(195, 420); await page.waitForTimeout(400);   /* confirm via the centre band */
  const done1 = await page.evaluate(() => window.__done);
  /* the same flick again, for the sheet only (screenshots stall frames, so the measured flick above takes none) */
  st = await open({ m: 50 }); await flick(colX, -160, 60);
  for (const t of [0, 100, 250, 600]) { const now = await page.evaluate(() => performance.now() - __t0); if (t > now) await page.waitForTimeout(t - now);
    const f = `${dir}/flick-${String(t).padStart(4, '0')}.png`; await page.screenshot({ path: f }); shots.push(f); }
  await page.waitForFunction(() => !__h.state().cols[1].moving, null, { timeout: 8000 }); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  /* 2. bounded column: a hard flick stops on the last row */
  st = await open({ bounded: true }); await flick(st.cols[0].x, -200, 50);
  await page.waitForFunction(() => !__h.state().cols[0].moving, null, { timeout: 8000 }); await page.waitForTimeout(100);
  const b = await page.evaluate(() => __h.state().cols[0]);
  await page.mouse.click(195, 420); await page.waitForTimeout(300);
  await lib.sheet(br, shots, `${dir}/sheet.png`, 4, 180);
  const errors = page.errors; await br.close();
  const checks = {
    momentum: end.ch.length > atLift.ch,   /* rows were crossed after the finger lifted */
    travelled: rowsTravelled >= 5,
    settledOnRow: Math.abs(c1.pos - Math.round(c1.pos)) < 1e-6 && !c1.moving,
    oncePerRow: end.ch.length === rowsTravelled && stepOk,
    committed: Array.isArray(done1) && done1[1] === c1.idx,
    sixtyFrames: fr.length >= 60,
    /* a long interval with almost no work in it is the host's scheduler, not the wheel (load average is recorded) */
    noLongFrames: (long === 0 && maxIv < 50) || (maxWork < 4 && require('os').loadavg()[0] > 2 * require('os').cpus().length),
    cheapFrames: meanWork < 3 && maxWork < 12,
    boundedStops: b.idx === 11 && Math.abs(b.pos - 11) < 1e-6,
    noErrors: !errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, atLift, rowsTravelled, onChange: end.ch.length, finalIdx: c1.idx, settleMs: Math.round(end.settleMs),
    load: require('os').loadavg().map(v => +v.toFixed(1)), frames: { n: fr.length, meanIv: +meanIv.toFixed(2), maxIv: +maxIv.toFixed(2), long, meanWork: +meanWork.toFixed(3), maxWork: +maxWork.toFixed(3), intervals: iv.map(v => +v.toFixed(1)) }, bounded: b, errors });
};
