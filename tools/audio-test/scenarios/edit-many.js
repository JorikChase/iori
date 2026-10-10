/* Editor limits lifted (owner, 2026-10-10): any number of clips, bar numbers past 99.
   1. 40 placements of a 1 s take through the normal queue -> 40 clips, all persisted across a reload, drawn
      (on-screen slots), playback with them, undo still works.
   2. a 260 s take placed -> the timeline runs past bar 99; scroll there -> three-digit bar numbers drawn. */
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('edit-many'); const files = [];
  const page = await lib.open(br, 'edit', { wait: 900 });
  const put = (sec, hz, name) => page.evaluate(async ([sec, hz, name]) => { const sr = 48000, d = new Float32Array(Math.round(sr * sec));
    for (let i = 0; i < d.length; i++) d[i] = Math.sin(2 * Math.PI * hz * i / sr) * .3 * (1 - (i % sr) / sr); return (await AT.takes.put({ name, kind: 'rec', sr, data: d })).id; }, [sec, hz, name]);
  const id1 = await put(1, 330, 'short');
  await page.evaluate((id) => localStorage.setItem('audio.place', JSON.stringify(Array.from({ length: 40 }, () => ({ id, at: 'playhead' })))), id1);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(2500);
  const st = () => page.evaluate(() => ({ clips: __D.clips.filter(c => !c.dying).length, tracks: __D.tracks.length, tl: +__E.TL().toFixed(1), vis: (window.__EV ? __EV() : null) }));
  const a = await st(); let f = `${dir}/1-forty.png`; await page.screenshot({ path: f }); files.push(f);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(2000); const b = await st();
  // play with all of them, then stop
  const W = lib.VIEW.width, H = lib.VIEW.height;
  await page.mouse.click(W / 2, H - 30); await page.waitForTimeout(1500); const playing = await page.evaluate(() => ({ play: __S.play, nodes: __E.nodes ? __E.nodes() : null }));
  await page.mouse.click(W / 2, H - 30); await page.waitForTimeout(300);
  // pinch-free zoom-out by state so the whole set is on screen at once (stress the slot budget)
  await page.evaluate(() => { __S.pps = 4; __S.vt = 0; }); await page.waitForTimeout(600); f = `${dir}/2-zoomed-out.png`; await page.screenshot({ path: f }); files.push(f);
  const zoomed = await page.evaluate(() => ({ drawn: window.__NC ? __NC() : null }));
  // 2. a long take past bar 99
  const id2 = await put(260, 220, 'long');
  await page.evaluate((id) => localStorage.setItem('audio.place', JSON.stringify([{ id, at: 'playhead' }])), id2);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(3000);
  const c = await st(); const BAR = await page.evaluate(() => __E.BAR);
  await page.evaluate((BAR) => { __S.pps = 30; __S.vt = 101.5 * BAR; }, BAR); await page.waitForTimeout(700);
  f = `${dir}/3-bar-100s.png`; await page.screenshot({ path: f }); files.push(f);
  const g = `${dir}/3-gutter-zoom.png`; await page.screenshot({ path: g, clip: { x: 0, y: 60, width: 60, height: 300 } });
  await lib.sheet(br, files, `${dir}/sheet.png`, 3, 220);
  const errors = page.errors.filter(e => !/service ?worker/i.test(e)); await page.context().close(); await br.close();
  const bars = c.tl / BAR;
  const checks = { forty: a.clips === 40, persisted: b.clips === 40, played: playing.play === true, longTimelinePast99: bars > 100, noErrors: !errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, a, b, playing, zoomed, c, bars: +bars.toFixed(1), errors });
};
