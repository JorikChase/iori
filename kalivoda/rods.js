// Lukáš Kalivoda — a cloud of thin glass rods on threads.
//
// Rendering: three.js. The background (portrait, steel frame, threads) is drawn to
// a render target; the rods are two instanced groups (back rows, front rows) with a
// spectral refraction shader that reads the layer behind them — so front rods
// refract back rods, and every rod refracts the portrait. The spectrum is sampled
// continuously from red to magenta (hue 0 → 0.86), per-pixel jittered so the
// fringes blend instead of banding.
//
// Physics: each rod is a rigid pendulum (thread + rod) with two swing angles and
// a slow twist about its own axis. Wind = ambient fans from the side with
// turbulence + puffs emitted from the pointer + page scroll. Rods collide as
// capsules against their grid neighbours (impulse + positional correction) and
// each contact rings a synthesised glass clink.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ------------------------------------------------------------------ parameters
const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? parseFloat(Q.get(k)) : d);

const P = {
  cols: Math.round(num('cols', 32)),
  rows: Math.round(num('rows', 6)),
  dx: 0.054,  dz: 0.075,                  // grid spacing (m)
  rodW: 0.022, rodD: 0.006, bevel: 0.0015,
  lenMin: 0.72, lenMax: 1.18,            // rod length (m)
  thrMin: 0.10, thrMax: 0.30,            // thread length (m)
  frameY: 1.08,                          // pivot height (m)
  fov: 40,
  // look
  ior: num('ior', 1.50),
  spread: num('spread', 0.25),           // ior(blue) − ior(red), exaggerated for the showcase
  thick: num('thick', 16),               // slab thickness exaggeration
  prism: num('prism', 0.05),            // normal-based deflection (screen fraction per unit ior−1)
  bulge: num('bulge', 0.8),
  specDisp: num('specdisp', 3.0),       // how far the highlight's colours separate
  sun: num('sun', 22.0),                  // brightness of the low sun behind the cloud              // how much each face is bent into a lens across its width
  edge: num('edge', 0.6),
  hueEnd: 0.86,                          // where the spectrum ends: 0.86 = magenta
  portraitDim: 0.6,
  // air
  amb: num('amb', 0.16),                 // ambient fan speed (m/s)
  kw: num('kw', 2.0),                    // wind → angular acceleration coupling
  kd: num('kd', 0.7),                    // air damping
  puffGain: num('puff', 0.6),
  pushIn: num('pushin', 0.45),
  leverCap: num('lever', 1.0),           // a gust low on the rods pushes harder; this caps it
  tipMin: num('tipmin', 0.004), tipSpread: num('tipspread', 0.05),   // how far past the edge the tips hang           // share of a gust that blows into the screen (tips lift into view)
  gustCap: num('cap', 1.4),
  scrollGain: num('scroll', 0.55),       // scroll → wind along the rods on a phone, and into the screen
  touchBudget: num('touches', 2),        // pairs allowed to touch in a few seconds before new gusts soften
  // contact
  restitution: 0.32,
  sound: true,
};

const LAB = Q.has('lab');

// ------------------------------------------------------------------ renderer
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
THREE.ColorManagement.enabled = false;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // everything below is display-referred
renderer.autoClear = false;
const DPR = Math.min(window.devicePixelRatio || 1, 1.5);   // 2× retina cost 22 ms a frame on an M3 Pro

const camera = new THREE.PerspectiveCamera(P.fov, 1, 0.05, 20);
const sceneBg = new THREE.Scene();
const sceneBack = new THREE.Scene();
const sceneFront = new THREE.Scene();

// fullscreen copy (layer → next layer)
const copyScene = new THREE.Scene();
const copyCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const TONEMAP = `
  vec3 tonemap(vec3 x) {  // Narkowicz ACES fit
    x *= 0.9;
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }`;
const copyMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: null }, uTone: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `uniform sampler2D map; uniform float uTone; varying vec2 vUv; ${TONEMAP}
    void main(){ vec3 c = texture2D(map, vUv).rgb; gl_FragColor = vec4(uTone > 0.5 ? tonemap(c) : c, 1.0); }`,
  depthTest: false, depthWrite: false,
});
copyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMat));

let rtBg, rtMid;
function makeTargets(w, h) {
  rtBg?.dispose(); rtMid?.dispose();
  const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, stencilBuffer: false, samples: 0, type: THREE.HalfFloatType };
  rtBg = new THREE.WebGLRenderTarget(w, h, opts);
  rtMid = new THREE.WebGLRenderTarget(w, h, { ...opts, samples: 4 });   // the back rods get MSAA too, like the front ones on the canvas
}

// ------------------------------------------------------------------ the rods (state)
const N = P.cols * P.rows;
const rods = [];
const cloudW = (P.cols - 1) * P.dx;
const cloudD = (P.rows - 1) * P.dz;
{
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
    const L = P.lenMin + (P.lenMax - P.lenMin) * rnd();
    const thr = P.thrMin + (P.thrMax - P.thrMin) * rnd();
    const d = thr + L / 2;                                 // pivot → centre of mass
    const Ieff = L * (L * L / 12 + d * d);                 // ∝ moment of inertia about the pivot
    rods.push({
      c, r,
      px: (c - (P.cols - 1) / 2) * P.dx + (rnd() - 0.5) * 0.006,
      pz: (r - (P.rows - 1) / 2) * P.dz + (rnd() - 0.5) * 0.01,
      L, thr, d, Ieff, extra: rnd(),
      k: 9.81 * d / (L * L / 12 + d * d),                  // ω0²
      tx: 0, tz: 0, vx: 0, vz: 0,                          // swing (rad) and rate
      yaw: (rnd() - 0.5) * 0.6, yawV: 0, yaw0: (rnd() - 0.5) * 0.6,
      ux: 0, uy: -1, uz: 0,                                // rod axis (unit)
      pitch: 0.8 + 0.5 * rnd(),
      lastClink: 0,
    });
  }
}
// neighbours for contact tests: within 3 columns and 2 rows
const pairs = [];
for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
  const a = rods[i], b = rods[j];
  if (Math.abs(a.c - b.c) <= 3 && Math.abs(a.r - b.r) <= 2) pairs.push([i, j]);
}
const cloudTop = P.frameY, cloudBottom = P.frameY - P.thrMax - P.lenMax;
const cloudH = cloudTop - cloudBottom;
const cloudMidY = (cloudTop + cloudBottom) / 2;

