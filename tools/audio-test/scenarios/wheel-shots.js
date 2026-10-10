/* Wheel picker screenshots + contact sheet (out/wheel-shots/sheet.png):
   1 the alarm wheel "07 : 30" (tap mode), 2 a list wheel of icons (the three synth setups), 3 a list of take
   durations mid-flick, 4 the tempo digit wheel "137 . 5", 5 the light theme (for white tools like the synth),
   6 drag mode under a finger, 7 the lab's results screen (from out/wheel-lab, if that scenario has run). */
const PORT = +(process.env.AT_PORT || 8794); const fs = require('fs');
async function openLab(lib, br, q = '') {
  const ctx = await br.newContext(lib.ENGINE === 'webkit' ? { viewport: lib.VIEW, deviceScaleFactor: lib.DPR, hasTouch: true } : { viewport: lib.VIEW, deviceScaleFactor: lib.DPR, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/audio/lab.html${q}`, { waitUntil: 'load' }); await page.waitForTimeout(400); page.errors = errors; return page;
}
module.exports = async (lib) => {
  const sfx = lib.ENGINE === 'webkit' ? '-webkit' : ''; const dir = lib.outDir('wheel-shots' + sfx); const br = await lib.browser(); const page = await openLab(lib, br); const shots = [];
  const shot = async (n) => { const f = `${dir}/${n}.png`; await page.screenshot({ path: f }); shots.push(f); };
  /* blank the lab behind the wheel so the shots show the component alone */
  await page.evaluate(() => { document.getElementById('c').style.visibility = 'hidden'; });
  const open = (code) => page.evaluate(code);
  const close = () => page.evaluate(() => { const h = Wheel.active(); if (h) h.close(false); });
  const two = 'const two=(n)=>Array.from({length:n},(_,i)=>String(i).padStart(2,"0"));';
  await open(`${two} window.__h=Wheel.open({mode:'tap',anchor:{x:195,y:420},columns:[{items:two(24),index:7,loop:true},{items:two(60),index:30,loop:true}],separators:[':']});`);
  await page.waitForTimeout(400); await shot('1-alarm-0730'); const s1 = await page.evaluate(() => __h.state()); await close(); await page.waitForTimeout(300);
  await open(`window.__h=Wheel.open({mode:'tap',anchor:{x:195,y:420},columns:[{items:[{icon:'stack-2'},{icon:'atom-2'},{icon:'line'}],index:1}]});`);
  await page.waitForTimeout(500); await shot('2-list-icons'); const s2 = await page.evaluate(() => __h.state()); await close(); await page.waitForTimeout(300);
  await open(`window.__h=Wheel.open({mode:'tap',anchor:{x:195,y:420},columns:[{items:['0:12','0:47','1:05','1:24','2:31','3:08','0:33','4:56'],index:0}]});`);
  await page.waitForTimeout(300); await page.evaluate(() => __h.fling(0, 9)); await page.waitForTimeout(140); await shot('3-takes-flick');
  await page.waitForTimeout(1500); await close(); await page.waitForTimeout(300);
  await open(`const D=['0','1','2','3','4','5','6','7','8','9'];window.__h=Wheel.open({mode:'tap',anchor:{x:195,y:420},columns:[{items:['0','1','2','3'],index:1},{items:D,index:3,loop:true},{items:D,index:7,loop:true},{items:D,index:5,loop:true}],separators:['','','.']});`);
  await page.waitForTimeout(400); await shot('4-tempo-137-5'); await close(); await page.waitForTimeout(300);
  await page.evaluate(() => { document.body.style.background = '#fff'; });
  await open(`${two} window.__h=Wheel.open({mode:'tap',light:true,anchor:{x:195,y:420},columns:[{items:two(24),index:7,loop:true},{items:two(60),index:30,loop:true}],separators:[':']});`);
  await page.waitForTimeout(400); await shot('5-light'); await close(); await page.waitForTimeout(300);
  await page.evaluate(() => { document.body.style.background = '#000'; });
  await page.evaluate(() => { addEventListener('pointerdown', function f(e) { removeEventListener('pointerdown', f, true);
    window.__h = Wheel.open({ mode: 'drag', pointerEvent: e, columns: [{ items: ['2/4', '3/4', '4/4', '5/4', '6/8', '7/8'], index: 2 }] }); }, true); });
  await page.mouse.move(250, 560); await page.mouse.down(); for (let k = 1; k <= 8; k++) { await page.mouse.move(250, 560 - 60 * k / 8); await page.waitForTimeout(16); }
  await page.waitForTimeout(200); await shot('6-drag-under-finger'); await page.mouse.up(); await page.waitForTimeout(300);
  const res = `${lib.OUT}/wheel-lab${sfx}/7-results.png`; if (fs.existsSync(res)) { fs.copyFileSync(res, `${dir}/7-lab-results.png`); shots.push(`${dir}/7-lab-results.png`); }
  await lib.sheet(br, shots, `${dir}/sheet.png`, 4, 200);
  const lit = []; for (const f of shots.slice(0, 4)) lit.push(await lib.lit(br, fs.readFileSync(f)));
  const errors = page.errors; await br.close();
  const vh = lib.VIEW.height, clear = (r) => !(r.left < 104 && r.top + r.h > vh - 104);
  const checks = { drawn: lit.every(v => v > 0.004), iconsWide: s2.rect.w >= 96, alarmTwoCols: s1.cols.length === 2 && s1.cols[0].idx === 7 && s1.cols[1].idx === 30, hub: clear(s1.rect) && clear(s2.rect), noErrors: !errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, lit, shots: shots.map(f => f.split('/').pop()), errors });
};
