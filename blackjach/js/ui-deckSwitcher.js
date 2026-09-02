/* Header deck switcher: lists every deck, lets you jump between them, and
   locks itself while a run is in progress so you can't strand a pot. */
window.AHB = window.AHB || {};

AHB.uiDeckSwitcher = (function () {
  let select;

  async function render() {
    const [decks, activeId] = await Promise.all([AHB.decksService.getAll(), AHB.decksService.getActiveId()]);
    select.innerHTML = decks.map((d) => `<option value="${d.id}">${AHB.utils.escapeHtml(d.name)}</option>`).join('');
    select.value = activeId;
  }

  function syncLockState(gameState) {
    const runInProgress = gameState && !['idle', 'empty-deck'].includes(gameState.phase);
    select.disabled = runInProgress;
    select.title = runInProgress ? 'Finish or bank your run before switching decks.' : '';
  }

  async function handleChange() {
    await AHB.decksService.setActiveId(select.value);
    AHB.toast?.show('Switched deck.');
  }

  function init() {
    select = document.getElementById('deck-switcher-select');
    select.addEventListener('change', handleChange);
    AHB.decksService.onChange(render);
    AHB.game.onChange(syncLockState);
    render();
  }

  return { init, render };
})();
