// Study after Jemný řez (Soft Cut), 2025: slivers of broken sheet glass standing on a plinth in
// front of a sheet of light-sensitive paper. The cursor is the lamp. Every frame the glass is
// projected from the lamp onto the paper: faces tint and dim the light, each cut edge throws a
// dark line with a bright line beside it (the edge works as a thin prism). The paper keeps a
// slowly fading exposure of where light fell, so a photogram of the glass builds up as you move.
import { context, program, FS_VS, fullscreen, target, loop, reducedMotion } from './gl.js';

const GEO_VS = `#version 300 es
layout(location = 0) in vec3 aP;   // world x, y, and u across an edge (-1..1)
uniform vec2 uHalf;         // world half extents of the view
out float vU; out vec2 vW;
void main() { vU = aP.z; vW = aP.xy; gl_Position = vec4(aP.xy / uHalf, 0., 1.); }`;

const GEO_FS = `#version 300 es
precision highp float;
in float vU; in vec2 vW; out vec4 o;
uniform int uMode;          // 0 flat colour, 1 edge shadow (multiply), 2 edge light (add), 3 glass seen (alpha)
uniform vec4 uCol;
uniform vec3 uLamp;         // lamp x, y, distance from the paper
uniform float uPower;
float lampAt(vec2 p) { float D = uLamp.z; vec2 q = p - uLamp.xy; return uPower * D * D * D / pow(D * D + dot(q, q), 1.5); }
void main() {
  if (uMode == 0) { o = uCol; return; }
  if (uMode == 1) { float k = 1. - .5 * exp(-pow(vU / .3, 2.)); o = vec4(vec3(k), 1.); return; }
  if (uMode == 2) { float k = exp(-pow((vU - .58) / .2, 2.)); o = vec4(uCol.rgb * k * lampAt(vW), 1.); return; }
  // the glass itself, between viewer and paper: faint, edges catching the lamp
  float g = exp(-pow(vU / .5, 2.));
  float near = lampAt(vW) / uPower;
  o = vec4(uCol.rgb, uCol.a * g * (.1 + 2.4 * near * near * near));
}`;

const LIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform vec2 uHalf; uniform vec3 uLamp; uniform float uPower;
void main() {
  vec2 p = (vUv * 2. - 1.) * uHalf;
  float D = uLamp.z; vec2 q = p - uLamp.xy;
  float I = uPower * D * D * D / pow(D * D + dot(q, q), 1.5);
  o = vec4(vec3(1., .95, .88) * I, 1.);
}`;

const EXPO_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uPrev, uLight; uniform float uDecay, uGain;
void main() {
  float e = texture(uPrev, vUv).r * uDecay + dot(texture(uLight, vUv).rgb, vec3(.3, .55, .15)) * uGain;
  o = vec4(e, 0., 0., 1.);
}`;

