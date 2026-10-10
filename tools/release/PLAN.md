# Distribution plan — filling SoundCloud for Artists with the browser

Written 2026-10-06 from a read of the live account (SoundCloud for Artists, Artist Pro).
Goal: get as many IORI tracks as possible onto Spotify, Apple Music and the other
stores. **Singles first, albums second.** Claude fills the forms in the built-in
browser; **iori presses Submit** on each release (or says "submit batch N" in chat).

Data behind this plan, all regenerable:

| File | What |
|---|---|
| `catalogue.csv` | every SoundCloud upload: album, state, ISRC, file type, artwork size, blockers |
| `build_catalogue.py` | builds the CSV; album membership, duplicates and flags are curated in it |
| `data/sc_tracks_2026-10-06.json` | raw read of all 145 uploads from the dashboard's own track query |
| `data/sc_artwork_dims_2026-10-06.json` | pixel size of every track's original artwork |
| `art/singles_sheet.jpg` | contact sheet of the single candidates' covers (gitignored) |

## Where the account stands

| | Singles | Album tracks | Total |
|---|---|---|---|
| Live on stores | 8 | 12 | 20 |
| Stuck in "Edits Needed" | 2 + shellshock threestyle | 10 (darkwood) | 13 |
| Never submitted | 36 | 76 | 112 |

- Artist profile mapping is set: IORI → Spotify `4iQR58JKG1BGWJRpGUaTvI`, Apple Music `1851177795`.
  Every new release must map to these, or the stores create a second "IORI".
- Live releases use label **IORI**. Darkwood used `iori`. Keep **IORI** everywhere.
- An empty draft release was created on 2026-10-06 while testing (`f499e178…`), now holding 🍯.
  It becomes the first single of wave 2.

## What the form asks, and what it rejects

The flow is six steps per release. Facts below are from the live form.

1. **Tracks.** "Add tracks" opens a picker that only lists the 30 newest uploads.
   Older tracks are reached with its **Search for a track** box. Each track then has an
   *Edit* dialog:
   - track title for stores (SoundCloud title stays as it is), version, content rating
   - original / remix / cover
   - contributors: main artist, featured artists, producers
   - songwriters: **full legal name, first and last, correctly capitalised** —
     `jorik chase` and `Joeik Chas` were both rejected
   - lyrics yes/no, lyrics language
   - ISRC: reuse the existing one if the recording was ever distributed, else "generate"
   - "This track contains": non-exclusive beats / royalty-free loops > 3 s /
     public domain or CC / clips from other media / none. Plus **License documentation**
     upload (PDF, JPG, PNG, Word). Every sample track needs a box ticked and a licence attached.
   - audio preview start time
2. **Details.** Artwork upload, album title, genre, sub-genre, record label, main artist,
   release date (defaults to ~17 days ahead), optional original release date.
   Artwork: **3000×3000 minimum, square, only artist/title/label text, matching exactly**.
3. **Platforms.** All stores ticked by default. The **Social Platforms** switch
   (Instagram/Facebook, TikTok, YouTube Content ID) must stay **off** for any track with
   non-exclusive samples. It may be **on** for fully original tracks, which is what
   unlocks the Instagram story music sticker.
4. **Splits.** 100% IORI unless a collaborator is paid.
5. **Profiles.** Map IORI and every featured artist to their Spotify and Apple profiles.
6. **Review.** Claude stops here, screenshots, and hands over.

## The blockers, by how many tracks they stop

| Blocker | Tracks | Fix |
|---|---|---|
| Artwork under 3000 px | almost all (only 2 of 73 covers pass) | source files at 3000 px, or upscale 1080 px covers; 500 px and smaller need new art |
| Text or characters on the cover | wh:te_dust, 4mn3s14c, im a killer, xor, mirror-mirror, darkwood, î iori ï | clean version without the text |
| Songwriter legal name | every release | one confirmed spelling, reused everywhere |
| Undeclared samples | darkwood, aesop fabled, likely more | ACRCloud scan + sample box + licence per track |
| Titles with brackets, years, credits in pipes, emoji only | 36 | clean store title; credits move to the featured-artist field |
| Same recording uploaded twice | 22 duplicates | one canonical upload per recording; never two ISRCs |
| Lossy upload (AAC/MP3) or no file | 18, mostly 2024 | replace the SoundCloud file with WAV (unverified whether required) |
| Private upload | 22 | decide: make public or skip |
| Borrowed beat or song | 8 | licence, or leave on SoundCloud only |

## Waves

### Wave 1 — unstick the singles (edits only, 3 releases)

