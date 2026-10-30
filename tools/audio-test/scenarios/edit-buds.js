/* Stage 0, editor and recorder small fixes.
   1. property buds act on release: pressing snap changes nothing until the finger lifts; a slide off cancels
   2. a head's hold offers mute, solo and remove (arm is hidden until recording into a track exists)
   3. tapping save after the 6 s share window, with nothing changed, does not write a second mix take
   4. recorder: with the mic closed, the properties dot arms retro without making a take */
const G = require('./edit-gesture-base.js');
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('edit-buds'); const W = lib.VIEW.width, H = lib.VIEW.height;
  const page = await G.std(lib, br);
  const mixes = () => page.evaluate(async () => (await AT.takes.list()).filter(m => m.kind === 'mix').length);
  const P = await page.evaluate(() => __E.view().prop); await page.mouse.click(P.x, P.y); await page.waitForTimeout(400);
  // 1. on release
  const b0 = await page.evaluate(() => __E.bud(0)); const snap0 = (await G.st(page)).snapOn;
  await page.mouse.move(b0.x, b0.y); await page.mouse.down(); await page.waitForTimeout(120);
  const during = (await G.st(page)).snapOn; await page.mouse.up(); await page.waitForTimeout(120); const after = (await G.st(page)).snapOn;
  await page.mouse.move(b0.x, b0.y); await page.mouse.down(); await page.mouse.move(b0.x - 40, b0.y - 40); await page.mouse.up(); await page.waitForTimeout(120);
  const slid = (await G.st(page)).snapOn;
  // 3. save, wait out the window, save again
  const b3 = await page.evaluate(() => __E.bud(3)); await page.mouse.click(b3.x, b3.y);
  await page.waitForFunction(() => __E.mix().st === 'ready', null, { timeout: 15000 }); const m1 = await mixes();
  await page.waitForFunction(() => __E.mix().st === 'idle', null, { timeout: 9000 });
  await page.mouse.click(b3.x, b3.y); await page.waitForTimeout(800); const again = await page.evaluate(() => __E.mix().st); const m2 = await mixes();
  // 2. head buds: tap away to close the row, then hold the first head
  await page.mouse.click(P.x, P.y); await page.waitForTimeout(300);
  const lane = (await G.view(page)).lanes[0], top = (await G.view(page)).TOP;
  await page.mouse.move(lane, top - 24); await page.mouse.down(); await page.waitForTimeout(420);
  const ic = await G.icons(page); const buds = (await page.evaluate(() => __E.buds())).length; await page.mouse.up(); await page.waitForTimeout(200);
  const errors = page.errors.filter(e => !/service ?worker/i.test(e)); await page.context().close();
  // 4. retro armed without a take
  const r = await lib.open(br, 'rec', { wav: 'bursts.wav', wait: 800 });
  await r.mouse.click(W - 34, H - 34); await r.waitForFunction(() => __S.live === true, null, { timeout: 8000 }); await r.waitForTimeout(1500);
  const rs = await r.evaluate(async () => ({ retro: __S.retro, rec: __S.rec, heard: __S.rn, takes: (await AT.takes.list()).length }));
  const rerr = r.errors.filter(e => !/service ?worker/i.test(e)); await br.close();
  const checks = { onRelease: during === snap0 && after !== snap0, slideCancels: slid === after, threeHeadBuds: buds === 3 && !ic.includes('player-record'),
    noDuplicateMix: m1 === 1 && m2 === 1 && again === 'ready', retroArmed: rs.retro && !rs.rec && rs.heard > 0 && rs.takes === 0, noErrors: !errors.length && !rerr.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, m1, m2, again, buds, ic, rs, errors, rerr });
};
