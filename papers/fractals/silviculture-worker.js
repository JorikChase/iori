/*
 * silviculture-worker.js — grows the reference individuals of every species (buildRefs in silviculture-focus.js)
 * off the main thread, in parallel with the terrain worker. Message in: { type: 'refs' }; out: { type: 'progress',
 * key } and { type: 'refs', refs } (structured clone; module prototypes are shared objects and stay shared).
 */
import { buildRefs } from './silviculture-focus.js';

self.onmessage = (ev) => {
  if (!ev.data || ev.data.type !== 'refs') return;
  try {
    const it = buildRefs(); let r = it.next(), last = '';
    while (!r.done) { if (r.value !== last) { last = r.value; self.postMessage({ type: 'progress', key: last }); } r = it.next(); }
    self.postMessage({ type: 'refs', refs: r.value });
  } catch (e) { self.postMessage({ type: 'error', error: String((e && e.stack) || e) }); }
};
