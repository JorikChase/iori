# BPM detector — a song or a recording drawn as a strip, its tempo found and shared

Audit of `audio/t/bpm.html` as coded, 2026-10-30. All line numbers are in that file unless another file is named.
The page loads `../shared.js` and `../wheel.js`. It draws everything in one WebGL canvas that fills the frame.
Coordinates below are in px inside that canvas box. W and H are its width and height (`size()`, 142).

Screen layout: the strip runs from Y0 = 124 to Y1 = H − 106 (141, 142). The tempo readout sits above it. The tempo-section trace
is a thin line at x = W − 56 … W − 16. The five dots:

| Dot | Centre | Code |
|---|---|---|
| Source (file) | (W − 34, 34) | 264 |
| Record | (34 + (W − 68) / 3, H − 28) | 263, `btn(1)` |
| Multiplier | (34 + 2 (W − 68) / 3, H − 28) | 263, `btn(2)` |
| Properties | (W − 34, H − 28) | 263, `btn(3)` |
| `btn(0)` | (34, H − 28), inside the shell's hub corner. Not used | 261-262 |

Every dot hit area is 24 px radius at touch-down (293, 294). The source dot also needs the release within 30 px (316).

## Gestures

| Where | Gesture | Result | Code |
|---|---|---|---|
| Source dot (top-right) | tap (down within 24 px, up within 30 px, pointerup only) | opens the system file picker; the file is decoded to mono, added to the library as a `file` take, loaded and analysed. Does nothing while recording or while a take is loading | 293, 316, 260 |
| Source dot | pointercancel | nothing opens | 316 |
| Record dot | tap (acts at touch-down) | not recording: starts a mic recording that replaces the strip. Recording: stops it. Does nothing while a take is loading (`busy`) | 294-295, 202-204 |
| Record dot, while recording | touch-down again | stops (same handler) | 203 |
| Properties dot | tap: up before 350 ms, moved under 10 px, pointerup, not recording, strip not empty | selects the whole song and writes its tempo to the shared tempo | 295, 319-320 |
| Properties dot | still hold 350 ms (moved under 8 px) | opens the take wheel above the dot if the library has takes, not recording, not loading. Otherwise it sets `held` and nothing opens | 296, 270-275 |
| Properties dot | moves 8 px or more before 350 ms | the hold timer is cancelled. If the finger stays under 10 px from the start, release is a tap (whole song). At 10 px or more, release does nothing | 306, 320 |
| Properties dot, take wheel open | drag vertically | spins the drum 1:1 with the finger. Rows 44 px, 5 rows, newest take first, each row a kind icon and the length m:ss. The drum is centred 139 px above the dot (17 + 12 + 110) | 271-273 |
| Properties dot, take wheel open | release | commits the row. A different take, or any take when the strip is empty, is loaded and analysed. The take already shown is not reloaded | 274, `wheel.js` 260 |
| Properties dot, take wheel | pointercancel | closes without committing (drag mode) | `wheel.js` 255 |
| Multiplier dot | tap: up before the 220 ms bloom, moved under 10 px | resets the multiple to 1 | 295, 318 |
| Multiplier dot | hold 220 ms or move over 10 px | the three buds bloom. Hold time is measured on the frame clock, not the event time | 307, 366 |
| Multiplier dot, bloomed | drag to a bud | picks by angle from the dot. The finger must be over 30 px from the dot. Buds at 112° (÷2), 76° (1), 40° (×2), 92 px out. The nearest within 40° of its angle is picked | 266, 308 |
| Multiplier dot, bloomed | release on a bud | sets the multiple 0.5, 1 or 2 | 318 |
| Multiplier dot, bloomed | release with no bud picked | multiple unchanged | 318 |
| Multiplier dot | pointercancel | multiple unchanged | 318 |
| Multiplier dot, multiple changed | release | clears a wheel-set tempo. If the current result came from the person's own selection, writes the new shown tempo to the shared tempo. A file just opened is not written | 318 |
| Tempo readout, x from W/2 − 96 to W/2 + 134, y 10 to 106, only when a result exists | tap: down and up both inside, moved under 10 px, no time limit | opens the tempo digit wheel (see next rows) | 281, 299, 315 |
| Tempo wheel | rolling a column | hundreds 0 to 3, tens, ones, tenths. Tens, ones and tenths loop. Values out of 20.0 to 300.0 bounce back when settled. The big readout follows the drum while it spins | 282-286 |
| Tempo wheel | tap the centre band, or tap outside the panel | confirms: writes the value to the shared tempo and pins the readout to it | 287, `wheel.js` 257-262 |
| Tempo wheel | tap the x above the top-right corner (within 22 px of (panel width − 14, −20)) | cancels, nothing written | `wheel.js` 234, 258 |
| Tempo wheel | tap a row off the centre (under 8 px, under 450 ms) | steps the column to that row | `wheel.js` 257, 261-265 |
| Strip (y from Y0 − 16 to Y1 + 16), no selection handles, not recording, song loaded | vertical drag over 8 px | new selection from the touch-down time to the finger time. Sideways movement is not counted. Re-analysed every 140 ms while dragging, each time writing the shared tempo | 300-303, 309-313 |
| Strip, a selection exists (not whole) | touch-down within 16 px (vertical only, any x) of the top or bottom line | grabs that handle (`a` or `b`). If both are within 16 px, the top one wins. Dragging moves it, never closer than 0.5 s to the other. Re-analysed every 140 ms with the same write | 301-302, 311, 313 |
| Strip | handle grabbed and released without moving | re-analyses and writes the shared tempo | 322-329 |
| Strip | tap (moved 8 px or less, down to up under 320 ms), song with more than one section, tap lands in a section | selects that section and writes its tempo | 324, 326 |
| Strip | tap, song with one section or none | nothing, except that it starts the double-tap window | 325-327 |
| Strip | second tap whose up lands under 300 ms after the previous tap's up | selects the whole song and writes its tempo | 324-325 |
| Strip | press held 320 ms or longer without moving more than 8 px | falls through to the end of the handler: if a partial selection spans the whole song it becomes whole; otherwise it re-analyses and writes the shared tempo. Whole song stays whole and is re-written | 328-329 |
| Strip | drag release | selection within 0.3 s of the full length becomes whole. Otherwise a final analysis and write | 328-329 |
| Strip, while recording or a wheel is open | any touch | ignored (wheel open: all touches ignored until it starts closing) | 291, 300 |
| Strip or any area | pointercancel | same handler as pointerup, except: readout, source dot and multiplier do nothing; a drag of 8 px or less is dropped; a longer drag is committed | 315-316, 318, 323 |
| Page | context menu | suppressed | 331 |

