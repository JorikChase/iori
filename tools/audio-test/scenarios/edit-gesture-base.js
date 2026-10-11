/* Editor (t/edit.html) — the clip gesture model ported from the approved mock-up (audio/clip-lab.html): selection, the
   clip panel at the corner, the body buds. Also the helpers every edit-gesture-* scenario uses.
   Fixtures: real takes written through the library API (AT.takes.put of known test signals), placed by a session
   (audio.session.edit v3) so every scenario starts from exact positions: 100 BPM (beat 0.6 s), pps 60,
     A  take-a 440 Hz   track 0  s 1.2  off 1  length 3   (ends 4.2)
     B  take-b 660 Hz   track 0  s 4.2  off 1  length 3   (touches A)
     C  take-c 330 Hz   track 1  s 1.8  off 1  length 4
   1. props open (snap / push / shelf / save visible), tap C -> selected, the corner dot takes the lane colour and C's
      panel replaces the property buds (screenshot); tap empty timeline -> deselected, the playhead is placed (snapped to
      half beats), the property buds come back
   2. the panel never reaches into the bottom-left 104 x 104 corner
   3. hold A -> FOUR buds (cut, copy, move, delete — no reverse bud); release on CUT -> two touching clips split at the
      held time snapped to the half-beat grid; hold B, COPY -> a copy right after it; hold C, MOVE down 40 px -> moved;
      hold the copy, DELETE -> gone */
const H = require('./cliplab-base.js');
const PPS = 60;
async function openEd(lib, br, wait = 900) { return lib.open(br, 'edit', { wait }); }
async function settle(page, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const ok = await page.evaluate(() => window.__E && __S.ready && __E.slots().every(s => s.loaded || s.st === 2) && __E.pending() === 0); if (ok) break; await page.waitForTimeout(60); }
  await page.waitForTimeout(350);
}
/* write a v3 session and reload: the editor restores it */
async function session(page, clips, { snap = 0, pps = PPS, tracks = 2, vt = 0, tempo = null } = {}) {
  await page.evaluate(([clips, snap, pps, tracks, vt, tempo]) => { if (tempo) localStorage.setItem('audio.tempo', String(tempo));
    localStorage.setItem('audio.session.edit', JSON.stringify({ v: 3, tl: 2.4 * 14, ph: 0, vt, pps, snap, push: 0, hx: 0, tracks: Array.from({ length: tracks }, () => ({ m: 0, s: 0, a: 0 })), clips })); },
    [clips, snap, pps, tracks, vt, tempo]);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300); await settle(page);
}
function stdClips(ids, o = {}) { const [c, b, a] = ids; return [
  { k: a, t: 0, s: 1.2, d: 3, off: 1, rev: 0 }, { k: b, t: 0, s: 4.2, d: 3, off: 1, rev: 0 }, { k: c, t: 1, s: o.cs || 1.8, d: o.cd || 4, off: 1, rev: 0 }]; }
async function std(lib, br, opts = {}) { const page = await openEd(lib, br); const ids = await H.seed(page, opts.specs || H.STD); await session(page, opts.clips ? opts.clips(ids) : stdClips(ids, opts), opts); page.ids = ids; return page; }
const clips = (page) => page.evaluate(() => __E.clips());
const view = (page) => page.evaluate(() => __E.view());
const st = (page) => page.evaluate(() => __E.state());
const yOf = (page, s) => page.evaluate((s) => __E.yOf(s), s);
async function abc(page) { const cs = await clips(page), [c, b, a] = page.ids; return { A: cs.find(x => x.k === a), B: cs.find(x => x.k === b), C: cs.find(x => x.k === c), all: cs }; }
const byId = async (page, id) => (await clips(page)).find(c => c.id === id);
const item = async (page, pred) => (await page.evaluate(() => __E.panel())).items.find(pred);
const icons = (page) => page.evaluate(() => [...document.querySelectorAll('#el i')].filter(i => i.style.visibility === 'visible').map(i => i.className.replace('ti ti-', '')));
/* press, hold (ms), then move dy in ~4 px steps and release */
async function holdDrag(page, x, y, dy, { hold = 320, after = 120 } = {}) { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(hold); const k = Math.max(1, Math.ceil(Math.abs(dy) / 4));
  for (let i = 1; i <= k; i++) { await page.mouse.move(x, y + dy * i / k); await page.waitForTimeout(16); } await page.waitForTimeout(after); await page.mouse.up(); await page.waitForTimeout(250); }
