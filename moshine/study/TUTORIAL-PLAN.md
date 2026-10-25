# MOSHINE — help tour plan (2026-10-25; built the same day, see Status)

Goal: someone who has never seen a datamosh editor gets from "I have a video" to "I have a moshed file I can put
back in my edit" in about a minute, in plain words, without the tour ever getting in their way.

## The steps (8, each one short sentence plus a small picture)

| # | Highlights | Says (draft wording) | Moves on when |
|---|---|---|---|
| 1 | the empty-state box / Media dock | **Bring a video.** Drop a file anywhere, or press IMPORT. It stays in this browser. | a clip lands on the timeline, or NEXT |
| 2 | the V1 clip and the orange FX1 bar | **This is your clip; the orange bar is the mosh.** The mosh only happens where the bar is. Drag its ends to choose where. | NEXT |
| 3 | the Looks strip | **Pick a look.** Each card shows your clip with that style. Click one. | a look is applied, or NEXT |
| 4 | transport + preview | **Play it.** Space plays, the arrow keys step one frame. | playback starts, or NEXT |
| 5 | HIT button + timeline markers | **Add hits.** Press H on a beat: the picture breaks apart there. Red markers show the hits. | a hit is added, or NEXT |
| 6 | LOCK / MASK / SHOW | **Keep things clean.** Paint with LOCK over a face and the mosh never touches it. MASK does the opposite: mosh only here. | a stroke is painted, or NEXT |
| 7 | VECTOR | **Steer the melt (optional).** Drag with VECTOR and the pixels flow in your direction. | NEXT (or SKIP) |
| 8 | Export dock | **Export.** Keep the size and frame rate of your edit, press EXPORT, then drop the file back into Premiere, Resolve or Final Cut. | NEXT → done |

Done card: "That's it. Help ▸ Tour starts this again; Help ▸ Keyboard map lists every key."

## How the highlights look

- Everything outside the target is dimmed (one overlay with a cut-out, about 45 % black), with a 2 px outline in
  the app's navy and white around the target. The dim layer lets clicks through, so the app stays fully usable.
- The text sits in a small window in MOSHINE's own style (title bar "Tour — 3 / 8", body text, picture), placed
  beside the target and kept on screen. On a phone it docks to the bottom like the other panels.
- Each picture is a tiny looped drawing in the app's style (for example a cursor clicking a look card, or the H key
  with the frame breaking apart). No video files and no external assets.
- Moving between steps takes under 400 ms with no in-between screens. If the target's window is closed, the tour
  opens it.

## How it stops (never in the way)

- × on the tour window, Esc, or STOP TOUR end it at once. Nothing is undone; whatever the user did stays.
- Nothing blocks the app. The user can ignore the tour and keep working.
- It never starts again on its own once stopped or finished (remembered per browser, and that memory failing just
  means no auto-offer). Help ▸ Tour restarts it from step 1, or resumes where it stopped.
- Every action in the tour is a real, undoable edit on the current project; on an empty project it offers the demo.

## Build (one module, no framework, like the rest of MOSHINE)

- `help.js`: the steps as data `{ target, title, text, art, done(event) }`, the overlay, the window and the stop
  rules. Styles in `ui.css`. Hooks: `Help ▸ Tour` menu item, a `?` button in the dock bar, a `?tour` URL flag.
- Test: a harness row checks that every step's target exists and is visible (so a later UI change can't break the
  tour silently), plus a headless screenshot of every step at desktop and phone size.

Phases: **H0** overlay, window and stop rules on two steps → **H1** all 8 steps with final wording → **H2** the
pictures → **H3** tests, screenshots, deploy.

## Decisions (iori, 2026-10-25)

- **First visit:** a small offer in the corner ("New here? 1-minute tour") that fades after a few seconds; the tour
  starts only if clicked. Shown once per browser.
- **Advancing:** doing the step moves on by itself; NEXT is always there for readers.
- **Pictures:** tiny looping drawings in MOSHINE's Win-3.1 style, drawn in code.
- **Extra scope:** edit round-trip export. English only; no per-window tips this round.

## Edit round-trip export (added scope)

Today export is H.264 / HEVC / AV1 / VP9, all lossy, which loses quality on the way back into an edit.

- **PNG image sequence:** lossless, imports into Premiere, Resolve, Final Cut and After Effects. Chrome/Edge write
  straight into a folder the user picks (directory picker, streamed, flat memory). Safari/Firefox get a ZIP, also
  streamed so memory stays flat. Frames are named `name_000000.png`; the sound goes beside them as a WAV.
- **"For editing" preset in the Export window:** the source's size and frame rate, quality very-high, the PNG
  sequence selected, plus a one-line note on how to import a sequence at the right frame rate.
- **ProRes / DNxHR:** not possible with WebCodecs. It would need ffmpeg.wasm, which needs cross-origin isolation, and
  the site deliberately doesn't send that header (D44). Left out unless the client insists; then it's a separate
  decision.
- Tour step 8 then says: "For your edit, choose **For editing**: you get lossless frames you can drop into
  Premiere or Resolve."

## Phases (revised)

**E1** PNG-sequence export (folder + ZIP, WAV beside it) + "For editing" preset, tested at 1080p over 1000 frames
→ **H0** overlay, window and stop rules on two steps → **H1** all 8 steps with final wording and the first-visit
offer → **H2** the drawings → **H3** harness row, screenshots at desktop and phone size, deploy.

## Status (built 2026-10-25)

- **E1** `frames.js` (ZIP64 store writer, 24-bit WAV, folder / ZIP targets, PNG frame sink) + `container: 'png'` in
  `exportSequence` + FOR EDITING / FOR SHARING in the Export window. 1000 frames of 1080p film footage: 58 s,
  memory flat at 120 MB, 3.8 GB, 1001 files. A 4.6 GB ZIP passes unzip, Python zipfile and libarchive
  (`MOSHINE_BIG=<dir> node --test moshine/tests/m9-frames.test.mjs`).
- **H0–H2** `help.js`: steps as data, ring + window, stop rules, first-visit offer (bottom-left: the site menu sits
  bottom-right), Help ▸ Tour / Resume, `?` in the dock, `?tour`. A floating window over a step's target fades and
  lets clicks through for that step. Windows the tour opened close when it ends (Export stays).
- **H3** harness rows `exportFrames` and `editorTour` (T0): pass in Chrome, Playwright WebKit and Safari 26.6.
  Zen under WebDriver has no WebGPU adapter, so Firefox is untested; Playwright's Firefox build is not installed.
- Also fixed: opening Export from the dock left its form empty (the shell now sends `ms-open` when a window opens).
