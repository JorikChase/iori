// catalog.js — every organism is one line of data on one of the ten kernels (kernels.js).
// Row: [name, kernel, P[4], Q[4], ramp (4 hex stops, tone 0 → 1), category, inoculum radius mm, dish hint {nutrient, agar} | null]
// The dish hint is applied only when the organism is the first thing placed on a fresh dish.

const bs = (digits) => [...digits].reduce((m, d) => m | (1 << +d), 0);   // '23' -> bitmask, LifeWiki rulestrings

const R = {
  physarum: ['#4a3d0c', '#b8940f', '#f2c81a', '#fff06a'], fuligo: ['#5a5320', '#d8cf5a', '#f6f0a0', '#ffffe8'],
  badhamia: ['#4a2408', '#c46a12', '#f29a2a', '#ffd27a'], pale: ['#3c3a30', '#a09a80', '#d8d2b8', '#fbf8ea'],
  cream: ['#f1ead4', '#e2d8b8', '#cfc39c', '#b5a67c'], ecoli: ['#eee8d8', '#ddd5bf', '#c8bfa4', '#a99f84'],
  serratia: ['#f0b0a0', '#d8402c', '#a8140f', '#5c0606'], violet: ['#cdb4e8', '#7a3cc0', '#44148c', '#1e0648'],
  pyo: ['#d4ecd0', '#7cc8a4', '#2e9c8c', '#0e5c68'], luteus: ['#fff3a0', '#f4d83a', '#d8b010', '#9c7c08'],
  aureus: ['#fbe9b0', '#eec558', '#d29a20', '#94640c'], chalk: ['#f4f4f0', '#c8d4e4', '#6c8cc4', '#2c4488'],
  eden: ['#e8e4d8', '#c4bca8', '#9c9480', '#6c6454'], frost: ['#ffffff', '#d8ecfc', '#9cc4ec', '#5c8cc8'],
  rhizo: ['#1c1c14', '#5c6c14', '#b4c81c', '#e4f048'], xanth: ['#f8d848', '#f0a818', '#d87808', '#8c4404'],
  mangan: ['#4c4038', '#2c2420', '#140f0c', '#000000'],
  penic: ['#ffffff', '#e4f0ec', '#5ca89c', '#2c6c74'], niger: ['#ffffff', '#f0e8c8', '#5c4c2c', '#0c0806'],
  flavus: ['#ffffff', '#f0f0b0', '#a8b83c', '#5c6c14'], rhizopus: ['#ffffff', '#e8e8e8', '#9c9c9c', '#2c2c2c'],
  neuro: ['#fff4e0', '#fcc880', '#f08c2c', '#c45408'], tricho: ['#ffffff', '#d8ecc0', '#4c9c3c', '#1c5c1c'],
  mucor: ['#ffffff', '#ececec', '#b8b8b0', '#787870'], fusar: ['#ffffff', '#fcd8e4', '#d46c9c', '#7c2c6c'],
  botry: ['#f4f4f4', '#c8c4bc', '#8c8478', '#4c443c'], cord: ['#fff8e8', '#e0c890', '#8c5c24', '#2c1808'],
  dicty: ['#2c2c34', '#6c7c94', '#c4d8f0', '#ffffff'], polys: ['#241c34', '#6c4c9c', '#b894e4', '#f4e8ff'],
  bz: ['#c41c14', '#e0582c', '#6c8cd8', '#1c3cb4'],
  gs: ['#0c1c24', '#1c6c7c', '#5cd0c0', '#e8fff4'], coral: ['#2c0c14', '#b43c4c', '#f49c8c', '#fff0e4'],
  life: ['#1c3c1c', '#3ca43c', '#9cf07c', '#f0ffd8'], gen: ['#ffe890', '#f4a02c', '#c43c14', '#3c0c0c'],
  cyc: ['#e43c3c', '#e4c43c', '#3cc46c', '#3c6ce4'],
  fluor: ['#18e8f0', '#18e8f0', '#f4e418', '#f4e418'], rainbow: ['#f04848', '#f0d848', '#48d890', '#4878f0'],
  rhodo: ['#fcc0b0', '#f48c7c', '#e4604c', '#c43c2c'], candida: ['#fcfcf4', '#fcfcf4', '#a8a08c', '#a8a08c'],
  film: ['#e8e0c4', '#cfc49c', '#a8986c', '#6c5c3c'], rugose: ['#f0ecd8', '#d8d0b0', '#a09470', '#5c5034'],
  fluo: ['#e4f0d0', '#b8d890', '#7cac4c', '#3c6c1c'], smeg: ['#fcf4d8', '#ecd898', '#c4a454', '#84641c'],
  mucoid: ['#f8f4ec', '#ece4d4', '#dcd0bc', '#c4b8a0'],
};

