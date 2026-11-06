// Renders the Audio home orb through its real fragment shader, lifted from audio/index.html.
// node tools/icon-forge/studies/orb.cjs   (writes out/orb/*.png)
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../../..');
const { chromium } = require(path.join(root, 'tools/audio-test/node_modules/playwright'));
const OUT = path.join(__dirname, 'out/orb');
fs.mkdirSync(OUT, { recursive: true });

const src = fs.readFileSync(path.join(root, 'audio/index.html'), 'utf8');
const FS = eval(src.match(/var FS=(\[[\s\S]*?\])\.join\('\\n'\);/)[1]).join('\n');
const AC = eval(src.match(/var AC=(\[\[.*?\]\]);/)[1]);

const S = 1024, W = 380, C = W / 2;
const V = [];
for (const t of [0, 7, 19, 31, 43, 67, 83, 101]) V.push({ name: `rest-t${t}`, t, r: 150, a: 0, b: 1, sats: 0 });
for (const t of [19, 43]) V.push({ name: `tools-t${t}`, t, r: 120, a: 0, b: 1, sats: 1, bloom: 1 });
for (const t of [19, 43, 67]) V.push({ name: `bleed-t${t}`, t, r: 285, a: 0, b: 1, sats: 0 });
for (const [a, b] of [[7, 0], [4, 1], [3, 2], [5, 6]]) V.push({ name: `pair-${a}-${b}`, t: 43, r: 150, a, b, sats: 0 });

// Extra colour shells, icon only: the app's tool colours under the three real shells.
const vec = i => `vec3(${AC[i].map(v => v.toFixed(3)).join(',')})`;
const SH = [
  [4, .94, '.5,.7,.5', -.11, '.7,.45,.55', .36],
  [3, .88, '.8,.1,.6', .15, '.1,.85,.5', .46],
  [2, .84, '.2,.9,.4', -.19, '-.75,.5,.45', .42],
  [5, .78, '.9,.3,.3', .09, '.5,-.7,.5', .34],
  [7, .72, '.3,.3,.9', -.13, '-.3,-.8,.5', .4],
  [6, .66, '.6,.6,.5', .17, '.8,.3,.5', .32],
];
const extra = n => SH.slice(0, n).map(([c, r, ax, sp, nn, th]) =>
  ` orb=mix(orb,${vec(c)},shell(uv,${r},normalize(vec3(${ax})),${sp},normalize(vec3(${nn})),${th},m,pu));`).join('\n');
