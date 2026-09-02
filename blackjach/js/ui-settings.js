/* Settings screen: deck-sharing endpoint, reset stats (keeps deck), and
   wipe everything. */
window.AHB = window.AHB || {};

AHB.uiSettings = (function () {
  const el = {};

  function cacheEls() {
    el.apiUrl = document.getElementById('field-api-url');
    el.btnTestApi = document.getElementById('btn-test-api');
    el.btnSaveApi = document.getElementById('btn-save-api');
    el.apiStatus = document.getElementById('settings-api-status');
  }

  async function loadApiSettings() {
    el.apiUrl.value = (await AHB.metaService.getValue('apiBaseUrl')) || '';
    if (el.apiUrl.value) {
      setStatus('checking…', null);
      const result = await AHB.apiService.testConnection(el.apiUrl.value);
      setStatus(result.ok ? 'connected' : `not reachable (${result.message})`, result.ok);
    } else {
      setStatus('not set — sharing and Community are disabled', null);
    }
  }

  function setStatus(text, ok) {
    el.apiStatus.textContent = ok === null ? text : (ok ? `✓ ${text}` : `✗ ${text}`);
    el.apiStatus.style.color = ok === null ? 'var(--color-text-muted)' : (ok ? 'var(--color-correct)' : 'var(--color-risk)');
  }

  function bindApiEvents() {
    el.btnTestApi.addEventListener('click', async () => {
      setStatus('checking…', null);
      const result = await AHB.apiService.testConnection(el.apiUrl.value.trim());
      setStatus(result.ok ? 'connected' : `not reachable (${result.message})`, result.ok);
    });

    el.btnSaveApi.addEventListener('click', async () => {
      await AHB.metaService.setValue('apiBaseUrl', el.apiUrl.value.trim());
      AHB.toast?.show('Saved.');
      await loadApiSettings();
    });
  }

  function bindEvents() {
    cacheEls();
    bindApiEvents();

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
      await loadApiSettings(); // wipe clears apiBaseUrl too — reflect that
      AHB.toast?.show('Everything wiped. Starter deck restored.');
    });
  }

  function init() {
    bindEvents();
    loadApiSettings();
  }

  return { init };
})();
