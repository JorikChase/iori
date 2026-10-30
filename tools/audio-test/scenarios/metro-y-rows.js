/* Metronome M2–M8 and the shared tempo L1.
   M2 clicks land on the beat (scheduled times, accent on the first) · M3 centre drag sideways: 0.3 BPM per px ·
   M4 up/down: beat count; diagonal both · M5 turning round the ring, finer further out · M6 marks: dots -> rectangles ->
   strips as the count grows, springing in · M7 the travelling drop swells each mark, gone once marks are strips ·
   M8 / L1 reads and writes the shared tempo live, between open pages, and it survives a reload */
const d = require('../drive');
module.exports = async (lib) => {
  const dir = lib.outDir('metro-y-rows' + (lib.ENGINE === 'webkit' ? '-webkit' : '')), W = lib.VIEW.width, H = lib.VIEW.height, checks = {}, info = {}, DPR = lib.DPR;
  const C = { x: W / 2, y: 226 }, R = 128, BTN = { x: W / 2, y: H - 34 };
  const br = await lib.browser(); const page = await lib.open(br, 'metro', { wait: 300 }); await d.audioLog(page);
  await page.evaluate(() => { localStorage.clear(); AT.setTempo(120); }); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(600); await d.install(page, '#' + await page.evaluate(() => document.querySelector('canvas').parentElement.id));
  const bpm = () => page.evaluate(() => __S.bpm); const rst = () => page.evaluate(() => { __S.drag = null; AT.setTempo(120); __S.bpm = 120; __S.N = 4; __S.logN = Math.log(4); });

  // M2
  await page.evaluate(({ x, y }) => G.tap(x, y), BTN); await page.waitForFunction(() => __S.run && __S.ctx.state === 'running', null, { timeout: 5000 }); await page.waitForTimeout(3000);
  const osc = await page.evaluate(() => __OSC.slice()); const gaps = osc.slice(1).map((o, i) => o.t - osc[i].t), acc = osc.map((o, i) => [i % 4 === 0, o.f]);
  checks.M2_onTheBeat = gaps.length >= 5 && gaps.every(g => lib.near(g, .5, 1e-3)); checks.M2_accents = acc.every(([a, f]) => f === (a ? 1760 : 1100)); info.m2 = { n: osc.length, min: +Math.min(...gaps).toFixed(5), max: +Math.max(...gaps).toFixed(5) };
  // a tempo change while running keeps the beat going: the next gap is the new one
  const tempo = (v) => page.evaluate((v) => { AT.setTempo(v); new BroadcastChannel('audio').postMessage({ t: 'tempo', v, src: 'test' }); }, v);   // a page does not hear its own channel
  await page.evaluate(() => { __OSC.length = 0; }); await tempo(150); const live = await page.evaluate(async () => { await G.wait(1400); return __OSC.map(o => o.t); }); const g2 = live.slice(1).map((t, i) => t - live[i]);
  checks.M2_tempoChange = g2.length >= 2 && g2.every(g => lib.near(g, .4, 1e-3)); info.m2b = g2.map(x => +x.toFixed(4));

  // M7 at 20 BPM, four marks: the drop is on the ring where S.da says, not where no drop is. Stops after
  await tempo(20); await page.waitForTimeout(500);
  const arc = (a0, a1, r) => { const p = []; for (let k = 0; k <= 12; k++) { const a = (a0 + (a1 - a0) * k / 12) * 6.2832; p.push({ x: C.x + r * Math.sin(a), y: C.y - r * Math.cos(a) }); } return p; };
  const dropAt = async () => { const a0 = await page.evaluate(() => __S.da), png = await page.screenshot(), a1 = await page.evaluate(() => __S.da), o = (a0 + .25) % 1;   // a quarter away: no drop
    const [dp, off] = [await d.pixels(br, png, arc(a0, a1 < a0 ? a0 + .02 : a1, R + 5), DPR), await d.pixels(br, png, arc(o, o + .01, R + 5), DPR)]; const lit = (a) => a.filter(c => c[0] + c[1] + c[2] > 300).length; return { a0, a1, dp: lit(dp), off: lit(off) }; };
  const dr = await dropAt(), dr2 = await dropAt();
  const da = await page.evaluate(async () => { const a = []; for (let k = 0; k < 12; k++) { a.push(__S.da); await G.wait(60); } return a; });
  checks.M7_dropTravels = da.every((v, i) => !i || v >= da[i - 1] - 1e-6 || da[i - 1] > .9) && da[da.length - 1] !== da[0]; checks.M7_dropDrawn = dr.dp > 0 && dr2.dp > 0 && dr.off === 0 && dr2.off === 0; info.m7 = { dr, dr2 };
  await page.evaluate(({ x, y }) => G.tap(x, y), BTN); await page.waitForTimeout(600); await rst();

  // M3
  const m3 = await page.evaluate(async ({ x, y }) => { await G.drag(x, y, x + 100, y, { ms: 160, steps: 10, lift: false }); await G.wait(30); const mid = __S.bpm, n = __S.N; G.up(); await G.wait(60); return { mid, n, end: __S.bpm, stored: +localStorage.getItem('audio.tempo') }; }, C);
  checks.M3_03PerPx = lib.near(m3.mid, 150, .05) && m3.n === 4 && m3.end === 150 && m3.stored === 150; info.m3 = m3; await rst();
  // M4
  const m4 = await page.evaluate(async ({ x, y }) => { await G.drag(x, y, x, y - 130, { ms: 160, steps: 10 }); await G.wait(60); const up = { n: __S.N, b: __S.bpm }; __S.N = 4; __S.logN = Math.log(4); await G.drag(x, y, x, y + 130, { ms: 160, steps: 10 }); await G.wait(60); const dn = { n: __S.N, b: __S.bpm }; __S.N = 4; __S.logN = Math.log(4); await G.drag(x, y, x + 60, y - 60, { ms: 160, steps: 10 }); await G.wait(60); return { up, dn, diag: { n: __S.N, b: __S.bpm } }; }, C);
  const nUp = Math.round(4 * Math.pow(150, .5)), nDiag = Math.round(4 * Math.pow(150, 60 / 260));
  checks.M4_upDown = m4.up.n === nUp && m4.up.b === 120 && m4.dn.n === 2 && m4.dn.b === 120; checks.M4_diagonal = m4.diag.n === nDiag && m4.diag.b === 138; info.m4 = { ...m4, nUp, nDiag }; await rst();
  // M5: a quarter turn at three distances
  const turn = (r, lift = true) => page.evaluate(async ({ C, r, lift }) => { const P = (a) => ({ x: C.x + r * Math.sin(a), y: C.y - r * Math.cos(a) }), a0 = -.6, b0 = __S.bpm; let q = P(a0); G.down(q.x, q.y); await G.wait(20); for (let k = 1; k <= 20; k++) { q = P(a0 + k / 20 * Math.PI / 2); G.move(q.x, q.y); await G.wait(14); } const mid = __S.bpm - b0; if (lift) G.up(); await G.wait(40); return { mid, end: __S.bpm - b0 }; }, { C, r, lift });
  const t1 = await turn(R + 10), t2 = await turn(R + 60), t3 = await turn(R + 100); await rst();
  checks.M5_ring = lib.near(t1.mid, 30, 1.2); checks.M5_finer = lib.near(t2.mid, 6, .3) && lib.near(t3.mid, 1.2, .1); info.m5 = { t1, t2, t3 };

  // M6: how a mark is drawn at 4, 32 and 280 marks: its size along the ring and across it. Spring: the sum of widths overshoots on the way
  const setN = (n) => page.evaluate(async (n) => { __S.N = n; __S.logN = Math.log(n); await G.wait(700); }, n);
  const shape = async (n) => { await setN(n); const f = `${dir}/marks-${n}.png`, png = await page.screenshot({ path: f }); const at = await page.evaluate(() => __S.da || 0), N = 720, ring = [], rad = []; for (let k = 0; k < N; k++) { const a = k / N * 6.2832; ring.push({ x: C.x + R * Math.sin(a), y: C.y - R * Math.cos(a) }); }
    for (let r = R - 40; r <= R + 40; r++) rad.push({ x: C.x, y: C.y - r }); const rp = await d.pixels(br, png, ring, DPR), radp = await d.pixels(br, png, rad, DPR), ink = (c) => c[0] + c[1] + c[2] < 300; let runs = 0, inkN = 0; rp.forEach((c, i) => { if (ink(c)) { inkN++; if (!ink(rp[(i + N - 1) % N])) runs++; } });
    return { n, runs, along: +(inkN / Math.max(1, runs) / N * 6.2832 * R).toFixed(1), across: radp.filter(ink).length }; };
  const s4 = await shape(4), s32 = await shape(32), s280 = await shape(280); info.m6 = { s4, s32, s280 }; await setN(4);
  checks.M6_dots = s4.runs === 4 && Math.abs(s4.along - s4.across) <= Math.max(3, s4.across * .3); checks.M6_rectangles = s32.runs >= 28 && s32.across > s32.along * 1.5; checks.M6_strips = s280.across >= s32.across * .8 && s280.along < s32.along;
  const spr = await page.evaluate(async () => { __S.N = 8; __S.logN = Math.log(8); const a = []; for (let k = 0; k < 40; k++) { a.push(__U.uSs); await new Promise(r => requestAnimationFrame(r)); } return a; });
  const mid = spr.filter(v => v > 4.2 && v < 7.8).length; checks.M6_springsIn = mid >= 2 && lib.near(spr[spr.length - 1], 8, .1); info.spr = { peak: +Math.max(...spr).toFixed(2), mid, end: +spr[spr.length - 1].toFixed(2) }; await setN(4);

  // M8 / L1: a second page of the app, a tempo written there arrives here, and back
  const p2 = await page.context().newPage(); await p2.goto(page.url(), { waitUntil: 'load' }); await p2.waitForTimeout(500);
  await p2.evaluate(() => { window.__heard = []; AT.onTempo(v => __heard.push(v)); AT.setTempo(97.5); }); await page.waitForTimeout(600); const here = await bpm();
  await page.evaluate(({ x, y }) => G.drag(x, y, x + 50, y, { ms: 120, steps: 8 }), C); await p2.waitForTimeout(800);
  const there = await p2.evaluate(() => ({ heard: __heard.slice(), t: AT.tempo() })), mine = await bpm();   // a second metronome ignores 'metro' tempos by design; the channel and the store are what other tools read
  checks.M8_readsLive = here === 97.5; checks.M8_writesLive = mine === 113 && there.t === 113 && there.heard.includes(113); await p2.close(); info.m8 = { here, mine, there };
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(500); const again = await page.evaluate(() => ({ b: __S.bpm, t: AT.tempo() })); checks.L1_persists = again.b === 113 && again.t === 113; info.l1 = again;
  const errors = d.clean(page); await br.close(); checks.noErrors = !errors.length;
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info, errors });
};
