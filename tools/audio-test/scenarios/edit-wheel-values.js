/* Editor — the clip panel's values on the wheel (wheel.js, tap mode, dark): a tap on the TRANSPOSE or GAIN readout
   opens a one-column wheel on the clip's value, like the original-tempo digit wheel; the slide stays.
   Fixture: edit-gesture-base's A / B / C; C (track 1) is selected.
   1. tap transpose (0) -> 25 rows -12..+12 signed, on '0'; row taps to '-7' (screenshot), the band -> C.semi = -7
      exactly, one undo step, the session holds -7
   2. tap gain (0.0) -> 121 rows -48.0..+12.0 in 0.5 dB, on '0.0', in the transpose wheel's column, lifted (<= one row, 44 px)
      just clear of the play and property dots; row taps to '+4.5'
      (screenshot), the band -> C.gain = 4.5, the session holds 4.5
   3. transpose wheel, spin to '+8', the x -> cancelled: C.semi still -7, no undo step, the session unchanged
   4. the slide still works: gain down 33 px -> 1.2 dB (off the 0.5 grid); the gain wheel opens on '+1.0' and a tap on
      the band (no spin) keeps 1.2 exactly — committing where it opened changes nothing */
const E = require('./edit-gesture-base.js'), H = E.H;
const { wst, spin, commitBand, cancelX, overlapsCircle } = require('./edit-wheel-shelf.js');
module.exports = async (lib) => {
  const sfx = H.SFX(); const dir = lib.outDir('edit-wheel-values' + sfx); const br = await lib.browser(); const files = []; const checks = {}, info = {};
  const page = await E.std(lib, br, { snap: 0 });
  const v = await E.view(page), X1 = v.lanes[1]; const { C } = await E.abc(page);
  const clip = () => E.byId(page, C.id), item = (pred) => E.item(page, pred);
  const sessC = () => page.evaluate((k) => { const o = JSON.parse(localStorage.getItem('audio.session.edit') || 'null'); return o && o.clips.find(c => c.k === k); }, C.k);
  const wItems = () => page.evaluate(() => { const w = Wheel.active(); return w ? { items: w.o.columns[0].items, light: !!w.o.light } : null; });
  await E.select(page, X1, await E.yOf(page, C.s + C.d / 2)); await page.waitForTimeout(300);

  // 1. transpose
  let it = await item(o => o.what === 'semi'); const u0 = (await E.st(page)).undo;
  await H.tap(page, it.xr - 12, it.y); await page.waitForTimeout(450);
  const w1 = await wst(page), i1 = await wItems();
  await spin(page, 0, 5); const w1b = await wst(page); await H.shot(page, dir, '1-wheel-transpose', files);
  await commitBand(page); await page.waitForTimeout(800);
  const c1 = await clip(), s1 = await sessC(), u1 = (await E.st(page)).undo;
  info.semi = { rows: i1 && i1.items.length, first: i1 && i1.items[0], last: i1 && i1.items[24], open: w1 && w1.cols[0].idx, at: w1b && w1b.cols[0].idx, rect: w1 && w1.rect, semi: c1.semi, session: s1 && s1.semi, mat: c1.mat };
  checks.transposeWheelOpens = !!w1 && w1.cols.length === 1 && w1.cols[0].n === 25 && w1.cols[0].idx === 12 && i1.items[12] === '0' && i1.items[0] === '-12' && i1.items[24] === '+12' && i1.items[5] === '-7' && !i1.light;
  checks.transposeExact = c1.semi === -7 && u1 === u0 + 1 && !(await wst(page));
  checks.transposeInSession = !!s1 && s1.semi === -7;
  await H.shot(page, dir, '2-after-transpose', files);

  // 2. gain
  it = await item(o => o.what === 'gain');
  await H.tap(page, it.xr - 12, it.y); await page.waitForTimeout(450);
  const w2 = await wst(page), i2 = await wItems();
  await spin(page, 0, 105); const w2b = await wst(page); await H.shot(page, dir, '3-wheel-gain', files);
  await commitBand(page); await page.waitForTimeout(800);
  const c2 = await clip(), s2 = await sessC();
  info.gain = { rows: i2 && i2.items.length, open: w2 && w2.cols[0].idx, at: w2b && w2b.cols[0].idx, rect: w2 && w2.rect, bandY: w2 && w2.bandY, readoutY: it.y, gain: c2.gain, session: s2 && s2.gain };
  checks.gainWheelOpens = !!w2 && w2.cols[0].n === 121 && w2.cols[0].idx === 96 && i2.items[96] === '0.0' && i2.items[0] === '-48.0' && i2.items[120] === '+12.0' && i2.items[105] === '+4.5' && !i2.light;
  checks.gainWheelNearItsRowClearOfDots = !!w2 && w2.bandY <= it.y && it.y - w2.bandY <= 44 && w2.rect.top + w2.rect.h <= v.prop.y - 16 - 6
    && !overlapsCircle(w2.rect, v.prop.x, v.prop.y, 13 + 4) && !overlapsCircle(w2.rect, v.play.x, v.play.y, 16 + 4) && w2.rect.left > 104 && !!w1 && Math.abs((w2.rect.left + w2.rect.w / 2) - (w1.rect.left + w1.rect.w / 2)) <= 1.5;
  checks.gainExact = c2.gain === 4.5 && c2.semi === -7 && !(await wst(page));
  checks.gainInSession = !!s2 && s2.gain === 4.5;

  // 3. cancel
  const u3 = (await E.st(page)).undo, j3 = JSON.stringify(await sessC());
  it = await item(o => o.what === 'semi'); await H.tap(page, it.xr - 12, it.y); await page.waitForTimeout(450);
  await spin(page, 0, 20); await H.shot(page, dir, '4-transpose-before-cancel', files);
  await cancelX(page); await page.waitForTimeout(800);
  const c3 = await clip();
  info.cancel = { semi: c3.semi, undo: [u3, (await E.st(page)).undo] };
  checks.cancelUnchanged = c3.semi === -7 && c3.gain === 4.5 && (await E.st(page)).undo === u3 && JSON.stringify(await sessC()) === j3 && !(await wst(page));

  // 4. slide, then an unspun commit
  it = await item(o => o.what === 'gain');
  await H.drag(page, it.xr - 8, it.y, it.xr - 8, it.y + 33, { steps: 11, stepMs: 20 }); await page.waitForTimeout(250);
  const g4 = (await clip()).gain;
  await H.tap(page, it.xr - 12, it.y); await page.waitForTimeout(450);
  const w4 = await wst(page), i4 = await wItems(); await H.shot(page, dir, '5-wheel-gain-off-grid', files);
  const u4 = (await E.st(page)).undo;
  await commitBand(page); await page.waitForTimeout(700);
  const c4 = await clip();
  info.offGrid = { slid: g4, openRow: w4 && i4.items[w4.cols[0].idx], after: c4.gain };
  checks.slideStillWorks = lib.near(g4, 1.2, 1e-9);
  checks.unspunCommitKeepsValue = !!w4 && i4.items[w4.cols[0].idx] === '+1.0' && lib.near(c4.gain, 1.2, 1e-9) && (await E.st(page)).undo === u4;

  const errors = H.errorsOf(page); checks.noErrors = errors.length === 0;
  await page.context().close();
  await lib.sheet(br, files, `${dir}/sheet.png`, 3, 220); await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), engine: lib.ENGINE, checks, info, errors });
};
