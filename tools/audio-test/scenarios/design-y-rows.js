/* Design system rows, measured on the tools that carry them; each check names its tool, MATRIX says which were covered.
   G1 values on the 3×5 grid · G2 value change: staggered spring · G3 no rewrite without a change · G5 e-ink timing on
   more tools · G6 view change in a tool · G7 editor stays dark, play/stop only flashes · G8 pressed dot stretches ·
   G9 slide + gear on a clip value · G10 radial actions · G12 gestures read the event's own time · G13 corners */
const d = require('../drive');
module.exports = async (lib) => {
  const dir = lib.outDir('design-y-rows' + (lib.ENGINE === 'webkit' ? '-webkit' : '')), W = lib.VIEW.width, H = lib.VIEW.height, checks = {}, info = {}, DPR = lib.DPR;
  const br = await lib.browser();
  const open = async (tool) => { const page = await lib.open(br, tool, { wait: 200 }); await d.audioLog(page); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(700); await d.install(page, '#' + await page.evaluate(() => document.querySelector('canvas').parentElement.id)); return page; };
  const log = (page, ms) => page.evaluate(async (ms) => { const a = [], t0 = performance.now(); while (performance.now() - t0 < ms) { a.push({ t: performance.now() - t0, f: __S.flash, i: __S.inv }); await new Promise(r => requestAnimationFrame(r)); } return a; }, ms);
  const timing = (a) => { const fl = a.filter(x => x.f > .5), dth = a.filter(x => x.i > .02 && x.i < .98); return { flash: fl.length ? fl[fl.length - 1].t - fl[0].t : 0, steps: new Set(dth.map(x => x.i.toFixed(2))).size, end: dth.length ? dth[dth.length - 1].t : 0 }; };

  // metronome: G1, G2, G3
  let page = await open('metro'); await page.evaluate(() => { AT.setTempo(120); __S.bpm = 120; }); await page.waitForTimeout(500);
  const m1 = await d.panels(page); checks.G1_metro = m1.includes('120'); info.g1metro = m1;
  const g3 = await page.evaluate(async () => { const s = JSON.stringify(Array.from(__TD.d)); let same = 0, n = 0; for (let k = 0; k < 30; k++) { await new Promise(r => requestAnimationFrame(r)); if (k === 10) AT.setTempo(120); n++; if (JSON.stringify(Array.from(__TD.d)) === s) same++; } return { same, n }; });
  checks.G3_noRewrite = g3.same === g3.n; info.g3 = g3;
  const g2 = await page.evaluate(async () => { const T = __TD, N = T.w * T.h, rest = new Uint8Array(N); for (let i = 0; i < N; i++) rest[i] = T.d[i * 2]; __S.bpm = 137; const first = {}, peak = {}; let fr = 0; for (let k = 0; k < 40; k++) { await new Promise(r => requestAnimationFrame(r)); fr++; for (let i = 0; i < N; i++) { const v = T.d[i * 2]; if (v !== rest[i] && first[i] == null) first[i] = fr; if (v > (peak[i] || 0)) peak[i] = v; } } const starts = Object.values(first), rises = Object.keys(first).filter(i => T.d[i * 2] > 100), shrink = Object.keys(first).filter(i => T.d[i * 2] < 20); return { cells: starts.length, frames: new Set(starts).size, over: Math.max(...rises.map(i => peak[i])), rest: Math.max(...rises.map(i => T.d[i * 2])), rises: rises.length, shrink: shrink.length }; });
  checks.G2_spring = g2.over > g2.rest + 8 && g2.rises > 0 && g2.shrink > 0; checks.G2_stagger = g2.frames >= 2; info.g2 = g2;
  const corners = {}, cornerInk = async (pg, tool) => { const png = await pg.screenshot(), pts = { tl: [34, 34], tr: [W - 34, 34], br: [W - 34, H - 34], bl: [34, H - 34] }, out = {}, bg = (await d.pixels(br, png, [{ x: W / 2, y: 12 }], DPR))[0]; for (const k in pts) { const a = []; for (let dx = -18; dx <= 18; dx += 2) for (let dy = -18; dy <= 18; dy += 2) a.push({ x: pts[k][0] + dx, y: pts[k][1] + dy }); const px = await d.pixels(br, png, a, DPR); out[k] = px.filter(c => Math.abs(c[0] + c[1] + c[2] - bg[0] - bg[1] - bg[2]) > 150).length; } corners[tool] = out; };
  await cornerInk(page, 'metro'); await page.context().close();

  // synth: G1, G5, G12
  page = await open('synth'); await page.evaluate(() => { localStorage.removeItem('seed-garden-v1'); }); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(700); await d.install(page, '#sb');
  const s1 = await d.panels(page); checks.G1_synth = s1.includes('220') && s1.includes('-12'); info.g1synth = s1; await cornerInk(page, 'synth');
  await page.evaluate(() => G.tap(195, 150)); await page.waitForTimeout(300); await page.evaluate(({ x, y }) => G.tap(x, y), { x: W / 2, y: Math.round(H * .56) }); await page.waitForFunction(() => __S.tr || __S.run, null, { timeout: 8000 }); const s5 = timing(await log(page, 600));
  checks.G5_synth = s5.flash < 100 && s5.steps >= 2 && s5.end < 560; info.g5synth = s5;
  // G12: an event whose own time says 100 ms, handled 400 ms later, is still a tap (a stalled main thread must not turn taps into holds)
  await page.waitForTimeout(400); const g12 = await page.evaluate(async ({ x, y }) => { const el = G.el, t0 = performance.now(), ev = (type, ts, X = x) => { const e = new PointerEvent(type, { clientX: X, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'touch', bubbles: true, cancelable: true }); Object.defineProperty(e, 'timeStamp', { value: ts }); el.dispatchEvent(e); }; const run = __S.run; ev('pointerdown', t0); await G.wait(400); ev('pointerup', t0 + 100); await G.wait(420); const tapped = __S.run !== run; const r2 = __S.run; const t1 = performance.now(); ev('pointerdown', t1); await G.wait(120); ev('pointerup', t1 + 400); await G.wait(420); return { tapped, heldIsNoTap: __S.run === r2 }; }, { x: W / 2, y: Math.round(H * .56) });
  checks.G12_synth = g12.tapped && g12.heldIsNoTap; info.g12 = g12;
  // G11: a plant, then a still two-finger tap
  const g11 = await page.evaluate(async ({ x, y }) => { const a = JSON.stringify(__S.seedU); await G.drag(x, y, x + 60, y - 180, { ms: 120, steps: 6 }); await G.wait(80); const b = JSON.stringify(__S.seedU); G.down(100, 300, 1); G.down(220, 300, 2); G.up(2); G.up(1); await G.wait(80); return { planted: a !== b, undone: JSON.stringify(__S.seedU) === a, undos: __S.undos }; }, { x: W / 2, y: Math.round(H * .56) });
  checks.G11_synth = g11.planted && g11.undone; info.g11 = g11; await page.context().close();

  // editor: G1, G7, G9, G10
  page = await open('edit'); await page.waitForFunction(() => __S.ready); await page.waitForTimeout(300); const e1 = await d.panels(page); checks.G1_edit = e1.includes('1.1'); info.g1edit = e1; await cornerInk(page, 'edit');
  const id = await page.evaluate(async () => { const sr = 48000, a = new Float32Array(sr * 6); for (let i = 0; i < a.length; i++) a[i] = .3 * Math.sin(i * .05); const m = await AT.takes.put({ name: 'x', kind: 'rec', sr, data: a }); return m.id; });
  await page.goto(`http://127.0.0.1:${process.env.AT_PORT || 8794}/tools/audio-test/package.json`); await page.evaluate((k) => { localStorage.setItem('audio.tempo', '120'); localStorage.setItem('audio.session.edit', JSON.stringify({ v: 3, tl: 0, ph: 0, vt: 0, pps: 30, snap: 1, push: 0, hx: 0, tracks: [{ m: 0, s: 0, a: 0 }, { m: 0, s: 0, a: 0 }, { m: 0, s: 0, a: 0 }, { m: 0, s: 0, a: 0 }], clips: [{ k, t: 3, s: 16, d: 6, off: 0, rev: 0, sl: 6 }] })); }, id);
  await page.goto(`http://127.0.0.1:${process.env.AT_PORT || 8794}/audio/t/edit.html`, { waitUntil: 'load' }); await page.waitForFunction(() => window.__E && __S.ready); await page.waitForTimeout(500); await d.install(page, '#eb');
  const P = await page.evaluate(() => __E.view().play), lg = page.evaluate(async () => { const a = []; const t0 = performance.now(); while (performance.now() - t0 < 900) { a.push({ t: performance.now() - t0, f: __S.flash, i: __S.inv }); await new Promise(r => requestAnimationFrame(r)); } return a; });
  await page.evaluate(({ x, y }) => G.tap(x, y), P); const ga = await lg; await page.evaluate(({ x, y }) => G.tap(x, y), P); await page.waitForTimeout(500); const inv = new Set(ga.map(x => x.i)), fl = ga.filter(x => x.f > .5);
  checks.G7_neverWhite = inv.size === 1 && [...inv][0] === 1 && fl.length >= 1 && fl[fl.length - 1].t - fl[0].t < 110; info.g7 = { inv: [...inv], flash: fl.length };
  // G10: a clip low in the last lane: the buds stay on screen, about 220 ms
  const g10 = await page.evaluate(async () => { const c = __E.clips()[0], x = __E.view().lanes[c.t], y = __E.yOf(c.s + c.d / 2), t0 = performance.now(); G.down(x, y); await G.frame(() => __E.gesture() && __E.gesture().phase === 'buds', 1200); const ms = performance.now() - t0, b = __E.buds(), off = b.filter(q => q[0] < 8 || q[1] < 8 || q[0] > innerWidth - 8 || q[1] > innerHeight - 8).length, nearest = Math.min(...b.flatMap((q, i) => b.map((r, j) => i < j ? Math.hypot(q[0] - r[0], q[1] - r[1]) : 1e9))); G.cancel(); await G.wait(100); return { ms, n: b.length, off, nearest, y }; });
  checks.G10_hold = g10.ms >= 215 && g10.ms < 330; checks.G10_buds = g10.n >= 1 && g10.n <= 5 && g10.off === 0 && g10.nearest > 30; info.g10 = g10;
  // G9 on a clip's gain: tap selects, the panel's gain readout slides, up raises, sideways lowers the gear
  const g9 = await page.evaluate(async () => { const c = __E.clips()[0], x = __E.view().lanes[c.t], y = __E.yOf(c.s + c.d / 2); await G.tap(x, y); await G.wait(500); const it = __E.panel().items.find(o => o.what === 'gain'), gx = it.xr - 8, gy = it.y; G.down(gx, gy); await G.to(gx, gy - 40, { ms: 120, steps: 6 }); await G.wait(30); const a = __E.clips()[0].gain; await G.to(gx - 60, gy - 40, { ms: 120, steps: 6 }); await G.wait(20); await G.to(gx - 60, gy - 70, { ms: 120, steps: 6 }); await G.wait(30); const b = __E.clips()[0].gain; G.up(); await G.wait(100); return { a, b }; });
  const g11e = await page.evaluate(async () => { const g0 = __E.clips()[0].gain, n = __E.state().undo; G.down(60, 400, 1); G.down(60, 480, 2); G.up(2); G.up(1); await G.wait(100); return { g0, n, g1: __E.clips()[0].gain, n1: __E.state().undo }; }); checks.G11_edit = g11e.n1 === g11e.n - 1 && g11e.g1 !== g11e.g0; info.g11e = g11e;
  checks.G9_slideGear = lib.near(g9.a, 4, .15) && lib.near(g9.b - g9.a, 1, .15); info.g9 = g9; await page.context().close();

  // G6: the analyzer's view change
  page = await open('ana'); await cornerInk(page, 'ana');
  const g6 = await page.evaluate(async () => { const c = { x: innerWidth / 2, y: innerHeight * .55 }; await G.tap(c.x, c.y); await G.frame(() => __S.run, 3000); await G.wait(300); G.down(c.x, c.y); await G.to(c.x + 40, c.y - 80, { ms: 60, steps: 4 }); await G.wait(20); G.up(); const out = [], t0 = performance.now(); while (performance.now() - t0 < 900) { out.push({ t: performance.now() - t0, vt: __S.vt, v: __S.view }); await new Promise(r => requestAnimationFrame(r)); } return { view: __S.view, v: out.filter(o => o.vt > .02 && o.vt < .98).map(o => +o.vt.toFixed(2)), dur: (out.find(o => o.vt >= 1) || { t: -1 }).t }; });
  checks.G6_viewChange = g6.view === 1 && g6.v.length >= 2 && g6.dur > 100 && g6.dur < 800; info.g6 = g6; await page.context().close();

  // G8: the practice dot
  page = await lib.open(br, 'play', { wait: 200 }); await page.evaluate(async () => { const sr = 48000, a = new Float32Array(sr * 6); for (let i = 0; i < a.length; i++) a[i] = .3 * Math.sin(i * .05); const m = await AT.takes.put({ name: 'x', kind: 'rec', sr, data: a }); AT.session.save('play', { id: m.id, pos: 0, speed: 1, semi: 0 }); }); await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => __S.song); await page.waitForTimeout(500); await d.install(page, '#' + await page.evaluate(() => document.querySelector('canvas').parentElement.id)); await cornerInk(page, 'play');
  const CTL = { x: W / 2, y: H - 46 }, line = []; for (let k = 22; k <= 44; k += 2) line.push({ x: CTL.x - k, y: CTL.y }); const rest = await d.pixels(br, await page.screenshot(), line, DPR); await page.evaluate(async ({ x, y }) => { await G.drag(x, y, x - 70, y, { ms: 120, steps: 6, lift: false }); await G.wait(350); }, CTL); const held = await d.pixels(br, await page.screenshot({ path: `${dir}/stretch.png` }), line, DPR); await page.evaluate(() => G.up());
  const inked = (a) => a.filter(c => c[0] + c[1] + c[2] < 200).length; checks.G8_stretch = inked(held) >= inked(rest) + 4; info.g8 = { rest: inked(rest), held: inked(held) }; await page.context().close();

  // G13
  for (const t of ['tuner', 'bpm', 'rec']) { page = await lib.open(br, t, { wait: 700 }); await cornerInk(page, t); await page.context().close(); }
  info.corners = corners; const c = corners;
  checks.G13_bottomLeftFree = Object.values(c).every(o => o.bl < 6); checks.G13_bottomRightProps = ['synth', 'edit', 'ana', 'play', 'rec', 'tuner'].every(t => c[t].br > 8); checks.G13_topRightSource = ['synth', 'ana', 'play', 'rec', 'bpm', 'tuner'].every(t => c[t].tr > 8); checks.G13_topLeftToolOnly = c.synth.tl > 8;
  await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info });
};
