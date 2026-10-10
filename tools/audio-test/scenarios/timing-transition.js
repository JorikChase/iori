/* Shell transition timing (real clock). Tap the tuner's satellite, sample the shell every frame until the tool is
   settled, then tap the hub and sample until home. Reports when the frame loaded, when the reveal finished, and
   the full timeline. This is the number the UX budget is judged by (target: settled within ~350 ms). */
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('timing-transition');
  const page = await lib.open(br, 'shell', { wait: 1200 });
  const run = (kind) => page.evaluate((kind) => new Promise(res => {
    const S = __S, FR = [...document.querySelectorAll('iframe')]; const log = []; const t0 = performance.now(); let loadAt = null;
    FR.forEach(f => f.addEventListener('load', () => { const s = f.getAttribute('src'); if (s && s !== 'about:blank' && loadAt === null) loadAt = performance.now() - t0; }));
    const hit = document.getElementById('hit');
    const p = kind === 'enter' ? __SAT(1) : { x: 40, y: innerHeight - 40 };
    const fire = (type) => hit.dispatchEvent(new PointerEvent(type, { clientX: p.x, clientY: p.y, bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'touch' }));
    fire('pointerdown'); let up = null; setTimeout(() => { fire('pointerup'); up = performance.now() - t0; }, 60);   // a tap completes on lift: settled is measured from there
    const want = kind === 'enter' ? 'tool' : 'home';
    (function f() { const t = performance.now() - t0; log.push([Math.round(t), S.mode, Math.round(S.wo || 0), Math.round(S.wi || 0)]);
      if ((S.mode === want && t > 120) || t > 8000) res({ settled: Math.round(t - (up || 0)), fromTouchDown: Math.round(t), loadAt: loadAt && Math.round(loadAt), log: log.filter((_, i) => i % 4 === 0) });
      else requestAnimationFrame(f); })();
  }), kind);
  const enter = await run('enter'); await page.screenshot({ path: `${dir}/in-tool.png` });
  await page.waitForTimeout(500);
  const leave = await run('leave'); await page.screenshot({ path: `${dir}/home.png` });
  await page.context().close(); await br.close();
  return lib.result(dir, { pass: enter.settled <= 400 && leave.settled <= 400, enter, leave });
};
