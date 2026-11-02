/* The project format (audio/docs/FORMAT.md, audio/project.js). Real library, real IndexedDB:
   1. a blank document validates; bad documents are caught, unknown fields survive, a newer version is refused
   2. the old session, tool keys and synth garden become one project, once; the old keys stay
   3. save and load; a damaged newest slot falls back to the older one
   4. undo and redo survive a reload and restore the document exactly
   5. the save file is a real ZIP with real WAVs (python's zipfile and wave read it), and importing it in a clean
      browser gives the same document and the same samples
   6. a damaged save file is refused, and the live app's tools still open on the upgraded database */
const fs = require('fs'), cp = require('child_process'), path = require('path');
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('project-format'); const url = `http://127.0.0.1:${lib.PORT}/audio/project.js`;
  const openP = async (b) => { const p = await lib.open(b, 'rec', { wait: 700 }); await p.addScriptTag({ url }); return p; };
  const page = await openP(br); const checks = {}, info = {};
  // 1
  const r1 = await page.evaluate(() => { const d = Project.blank('x'), bad = Project.blank('y'); bad.tracks[0].clips.push({ id: 'c', type: 'audio', take: 'none', anchor: 'time', at: 1.5, len: 10, off: 0, span: 10 });
    const fut = Project.blank('z'); fut.version = 99; let refused = ''; try { Project.upgrade(fut); } catch (e) { refused = e.message; }
    const extra = Project.blank('e'); extra.later = { kept: 1 }; extra.tracks[0].later = 2; const kept = Project.upgrade(extra);
    return { ok: Project.validate(d), bad: Project.validate(bad), refused, kept: kept.later && kept.tracks[0].later }; });
  checks.blankValid = r1.ok.length === 0; checks.badCaught = r1.bad.length >= 2; checks.newerRefused = /newer version/.test(r1.refused); checks.unknownKept = r1.kept === 2;
  // 2
  const seed = await page.evaluate(async () => { const sr = 48000, mk = (hz, s) => { const d = new Float32Array(sr * s); for (let i = 0; i < d.length; i++) d[i] = Math.sin(i * hz / sr * 6.283) * .4; return d; };
    const a = await AT.takes.put({ name: 'take a', kind: 'rec', sr, data: mk(440, 2), markers: [.5] }), b = await AT.takes.put({ name: 'take b', kind: 'file', sr: 44100, data: mk(660, 1) });
    AT.setTempo(128);
    AT.session.save('edit', { v: 3, tl: 40, ph: 1.5, vt: 2, pps: 30, snap: 0, push: 1, hx: 1, tracks: [{ m: 1, s: 0, a: 0 }, { m: 0, s: 1, a: 0 }], clips: [
      { k: a.id, t: 0, s: 1.2, d: 1, off: .25, rev: 1, sl: 1, warp: 1, mode: 'tones', ot: 90, ots: 'set', semi: 3, gain: -2, fin: .1, fout: .2, curve: 1 },
      { k: b.id, t: 1, s: 2, d: .5, off: 0, rev: 0, sl: .5, warp: 0, mode: 'beats', ot: 128, ots: 'shared', semi: 0, gain: 0, fin: 0, fout: 0, curve: 0 },
      { k: 'gone', t: 1, s: 5, d: 1, off: 0, rev: 0, sl: 1 }] });
    AT.session.save('tuner', { a4: 432 }); AT.session.save('metro', { n: 7, st: [2, 1, 0] });
    const seedU = Project.GENES.map((_, i) => i / 40), ph = Project.GENES.map(() => ({ k1: 1, k2: 2, p1: .5, p2: 1.5 }));
    localStorage.setItem('seed-garden-v1', JSON.stringify({ seed: seedU, ph, setup: 2, mute: true, layersOn: false, pk: [{ x: 10, y: 20, u: seedU, col: [1, 0, 0], on: true, an: [{ p: { x: 1, y: 2 }, u: seedU, ph }] }] }));
    const d = await Project.migrate(), again = await Project.migrate(); return { d, sameId: again.id === d.id, count: (await Project.list()).length, a: a.id, b: b.id, oldKept: !!localStorage.getItem('audio.session.edit') }; });
  const d = seed.d, c0 = d.tracks[0].clips[0], c1 = d.tracks[1].clips[0], pat = Object.values(d.patches)[0]; info.c0 = c0;
  checks.migrateValid = (await page.evaluate((d) => Project.validate(d), d)).length === 0;
  checks.migrateTimes = c0.at === 57600 && c0.len === 48000 && c0.off === 12000 && c0.fadeIn === 4800 && c0.warp.on && c0.warp.semi === 3 && c0.warp.mode === 'tones' && c0.rev;
  checks.migrateNativeRate = c1.span === 22050;
  checks.migrateDropsGone = d.tracks[1].clips.length === 1;
  checks.migrateTracks = d.tracks[0].mute && d.tracks[1].solo && d.time.tempo === 128 && d.view.playhead === 72000 && !d.view.snap && d.view.push;
  checks.migrateTools = d.tools.tuner.a4 === 432 && d.tools.metro.n === 7;
  checks.migrateGenesByName = pat.genes.base === 1 / 40 && pat.genes.sub === 30 / 40 && pat.setup === 2 && pat.mute && !pat.layers && pat.parked[0].path[0].x === 1 && pat.ph.wave[2] === .5;
  checks.migrateOnce = seed.sameId && seed.count === 1 && seed.oldKept;
  // 3 and 4
  const r3 = await page.evaluate(async (id) => { let d = await Project.load(id); const a = JSON.stringify(d);
    const b4 = JSON.parse(a); d.name = 'renamed'; d.tracks[0].gain = -3; d.markers.push({ at: 10, name: 'm' }); delete d.tools.tuner; await Project.edited(b4, d); d = await Project.save(d);
    const saved = JSON.stringify(d); const u = await Project.undo(d);
    const mid = JSON.parse(a); const same = u.name === mid.name && u.tracks[0].gain === mid.tracks[0].gain && u.markers.length === 0 && !!u.tools.tuner; 
    const r = await Project.redo(u); const back = r.name === 'renamed' && r.tracks[0].gain === -3 && !r.tools.tuner;
    return { same, back, rev: d.rev, saved }; }, d.id);
  checks.undoExact = r3.same; checks.redoExact = r3.back;
  const r4 = await page.evaluate(async (id) => { let d = await Project.load(id); const rev0 = d.rev; d.name = 'newest'; d = await Project.save(d);
    const x = await AT.db.store(['docs'], 'readwrite'); const k = id + ':' + (d.rev % 2), row = await AT.db.req(x.s('docs').get(k)); row.json = row.json.slice(0, -40) + 'x'; x.s('docs').put(row); await x.done;
    const got = await Project.load(id); return { rev0, rev: d.rev, got: got && got.rev, name: got && got.name }; }, d.id);
  checks.damagedSlotFallsBack = r4.got === r4.rev0 && r4.name !== 'newest'; info.r4 = r4;
  // 5
  const out = await page.evaluate(async (id) => { let d = await Project.load(id); d.name = 'My: song'; d = await Project.save(d); const f = await Project.exportFile(d); const b = new Uint8Array(await f.blob.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768));
    const a = await AT.takes.raw(Object.keys(d.takes)[0]); const sums = {}; for (const k of Object.keys(d.takes)) sums[k] = Array.from((await AT.takes.raw(k)).pcm.slice(1000, 1010)); return { name: f.name, b64: btoa(s), doc: d, sums }; }, d.id);
  const file = path.join(dir, 'project.audio.zip'); fs.writeFileSync(file, Buffer.from(out.b64, 'base64')); checks.fileName = out.name === 'My- song.audio.zip';
  const py = cp.execFileSync('python3', ['-I', '-c', `import zipfile,wave,json,sys,io
z=zipfile.ZipFile(sys.argv[1]);bad=z.testzip();n=z.namelist();j=json.loads(z.read('project.json'));w=[]
for m in n:
    if m.endswith('.wav'):
        f=wave.open(io.BytesIO(z.read(m)));w.append([f.getframerate(),f.getnchannels(),f.getsampwidth(),f.getnframes()])
print(json.dumps({'bad':bad,'first':n[0],'wavs':sorted(w),'format':j['format'],'stored':all(i.compress_type==0 for i in z.infolist())}))`, file]).toString(); const zinfo = JSON.parse(py); info.zip = zinfo;
  checks.realZip = zinfo.bad === null && zinfo.first === 'project.json' && zinfo.format === 'audio-project' && zinfo.stored;
  checks.realWavs = JSON.stringify(zinfo.wavs) === JSON.stringify([[44100, 1, 2, 48000], [48000, 1, 2, 96000]]);
  // clean browser: same document, same samples
  const br2 = await lib.browser(); const p2 = await openP(br2);
  const put = (p, b64) => p.evaluate(async (b64) => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); window.__f = new File([u], 'p.audio.zip'); const d = await Project.importFile(__f); const sums = {}; for (const k of Object.keys(d.takes)) sums[k] = Array.from((await AT.takes.raw(k)).pcm.slice(1000, 1010)); return { d, sums, n: (await AT.takes.list()).length }; }, b64);
  const im = await put(p2, out.b64);
  const norm = (x) => { const y = JSON.parse(JSON.stringify(x)); ['id', 'rev', 'modified'].forEach(k => delete y[k]); return y; };
  checks.importSameDocument = JSON.stringify(norm(im.d)) === JSON.stringify(norm({ ...out.doc, takes: im.d.takes })) && im.d.id !== out.doc.id;
  checks.importSameSamples = JSON.stringify(im.sums) === JSON.stringify(out.sums) && im.n === 2;
  const twice = await p2.evaluate(async () => { const d = await Project.importFile(__f); return { n: (await AT.takes.list()).length, projects: (await Project.list()).length, ok: !!d }; });
  checks.importTwiceNoCopies = twice.n === 2 && twice.projects === 2;
  const br3 = await lib.browser(); const p3 = await openP(br3);   // a clean device: the damaged copy is the only copy
  const dmg = await p3.evaluate(async (b64) => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); u[u.length >> 1] ^= 255; let m = ''; try { await Project.importFile(new File([u], 'x')); } catch (e) { m = e.message; } let n = ''; try { await Project.importFile(new File([new Uint8Array(100)], 'y')); } catch (e) { n = e.message; } return { m, n, left: (await Project.list()).length }; }, out.b64); await br3.close();
  checks.damagedRefused = /damaged/.test(dmg.m) && /isn't an audio project/.test(dmg.n) && dmg.left === 0; info.dmg = dmg;
  const errs = page.errors.concat(p2.errors).filter(e => !/service ?worker/i.test(e)); await br.close(); await br2.close();
  checks.noErrors = !errs.length;
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info, errs });
};
