/* Thin client for blackjach-api (see /blackjach-api in the repo) — public
   deck sharing + per-deck leaderboards. No accounts: every call is
   unauthenticated, identified only by a free-text nickname. Every function
   here is a no-op-safe network call; nothing in the rest of the app assumes
   it succeeds, and the app works fully offline when no endpoint is set. */
window.AHB = window.AHB || {};

AHB.apiService = (function () {
  async function getBaseUrl() {
    const url = await AHB.metaService.getValue('apiBaseUrl');
    return (url || '').trim().replace(/\/+$/, '');
  }

  async function isConfigured() {
    return !!(await getBaseUrl());
  }

  async function request(path, options = {}) {
    const base = await getBaseUrl();
    if (!base) throw new Error('No sharing server configured — set one in Settings first.');
    let res;
    try {
      res = await fetch(base + path, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
    } catch (err) {
      throw new Error(`Couldn't reach the sharing server (${err.message}).`);
    }
    if (!res.ok) {
      let message = `Request failed (HTTP ${res.status}).`;
      try {
        const body = await res.json();
        if (typeof body.detail === 'string') message = body.detail;
        else if (Array.isArray(body.detail)) message = body.detail.map((d) => d.msg).join('; ');
      } catch { /* non-JSON error body, keep the generic message */ }
      throw new Error(message);
    }
    return res.status === 204 ? null : res.json();
  }

  function shareDeck({ name, sharedBy, cards }) {
    return request('/decks', { method: 'POST', body: JSON.stringify({ name, sharedBy, cards }) });
  }

  function listDecks({ sort = 'new', limit = 50 } = {}) {
    return request(`/decks?sort=${encodeURIComponent(sort)}&limit=${limit}`);
  }

  function getDeck(serverId) {
    return request(`/decks/${encodeURIComponent(serverId)}`);
  }

  function submitScore(serverId, { nickname, points, rungsCleared, outcome }) {
    return request(`/decks/${encodeURIComponent(serverId)}/scores`, {
      method: 'POST',
      body: JSON.stringify({ nickname, points, rungsCleared, outcome }),
    });
  }

  function getLeaderboard(serverId, { limit = 20 } = {}) {
    return request(`/decks/${encodeURIComponent(serverId)}/leaderboard?limit=${limit}`);
  }

  // Never throws — used to show a connection status in Settings.
  async function testConnection(baseUrlOverride) {
    const base = (baseUrlOverride ?? await getBaseUrl()).trim().replace(/\/+$/, '');
    if (!base) return { ok: false, message: 'No endpoint set.' };
    try {
      const res = await fetch(base + '/health');
      return res.ok ? { ok: true } : { ok: false, message: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  }

  return { getBaseUrl, isConfigured, shareDeck, listDecks, getDeck, submitScore, getLeaderboard, testConnection };
})();
