// audio.js — the audio clip's time map (spec §9): a clip may carry stretch segments { at, len, span } in clip-local
// sequence frames, written by Bloom Insert: the source frames [at, at + span) play over span + len frames, so the sound
// slows to fill the held picture and is back in sync after it. Pure functions, shared by the clock (audio features),
// playback and the export mix.

/** Segments sorted by `at`. */
export const segmentsOf = (clip) => [...(clip.stretch || [])].sort((a, b) => a.at - b.at);

/** Source position (in sequence frames from the media start, may be fractional) heard at clip-local frame `local`. */
export function audioSourceAt(clip, local) {
  let inserted = 0;
  for (const s of segmentsOf(clip)) {
    if (local < s.at) break;
    if (local < s.at + s.span + s.len) return clip.sourceIn + s.at - inserted + ((local - s.at) * s.span) / (s.span + s.len);
    inserted += s.len;
  }
  return clip.sourceIn + local - inserted;
}

/** The pieces of a clip's output from clip-local frame a to b: [{ from, to, src0, src1 }] with a constant rate inside
 *  each (src* in source sequence frames). Playback and the export mix render each piece, stretching where needed. */
export function audioPieces(clip, a = 0, b = clip.range.out - clip.range.in) {
  const cuts = new Set([a, b]);
  for (const s of segmentsOf(clip)) for (const c of [s.at, s.at + s.span + s.len]) if (c > a && c < b) cuts.add(c);
  const xs = [...cuts].sort((x, y) => x - y), out = [];
  for (let i = 0; i + 1 < xs.length; i++) out.push({ from: xs[i], to: xs[i + 1], src0: audioSourceAt(clip, xs[i]), src1: audioSourceAt(clip, xs[i + 1] - 1e-9) });
  return out;
}

/** True when clip-local frame d falls strictly inside a stretched span (a cut there would need a fractional sourceIn). */
export const insideStretch = (clip, d) => segmentsOf(clip).some((s) => d > s.at && d < s.at + s.span + s.len);

/** The part of an audio clip from clip-local frame d on: { sourceIn, stretch } (segments before d folded into sourceIn). */
export function audioCut(clip, d) {
  let inserted = 0; const keep = [];
  for (const s of segmentsOf(clip)) {
    if (s.at + s.span + s.len <= d) inserted += s.len;
    else keep.push({ ...s, at: s.at - d });
  }
  return { sourceIn: clip.sourceIn + d - inserted, stretch: keep };
}
