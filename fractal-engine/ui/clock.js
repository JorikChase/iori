// The drivers' clock (DESIGN.md "Finishing touches"): a hairline row at the top centre, shown only while the
// formula on screen reads the clock. Play/pause, the tape (drag it to scrub: the ticks are seconds and slide
// under a fixed centre mark), the speed (tap: the next of RATES, Shift or a second finger: the one before).
// Drawn as the toggle row is: dim hairlines with a dark halo, brighter while held. Hit areas are their own
// transparent rects, finger-sized on touch (44 px), the drawing the same on every device.

import { RATES } from '../core/state.js';
export { RATES };
export const TAPE_PX_PER_S = 24;   // the tape's scale: a drag of this many pixels moves the clock one second

const f1 = (v) => v.toFixed(1);
const PLAY = 'M8 5v14l11-7z';
const PAUSE = 'M8 5v14M16 5v14';

// W: the view's width; top: below the safe area; touch: finger-sized hits
export function clockLayout(W, top = 0, touch = false) {
  const S = touch ? 44 : 30, tape = Math.min(160, Math.max(90, W * 0.3));
  const y = top + (touch ? 30 : 22), w = S + tape + S, x0 = W / 2 - w / 2;
  return { y, S, play: { x: x0 + S / 2 }, tape: { x0: x0 + S, x1: x0 + S + tape }, speed: { x: x0 + S + tape + S / 2 } };
}

const rateText = (r) => (r === 0.25 ? '×¼' : r === 0.5 ? '×½' : `×${r}`);

// c: { t (seconds), rate, playing, hot ('play' | 'tape' | 'speed' | null) }, L: clockLayout
export function drawClock(svg, c, L) {
  if (!c) { svg.innerHTML = ''; return; }
  const s = [], y = L.y, g = 18, k = g / 24;
  const glyph = (d, x, cls) => {
    const a = `d="${d}" transform="translate(${f1(x - g / 2)} ${f1(y - g / 2)}) scale(${k.toFixed(3)})" vector-effect="non-scaling-stroke"`;
    return `<g class="ck${cls}"><path class="halo" ${a}/><path ${a}/></g>`;
  };
  s.push(glyph(c.playing ? PAUSE : PLAY, L.play.x, c.hot === 'play' ? ' on' : ''));
  // the tape: a hairline, a tick every second (taller every five) sliding under the centre mark
  const { x0, x1 } = L.tape, mid = (x0 + x1) / 2;
  let d = `M${f1(x0)} ${f1(y)}H${f1(x1)}`;
  const first = Math.ceil(c.t - (mid - x0) / TAPE_PX_PER_S), last = Math.floor(c.t + (x1 - mid) / TAPE_PX_PER_S);
  for (let n = first; n <= last; n++) {
    const x = mid + (n - c.t) * TAPE_PX_PER_S, h = n % 5 === 0 ? 5 : 2.5;
    d += `M${f1(x)} ${f1(y - h)}V${f1(y)}`;
  }
  d += `M${f1(mid)} ${f1(y - 8)}V${f1(y + 8)}`;
  s.push(`<g class="ck tape${c.hot === 'tape' ? ' on' : ''}"><path class="halo" d="${d}"/><path d="${d}"/>`
    + `<text x="${f1(mid)}" y="${f1(y + 20)}">${c.t.toFixed(1)} s</text></g>`);
  s.push(`<g class="ck${c.hot === 'speed' ? ' on' : ''}"><text class="rate" x="${f1(L.speed.x)}" y="${f1(y + 4)}">${rateText(c.rate)}</text></g>`);
  // the hits, as large as the layout says, over the drawing
  const hit = (k2, x, w, label) => `<rect class="hit" data-clock="${k2}" role="button" aria-label="${label}" x="${f1(x - w / 2)}" y="${f1(y - L.S / 2)}" width="${f1(w)}" height="${L.S}"/>`;
  s.push(hit('play', L.play.x, L.S, c.playing ? 'pause the clock' : 'play the clock'));
  s.push(hit('tape', mid, x1 - x0, 'scrub the clock'));
  s.push(hit('speed', L.speed.x, L.S, 'clock speed'));
  svg.innerHTML = s.join('');
}
