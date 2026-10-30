/* The rig itself: a scenario that throws must not leave its browser running (run.js closes every browser after each
   scenario). Launches two, closes them the way run.js does, and counts what is left connected. */
module.exports = async (lib) => {
  const a = await lib.browser(), b = await lib.browser(); await lib.closeAll();
  const checks = { closed: !a.isConnected() && !b.isConnected() };
  return { pass: Object.values(checks).every(Boolean), checks };
};