for (const n of [2, 4, 6]) for (const t of [31, 26, 36, 49]) V.push({ name: `more${n}-t${t}`, t, r: 150, a: 0, b: 1, sats: 0, x: n });
// Pull the two top shells back so the colours underneath share the disc.
for (const [o, c] of [[.56, .66], [.68, .74], [.8, .8]]) for (const t of [26, 31, 36, 40]) V.push({ name: `more6-o${Math.round(o * 100)}-t${t}`, t, r: 150, a: 0, b: 1, sats: 0, x: 6, o, c });
// Three colours, cut roughly along the 3die mark and melted by the orb's own flow.
const CREAM = [.95, .92, .86];
const col = c => `vec3(${(c === 'c' ? CREAM : AC[c]).map(v => v.toFixed(3)).join(',')})`;
const TRI = `float sdt(vec2 p,vec2 a,vec2 b,vec2 c){vec2 e0=b-a,e1=c-b,e2=a-c,v0=p-a,v1=p-b,v2=p-c;
vec2 q0=v0-e0*clamp(dot(v0,e0)/dot(e0,e0),0.,1.),q1=v1-e1*clamp(dot(v1,e1)/dot(e1,e1),0.,1.),q2=v2-e2*clamp(dot(v2,e2)/dot(e2,e2),0.,1.);
float s=sign(e0.x*e2.y-e0.y*e2.x);
vec2 d=min(min(vec2(dot(q0,q0),s*(v0.x*e0.y-v0.y*e0.x)),vec2(dot(q1,q1),s*(v1.x*e1.y-v1.y*e1.x))),vec2(dot(q2,q2),s*(v2.x*e2.y-v2.y*e2.x)));
return -sqrt(d.x)*sign(d.y);}
`;
const M = { g: [[2, 21], [86, 2], [21.5, 92]], r: [[43, 61.5], [69, 99], [32, 78]], o: [[43, 61.5], [96.5, 73], [55, 78]] };
const pts = (t, k) => M[t].map(([x, y]) => `vec2(${((x - 50) / 50 * k).toFixed(3)},${((y - 50) / 50 * k).toFixed(3)})`).join(',');
const markFS = v => FS.replace('void main(){', TRI + 'void main(){')
  .replace(/ orb=mix\(orb,uB,shell[^\n]*\n orb=mix\(orb,vec3\(\.95[^\n]*\n orb=mix\(orb,uA,shell[^\n]*\n/, [
    ` vec2 wu=uv+(flow(p,uT,${v.w.toFixed(2)}).xy-p.xy);`,
    ...['r', 'o', 'g'].map((t, i) => ` {float dm=sdt(wu,${pts(t, v.k)})-${v.rr.toFixed(3)};float em=fwidth(dm)*.8+1e-4;orb=mix(orb,${col(v.c[['r', 'o', 'g'].indexOf(t) === 0 ? 1 : t === 'o' ? 2 : 0])},smoothstep(em,-em,dm));}`),
  ].join('\n') + '\n');
const MV = [];
for (const [n, c] of [['tealredyellow', [1, 7, 3]], ['orangetealcream', [0, 1, 'c']], ['violetpinkyellow', [4, 6, 3]], ['tealorangeyellow', [1, 0, 3]], ['creamorangeteal', ['c', 0, 1]], ['bluered', [5, 7, 3]]])
  MV.push({ name: `mark-${n}`, t: 31, r: 150, a: 0, b: 1, sats: 0, w: .4, k: .95, rr: .05, c });
for (const w of [.15, .7, 1.1]) MV.push({ name: `mark-w${Math.round(w * 100)}`, t: 31, r: 150, a: 0, b: 1, sats: 0, w, k: .95, rr: .05, c: [1, 7, 3] });
for (const t of [12, 47, 73]) MV.push({ name: `mark-t${t}`, t, r: 150, a: 0, b: 1, sats: 0, w: .5, k: .95, rr: .05, c: [0, 1, 'c'] });
// Three clean blobs in the mark's layout: each triangle rounded by a share of its own inradius, no flow.
const inset = (t, k, f) => {
  const q = M[t].map(([x, y]) => [(x - 50) / 50 * k, (y - 50) / 50 * k]);
  const L = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const [a, b, c] = q, A = L(b, c), B = L(a, c), D = L(a, b), per = A + B + D;
  const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
  const inr = 2 * area / per, I = [(A * a[0] + B * b[0] + D * c[0]) / per, (A * a[1] + B * b[1] + D * c[1]) / per];
  const rr = inr * f;
  return { rr, pts: q.map(p => `vec2(${(I[0] + (p[0] - I[0]) * (1 - f)).toFixed(3)},${(I[1] + (p[1] - I[1]) * (1 - f)).toFixed(3)})`).join(',') };
};
const blobFS = v => FS.replace('void main(){', TRI + 'void main(){').replace('vec3(.3)*ln', `vec3(${v.ln.toFixed(2)})*ln`)
  .replace(/ orb=mix\(orb,uB,shell[^\n]*\n orb=mix\(orb,vec3\(\.95[^\n]*\n orb=mix\(orb,uA,shell[^\n]*\n/, [
    ` vec2 wu=uv+(flow(p,uT,${v.w.toFixed(2)}).xy-p.xy);`,
    ...[['r', 1], ['o', 2], ['g', 0]].map(([t, i]) => {
      const b = inset(t, v.k, t === 'o' ? Math.min(.8, v.f) : v.f);
      return ` {float dm=sdt(wu,${b.pts})-${b.rr.toFixed(3)};float em=fwidth(dm)*.8+1e-4;orb=mix(orb,${col(v.c[i])},smoothstep(em,-em,dm));}`;
    }),
  ].join('\n') + '\n');
const BV = [];
const B0 = { t: 31, r: 150, a: 0, b: 1, sats: 0, w: 0, k: .86, f: .7, ln: .3 };
for (const [n, c] of [['tealredyellow', [1, 7, 3]], ['orangetealcream', [0, 1, 'c']], ['tealorangeyellow', [1, 0, 3]], ['creamorangeteal', ['c', 0, 1]], ['orangevioletyellow', [0, 4, 3]], ['tealpinkyellow', [1, 6, 3]]])
  BV.push({ ...B0, name: `blob-${n}`, c });
for (const f of [.5, .9]) BV.push({ ...B0, name: `blob-round${Math.round(f * 100)}`, f, c: [1, 7, 3] });
for (const k of [.76, .96]) BV.push({ ...B0, name: `blob-size${Math.round(k * 100)}`, k, c: [1, 7, 3] });
for (const w of [.06, .12]) BV.push({ ...B0, name: `blob-soft${Math.round(w * 100)}`, w, c: [1, 7, 3] });
BV.push({ ...B0, name: 'audio-pick', k: .96, c: [0, 1, 'c'] });
BV.push({ ...B0, name: 'blob-lines60', ln: .6, c: [1, 7, 3] });
BV.push({ ...B0, name: 'blob-lines60-orange', ln: .6, c: [0, 1, 'c'] });
const ONLY = process.argv[2] === 'more';
const MARK = process.argv[2] === 'mark';
const BLOB = process.argv[2] === 'blob';

(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await br.newPage();
  const errs = []; p.on('console', m => m.text().startsWith('ERROR') && errs.push(m.text()));
  await p.setContent(`<canvas id=c width=${S} height=${S}></canvas>`);
  const hook = " orb=mix(orb,uB,shell(uv,.8,";
  const list = BLOB ? BV.map(v => ({ ...v, fs: blobFS(v) })) : MARK ? MV.map(v => ({ ...v, fs: markFS(v) })) : (ONLY ? V.filter(v => v.x) : V).map(v => ({ ...v, fs: FS.replace(hook, (v.x ? extra(v.x) + '\n' : '') + hook).replace(',.52,m,pu', `,${v.c || .52},m,pu`).replace(',.38,m,pu', `,${v.o || .38},m,pu`) }));
  const shots = await p.evaluate(({ AC, S, W, C, V }) => {
    const cv = document.getElementById('c'), gl = cv.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    gl.getExtension('OES_standard_derivatives');
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.log('ERROR ' + gl.getShaderInfoLog(o)); return o; };
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.viewport(0, 0, S, S);
    return V.map(v => {
      const pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}'));
      gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, v.fs)); gl.linkProgram(pr); gl.useProgram(pr);
      const al = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(al); gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);
      const u = n => gl.getUniformLocation(pr, n);
      gl.uniform2f(u('uRes'), S, S); gl.uniform1f(u('uDpr'), S / W); gl.uniform1f(u('uT'), v.t);
      gl.uniform2f(u('uC'), C, C); gl.uniform1f(u('uR'), v.r); gl.uniform2f(u('uF'), -9999, -9999);
      gl.uniform1f(u('uSats'), v.sats); gl.uniform1f(u('uBloom'), v.bloom || 0); gl.uniform1f(u('uDk'), 1);
      gl.uniform3fv(u('uA'), AC[v.a]); gl.uniform3fv(u('uB'), AC[v.b]); gl.uniform3fv(u('uN'), AC[v.a]);
      gl.uniformMatrix3fv(u('uM'), false, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return [v.name, cv.toDataURL('image/png')];
    });
  }, { AC, S, W, C, V: list });
  for (const [n, d] of shots) fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from(d.split(',')[1], 'base64'));
  console.log(JSON.stringify({ wrote: shots.length, errs }));
  await br.close();
})();
