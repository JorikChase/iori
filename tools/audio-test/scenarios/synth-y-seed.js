/* Synth Y1–Y4: the seed itself.
   Y1 the seed draws the live output as a circle, locked to the waveform's zero crossing
   Y2 tap plays 0,12,7,0,3,0,10,7 in eighths of the shared tempo; a tempo change reaches the next notes
   Y3 double-tap mutes the seed (the pattern keeps running, silent) and unmutes; two slow taps stay two taps
   Y4 31 genes in 5 categories, one dot per category down the left edge in its colour, each opening its own genes */
const d = require('../drive');
module.exports = async (lib) => {
  const dir = lib.outDir('synth-y-seed' + (lib.ENGINE === 'webkit' ? '-webkit' : '')), W = lib.VIEW.width, H = lib.VIEW.height, checks = {}, info = {}, DPR = lib.DPR;
  const SEED = { x: W / 2, y: Math.round(H * .56) };
  const br = await lib.browser(); const page = await lib.open(br, 'synth', { wait: 300 }); await d.audioLog(page);
  await page.evaluate(() => { localStorage.removeItem('seed-garden-v1'); AT.setTempo(120); }); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(700); await d.install(page, '#sb');
  const edge = async (png) => { const pts = [], N = 48, rs = []; for (let r = 18; r <= 58; r += 1) rs.push(r);   // the outline's radius by angle
    for (let a = 0; a < N; a++) for (const r of rs) pts.push({ x: SEED.x + r * Math.sin(a / N * 6.2832), y: SEED.y - r * Math.cos(a / N * 6.2832) });
    const px = await d.pixels(br, png, pts, DPR), lum = px.map(c => c[0] + c[1] + c[2]), out = [];
    for (let a = 0; a < N; a++) { const row = lum.slice(a * rs.length, (a + 1) * rs.length), bg = row[row.length - 1]; let k = row.length - 1; while (k > 0 && Math.abs(row[k] - bg) < 200) k--; out.push(rs[k]); } return out; };
  const spread = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length); };

  // a first touch on empty space: it builds the audio graph, which blocks long enough for a scripted lift to look like a hold
  // (a finger's lift keeps its hardware timestamp, a synthetic event's is taken when it is made)
  await page.evaluate(({ x }) => G.tap(x, 150), SEED); await page.waitForTimeout(300);

  // Y1 at rest: a plain circle, flat wave
  const idle = await page.evaluate(() => ({ wa: __U.uWA, flat: Math.max(...__WV) - Math.min(...__WV) })); const rIdle = await edge(await page.screenshot());
  checks.Y1_idleFlat = idle.flat === 0 && idle.wa < .01 && spread(rIdle) < .8; info.idle = { ...idle, rIdle: +spread(rIdle).toFixed(2) };

  // Y2: tap, the first notes in order
  await page.evaluate(() => { __OSC.length = 0; }); await page.evaluate(({ x, y }) => G.tap(x, y), SEED);
  await page.waitForFunction(() => __S.run && __S.ctx && __S.ctx.state === 'running', null, { timeout: 6000 }); await page.waitForTimeout(3000);
  const notes = () => page.evaluate(() => { const by = {}; __OSC.filter(o => o.type === 'sine').forEach(o => { by[o.t] = o.f; }); return Object.keys(by).map(Number).sort((a, b) => a - b).map(t => ({ t, f: by[t] })); });
  const n1 = await notes(), semi = n1.map(n => Math.round(12 * Math.log2(n.f / 220))), PAT = [0, 12, 7, 0, 3, 0, 10, 7], gaps = n1.slice(1).map((n, i) => n.t - n1[i].t);
  checks.Y2_pattern = semi.length >= 8 && semi.every((s, i) => s === PAT[i % 8]); checks.Y2_eighths = gaps.length > 6 && gaps.every(g => lib.near(g, .25, .002));
  info.y2 = { n: semi.length, semi: semi.slice(0, 10), gapMin: +Math.min(...gaps).toFixed(4), gapMax: +Math.max(...gaps).toFixed(4) };

  // Y1 running: the wave reaches the shader, starts on a rising zero crossing every frame, the outline is no longer round
  const wv = await page.evaluate(async () => { const out = []; for (let k = 0; k < 24; k++) { await new Promise(r => requestAnimationFrame(r)); const a = __WV.slice(); let cross = 0, t = 0; for (let i = 1; i < 256; i++) if (a[i - 1] < 128 && a[i] >= 128) cross++; out.push({ a0: a[0], a4: a[4], range: Math.max(...a) - Math.min(...a), cross }); } return { fr: out, wa: __U.uWA }; });
  const voiced = wv.fr.filter(f => f.range > 60);
  checks.Y1_waveReachesShader = voiced.length >= 12 && wv.wa > 1; checks.Y1_synced = voiced.length > 0 && voiced.every(f => Math.abs(f.a0 - 128) < 45 && f.a4 >= f.a0 - 4);
  const rRun = []; for (let k = 0; k < 4; k++) rRun.push(spread(await edge(await page.screenshot({ path: `${dir}/run${k}.png` }))));
  checks.Y1_outlineMoves = Math.max(...rRun) > 1; info.y1 = { voiced: voiced.length, sample: voiced.slice(0, 3), wa: +wv.wa.toFixed(2), rRun: rRun.map(x => +x.toFixed(2)) };

  // Y2: a tempo change reaches the next notes
  await page.evaluate(() => { AT.setTempo(150); __OSC.length = 0; }); await page.waitForTimeout(1500); const n2 = await notes(), g2 = n2.slice(1).map((n, i) => n.t - n2[i].t);
  checks.Y2_tempoLive = g2.length > 4 && g2.every(g => lib.near(g, .2, .002)); info.tempo150 = { n: g2.length, min: +Math.min(...g2).toFixed(4), max: +Math.max(...g2).toFixed(4) };

  // Y3: double-tap while running
  const tap2 = (gap) => page.evaluate(async ({ x, y, gap }) => { await G.tap(x, y, { ms: 30 }); await G.wait(gap); await G.tap(x, y, { ms: 30 }); }, { ...SEED, gap });
  const count = async (ms) => { await page.evaluate(() => { __OSC.length = 0; }); await page.waitForTimeout(ms); return page.evaluate(() => __OSC.length); };
  await tap2(90); await page.waitForTimeout(200); const m1 = await page.evaluate(() => ({ mute: __S.mute, run: __S.run })); const silent = await count(700);
  await tap2(90); await page.waitForTimeout(200); const m2 = await page.evaluate(() => ({ mute: __S.mute, run: __S.run })); const back = await count(700);
  checks.Y3_mutes = m1.mute && m1.run && silent === 0; checks.Y3_unmutes = !m2.mute && m2.run && back > 0; info.y3 = { m1, silent, m2, back };
  await tap2(500); await page.waitForTimeout(500); const m3 = await page.evaluate(() => ({ mute: __S.mute, run: __S.run }));
  checks.Y3_slowTapsAreTaps = !m3.mute && m3.run; info.slow = m3;   // stop, then start
  await page.evaluate(({ x, y }) => G.tap(x, y), SEED); await page.waitForTimeout(800);   // stopped, screen white again

  // Y4
  const g = await page.evaluate(() => { const c = {}; __SW.GN0.forEach(x => { (c[x.c] = c[x.c] || []).push(x.n); }); return { n: __SW.GN0.length, c }; });
  checks.Y4_31genes = g.n === 31 && Object.keys(g.c).length === 5;
  const dots = [0, 1, 2, 3, 4].map(i => ({ c: i + 1, x: 26, y: Math.round(H * .3) + i * Math.round(H * .105) })), CATC = { 1: [.16, .45, .95], 2: [.93, .3, .4], 3: [.98, .7, .2], 4: [.2, .82, .58], 5: [.62, .42, .98] };
  const png = await page.screenshot({ path: `${dir}/dots.png` }), px = await d.pixels(br, png, dots.map(q => ({ x: q.x + 7, y: q.y })), DPR);
  checks.Y4_dotColours = px.every((c, i) => c.every((v, k) => Math.abs(v - CATC[i + 1][k] * 255) < 30)); info.dotPx = px;
  const open = []; for (const q of dots) { const o = await page.evaluate(async ({ x, y }) => { G.down(x, y); await G.frame(() => __S.open, 1200); await G.wait(350); const r = __S.open; const out = r && { cat: r.catRoot, kids: r.kids.map(k => __SW.GN0[k.gi].n), onScreen: r.kids.every(k => k.lp.x > 8 && k.lp.x < innerWidth - 8 && k.lp.y > 8 && k.lp.y < innerHeight - 8) }; G.up(); await G.wait(200); return out; }, q);
    await page.screenshot({ path: `${dir}/menu${q.c}.png` }); open.push(o); }
  checks.Y4_dotsOpenGenes = open.every((o, i) => o && o.cat === i + 1 && JSON.stringify(o.kids.slice().sort()) === JSON.stringify(g.c[i + 1].slice().sort()));
  checks.Y4_menusOnScreen = open.every(o => o && o.onScreen); info.open = open.map(o => o && { cat: o.cat, n: o.kids.length, on: o.onScreen });
  const errors = d.clean(page); await br.close(); checks.noErrors = !errors.length;
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info, errors });
};