// ------------------------------------------------------------------ background scene
const texLoader = new THREE.TextureLoader();
const portraitTex = { land: null, port: null };
const loadTex = (url, key) => texLoader.load(url, t => { t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; portraitTex[key] = t; layout(); });
const TEX_URL = { land: 'img/lukas-kalivoda-studio.jpg', port: 'img/lukas-kalivoda-studio-portrait.jpg' };
const texWanted = {};
function ensureTex(key) { if (!texWanted[key]) { texWanted[key] = true; loadTex(TEX_URL[key], key); } }

const portraitMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: null }, uDim: { value: P.portraitDim }, uRep: { value: new THREE.Vector2(1, 1) }, uOff: { value: new THREE.Vector2(0, 0) }, uHas: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D map; uniform float uDim, uHas; uniform vec2 uRep, uOff; varying vec2 vUv;
    void main(){
      vec2 uv = vUv * uRep + uOff;
      vec3 c = uHas > 0.5 ? texture2D(map, uv).rgb : vec3(0.08);
      // soft vignette so the photograph sinks into the dark room
      vec2 q = vUv - 0.5;
      float v = 1.0 - smoothstep(0.25, 0.72, length(q * vec2(1.0, 1.25)));
      c *= uDim * (0.18 + 0.82 * v);
      gl_FragColor = vec4(c, 1.0);
    }`,
  depthWrite: false,
});
const portrait = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), portraitMat);
portrait.position.z = -0.62;
sceneBg.add(portrait);

// room: a faint warm glow high up, black below
const roomMat = new THREE.ShaderMaterial({
  uniforms: {},
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
  fragmentShader: `varying vec2 vUv; void main(){
    float g = smoothstep(0.1, 1.0, vUv.y);
    vec3 c = mix(vec3(0.012,0.012,0.016), vec3(0.075,0.062,0.05), g);
    gl_FragColor = vec4(c, 1.0); }`,
  depthWrite: false, depthTest: false,
});
const room = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), roomMat); room.renderOrder = -10; room.frustumCulled = false;
sceneBg.add(room);

// steel frame: one bar per row plus two end bars, dark and slightly glossy
const steel = new THREE.MeshStandardMaterial({ color: 0x3a3c40, metalness: 0.85, roughness: 0.38 });
const barT = 0.014;
const frame = new THREE.Group();
for (let r = 0; r < P.rows; r++) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(cloudW + 0.16, barT, barT), steel);
  bar.position.set(0, P.frameY + barT / 2, (r - (P.rows - 1) / 2) * P.dz);
  frame.add(bar);
}
for (const sx of [-1, 1]) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(barT, barT, cloudD + 0.16), steel);
  bar.position.set(sx * (cloudW / 2 + 0.08), P.frameY + barT * 1.5, 0);
  frame.add(bar);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 3, 6), steel);
  rope.position.set(sx * (cloudW / 2 + 0.08), P.frameY + 1.5, 0);
  frame.add(rope);
}
// the steel rack exists for reference but is not drawn: only the glass is in view

// light sources the glass can refract: a low warm sun through the vault door, two lamps above
const lampMat = (color, power) => new THREE.ShaderMaterial({
  uniforms: { uC: { value: color }, uP: { value: power } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv - 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 uC; uniform float uP; varying vec2 vUv; void main(){
    float r = length(vUv) * 2.0;
    float core = smoothstep(0.40, 0.22, r);
    float halo = exp(-r * r * 4.0) * 0.12;
    gl_FragColor = vec4(uC * uP * (core + halo), 1.0); }`,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
});
const lamps = [];
function addLamp(nx, ny, z, size, color, power) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), lampMat(color, power));
  m.userData.ndc = [nx, ny, z]; m.renderOrder = 5; sceneBg.add(m); lamps.push(m); return m;
}
// (screen x, screen y) in −1…1, world depth
const sun = addLamp(0.6, 0.0, -0.55, 0.10, new THREE.Color(1.0, 0.70, 0.40), P.sun);
addLamp(-0.62, 0.62, -0.3, 0.07, new THREE.Color(1.0, 0.88, 0.7), 9.0);
addLamp(-0.3, -0.5, -0.5, 0.05, new THREE.Color(1.0, 0.95, 0.85), 7.0);
addLamp(0.18, 0.78, -0.35, 0.06, new THREE.Color(0.85, 0.92, 1.0), 6.0);
const _ray = new THREE.Raycaster(), _pl = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), _v2 = new THREE.Vector2();
function placeLamps() {
  for (const m of lamps) {
    const [nx, ny, z] = m.userData.ndc;
    _pl.constant = -z; _v2.set(nx, ny);
    _ray.setFromCamera(_v2, camera);
    _ray.ray.intersectPlane(_pl, m.position);
    m.quaternion.copy(camera.quaternion);
  }
}
sceneBg.add(new THREE.AmbientLight(0xffffff, 0.25));
const key = new THREE.DirectionalLight(0xffe2b8, 2.2); key.position.set(-1, 2, 1.5); sceneBg.add(key);
const fill = new THREE.DirectionalLight(0xb8d0ff, 0.8); fill.position.set(1.5, 0.5, 1); sceneBg.add(fill);

// threads
const threadPos = new Float32Array(N * 6);
const threadGeo = new THREE.BufferGeometry();
threadGeo.setAttribute('position', new THREE.BufferAttribute(threadPos, 3));
const threads = new THREE.LineSegments(threadGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 }));
threads.frustumCulled = false;
sceneBg.add(threads);

