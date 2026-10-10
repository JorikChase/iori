/* Clip Lab — what you hear: the OfflineAudioContext replica of the play path (__CL.render runs the same build() the
   play dot uses), checked against values computed here from the seeded test signals and the clip parameters.
   Takes: A 440 Hz 0.5, B 660 Hz 0.5, C 330 Hz with amplitude ramping 0.1 -> 0.9 over its 8 s. Page ?rev=dbl.
   Gestures: fade-in on A (hold + drag 57 px), crossfade A|B (hold + drag 46 px), reverse C (double-tap).
   1. FADE (linear): A's 440 Hz amplitude at 25 / 50 / 75 % of the fade = master x 0.5 x 0.25 / 0.5 / 0.75; after
      switching A's curve to exponential, 50 % -> (e^2 - 1)/(e^4 - 1)
   2. CROSSFADE (equal power): at the overlap's midpoint each side is -3.01 dB (+-0.3); at 25 % cos / sin of pi/8;
      the summed power stays constant
   3. REVERSED: C's samples equal the source region read backwards (sample for sample, master gain, 16-bit library
      quantisation reproduced); its amplitude falls along the reversed ramp
   4. DECLICK: C's first 4 ms and B's last 4 ms ramp linearly (sample-exact model), never drawn
   5. GAIN -3.0 dB (slide) scales C by 0.708; TRANSPOSE +7 (slide) moves B to 988.8 Hz at unchanged length
   6. the live play dot runs the same graph: playing, the playhead advances */
