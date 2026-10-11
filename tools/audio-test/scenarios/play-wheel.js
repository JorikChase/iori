/* Practice player: the wheel picker (audio/wheel.js) on the source dot and on the readouts.
   Six takes are seeded (kinds rec / retro / file / synth / mix / rec, lengths 0:03 … 1:05), then, with real input only:
     1. tap the source dot -> a tap-mode wheel lists the 6 takes (kind icon + m:ss) and OPEN FILE, oldest to newest
        downward with OPEN FILE on top, the newest pre-selected; it is white (the player is stopped); the wheel and
        its cancel mark never overlap the dot
     2. drag the drum 4 rows down and tap the band -> take #5 (the 5th newest) loads
     3. press on the dot and pull down 1 row, release -> one gesture: a drag-mode wheel opens below the dot (not
        over it), crosses exactly one row and loads the take above (#6, the oldest)
     4. tap -> wheel, 1 row down to OPEN FILE, tap the band -> the system picker opens (listener armed 200 ms before);
        the chosen file (sine440.wav) becomes the source and joins the library
     5. play; tap the SPEED readout -> wheel 50…150 at 100, drag 13 rows, tap the band -> exactly 87 % in the page, in
        the engine's report and in the session; the wheel opened dark (the player runs). Every value wheel and its
        cancel mark hang below the readouts (y > 88)
     6. tap the PITCH readout -> wheel -12…+12 at 0, drag 5 rows, tap the band -> exactly -5; the engine's output
        peaks at 440·2^(-5/12) = 329.63 Hz (±1 Hz); session {speed .87, semi -5}
     7. speed wheel again, drag 3 rows (the engine follows live), tap the cancel mark -> back to 87 %
     8. tempo readout (shared tempo 120 -> 104 at 87 %) -> wheel, 4 rows down, band -> reads 100, speed = 100/120
   No console errors. */
