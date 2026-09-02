/* Small shared helpers used across modules. */
window.AHB = window.AHB || {};

AHB.utils = (function () {
  function uid(prefix) {
    const rand = Math.random().toString(36).slice(2, 10);
    const time = Date.now().toString(36);
    return `${prefix || 'id'}-${time}-${rand}`;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function formatDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function pct(num, den) {
    if (!den) return '—';
    return `${Math.round((num / den) * 100)}%`;
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // Seed-deck convention: *Title* -> <em>Title</em>. Applied only to
  // already-escaped text so it can't be used to inject markup.
  function renderPromptText(str) {
    const escaped = escapeHtml(str);
    return escaped.replace(/\*(.+?)\*/g, '<em>$1</em>');
  }

  function debounce(fn, wait) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  return { uid, shuffle, clamp, formatDate, pct, escapeHtml, renderPromptText, debounce };
})();
