/* Snippets for the owner: each element the wheel would go on, as it is now and with the wheel opened in place.
   Real tool pages, real takes in the library (written through AT.takes.put), wheel.js injected. Not a pass/fail test. */
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('wheel-targets'); const W = lib.VIEW.width, H = lib.VIEW.height; const files = [];
  const DUR = [12, 47, 65, 150, 8, 221];   // seconds of the seeded takes, oldest first
  const fmt = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  const takesNewest = DUR.slice().reverse().map(fmt);
  const seed = async (page) => page.evaluate(async (DUR) => { for (const d of DUR) { const sr = 8000, x = new Float32Array(sr * d); for (let i = 0; i < x.length; i++) x[i] = Math.sin(i / 9) * .25 * (1 - (i % sr) / sr); await AT.takes.put({ name: 't' + d, kind: 'rec', sr, data: x }); } }, DUR);
  const top = { x: 0, y: 0, width: W, height: H / 2 }, bottom = { x: 0, y: H / 2, width: W, height: H / 2 };
  const shot = async (page, name, clip) => { const f = `${dir}/${name}.png`; await page.screenshot({ path: f, clip }); files.push(f); };
  const wheel = async (page, opts) => { await page.addScriptTag({ url: '/audio/wheel.js' }); await page.evaluate((o) => { window.__wh = Wheel.open(Object.assign({ mode: 'tap' }, o)); }, opts); await page.waitForTimeout(700); };
  const cases = [
    { n: '1 editor shelf', tool: 'edit', clip: bottom, light: false,
      prep: async (p) => { await p.mouse.click(W - 34, H - 30); await p.waitForTimeout(400); await p.mouse.click(W - 94, H - 30); await p.waitForTimeout(800); },
      wheel: { anchor: { x: W - 110, y: H - 230 }, columns: [{ items: [{ icon: 'file-music' }].concat(takesNewest), index: 1 }] } },
    { n: '2 practice source', tool: 'play', clip: top, light: true, prep: async (p) => { await p.waitForTimeout(400); },
      wheel: { anchor: { x: W - 90, y: 150 }, columns: [{ items: takesNewest.concat([{ icon: 'file-music' }]), index: 0 }] } },
    { n: '3 analyzer source', tool: 'ana', clip: top, light: true, prep: async (p) => { await p.waitForTimeout(400); },
      wheel: { anchor: { x: W - 90, y: 150 }, columns: [{ items: [{ icon: 'microphone' }].concat(takesNewest, [{ icon: 'file-music' }]), index: 0 }] } },
    { n: '4 bpm recent takes', tool: 'bpm', clip: bottom, light: false,
      prep: async (p) => { const b = { x: 34 + 3 * (W - 68) / 3, y: H - 28 }; await p.mouse.move(b.x, b.y); await p.mouse.down(); await p.waitForTimeout(600); },
      after: async (p) => { await p.mouse.up(); await p.waitForTimeout(300); },
      wheel: { anchor: { x: W - 110, y: H - 230 }, columns: [{ items: takesNewest, index: 0 }] } },
    { n: '5 metronome exact tempo', tool: 'metro', clip: top, light: true, prep: async (p) => { await p.waitForTimeout(300); },
      wheel: { anchor: { x: W / 2, y: 226 }, columns: [{ items: ['0', '1', '2', '3'], index: 1 }, { items: '0123456789'.split(''), index: 3, loop: true }, { items: '0123456789'.split(''), index: 7, loop: true }, { items: '0123456789'.split(''), index: 5, loop: true }], separators: ['', '', '.'] } },
    { n: '6 tuner A4 reference', tool: 'tuner', clip: top, light: false, prep: async (p) => { await p.waitForTimeout(300); },
      wheel: { anchor: { x: W - 90, y: 140 }, columns: [{ items: Array.from({ length: 52 }, (_, i) => String(415 + i)), index: 25 }] } },
    { n: '7 metronome time signature', tool: 'metro', clip: top, light: true, prep: async (p) => { await p.waitForTimeout(300); },
      wheel: { anchor: { x: 90, y: 140 }, columns: [{ items: ['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '12/8'].map(t => ({ text: t })), index: 2 }] } },
  ];
  for (const c of cases) {
    const page = await lib.open(br, c.tool, { wait: 900 }); await seed(page); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1100);
    await c.prep(page); await shot(page, `${c.n} — now`, c.clip);
    if (c.after) await c.after(page);
    await wheel(page, Object.assign({ light: c.light }, c.wheel)); await shot(page, `${c.n} — with wheel`, c.clip);
    await page.context().close();
  }
  await lib.sheet(br, files, `${dir}/sheet.png`, 2, 300); await br.close();
  return lib.result(dir, { pass: true, files: files.length });
};
