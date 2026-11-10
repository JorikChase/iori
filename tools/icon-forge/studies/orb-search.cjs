// Searches the real orb shells (shape, flow and order untouched) for frames whose orange, cream and teal fall
// roughly where the 3die mark's triangles sit, with most of the disc covered.
// Each shell keeps its own time and threshold; the whole orb may rotate. node tools/icon-forge/studies/orb-search.cjs
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../../..');
const { chromium } = require(path.join(root, 'tools/audio-test/node_modules/playwright'));
const OUT = path.join(__dirname, 'out/orb');
const src = fs.readFileSync(path.join(root, 'audio/index.html'), 'utf8');
const AC = eval(src.match(/var AC=(\[\[.*?\]\]);/)[1]);
let FS = eval(src.match(/var FS=(\[[\s\S]*?\])\.join\('\\n'\);/)[1]).join('\n');

FS = FS.replace('float shell(', 'float gT;\nfloat shell(')
  .replace('vec3 q=flow(rx(ax,uT*sp)*(uM*p),uT,m);', 'vec3 q=flow(rx(ax,gT*sp)*(uM*p),gT,m);')
  .replace('.22*gy(q*2.6+uT*.2)', '.22*gy(q*2.6+gT*.2)')
  .replace('uniform vec3 uA,uB,uN,uWc,uDr;', 'uniform vec3 uA,uB,uK,uN,uWc,uDr,uTT,uTh;')
  .replace(' orb=mix(orb,uB,shell(uv,.8,vec3(0.,1.,0.),.21,vec3(-.6,.3,.74),.3,m,pu));', ' gT=uTT.x;orb=mix(orb,uB,shell(uv,.8,vec3(0.,1.,0.),.21,vec3(-.6,.3,.74),uTh.x,m,pu));')
  .replace(',.52,m,pu));', ',uTh.y,m,pu));').replace(' orb=mix(orb,vec3(.95,.92,.86)', ' gT=uTT.y;orb=mix(orb,uK')
  .replace(',.38,m,pu));', ',uTh.z,m,pu));').replace(' orb=mix(orb,uA,shell', ' gT=uTT.z;orb=mix(orb,uA,shell');

// Target: every disc pixel belongs to the nearest triangle, biased so the small two reach a fair share.
const MARK = { orange: [[2, 21], [86, 2], [21.5, 92]], teal: [[43, 61.5], [69, 99], [32, 78]], cream: [[43, 61.5], [96.5, 73], [55, 78]] };
const uvt = t => t.map(([x, y]) => [(x - 50) / 50, (y - 50) / 50]);
const seg = (p, a, b) => { const d = [b[0] - a[0], b[1] - a[1]], e = [p[0] - a[0], p[1] - a[1]]; const h = Math.max(0, Math.min(1, (e[0] * d[0] + e[1] * d[1]) / (d[0] * d[0] + d[1] * d[1]))); return Math.hypot(e[0] - d[0] * h, e[1] - d[1] * h); };
const inside = (p, [a, b, c]) => { const s = (u, v, w) => (w[0] - u[0]) * (v[1] - u[1]) - (w[1] - u[1]) * (v[0] - u[0]); const x = s(a, b, p), y = s(b, c, p), z = s(c, a, p); return (x >= 0 && y >= 0 && z >= 0) || (x <= 0 && y <= 0 && z <= 0); };
const sd = (p, t) => { const m = Math.min(seg(p, t[0], t[1]), seg(p, t[1], t[2]), seg(p, t[2], t[0])); return inside(p, t) ? -m : m; };
const N = 72, BIAS = { orange: 0, teal: .1, cream: .1 }, NAMES = ['orange', 'teal', 'cream'];
const tgt = new Int8Array(N * N).fill(-1);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const p = [(x + .5) / N * 2 - 1, (y + .5) / N * 2 - 1];
  if (Math.hypot(...p) > .98) continue;
  const d = NAMES.map(n => sd(p, uvt(MARK[n])) - BIAS[n]);
  const m = Math.min(...d);
  tgt[x + y * N] = m > .3 ? 3 : d.indexOf(m);
}

