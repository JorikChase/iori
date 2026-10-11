/* Editor — the take shelf as a wheel (wheel.js, tap mode, dark).
   Seven takes of every kind and distinct lengths are written through the library API (AT.takes.put), oldest first.
   1. the playhead goes to beat 3 (1.2 s); props dot -> shelf bud: the wheel lists ALL 7 takes newest first under an
      open-file row (8 rows), each row the take's kind icon + its length m:ss; it opens on the newest take; its panel
      sits above the bottom-right buds, clear of the property dot and of the hub corner (screenshot)
   2. row taps down to take #6 (the sixth newest), tap the band -> that take is placed at the playhead (track 0), the
      wheel and the props close, the session holds it
   3. shelf again, spin to take #3, the x -> cancelled: nothing placed, no undo step, the session unchanged
   4. shelf again, a row tap up to the file row, the file chooser armed ~200 ms before the committing tap -> the picker
      opens from that tap; signals/bursts.wav is imported (kind file) and placed at the playhead (track 1, the first
      with room); the shelf now lists 8 takes with it first */
const path = require('path');
const E = require('./edit-gesture-base.js'), H = E.H;
const KIND = { rec: 'microphone', retro: 'history', file: 'file-music', synth: 'wave-sine', mix: 'device-floppy' };
const SEED = [['rec', 5], ['retro', 7], ['file', 9], ['synth', 11], ['mix', 13], ['rec', 65], ['retro', 3]];   // oldest first
const fmt = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

/* wheel helpers (shared with edit-wheel-values.js) */
const wst = (page) => page.evaluate(() => { const w = Wheel.active(); return w ? w.state() : null; });
async function spin(page, ci, target) {   // row taps (at most 2 rows per tap) until column ci settles on target
  for (let guard = 0; guard < 40; guard++) {
    const s = await wst(page); if (!s) return false; const col = s.cols[ci]; let d = target - col.idx;
    if (col.loop) { if (d > col.n / 2) d -= col.n; if (d < -col.n / 2) d += col.n; }
    if (!d) return true;
    const k = Math.max(-2, Math.min(2, d)), R = s.rowH * 5 / 2;
    await H.tap(page, col.x, s.bandY + R * Math.sin(k * s.rowH / R), 40); await page.waitForTimeout(400);
  }
  return false;
}
const commitBand = async (page) => { const s = await wst(page); await H.tap(page, s.cols[0].x, s.bandY, 40); };
const cancelX = async (page) => { const s = await wst(page); await H.tap(page, s.cancel.x, s.cancel.y, 40); };
const overlapsCircle = (r, cx, cy, rad) => { const nx = Math.max(r.left, Math.min(cx, r.left + r.w)), ny = Math.max(r.top, Math.min(cy, r.top + r.h)); return Math.hypot(nx - cx, ny - cy) < rad; };

