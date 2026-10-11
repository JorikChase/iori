/* Editor — the SEAM between touching clips A | B (track 0), snap off for exact distances.
   1. ROLL (unwarped): drag the seam down 25 px at once -> A's end and B's start (and B's offset) move by 25/pps
      together; A's start and B's end stay; still touching
   2. ROLL (warped): warp A and B (panel), drag the seam up 30 px -> A's length shrinks and B's grows by 30/pps with
      their source regions unchanged (their original tempos move)
   3. CROSSFADE: fresh layout; hold the seam 320 ms, drag down 36 px -> A runs on under B: overlap = 36/pps, B's start
      unchanged; the liquid bridge is drawn (state.nb = 1, screenshot); one undo step
   4. hold the bridge near its lower end, drag up 12 px -> overlap 24/pps (that end follows the finger)
   5. the seam of a crossfade still rolls: drag (no hold) moves both ends, the overlap stays
   6. CROSSFADE up: fresh layout; hold, drag up 30 px -> B starts 30/pps earlier, A's end unchanged
   7. no silent crossfade: C moved into track 0 onto A takes the nearest gap — it overlaps nothing; the crossfade made
      by the gesture survives a move of an unrelated clip and a session reload */
const E = require('./edit-gesture-base.js'), H = E.H;
module.exports = async (lib) => {
  const sfx = H.SFX(); const dir = lib.outDir('edit-gesture-seams' + sfx); const br = await lib.browser(); const files = []; const checks = {}, info = {};
  const page = await E.std(lib, br, { snap: 0 });
  const v = await E.view(page), pps = v.pps, X0 = v.lanes[0], X1 = v.lanes[1];
  const get = async () => { const r = await E.abc(page); return { A: r.A, B: r.B, C: r.C }; };
  let { A, B } = await get();
  // 1. roll
  let y = await E.yOf(page, B.s);
  await H.drag(page, X0, y, X0, y + 25, { up: false }); const g1 = await page.evaluate(() => __E.gesture()); await H.shot(page, dir, '1-roll', files); await page.mouse.up(); await page.waitForTimeout(250);
  const r1 = await get(); info.roll = { before: { A, B }, after: r1, gesture: g1 };
  checks.roll = g1 && g1.phase === 'roll' && lib.near(r1.A.end - A.end, 25 / pps, 1e-6) && lib.near(r1.B.s - B.s, 25 / pps, 1e-6) && lib.near(r1.B.off - B.off, 25 / pps, 1e-6)
    && lib.near(r1.A.s, A.s, 1e-12) && lib.near(r1.B.end, B.end, 1e-6) && Math.abs(r1.B.s - r1.A.end) < 1e-9;
  // 2. warp both, roll up 30 px
  for (const c of [r1.A, r1.B]) { await E.select(page, X0, await E.yOf(page, c.s + c.d / 2)); const wb = await E.item(page, o => o.kind === 'warp'); await H.tap(page, wb.x, wb.y); await page.waitForTimeout(250); }
  await E.deselect(page, X1, 520);
  const w0 = await get(); y = await E.yOf(page, w0.B.s);
  await H.drag(page, X0, y, X0, y - 30, { up: false }); await H.shot(page, dir, '2-roll-warped', files); await page.mouse.up(); await page.waitForTimeout(250); await E.settle(page);
  const w1 = await get(); info.rollWarped = { before: w0, after: w1 };
  checks.rollWarped = w0.A.warp && w0.B.warp && lib.near(w1.A.d - w0.A.d, -30 / pps, 1e-6) && lib.near(w1.B.d - w0.B.d, 30 / pps, 1e-6) && lib.near(w1.B.s - w0.B.s, -30 / pps, 1e-6)
    && lib.near(w1.A.sl, w0.A.sl, 1e-9) && lib.near(w1.B.sl, w0.B.sl, 1e-9) && lib.near(w1.B.off, w0.B.off, 1e-9) && w1.A.ot < w0.A.ot && w1.B.ot > w0.B.ot && w1.A.ready && w1.B.ready;
  // 3. crossfade on a fresh layout
  await E.session(page, E.stdClips(page.ids), { snap: 0 }); ({ A, B } = await get()); const u0 = (await E.st(page)).undo;
  y = await E.yOf(page, B.s);
  await page.mouse.move(X0, y); await page.mouse.down(); await page.waitForTimeout(320); const armed = await page.evaluate(() => __E.gesture());
  for (let i = 1; i <= 12; i++) { await page.mouse.move(X0, y + 3 * i); await page.waitForTimeout(16); }
  await page.waitForTimeout(120); await H.shot(page, dir, '3-crossfade-drag', files); await page.mouse.up(); await page.waitForTimeout(500);
  const x1 = await get(), s3 = await E.st(page); await H.shot(page, dir, '3-crossfade-bridge', files);
  info.crossfade = { armed, after: x1, overlap: x1.A.end - x1.B.s, state: s3 };
  checks.crossfadeOnHold = armed && armed.phase === 'armed' && lib.near(x1.A.end - x1.B.s, 36 / pps, 1e-6) && lib.near(x1.B.s, B.s, 1e-12) && lib.near(x1.A.s, A.s, 1e-12)
    && lib.near(x1.A.xout, 36 / pps, 1e-6) && lib.near(x1.B.xin, 36 / pps, 1e-6) && s3.undo === u0 + 1;
  checks.bridgeDrawn = s3.nb === 1;
  // 4. the bridge's lower end follows
  y = await E.yOf(page, x1.A.end) - 2;
  await page.mouse.move(X0, y); await page.mouse.down(); await page.waitForTimeout(320);
  for (let i = 1; i <= 6; i++) { await page.mouse.move(X0, y - 2 * i); await page.waitForTimeout(16); }
  await page.waitForTimeout(100); await page.mouse.up(); await page.waitForTimeout(250);
  const x2 = await get(); info.shorten = { after: x2, overlap: x2.A.end - x2.B.s };
  checks.crossfadeEndFollows = lib.near(x2.A.end - x2.B.s, 24 / pps, 1e-6) && lib.near(x2.B.s, B.s, 1e-12);
  // 5. roll the crossfaded seam
  y = await E.yOf(page, (x2.B.s + x2.A.end) / 2);
  await H.drag(page, X0, y, X0, y + 20); await page.waitForTimeout(250);
  const x3 = await get(); info.rollXfade = x3;
  checks.rollKeepsCrossfade = lib.near(x3.A.end - x2.A.end, 20 / pps, 1e-6) && lib.near(x3.B.s - x2.B.s, 20 / pps, 1e-6) && lib.near(x3.A.end - x3.B.s, 24 / pps, 1e-6);
  // 7. a move does not create a crossfade; the gesture's crossfade survives other moves and a reload
  let C = x3.C; const cy = await E.yOf(page, C.s + C.d / 2);
  await E.holdBud(page, X1, cy, 2, async (x, yy) => { const tx = X0, ty = await E.yOf(page, x3.A.s + .5); for (let i = 1; i <= 14; i++) { await page.mouse.move(x + (tx - x) * i / 14, yy + (ty - yy) * i / 14); await page.waitForTimeout(30); } await page.waitForTimeout(250); });
  const m7 = await E.clips(page); const C7 = m7.find(c => c.id === C.id), lane0 = m7.filter(c => c.t === C7.t).sort((a, b) => a.s - b.s);
  const overl = []; for (let i = 0; i + 1 < lane0.length; i++) { const ov = lane0[i].end - lane0[i + 1].s; if (ov > 1e-6) overl.push([lane0[i].id, lane0[i + 1].id, ov]); }
  info.move = { C7, lane: lane0.map(c => [c.id, c.s, c.end]), overlaps: overl };
  checks.moveMakesNoCrossfade = C7.xin < 1e-9 && C7.xout < 1e-9 && overl.every(o => o[0] === x3.A.id && o[1] === x3.B.id);
  await page.waitForTimeout(500); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300); await E.settle(page);
  const x8 = await get(); info.reloaded = x8;
  checks.crossfadePersists = lib.near(x8.A.end - x8.B.s, 24 / pps, 1e-6) && lib.near(x8.A.xout, 24 / pps, 1e-6);
  await H.shot(page, dir, '7-after-move-reload', files);
  // 6. crossfade up on a fresh layout
  await E.session(page, E.stdClips(page.ids), { snap: 0 }); ({ A, B } = await get()); y = await E.yOf(page, B.s);
  await page.mouse.move(X0, y); await page.mouse.down(); await page.waitForTimeout(320);
  for (let i = 1; i <= 10; i++) { await page.mouse.move(X0, y - 3 * i); await page.waitForTimeout(16); }
  await page.waitForTimeout(100); await page.mouse.up(); await page.waitForTimeout(250);
  const x4 = await get(); info.crossfadeUp = { after: x4, overlap: x4.A.end - x4.B.s };
  checks.crossfadeUp = lib.near(x4.A.end - x4.B.s, 30 / pps, 1e-6) && lib.near(x4.A.end, A.end, 1e-12) && lib.near(B.s - x4.B.s, 30 / pps, 1e-6) && lib.near(B.off - x4.B.off, 30 / pps, 1e-6);
  await H.shot(page, dir, '6-crossfade-up', files);
  const errors = H.errorsOf(page); checks.noErrors = errors.length === 0;
  await lib.sheet(br, files, `${dir}/sheet.png`, 4, 180); await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), engine: lib.ENGINE, checks, info, errors });
};
