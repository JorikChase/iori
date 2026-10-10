/* Editor: 8 tracks, 4 lanes on screen, sideways scrolling (owner, 2026-10-10).
   1. the + adds tracks up to 8; each new one scrolls into view; no + at 8
   2. a sideways drag on empty timeline scrolls lanes and settles on whole lanes; a vertical drag scrolls time only
   3. eight placements fill all eight tracks; the last lands on track 8 and its lane comes into view
   4. reload: 8 tracks, the offset and the clips come back
   5. a clip dragged to the right edge scrolls the lanes */
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('edit-lanes'); const W = lib.VIEW.width, H = lib.VIEW.height; const files = [];
  const page = await lib.open(br, 'edit', { wait: 900 }); const shot = async (n) => { const f = `${dir}/${n}.png`; await page.screenshot({ path: f }); files.push(f); };
  const st = () => page.evaluate(() => ({ tracks: __D.tracks.length, hx: +__S.hx.toFixed(3), hxT: __S.hxT, vt: +__S.vt.toFixed(3), clips: __D.clips.filter(c => !c.dying).map(c => c.t) }));
  const settle = () => page.waitForTimeout(700);
  const checks = {}, info = {};
  // 1. add tracks
  const seen = []; for (let i = 0; i < 7; i++) { await page.mouse.click(18, 30); await settle(); seen.push(await st()); }
  info.adds = seen.map(s => [s.tracks, s.hxT]);
  checks.eightTracks = seen[5].tracks === 8 && seen[6].tracks === 8;
  checks.newTrackInView = seen[5].hxT === 4 && seen[0].hxT === 0 && seen[2].hxT === 1;
  await shot('1-eight-tracks');
  // 2. sideways drag (right to left = scroll right is already at the end; drag left to right first)
  const drag = async (x0, y0, x1, y1, steps = 10) => { await page.mouse.move(x0, y0); await page.mouse.down(); for (let i = 1; i <= steps; i++) { await page.mouse.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await page.waitForTimeout(16); } await page.mouse.up(); };
  await drag(120, 420, 330, 424); await settle(); const a = await st();
  await shot('2-scrolled-left');
  await drag(300, 420, 210, 418, 8); await settle(); const b = await st();
  const v0 = await st(); await drag(200, 500, 204, 300); await settle(); const c = await st();
  info.drag = { a, b, vertical: { before: v0, after: c } };
  checks.sidewaysSnaps = lib.near(a.hx, a.hxT, .01) && Number.isInteger(a.hxT) && a.hxT < 4 && b.hxT > a.hxT && Number.isInteger(b.hxT);
  checks.verticalScrollsTimeOnly = c.hxT === v0.hxT && c.vt !== v0.vt;
  // 3. eight placements fill the eight tracks; the last lane comes into view
  await page.evaluate(() => { __S.hxT = 0; __S.vt = 0; __S.ph = 0; }); await settle();
  const id = await page.evaluate(async () => { const sr = 48000, d = new Float32Array(sr * 2); for (let i = 0; i < d.length; i++) d[i] = Math.sin(i / 15) * .3; return (await AT.takes.put({ name: 'lane', kind: 'rec', sr, data: d })).id; });
  await page.evaluate((id) => localStorage.setItem('audio.place', JSON.stringify(Array.from({ length: 8 }, () => ({ id, at: 'playhead' })))), id);
  await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'audio.place' }))); await page.waitForTimeout(400);
  await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); }); await page.waitForTimeout(1200);
  const d = await st(); info.placed = d; await shot('3-placed');
  checks.allEightTracksUsed = [0, 1, 2, 3, 4, 5, 6, 7].every(t => d.clips.includes(t)) && d.hxT === 4;
  // 4. reload
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1500); const e = await st(); info.reloaded = e;
  checks.restored = e.tracks === 8 && e.hxT === 4 && e.clips.length === 8;
  // 5. drag a clip (track 4 = first lane on screen) to the right edge -> lanes scroll? already at the end, so scroll home first
  await page.evaluate(() => { __S.hxT = 0; }); await settle();
  const geo = await page.evaluate(() => { const c = __D.clips.find(k => k.t === 0); return { x: c.cur.cx, y: c.cur.cy }; });
  await page.mouse.move(geo.x, geo.y); await page.mouse.down(); await page.waitForTimeout(450);
  const tgt = await page.evaluate(() => __S.tgt && __S.tgt[2]);
  const ux = tgt[0] - geo.x, uy = tgt[1] - geo.y, ul = Math.hypot(ux, uy);
  for (let i = 1; i <= 8; i++) { await page.mouse.move(geo.x + ux / ul * 12 * i, geo.y + uy / ul * 12 * i); await page.waitForTimeout(30); }
  const moving = await page.evaluate(() => !!__S.move);
  for (let i = 1; i <= 10; i++) { await page.mouse.move(geo.x + ux / ul * 96 + (W - 8 - geo.x - ux / ul * 96) * i / 10, geo.y); await page.waitForTimeout(30); }
  await page.waitForTimeout(900); const f = await st(); await shot('4-edge-scroll'); await page.mouse.up(); await settle(); const g = await st();
  info.edge = { moving, during: f, after: g };
  checks.edgeAutoScroll = moving && f.hxT >= 1;
  await lib.sheet(br, files, `${dir}/sheet.png`, 4, 180);
  const errors = page.errors.filter(x => !/service ?worker/i.test(x)); await page.context().close(); await br.close();
  checks.noErrors = !errors.length;
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info, errors });
};
