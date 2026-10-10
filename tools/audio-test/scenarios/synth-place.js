/* Synth: passive 4-minute capture -> place on the editor timeline (real navigation, outside the shell).
   Tap the seed to play, run 12 s -> about 12 s gathered; hold the right-edge dot and drag a little down
   (asks for ~1 s, the minimum is 10 s) -> release -> a 'synth' take of 10 s is in the library, queued in
   localStorage 'audio.place', and the page navigates to edit.html. The take is the synth's real output. */
module.exports = async (lib) => {
  const dir = lib.outDir('synth-place'); const W = lib.VIEW.width, H = lib.VIEW.height;
  const RS = { x: W - 30, y: Math.round(H * .4) }, SEED = { x: W / 2, y: Math.round(H * .56) };
  const br = await lib.browser();
  const ctx = await br.newContext({ viewport: lib.VIEW, deviceScaleFactor: lib.DPR, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => {   // log every write to the placement queue into sessionStorage (survives the navigation)
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k === 'audio.place' && this === window.localStorage) set.call(window.sessionStorage, '__placeLog', v); return set.call(this, k, v); };
  });
  const page = await ctx.newPage(); const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const port = +(process.env.AT_PORT || 8794);
  await page.goto(`http://127.0.0.1:${port}/audio/t/synth.html`, { waitUntil: 'load' }); await page.waitForTimeout(800);
  const before = await page.evaluate(() => AT.takes.list().then(a => a.map(t => t.id)));
  await page.mouse.click(SEED.x, SEED.y);
  await page.waitForFunction(() => __S.run && __S.ctx && __S.ctx.state === 'running', null, { timeout: 6000 });
  const t0 = Date.now(); await page.waitForTimeout(12000);
  const cap = await page.evaluate(() => __CAP()); const wall = (Date.now() - t0) / 1000;
  await page.mouse.move(RS.x, RS.y); await page.mouse.down(); await page.waitForTimeout(120);
  for (let k = 1; k <= 5; k++) { await page.mouse.move(RS.x, RS.y + k * 8); await page.waitForTimeout(30); }
  await page.waitForTimeout(150);
  const sel = await page.evaluate(() => __S.cap && { on: __S.cap.on, sec: +__S.cap.sec.toFixed(3) });
  await page.screenshot({ path: `${dir}/select-10s.png` });
  const nav = page.waitForURL(/\/edit\.html/, { timeout: 6000 }).then(() => true, () => false);
  await page.mouse.up();
  const navigated = await nav; await page.waitForTimeout(900);
  await page.screenshot({ path: `${dir}/edit-after-place.png` });
  const log = await page.evaluate(() => sessionStorage.getItem('__placeLog'));
  let queued = []; try { queued = JSON.parse(log || '[]'); } catch (_) {}
  const take = await page.evaluate(async (before) => {
    const a = (await AT.takes.list()).filter(t => before.indexOf(t.id) < 0); if (!a.length) return null;
    const t = await AT.takes.get(a[0].id); let s = 0; for (let i = 0; i < t.data.length; i++) s += t.data[i] * t.data[i];
    return { id: t.id, kind: t.kind, name: t.name, dur: +t.dur.toFixed(4), sr: t.sr, rms: +Math.sqrt(s / t.data.length).toFixed(5), n: a.length };
  }, before);
  await lib.sheet(br, [`${dir}/select-10s.png`, `${dir}/edit-after-place.png`], `${dir}/sheet.png`, 2, 220);
  await br.close();
  const errs = errors.filter(e => !/serviceworker|service worker/i.test(e));
  const checks = { gathered12: lib.near(cap.gathered, 12, 0.6), selectionOn: !!(sel && sel.on), selection10: !!sel && lib.near(sel.sec, 10, 0.001),
    oneSynthTake: !!take && take.n === 1 && take.kind === 'synth' && /^synth-\d{8}-\d{6}$/.test(take.name), length10: !!take && lib.near(take.dur, 10, 0.1),
    notSilent: !!take && take.rms > 0.001, queued: !!take && queued.some(q => q.id === take.id), navigated, noErrors: !errs.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, cap, wall, sel, take, queued, errors: errs });
};
