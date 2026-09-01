/* Community screen: browse publicly shared decks (from blackjach-api),
   view their leaderboards, and import one as a new local deck. */
window.AHB = window.AHB || {};

AHB.uiCommunity = (function () {
  const el = {};

  function cacheEls() {
    el.sort = document.getElementById('community-sort');
    el.btnRefresh = document.getElementById('btn-community-refresh');
    el.notice = document.getElementById('community-notice');
    el.list = document.getElementById('community-list');
  }

  function difficultyLabel(d) { return AHB.CONFIG.DIFFICULTY_LABELS[d] || d; }

  async function refresh() {
    if (!(await AHB.apiService.isConfigured())) {
      el.notice.hidden = false;
      el.notice.innerHTML = 'No sharing server is set up yet. Add one in <strong>Settings</strong> to browse and share decks.';
      el.list.innerHTML = '';
      return;
    }
    el.notice.hidden = true;
    el.list.innerHTML = '<p class="stats-subtext">Loading…</p>';
    try {
      const decks = await AHB.apiService.listDecks({ sort: el.sort.value });
      renderList(decks);
    } catch (err) {
      el.notice.hidden = false;
      el.notice.innerHTML = `Couldn't load the Community list: ${AHB.utils.escapeHtml(err.message)}`;
      el.list.innerHTML = '';
    }
  }

  function renderList(decks) {
    if (!decks.length) {
      el.list.innerHTML = '<p class="stats-subtext">No decks shared yet — be the first from the Deck screen.</p>';
      return;
    }
    el.list.innerHTML = decks.map((d) => `
      <div class="community-row" data-id="${d.id}">
        <div class="community-row__body">
          <div class="community-row__name">${AHB.utils.escapeHtml(d.name)}</div>
          <div class="community-row__meta">
            <span>by ${AHB.utils.escapeHtml(d.sharedBy)}</span>
            <span>${d.cardCount} cards (${difficultyLabel(1)} ${d.difficulty.easy} · ${difficultyLabel(2)} ${d.difficulty.medium} · ${difficultyLabel(3)} ${d.difficulty.hard})</span>
            <span>${d.playCount} play${d.playCount === 1 ? '' : 's'}${d.bestScore != null ? ` · best ${d.bestScore}` : ''}</span>
            <span>${AHB.utils.formatDate(new Date(d.createdAt).getTime())}</span>
          </div>
        </div>
        <div class="community-row__actions">
          <button type="button" class="btn btn--ghost" data-action="leaderboard">Leaderboard</button>
          <button type="button" class="btn btn--primary" data-action="import">Import</button>
        </div>
      </div>`).join('');
  }

  async function handleListClick(e) {
    const row = e.target.closest('.community-row');
    if (!row) return;
    const action = e.target.closest('[data-action]')?.dataset.action;
    const id = row.dataset.id;
    const name = row.querySelector('.community-row__name').textContent;

    if (action === 'leaderboard') {
      AHB.uiLeaderboard.open(id, name);
    } else if (action === 'import') {
      const btn = e.target.closest('button');
      btn.disabled = true;
      btn.textContent = 'Importing…';
      try {
        const full = await AHB.apiService.getDeck(id);
        const local = await AHB.decksService.importFromServer(full);
        AHB.toast?.show(`Imported "${local.name}" — switch to it from the Deck dropdown.`);
      } catch (err) {
        alert(`Import failed: ${err.message}`);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Import';
      }
    }
  }

  function bindEvents() {
    el.sort.addEventListener('change', refresh);
    el.btnRefresh.addEventListener('click', refresh);
    el.list.addEventListener('click', handleListClick);
  }

  function init() {
    cacheEls();
    bindEvents();
  }

  return { init, refresh };
})();