There is no two-finger gesture. Pointer ids are not checked, so a second finger overwrites the first finger's state.

Selections under 2 s clear the result (no readout, no write) (192, 163). A selection that covers 85 % or more of one section
uses its own tempo. Otherwise each section it touches gets a grid and the readout shows the section with the most overlap (194-197).

## Reads and writes (shared layer)

- `AT.tempo`: not called. The tool never reads the shared tempo and never subscribes with `AT.onTempo`.
- `AT.setTempo(bpm, 'bpm')`: called from `analyseSel` when the selection is the person's own (198), from the tempo wheel
  commit (287), and from the multiplier release (318). Never on open, stop, file load or take-wheel load (rule L2, 189-190).
  Value is the shown tempo, which is the wheel value, or the pinned value, or the detected tempo times the multiple, clamped 20 to 300 (279).
  `shared.js` rounds it to 0.1, writes `localStorage` `audio.tempo`, and broadcasts at most every 60 ms (`shared.js` 104-110).
- `AT.takes.put` (224): a finished recording of more than 0.5 s, named `tempo YYYY-MM-DD HH:MM`, kind `rec`, at the context's sample rate.
- `AT.takes.get` (256), `AT.takes.list` (258), `AT.takes.pick` (260): load a take, refresh the library list, open the file picker. IndexedDB `audio` (v3) stores `meta` and `pcm`.
- `AT.onTakes` (384): refreshes the list when any tool changes the library. The strip does not reload if the shown take is deleted.
- `AT.session` key `bpm` (`{id}`): saved after a take is analysed (252) and after a recording is stored (225), restored on open (385). Stored as `localStorage` `audio.session.bpm`.
- BroadcastChannel `audio`: only through `AT.setTempo` and `AT.takes.put`. The tool listens only to takes.
- `AT.mic()` (209): one `getUserMedia` per recording, with echo cancellation, noise suppression and auto gain off.
  Tracks and context are closed on stop (218). `AT.worklet(ctx)` loads `worklet-capture.js` for the raw PCM (208, 213).
