/* Practice player P1, P4–P7, and the dark running state (G4) on a 20 s click take at 120 BPM.
   P1 fixed blue playhead, played part dimmed, beat dots · P4 readouts: speed, pitch, tempo at that speed ·
   P5 drag scrubs, tap jumps · P6 hold then drag marks a loop, on half-beats; a tap inside clears it ·
   P7 trainer: +5 % per pass up to 100 % */
const d = require('../drive');
module.exports = async (lib) => {
  const dir = lib.outDir('play-y-rows' + (lib.ENGINE === 'webkit' ? '-webkit' : '')), W = lib.VIEW.width, H = lib.VIEW.height, checks = {}, info = {}, DPR = lib.DPR;
  const CTL = { x: W / 2, y: H - 46 }, PROP = { x: W - 34, y: H - 34 }, PPS = 42, HEAD = Math.round(H * .4), X = W / 2 + 60;
  const br = await lib.browser(); const page = await lib.open(br, 'play', { wait: 300 }); await d.audioLog(page);
  await page.evaluate(async () => { const sr = 48000, a = new Float32Array(20 * sr); for (let b = 0; b < 40; b++) { const i0 = b * sr / 2, amp = b % 4 ? .35 : .8; for (let i = 0; i < 4800; i++) a[i0 + i] = amp * Math.exp(-i / 700) * Math.sin(2 * Math.PI * (b % 4 ? 1000 : 1500) * i / sr); } const m = await AT.takes.put({ name: 'clicks', kind: 'rec', sr, data: a }); AT.session.save('play', { id: m.id, pos: 0, speed: 1, semi: 0 }); });
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => __S.song && __S.src, null, { timeout: 6000 }); await page.waitForTimeout(500); await d.install(page, '#' + await page.evaluate(() => document.querySelector('canvas').parentElement.id));
  const song = await page.evaluate(() => ({ bpm: __S.song.bpm, b0: __S.song.b0, sr: __S.song.sr, len: __S.song.len }));
  checks.setup_songTempo = lib.near(song.bpm, 120, .5); info.song = song; const pos = () => page.evaluate(() => __S.pos / __S.song.sr);

  // P5 tap jumps, then drag scrubs (drag down = back)
  const yFor = (dt) => HEAD + dt * PPS;
  const p5 = await page.evaluate(async ({ X, y }) => { await G.tap(X, y); await G.wait(120); return __S.pos / __S.song.sr; }, { X, y: yFor(5) });
  const p5b = await page.evaluate(async ({ X, HEAD }) => { const a = __S.pos / __S.song.sr; await G.drag(X, HEAD + 100, X, HEAD + 16, { ms: 90, steps: 6 }); await G.wait(100); const b = __S.pos / __S.song.sr; await G.drag(X, HEAD, X, HEAD + 42, { ms: 90, steps: 6 }); await G.wait(100); return { a, b, c: __S.pos / __S.song.sr }; }, { X, HEAD });
  checks.P5_tapJumps = lib.near(p5, 5, .03); checks.P5_dragScrubs = lib.near(p5b.b - p5b.a, 2, .05) && lib.near(p5b.c - p5b.b, -1, .05); info.p5 = { p5, p5b };

  // P1 at a known place: 6 s
  await page.evaluate(async ({ X, y }) => { await G.tap(X, y); await G.wait(350); }, { X, y: yFor(0) });
  const t1 = await pos(), p1 = await page.screenshot({ path: `${dir}/waveform.png` });
  const scan = []; for (let y = 100; y < H - 90; y++) for (const x of [W / 2 - 50, W / 2 - 20, W / 2, W / 2 + 20]) scan.push({ x, y }); const px = await d.pixels(br, p1, scan, DPR);
  const row = (i) => px.slice(i * 4, i * 4 + 4), blue = (c) => c[2] > c[0] + 70, yOf = (i) => 100 + i, N = H - 190; let bl = []; for (let i = 0; i < N; i++) if (row(i).filter(blue).length >= 3) bl.push(yOf(i));
  checks.P1_bluePlayhead = bl.length >= 1 && bl.length <= 4 && lib.near(bl[0], HEAD, 2); info.blue = bl;
  // clicks every half second = 21 px; compare a click's ink above (played) and below the playhead
  const ink = (a, b) => { let s = 765; for (let i = a - 100; i < b - 100; i++) for (const c of row(i)) s = Math.min(s, c[0] + c[1] + c[2]); return s; }; const above = ink(HEAD - 120, HEAD - 8), below = ink(HEAD + 8, HEAD + 120);   // darkest ink on the white page
  checks.P1_playedDimmed = above > below + 200; info.dim = { above, below, t1 };
  // beat dots down the left edge: one a beat (21 px), the bar's first larger
  const dpts = []; for (let y = HEAD + 6; y < HEAD + 180; y++) for (let x = 13; x <= 25; x++) dpts.push({ x, y }); const dp = await d.pixels(br, p1, dpts, DPR), runs = []; let cur = 0; for (let i = 0; i < 174; i++) { const n = dp.slice(i * 13, (i + 1) * 13).filter(c => c[0] + c[1] + c[2] < 640).length; if (n) cur += n; else if (cur) { runs.push({ y: HEAD + 6 + i, ink: cur }); cur = 0; } }
  const big = runs.filter(r => r.ink > Math.min(...runs.map(q => q.ink)) * 2); checks.P1_beatDots = runs.length >= 7 && big.length >= 1 && (big.length < 2 || lib.near(big[1].y - big[0].y, 84, 3)); info.dots = runs.slice(0, 9);
  await page.screenshot({ path: `${dir}/p1.png` });

  // P4
  const p4 = await page.evaluate(async ({ x, y }) => { await G.drag(x, y, x - 100, y, { ms: 120, steps: 6 }); await G.wait(60); await G.drag(x, y, x, y - 42, { ms: 120, steps: 6 }); await G.wait(300); return { speed: __S.speed, semi: __S.semi }; }, CTL); await page.waitForTimeout(250);
  const pn = await d.panels(page); checks.P4_values = p4.speed === .75 && p4.semi === 3; const flat = pn.join(' ');
  checks.P4_readouts = /\b75\b/.test(flat.replace(/\?/g, ' ')) && /(^|\D)3(\D|$)/.test(flat.replace(/\?/g, ' ')) && /\b90\b/.test(flat); info.p4 = { p4, pn };
  await page.evaluate(() => { __S.speed = 1; __S.semi = 0; });

  // P6 hold, drag: from about 4.03 to 5.61 s -> 4 and 5.5 or so, on the half-beat grid
  const yAt = (t, ph) => HEAD + (t - ph) * PPS, ph = await pos();
  const p6 = await page.evaluate(async ({ X, y0, y1 }) => { G.down(X, y0); await G.frame(() => __S.sel, 900); await G.to(X, y1, { ms: 160, steps: 8 }); await G.wait(60); const sel = __S.sel && { ...__S.sel }; G.up(); await G.wait(120); return { sel, loop: __S.loop && { ...__S.loop } }; }, { X, y0: yAt(4.03, ph), y1: yAt(5.61, ph) });
  const onGrid = (t) => { const q = (t - song.b0) / .25; return Math.abs(q - Math.round(q)) < .02; };
  checks.P6_marksLoop = !!p6.loop && lib.near(p6.loop.a, 4, .13) && lib.near(p6.loop.b, 5.6, .15); checks.P6_snaps = !!p6.loop && onGrid(p6.loop.a) && onGrid(p6.loop.b); info.p6 = { p6, ph };
  const seekA = await pos(); checks.P6_seeksToStart = lib.near(seekA, p6.loop.a, .05);
  const ph2 = seekA, clr = await page.evaluate(async ({ X, y }) => { await G.tap(X, y); await G.wait(100); return { loop: !!__S.loop, pos: __S.pos / __S.song.sr }; }, { X, y: yAt((p6.loop.a + p6.loop.b) / 2, ph2) });
  checks.P6_tapClears = !clr.loop && lib.near(clr.pos, ph2, .05); info.clr = clr;

  // P7: a one-second loop at 90 %, trainer on: 90 -> 95 -> 100, and there it stays. G4: dark while playing
  const white = await page.screenshot(); const [w0] = await d.pixels(br, white, [{ x: 16, y: 16 }], DPR);
  const p7 = await page.evaluate(async ({ X, HEAD, CTL, PROP }) => { const sr = __S.song.sr, ph = __S.pos / sr, y = (t) => HEAD + (t - ph) * 42; G.down(X, y(8)); await G.frame(() => __S.sel, 900); await G.to(X, y(9), { ms: 140, steps: 6 }); await G.wait(40); G.up(); await G.wait(150); const loop = { ...__S.loop };
    __S.speed = .9; await G.tap(PROP.x, PROP.y); await G.wait(60); const trainer = __S.trainer; await G.tap(CTL.x, CTL.y); const seen = []; const t0 = performance.now(); while (performance.now() - t0 < 7000) { const k = __S.pass + ':' + __S.speed.toFixed(2); if (seen[seen.length - 1] !== k) seen.push(k); await G.wait(50); } return { loop, trainer, seen, play: __S.play, speed: __S.speed, pass: __S.pass }; }, { X, HEAD, CTL, PROP });
  const [k0] = await d.pixels(br, await page.screenshot({ path: `${dir}/playing.png` }), [{ x: 16, y: 16 }], DPR);
  await page.evaluate(({ x, y }) => G.tap(x, y), CTL); await page.waitForTimeout(600); const [w1] = await d.pixels(br, await page.screenshot(), [{ x: 16, y: 16 }], DPR);
  const sp = p7.seen.map(s => +s.split(':')[1]); checks.P7_trainer = p7.trainer && sp[0] === .9 && sp.includes(.95) && sp.includes(1) && Math.max(...sp) === 1 && sp.every((v, i) => !i || v >= sp[i - 1]); checks.P7_stopsAt100 = p7.speed === 1; info.p7 = p7;
  checks.G4_practice = w0[0] > 230 && k0[0] < 30 && w1[0] > 230; info.g4 = { w0, k0, w1 };
  const errors = d.clean(page); await br.close(); checks.noErrors = !errors.length;
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info, errors });
};
