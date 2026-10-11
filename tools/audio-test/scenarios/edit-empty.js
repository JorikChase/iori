/* Editor, first-ever open: an empty two-track timeline (dark, bar numbers, beat ticks), no clips, no generated audio.
   The source must hold no synthesis code (the old gen() demo parts), and the shelf (a take wheel) of an empty library
   shows only the open-file row. */
const fs = require('fs'); const path = require('path');
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('edit-empty'); const shots = [];
  const src = fs.readFileSync(path.join(lib.ROOT, 'audio', 't', 'edit.html'), 'utf8');
  const synth = ['function gen(', 'createOscillator', 'gen(0)', 'init()', 'Math.sin(2*Math.PI', 'Math.exp(-x'].filter(s => src.includes(s));
  const page = await lib.open(br, 'edit', { wait: 1200 });
  const st = await page.evaluate(() => ({ ready: __S.ready, clips: __D.clips.length, tracks: __D.tracks.length, slots: __E.slots().length,
    inv: __S.inv, session: localStorage.getItem('audio.session.edit') }));
  let f = `${dir}/empty.png`; let png = await page.screenshot({ path: f }); shots.push(f); const litEmpty = await lib.lit(br, png);
  // properties corner -> shelf bud: only the open-file row with an empty library
  await page.mouse.click(lib.VIEW.width - 34, lib.VIEW.height - 30); await page.waitForTimeout(400);
  await page.mouse.click(lib.VIEW.width - 94, lib.VIEW.height - 30); await page.waitForTimeout(700);
  const shelf = await page.evaluate(() => { const w = Wheel.active(); return { open: __S.shelf, takes: __S.shelfTakes.length, keys: __E.shelf().keys, rows: w ? w.o.columns[0].items : [] }; });
  f = `${dir}/empty-shelf.png`; await page.screenshot({ path: f }); shots.push(f);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);   // cancel the wheel
  // play/stop on an empty timeline: no errors
  await page.mouse.click(lib.VIEW.width / 2, lib.VIEW.height - 30); await page.waitForTimeout(600);
  const playing = await page.evaluate(() => __S.play);
  await page.mouse.click(lib.VIEW.width / 2, lib.VIEW.height - 30); await page.waitForTimeout(300);
  const errors = page.errors.filter(e => !/serviceworker|service worker/i.test(e));
  await page.context().close();
  await lib.sheet(br, shots, `${dir}/sheet.png`, 2, 240); await br.close();
  const saved = st.session ? JSON.parse(st.session) : null;
  const checks = {
    noSynthCode: synth.length === 0,
    ready: st.ready === true,
    emptyTwoTracks: st.clips === 0 && st.tracks === 2 && st.slots === 0,
    dark: st.inv === 1 && litEmpty < 0.2 && litEmpty > 0.001,
    sessionSavedEmpty: !!saved && saved.clips.length === 0 && saved.tracks.length === 2,
    shelfOnlyFileRow: shelf.open && shelf.takes === 0 && shelf.keys.join() === 'file' && shelf.rows.length === 1 && shelf.rows[0].icon === 'file-music',
    playStop: playing === true,
    noErrors: errors.length === 0,
  };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, synth, st, litEmpty, shelf, errors });
};
