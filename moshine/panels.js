// panels.js — tool windows shared by the app and the lab: Device (the probe) and Tests (the harness).
import { h } from './shell.js';
import { TIER_LIMITS } from './platform.js';

const kv = (rows) => { const d = h('div', 'ms-kv'); for (const [k, v] of rows) d.append(h('span', '', k), h('span', '', String(v))); return d; };

export function deviceWindow(S, P, gpu, opts) {
  const d = h('div'), L = TIER_LIMITS[P.tier];
  d.append(kv([['adapter', P.adapter || '—'], ['api', P.api + (gpu.level === 'compatibility' ? ' (compat)' : '')], ['features', P.features.join(', ') || '—'],
    ['max buffer', ((P.limits.maxBufferSize || 0) / 2 ** 20).toFixed(0) + ' MiB'], ['max storage bind', ((P.limits.maxStorageBufferBindingSize || 0) / 2 ** 20).toFixed(0) + ' MiB'],
    ['max texture', P.limits.maxTextureDimension2D], ['device memory', P.deviceMemory ?? 'n/a'], ['cores', P.cores ?? 'n/a'],
    ['WebCodecs', `video ${P.webcodecs.video ? 'yes' : 'no'} · audio ${P.webcodecs.audio ? 'yes' : 'no'}`], ['H.264 1080p', `decode ${P.webcodecs.h264dec} · encode ${P.webcodecs.h264enc}`],
    ['OPFS', P.opfs ? 'yes' : 'no'], ['cross-origin isolated', P.coi ? 'yes' : 'no'], ['score → tier', `${P.score} → ${P.tier}`], ['tier preview cap', `${L.preview[0]}×${L.preview[1]} @ ${L.fps}`]]));
  d.append(h('div', 'ms-note', 'Probe v0: static signals only. The dynamic micro-benchmarks and the real-time governor arrive in M4 (spec §10.6).'));
  return S.win('device', 'Device', d, { x: 16, y: 70, w: 340, ...opts });
}

/** Tests window: runs the in-page harness. pause/resume let the host stop its own rendering meanwhile. */
export function testsWindow(S, { pause = () => {}, resume = () => {}, ...opts } = {}) {
  const d = h('div'), res = h('div', 'ms-res'), run = h('button', 'ms-b', 'RUN TESTS'), brow = h('div', 'ms-brow');
  brow.append(run); d.append(h('div', 'ms-note', 'GPU vs CPU parity of every stage and of the whole loop, estimator truth, cut detection, bloom hold, replay, cost. Same rows as <b>node moshine/tools/bench.mjs</b>.'), brow, res);
  run.addEventListener('click', async () => {
    res.innerHTML = '<div><span>running…</span><span></span></div>'; run.disabled = true; pause();
    const H = await import('./harness.js'); const r = await H.runAll({ tag: 'ui', save: false }); resume(); run.disabled = false; res.innerHTML = '';
    for (const tn of ['T0', 'T1', 'T4']) for (const [k, v] of Object.entries(r[tn] || {})) {
      const row = h('div'); let val = v.pass === undefined ? 'info' : v.pass ? 'pass' : 'FAIL';
      if (v.msPerFrame !== undefined) val = `${v.msPerFrame} ms · ${v.fps} fps`;
      if (k === 'loopCost1080') val = Object.entries(v).filter(([, x]) => x && x.msPerFrame).map(([n, x]) => `${n} ${x.msPerFrame} ms`).join(' · ');
      row.append(h('span', '', `${tn} · ${k}`), h('span', v.pass === undefined ? '' : v.pass ? 'pass' : 'fail', val)); row.title = JSON.stringify(v); res.append(row);
    }
  });
  return S.win('tests', 'Tests', d, { x: 380, y: 70, w: 400, ...opts });
}