// ------------------------------------------------------------------ glass shader
const NS = num('ns', 12);   // spectral samples per pixel; the 4×4 dither keeps 12 continuous
const lightsWorld = [
  { p: new THREE.Vector3(-1.3, 2.0, 1.3), c: new THREE.Color(1.0, 0.86, 0.66).multiplyScalar(1.2), sh: 700 },  // warm key
  { p: new THREE.Vector3(1.6, 0.9, 1.0),  c: new THREE.Color(0.72, 0.82, 1.0).multiplyScalar(0.7), sh: 350 },  // cool fill
  { p: new THREE.Vector3(0.3, 2.4, -1.2), c: new THREE.Color(1.0, 0.97, 0.92).multiplyScalar(0.9), sh: 1200 }, // rim from behind
];

// per-channel mean of the spectrum over t∈[0,1] so an undeflected sample returns the background unchanged
function spectrumRGB(t) {
  const h = t * P.hueEnd * 6;
  const f = o => Math.min(1, Math.max(0, Math.abs(((h + o) % 6 + 6) % 6 - 3) - 1));
  return [f(0), f(4), f(2)];
}
const norm = [0, 0, 0];
for (let i = 0; i < 512; i++) { const c = spectrumRGB((i + 0.5) / 512); norm[0] += c[0] / 512; norm[1] += c[1] / 512; norm[2] += c[2] / 512; }

function glassMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      tBg: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uFocal: { value: 1 },
      uDims: { value: new THREE.Vector3(P.rodW, 0.002, P.rodD) },
      uThick: { value: P.thick },
      uPrism: { value: P.prism },
      uIor: { value: P.ior },
      uSpread: { value: P.spread },
      uHueEnd: { value: P.hueEnd },
      uNorm: { value: new THREE.Vector3(norm[0], norm[1], norm[2]) },
      uEdge: { value: P.edge },
      uBulge: { value: P.bulge },
      uSpecDisp: { value: P.specDisp },
      uTone: { value: 0 },
      uLp: { value: lightsWorld.map(() => new THREE.Vector3()) },
      uLc: { value: lightsWorld.map(l => l.c) },
      uLs: { value: lightsWorld.map(l => l.sh) },
    },
    vertexShader: `
      varying vec3 vN; varying vec3 vP; varying vec3 vLN; varying vec3 vLP; varying vec3 vTx; varying vec3 vTz;
      void main(){
        vLN = normal; vLP = position;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vP = mv.xyz;
        mat3 im = mat3(instanceMatrix);
        vN = normalize(normalMatrix * (im * normal));
        vTx = normalize(normalMatrix * (im * vec3(1.0, 0.0, 0.0)));
        vTz = normalize(normalMatrix * (im * vec3(0.0, 0.0, 1.0)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      precision highp float;
      #define NS ${NS}
      uniform sampler2D tBg; uniform vec2 uRes; uniform float uFocal;
      uniform vec3 uDims; uniform float uThick, uPrism, uIor, uSpread, uHueEnd, uEdge, uBulge, uSpecDisp, uTone;
      uniform vec3 uNorm; uniform vec3 uLp[3]; uniform vec3 uLc[3]; uniform float uLs[3];
      varying vec3 vN; varying vec3 vP; varying vec3 vLN; varying vec3 vLP; varying vec3 vTx; varying vec3 vTz;
      ${TONEMAP}
      float bayer2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
      float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
      vec3 spectrum(float t){
        float h = t * uHueEnd * 6.0;
        return clamp(abs(mod(h + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
      }
      void main(){
        vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
        // each face is bent into a shallow lens across its width: a flat slab only displaces,
        // a lens deviates — and deviation is what makes the spectrum open up
        float ax = clamp(vLP.x / (uDims.x * 0.5), -1.0, 1.0);
        float az = clamp(vLP.z / (uDims.z * 0.5), -1.0, 1.0);
        vec3 Nb = N;
        if (abs(vLN.z) > 0.5) Nb += vTx * ax * uBulge;
        else if (abs(vLN.x) > 0.5) Nb += vTz * az * uBulge * 0.6;
        Nb = normalize(Nb);
        vec3 V = normalize(-vP);
        vec3 I = -V;
        float cosI = clamp(dot(Nb, V), 0.0, 1.0);
        vec2 uv = gl_FragCoord.xy / uRes;
        float t = dot(abs(vLN), uDims) * uThick;              // slab thickness along this face
        float pxPerM = uFocal / max(-vP.z, 0.05);
        float straight = 1.0 / max(abs(dot(I, Nb)), 0.05);
        // a 4x4 ordered dither shifts each pixel's spectral sampling, so NS samples read as a continuum
        // without the beading that random jitter leaves on the bevels
        float jit = bayer4(gl_FragCoord.xy) + 1.0 / 32.0;
        vec3 col = vec3(0.0);
        vec3 spec = vec3(0.0);
        vec3 Hs[3];
        for (int l = 0; l < 3; l++) Hs[l] = normalize(normalize(uLp[l] - vP) + V);
        for (int i = 0; i < NS; i++) {
          float s = (float(i) + jit) / float(NS);             // 0 red … 1 magenta
          float ior = uIor + uSpread * (s - 0.5);
          vec3 w = spectrum(s);
          vec3 R = refract(I, Nb, 1.0 / ior);
          float along = 1.0 / max(abs(dot(R, Nb)), 0.05);
          vec3 dsp = (R * along - I * straight) * t;          // slab displacement through the bent face (m, view space)
          vec2 off = dsp.xy * pxPerM / uRes + Nb.xy * (ior - 1.0) * uPrism;
          col += texture2D(tBg, clamp(uv + off, 0.001, 0.999)).rgb * w;
          // the highlight, seen through a wavelength-dependent surface: its edge splits into colour
          // (every other sample is enough for a highlight)
          if ((i & 1) == 0) {
            vec3 Ns = normalize(Nb + vTx * (ior - uIor) * uSpecDisp);
            for (int l = 0; l < 3; l++) {
              float nh = max(dot(Ns, Hs[l]), 0.0);
              spec += w * uLc[l] * (pow(nh, uLs[l]) + 0.05 * pow(nh, 24.0));
            }
          }
        }
        vec3 wn = float(NS) * uNorm;
        col /= wn; spec /= wn * 0.5;
        col *= vec3(0.93, 0.985, 0.955);                       // the green of float glass
        float F = 0.04 + 0.96 * pow(1.0 - cosI, 5.0);
        vec3 Rv = reflect(I, Nb);
        vec3 env = mix(vec3(0.03, 0.03, 0.035), vec3(0.17, 0.15, 0.12), smoothstep(-0.4, 1.0, Rv.y));
        float edge = pow(1.0 - cosI, 3.0);
        col = col * (1.0 - F) + env * F + spec * (0.35 + 4.0 * F) + edge * vec3(0.30, 0.26, 0.22) * uEdge;
        gl_FragColor = vec4(uTone > 0.5 ? tonemap(col) : col, 1.0);
      }`,
    side: THREE.FrontSide,
  });
}