const path = require('path');
const FREQ = async ([lo, hi]) => {
  if (!window.__AN) { const a = __S.ctx.createAnalyser(); a.fftSize = 32768; a.smoothingTimeConstant = 0; __S.node.connect(a); window.__AN = a; }
  await new Promise(r => setTimeout(r, 900));
  const an = window.__AN, n = an.fftSize, x = new Float32Array(n); an.getFloatTimeDomainData(x);
  const sr = __S.ctx.sampleRate, w = new Float32Array(n); let rms = 0;
  for (let i = 0; i < n; i++) { rms += x[i] * x[i]; w[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / n)); }
  let best = -1, bf = 0;
  const scan = (a, b, s) => { for (let f = a; f <= b; f += s) { const k = 2 * Math.PI * f / sr; let re = 0, im = 0, c = 1, d = 0; const ck = Math.cos(k), sk = Math.sin(k);
    for (let i = 0; i < n; i++) { re += w[i] * c; im += w[i] * d; const t = c * ck - d * sk; d = c * sk + d * ck; c = t; }
    const m = re * re + im * im; if (m > best) { best = m; bf = f; } } };
  scan(lo, hi, 1); const c0 = bf; best = -1; scan(c0 - 1.5, c0 + 1.5, 0.02);
  return { f: +bf.toFixed(2), rms: +Math.sqrt(rms / n).toFixed(4) };
};
module.exports = async (lib) => {
  const dir = lib.outDir('play-wheel' + (lib.ENGINE === 'webkit' ? '-webkit' : '')); const W = lib.VIEW.width, H = lib.VIEW.height;
  const br = await lib.browser(); const shots = []; const steps = {}; let pass = true;
  const check = (k, ok, data) => { steps[k] = { ok: !!ok, ...data }; pass = pass && !!ok; };
  const shot = async (pg, name) => { const f = `${dir}/${name}.png`; await pg.screenshot({ path: f }); shots.push(f); return f; };
  const until = async (pg, fn, ms = 8000, arg) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pg.evaluate(fn, arg)) return true; await pg.waitForTimeout(60); } return false; };
  const SRC = [W - 34, 34], CTL = [W / 2, H - 46];
  /* the open (or last) wheel: geometry, items, config */
  const wh = (pg) => pg.evaluate(() => { const h = Wheel.last; if (!h) return null; const s = h.state();
    return { ...s, kind: __S.wheelK, open: !s.closing, light: !!h.o.light, items: h.o.columns[0].items, keys: __S.wheelKeys, idx: s.cols[0].idx, x: s.cols[0].x }; });
  /* the dot's disc at its largest (breathing 16 px) and the wheel's panel + cancel mark (r 10 at 14 / 20 from the corner) */
  const overlap = (w) => { const dot = { l: SRC[0] - 16, t: SRC[1] - 16, r: SRC[0] + 16, b: SRC[1] + 16 };
    const rs = [{ l: w.rect.left, t: w.rect.top, r: w.rect.left + w.rect.w, b: w.rect.top + w.rect.h }];
    if (w.mode === 'tap') rs.push({ l: w.cancel.x - 10, t: w.cancel.y - 10, r: w.cancel.x + 10, b: w.cancel.y + 10 });
    const hit = rs.some(q => q.l < dot.r && q.r > dot.l && q.t < dot.b && q.b > dot.t);
    return { hit, gap: Math.round(Math.min(...rs.map(q => q.t)) - dot.b), dot, panel: rs[0], cancel: rs[1] || null }; };
  /* the readouts end at y 88 (pitch / tempo row): a value wheel and its cancel mark start below them */
  const clearOfReadouts = (w) => Math.min(w.rect.top, w.cancel.y - 10) > 88;
  /* a slow vertical drag on the open tap-mode wheel (no fling), from the band */
  const spin = async (pg, rows, from) => { const w = await wh(pg); const x = w.x, y = from == null ? w.bandY : from, dy = rows * w.rowH;
    await pg.mouse.move(x, y); await pg.mouse.down(); for (let k = 1; k <= 14; k++) { await pg.mouse.move(x, y + dy * k / 14); await pg.waitForTimeout(18); }
    await pg.waitForTimeout(180); await pg.mouse.up(); await pg.waitForTimeout(450); return (await wh(pg)).idx; };
  const band = async (pg) => { const w = await wh(pg); await pg.mouse.click(w.x, w.bandY); await pg.waitForTimeout(250); };
  const choosers = []; const st = (pg) => pg.evaluate(() => ({ src: __S.src, speed: __S.speed, semi: __S.semi, play: __S.play, rep: __S.rep ? { seq: __S.rep.seq, speed: __S.rep.speed } : null,
    lib: __S.lib.length, wheel: !!__S.wheel, bpm: __S.song ? __S.song.bpm : 0, eng: __S.eng }));

  const page = await lib.open(br, 'play', { wait: 600 }); page.on('filechooser', c => choosers.push(c));
  /* seed: six takes, oldest first, each a quiet sine of its own length */
  const KINDS = ['rec', 'retro', 'file', 'synth', 'mix', 'rec'], DUR = [3, 5, 7, 9, 11, 65];
  await page.evaluate(async ([KINDS, DUR]) => { AT.session.save('play', null); AT.setTempo(120);
    for (let i = 0; i < DUR.length; i++) { const sr = 8000, x = new Float32Array(sr * DUR[i]); for (let j = 0; j < x.length; j++) x[j] = Math.sin(j / 7) * .2;
      await AT.takes.put({ name: 'seed' + i, kind: KINDS[i], sr, data: x }); await new Promise(r => setTimeout(r, 15)); } }, [KINDS, DUR]);
  await page.reload({ waitUntil: 'load' }); await until(page, () => __S.lib.length === 6);
  const metas = await page.evaluate(() => AT.takes.list().then(a => a.map(m => ({ id: m.id, kind: m.kind, dur: Math.round(m.dur), name: m.name }))));   // newest first
  const ICON = { rec: 'microphone', retro: 'history', file: 'file-music', synth: 'wave-sine', mix: 'device-floppy' };
  const fmt = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

  /* 1 */
  await page.mouse.click(...SRC); await page.waitForTimeout(400);
  let w = await wh(page); await shot(page, '1-source-wheel');
  const wantItems = [{ icon: 'file-music' }].concat(metas.slice().reverse().map(m => ({ icon: ICON[m.kind], text: fmt(m.dur) })));
  const ov1 = overlap(w);
  check('list', w && w.open && w.kind === 'src' && w.mode === 'tap' && w.cols[0].n === 7 && JSON.stringify(w.items) === JSON.stringify(wantItems) &&
    JSON.stringify(w.keys) === JSON.stringify(['file'].concat(metas.slice().reverse().map(m => m.id))) && w.idx === 6 && w.light === true && !ov1.hit,
    { n: w.cols[0].n, items: w.items, preselected: w.idx, light: w.light, overlap: ov1 });

  /* 2: take #5 = 5th newest = row 2 */
  const idx2 = await spin(page, 4); await shot(page, '2-take5-in-band'); await band(page);
  await until(page, (id) => __S.src && __S.src.id === id, 8000, metas[4].id);
  let s = await st(page);
  check('take5', idx2 === 2 && s.src && s.src.id === metas[4].id && !s.wheel, { bandRow: idx2, want: metas[4], src: s.src });

  /* 3: press-drag-release on the dot: pull down 1 row -> the oldest take */
  await page.mouse.move(...SRC); await page.mouse.down();
  for (let k = 1; k <= 12; k++) { await page.mouse.move(SRC[0], SRC[1] + 46 * k / 12); await page.waitForTimeout(20); }
  await page.waitForTimeout(120); const w3 = await wh(page); await shot(page, '3-press-drag'); await page.mouse.up();
  await until(page, (id) => __S.src && __S.src.id === id, 8000, metas[5].id);
  s = await st(page); const ov3 = overlap(w3);
  check('pressDrag', w3.kind === 'src' && w3.mode === 'drag' && w3.changes === 1 && w3.idx === 1 && !ov3.hit && s.src && s.src.id === metas[5].id,
    { mode: w3.mode, rowsCrossed: w3.changes, rowAtRelease: w3.idx, overlap: ov3, src: s.src });

  /* 4: OPEN FILE row -> picker -> the file is the source and in the library */
  await page.mouse.click(...SRC); await page.waitForTimeout(400); const idx4 = await spin(page, 1); await shot(page, '4-open-file-row');
  await page.waitForTimeout(200); const nC = choosers.length; await band(page);
  const t0 = Date.now(); while (choosers.length === nC && Date.now() - t0 < 5000) await page.waitForTimeout(50);
  const chooser = choosers[nC]; if (chooser) await chooser.setFiles(path.join(lib.ROOT, 'tools/audio-test/signals/sine440.wav'));
  await until(page, () => __S.src && __S.src.name === 'sine440', 10000);
  s = await st(page);
  check('openFile', idx4 === 0 && !!chooser && s.src && s.src.name === 'sine440' && s.src.kind === 'file' && s.lib === 7, { bandRow: idx4, chooser: !!chooser, src: s.src, lib: s.lib });

  /* 5: play, speed wheel -> 87 % */
  await page.mouse.click(...CTL); await until(page, () => __S.eng === 'ready' && __S.ctx.state === 'running' && __S.play); await page.waitForTimeout(700);
  await page.mouse.click(W / 2, 47); await page.waitForTimeout(400);
  const w5 = await wh(page); await shot(page, '5-speed-wheel');
  const idx5 = await spin(page, 13); await band(page); await page.waitForTimeout(300);
  s = await st(page); let sess = await page.evaluate(() => AT.session.load('play'));
  check('speed87', w5.kind === 'speed' && w5.idx === 50 && w5.items[0] === '50' && w5.items[100] === '150' && w5.light === false && idx5 === 37 &&
    s.speed === 0.87 && s.rep && s.rep.speed === 0.87 && sess.speed === 0.87 && clearOfReadouts(w5),
    { opened: w5.items[w5.idx], light: w5.light, bandRow: idx5, speed: s.speed, engine: s.rep, session: sess.speed, wheelTop: w5.rect.top, cancelTop: w5.cancel.y - 10 });

  /* 6: pitch wheel -> -5, measured on the engine's output */
  await page.mouse.click(W / 2 - 40, 80); await page.waitForTimeout(400);
  const w6 = await wh(page); await shot(page, '6-pitch-wheel');
  const idx6 = await spin(page, 5); await band(page); await page.waitForTimeout(300);
  s = await st(page); sess = await page.evaluate(() => AT.session.load('play'));
  const f6 = await page.evaluate(FREQ, [280, 380]); const want6 = 440 * Math.pow(2, -5 / 12);
  check('pitchMinus5', w6.kind === 'semi' && w6.items[0] === '-12' && w6.items[24] === '+12' && w6.items[w6.idx] === '0' && idx6 === 7 && s.semi === -5 && s.speed === 0.87 &&
    sess.semi === -5 && sess.speed === 0.87 && lib.near(f6.f, want6, 1) && f6.rms > 0.03 && clearOfReadouts(w6),
    { opened: w6.items[w6.idx], bandRow: idx6, semi: s.semi, session: { speed: sess.speed, semi: sess.semi }, outHz: f6.f, wantHz: +want6.toFixed(2), rms: f6.rms });
  await shot(page, '6b-after-pitch');

  /* 7: cancel puts the value back (the engine followed the spin live) */
  await page.mouse.click(W / 2, 47); await page.waitForTimeout(400); await spin(page, 3);
  const live = await st(page); const w7 = await wh(page); await page.mouse.click(w7.cancel.x, w7.cancel.y); await page.waitForTimeout(300);
  s = await st(page);
  check('cancel', live.speed === 0.84 && s.speed === 0.87 && s.rep && s.rep.speed === 0.87 && !s.wheel, { whileSpinning: live.speed, afterCancel: s.speed, engine: s.rep });

  /* 8: tempo at speed -> 100 BPM */
  await page.mouse.click(W / 2 + 40, 80); await page.waitForTimeout(400);
  const w8 = await wh(page); const idx8 = await spin(page, 4); await band(page); await page.waitForTimeout(300);
  s = await st(page);
  check('tempo100', w8.kind === 'tempo' && clearOfReadouts(w8) && s.bpm === 120 && w8.items[w8.idx] === '104' && w8.items[idx8] === '100' && lib.near(s.speed, 100 / 120, 1e-9) && lib.near(s.rep.speed, 100 / 120, 1e-9),
    { opened: w8.items[w8.idx], chose: w8.items[idx8], speed: s.speed, engine: s.rep });
  await shot(page, '8-tempo-100');

  const errors = page.errors.filter(e => !/serviceworker|service worker/i.test(e));
  check('noErrors', errors.length === 0, { errors });
  await lib.sheet(br, shots, `${dir}/sheet.png`, 5, 180);
  await page.context().close(); await br.close();
  return lib.result(dir, { pass, engine: lib.ENGINE, steps, shots });
};
