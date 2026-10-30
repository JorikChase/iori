/* Synth: the stray swipe and the undo history. Chromium (real touch through CDP for the two-finger gestures).
   1. a short flick (70 px from the centre) leaves the seed alone; a drag back to the seed does too
   2. a long drag plants; a two-finger tap takes it back (genes and ph)
   3. park -> undo; a seventh park evicts the oldest -> undo brings it back
   4. parked: re-mutate -> undo; drop on the seed -> undo
   5. gene slide -> undo; wheel commit -> undo; wheel cancel and an unmoved wheel leave no step
   6. menu commit -> undo; a menu opened and left leaves no step
   7. layer via the menu, removed by its dot -> undo twice; layers toggle -> undo; setup tap -> undo
   8. 25 steps keep 20; two-finger drag, slow two-finger press do not undo; a tap on the seed under two fingers does not play
   9. a second finger during a branch changes nothing; its lift does not end the branch
   10. a cancelled touch (pointercancel) does not plant
   11. reload: the garden stays, the history is gone */
module.exports = async (lib) => {
  const dir = lib.outDir('synth-undo'); const W = lib.VIEW.width, H = lib.VIEW.height, checks = {}, info = {};
  const SEED = { x: W / 2, y: Math.round(H * .56) }, RD = { x: 34, y: 34 }, RP = { x: W - 34, y: H - 34 }, RT = { x: W - 34, y: 34 };
  const br = await lib.browser(); const page = await lib.open(br, 'synth', { wait: 800 });
  await page.evaluate(() => localStorage.removeItem('seed-garden-v1')); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(800);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id != null ? p.id : i })) });
  const cdpTap = async (ms = 80) => { await touch('touchStart', [{ x: 120, y: 700 }, { x: 260, y: 700 }]); await page.waitForTimeout(ms); await touch('touchEnd', []); await page.waitForTimeout(160); };
  // real touch where touch itself is the point; scripted elsewhere (on a loaded machine CDP's round trips alone can pass 450 ms)
  const twoTap = async (a = { x: 120, y: 700 }, b = { x: 260, y: 700 }) => { await script([{ t: 'pointerdown', ...a }, { t: 'pointerdown', ...b, id: 12 }, { t: 'pointerup', ...b, id: 12 }, { t: 'pointerup', ...a }]); await page.waitForTimeout(120); };
  const st = () => page.evaluate(() => ({ seed: __S.seedU.slice(), ph: JSON.stringify(__S.ph), gen: __S.gen, setup: __S.setup, layersOn: __S.layersOn, undos: __S.undos || 0, hist: window.__SW.hist ? __SW.hist() : -1, run: __S.run,
    pk: __S.pk.filter(k => !k.dead).map(k => ({ id: k.id, x: k.x, y: k.y, u: k.u.slice() })) }));
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const glide = async (a, b, n = 8, ms = 16) => { for (let k = 1; k <= n; k++) { await page.mouse.move(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n); await page.waitForTimeout(ms); } };
  const at = (r, a = 0) => ({ x: SEED.x + r * Math.cos(a), y: SEED.y + r * Math.sin(a) });
  // branch gestures scripted in the page: a loaded machine delays the harness's input past ANCH and a drag grows anchors it never asked for
  const script = (steps) => page.evaluate(async (steps) => { const el = document.getElementById('sb'), out = [], wait = (t) => new Promise(r => setTimeout(r, t));
    for (const s of steps) { if (s.wait) await wait(s.wait); else if (s.read) out.push({ m: __S.br && __S.br.m, fp: __S.fp.x, br: !!__S.br, an: __S.br && __S.br.an.length });
      else { el.dispatchEvent(new PointerEvent(s.t, { clientX: s.x, clientY: s.y, pointerId: s.id || 11, isPrimary: !s.id, pointerType: 'touch', bubbles: true, cancelable: true })); if (s.t === 'pointermove') await wait(14); } }
    return out; }, steps);
  const line = (a, b, n = 8, id) => Array.from({ length: n }, (_, k) => ({ t: 'pointermove', x: a.x + (b.x - a.x) * (k + 1) / n, y: a.y + (b.y - a.y) * (k + 1) / n, id }));
  const pull = async (q, rest) => { await script([{ t: 'pointerdown', ...SEED }, ...line(SEED, q), ...(rest ? [{ wait: rest }] : []), { t: 'pointerup', ...q }]); await page.waitForTimeout(120); };
  const park = (r, a) => pull(at(r, a), 800);
  const click = async (p) => { await page.mouse.click(p.x, p.y); await page.waitForTimeout(90); };
  // spiral gesture, as in synth-wheel
  const spiral = async (name) => { const q = await page.evaluate((n) => __SW.gpos(__SW.GI[n]), name); await page.mouse.move(RP.x, RP.y); await page.mouse.down(); await page.waitForTimeout(420); await page.mouse.move(q.x, q.y); await page.waitForTimeout(650); return q; };
  const wstate = () => page.evaluate(() => { const w = Wheel.active(); return w && w.state(); });
  const stroke = async (s) => { const x = s.cols[0].x, y = s.rect.top + 8; await page.mouse.move(x, y); await page.mouse.down(); await glide({ x, y }, { x, y: y + 2 * s.rowH }, 4, 25); await page.waitForTimeout(160); await page.mouse.up(); await page.waitForTimeout(450); };
  const menu = async (root, wait) => { await page.mouse.move(root.x, root.y); await page.mouse.down(); await page.waitForTimeout(wait); };
  const kid = async (src) => { const k = await page.evaluate((src) => { const f = eval(src), a = __S.path[__S.path.length - 1], k = a && a.kids.find(f); return k && { x: k.lp.x, y: k.lp.y }; }, src); if (k) { await page.mouse.move(k.x, k.y); await page.waitForTimeout(220); } return k; };

  const s0 = await st();
  // 1. flick; pull and return
  await pull(at(70)); const s1 = await st(); checks.flickLeavesSeed = eq(s1.seed, s0.seed) && s1.gen === 0 && s1.hist <= 0;
  await script([{ t: 'pointerdown', ...SEED }, ...line(SEED, at(160)), ...line(at(160), at(30)), { t: 'pointerup', ...at(30) }]); await page.waitForTimeout(120);
  const s1b = await st(); checks.pullBackLeavesSeed = eq(s1b.seed, s0.seed) && s1b.gen === 0;
  // 2. plant, undo
  await pull(at(160)); const s2 = await st(); for (let i = 0; i < 4 && (await st()).undos === 0; i++) await cdpTap(); const s2b = await st(); info.plant = { gen: s2.gen, hist: s2.hist, undos: s2b.undos };
  checks.longDragPlants = s2.gen === s1b.gen + 1 && !eq(s2.seed, s0.seed) && s2.ph !== s0.ph;
  checks.undoPlant = eq(s2b.seed, s2.gen ? s0.seed : null) && s2b.ph === s0.ph && s2b.undos === 1 && s2b.hist === 0 && !s2b.run;
  // 3. park, undo; seven parks
  await park(130, 0); const s3 = await st(); await twoTap(); const s3b = await st(); checks.undoPark = s3.pk.length === 1 && s3b.pk.length === 0;
  for (let i = 0; i < 6; i++) await park(130, i * 1.04 - 2.6);
  const s6 = await st(); await park(190, -.2); const s7 = await st(); await twoTap(); const s7b = await st();
  info.parks = { six: s6.pk.length, seven: s7.pk.length, back: s7b.pk.length };
  checks.seventhEvicts = s6.pk.length === 6 && s7.pk.length === 6 && !s7.pk.some(k => k.id === s6.pk[0].id);
  checks.undoEviction = eq(s7b.pk.map(k => k.id), s6.pk.map(k => k.id)) && eq(s7b.pk, s6.pk);
  // 4. re-mutate, remove
  const k0 = s7b.pk[1]; await page.mouse.move(k0.x, k0.y); await page.mouse.down(); await glide(k0, { x: k0.x + 30, y: k0.y + 30 }); await page.mouse.up(); await page.waitForTimeout(120);
  const s8 = await st(); await twoTap(); const s8b = await st(); checks.undoRemut = !eq(s8.pk, s7b.pk) && eq(s8b.pk, s7b.pk);
  await page.mouse.move(k0.x, k0.y); await page.mouse.down(); await glide(k0, SEED); await page.mouse.up(); await page.waitForTimeout(120);
  const s9 = await st(); await twoTap(); const s9b = await st(); checks.undoRemoval = s9.pk.length === 5 && eq(s9b.pk, s7b.pk);
  // 5. genes
  const q = await spiral('sus'); await glide(q, { x: q.x, y: q.y - 60 }); await page.mouse.up(); await page.waitForTimeout(250);
  const g1 = await st(); await twoTap(); const g1b = await st(); checks.undoGeneSlide = !eq(g1.seed, s0.seed) && eq(g1b.seed, s0.seed);
  await spiral('cut'); await page.mouse.up(); await page.waitForTimeout(450); let w = await wstate(); const h0 = (await st()).hist;
  await page.mouse.click(w.cols[0].x, w.bandY); await page.waitForTimeout(500); const h1 = (await st()).hist;
  await spiral('cut'); await page.mouse.up(); await page.waitForTimeout(450); w = await wstate(); await stroke(w); w = await wstate();
  await page.mouse.click(w.cancel.x, w.cancel.y); await page.waitForTimeout(500); const g2 = await st();
  await spiral('cut'); await page.mouse.up(); await page.waitForTimeout(450); w = await wstate(); await stroke(w); w = await wstate();
  await page.mouse.click(w.cols[0].x, w.bandY); await page.waitForTimeout(500); const g3 = await st(); await twoTap(); const g3b = await st();
  info.wheel = { h0, h1, g2h: g2.hist, g3h: g3.hist };
  checks.unmovedWheelNoStep = h1 === g1b.hist && h0 === h1 + 1; checks.wheelCancelNoStep = g2.hist === h1 && eq(g2.seed, s0.seed); checks.undoWheel = g3.hist === h1 + 1 && !eq(g3.seed, s0.seed) && eq(g3b.seed, s0.seed);
  // 6. menus
  await menu(SEED, 760); await page.mouse.up(); await page.waitForTimeout(200); const m0 = await st(); checks.emptyMenuNoStep = m0.hist === g3b.hist;
  await menu(SEED, 760); const pick = await kid("k => k.v.wave === 'square'"); await page.mouse.up(); await page.waitForTimeout(200); const m1 = await st(); await twoTap(); const m1b = await st();
  info.menu = { pick: !!pick, wave: await page.evaluate(() => __SW.seed('wave')) }; checks.undoMenu = !!pick && !eq(m1.seed, s0.seed) && eq(m1b.seed, s0.seed);
  // 7. layers, setup
  await menu(RD, 520); const lk = await kid("k => k.v.ltype === 'crush'"); await page.mouse.up(); await page.waitForTimeout(250); const l1 = await st();
  const dot = await page.evaluate(() => __S.ldots[0]); if (dot) await click(dot); await page.waitForTimeout(120); const l2 = await st(); await twoTap(); const l2b = await st(); await twoTap(); const l1b = await st();
  info.layer = { lk: !!lk, dot }; checks.undoLayerDot = !!dot && !eq(l2.seed, l1.seed) && eq(l2b.seed, l1.seed); checks.undoLayerMenu = !eq(l1.seed, s0.seed) && eq(l1b.seed, s0.seed);
  await click(RD); const t1 = await st(); await twoTap(); const t1b = await st(); checks.undoLayersToggle = t1.layersOn === false && t1b.layersOn === true;
  await click(RT); const u1 = await st(); await twoTap(); const u1b = await st(); checks.undoSetup = u1.setup === 1 && u1b.setup === 0;
  // 8. bounds and the gestures that are not undo
  await click(RT); const c0 = await st();
  await touch('touchStart', [{ x: 120, y: 700 }, { x: 260, y: 700 }]); await page.waitForTimeout(10); await touch('touchMove', [{ x: 120, y: 650 }, { x: 260, y: 650 }]); await touch('touchEnd', []); await page.waitForTimeout(150);
  const c1 = await st(); await cdpTap(800); const c2 = await st();
  checks.twoFingerDragNoUndo = c1.setup === c0.setup && c1.undos === c0.undos; checks.slowTwoFingerNoUndo = c2.undos === c0.undos;
  await twoTap(SEED); await page.waitForTimeout(450); const c3 = await st();
  checks.undoOverSeedNoPlay = c3.undos === c0.undos + 1 && c3.setup === 0 && !c3.run;
  for (let i = 0; i < 25; i++) { await page.mouse.click(RT.x, RT.y); await page.waitForTimeout(25); }
  const d0 = await st(); const n = await page.evaluate(() => { if (!__SW.undo) return -1; let n = 0; while (__SW.undo()) n++; return n; }); const d1 = await st();
  info.depth = { hist: d0.hist, undone: n, setup: d1.setup }; checks.twentySteps = d0.hist === 20 && n === 20 && d1.hist === 0;
  // 9. a second finger during a branch
  const o = { x: 60, y: 720 }, end = at(96);
  const r9 = await script([{ t: 'pointerdown', ...SEED }, ...line(SEED, end, 6), { read: 1 }, { t: 'pointerdown', ...o, id: 12 }, { read: 1 }, { t: 'pointermove', x: 30, y: 700, id: 12 }, { read: 1 }, { t: 'pointerup', x: 30, y: 700, id: 12 }, { read: 1 }, { t: 'pointerup', ...end }, { read: 1 }]);
  await page.waitForTimeout(120); info.second = r9;
  checks.secondFingerIgnored = r9[0].br && r9[0].m > .2 && [1, 2, 3].every(i => eq(r9[i], r9[0])) && !r9[4].br;
  // 10. pointercancel
  const e0 = await st(); await script([{ t: 'pointerdown', ...SEED }, ...line(SEED, at(160)), { t: 'pointercancel', ...at(160) }]); await page.waitForTimeout(120);
  const e1 = await st(); checks.cancelDoesNotPlant = eq(e1.seed, e0.seed) && e1.gen === e0.gen;
  // 11. reload
  await click(RT); const r0 = await st(); await page.waitForTimeout(3200); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(800); const r1 = await st();
  info.reload = { h0: r0.hist, h1: r1.hist, s0: r0.setup, s1: r1.setup };
  checks.notPersisted = r0.hist > 0 && r1.hist === 0 && r1.setup === r0.setup && eq(r1.seed, r0.seed);

  await page.screenshot({ path: `${dir}/end.png` });
  const errors = page.errors.filter(e => !/serviceworker|service worker/i.test(e)); await br.close();
  checks.noErrors = !errors.length;
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info, errors });
};
