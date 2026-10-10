/* Practice player with real audio only (no demo song): empty with an empty library; a seeded take is selected by the
   source dot and plays (position advances, also at 75 %); reopening restores source + position + speed; OPEN FILE
   makes the file the source and puts it in the library. */
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

  const page = await lib.open(br, 'play', { wait: 800 });
  watch(page);
  // 1. empty library, first open: no song, no audio context; the play dot does nothing
  await page.mouse.click(...ctl); await page.waitForTimeout(300);
  let s = await st(page);
  check('empty', !s.song && !s.ctx && !s.play && s.lib === 0, s);
  steps.empty.file = await shot(page, '1-empty');

  // 2. seed a real take, tap the source dot: it becomes the source (beat grid = shared tempo, aligned to the clicks)
  const seeded = await page.evaluate(async () => { AT.setTempo(120); const b = await (await fetch('/tools/audio-test/signals/click120.wav')).blob();
    const m = await AT.takes.import(new File([b], 'click120.wav')); return { id: m.id, name: m.name, kind: m.kind }; });
  await until(page, () => __S.lib.length > 0);
  await page.mouse.click(...src); await until(page, () => !!__S.song);
  s = await st(page);
  const ph = s.b0 % 0.5;
  check('select', s.song && s.src && s.src.id === seeded.id && lib.near(s.len / s.sr, 30, 0.1) && s.bpm === 120 && (ph < 0.03 || ph > 0.47), { seeded, ...s });

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

  // 5. next tap on the source dot (after the one recent take) opens the picker; the file becomes the source + joins the library
  await p2.mouse.click(...src); const chooser = await nextChooser(p2);
  await chooser.setFiles(path.join(__dirname, '..', 'signals', 'tempo100to130.wav'));
  await until(p2, () => __S.src && __S.src.name === 'tempo100to130', 10000);
  const f = await st(p2);
  const libNow = await p2.evaluate(() => AT.takes.list().then(a => a.map(m => ({ id: m.id, kind: m.kind, name: m.name }))));
  check('openFile', f.src && f.src.name === 'tempo100to130' && f.src.kind === 'file' && libNow.some(t => t.id === f.src.id && t.kind === 'file') && libNow.length === 2,
    { src: f.src, library: libNow });
  steps.openFile.file = await shot(p2, '4-file');

  // 6. one more tap cycles back to the newest take (the file is now newest -> next is the seeded take)
  await p2.mouse.click(...src); await until(p2, () => __S.src && __S.src.id !== undefined && __S.src.name === 'click120');
  const c = await st(p2);
  check('cycle', c.src && c.src.id === seeded.id, { src: c.src });

  const errors = page.errors.concat(err2).filter(e => !/serviceworker|service worker/i.test(e));
  check('noErrors', errors.length === 0, { errors });
  await lib.sheet(br, shots, `${dir}/sheet.png`, 4, 200);
  await page.context().close(); await br.close();
  return lib.result(dir, { pass, steps });
};
