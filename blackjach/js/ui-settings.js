/* Settings screen: reset stats (keeps deck) and wipe everything. */
window.AHB = window.AHB || {};

AHB.uiSettings = (function () {
  function bindEvents() {
    document.getElementById('btn-reset-stats').addEventListener('click', async () => {
      if (!confirm('Reset all stats and scores? Your deck and images will be kept.')) return;
      await AHB.metaService.resetStatsAndScores();
      await AHB.game.init();
      AHB.game.acknowledgeAndReset();
      await AHB.uiStats.refresh();
      AHB.toast?.show('Stats reset.');
    });

    document.getElementById('btn-wipe-all').addEventListener('click', async () => {
      if (!confirm('Wipe EVERYTHING — every deck, all images, stats and scores? This cannot be undone.')) return;
      if (!confirm('Are you absolutely sure? There is no undo.')) return;
      await AHB.metaService.wipeEverything();
      await AHB.decksService.ensureReady(); // re-seeds the starter deck and sets it active
      await AHB.game.init();
      await AHB.uiEditor.refresh();
      await AHB.uiStats.refresh();
      AHB.toast?.show('Everything wiped. Starter deck restored.');
    });
  }

  function init() {
    bindEvents();
  }

  return { init };
})();
