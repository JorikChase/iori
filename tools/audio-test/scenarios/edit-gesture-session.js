/* Editor — session persistence of every new clip field (AT.session 'edit', v3), made with the real gestures:
   A: fade-in (hold + drag); A | B: crossfade (hold the seam + drag); C: warp on, mode tones, curve equal power,
   transpose +3 (slide), gain -2.0 dB (slide), original tempo 110.0 (slide), fade-out (hold + drag), then reversed
   (twist past 90°, so the fades swap with the content).
   1. after the edits the saved session is v3 and lists all fields; reload -> every clip comes back with the same start,
      length, offset, source length, reverse, warp, mode, original tempo (+ its origin), transpose, gain, fades, curve
      and the same crossfade overlap
   2. a v2 session (old editor: k, t, s, d, off, rev) loads with the defaults: unwarped (sl = d), mode beats, original
      tempo = shared, no transpose / gain / fades, linear curve */
const E = require('./edit-gesture-base.js'), H = E.H;
const KEYS = ['t', 's', 'd', 'off', 'sl', 'rev', 'warp', 'mode', 'ot', 'ots', 'semi', 'gain', 'fin', 'fout', 'curve', 'xin', 'xout'];
module.exports = async (lib) => {
  const sfx = H.SFX(); const dir = lib.outDir('edit-gesture-session' + sfx); const br = await lib.browser(); const files = []; const checks = {}, info = {};
  const page = await E.std(lib, br, { snap: 0 });
  const v = await E.view(page), X0 = v.lanes[0], X1 = v.lanes[1]; let { A, B, C } = await E.abc(page);
  await E.holdDrag(page, X0, await E.yOf(page, A.s) + 5, 30);                       // A fade-in 0.5 s
  await E.holdDrag(page, X0, await E.yOf(page, B.s), 24);                           // A | B crossfade 0.4 s
  await E.select(page, X1, await E.yOf(page, C.s + C.d / 2));
  for (const pred of [o => o.kind === 'warp', o => o.kind === 'mode' && o.i === 1, o => o.kind === 'curve' && o.i === 1]) { const it = await E.item(page, pred); await H.tap(page, it.x, it.y); await page.waitForTimeout(200); }
  let it = await E.item(page, o => o.what === 'semi'); await H.drag(page, it.xr - 8, it.y, it.xr - 8, it.y - 42, { steps: 14, stepMs: 20 }); await page.waitForTimeout(150);
  it = await E.item(page, o => o.what === 'gain'); await H.drag(page, it.xr - 8, it.y, it.xr - 8, it.y + 20, { steps: 10, stepMs: 20 }); await page.waitForTimeout(150);
  it = await E.item(page, o => o.what === 'tempo'); await H.drag(page, it.xr - 12, it.y, it.xr - 12, it.y - 40, { steps: 10, stepMs: 20 }); await page.waitForTimeout(150);
  await E.deselect(page, X1, 520);
  C = await E.byId(page, C.id); await E.holdDrag(page, X1, await E.yOf(page, C.end) - 5, -30);   // C fade-out 0.5 s
  C = await E.byId(page, C.id); const cy = await E.yOf(page, C.s + C.d / 2), fr = H.twistFrames(X1, cy, 130, { n: 26 });
  await H.twoStart(lib, page, fr[0]); await page.waitForTimeout(30); for (const f of fr.slice(1)) { await H.twoMove(lib, page, f); await page.waitForTimeout(16); } await H.twoEnd(lib, page); await page.waitForTimeout(1200);
  await E.settle(page); await page.waitForTimeout(600);
  const before = await E.clips(page); await H.shot(page, dir, '1-edited', files);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('audio.session.edit')));
  const b = { A: before.find(c => c.id === A.id), B: before.find(c => c.id === B.id), C: before.find(c => c.id === C.id) };
  info.before = b; info.saved = saved;
  checks.editsMade = lib.near(b.A.fin, .5, 1e-6) && lib.near(b.A.xout, .4, 1e-6) && b.C.warp && b.C.mode === 'tones' && b.C.curve === 1 && b.C.semi === 3 && lib.near(b.C.gain, -2, 1e-9)
    && b.C.ot === 110 && b.C.ots === 'set' && b.C.rev && lib.near(b.C.fin, .5, 1e-6) && b.C.fout === 0;
  checks.savedV3AllFields = saved.v === 3 && saved.clips.length === 3 && saved.clips.every(c => ['k', 't', 's', 'd', 'off', 'rev', 'sl', 'warp', 'mode', 'ot', 'ots', 'semi', 'gain', 'fin', 'fout', 'curve'].every(k => k in c));
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300); await E.settle(page);
  const after = await E.clips(page); await H.shot(page, dir, '2-reloaded', files);
  const diffs = []; before.forEach((c, i) => { const a = after[i]; if (!a || a.k !== c.k) { diffs.push([i, 'missing']); return; }
    KEYS.forEach(k => { const x = c[k], y = a[k]; if (typeof x === 'number' ? !(Math.abs(x - y) <= 1e-9) : x !== y) diffs.push([i, k, x, y]); }); });
  info.after = after; info.diffs = diffs;
  checks.everyFieldRestored = after.length === before.length && diffs.length === 0;
  // 2. a v2 session
  const ids = page.ids;
  await page.evaluate((ids) => localStorage.setItem('audio.session.edit', JSON.stringify({ v: 2, tl: 33.6, ph: 0, vt: 0, pps: 60, snap: 1, push: 0, hx: 0, tracks: [{ m: 0, s: 0, a: 0 }],
    clips: [{ k: ids[2], t: 0, s: 1.2, d: 2.5, off: .5, rev: 1 }] })), ids);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300); await E.settle(page);
  const old = (await E.clips(page))[0]; info.v2 = old;
  checks.v2LoadsWithDefaults = !!old && old.s === 1.2 && old.d === 2.5 && old.sl === 2.5 && old.off === .5 && old.rev && !old.warp && old.mode === 'beats' && old.ot === 100 && old.ots === 'shared'
    && old.semi === 0 && old.gain === 0 && old.fin === 0 && old.fout === 0 && old.curve === 0;
  const errors = H.errorsOf(page); checks.noErrors = errors.length === 0;
  await lib.sheet(br, files, `${dir}/sheet.png`, 2, 220); await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), engine: lib.ENGINE, checks, info, errors });
};
