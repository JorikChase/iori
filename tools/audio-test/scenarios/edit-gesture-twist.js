/* Editor — two fingers. Chromium: real touch through CDP; WebKit: synthetic touch PointerEvents on the editor box.
   No double-tap mode in the editor: REVERSE is the twist.
   1. twist C by 60° and let go -> it rotated with the fingers (mode 'twist', angle ~60° mid-gesture), springs back to
      0, not reversed
   2. twist C by 130° -> mid-rotation turned ~100° (screenshot); released, it flips (spring) to a half turn and becomes
      reversed (rev, angle 0, flips +1); a fade-in made before travels with the content (it becomes the fade-out)
   3. pinch (distance x1.6, no rotation) on the clip -> zoom by the distance ratio since recognition, nothing reversed
   4. two-finger tap -> undo: the reverse is taken back (fades back where they were)
   5. a quick double tap on a clip does NOT reverse it (it only selects) */
const E = require('./edit-gesture-base.js'), H = E.H;
module.exports = async (lib) => {
  const sfx = H.SFX(); const dir = lib.outDir('edit-gesture-twist' + sfx); const br = await lib.browser(); const files = []; const checks = {}, info = {};
  const page = await E.std(lib, br, { snap: 0 });
  const v = await E.view(page), X1 = v.lanes[1]; let { C } = await E.abc(page);
  // a fade-in on C first (hold the top edge, drag 30 px)
  await E.holdDrag(page, X1, await E.yOf(page, C.s) + 5, 30); C = await E.byId(page, C.id);
  const cx = X1, cy = await E.yOf(page, C.s + C.d / 2), clip = () => E.byId(page, C.id);
  const step = async (frames, ms = 16) => { for (const f of frames) { await H.twoMove(lib, page, f); await page.waitForTimeout(ms); } };
  // 1. 60°
  let fr = H.twistFrames(cx, cy, 60, { n: 12 });
  await H.twoStart(lib, page, fr[0]); await page.waitForTimeout(30); await step(fr.slice(1)); await page.waitForTimeout(150);
  const mid1 = await page.evaluate((id) => ({ two: __E.two(), ang: __E.clips().find(c => c.id === id).ang }), C.id);
  await H.twoEnd(lib, page); await page.waitForTimeout(900); const c1 = await clip();
  info.twist60 = { mid: mid1, after: c1 };
  checks.twistFollows = mid1.two && mid1.two.mode === 'twist' && lib.near(mid1.ang * 180 / Math.PI, 60, 4);
  checks.under90SpringsBack = !c1.rev && Math.abs(c1.ang) < 1e-6 && c1.flip === 0;
  // 2. 130°
  fr = H.twistFrames(cx, cy, 130, { n: 26 });
  await H.twoStart(lib, page, fr[0]); await page.waitForTimeout(30); await step(fr.slice(1, 21)); await page.waitForTimeout(150);
  const mid2 = await page.evaluate((id) => __E.clips().find(c => c.id === id).ang, C.id); await H.shot(page, dir, '2-twist-mid', files);
  await step(fr.slice(21)); await H.twoEnd(lib, page); await page.waitForTimeout(160); await H.shot(page, dir, '2-flipping', files);
  await page.waitForTimeout(900); const c2 = await clip(); const s2 = await E.st(page); await H.shot(page, dir, '2-reversed', files);
  info.twist130 = { midDeg: mid2 * 180 / Math.PI, after: c2, state: s2 };
  checks.twistMidRotation = lib.near(mid2 * 180 / Math.PI, 100, 4);
  checks.over90Reverses = c2.rev && Math.abs(c2.ang) < 1e-6 && c2.flip === 0 && s2.flips === 1;
  checks.fadeTravelsWithContent = c2.fin === 0 && lib.near(c2.fout, C.fin, 1e-12) && C.fin > .3;
  // 3. pinch on the clip
  const pps0 = (await E.view(page)).pps;
  const pin = []; for (let k = 0; k <= 12; k++) { const r = 50 * (1 + .6 * k / 12); pin.push([{ x: cx, y: cy - r }, { x: cx, y: cy + r }]); }
  await H.twoStart(lib, page, pin[0]); await page.waitForTimeout(30); await step(pin.slice(1)); const pm = await page.evaluate(() => __E.two()); await H.twoEnd(lib, page); await page.waitForTimeout(400);
  const pps1 = (await E.view(page)).pps, c3 = await clip(); info.pinch = { pps0, pps1, mode: pm };
  checks.pinchZooms = pm && pm.mode === 'pinch' && lib.near(pps1 / pps0, 160 / pm.d0, .02) && pps1 / pps0 > 1.35 && c3.rev === c2.rev;
  await H.shot(page, dir, '3-zoomed', files);
  // 4. two-finger tap -> undo the reverse
  const u0 = await E.st(page);
  await E.twoTap(lib, page);
  const c4 = await clip(), u1 = await E.st(page); info.undo = { before: u0.undos, after: u1.undos, clip: c4 };
  checks.twoFingerTapUndoes = u1.undos === u0.undos + 1 && !c4.rev && lib.near(c4.fin, C.fin, 1e-12) && c4.fout === 0;
  // 5. double tap: select only
  const cy5 = await E.yOf(page, c4.s + c4.d / 2);
  await H.tap(page, cx, cy5, 40); await page.waitForTimeout(110); await H.tap(page, cx, cy5, 40); await page.waitForTimeout(1000);
  const c5 = await clip(), sel5 = await page.evaluate(() => __E.sel()); info.doubleTap = { clip: c5, sel: sel5 };
  checks.doubleTapDoesNotReverse = !c5.rev && Math.abs(c5.ang) < 1e-6 && sel5 === C.id;
  const errors = H.errorsOf(page); checks.noErrors = errors.length === 0;
  await lib.sheet(br, files, `${dir}/sheet.png`, 4, 180); await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), engine: lib.ENGINE, checks, info, errors });
};
