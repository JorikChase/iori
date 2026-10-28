# Should each exhibition get its own rendered artefact?

2026-10-28 exploration. **Prototyped the same day: Quivering surface and Shard light** (see HANDOFF.md); the others are not built. Short answer: **yes for the four works built on
a distinct physical process, no for the rest.** Each artefact would live inside its
opened exhibition entry, as the first tile of the photo strip, labelled as a study, never
replacing photographs of the real work. Lukáš should see each one before it goes public.

## Candidates

| Exhibition | Artefact | What you do | What it shows | Cost |
|---|---|---|---|---|
| Lom toku 2023 | **The cloud**, the hero as it is now; a night mode later | Wind with the cursor | Rods, dispersion; later lasers, caustics, fog | Built |
| MATCHES 2025, Sedlec | **Flame front**: matches laid tip to tip in his circles and triangles on glass | Touch one match; the flame runs from tip to tip | Soot and heat marks left on the glass; a "polariser" toggle shows the rainbow he describes in the burnt glass | Low: a 2-D graph plus one fragment shader |
| Matter of Sensitivity 2020 (*Chvění hladiny*) | **Quivering surface**: water filled to the brim of a glass cylinder, seen from above | Cursor or sound makes the surface tremble | Ripples, standing waves at the rim, the meniscus bending light | Low: a 256² wave height field and a refraction shader |
| Jemný řez / Soft Cut 2025 | **Shard light**: broken sheet glass on a plinth in front of a sheet of light-sensitive paper | Move the light | Sharp green fracture edges throw lines of light onto the paper; the paper slowly keeps an exposure of where the light fell, like his prints | Low to medium: 3-D shards, projected edges, an accumulation buffer |
| Painting by Water 2018 / Mirages in Water 2024 | **The drain**: turpentine-thinned paint floating on water in his round tank | Scroll drains the tank | The film turns and settles onto the sheet; when empty, the image stays and can be saved | Medium: 2-D fluid simulation at 256² |
| Galerie Skleňák 2025 | **Mirror strips**: cut mirror strips at slightly different angles | Move the cursor | Each strip reflects a slice of the page, or of the hero glass | Low; optional |
| Glass to Face 2015 | None: it was a curatorial project | — | — | — |

## How they would share the page

- **One WebGL context for all of them.** Only the opened entry's artefact runs, it pauses when
  scrolled away or closed, and each is a separate module loaded on first open.
- **The same rules as the hero.** A frame budget under 8 ms on a mid phone, a still frame for
  reduced motion, and the photograph as fallback without WebGL.
- **One visual language.** Dark ground, a single light, colour only where light splits,
  no interface beyond the gesture.

## Recommended order

1. **MATCHES.** Cheapest, the most unlike anything else on the page, and it is the Sedlec show.
2. **Quivering surface.** Small, and very physical on a phone.
3. **Shard light.** Closest to his current work.
4. **The drain.** The most effort, and the most rewarding to watch.
5. **Mirror strips**, only if the other four hold together.
