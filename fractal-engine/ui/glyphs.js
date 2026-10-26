// One glyph per op, drawn in a 24×24 box with hairlines only. They stand in for words: the UI has no
// labels anywhere. Ids match `glyph` in core/ops.js.

export const GLYPHS = {
  translate: 'M3 12h16M15 8l4 4-4 4',
  c: 'M12 4v5M12 15v5M4 12h5M15 12h5M12 11.2a.8.8 0 1 0 .01 0',
  scale: 'M2 2h20v20H2zM8 8h8v8H8z',
  rotate: 'M5 15a8 8 0 1 1 3 4M8 19l0-5-5 0',
  // the 4-D ones carry a second, inner figure: the fourth axis the 3-D glyph cannot show
  rotate4: 'M5 15a8 8 0 1 1 3 4M8 19l0-5-5 0M10 10h4v4h-4z',
  plane: 'M3 17L12 4l9 4-9 13z',
  box: 'M2 2h20v20H2zM2 12h20',
  sphere: 'M12 2a10 10 0 1 0 .01 0M12 8a4 4 0 1 0 .01 0',
  abs: 'M4 4l8 16 8-16',
  sort: 'M4 6h16M4 12h11M4 18h6',
  sort4: 'M4 5h16M4 10h12M4 15h8M4 20h4',
  bulb: 'M12 6a6 6 0 1 0 .01 0M12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  bulb4: 'M12 6a6 6 0 1 0 .01 0M12 9a3 3 0 1 0 .01 0M12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  quat: 'M12 4a8 8 0 1 0 .01 0M12 4v16M5.1 8l13.8 8M18.9 8L5.1 16',
  // the chimera: two species overlapping, the field's wall through their lens
  mix: 'M9 12a6 6 0 1 0 .01 0M15 12a6 6 0 1 0 .01 0M12 4v16',
  // the fields: the two species, and what weighs them
  'mix.axis': 'M9 12a5 5 0 1 0 .01 0M15 12a5 5 0 1 0 .01 0M2 21L22 3',
  'mix.sphere': 'M9 12a4 4 0 1 0 .01 0M15 12a4 4 0 1 0 .01 0M12 1a11 11 0 1 0 .01 0',
  'mix.noise': 'M9 9a5 5 0 1 0 .01 0M15 9a5 5 0 1 0 .01 0M2 20c2-3 3-3 5 0s3 3 5 0 3-3 5 0 3 3 5 0',
  'mix.tissue': 'M2 7l6 2 1 7-6 4M8 9l6-6M9 16l7 1 4-6-6-8M16 17l2 6M20 11l3-1',
  'mix.trap': 'M9 12a5 5 0 1 0 .01 0M15 12a5 5 0 1 0 .01 0M12 11.2a.8.8 0 1 0 .01 0M12 3v4M12 17v4',
  'mix.depth': 'M9 8a5 5 0 1 0 .01 0M15 8a5 5 0 1 0 .01 0M4 17h16M7 20h10M10 23h4',
  'mix.lyap': 'M9 12a5 5 0 1 0 .01 0M15 12a5 5 0 1 0 .01 0M1 12h3M20 12h3M12 1v3M12 20v3',
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
  const d = GLYPHS[id] || (id === 'plus' ? PLUS_GLYPH : GLYPHS.c);
  const s = size / 24;
  return `<path d="${d}" transform="translate(${x - size / 2} ${y - size / 2}) scale(${s})" vector-effect="non-scaling-stroke"/>`;
}

// the graph's own: another species (a plus)
export const PLUS_GLYPH = 'M12 5v14M5 12h14';

// export glyphs (the structure layer): a still, a film, splats, a mesh
export const EXPORT_GLYPHS = {
  still: 'M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6',
  video: 'M2 5h20v14H2zM5 5v14M19 5v14M2 9h3M2 15h3M19 9h3M19 15h3M10 9l5 3-5 3z',
  splats: 'M7 8a2.5 2.5 0 1 0 .01 0M16 6a1.5 1.5 0 1 0 .01 0M15 15a3.5 2 30 1 0 .01 0M7 17a1.5 1.5 0 1 0 .01 0M12 11a1 1 0 1 0 .01 0',
  mesh: 'M12 2l9 5v10l-9 5-9-5V7zM12 12l9-5M12 12v10M12 12L3 7',
};