const rodGeo = new RoundedBoxGeometry(P.rodW, 1, P.rodD, 2, P.bevel);
const matBack = glassMaterial(), matFront = glassMaterial();
matFront.uniforms.uTone.value = 1;
const backIdx = [], frontIdx = [];
rods.forEach((rod, i) => (rod.r < P.rows / 2 ? backIdx : frontIdx).push(i));
// nearest rows first: the depth test then throws away hidden glass before the spectral shader runs
const nearFirst = (a, b) => rods[b].pz - rods[a].pz;
backIdx.sort(nearFirst); frontIdx.sort(nearFirst);
const meshBack = new THREE.InstancedMesh(rodGeo, matBack, backIdx.length);
const meshFront = new THREE.InstancedMesh(rodGeo, matFront, frontIdx.length);
meshBack.frustumCulled = meshFront.frustumCulled = false;
sceneBack.add(meshBack); sceneFront.add(meshFront);

// ------------------------------------------------------------------ layout (camera, portrait, rolled on phones)
let rolled = false, camDist = 2;
const vp = { w: 1, h: 1 };
function layout() {
  // the canvas is sized to the large viewport (100lvh), so a phone's browser bar showing and
  // hiding while you scroll does not change it and nothing re-fits
  vp.w = canvas.clientWidth || window.innerWidth; vp.h = canvas.clientHeight || window.innerHeight;
  rolled = vp.h > vp.w;
  renderer.setPixelRatio(DPR);
  renderer.setSize(vp.w, vp.h, false);
  camera.aspect = vp.w / vp.h; camera.updateProjectionMatrix();
  const th = Math.tan(THREE.MathUtils.degToRad(P.fov / 2));
  const asp = camera.aspect;
  // fit only the glass: the cloud's width spans the screen edge to edge (width on a desktop,
  // height on a phone), measured at the back row so the nearer rows overhang. The glass tops sit
  // just past the screen edge, so neither the rack nor the threads are ever in view.
  const zBack = cloudD / 2 + P.rodD;
  const span = cloudW * 0.965;                                        // a little overhang for swinging edge rods
  const across = rolled ? th : th * asp;                              // half-extent per metre of depth, along the cloud
  const down = rolled ? th * asp : th;                                // half-extent per metre of depth, along the rods
  camDist = span / (2 * across) - zBack;
  const glassTop = P.frameY - P.thrMax - 0.012;                       // lowest rod top
  const targetY = glassTop - (camDist + zBack) * down;
  // lengths follow the frame: the rods fill the screen and every tip sits a little past the
  // bottom edge (right edge on a phone), at rest out of sight; a rattle swings them into view
  for (const rod of rods) {
    const depth = camDist - rod.pz;
    const edgeY = targetY - depth * down;                               // screen edge at this rod's depth
    const margin = 2 * depth * down * (P.tipMin + P.tipSpread * rod.extra); // a few % of the visible run
    rod.L = Math.max(0.3, P.frameY - rod.thr - edgeY + margin);
    rod.d = rod.thr + rod.L / 2;
    rod.Ieff = rod.L * (rod.L * rod.L / 12 + rod.d * rod.d);
    rod.k = 9.81 * rod.d / (rod.L * rod.L / 12 + rod.d * rod.d);
  }
  camera.position.set(0, targetY, camDist);
  camera.up.set(rolled ? 1 : 0, rolled ? 0 : 1, 0);
  camera.lookAt(0, targetY, 0);
  camera.updateMatrixWorld();
  placeLamps();

  // portrait: cover the frustum at its depth, upright on screen in both orientations
  const depth = camDist - portrait.position.z;
  const H = 2 * depth * th, W = H * asp;
  portrait.scale.set(W, H, 1);
  portrait.position.y = targetY;
  portrait.rotation.z = rolled ? -Math.PI / 2 : 0;
  ensureTex(rolled ? 'port' : 'land');
  const tex = rolled ? (portraitTex.port || portraitTex.land) : (portraitTex.land || portraitTex.port);
  portraitMat.uniforms.map.value = tex;
  portraitMat.uniforms.uHas.value = tex ? 1 : 0;
  if (tex) {
    const ia = tex.image.width / tex.image.height, pa = W / H;
    const rep = portraitMat.uniforms.uRep.value, off = portraitMat.uniforms.uOff.value;
    if (ia > pa) { rep.set(pa / ia, 1); off.set((1 - pa / ia) * 0.5, 0); }   // image wider: crop sides
    else { rep.set(1, ia / pa); off.set(0, (1 - ia / pa) * 0.62); }          // image taller: keep the upper part (his face)
  }

  const w = Math.round(vp.w * DPR), h = Math.round(vp.h * DPR);
  makeTargets(w, h);
  for (const m of [matBack, matFront]) {
    m.uniforms.uRes.value.set(w, h);
    m.uniforms.uFocal.value = camera.projectionMatrix.elements[5] * h / 2;
  }
  matBack.uniforms.tBg.value = rtBg.texture;
  matFront.uniforms.tBg.value = rtMid.texture;
  // lights into view space
  const vm = camera.matrixWorldInverse;
  lightsWorld.forEach((l, i) => { const v = l.p.clone().applyMatrix4(vm); matBack.uniforms.uLp.value[i].copy(v); matFront.uniforms.uLp.value[i].copy(v); });
}
let fitW = 0, fitH = 0;
window.addEventListener('resize', () => {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (w === fitW && h === fitH) return;
  fitW = w; fitH = h; layout();
});
layout();

