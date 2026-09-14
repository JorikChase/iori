# 04 — Macro eye photography and the reference set

The engine is judged against photographs, so it has to reproduce the *camera* as much as the eye. This chapter describes how macro iris photographs are actually made, what that does to the image, and which photographs we keep in `iris-engine/ref/` as ground truth.

## Part A — How iris macros are shot

### Magnification and lens

A human iris is ~12 mm across. To fill a full-frame sensor (36 mm) it needs ~1:3 magnification; to fill the short side (24 mm) it needs 1:2; the "iris only" framing of Suren Manvelyan's *Your Beautiful Eyes* series is close to 1:1, sometimes beyond it with extension tubes. The tools are always the same: a 90–105 mm macro prime (Canon 100 mm f/2.8, Nikon 105 mm, Sigma 105 mm), often with a 1.4× teleconverter or a 25 mm extension tube for the tightest crops. The working distance at 1:1 on a 100 mm macro is ~15 cm, which matters because the lens and the photographer are then *visible in the corneal reflection*. Ophthalmic photographs (slit lamp, biomicroscope) sit at the other extreme: 10–40× magnification, coaxial illumination, a very flat perspective. Phone macros (the many Commons uploads made with clip lenses) sit around 1:2 with a short working distance and strong perspective on the lids.

Consequence for the engine: the camera should be a **long-focal-length perspective camera** (100 mm equivalent, 15–25 cm from the cornea). The near-orthographic view makes the cornea's refraction look symmetric; a wide-angle camera would show the iris "swim" across the cornea when the eye turns.

### Aperture and depth of field

At 1:1 the effective aperture is two stops darker than marked and depth of field is under a millimetre at f/2.8. Photographers therefore shoot at **f/11–f/16** (effective f/22–f/32), where DOF is ~2–4 mm: enough to hold the whole iris and the corneal apex, not enough for the lashes or the lid margin, which go soft. Manvelyan has said in interviews that the hardest part is not optics but getting a subject to hold still with a bright flash in their face; several of his frames are single exposures, not stacks. Focus stacking is used in ophthalmic and "art" macro work but is rare in portraits of living eyes because of saccades and pupil hippus.

Consequence: the render needs **shallow, physically sized DOF** with the focal plane on the iris, the sclera and lids falling off within a few millimetres. Diffraction at f/16 also softens the finest fibre detail: the theoretical resolution limit at f/16 effective ~f/32 is ~20 µm on the sensor, i.e. ~10 µm on the iris at 2:1 — visible fibres are 50–100 µm, so they stay resolved, but the very fine radial grain does not.

### Light

Three setups cover almost everything in the reference set:

| Setup | Catchlight shape | Shadow character | Where you see it |
|---|---|---|---|
| **Ring flash** on the lens | a bright ring (or arc) centred on the pupil, sometimes with the dark lens as a hole | shadowless, flat; crypts read only by colour | most "iris on black" macro shots, ophthalmic photos |
| **Twin flash / macro flash heads** at ±45° | two small rectangles or discs, upper left and upper right | double shadows in crypts and under the collarette; strong relief | Manvelyan-style shots |
| **Softbox or window** from upper front | one large soft-edged rectangle or window shape, high on the cornea, often with the photographer's silhouette | soft single shadow; the upper lid casts a broad dark band | studio portraits, many Commons uploads |
| **Sun / bare bulb** | a small hard disc | hard crypt shadows, sclera shows lid shadow as a hard line | phone macros outdoors |

Two things are constant regardless of light: (1) the **catchlight is a mirror image of the light source** on a ~7.8 mm-radius sphere, so its size is set by the source's angular size, and its position by the light direction; (2) the **upper eyelid casts a shadow band** across the top of the eye that also darkens the top of the iris through the cornea. A render with a Phong dot and no lid shadow fails against every reference.

The catchlight is not the only reflection: the tear film reflects the whole environment dimly (the Purkinje I image), and the wet lower lid margin (the tear meniscus) shows a bright line where the lid touches the globe. In the tight crops these are what makes the eye look wet.

