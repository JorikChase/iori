/* Editor — WARP per clip (Ableton model) and the warped STRETCH. One 440 Hz take, snap off.
   1. select C, warp on (panel) -> length = source length x original tempo / shared tempo (= unchanged at ot = shared)
   2. drag C's bottom edge down by a quarter of its length -> length x1.25 (pixel exact), source region unchanged, the
      original tempo moves to 100 / 1.25 = 80; after the WSOLA render (worklet-player.js Engine, 'beats' mode) the clip
      still sounds at 440 +-1 Hz in the offline replica of the play graph (__E.render), right to its new end
   3. the same clip in repitch mode drops to 440 / 1.25 = 352 Hz (the measurement can tell the difference)
   4. the shared tempo doubles (another tool): the warped clip's length halves; an unwarped clip keeps its seconds */
const E = require('./edit-gesture-base.js'), H = E.H;
module.exports = async (lib) => {
  const sfx = H.SFX(); const dir = lib.outDir('edit-gesture-stretch' + sfx); const br = await lib.browser(); const files = []; const checks = {}, info = {};
  const page = await E.std(lib, br, { snap: 0, specs: [{ name: 'a440', sec: 8, hz: 440, amp: .5 }], clips: (ids) => [{ k: ids[0], t: 0, s: 1.2, d: 3, off: 1, rev: 0 }, { k: ids[0], t: 1, s: 1.8, d: 4, off: 1, rev: 0 }] });
  await H.analysis(page);
  const v = await E.view(page), pps = v.pps, X1 = v.lanes[1];
  const cs0 = await E.clips(page), U = cs0.find(c => c.t === 0), C = cs0.find(c => c.t === 1);
  // 1. warp on
  await E.select(page, X1, await E.yOf(page, C.s + C.d / 2)); const wb = await E.item(page, o => o.kind === 'warp'); await H.tap(page, wb.x, wb.y); await page.waitForTimeout(300);
  const C1 = await E.byId(page, C.id); info.warped = C1;
  checks.warpOn = C1.warp && C1.ot === 100 && lib.near(C1.d, C1.sl * C1.ot / v.tempo, 1e-12) && lib.near(C1.d, C.d, 1e-12);
  // 2. stretch
  const px = Math.round(.25 * C1.d * pps), y = await E.yOf(page, C1.end) - 5;
  await H.drag(page, X1, y, X1, y + px, { up: false }); const g = await page.evaluate(() => ({ g: __E.gesture(), r: __E.state().readout })); await H.shot(page, dir, '2-stretch', files); await page.mouse.up();
  await page.waitForTimeout(250); await E.settle(page);
  const C2 = await E.byId(page, C.id), ratio = C2.d / C2.sl;
  const pitch = await page.evaluate(async ([id, s, d]) => { const x = await __E.render([id], 48000); return __AN.peak(x, 48000, s + d / 2 - .5, s + d / 2 + .5, 400, 470); }, [C.id, C2.s, C2.d]);
  const tail = await page.evaluate(async ([id, s, d]) => { const x = await __E.render([id], 48000); return { mid: __AN.amp(x, 48000, s + d / 2, 440), nearEnd: __AN.amp(x, 48000, s + d - .1, 440), after: __AN.amp(x, 48000, s + d + .05, 440, .02) }; }, [C.id, C2.s, C2.d]);
  info.stretch = { before: C1, after: C2, gesture: g, ratio, pitch, tail };
  checks.stretchChangesLength = g.g && g.g.phase === 'stretch' && lib.near(C2.d - C1.d, px / pps, 1e-6) && lib.near(C2.sl, C1.sl, 1e-12) && lib.near(C2.off, C1.off, 1e-12) && lib.near(ratio, 1.25, .01) && lib.near(C2.ot, 100 * ratio, 1e-6) && C2.ots === 'set';
  checks.stretchKeepsPitch = C2.ready && C2.mat === 'beats' && lib.near(pitch.f, 440, 1) && tail.nearEnd > .15 && tail.after < .02;
  // 3. repitch
  const mb = await E.item(page, o => o.kind === 'mode' && o.i === 2); await H.tap(page, mb.x, mb.y); await page.waitForTimeout(300); await E.settle(page);
  const C3 = await E.byId(page, C.id);
  const pitchR = await page.evaluate(async ([id, s, d]) => { const x = await __E.render([id], 48000); return __AN.peak(x, 48000, s + d / 2 - .5, s + d / 2 + .5, 320, 470); }, [C.id, C3.s, C3.d]);
  info.repitch = { clip: C3, pitch: pitchR };
  checks.repitchFollowsSpeed = C3.mode === 'repitch' && C3.mat === 'rate' && lib.near(pitchR.f, 440 / ratio, 1.5);
  await H.shot(page, dir, '3-repitch', files);
  // 4. the shared tempo doubles
  await page.evaluate(() => { localStorage.setItem('audio.tempo', '200'); const ch = new BroadcastChannel('audio'); ch.postMessage({ t: 'tempo', v: 200, src: 'metro' }); setTimeout(() => ch.close(), 50); });
  await page.waitForTimeout(500);
  const t4 = await page.evaluate(() => ({ clips: __E.clips(), tempo: __E.view().tempo, BEAT: __E.BEAT }));
  const C4 = t4.clips.find(c => c.id === C.id), U4 = t4.clips.find(c => c.id === U.id);
  info.tempo = { tempo: t4.tempo, BEAT: t4.BEAT, warped: C4, unwarped: U4 };
  checks.warpedFollowsSharedTempo = t4.tempo === 200 && lib.near(C4.d, C3.d / 2, 1e-9) && lib.near(t4.BEAT, .3, 1e-12);
  checks.unwarpedKeepsSeconds = lib.near(U4.d, U.d, 1e-12) && lib.near(U4.s, U.s, 1e-12);
  const errors = H.errorsOf(page); checks.noErrors = errors.length === 0;
  await lib.sheet(br, files, `${dir}/sheet.png`, 2, 200); await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), engine: lib.ENGINE, checks, info, errors });
};
