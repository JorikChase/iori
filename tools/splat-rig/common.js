// Shared query parsing, HUD and frame loop for all rig pages.
// ?scene=gs_ruh&pos=x,y,z&look=x,y,z&up=x,y,z&fov=50&file=./out/x.sog&drive=1
export const q = new URLSearchParams(location.search);
export const scene = q.get('scene') || 'gs_ruh';
export const v3 = (k, d) => (q.get(k) || d).split(',').map(Number);
export const pos = v3('pos', '-1.6,-4.2,2.6'), look = v3('look', '-1.6,-1.7,0.2'), up = v3('up', '0,0,1');
export const fov = Number(q.get('fov') || 50);
export const hud = document.getElementById('hud');
export const sync = !!q.get('sync');
let export_sync = false;
// A hidden Browser pane throttles requestAnimationFrame to ~1 fps. ?drive=1 runs the
// frame from setTimeout instead (still services fetch/promises, unlike a MessageChannel spin).
export function fpsLoop(label, extra, step) {
  let frames = 0, last = performance.now(), prev = last;
  // ?sync=1: step() returns a promise / blocks until the GPU finished, so fps = real GPU throughput.
  export_sync = !!q.get('sync');
  const tick = () => {
    const now = performance.now(); let r; if (step) { try { r = step(Math.min(0.1, (now - prev) / 1000)); } catch (e) { console.error(e); } } prev = now; frames++;
    if (now - last > 1000) { hud.textContent = `${label}${export_sync ? ' sync' : ''}\n${extra()}\nfps ${(frames * 1000 / (now - last)).toFixed(0)}`; frames = 0; last = now; }
    const next = () => { if (q.get('drive')) setTimeout(tick, 0); else requestAnimationFrame(tick); };
    (r && r.then) ? r.then(next, next) : next();
  };
  tick();
}