### Colour, white balance and post

Studio flash is 5500–6000 K; the macro shots are white-balanced to it, so blue irides read neutral-blue and brown irides read warm. Phone shots under tungsten go amber. Manvelyan's published frames are heavily post-processed: the sclera is burned toward black to isolate the iris, contrast and local clarity are pushed, saturation is raised — his images are *not* a colorimetric reference, only a structural one. Ophthalmic photos are the opposite: flat, slightly desaturated, coaxially lit, and the most trustworthy for radial colour profiles.

Practical rule for our comparisons: use the isolated-iris macros (Lizapopova143's `Green iris`, `One boy's iris`, `Beautiful iris`; Osmo Lundell's `Iris of human male`) for **structure** — fibre network, crypts, furrows, collarette geometry; use the un-retouched whole-eye shots (Kamil Saitov's `Human eye iris 1–5`, the CC0 `A human male brown eye`) for **colour, catchlight and lid shadow**.

### What the render must reproduce from the camera side

1. **Perspective** — 100 mm macro geometry, focal plane on the iris.
2. **Depth of field** — f/11–f/16 at 1:1–1:2; the limbus is still sharp, the lid margin is not.
3. **Highlight** — a shaped reflection of a real source (ring, twin rectangles, softbox), placed by the light direction on a 7.8 mm sphere, with Fresnel falloff; a dim environment reflection over the whole cornea.
4. **Lid shadow** — a soft band across the top of the eye (we render only the iris, but the band still darkens the top third of the iris).
5. **Sensor** — mild luminance noise in the shadows (the crypt floors are where it shows), slight lateral chromatic aberration at the limbus, no vignetting in the tight crops.
6. **Tone** — a filmic curve; the pupil is never pure black (flare from the cornea lifts it to ~2–5 % of the highlight), and the catchlight clips.

## Part B — The reference set

Selection rules: Wikimedia Commons only; licence CC0, public domain, CC BY or CC BY-SA (any version) verified through the Commons API `extmetadata`; ≥ 1600 px on the long side; frontal or near-frontal; iris large in frame and in focus. The survey scanned ~270 files across 20 searches and 11 categories, kept 259 with usable licences and 183 that show human eyes; the 69 most promising were inspected as thumbnails and the set below was chosen by eye for coverage of colour categories, structures and lighting types.

Files are stored in `iris-engine/ref/` at their Commons resolution capped at 4096 px on the long side; the full attribution list, with licence and author for each file as required by CC BY / CC BY-SA, is `iris-engine/ref/ATTRIBUTION.md`, and the machine-readable copy is `iris-engine/ref/refs.json`. See those two files for the definitive table; the categories they cover:

- **Blue**: light Nordic blue, dark blue, grey-blue with nevus, grey with orange collarette.
- **Green / hazel**: green with large Fuchs crypts (three isolated-on-black macros), hazel with amber central ring, hazel with sectoral heterochromia.
- **Brown**: light brown / amber, medium brown, dark brown (East and South-East Asian), dark brown baby eye with a scene in the catchlight.
- **Heterochromia**: pronounced central heterochromia, sectoral heterochromia.
- **Pathology / variation**: Lisch nodules on a blue iris (also shows freckles), extreme close-up with pigment ruff and collarette, an older eye with arcus if available.
- **Lighting types**: ring flash on black, twin flash, softbox, phone under daylight.

Sources: [Suren Manvelyan, Your Beautiful Eyes (My Modern Met)](https://mymodernmet.com/suren-manvelyan-human-eyes/) · [Manvelyan interview notes, 121clicks](https://121clicks.com/inspirations/your-beautiful-eyes-suren-manvelyan-macro-photography/) · [Wikimedia Commons API](https://commons.wikimedia.org/w/api.php) · [Commons category: Human irises](https://commons.wikimedia.org/wiki/Category:Human_irises) · [Commons category: Close-up photographs of human eyes](https://commons.wikimedia.org/wiki/Category:Close-up_photographs_of_human_eyes)
