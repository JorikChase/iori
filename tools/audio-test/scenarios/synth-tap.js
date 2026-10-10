/* Synth: the place-on-timeline dot with AT.place stubbed (so the page stays for screenshots).
   Play 20 s; hold the right-edge dot and drag down to 15 s (selection in progress), back to the start and release
   -> cancelled, nothing saved; hold and drag to 15 s again, release -> a 15 s 'synth' take is placed, green pulse;
   then a plain tap -> places min(30 s, gathered). */
module.exports = async (lib) => {
  const dir = lib.outDir('synth-tap'); const W = lib.VIEW.width, H = lib.VIEW.height;
  const RS = { x: W - 30, y: Math.round(H * .4) }, SEED = { x: W / 2, y: Math.round(H * .56) };
  const y0 = RS.y + 24, len = H - 110 - y0, ySec = (s) => y0 + Math.sqrt(s / 240) * len;
  const br = await lib.browser(); const page = await lib.open(br, 'synth', { wait: 800 }); const shots = [];
  const shot = async (n) => { const f = `${dir}/${n}.png`; await page.screenshot({ path: f }); shots.push(f); };
  await page.evaluate(() => { window.__placed = []; AT.place = (id) => { window.__placed.push(id); }; });
  const before = await page.evaluate(() => AT.takes.list().then(a => a.map(t => t.id)));
  const fresh = () => page.evaluate(async (before) => {
    const a = (await AT.takes.list()).filter(t => before.indexOf(t.id) < 0), out = [];
    for (const m of a) { const t = await AT.takes.get(m.id); let s = 0; for (let i = 0; i < t.data.length; i++) s += t.data[i] * t.data[i];
      out.push({ id: t.id, kind: t.kind, dur: +t.dur.toFixed(4), rms: +Math.sqrt(s / t.data.length).toFixed(5) }); }
    return out; }, before);
  const drag = async (yEnd, steps = 10) => { await page.mouse.move(RS.x, RS.y); await page.mouse.down(); await page.waitForTimeout(100);
    for (let k = 1; k <= steps; k++) { await page.mouse.move(RS.x + 2, RS.y + (yEnd - RS.y) * k / steps); await page.waitForTimeout(25); } await page.waitForTimeout(150); };
  await shot('0-idle');
  await page.mouse.click(SEED.x, SEED.y);
  await page.waitForFunction(() => __S.run && __S.ctx && __S.ctx.state === 'running', null, { timeout: 6000 });
  await page.waitForTimeout(20000);
  // 1. hold only: the track shows what has been gathered
  await page.mouse.move(RS.x, RS.y); await page.mouse.down(); await page.waitForTimeout(250); await shot('1-hold'); 
  // 2. drag to 15 s
  for (let k = 1; k <= 10; k++) { await page.mouse.move(RS.x + 2, RS.y + (ySec(15) - RS.y) * k / 10); await page.waitForTimeout(25); } await page.waitForTimeout(200);
  const sel15 = await page.evaluate(() => ({ on: __S.cap.on, sec: +__S.cap.sec.toFixed(3), g: +__CAP().gathered.toFixed(2) }));
  await shot('2-select-15s');
  // 3. back to the start, release -> cancel
  for (let k = 1; k <= 8; k++) { await page.mouse.move(RS.x, ySec(15) + (RS.y + 4 - ySec(15)) * k / 8); await page.waitForTimeout(25); } await page.waitForTimeout(150);
  const back = await page.evaluate(() => ({ on: __S.cap.on }));
  await page.mouse.up(); await page.waitForTimeout(600);
  const afterCancel = await fresh(); const placedCancel = await page.evaluate(() => __placed.length);
  // 4. drag to 15 s again and release -> placed
  await drag(ySec(15)); await page.mouse.up(); await page.waitForTimeout(120); await shot('3-confirm');
  const pulse = await page.evaluate(() => __S.pulse);
  await page.waitForFunction(() => __placed.length === 1, null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(900); await shot('4-after');
  const t15 = await fresh(); const placed1 = await page.evaluate(() => __placed.slice());
  // 5. a tap places min(30 s, gathered)
  const gTap = await page.evaluate(() => __CAP().gathered);
  await page.mouse.click(RS.x, RS.y);
  await page.waitForFunction(() => __placed.length === 2, null, { timeout: 5000 }).catch(() => {});
  const gTapAfter = await page.evaluate(() => __CAP().gathered);
  const all = await fresh(); const placed2 = await page.evaluate(() => __placed.slice());
  await lib.sheet(br, shots, `${dir}/sheet.png`, 5, 180);
  const errors = page.errors.filter(e => !/serviceworker|service worker/i.test(e)); await br.close();
  const tap = all.find(t => t.id === placed2[1]) || null, sel = t15.find(t => t.id === placed1[0]) || null;
  const checks = { selection15: sel15.on && lib.near(sel15.sec, 15, 0.01), backCancels: !back.on, cancelSavedNothing: afterCancel.length === 0 && placedCancel === 0,
    dragTake15: !!sel && sel.kind === 'synth' && lib.near(sel.dur, 15, 0.1), dragNotSilent: !!sel && sel.rms > 0.001, pulsed: pulse > 0.3,
    tapTake: !!tap && tap.kind === 'synth' && tap.dur >= Math.min(30, gTap) - 0.1 && tap.dur <= Math.min(30, gTapAfter) + 0.1, tapNotSilent: !!tap && tap.rms > 0.001,
    twoTakes: all.length === 2, noErrors: !errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, sel15, back, afterCancel, pulse, sel, tap, gTap, gTapAfter, all, errors });
};
