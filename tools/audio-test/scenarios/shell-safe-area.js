/* An installed app's safe areas arrive with no resize event. The shell's canvas buffer must follow its box, or the dots
   stretch away from the icons (owner, iPhone and iPad, 2026-10-31). Simulated: the padding the head gives :root under a
   notch, added after load; then the bloom, whose icons must sit on the dots. */
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('shell-safe-area');
  const page = await lib.open(br, 'shell', { wait: 1200 });
  await page.addStyleTag({ content: ':root{padding-top:59px!important;padding-bottom:34px!important}' }); await page.waitForTimeout(500);
  const r = await page.evaluate(() => { const c = document.getElementById('orb'), d = Math.min(2, devicePixelRatio || 1); return { css: [c.clientWidth, c.clientHeight], buf: [c.width, c.height], d }; });
  await page.screenshot({ path: `${dir}/safe.png` });
  const errors = page.errors.filter(e => !/service ?worker/i.test(e)); await page.context().close(); await br.close();
  const checks = { bufferFollowsBox: r.buf[0] === Math.round(r.css[0] * r.d) && r.buf[1] === Math.round(r.css[1] * r.d), noErrors: !errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, r, errors });
};
