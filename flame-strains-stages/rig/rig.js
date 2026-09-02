(function(){
  if (window.__rig) return 'already';
  const ch = new MessageChannel(); let q = []; let last = 0; let pending = false; const waiters = [];
  const run = () => { pending = false; const cbs = q; q = []; const t = performance.now(); last = t; for (const cb of cbs) cb(t);
    for (let i = waiters.length - 1; i >= 0; i--) if (t >= waiters[i].until) { const w = waiters.splice(i, 1)[0]; w.res(); }
    if (window.__capName) { const n = window.__capName; const res = window.__capRes; window.__capName = null; const c = document.querySelector('canvas');
      const data = c.toDataURL('image/jpeg', 0.85); const meta = window.__capMeta || {}; window.__capMeta = null;
      fetch('http://localhost:8790/up', {method:'POST', body: JSON.stringify({name: n, data, meta})}).then(() => res(n), () => res(n)); } };
  const spin = () => { if (performance.now() - last >= 8) ch.port2.postMessage(0); else ch.port2.postMessage(1); };
  ch.port1.onmessage = e => { if (e.data === 1) { spin(); return; } run(); };
  window.requestAnimationFrame = cb => { q.push(cb); if (!pending) { pending = true; spin(); } return 1; };
  window.__rig = true;
  window.__snap = () => { const P = window.__P || {}; const H = window.__HEAT || {}; const G = window.__GOV || {}; const L = window.__LUM || {}; const s = document.getElementById('stat'); return { t: +(performance.now()/1000).toFixed(1), fuel: P.fuel, emitG: P.emitG, exposure: P.exposure, hot: H.hot, warm: H.warm, mean: H.mean, live: H.live, ratio: H.warm > 0.005 ? +(H.hot / H.warm).toFixed(3) : 0, cov: G.cov, target: G.target, spawnGain: G.spawnGain, spendGain: G.spendGain, expo: G.expo, p95: L.p95, stat: s && s.textContent }; };
  window.__cap = (name, meta) => new Promise(res => { window.__capMeta = Object.assign({}, window.__snap(), meta || {}); window.__capRes = res; window.__capName = name; });
  window.__key = k => { for (const tgt of [document, window, document.body]) tgt.dispatchEvent(new KeyboardEvent('keydown', {key: k, code: k.length === 1 ? 'Key' + k.toUpperCase() : k, bubbles: true})); };
  window.__wait = ms => new Promise(res => waiters.push({until: performance.now() + ms, res}));
  window.__trace = []; window.__traceEvery = 2000; let lastTr = 0;
  const origRun = run; // sample the trace from the frame loop, not from timers
  ch.port1.onmessage = e => { if (e.data === 1) { spin(); return; } origRun(); const t = performance.now(); if (t - lastTr >= window.__traceEvery) { lastTr = t; window.__trace.push(window.__snap()); } };
  window.__tr = (arr) => (arr || window.__trace).map(s => [s.t, +(+s.fuel).toFixed(2), +(+(s.live||0)).toFixed(3), +(+(s.target||0)).toFixed(3), +(+(s.spawnGain||0)).toFixed(2), +(+(s.spendGain||0)).toFixed(2), +(+s.warm).toFixed(2), +(+s.mean).toFixed(2), +(+(s.expo||0)).toFixed(2), +(+(s.p95||0)).toFixed(2)]);
  window.__preset = n => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === n).click();
  window.__setSlider = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input')); };
  return 'rig v2 ok';
})()