- Audio contexts: a new `AudioContext` made inside the touch for each recording (207). An `OfflineAudioContext` for each analysis (239).
  Playback: none. The tool makes no sound.
- Wake lock: not used. `AT.place`, `AT.go`, `AT.preload`, `AT.onLeave`, `AT.pauseDraw`: not called by the tool.
  `shared.js` still wraps `requestAnimationFrame` for the shell's pause.
- `window.__S`: test hook (386).

## URL switches

None of its own. `?perf` from `shared.js` shows the frame-time overlay.

## Limits

- Strip length is 600 s (`MAXN` = 60000 frames at 100 per second, 150). A longer file is cut to its first 600 s (235). A recording stops by itself at 600 s (227).
- Detection range is 50 to 215 BPM, prior centred on 118 (169). At most 8 sections (188). Windows are 6 s with a 1 s hop (175). A song under 6 s gets one section.
  A window with confidence under 0.2 is skipped (176). A selection result needs confidence over 0.15 (196).
  A section changes when the tempo moves over 4 % for 2 windows; a section under 4 s joins the one before (183, 186).
- The shown tempo with the multiple is clamped to 20 to 300 (279, 358-359 for the trace).
- The multiple is kept when another take is loaded or recorded. Only a tap on the multiplier dot resets it.
- Live tempo while recording starts after 3 s of audio and updates every 1000 ms from the last 8 s (346).
- A recording is held in memory and saved only at stop. The tool has no `AT.onLeave`, so leaving the tool during a recording does not save it.
- Two quick record taps before the microphone answers each start their own context and stream: there is no guard on `startRec` until `S.rec` is set (203-217). This is a likely bug.
- After a failed microphone the record icon stays the crossed-out microphone until the next successful start (377).
- Without WebGL the tool shows one line of text and nothing else (86).
- The ms-per-beat panel at H − 86 is drawn but is not part of the tap area for the tempo wheel (281, 365).
- The final per-section octave step halves or doubles the result with no range check (187). A section can end below 50 or above 215. Likely bug.
- Hold times use `setTimeout` (350 ms) and the frame clock (220 ms), not the event timestamp.

## Differs from the spec

- The spec puts the mic in the top-right source corner. Here top-right is the file opener only. The mic is the first bottom dot, the multiplier is the second, properties the third.
- The spec says selecting sets the shared tempo. Code does that, and also on the multiplier release, the digit wheel, a section tap, and a slow press on the strip (329).
- The spec says nothing of the multiplier (÷2, ×2), the digit wheel, the take wheel, the ms-per-beat panel, or the live tempo while recording. All are built.
- The spec's running-state inversion (white stopped, dark running) is not in this tool. It is always black, with the busy spinner as the only state mark (124).
- The spec's two-finger undo is not built here.
- The spec says all timing uses the event timestamp. Two of the holds here do not (see Limits).
- The spec's sections-to-editor-grid hand-off is not built (no `AT.place` or `AT.go`). MATRIX B8 says n/a.
- The spec names the broadcast channel `audiotools` and the key `at.tempo`. `shared.js` uses `audio` and `audio.tempo`.
- Comment at 191 says "properties tap = whole". Code agrees. The sr-only description at 71 matches the code.
- MATRIX B6 is todo, but L2 and K6 record a pass for the same write (a drag selection sets 120; the readout wheel sets 128.0). MATRIX B7 (octave correction) is todo and the check at 187 above is untested.
- MATRIX G4 says white means stopped for the listed tools. The BPM tool is not in that list and is not built that way.

## Test status

From `audio/MATRIX.md`.