// ------------------------------------------------------------------ wind
const puffs = [];          // {x,y,z, vx,vy,vz, t0, s0}
const MAXP = 64;
let scrollWind = 0, lastScrollY = window.scrollY, lastScrollT = performance.now();
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();
let prevHit = null, prevT = 0;

function pointerToWorld(cx, cy) {
  ndc.set((cx / vp.w) * 2 - 1, -(cy / vp.h) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(plane, hit) ? hit : null;
}
function onMove(e) {
  const p = pointerToWorld(e.clientX, e.clientY);
  const t = performance.now() / 1000;
  if (!p) { prevHit = null; return; }
  if (prevHit && t - prevT > 0.004) {
    const dt = Math.min(t - prevT, 0.1);
    let vx = (p.x - prevHit.x) / dt, vy = (p.y - prevHit.y) / dt;
    const sp = Math.hypot(vx, vy);
    const cap = P.gustCap;                    // m/s: a hand's gust, however fast the mouse
    if (sp > cap) { vx *= cap / sp; vy *= cap / sp; }
    // the hand is a fan in front of the cloud: part of every gust goes into the screen, so rods
    // swing away, their far ends rise in perspective and the hidden tips come into view
    const vz = -Math.min(sp, cap) * P.pushIn * P.puffGain;
    if (sp > 0.02) {
      if (puffs.length >= MAXP) puffs.shift();
      puffs.push({ x: p.x, y: p.y, z: 0, vx: vx * P.puffGain, vy: vy * P.puffGain, vz, t0: t, s0: 0.16 + 0.03 * Math.min(sp, 2) });
    }
  }
  if (!prevHit) prevHit = new THREE.Vector3();
  prevHit.copy(p); prevT = t;
  audioWake();
}
window.addEventListener('pointermove', onMove, { passive: true });
window.addEventListener('pointerdown', onMove, { passive: true });
window.addEventListener('pointerleave', () => { prevHit = null; });
window.addEventListener('pointercancel', () => { prevHit = null; });
window.addEventListener('scroll', () => {
  const now = performance.now();
  const dt = Math.max((now - lastScrollT) / 1000, 1 / 240);
  const v = (window.scrollY - lastScrollY) / dt;        // px/s, + when scrolling down
  lastScrollY = window.scrollY; lastScrollT = now;
  scrollWind = THREE.MathUtils.clamp(v / 900, -2.5, 2.5);
}, { passive: true });

// ambient fans from the right with coherent turbulence
function ambientWind(x, y, z, t, out) {
  const gust = 0.55 + 0.45 * Math.sin(t * 0.23) * Math.sin(t * 0.071 + 1.3) + 0.25 * Math.sin(t * 0.9 + z * 3.0);
  const n1 = Math.sin(1.9 * y + 0.8 * t + 2.3 * z) * Math.sin(1.3 * x + 0.47 * t);
  const n2 = Math.sin(3.1 * y - 1.1 * t + 0.9 * x) * 0.5;
  const s = P.amb * Math.max(0, gust) * (0.7 + 0.5 * n1 + 0.3 * n2);
  out[0] = -s; out[1] = 0; out[2] = s * 0.25 * Math.sin(0.7 * x + 0.5 * t + z * 4.0);
}

// ------------------------------------------------------------------ audio: glass clinks
let actx = null, master = null;
function audioWake() {
  if (actx || !P.sound) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain(); master.gain.value = soundOn ? 0.5 : 0; master.connect(actx.destination);
  } catch (e) { actx = null; }
}
let soundOn = false;
const soundBtn = document.getElementById('sound');
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  soundBtn.textContent = soundOn ? 'sound on' : 'sound off';
  soundBtn.setAttribute('aria-pressed', String(soundOn));
  audioWake();
  if (actx && actx.state === 'suspended') actx.resume();
  if (master) master.gain.setTargetAtTime(soundOn ? 0.5 : 0, actx.currentTime, 0.03);
});
let clinkBudget = 0;
const stats = { contacts: 0, clinks: 0, pairs: new Set(), reset() { this.contacts = 0; this.clinks = 0; this.pairs.clear(); } };
// touch budget: pairs that touched recently (pair index → time). New gusts weaken as it fills,
// so a hand through the cloud knocks one or two rods together, not a cascade.
const recentTouch = new Map();
let gustScale = 1;
function updateGustScale(t, dt) {
  for (const [k, t0] of recentTouch) if (t - t0 > 3.5) recentTouch.delete(k);
  const n = recentTouch.size;
  const target = n === 0 ? 1 : n < P.touchBudget ? 0.3 : 0.05;
  gustScale += (target - gustScale) * Math.min(1, dt / (target < gustScale ? 0.08 : 1.2));
}
function clink(rod, strength) {
  if (!actx || !soundOn || clinkBudget > 10) return;
  clinkBudget++; stats.clinks++;
  const t = actx.currentTime;
  const vol = Math.min(1, strength / 0.45) * 0.35;
  const f0 = (1700 + (P.lenMax - rod.L) * 1800) * rod.pitch;
  for (const [mul, gain, dec] of [[1, 1, 0.09], [2.31, 0.45, 0.06], [3.76, 0.22, 0.04]]) {
    const o = actx.createOscillator(); o.type = 'sine'; o.frequency.value = f0 * mul;
    const g = actx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dec + 0.03 * (strength / 0.3));
    o.connect(g).connect(master); o.start(t); o.stop(t + dec + 0.12);
  }
}

