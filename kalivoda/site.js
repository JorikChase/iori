// Page behaviour that does not need the hero's WebGL: the header state, the live studies in
// the exhibition strips, and the photo viewer.
(() => {
  // header turns solid once the installation scrolls away
  const hdr = document.getElementById('hdr');
  const stage = document.getElementById('top');
  if (hdr && stage && 'IntersectionObserver' in window) {
    new IntersectionObserver(es => hdr.classList.toggle('solid', !es[0].isIntersecting), { rootMargin: '-64px 0px 0px 0px' }).observe(stage);
  }

  // ---------------------------------------------------------------- live studies
  // Each .study tile holds a canvas; its module loads the first time its exhibition opens.
  // A study runs only while its tile (or the large view) is on screen.
  const studies = window.__studies = {};
  const seen = new IntersectionObserver(es => {
    for (const e of es) {
      const api = e.target._study;
      if (!api || e.target._inViewer) continue;
      e.isIntersecting ? api.start() : api.stop();
    }
  });
  async function wake(tile) {
    if (tile._loading) return tile._loading;
    tile._loading = import(`./artefacts/${tile.dataset.artefact}.js`).then(m => {
      const api = m.mount(tile.querySelector('canvas'));
      if (!api) { tile.hidden = true; return null; }          // no WebGL2: the photos stay
      tile._study = api; studies[api.name] = api;
      seen.observe(tile);
      return api;
    }).catch(err => { console.error(err); tile.hidden = true; return null; });
    return tile._loading;
  }
  for (const d of document.querySelectorAll('details.ex')) {
    const tiles = [...d.querySelectorAll('.study')];
    if (!tiles.length) continue;
    const sync = () => tiles.forEach(t => { if (d.open) wake(t); else t._study && t._study.stop(); });
    d.addEventListener('toggle', sync);
    sync();
  }
  window.addEventListener('resize', () => { for (const k in studies) studies[k].resize(); });

  // ---------------------------------------------------------------- viewer
  const lb = document.getElementById('lb');
  if (!lb || typeof lb.showModal !== 'function') return;
  const fig = lb.querySelector('figure');
  const img = lb.querySelector('img');
  const cap = lb.querySelector('figcaption');
  let list = [], i = 0, borrowed = null;   // borrowed: the study tile whose canvas is in the viewer

  function giveBack() {
    if (!borrowed) return;
    const t = borrowed; borrowed = null;
    t.insertBefore(fig.querySelector('canvas'), t.firstChild);
    t._inViewer = false;
    t._study.setFull(false);
    t._study.resize();
  }

  async function show(k) {
    i = (k + list.length) % list.length;
    const b = list[i];
    giveBack();
    const title = b.closest('details').querySelector('.t').textContent.trim();
    if (b.classList.contains('study')) {
      const api = await wake(b);
      if (!api) return;
      img.hidden = true; img.removeAttribute('src');
      const cv = b.querySelector('canvas');
      fig.insertBefore(cv, cap);
      borrowed = b; b._inViewer = true;
      api.setFull(true); api.resize(); api.start();
      cap.textContent = [b.getAttribute('aria-label'), `${i + 1} / ${list.length}`].join(' · ');
      return;
    }
    img.hidden = false;
    const strip = b.closest('.strip');
    const credit = b.dataset.credit || (strip && strip.dataset.creditDefault) || '';
    img.src = b.dataset.full;
    img.alt = b.querySelector('img').alt;
    cap.textContent = [img.alt, title, credit && 'Photo: ' + credit, `${i + 1} / ${list.length}`].filter(Boolean).join(' · ');
    const n = list[(i + 1) % list.length];
    if (n && n.dataset.full) { const pre = new Image(); pre.src = n.dataset.full; }
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('.strip button');
    if (!b || lb.open) return;
    list = [...b.closest('.strip').querySelectorAll('button:not([hidden])')];
    lb.showModal();
    show(list.indexOf(b));
  });
  lb.querySelector('.x').addEventListener('click', () => lb.close());
  lb.querySelector('.prev').addEventListener('click', () => show(i - 1));
  lb.querySelector('.next').addEventListener('click', () => show(i + 1));
  lb.addEventListener('click', e => { if (e.target === lb || e.target === fig) lb.close(); });
  lb.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') show(i - 1);
    if (e.key === 'ArrowRight') show(i + 1);
  });
  lb.addEventListener('close', () => { giveBack(); img.removeAttribute('src'); img.hidden = false; });
  let x0 = null;
  lb.addEventListener('touchstart', e => { if (!e.target.closest('canvas')) x0 = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 40) show(i + (dx < 0 ? 1 : -1));
  }, { passive: true });
})();
