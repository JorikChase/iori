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

  function syncLockState() {
    const ladderPhase = AHB.game.getState().phase;
    const betPhase = AHB.betGame.getState().phase;
    const runInProgress = !['idle', 'empty-deck'].includes(ladderPhase)
      || !['idle', 'empty-deck', 'settled'].includes(betPhase);
    select.disabled = runInProgress;
    select.title = runInProgress ? 'Finish your run or bet round before switching decks.' : '';
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
    AHB.betGame.onChange(syncLockState);
    render();
  }

  return { init, render };
})();
