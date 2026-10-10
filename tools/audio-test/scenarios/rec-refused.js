/* Recorder: microphone refused -> crossed-out microphone on a dimmed (ring-only) centre dot, no recording, and no audio
   node of any kind created (no stand-in signal). Tapping it asks again. A real file still opens and plays. */
module.exports = async (lib) => {
  const path = require('path');
  const dir = lib.outDir('rec-refused'); const W = lib.VIEW.width, H = lib.VIEW.height; const C = { x: W / 2, y: Math.round(H * .45) };
  const br = await lib.browser();
  const ctx = await br.newContext({ viewport: lib.VIEW, deviceScaleFactor: lib.DPR, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => {
    window.__gum = 0; window.__made = {};
    navigator.mediaDevices.getUserMedia = () => { window.__gum++; return Promise.reject(new DOMException('Permission denied', 'NotAllowedError')); };
    const P = (window.AudioContext || window.webkitAudioContext).prototype;
    ['createOscillator', 'createBufferSource', 'createMediaStreamSource', 'createScriptProcessor', 'createGain', 'createBiquadFilter', 'createConstantSource'].forEach(n => {
      const f = P[n]; if (!f) return; P[n] = function () { window.__made[n] = (window.__made[n] || 0) + 1; return f.apply(this, arguments); }; });
  });
  const page = await ctx.newPage(); const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const port = +(process.env.AT_PORT || 8794);
  await page.goto(`http://127.0.0.1:${port}/audio/t/rec.html`, { waitUntil: 'load' }); await page.waitForTimeout(800);
  await page.mouse.click(C.x, C.y); await page.waitForTimeout(900);
  const st = await page.evaluate(() => ({ micFail: __S.micFail, live: __S.live, rec: __S.rec, want: __S.want, nodes: __S.nodes.length, stream: !!__S.stream, gum: __gum, made: { ...__made },
    offIcon: [...document.querySelectorAll('#rl i.ti-microphone-off')].some(e => e.style.visibility === 'visible'),
    fileIcon: [...document.querySelectorAll('#rl i.ti-file-music')].some(e => e.style.visibility === 'visible') }));
  await page.screenshot({ path: `${dir}/refused.png` });
  await page.mouse.click(C.x, C.y); await page.waitForTimeout(600);           // tap the crossed-out mic: retry
  const retry = await page.evaluate(() => ({ gum: __gum, rec: __S.rec, micFail: __S.micFail, made: { ...__made } }));
  const fc = page.waitForEvent('filechooser', { timeout: 5000 }); await page.waitForTimeout(150);   // let Playwright arm chooser interception first
  await page.mouse.click(W - 34, 34); const chooser = await fc;
  await chooser.setFiles(path.join(__dirname, '..', 'signals', 'tone1k_m20.wav'));
  await page.waitForFunction(() => __S.takes.some(t => t.meta.kind === 'file'), null, { timeout: 8000 }); await page.waitForTimeout(700);
  await page.mouse.click(W / 2, C.y + 84 + 44); await page.waitForTimeout(500);
  const play = await page.evaluate(() => ({ playing: !!__S.play, made: { ...__made } }));
  await page.screenshot({ path: `${dir}/refused-file-playing.png` });
  await br.close();
  const checks = { refused: st.micFail && !st.live && !st.rec && !st.want && !st.stream, noNodes: st.nodes === 0 && Object.keys(st.made).length === 0,
    offIcon: st.offIcon, fileStillThere: st.fileIcon, retried: retry.gum === 2 && !retry.rec && retry.micFail && Object.keys(retry.made).length === 0,
    filePlaysOnlyItself: play.playing && play.made.createBufferSource === 1 && !play.made.createOscillator && !play.made.createMediaStreamSource, noErrors: !errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, st, retry, play, errors });
};
