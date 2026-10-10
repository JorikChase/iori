/* the gate both versions are judged by: old = level > -45 dBFS; new = -63 dBFS, and quiet input must be more periodic */
const db = (r) => 20 * Math.log10(Math.max(1e-9, r.rms));
module.exports = {
  old: (r) => r.f > 0 && r.conf > .85 && Math.min(1, r.rms * 9) > .05,
  new: (r) => r.f > 0 && db(r) > -63 && r.conf > (db(r) < -45 ? .9 : .85),
};
