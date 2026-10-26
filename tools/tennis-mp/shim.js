// MessageChannel rAF for a hidden Browser pane (test rig only)
(function(){ if (window.__shim) return; window.__shim = true;
 const ch = new MessageChannel(); let q = []; let last = 0; window.__frames = 0;
 ch.port1.onmessage = () => { const t = performance.now(); if (t - last >= 16) { last = t; const c = q; q = []; for (const f of c) f(t); if (c.length) window.__frames++; } ch.port2.postMessage(0); };
 window.requestAnimationFrame = (f) => { q.push(f); return 1; };
 window.__wait = (ms) => new Promise(r => { const c2 = new MessageChannel(); const s = performance.now(); c2.port1.onmessage = () => { if (performance.now() - s > ms) r(); else c2.port2.postMessage(0); }; c2.port2.postMessage(0); });
 ch.port2.postMessage(0); })();
