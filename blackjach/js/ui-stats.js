/* Stats screen: leaks (worst accuracy), full per-card stats, recent runs. */
window.AHB = window.AHB || {};

AHB.uiStats = (function () {
  const el = {};

  function cacheEls() {
    el.deckName = document.getElementById('stats-deck-name');
    el.leaksBody = document.querySelector('#leaks-table tbody');
    el.allBody = document.querySelector('#all-stats-table tbody');
    el.runsBody = document.querySelector('#runs-table tbody');
  }

  function difficultyLabel(d) { return AHB.CONFIG.DIFFICULTY_LABELS[d] || d; }

  function promptPreview(card) {
    const text = card.promptType === 'image' ? `[Image] ${card.answer}` : (card.promptText || '');
    return AHB.utils.escapeHtml(text.length > 60 ? `${text.slice(0, 60)}…` : text);
  }

  function rowHtml({ card, stats }) {
    return `<tr>
      <td>${promptPreview(card)}</td>
      <td>${difficultyLabel(card.difficulty)}</td>
      <td class="mono-cell">${stats.timesSeen}</td>
      <td class="mono-cell">${stats.timesCorrect}</td>
      <td class="mono-cell">${AHB.utils.pct(stats.timesCorrect, stats.timesSeen)}</td>
      <td class="mono-cell">${AHB.utils.formatDate(stats.lastSeen)}</td>
    </tr>`;
  }

  async function renderLeaks(cards) {
    const rows = await AHB.statsService.leaks(cards, { minSeen: 2, limit: 10 });
    el.leaksBody.innerHTML = rows.length
      ? rows.map(rowHtml).join('')
      : '<tr><td colspan="6">Not enough attempts yet — play a few runs first.</td></tr>';
  }

  async function renderAll(cards) {
    const statsMap = await AHB.statsService.getAllAsMap();
    const rows = cards
      .map((card) => ({ card, stats: statsMap[card.id] || AHB.statsService.blank(card.id) }))
      .sort((a, b) => (b.stats.lastSeen || 0) - (a.stats.lastSeen || 0));
    el.allBody.innerHTML = rows.length
      ? rows.map(rowHtml).join('')
      : '<tr><td colspan="6">No cards yet.</td></tr>';
  }

  async function renderRuns(deckId) {
    const log = ((await AHB.metaService.getValue('sessionLog')) || []).filter((run) => run.deckId === deckId);
    el.runsBody.innerHTML = log.length
      ? log.map((run) => `<tr>
          <td class="mono-cell">${AHB.utils.formatDate(run.at)}</td>
          <td>${run.outcome === 'won' ? 'Full clear' : run.outcome === 'banked' ? 'Banked' : 'Lost'}</td>
          <td class="mono-cell">${run.rungsCleared}</td>
          <td class="mono-cell">${run.pointsBanked}</td>
          <td>${run.endCard ? AHB.utils.escapeHtml(run.endCard.answer) : '—'}</td>
        </tr>`).join('')
      : '<tr><td colspan="5">No runs yet in this deck.</td></tr>';
  }

  async function refresh() {
    const deckId = await AHB.decksService.getActiveId();
    const deck = deckId ? await AHB.decksService.getById(deckId) : null;
    el.deckName.textContent = deck?.name || '—';
    const cards = deckId ? await AHB.deckService.getAll(deckId) : [];
    await Promise.all([renderLeaks(cards), renderAll(cards), renderRuns(deckId)]);
  }

  function init() {
    cacheEls();
    AHB.decksService.onChange(refresh);
  }

  return { init, refresh };
})();
