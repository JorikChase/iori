# Eye 35: why it does not look round (2026-11-11, read-only, nothing changed)

**The photograph itself is cut out as a wobbly horizontal ellipse, and the fit follows it faithfully.**

| | photo cut-out (ellipse fitted to the outline) | fit limbus (`align.limbus`, `view.limb`) |
|---|---|---|
| eye 26 | centred, 2513 × 2512 px, ratio 1.000 | 5.63 × 5.62 mm, round |
| eye 09 | centred, 2414 × 2413 px, ratio 1.000 | 5.63 × 5.62 mm, round |
| **eye 35** | centre (0.513, 0.511) of the frame, **2153 × 1915 px, ratio 0.89**, major axis horizontal | **5.97 × 5.28 mm, ratio 0.884**, tilted −6° |

- 26 and 09 were cut with a circle tool; they are perfect, centred circles. 35 was cut by hand.
- 35's outline wanders up to ±25 px off its own best ellipse. It bulges at the top, and it is flattened at −60° and +90°.
  The polar radius about the centre runs from 932 to 1082 px.
- The band between a circle of the vertical radius and the ellipse (left and right) is darker limbal tissue. That band is
  what reads as "not circularly cut".
- The pupil is round. Its fitted offset (0.15, −0.18 mm) is larger than the others' (about 0.02 mm), because the cut is
  off-centre.
- `light/35-outline.jpg` shows the outline (green), its ellipse (red) and a circle of the vertical radius (blue).

Options, for iori's OK; nothing is changed until then:
1. Keep it. A real cornea is slightly wider than tall, about 11.7 × 10.6 mm, a ratio of about 0.9. This is plausibly the
   real eye.
2. Re-cut the photo as a circle (or a clean ellipse) and refit. A circle of the vertical radius loses about 120 px of
   periphery left and right.
3. Keep the photo and constrain the limbus fit to a circle of the mean radius. The ragged edge would then be cut by the
   render's own edge fade.