async function scenario(lib) {
  const sfx = H.SFX(); const dir = lib.outDir('edit-wheel-shelf' + sfx); const br = await lib.browser(); const files = []; const checks = {}, info = {};
  const W = lib.VIEW.width, Hh = lib.VIEW.height;
  const page = await E.openEd(lib, br);
  await page.evaluate(async (SEED) => { for (const [kind, sec] of SEED) { const sr = 8000, d = new Float32Array(sr * sec);
    for (let i = 0; i < d.length; i++) d[i] = .3 * Math.sin(2 * Math.PI * 220 * i / sr); await AT.takes.put({ name: kind + sec, kind, sr, data: d }); await new Promise(r => setTimeout(r, 5)); } }, SEED);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300); await E.settle(page);
  const lib0 = await page.evaluate(() => AT.takes.list().then(a => a.map(m => ({ id: m.id, kind: m.kind, dur: m.dur }))));
  const BEAT = await page.evaluate(() => __E.BEAT), v = await E.view(page);
  const sess = () => page.evaluate(() => JSON.parse(localStorage.getItem('audio.session.edit') || 'null'));
  const openShelf = async () => { await H.tap(page, v.prop.x, v.prop.y); await page.waitForTimeout(400); const b = await page.evaluate(() => __E.bud(2)); await H.tap(page, b.x, b.y); await page.waitForTimeout(600); };

  // 1. playhead at beat 3, then the shelf
  await H.tap(page, W * 0.3, v.TOP + 2 * BEAT * v.pps + 1); await page.waitForTimeout(300);
  const ph = await page.evaluate(() => __S.ph);
  await openShelf();
  const sh = await page.evaluate(() => { const s = __E.shelf(), w = Wheel.active(); return { s, items: w ? w.o.columns[0].items : null, dark: w ? !w.o.light : null }; });
  const budPos = await page.evaluate(() => [0, 1, 2, 3].map(i => __E.bud(i)));
  await H.shot(page, dir, '1-shelf-wheel', files);
  const wr = sh.s.wheel && sh.s.wheel.rect, keys = sh.s.keys, items = sh.items || [];
  info.shelf = { keys, items, rect: wr, idx: sh.s.wheel && sh.s.wheel.cols[0].idx, ph, buds: budPos };
  const want = lib0.map(m => ({ icon: KIND[m.kind], text: fmt(Math.round(m.dur)) }));
  checks.listsAllSevenPlusFile = lib0.length === 7 && keys.length === 8 && keys[0] === 'file' && keys.slice(1).join() === lib0.map(m => m.id).join();
  checks.rowsKindIconAndLength = items.length === 8 && items[0].icon === 'file-music' && want.every((w, i) => items[i + 1].icon === w.icon && items[i + 1].text === w.text)
    && new Set(items.slice(1).map(i => i.icon)).size === 5;
  checks.opensOnNewestTake = !!sh.s.wheel && sh.s.wheel.cols[0].idx === 1;
  checks.darkWheel = sh.dark === true;
  checks.placedAboveCornerBuds = !!wr && wr.top + wr.h < Math.min(...budPos.map(b => b.y)) - 15 && !overlapsCircle(wr, v.prop.x, v.prop.y, 13 + 4)
    && !(wr.left < 104 && wr.top + wr.h > Hh - 104) && wr.left >= 0 && wr.left + wr.w <= W && !budPos.some(b => overlapsCircle(wr, b.x, b.y, 15));

  // 2. take #6
  const t6 = keys[6]; await spin(page, 0, 6); await H.shot(page, dir, '2-shelf-take6', files);
  const atRow = (await wst(page)).cols[0].idx;
  await commitBand(page); await page.waitForTimeout(900);
  const a2 = await page.evaluate(() => ({ clips: __E.clips(), st: __E.state(), sh: __E.shelf(), active: !!Wheel.active() }));
  const s2 = await sess(); await H.shot(page, dir, '3-take6-placed', files);
  const c6 = a2.clips[0], m6 = lib0.find(m => m.id === t6);
  info.take6 = { atRow, id: t6, clips: a2.clips.map(c => ({ k: c.k, t: c.t, s: c.s, d: c.d })), session: s2 && s2.clips };
  checks.take6Inserted = atRow === 6 && a2.clips.length === 1 && c6.k === t6 && c6.t === 0 && lib.near(c6.s, Math.round(ph / BEAT) * BEAT, 1e-9) && lib.near(c6.d, m6.dur, 1e-6);
  checks.closedAfterCommit = !a2.active && !a2.sh.open && !a2.st.wheel && !a2.st.propOpen;
  checks.sessionHasTake6 = !!s2 && s2.clips.length === 1 && s2.clips[0].k === t6 && lib.near(s2.clips[0].s, c6.s, 1e-9);

  // 3. cancel
  const u3 = (await E.st(page)).undo, j3 = JSON.stringify(await sess());
  await openShelf(); await spin(page, 0, 3); await H.shot(page, dir, '4-shelf-before-cancel', files);
  await cancelX(page); await page.waitForTimeout(900);
  const a3 = await page.evaluate(() => ({ n: __E.clips().length, st: __E.state(), active: !!Wheel.active(), sh: __E.shelf() }));
  checks.cancelLeavesAllUnchanged = a3.n === 1 && a3.st.undo === u3 && !a3.active && !a3.sh.open && JSON.stringify(await sess()) === j3;
  info.cancel = { n: a3.n, undo: [u3, a3.st.undo] };
  if (a3.st.propOpen) { await H.tap(page, v.prop.x, v.prop.y); await page.waitForTimeout(400); }   // cancel leaves the props as they were

  // 4. the file row
  await openShelf(); await spin(page, 0, 0); await H.shot(page, dir, '5-shelf-file-row', files);
  const fcP = page.waitForEvent('filechooser', { timeout: 8000 }); await page.waitForTimeout(200);
  await commitBand(page);
  let fc = null; try { fc = await fcP; } catch (e) { info.fileErr = String(e); }
  if (fc) await fc.setFiles(path.join(__dirname, '..', 'signals', 'bursts.wav'));
  try { await page.waitForFunction(() => __E.clips().length === 2 && __E.slots().every(s => s.loaded), null, { timeout: 8000 }); } catch (_) {}
  await page.waitForTimeout(600);
  const a4 = await page.evaluate(async () => ({ clips: __E.clips(), lib: (await AT.takes.list()).map(m => ({ id: m.id, kind: m.kind, name: m.name, dur: m.dur })) }));
  const s4 = await sess(); await H.shot(page, dir, '6-file-placed', files);
  const fm = a4.lib[0], cf = a4.clips.find(c => c.k === fm.id);
  info.file = { chooser: !!fc, lib0: fm, clip: cf };
  checks.fileRowOpensPicker = !!fc;
  checks.fileImportedAndPlaced = a4.lib.length === 8 && fm.kind === 'file' && fm.name === 'bursts' && lib.near(fm.dur, 30, .01)
    && !!cf && cf.t === 1 && lib.near(cf.s, c6.s, 1e-9) && !!s4 && s4.clips.some(c => c.k === fm.id);
  await openShelf();
  const sh5 = await page.evaluate(() => __E.shelf()); await H.shot(page, dir, '7-shelf-eight', files);
  checks.shelfListsNewFileFirst = sh5.keys.length === 9 && sh5.keys[0] === 'file' && sh5.keys[1] === fm.id;
  await cancelX(page); await page.waitForTimeout(500);

  const errors = H.errorsOf(page); checks.noErrors = errors.length === 0;
  await page.context().close();
  await lib.sheet(br, files, `${dir}/sheet.png`, 4, 200); await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), engine: lib.ENGINE, checks, info, errors });
}
module.exports = scenario;
Object.assign(module.exports, { wst, spin, commitBand, cancelX, overlapsCircle });
