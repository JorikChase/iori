/* iOS audio rule (emulated): every tool that listens or plays must actually run when the user taps, even though
   iOS only starts audio on a touch END. For each tool: tap its start control, wait, check the context is running
   and something real happened (pitch, level, capture, clicks). Run once with the shared unlock disabled to prove
   the check catches the iPhone failure, then with it on. */
module.exports = async (lib) => {
  const W = lib.VIEW.width, H = lib.VIEW.height;
  const cases = [
    { tool: 'tuner', wav: 'sine440.wav', tap: [W / 2, H / 2], ok: () => __S.mic === 1 && __S.ctx.state === 'running' && __S.has && __S.note === 69 },
    { tool: 'rec', wav: 'bursts.wav', tap: [W / 2, Math.round(H * .45)], ok: () => __S.rec === true && __S.ctx.state === 'running' && __S.curN > 0 },
    { tool: 'bpm', wav: 'click120.wav', tap: [34 + (W - 68) / 3, H - 28], ok: () => __S.rec === true && __S.ctx && __S.ctx.state === 'running' && __S.pcmN > 0 && __S.pcm.some(b => b.some(v => Math.abs(v) > 0.01)) },   // real samples, not frames
    { tool: 'metro', wav: null, tap: [W / 2, H - 34], ok: () => __S.run === true && __S.ctx.state === 'running' && __S.lastBeat >= 1 },
    { tool: 'synth', wav: null, tap: [W / 2, Math.round(H * .56)], ok: () => __S.ctx && __S.ctx.state === 'running' && __CAP().gathered > 1 },   // the seed
  ];
  const run = async (noUnlock) => { const out = {};
    for (const c of cases) {
      const br = await lib.browser(); const page = await lib.open(br, c.tool, { wait: 800, wav: c.wav, ios: true, noUnlock });
      await page.mouse.click(...c.tap); await page.waitForTimeout(2500);
      const r = await page.evaluate((ok) => { const ctxs = []; try { if (window.__S && __S.ctx) ctxs.push(__S.ctx.state); } catch (_) {} return { ok: !!eval('(' + ok + ')')(), ctx: ctxs[0] || null, ios: !!window.__IOS_AUDIO }; }, c.ok.toString());
      out[c.tool] = r; await page.context().close(); await br.close();
    }
    return out; };
  const without = await run(true), withU = await run(false);
  const dir = lib.outDir('ios-audio');
  const pass = Object.values(withU).every(r => r.ok && r.ios);
  return lib.result(dir, { pass, withUnlock: withU, withoutUnlock: without, note: 'withoutUnlock shows what an iPhone did before the fix' });
};
