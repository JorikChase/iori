/* Synth Y11–Y13, Y15: the corners, and the garden.
   Y11 setups (top-right): tap steps Serum-style -> FM -> mono, each a different voice; hold + drag away picks on the dial
   Y12 layers (top-left): hold, walk the tree to drive, crush, filter or comb: the gene is set, the sound changes, a dot
       appears on the top edge; a tap on that dot turns the layer off, a tap on the corner bypasses them all
   Y13 gene spiral (bottom-right): hold the corner, go to a gene, rest, slide: up raises it; sideways lowers the gear
   Y15 the garden is saved every 2 s and comes back on open */
const d = require('../drive');
module.exports = async (lib) => {
  const dir = lib.outDir('synth-y-setups' + (lib.ENGINE === 'webkit' ? '-webkit' : '')), W = lib.VIEW.width, H = lib.VIEW.height, checks = {}, info = {};
  const SEED = { x: W / 2, y: Math.round(H * .56) }, RT = { x: W - 34, y: 34 }, RD = { x: 34, y: 34 }, RP = { x: W - 34, y: H - 34 }, RS = { x: W - 30, y: Math.round(H * .4) };
  const br = await lib.browser(); const page = await lib.open(br, 'synth', { wait: 300 }); await d.audioLog(page);
  const fresh = async () => { await page.evaluate(() => { localStorage.removeItem('seed-garden-v1'); AT.setTempo(120); }); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(600); await d.install(page, '#sb');
    await page.evaluate(({ x }) => { window.__placed = []; AT.place = (id) => { __placed.push(id); }; return G.tap(x, 150); }, { x: W / 2 }); await page.waitForTimeout(250); };
  await fresh();

  // Y11: voices by setup, oscillators a note
  const voice = async () => { await page.evaluate(() => { __OSC.length = 0; }); await page.waitForTimeout(800); return page.evaluate(() => { const by = {}; __OSC.forEach(o => { (by[o.t] = by[o.t] || []).push(o.type + ':' + o.f.toFixed(0)); }); const k = Object.keys(by).map(Number).sort((a, b) => a - b); return by[k[1]] ? by[k[1]].slice().sort() : []; }); };
  await page.evaluate(({ x, y }) => G.tap(x, y), SEED); await page.waitForFunction(() => __S.run, null, { timeout: 3000 }); await page.waitForTimeout(250);
  const v0 = await voice(), tapRT = () => page.evaluate(async ({ x, y }) => { await G.tap(x, y); await G.wait(80); return __S.setup; }, RT);
  const s1 = await tapRT(), v1 = await voice(), s2 = await tapRT(), v2 = await voice(), s3 = await tapRT();
  checks.Y11_threeSetups = s1 === 1 && s2 === 2 && s3 === 0 && v0.length === 3 && v1.length === 2 && v2.length === 2 && v0.filter(x => /square/.test(x)).length === 1 && !v1.some(x => /square/.test(x)) && v2.some(x => /square/.test(x)); info.voices = { v0, v1, v2 };
  // FM: the modulator at the ratio gene, 2 × the note
  checks.Y11_fmRatio = v1.length === 2 && lib.near(Math.max(...v1.map(x => +x.split(':')[1])) / Math.min(...v1.map(x => +x.split(':')[1])), 2, .02);
  const dial = await page.evaluate(async ({ x, y }) => { const o = {}; G.down(x, y); await G.frame(() => __S.dial, 900); o.open = !!__S.dial; await G.to(x - 75, y + 75, { ms: 120 }); await G.wait(60); o.idx = __S.dial && __S.dial.idx; G.up(); await G.wait(80); o.setup = __S.setup; G.down(x, y); await G.frame(() => __S.dial, 900); await G.wait(40); G.up(); await G.wait(80); o.heldStill = __S.setup; return o; }, RT);
  checks.Y11_dial = dial.open && dial.idx === 2 && dial.setup === 2 && dial.heldStill === 2; info.dial = dial;   // 106 px out = two steps
  await page.evaluate(({ x, y }) => G.tap(x, y), SEED); await page.waitForTimeout(450); await fresh();

  // Y12: walk the tree. The sound is read from what the synth itself captures: tap the right-edge dot, last two seconds of the take
  const measure = async () => { await page.waitForTimeout(2300); return page.evaluate(async (RS) => { const n0 = __placed.length; await G.tap(RS.x, RS.y); await G.frame(() => __placed.length > n0, 3000); const t = await AT.takes.get(__placed[__placed.length - 1]), n = Math.min(t.data.length, 2 * t.sr), a = t.data.subarray(t.data.length - n); let e = 0, f = 0; for (let i = 1; i < n; i++) { e += a[i] * a[i]; const q = a[i] - a[i - 1]; f += q * q; } return { rms: +Math.sqrt(e / n).toFixed(4), hf: +(Math.sqrt(f / n) * 1000).toFixed(2) }; }, RS); };   // hf: first difference, weights the highs
  const walk = (t, lvar, amtI) => page.evaluate(async ({ RD, t, lvar, amtI }) => { G.down(RD.x, RD.y); await G.frame(() => __S.open, 900); await G.wait(200);
    const go = async (n) => { await G.to(n.lp.x, n.lp.y, { ms: 170, steps: 8 }); await G.frame(() => __S.path[__S.path.length - 1] === n, 700); await G.wait(140); return __S.path[__S.path.length - 1] === n; };
    let n = __S.open.kids.find(k => k.v.ltype === t), ok = await go(n); if (lvar != null) { n = n.kids.find(k => k.v.lvar === lvar); ok = ok && await go(n); } n = n.kids[amtI]; ok = ok && await go(n); const path = __S.path.length; G.up(); await G.wait(120);
    return { ok, path, ldots: __S.ldots.map(l => l.t), layersOn: __S.layersOn }; }, { RD, t, lvar, amtI });
  await page.evaluate(({ x, y }) => G.tap(x, y), SEED); await page.waitForFunction(() => __S.run, null, { timeout: 3000 });
  const base = await measure(), layers = {};
  const off = (i) => page.evaluate(async (i) => { const L = __S.ldots[i]; await G.tap(L.x, L.y); await G.wait(100); return __S.ldots.map(l => l.t); }, i);
  for (const [t, lv, ai] of [['drive', 2, 3], ['crush', null, 3], ['filter', 0, 0], ['comb', null, 2]]) { const w = await walk(t, lv, ai), genes = await page.evaluate(() => ({ drvAmt: __SW.seed('drvAmt'), crush: __SW.seed('crush'), fltMix: __SW.seed('fltMix'), fltCut: __SW.seed('fltCut'), combMix: __SW.seed('combMix'), combF: __SW.seed('combF') }));
    const m = await measure(); await page.screenshot({ path: `${dir}/layer-${t}.png` }); const left = await off(0); layers[t] = { w, genes, m, left }; }
  info.layers = layers; info.base = base;
  const walked = Object.values(layers).every(l => l.w.ok && l.w.ldots.length === 1 && !l.left.length);
  checks.Y12_treeSetsLayer = walked && lib.near(layers.drive.genes.drvAmt, 100, 1) && lib.near(layers.crush.genes.crush, .9, .02) && layers.filter.genes.fltMix > .9 && lib.near(layers.filter.genes.fltCut, 200, 3) && layers.comb.genes.combMix > .5 && lib.near(layers.comb.genes.combF, 440, 3);
  const ch = (m, k) => Math.abs(m[k] - base[k]) / base[k];
  checks.Y12_soundChanges = layers.filter.m.hf < base.hf * .8 && layers.drive.m.hf > base.hf * 1.2 && layers.crush.m.hf > base.hf * 1.2 && ch(layers.comb.m, 'rms') > .1;
  const after = await measure(); checks.Y12_dotOffRestores = ch(after, 'rms') < .1 && ch(after, 'hf') < .1; info.after = after;
  // the corner tap bypasses every layer and keeps its settings
  const by = await (async () => { await walk('filter', 0, 0); await page.waitForTimeout(700);   /* the corner dot glides home from the open menu first */
    const m1 = await page.evaluate(async (RD) => { await G.tap(RD.x, RD.y); await G.wait(100); return { on: __S.layersOn, mix: __SW.seed('fltMix'), dots: __S.ldots.length }; }, RD); const m = await measure(); await page.evaluate(async (RD) => { await G.tap(RD.x, RD.y); await G.wait(100); }, RD); return { m1, m }; })();
  checks.Y12_cornerBypass = !by.m1.on && by.m1.mix > .9 && ch(by.m, 'hf') < .1; info.bypass = by;
  await page.evaluate(({ x, y }) => G.tap(x, y), SEED); await page.waitForTimeout(450); await fresh();

  // Y13: every gene has its own dot on screen, and sliding works with a gear
  const y13 = await page.evaluate(async (RP) => { const out = {}, N = __SW.GN0.length, I = __SW.GI, W = innerWidth, H = innerHeight;
    G.down(RP.x, RP.y); await G.frame(() => __S.sp, 900); out.sp = !!__S.sp; const miss = [], off = []; for (let i = 0; i < N; i++) { const q = __SW.gpos(i); if (q.x < 6 || q.y < 6 || q.x > W - 6 || q.y > H - 6) off.push(__SW.GN0[i].n); G.move(q.x, q.y); if (__S.sp.hv !== i) miss.push(__SW.GN0[i].n); await G.wait(20); }
    out.miss = miss; out.off = off;
    const q = __SW.gpos(I.sus), go = async () => { G.move(q.x, q.y); const t0 = performance.now(); await G.frame(() => __S.adj, 900); return performance.now() - t0; };
    await G.wait(30); out.dwell = await go(); const u0 = __S.seedU[I.sus]; await G.to(q.x, q.y - 48, { ms: 120, steps: 6 }); await G.wait(30); out.d1 = __S.seedU[I.sus] - u0; out.adjI = __S.adj && __S.adj.i;
    const u1 = __S.seedU[I.sus]; await G.to(q.x - 60, q.y - 48, { ms: 120, steps: 6 }); await G.wait(30); out.g = __S.adj && __S.adj.g; out.sideMoves = __S.seedU[I.sus] - u1; const u2 = __S.seedU[I.sus]; await G.to(q.x - 60, q.y - 96, { ms: 120, steps: 6 }); await G.wait(30); out.d2 = __S.seedU[I.sus] - u2; G.up(); await G.wait(100); out.closed = !__S.sp; return out; }, RP);
  await page.screenshot({ path: `${dir}/after-spiral.png` });
  checks.Y13_opens = y13.sp && !y13.off.length && !y13.miss.length; checks.Y13_restThenSlide = y13.dwell >= 300 && y13.dwell < 520 && lib.near(y13.d1, 48 / 240, .01); checks.Y13_gear = lib.near(y13.g, 1 / 3, .01) && lib.near(y13.d2, 48 / 240 / 3, .01) && Math.abs(y13.sideMoves) < .001 && y13.closed; info.y13 = y13;

  // Y15: each saved thing changes, the garden writes within 2 s, a reload restores it
  const set = await page.evaluate(async ({ SEED, RT, RD }) => { await G.tap(RT.x, RT.y); await G.wait(60); await G.tap(RD.x, RD.y); await G.wait(60); await G.tap(SEED.x, SEED.y, { ms: 30 }); await G.wait(90); await G.tap(SEED.x, SEED.y, { ms: 30 }); await G.wait(60);
    await G.drag(SEED.x, SEED.y, SEED.x - 110, SEED.y + 90, { ms: 140, lift: false }); await G.frame(() => __S.br && __S.br.atA, 1500); G.up(); await G.wait(60); await G.tap(__S.pk[0].x, __S.pk[0].y); await G.wait(60);
    await G.drag(SEED.x, SEED.y, SEED.x + 120, SEED.y - 120, { ms: 120 }); await G.wait(60);
    return { t: performance.now(), seed: __S.seedU.slice(), ph: __S.ph[0], setup: __S.setup, mute: __S.mute, layersOn: __S.layersOn, pk: __S.pk.map(k => ({ x: k.x, y: k.y, u: k.u, on: k.on })) }; }, { SEED, RT, RD });
  const savedIn = await page.evaluate(async (t) => { const seed = JSON.stringify(__S.seedU); await G.frame(() => { const g = JSON.parse(localStorage.getItem('seed-garden-v1') || 'null'); return g && JSON.stringify(g.seed) === seed; }, 3000); return performance.now() - t; }, set.t);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(600);
  const got = await page.evaluate(() => ({ seed: __S.seedU, ph: __S.ph[0], setup: __S.setup, mute: __S.mute, layersOn: __S.layersOn, pk: __S.pk.map(k => ({ x: k.x, y: k.y, u: k.u, on: k.on })) }));
  checks.Y15_savedWithin2s = savedIn < 2300; checks.Y15_restored = JSON.stringify(got.seed) === JSON.stringify(set.seed) && JSON.stringify(got.ph) === JSON.stringify(set.ph) && got.setup === 1 && got.mute === true && got.layersOn === false && got.pk.length === 1 && got.pk[0].x === set.pk[0].x && JSON.stringify(got.pk[0].u) === JSON.stringify(set.pk[0].u);
  checks.Y15_parkedComeBackOff = set.pk[0].on === true && got.pk[0].on === false; info.y15 = { savedIn: Math.round(savedIn), setup: got.setup, mute: got.mute, layersOn: got.layersOn, pk: got.pk.length };
  const errors = d.clean(page); await br.close(); checks.noErrors = !errors.length;
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info, errors });
};
