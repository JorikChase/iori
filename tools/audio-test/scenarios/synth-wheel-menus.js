/* Synth: the wheel on the values in the path menus (the same still-hold-then-lift rule as the gene spiral).
   1. centre menu: hold the seed, sine -> 440 -> hold still on 440 and lift -> base wheel at 440 (semitones);
      one row up -> 466 = 440·2^(1/12) exactly, wave = sine (the path is applied too)
   2. layers menu (top-left): filter -> circle -> 2000, hold still, lift -> cutoff wheel at 2k (E24) -> 2.2k;
      the filter layer is on with cutoff 2200 Hz
   3. layers menu: crush -> 6, hold still, lift -> bits wheel 2..12 at 6 -> 10; crush = 10 bits
   4. osc category menu: the wave gene (a list of picks) held still and lifted opens no wheel, value unchanged
   5. reload: base, filter cutoff and crush come back from the saved garden */
module.exports = async (lib) => {
  const dir = lib.outDir('synth-wheel-menus' + (lib.ENGINE === 'webkit' ? '-webkit' : '')); const W = lib.VIEW.width, H = lib.VIEW.height;
  const SEED = { x: W / 2, y: Math.round(H * .56) }, RD = { x: 34, y: 34 }, OSC = { x: 26, y: Math.round(H * .3) };
  const br = await lib.browser(); const page = await lib.open(br, 'synth', { wait: 800 }); const shots = [];
  const shot = async (n) => { const f = `${dir}/${n}.png`; await page.screenshot({ path: f }); shots.push(f); };
  await page.evaluate(() => localStorage.removeItem('seed-garden-v1')); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(800);
  const wstate = () => page.evaluate(() => { const w = Wheel.active(); return w && Object.assign(w.state(), { light: !!w.o.light, items: w.cols[0].items.length, lab: __S.wh && __S.wh.lab }); });
  const glide = async (a, b, steps, ms = 25) => { for (let k = 1; k <= steps; k++) { await page.mouse.move(a.x + (b.x - a.x) * k / steps, a.y + (b.y - a.y) * k / steps); await page.waitForTimeout(ms); } };
  // walk a path menu: press the root, wait for it to open, then step onto the kid matching each predicate (one move each)
  const walk = async (root, picks) => { await page.mouse.move(root.x, root.y); await page.mouse.down(); await page.waitForTimeout(450);
    for (const pick of picks) { const k = await page.evaluate((src) => { const f = eval(src), a = __S.path[__S.path.length - 1], k = a && a.kids.find(f); return k && { x: k.lp.x, y: k.lp.y }; }, pick);
      if (!k) return false; await page.mouse.move(k.x, k.y); await page.waitForTimeout(260); }
    await page.waitForTimeout(500); return page.evaluate(() => ({ path: __S.path.length, adj: __S.adj && { k: __S.adj.k, path: !!__S.adj.path } })); };
  const spinTo = async (target) => { for (let n = 0; n < 12; n++) { const s = await wstate(); const cur = s.cols[0].idx; if (cur === target) return true;
      const rows = Math.max(-3, Math.min(3, target - cur)), x = s.cols[0].x, y = rows < 0 ? s.rect.top + 8 : s.rect.top + s.rect.h - 8;
      await page.mouse.move(x, y); await page.mouse.down(); await glide({ x, y }, { x, y: y - rows * s.rowH }, 4); await page.waitForTimeout(160); await page.mouse.up(); await page.waitForTimeout(450); }
    return (await wstate()).cols[0].idx === target; };
  const tapBand = async () => { const s = await wstate(); await page.mouse.click(s.cols[0].x, s.bandY); await page.waitForTimeout(500); };
  const genes = () => page.evaluate(() => ({ wave: __SW.seed('wave'), base: __SW.seed('base'), fltCut: __SW.seed('fltCut'), fltMix: __SW.seed('fltMix'), fltType: __SW.seed('fltType'), crushU: __S.seedU[__SW.GI.crush] }));

  // 1. centre menu -> base
  const m1 = await walk(SEED, ["k => k.v.wave === 'sine'", 'k => k.v.base === 440']);
  await shot('1-centre-menu-dwell-440'); await page.mouse.up(); await page.waitForTimeout(450);
  const w1 = await wstate(); await shot('2-base-wheel-open');
  const ok1 = w1 ? await spinTo(w1.cols[0].idx + 1) : false; await tapBand(); const g1 = await genes(); await shot('3-base-committed');

  // 2. layers menu -> filter -> circle -> 2000
  const m2 = await walk(RD, ["k => k.v.ltype === 'filter'", 'k => k.v.lvar === 0', 'k => k.v.amt === 2000']);
  await shot('4-layers-dwell-2000'); await page.mouse.up(); await page.waitForTimeout(450);
  const w2 = await wstate(); await shot('5-filter-wheel-open');
  const ok2 = w2 ? await spinTo(w2.cols[0].idx + 1) : false; await tapBand(); const g2 = await genes(); await shot('6-filter-committed');

  // 3. layers menu -> crush -> 6 bits
  const m3 = await walk(RD, ["k => k.v.ltype === 'crush'", 'k => k.v.amt === 6']);
  await page.mouse.up(); await page.waitForTimeout(450);
  const w3 = await wstate(); await shot('7-crush-wheel-open');
  const ok3 = w3 ? await spinTo(8) : false; await tapBand(); const g3 = await genes();

  // 4. osc category: the wave gene is a list -> no wheel
  const m4 = await walk(OSC, ['k => k.gi === 0']); const waveU0 = await page.evaluate(() => __S.seedU[0]);
  await page.mouse.up(); await page.waitForTimeout(450);
  const listWheel = await page.evaluate(() => !!Wheel.active()); const waveU1 = await page.evaluate(() => __S.seedU[0]);

  // 5. reload
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(900); const g5 = await genes(); await shot('8-after-reload');
  await lib.sheet(br, shots, `${dir}/sheet.png`, 4, 200);
  const errors = page.errors.filter(e => !/serviceworker|service worker/i.test(e)); await br.close();
  const A4s = 440 * Math.pow(2, 1 / 12);
  const checks = {
    centreDwell: !!m1 && m1.path === 3 && !!m1.adj && m1.adj.k === 'base', baseWheelAt440: !!w1 && w1.lab === '440' && w1.items === 49 && w1.light,
    baseSemitone: ok1 && Math.abs(g1.base - A4s) < 1e-6 && g1.wave === 'sine',
    layersDwell: !!m2 && m2.path === 4 && !!m2.adj && m2.adj.k === 'amt', filterWheelAt2k: !!w2 && w2.lab === '2k' && w2.items === 54,
    filterExact: ok2 && Math.abs(g2.fltCut - 2200) < 1e-6 && g2.fltMix > .99 && g2.fltType === 0,
    crushDwell: !!m3 && m3.path === 3 && !!m3.adj && m3.adj.k === 'amt', crushWheelAt6: !!w3 && w3.lab === '6' && w3.items === 11,
    crushExact: ok3 && Math.abs(g3.crushU - .2) < 1e-9,
    listGeneNoWheel: !!m4 && !!m4.adj && m4.adj.k === 'wave' && !listWheel && waveU1 === waveU0,
    savedAfterReload: Math.abs(g5.base - A4s) < 1e-6 && Math.abs(g5.fltCut - 2200) < 1e-6 && Math.abs(g5.crushU - .2) < 1e-9,
    noErrors: !errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, engine: lib.ENGINE, m1, m2, m3, m4, w1, w2, w3, g1, g2, g3, g5, waveU0, waveU1, shots, errors });
};
