/* Clip Lab — the seam between two touching clips (A above B in lane 0).
   1. ROLL (unwarped): drag the seam down 25 px at once -> A's end and B's start (and B's source offset) move by
      25/pps together; A's start and B's end stay; still touching
   2. ROLL (warped): warp A and B, drag the seam up 30 px -> A's length shrinks and B's grows by 30/pps with their
      source regions unchanged (A compresses, B stretches: their original tempos move)
   3. CROSSFADE: fresh layout; hold the seam 320 ms, drag down 36 px -> A runs on under B: overlap = 36/pps, B's start
      unchanged; the liquid bridge is drawn (screenshot); undo count +1
   4. hold the bridge near its lower end, drag up 12 px -> overlap 24/pps (that end follows the finger)
   5. CROSSFADE up: fresh layout; hold, drag up 30 px -> B starts 30/pps earlier, A's end unchanged; overlap 30/pps
   6. the seam of a crossfade still rolls: drag (no hold) moves both ends, the overlap length stays */
const H = require('./cliplab-base.js');
module.exports = async (lib) => {
  const sfx = H.SFX(); const dir = lib.outDir('cliplab-seams' + sfx); const br = await lib.browser(); const files = []; const checks = {}, info = {};
  const page = await H.openLab(lib, br); await H.seed(page, H.STD); await H.reload(page);
  const v = await H.view(page), pps = v.pps, X0 = v.lanes[0];
  const get = async () => { const cs = await H.clips(page); return { A: cs.find(c => c.take === 'take-a'), B: cs.find(c => c.take === 'take-b') }; };
  let { A, B } = await get();
  // 1. roll unwarped
  let y = await H.yOf(page, B.s);
  await H.drag(page, X0, y, X0, y + 25, { up: false }); const g1 = await page.evaluate(() => __CL.gesture()); await H.shot(page, dir, 'roll', files); await page.mouse.up(); await page.waitForTimeout(200);
  let r1 = await get(); info.roll = { before: { A, B }, after: r1, gesture: g1 };
  checks.roll = g1 && g1.phase === 'roll' && lib.near(r1.A.end - A.end, 25 / pps, 1e-6) && lib.near(r1.B.s - B.s, 25 / pps, 1e-6) && lib.near(r1.B.off - B.off, 25 / pps, 1e-6)
    && lib.near(r1.A.s, A.s, 1e-9) && lib.near(r1.B.end, B.end, 1e-6) && Math.abs(r1.B.s - r1.A.end) < 1e-9;
  // 2. warp both (tap to select, warp bud), roll up 30 px
  for (const c of [r1.A, r1.B]) { await H.tap(page, X0, await H.yOf(page, c.s + c.d / 2)); await page.waitForTimeout(450); const wb = (await page.evaluate(() => __CL.panel())).items.find(o => o.kind === 'warp'); await H.tap(page, wb.x, wb.y); await page.waitForTimeout(250); }
  await H.tap(page, v.lanes[1], 500); await page.waitForTimeout(300);   // tap empty (lane 1, below C): deselect
  const w0 = await get(); y = await H.yOf(page, w0.B.s);
  await H.drag(page, X0, y, X0, y - 30, { up: false }); await H.shot(page, dir, 'roll-warped', files); await page.mouse.up(); await page.waitForTimeout(200); await H.settle(page, 8000);
  const w1 = await get(); info.rollWarped = { before: w0, after: w1 };
  checks.rollWarped = w0.A.warp && w0.B.warp && lib.near(w1.A.d - w0.A.d, -30 / pps, 1e-6) && lib.near(w1.B.d - w0.B.d, 30 / pps, 1e-6) && lib.near(w1.B.s - w0.B.s, -30 / pps, 1e-6)
    && lib.near(w1.A.sl, w0.A.sl, 1e-9) && lib.near(w1.B.sl, w0.B.sl, 1e-9) && lib.near(w1.B.off, w0.B.off, 1e-9) && w1.A.ot < w0.A.ot && w1.B.ot > w0.B.ot && w1.A.ready && w1.B.ready;
  // 3. crossfade on a fresh layout
  await H.reload(page); ({ A, B } = await get()); const u0 = (await H.st(page)).undo;
  y = await H.yOf(page, B.s);
  await page.mouse.move(X0, y); await page.mouse.down(); await page.waitForTimeout(320); const armed = await page.evaluate(() => __CL.gesture());
  for (let i = 1; i <= 12; i++) { await page.mouse.move(X0, y + 3 * i); await page.waitForTimeout(16); }
  await page.waitForTimeout(120); await H.shot(page, dir, 'crossfade-drag', files); await page.mouse.up(); await page.waitForTimeout(450);
  let x1 = await get(); await H.shot(page, dir, 'crossfade-bridge', files);
  const u1 = (await H.st(page)).undo;
  info.crossfade = { armed, after: x1, overlap: x1.A.end - x1.B.s };
  checks.crossfadeOnHold = armed && armed.phase === 'armed' && lib.near(x1.A.end - x1.B.s, 36 / pps, 1e-6) && lib.near(x1.B.s, B.s, 1e-9) && lib.near(x1.A.s, A.s, 1e-9)
    && lib.near(x1.A.xout, 36 / pps, 1e-6) && lib.near(x1.B.xin, 36 / pps, 1e-6) && u1 === u0 + 1;
  // 4. grab the bridge's lower end, shorten by 12 px
  y = await H.yOf(page, x1.A.end) - 2;
  await page.mouse.move(X0, y); await page.mouse.down(); await page.waitForTimeout(320);
  for (let i = 1; i <= 6; i++) { await page.mouse.move(X0, y - 2 * i); await page.waitForTimeout(16); }
  await page.waitForTimeout(100); await page.mouse.up(); await page.waitForTimeout(250);
  const x2 = await get(); info.shorten = { after: x2, overlap: x2.A.end - x2.B.s };
  checks.crossfadeEndFollows = lib.near(x2.A.end - x2.B.s, 24 / pps, 1e-6) && lib.near(x2.B.s, B.s, 1e-9);
  // 6. roll the crossfaded seam (drag at once): both ends move, overlap kept
  y = await H.yOf(page, (x2.B.s + x2.A.end) / 2);
  await H.drag(page, X0, y, X0, y + 20); await page.waitForTimeout(200);
  const x3 = await get(); info.rollXfade = { after: x3 };
  checks.rollKeepsCrossfade = lib.near(x3.A.end - x2.A.end, 20 / pps, 1e-6) && lib.near(x3.B.s - x2.B.s, 20 / pps, 1e-6) && lib.near(x3.A.end - x3.B.s, 24 / pps, 1e-6);
  // 5. crossfade upward on a fresh layout
  await H.reload(page); ({ A, B } = await get()); y = await H.yOf(page, B.s);
  await page.mouse.move(X0, y); await page.mouse.down(); await page.waitForTimeout(320);
  for (let i = 1; i <= 10; i++) { await page.mouse.move(X0, y - 3 * i); await page.waitForTimeout(16); }
  await page.waitForTimeout(100); await page.mouse.up(); await page.waitForTimeout(250);
  const x4 = await get(); info.crossfadeUp = { after: x4, overlap: x4.A.end - x4.B.s };
  checks.crossfadeUp = lib.near(x4.A.end - x4.B.s, 30 / pps, 1e-6) && lib.near(x4.A.end, A.end, 1e-9) && lib.near(B.s - x4.B.s, 30 / pps, 1e-6) && lib.near(B.off - x4.B.off, 30 / pps, 1e-6);
  await H.shot(page, dir, 'crossfade-up', files);
  const errors = H.errorsOf(page); checks.noErrors = errors.length === 0;
  await lib.sheet(br, files, `${dir}/sheet.png`, 3, 200); await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), engine: lib.ENGINE, checks, info, errors });
};
