/* Editor — the EDGE band: trim (unwarped), free with snap off, snapping with snap on.
   Snap OFF (session snap 0):
   1. drag A's top edge down 25 px at once -> start and source offset move by exactly 25/pps, the end stays, no fade;
      the edge under the finger is highlighted (screenshot)
   2. drag C's bottom edge up 40 px -> end moves by -40/pps exactly, start and offset stay
   3. A's top edge cannot go above the end of nothing / below its own body: dragging A's top edge up 400 px stops at the
      take's start (offset 0)
   Snap ON (session snap 1; C 4.1 s long so its end, 5.9 s, is off the half-beat grid):
   4. drag A's top edge down 21 px -> the raw edge (1.55 s) lands on the half-beat grid (1.5 s); the green snap line is
      shown while dragging (state.sy at the edge's y)
   5. drag B's bottom edge (7.2 s) up 79 px -> raw 5.883 s snaps to the neighbouring clip edge C.end = 5.9 s (closer
      than the grid's 6.0)
   6. a two-finger tap undoes the last trim */
const E = require('./edit-gesture-base.js'), H = E.H;
module.exports = async (lib) => {
  const sfx = H.SFX(); const dir = lib.outDir('edit-gesture-trim' + sfx); const br = await lib.browser(); const files = []; const checks = {}, info = {};
  const page = await E.std(lib, br, { snap: 0 });
  const v = await E.view(page), pps = v.pps, X0 = v.lanes[0], X1 = v.lanes[1];
  let { A, C } = await E.abc(page);
  // 1. trim A's top, snap off
  let y = await E.yOf(page, A.s) + 5;
  await H.drag(page, X0, y, X0, y + 25, { up: false }); const g1 = await page.evaluate(() => __E.gesture()); await H.shot(page, dir, '1-trim-top', files); await page.mouse.up(); await page.waitForTimeout(250);
  const A1 = await E.byId(page, A.id); info.trimTop = { before: A, after: A1, gesture: g1 };
  checks.trimTop = g1 && g1.phase === 'trim' && g1.snapped === null && lib.near(A1.s - A.s, 25 / pps, 1e-6) && lib.near(A1.off - A.off, 25 / pps, 1e-6) && lib.near(A1.end, A.end, 1e-9) && A1.fin === 0;
  // 2. trim C's bottom
  y = await E.yOf(page, C.end) - 5;
  await H.drag(page, X1, y, X1, y - 40); await page.waitForTimeout(250);
  const C1 = await E.byId(page, C.id); info.trimBottom = { before: C, after: C1 };
  checks.trimBottomFree = lib.near(C1.end - C.end, -40 / pps, 1e-6) && lib.near(C1.s, C.s, 1e-12) && lib.near(C1.off, C.off, 1e-12) && C1.fout === 0;
  // 3. A's top up past the take's start
  y = await E.yOf(page, A1.s) + 4;
  await H.drag(page, X0, y, X0, y - 400, { steps: 20 }); await page.waitForTimeout(250);
  const A2 = await E.byId(page, A.id); info.trimLimit = A2;
  checks.trimStopsAtTakeStart = lib.near(A2.off, 0, 1e-9) && lib.near(A2.s, A1.s - A1.off, 1e-6) && lib.near(A2.end, A.end, 1e-9);
  const errors = H.errorsOf(page); await page.context().close();

  // 4-6. snap on
  const p2 = await E.std(lib, br, { snap: 1, cd: 4.1 }); page.ids = p2.ids;
  ({ A, C } = await E.abc(p2)); const B = (await E.abc(p2)).B;
  y = await E.yOf(p2, A.s) + 5;
  await H.drag(p2, X0, y, X0, y + 21, { up: false }); await p2.waitForTimeout(120);
  const g4 = await p2.evaluate(() => ({ g: __E.gesture(), st: __E.state() })); await H.shot(p2, dir, '4-trim-snapped', files); await p2.mouse.up(); await p2.waitForTimeout(250);
  const A4 = await E.byId(p2, A.id), yEdge = await E.yOf(p2, 1.5);
  info.snapGrid = { raw: A.s + 21 / pps, after: A4, gesture: g4.g, sy: g4.st.sy, yEdge };
  checks.trimSnapsToHalfBeat = lib.near(A4.s, 1.5, 1e-9) && lib.near(A4.off - A.off, 1.5 - A.s, 1e-9) && lib.near(A4.end, A.end, 1e-9);
  checks.snapLineShown = g4.g && g4.g.snapped !== null && lib.near(g4.g.snapped, 1.5, 1e-9) && lib.near(g4.st.sy, yEdge, .5);
  y = await E.yOf(p2, B.end) - 4;
  await H.drag(p2, X0, y, X0, y - 79, { steps: 16 }); await p2.waitForTimeout(250);
  const B5 = await E.byId(p2, B.id); info.snapEdge = { raw: B.end - 79 / pps, after: B5, Cend: C.end };
  checks.trimSnapsToClipEdge = lib.near(C.end, 5.9, 1e-9) && lib.near(B5.end, 5.9, 1e-9) && lib.near(B5.s, B.s, 1e-12);
  // 6. undo
  const u0 = await E.st(p2); await E.twoTap(lib, p2); const B6 = await E.byId(p2, B.id), u1 = await E.st(p2);
  info.undo = { before: u0.undos, after: u1.undos, B6 };
  checks.twoFingerTapUndoesTrim = u1.undos === u0.undos + 1 && lib.near(B6.end, B.end, 1e-9);
  await H.shot(p2, dir, '6-undone', files);
  const errors2 = H.errorsOf(p2); checks.noErrors = errors.length + errors2.length === 0;
  await lib.sheet(br, files, `${dir}/sheet.png`, 3, 200); await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), engine: lib.ENGINE, checks, info, errors: errors.concat(errors2) });
};
