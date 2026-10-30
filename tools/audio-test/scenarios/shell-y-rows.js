/* Shell S1–S3, S7 and the shell half of the unloaded tool.
   S1 home: the orb draws and rolls slowly · S2 hold + drag: melt toward the finger, eight icons bloom ·
   S3 release on a tool opens it · S7 inside a tool the orb is the small hub bottom-left */
const d = require('../drive');
module.exports = async (lib) => {
  const dir = lib.outDir('shell-y-rows' + (lib.ENGINE === 'webkit' ? '-webkit' : '')), W = lib.VIEW.width, H = lib.VIEW.height, checks = {}, info = {};
  const br = await lib.browser(); const page = await lib.open(br, 'shell', { wait: 1400 }); await d.install(page, '#hit');
  const orb = await page.evaluate(() => ({ x: __S.cx, y: __S.cy, r: __S.r, mode: __S.mode }));
  const a = await page.screenshot({ path: `${dir}/home.png` }); await page.waitForTimeout(1000); const b = await page.screenshot({ path: `${dir}/home2.png` }), lit = await lib.lit(br, a);
  checks.S1_orbDraws = lit > .02 && orb.mode === 'home' && orb.r > 40; checks.S1_rolls = !a.equals(b); info.s1 = { orb, lit };
  // S2: to tool 3's side. S.sel: tools by angle, clockwise from the top
  const i = 3, an = i * Math.PI / 4 - Math.PI / 2, tgt = { x: orb.x + Math.cos(an) * orb.r * 1.3, y: orb.y + Math.sin(an) * orb.r * 1.3 };
  const s2 = await page.evaluate(async ({ o, tgt }) => { G.down(o.x, o.y); await G.wait(150); const h = __S.hold; await G.to(tgt.x, tgt.y, { ms: 260, steps: 12 }); await G.wait(700); const icons = Array.from(document.querySelectorAll('i,.ti,[class*=ti-]')).filter(e => { const c = getComputedStyle(e); return c.visibility !== 'hidden' && +c.opacity > .3 && e.getBoundingClientRect().width > 0; }).length; return { h, melt: __S.melt, bloom: __S.bloom, sel: __S.sel, icons, fx: __S.fx, fy: __S.fy }; }, { o: orb, tgt });
  await page.screenshot({ path: `${dir}/held.png` });
  checks.S2_melt = s2.h && s2.melt > .8 && s2.bloom > .8; checks.S2_eightIcons = s2.icons >= 8; checks.S2_picksByAngle = s2.sel === i; info.s2 = s2;
  // S3
  await page.evaluate(() => G.up()); await page.waitForFunction((i) => __S.mode === 'tool' && __S.tool === i, i, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(600);
  const s3 = await page.evaluate(() => ({ mode: __S.mode, tool: __S.tool, frames: Array.from(document.querySelectorAll('iframe')).map(f => f.src).filter(Boolean) })); checks.S3_opens = s3.mode === 'tool' && s3.tool === i && s3.frames.some(u => /metro/.test(u)); info.s3 = s3;
  // S7
  const s7 = await page.evaluate(() => ({ cx: __S.cx, cy: __S.cy, r: __S.r })); await page.screenshot({ path: `${dir}/in-tool.png` }); checks.S7_hub = s7.cx < 80 && s7.cy > H - 80 && s7.r < orb.r * .5; info.s7 = s7;
  // a release away from any icon cancels
  await page.evaluate(() => ATS.go && 0); const errors = d.clean(page); await br.close(); checks.noErrors = !errors.length;
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info, errors });
};
