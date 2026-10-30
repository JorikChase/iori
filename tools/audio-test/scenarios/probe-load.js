/* Gate 2, ?quick: JS and SIMD kernels stepped to a limit, then the percentile pass with and without DOM work */
const p = require('../probe-lib');
module.exports = async (lib) => {
  const br = await lib.browser(); const ctx = await p.context(br);
  const page = await p.open(ctx, '?quick');
  await p.tap(page, 'Worklet load'); await p.view(page, 'load');
  await p.tap(page, 'Start'); await p.view(page, 'loading');
  await page.waitForTimeout(1500); await p.tap(page, 'Stop'); await p.view(page, 'load');   // an unfinished run keeps what it has and continues
  const stopped = (await p.data(page)).load[0].stopped;
  await p.tap(page, 'Continue'); await p.view(page, 'loading'); await p.view(page, 'load', 280000);
  const r = (await p.data(page)).load[0], js = r.kernels.js, simd = r.kernels.simd;
  const iso = await page.evaluate(() => crossOriginIsolated);
  const fine = (k) => k.pass.length === 6 && k.pass.every((x) => x.clock === (iso ? 'sab' : 'date'));
  const dom = (k) => k.pass.filter((x) => x.dom).every((x) => x.domFps > 5);
  const pass = stopped === 'stopped' && (await p.data(page)).load.length === 1 && r.done && js.underrunAt > js.limit && simd.limit >= js.limit && js.steps.length > 1 && simd.steps.length > 1 && js.limit > 0 && simd.limit > 0 && fine(js) && fine(simd) && dom(js) && !!r.drift && !page.errors.length && !js.steps.some((s) => s.nan);
  const res = { pass, stopped, sr: r.sr, js: { limit: js.limit, at: js.underrunAt, idle: js.idle && js.idle.glitches, clk: js.clockStepUs, top: js.steps.slice(-2), pass: js.pass.slice(-2) }, simd: { limit: simd.limit, at: simd.underrunAt, idle: simd.idle && simd.idle.glitches, top: simd.steps.slice(-2), pass: simd.pass.slice(-2) }, drift: r.drift, errors: page.errors };
  await br.close(); return res;
};
