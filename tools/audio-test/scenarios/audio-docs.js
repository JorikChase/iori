/* Docs: the home-screen icon and the page behind it.
   1. the icon is on home, bottom-right, and gone inside a tool
   2. at every screen shape it clears all eight satellites at full bloom (21 px) and the hub corner
   3. a tap opens the page over the home screen, the close button returns, the orb never left
   4. a tool section is one hash away; AT.docs opens it over a running tool, draws are paused, closing resumes them
   5. the page leaves the hub corner clear, works in the precache and fits the phone width
   6. the page is hidden from search */
module.exports = async (lib) => {
  const dir = lib.outDir('audio-docs'), checks = {}, info = {}; const port = process.env.AT_PORT || 8794, fs = require('fs'), path = require('path');
  const br = await lib.browser(), page = await lib.open(br, 'shell', { wait: 800 });
  const rect = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; }, sel);
  const shown = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; }, sel);

  // 1, 2
  const shapes = [[320, 568], [390, 844], [844, 390], [568, 320], [768, 1024], [1024, 1366]]; info.shapes = [];
  for (const [w, h] of shapes) {
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(500);
    const r = await rect('#docs'), sats = await page.evaluate(() => [0, 1, 2, 3, 4, 5, 6, 7].map(i => __SAT(i)));
    const gap = Math.min(...sats.map(s => Math.hypot(s.x - r.x, s.y - r.y))) - r.w / 2 - 24, hub = Math.hypot(r.x - 44, r.y - (h - 44));
    info.shapes.push({ w, h, x: r.x, y: r.y, gap: Math.round(gap), hub: Math.round(hub) });
    checks[`clear${w}x${h}`] = gap > 8 && r.x > w / 2 && r.y > h / 2 && !(r.x < 104 && r.y > h - 104) && r.x + r.w / 2 <= w && r.y + r.w / 2 <= h;
  }
  await page.setViewportSize(lib.VIEW); await page.waitForTimeout(400);
  checks.onHome = await shown('#docs');
  await page.screenshot({ path: `${dir}/home.png` });

  // 3
  await page.tap('#docs'); await page.waitForSelector('#docsframe'); await page.waitForTimeout(400);
  const fr = page.frames().find(f => /docs\.html/.test(f.url()));
  checks.opens = !!fr && (await fr.$$('section')).length === 9;
  checks.menuHidden = !(await shown('#site-menu'));
  await page.screenshot({ path: `${dir}/page.png` });
  await page.frameLocator('#docsframe').locator('#close').tap(); await page.waitForTimeout(200);
  checks.closes = !(await page.$('#docsframe')) && await page.evaluate(() => __S.mode === 'home');

  await page.evaluate(() => __S && window.ATS.go('metro')); await page.waitForFunction(() => __S.mode === 'tool', null, { timeout: 8000 });
  checks.goneInTool = !(await shown('#docs'));

  // 4
  const tool = page.frames().find(f => /t\/metro\.html/.test(f.url()));
  await tool.evaluate(() => { window.__n = 0; (function t() { window.__n++; requestAnimationFrame(t); })(); AT.docs('metro'); });
  await page.waitForTimeout(600);
  const n0 = await tool.evaluate(() => window.__n); await page.waitForTimeout(300); const n1 = await tool.evaluate(() => window.__n);
  const dr = page.frames().find(f => /docs\.html/.test(f.url()));
  info.scroll = dr ? await dr.evaluate(() => ({ hash: location.hash, top: document.getElementById('metro').getBoundingClientRect().top, w: document.documentElement.scrollWidth })) : null;
  checks.overTool = !!info.scroll && info.scroll.hash === '#metro' && info.scroll.top < 120 && await tool.evaluate(() => !!document.querySelector('iframe'));
  checks.drawPaused = n1 === n0;
  checks.fitsPhone = !!info.scroll && info.scroll.w <= lib.VIEW.width;
  await page.waitForTimeout(100);
  await tool.evaluate(() => AT.docsClose()); await page.waitForTimeout(250);
  checks.drawResumes = (await tool.evaluate(() => window.__n)) > n1 && await tool.evaluate(() => !document.querySelector('iframe'));

  // 5, 6
  const src = fs.readFileSync(path.join(lib.ROOT, 'audio', 'docs.html'), 'utf8'), sw = fs.readFileSync(path.join(lib.ROOT, 'audio', 'sw.js'), 'utf8');
  checks.precached = /"docs\.html"/.test(sw);
  checks.noindex = /name="robots" content="noindex/.test(src);
  checks.bottomClear = /padding:12px 16px 136px/.test(src);
  checks.allSections = ['home', 'rec', 'edit', 'synth', 'play', 'metro', 'tuner', 'bpm', 'ana'].every(id => src.includes(`id="${id}"`));
  const errors = page.errors.filter(e => !/serviceworker|service worker|googletagmanager|ERR_|Failed to load/i.test(e)); await br.close();
  checks.noErrors = !errors.length;
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info, errors, port });
};
