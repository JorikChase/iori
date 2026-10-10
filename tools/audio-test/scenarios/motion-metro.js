/* Metronome start: the e-ink inversion (G4, G5) captured at exact instants on a virtual clock.
   Spec: 70 ms full inverse flash, 70 ms hold, then 5 ordered-dither steps of 56 ms (done at 420 ms).
   White = stopped, dark = running. One fresh page per instant (see lib.captureAt). */
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('motion-metro'); const W = lib.VIEW.width, H = lib.VIEW.height;
  const tap = async (page) => { await page.mouse.click(W / 2, H - 34); };          // start/stop dot (btn() in metro.html)
  const times = [0, 35, 69, 105, 139, 170, 226, 282, 338, 394, 430, 600];
  const fr = await lib.captureAt(br, 'metro', tap, times, dir, { probe: '({flash: __S.flash, inv: +__S.inv.toFixed(2), run: __S.run})' });
  await lib.sheet(br, fr.map(f => f.file), `${dir}/sheet.png`, 6, 160); await br.close();
  const by = (t) => fr.find(f => f.t === t);
  const checks = {
    flash: by(0).flash === 1 && by(0).lit < 0.1 && by(35).flash === 1 && by(69).flash === 1 && by(69).lit < 0.1,   // 0–70 ms: full inverse
    hold: by(105).flash === 0 && by(105).inv === 1 && by(105).lit > 0.9,
    dither: by(170).inv === 0.8 && by(226).inv === 0.6 && by(282).inv === 0.4 && by(338).inv === 0.2 && by(394).inv === 0,
    runningDark: by(600).run && by(600).lit < 0.1,
  };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, frames: fr.map(({ file, ...r }) => r) });
};