const SHOW_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uLight, uExpo;
uniform vec2 uHalf; uniform vec4 uPaper;     // paper rect: x0 y0 x1 y1 (world)
uniform float uTime;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 tonemap(vec3 x) { return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
void main() {
  vec2 p = (vUv * 2. - 1.) * uHalf;
  vec3 L = texture(uLight, vUv).rgb;
  float E = texture(uExpo, vUv).r;
  float onPaper = step(uPaper.x, p.x) * step(p.x, uPaper.z) * step(uPaper.y, p.y) * step(p.y, uPaper.w);
  // photographic paper: light darkens it; the glass's shadows stay pale
  float refl = mix(.88, .34, 1. - exp(-E * .7));
  float grain = (hash(floor(gl_FragCoord.xy)) - .5) * .025;
  vec3 paper = vec3(.96, .94, .9) * (refl + grain * onPaper);
  vec3 wall = vec3(.42, .42, .43);
  vec3 c = mix(wall, paper, onPaper) * (vec3(.045) + L);
  c = tonemap(c);
  c += (hash(gl_FragCoord.xy + uTime) - .5) / 255.;
  o = vec4(c, 1.);
}`;

// ------------------------------------------------------------------ the glass
// Panes of sheet glass standing on the plinth, each turned about its vertical axis, most of
// them nearly edge-on to the paper, like the slivers of the Soft Cut column. A pane is a strip
// parametrised by s in 0..1 across its width; top and bottom are polylines over s.
function makeShards(seed = 11) {
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const pieces = [];
  const floorY = -.86;
  const count = 30;
  for (let k = 0; k < count; k++) {
    const wide = rnd() < .2;
    const w = wide ? .1 + rnd() * .1 : .03 + rnd() * .07;          // real width of the pane
    const ang = (55 + rnd() * 34) * Math.PI / 180 * (rnd() < .5 ? -1 : 1);
    const cx = (rnd() - .5) * .38 * (1 - .4 * rnd());
    const dc = .26 + rnd() * .3;                                    // distance of its centre from the paper
    const tall = rnd();
    const top = floorY + .3 + tall * tall * 1.45;
    const n = 2 + Math.floor(rnd() * 3);
    const ss = [0];
    for (let i = 1; i < n; i++) ss.push((i + (rnd() - .5) * .6) / n);
    ss.push(1);
    const slope = (rnd() - .5) * .4;
    const topYs = ss.map((t, i) => top + t * w * slope * 4 + (i > 0 && i < ss.length - 1 ? (rnd() - .5) * .05 : 0));
    const botYs = ss.map(() => floorY);
    const pane = { cx, dc, c: Math.cos(ang), sn: Math.sin(ang), w, ss };
    if (rnd() < .3 && top - floorY > .5) {
      const cy = floorY + (top - floorY) * (.3 + rnd() * .4);
      const cs = (rnd() - .5) * 3;
      const crack = ss.map((t, i) => cy + t * w * cs + (i > 0 && i < ss.length - 1 ? (rnd() - .5) * .03 : 0));
      pieces.push({ ...pane, bot: botYs, top: crack });
      pieces.push({ ...pane, bot: crack.map(y => y + .006), top: topYs });
    } else pieces.push({ ...pane, bot: botYs, top: topYs });
  }
  pieces.sort((a, b) => a.dc - b.dc);
  return pieces;
}
// a point of a pane: across-width parameter t, height y -> world x, y, distance from paper
const at = (pc, t, y) => [pc.cx + (t - .5) * pc.w * pc.c, y, pc.dc + (t - .5) * pc.w * pc.sn];

export function mount(canvas) {
  const gl = context(canvas);
  if (!gl) return null;
  const geo = program(gl, GEO_VS, GEO_FS);
  const light = program(gl, FS_VS, LIGHT_FS);
  const expo = program(gl, FS_VS, EXPO_FS);
  const show = program(gl, FS_VS, SHOW_FS);
  const pieces = makeShards();
  const vbo = gl.createBuffer();
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
  const still = reducedMotion();

  let half = [.75, 1], W = 2, H = 2;
  let L = null, E0 = null, E1 = null;
  const lamp = { x: .25, y: .35, z: 1.1, tx: .25, ty: .35 };
  let lastPointer = -1e9, full = false, frames = 0, lastMs = 0, clock = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = Math.max(2, Math.round(canvas.clientWidth * dpr)); H = Math.max(2, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    half = [W / H, 1];
    for (const t of [L, E0, E1]) t?.dispose();
    L = target(gl, W, H); E0 = target(gl, W, H); E1 = target(gl, W, H);
    if (!loopApi.running) frame(1 / 60);
  }

  // projection of a point on a pane at distance d from the paper, from the lamp
  const proj = (x, y, d) => { const t = lamp.z / (lamp.z - d); return [lamp.x + (x - lamp.x) * t, lamp.y + (y - lamp.y) * t]; };

  const verts = new Float32Array(60000);
  let nv = 0;
  const tri = (a, b, c, u = 0) => { verts.set([a[0], a[1], u, b[0], b[1], u, c[0], c[1], u], nv * 3); nv += 3; };
  // an edge as a quad across which u runs -1..1; +u points away from the lamp
  function edge(a, b, w) {
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const mx = (a[0] + b[0]) / 2 - lamp.x, my = (a[1] + b[1]) / 2 - lamp.y;
    if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
    const h = w / 2;
    const a0 = [a[0] - nx * h, a[1] - ny * h], a1 = [a[0] + nx * h, a[1] + ny * h];
    const b0 = [b[0] - nx * h, b[1] - ny * h], b1 = [b[0] + nx * h, b[1] + ny * h];
    verts.set([a0[0], a0[1], -1, b0[0], b0[1], -1, b1[0], b1[1], 1, a0[0], a0[1], -1, b1[0], b1[1], 1, a1[0], a1[1], 1], nv * 3); nv += 6;
  }
  const outline = pc => {
    const pts = [];
    for (let i = 0; i < pc.ss.length; i++) pts.push(at(pc, pc.ss[i], pc.bot[i]));
    for (let i = pc.ss.length - 1; i >= 0; i--) pts.push(at(pc, pc.ss[i], pc.top[i]));
    return pts;
  };
  const P = q => proj(q[0], q[1], q[2]);
  // light passing a pane: two surfaces of Fresnel loss, more at grazing angles
  const transmit = pc => {
    const lx = lamp.x - pc.cx, lz = lamp.z - pc.dc, l = Math.hypot(lx, lz);
    const cos = Math.abs((-pc.sn * lx + pc.c * lz) / l);
    const F = .04 + .96 * Math.pow(1 - cos, 5);
    return (1 - F) * (1 - F);
  };
  // a pane flashes when its face mirrors the lamp toward the viewer
  const glint = pc => {
    const lx = lamp.x - pc.cx, lz = lamp.z - pc.dc, l = Math.hypot(lx, lz);
    const hx = lx / l, hz = lz / l + 1, h = Math.hypot(hx, hz);
    return Math.pow(Math.abs((-pc.sn * hx + pc.c * hz) / h), 60);
  };

  function draw(mode, col, blend) {
    gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, nv * 3), gl.STREAM_DRAW);
    gl.uniform1i(geo.u.uMode, mode);
    gl.uniform4fv(geo.u.uCol, col);
    if (blend === 'mul') gl.blendFunc(gl.DST_COLOR, gl.ZERO);
    else if (blend === 'add') gl.blendFunc(gl.ONE, gl.ONE);
    else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, nv);
    nv = 0;
  }

  const PLINTH = [[-.34, -1.2], [.34, -1.2], [.34, -.86], [-.34, -.86]];
  const POWER = 1.0;

  function frame(dt) {
    const t0 = performance.now();
    clock += dt;
    // the lamp drifts like the sun when nobody holds it
    if (performance.now() - lastPointer > 2500 && !still) {
      lamp.tx = half[0] * .62 * Math.sin(clock * .11);
      lamp.ty = .25 + .45 * Math.sin(clock * .077 + 1.2);
    }
    const k = 1 - Math.exp(-dt / .12);
    lamp.x += (lamp.tx - lamp.x) * k; lamp.y += (lamp.ty - lamp.y) * k;

    // 1. light on the paper
    gl.bindFramebuffer(gl.FRAMEBUFFER, L.fb);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    gl.useProgram(light.p);
    gl.uniform2f(light.u.uHalf, half[0], half[1]);
    gl.uniform3f(light.u.uLamp, lamp.x, lamp.y, lamp.z);
    gl.uniform1f(light.u.uPower, POWER);
    fullscreen(gl);

    gl.enable(gl.BLEND);
    gl.useProgram(geo.p);
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.uniform2f(geo.u.uHalf, half[0], half[1]);
    gl.uniform3f(geo.u.uLamp, lamp.x, lamp.y, lamp.z);
    gl.uniform1f(geo.u.uPower, POWER);
    // faces: each pane passes most light, tinted the green of float glass
    for (const pc of pieces) {
      for (let i = 0; i < pc.ss.length - 1; i++) {
        const a = P(at(pc, pc.ss[i], pc.bot[i])), b = P(at(pc, pc.ss[i + 1], pc.bot[i + 1]));
        const c = P(at(pc, pc.ss[i + 1], pc.top[i + 1])), d = P(at(pc, pc.ss[i], pc.top[i]));
        tri(a, b, c); tri(a, c, d);
      }
      const T = transmit(pc);
      draw(0, [.86 * T, .95 * T, .9 * T, 1], 'mul');
    }
    // the plinth is opaque
    { const q = PLINTH.map(([x, y]) => proj(x, y, .45)); tri(q[0], q[1], q[2]); tri(q[0], q[2], q[3]); }
    draw(0, [.03, .03, .03, 1], 'mul');
    // edges: a dark line where the edge is, light thrown just beside it
    const ew = .011;
    const edges = () => { for (const pc of pieces) { const o = outline(pc); for (let i = 0; i < o.length; i++) { const p0 = o[i], p1 = o[(i + 1) % o.length]; edge(P(p0), P(p1), ew * lamp.z / (lamp.z - p0[2])); } } };
    edges(); draw(1, [0, 0, 0, 1], 'mul');
    edges(); draw(2, [1.9, 1.85, 1.7, 1], 'add');

    // 2. the paper remembers: exposure fades over about half a minute
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, E1.fb);
    gl.useProgram(expo.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, E0.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, L.tex);
    gl.uniform1i(expo.u.uPrev, 0); gl.uniform1i(expo.u.uLight, 1);
    gl.uniform1f(expo.u.uDecay, Math.exp(-dt / 40));
    gl.uniform1f(expo.u.uGain, still ? 0 : dt * .1);
    fullscreen(gl);
    [E0, E1] = [E1, E0];

    // 3. what you see: paper and wall under the lamp, then the glass and plinth in front
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(show.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, L.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, E0.tex);
    gl.uniform1i(show.u.uLight, 0); gl.uniform1i(show.u.uExpo, 1);
    gl.uniform2f(show.u.uHalf, half[0], half[1]);
    gl.uniform4f(show.u.uPaper, -half[0] * .8, -.8, half[0] * .8, .9);
    gl.uniform1f(show.u.uTime, clock % 100);
    fullscreen(gl);

    gl.enable(gl.BLEND);
    gl.useProgram(geo.p);
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    for (const pc of pieces) {
      for (let i = 0; i < pc.ss.length - 1; i++) {
        const a = at(pc, pc.ss[i], pc.bot[i]), b = at(pc, pc.ss[i + 1], pc.bot[i + 1]), c = at(pc, pc.ss[i + 1], pc.top[i + 1]), d = at(pc, pc.ss[i], pc.top[i]);
        tri(a, b, c); tri(a, c, d);
      }
      draw(0, [.62, .8, .72, .05 + .55 * glint(pc)], 'alpha');
    }
    for (const pc of pieces) { const o = outline(pc); for (let i = 0; i < o.length; i++) edge(o[i], o[(i + 1) % o.length], .005); }
    draw(3, [.82, 1., .92, .6], 'alpha');
    tri(PLINTH[0], PLINTH[1], PLINTH[2]); tri(PLINTH[0], PLINTH[2], PLINTH[3]);
    draw(0, [.045, .045, .05, 1], 'alpha');
    edge([-.34, -.86], [.34, -.86], .004);
    draw(3, [.9, .9, .9, .5], 'alpha');
    gl.disable(gl.BLEND);
    frames++; lastMs = performance.now() - t0;
  }

  const loopApi = loop(dt => { if (!still || frames < 3) frame(dt); });

  const onMove = e => {
    if (e.pointerType === 'touch' && !full) return;     // in the strip a touch scrolls; the lamp follows touch in the large view
    const b = canvas.getBoundingClientRect();
    lamp.tx = ((e.clientX - b.left) / b.width * 2 - 1) * half[0];
    lamp.ty = (1 - (e.clientY - b.top) / b.height * 2) * half[1];
    lastPointer = performance.now();
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onMove);

  resize();
  return {
    name: 'shards',
    start: () => loopApi.start(),
    stop: () => loopApi.stop(),
    resize,
    setFull(v) { full = v; canvas.style.touchAction = v ? 'none' : ''; },
    lampTo(x, y) { lamp.tx = x * half[0]; lamp.ty = y; lastPointer = performance.now(); },
    run(seconds) { const n = Math.round(seconds * 60); for (let i = 0; i < n; i++) frame(1 / 60); },
    snap() { frame(1 / 60); return canvas.toDataURL('image/jpeg', .9); },
    stats: () => ({ frames, lastMs, pieces: pieces.length, px: [W, H] }),
    destroy() { loopApi.stop(); for (const t of [L, E0, E1]) t?.dispose(); gl.getExtension('WEBGL_lose_context')?.loseContext(); },
  };
}
