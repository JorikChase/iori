/* Editor placement + persistence, with real takes written through the library API (test fixtures, not app audio):
   1. tap the timeline to set the playhead, queue a take with AT.place's queue, reload -> the clip is at the playhead
      in track 0 with the take's duration, and the playhead came back from the session
   2. reload again -> the timeline is restored from the session (same clips, same places)
   3. live: another page of the app queues a second take while the editor is open -> it lands (storage event)
   4. play / stop with clips -> buffers built, no console errors
   5. hold a clip, drag it out along the move bud, drop it lower; two-finger tap -> undo puts it back
   6. samples that arrive late: AT.takes.get held back 1.5 s, a take placed and played at once -> skipped, then joins */
const path = require('path');
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('edit-place'); const shots = []; const W = lib.VIEW.width, H = lib.VIEW.height;
  const PORT = +(process.env.AT_PORT || 8794);
  const page = await lib.open(br, 'edit', { wait: 900 });
  const put = (name, sec, hz) => page.evaluate(async ([name, sec, hz]) => { const sr = 48000, d = new Float32Array(Math.round(sr * sec));
    for (let i = 0; i < d.length; i++) d[i] = Math.sin(2 * Math.PI * hz * i / sr) * 0.3 * (0.4 + 0.6 * Math.abs(Math.sin(Math.PI * i / sr * 2)));
    return (await AT.takes.put({ name, kind: 'rec', sr, data: d })).id; }, [name, sec, hz]);
  const doc = () => page.evaluate(() => ({ ph: __S.ph, tl: __E.TL(), tracks: __D.tracks.length,
    clips: __D.clips.filter(c => !c.dying).map(c => ({ k: c.k, t: c.t, s: +c.s.toFixed(4), d: +c.d.toFixed(4), off: c.off, rev: c.rev })), slots: __E.slots() }));
  const BEAT = await page.evaluate(() => __E.BEAT);
  const shot = async (n) => { const f = `${dir}/${n}.png`; await page.screenshot({ path: f }); shots.push(f); };
  const checks = {}; const info = {};

  // 1. playhead at bar 2 beat 1 (s = 4 beats), then a queued placement + reload
  const yAt = (s) => 66 + s * 30;   // TOP + s*pps at vt 0, default zoom
  await page.mouse.click(W * 0.3, yAt(4 * BEAT) + 1); await page.waitForTimeout(500);
  info.phSet = await page.evaluate(() => __S.ph);
  const id1 = await put('take-a', 2, 330);
  await page.evaluate((id) => localStorage.setItem('audio.place', JSON.stringify([{ id, at: 'playhead' }])), id1);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1200);
  const d1 = await doc(); info.afterPlace = d1;
  const c1 = d1.clips[0];
  checks.placedAtPlayhead = d1.clips.length === 1 && c1.k === id1 && c1.t === 0 && lib.near(c1.s, 4 * BEAT, 1e-3) && lib.near(c1.d, 2, 1e-3);
  checks.playheadRestored = lib.near(d1.ph, 4 * BEAT, 1e-3);
  checks.queueCleared = (await page.evaluate(() => localStorage.getItem('audio.place'))) === null;
  checks.samplesLoaded = d1.slots.length === 1 && d1.slots[0].loaded && d1.slots[0].st === 1;

  // 3. live placement from another page of the app (the editor stays open)
  const id2 = await put('take-b', 3, 220);
  const other = await page.context().newPage(); await other.goto(`http://127.0.0.1:${PORT}/tools/audio-test/package.json`);
  await other.evaluate((id) => localStorage.setItem('audio.place', JSON.stringify([{ id, at: 'playhead' }])), id2);
  await page.waitForTimeout(900); await other.close();
  const d2 = await doc(); info.afterLive = d2;
  const c2 = d2.clips.find(c => c.k === id2);
  checks.livePlacement = d2.clips.length === 2 && !!c2 && c2.t === 1 && lib.near(c2.s, 4 * BEAT, 1e-3) && lib.near(c2.d, 3, 1e-3);
  await shot('populated');

  // 2. reload -> restored from the session
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1200);
  const d3 = await doc(); info.afterReload = d3;
  checks.restored = JSON.stringify(d3.clips) === JSON.stringify(d2.clips) && d3.tracks === d2.tracks && lib.near(d3.ph, d2.ph, 1e-6);
  await shot('restored');

  // 4. play / stop with clips
  await page.mouse.click(W / 2, H - 30); await page.waitForTimeout(1500);
  const p1 = await page.evaluate(() => ({ play: __S.play, nodes: __E.nodes(), bufs: __E.slots().map(s => s.buf) }));
  await shot('playing');
  await page.mouse.click(W / 2, H - 30); await page.waitForTimeout(400);
  const p2 = await page.evaluate(() => ({ play: __S.play, ph: __S.ph }));
  info.play = { p1, p2 };
  checks.playStop = p1.play && p1.nodes === 2 && p1.bufs.every(Boolean) && !p2.play && p2.ph > 4 * BEAT - 0.01;

  // 5. move then undo. Clip A: track 0, s = 4 beats, 2 s long.
  await page.evaluate(() => { __S.ph = 0; });
  const cx = 30 + (W - 36) / 2 * 0.5, cy = yAt(4 * BEAT + 1);
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.waitForTimeout(450);
  const tgt = await page.evaluate(() => __S.tgt && __S.tgt[2]);
  const ux = (tgt[0] - cx), uy = (tgt[1] - cy), ul = Math.hypot(ux, uy);
  for (let i = 1; i <= 8; i++) { await page.mouse.move(cx + ux / ul * 12 * i, cy + uy / ul * 12 * i); await page.waitForTimeout(30); }
  const moving = await page.evaluate(() => !!__S.move);
  const ex = cx, ey = cy + 6 * BEAT * 30;   // six beats lower, same track
  for (let i = 1; i <= 12; i++) { await page.mouse.move(lerp(cx + ux / ul * 96, ex, i / 12), lerp(cy + uy / ul * 96, ey, i / 12)); await page.waitForTimeout(40); }
  await page.waitForTimeout(300); await page.mouse.up(); await page.waitForTimeout(400);
  const d4 = await doc(); const a4 = d4.clips.find(c => c.k === id1);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 600, id: 0 }, { x: 260, y: 600, id: 1 }] });
  await page.waitForTimeout(80);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(500);
  const d5 = await doc(); const a5 = d5.clips.find(c => c.k === id1);
  info.move = { moving, tgt, after: a4, undone: a5 };
  checks.moveThenUndo = moving && !!a4 && a4.s > 4 * BEAT + 0.5 && !!a5 && lib.near(a5.s, 4 * BEAT, 1e-3) && a5.t === 0;
  await page.waitForTimeout(500);
  const sv = await page.evaluate(() => JSON.parse(localStorage.getItem('audio.session.edit')));
  checks.undoPersisted = lib.near(sv.clips.find(c => c.k === id1).s, 4 * BEAT, 1e-3);

  // 6. late samples: hold get() back, place a take while playing
  await page.evaluate(() => { const g = AT.takes.get; AT.takes.get = (id) => new Promise(r => setTimeout(() => r(g(id)), 1500)); __S.ph = 0; });
  const id3 = await put('take-c', 4, 440);
  await page.mouse.click(W / 2, H - 30); await page.waitForTimeout(200);
  const other2 = await page.context().newPage(); await other2.goto(`http://127.0.0.1:${PORT}/tools/audio-test/package.json`);
  await other2.evaluate((id) => localStorage.setItem('audio.place', JSON.stringify([{ id, at: 'playhead' }])), id3); await other2.close();
  await page.waitForTimeout(500);
  const l1 = await page.evaluate((id) => ({ clip: !!__D.clips.find(c => c.k === id), slot: __E.slots().find(s => s.id === id), nodes: __E.nodes(), play: __S.play }), id3);
  await shot('late-loading');
  await page.waitForTimeout(1800);
  const l2 = await page.evaluate((id) => ({ slot: __E.slots().find(s => s.id === id), nodes: __E.nodes(), play: __S.play }), id3);
  await page.mouse.click(W / 2, H - 30); await page.waitForTimeout(300);
  info.late = { l1, l2 };
  checks.lateSamplesSkippedThenJoin = l1.clip && l1.play && l1.slot && !l1.slot.loaded && l2.slot.loaded && l2.slot.buf && l2.nodes === l1.nodes + 1;

  const errors = page.errors.filter(e => !/serviceworker|service worker/i.test(e));
  checks.noErrors = errors.length === 0;
  await page.context().close();
  await lib.sheet(br, shots, `${dir}/sheet.png`, 4, 220); await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info, errors });
};
function lerp(a, b, t) { return a + (b - a) * t; }
