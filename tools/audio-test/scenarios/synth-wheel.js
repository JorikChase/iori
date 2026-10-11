/* Synth: the wheel as the exact way into a gene value (the slide stays the main control).
   Invocation: hold still on a numeric value (the dwell that starts the slide) and lift without sliding -> wheel.
   1. ladders: every numeric gene has a wheel built from its own range, labels unique; list genes have none
   2. spiral: hold the bottom-right dot, go to the filter cutoff, hold still, lift -> light wheel at the dot;
      spin with real drags to 1k (the sound previews while spinning), tap the band -> cut = 1000 Hz exactly
   3. amp category menu (left edge): hold, go to decay, hold still, lift -> wheel; spin to 500 ms, commit
   4. reload -> both values come back from the saved garden
   5. play (dark): spiral -> level wheel is dark; spin (preview changes the level), tap the x -> level unchanged
   6. the hold-and-slide still adjusts (sustain, slide up 60 px) and opens no wheel
   7. a list gene (filter type) held still and lifted opens no wheel and keeps its value */
module.exports = async (lib) => {
  const dir = lib.outDir('synth-wheel' + (lib.ENGINE === 'webkit' ? '-webkit' : '')); const W = lib.VIEW.width, H = lib.VIEW.height;
  const RP = { x: W - 34, y: H - 34 }, SEED = { x: W / 2, y: Math.round(H * .56) };
  const br = await lib.browser(); const page = await lib.open(br, 'synth', { wait: 800 }); const shots = [];
  const shot = async (n) => { const f = `${dir}/${n}.png`; await page.screenshot({ path: f }); shots.push(f); };
  await page.evaluate(() => localStorage.removeItem('seed-garden-v1')); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(800);
  const gi = (n) => page.evaluate((n) => __SW.GI[n], n);
  const seedU = (n) => page.evaluate((n) => __S.seedU[__SW.GI[n]], n);
  const seedV = (n) => page.evaluate((n) => __SW.seed(n), n);
  const wheelOpen = () => page.evaluate(() => !!(window.Wheel && Wheel.active()));
  const wstate = () => page.evaluate(() => { const w = Wheel.active(); return w && Object.assign(w.state(), { light: !!w.o.light, items: w.cols[0].items.length }); });
  const glide = async (a, b, steps = 8, ms = 22) => { for (let k = 1; k <= steps; k++) { await page.mouse.move(a.x + (b.x - a.x) * k / steps, a.y + (b.y - a.y) * k / steps); await page.waitForTimeout(ms); } };

  // 1. ladders
  const ladders = await page.evaluate(() => __SW.GN0.map((g, i) => { const L = __SW.ladder(i); if (!L) return { n: g.n, list: true };
    const labs = L.map(v => __SW.fmt(i, v)); return { n: g.n, steps: L.length, first: labs[0], last: labs[labs.length - 1], unique: new Set(labs).size === labs.length,
      glyphs: labs.every(s => /^[0-9.\-k]+$/.test(s)), ends: Math.abs(L[0] - g.lo) < 1e-9 && Math.abs(L[L.length - 1] - g.hi) < 1e-9 * Math.max(1, g.hi), sample: labs.slice(0, 4).concat(['…'], labs.slice(-3)) }; }));
  const numeric = ladders.filter(l => !l.list), lists = ladders.filter(l => l.list).map(l => l.n);

  // spiral gesture: hold the corner dot, glide to gene i, hold still (dwell), then either lift or slide
  const spiralTo = async (name) => { const i = await gi(name); const q = await page.evaluate((i) => __SW.gpos(i), i);
    await page.mouse.move(RP.x, RP.y); await page.mouse.down(); await page.waitForTimeout(420);
    await page.mouse.move(q.x, q.y); await page.waitForTimeout(650);   // one move: the harness's input is slow (~350 ms a move), a glide would dwell on the genes it crosses
    return { i, q, adj: await page.evaluate(() => __S.adj && { i: __S.adj.i, path: !!__S.adj.path }) }; };
  // spin the open wheel to row `target` with real drags (<= 3 rows a stroke, released still -> snap), then report
  const spinTo = async (target, onStroke) => { for (let n = 0; n < 12; n++) { const s = await wstate(); const cur = s.cols[0].idx; if (cur === target) return true;
      const rows = Math.max(-3, Math.min(3, target - cur)), x = s.cols[0].x, y = rows < 0 ? s.rect.top + 8 : s.rect.top + s.rect.h - 8;   // room for the stroke inside the viewport
      await page.mouse.move(x, y); await page.mouse.down(); await glide({ x, y }, { x, y: y - rows * s.rowH }, 4, 25); await page.waitForTimeout(160); await page.mouse.up(); await page.waitForTimeout(450);
      if (onStroke) await onStroke(); }
    return (await wstate()).cols[0].idx === target; };
  const tapBand = async () => { const s = await wstate(); await page.mouse.click(s.cols[0].x, s.bandY); await page.waitForTimeout(500); };
  const idxOf = (name, v) => page.evaluate(([n, v]) => { const L = __SW.ladder(__SW.GI[n]); let b = 0; L.forEach((x, k) => { if (Math.abs(x - v) < Math.abs(L[b] - v)) b = k; }); return { k: b, v: L[b] }; }, [name, v]);

  await shot('0-rest');
  // 2. spiral -> filter cutoff -> 1 kHz
  const cut0 = await seedV('cut');
  const sp1 = await spiralTo('cut'); await shot('1-spiral-dwell-cut');
  await page.mouse.up(); await page.waitForTimeout(450);
  const w1 = await wstate(); const wh1 = await page.evaluate(() => __S.wh && { gi: __S.wh.gi, sp: __S.wh.sp, lab: __S.wh.lab });
  await shot('2-cut-wheel-open');
  const tCut = await idxOf('cut', 1000); const previews = [];
  const okCut = await spinTo(tCut.k, async () => previews.push(+(await page.evaluate(() => __SW.gv('cut'))).toFixed(1)));
  await shot('3-cut-wheel-at-1k');
  await tapBand(); const cut1 = await seedV('cut'); const cutOpenAfter = await wheelOpen();
  await page.waitForTimeout(300); await shot('4-cut-committed');

  // 3. amp category menu -> decay -> 500 ms
  const dec0 = await seedV('dec');
  const AMP = { x: 26, y: Math.round(H * .3) + 2 * Math.round(H * .105) };
  await page.mouse.move(AMP.x, AMP.y); await page.mouse.down(); await page.waitForTimeout(450);
  const kid = await page.evaluate((g) => { const k = __S.open && __S.open.kids.find(k => k.gi === g); return k && { x: k.lp.x, y: k.lp.y, root: __S.open.lp }; }, await gi('dec'));
  let menu = null;
  if (kid) { await page.mouse.move(kid.x, kid.y); await page.waitForTimeout(650);
    menu = await page.evaluate(() => ({ path: __S.path.length, adj: __S.adj && { k: __S.adj.k, path: !!__S.adj.path } })); }
  await shot('5-amp-menu-dwell-decay');
  await page.mouse.up(); await page.waitForTimeout(450);
  const w2 = await wstate(); const wh2 = await page.evaluate(() => __S.wh && { gi: __S.wh.gi, lab: __S.wh.lab });
  await shot('6-decay-wheel-open');
  const tDec = await idxOf('dec', .5); const okDec = await spinTo(tDec.k);
  await tapBand(); const dec1 = await seedV('dec'); await page.waitForTimeout(300); await shot('7-decay-committed');

  // 4. reload: the garden keeps both
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(900);
  const saved = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('seed-garden-v1') || 'null'); return { cut: __SW.seed('cut'), dec: __SW.seed('dec'), stored: !!d }; });

  // 5. playing (dark): level wheel, spin, cancel with the x
  await page.mouse.click(SEED.x, SEED.y);
  await page.waitForFunction(() => __S.run && __S.ctx && __S.ctx.state === 'running', null, { timeout: 6000 }); await page.waitForTimeout(900);
  const lvU0 = await seedU('level');
  await spiralTo('level'); await page.mouse.up(); await page.waitForTimeout(450);
  const w3 = await wstate(); const lvl = [];
  const s3 = w3 && w3.cols[0].idx; if (w3) await spinTo(Math.max(0, s3 - 6), async () => lvl.push(+(await page.evaluate(() => __SW.gv('level'))).toFixed(2)));
  await shot('8-level-wheel-dark-spun');
  const w3b = await wstate(); if (w3b) { await page.mouse.click(w3b.cancel.x, w3b.cancel.y); await page.waitForTimeout(500); }
  const lvU1 = await seedU('level'); const lvDone = await page.evaluate(() => __S.wh); await shot('9-level-cancelled');
  await page.mouse.click(SEED.x, SEED.y); await page.waitForTimeout(800);   // stop

  // 6. hold-and-slide still works
  const susU0 = await seedU('sus');
  const sp6 = await spiralTo('sus'); await glide(sp6.q, { x: sp6.q.x, y: sp6.q.y - 60 }, 10, 25); await page.waitForTimeout(120);
  await shot('10-sustain-slide'); await page.mouse.up(); await page.waitForTimeout(450);
  const susU1 = await seedU('sus'); const slideWheel = await wheelOpen();

  // 7. a list gene opens no wheel
  const ftU0 = await seedU('ftype');
  const sp7 = await spiralTo('ftype'); await page.mouse.up(); await page.waitForTimeout(450);
  const listWheel = await wheelOpen(); const ftU1 = await seedU('ftype');

  await lib.sheet(br, shots, `${dir}/sheet.png`, 4, 200);
  const errors = page.errors.filter(e => !/serviceworker|service worker/i.test(e)); await br.close();
  const checks = {
    laddersNumeric24: numeric.length === 24, laddersUnique: numeric.every(l => l.unique), laddersGlyphs: numeric.every(l => l.glyphs), laddersEnds: numeric.every(l => l.ends),
    listsHaveNone: lists.length === 7,
    spiralDwellCut: !!sp1.adj && sp1.adj.i === sp1.i && !sp1.adj.path,
    cutWheelOpens: !!w1 && !!wh1 && wh1.gi === sp1.i && wh1.sp && w1.light, cutWheelStartsAtValue: !!wh1 && wh1.lab === '2.4k',
    cutPreviewWhileSpinning: previews.length > 0 && previews.some(v => v !== cut0), cutSpun: okCut,
    cutExact: Math.abs(cut1 - 1000) < 1e-6, cutWheelClosed: !cutOpenAfter,
    menuDwellDecay: !!menu && menu.path === 2 && !!menu.adj && menu.adj.k === 'dec' && menu.adj.path,
    decWheelOpens: !!w2 && !!wh2 && wh2.lab === '250', decSpun: okDec, decExact: Math.abs(dec1 - .5) < 1e-9,
    savedAfterReload: saved.stored && Math.abs(saved.cut - 1000) < 1e-6 && Math.abs(saved.dec - .5) < 1e-9,
    darkWheelWhilePlaying: !!w3 && !w3.light, levelPreviewWhileSpinning: lvl.length > 0 && lvl.some(v => Math.abs(v - (-12)) > .01),
    cancelLeavesValue: lvU1 === lvU0 && !lvDone,
    slideStillAdjusts: susU1 > susU0 + .15 && !slideWheel, listGeneNoWheel: !!sp7.adj && sp7.adj.i === sp7.i && !listWheel && ftU1 === ftU0,
    noErrors: !errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, engine: lib.ENGINE,
    cut: { cut0, cut1, target: tCut, previews, wheel: w1 && { rect: w1.rect, items: w1.items, light: w1.light } },
    dec: { dec0, dec1, target: tDec, menu, kid, wheel: w2 && { rect: w2.rect, items: w2.items } },
    saved, level: { lvU0, lvU1, previews: lvl, light: w3 && w3.light }, sus: { susU0, susU1 }, ftype: { ftU0, ftU1, adj: sp7.adj },
    ladders, lists, shots, errors });
};
