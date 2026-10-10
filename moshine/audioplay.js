// audioplay.js — playback of the sequence's sound (spec §9) through WebAudio. Half-second blocks from mix.js are queued
// back to back at exact AudioContext times, a second ahead. The picture drives: the editor compares the frame it shows
// with expectedFrame() and restarts the sound there when they drift apart (a mosh may render slower than real time).
import { mixBlock } from './mix.js';

export function createAudioPlayer({ project, seq, decode, block = 0.5, ahead = 1.0, onError = (e) => console.warn('moshine: audio', e) }) {
  let ctx = null, out = null, gen = 0, sources = [], timer = null, state = null;
  const cache = new Map();
  const ensure = async () => {
    if (!ctx) { ctx = new AudioContext({ latencyHint: 'interactive' }); out = ctx.createGain(); out.connect(ctx.destination); }
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
    return ctx;
  };
  async function pump(g) {
    if (!state || g !== gen) return;
    const s = seq(), sr = ctx.sampleRate, B = Math.round(block * sr);
    while (state && g === gen && state.at < ctx.currentTime + ahead) {
      const s0 = state.next, when = state.at; state.next += B; state.at += B / sr;
      let chans;
      try { chans = await mixBlock({ project: project(), seq: s, s0, s1: s0 + B, sr, nch: 2, decode, cache }); } catch (e) { onError(e); return; }
      if (g !== gen) return;
      const buf = ctx.createBuffer(2, B, sr); chans.forEach((c, i) => buf.copyToChannel(c, i));
      const src = ctx.createBufferSource(); src.buffer = buf; src.connect(out); src.start(Math.max(when, ctx.currentTime));
      sources.push(src); src.onended = () => { sources = sources.filter((x) => x !== src); };
    }
  }
  const stopAll = () => { gen++; for (const x of sources) { try { x.stop(); } catch (e) {} } sources = []; clearInterval(timer); timer = null; state = null; };
  return {
    get playing() { return !!state; },
    /** Create and resume the context inside a user gesture (Safari only lets audio start there). */
    prime() { if (!ctx) { ctx = new AudioContext({ latencyHint: 'interactive' }); out = ctx.createGain(); out.connect(ctx.destination); } if (ctx.state !== 'running') ctx.resume().catch(() => {}); },
    get context() { return ctx; },
    /** Start the sound at sequence frame f. */
    async start(f) {
      stopAll(); const g = gen; await ensure(); if (g !== gen) return;
      // the sound begins `lead` seconds from now, by when the picture has moved on: start the sound at that frame
      const s = seq(), fps = s.timebase.num / s.timebase.den, sr = ctx.sampleRate, lead = 0.08, t0 = ctx.currentTime + lead, f0 = f + lead * fps;
      state = { frame: f0, fps, t0, next: Math.round((f0 * sr) / fps), at: t0 };
      timer = setInterval(() => pump(g), 100); pump(g);
    },
    stop: stopAll,
    /** The sequence frame the sound is at now (null when stopped). */
    expectedFrame() { return state && ctx ? state.frame + (ctx.currentTime - state.t0) * state.fps : null; },
    setVolume(v) { if (out) out.gain.value = v; },
    clearCache() { cache.clear(); },
    close() { stopAll(); ctx?.close(); ctx = null; },
  };
}
