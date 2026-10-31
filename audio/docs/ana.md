# Analyzer — spectrum, spectrogram and loudness of the microphone or a take

Audit of `audio/t/ana.html` as coded, 2026-10-30. Line numbers are in `t/ana.html` unless a file is named.
The tool draws everything in one WebGL canvas. Icons are `<i>` elements over it. It uses `shared.js` and `wheel.js`.
Coordinates are in box pixels: `W` is the box width, `H` its height, origin top-left.

## Gestures

All pointer handlers sit on the `#ab` box (272-284). Time comes from the event's own `timeStamp` (270). `HOLD` is
220 ms (271). A press is matched against four targets in this order: bottom-right dot, top-right dot, control dot,
top band. Only one press is tracked at a time (`S.press`).

| Where | Gesture | Result | Code |
|---|---|---|---|
| Control dot (spectrum view: centre of the ring at (W/2, 0.55 H), hit radius 66 px; other views: (W/2, H−48), hit radius 30 px) | tap: release within 12 px of the touch-down and before the 220 ms hold fired | listening starts if stopped, stops if listening or waiting for the source | 275, 281-282, 231 |
| Control dot, stopped, source is the microphone | tap | asks for the microphone; the dot runs (screen inverts) only once audio flows. Refused: the source icon becomes microphone-off and the dot stays stopped | 227-229, 257 |
| Control dot, waiting for the microphone or a take to load | tap | cancels the wait (`end()`) | 231, 230 |
| Control dot | hold still 220 ms (moved 10 px or less) | the three view buds open. Checked on the frame clock, not on an event | 295 |
| Control dot | move more than 10 px within 220 ms ("flick") | the three view buds open at once | 280 |
| Control dot, buds open | drag | the bud whose angle from the dot's resting centre is nearest (within 0.6 rad, about 34°) is selected. Less than 34 px from the centre selects none | 278 |
| Control dot, buds open | release on a selected bud | switches to that view (dithered refresh). The current view's bud is already filled; releasing on it changes nothing | 281, 259 |
| Control dot, buds open | release with none selected | nothing. It does not start or stop listening | 281 |
| Control dot, buds open | pointer cancel | buds close, nothing changes | 281 |
| Control dot, held still 220 ms then released without moving | release | nothing (buds opened at 220 ms, none selected) | 281, 295 |
| Control dot | press | the dot grows up to 12 % over the 220 ms hold | 313 |
| Bud positions | | angles −150°, −90°, −30° from the dot's centre, so left-up, up, right-up. Radius 110 px in the spectrum view (dot at (W/2, 0.55 H)), 82 px in the others (dot at (W/2, H−48)). Left bud spectrum, middle spectrogram, right loudness. Bud radius 16 px, 20 px when selected | 262, 266, 268, 314 |
| Top-right dot, (W−34, 34), hit radius 28 px | tap: move 8 px or less, any duration | opens the source wheel in tap mode and leaves it open | 274, 279, 281-282, 248 |
| Top-right dot | press and move more than 8 px | opens the source wheel in drag mode. It sits at its anchor and spins 1:1 from the touch-down point; release commits the row it rests on | 279, 252-255 |
| Source wheel, tap mode | vertical drag or flick | spins the list one row per 44 px. Flick speed over the last 100 ms; slower than 1.2 rows/s snaps to the nearest row | `wheel.js` 249, 206-218; `t/ana.html` 242 |
| Source wheel, tap mode | tap (under 8 px, under 450 ms) on a row other than the middle | scrolls that row to the middle | `wheel.js` 257, 261-264 |
| Source wheel, tap mode | tap on the middle band (within 22 px of the wheel's centre) | commits the row; the source switches | `wheel.js` 262-263 |
| Source wheel, tap mode | tap outside the wheel panel | commits the row it rests on | `wheel.js` 259 |
| Source wheel, tap mode | tap the cancel mark (22 px radius at the wheel's top-right corner, 20 px above it) | closes, nothing changes | `wheel.js` 234, 258 |
| Source wheel, drag mode | release anywhere | commits the row it rests on. A pointer cancel closes without committing | `wheel.js` 255-256 |
| Source wheel rows | | top to bottom: OPEN FILE, takes oldest to newest (kind icon and m:ss), microphone. The wheel opens on the current source, or on the microphone when the current take is not in the list. Panel is 5 rows of 44 px, centred 198 px below the box top (anchor y = 34 + 16 + 8 + 30 + 110) | 242, 249-251, `wheel.js` 432-440 |
| Source wheel, microphone row | refused earlier | the row shows microphone-off; choosing it retries | 249, 245 |
| Source wheel, commit | OPEN FILE | stops listening, opens the system file picker inside the committing pointer-up. A file is imported as a take, then analysed | 244, 233-234 |
| Source wheel, commit | microphone or a take | listening starts on it. If it is already the source and is running or waiting, nothing happens | 245-247 |
| Source wheel, commit, current source is stopped | any commit of the current row (also a drag with no spin, or a tap outside) | starts listening on that source | 245-247 |
| Bottom-right dot, (W−34, H−34), hit radius 28 px, spectrum view only | tap (moved 12 px or less) | cycles the spectrum style: dots (72 columns), outline, fill. Icon shows the current style | 273, 281-282, 331 |
| Top band, loudness view only (y under 130 px, outside the source dot) | tap (moved 12 px or less) | resets the loudness readings (`resetLoud`). Works while stopped or running | 276, 282, 208 |
| Anywhere else | any | nothing | 272-276 |
| Two fingers | | not handled. A second touch replaces `S.press`; the first finger's later move and release then act on the new press | 272-283 |

State changes of meaning:

- Control dot, stopped vs running: the same tap. The icon is play when stopped and stop when running. In the spectrum
  view the icon is hidden while running (329).
- Bottom-right dot exists only in the spectrum view. It fades out in the others (`styK`) and does not take a press
  there (273, 315).
- Top band reset exists only in the loudness view (276).
- Hub, bottom-left: not drawn here. The shell owns that corner.

## Reads and writes

- `AT.session` key `ana` (`localStorage` `audio.session.ana`): `{src:'take', take:id}` or `{src:'mic'}`. Saved when the
  source changes (211). Read once at load; only a saved take is restored (215). Not saved: view, spectrum style,
  running state, or the file source.
- `AT.takes.list()` at load, and again on every `AT.onTakes` event (213-216). A take that is gone while selected
  falls back to the microphone (214, 212).
- `AT.takes.get(id)` when a take starts. One decoded buffer is cached by id (217-218). The take plays looped, mono,
  at its own sample rate, and also goes to the speakers at gain 0.7 (224-225, 187). The microphone is not monitored.
- `AT.takes.pick()` for OPEN FILE. The file lands in the library (`put`, kind `file`) and is then used as a take (234).
- IndexedDB `audio` (`meta`, `pcm`) and `BroadcastChannel` `audio` are used only through `AT.takes` (`shared.js` 94-98,
  171-235).
- `AT.mic()` per start (227). Constraints: echo cancellation, noise suppression and auto gain off (`shared.js` 253-258).
  Tracks are stopped on stop or source change (209).
- `AT.worklet(ctx)` loads `worklet-capture.js` for the metering node. Raw and K-weighted samples arrive in batches of
  1024 frames (193-194).
- One `AudioContext` is made on the first start and kept (186). `shared.js` resumes it on every touch end.
- Not used: `AT.tempo`, `AT.place`, `AT.go`, `AT.wake`, `AT.onLeave`, `AT.storage`, `AT.onError`. No wake lock, so the
  screen may sleep while listening. No `onLeave`: leaving the tool just unloads the frame.
- Test hooks: `window.__S` (state; `S.pf`, `S.pd`, `S.spec`) at 344, `window.__HOLD` replaces the 220 ms hold (271).

## URL switches

`?perf` only, from `shared.js` (frame-time overlay). The page reads no other query.

## Limits

- Needs WebGL. Without it the page shows one line of text and nothing else (80). No handler for a lost WebGL context.
- Spectrum: FFT 8192, smoothing 0.55, 256 log bins from 20 Hz to 20 kHz, shown from −105 to −10 dB (299). The
  readout looks for the strongest bin between 40 Hz and 18 kHz and refines it by parabola (301-302). It shows only
  while running and above −95 dB (318). The peak mark falls at 0.08 per second while running and 0.2 per second when
  stopped (300, 304). When stopped the bars decay by 0.02 per second.
- Spectrogram: one row per drawn frame into a 256-row texture, only while running (303). Scroll speed and the span
  (about 4.3 s at 60 fps) follow the frame rate. It stops scrolling when listening stops.
- Loudness: 100 ms blocks of a mono, K-weighted signal (38 Hz high-pass, Q 0.5, plus a +4 dB shelf at 1.5 kHz; 189).
  Momentary is the last 4 blocks, short-term the last 30 (204). Integrated gates at −70 LUFS absolute and −10 LU
  relative over 400 ms windows stepped by 100 ms (205-206). History is capped at 36000 blocks (one hour) and the oldest
  blocks are dropped, so past an hour integrated is the last hour (201). `loud()` walks all blocks on every block.
- P is the sample peak of the last 3 s (30 blocks), not a true peak. R is RMS over the last 400 ms (201, 207).
- Meter columns: 32 dots from −60 to 0 dB. Dots above −9 are red. The integrated bar turns green when within 1 LU of
  −14 LUFS; the target is fixed (136, 336).
- If the capture worklet fails to load, the error is swallowed and the loudness view stays empty. The spectrum still works (194).
- After stopping, loudness readings stay on screen and stay frozen (`meter` returns while stopped; 198, 319). Starting
  again clears them (221). `resetLoud` does not clear the partial 100 ms block in `acc`, so up to 100 ms of the old
  signal joins the first new block (197, 208).
- OPEN FILE cancelled or undecodable leaves the source at `file`, stopped, with the file icon. The next control-dot tap
  opens the picker again (222, 234). It is not saved, so a reload goes back to the microphone.
- `S.micTried` is set and cleared but never read (212, 228, 245).
- Wheel contents are a snapshot when it opens. A take added while it is open is not in it.
- Layout reads `box.clientWidth` and `clientHeight` on `resize` (166-167).

## Differs from the spec

- Test signal source (sweep, filtered noise, pulsing chord): not built. The code comment says only real audio is used
  (210). The source choice is microphone, every take, and a file.
- The spec says the control dot opens buds on hold or flick, picking "along buds by angle". As coded, the pick is by
  angle only, with a 34 px dead zone, and a release with no pick does nothing.
- The spec puts the style choice on a "properties dot". It is the bottom-right dot, spectrum view only.
- The spec's source list has three recent takes (MATRIX A3 repeats it). The wheel lists every take in the library.
- The spec names the letters M S I P R. The top number in the loudness view is momentary but carries no M glyph; the
  four rows carry S, I, P and R (319).
- The spec says "tap the top resets" in the loudness view. As coded the zone is the band above y = 130 px, full width,
  minus the source dot.
- The spec has no source wheel. The wheel is described in MATRIX K5 and K10.
- MATRIX A3 and A6 pass notes name "ana-real" and a 999.96 Hz result. The recorded pass note does not state that
  the note name (B5) and level were checked. MATRIX G4 is marked pass but the note says metronome only, so it says
  nothing about this tool.
- The spec has the shell hold the microphone; each tool asks for it itself, and so does this one.

## Test status

From `audio/MATRIX.md`.

- Pass: A3 (source, ana-real), A6 (1 kHz tone, 999.96 Hz), A9 (K-weighting, −23.03 LUFS momentary, −23.07 integrated),
  L11 (opened files join the library, ana-real), W1 (no ScriptProcessorNode), W4 (worklet-ana, −23.028 LUFS),
  K5 and K10 (source wheel, ana-wheel, Chromium and WebKit), X8 (software-GL ranking, ana 52 fps, measured 2026-10-09).
- Todo: A1 (control dot), A2 (view buds), A4 (spectrum ring and ticks), A5 (three spectrum styles),
  A7 (spectrogram), A8 (loudness view and tap-top reset).
- Not applicable: A10 (stereo/phase, pitch and harmonics, clip/silence finder, noise profile; not built).
- G4 (running state is dark): pass for the metronome only, analyzer not covered.

## No visible cue

Nothing on screen says these can be done. "Failed" means the code can tell the person tried and did not get the result.

| Gesture | Target | Failed when |
|---|---|---|
| Hold or flick the control dot to open the view buds | control dot: (W/2, 0.55 H) in the spectrum view, (W/2, H−48) in the others | The code can tell. Press held 220 ms or more and released with no bud selected: `S.pick` opened with `sel` −1 and was cleared with no view change (281, 295). The dot does not start or stop in that case, which may look like nothing happened |
| Slide to a bud along its angle | the three buds, −150°, −90°, −30° from the dot | Release with `S.pick.sel` −1 (finger within 34 px of the centre, or more than 0.6 rad from every bud) (278, 281) |
| Press and drag the source dot in one gesture | top-right dot (W−34, 34) | Not detectable. A drag of 8 px or less is read as a tap and opens the tap-mode wheel instead (279, 282) |
| Tap the middle band, or tap outside, to choose in the tap-mode wheel | the wheel's middle band, or anywhere outside its panel | Not detectable. Tapping off the band scrolls that row to the middle (`wheel.js` 264) |
| Cancel mark of the tap-mode wheel | 22 px radius at the wheel's top-right corner, 20 px above it | Not detectable |
| Tap the bottom-right dot to cycle the spectrum style | (W−34, H−34), spectrum view only | Not detectable. The icon changes with each tap, which is the only feedback |
| Tap the top of the screen to reset the loudness readings | band y under 130 px, full width, loudness view only | Not detectable. Readings return to `--` and the meters empty |
| Tap the source dot, then tap outside, with the source stopped, to start listening | the source dot, then outside the wheel | Not detectable. The commit starts the current source (245-247) |
| Tap while the control dot shows play, to cancel a microphone wait | control dot | Not detectable |
| Tap the control dot after a refused microphone to retry | control dot; the source icon is microphone-off | The code can tell: `S.micFail` is true after a refusal (229, 257). Each tap asks again; a permanent refusal repeats with no message |
