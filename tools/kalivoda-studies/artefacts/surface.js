// Study after Chvění hladiny (Quivering Surface), 2020: water filled to the brim of a glass
// cylinder, seen from above. A damped wave equation runs inside the rim; the vessel is shaken
// by the floor (the cursor passing by), and in the large view a touch drops ripples.
// Rendering: the meniscus and ripples reflect two lamps, refract the base far below (three
// wavelengths, so ripples fringe), and the cylinder wall folds the view into receding rings.
import { context, program, FS_VS, fullscreen, target, loop, reducedMotion } from './gl.js';

const SIM_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uState; uniform vec2 uTexel;
uniform float uR, uRim, uC2, uDamp;
uniform vec4 uDrops[8];               // xy centre (uv), z radius (uv), w strength
void main() {
  vec2 s = texture(uState, vUv).rg;
  float h = s.r, prev = s.g;
  float l = texture(uState, vUv + vec2(uTexel.x, 0.)).r + texture(uState, vUv - vec2(uTexel.x, 0.)).r
          + texture(uState, vUv + vec2(0., uTexel.y)).r + texture(uState, vUv - vec2(0., uTexel.y)).r - 4. * h;
  float n = (2. * h - prev + uC2 * l) * uDamp;
  for (int i = 0; i < 8; i++) {
    vec4 d = uDrops[i];
    if (d.w != 0.) { vec2 q = vUv - d.xy; n += d.w * exp(-dot(q, q) / (d.z * d.z)); }
  }
  float r = length(vUv * 2. - 1.);
  if (r > uR) n = r < uR + 6. * uTexel.x ? uRim : 0.;   // the wall moves with the floor
  o = vec4(n, h, 0., 1.);
}`;

const VIEW_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uState; uniform vec2 uTexel;
uniform vec2 uScale;                  // canvas uv -> sim space [-1,1]
uniform float uR, uAmp, uMen, uWall, uTime;
const float H = 2.6;                  // depth of water down to the base, in rim radii

float sim(vec2 p) { return texture(uState, p * .5 + .5).r; }
vec3 tonemap(vec3 x) { x *= .85; return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// what the water reflects: a dark ceiling, a warm spot nearly overhead, a long cool strip light
vec3 env(vec3 d) {
  vec2 t = d.xy / max(d.z, .05);
  vec3 c = vec3(.012, .012, .016);
  vec2 a = (t - vec2(.06, .09)) / vec2(.05, .05);
  c += vec3(1., .84, .64) * 24. * smoothstep(1.35, .15, length(a));
  vec2 b = (t - vec2(-.42, .26)) / vec2(.24, .022);
  c += vec3(.8, .9, 1.) * 8. * smoothstep(1.3, .45, max(abs(b.x), abs(b.y)));
  c += vec3(.5, .55, .6) * .9 * smoothstep(1., .2, length(t / vec2(.9, .7)));   // the dim ceiling of the room
  return c;
}

// the base far below, seen through the water; the glass wall folds it into rings
vec3 base(vec2 q, float lap) {
  float r = length(q);
  float k = 0.;
  for (int i = 0; i < 6; i++) { if (r <= uR) break; r = 2. * uR - r; k += 1.; if (r < 0.) r = -r; }
  vec2 qq = normalize(q + 1e-5) * r;
  // the wooden base, far down: fine grain the ripples bend
  float grain = .5 + .5 * sin(qq.y * 52. + sin(qq.x * 3.1) * 2.4 + sin(qq.y * 6.3 + qq.x * 1.7) * .9);
  vec3 wood = mix(vec3(.075, .05, .032), vec3(.15, .10, .062), grain);
  // light focused through the moving surface: bright where the surface curves inward
  float caustic = clamp(1. - lap * 420., .3, 2.6);
  vec3 c = wood * (.3 + .7 * caustic) * smoothstep(uR * 1.05, uR * .15, r * .92);
  return c * pow(vec3(.74, .86, .8), vec3(k)) * (k > 0. ? .7 : 1.);
}

void main() {
  vec2 p = (vUv * 2. - 1.) * uScale;
  float r = length(p);
  vec3 col;
  if (r < uR) {
    // height: ripples plus the meniscus dome standing above the brim
    float hx = (sim(p + vec2(uTexel.x * 2., 0.)) - sim(p - vec2(uTexel.x * 2., 0.))) / (uTexel.x * 4.);
    float hy = (sim(p + vec2(0., uTexel.y * 2.)) - sim(p - vec2(0., uTexel.y * 2.))) / (uTexel.y * 4.);
    float lap = sim(p + vec2(uTexel.x * 2., 0.)) + sim(p - vec2(uTexel.x * 2., 0.)) + sim(p + vec2(0., uTexel.y * 2.)) + sim(p - vec2(0., uTexel.y * 2.)) - 4. * sim(p);
    float x = r / uR;
    float dm = -uMen * 14. * pow(x, 13.) / uR;          // slope of the dome
    vec2 g = vec2(hx, hy) * uAmp + (r > 0. ? p / r : vec2(0.)) * dm;
    vec3 N = normalize(vec3(-g, 1.));
    vec3 V = vec3(0., 0., 1.);
    float F = .02 + .98 * pow(1. - N.z, 5.);
    vec3 refl = env(reflect(-V, N));
    // refraction to the base, one wavelength per channel
    vec3 tr;
    for (int c = 0; c < 3; c++) {
      float ior = 1.331 + .006 * float(c);
      vec3 T = refract(-V, N, 1. / ior);
      vec2 hit = p + T.xy / max(-T.z, .2) * H * uR;
      tr[c] = base(hit, lap * uAmp)[c];
    }
    col = tr * (1. - F) + refl * F;
    col += vec3(.6, .8, .74) * .04 * smoothstep(.93, 1., x);  // the brim seen through the meniscus
  } else if (r < uR + uWall) {
    // top edge of the glass wall: light carried along the glass comes out green
    float e = (r - uR) / uWall;
    float glow = .55 + .45 * smoothstep(0., .5, e) * smoothstep(1., .5, e);
    col = vec3(.22, .34, .30) * glow;
    col += vec3(1., .92, .8) * .5 * pow(max(0., dot(normalize(p), normalize(vec2(.3, .45)))), 24.);
  } else {
    // gallery floor; the filled cylinder throws a little light around itself
    col = vec3(.016, .016, .019) + vec3(.03, .042, .038) * exp(-(r - uR) * 9.);
  }
  col = tonemap(col);
  col += (hash(gl_FragCoord.xy + uTime) - .5) / 255.;      // dither the dark gradients
  o = vec4(col, 1.);
}`;

