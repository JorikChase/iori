/* File in -> BPM -> practice, inside the shell, leaving and returning; the shared tempo on its way through the tools.
   BPM: open a 120 BPM click file; select part of it: the shared tempo is 120. Metronome reads it. Editor grid reads it
   on open (L3). Practice: pick the file from the take wheel; its own tempo is on the readout whatever the shared tempo
   is; set 75 %, mark a loop, leave, return: source, speed, loop and position are back. */
const d = require('../drive'); const { kit, SLOW } = require('../flowkit');
module.exports = async (lib) => {
  const dir = lib.outDir('flow-file-bpm-practice' + (lib.ENGINE === 'webkit' ? '-webkit' : '')), W = lib.VIEW.width, H = lib.VIEW.height, checks = {}, info = {};
  const click = (bpm, sec) => { const sr = 48000, n = sr * sec, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    const a = new Float32Array(n); for (let k = 0; k * 60 / bpm * sr < n; k++) { const i0 = Math.round(k * 60 / bpm * sr); for (let i = 0; i < 2400 && i0 + i < n; i++) a[i0 + i] = .7 * Math.exp(-i / 500) * Math.sin(2 * Math.PI * 1200 * i / sr); } for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(a[i] * 32000), 44 + i * 2); return b; };
  const br = await lib.browser(); const page = await lib.open(br, 'shell', { wait: 600 }); await page.addInitScript(SLOW); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1000); const f = await kit(lib, page); const q = []; page.on('filechooser', c => q.push(c));
  let bpm = await f.open('bpm'); await bpm.evaluate(() => AT.setTempo(90));
  await page.mouse.click(W - 34, 34); const t0 = Date.now(); while (!q.length && Date.now() - t0 < 8000) await page.waitForTimeout(50); await q.shift().setFiles({ name: 'song.wav', mimeType: 'audio/wav', buffer: click(120, 24) });
  await bpm.waitForFunction(() => !__S.busy && __S.n > 0 && __S.res, null, { timeout: 20000 }); await page.waitForTimeout(400);
  const o = await bpm.evaluate(() => ({ res: __S.res, tempo: AT.tempo(), sel: { ...__S.sel }, id: __S.takeId })); checks.fileRead = lib.near(o.res.bpm, 120, 1); checks.openLeavesTempo = o.tempo === 90; info.opened = o;
  const yy = (t) => 124 + t / o.sel.b * (H - 106 - 124), s1 = await bpm.evaluate(async ({ a, b, x }) => { await G.drag(x, a, x, b, { ms: 200, steps: 10 }); await G.frame(() => !__S.busy, 3000); await G.wait(250); return AT.tempo(); }, { a: yy(5), b: yy(17), x: W / 2 }); checks.selectionSetsTempo = lib.near(s1, 120, 1); info.s1 = s1;
  await f.home(); bpm = await f.open('bpm'); await page.waitForTimeout(600); const kept = await bpm.evaluate(() => ({ n: __S.n, tempo: AT.tempo(), takeId: __S.takeId })); info.bpmBack = kept; checks.tempoSurvives = lib.near(kept.tempo, s1, .01);
  const me = await f.sw('metro'); const mb = await me.evaluate(() => __S.bpm); checks.metroReadsTempo = lib.near(mb, s1, .01);
  const ed = await f.sw('edit'); const beat = await ed.evaluate(() => __E.BEAT); checks.L3_editorGrid = lib.near(beat, 60 / s1, .002); info.beat = beat;
  await page.evaluate(() => {}); await ed.evaluate(() => AT.setTempo(75));
  // practice: source wheel, the newest row
  let pl = await f.sw('play'); await page.waitForTimeout(300); await page.mouse.click(W - 34, 34); await pl.waitForFunction(() => window.Wheel && Wheel.active(), null, { timeout: 4000 }); await page.waitForTimeout(350);
  const w = await pl.evaluate(() => { const s = Wheel.active().state(); return { x: s.cols[0].x, y: s.rect.top + s.rect.h / 2, n: Wheel.active().cols[0].items.length, idx: s.cols[0].idx }; }); await page.mouse.click(w.x, w.y); await pl.waitForFunction(() => __S.song && __S.src, null, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(500);
  const song = await pl.evaluate(() => ({ kind: __S.src && __S.src.kind, name: __S.src && __S.src.name, bpm: __S.song && __S.song.bpm })); checks.practiceLoads = song.kind === 'file' && song.name === 'song'; checks.ownTempo = lib.near(song.bpm, 120, .6); info.song = song;
  const CTL = { x: W / 2, y: H - 46 }, X = W / 2 + 60, HEAD = Math.round(H * .4);
  const set = await pl.evaluate(async ({ CTL, X, HEAD }) => { await G.drag(CTL.x, CTL.y, CTL.x - 100, CTL.y, { ms: 120, steps: 6 }); await G.wait(80); await G.tap(X, HEAD + 3 * 42); await G.wait(150); const ph = __S.pos / __S.song.sr; const y = (t) => HEAD + (t - ph) * 42; G.down(X, y(5)); await G.frame(() => __S.sel, 4000); await G.to(X, y(7), { ms: 160, steps: 8 }); await G.wait(50); G.up(); await G.wait(200); return { speed: __S.speed, loop: { ...__S.loop }, pos: __S.pos / __S.song.sr }; }, { CTL, X, HEAD }); info.set = set;
  await page.waitForTimeout(700); await f.home(); pl = await f.open('play'); await pl.waitForFunction(() => __S.song && __S.src, null, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(400);
  const got = await pl.evaluate(() => ({ speed: __S.speed, loop: __S.loop && { ...__S.loop }, pos: __S.pos / __S.song.sr, name: __S.src && __S.src.name })); info.got = got;
  checks.practiceSurvivesLeaving = got.name === 'song' && got.speed === .75 && !!got.loop && lib.near(got.loop.a, set.loop.a, .02) && lib.near(got.loop.b, set.loop.b, .02) && lib.near(got.pos, set.pos, .1);
  await page.screenshot({ path: `${dir}/end.png` });
  const errors = d.clean(page); await br.close(); checks.noErrors = !errors.length;
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info, errors });
};
