// Paper 0.3's own figures, started when they scroll into view and stopped when they leave. The reading layer
// (contents rail, progress) comes from fractal-engine/paper/paper.js, as on papers 0.1 and 0.2.
import { createThinning } from './thinning.js?v=1';

const make = { 'fig-thinning': createThinning };
const figs = new Map();
const observer = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const id = e.target.id;
    let F = figs.get(id);
    if (e.isIntersecting) {
      if (!F) {
        try { F = make[id](e.target); } catch (err) {
          console.error(err);
          e.target.querySelector('.status').textContent = 'This figure could not start in this browser.';
          observer.unobserve(e.target);
          continue;
        }
        figs.set(id, F);
      }
      F.start();
    } else if (F) F.stop();
  }
}, { threshold: 0.1 });
for (const id of Object.keys(make)) { const el = document.getElementById(id); if (el) observer.observe(el); }
window.__silviculture = { figs, make };
