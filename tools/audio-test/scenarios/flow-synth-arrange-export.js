/* Synth capture -> place -> arrange -> export, inside the shell, leaving and returning.
   Play the seed 12 s, hold the right-edge dot, drag down to 10 s, release: the editor opens with a 'synth' clip. Back to
   the synth (the garden is there, playing starts again), a tap on the dot places the last stretch: a second clip. Copy
   the first, move the copy after the second, away and back, save: the mix ends with the last clip and it is not silent. */
const d = require('../drive'); const { kit, SLOW } = require('../flowkit');
module.exports = async (lib) => {
  const dir = lib.outDir('flow-synth-arrange-export' + (lib.ENGINE === 'webkit' ? '-webkit' : '')), W = lib.VIEW.width, H = lib.VIEW.height, checks = {}, info = {};
  const br = await lib.browser(); const page = await lib.open(br, 'shell', { wait: 600 }); await page.addInitScript(SLOW); await page.evaluate(() => { localStorage.removeItem('seed-garden-v1'); localStorage.setItem('audio.tempo', '120'); }); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1000); const f = await kit(lib, page);
  const SEED = { x: W / 2, y: Math.round(H * .56) }, RS = { x: W - 30, y: Math.round(H * .4) }, y0 = RS.y + 24, len = H - 110 - y0, ySec = (s) => y0 + Math.sqrt(s / 240) * len;
  const start = async (sy) => { await sy.evaluate(({ x }) => G.tap(x, 150), SEED); await page.waitForTimeout(350); await sy.evaluate(({ x, y }) => G.tap(x, y), SEED); await sy.waitForFunction(() => __S.run && __S.ctx && __S.ctx.state === 'running', null, { timeout: 20000 }); };
  let sy = await f.open('synth'); await start(sy);
  const mutated = await sy.evaluate(async ({ x, y }) => { await G.drag(x, y, x + 90, y - 110, { ms: 140, steps: 8 }); await G.wait(120); return JSON.stringify(__S.seedU); }, SEED);   // a planted branch: the sound to keep
  await page.waitForTimeout(12000);
  await sy.evaluate(async ({ RS, y }) => { G.down(RS.x, RS.y); await G.wait(100); await G.to(RS.x + 2, y, { ms: 240, steps: 10 }); await G.wait(150); G.up(); }, { RS, y: ySec(10) });
  await f.inTool('edit'); await page.waitForTimeout(700); let ed = await f.G('edit'); await ed.waitForFunction(() => __S.ready && __E.clips().length === 1 && __E.clips()[0].ready, null, { timeout: 20000 }).catch(() => {});
  const cl = (e) => e.evaluate(() => __E.clips().map(c => ({ id: c.id, k: c.k, t: c.t, s: +c.s.toFixed(3), d: +c.d.toFixed(3), end: +c.end.toFixed(3) })));
  const c1 = await cl(ed), meta1 = await ed.evaluate(async (k) => (await AT.takes.list()).find(t => t.id === k), c1[0] && c1[0].k); checks.placed = c1.length === 1 && meta1.kind === 'synth' && lib.near(c1[0].d, 10, .3); info.c1 = c1;
  // the playhead where the second one should land: the bar after the first clip
  await ed.evaluate(async (end) => { const x = __E.view().lanes[1]; await G.tap(x, __E.yOf(end + .5)); await G.wait(120); }, c1[0].end); const ph = await ed.evaluate(() => __E.state().ph);
  sy = await f.sw('synth'); const back = await sy.evaluate(() => JSON.stringify(__S.seedU)); checks.gardenSurvivesLeaving = back === mutated;
  await start(sy); await page.waitForTimeout(3500); await sy.evaluate(({ x, y }) => G.tap(x, y), RS);
  await f.inTool('edit'); await page.waitForTimeout(700); ed = await f.G('edit'); await ed.waitForFunction(() => __S.ready && __E.clips().length === 2, null, { timeout: 20000 }).catch(() => {}); const c2 = await cl(ed); info.c2 = c2;
  checks.secondPlaced = c2.length === 2 && lib.near(c2[1].s, ph, .3) && c2[1].d > 2.5 && c2[1].d < 12; checks.playheadSurvives = lib.near(await ed.evaluate(() => __E.state().ph), ph, .01);
  // copy the first clip (bud 1), then the copy is moved after the second
  const copied = await ed.evaluate(async () => { const c = __E.clips()[0], x0 = __E.view().lanes[c.t], y0 = __E.yOf(c.s + c.d / 2); G.down(x0, y0); await G.frame(() => __E.gesture() && __E.gesture().phase === 'buds', 4000); const tg = __E.buds()[1], dx = tg[0] - x0, dy = tg[1] - y0, L = Math.hypot(dx, dy); await G.to(x0 + dx / L * 60, y0 + dy / L * 60, { ms: 100, steps: 5 }); await G.wait(40); G.up(); await G.wait(300); return __E.clips().length; });
  const c3 = await cl(ed); checks.copied = copied === 3 && c3.filter(c => c.k === c2[0].k).length === 2; info.c3 = c3;
  await f.home(); ed = await f.open('edit'); await ed.waitForFunction(() => __S.ready && __E.clips().length === 3, null, { timeout: 20000 }).catch(() => {}); const c4 = await cl(ed); checks.arrangementSurvives = JSON.stringify(c4.map(c => [c.t, c.s, c.d])) === JSON.stringify(c3.map(c => [c.t, c.s, c.d]));
  const prop = await ed.evaluate(() => __E.view().prop); await ed.evaluate(async (p) => { await G.tap(p.x, p.y); await G.wait(350); }, prop); const save = await ed.evaluate(() => __E.bud(3)); await page.mouse.click(save.x, save.y); await ed.waitForFunction(() => __E.mix().st === 'ready', null, { timeout: 20000 }).catch(() => {});
  const lastEnd = Math.max(...c4.map(c => c.end)), mix = await ed.evaluate(async () => { const m = (await AT.takes.list()).find(t => t.kind === 'mix'); if (!m) return null; const t = await AT.takes.get(m.id); let e = 0; for (let i = 0; i < t.data.length; i++) e += t.data[i] * t.data[i]; return { dur: t.dur, rms: Math.sqrt(e / t.data.length) }; });
  checks.mixEndsWithLastClip = !!mix && lib.near(mix.dur, lastEnd, .03); checks.mixNotSilent = !!mix && mix.rms > .005; info.mix = { mix, lastEnd };
  await page.screenshot({ path: `${dir}/end.png` });
  const errors = d.clean(page); await br.close(); checks.noErrors = !errors.length;
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info, errors });
};
