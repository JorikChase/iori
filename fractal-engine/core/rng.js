// Deterministic random numbers. sfc32, seeded from one integer, so that seed + formula → the same
// samples on every machine (the content-addressed gallery depends on it).

export function makeRng(seed = 0) {
  let a = 0x9e3779b9, b = 0x243f6a88, c = 0xb7e15162, d = (seed | 0) ^ 0xdeadbeef;
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  const rng = {
    seed,
    float: next,
    // integer in [0, n)
    pick: (n) => Math.floor(next() * n),
    // uniform in [lo, hi)
    range: (lo, hi) => lo + (hi - lo) * next(),
    // uniform point in the unit ball
    ball: () => {
      for (;;) {
        const x = next() * 2 - 1, y = next() * 2 - 1, z = next() * 2 - 1;
        if (x * x + y * y + z * z <= 1) return [x, y, z];
      }
    },
  };
  return rng;
}

// Replays a recorded sequence of picks — used to differentiate an inverse step numerically while
// holding its branch choices fixed. A nudged point can ask for more picks than were made (a chimera's
// inverse trying another guess); past the log it picks 0 and the difference reads as a dead end.
export function recordingRng(rng) {
  const log = [];
  return {
    log,
    float: rng.float,
    range: rng.range,
    ball: rng.ball,
    pick: (n) => { const k = rng.pick(n); log.push(k); return k; },
  };
}

export function replayRng(log) {
  let i = 0;
  return {
    float: () => 0.5,
    range: (lo, hi) => (lo + hi) / 2,
    ball: () => [0, 0, 0],
    pick: (n) => (i < log.length ? log[i++] : 0) % Math.max(n, 1),
  };
}
