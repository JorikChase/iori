/* Editor — the selected clip's panel at the corner (it replaces snap / push / shelf / save while a clip is selected).
   1. panel buds on C: warp on, warp mode tones, fade curve exponential
   2. slide on the transpose readout: up 70 px straight -> +5; up 42 px with the finger 60 px to the side (finer gear,
      1/3) -> +6; gain: down 30 px -> -3.0 dB
   3. slide on the original tempo readout: up 40 px -> 110.0 (0.25 BPM per px); warped, the length follows
   4. tap the original tempo readout -> the wheel.js digit wheel opens on the clip's tempo; row taps to 128.0
      (screenshot), tap the band -> the clip's original tempo is EXACTLY 128.0 ('set'); its length = source x 128 / 100
   5. the corner dot hides / shows the panel while the clip stays selected
   6. tempo estimate: a 120 BPM click take placed as a clip -> selecting it sets its original tempo to ~120 ('est');
      a held tone has none -> the shared tempo ('shared') */
const E = require('./edit-gesture-base.js'), H = E.H;
module.exports = async (lib) => {
  const sfx = H.SFX(); const dir = lib.outDir('edit-gesture-panel' + sfx); const br = await lib.browser(); const files = []; const checks = {}, info = {};
  const page = await E.std(lib, br, { snap: 0 });
  const v = await E.view(page), X0 = v.lanes[0], X1 = v.lanes[1]; const { C } = await E.abc(page);
  const clip = () => E.byId(page, C.id), item = (pred) => E.item(page, pred);
  await E.select(page, X1, await E.yOf(page, C.s + C.d / 2)); await page.waitForTimeout(300);
  // 1. buds
  let it = await item(o => o.kind === 'warp'); await H.tap(page, it.x, it.y); await page.waitForTimeout(150);
  it = await item(o => o.kind === 'mode' && o.i === 1); await H.tap(page, it.x, it.y); await page.waitForTimeout(150);
  it = await item(o => o.kind === 'curve' && o.i === 2); await H.tap(page, it.x, it.y); await page.waitForTimeout(250);
  const c1 = await clip(); info.buds = c1; await H.shot(page, dir, '1-panel-buds', files);
  checks.panelBuds = c1.warp && c1.mode === 'tones' && c1.curve === 2 && (await page.evaluate(() => __E.sel())) === C.id;
  // 2. slides
  it = await item(o => o.what === 'semi'); const sx = it.xr - 8, sy = it.y;
  await H.drag(page, sx, sy, sx, sy - 70, { steps: 14, stepMs: 20 }); await page.waitForTimeout(150); const s1 = (await clip()).semi;
  await page.mouse.move(sx, sy); await page.mouse.down(); for (let i = 1; i <= 6; i++) { await page.mouse.move(sx - 10 * i, sy - 2); await page.waitForTimeout(16); }
  for (let i = 1; i <= 14; i++) { await page.mouse.move(sx - 60, sy - 2 - 3 * i); await page.waitForTimeout(16); } await page.waitForTimeout(80); await page.mouse.up(); await page.waitForTimeout(150);
  const s2 = (await clip()).semi;
  it = await item(o => o.what === 'gain'); await H.drag(page, it.xr - 8, it.y, it.xr - 8, it.y + 30, { steps: 10, stepMs: 20 }); await page.waitForTimeout(200);
  const g3 = (await clip()).gain; info.slide = { s1, s2, g3 };
  checks.slideTranspose = s1 === 5 && s2 === 6;
  checks.slideGain = lib.near(g3, -3, 1e-9);
  // 3. tempo slide
  it = await item(o => o.what === 'tempo'); await H.drag(page, it.xr - 12, it.y, it.xr - 12, it.y - 40, { steps: 10, stepMs: 20 }); await page.waitForTimeout(200);
  const ct = await clip(); info.slideTempo = ct;
  checks.slideTempo = ct.ot === 110 && lib.near(ct.d, ct.sl * 110 / v.tempo, 1e-9);
  // 4. the wheel
  it = await item(o => o.what === 'tempo'); await H.tap(page, it.xr - 12, it.y); await page.waitForTimeout(450);
  const w0 = await page.evaluate(() => { const w = Wheel.active(); return w ? w.state() : null; });
  const target = [1, 2, 8, 0];
  if (w0) { const R = w0.rowH * 5 / 2, Aw = w0.rowH / R;
    for (let ci = 0; ci < 4; ci++) { for (let guard = 0; guard < 8; guard++) { const s = await page.evaluate(() => Wheel.active().state()), col = s.cols[ci]; let dlt = target[ci] - col.idx;
        if (col.loop) { if (dlt > 5) dlt -= 10; if (dlt < -5) dlt += 10; } if (!dlt) break; const k = Math.max(-2, Math.min(2, dlt));
        await H.tap(page, col.x, s.bandY + R * Math.sin(k * Aw), 40); await page.waitForTimeout(420); } } }
  const w1 = await page.evaluate(() => { const w = Wheel.active(); return w ? w.state().cols.map(c => c.idx) : null; }); await H.shot(page, dir, '4-wheel-tempo', files);
  if (w0) await H.tap(page, w0.cols[1].x, w0.bandY, 40); await page.waitForTimeout(700);
  const c4 = await clip(); info.wheel = { opened: !!w0, idx: w1, clip: c4 };
  checks.wheelOpens = !!w0 && w0.cols.length === 4;
  checks.wheelSetsTempoExactly = c4.ot === 128 && c4.ots === 'set' && lib.near(c4.d, c4.sl * 128 / v.tempo, 1e-9) && !(await page.evaluate(() => !!Wheel.active()));
  await H.shot(page, dir, '4-after-wheel', files);
  // 5. the corner dot hides / shows the panel
  await H.tap(page, v.prop.x, v.prop.y); await page.waitForTimeout(700); const h1 = await page.evaluate(() => ({ sel: __E.sel(), p: __E.panel() }));
  await H.tap(page, v.prop.x, v.prop.y); await page.waitForTimeout(800); const h2 = await page.evaluate(() => ({ sel: __E.sel(), p: __E.panel() }));
  info.hide = { h1: { sel: h1.sel, open: h1.p.open, k: h1.p.k }, h2: { sel: h2.sel, open: h2.p.open, k: h2.p.k } };
  checks.cornerDotTogglesPanel = h1.sel === C.id && !h1.p.open && h1.p.k < .1 && h2.sel === C.id && h2.p.open && h2.p.k > .9;
  const errors = H.errorsOf(page); await page.context().close();
  // 6. tempo estimate
  const p2 = await E.std(lib, br, { snap: 0, specs: [{ name: 'tone', sec: 8, hz: 440, amp: .25 }, { name: 'click', wav: 'click120.wav', sec: 12 }],
    clips: (ids) => [{ k: ids[1], t: 0, s: 0.6, d: 8, off: 1, rev: 0 }, { k: ids[0], t: 1, s: 1.2, d: 4, off: 1, rev: 0 }], pps: 40 });
  const cs = await E.clips(p2), ck = cs.find(c => c.t === 0), tn = cs.find(c => c.t === 1);
  await E.select(p2, X0, await E.yOf(p2, ck.s + 2)); const ck1 = await E.byId(p2, ck.id);
  await E.select(p2, X1, await E.yOf(p2, tn.s + 2)); const tn1 = await E.byId(p2, tn.id);
  await H.shot(p2, dir, '6-estimated', files);
  info.estimate = { click: ck1, tone: tn1 };
  checks.tempoEstimateClick = ck1.ots === 'est' && Math.abs(ck1.ot - 120) <= 1;
  checks.tempoFallbackTone = tn1.ots === 'shared' && tn1.ot === 100;
  const errors2 = H.errorsOf(p2); checks.noErrors = errors.length + errors2.length === 0;
  await lib.sheet(br, files, `${dir}/sheet.png`, 4, 180); await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), engine: lib.ENGINE, checks, info, errors: errors.concat(errors2) });
};
