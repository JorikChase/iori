/* Synth: the seed's press. A drag ALWAYS grows a branch, however long the finger rested, right up until the menu opens;
   the menu opens after a still hold of SEEDHOLD (600 ms, ?hold=<ms> overrides), with a ring filling over that time.
   1. rest 400 ms, then drag -> branch, no menu (one 260 ms timer used to open the menu and lose the drag)
   2. drag at once -> branch
   3. still hold -> no menu before SEEDHOLD, menu at SEEDHOLD; the ring tracks the time; a drag after that stays in the menu
   4. still press lifted before the menu -> nothing at all (not a tap); a real tap still plays
   5. ?hold=1000 moves the menu; a nonsense ?hold=5 is ignored
   6. ring on screen: at ?hold=5000, past half way, the arc has passed 3 and 6 o'clock but not the top left
   7. the other roots keep the short hold (220 ms); constants HOLD 220, DWELL 350 */
module.exports = async (lib) => {
  const dir = lib.outDir('synth-seed-gesture'); const W = lib.VIEW.width, H = lib.VIEW.height, checks = {}, info = {};
  const SEED = { x: W / 2, y: Math.round(H * .56) }, RD = { x: 34, y: 34 }, RP = { x: W - 34, y: H - 34 }, CAT = { x: 26, y: Math.round(H * .3) };
  const br = await lib.browser(); const page = await lib.open(br, 'synth', { wait: 800 });
  const go = async (q = '') => { await page.goto(`http://127.0.0.1:${process.env.AT_PORT || 8794}/audio/t/synth.html${q}`, { waitUntil: 'load' }); await page.waitForTimeout(700); await rec(); };
  // a recorder in the page: every frame's state against the time of the press, so the harness's input latency is out of the numbers
  const rec = () => page.evaluate(() => { const L = window.__L = { t0: 0, f: [] };
    document.getElementById('sb').addEventListener('pointerdown', () => { L.t0 = performance.now(); L.f = []; }, true);
    const go = () => { if (L.t0) L.f.push({ t: performance.now() - L.t0, open: !!__S.open, br: !!__S.br, sp: !!__S.sp, ring: __S.ring || 0 }); requestAnimationFrame(go); }; go(); });
  const log = () => page.evaluate(() => __L.f);
  const firstT = (f, k) => { const e = f.find(x => x[k]); return e ? Math.round(e.t) : null; };
  const down = async (p) => { await page.mouse.move(p.x, p.y); await page.mouse.down(); };
  const drag = async (p, dx, n = 6) => { for (let k = 1; k <= n; k++) { await page.mouse.move(p.x + dx * k / n, p.y); await page.waitForTimeout(16); } };
  const idle = async () => { await page.mouse.up(); await page.waitForTimeout(350); };
  await page.evaluate(() => localStorage.removeItem('seed-garden-v1')); await go();

  // 1. rest, then drag
  // (scripted in the page: the harness's own input can take a second to arrive on a loaded machine)
  const rest = (ms) => page.evaluate(async ([ms, p]) => { const el = document.getElementById('sb'), ev = (t, x) => el.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: p.y, pointerId: 11, isPrimary: true, pointerType: 'touch', bubbles: true, cancelable: true }));
    const wait = (t) => new Promise(r => setTimeout(r, t)); ev('pointerdown', p.x); await wait(ms); const open0 = !!__S.open; for (let k = 1; k <= 5; k++) { ev('pointermove', p.x + k * 16); await wait(16); }
    const r = { open0, br: !!__S.br, open: !!__S.open, ring: __S.ring || 0 }; ev('pointerup', p.x + 80); return r; }, [ms, SEED]);
  const s1 = [await rest(400)]; await page.waitForTimeout(350);
  info.rest = s1; checks.restThenDragBranches = s1.every(s => !s.open0 && s.br && !s.open && s.ring === 0);
  // 2. drag at once
  await down(SEED); await drag(SEED, 80); await page.waitForTimeout(60); const s2 = await page.evaluate(() => ({ br: !!__S.br, open: !!__S.open })); await idle();
  checks.quickDragBranches = s2.br && !s2.open;

  // 3. still hold
  await down(SEED); await page.waitForFunction(() => __S.open, null, { timeout: 2500 }).catch(() => {}); await page.waitForTimeout(100);
  const f3 = await log(), tOpen = firstT(f3, 'open'); await drag(SEED, 30, 3); await page.waitForTimeout(60);
  const s3 = await page.evaluate(() => ({ br: !!__S.br, open: !!__S.open })); await idle();
  const mid = f3.filter(x => x.t > 150 && !x.open), ringOff = mid.map(x => Math.abs(x.ring - x.t / 600));
  info.hold = { tOpen, ringMaxErr: +Math.max(0, ...ringOff).toFixed(3), ringAtEnd: f3.filter(x => x.open).map(x => x.ring)[0] };
  checks.menuAtSeedHold = tOpen !== null && tOpen >= 595 && tOpen <= 860;
  checks.dragAfterMenuStaysInMenu = s3.open && !s3.br;
  checks.ringTracksHold = mid.length >= 2 && Math.max(...ringOff) < .12;
  checks.ringGoneInMenu = info.hold.ringAtEnd === 0;

  // 4. still press lifted before the menu: nothing; a tap still plays
  await down(SEED); await page.waitForTimeout(400); const r4 = await page.evaluate(() => __S.ring || 0); await page.mouse.up(); await page.waitForTimeout(450);
  const s4 = await page.evaluate(() => ({ run: __S.run, open: !!__S.open, ring: __S.ring || 0 }));
  info.lift = { r4, s4 }; checks.liftBeforeMenuDoesNothing = !s4.run && !s4.open && s4.ring === 0;
  await page.mouse.click(SEED.x, SEED.y); await page.waitForTimeout(450); const run5 = await page.evaluate(() => __S.run);
  await page.mouse.click(SEED.x, SEED.y); await page.waitForTimeout(450); checks.tapStillPlays = run5 && !(await page.evaluate(() => __S.run));

  // 5. ?hold=
  await go('?hold=1000');
  await down(SEED); await page.waitForTimeout(800); const s5 = await page.evaluate(() => !!__S.open); await page.waitForFunction(() => __S.open, null, { timeout: 2500 }).catch(() => {});
  await page.waitForTimeout(60); const t5 = firstT(await log(), 'open'); await idle();
  info.hold1000 = { s5, t5 }; checks.holdQueryOverrides = !s5 && t5 !== null && t5 >= 990 && t5 <= 1260;
  await go('?hold=2500'); const s5b = await rest(1900); await page.waitForTimeout(350); info.rest.push(s5b); checks.restLongBeforeMenuBranches = !s5b.open0 && s5b.br && !s5b.open;
  await go('?hold=5'); checks.holdQueryRange = (await page.evaluate(() => __SW.SEEDHOLD)) === 600;

  // 6. the ring on screen
  await go('?hold=5000');
  const box = { x: SEED.x - 70, y: SEED.y - 70, width: 140, height: 140 };
  const dark = (png) => { const pg = br.newContext().then(c => c.newPage()); return pg.then(async (pg) => { const v = await pg.evaluate(async (src) => { const im = new Image(); im.src = src; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const k = im.width / 140;
    return [.25, .5, .9].map(f => { const a = f * 2 * Math.PI, x = 70 + 58 * Math.sin(a), y = 70 - 58 * Math.cos(a), d = g.getImageData((x - 4) * k, (y - 4) * k, 8 * k, 8 * k).data; let m = 255; for (let i = 0; i < d.length; i += 4) m = Math.min(m, d[i]); return m; }); }, 'data:image/png;base64,' + png.toString('base64')); await pg.context().close(); return v; }); };
  const d0 = await dark(await page.screenshot({ clip: box }));
  await down(SEED); await page.waitForTimeout(2700); const png = await page.screenshot({ clip: box, path: `${dir}/ring.png` }); const r6 = await page.evaluate(() => __S.ring || 0); const d1 = await dark(png); await idle();
  info.ring = { d0, d1, r6 }; checks.ringDrawn = d0.every(v => v > 200) && d1[0] < 100 && d1[1] < 100 && d1[2] > 200 && r6 > .5 && r6 < .9;

  // 7. the other roots and the constants
  await go(); const k = await page.evaluate(() => ({ HOLD: __SW.HOLD, SEEDHOLD: __SW.SEEDHOLD, DWELL: __SW.DWELL })); info.k = k;
  checks.constants = k.HOLD === 220 && k.SEEDHOLD === 600 && k.DWELL === 350;
  const short = async (p, what) => { await down(p); await page.waitForTimeout(420); const t = firstT(await log(), what); await idle(); return t; };
  const tRD = await short(RD, 'open'), tCat = await short(CAT, 'open'), tRP = await short(RP, 'sp'); info.short = { tRD, tCat, tRP };
  checks.otherRootsShortHold = [tRD, tCat, tRP].every(t => t !== null && t >= 215 && t <= 500);

  const errors = page.errors.filter(e => !/serviceworker|service worker/i.test(e)); await br.close();
  checks.noErrors = !errors.length;
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info, errors });
};
