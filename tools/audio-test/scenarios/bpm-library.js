/* BPM detector with real audio only (no demo): empty on first open; a recording REPLACES the strip, is kept in the
   library and does NOT write the shared tempo; a drag selection does; a take is picked from the properties dot's take
   wheel (still hold, release commits); an opened file is analysed and kept; reopening restores the last analysed take. */
const path = require('path');
module.exports = async (lib) => {
  const dir = lib.outDir('bpm-library'); const W = lib.VIEW.width, H = lib.VIEW.height;
  const br = await lib.browser(); const shots = []; const steps = {}; let pass = true;
  const check = (k, ok, data) => { steps[k] = { ok: !!ok, ...data }; pass = pass && !!ok; };
  // the file-chooser listener must be attached well before the tap: attaching it in the same tick as the click races
  // Playwright's interception switch, and an unintercepted headless chooser closes at once with no file
  const choosers = new Map(); const watch = (pg) => { const q = []; choosers.set(pg, q); pg.on('filechooser', c => q.push(c)); };
  const nextChooser = async (pg, ms = 5000) => { const q = choosers.get(pg), t0 = Date.now(); while (Date.now() - t0 < ms) { if (q.length) return q.shift(); await pg.waitForTimeout(50); } throw new Error('no file chooser opened'); };
  const shot = async (pg, name) => { const f = `${dir}/${name}.png`; await pg.screenshot({ path: f }); shots.push(f); return f; };
  const state = (pg) => pg.evaluate(() => ({ n: __S.n, rec: __S.rec, busy: __S.busy, whole: __S.whole, takeId: __S.takeId,
    secs: (__S.secs || []).map(x => ({ a: +x.a.toFixed(2), b: +x.b.toFixed(2), bpm: +x.bpm.toFixed(1) })), res: __S.res, tempo: AT.tempo() }));
  const idle = async (pg, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await pg.evaluate(() => ({ b: __S.busy, n: __S.n })); if (!s.b && s.n) return true; await pg.waitForTimeout(150); } return false; };
  const recBtn = [34 + (W - 68) / 3, H - 28], src = [W - 34, 34], prop = [W - 34, H - 28];
  const Y0 = 124, Y1 = H - 106;

  const page = await lib.open(br, 'bpm', { wait: 800, wav: 'click120.wav' });
  watch(page);
  // 1. first open: empty — no strip, no sections, no readout
  let s = await state(page);
  check('empty', s.n === 0 && s.secs.length === 0 && !s.res, { n: s.n, secs: s.secs.length });
  steps.empty.file = await shot(page, '1-empty');
  const tempo0 = s.tempo;

  // 2. record click120 for 12 s: the strip is only the recording, one section at 120, shared tempo untouched
  await page.mouse.click(...recBtn); await page.waitForTimeout(12000);
  await page.mouse.click(...recBtn); await page.waitForTimeout(1800);
  s = await state(page);
  const takes1 = await page.evaluate(() => AT.takes.list().then(a => a.map(m => ({ id: m.id, kind: m.kind, name: m.name, dur: +m.dur.toFixed(2) }))));
  const rec = takes1.find(t => t.kind === 'rec');
  const sessRec = await page.evaluate(() => AT.session.load('bpm'));
  check('record', !s.rec && s.n / 100 < 14 && s.n / 100 > 10 && s.secs.length === 1 && lib.near(s.secs[0].bpm, 120, 1.5) && s.whole
    && s.tempo === tempo0 && rec && lib.near(rec.dur, s.n / 100, 1.5) && sessRec && sessRec.id === rec.id,
    { stripSecs: s.n / 100, secs: s.secs, res: s.res, tempoBefore: tempo0, tempoAfter: s.tempo, take: rec, session: sessRec });
  steps.record.file = await shot(page, '2-recorded');

  // 3. drag on the strip (2 s -> 10 s): the selection writes the shared tempo
  const yAt = (t) => Y0 + t / (s.n / 100) * (Y1 - Y0);
  await page.mouse.move(W / 2, yAt(2)); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(W / 2, yAt(2) + (yAt(10) - yAt(2)) * i / 10); await page.waitForTimeout(40); }
  await page.mouse.up(); await page.waitForTimeout(400);
  const s3 = await state(page);
  check('dragSetsTempo', !s3.whole && s3.res && lib.near(s3.tempo, 120, 1.5), { res: s3.res, tempo: s3.tempo });
  steps.dragSetsTempo.file = await shot(page, '3-selection');

  // 4. hold the properties dot still: the take wheel (drag mode) lists every take, on the recording; release: analysed from its saved samples
  await page.evaluate(() => { __S.n = 0; __S.secs = []; __S.res = null; __S.envDirty = true; });   // prove it reloads
  await page.mouse.move(...prop); await page.mouse.down(); await page.waitForTimeout(450);
  const menu = await page.evaluate(() => { const w = Wheel.active(); return w ? { open: true, kind: w.kind, mode: w.mode, n: w.cols[0].n, sel: w.indices()[0], lib: __S.lib.length } : { open: false }; });
  await shot(page, '4-take-wheel');
  await page.mouse.up(); await idle(page);
  const s4 = await state(page);
  check('pickRecent', menu.open && menu.kind === 'takes' && menu.mode === 'drag' && menu.n === menu.lib && menu.sel === 0 && s4.takeId === rec.id && s4.secs.length === 1 && lib.near(s4.secs[0].bpm, 120, 1.5) && lib.near(s4.tempo, 120, 1.5),
    { menu, takeId: s4.takeId, secs: s4.secs, tempo: s4.tempo });

  // 5. open a file from the source dot (top-right): analysed, two sections, kept in the library, tempo untouched
  const tempo5 = s4.tempo;
  await page.mouse.click(...src); const chooser = await nextChooser(page);
  await chooser.setFiles(path.join(__dirname, '..', 'signals', 'tempo100to130.wav'));
  await page.waitForTimeout(500); await idle(page);
  let s5 = await state(page);
  for (let i = 0; i < 40 && s5.takeId === rec.id; i++) { await page.waitForTimeout(250); s5 = await state(page); }
  const takes5 = await page.evaluate(() => AT.takes.list().then(a => a.map(m => ({ id: m.id, kind: m.kind, name: m.name, dur: +m.dur.toFixed(2) }))));
  const ft = takes5.find(t => t.kind === 'file' && t.name === 'tempo100to130');
  check('file', ft && s5.takeId === ft.id && s5.secs.length === 2 && lib.near(s5.secs[0].bpm, 100, 1.5) && lib.near(s5.secs[1].bpm, 130, 1.5)
    && lib.near(s5.secs[0].b, 15, 4) && s5.tempo === tempo5, { take: ft, secs: s5.secs, tempoBefore: tempo5, tempoAfter: s5.tempo, library: takes5 });
  steps.file.file = await shot(page, '5-file');

  // 6. reopen (same browser profile): the last analysed take comes back
  const url = page.url(); const p2 = await page.context().newPage(); const err2 = [];
  watch(p2);
  p2.on('console', m => { if (m.type() === 'error') err2.push(m.text()); }); p2.on('pageerror', e => err2.push('pageerror: ' + e.message));
  await p2.goto(url, { waitUntil: 'load' }); await p2.waitForTimeout(600); await idle(p2);
  const s6 = await state(p2);
  check('restore', s6.takeId === ft.id && s6.secs.length === 2 && lib.near(s6.secs[0].bpm, 100, 1.5) && lib.near(s6.secs[1].bpm, 130, 1.5) && s6.tempo === tempo5,
    { takeId: s6.takeId, secs: s6.secs, tempo: s6.tempo });
  steps.restore.file = await shot(p2, '6-restored');

  const errors = page.errors.concat(err2).filter(e => !/serviceworker|service worker/i.test(e));
  check('noErrors', errors.length === 0, { errors });
  await lib.sheet(br, shots, `${dir}/sheet.png`, 4, 200);
  await page.context().close(); await br.close();
  return lib.result(dir, { pass, steps });
};
