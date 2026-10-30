/* Hints: one trigger, one hint, once, dismissed by doing it, a failed attempt fires it too, a ghost hand over the real target.
   Mechanism (on the metronome):
   1. nothing exists before a trigger: no layer, no timers listening
   2. the hint shows, sits on the real mark, stored once, and never comes back after a reload
   3. it can't take a touch: pointer-events none, elementFromPoint at the ghost and at the dot is the tool
   4. doing the gesture dismisses it at once, and the gesture worked
   5. a tap on the dot opens the docs at the tool's section, and that touch still reached the tool
   6. it never shows under a finger
   Then each gesture: trigger, did, and a failed attempt from a clean state.
   7. metro.accent  start = trigger; a tap wide of the ring = failed attempt; a mark tap = did
   8. rec.swipe     first take = trigger; a short swipe = failed attempt, in the direction tried; a long swipe right = did
   9. synth.seed    first tap on = trigger; a held press let go = failed attempt; a branch = did
   10. edit.fade    a trim = trigger; a held edge let go = failed attempt; hold + drag = did
   11. edit.twist   select = trigger; a twist short of 90 degrees = failed attempt; a flip = did */
module.exports = async (lib) => {
  const dir = lib.outDir('audio-hints'), checks = {}, info = {}; const port = process.env.AT_PORT || 8794; const W = lib.VIEW.width, H = lib.VIEW.height;
  const br = await lib.browser(), page = await lib.open(br, 'metro', { wait: 700 });
  const now = () => page.evaluate(() => AT.hints.now()), seen = () => page.evaluate(() => AT.hints.seen());
  const waitOn = (ms = 3500) => page.waitForFunction(() => {                    // held once it shows: a slow machine can't let it end between two reads
    const h = AT.hints.now(); if (!h || !h.on) return false;
    const a = document.querySelector('[data-ghost]').getAnimations()[0]; if (a) { a.pause(); a.currentTime = 500; } return true;
  }, null, { timeout: ms }).then(() => true, () => false);
  const reset = (url) => page.goto(`http://127.0.0.1:${port}/audio/t/${url}`, { waitUntil: 'load' }).then(() => page.evaluate(() => AT.hints.reset())).then(() => page.reload({ waitUntil: 'load' })).then(() => page.waitForTimeout(500));
  const ghost = () => page.evaluate(() => { const g = document.querySelector('[data-ghost]'); if (!g) return null; const r = g.getBoundingClientRect(); return { x: parseFloat(g.style.left), y: parseFloat(g.style.top), rx: r.left, ry: r.top }; });
  const tap = (p) => page.mouse.click(p.x, p.y);
  const C = { x: W / 2, y: 226 }, R = 128, PLAY = { x: W / 2, y: H - 34 };

  // 1
  await reset('metro.html');
  checks.quietAtRest = !(await now()) && !(await page.$('[data-ghost]'));

  // 2, 3
  await tap(PLAY); checks.trigger = await waitOn();
  const g = await ghost(), h = await now(); info.ghost = g; info.dot = h && h.dot;
  await page.screenshot({ path: `${dir}/metro.png` });
  const mark = await page.evaluate(() => { const S = __S; return { N: S.N }; });
  const ang = 2 * Math.PI / mark.N; info.mark = { x: C.x + R * Math.sin(ang), y: C.y - R * Math.cos(ang) };
  checks.onRealTarget = lib.near(g.x, info.mark.x, 6) && lib.near(g.y, info.mark.y, 6);
  checks.storedOnce = !!(await seen())['metro.accent'];
  const passes = await page.evaluate(([g, d]) => { const box = document.getElementById('mb'), hit = (p) => { const e = document.elementFromPoint(p.x, p.y); return e === box || box.contains(e); }; return { g: hit(g), d: hit(d), layer: [...document.querySelectorAll('body > div')].filter(e => e.querySelector('[data-ghost]')).every(e => getComputedStyle(e).pointerEvents === 'none') }; }, [g, h.dot]);
  checks.neverTakesATouch = passes.g && passes.d && passes.layer;
  info.distDot = Math.round(Math.hypot(h.dot.x - g.x, h.dot.y - g.y));
  checks.dotClearOfGesture = info.distDot >= 70 && !(h.dot.x < 120 && h.dot.y > H - 120);

  // 4
  const st0 = await page.evaluate(() => __S.st[1]); await tap(info.mark); await page.waitForTimeout(60);
  checks.doneDismisses = !(await now()) && !(await page.$('[data-ghost]'));
  checks.gestureWorked = (await page.evaluate(() => __S.st[1])) !== st0;
  await tap(PLAY); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(400); await tap(PLAY); await page.waitForTimeout(1900);
  checks.onlyOnce = !(await now()); await tap(PLAY);

  // 5
  await reset('metro.html'); await tap(PLAY); await waitOn(); const dot = (await now()).dot;
  await page.evaluate(() => { window.__ups = 0; document.getElementById('mb').addEventListener('pointerup', () => window.__ups++); });
  await tap(dot); await page.waitForTimeout(350);
  const df = page.frames().find(f => /docs\.html/.test(f.url()));
  checks.dotOpensDocs = !!df && /#metro$/.test(df.url());
  checks.dotTouchReachesTool = (await page.evaluate(() => window.__ups)) === 1;
  await page.evaluate(() => AT.docsClose());

  // 6
  await reset('metro.html'); await tap(PLAY); await page.waitForTimeout(200);
  await page.mouse.move(C.x, C.y); await page.mouse.down(); await page.waitForTimeout(1900); const held = await now(); await page.mouse.up();
  checks.notUnderAFinger = !!held && !held.on && await waitOn(1500);

  // 7
  await reset('metro.html');
  await tap({ x: C.x, y: C.y + 210 }); checks.accentFailedAttempt = await waitOn(); info.accentGhost = await ghost();

  // 8
  const stroke = (x, y, dx, dy) => page.evaluate(([x, y, dx, dy]) => {                   // scripted in the page: under load real mouse moves outlast the hold and open the take's menu
    const el = document.elementFromPoint(x, y), ev = (t, cx, cy) => el.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 7, isPrimary: true, clientX: cx, clientY: cy }));
    ev('pointerdown', x, y); for (let k = 1; k <= 6; k++) ev('pointermove', x + dx * k / 6, y + dy * k / 6); ev('pointerup', x + dx, y + dy);
  }, [x, y, dx, dy]), swipe = (x, y, dx) => stroke(x, y, dx, 0);
  await reset('rec.html');
  await page.evaluate(async () => { (await AT.takes.list()).forEach(m => AT.takes.del(m.id)); }); await page.waitForTimeout(200);
  await page.evaluate(() => AT.takes.put({ name: 'hint', kind: 'rec', sr: 48000, data: new Float32Array(48000) })); checks.swipeTrigger = await waitOn();
  const y0 = Math.round(H * .45) + 128, s = await ghost(); checks.swipeOnStrip = lib.near(s.y, y0, 3);
  await page.screenshot({ path: `${dir}/rec.png` });
  const end = await page.evaluate(() => { const a = document.querySelector('[data-ghost]').getAnimations()[0]; a.currentTime = 1900 * .85; const r = document.querySelector('[data-ghost]').getBoundingClientRect(); return r.left; });
  checks.swipeShowsRight = end > s.x + 60;      // the ghost never teaches the swipe that deletes
  await page.evaluate(() => { AT.hints.reset(); }); await page.waitForTimeout(100);
  await swipe(W / 2, y0, -40); checks.swipeFailedAttempt = await waitOn();
  const end2 = await page.evaluate(() => { const a = document.querySelector('[data-ghost]').getAnimations()[0]; a.currentTime = 1900 * .85; return document.querySelector('[data-ghost]').getBoundingClientRect().left; });
  checks.swipeFollowsTheAttempt = end2 < W / 2 - 60;
  await page.evaluate(() => { let n = 0; navigator.share = async () => { n++; }; navigator.canShare = () => true; });
  await swipe(W / 2, y0, 130); await page.waitForTimeout(80); checks.swipeDone = !(await now());
  await page.evaluate(async () => { (await AT.takes.list()).forEach(m => AT.takes.del(m.id)); });

  // 9
  const SEED = { x: W / 2, y: Math.round(H * .56) };
  await reset('synth.html'); await page.evaluate(() => localStorage.removeItem('seed-garden-v1'));
  await tap(SEED); checks.seedTrigger = await waitOn(); const sg = await ghost(); checks.seedOnSeed = lib.near(sg.x, SEED.x, 3) && lib.near(sg.y, SEED.y, 3);
  await page.screenshot({ path: `${dir}/synth.png` });
  await page.mouse.move(SEED.x, SEED.y); await page.mouse.down(); for (let k = 1; k <= 6; k++) { await page.mouse.move(SEED.x + k * 16, SEED.y); await page.waitForTimeout(16); }
  checks.seedDone = !(await now()) && !!(await seen())['synth.seed']; await page.mouse.up(); await page.waitForTimeout(300);
  await page.evaluate(() => { AT.hints.reset(); }); await page.mouse.move(SEED.x, SEED.y); await page.mouse.down(); await page.waitForTimeout(400); await page.mouse.up();
  checks.seedFailedAttempt = await waitOn();

  // 10, 11: a clip from a real take on the timeline
  await page.goto(`http://127.0.0.1:${port}/audio/t/edit.html`, { waitUntil: 'load' }); await page.evaluate(() => AT.hints.reset());
  const id = await page.evaluate(async () => { localStorage.removeItem('audio.session.edit'); const n = 48000 * 4, d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = .3 * Math.sin(i * .05); const m = await AT.takes.put({ name: 'e', kind: 'rec', sr: 48000, data: d }); localStorage.setItem('audio.place', JSON.stringify([{ id: m.id, at: 'playhead' }])); return m.id; });
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(900);
  const clipBox = () => page.evaluate(() => { const c = __E.clips()[0]; if (!c) return null; const v = __E.view(); return { x: v.lanes[c.t], top: __E.yOf(c.s), bottom: __E.yOf(c.end), rev: c.rev }; });
  const clip = await clipBox();
  info.clip = clip; checks.clipThere = !!clip;
  if (clip) {
    const top = { x: clip.x, y: clip.top }, mid = { x: clip.x, y: (clip.top + clip.bottom) / 2 };
    const drag = async (p, dy, wait = 0) => { await page.mouse.move(p.x, p.y); await page.mouse.down(); if (wait) await page.waitForTimeout(wait); for (let k = 1; k <= 6; k++) { await page.mouse.move(p.x, p.y + dy * k / 6); await page.waitForTimeout(16); } await page.mouse.up(); };
    await stroke(top.x, top.y, 0, 26); checks.fadeTrigger = await waitOn(); const fg = await ghost(); checks.fadeOnEdge = lib.near(fg.x, clip.x, 4);
    await page.screenshot({ path: `${dir}/edit-fade.png` });
    await page.evaluate(() => { AT.hints.reset(); }); const clip2 = await clipBox(); const top2 = { x: clip2.x, y: clip2.top };
    await page.mouse.move(top2.x, top2.y); await page.mouse.down(); await page.waitForTimeout(300); await page.mouse.up(); checks.fadeFailedAttempt = await waitOn();
    await page.evaluate(() => { document.querySelector('[data-ghost]') && AT.did('edit.fade'); AT.hints.reset(); });
    await drag(top2, 40, 300); await page.waitForTimeout(60); checks.fadeDone = !!(await seen())['edit.fade'] && !(await now());
    const cl3 = await clipBox(); const m3 = { x: cl3.x, y: (cl3.top + cl3.bottom) / 2 };
    await page.evaluate(() => { AT.did('edit.fade'); }); await tap(m3); checks.twistTrigger = await waitOn();
    await page.screenshot({ path: `${dir}/edit-twist.png` });
    checks.twistHasTwoFingers = await page.evaluate(() => document.querySelector('[data-ghost]').children.length === 3);
    // CDP touch: Chromium only
    if (lib.ENGINE === 'chromium') {
      const cdp = await page.context().newCDPSession(page);
      const pts = (a, r = 34) => [{ x: m3.x + r * Math.cos(a), y: m3.y + r * Math.sin(a), id: 1 }, { x: m3.x - r * Math.cos(a), y: m3.y - r * Math.sin(a), id: 2 }];
      const twist = async (deg) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(0) }); for (let k = 1; k <= 8; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(deg * Math.PI / 180 * k / 8) }); await page.waitForTimeout(16); } await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
      await page.evaluate(() => { const k = AT.hints.seen(); AT.hints.reset(); localStorage.setItem('audio.hints', JSON.stringify({ 'edit.fade': 1 })); });
      await twist(50); await page.waitForTimeout(100); checks.twistFailedAttempt = await waitOn();
      await twist(120); await page.waitForFunction(() => __E.clips()[0].rev, null, { timeout: 3000 }).catch(() => {}); checks.twistDone = !(await now()) && (await clipBox()).rev === true;
    }
  }
  await page.evaluate(async (id) => { await AT.takes.del(id); localStorage.removeItem('audio.session.edit'); }, id);

  const errors = page.errors.filter(e => !/serviceworker|service worker/i.test(e)); await br.close();
  checks.noErrors = !errors.length;
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info, errors });
};
