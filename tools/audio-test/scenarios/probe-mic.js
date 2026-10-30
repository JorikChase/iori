/* Gate 1: picks a file, walks all eight phases with one reload in the middle, answers by tapping; the run survives it */
const p = require('../probe-lib');
module.exports = async (lib) => {
  const br = await lib.browser(); const ctx = await p.context(br);
  const page = await p.open(ctx);
  await p.tap(page, 'Microphone and playback'); await p.view(page, 'mic');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), p.tap(page, 'Choose a recording')]);
  await chooser.setFiles(p.wav(p.tmp('test.wav')));
  await page.getByRole('button', { name: /Recording:/ }).waitFor();
  await p.tap(page, 'USB-C'); await p.tap(page, 'Start');
  const seen = [];
  for (let i = 0; i < 8; i++) {
    if (i === 4) { await p.view(page, 'mic'); await p.tap(page, 'Tap to play'); }
    await page.waitForFunction((n) => document.querySelector('h2') && document.querySelector('h2').textContent.startsWith(n + ' of 8'), i + 1);
    await page.waitForTimeout(700);
    seen.push(await page.evaluate(() => ({ h: document.querySelector('h2').textContent, bars: document.querySelectorAll('#micbar').length, stuck: !document.getElementById('resume').hidden })));
    for (const a of ['Speaker', 'Quieter', 'A little', 'Stereo']) await page.getByRole('button', { name: a, exact: true }).click();
    await page.getByRole('button', { name: 'Left', exact: true }).click();
    await page.getByRole('button', { name: i < 7 ? 'Next step' : 'Finish' }).click();
  }
  await p.view(page, 'mic');
  const R = await p.data(page), run = R.mic[0];
  const asked = await page.evaluate(() => window.__MIC_ASKED);
  const a = run.phases.map((x) => x.auto);
  const out = await page.evaluate(() => window.__S.report());
  const pass = run.done && !run.active && run.phases.length === 8 && run.phases.every((x) => x.ans.crackle === 'A little' && !x.error)
    && a[1].settings && a[1].micPeakDb != null && a[0].settings === null && a[2].settings === null && a[5].settings && a[3].state === 'running' && asked.length === 1 /* one after the reload */
    && asked[0].audio.echoCancellation === true && seen[1].bars === 1 && seen[0].bars === 0 && seen.every((x) => !x.stuck) && out.includes('app-closed') && !page.errors.length;
  const res = { pass, seen: seen.map((x) => x.bars), a3: a[3].state, phases: run.phases.map((x) => x.id), peak: a[1].micPeakDb, st: a[0].state, sample: out.split('\n').filter((l) => l.startsWith('  ')).slice(0, 3), errors: page.errors };
  await br.close(); return res;
};
