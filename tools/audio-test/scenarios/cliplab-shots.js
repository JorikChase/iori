/* Clip Lab — the contact sheet (device pixel ratio as the harness runs, 2 by default): idle, trim, fade, roll,
   crossfade bridge, twist mid-rotation, reversed, clip panel open, wheel on the original tempo; plus the empty
   library (open-file bud) and the body buds. Passes when every state was reached and nothing logged an error. */
const H = require('./cliplab-base.js');
module.exports = async (lib) => {
  const sfx = H.SFX(); const dir = lib.outDir('cliplab-shots' + sfx); const br = await lib.browser(); const files = []; const reached = {};
  const page = await H.openLab(lib, br, { wait: 900 }); await H.shot(page, dir, '00-empty-library', files); reached.empty = await page.evaluate(() => __CL.empty());
  await H.seed(page, H.STD); await H.reload(page);
  const v = await H.view(page), X0 = v.lanes[0], X1 = v.lanes[1]; let cs = await H.clips(page);
  const A = cs.find(c => c.take === 'take-a'), B = cs.find(c => c.take === 'take-b'), C = cs.find(c => c.take === 'take-c');
  /* immediate drags take >= 5 px steps: at DPR 2 software GL slows event delivery enough that tiny steps outlast the 220 ms hold */
  const ph = () => page.evaluate(() => (__CL.gesture() || {}).phase);
  await H.shot(page, dir, '01-idle', files); reached.idle = true;
  // trim (A's top, mid-drag)
  let y = await H.yOf(page, A.s) + 5; await H.drag(page, X0, y, X0, y + 34, { up: false, steps: 5 }); reached.trim = (await ph()) === 'trim'; await H.shot(page, dir, '02-trim', files); await page.mouse.up(); await page.waitForTimeout(300);
  // fade (C's top, hold then drag)
  y = await H.yOf(page, C.s) + 5; await page.mouse.move(X1, y); await page.mouse.down(); await page.waitForTimeout(320);
  for (let i = 1; i <= 14; i++) { await page.mouse.move(X1, y + 5 * i); await page.waitForTimeout(16); } await page.waitForTimeout(150);
  reached.fade = (await ph()) === 'fade'; await H.shot(page, dir, '03-fade', files); await page.mouse.up(); await page.waitForTimeout(300);
  // roll (the A|B seam, mid-drag)
  cs = await H.clips(page); const b1 = cs.find(c => c.id === B.id); y = await H.yOf(page, b1.s);
  await H.drag(page, X0, y, X0, y + 30, { up: false, steps: 5 }); reached.roll = (await ph()) === 'roll'; await H.shot(page, dir, '04-roll', files); await page.mouse.up(); await page.waitForTimeout(300);
  // crossfade (hold the seam, drag 40 px, let go: the bridge stays)
  cs = await H.clips(page); y = await H.yOf(page, cs.find(c => c.id === B.id).s); await page.mouse.move(X0, y); await page.mouse.down(); await page.waitForTimeout(320);
  for (let i = 1; i <= 10; i++) { await page.mouse.move(X0, y + 4 * i); await page.waitForTimeout(16); } await page.waitForTimeout(120); await page.mouse.up(); await page.waitForTimeout(500);
  cs = await H.clips(page); reached.crossfade = cs.find(c => c.id === A.id).xout > 0; await H.shot(page, dir, '05-crossfade-bridge', files);
  // twist mid-rotation, then reversed
  cs = await H.clips(page); const c1 = cs.find(c => c.id === C.id), cy = await H.yOf(page, c1.s + c1.d / 2), fr = H.twistFrames(X1, cy, 130, { n: 26 });
  await H.twoStart(lib, page, fr[0]); await page.waitForTimeout(30); for (const f of fr.slice(1, 20)) { await H.twoMove(lib, page, f); await page.waitForTimeout(16); }
  reached.twist = ((await page.evaluate(() => __CL.two())) || {}).mode === 'twist'; await H.shot(page, dir, '06-twist-mid', files);
  for (const f of fr.slice(20)) { await H.twoMove(lib, page, f); await page.waitForTimeout(16); } await H.twoEnd(lib, page); await page.waitForTimeout(1100);
  reached.reversed = (await H.clips(page)).find(c => c.id === C.id).rev; await H.shot(page, dir, '07-reversed', files);
  // panel, then the wheel on the original tempo
  await H.tap(page, X1, cy); await page.waitForTimeout(600); reached.panel = (await page.evaluate(() => __CL.panel())).open; await H.shot(page, dir, '08-clip-panel', files);
  const it = (await page.evaluate(() => __CL.panel())).items.find(o => o.what === 'tempo'); await H.tap(page, it.xr - 12, it.y); await page.waitForTimeout(500);
  const w = await page.evaluate(() => { const h = Wheel.active(); return h ? h.state() : null; }); reached.wheel = !!w;
  if (w) { const R = w.rowH * 5 / 2; await H.tap(page, w.cols[1].x, w.bandY + R * Math.sin(w.rowH / R), 40); await page.waitForTimeout(450); }
  await H.shot(page, dir, '09-wheel-tempo', files); if (w) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
  // buds
  await H.tap(page, X1, 560); await page.waitForTimeout(400);
  cs = await H.clips(page); const a2 = cs.find(c => c.id === A.id); await page.mouse.move(X0, await H.yOf(page, a2.s + 1.5)); await page.mouse.down(); await page.waitForTimeout(420);
  reached.buds = (await page.evaluate(() => __CL.buds().length)) === 4; await H.shot(page, dir, '10-buds', files); await page.mouse.up(); await page.waitForTimeout(300);
  // iPad (820 x 1180): the same scene, a clip selected
  const ipad = await br.newContext(lib.ENGINE === 'webkit' ? { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, hasTouch: true } : { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const pi = await ipad.newPage(); pi.errors = []; pi.on('pageerror', e => pi.errors.push('pageerror: ' + e.message)); pi.on('console', m => { if (m.type() === 'error') pi.errors.push(m.text()); });
  await pi.goto(`http://127.0.0.1:${+(process.env.AT_PORT || 8794)}/audio/clip-lab.html`, { waitUntil: 'load' }); await pi.waitForTimeout(400); await H.seed(pi, H.STD); await H.reload(pi);
  const iv = await H.view(pi), ic = (await H.clips(pi)).find(c => c.lane === 1); await H.tap(pi, iv.lanes[1], await H.yOf(pi, ic.s + ic.d / 2)); await pi.waitForTimeout(600);
  reached.ipad = (await pi.evaluate(() => __CL.panel())).open; await H.shot(pi, dir, '11-ipad-panel', files); page.errors.push(...H.errorsOf(pi)); await ipad.close();
  const errors = H.errorsOf(page); const checks = { allStates: Object.values(reached).every(Boolean), noErrors: errors.length === 0 };
  await lib.sheet(br, files, `${dir}/sheet.png`, 6, 190); await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), engine: lib.ENGINE, checks, reached, files, errors });
};
