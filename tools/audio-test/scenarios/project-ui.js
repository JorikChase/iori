/* Projects in the shell (audio/projects.html, the editor on project.js). Real shell, real frames, real IndexedDB:
   1. home -> the folder top-left opens the list; the first visit made "First project"
   2. a new project, named by typing; it becomes the current one
   3. each project keeps its own timeline: a clip placed in one doesn't appear in the other, and comes back with it
   4. the save file: first tap builds it (green), second tap shares one .audio.zip
   5. that file, opened on a clean device, is a project with the same clip
   6. delete asks twice and keeps the recordings */
const fs = require('fs'), path = require('path');
module.exports = async (lib) => {
  const dir = lib.outDir('project-ui'); const checks = {}, info = {};
  const br = await lib.browser(); const ctx = await br.newContext({ viewport: lib.VIEW, deviceScaleFactor: lib.DPR, acceptDownloads: true });
  await ctx.addInitScript(() => { window.__shared = []; const P = Navigator.prototype;
    Object.defineProperty(P, 'canShare', { configurable: true, value: (d) => !!(d && d.files && d.files.length) });
    Object.defineProperty(P, 'share', { configurable: true, value: async (d) => { const f = d.files[0]; (window.top.__shared || []).push({ name: f.name, size: f.size, b64: await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(f); }) }); } }); });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${lib.PORT}/audio/`, { waitUntil: 'load' }); await page.waitForTimeout(1200);
  const pf = () => page.frames().find(f => f.url().includes('projects.html'));
  const ed = () => page.frames().find(f => f.url().includes('/t/edit.html'));
  const openList = async () => { await page.click('#projects'); await page.waitForFunction(() => !!document.getElementById('projectsframe')); await page.waitForTimeout(300); await pf().waitForSelector('li'); await page.waitForTimeout(200); };
  const rows = () => pf().evaluate(() => [...document.querySelectorAll('li')].map(l => ({ id: l.dataset.id, name: l.querySelector('.nm') && l.querySelector('.nm').textContent, cur: l.classList.contains('cur') })));
  const hit = (x, y) => page.evaluate(([x, y]) => new Promise(res => { const h = document.getElementById('hit'), f = (t) => h.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'touch' })); f('pointerdown'); setTimeout(() => { f('pointerup'); res(); }, 60); }), [x, y]);
  const toEditor = async () => { const s = await page.evaluate(() => __SAT(0)); await hit(s.x, s.y); await page.waitForFunction(() => __S.mode === 'tool' && __S.tool === 0, null, { timeout: 8000 }); await page.waitForTimeout(300); await ed().waitForFunction(() => __S.ready, null, { timeout: 8000 }); await page.waitForTimeout(300); };
  const home = async () => { await hit(40, lib.VIEW.height - 40); await page.waitForFunction(() => __S.mode === 'home', null, { timeout: 12000 }); await page.waitForTimeout(400); };
  // a take in the library, made the way the recorder makes one
  await page.evaluate(() => { const f = document.createElement('iframe'); f.src = 't/tuner.html'; f.style.display = 'none'; f.id = 'lib'; document.body.appendChild(f); });
  await page.waitForTimeout(1200);
  const take = await page.frames().find(f => f.url().includes('t/tuner.html')).evaluate(async () => { const sr = 48000, d = new Float32Array(sr * 2); for (let i = 0; i < d.length; i++) d[i] = Math.sin(i / 9) * .3; return (await AT.takes.put({ name: 'one', kind: 'rec', sr, data: d })).id; });
  await page.evaluate(() => document.getElementById('lib').remove());
  // 1
  await openList(); let r = await rows(); info.first = r; checks.firstProject = r.length === 1 && r[0].name === 'First project' && r[0].cur;
  await page.screenshot({ path: `${dir}/1-list.png` });
  // 2
  await pf().click('#new'); await pf().waitForSelector('input.nm'); await pf().fill('input.nm', 'Song B'); await pf().press('input.nm', 'Enter'); await page.waitForTimeout(500);
  r = await rows(); info.second = r; const B = r.find(x => x.name === 'Song B'), A = r.find(x => x.name === 'First project');
  checks.newNamed = r.length === 2 && !!B && B.cur && !A.cur;
  // 3: open A, place the take, then B is empty, then A has it again
  await pf().click(`li[data-id="${A.id}"] .open`); await page.waitForFunction(() => !document.getElementById('projectsframe'));
  await page.evaluate((id) => localStorage.setItem('audio.place', JSON.stringify([{ id, at: 'playhead' }])), take);
  await toEditor(); await ed().waitForFunction(() => __D.clips.length === 1, null, { timeout: 8000 }).catch(() => {}); const inA = await ed().evaluate(() => __D.clips.length); await page.waitForTimeout(800); await home();
  await openList(); await pf().click(`li[data-id="${B.id}"] .open`); await page.waitForFunction(() => !document.getElementById('projectsframe'));
  await toEditor(); const inB = await ed().evaluate(() => __D.clips.length); await home();
  await openList(); await pf().click(`li[data-id="${A.id}"] .open`); await page.waitForFunction(() => !document.getElementById('projectsframe'));
  await toEditor(); const backA = await ed().evaluate(() => __D.clips.map(c => c.k)); await home();
  info.switching = { inA, inB, backA }; checks.projectsSeparate = inA === 1 && inB === 0 && backA.length === 1 && backA[0] === take;
  // 4
  await openList(); await pf().click(`li[data-id="${A.id}"] .exp`); await pf().waitForSelector(`li[data-id="${A.id}"] .exp.ready`, { timeout: 15000 });
  await page.screenshot({ path: `${dir}/4-ready.png` });
  await pf().click(`li[data-id="${A.id}"] .exp`); await page.waitForTimeout(800);
  const shared = await page.evaluate(() => window.__shared); info.shared = shared.map(s => ({ name: s.name, size: s.size }));
  checks.exportShares = shared.length === 1 && /^First project\.audio\.zip$/.test(shared[0].name) && shared[0].size > 190000;
  // 6
  await pf().click(`li[data-id="${B.id}"] .del`); await page.waitForTimeout(200); const armed = (await rows()).length;
  await pf().click(`li[data-id="${B.id}"] .del`); await page.waitForTimeout(500); r = await rows();
  const libLeft = await pf().evaluate(async () => (await AT.takes.list()).length);
  checks.deleteAsksTwice = armed === 2 && r.length === 1 && r[0].id === A.id && libLeft === 1;
  await page.screenshot({ path: `${dir}/6-after-delete.png` });
  // 5: a clean device opens the save file
  const file = path.join(dir, shared[0] ? 'First project.audio.zip' : 'none.zip'); if (shared[0]) fs.writeFileSync(file, Buffer.from(shared[0].b64, 'base64'));
  const br2 = await lib.browser(); const p2 = await br2.newPage({ viewport: lib.VIEW }); p2.on('pageerror', e => errs.push(String(e)));
  await p2.goto(`http://127.0.0.1:${lib.PORT}/audio/projects.html`, { waitUntil: 'load' }); await p2.waitForSelector('li'); await p2.waitForTimeout(300);
  const [chooser] = await Promise.all([p2.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), p2.click('#import')]);
  if (chooser) await chooser.setFiles(file); await p2.waitForFunction(() => /Opened/.test(document.getElementById('msg').textContent), null, { timeout: 10000 }).catch(() => {});
  const im = await p2.evaluate(async () => { const id = Project.current(), d = await Project.load(id); return { msg: document.getElementById('msg').textContent, name: d.name, clips: d.tracks[0].clips.length, take: d.tracks[0].clips[0] && d.tracks[0].clips[0].take, lib: (await AT.takes.list()).length, rows: document.querySelectorAll('li').length }; });
  info.imported = im; checks.importOpens = im.name === 'First project' && im.clips === 1 && im.take === take && im.lib === 1 && im.rows === 2;
  await br2.close(); await ctx.close(); await br.close();
  checks.noErrors = !errs.filter(e => !/service ?worker/i.test(e)).length; info.errs = errs;
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info });
};
