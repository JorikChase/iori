/* Every page loads without console errors, exposes its state hook, and draws something (not a blank canvas). */
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('smoke'); const pages = {}; const shots = [];
  for (const tool of ['shell', 'tuner', 'bpm', 'metro', 'synth', 'ana', 'play', 'rec', 'edit']) {
    const page = await lib.open(br, tool, { perf: true, wait: 1500 });
    const info = await page.evaluate(() => { const cv = document.querySelector('canvas');
      return { state: !!window.__S, perf: window.__PERF || null, canvas: cv ? [cv.width, cv.height] : null }; });
    const f = `${dir}/${tool}.png`; const png = await page.screenshot({ path: f }); shots.push(f);
    info.lit = await lib.lit(br, png);
    pages[tool] = { ...info, errors: page.errors.filter(e => !/serviceworker|service worker/i.test(e)) };
    await page.context().close();
  }
  await lib.sheet(br, shots, `${dir}/sheet.png`, 5, 200); await br.close();
  const bad = Object.entries(pages).filter(([, p]) => !p.state || p.errors.length || p.lit < 0.001 || p.lit > 0.999).map(([k]) => k);
  return lib.result(dir, { pass: !bad.length, bad, pages });
};
