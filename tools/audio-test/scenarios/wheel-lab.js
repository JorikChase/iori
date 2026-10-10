/* Wheel lab (audio/lab.html): a full LIST session and a full VALUE session, two measured trials per method
   (?seed=7&n=2&p=0: each value method meets both tempo and A4), every trial solved with the real gesture of its method:
     fan   hold the control 320 ms, slide out to the target bud, release
     wtap  tap the control, drag the column(s) slowly to the target rows, tap the centre band
     wdrag press the control, drag (sideways between digit columns, vertical to spin), release
     slide press the value, slide up/down; closed loop, moving sideways for a finer gear near the target
   Checks: each trial records a time and a correct result; method order is a permutation; results land in
   localStorage 'audio.lab'; the results screen renders; export copies the JSON. Screens go on the sheet. */
const PORT = +(process.env.AT_PORT || 8794);
async function openLab(lib, br, q = '') {
  const ctx = await br.newContext(lib.ENGINE === 'webkit' ? { viewport: lib.VIEW, deviceScaleFactor: lib.DPR, hasTouch: true } : { viewport: lib.VIEW, deviceScaleFactor: lib.DPR, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/audio/lab.html${q}`, { waitUntil: 'load' }); await page.waitForTimeout(400); page.errors = errors; return page;
}
module.exports = async (lib) => {
  const dir = lib.outDir('wheel-lab' + (lib.ENGINE === 'webkit' ? '-webkit' : '')); const br = await lib.browser();
  const page = await openLab(lib, br, '?seed=7&n=2&p=0'); const shots = []; const W = lib.VIEW.width, H = lib.VIEW.height;
  await page.evaluate(() => localStorage.removeItem('audio.lab')); await page.reload(); await page.waitForTimeout(400);
  const shot = async (n) => { const f = `${dir}/${n}.png`; await page.screenshot({ path: f }); shots.push(f); };
  const S = () => page.evaluate(() => { const t = __S.tr; return { screen: __S.screen, tr: t && { task: t.task, method: t.method, target: t.target, cur: t.cur, done: t.done }, wheel: !!__S.wheel }; });
  const ctrl = await page.evaluate(() => __LAB.ctrl());
  const move = async (x0, y0, x1, y1, steps = 10, ms = 18) => { for (let k = 1; k <= steps; k++) { await page.mouse.move(x0 + (x1 - x0) * k / steps, y0 + (y1 - y0) * k / steps); await page.waitForTimeout(ms); } };
  const shotOnce = {};
  const wheelState = () => page.evaluate(() => __S.wheel && __S.wheel.state());
  const digits = (v) => { const t = Math.round(v * 10); return [Math.floor(t / 1000), Math.floor(t / 100) % 10, Math.floor(t / 10) % 10, t % 10]; };
  /* rows each column must move: list/A4 = one bounded column; tempo = hundreds bounded + three loop digits */
  const plan = (tr) => {
    if (tr.task === 'a4') return [tr.target - tr.cur];
    if (tr.task !== 'tempo') return [tr.target - tr.cur];
    const a = digits(tr.cur), b = digits(tr.target); return a.map((d, i) => { let k = b[i] - d; if (i > 0) { if (k > 5) k -= 10; if (k < -5) k += 10; } return k; });
  };
  async function solve() {
    const s = await S(), tr = s.tr, tag = `${tr.method}-${tr.task}`;
    if (tr.method === 'fan') {
      await page.mouse.move(ctrl.x, ctrl.y); await page.mouse.down(); await page.waitForTimeout(330);
      const L = await page.evaluate((n) => __LAB.fan(n), (await page.evaluate((t) => __LAB.TASK[t].items.length, tr.task)));
      const b = L.ps[tr.target]; await move(ctrl.x, ctrl.y, b.x, b.y, 12, 20); await page.waitForTimeout(250);
      if (!shotOnce.fan) { shotOnce.fan = 1; await shot(`2-${tag}-fan-open`); }
      await page.mouse.up();
    } else if (tr.method === 'slide') {
      const T = await page.evaluate((t) => __LAB.TASK[t], tr.task); let x = ctrl.x, y = ctrl.y;
      await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(40);
      for (let it = 0; it < 80; it++) {
        const v = await page.evaluate(() => __S.adj.v), d = tr.target - v; if (Math.abs(d) < 1e-6) break;
        /* pick a gear: coarse when far, sideways (finer) when near; never let y leave the screen */
        const off = Math.abs(d) > 8 ? 0 : (Math.abs(d) > 1 ? 60 : 180 - (it % 5) * 12), g = 1 / (1 + off / 30), perPx = (T.hi - T.lo) / 240 * g;
        const nx = ctrl.x + (it % 2 ? -1 : 1) * Math.min(off, ctrl.x - 8); if (Math.abs(nx - x) > .5) { await move(x, y, nx, y, 4, 10); x = nx; }
        let dy = -d / perPx; if (Math.abs(dy) < 1) dy = Math.sign(dy); dy = Math.round(dy);
        const ny = Math.max(60, Math.min(H - 60, y + dy)); if (ny === y) { y = y > H / 2 ? 120 : H - 120; await page.mouse.up(); await page.waitForTimeout(80); await page.mouse.move(ctrl.x, ctrl.y); x = ctrl.x; y = ctrl.y; await page.mouse.down(); continue; }
        await move(x, y, x, ny, Math.max(1, Math.min(10, Math.abs(ny - y) >> 3)), 12); y = ny;
        if (!shotOnce.slide && off > 0) { shotOnce.slide = 1; await shot(`4-${tag}-slide`); }
      }
      await page.mouse.up();
    } else if (tr.method === 'wtap') {
      await page.mouse.click(ctrl.x, ctrl.y); await page.waitForTimeout(300);
      const st = await wheelState(), rows = plan(tr);
      if (!shotOnce['wtap' + tr.task]) { shotOnce['wtap' + tr.task] = 1; await shot(`3-${tag}-wheel-tap-open`); }
      for (let i = 0; i < rows.length; i++) { let left = rows[i]; const c = st.cols[i];
        while (left) { const k = Math.max(-4, Math.min(4, left)); left -= k;   /* a thumb moves about four rows per drag */
          await page.mouse.move(c.x, st.bandY); await page.mouse.down(); await move(c.x, st.bandY, c.x, st.bandY - k * st.rowH, Math.max(6, Math.abs(k) * 3), 18);
          await page.waitForTimeout(150); await page.mouse.up(); await page.waitForTimeout(350); } }
      if (!shotOnce['wtapset' + tr.task]) { shotOnce['wtapset' + tr.task] = 1; await shot(`3-${tag}-wheel-set`); }
      await page.mouse.click(st.cols[0].x, st.bandY);
    } else {
      const rows = plan(tr);
      await page.mouse.move(ctrl.x, ctrl.y); await page.mouse.down(); await page.waitForTimeout(80);
      let st = await wheelState(), x = ctrl.x, y = ctrl.y;
      for (let i = 0; i < rows.length; i++) { if (!rows[i]) continue; const c = st.cols[i];
        if (Math.abs(c.x - x) > 1) { await move(x, y, c.x, y, 6, 16); x = c.x; }
        let k = rows[i]; if (tr.task === 'tempo' && i > 0 && (y - k * st.rowH < 40 || y - k * st.rowH > H - 40)) k = k > 0 ? k - 10 : k + 10;   /* go round the loop the other way to stay on screen */
        /* the finger cannot leave the screen: what does not fit is left for another gesture (release commits on the way) */
        const lo = Math.ceil((y - (H - 30)) / st.rowH), hi = Math.floor((y - 30) / st.rowH); k = Math.max(lo, Math.min(hi, k)); if (!k) break;
        await move(x, y, x, y - k * st.rowH, Math.max(6, Math.abs(k) * 3), 18); y -= k * st.rowH; }
      await page.waitForTimeout(100);
      if (!shotOnce['wdrag' + tr.task]) { shotOnce['wdrag' + tr.task] = 1; await shot(`5-${tag}-wheel-drag`); }
      await page.mouse.up();
    }
    await page.waitForTimeout(150);
    return page.evaluate(() => { const r = __LAB.db().trials; return r[r.length - 1]; });
  }
  const until = (fn, arg, ms = 15000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  async function session(fam) {
    const y = fam === 'list' ? H * .5 - 170 : H * .5;
    await until(() => __S.screen === 'home' && !__S.trans);
    await page.mouse.click(W / 2, y); await until(() => __S.screen === 'intro' && !__S.trans);
    const recs = [];
    for (let guard = 0; guard < 20; guard++) {
      const s = await S();
      if (s.screen === 'intro') { await page.mouse.click(W / 2, H * .7); await until(() => __S.screen === 'trial' && !__S.trans); continue; }
      if (s.screen === 'results') break;
      if (s.screen !== 'trial') break;
      await until(() => !__S.trans);
      const id = await page.evaluate(() => (__S.tr.__id = Math.random()));
      if (!recs.length && fam === 'list') await shot('1-list-trial');
      const rec = await solve(); const moved = await until((id) => !__S.tr || __S.tr.__id !== id, id, 4000);   /* solved: the next trial (or the results) replaced it */
      if (moved && rec && rec.task === s.tr.task && rec.method === s.tr.method) recs.push(rec);
    }
    return recs;
  }
  await shot('0-home');
  const L = await session('list'); await until(() => __S.screen === 'results' && !__S.trans); await shot('6-results-list');
  await page.mouse.click(30, 32);   /* home */
  const V = await session('value'); await until(() => __S.screen === 'results' && !__S.trans); await page.waitForTimeout(200); await shot('7-results');
  await page.mouse.click(W - 84, 32); await page.waitForTimeout(300);   /* export */
  const copied = await page.evaluate(() => window.__COPIED ? JSON.parse(window.__COPIED).trials.length : -1);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('audio.lab') || 'null'));
  await lib.sheet(br, shots, `${dir}/sheet.png`, 5, 180);
  const errors = page.errors; await br.close();
  const all = L.concat(V), methodsL = L.map(r => r.method).sort().join(), methodsV = V.map(r => r.method).sort().join();
  const checks = {
    listTrials: L.length === 6 && methodsL === 'fan,fan,wdrag,wdrag,wtap,wtap',
    valueTrials: V.length === 6 && methodsV === 'slide,slide,wdrag,wdrag,wtap,wtap' && ['slide','wtap','wdrag'].every(m => V.filter(r => r.method === m).map(r => r.task).sort().join() === 'a4,tempo'),
    timesRecorded: all.every(r => r && r.ms > 0 && r.handMs > 0 && r.firstTouchMs >= 0),
    allCorrect: all.every(r => r && r.ok && !r.skipped && r.commits >= 1),
    stored: !!stored && stored.trials.length === 12 && stored.sessions.length === 2,
    exported: copied === 12,
    noErrors: !errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks,
    trials: all.map(r => r && ({ fam: r.fam, task: r.task, method: r.method, target: r.target, start: r.start, final: r.final, ok: r.ok, ms: r.ms, commits: r.commits, errors: r.errors, overshoots: r.overshoots })), errors });
};