| Release | Edits |
|---|---|
| aesop fabled | composer legal name; samples: tick the right box (not CC unless it is CC), attach the sample's licence; or turn the sample into a declared clip |
| 4mn3s14c | composer legal name; new 3000 px cover without the cut-off "AMN3S14C" text, or with the title spelled exactly `4mn3s14c` |
| shellshock threestyle | composer legal name only |

### Wave 2 — 2026 singles never submitted

| Track | Ready? | Needs |
|---|---|---|
| crimsOn r0t | cover passes | store title spelling, samples answer |
| 🍯 (in the draft) | 1080 px cover, no text | a store title with letters, 3000 px cover |
| oh no no | 2999 px, one pixel short | re-export at 3000 |
| wh:te_dust | 2064 px, "3:33" on cover | clean cover, store title (`wh:te dust`? `white dust`?) |
| im a killer | cartoon mouse on cover | different cover |
| phantom rain | 500 px | new cover |
| ghouliday_unconcious | 266 px | new cover; is it meant for *atlas*? |
| B00 (three pipes) | private | decide |

### Wave 3 — 2025 singles

Iemegeton (490 plays, canonical *lemegeton*), iori, Albert cukroviny, liluziny, xor,
mirror-mirror, groovy (2024 cut). All need covers; xor and mirror-mirror need text-free ones.
Skip duplicates of live tracks: rusty_fingers, playdough cookie, eli jam, elii.

### Wave 4 — 2024 singles (lossy uploads)

intentions, brdel, ioioioi, podpora financni, minis, take #3, zablesky, paula. Need WAV
masters re-uploaded first. minis already has a 4096 px cover.

### Albums, after the singles

| Order | Album | Tracks | Main work |
|---|---|---|---|
| A1 | darkwood | 10 | text-free cover, sample declarations after the ACRCloud scan; orchids is AAC only |
| A2 | herbální pohoří | 3 | facedrift is AAC; 1080 px cover |
| A3 | 0b1ivi0n | 8 | bdsm cut is private; schizoid man title; "i can hear them" also sits in *atlas*, same ISRC in both |
| A4 | atlas | 26 | covers; 7 instrumentals (no lyrics); ghouliday missing from it? |
| A5 | in_tongues | 10 | 2 tracks already live (reuse ISRCs), 5 private duplicates |
| A6 | î iori ï | 39 | compilation; 8 live tracks inside, lossy files, borrowed beats — last, or never |
| — | oculi solis | 2 | both tracks live; nothing to do |

## How Claude runs a release in the browser

1. Read the release's entry in `manifest/<wave>.json` (title, tracks, credits, dates,
   sample answers, artwork file). Nothing is typed from memory.
2. *Distribute a track* → new draft. Record the release id in the manifest.
3. Add tracks via the picker search. Fill every track dialog. Save.
4. Details, Platforms, Splits, Profiles as above.
5. Artwork and licence uploads: see the open question on file upload below.
6. At *Review*: screenshot, list any field the form still flags, stop.
7. iori submits. Claude records "submitted <date>" in the manifest and moves on.

Rules Claude keeps:

- Never press *Submit*, *Request Takedown* or delete anything without a yes in chat.
- One release at a time, verify each step saved before the next.
- If a field's answer isn't in the manifest, leave the release as a draft and ask.
- Only the release drafts change. SoundCloud track pages, titles and files stay untouched.

## Open question: file uploads

The built-in browser has no file-picker tool, so artwork and licence uploads cannot be
done by clicking. Options, in order of preference:

1. **Claude in Chrome**, which has a file-upload tool. Needs SoundCloud signed in there.
2. iori drags the cover into the Details step, one drop per release, while Claude fills the rest.
3. Script injection of the file into the upload control. Possible, but fragile, and
   the file has to be fetchable from the page.

## Decisions needed from iori before wave 1

1. Songwriter legal name exactly as on your ID.
2. Artwork: send 3000 px source files, or allow upscaling the 1080 px covers.
   500 px and smaller covers need new or re-exported art either way.
3. Store titles for 🍯, wh:te_dust, B00|||, and whether to keep the lowercase/leetspeak spellings.
4. Featured artists on the singles: names as on Spotify, profile links, and legal names
   of anyone who co-wrote.
5. Samples: which wave-1/2 tracks use Splice or other packs. The ACRCloud scan answers
   the "does it match something" half.
6. Release dates: all on one date, or staggered (e.g. one single a week).
7. Which upload route from the section above.
8. Canonical versions of duplicated tracks: lemegeton, xor, mirror-mirror, liluziny, groovy.
9. Private tracks: make public, distribute anyway, or skip.
10. Borrowed material: distribute with a licence, or keep SoundCloud-only.
