/* Recorder: record 4 s from the injected microphone (bursts.wav) -> a 'rec' take of 4 s ±0.2 s appears at the top
   of the stack, and it is still there after a reload (it lives in the shared library, IndexedDB 'audio'). */
module.exports = async (lib) => {
  const dir = lib.outDir('rec-record'); const W = lib.VIEW.width, H = lib.VIEW.height; const C = { x: W / 2, y: Math.round(H * .45) };
  const br = await lib.browser();
  const page = await lib.open(br, 'rec', { wav: 'bursts.wav', wait: 800 });
  await page.mouse.click(C.x, C.y);                                            // first tap: asks for the mic, records once it arrives
  await page.waitForFunction(() => __S.rec === true, null, { timeout: 8000 });
  const t0 = Date.now(); await page.waitForTimeout(4000);
  await page.mouse.click(C.x, C.y); const held = (Date.now() - t0) / 1000;
  await page.waitForFunction(() => __S.takes.some(t => t.meta.kind === 'rec' && !t.gone), null, { timeout: 8000 });
  await page.waitForTimeout(600);
  const got = await page.evaluate(() => { const t = __S.takes[0]; return { id: t.key, span: __S.lastSpan, kind: t.meta.kind, dur: t.meta.dur, sr: t.meta.sr, env: Array.from(t.meta.env || []).some(v => v > 0.5), live: __S.live, nodes: __S.nodes.length }; });
  await page.screenshot({ path: `${dir}/after.png` });
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1000);
  const after = await page.evaluate(() => __S.takes.map(t => ({ id: t.key, kind: t.meta.kind, dur: t.meta.dur })));
  await page.screenshot({ path: `${dir}/reloaded.png` });
  const errors = page.errors; await br.close();
  const persisted = after.length > 0 && after[0].id === got.id && lib.near(after[0].dur, got.dur, 1e-6);
  const checks = { kindRec: got.kind === 'rec', dur4s: lib.near(got.dur, 4, 0.2), tapToTap: lib.near(got.dur, got.span, 0.03), top: true, persisted, envelope: got.env, noErrors: !errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, held, got, after, errors });
};
