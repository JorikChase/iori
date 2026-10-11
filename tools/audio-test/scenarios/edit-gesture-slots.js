/* Editor — the shader slot budget after the port (5 vec4 per on-screen clip: box, rotation + held, source mapping,
   fades + crossfades, look). VIS = clamp(floor((MAX_FRAGMENT_UNIFORM_VECTORS - 112) / 5), 16, 48).
   1. the page's VIS matches that formula for this GPU and the program links (clips drawn, no console errors)
   2. merge fallback (window.__VIS = 6, the test hook): 24 one-second clips with fades and a crossfade, zoomed out so
      all are on screen -> at most 6 slots drawn (__NC), nothing vanishes (the drawn boxes still cover every clip's
      span), and a clip being twisted stays a slot of its own (it is not merged away) */
const E = require('./edit-gesture-base.js'), H = E.H;
module.exports = async (lib) => {
  const sfx = H.SFX(); const dir = lib.outDir('edit-gesture-slots' + sfx); const br = await lib.browser(); const files = []; const checks = {}, info = {};
  const page = await E.std(lib, br, { snap: 0 });
  const g = await page.evaluate(() => { const c = document.createElement('canvas').getContext('webgl'); return { mfu: c.getParameter(c.MAX_FRAGMENT_UNIFORM_VECTORS), VIS: __E.view().VIS, NC: __NC() }; });
  const want = Math.max(16, Math.min(48, Math.floor((g.mfu - 112) / 5)));
  info.budget = { ...g, want }; await H.shot(page, dir, '1-std', files);
  checks.visFromUniformBudget = g.VIS === want && g.NC === 3;
  const errors = H.errorsOf(page); await page.context().close();
  // 2. merge fallback
  const ctx = await br.newContext(lib.ENGINE === 'webkit' ? { viewport: lib.VIEW, deviceScaleFactor: lib.DPR, hasTouch: true } : { viewport: lib.VIEW, deviceScaleFactor: lib.DPR, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { window.__VIS = 6; });
  const p2 = await ctx.newPage(); const errs = []; p2.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p2.on('pageerror', e => errs.push('pageerror: ' + e.message)); p2.errors = errs;
  await p2.goto(`http://127.0.0.1:${+(process.env.AT_PORT || 8794)}/audio/t/edit.html`, { waitUntil: 'load' }); await p2.waitForTimeout(900);
  const ids = await H.seed(p2, [{ name: 'one', sec: 3, hz: 300, amp: .4 }]);
  const cl = []; for (let i = 0; i < 12; i++) { cl.push({ k: ids[0], t: 0, s: i * 1.2, d: 1, off: .5, rev: 0, fin: .2 }); cl.push({ k: ids[0], t: 1, s: i * 1.2 + .3, d: 1, off: .5, rev: i % 2, fout: .3 }); }
  cl[0].d = cl[0].sl = 1.5;   // overlaps the next clip in track 0 by 0.3 s: a crossfade
  await E.session(p2, cl, { snap: 0, pps: 20 });
  await p2.evaluate(() => { __S.pps = 20; __S.vt = 0; }); await p2.waitForTimeout(700);
  const m = await p2.evaluate(() => { const D = __E.drawn(), cs = __E.clips(), L = __E.view().lanes;
    const lost = cs.filter(c => !D.some(b => Math.abs(L[c.t] - b[0]) <= b[2] && Math.abs(__E.yOf(c.s + c.d / 2) - b[1]) <= b[3] + .5)).map(c => c.id);
    return { NC: __NC(), VIS: __E.view().VIS, n: cs.length, x0: cs[0].xout, lost }; });
  await H.shot(p2, dir, '2-merged', files);
  // twist one clip halfway (mode twist, held) and check it is still drawn as its own slot
  const cs = await E.clips(p2), tgt = cs.find(c => c.t === 1 && c.s > 5), v = await E.view(p2);
  const cx = v.lanes[1], cy = await E.yOf(p2, tgt.s + tgt.d / 2), fr = H.twistFrames(cx, cy, 50, { n: 10, r: 30 });
  await H.twoStart(lib, p2, fr[0]); await p2.waitForTimeout(30); for (const f of fr.slice(1)) { await H.twoMove(lib, p2, f); await p2.waitForTimeout(16); } await p2.waitForTimeout(150);
  const tw = await p2.evaluate((id) => { const c = __E.clips().find(c => c.id === id), y = __E.yOf(c.s + c.d / 2), hh = c.d * __E.view().pps / 2; return { two: __E.two(), ang: c.ang, NC: __NC(), own: __E.drawn().some(b => Math.abs(b[1] - y) < 1 && Math.abs(b[3] - hh) < 1) }; }, tgt.id); await H.shot(p2, dir, '2-merged-twisting', files);
  await H.twoEnd(lib, p2); await p2.waitForTimeout(800);
  info.merge = { ...m, twist: tw };
  checks.mergeFallback = m.VIS === 6 && m.n === 24 && m.NC >= 2 && m.NC <= 6 && m.x0 > .29 && m.lost.length === 0;
  checks.twistingClipStaysWhole = tw.two && tw.two.mode === 'twist' && Math.abs(tw.ang) > .5 && tw.NC <= 6 && tw.own;
  const errors2 = H.errorsOf(p2); checks.noErrors = errors.length + errors2.length === 0;
  await lib.sheet(br, files, `${dir}/sheet.png`, 3, 200); await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), engine: lib.ENGINE, checks, info, errors: errors.concat(errors2) });
};
