// stretch-worker.js — runs stretch.js wsola off the main thread (D42): playback and the export mix ask for a stretched
// piece and keep drawing while it is made. The same function as on the main thread, so the bytes are the same.
import { wsola } from './stretch.js';
self.onmessage = (e) => {
  const { id, channels, outLen, opts } = e.data;
  try { const out = wsola(channels, outLen, opts); self.postMessage({ id, out }, out.map((c) => c.buffer)); }
  catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
};
