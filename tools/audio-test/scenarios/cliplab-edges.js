/* Clip Lab — edge bands.
   1. TRIM: drag A's top edge down 30 px at once -> start and source offset move by exactly 30/pps, end stays
   2. TRIM: drag C's bottom edge up 40 px -> end moves by -40/pps, start stays
   3. FADE: hold C's top edge 320 ms (armed: the press blob takes the lane colour), drag down 50 px -> fade-in of
      50/pps, NO trim (start, offset, length unchanged); the waveform tapers (screenshot)
   4. dragging the fade back to the edge (hold, drag up past it) removes it
   5. FADE OUT: hold C's bottom edge, drag up 40 px -> fade-out 40/pps
   6. STRETCH (warped): a 440 Hz take; select C, warp on; drag its bottom edge down by 1.2 s -> length x1.25, source
      region unchanged; after the WSOLA render the clip still sounds at 440 +-1 Hz (offline render of the play path);
      the same clip in repitch mode drops to 440/1.25 = 352 Hz (the measurement can tell) */
const H = require('./cliplab-base.js');
module.exports = async (lib) => {
  const sfx = H.SFX(); const dir = lib.outDir('cliplab-edges' + sfx); const br = await lib.browser(); const files = []; const checks = {}, info = {};
  const page = await H.openLab(lib, br); await H.seed(page, H.STD); await H.reload(page);
  let v = await H.view(page), cs = await H.clips(page); const pps = v.pps, X0 = v.lanes[0], X1 = v.lanes[1];
  const A = cs.find(c => c.take === 'take-a'), C = cs.find(c => c.take === 'take-c');
  // 1. trim A top
  let y = await H.yOf(page, A.s) + 5;
  await H.drag(page, X0, y, X0, y + 30, { up: false }); const g1 = await page.evaluate(() => __CL.gesture()); await H.shot(page, dir, 'trim', files); await page.mouse.up(); await page.waitForTimeout(200);
  let A1 = (await H.clips(page)).find(c => c.id === A.id);
  info.trimTop = { before: A, after: A1, gesture: g1 };
  checks.trimTop = g1 && g1.phase === 'trim' && lib.near(A1.s - A.s, 30 / pps, 1e-6) && lib.near(A1.off - A.off, 30 / pps, 1e-6) && lib.near(A1.end, A.end, 1e-6) && A1.fin === 0;
  // 2. trim C bottom
  y = await H.yOf(page, C.end) - 5;
  await H.drag(page, X1, y, X1, y - 40); await page.waitForTimeout(200);
  let C1 = (await H.clips(page)).find(c => c.id === C.id);
  info.trimBottom = { before: C, after: C1 };
  checks.trimBottom = lib.near(C1.end - C.end, -40 / pps, 1e-6) && lib.near(C1.s, C.s, 1e-9) && lib.near(C1.off, C.off, 1e-9) && C1.fout === 0;
  // 3. fade in on C's top: hold, then drag
  y = await H.yOf(page, C1.s) + 5;
  await page.mouse.move(X1, y); await page.mouse.down(); await page.waitForTimeout(320);
  const armed = await page.evaluate(() => ({ g: __CL.gesture(), s: __CL.state() })); await H.shot(page, dir, 'fade-armed', files);
  for (let i = 1; i <= 10; i++) { await page.mouse.move(X1, y + 5 * i); await page.waitForTimeout(16); }
  await page.waitForTimeout(150); await H.shot(page, dir, 'fade', files); await page.mouse.up(); await page.waitForTimeout(250);
  const C2 = (await H.clips(page)).find(c => c.id === C.id);
  info.fade = { armed, after: C2 };
  checks.holdArms = armed.g && armed.g.phase === 'armed' && armed.s.pressA > .5;
  checks.fadeOnHold = lib.near(C2.fin, 50 / pps, 1e-6) && lib.near(C2.s, C1.s, 1e-9) && lib.near(C2.off, C1.off, 1e-9) && lib.near(C2.sl, C1.sl, 1e-9);
  await H.shot(page, dir, 'fade-done', files);
  // 4. drag it back to the edge -> removed
  await page.mouse.move(X1, y); await page.mouse.down(); await page.waitForTimeout(320);
  for (let i = 1; i <= 10; i++) { await page.mouse.move(X1, y - 6 * i); await page.waitForTimeout(16); }
  await page.waitForTimeout(100); await page.mouse.up(); await page.waitForTimeout(200);
  const C3 = (await H.clips(page)).find(c => c.id === C.id);
  checks.fadeRemoved = C3.fin === 0 && lib.near(C3.s, C1.s, 1e-9);
  // 5. fade out on C's bottom
  y = await H.yOf(page, C3.end) - 5;
  await page.mouse.move(X1, y); await page.mouse.down(); await page.waitForTimeout(320);
  for (let i = 1; i <= 8; i++) { await page.mouse.move(X1, y - 5 * i); await page.waitForTimeout(16); }
  await page.waitForTimeout(100); await page.mouse.up(); await page.waitForTimeout(200);
  const C4 = (await H.clips(page)).find(c => c.id === C.id);
  info.fadeOut = C4; checks.fadeOutOnHold = lib.near(C4.fout, 40 / pps, 1e-6) && lib.near(C4.end, C3.end, 1e-9);
  const errors = H.errorsOf(page); await page.context().close();

  // 6. warped stretch keeps pitch: one 440 Hz take (A, B and C all cut from it)
  const p2 = await H.openLab(lib, br); await H.seed(p2, [{ name: 'a440', sec: 8, hz: 440, amp: .5 }]); await H.reload(p2); await H.analysis(p2);
  v = await H.view(p2); cs = await H.clips(p2); const W = cs.find(c => c.lane === 1), p2pps = v.pps;
  await H.tap(p2, X1, await H.yOf(p2, W.s + W.d / 2)); await p2.waitForTimeout(500);
  const pan = await p2.evaluate(() => __CL.panel()); const wb = pan.items.find(o => o.kind === 'warp');
  await H.tap(p2, wb.x, wb.y); await p2.waitForTimeout(300);
  const W1 = (await H.clips(p2)).find(c => c.id === W.id);
  const px = Math.round(.25 * W1.d * p2pps); y = await H.yOf(p2, W1.end) - 5;
  await H.drag(p2, X1, y, X1, y + px, { up: false }); const g6 = await p2.evaluate(() => __CL.gesture()); await H.shot(p2, dir, 'stretch', files); await p2.mouse.up();
  await p2.waitForTimeout(200); await H.settle(p2, 8000);
  const W2 = (await H.clips(p2)).find(c => c.id === W.id), ratio = W2.d / W2.sl;
  const pitch = await p2.evaluate(async ([id, s, d]) => { const x = await __CL.render([id], 48000); return __AN.peak(x, 48000, s + d / 2 - .5, s + d / 2 + .5, 400, 470); }, [W.id, W2.s, W2.d]);
  const tail = await p2.evaluate(async ([id, s, d]) => { const x = await __CL.render([id], 48000); return { mid: __AN.amp(x, 48000, s + d / 2, 440), nearEnd: __AN.amp(x, 48000, s + d - .1, 440), after: __AN.amp(x, 48000, s + d + .05, 440, .02) }; }, [W.id, W2.s, W2.d]);
  // repitch: same clip, mode repitch (panel mode bud 2)
  await H.tap(p2, X1, await H.yOf(p2, W2.s + W2.d / 2)); await p2.waitForTimeout(400);
  const mb = (await p2.evaluate(() => __CL.panel())).items.find(o => o.kind === 'mode' && o.i === 2); await H.tap(p2, mb.x, mb.y); await p2.waitForTimeout(300); await H.settle(p2);
  const W3 = (await H.clips(p2)).find(c => c.id === W.id);
  const pitchR = await p2.evaluate(async ([id, s, d]) => { const x = await __CL.render([id], 48000); return __AN.peak(x, 48000, s + d / 2 - .5, s + d / 2 + .5, 320, 470); }, [W.id, W3.s, W3.d]);
  info.stretch = { before: W1, after: W2, gesture: g6, ratio, pitch, tail, repitch: { clip: W3, pitch: pitchR } };
  checks.stretchChangesLength = g6 && g6.phase === 'stretch' && W1.warp && lib.near(W2.d - W1.d, px / p2pps, 1e-6) && lib.near(W2.sl, W1.sl, 1e-9) && lib.near(W2.off, W1.off, 1e-9) && lib.near(ratio, 1.25, .01);
  checks.stretchKeepsPitch = W2.ready && W2.mat === 'beats' && lib.near(pitch.f, 440, 1) && tail.nearEnd > .15 && tail.after < .02;
  checks.repitchFollowsSpeed = W3.mode === 'repitch' && lib.near(pitchR.f, 440 / ratio, 1.5);
  const errors2 = H.errorsOf(p2); checks.noErrors = errors.length + errors2.length === 0;
  await lib.sheet(br, files, `${dir}/sheet.png`, 3, 200); await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), engine: lib.ENGINE, checks, info, errors: errors.concat(errors2) });
};
