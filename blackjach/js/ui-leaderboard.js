/* Leaderboard modal — shared by the deck editor, the Community screen, and
   the post-run score-submit flow. Just needs a server deck id + display name. */
window.AHB = window.AHB || {};

AHB.uiLeaderboard = (function () {
  const el = {};

  function cacheEls() {
    el.modal = document.getElementById('leaderboard-modal');
    el.backdrop = document.getElementById('leaderboard-modal-backdrop');
    el.deckName = document.getElementById('leaderboard-deck-name');
    el.body = document.querySelector('#leaderboard-table tbody');
    el.btnClose = document.getElementById('btn-close-leaderboard');
  }

  function close() {
    el.modal.hidden = true;
  }

  async function open(serverId, deckName) {
    el.deckName.textContent = deckName;
    el.body.innerHTML = '<tr><td colspan="6">Loading…</td></tr>';
    el.modal.hidden = false;
    try {
      const rows = await AHB.apiService.getLeaderboard(serverId);
      render(rows);
    } catch (err) {
      el.body.innerHTML = `<tr><td colspan="6">Couldn't load the leaderboard: ${AHB.utils.escapeHtml(err.message)}</td></tr>`;
    }
  }

  function render(rows) {
    if (!rows.length) {
      el.body.innerHTML = '<tr><td colspan="6">No scores yet — be the first to play it.</td></tr>';
      return;
    }
    el.body.innerHTML = rows.map((r, i) => `<tr>
      <td class="mono-cell">${i + 1}</td>
      <td>${AHB.utils.escapeHtml(r.nickname)}</td>
      <td class="mono-cell">${r.points}</td>
      <td class="mono-cell">${r.rungsCleared}</td>
      <td>${AHB.utils.escapeHtml(r.outcome === 'won' ? 'Full clear' : 'Banked')}</td>
      <td class="mono-cell">${AHB.utils.formatDate(new Date(r.submittedAt).getTime())}</td>
    </tr>`).join('');
  }

  function init() {
    cacheEls();
    el.btnClose.addEventListener('click', close);
    el.backdrop.addEventListener('click', close);
  }

  return { init, open, close };
})();