const L = (name, B, S, C, cat) => [name, 7, [bs(B), bs(S), C, 4], [0.006, 0, 0, 0], C > 2 ? R.gen : R.life, cat, 3, { nutrient: 1.0, agar: 0.5 }];

export const CATALOG = [
  // ---- slime molds: agents + trail. P = (sensor angle, turn angle, sensor mm, speed), Q = (deposit, persistence, food pull, sheath avoid)
  ['Physarum polycephalum — forager', 1, [22.5, 45, 0.42, 1], [0.5, 0.9, 5, 0.3], R.physarum, 'slime molds', 2, { nutrient: 0.35, agar: 0.5 }],
  // P2: the same forager, with Tero flux adaptation on its extracted vein graph fed back into sensing
  // and trail persistence (tero.js, graphworker.js). The ninth field is the adaptation genome.
  ['Physarum polycephalum — adaptive network', 1, [22.5, 45, 0.42, 1], [0.5, 0.9, 5, 0.3], R.physarum, 'slime molds', 2, { nutrient: 0.35, agar: 0.5 },
    { every: 300, betaD: 4, mu: 1.8, Qh: 0.5, iters: 48, dt: 0.05 }],   // dt x iters = 2.4 relaxation times: remembers many pairs
  ['Physarum polycephalum — starved network', 1, [60, 60, 0.42, 1], [0.5, 0.92, 9, 0.2], R.physarum, 'slime molds', 2, { nutrient: 0.12, agar: 0.5 }],
  ['Physarum polycephalum — rich sheet', 1, [45, 45, 0.2, 1], [0.8, 0.85, 2, 0.1], R.physarum, 'slime molds', 2, { nutrient: 0.9, agar: 0.5 }],
  ['Physarum polycephalum — islands', 1, [90, 45, 0.33, 1], [0.5, 0.9, 4, 0.2], R.physarum, 'slime molds', 2, { nutrient: 0.35, agar: 0.5 }],
  ['Fuligo septica', 1, [35, 25, 0.25, 0.8], [1.0, 0.88, 3, 0.1], R.fuligo, 'slime molds', 2.5, { nutrient: 0.6, agar: 0.5 }],
  ['Badhamia utricularis', 1, [30, 50, 0.6, 1.2], [0.5, 0.91, 6, 0.4], R.badhamia, 'slime molds', 2, { nutrient: 0.3, agar: 0.5 }],
  ['Physarum rigidum', 1, [18, 35, 0.7, 1.3], [0.4, 0.93, 6, 0.5], R.physarum, 'slime molds', 2, { nutrient: 0.25, agar: 0.5 }],
  ['Didymium iridis', 1, [28, 40, 0.3, 0.9], [0.45, 0.89, 4, 0.3], R.pale, 'slime molds', 1.5, { nutrient: 0.4, agar: 0.5 }],

  // ---- bacteria: P = (motility, growth, sporulation, noise), Q = (ring period, ring duty, yield). The morphology diagram is the dish: nutrient x agar.
  ['Bacillus subtilis — DLA-like', 2, [2.4, 1.0, 0.03, 0.9], [0, 0.5, 1.2, 0], R.cream, 'bacteria', 0.6, { nutrient: 0.3, agar: 0.85 }],
  ['Bacillus subtilis — Eden-like', 2, [0.7, 0.6, 0.0, 0.6], [0, 0.5, 1, 0], R.cream, 'bacteria', 0.6, { nutrient: 1.0, agar: 0.85 }],
  ['Bacillus subtilis — dense branching', 2, [2.2, 1.0, 0.015, 0.7], [0, 0.5, 1.2, 0], R.cream, 'bacteria', 0.6, { nutrient: 0.3, agar: 0.3 }],
  ['Bacillus subtilis — concentric rings', 2, [1.4, 0.3, 0.0, 0.3], [420, 0.35, 1, 0], R.cream, 'bacteria', 0.6, { nutrient: 1.0, agar: 0.55 }],
  ['Bacillus subtilis — homogeneous disk', 2, [1.0, 0.3, 0.0, 0.1], [0, 0.5, 1, 0], R.cream, 'bacteria', 0.6, { nutrient: 1.0, agar: 0.15 }],
  ['Escherichia coli K-12', 2, [0.7, 0.36, 0.0, 0.25], [0, 0.5, 1, 0], R.ecoli, 'bacteria', 0.5, { nutrient: 0.9, agar: 0.6 }],
  ['Serratia marcescens', 2, [1.0, 0.34, 0.0, 0.3], [0, 0.5, 1, 0], R.serratia, 'bacteria', 0.5, { nutrient: 0.9, agar: 0.5 }],
  ['Chromobacterium violaceum', 2, [0.6, 0.3, 0.0, 0.3], [0, 0.5, 1, 0], R.violet, 'bacteria', 0.5, { nutrient: 0.9, agar: 0.6 }],
  ['Pseudomonas aeruginosa', 2, [2.0, 0.34, 0.0, 0.45], [0, 0.5, 1, 0], R.pyo, 'bacteria', 0.5, { nutrient: 0.8, agar: 0.3 }],
  ['Micrococcus luteus', 2, [0.12, 0.2, 0.0, 0.2], [0, 0.5, 0.8, 0], R.luteus, 'bacteria', 0.4, { nutrient: 0.9, agar: 0.7 }],
  ['Staphylococcus aureus', 2, [0.1, 0.26, 0.0, 0.15], [0, 0.5, 0.8, 0], R.aureus, 'bacteria', 0.4, { nutrient: 1.0, agar: 0.7 }],
  ['Streptomyces coelicolor', 2, [0.1, 0.16, 0.1, 0.5], [0, 0.5, 1, 0], R.chalk, 'bacteria', 0.4, { nutrient: 0.7, agar: 0.75 }],
  ['Paenibacillus dendritiformis — tip splitting', 2, [1.9, 1.0, 0.03, 0.95], [0, 0.5, 1.3, 0], R.cream, 'swarmers', 0.6, { nutrient: 0.28, agar: 0.45 }],
  ['Paenibacillus vortex', 2, [2.6, 0.9, 0.02, 1.0], [0, 0.5, 1.3, 0], R.ecoli, 'swarmers', 0.6, { nutrient: 0.3, agar: 0.35 }],
  ['Proteus mirabilis — swarm rings', 2, [1.6, 0.32, 0.0, 0.2], [360, 0.3, 1, 0], R.ecoli, 'swarmers', 0.6, { nutrient: 1.0, agar: 0.4 }],

  // ---- aggregation on the nutrient field: P = (eta, stick, absorb, compactness)
  ['Eden cluster', 3, [0, 0.02, 0.05, 3], [0, 0, 0, 0], R.eden, 'lichens and minerals', 0.3, { nutrient: 1.0, agar: 0.5 }],
  ['Diffusion-limited dendrite', 3, [1, 0.02, 1.0, 0], [0, 0, 0, 0], R.frost, 'lichens and minerals', 0.3, { nutrient: 0.6, agar: 0.5 }],
  ['Dense branching aggregate', 3, [0.5, 0.03, 1.0, 0.4], [0, 0, 0, 0], R.eden, 'lichens and minerals', 0.3, { nutrient: 0.7, agar: 0.5 }],
  ['Needle frost', 3, [2.2, 0.06, 1.0, 0], [0, 0, 0, 0], R.frost, 'lichens and minerals', 0.3, { nutrient: 0.7, agar: 0.5 }],
  ['Rhizocarpon geographicum — map lichen', 3, [0.7, 0.05, 0.3, 1.0], [0, 0, 0, 0], R.rhizo, 'lichens and minerals', 0.4, { nutrient: 0.8, agar: 0.5 }],
  ['Xanthoria parietina', 3, [0.4, 0.08, 0.25, 1.4], [0, 0, 0, 0], R.xanth, 'lichens and minerals', 0.5, { nutrient: 0.8, agar: 0.5 }],
  ['Manganese dendrite', 3, [1.5, 0.03, 1.0, 0], [0, 0, 0, 0], R.mangan, 'lichens and minerals', 0.2, { nutrient: 0.5, agar: 0.5 }],

  // ---- molds: P = (branching, wobble, tip speed, branch angle), Q = (feeding, crowd cap, lateral branching)
  ['Penicillium chrysogenum', 4, [0.12, 0.525, 0.225, 0.9], [0.01, 6, 0.005, 0], R.penic, 'molds', 0.8, { nutrient: 0.9, agar: 0.5 }],
  ['Aspergillus niger', 4, [0.15, 0.45, 0.203, 0.8], [0.012, 6, 0.005, 0], R.niger, 'molds', 0.8, { nutrient: 0.9, agar: 0.5 }],
  ['Aspergillus flavus', 4, [0.14, 0.48, 0.225, 0.85], [0.012, 6, 0.005, 0], R.flavus, 'molds', 0.8, { nutrient: 0.9, agar: 0.5 }],
  ['Rhizopus stolonifer', 4, [0.04, 0.225, 0.45, 1], [0.004, 5, 0.00125, 0], R.rhizopus, 'molds', 0.8, { nutrient: 0.9, agar: 0.5 }],
  ['Neurospora crassa', 4, [0.08, 0.375, 0.405, 0.7], [0.006, 6, 0.0025, 0], R.neuro, 'molds', 0.8, { nutrient: 0.9, agar: 0.5 }],
  ['Trichoderma viride', 4, [0.16, 0.6, 0.27, 0.9], [0.012, 7, 0.0075, 0], R.tricho, 'molds', 0.8, { nutrient: 0.9, agar: 0.5 }],
  ['Mucor mucedo', 4, [0.06, 0.45, 0.36, 1.1], [0.006, 5, 0.0025, 0], R.mucor, 'molds', 0.8, { nutrient: 0.9, agar: 0.5 }],
  ['Fusarium oxysporum', 4, [0.11, 0.45, 0.248, 0.8], [0.01, 6, 0.005, 0], R.fusar, 'molds', 0.8, { nutrient: 0.9, agar: 0.5 }],
  ['Botrytis cinerea', 4, [0.1, 0.675, 0.225, 1], [0.01, 6, 0.005, 0], R.botry, 'molds', 0.8, { nutrient: 0.9, agar: 0.5 }],
  ['Armillaria — rhizomorph cords', 4, [0.02, 0.12, 0.315, 0.5], [0.003, 4, 0.0005, 0], R.cord, 'molds', 0.8, { nutrient: 0.6, agar: 0.5 }],
  ['Pleurotus ostreatus', 4, [0.2, 0.6, 0.18, 1], [0.014, 7, 0.01, 0], R.mucor, 'molds', 0.8, { nutrient: 0.9, agar: 0.5 }],

  // ---- social amoebae and excitable media: P = (a, b, epsilon, D), Q = (lawn spread, pacemakers)
  ['Dictyostelium discoideum — spirals', 5, [0.75, 0.06, 0.05, 1], [0.07, 0.00002, 0, 0], R.dicty, 'social amoebae', 4, { nutrient: 0.8, agar: 0.5 }],
  ['Dictyostelium discoideum — target waves', 5, [0.75, 0.08, 0.05, 1], [0.07, 0.0002, 0, 0], R.dicty, 'social amoebae', 4, { nutrient: 0.8, agar: 0.5 }],
  ['Polysphondylium violaceum', 5, [0.9, 0.05, 0.06, 0.8], [0.06, 0.00005, 0, 0], R.polys, 'social amoebae', 4, { nutrient: 0.8, agar: 0.5 }],
  ['Belousov–Zhabotinsky dish', 5, [0.6, 0.02, 0.04, 1], [0.2, 0.00003, 0, 0], R.bz, 'social amoebae', 5, { nutrient: 1.0, agar: 0.5 }],

  // ---- reaction-diffusion (Gray-Scott F/k per xmorphia)
  ['GS Mitosis', 6, [0.0367, 0.0649, 0, 0], [0, 0, 0, 0], R.gs, 'reaction-diffusion', 1.5, { nutrient: 1.0, agar: 0.5 }],
  ['GS Coral', 6, [0.0545, 0.062, 0, 0], [0, 0, 0, 0], R.coral, 'reaction-diffusion', 1.5, { nutrient: 1.0, agar: 0.5 }],
  ['GS Solitons', 6, [0.03, 0.062, 0, 0], [0, 0, 0, 0], R.gs, 'reaction-diffusion', 1.5, { nutrient: 1.0, agar: 0.5 }],
  ['GS Worms', 6, [0.078, 0.061, 0, 0], [0, 0, 0, 0], R.coral, 'reaction-diffusion', 1.5, { nutrient: 1.0, agar: 0.5 }],
  ['GS Waves', 6, [0.014, 0.054, 0, 0], [0, 0, 0, 0], R.gs, 'reaction-diffusion', 1.5, { nutrient: 1.0, agar: 0.5 }],
  ['GS Fingerprint', 6, [0.037, 0.06, 0, 0], [0, 0, 0, 0], R.gs, 'reaction-diffusion', 1.5, { nutrient: 1.0, agar: 0.5 }],

  // ---- synthetic cultures, the flame-strains automata grown on agar (B/S/C, LifeWiki rulestrings)
  L('Conway Life', '3', '23', 2, 'life-like'), L('HighLife', '36', '23', 2, 'life-like'), L('Seeds', '2', '', 2, 'life-like'),
  L('Day & Night', '3678', '34678', 2, 'life-like'), L('Maze', '3', '12345', 2, 'life-like'), L('Mazectric', '3', '1234', 2, 'life-like'),
  L('Coral', '3', '45678', 2, 'life-like'), L('Diamoeba', '35678', '5678', 2, 'life-like'), L('Vote', '5678', '45678', 2, 'life-like'),
  L('Gnarl', '1', '1', 2, 'life-like'), L('Morley', '368', '245', 2, 'life-like'), L('Replicator', '1357', '1357', 2, 'life-like'),
  L('Life w/o Death', '3', '012345678', 2, 'life-like'), L('2x2', '36', '125', 2, 'life-like'), L('Walled Cities', '45678', '2345', 2, 'life-like'),
  L('Anneal', '4678', '35678', 2, 'life-like'),
  L("Brian's Brain", '2', '', 3, 'generations'), L('Star Wars', '2', '345', 4, 'generations'), L('Fireworks', '13', '2', 21, 'generations'),
  L('Lava', '45678', '12345', 8, 'generations'), L('Prairie on Fire', '34', '345', 6, 'generations'), L('Spirals', '234', '2', 5, 'generations'),
  L('Faders', '2', '2', 25, 'generations'), L('BelZhab', '23', '23', 8, 'generations'), L('Meteor Guns', '3', '01245678', 8, 'generations'),
  L('Transers', '26', '345', 5, 'generations'), L('Swirl', '34', '23', 8, 'generations'), L('Nova', '2478', '45678', 25, 'generations'),

  // ---- cyclic: P = (states, threshold, spread, period)
  ['Cyclic 14', 8, [14, 1, 0.04, 3], [0, 0, 0, 0], R.rainbow, 'cyclic', 3, { nutrient: 1.0, agar: 0.5 }],
  ['Colicin rock-paper-scissors (E. coli)', 8, [3, 3, 0.03, 3], [0, 0, 0, 0], R.cyc, 'cyclic', 3, { nutrient: 1.0, agar: 0.5 }],
  ['Droplets', 8, [8, 2, 0.04, 3], [0, 0, 0, 0], R.rainbow, 'cyclic', 3, { nutrient: 1.0, agar: 0.5 }],
  ['Turbulence', 8, [6, 2, 0.04, 3], [0, 0, 0, 0], R.cyc, 'cyclic', 3, { nutrient: 1.0, agar: 0.5 }],

  // ---- yeasts and drift sectors: P = (growth, mutation, lineages, roughness)
  ['Escherichia coli CFP/YFP — drift sectors', 9, [0.09, 0, 2, 0.7], [0, 0, 0, 0], R.fluor, 'yeasts and sectors', 0.8, { nutrient: 1.0, agar: 0.6 }],
  ['Saccharomyces cerevisiae — sectored', 9, [0.07, 0.0006, 3, 0.4], [0, 0, 0, 0], R.candida, 'yeasts and sectors', 0.7, { nutrient: 1.0, agar: 0.6 }],
  ['Rainbow drift', 9, [0.09, 0, 12, 0.6], [0, 0, 0, 0], R.rainbow, 'yeasts and sectors', 0.9, { nutrient: 1.0, agar: 0.6 }],
  ['Rhodotorula mucilaginosa', 9, [0.07, 0.001, 3, 0.3], [0, 0, 0, 0], R.rhodo, 'yeasts and sectors', 0.6, { nutrient: 1.0, agar: 0.6 }],
  ['Candida albicans — white-opaque switching', 9, [0.07, 0.004, 2, 0.35], [0, 0, 0, 0], R.candida, 'yeasts and sectors', 0.6, { nutrient: 1.0, agar: 0.6 }],

  // ---- biofilms: P = (growth, max height, active layer, wrinkle onset), Q = (spread, yield, wrinkle F, wrinkle k)
  ['Bacillus subtilis NCIB 3610 — wrinkled biofilm', 10, [0.16, 2.5, 0.5, 0.65], [0.7, 1, 0.044, 0.062], R.film, 'biofilms', 0.8, { nutrient: 1.0, agar: 0.6 }],
  ['Vibrio cholerae — rugose', 10, [0.18, 2.0, 0.4, 0.7], [0.6, 1, 0.046, 0.063], R.rugose, 'biofilms', 0.8, { nutrient: 1.0, agar: 0.6 }],
  ['Pseudomonas fluorescens — wrinkly spreader', 10, [0.2, 1.5, 0.5, 0.6], [1.2, 1, 0.039, 0.058], R.fluo, 'biofilms', 0.8, { nutrient: 1.0, agar: 0.4 }],
  ['Mycobacterium smegmatis — cording', 10, [0.14, 3.0, 0.6, 0.5], [0.45, 1, 0.05, 0.063], R.smeg, 'biofilms', 0.8, { nutrient: 1.0, agar: 0.7 }],
  ['Klebsiella pneumoniae — mucoid', 10, [0.2, 1.2, 0.6, 9], [1.6, 1, 0, 0], R.mucoid, 'biofilms', 0.8, { nutrient: 1.0, agar: 0.4 }],
].map(([name, kernel, P, Q, ramp, category, radius, dish, adapt = null]) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name, kernel, P, Q, ramp, category, radius, dish, adapt,
}));

export const CATEGORIES = [...new Set(CATALOG.map((o) => o.category))];
export const byId = (id) => CATALOG.find((o) => o.id === id);
export const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
