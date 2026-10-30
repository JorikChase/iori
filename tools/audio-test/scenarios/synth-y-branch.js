/* Synth Y5–Y10: branches.
   Y5 a drag out of the seed grows a branch: length sets how far, direction which genes, and it sounds while it grows
   Y6 a rest of about 450 ms leaves an anchor; a shorter rest none; a rest at the very start none; four at most
   Y7 release at an anchor parks (six at most, the oldest goes); release while moving plants it as the new seed; a short
      release does neither
   Y8 parked tap: off -> on + focused -> (focused elsewhere: focus) -> off; a first tap starts the music
   Y9 dragging a parked branch re-mutates it; dropped on the seed it is removed
   Y10 what is picked stands out: the growing branch in its own colour, the focused parked branch alone has a ring,
       the picked menu value alone takes the category colour */
const d = require('../drive');
module.exports = async (lib) => {
  const dir = lib.outDir('synth-y-branch' + (lib.ENGINE === 'webkit' ? '-webkit' : '')), W = lib.VIEW.width, H = lib.VIEW.height, checks = {}, info = {}, DPR = lib.DPR;
  const SEED = { x: W / 2, y: Math.round(H * .56) };
  const br = await lib.browser(); const page = await lib.open(br, 'synth', { wait: 300 }); await d.audioLog(page);
  const fresh = async () => { await page.evaluate(() => { localStorage.removeItem('seed-garden-v1'); AT.setTempo(120); }); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(600); await d.install(page, '#sb');
    await page.evaluate(({ x, SEED }) => { window.SEED = SEED; G.grow = async (ang, dist, o = {}) => { await G.drag(SEED.x, SEED.y, SEED.x + Math.cos(ang) * dist, SEED.y + Math.sin(ang) * dist, { ms: 140, lift: false, ...o }); };
      G.park = async (ang, dist) => { await G.grow(ang, dist); const ok = await G.frame(() => __S.br && __S.br.atA, 1500); G.up(); await G.wait(30); return !!ok; };
      return G.tap(x, 150); }, { x: W / 2, SEED }); await page.waitForTimeout(250); };
  const dist = (a, b) => a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0);
  await fresh();

  // Y5
  const y5 = await page.evaluate(async () => { const out = {}, seed = __S.seedU.slice();
    const at = async (ang, L) => { await G.grow(ang, L); await G.wait(60); const b = __S.br, r = b && { m: b.m, u: b.u.slice(), aud: __S.aud, col: b.col.slice(), base: __SW.gv('base') }; G.cancel(); await G.wait(60); return r; };
    out.e1 = await at(0, 70); out.e2 = await at(0, 200); out.e2b = await at(0, 200); out.n = await at(-Math.PI / 2, 200); out.seed = seed; out.after = __S.seedU.slice(); out.left = !!__S.br; return out; });
  const nGenes = (a, b) => a.filter((x, i) => Math.abs(x - b[i]) > 1e-4).length;
  checks.Y5_grows = !!y5.e1 && !!y5.e2 && y5.e2.m > y5.e1.m + .4 && lib.near(y5.e2.m, (200 - 38) / 210, .02) && dist(y5.e2.u, y5.seed) > dist(y5.e1.u, y5.seed);
  checks.Y5_directionDecides = dist(y5.e2.u, y5.n.u) > .5 && nGenes(y5.e2.u, y5.seed) > 20 && dist(y5.e2.u, y5.e2b.u) < 1e-6;
  checks.Y5_cancelLeavesSeed = dist(y5.seed, y5.after) === 0 && !y5.left;
  info.y5 = { m: [y5.e1.m, y5.e2.m].map(x => +x.toFixed(3)), genes: nGenes(y5.e2.u, y5.seed), eVsN: +dist(y5.e2.u, y5.n.u).toFixed(2) };
  // ... and it sounds, with the seed stopped
  const aud = await page.evaluate(async () => { __OSC.length = 0; await G.grow(0, 200); await G.wait(900); const base = __SW.gv('base'), r = { aud: __S.aud, run: __S.run, notes: __OSC.length, base, heard: __OSC.some(o => [0, 12, 7, 3, 10].some(s => Math.abs(o.f / (base * Math.pow(2, s / 12)) - 1) < .001)) }; G.cancel(); return r; });
  checks.Y5_sounds = aud.aud && !aud.run && aud.notes > 3 && aud.heard; info.aud = aud;

  // Y6: time of the anchor, from the last move
  await page.waitForTimeout(200);
  const y6 = await page.evaluate(async () => { const out = {};
    await G.grow(0, 120); const t0 = __S.br.dw.t; await G.frame(() => __S.br && __S.br.an.length === 2, 1500); out.ms = performance.now() - t0; out.an = __S.br.an.length; out.at = __S.br.an[1] && __S.br.an[1].p.x - SEED.x; G.cancel(); await G.wait(60);
    await G.grow(0, 120); await G.wait(300); out.short = __S.br.an.length; await G.to(SEED.x + 170, SEED.y); await G.wait(300); out.short2 = __S.br.an.length; G.cancel(); await G.wait(60);
    await G.grow(0, 44); await G.wait(800); out.nearSeed = __S.br.an.length; G.cancel(); await G.wait(60);
    // small tremor (< 5 px) does not reset the rest
    await G.grow(0, 120); const t1 = __S.br.dw.t; for (let k = 0; k < 8; k++) { G.move(SEED.x + 120 + (k % 2) * 3, SEED.y); await G.wait(60); if (__S.br.an.length > 1) break; } await G.frame(() => __S.br.an.length > 1, 800); out.tremor = performance.now() - t1; G.cancel(); await G.wait(60);
    // four anchors at most
    await G.grow(0, 80); let x = SEED.x + 80, y = SEED.y; for (let k = 0; k < 6; k++) { await G.frame(() => __S.br.atA, 900); await G.wait(40); y -= 60; x -= 40; await G.to(x, y, { ms: 90, steps: 4 }); } await G.wait(600); out.maxAn = __S.br.an.length - 1; G.cancel(); return out; });
  checks.Y6_restAnchors = y6.an === 2 && y6.ms >= 450 && y6.ms < 600 && lib.near(y6.at, 120, 1); checks.Y6_shortRestNone = y6.short === 1 && y6.short2 === 1; checks.Y6_nearSeedNone = y6.nearSeed === 1;
  checks.Y6_tremorKeepsRest = y6.tremor < 620; checks.Y6_fourMax = y6.maxAn === 4; info.y6 = y6;

  // Y7
  await fresh();
  const y7 = await page.evaluate(async () => { const out = {}, seed = __S.seedU.slice(), diff = (a, b) => a.some((x, i) => Math.abs(x - b[i]) > 1e-4);
    out.parked = await G.park(.6, 150); await G.wait(80); const k = __S.pk[0]; out.park = { n: __S.pk.length, seedSame: !diff(seed, __S.seedU), on: k && k.on, gen: __S.gen, x: k && k.x - SEED.x, y: k && k.y - SEED.y };
    await G.grow(2.4, 60, { ms: 80 }); await G.wait(20); G.up(); await G.wait(60); out.short = { same: !diff(seed, __S.seedU), n: __S.pk.length, gen: __S.gen };
    await G.grow(2.4, 180, { ms: 120 }); const u = __S.br.u.slice(); G.up(); await G.wait(60); out.plant = { took: !diff(u, __S.seedU), changed: diff(seed, __S.seedU), gen: __S.gen, n: __S.pk.length, br: !!__S.br };
    const a0 = __S.pk[0].id, ok = []; for (let k = 0; k < 6; k++) { ok.push(await G.park(-2.9 + k * .95, 170)); await G.wait(60); }
    const live = __S.pk.filter(p => !p.dead); out.seven = { ok, live: live.length, firstGone: !live.some(p => p.id === a0) }; await G.wait(700); out.seven.kept = __S.pk.length; return out; });
  checks.Y7_parks = y7.parked && y7.park.n === 1 && y7.park.seedSame && y7.park.on === false && y7.park.gen === 0;
  checks.Y7_shortDoesNothing = y7.short.same && y7.short.n === 1 && y7.short.gen === 0; checks.Y7_plants = y7.plant.took && y7.plant.changed && y7.plant.gen === 1 && y7.plant.n === 1;
  checks.Y7_sixMax = y7.seven.ok.every(Boolean) && y7.seven.live === 6 && y7.seven.firstGone && y7.seven.kept === 6; info.y7 = y7;
  await page.waitForTimeout(300); const f7 = `${dir}/six-parked.png`; await page.screenshot({ path: f7 });

  // Y8, Y10 (ring), Y9
  await fresh();
  const pk0 = await page.evaluate(async () => { await G.park(.5, 150); await G.park(2.6, 150); await G.park(-1.1, 170); await G.wait(350); return __S.pk.map(k => ({ id: k.id, x: k.x, y: k.y, col: k.col, base: __SW.val(__SW.GI.base, k.u[__SW.GI.base]) })); });
  const tap = (i) => page.evaluate(async (k) => { await G.tap(k.x, k.y); await G.wait(50); const a = __S.pk.map(p => ({ on: p.on, act: __S.act === p })); return { a, run: __S.run }; }, pk0[i]);
  const s1 = await tap(0), s2 = await tap(1), s3 = await tap(0), s4 = await tap(0);
  checks.Y8_offToOnFocused = s1.a[0].on && s1.a[0].act && s1.run; checks.Y8_secondTakesFocus = s2.a[1].on && s2.a[1].act && s2.a[0].on && !s2.a[0].act;
  checks.Y8_tapFocusesOther = s3.a[0].on && s3.a[0].act && s3.a[1].on; checks.Y8_focusedTapOff = !s4.a[0].on && !s4.a[0].act && s4.a[1].on; info.y8 = [s1.a[0], s2.a[1], s3.a[0], s4.a[0]];
  // two on, seed muted: both parked are heard; the off one and the seed are not
  const heard = await page.evaluate(async (pk) => { await G.tap(pk[0].x, pk[0].y); await G.wait(60); await G.tap(SEED.x, SEED.y, { ms: 30 }); await G.wait(90); await G.tap(SEED.x, SEED.y, { ms: 30 }); await G.wait(300); __OSC.length = 0; await G.wait(1100);
    const m = (b) => __OSC.some(o => [0, 12, 7, 3, 10].some(s => Math.abs(o.f / (b * Math.pow(2, s / 12)) - 1) < .001)); return { mute: __S.mute, a: m(pk[0].base), b: m(pk[1].base), c: m(pk[2].base), n: __OSC.length }; }, pk0);
  checks.Y8_onesAreHeard = heard.mute && heard.a && heard.b; info.heard = heard; info.bases = pk0.map(k => +k.base.toFixed(1));
  await page.waitForTimeout(200);
  // Y10: exactly one ring, on the focused branch. The ring sits 6 px off the dot's rim
  const rg = await page.evaluate(() => __S.pk.map(k => ({ x: k.x, y: k.y, r: (k.on ? 11 : 7) * k.s, on: k.on, act: __S.act === k })));
  await page.evaluate(async (k) => { await G.tap(k.x, k.y); await G.wait(80); await G.tap(k.x, k.y); await G.wait(60); await G.tap(k.x, k.y); await G.wait(300); }, pk0[1]);   // whatever the state, end with a known one
  const fin = await page.evaluate(() => __S.pk.map(k => ({ x: k.x, y: k.y, r: (k.on ? 11 : 7) * k.s, on: k.on, act: __S.act === k, inv: __S.inv })));
  const ringPng = await page.screenshot({ path: `${dir}/ring.png` });
  const ringPts = []; fin.forEach(k => { for (let a = 0; a < 16; a++) for (const dr of [5.5, 6, 6.5]) ringPts.push({ x: k.x + (k.r + dr) * Math.cos(a / 16 * 6.2832), y: k.y + (k.r + dr) * Math.sin(a / 16 * 6.2832) }); });
  const rp = await d.pixels(br, ringPng, ringPts, DPR), bg = (fin[0].inv > .5 ? 0 : 765), ringScore = fin.map((k, i) => { let n = 0; for (let a = 0; a < 16; a++) { const tri = rp.slice(i * 48 + a * 3, i * 48 + a * 3 + 3); if (tri.some(c => Math.abs(c[0] + c[1] + c[2] - bg) > 200)) n++; } return n; });
  checks.Y10_oneRing = fin.filter(k => k.act).length <= 1 && fin.every((k, i) => k.act ? ringScore[i] >= 12 : ringScore[i] <= 4); info.ring = { fin: fin.map(k => ({ on: k.on, act: k.act })), ringScore };
  // Y9
  const y9 = await page.evaluate(async (k0) => { const k = __S.pk.find(p => p.id === k0.id), u0 = k.u.slice(), n0 = __S.pk.filter(p => !p.dead).length;
    if (k.on) { if (__S.act !== k) { await G.tap(k.x, k.y); await G.wait(40); } await G.tap(k.x, k.y); await G.wait(40); }
    await G.drag(k.x, k.y, k.x + 40, k.y + 70, { ms: 140 }); await G.wait(60); const moved = { dx: k.x - k0.x, dy: k.y - k0.y, diff: k.u.reduce((s, x, i) => s + Math.abs(x - u0[i]), 0), audK: !!__S.audK, on: k.on };
    await G.drag(k.x, k.y, SEED.x + 8, SEED.y - 8, { ms: 200 }); await G.wait(40); const dropped = { dead: k.dead, n: __S.pk.filter(p => !p.dead).length }; await G.wait(700); dropped.gone = __S.pk.indexOf(k) < 0; return { n0, moved, dropped }; }, pk0[2]);
  checks.Y9_remutates = lib.near(y9.moved.dx, 40, 1) && lib.near(y9.moved.dy, 70, 1) && y9.moved.diff > .05 && !y9.moved.audK; checks.Y9_dropRemoves = y9.dropped.dead && y9.dropped.n === y9.n0 - 1 && y9.dropped.gone; info.y9 = y9;

  // Y10: the branch's own colour at its tip; the picked menu value alone takes the category colour
  await fresh();
  const tipPng = await (async () => { await page.evaluate(() => G.grow(-1.57, 200)); await page.waitForTimeout(250); return page.screenshot({ path: `${dir}/tip.png` }); })();
  const tip = await page.evaluate(() => { const b = __S.br; return { col: b.col, m: b.m, fp: __S.fp }; }); const [tpx] = await d.pixels(br, tipPng, [tip.fp], DPR); await page.evaluate(() => G.cancel());
  checks.Y10_branchColour = tip.col.every((c, i) => Math.abs(c * 255 - tpx[i]) < 40); info.tip = { col: tip.col.map(x => +x.toFixed(2)), px: tpx };
  await page.waitForTimeout(300);
  const menu = await page.evaluate(async () => { const H = innerHeight, y = Math.round(H * .3); G.down(26, y); await G.frame(() => __S.open, 1200); await G.wait(250); const r = __S.open, k = r.kids[0]; await G.to(k.lp.x, k.lp.y, { ms: 160, steps: 8 }); await G.wait(300);
    return { path: __S.path.length, kids: r.kids.map(n => ({ id: n.id, x: n.lp.x, y: n.lp.y, on: __S.path.indexOf(n) > 0, cat: n.cat })) }; });
  const mPng = await page.screenshot({ path: `${dir}/picked.png` }), mPx = await d.pixels(br, mPng, menu.kids.map(k => ({ x: k.x + 16, y: k.y })), DPR); await page.evaluate(() => { G.cancel(); });
  const CAT1 = [.16, .45, .95].map(x => x * 255), isCat = (c) => c.every((v, i) => Math.abs(v - CAT1[i]) < 40);
  checks.Y10_menuPick = menu.path === 2 && menu.kids.every((k, i) => k.on === isCat(mPx[i])); info.menu = { path: menu.path, kids: menu.kids.map((k, i) => ({ on: k.on, px: mPx[i] })) };

  await lib.sheet(br, [f7, `${dir}/ring.png`, `${dir}/tip.png`, `${dir}/picked.png`], `${dir}/sheet.png`, 4, 200);
  const errors = d.clean(page); await br.close(); checks.noErrors = !errors.length;
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info, errors });
};
