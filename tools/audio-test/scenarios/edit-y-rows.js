/* Editor E2–E7, E9, E10, E13: the timeline's own rows, on takes written through the library and a session laid out for each test.
   E2 heads orange, teal, violet, yellow · E3 play dot, the blue playhead follows, the view scrolls · E4 tap places the
   playhead on half-beats · E5 drag scrolls · E6 pinch zooms around the fingers, readout shows the zoom ·
   E7 bar.beat readout · E9 move: picked up where held, across tracks, snap with the green line, start time shown ·
   E10 an edit during playback takes effect at once · E13 properties: snap (on), push (off), shelf */
const d = require('../drive');
module.exports = async (lib) => {
  const dir = lib.outDir('edit-y-rows' + (lib.ENGINE === 'webkit' ? '-webkit' : '')), W = lib.VIEW.width, H = lib.VIEW.height, checks = {}, info = {}, DPR = lib.DPR;
  const br = await lib.browser(); const page = await lib.open(br, 'edit', { wait: 300 });
  await page.addInitScript(() => { const S = window.AudioBufferSourceNode; if (!S) return; const st = S.prototype.start; window.__SRC = []; S.prototype.start = function (w, o, du) { window.__SRC.push({ w, o, du, len: this.buffer ? this.buffer.duration : 0 }); return st.apply(this, arguments); }; });
  const put = (sec, hz) => page.evaluate(async ([sec, hz]) => { const sr = 48000, a = new Float32Array(Math.round(sr * sec)); for (let i = 0; i < a.length; i++) a[i] = Math.sin(2 * Math.PI * hz * i / sr) * .3; return (await AT.takes.put({ name: 't' + hz, kind: 'rec', sr, data: a })).id; }, [sec, hz]);
  // the session is rewritten by the page's own pagehide save; a fresh write after it goes through a blank page of the same origin
  const reseed = async (o) => { const url = page.url(); await page.goto(`http://127.0.0.1:${process.env.AT_PORT || 8794}/tools/audio-test/package.json`); await page.evaluate((o) => { localStorage.setItem('audio.tempo', '120'); localStorage.setItem('audio.session.edit', JSON.stringify({ v: 3, tl: 0, ph: 0, vt: 0, pps: 30, snap: 1, push: 0, hx: 0, tracks: [{ m: 0, s: 0, a: 0 }, { m: 0, s: 0, a: 0 }], ...o })); }, o);
    await page.goto(url, { waitUntil: 'load' }); await page.waitForFunction(() => window.__E && __S.ready, null, { timeout: 8000 }); await page.waitForTimeout(400); await d.install(page, '#eb'); await page.evaluate(() => { window.E = { y: (s) => __E.yOf(s), s: (y) => __E.sOf(y), x: (t) => __E.view().lanes[t] }; }); };
  const clip = (k, t, s, dur) => ({ k, t, s, d: dur, off: 0, rev: 0, sl: dur });
  const a4 = await put(4, 330), a20 = await put(20, 220), b4 = await put(4, 440);
  const st = () => page.evaluate(() => __E.state());
  const tr4 = [0, 1, 2, 3].map(() => ({ m: 0, s: 0, a: 0 }));

  // E2
  await reseed({ tracks: tr4, clips: [clip(a4, 0, 2, 4), clip(a4, 1, 2, 4), clip(a4, 2, 2, 4), clip(a4, 3, 2, 4)] });
  const headPng = await page.screenshot({ path: `${dir}/heads.png` }), lanes = await page.evaluate(() => __E.view().lanes.slice(0, 4));
  const TC = [[1, .42, .1], [.1, .75, .78], [.55, .4, .95], [.95, .75, .1]].map(c => c.map(v => v * 255)), near = (c, r) => c.every((v, i) => Math.abs(v - r[i]) < 45);
  const heads = []; for (let t = 0; t < 4; t++) { const pts = []; for (let a = 0; a < 12; a++) for (const r of [1, 3, 4]) pts.push({ x: lanes[t] + r * Math.cos(a / 12 * 6.2832), y: 30 + r * Math.sin(a / 12 * 6.2832) }); const px = await d.pixels(br, headPng, pts, DPR); heads.push(px.filter(c => near(c, TC[t])).length); }
  checks.E2_headColours = heads.every(n => n >= 30); info.heads = heads;

  // E3: follow at the highest zoom, 4.5 s of view
  await reseed({ pps: 160, clips: [clip(a20, 0, 0, 20)] });
  const pos = await page.evaluate(() => { const v = __E.view(); return { play: v.play, prop: v.prop, TOP: v.TOP, BOT: v.BOT }; });
  const e3a = await page.evaluate(async (p) => { await G.tap(p.x, p.y); await G.frame(() => __S.play && __E.state().ph > .1, 3000); const t0 = performance.now(), a = __E.state().ph; await G.wait(2000); const r = { play: __S.play, rate: (__E.state().ph - a) / ((performance.now() - t0) / 1000), vt0: __S.vt }; return r; }, pos.play);
  await page.waitForTimeout(4500);
  const e3b = await page.evaluate(() => { const T = __E.state().ph, v = __E.view(); return { T, vt: __S.vt, y: __E.yOf(T), H: v.H, nodes: __E.nodes() }; });
  const e3s = await page.evaluate(async (p) => { await G.tap(p.x, p.y); await G.wait(250); return { play: __S.play, ph: __E.state().ph, nodes: __E.nodes(), y: __E.yOf(__E.state().ph) }; }, pos.play);
  const stopPng = await page.screenshot({ path: `${dir}/stopped.png` }), [l0, l1, off] = await d.pixels(br, stopPng, [{ x: 200, y: Math.floor(e3s.y) }, { x: 200, y: Math.ceil(e3s.y) }, { x: 200, y: e3s.y + 8 }], DPR), lineMid = l0[2] > l1[2] ? l0 : l1;
  checks.E3_plays = e3a.play && lib.near(e3a.rate, 1, .04) && e3b.nodes >= 1; checks.E3_scrolls = e3b.vt > 1 && e3b.y > pos.TOP && e3b.y < e3b.H - pos.BOT; checks.E3_stops = !e3s.play && e3s.nodes === 0 && e3s.ph > 4;
  checks.E3_bluePlayhead = lineMid[2] > lineMid[0] + 40 && !(off[2] > off[0] + 70); info.e3 = { e3a, e3b, e3s, lineMid, off };

  // E4, E7 tap on empty space; snap off is exact
  await reseed({ clips: [clip(a4, 0, 0, 4)] });
  const tapS = (s) => page.evaluate(async (s) => { await G.tap(E.x(1), E.y(s)); await G.wait(120); return __E.state(); }, s);
  const t1 = await tapS(3.13), t2 = await tapS(5.4), t3 = await tapS(.26);
  checks.E4_halfBeats = lib.near(t1.ph, 3.25, 1e-6) && lib.near(t2.ph, 5.5, 1e-6) && lib.near(t3.ph, .25, 1e-6); info.e4 = [t1.ph, t2.ph, t3.ph];
  checks.E7_barBeat = t1.readout === '2.3' && t2.readout === '3.4' && t3.readout === '1.1'; info.e7 = [t1.readout, t2.readout, t3.readout];   // 3.25 s at 120: bar 2, beat 3
  await page.evaluate(async (q) => { await G.tap(q.x, q.y); await G.wait(350); const b = __E.bud(0); await G.tap(b.x, b.y); await G.wait(120); await G.tap(q.x, q.y); await G.wait(300); }, pos.prop);
  const t4 = await tapS(3.13); checks.E4_snapOffExact = !t4.snapOn && lib.near(t4.ph, 3.13, 1 / 30 + .001); info.snapOff = t4.ph;

  // E5
  await reseed({ clips: [clip(a4, 0, 0, 4)] });
  const e5 = await page.evaluate(async () => { const x = E.x(1), a = __S.vt; await G.drag(x, 600, x, 500, { ms: 200, steps: 10, rest: 160 }); await G.wait(100); return { a, vt: __S.vt, ph: __E.state().ph }; });
  checks.E5_scrolls = lib.near(e5.vt - e5.a, 100 / 30, .05) && e5.ph === 0; info.e5 = e5;

  // E6: fingers 100 px apart on the same time line -> 300 px: zoom ×3, the time under them stays put
  await reseed({ clips: [clip(a4, 0, 0, 4)] });
  const e6 = await page.evaluate(async () => { const x = E.x(1) + 4, m = 420; const s0 = E.s(m), p0 = __S.pps; G.down(x, m - 50, 1); G.down(x, m + 50, 2); await G.wait(30); for (let k = 1; k <= 10; k++) { G.move(x, m - 50 - k * 10, 1); G.move(x, m + 50 + k * 10, 2); await G.wait(24); }
    await G.wait(90); const mid = { pps: __S.pps, ro: __E.state().readout, s: E.s(m) }; G.up(1); G.up(2); await G.wait(200); return { s0, p0, mid, ro: __E.state().readout, pps: __S.pps }; });
  // the pinch is measured from where it is recognised: 110 px apart here (one finger has moved, the other not yet), so ×300/110 and a midpoint 5 px off
  const zoom = 300 / 110; checks.E6_zooms = lib.near(e6.mid.pps / e6.p0, zoom, .05) && lib.near(e6.pps, e6.mid.pps, .01); checks.E6_anchor = Math.abs(e6.mid.s - e6.s0) < 6 / 30; checks.E6_readout = e6.mid.ro === (Math.round(e6.mid.pps / 30 * 100) / 100) + 'x' && /^\d+\.\d$/.test(e6.ro); info.e6 = e6;

  // E9
  await reseed({ clips: [clip(a4, 0, 2, 4), clip(b4, 1, 8, 4)] });
  const moveTo = (id, toT, toS, opts = {}) => page.evaluate(async ({ id, toT, toS, opts }) => { const c = () => __E.clips().find(k => k.id === id), c0 = c(), gy = E.y(c0.s + c0.d / 2), gx = E.x(c0.t); G.down(gx, gy); await G.frame(() => __E.gesture() && __E.gesture().phase === 'buds', 900);
    const tg = __E.buds()[2], dx = tg[0] - gx, dy = tg[1] - gy, L = Math.hypot(dx, dy); let grab = null; for (let k = 1; k <= 8 && !__S.move; k++) { G.move(gx + dx / L * k * 12, gy + dy / L * k * 12); if (__S.move) grab = __S.move.g; await G.wait(15); } const moving = !!__S.move; await G.wait(40); const g1 = __S.move ? __S.move.g : grab;   // g: where in the clip it was held, rebased once it leaves its origin
    await G.to(E.x(toT), E.y(toS + g1), { ms: 240, steps: 12 }); await G.wait(90); const mid = { c: c(), sy: __E.state().sy, ro: __E.state().readout, pick: grab }; if (opts.shot) await G.wait(120); if (!opts.hold) { G.up(); await G.wait(120); } return { moving, mid, end: c() }; }, { id, toT, toS, opts });
  const ids = await page.evaluate(() => __E.clips().map(c => c.id));
  const m1 = await moveTo(ids[0], 1, 12.04, { hold: true });   // bottom clip's end is 12: 1 px off, snaps
  const gPng = await page.screenshot({ path: `${dir}/move-snap.png` }), [gr] = await d.pixels(br, gPng, [{ x: await page.evaluate(() => E.x(1) - 40), y: await page.evaluate(() => __E.state().sy) }], DPR);
  await page.evaluate(async () => { G.up(); await G.wait(120); });
  const after = await page.evaluate(() => __E.clips()[1]);
  checks.E9_followsAcrossTracks = m1.moving && m1.mid.c.t === 1 && lib.near(m1.mid.pick, 2, .05); checks.E9_snapsToEdge = lib.near(m1.mid.c.s, 12, 1e-4) && m1.mid.sy >= 0 && after.t === 1 && lib.near(after.s, 12, 1e-4); checks.E9_greenLine = gr[1] > gr[0] + 50 && gr[1] > gr[2] + 20; checks.E9_showsStart = m1.mid.ro === '7.1';
  info.e9 = { mid: { t: m1.mid.c.t, s: m1.mid.c.s, sy: m1.mid.sy, ro: m1.mid.ro, pick: m1.mid.pick }, gr };
  const m2 = await moveTo(ids[0], 0, 5.12); checks.E9_snapsToBeat = lib.near(m2.end.s, 5, 1e-4) && m2.end.t === 0; info.e9beat = m2.end.s;   // 8 px = .27 s at this zoom

  // E10: during playback, trim the clip under the playhead and delete a later one; the mix follows without a stop
  await reseed({ clips: [clip(a20, 0, 0, 20), clip(b4, 1, 20, 3)] });
  const e10 = await page.evaluate(async (p) => { await G.tap(p.x, p.y); await G.frame(() => __S.play && __E.state().ph > .6 && __E.nodes() >= 2, 4000); const n0 = __E.nodes(), a = __E.clips()[0], ph0 = __E.state().ph, s0 = __SRC.length, t0 = performance.now();
    await G.drag(E.x(0), E.y(a.end), E.x(0), E.y(17), { ms: 160, steps: 8 }); await G.wait(120); const b = __E.clips()[0], s1 = __SRC.slice(s0), ph1 = __E.state().ph, dt = (performance.now() - t0) / 1000, r = { n0, d: b.d, end: b.end, starts: s1.length, ph0, ph1, dt, playing: __S.play, nodes: __E.nodes() };
    const c = __E.clips().find(k => k.t === 1), gx = E.x(1), gy = E.y(c.s + c.d / 2); G.down(gx, gy); await G.frame(() => __E.gesture() && __E.gesture().phase === 'buds', 900); const tg = __E.buds()[3], dx = tg[0] - gx, dy = tg[1] - gy, L = Math.hypot(dx, dy); await G.to(gx + dx / L * 60, gy + dy / L * 60, { ms: 100, steps: 5 }); await G.wait(40); G.up(); await G.wait(250);
    r.left = __E.clips().length; r.nodes2 = __E.nodes(); r.playing2 = __S.play; await G.tap(p.x, p.y); return r; }, pos.play);
  checks.E10_trimLive = e10.playing && lib.near(e10.d, 17, 1e-3) && e10.starts >= 1 && lib.near(e10.ph1 - e10.ph0, e10.dt, .2); checks.E10_deleteLive = e10.left === 1 && e10.playing2 && e10.nodes2 === 1; info.e10 = e10;

  // E13
  await reseed({ clips: [clip(a4, 0, 0, 4), clip(b4, 0, 4, 4), clip(b4, 0, 8, 4), clip(a4, 1, 20, 4)] });
  const e13 = await page.evaluate(async (q) => { const out = { snap0: __S.snapOn, push0: __S.push }; await G.tap(q.x, q.y); await G.wait(350); out.open = __E.state().propOpen; const b = [0, 1, 2].map(i => __E.bud(i)); await G.tap(b[1].x, b[1].y); await G.wait(100); out.push = __S.push; await G.tap(b[0].x, b[0].y); await G.wait(100); out.snap = __S.snapOn; await G.tap(b[0].x, b[0].y); await G.wait(100); out.snap2 = __S.snapOn; await G.tap(b[2].x, b[2].y); await G.wait(350); out.shelf = __E.shelf().open; return out; }, pos.prop);
  await page.screenshot({ path: `${dir}/props.png` }); await page.keyboard.press('Escape').catch(() => {});
  await reseed({ push: 1, clips: [clip(a4, 0, 0, 4), clip(b4, 0, 4, 4), clip(b4, 0, 8, 4), clip(a4, 1, 20, 4)] });
  const pid = await page.evaluate(() => __E.clips().find(c => c.t === 1).id), p1 = await moveTo(pid, 0, 4), pc = await page.evaluate(() => __E.clips().filter(c => c.t === 0).map(c => +c.s.toFixed(3)));
  await reseed({ push: 0, clips: [clip(a4, 0, 0, 4), clip(b4, 0, 4, 4), clip(b4, 0, 8, 4), clip(a4, 1, 20, 4)] });
  const qid = await page.evaluate(() => __E.clips().find(c => c.t === 1).id), p2 = await moveTo(qid, 0, 4), qc = await page.evaluate(() => __E.clips().filter(c => c.t === 0).map(c => +c.s.toFixed(3)));
  checks.E13_defaults = e13.snap0 === true && e13.push0 === false && e13.open; checks.E13_toggles = e13.push === true && e13.snap === false && e13.snap2 === true; checks.E13_shelf = e13.shelf;
  checks.E13_pushMoves = JSON.stringify(pc) === '[0,4,8,12]'; checks.E13_noPushTakesGap = JSON.stringify(qc) === '[0,4,8,12]' && qc.length === 4; info.e13 = { e13, pc, qc };
  const errors = d.clean(page); await br.close(); checks.noErrors = !errors.length;
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info, errors });
};
