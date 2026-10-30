/* The timeline has no end (Stage 0; owner: clips must not be cut at a finite limit). 100 BPM, bar 2.4 s, 14 bars = 33.6 s.
   1. a clip near the end, hold -> move, drag to the bottom edge and stay: the view scrolls on and the clip goes past the
      old end at full length; the timeline keeps 8 empty bars after it
   2. hold -> copy on a clip that ends at the old limit: the copy lands after it
   3. a 60 s take placed at the playhead keeps its whole length
   4. deleting the far clips lets the timeline settle back
   5. playback stops at the last clip's end, not at the end of the empty bars */
const G = require('./edit-gesture-base.js');
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('edit-endless'); const H = lib.VIEW.height;
  const page = await G.openEd(lib, br); const ids = await G.H.seed(page, G.H.STD);
  const BAR = 2.4;
  await G.session(page, [{ k: ids[0], t: 0, s: 26, d: 3, off: 1, rev: 0 }, { k: ids[1], t: 1, s: 30.6, d: 3, off: 1, rev: 0 }], { pps: 30, vt: 20 });
  const tl = () => page.evaluate(() => __E.TL());
  const before = { tl: await tl(), clips: await G.clips(page) };
  const w = lib.VIEW.width, lanes = (await G.view(page)).lanes, lane = (t) => Math.round(lanes[t]);
  // 1. drag past the end
  const c0 = before.clips.find(c => c.k === ids[0]);
  const y0 = await G.yOf(page, c0.s + 1.5);
  await G.holdBud(page, lane(0), y0, 2, async (x, y) => { for (let i = 1; i <= 12; i++) { await page.mouse.move(x, y + (H - 70 - y) * i / 12); await page.waitForTimeout(30); } await page.waitForTimeout(3500); });
  await page.waitForTimeout(200);
  const moved = (await G.clips(page)).find(c => c.id === c0.id); const tl1 = await tl();
  // 2. copy past the old end
  const c1 = before.clips.find(c => c.k === ids[1]);
  const y1 = await page.evaluate((s) => { __S.vt = Math.max(0, s - 8); return __E.yOf(s); }, c1.s + 1.5); await page.waitForTimeout(200);
  await G.holdBud(page, lane(1), y1, 1); await page.waitForTimeout(200);
  const cs2 = await G.clips(page); const copy = cs2.find(c => c.k === c1.k && c.id !== c1.id);
  // 3. a long take at the playhead, placed the way other tools place it
  const id60 = await page.evaluate(async () => { const sr = 48000, d = new Float32Array(sr * 60); for (let i = 0; i < d.length; i += 2) d[i] = .1;
    return (await AT.takes.put({ name: 'long', kind: 'rec', sr, data: d })).id; });
  await page.evaluate((id) => { __S.ph = 30; localStorage.setItem('audio.place', JSON.stringify([{ id, at: 'playhead' }])); }, id60);
  await page.evaluate(() => __E.save(true)); await page.reload({ waitUntil: 'load' }); await G.settle(page); await page.waitForTimeout(600);
  const cs3 = await G.clips(page); const long = cs3.find(c => c.k === id60); const tl3 = await tl();
  // 4 + 5. a small timeline again: one clip, play from just before its end
  await G.session(page, [{ k: ids[0], t: 0, s: 2.4, d: 3, off: 1, rev: 0 }], { pps: 30 });
  const tl4 = await tl();
  await page.evaluate(() => { __S.ph = 4.8; }); await page.mouse.click(w / 2, H - 30); await page.waitForTimeout(300);
  const playing = await page.evaluate(() => __S.play); await page.waitForTimeout(1500);
  const stopped = await page.evaluate(() => ({ play: __S.play, ph: __S.ph }));
  const errors = page.errors.filter(e => !/service ?worker/i.test(e)); await page.screenshot({ path: `${dir}/end.png` }); await page.context().close(); await br.close();
  const end = (c) => c.s + c.d;
  const checks = {
    tail8: lib.near(before.tl, 33.6 + 8 * BAR, 1e-6),   // the last clip ends at bar 14
    dragPast: moved.s > 33.6 && lib.near(moved.d, 3, 1e-6) && tl1 >= end(moved) + 8 * BAR - 1e-6,
    copyPast: !!copy && lib.near(copy.d, c1.d, 1e-6) && copy.s >= c1.s + c1.d - 1e-6,
    longWhole: !!long && lib.near(long.d, 60, .01) && tl3 >= end(long) + 8 * BAR - 1e-6,
    settlesBack: lib.near(tl4, BAR * 14, 1e-6),
    stopsAtLastClip: playing === true && stopped.play === false && stopped.ph === 0, noErrors: !errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, before, moved, tl1, copy, long, tl3, tl4, stopped, errors });
};
