# kalivoda/ — design, UX and performance audit

2026-10-28. Nothing on the page was changed. Captures are in `out/` (desktop 1440×900 @2x,
laptop 1280×720 @1x, phone 390×844 @3x, six scroll stops each); numbers are in
`out/report.json`. Re-run with `node tools/kalivoda-audit/audit.js` while the preview
server is up. iori's own notes on what they dislike are still to come and override this.

## The one-line diagnosis

The page is a photograph behind reeded glass with a text document laid over it. Neither
half carries what made *Lom toku* remarkable: discrete rods hanging in **darkness**, lit by a
few **point lights**, moving in **air**, and throwing light onto the room around them.

## Visual design

1. **The glass reads as a panel, not a cloud.** Rods are packed edge to edge at one apparent
   depth, with no dark gaps, no parallax and no fog. On a desktop it looks like a reeded
   bathroom window; on a phone, with the rods lying across, it reads as venetian blinds or CRT
   scanlines. The staggered tips along the bottom edge read as a broken barcode.
2. **The background photo works against the glass.** The studio shot is bright, high-contrast
   and busy (white wall of paintings, radiator slats, a diagonal glass sheet). Refraction of a
   busy image produces noise, and the dispersion only shows on a few tiny highlights. The
   subject's face sits right of centre while the name sits over his body.
3. **The dispersion is the brief, yet it is nearly invisible.** Colour separation needs a
   small bright source against dark, which is exactly what the real show had and what the
   page lacks.
4. **The real photos outshine the render.** The two warm amber Lom toku photos are the most
   beautiful thing on the page, and their palette clashes with the cool render above them.
5. **Typography is competent but generic.** Thin system Helvetica, tracked uppercase labels,
   a single narrow left column. On a 1440 px screen the right 55 % is dead canvas in every
   text section. There is no typographic idea that belongs to him.
6. **Text panels are muddy.** The 86 % dark veil lets the refracted photo smear through behind
   body text without adding anything.

## UX

1. **The fixed top bar collides with content.** It has no backdrop, so headings and body text
   scroll straight through "LUKÁŠ KALIVODA" (visible on desktop and phone). The name also
   appears twice on the first screen.
2. **Interaction is not discoverable.** The hint ("move the cursor…") has about 2:1 contrast
   over the photo and is hidden on phones. Nothing invites a touch on mobile.
3. **"Sound off" is ambiguous** (state or action?), tiny as a tap target, and the clinks are the
   only sound — there is no reason given to turn it on.
4. **There is no navigation and no content model.** One long scroll of About → one project →
   CV. No works index, no other projects (Painting by Water, Soft Cut, the matchstick works),
   no contact, no Czech.
5. **The copy talks about the website.** "The piece behind this page is a rendering…" and
   "Scroll on a phone and the rods lie across the screen" are developer notes, not his voice.
6. **Accessibility gaps.** No `<h1>` (the name is a div), no focus styles, no
   `prefers-reduced-motion` handling, captions and footer at about 2:1 contrast, a generic
   `og:image` (the 3DIE icon) for the share card.
7. **The exhibitions list** wraps into tall, narrow blocks on a phone, and one entry has no year.

## Performance

Measured in headless Chromium on this Mac (Apple M3 Pro GPU, Metal). A phone GPU is several
times slower, so the phone row is a lower bound.

| Profile | Canvas px | GPU ms per frame | Same, text covering the canvas |
|---|---|---|---|
| Desktop 1440×900 @2x | 2880×1800 | 22 | 33 |
| Laptop 1280×720 @1x | 1280×720 | 6 | 6 |
| Phone 390×844 @3x | 780×1688 | 8 | 8 |

1. **A retina laptop already misses 60 fps** (16.7 ms budget) on one of the fastest laptop GPUs
   sold. Cost scales with pixels × 20 spectral samples × two refraction layers, with
   half-float targets and 4× MSAA on the middle layer.
2. **It never stops rendering.** The canvas keeps drawing at full cost while the visitor reads
   text that fully covers it, and there is no pause when it is off screen.
3. **Physics is not the problem**: 0.06–0.14 ms per frame.
4. **Load is 3.9 MB** before compression: three.js unminified 1.24 MB (the whole library for
   one effect), the 1.2 MB studio JPEG plus a 0.46 MB portrait crop that is fetched even when
   unused, and Google Analytics at 0.53 MB. First paint is fast (24 ms); the glass appears
   only after three.js and the 1.2 MB image arrive.

## Directions for an elegant, clean, experimental site

The principle in all three: **the page is the installation, and the content is what its
light falls on.** Darkness is the default; colour only exists where glass splits light.

**A. The vault.** A dark room. One warm point light behind a cloud of rods with real depth
(near rods large and soft, far rods thin and sharp, a little fog between). The rods are
discrete glints, and spectra flare exactly where they cross the light, so the dispersion
finally shows. The cursor is the fan. Scrolling walks slowly into the cloud; each section
(Works, About, Exhibitions, Contact) is a wall label set in the dark beside it. His portrait
is not behind the glass; it appears once, as a projection on the far wall.

**B. The projection.** The rods are barely seen. What you see is their light: caustics and
spectral bands swept across a pale wall on which the text is set, like his *Soft Cut* works
on light-sensitive paper. Moving the cursor moves the light across the words. The most
experimental and the cheapest to render (light splats in 2-D, no full-screen refraction).

**C. The index through glass.** A strict editorial grid, one work per screen, full-bleed
photographs of the real pieces. A thin band of rods hangs in front of each image and parts
where the cursor's wind passes, so the work is revealed through glass rather than hidden by
it. Clean, very legible, closest to a classic portfolio.

**Recommendation: A for the opening, C for the works.** The vault gives the site its identity
in the first five seconds and is honest to the show; the index gives curators and galleries
what they come for. B can be the treatment of the Soft Cut page.

## What any direction needs

- **Content first, from him**: a works list with years, materials and 3–6 good photos each;
  a short statement in his words; a CV; contact; Czech and English.
- **Type**: one distinctive face used with restraint. A precise grotesk for text and the name
  set large and quiet; no tracked micro-labels at 2:1 contrast.
- **Performance budget**: under 8 ms GPU on a mid phone, under 1 MB to first glass.
  - Render only while the hero is visible; pause off-screen and in hidden tabs.
  - Adaptive resolution, so the glass renders at the size the frame time allows.
  - Fewer spectral samples per frame, accumulated over frames.
  - A minified or tree-shaken three.js, or plain WebGL2 for a scene this simple.
  - One responsive image per orientation in AVIF or WebP.
- **Reduced motion**: a still frame and no wind.
- **Accessibility**: real headings, visible focus, readable captions, and a proper share image of the installation.
