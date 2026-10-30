/* Record -> place -> edit -> export, inside the shell, leaving and returning at every step.
   home -> recorder, 3 s take; home and back: the take is there. Hold it, place: the editor opens with the clip. Home and
   back: the clip is there. Trim it and move it to the second track; away to the metronome by the dial and back: both
   edits are there. Save the mix: a 'mix' take whose length ends with the clip. Away and back: same mix, no second one;
   the share tap hands over the WAV. */
const d = require('../drive'); const { kit, SHARE_STUB, SLOW } = require('../flowkit');
module.exports = async (lib) => {
  const dir = lib.outDir('flow-rec-edit-export' + (lib.ENGINE === 'webkit' ? '-webkit' : '')), W = lib.VIEW.width, H = lib.VIEW.height, checks = {}, info = {};
  const br = await lib.browser(); const page = await lib.open(br, 'shell', { wait: 1200, wav: 'sine440.wav' }); await page.addInitScript(SHARE_STUB); await page.addInitScript(SLOW); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1200);
  const f = await kit(lib, page), C = { x: W / 2, y: Math.round(H * .45) }, tid = (fr) => fr.evaluate(() => __S.takes.map(t => t.key));
  let rec = await f.open('rec');
  await rec.evaluate(({ x, y }) => G.tap(x, y), C); await rec.waitForFunction(() => __S.rec, null, { timeout: 20000 }).catch(async () => { await rec.evaluate(async ({ x, y }) => { await G.frame(() => __S.live, 5000); await G.tap(x, y); }, C); await rec.waitForFunction(() => __S.rec, null, { timeout: 20000 }); });
  await page.waitForTimeout(3000); await rec.evaluate(({ x, y }) => G.tap(x, y), C); await rec.waitForFunction(() => __S.takes.length && !__S.rec && !__S.tail, null, { timeout: 20000 }); await page.waitForTimeout(500);
  const take = await rec.evaluate(() => ({ id: __S.takes[0].key, dur: __S.takes[0].meta.dur })); checks.recorded = lib.near(take.dur, 3, .4); info.take = take;
  await f.home(); rec = await f.open('rec'); await rec.waitForFunction(() => __S.takes.length, null, { timeout: 20000 }).catch(() => {}); checks.takeSurvivesLeaving = (await tid(rec)).includes(take.id);
  // place: hold the take row, slide to the first bud
  const ty = await rec.evaluate(({ H }) => Math.round(H * .45) + 84 + 44, { H }), x0 = W / 2 + 20;
  await rec.evaluate(async ({ x, y }) => { G.down(x, y); await G.frame(() => __S.press && __S.press.opened, 4000); await G.wait(80); const p = __S.tgt[0]; await G.to(p[0], p[1], { ms: 140, steps: 7 }); await G.wait(60); G.up(); }, { x: x0, y: ty });
  await f.inTool('edit'); await page.waitForTimeout(700); let ed = await f.G('edit'); await ed.waitForFunction((id) => __E.clips().some(c => c.k === id), take.id, { timeout: 20000 }).catch(() => {});
  const cl = (e) => e.evaluate(() => __E.clips().map(c => ({ id: c.id, k: c.k, t: c.t, s: +c.s.toFixed(3), d: +c.d.toFixed(3), end: +c.end.toFixed(3) })));
  const c1 = await cl(ed); checks.placed = c1.length === 1 && c1[0].k === take.id && lib.near(c1[0].d, take.dur, .01); info.placed = c1;
  await f.home(); ed = await f.open('edit'); await ed.waitForFunction(() => __S.ready && __E.clips().length, null, { timeout: 20000 }).catch(() => {}); const c2 = await cl(ed); checks.clipSurvivesLeaving = c2.length === 1 && c2[0].d === c1[0].d;
  // edit: trim the tail by a beat's worth and move to track 2 at 2.0 s
  await ed.evaluate(async () => { const c = __E.clips()[0], x = __E.view().lanes[c.t]; await G.drag(x, __E.yOf(c.end), x, __E.yOf(c.end - .7), { ms: 140, steps: 7 }); await G.wait(100); });
  const moved = await ed.evaluate(async () => { const c = __E.clips()[0], x0 = __E.view().lanes[c.t], y0 = __E.yOf(c.s + c.d / 2); G.down(x0, y0); await G.frame(() => __E.gesture() && __E.gesture().phase === 'buds', 4000); const tg = __E.buds()[2], dx = tg[0] - x0, dy = tg[1] - y0, L = Math.hypot(dx, dy); for (let k = 1; k <= 8 && !__S.move; k++) { G.move(x0 + dx / L * k * 12, y0 + dy / L * k * 12); await G.wait(15); } await G.wait(40); await G.to(__E.view().lanes[1], __E.yOf(2 + __S.move.g), { ms: 200, steps: 10 }); await G.wait(80); G.up(); await G.wait(120); return __E.clips()[0]; });
  const c3 = await cl(ed); checks.edited = c3.length === 1 && c3[0].t === 1 && c3[0].s > 1.7 && c3[0].s < 2.3 && c3[0].d < take.dur - .4; info.edited = c3;
  await page.waitForTimeout(300); await f.sw('metro'); await page.waitForTimeout(300); ed = await f.sw('edit'); await ed.waitForFunction(() => __S.ready && __E.clips().length, null, { timeout: 20000 }).catch(() => {});
  const c4 = await cl(ed); checks.editsSurviveLeaving = JSON.stringify(c4.map(c => [c.t, c.s, c.d])) === JSON.stringify(c3.map(c => [c.t, c.s, c.d]));
  // export
  const prop = await ed.evaluate(() => __E.view().prop); await ed.evaluate(async (p) => { await G.tap(p.x, p.y); await G.wait(350); }, prop); const save = await ed.evaluate(() => __E.bud(3));
  await page.mouse.click(save.x, save.y); await ed.waitForFunction(() => __E.mix().st === 'ready', null, { timeout: 15000 }).catch(() => {});
  const m1 = await ed.evaluate(() => __E.mix()), mixes = () => ed.evaluate(async () => (await AT.takes.list()).filter(t => t.kind === 'mix').map(t => ({ id: t.id, dur: t.dur })));
  const list1 = await mixes(), clipEnd = c4[0].end; checks.mixRendered = list1.length === 1 && lib.near(list1[0].dur, clipEnd, .02); info.mix = { m1, list1, clipEnd };
  const s0 = await ed.evaluate(async (id) => { const t = await AT.takes.get(id), r = (a, b) => { let e = 0; for (let i = a; i < b; i++) e += t.data[i] * t.data[i]; return Math.sqrt(e / (b - a)); }; return { head: r(0, 48000), body: r(96000, 96000 + 24000) }; }, list1[0].id); checks.mixHasTheClip = s0.head < 1e-4 && s0.body > .01; info.mixRms = s0;
  await page.mouse.click(save.x, save.y); await page.waitForTimeout(500); const sh = await ed.evaluate(() => window.__shares || []); checks.shared = sh.length === 1 && /wav/.test(sh[0].type) && sh[0].size > 44; info.sh = sh;
  await f.home(); ed = await f.open('edit'); await ed.waitForFunction(() => __S.ready, null, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(400);
  const p2 = await ed.evaluate(() => __E.view().prop); await ed.evaluate(async (p) => { await G.tap(p.x, p.y); await G.wait(350); }, p2); await page.mouse.click(save.x, save.y); await page.waitForTimeout(1500);
  const list2 = await mixes(); checks.noDuplicateMix = list2.length <= 1 + 0; checks.mixSurvives = list2.some(m => m.id === list1[0].id); info.list2 = list2;
  await page.screenshot({ path: `${dir}/end.png` });
  const errors = d.clean(page); await br.close(); checks.noErrors = !errors.length;
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info, errors });
};
