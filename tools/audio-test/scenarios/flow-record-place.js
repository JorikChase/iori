/* The owner's core flow, end to end inside the shell (real clock, injected mic):
   home -> recorder (satellite 7) -> record 3 s -> hold the new take -> release on "place on timeline"
   -> the shell transitions to the editor -> the take is a clip at the playhead. Then home -> editor again:
   the clip is still there (session). Every frame boundary is real: two iframes, the shell's own transition. */
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('flow-record-place'); const W = lib.VIEW.width, H = lib.VIEW.height;
  const page = await lib.open(br, 'shell', { wait: 1200, wav: 'bursts.wav' });
  const tapHit = async (x, y, hold = 60) => { await page.evaluate(([x, y]) => document.getElementById('hit').dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'touch' })), [x, y]);
    await page.waitForTimeout(hold); await page.evaluate(([x, y]) => document.getElementById('hit').dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'touch' })), [x, y]); };
  const frame = (name) => page.frames().find(f => f.url().includes(`/t/${name}.html`));
  const shots = []; const shot = async (n) => { const f = `${dir}/${n}.png`; await page.screenshot({ path: f }); shots.push(f); };
  // 1. open the recorder from its satellite
  const sat = await page.evaluate(() => __SAT(7)); await tapHit(sat.x, sat.y);
  await page.waitForFunction(() => __S.mode === 'tool' && __S.tool === 7, null, { timeout: 8000 }); await page.waitForTimeout(400);
  const rec = frame('rec'); await shot('1-recorder');
  // 2. record 3 s
  const C = { x: W / 2, y: Math.round(H * .45) };
  await page.mouse.click(C.x, C.y); await rec.waitForFunction(() => __S.rec, null, { timeout: 6000 });
  await page.waitForTimeout(3000); await shot('2-recording'); await page.mouse.click(C.x, C.y);
  await rec.waitForFunction(() => __S.takes.length && __S.takes[0].meta && __S.takes[0].meta.kind === 'rec', null, { timeout: 8000 });
  await page.waitForTimeout(700);
  const take = await rec.evaluate(() => ({ id: __S.takes[0].key, dur: __S.takes[0].meta.dur }));
  await shot('3-take');
  // 3. hold the take, slide to the place bud, release
  const ty = Math.round(H * .45) + 84 + 44, x0 = W / 2 + 20;
  await page.mouse.move(x0, ty); await page.mouse.down(); await page.waitForTimeout(500);
  const buds = await rec.evaluate(() => ({ opened: !!(__S.press && __S.press.opened), tgt: __S.tgt }));
  const preloading = await page.evaluate(() => [...document.querySelectorAll('iframe')].map(f => f.getAttribute('src')));
  await shot('4-buds');
  const p = buds.tgt[0]; for (let k = 1; k <= 6; k++) await page.mouse.move(x0 + (p[0] - x0) * k / 6, ty + (p[1] - ty) * k / 6);
  await page.waitForTimeout(200);
  const tUp = await page.evaluate(() => performance.now()); await page.mouse.up();
  // 4. the shell switches to the editor
  await page.waitForFunction(() => __S.mode === 'tool' && __S.tool === 0, null, { timeout: 8000 });
  const switchMs = Math.round(await page.evaluate(() => performance.now()) - tUp);
  const edit = frame('edit');
  await edit.waitForFunction((id) => (window.__D && __D.clips || []).some(c => c.k === id), take.id, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600); await shot('5-editor');
  const placed = await edit.evaluate((id) => (__D.clips || []).filter(c => c.k === id).map(c => ({ t: c.t, s: +c.s.toFixed(2), d: +c.d.toFixed(2) })), take.id);
  // 5. home, then the editor again: the clip is restored from the session
  await tapHit(44, H - 44); await page.waitForFunction(() => __S.mode === 'home', null, { timeout: 8000 }); await page.waitForTimeout(300);
  const es = await page.evaluate(() => __SAT(0)); await tapHit(es.x, es.y);
  await page.waitForFunction(() => __S.mode === 'tool' && __S.tool === 0, null, { timeout: 8000 }); await page.waitForTimeout(900);
  const again = await frame('edit').evaluate((id) => (__D.clips || []).filter(c => c.k === id).length, take.id);
  await shot('6-editor-again');
  const live = await page.evaluate(() => [...document.querySelectorAll('iframe')].map(f => f.getAttribute('src')).filter(s => s && s !== 'about:blank'));
  await lib.sheet(br, shots, `${dir}/sheet.png`, 6, 160);
  const errors = page.errors.filter(e => !/service ?worker/i.test(e));
  await page.context().close(); await br.close();
  const checks = { takeLength: lib.near(take.dur, 3, 0.4), budsOpened: buds.opened, editorPreloadedDuringHold: preloading.some(s => s && s.includes('edit.html')),
    switchedToEditor: switchMs > 0 && switchMs < 950, clipPlaced: placed.length === 1 && lib.near(placed[0].d, take.dur, 0.05), restoredAfterLeaving: again === 1, oneLiveFrame: live.length === 1, noErrors: !errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, take, switchMs, placed, preloading, live, errors });
};
