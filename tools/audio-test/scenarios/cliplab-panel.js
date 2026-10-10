/* Clip Lab — selection, the clip panel at the corner dot, the digit wheel, and the body buds.
   1. tap C -> selected, the corner dot takes the lane colour and the panel opens (screenshot); tap empty timeline ->
      deselected, the panel closes, the corner is back to its plain ring
   2. panel buds: warp on, warp mode tones, fade curve exponential
   3. slide gesture on the transpose readout: up 70 px straight -> +5; then up 42 px with the finger 60 px to the
      side (finer gear, 1/3) -> +6; gain: down 30 px -> -3.0 dB
   3b. slide on the original tempo readout: up 40 px -> 110.0, the warped clip's length follows
   4. tap the original tempo readout -> the digit wheel opens on the clip's tempo; row taps to 128.0 (screenshot),
      tap the band -> the clip's original tempo is exactly 128.0; warped, its length = source x 128 / shared tempo
   5. body buds: hold A -> four buds; release on CUT -> two touching clips split exactly at the held time; hold B,
      COPY -> a copy after it; hold the copy, DELETE -> gone; hold C, MOVE along the bud then down 40 px -> moved */
const H = require('./cliplab-base.js');
module.exports = async (lib) => {
  const sfx = H.SFX(); const dir = lib.outDir('cliplab-panel' + sfx); const br = await lib.browser(); const files = []; const checks = {}, info = {};
  const page = await H.openLab(lib, br); await H.seed(page, H.STD); await H.reload(page);
  const v = await H.view(page), X0 = v.lanes[0], X1 = v.lanes[1];
  let cs = await H.clips(page); const A = cs.find(c => c.take === 'take-a'), B = cs.find(c => c.take === 'take-b'), C = cs.find(c => c.take === 'take-c');
  const clip = async (id) => (await H.clips(page)).find(c => c.id === id);
  const item = async (pred) => (await page.evaluate(() => __CL.panel())).items.find(pred);
  // 1. select / deselect
  await H.tap(page, X1, await H.yOf(page, C.s + C.d / 2)); await page.waitForTimeout(900);
  const p1 = await page.evaluate(() => ({ sel: __CL.sel(), panel: __CL.panel() })); await H.shot(page, dir, 'panel-open', files);
  await H.tap(page, X1, 520); await page.waitForTimeout(900);
  const p2 = await page.evaluate(() => ({ sel: __CL.sel(), panel: __CL.panel() })); await H.shot(page, dir, 'panel-closed', files);
  info.select = { p1: { sel: p1.sel, open: p1.panel.open, k: p1.panel.k }, p2: { sel: p2.sel, open: p2.panel.open, k: p2.panel.k } };
  checks.tapSelectsAndShowsPanel = p1.sel === C.id && p1.panel.open && p1.panel.k > .95;
  checks.tapEmptyHidesPanel = p2.sel === null && !p2.panel.open && p2.panel.k < .05;
  // 2. warp, mode, curve
  await H.tap(page, X1, await H.yOf(page, C.s + C.d / 2)); await page.waitForTimeout(500);
  let it = await item(o => o.kind === 'warp'); await H.tap(page, it.x, it.y); await page.waitForTimeout(150);
  it = await item(o => o.kind === 'mode' && o.i === 1); await H.tap(page, it.x, it.y); await page.waitForTimeout(150);
  it = await item(o => o.kind === 'curve' && o.i === 2); await H.tap(page, it.x, it.y); await page.waitForTimeout(250);
  const c2 = await clip(C.id); info.buds = c2;
  checks.panelBuds = c2.warp && c2.mode === 'tones' && c2.curve === 2;
  // 3. slide: transpose, then gain
  it = await item(o => o.what === 'semi'); const sx = it.xr - 8, syy = it.y;
  await H.drag(page, sx, syy, sx, syy - 70, { steps: 14, stepMs: 20 }); await page.waitForTimeout(150); const s1 = (await clip(C.id)).semi;
  await page.mouse.move(sx, syy); await page.mouse.down(); for (let i = 1; i <= 6; i++) { await page.mouse.move(sx - 10 * i, syy - 2); await page.waitForTimeout(16); }
  for (let i = 1; i <= 14; i++) { await page.mouse.move(sx - 60, syy - 2 - 3 * i); await page.waitForTimeout(16); } await page.waitForTimeout(80); await page.mouse.up(); await page.waitForTimeout(150);
  const s2 = (await clip(C.id)).semi;
  it = await item(o => o.what === 'gain'); await H.drag(page, it.xr - 8, it.y, it.xr - 8, it.y + 30, { steps: 10, stepMs: 20 }); await page.waitForTimeout(200);
  const g3 = (await clip(C.id)).gain; info.slide = { s1, s2, g3 };
  checks.slideTranspose = s1 === 5 && s2 === 6;
  checks.slideGain = lib.near(g3, -3, 1e-9);
  // 3b. slide on the original tempo: up 40 px -> +10.0 BPM (0.25 BPM per px); warped, the clip's length follows
  it = await item(o => o.what === 'tempo'); await H.drag(page, it.xr - 12, it.y, it.xr - 12, it.y - 40, { steps: 10, stepMs: 20 }); await page.waitForTimeout(200);
  const ct = await clip(C.id); info.slideTempo = ct;
  checks.slideTempo = ct.ot === 110 && lib.near(ct.d, ct.sl * 110 / (await H.view(page)).tempo, 1e-9);
  // 4. the wheel on the original tempo
  it = await item(o => o.what === 'tempo'); await H.tap(page, it.xr - 12, it.y); await page.waitForTimeout(450);
  const w0 = await page.evaluate(() => { const w = Wheel.active(); return w ? w.state() : null; });
  const target = [1, 2, 8, 0];
  if (w0) { const R = w0.rowH * 5 / 2, Aw = w0.rowH / R;
    for (let ci = 0; ci < 4; ci++) { for (let guard = 0; guard < 8; guard++) { const s = await page.evaluate(() => Wheel.active().state()), col = s.cols[ci]; let dlt = target[ci] - col.idx;
        if (col.loop) { if (dlt > 5) dlt -= 10; if (dlt < -5) dlt += 10; } if (!dlt) break; const k = Math.max(-2, Math.min(2, dlt));
        await H.tap(page, col.x, s.bandY + R * Math.sin(k * Aw), 40); await page.waitForTimeout(420); } } }
  const w1 = await page.evaluate(() => { const w = Wheel.active(); return w ? w.state().cols.map(c => c.idx) : null; }); await H.shot(page, dir, 'wheel-tempo', files);
  if (w0) await H.tap(page, w0.cols[1].x, w0.bandY, 40); await page.waitForTimeout(700);
  const c4 = await clip(C.id), tempo = (await H.view(page)).tempo; info.wheel = { opened: !!w0, idx: w1, clip: c4 };
  checks.wheelOpens = !!w0 && w0.cols.length === 4;
  checks.wheelSetsTempoExactly = c4.ot === 128 && c4.ots === 'set' && lib.near(c4.d, c4.sl * 128 / tempo, 1e-9) && !(await page.evaluate(() => !!Wheel.active()));
  await H.shot(page, dir, 'panel-after', files);
  await H.tap(page, X1, 560); await page.waitForTimeout(400);   // deselect (empty, lane 1)
  // 5. buds
  const holdBud = async (x, y, bi, extra) => { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(360);
    const buds = await page.evaluate(() => __CL.buds()); const b = buds[bi], ux = b[0] - x, uy = b[1] - y, ul = Math.hypot(ux, uy);
    for (let i = 1; i <= 8; i++) { await page.mouse.move(x + ux / ul * 10 * i, y + uy / ul * 10 * i); await page.waitForTimeout(20); }
    if (extra) await extra(x + ux / ul * 80, y + uy / ul * 80);
    await page.waitForTimeout(80); await page.mouse.up(); await page.waitForTimeout(500); return buds; };
  const tCut = A.s + 2.0, yCut = await H.yOf(page, tCut);
  await page.mouse.move(X0, yCut); await page.mouse.down(); await page.waitForTimeout(360); const opened = await page.evaluate(() => ({ s: __CL.state(), buds: __CL.buds().length }));
  await H.shot(page, dir, 'buds', files); await page.mouse.up(); await page.waitForTimeout(400);
  await holdBud(X0, yCut, 0);
  cs = await H.clips(page); const L0 = cs.filter(c => c.lane === 0);
  const tHeld = await page.evaluate(() => __CL.lastDown().t);   // where the press landed (WebKit delivers whole-pixel mouse coordinates)
  info.cut = { opened, lane0: L0, tHeld };
  checks.budsOpen = opened.buds === 4 && opened.s.open > .5;
  checks.cutWhereHeld = L0.length === 3 && lib.near(L0[0].end, tHeld, 1e-9) && lib.near(L0[1].s, L0[0].end, 1e-12) && lib.near(L0[0].d + L0[1].d, A.d, 1e-9) && lib.near(L0[1].off, A.off + (L0[1].s - A.s), 1e-9);
  cs = await H.clips(page); const C5 = cs.find(c => c.id === C.id), cyy = await H.yOf(page, C5.s + C5.d / 2);
  await holdBud(X1, cyy, 2, async (x, y) => { for (let i = 1; i <= 10; i++) { await page.mouse.move(x, y + 4 * i); await page.waitForTimeout(30); } await page.waitForTimeout(200); });
  const C6 = await clip(C.id); info.move = { before: C5, after: C6 };
  checks.move = C6.lane === 1 && C6.s > C5.s + .3;
  cs = await H.clips(page);
  const nBefore = cs.length, Bc = cs.find(c => c.take === 'take-b');
  await holdBud(X0, await H.yOf(page, Bc.s + Bc.d / 2), 1);
  cs = await H.clips(page); const copy = cs.find(c => c.take === 'take-b' && c.id !== Bc.id);
  checks.copy = cs.length === nBefore + 1 && !!copy && copy.lane === 0 && lib.near(copy.s, Bc.end, 1e-9) && lib.near(copy.d, Bc.d, 1e-9);
  await H.drag(page, X1, 600, X1, 300, { steps: 15, stepMs: 16, after: 150 }); await page.waitForTimeout(300);   // scroll down the timeline (drag on empty lane 1)
  const vt = (await H.view(page)).vt; info.scrolled = vt;
  if (copy) { const vy = await H.yOf(page, copy.s + copy.d / 2); if (vy < v.H - v.BOT - 20 && vy > 80) await holdBud(X0, vy, 3); }
  cs = await H.clips(page); checks.delete = cs.length === nBefore;
  const errors = H.errorsOf(page); checks.noErrors = errors.length === 0;
  await lib.sheet(br, files, `${dir}/sheet.png`, 3, 200); await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), engine: lib.ENGINE, checks, info, errors });
};