export function mount(canvas) {
  const gl = context(canvas);
  if (!gl) return null;
  const sim = program(gl, FS_VS, SIM_FS);
  const view = program(gl, FS_VS, VIEW_FS);
  const phone = Math.min(screen.width, screen.height) < 600;
  const N = phone ? 192 : 256;
  // linear filtering: the sim reads exact texel centres anyway, and the view gets smooth slopes
  let A = target(gl, N, N, { format: 'RG16F' });
  let B = target(gl, N, N, { format: 'RG16F' });
  const R = .86;
  const drops = new Float32Array(32), ZERO = new Float32Array(32);
  let nDrops = 0;
  const addDrop = (u, v, rad, s) => { if (nDrops >= 8) return; drops.set([u, v, rad, s], nDrops * 4); nDrops++; };

  let shake = 0;              // floor vibration from the cursor passing (0..1)
  let full = false;           // large view: touching the water is allowed
  let simT = 0, frames = 0, lastMs = 0;
  const still = reducedMotion();

  // sim space [-1,1] fits the shorter side of the canvas with a margin
  let scale = [1, 1];
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(2, Math.round(canvas.clientWidth * dpr)), h = Math.max(2, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const m = 1.12;
    scale = w > h ? [m * w / h, m] : [m, m * h / w];
    if (!loopApi.running) draw(0);
  }

  function step(dt, t) {
    const steps = 3;
    for (let k = 0; k < steps; k++) {
      simT += 1;
      // the floor never quite rests (traffic, footsteps); the cursor shakes it harder
      const rim = (.0003 + .0045 * shake) * Math.sin(simT * 2 * Math.PI / 56) + .00012 * Math.sin(simT * .113);
      if (!still && Math.random() < .004) addDrop(.5 + (Math.random() - .5) * .8, .5 + (Math.random() - .5) * .8, .012, .0015 * (Math.random() < .5 ? -1 : 1));
      gl.useProgram(sim.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, B.fb);
      gl.viewport(0, 0, N, N);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, A.tex);
      gl.uniform1i(sim.u.uState, 0);
      gl.uniform2f(sim.u.uTexel, 1 / N, 1 / N);
      gl.uniform1f(sim.u.uR, R);
      gl.uniform1f(sim.u.uRim, still ? 0 : rim);
      gl.uniform1f(sim.u.uC2, .45);
      gl.uniform1f(sim.u.uDamp, .9965);
      gl.uniform4fv(sim.u.uDrops, k === 0 ? drops : ZERO);
      fullscreen(gl);
      [A, B] = [B, A];
    }
    drops.fill(0); nDrops = 0;
    shake *= Math.exp(-dt / .9);
  }

  function draw(t) {
    const t0 = performance.now();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(view.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, A.tex);
    gl.uniform1i(view.u.uState, 0);
    gl.uniform2f(view.u.uTexel, 1 / N, 1 / N);
    gl.uniform2f(view.u.uScale, scale[0], scale[1]);
    gl.uniform1f(view.u.uR, R);
    gl.uniform1f(view.u.uAmp, 1);
    gl.uniform1f(view.u.uMen, .006);
    gl.uniform1f(view.u.uWall, .016);
    gl.uniform1f(view.u.uTime, t % 100);
    fullscreen(gl);
    frames++; lastMs = performance.now() - t0;
  }

  const loopApi = loop((dt, t) => { if (!still || frames < 3) { step(dt, t); draw(t); } });

  // pointer: anywhere over the study shakes the floor; in the large view a touch drops ripples
  let px = null, py = null, pt = 0, down = false;
  const toSim = e => {
    const b = canvas.getBoundingClientRect();
    const x = ((e.clientX - b.left) / b.width * 2 - 1) * scale[0], y = (1 - (e.clientY - b.top) / b.height * 2) * scale[1];
    return [x * .5 + .5, y * .5 + .5, Math.hypot(x, y)];
  };
  const onMove = e => {
    const now = performance.now();
    if (px !== null) {
      const sp = Math.hypot(e.clientX - px, e.clientY - py) / Math.max(1, now - pt);   // px per ms
      shake = Math.min(1, shake + sp * .08);
      if (full && down) {
        const [u, v, r] = toSim(e);
        if (r < R) addDrop(u, v, .018, -.006 * Math.min(2, .3 + sp));
      }
    }
    px = e.clientX; py = e.clientY; pt = now;
  };
  const onDown = e => {
    if (!full) return;
    down = true;
    const [u, v, r] = toSim(e);
    if (r < R) addDrop(u, v, .022, -.012);
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onUp = () => { down = false; };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  resize();
  draw(0);
  return {
    name: 'surface',
    start: () => loopApi.start(),
    stop: () => loopApi.stop(),
    resize,
    setFull(v) { full = v; canvas.style.touchAction = v ? 'none' : ''; },
    poke(u = .5, v = .5, s = -.012) { addDrop(u, v, .022, s); },
    shake(v = 1) { shake = Math.min(1, shake + v); },
    run(seconds) { const n = Math.round(seconds * 60); for (let i = 0; i < n; i++) step(1 / 60, 0); draw(0); },
    snap() { step(1 / 60, 0); draw(0); return canvas.toDataURL('image/jpeg', .9); },
    stats: () => ({ frames, lastMs, sim: N, px: [canvas.width, canvas.height] }),
    destroy() { loopApi.stop(); A.dispose(); B.dispose(); gl.getExtension('WEBGL_lose_context')?.loseContext(); },
  };
}