const H = require('./cliplab-base.js');
module.exports = async (lib) => {
  const sfx = H.SFX(); const dir = lib.outDir('cliplab-render' + sfx); const br = await lib.browser(); const files = []; const checks = {}, info = {};
  const page = await H.openLab(lib, br, { q: '?rev=dbl' });
  await H.seed(page, [{ name: 'take-c', sec: 8, hz: 330, ramp: [.1, .9] }, { name: 'take-b', sec: 8, hz: 660, amp: .5 }, { name: 'take-a', sec: 8, hz: 440, amp: .5 }]);
  await H.reload(page); await H.analysis(page);
  const v = await H.view(page), pps = v.pps, X0 = v.lanes[0], X1 = v.lanes[1];
  let cs = await H.clips(page); const A = cs.find(c => c.take === 'take-a'), B = cs.find(c => c.take === 'take-b'), C = cs.find(c => c.take === 'take-c');
  const hold = async (x, y, dy, n = 1) => { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(320); const k = Math.ceil(Math.abs(dy) / 4);
    for (let i = 1; i <= k; i++) { await page.mouse.move(x, y + dy * i / k); await page.waitForTimeout(16); } await page.waitForTimeout(100); await page.mouse.up(); await page.waitForTimeout(250); };
  await hold(X0, await H.yOf(page, A.s) + 5, 57);
  await hold(X0, await H.yOf(page, B.s), 46);
  const cy = await H.yOf(page, C.s + C.d / 2); await H.tap(page, X1, cy, 40); await page.waitForTimeout(110); await H.tap(page, X1, cy, 40); await page.waitForTimeout(1100);
  await H.tap(page, X1, 560); await page.waitForTimeout(300); await H.settle(page);
  cs = await H.clips(page); const a = cs.find(c => c.id === A.id), b = cs.find(c => c.id === B.id), c = cs.find(c => c.id === C.id); const M = await page.evaluate(() => __CL.MASTER);
  info.clips = { a, b, c }; await H.shot(page, dir, 'render-setup', files);
  checks.setup = lib.near(a.fin, 57 / pps, 1e-6) && lib.near(a.end - b.s, 46 / pps, 1e-6) && c.rev;
  // 1. fade
  const fade = await page.evaluate(async ([id, s, fin]) => { const x = await __CL.render([id], 48000); return [.25, .5, .75].map(q => __AN.amp(x, 48000, s + fin * q, 440, .02)); }, [a.id, a.s, a.fin]);
  const fadeExp = [.25, .5, .75].map(q => M * .5 * q); info.fade = { got: fade, want: fadeExp };
  checks.fadeLinear = fade.every((g, i) => Math.abs(g / fadeExp[i] - 1) < .02);
  await H.tap(page, X0, await H.yOf(page, a.s + 3)); await page.waitForTimeout(450);
  const ce = (await page.evaluate(() => __CL.panel())).items.find(o => o.kind === 'curve' && o.i === 2); await H.tap(page, ce.x, ce.y); await page.waitForTimeout(200);
  const fe = await page.evaluate(async ([id, s, fin]) => { const x = await __CL.render([id], 48000); return __AN.amp(x, 48000, s + fin * .5, 440, .02); }, [a.id, a.s, a.fin]);
  const feW = M * .5 * (Math.exp(2) - 1) / (Math.exp(4) - 1); info.fadeExp = { got: fe, want: feW };
  checks.fadeExponential = Math.abs(fe / feW - 1) < .04;
  await H.tap(page, X1, 560); await page.waitForTimeout(300);
  // 2. crossfade
  const L = a.end - b.s;
  const xf = await page.evaluate(async ([ids, s0, L]) => { const x = await __CL.render(ids, 48000); return [.25, .5, .75].map(q => ({ q, a: __AN.amp(x, 48000, s0 + L * q, 440, .02), b: __AN.amp(x, 48000, s0 + L * q, 660, .02) })); }, [[a.id, b.id], b.s, L]);
  const full = M * .5, db = (g) => 20 * Math.log10(g / full); info.crossfade = { L, points: xf, midDb: [db(xf[1].a), db(xf[1].b)] };
  checks.crossfadeMinus3dB = Math.abs(db(xf[1].a) + 3.01) < .3 && Math.abs(db(xf[1].b) + 3.01) < .3;
  checks.crossfadeEqualPower = Math.abs(xf[0].a / (full * Math.cos(Math.PI / 8)) - 1) < .03 && Math.abs(xf[0].b / (full * Math.sin(Math.PI / 8)) - 1) < .04
    && xf.every(p => Math.abs((p.a * p.a + p.b * p.b) / (full * full) - 1) < .04);
  // 3 + 4. reversed C, declick at C's start and B's end
  const sig = await page.evaluate(async ([cc, bb, M]) => { const sr = 48000, N = 8 * sr, q16 = (v) => ((v * 32767) | 0) / 32767;
    const srcC = (j) => q16((.1 + .8 * j / N) * Math.sin(2 * Math.PI * 330 * j / sr)), srcB = (j) => q16(.5 * Math.sin(2 * Math.PI * 660 * j / sr));
    const x = await __CL.render([cc.id], sr), m0 = Math.round(cc.s * sr), i0 = Math.round(cc.off * sr), n = Math.round(cc.sl * sr);
    let errMid = 0; for (let i = sr; i < sr * 1.2; i++) errMid = Math.max(errMid, Math.abs(x[m0 + i] - M * srcC(i0 + n - 1 - i)));
    let errRamp = 0, errNoRamp = 0; for (let i = 0; i < 192; i++) { const e = M * srcC(i0 + n - 1 - i); errRamp = Math.max(errRamp, Math.abs(x[m0 + i] - e * i / 192)); errNoRamp = Math.max(errNoRamp, Math.abs(x[m0 + i] - e)); }
    const trend = [.5, 2.5, 4.5].map(t => ({ t, got: __AN.amp(x, sr, cc.s + t, 330, .04), want: M * (.1 + .8 * (cc.off + cc.sl - t) / 8) }));
    const y = await __CL.render([bb.id], sr), mb = Math.round(bb.s * sr), ib = Math.round(bb.off * sr), nb = Math.round(bb.sl * sr);
    let eEnd = 0, eEndNo = 0; for (let i = nb - 192; i < nb; i++) { const e = M * srcB(ib + i); eEnd = Math.max(eEnd, Math.abs(y[mb + i] - e * (nb - i) / 192)); eEndNo = Math.max(eEndNo, Math.abs(y[mb + i] - e)); }
    return { errMid, errRamp, errNoRamp, trend, eEnd, eEndNo, after: Math.abs(y[mb + nb + 5] || 0) }; }, [c, b, M]);
  info.reverse = sig;
  checks.reversedSampleExact = sig.errMid < 2e-4 && sig.trend.every(p => Math.abs(p.got / p.want - 1) < .03) && sig.trend[0].got > sig.trend[2].got;
  checks.declickStart = sig.errRamp < 2e-4 && sig.errNoRamp > .05;
  checks.declickEnd = sig.eEnd < 2e-4 && sig.eEndNo > .05 && sig.after < 1e-6;
  // 5. gain -3 dB on C, transpose +7 on B (slides on the readouts)
  const ampC0 = sig.trend[1].got;
  await H.tap(page, X1, cy); await page.waitForTimeout(450);
  let it = (await page.evaluate(() => __CL.panel())).items.find(o => o.what === 'gain'); await H.drag(page, it.xr - 8, it.y, it.xr - 8, it.y + 30, { steps: 10, stepMs: 20 }); await page.waitForTimeout(200);
  const cg = (await H.clips(page)).find(k => k.id === c.id);
  const ampC1 = await page.evaluate(async ([id, s]) => { const x = await __CL.render([id], 48000); return __AN.amp(x, 48000, s + 2.5, 330, .04); }, [c.id, c.s]);
  info.gain = { gain: cg.gain, ratio: ampC1 / ampC0 };
  checks.gain = cg.gain === -3 && Math.abs(ampC1 / ampC0 - Math.pow(10, -3 / 20)) < .005;
  await H.tap(page, X0, await H.yOf(page, b.s + b.d / 2 + .5)); await page.waitForTimeout(450);
  it = (await page.evaluate(() => __CL.panel())).items.find(o => o.what === 'semi'); await H.drag(page, it.xr - 8, it.y, it.xr - 8, it.y - 98, { steps: 14, stepMs: 20 }); await page.waitForTimeout(200); await H.settle(page, 8000);
  const bt = (await H.clips(page)).find(k => k.id === b.id);
  const pk = await page.evaluate(async ([id, s, d]) => { const x = await __CL.render([id], 48000); return __AN.peak(x, 48000, s + d / 2, s + d / 2 + .5, 900, 1080); }, [b.id, bt.s, bt.d]);
  info.transpose = { semi: bt.semi, mat: bt.mat, peak: pk, d: bt.d };
  checks.transpose = bt.semi === 7 && bt.mat === 'shift' && Math.abs(pk.f - 660 * Math.pow(2, 7 / 12)) < 2 && lib.near(bt.d, b.d, 1e-9);
  await H.tap(page, X1, 560); await page.waitForTimeout(300);
  // 6. live play
  await H.tap(page, v.play.x, v.play.y); await page.waitForTimeout(800); const pl = await H.st(page); await H.shot(page, dir, 'playing', files);
  await H.tap(page, v.play.x, v.play.y); await page.waitForTimeout(200); const ps = await H.st(page); info.play = { pl, ps };
  checks.livePlay = pl.play && pl.ph > .3 && !ps.play;
  const errors = H.errorsOf(page); checks.noErrors = errors.length === 0;
  await lib.sheet(br, files, `${dir}/sheet.png`, 2, 200); await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), engine: lib.ENGINE, checks, info, errors });
};