// ------------------------------------------------------------------ physics
const tmpW = [0, 0, 0];
const SUB = 1 / 120;
function step(dt, t) {
  updateGustScale(t, dt);
  // swing and twist
  for (const rod of rods) {
    const top = P.frameY, bottom = P.frameY - rod.thr - rod.L;
    // ambient at the rod centre
    const cy = P.frameY - rod.d;
    ambientWind(rod.px + rod.ux * rod.d, cy, rod.pz, t, tmpW);
    let wx = tmpW[0], wz = tmpW[2];
    let lever = 1;
    // puffs: hit the nearest point of the rod; the lever is where they hit
    let px = 0, pz = 0, pl = 0, pw = 0;
    for (const q of puffs) {
      const age = t - q.t0;
      const s = q.s0 + 0.5 * age;
      const amp = Math.exp(-age / 0.5) * (q.s0 / s);
      const hy = Math.min(Math.max(q.y, bottom), top - rod.thr);
      const sAlong = top - hy;                     // distance from pivot
      const rx = rod.px + rod.ux * sAlong, rz = rod.pz + rod.uz * sAlong;
      const dx = q.x - rx, dy = q.y - hy, dz = q.z - rz;
      const g = amp * Math.exp(-(dx * dx + dy * dy + dz * dz) / (2 * s * s));
      if (g > 1e-3) { px += (q.vx + 0.3 * q.vy * (rolled ? 1 : 0)) * g; pz += q.vz * g + q.vy * g * 0.08; pl += (sAlong / rod.d) * g; pw += g; }
    }
    // overlapping puffs are one body of air: average their velocity, don't add it up
    if (pw > 0) { lever = Math.min(pl / pw, P.leverCap); const inv = 1 / Math.max(1, pw); px *= inv; pz *= inv; }
    // scroll: on a phone the screen's vertical is world x, so scrolling blows along the swing
    // a gentle scroll already blows; a fast flick saturates instead of blowing harder
    const sMag = Math.sign(scrollWind) * (1 - Math.exp(-Math.abs(scrollWind) * 1.5)) * P.scrollGain;
    const sw = rolled ? -sMag * (0.75 + 0.25 * Math.sin(rod.px * 9 + t * 1.3)) : 0;
    const sIn = -Math.abs(sMag) * 0.5 * (0.8 + 0.2 * Math.sin(rod.px * 5 - t));
    const cy_ = Math.cos(rod.yaw), sy_ = Math.sin(rod.yaw);
    const ax = 0.55 + 0.45 * Math.abs(sy_), az = 0.55 + 0.45 * Math.abs(cy_);
    const pg = 0.45 * gustScale;
    const fx = (wx + sw * gustScale) * ax + px * lever * ax * pg;
    const fz = (wz + sIn * gustScale) * az + pz * lever * az * pg;
    const sinf = Math.hypot(rod.tx, rod.tz) > 1e-4 ? Math.sin(Math.hypot(rod.tx, rod.tz)) / Math.hypot(rod.tx, rod.tz) : 1;
    rod.vx += (-rod.k * rod.tx * sinf - P.kd * rod.vx + P.kw * fx) * dt;
    rod.vz += (-rod.k * rod.tz * sinf - P.kd * rod.vz + P.kw * fz) * dt;
    rod.tx += rod.vx * dt; rod.tz += rod.vz * dt;
    // the thread catches: no rod swings past ~70°
    const mag = Math.hypot(rod.tx, rod.tz);
    if (mag > 1.2) { const f = 1.2 / mag; rod.tx *= f; rod.tz *= f; rod.vx *= 0.4; rod.vz *= 0.4; }
    // twist: a torsion spring to its rest yaw, kicked by wind shear across the face
    const tq = (wx + px * lever) * cy_ * 0.9 + (wz + pz * lever) * sy_ * 0.5;
    rod.yawV += (-1.2 * (rod.yaw - rod.yaw0) - 0.35 * rod.yawV + 2.2 * tq) * dt;
    rod.yaw += rod.yawV * dt;
    // axis
    const nx = rod.tx, nz = rod.tz, inv = 1 / Math.sqrt(1 + nx * nx + nz * nz);
    rod.ux = nx * inv; rod.uy = -inv; rod.uz = nz * inv;
  }
  // contacts between neighbours: capsule vs capsule
  const rad = Math.hypot(P.rodW, P.rodD) * 0.5;
  for (let p = 0; p < pairs.length; p++) {
    const a = rods[pairs[p][0]], b = rods[pairs[p][1]];
    // quick reject on tip distance
    const ta = a.thr + a.L, tb = b.thr + b.L;
    const ax1 = a.px + a.ux * ta, az1 = a.pz + a.uz * ta;
    const bx1 = b.px + b.ux * tb, bz1 = b.pz + b.uz * tb;
    const dxp = a.px - b.px, dzp = a.pz - b.pz;
    const dxt = ax1 - bx1, dzt = az1 - bz1;
    if (Math.min(dxp * dxp + dzp * dzp, dxt * dxt + dzt * dzt) > (0.08) * (0.08)) continue;
    // closest points between the two rod segments (pivot+thr → tip)
    const cp = closest(a, b);
    if (!cp) continue;
    const dist = cp.dist, sum = rad * 2;
    if (dist >= sum) continue;
    const nx = cp.nx, ny = cp.ny, nz = cp.nz;          // from b to a
    const sa = cp.sa, sb = cp.sb;                        // distances from pivots
    const vax = a.vx * sa, vaz = a.vz * sa, vbx = b.vx * sb, vbz = b.vz * sb;
    const vn = (vax - vbx) * nx + (vaz - vbz) * nz;
    const ia = sa * sa / a.Ieff, ib = sb * sb / b.Ieff;
    if (vn < 0) {
      stats.contacts++; stats.pairs.add(p); recentTouch.set(p, t);
      const j = -(1 + P.restitution) * vn / (ia + ib);
      a.vx += j * sa / a.Ieff * nx; a.vz += j * sa / a.Ieff * nz;
      b.vx -= j * sb / b.Ieff * nx; b.vz -= j * sb / b.Ieff * nz;
      if (-vn > 0.03 && t - a.lastClink > 0.05) { a.lastClink = t; clink(-vn > 0.25 ? (a.L < b.L ? a : b) : a, -vn); }
      // a touch of contact friction on the twist
      a.yawV *= 0.9; b.yawV *= 0.9;
    }
    const pen = sum - dist;
    const ca = 0.5 * pen / Math.max(sa, 0.05), cb = 0.5 * pen / Math.max(sb, 0.05);
    a.tx += ca * nx; a.tz += ca * nz; b.tx -= cb * nx; b.tz -= cb * nz;
  }
}