const VAR = process.argv[2] === 'variants';
const PICKS = JSON.parse(fs.readFileSync(path.join(__dirname, 'orb-picks.json'), 'utf8'));
const draws = +(process.argv[2] || 2600), RUN = +(process.argv[3] || 40);
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await br.newPage();
  const errs = []; p.on('console', m => errs.push(m.text()));
  await p.setContent(`<canvas id=c width=${N} height=${N}></canvas>`);
  const res = await p.evaluate(async ({ FS, AC, N, tgt, draws, RUN, VAR, PICKS }) => {
    const cv = document.getElementById('c'), gl = cv.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    gl.getExtension('OES_standard_derivatives');
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.log('ERROR ' + gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}'));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const al = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(al); gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);
    const u = n => gl.getUniformLocation(pr, n);
    const W = 380;
    gl.uniform1f(u('uDk'), 1); gl.uniform2f(u('uF'), -9999, -9999); gl.uniform1f(u('uT'), 31);
    const CREAM = [.95, .92, .86], colr = c => c === 'c' ? CREAM : AC[c];
    gl.uniform3fv(u('uA'), AC[0]); gl.uniform3fv(u('uB'), AC[1]); gl.uniform3fv(u('uN'), AC[0]); gl.uniform3fv(u('uK'), CREAM);
    const setSize = S => { cv.width = cv.height = S; gl.viewport(0, 0, S, S); gl.uniform2f(u('uRes'), S, S); gl.uniform1f(u('uDpr'), S / W); gl.uniform2f(u('uC'), W / 2, W / 2); };
    const rot = (a, b) => { const c = Math.cos(a), s = Math.sin(a), d = Math.cos(b), e = Math.sin(b); return [c, s, 0, -s * d, c * d, e, s * e, -c * e, d]; };
    const draw = (g, r) => {
      gl.uniform1f(u('uR'), r);
      gl.uniform3f(u('uTT'), g.tb, g.tc, g.to); gl.uniform3f(u('uTh'), g.b, g.c, g.o);
      gl.uniformMatrix3fv(u('uM'), false, rot(g.a, g.e));
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    const PAL = [[255, 107, 26], [26, 199, 199], [242, 235, 219], [12, 8, 20]];
    const px = new Uint8Array(N * N * 4);
    const score = g => {
      draw(g, 190);
      gl.readPixels(0, 0, N, N, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let s = 0, tot = 0; const n = [0, 0, 0, 0];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const t = tgt[x + y * N]; if (t < 0) continue;
        const i = (x + (N - 1 - y) * N) * 4; let b = 0, bd = 1e9;
        for (let k = 0; k < 4; k++) { const d = (px[i] - PAL[k][0]) ** 2 + (px[i + 1] - PAL[k][1]) ** 2 + (px[i + 2] - PAL[k][2]) ** 2; if (d < bd) { bd = d; b = k; } }
        n[b]++; tot++;
        s += t === 3 ? (b === 3 ? .55 : .7) : b === t ? 1 : b === 3 ? .15 : 0;
      }
      const f = n.map(v => v / tot);
      return { s: s / tot - (f[3] > .24 ? (f[3] - .24) * 2 : 0) - (f[1] < .1 ? .15 : 0) - (f[2] < .08 ? .15 : 0) - (f[0] > .72 ? .2 : 0), f };
    };
    if (VAR) {
      // One colour keeps only the top shell, two colours keep the top shell and the cream one; the rest is hidden.
      setSize(1024);
      const out = [];
      const shot = (name, g, a, k) => {
        gl.uniform3fv(u('uA'), colr(a)); gl.uniform3fv(u('uN'), colr(a)); gl.uniform3fv(u('uK'), colr(k === null ? 'c' : k));
        draw({ ...g, b: 9, c: k === null ? 9 : g.c }, 150);
        out.push([name, cv.toDataURL('image/png')]);
      };
      for (const [id, g] of Object.entries(PICKS)) {
        for (const a of [0, 1, 2, 3, 4, 5, 6, 7, 'c']) shot(`${id}-one-${a}`, g, a, null);
        for (const [a, k] of [[0, 'c'], [1, 'c'], [0, 1], [4, 3], [6, 4], [7, 3], [5, 'c'], [2, 1]]) shot(`${id}-two-${a}-${k}`, g, a, k);
      }
      return { out };
    }
    setSize(N);
    const rnd = (a, b) => a + Math.random() * (b - a);
    const fresh = () => ({ tb: rnd(0, 300), tc: rnd(0, 300), to: rnd(0, 300), a: rnd(0, 6.283), e: rnd(-.5, .5), b: rnd(.05, .5), c: rnd(.15, .7), o: rnd(.1, .6) });
    const pool = [];
    const t0 = performance.now();
    let i = 0;
    while (i < draws && performance.now() - t0 < RUN * 1000) { const g = fresh(); pool.push({ g, ...score(g) }); i++; if (i % 200 == 0) await new Promise(r => setTimeout(r)); }
    pool.sort((x, y) => y.s - x.s);
    const top = pool.slice(0, 30);
    let m = 0;
    const t1 = performance.now();
    while (performance.now() - t1 < RUN * 1000) {
      for (const c of top) {
        const g = { ...c.g };
        for (const k in g) if (Math.random() < .5) g[k] += rnd(-1, 1) * ({ tb: 3, tc: 3, to: 3, a: .25, e: .1, b: .05, c: .05, o: .05 })[k];
        const r = score(g); m++;
        if (r.s > c.s) { c.g = g; c.s = r.s; c.f = r.f; }
      }
      await new Promise(r => setTimeout(r));
    }
    top.sort((x, y) => y.s - x.s);
    const keep = [];
    for (const c of top) if (keep.every(k => Math.abs(k.g.to - c.g.to) > 2 || Math.abs(k.g.tc - c.g.tc) > 2)) keep.push(c);
    setSize(1024);
    const shots = keep.slice(0, 8).map((c, n) => { draw(c.g, 150); return { n, s: c.s, f: c.f.map(v => +v.toFixed(2)), g: c.g, url: cv.toDataURL('image/png') }; });
    return { draws: i, mutants: m, shots };
  }, { FS, AC, N, tgt: Array.from(tgt), draws, RUN, VAR, PICKS });
  if (VAR) {
    const dir = path.join(OUT, 'variants'); fs.mkdirSync(dir, { recursive: true });
    for (const [n, d] of res.out) fs.writeFileSync(path.join(dir, n + '.png'), Buffer.from(d.split(',')[1], 'base64'));
    console.log('wrote', res.out.length); await br.close(); return;
  }
  for (const f of fs.readdirSync(OUT)) if (f.startsWith('real-')) fs.unlinkSync(path.join(OUT, f));
  for (const r of res.shots) fs.writeFileSync(path.join(OUT, `real-${r.n}.png`), Buffer.from(r.url.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(OUT, 'real-params.json'), JSON.stringify(res.shots.map(({ url, ...r }) => r), null, 1));
  console.log(JSON.stringify({ draws: res.draws, mutants: res.mutants, best: res.shots.map(r => [+r.s.toFixed(3), r.f]), errs: errs.slice(0, 3) }));
  await br.close();
})();
