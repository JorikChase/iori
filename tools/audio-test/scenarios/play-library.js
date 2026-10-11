/* Practice player with real audio only (no demo song): empty with an empty library; a seeded take is selected by the
   source dot and plays (position advances, also at 75 %); reopening restores source + position + speed; OPEN FILE
   makes the file the source and puts it in the library. The source dot opens a wheel (audio/wheel.js: OPEN FILE on
   top, takes oldest to newest downward); a choice is made with taps on the wheel (drag the drum, tap the band). */
const path = require('path');
module.exports = async (lib) => {
  const dir = lib.outDir('play-library'); const W = lib.VIEW.width, H = lib.VIEW.height;
  const br = await lib.browser(); const shots = []; const steps = {}; let pass = true;
  const check = (k, ok, data) => { steps[k] = { ok: !!ok, ...data }; pass = pass && !!ok; };
  // the file-chooser listener must be attached well before the tap: attaching it in the same tick as the click races
  // Playwright's interception switch, and an unintercepted headless chooser closes at once with no file
  const choosers = new Map(); const watch = (pg) => { const q = []; choosers.set(pg, q); pg.on('filechooser', c => q.push(c)); };
  const nextChooser = async (pg, ms = 5000) => { const q = choosers.get(pg), t0 = Date.now(); while (Date.now() - t0 < ms) { if (q.length) return q.shift(); await pg.waitForTimeout(50); } throw new Error('no file chooser opened'); };
  const shot = async (pg, name) => { const f = `${dir}/${name}.png`; await pg.screenshot({ path: f }); shots.push(f); return f; };
  const st = (pg) => pg.evaluate(() => ({ song: !!__S.song, len: __S.song ? __S.song.len : 0, sr: __S.song ? __S.song.sr : 0, bpm: __S.song ? __S.song.bpm : 0, b0: __S.song ? __S.song.b0 : 0,
    src: __S.src, play: __S.play, t: __S.song ? __S.pos / __S.song.sr : 0, speed: __S.speed, semi: __S.semi, ctx: !!__S.ctx, lib: __S.lib.length }));
  const until = async (pg, fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pg.evaluate(fn)) return true; await pg.waitForTimeout(100); } return false; };
  const src = [W - 34, 34], ctl = [W / 2, H - 46];
  /* the source wheel: open it with a tap on the dot, move the drum by `rows` (slow drag, + = finger down = towards the
     top row), tap the band to choose; returns the key chosen */
  const choose = async (pg, rows) => { await pg.mouse.click(...src); await pg.waitForTimeout(400);
    const w = await pg.evaluate(() => { const s = Wheel.last.state(); return { x: s.cols[0].x, y: s.bandY, rowH: s.rowH }; });
    if (rows) { await pg.mouse.move(w.x, w.y); await pg.mouse.down(); for (let k = 1; k <= 12; k++) { await pg.mouse.move(w.x, w.y + rows * w.rowH * k / 12); await pg.waitForTimeout(18); }
      await pg.waitForTimeout(180); await pg.mouse.up(); await pg.waitForTimeout(450); }
    const key = await pg.evaluate(() => __S.wheelKeys[Wheel.last.state().cols[0].idx]); await pg.mouse.click(w.x, w.y); return key; };

  const page = await lib.open(br, 'play', { wait: 800 });
  watch(page);
  // 1. empty library, first open: no song, no audio context; the play dot does nothing
  await page.mouse.click(...ctl); await page.waitForTimeout(300);
  let s = await st(page);
  check('empty', !s.song && !s.ctx && !s.play && s.lib === 0, s);
  steps.empty.file = await shot(page, '1-empty');

  // 2. seed a real take, choose it on the source wheel (pre-selected: the newest take): it becomes the source (beat grid = shared tempo, aligned to the clicks)
  const seeded = await page.evaluate(async () => { AT.setTempo(120); const b = await (await fetch('/tools/audio-test/signals/click120.wav')).blob();
    const m = await AT.takes.import(new File([b], 'click120.wav')); return { id: m.id, name: m.name, kind: m.kind }; });
  await until(page, () => __S.lib.length > 0);
  const k2 = await choose(page, 0); await until(page, () => !!__S.song);
  s = await st(page);
  const ph = s.b0 % 0.5;
  check('select', k2 === seeded.id && s.song && s.src && s.src.id === seeded.id && lib.near(s.len / s.sr, 30, 0.1) && s.bpm === 120 && (ph < 0.03 || ph > 0.47), { seeded, ...s });

  // 3. play 2 s at 100 %, then drag the play dot sideways to 75 % and play 2 s more
  await page.mouse.click(...ctl); await page.waitForTimeout(300);
  const a0 = (await st(page)).t; await page.waitForTimeout(2000); const a1 = (await st(page)).t;
  steps.loaded = { file: await shot(page, '2-playing') };
  await page.mouse.move(...ctl); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(ctl[0] - 10 * i, ctl[1]); await page.waitForTimeout(20); }
  await page.mouse.up(); await page.waitForTimeout(200);
  const b0 = await st(page); await page.waitForTimeout(2000); const b1 = await st(page);
  check('play', b0.play && b1.play && lib.near(a1 - a0, 2, 0.4) && lib.near(b1.speed, 0.75, 0.011) && lib.near(b1.t - b0.t, 1.5, 0.35),
    { adv100: +(a1 - a0).toFixed(3), speed: b1.speed, adv75: +(b1.t - b0.t).toFixed(3) });

  // 4. pause, then reopen: same source, same place, same speed
  await page.mouse.click(...ctl); await page.waitForTimeout(800);
  const p4 = await st(page); const saved = await page.evaluate(() => AT.session.load('play'));
  const url = page.url(); const p2 = await page.context().newPage(); const err2 = [];
  watch(p2);
  p2.on('console', m => { if (m.type() === 'error') err2.push(m.text()); }); p2.on('pageerror', e => err2.push('pageerror: ' + e.message));
  await p2.goto(url, { waitUntil: 'load' }); await until(p2, () => !!__S.song);
  const r = await st(p2);
  check('restore', !p4.play && r.src && r.src.id === seeded.id && lib.near(r.t, p4.t, 0.1) && lib.near(r.speed, 0.75, 0.011) && !r.play,
    { pausedAt: +p4.t.toFixed(3), restoredAt: +r.t.toFixed(3), speed: r.speed, saved });
  steps.restore.file = await shot(p2, '3-restored');

  // 5. the OPEN FILE row (one above the take) opens the picker; the file becomes the source + joins the library
  const k5 = await choose(p2, 1); const chooser = await nextChooser(p2);
  await chooser.setFiles(path.join(__dirname, '..', 'signals', 'tempo100to130.wav'));
  await until(p2, () => __S.src && __S.src.name === 'tempo100to130', 10000);
  const f = await st(p2);
  const libNow = await p2.evaluate(() => AT.takes.list().then(a => a.map(m => ({ id: m.id, kind: m.kind, name: m.name }))));
  check('openFile', k5 === 'file' && f.src && f.src.name === 'tempo100to130' && f.src.kind === 'file' && libNow.some(t => t.id === f.src.id && t.kind === 'file') && libNow.length === 2,
    { src: f.src, library: libNow });
  steps.openFile.file = await shot(p2, '4-file');

  // 6. back to the seeded take: one row above the file take (now the newest, at the bottom)
  const k6 = await choose(p2, 1); await until(p2, () => __S.src && __S.src.id !== undefined && __S.src.name === 'click120');
  const c = await st(p2);
  check('cycle', k6 === seeded.id && c.src && c.src.id === seeded.id, { src: c.src });

  const errors = page.errors.concat(err2).filter(e => !/serviceworker|service worker/i.test(e));
  check('noErrors', errors.length === 0, { errors });
  await lib.sheet(br, shots, `${dir}/sheet.png`, 4, 200);
  await page.context().close(); await br.close();
  return lib.result(dir, { pass, steps });
};