// closest points between segments A(sa) = pa + ua*sa, sa∈[thr, thr+L]  (Ericson 5.1.9)
const cpOut = { dist: 0, nx: 0, ny: 0, nz: 0, sa: 0, sb: 0 };
function closest(a, b) {
  const a0 = a.thr, a1 = a.thr + a.L, b0 = b.thr, b1 = b.thr + b.L;
  // P1 = pa + ua*a0, d1 = ua*(a1-a0); P2 = pb + ub*b0, d2 = ub*(b1-b0)
  const p1x = a.px + a.ux * a0, p1y = P.frameY + a.uy * a0, p1z = a.pz + a.uz * a0;
  const p2x = b.px + b.ux * b0, p2y = P.frameY + b.uy * b0, p2z = b.pz + b.uz * b0;
  const la = a1 - a0, lb = b1 - b0;
  const d1x = a.ux * la, d1y = a.uy * la, d1z = a.uz * la;
  const d2x = b.ux * lb, d2y = b.uy * lb, d2z = b.uz * lb;
  const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z;
  const A = d1x * d1x + d1y * d1y + d1z * d1z, E = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  const c = d1x * rx + d1y * ry + d1z * rz;
  const B = d1x * d2x + d1y * d2y + d1z * d2z;
  const den = A * E - B * B;
  let s = den !== 0 ? THREE.MathUtils.clamp((B * f - c * E) / den, 0, 1) : 0;
  let u = (B * s + f) / E;
  if (u < 0) { u = 0; s = THREE.MathUtils.clamp(-c / A, 0, 1); }
  else if (u > 1) { u = 1; s = THREE.MathUtils.clamp((B - c) / A, 0, 1); }
  const cx = p1x + d1x * s - (p2x + d2x * u), cy = p1y + d1y * s - (p2y + d2y * u), cz = p1z + d1z * s - (p2z + d2z * u);
  const dist = Math.sqrt(cx * cx + cy * cy + cz * cz);
  if (dist < 1e-6) return null;
  cpOut.dist = dist; cpOut.nx = cx / dist; cpOut.ny = cy / dist; cpOut.nz = cz / dist;
  cpOut.sa = a0 + la * s; cpOut.sb = b0 + lb * u;
  // the contact normal acts in the swing plane: renormalise its horizontal part
  const h = Math.hypot(cpOut.nx, cpOut.nz);
  if (h < 1e-4) return null;
  cpOut.nx /= h; cpOut.nz /= h;
  return cpOut;
}

// ------------------------------------------------------------------ instance matrices + threads
const M = new THREE.Matrix4(), Qs = new THREE.Quaternion(), Qy = new THREE.Quaternion(), S = new THREE.Vector3(), T = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0), U = new THREE.Vector3(), YAXIS = new THREE.Vector3(0, 1, 0);
function writeInstances() {
  const put = (mesh, list) => {
    for (let k = 0; k < list.length; k++) {
      const rod = rods[list[k]];
      U.set(rod.ux, rod.uy, rod.uz);
      Qs.setFromUnitVectors(DOWN, U);
      Qy.setFromAxisAngle(YAXIS, rod.yaw);
      Qs.multiply(Qy);
      const cd = rod.thr + rod.L / 2;
      T.set(rod.px + rod.ux * cd, P.frameY + rod.uy * cd, rod.pz + rod.uz * cd);
      S.set(1, rod.L, 1);
      M.compose(T, Qs, S);
      mesh.setMatrixAt(k, M);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  put(meshBack, backIdx); put(meshFront, frontIdx);
  for (let i = 0; i < N; i++) {
    const rod = rods[i], o = i * 6;
    threadPos[o] = rod.px; threadPos[o + 1] = P.frameY; threadPos[o + 2] = rod.pz;
    threadPos[o + 3] = rod.px + rod.ux * rod.thr; threadPos[o + 4] = P.frameY + rod.uy * rod.thr; threadPos[o + 5] = rod.pz + rod.uz * rod.thr;
  }
  threadGeo.attributes.position.needsUpdate = true;
}

// ------------------------------------------------------------------ frame loop
let last = performance.now() / 1000, acc = 0;
// a first nudge so the cloud is not perfectly still before any wind arrives
for (const rod of rods) { rod.tx = (Math.random() - 0.5) * 0.006; rod.tz = (Math.random() - 0.5) * 0.006; }

// reduced motion: no wind, the cloud hangs still and is drawn a few times, then left alone
const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
let stillFrames = 0;
if (still) { P.amb = 0; P.puffGain = 0; P.scrollGain = 0; }
// render only while the installation is on screen and the tab is visible
let active = true;
const stage = document.getElementById('top');
if (stage && 'IntersectionObserver' in window) {
  new IntersectionObserver(es => { active = es[0].intersectionRatio > 0; }, { threshold: [0, 0.001], rootMargin: '-80px 0px 0px 0px' }).observe(stage);   // the strip under the solid header does not count
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) last = performance.now() / 1000; });
function loop() {
  requestAnimationFrame(loop);
  if (driven) return;
  if (!active || (still && stillFrames > 3)) { last = performance.now() / 1000; return; }
  if (still) stillFrames++;
  const now = performance.now() / 1000;
  advance(Math.min(now - last, 1 / 20)); last = now;
}
let driven = false;
function advance(dt) {
  const now = performance.now() / 1000;
  acc += dt; clinkBudget = 0;
  let n = 0;
  while (acc >= SUB && n < 6) { step(SUB, now - acc); acc -= SUB; n++; }
  if (n === 6) acc = 0;
  // let puffs drift with the air and die
  for (let i = puffs.length - 1; i >= 0; i--) {
    const q = puffs[i]; q.x += q.vx * dt * 0.55; q.y += q.vy * dt * 0.55;
    if (now - q.t0 > 2.2) puffs.splice(i, 1);
  }
  scrollWind *= Math.exp(-dt / 0.25);
  if (now - lastScrollT / 1000 > 0.15) scrollWind *= Math.exp(-dt / 0.08);

  writeInstances();
  renderFrame();
}
function renderFrame() {
  // 1. background → rtBg
  renderer.setRenderTarget(rtBg); renderer.clear();
  renderer.render(sceneBg, camera);
  // 2. rtBg + back rods → rtMid
  renderer.setRenderTarget(rtMid); renderer.clear();
  copyMat.uniforms.map.value = rtBg.texture; copyMat.uniforms.uTone.value = 0; renderer.render(copyScene, copyCam);
  renderer.clearDepth(); renderer.render(sceneBack, camera);
  // 3. rtMid + front rods → screen
  renderer.setRenderTarget(null); renderer.clear();
  copyMat.uniforms.map.value = rtMid.texture; copyMat.uniforms.uTone.value = 1; renderer.render(copyScene, copyCam);
  renderer.clearDepth(); renderer.render(sceneFront, camera);
}
loop();
// full-resolution crop of the live canvas (for the harness): CSS-pixel rect in, JPEG data URL out
function capture(x, y, w, h, scale = 1) {
  renderFrame();
  const c = document.createElement('canvas'); c.width = Math.round(w * DPR * scale); c.height = Math.round(h * DPR * scale);
  c.getContext('2d').drawImage(canvas, x * DPR, y * DPR, w * DPR, h * DPR, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.9);
}
// save a crop to the dev server (POST /save/<name>) so the harness can look at it without hauling base64 through the console
async function shot(name, x = 0, y = 0, w = window.innerWidth, h = window.innerHeight, scale = 1) {
  const url = capture(x, y, w, h, scale);
  const blob = await (await fetch(url)).blob();
  const r = await fetch('/save/' + name, { method: 'POST', body: blob });
  return r.ok ? name : 'failed';
}

