/* Editor — HOLD on an edge = fade (snap on: fades do not snap).
   1. hold C's top edge 320 ms -> armed (the press blob grown, taking the lane colour), drag down 50 px -> fade-in of
      50/pps, NO trim (start, offset, length unchanged); the waveform tapers and a dot marks the fade's end (screenshot)
   2. hold the same edge again and drag back up past it -> the fade is removed
   3. hold C's bottom edge, drag up 40 px -> fade-out 40/pps, end unchanged
   4. undo count: each fade is one undo step */
const E = require('./edit-gesture-base.js'), H = E.H;
module.exports = async (lib) => {
  const sfx = H.SFX(); const dir = lib.outDir('edit-gesture-fade' + sfx); const br = await lib.browser(); const files = []; const checks = {}, info = {};
  const page = await E.std(lib, br, { snap: 1 });
  const v = await E.view(page), pps = v.pps, X1 = v.lanes[1];
  const { C } = await E.abc(page); const u0 = (await E.st(page)).undo;
  let y = await E.yOf(page, C.s) + 5;
  await page.mouse.move(X1, y); await page.mouse.down(); await page.waitForTimeout(320);
  const armed = await page.evaluate(() => ({ g: __E.gesture(), s: __E.state() })); await H.shot(page, dir, '1-armed', files);
  for (let i = 1; i <= 10; i++) { await page.mouse.move(X1, y + 5 * i); await page.waitForTimeout(16); }
  await page.waitForTimeout(150); const mid = await page.evaluate(() => __E.gesture()); await H.shot(page, dir, '1-fading', files); await page.mouse.up(); await page.waitForTimeout(300);
  const C1 = await E.byId(page, C.id); await H.shot(page, dir, '1-fade-in', files);
  info.fadeIn = { armed, mid, after: C1 };
  checks.holdArms = armed.g && armed.g.phase === 'armed' && armed.s.pressA > .5 && armed.s.armA > .5;
  checks.fadeOnHold = mid && mid.phase === 'fade' && lib.near(C1.fin, 50 / pps, 1e-6) && lib.near(C1.s, C.s, 1e-12) && lib.near(C1.off, C.off, 1e-12) && lib.near(C1.sl, C.sl, 1e-12);
  // 2. back to the edge removes it
  await page.mouse.move(X1, y); await page.mouse.down(); await page.waitForTimeout(320);
  for (let i = 1; i <= 10; i++) { await page.mouse.move(X1, y - 6 * i); await page.waitForTimeout(16); }
  await page.waitForTimeout(100); await page.mouse.up(); await page.waitForTimeout(250);
  const C2 = await E.byId(page, C.id); info.removed = C2;
  checks.fadeRemoved = C2.fin === 0 && lib.near(C2.s, C.s, 1e-12) && lib.near(C2.sl, C.sl, 1e-12);
  // 3. fade out
  y = await E.yOf(page, C2.end) - 5;
  await page.mouse.move(X1, y); await page.mouse.down(); await page.waitForTimeout(320);
  for (let i = 1; i <= 8; i++) { await page.mouse.move(X1, y - 5 * i); await page.waitForTimeout(16); }
  await page.waitForTimeout(100); await page.mouse.up(); await page.waitForTimeout(300);
  const C3 = await E.byId(page, C.id); await H.shot(page, dir, '3-fade-out', files);
  info.fadeOut = C3; checks.fadeOutOnHold = lib.near(C3.fout, 40 / pps, 1e-6) && lib.near(C3.end, C.end, 1e-12);
  const u1 = (await E.st(page)).undo; info.undo = { u0, u1 };
  checks.oneUndoStepEach = u1 === u0 + 3;
  const errors = H.errorsOf(page); checks.noErrors = errors.length === 0;
  await lib.sheet(br, files, `${dir}/sheet.png`, 4, 180); await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), engine: lib.ENGINE, checks, info, errors });
};
