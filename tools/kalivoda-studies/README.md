# Kalivoda live studies — parked for the next review rounds

Two working prototypes, built and tested on 2026-10-28, taken off the page before the first
deploy on iori's call: they are the **next step for the coming review rounds**, not part of
the site yet. Lukáš should see them before they go public.

- `artefacts/surface.js`: after *Chvění hladiny* (Matter of Sensitivity, 2020). Water at the
  brim of a glass cylinder seen from above; the cursor shakes the floor, a touch drops ripples.
- `artefacts/shards.js`: after *Jemný řez* (Soft Cut, 2025). Panes of broken sheet glass in
  front of light-sensitive paper; the cursor is the lamp, the paper keeps a fading photogram.
- `artefacts/gl.js`: shared WebGL2 helpers.
- `ARTEFACTS.md`: the full proposal, including the studies not built yet (MATCHES flame front,
  the drain, mirror strips).
- `studies-test.js`: Playwright checks (load on open, render, viewer, cost, stop on close).

Open points from the first look: the water study is close; the shard study still reads a little
diagrammatic and could move toward the Urbánek photographs (white gallery light, finer lines).

## Putting them back on the page

1. Move `artefacts/` back to `kalivoda/artefacts/` (`kalivoda/site.js` imports `./artefacts/<name>.js`).
2. Add the tiles as the first button of their strips in `kalivoda/index.html`:

```html
<!-- Jemný řez strip -->
<button class="study" data-artefact="shards" aria-label="Live study after Jemný řez: move the light across the glass"><canvas></canvas><span>Live study</span></button>
<!-- Matter of Sensitivity strip -->
<button class="study" data-artefact="surface" aria-label="Live study after Chvění hladiny (Quivering Surface): pass by to shake the floor, touch the water"><canvas></canvas><span>Live study</span></button>
```

The CSS (`.strip .study`, `.lb figure canvas`) and the loading, pausing and viewer logic in
`site.js` are still in place, so nothing else is needed. Then run `node tools/kalivoda-studies/studies-test.js`.
