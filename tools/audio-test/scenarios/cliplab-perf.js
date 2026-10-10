/* Clip Lab — frame times while the two heaviest gestures draw (DPR 1; headless engines render GL in software, so
   the frame interval measures the harness machine as much as the page — the JS work per frame is the page's own).
   1. a two-finger twist of 130° spread over 60+ frames
   2. a crossfade drag (hold the seam, drag 120 px) over 60+ frames
   Each: >= 60 frames recorded during the gesture, no frame interval over 50 ms (three 60 Hz frames), the page's JS
   per frame (all of frame(): springs, uniforms, icons, readouts) p95 under 4 ms. Six frames of each are kept.
   info.idle = the same page at rest, for comparison (software GL on a loaded machine stalls with or without gestures). */
const H = require('./cliplab-base.js');
module.exports = async (lib) => {
  const sfx = H.SFX(); const dir = lib.outDir('cliplab-perf' + sfx); const br = await lib.browser(); const files = []; const checks = {}, info = {};
  const page = await H.openLab(lib, br, { dpr: 1 }); await H.seed(page, H.STD); await H.reload(page); await page.waitForTimeout(500);
  const v = await H.view(page); const cs = await H.clips(page); const B = cs.find(c => c.take === 'take-b'), C = cs.find(c => c.take === 'take-c');
  const stats = (fr) => { const dts = fr.slice(1).map(f => f.dt).sort((a, b) => a - b), js = fr.map(f => f.js).sort((a, b) => a - b), q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
    return { frames: fr.length, meanDt: +(dts.reduce((s, x) => s + x, 0) / Math.max(1, dts.length)).toFixed(2), p95Dt: +q(dts, .95).toFixed(2), worstDt: +dts[dts.length - 1].toFixed(2), over50: dts.filter(x => x > 50).length,
      over25: dts.filter(x => x > 25).length, jsMean: +(js.reduce((s, x) => s + x, 0) / js.length).toFixed(3), jsP95: +q(js, .95).toFixed(3), jsMax: +js[js.length - 1].toFixed(3) }; };
  const now = () => page.evaluate(() => performance.now());
  // screenshots stall the compositor, so each gesture runs twice: timed without shots, then again for the frames
  const cx = v.lanes[1], cy = await H.yOf(page, C.s + C.d / 2), y = await H.yOf(page, B.s), X0 = v.lanes[0];
  const twist = async (shots) => { const fr = H.twistFrames(cx, cy, 130, { n: 64 }); const t0 = await now(); await H.twoStart(lib, page, fr[0]);
    for (let k = 1; k < fr.length; k++) { await H.twoMove(lib, page, fr[k]); await page.waitForTimeout(16); if (shots && k % 11 === 0) await H.shot(page, dir, 'twist-' + String(k).padStart(2, '0'), files); }
    await H.twoEnd(lib, page); const t1 = await now(); await page.waitForTimeout(1100); return [t0, t1]; };
  const xfade = async (shots) => { await page.mouse.move(X0, y); await page.mouse.down(); await page.waitForTimeout(320); const t0 = await now();
    for (let k = 1; k <= 64; k++) { await page.mouse.move(X0, y + 120 * k / 64); await page.waitForTimeout(16); if (shots && k % 11 === 0) await H.shot(page, dir, 'xfade-' + String(k).padStart(2, '0'), files); }
    const t1 = await now(); await page.mouse.up(); await page.waitForTimeout(300); return [t0, t1]; };
  // baseline: the same page at rest for ~1.1 s (the frame loop draws every frame, as the editor does): what the machine gives
  const b0 = await now(); await page.waitForTimeout(1100); const b1 = await now(); info.idle = stats(await page.evaluate(([a, b]) => __CL.perf(a).filter(f => f.t <= b), [b0, b1]));
  let w = await twist(false); const tw = stats(await page.evaluate(([a, b]) => __CL.perf(a).filter(f => f.t <= b), w)); info.twist = tw;
  await twist(true);   // flips it back (reversed twice)
  w = await xfade(false); const xf = stats(await page.evaluate(([a, b]) => __CL.perf(a).filter(f => f.t <= b), w)); info.crossfade = xf;
  await page.evaluate(() => 0); await H.twoStart(lib, page, [{ x: 120, y: 600 }, { x: 260, y: 600 }]); await page.waitForTimeout(80); await H.twoEnd(lib, page); await page.waitForTimeout(400);   // undo the crossfade
  await xfade(true);
  const ok = (s) => s.frames >= 60 && s.over50 === 0 && s.jsP95 < 4;
  checks.twistNoLongFrames = ok(tw); checks.crossfadeNoLongFrames = ok(xf);
  const errors = H.errorsOf(page); checks.noErrors = errors.length === 0;
  await lib.sheet(br, files, `${dir}/sheet.png`, 6, 150); await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), engine: lib.ENGINE, checks, info, errors });
};