// ------------------------------------------------------------------ lab panel (?lab)
if (LAB) {
  const lab = document.getElementById('lab'); lab.style.display = 'block';
  const rows = [
    ['spread', 0, 0.3, 0.005, v => { matBack.uniforms.uSpread.value = matFront.uniforms.uSpread.value = v; }],
    ['thick', 0, 40, 0.5, v => { matBack.uniforms.uThick.value = matFront.uniforms.uThick.value = v; }],
    ['prism', 0, 0.05, 0.001, v => { matBack.uniforms.uPrism.value = matFront.uniforms.uPrism.value = v; }],
    ['edge', 0, 3, 0.05, v => { matBack.uniforms.uEdge.value = matFront.uniforms.uEdge.value = v; }],
    ['specDisp', 0, 6, 0.1, v => { matBack.uniforms.uSpecDisp.value = matFront.uniforms.uSpecDisp.value = v; }],
    ['sun', 0, 12, 0.1, v => { sun.material.uniforms.uP.value = v; }],
    ['bulge', 0, 2, 0.02, v => { matBack.uniforms.uBulge.value = matFront.uniforms.uBulge.value = v; }],
    ['amb', 0, 1.2, 0.01, v => { P.amb = v; }],
    ['kw', 0, 10, 0.1, v => { P.kw = v; }],
    ['puffGain', 0, 3, 0.05, v => { P.puffGain = v; }],
    ['portraitDim', 0, 1.5, 0.01, v => { portraitMat.uniforms.uDim.value = v; }],
  ];
  for (const [k, mn, mx, st, fn] of rows) {
    const l = document.createElement('label');
    l.innerHTML = `<span>${k}</span><input type="range" min="${mn}" max="${mx}" step="${st}" value="${P[k]}"><b>${P[k]}</b>`;
    const inp = l.querySelector('input'), b = l.querySelector('b');
    inp.addEventListener('input', () => { const v = parseFloat(inp.value); b.textContent = v; fn(v); });
    lab.appendChild(l);
  }
  const fps = document.createElement('div'); lab.appendChild(fps);
  let fc = 0, ft = performance.now();
  (function tick() { requestAnimationFrame(tick); fc++; const n = performance.now(); if (n - ft > 1000) { fps.textContent = `${fc} fps · ${N} rods · ${pairs.length} pairs · ${puffs.length} puffs`; fc = 0; ft = n; } })();
}

// expose a little for the harness
// drive the frames from the harness when the pane is not painting (hidden panes get no rAF)
function run(ms, fps = 60) {
  driven = true;
  return new Promise(res => { const t0 = performance.now(); const h = () => { advance(1 / fps); if (performance.now() - t0 < ms) setTimeout(h, 1000 / fps); else { driven = false; last = performance.now() / 1000; res(); } }; h(); });
}
// harness: how many rod tips project inside the viewport right now
const _tip = new THREE.Vector3();
function tipsOnScreen() {
  let n = 0;
  for (const rod of rods) {
    const t = rod.thr + rod.L;
    _tip.set(rod.px + rod.ux * t, P.frameY + rod.uy * t, rod.pz + rod.uz * t).project(camera);
    if (Math.abs(_tip.x) < 1 && Math.abs(_tip.y) < 1) n++;
  }
  return n;
}
window.__rods = { P, rods, puffs, pointerToWorld, capture, shot, stats, run, tipsOnScreen, get active() { return active; }, blow(v) { scrollWind = v; lastScrollT = performance.now(); }, get rolled() { return rolled; },
  bench(n = 60) { const t0 = performance.now(); for (let i = 0; i < n; i++) { step(SUB, i * SUB); } const t1 = performance.now(); for (let i = 0; i < n; i++) writeInstances(); const t2 = performance.now(); return { stepMs: (t1 - t0) / n, writeMs: (t2 - t1) / n }; } };
