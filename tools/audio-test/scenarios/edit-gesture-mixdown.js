/* Editor — the SAVE / EXPORT MIXDOWN (the property row's save bud -> a 'mix' take in the library) contains what the
   gestures made, checked numerically against values computed here from the seeded takes and the clip parameters.
   Takes: A 440 Hz 0.5, B 660 Hz 0.5, C 330 Hz with amplitude ramping 0.1 -> 0.9 over its 8 s. Layout (pps 60, snap off):
   A track 0 s 1.2 / B track 0 s 4.2 (touching) / C track 1 s 8.0, alone after B.
   Gestures: fade-in on A (hold the top edge + drag 57 px), crossfade A | B (hold the seam + drag 46 px: A runs on under
   B), reverse C (two-finger twist past 90°). Then props -> save; the mix is read back from the library (16-bit).
   1. FADE (linear): A's 440 Hz amplitude at 25 / 50 / 75 % of the fade = 0.8 x 0.5 x 0.25 / 0.5 / 0.75 (+-2 %)
   2. CROSSFADE (equal power): at the overlap's midpoint each side is -3.01 dB (+-0.3 dB) of its full level; at 25 %
      cos / sin of pi/8; the summed power stays constant
   3. REVERSED: C's samples equal the source region read backwards (sample for sample, x 0.8), its amplitude falls along
      the reversed ramp
   4. DECLICK: C's first 4 ms and B's last 4 ms ramp linearly (sample-exact model); without the ramp they would not match
   5. the mix runs to C's end (12.0 s) exactly */
