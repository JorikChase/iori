/* Bootstraps the app: opens storage, seeds the deck on first run, wires
   screen navigation, and initialises each screen's UI module. */
window.AHB = window.AHB || {};

AHB.toast = (function () {
  const elToast = document.getElementById('toast');
  let hideTimer = null;
  function show(message, duration = 2200) {
    elToast.textContent = message;
    elToast.hidden = false;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { elToast.hidden = true; }, duration);
  }
  return { show };
})();

AHB.nav = (function () {
  let active = 'game';
  const tabs = Array.from(document.querySelectorAll('.app-nav__tab'));
  const screens = Array.from(document.querySelectorAll('.screen'));

  function show(name) {
    active = name;
    tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.screen === name));
    screens.forEach((s) => s.classList.toggle('is-active', s.id === `screen-${name}`));
    if (name === 'editor') AHB.uiEditor.refresh();
    if (name === 'community') AHB.uiCommunity.refresh();
    if (name === 'stats') AHB.uiStats.refresh();
  }

  function currentScreen() { return active; }

  function init() {
    tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.screen)));
  }

  return { init, show, currentScreen };
})();

async function bootstrap() {
  await AHB.decksService.ensureReady();
  await AHB.game.init();
  await AHB.betGame.init();

  AHB.nav.init();
  AHB.uiDeckSwitcher.init();
  AHB.uiLeaderboard.init();
  AHB.uiGame.init();
  AHB.uiBet.init();
  AHB.uiEditor.init();
  AHB.uiCommunity.init();
  AHB.uiStats.init();
  AHB.uiSettings.init();

  AHB.game.acknowledgeAndReset();
  AHB.betGame.acknowledgeAndReset();
}

bootstrap().catch((err) => {
  console.error(err);
  alert(`Failed to start: ${err.message}`);
});
