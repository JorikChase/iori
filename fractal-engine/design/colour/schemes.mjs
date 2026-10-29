// Candidate colour schemes for the ramp presets (decided with iori 2026-10-29: test four families, then
// pick what ships and the ring's order). Each scheme is one ramp fed by one reading — what a preset
// sets on a ramp: { reading, stops, interp, space, map }. Stops are written in sRGB hex and kept in
// linear RGB, as core/shade.js wants. render-sheet.mjs draws each on five formulas.

const lin = (hex) => {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return v.map((c) => +(c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).toFixed(4));
};
const ramp = (hexes, ts = null) => hexes.map((h, i) => ({ t: ts ? ts[i] : i / (hexes.length - 1), c: [...lin(h), 1] }));
const map = (o = {}) => ({ scale: 1, offset: 0, mode: 'clamp', log: false, invert: false, ...o });

export const FAMILIES = [
  {
    id: 'terrace', title: 'one hue, value terraces',
    schemes: [
      // iori's key hue in six flat steps by the orbit trap: deep shadow to pale, terraced
      { id: 'abyss', reading: 'trap', stops: ramp(['#3a0c22', '#7a1d48', '#b33a72', '#d9679a', '#f0a8c8', '#fbe3ee']), interp: 'constant', space: 'oklab', map: map({ log: true, scale: 0.6, mode: 'mirror' }) },
      // amber, a terrace per few iterations (the iterations done before the orbit left)
      { id: 'amber', reading: 'depth', stops: ramp(['#3a1f06', '#7a4510', '#b0701e', '#d89a3e', '#f0c886', '#fff1d6']), interp: 'constant', space: 'oklab', map: map({ scale: 3.5, mode: 'mirror' }) },
      // one teal, smooth, a pale highlight on the trap's crests
      { id: 'hollow', reading: 'trap', stops: ramp(['#04181c', '#0b4450', '#17808c', '#4cbcc4', '#e0f8f4'], [0, 0.3, 0.6, 0.86, 1]), interp: 'ease', space: 'oklab', map: map({ log: true, scale: 0.45, mode: 'mirror' }) },
    ],
  },
  {
    id: 'film', title: 'iridescent / thin film',
    schemes: [
      // nacre: pale, the hue turning with the angle to the eye
      { id: 'nacre', reading: 'facing', stops: ramp(['#dcb4cf', '#a8cfdd', '#e2d3a2', '#b8ace2', '#dcb4cf']), interp: 'cardinal', space: 'oklab', map: map({ scale: 1.5, mode: 'repeat' }) },
      // oil on dark water: saturated bands where the surface turns away
      { id: 'oil', reading: 'facing', stops: ramp(['#241a52', '#2450a8', '#22a080', '#d8b032', '#a8387e', '#241a52']), interp: 'cardinal', space: 'oklab', map: map({ scale: 2, offset: 0.25, mode: 'repeat' }) },
      // a beetle's shell: green facing you, blue then violet at the rim
      { id: 'beetle', reading: 'facing', stops: ramp(['#4a2a90', '#3a58c0', '#2a98b8', '#1a8a58', '#0a3a1c']), interp: 'bspline', space: 'oklab', map: map() },
    ],
  },
  {
    id: 'mineral', title: 'mineral / natural',
    schemes: [
      { id: 'bone', reading: 'trap', stops: ramp(['#2a2620', '#8c8272', '#d9cfbc', '#f4efe4']), interp: 'ease', space: 'oklab', map: map({ log: true, scale: 0.15, offset: 0.6 }) },
      // strata: ochre, rust and cream laid in bands by the trap
      { id: 'sandstone', reading: 'trap', stops: ramp(['#5a2e1a', '#a4552c', '#d79a5a', '#edd4a8', '#b8703d', '#6b3a22']), interp: 'linear', space: 'oklab', map: map({ log: true, scale: 0.5, mode: 'mirror' }) },
      // agate-like rings of greens
      { id: 'malachite', reading: 'trap', stops: ramp(['#062218', '#0f5b3a', '#2e9466', '#8fd6ae', '#0f5b3a', '#062218']), interp: 'ease', space: 'oklab', map: map({ log: true, scale: 0.8, mode: 'repeat' }) },
      // black glass, a cold sheen only at grazing angles
      { id: 'obsidian', reading: 'facing', stops: ramp(['#c0bcd8', '#5a5672', '#24222e', '#100f14'], [0, 0.3, 0.6, 1]), interp: 'ease', space: 'oklab', map: map() },
    ],
  },
  {
    id: 'spectral', title: 'spectral by depth, toned down',
    schemes: [
      // dusk: indigo, teal, olive, ochre, rose, a step of hue per few iterations
      { id: 'dusk', reading: 'depth', stops: ramp(['#3a3f6a', '#3e7e8e', '#8a9f5a', '#d09a5a', '#c87a8a']), interp: 'linear', space: 'oklab', map: map({ scale: 3, mode: 'mirror' }) },
      // a muted full sweep, repeating along the trap
      { id: 'prism', reading: 'trap', stops: ramp(['#a87272', '#a8966a', '#7e9a72', '#6a92a0', '#7e72a8', '#a87272']), interp: 'linear', space: 'oklab', map: map({ log: true, scale: 0.35, mode: 'repeat' }) },
      // the trap swept once, slow and low in chroma: deep blue in the folds, warm on the crests
      { id: 'strata', reading: 'trap', stops: ramp(['#2a3070', '#2a6a72', '#7a8a48', '#b0784a', '#c08a9a']), interp: 'bspline', space: 'oklab', map: map({ log: true, scale: 0.22, offset: 0.7, mode: 'mirror' }) },
    ],
  },
];

// a scheme as a shading network: the reading → the ramp → the colour
export const schemeShade = (s) => ({
  nodes: [{ id: 'r', type: s.reading, in: {}, p: {} }, { id: 'ramp', type: 'ramp', in: { v: 'r' }, p: { stops: s.stops, interp: s.interp, space: s.space, map: s.map } }],
  out: { color: 'ramp' },
});