/* hold, then slide out along bud bi (and optionally further), release */
async function holdBud(page, x, y, bi, extra) { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(380);
  const buds = await page.evaluate(() => __E.buds()); const b = buds[bi], ux = b[0] - x, uy = b[1] - y, ul = Math.hypot(ux, uy);
  for (let i = 1; i <= 8; i++) { await page.mouse.move(x + ux / ul * 10 * i, y + uy / ul * 10 * i); await page.waitForTimeout(20); }
  if (extra) await extra(x + ux / ul * 80, y + uy / ul * 80);
  await page.waitForTimeout(80); await page.mouse.up(); await page.waitForTimeout(500); return buds; }
async function select(page, x, y) { await H.tap(page, x, y); await page.waitForTimeout(600); }
async function deselect(page, x, y) { await H.tap(page, x, y); await page.waitForTimeout(400); }
async function twoTap(lib, page) { await H.twoStart(lib, page, [{ x: 120, y: 700 }, { x: 260, y: 700 }]); await page.waitForTimeout(80); await H.twoEnd(lib, page); await page.waitForTimeout(500); }

async function scenario(lib) {
  const sfx = H.SFX(); const dir = lib.outDir('edit-gesture-base' + sfx); const br = await lib.browser(); const files = []; const checks = {}, info = {};
  const page = await std(lib, br, { snap: 1 });
  const v = await view(page), X0 = v.lanes[0], X1 = v.lanes[1], q = v.prop;
  let { A, B, C } = await abc(page);
  info.layout = { A, B, C, view: v };
  checks.layout = !!A && !!B && !!C && lib.near(A.end, B.s, 1e-9) && v.pps === PPS && A.d === 3 && !A.warp && A.fin === 0;
  // 1. props open, then select C
  await H.tap(page, q.x, q.y); await page.waitForTimeout(500);
  const ic0 = await icons(page); await H.shot(page, dir, '0-props-open', files);
  await select(page, X1, await yOf(page, C.s + C.d / 2)); await page.waitForTimeout(400);
  const p1 = await page.evaluate(() => ({ sel: __E.sel(), panel: __E.panel(), st: __E.state() })); const ic1 = await icons(page);
  await H.shot(page, dir, '1-clip-panel', files);
  info.select = { icons0: ic0, icons1: ic1, sel: p1.sel, open: p1.panel.open, k: p1.panel.k, propOpen: p1.st.propOpen };
  checks.propsWereOpen = ['magnet', 'arrow-bar-to-down', 'stack-2', 'device-floppy'].every(n => ic0.includes(n));
  checks.tapSelectsAndShowsPanel = p1.sel === C.id && p1.panel.open && p1.panel.k > .95;
  checks.panelReplacesPropertyBuds = ['metronome', 'activity', 'wave-sine', 'gauge', 'cl-gain', 'cl-note', 'cl-lin', 'cl-eq', 'cl-exp'].every(n => ic1.includes(n))
    && !['magnet', 'arrow-bar-to-down', 'stack-2', 'device-floppy'].some(n => ic1.includes(n)) && !p1.st.propOpen;
  checks.panelClearOfHubCorner = p1.panel.items.every(o => !(o.x < 104 + 20 && o.y > v.H - 104 - 20)) && p1.panel.rect.x0 > 104;
  // tap empty timeline (lane 1 below C, above the panel) -> deselect + playhead, props back
  const yE = 520; await deselect(page, X1, yE); await page.waitForTimeout(500);
  const p2 = await page.evaluate(() => ({ sel: __E.sel(), panel: __E.panel(), st: __E.state(), ph: __S.ph })); const ic2 = await icons(page);
  await H.shot(page, dir, '2-deselected', files);
  const phWant = Math.round(((yE - v.TOP) / v.pps + v.vt) / .3) * .3;
  info.deselect = { sel: p2.sel, k: p2.panel.k, ph: p2.ph, phWant, icons: ic2 };
  checks.tapEmptyDeselects = p2.sel === null && !p2.panel.open && p2.panel.k < .05;
  checks.tapEmptyPlacesPlayhead = lib.near(p2.ph, phWant, 1e-6);
  checks.tapEmptyRestoresPropertyBuds = p2.st.propOpen && ['magnet', 'stack-2', 'device-floppy'].every(n => ic2.includes(n)) && !ic2.includes('metronome');
  await H.tap(page, q.x, q.y); await page.waitForTimeout(400);   // close the props again
  // 3. the four buds
  const yCut = await yOf(page, A.s + 1.37);
  await page.mouse.move(X0, yCut); await page.mouse.down(); await page.waitForTimeout(380);
  const opened = await page.evaluate(() => ({ n: __S.n, open: __S.open, buds: __E.buds().length, g: __E.gesture() })); await page.waitForTimeout(250); const icB = await icons(page);
  await H.shot(page, dir, '3-buds', files); await page.mouse.up(); await page.waitForTimeout(400);
  info.buds = { opened, icons: icB };
  checks.fourBuds = opened.n === 4 && opened.buds === 4 && opened.g && opened.g.phase === 'buds' && ['scissors', 'copy', 'arrows-move', 'trash'].every(n => icB.includes(n)) && !icB.includes('arrows-down-up');
  await holdBud(page, X0, yCut, 0);
  const tHeld = await page.evaluate(() => __E.lastDown().t), cutWant = Math.min(A.end - .3, Math.max(A.s + .3, Math.round(tHeld / .3) * .3));
  let cs = await clips(page); const L0 = cs.filter(c => c.t === 0);
  info.cut = { tHeld, cutWant, lane0: L0 };
  checks.cutSnapped = L0.length === 3 && lib.near(L0[0].end, cutWant, 1e-9) && lib.near(L0[1].s, L0[0].end, 1e-12) && lib.near(L0[0].d + L0[1].d, A.d, 1e-9) && lib.near(L0[1].off, A.off + (L0[1].s - A.s), 1e-9);
  // copy B
  const nBefore = cs.length; B = cs.find(c => c.id === B.id);
  await holdBud(page, X0, await yOf(page, B.s + B.d / 2), 1);
  cs = await clips(page); const copy = cs.find(c => c.k === B.k && c.id !== B.id);
  info.copy = copy;
  checks.copy = cs.length === nBefore + 1 && !!copy && copy.t === 0 && lib.near(copy.s, B.end, 1e-9) && lib.near(copy.d, B.d, 1e-9) && lib.near(copy.off, B.off, 1e-12);
  // move C down 40 px
  C = cs.find(c => c.id === C.id); const cyy = await yOf(page, C.s + C.d / 2);
  await holdBud(page, X1, cyy, 2, async (x, y) => { for (let i = 1; i <= 10; i++) { await page.mouse.move(x, y + 4 * i); await page.waitForTimeout(30); } await page.waitForTimeout(200); });
  const C2 = await byId(page, C.id); info.move = { before: C, after: C2 };
  checks.move = C2.t === 1 && C2.s > C.s + .3;
  // delete the copy
  if (copy) await holdBud(page, X0, await yOf(page, copy.s + copy.d / 2), 3);
  await page.waitForTimeout(400); cs = await clips(page);
  checks.delete = cs.length === nBefore && !cs.find(c => copy && c.id === copy.id);
  await H.shot(page, dir, '4-after-buds', files);
  const errors = H.errorsOf(page); checks.noErrors = errors.length === 0;
  await lib.sheet(br, files, `${dir}/sheet.png`, 3, 200); await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), engine: lib.ENGINE, checks, info, errors });
}
module.exports = scenario;
Object.assign(module.exports, { PPS, openEd, settle, session, stdClips, std, clips, view, st, yOf, abc, byId, item, icons, holdDrag, holdBud, select, deselect, twoTap, H });
