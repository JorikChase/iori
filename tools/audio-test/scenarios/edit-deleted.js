/* Editor, a take deleted from the library. Decision: a clip never outlives its take.
   - deleted while the editor is closed (direct IndexedDB delete, no broadcast): the clip is dropped on the next open
     (S.dropped counts it) and the session no longer lists it
   - deleted while the editor is open (AT.takes.del -> onTakes): its clips shrink away; undo cannot bring them back */
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('edit-deleted'); const shots = [];
  const page = await lib.open(br, 'edit', { wait: 900 });
  const shot = async (n) => { const f = `${dir}/${n}.png`; await page.screenshot({ path: f }); shots.push(f); };
  const put = (name, sec, hz) => page.evaluate(async ([name, sec, hz]) => { const sr = 48000, d = new Float32Array(Math.round(sr * sec));
    for (let i = 0; i < d.length; i++) d[i] = Math.sin(2 * Math.PI * hz * i / sr) * 0.3; return (await AT.takes.put({ name, kind: 'rec', sr, data: d })).id; }, [name, sec, hz]);
  const ids = [await put('a', 2, 330), await put('b', 3, 220), await put('c', 1.5, 550)];
  await page.evaluate((ids) => localStorage.setItem('audio.place', JSON.stringify(ids.map(id => ({ id, at: 'playhead' })))), ids);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1200);
  const d0 = await page.evaluate(() => __D.clips.map(c => ({ k: c.k, t: c.t, s: c.s })));
  await shot('three-takes');
  await page.waitForTimeout(400);
  // closed: delete take a straight from IndexedDB (no event reaches the editor), then reopen
  await page.evaluate((id) => new Promise((res, rej) => { const r = indexedDB.open('audio'); r.onsuccess = () => { const t = r.result.transaction(['meta', 'pcm'], 'readwrite');
    t.objectStore('meta').delete(id); t.objectStore('pcm').delete(id); t.oncomplete = () => { r.result.close(); res(); }; t.onerror = rej; }; }), ids[0]);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1200);
  const d1 = await page.evaluate(() => ({ clips: __D.clips.map(c => c.k), dropped: __S.dropped, ses: JSON.parse(localStorage.getItem('audio.session.edit')).clips.map(c => c.k) }));
  // open: move nothing, make an edit (add a track) so undo has a snapshot holding take b, then delete b live
  await page.mouse.click(18, 30); await page.waitForTimeout(300);
  await page.evaluate((id) => AT.takes.del(id), ids[1]); await page.waitForTimeout(150);
  await shot('shrinking');
  await page.waitForTimeout(1200);
  const d2 = await page.evaluate(() => ({ clips: __D.clips.map(c => c.k), slots: __E.slots().map(s => ({ id: s.id, st: s.st })) }));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 600, id: 0 }, { x: 260, y: 600, id: 1 }] });
  await page.waitForTimeout(80); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(600);
  const d3 = await page.evaluate(() => ({ clips: __D.clips.filter(c => !c.dying).map(c => c.k), tracks: __D.tracks.length }));
  await shot('after-undo');
  const errors = page.errors.filter(e => !/serviceworker|service worker/i.test(e));
  await page.context().close();
  await lib.sheet(br, shots, `${dir}/sheet.png`, 3, 220); await br.close();
  const checks = {
    threePlaced: d0.length === 3 && d0.every((c, i) => c.k === ids[i]) && d0.map(c => c.t).join() === '0,1,2',
    droppedOnOpen: d1.dropped === 1 && !d1.clips.includes(ids[0]) && d1.clips.length === 2 && !d1.ses.includes(ids[0]),
    removedLive: !d2.clips.includes(ids[1]) && d2.clips.length === 1 && d2.slots.find(s => s.id === ids[1]).st === 2,
    undoKeepsItGone: !d3.clips.includes(ids[1]) && d3.clips.includes(ids[2]) && d3.tracks === 3,
    noErrors: errors.length === 0,
  };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, ids, d0, d1, d2, d3, errors });
};
