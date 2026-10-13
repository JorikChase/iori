/*
 * silviculture-ground.js — STAND-IN for landscape-ground.js (the ground agent's file): buildGround(terrain, opts) with
 * the same signature, used only until that file exists. Pale hypsometric 'drawing' palette with contour lines, or a
 * 'natural' palette; water as flat quads. Mapping (x, height, −y). Colours are ours.
 */
import * as THREE from 'three';

const PAL = {
  drawing: { low: 0xe8ecdc, mid: 0xefe9d5, high: 0xecebe6, top: 0xfafaf9, rock: 0xd9d6cf, scree: 0xe2dfd8, wet: 0xe1e9da, water: 0xd6e4ea, contour: 0.78 },
  natural: { low: 0x8e9f63, mid: 0xa59e71, high: 0x9b9583, top: 0xf2f3f5, rock: 0x8a857c, scree: 0xa39d92, wet: 0x7c9a5a, water: 0x6d93a6, contour: 0.96 },
};
/** buildGround stand-in: { group, setPalette, dispose, update } — mesh in (x, height, −y) */
export function buildGround(t, { palette = 'drawing', detail = 'region', origin = { x: 0, y: 0 } } = {}) {
  const n = t.n, N = n * n, group = new THREE.Group();
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), idx = [];
  const ox = t.origin ? t.origin.x : 0, oy = t.origin ? t.origin.y : 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x; pos[i * 3] = ox + x * t.cell_m; pos[i * 3 + 1] = t.height[i]; pos[i * 3 + 2] = -(oy + y * t.cell_m);
  }
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) { const a = y * n + x; idx.push(a, a + 1, a + n, a + 1, a + n + 1, a + n); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  let hmin = Infinity, hmax = -Infinity; for (const v of t.height) { hmin = Math.min(hmin, v); hmax = Math.max(hmax, v); }
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const spacing = detail === 'region' ? 100 : 2;
  mat.userData.u = { k: { value: 0.78 }, sp: { value: spacing } };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCK = mat.userData.u.k; sh.uniforms.uSp = mat.userData.u.sp;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWY; uniform float uCK; uniform float uSp;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat cf = vWY / uSp; float cd = abs(fract(cf - 0.5) - 0.5) / max(fwidth(cf), 1e-4); float cl = 1.0 - min(cd, 1.0);\ndiffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uCK, cl * 0.85);');
  };
  const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; group.add(mesh);
  // water
  const wv = [];
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    const a = y * n + x;
    if (!t.waterKind[a] && !t.waterKind[a + 1] && !t.waterKind[a + n] && !t.waterKind[a + n + 1]) continue;
    const lv = Math.max(t.height[a] + t.water[a], t.height[a + 1] + t.water[a + 1], t.height[a + n] + t.water[a + n], t.height[a + n + 1] + t.water[a + n + 1]) - 0.3;
    const X0 = ox + x * t.cell_m, X1 = X0 + t.cell_m, Y0 = -(oy + y * t.cell_m), Y1 = Y0 - t.cell_m;
    wv.push(X0, lv, Y0, X1, lv, Y0, X0, lv, Y1, X1, lv, Y0, X1, lv, Y1, X0, lv, Y1);
  }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wv, 3)); wg.computeVertexNormals();
  const wmat = new THREE.MeshLambertMaterial({ color: 0xd6e4ea, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
  const wmesh = new THREE.Mesh(wg, wmat); group.add(wmesh);
  const c = new THREE.Color(), c2 = new THREE.Color();
  function setPalette(p) {
    const P = PAL[p] || PAL.drawing;
    for (let i = 0; i < N; i++) {
      const u = (t.height[i] - hmin) / (hmax - hmin || 1), m = t.material[i];
      if (u < 0.45) c.setHex(P.low).lerp(c2.setHex(P.mid), u / 0.45); else if (u < 0.8) c.setHex(P.mid).lerp(c2.setHex(P.high), (u - 0.45) / 0.35); else c.setHex(P.high).lerp(c2.setHex(P.top), (u - 0.8) / 0.2);
      if (m === 0) c.lerp(c2.setHex(P.rock), 0.7); else if (m === 1) c.lerp(c2.setHex(P.scree), 0.6); else if (m === 3) c.lerp(c2.setHex(P.wet), 0.5); else if (m === 5) c.setHex(P.top);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.attributes.color.needsUpdate = true; wmat.color.setHex(P.water); mat.userData.u.k.value = P.contour;
  }
  setPalette(palette);
  return { group, mesh, setPalette, dispose() { g.dispose(); mat.dispose(); wg.dispose(); wmat.dispose(); }, update() {} };
}