- Pass: B1 (file opened from the source dot draws the strip), B2 (recording replaces the strip and is saved), B3 (120 BPM click gives 120.0),
  B4 (100 then 130 BPM gives 100 and 130.4, boundary 16.0 s). Scenario `bpm-library`.
- Pass elsewhere in the matrix that names this tool: L2 (stop and file load leave the tempo alone; a drag selection sets 120), L11 (opened file joins the library),
  S18 (BPM creates its context inside the touch, iOS rule), K5 (take wheel, scenario `bpm-wheel`), K6 (tempo digit wheel, `bpm-wheel`),
  K10 (wheel anchor mode, `bpm-wheel`), Z6 (multiplier reaches the shared tempo, `bpm-mult`), W1 (no ScriptProcessorNode).
- Todo: B5 (drag selects a part, beat grid drawn), B6 (selecting sets the shared tempo), B7 (octave correction keeps 50 to 215), G1 to G3 (dot-matrix values, spring, no flicker).
- N/A: B8 (hand sections to the editor grid).
- Fail: none listed.
- Not covered by any row: the handle drag, the section tap, double tap, the slow-press write, the live tempo while recording, and device feel.

## No visible cue

Gestures a person cannot find by looking. The target is where to press. "Failed" is a state the code can detect.

| Gesture | Target | Failed when |
|---|---|---|
| Hold the properties dot 350 ms for the take wheel | properties dot (W − 34, H − 28), icon arrows-vertical. The dot is dimmed to 35 % when the strip is empty and the library is empty (376) | The code sets `m.held` at 350 ms with no wheel when `canTakes()` is false: library empty, recording, or loading (296, 270). It also fails when the finger moves 8 px or more before 350 ms (306) |
| Tap the properties dot to select the whole song | same dot. It lights when the whole song is selected or the wheel is open (374) | Release with 10 px or more of movement does nothing (320). The code cannot tell a tap that was a hold |
| Hold the multiplier dot to bloom ÷2, 1, ×2 | multiplier dot (34 + 2 (W − 68) / 3, H − 28). It has no icon, only a ring and two small diagonal dots (129, 371). Buds, relative to the dot: ÷2 at (−34.5, −85.3), 1 at (+22.3, −89.3), ×2 at (+70.5, −59.1) | Release while the bloom is open with `sel` = −1: finger within 30 px of the dot, or off all three 40° cones (308, 318). Nothing changes |
| Tap the multiplier dot to reset to 1 | same dot, lit while the multiple is not 1 | None detectable. A tap and a failed hold look the same unless the 220 ms frame check fired |
| Tap the tempo readout to open the digit wheel | x from W/2 − 96 to W/2 + 134, y 10 to 106. Only live when a result exists (281) | Moved 10 px or more, or released outside the area, or no result: `S.rp` is cleared with no wheel (315). The code can tell moved ≥ 10 |
| Drag a selection handle | the top and bottom white lines with dots at x = W/2 ± 118. The grab area is 16 px above and below the line across the full width (302) | A touch-down inside 16 px that did not move still re-writes the tempo (329). The code cannot tell a missed handle from a new selection, except by the 8 px threshold |
| Make a selection by a vertical drag | any point on the strip, y from Y0 − 16 to Y1 + 16 | Total vertical travel of 8 px or less ends as a tap (309, 324). A mostly sideways drag counts as a tap |
| Tap a section to select it | inside a section on the strip, when there is more than one section; section edges are the grey lines (111) | Tap on a single-section song only starts the double-tap window (325-327) |
| Double tap for the whole song | anywhere on the strip | Cannot tell. A second tap at 300 ms or later is treated as a first tap (325) |
| Slow press re-writes the tempo | anywhere on the strip, press 320 ms or longer without moving | Not a gesture the person looks for. It is a side effect (328-329) and has no cue |
| Record dot does nothing during a load | record dot | `S.busy` is set: the code returns at 204 with no mark. The source dot dims to 35 % in the same state (376), the record dot does not |
| Microphone refused | record dot | `S.micFail` turns the icon into a crossed-out microphone (377). There is no other message |