const E = require('./edit-gesture-base.js'), H = E.H;
module.exports = async (lib) => {
  const sfx = H.SFX(); const dir = lib.outDir('edit-gesture-mixdown' + sfx); const br = await lib.browser(); const files = []; const checks = {}, info = {};
  const page = await E.std(lib, br, { snap: 0, specs: [{ name: 'take-c', sec: 8, hz: 330, ramp: [.1, .9] }, { name: 'take-b', sec: 8, hz: 660, amp: .5 }, { name: 'take-a', sec: 8, hz: 440, amp: .5 }], cs: 8.0 });
  await H.analysis(page);
  const v = await E.view(page), pps = v.pps, X0 = v.lanes[0], X1 = v.lanes[1]; let { A, B, C } = await E.abc(page);
  await E.holdDrag(page, X0, await E.yOf(page, A.s) + 5, 57);
  await E.holdDrag(page, X0, await E.yOf(page, B.s), 46);
  const cy = await E.yOf(page, C.s + C.d / 2), fr = H.twistFrames(X1, cy, 130, { n: 26 });
  await H.twoStart(lib, page, fr[0]); await page.waitForTimeout(30); for (const f of fr.slice(1)) { await H.twoMove(lib, page, f); await page.waitForTimeout(16); } await H.twoEnd(lib, page); await page.waitForTimeout(1200);
  ({ A, B, C } = await E.abc(page)); info.clips = { A, B, C }; await H.shot(page, dir, '1-setup', files);
  checks.setup = lib.near(A.fin, 57 / pps, 1e-6) && lib.near(A.end - B.s, 46 / pps, 1e-6) && C.rev && lib.near(C.s, 8, 1e-12) && (await page.evaluate(() => __E.sel())) === null;
  // save: props -> the save bud
  await H.tap(page, v.prop.x, v.prop.y); await page.waitForTimeout(450);
  const bud = await page.evaluate(() => __E.bud(3)); await H.tap(page, bud.x, bud.y);
  await page.waitForFunction(() => __E.mix().st === 'ready', null, { timeout: 15000 }).catch(() => {});
  const mix = await page.evaluate(() => __E.mix()); info.mix = mix; await page.waitForTimeout(300); await H.shot(page, dir, '2-saved', files);
  checks.saved = mix.st === 'ready' && !!mix.id && mix.sr === 48000;
  const M = .8, sr = 48000;
  const r = await page.evaluate(async ([id, A, B, C]) => {
    const sr = 48000, x = (await AT.takes.get(id)).data, out = { len: x.length };
    out.fade = [.25, .5, .75].map(q => __AN.amp(x, sr, A.s + A.fin * q, 440, .02));
    const L = A.end - B.s; out.L = L;
    out.xf = [.25, .5, .75].map(q => ({ q, a: __AN.amp(x, sr, B.s + L * q, 440, .02), b: __AN.amp(x, sr, B.s + L * q, 660, .02) }));
    const srcC = (await AT.takes.get(C.k)).data, m0 = Math.round(C.s * sr), n = Math.round(C.sl * sr), e0 = Math.round((C.off + C.sl) * sr);
    let errMid = 0; for (let i = sr; i < sr * 1.2; i++) errMid = Math.max(errMid, Math.abs(x[m0 + i] - .8 * srcC[e0 - 1 - i]));
    let errRamp = 0, errNoRamp = 0; for (let i = 0; i < 192; i++) { const e = .8 * srcC[e0 - 1 - i]; errRamp = Math.max(errRamp, Math.abs(x[m0 + i] - e * i / 192)); errNoRamp = Math.max(errNoRamp, Math.abs(x[m0 + i] - e)); }
    out.trend = [.5, 2, 3.5].map(t => ({ t, got: __AN.amp(x, sr, C.s + t, 330, .04), want: .8 * (.1 + .8 * (C.off + C.sl - t) / 8) }));
    const srcB = (await AT.takes.get(B.k)).data, mb = Math.round(B.s * sr), ib = Math.round(B.off * sr), nb = Math.round(B.sl * sr);
    let eEnd = 0, eEndNo = 0; for (let i = nb - 192; i < nb; i++) { const e = .8 * srcB[ib + i]; eEnd = Math.max(eEnd, Math.abs(x[mb + i] - e * (nb - i) / 192)); eEndNo = Math.max(eEndNo, Math.abs(x[mb + i] - e)); }
    Object.assign(out, { errMid, errRamp, errNoRamp, eEnd, eEndNo, afterB: Math.abs(x[mb + nb + 5] || 0), n });
    return out; }, [mix.id, A, B, C]);
  info.analysis = r;
  const fadeW = [.25, .5, .75].map(q => M * .5 * q), full = M * .5, db = (g) => 20 * Math.log10(g / full);
  info.fadeWant = fadeW; info.crossfadeMidDb = [db(r.xf[1].a), db(r.xf[1].b)];
  checks.mixFadeLinear = r.fade.every((g, i) => Math.abs(g / fadeW[i] - 1) < .02);
  checks.mixCrossfadeMinus3dB = Math.abs(db(r.xf[1].a) + 3.01) < .3 && Math.abs(db(r.xf[1].b) + 3.01) < .3;
  checks.mixCrossfadeEqualPower = Math.abs(r.xf[0].a / (full * Math.cos(Math.PI / 8)) - 1) < .03 && Math.abs(r.xf[0].b / (full * Math.sin(Math.PI / 8)) - 1) < .04
    && r.xf.every(p => Math.abs((p.a * p.a + p.b * p.b) / (full * full) - 1) < .04);
  checks.mixReversedSampleExact = r.errMid < 2e-4 && r.trend.every(p => Math.abs(p.got / p.want - 1) < .03) && r.trend[0].got > r.trend[2].got;
  checks.mixDeclickStart = r.errRamp < 2e-4 && r.errNoRamp > .05;
  checks.mixDeclickEnd = r.eEnd < 2e-4 && r.eEndNo > .05 && r.afterB < 1e-4;
  checks.mixLength = r.len === Math.round(12 * sr);
  const errors = H.errorsOf(page); checks.noErrors = errors.length === 0;
  await lib.sheet(br, files, `${dir}/sheet.png`, 2, 220); await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), engine: lib.ENGINE, checks, info, errors });
};
