/* A clock for the worklet, which has none: spins, writing microseconds into shared memory. It holds a core while it
   runs, so the page only starts it for the percentile pass, never for the search for the limit.
   a[0] = time in us, a[1] = 1 to stop, a[2] = smallest step seen in us, a[3] = loop count */
onmessage = (e) => {
  const a = new Int32Array(e.data.sab);
  postMessage({ ready: true });
  let last = performance.now(), best = 1e9;
  while (Atomics.load(a, 1) === 0) {
    const t = performance.now(), d = t - last;
    if (d > 0) { if (d < best) best = d; last = t; }
    Atomics.store(a, 0, (t * 1000) | 0); Atomics.add(a, 3, 1);
  }
  Atomics.store(a, 2, Math.round(best * 1000));
  postMessage({ stopped: true });
};
