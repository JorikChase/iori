// One glyph per op, drawn in a 24×24 box with hairlines only. They stand in for words: the UI has no
// labels anywhere. Ids match `glyph` in core/ops.js.

export const GLYPHS = {
  translate: 'M3 12h16M15 8l4 4-4 4',
  c: 'M12 4v5M12 15v5M4 12h5M15 12h5M12 11.2a.8.8 0 1 0 .01 0',
  scale: 'M2 2h20v20H2zM8 8h8v8H8z',
  rotate: 'M5 15a8 8 0 1 1 3 4M8 19l0-5-5 0',
  plane: 'M3 17L12 4l9 4-9 13z',
  box: 'M2 2h20v20H2zM2 12h20',
  sphere: 'M12 2a10 10 0 1 0 .01 0M12 8a4 4 0 1 0 .01 0',
  abs: 'M4 4l8 16 8-16',
  sort: 'M4 6h16M4 12h11M4 18h6',
  bulb: 'M12 6a6 6 0 1 0 .01 0M12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  power: 'M12 12a2 2 0 1 1 2 2 5 5 0 1 1-5-5 8 8 0 1 1-6 7',
  invert: 'M12 3a9 9 0 1 0 .01 0M12 11a1 1 0 1 0 .01 0M5 19L19 5',
  twist: 'M6 3c12 3 0 15 12 18M18 3C6 6 18 18 6 21',
  spherical: 'M12 4a8 8 0 1 0 .01 0M4 12h16',
  swirl: 'M12 12m-1 0a1 1 0 1 1 2 0 3 3 0 1 1-6 0 6 6 0 1 1 12 0 9 9 0 1 1-18 0',
  sin: 'M2 12c3-8 6-8 10 0s7 8 10 0',
  horseshoe: 'M5 4v8a7 7 0 0 0 14 0V4',
  polar: 'M12 20L4 6M12 20L12 4M12 20L20 6M6 9a8 8 0 0 1 12 0',
};

export function glyphPath(id, x, y, size = 24) {
  const d = GLYPHS[id] || GLYPHS.c;
  const s = size / 24;
  return `<path d="${d}" transform="translate(${x - size / 2} ${y - size / 2}) scale(${s})" vector-effect="non-scaling-stroke"/>`;
}
