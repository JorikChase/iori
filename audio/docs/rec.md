# Recorder — microphone takes, retro capture, markers and the take strips

Audit of `audio/t/rec.html` as of commit 5a04635, 2026-10-30. The hint calls added since move later lines by a few. Line numbers are in that file unless a column says otherwise.
The page is one WebGL canvas (`#rb`, filled to the frame by CSS) plus a layer of icons. All gestures go through one
`pointerdown` / `pointermove` / `pointerup` / `pointercancel` set on the box, with `touch-action: none`.

Coordinates below are in CSS px inside the box, origin top-left, W = box width, H = box height. The names are the
code's: record dot `C = (W/2, round(0.45 H))`, radius `CR` = 46, hit radius 60; retro ring radius `RR` = 84.
Example for a 390 × 800 box: C = (195, 360).

## Gestures

| Where | Gesture | Result | Code |
|---|---|---|---|
| Record dot (within 60 px of C), stopped, mic open | tap (up within 12 px of down, any duration) | starts a take. The take starts at the event time of the releasing pointerup, mapped onto the audio clock (the last 0.5 s is kept so it can start before its batch arrives). Screen inverts to dark (70 ms flash, 70 ms hold, 5 dither steps of 56 ms), core turns into a rounded square, wake lock on | 298, 314, 214-215, 256, 331 |
| Record dot, first use, mic not yet open | tap | touch-down asks for the mic (`goLive`). If the tap is released while the question is open, recording starts as soon as the mic arrives (`want`), so the take starts at grant time, not at the tap | 298, 208-211, 314 |
| Record dot, recording | tap | stops. The take length is the tap-to-tap time, at least 0.3 s; capture runs on until that many samples have arrived, or 400 ms at most. A take under 0.3 s of samples is dropped, with no message | 314, 223-225, 226-228 |
| Record dot, within the stop tail (after the stop tap until the samples arrive, 400 ms at most) | tap | ignored (`startRec` returns while `S.tail` is set) | 214 |
| Record dot, mic refused (dot shows a crossed-out microphone) | tap | touch-down asks for the mic again. Release does nothing, even if the mic was granted: a second tap records | 298, 314 |
| Record dot | press and hold, no move | the dot grows to 1.08 times its size over 300 ms. No other effect, there is no hold action | 337 |
| Record dot, stopped, mic open, retro on | drag down from the touch-down point | begins at 14 px of downward travel; the blob follows the finger (clamped to 144 px below the dot centre) and "on" once the travel is over 16 px. Length = 10 s at 16 px, rising linearly to 120 s at 16 + 0.3 H px. The ring turns green over the newest part, the top number shows `-m:ss` | 302, 283, 340, 359, 380 |
| Same drag | release with "on" (travel over 16 px at release) and buffer not empty | saves the last `min(chosen length, buffered length)` as a take, kind `retro`, name `retro-<stamp>`. No 10 s floor: a 3 s buffer saves 3 s | 308, 231-232 |
| Same drag | release with travel back at 16 px or less, or empty buffer, or `pointercancel` | nothing saved, and it is not a tap either | 308 |
| Record dot | drag more than 12 px in any other case (sideways or up, while recording, retro off, or mic closed) | nothing on release, no tap, no take | 313 |
| Record dot | `pointercancel` | never a tap | 313 |
| Top-right dot (28 px of (W−34, 34)) | tap (up within 12 px) | arms the picker; the file dialog opens from the `click` that follows within 1000 ms. The file is decoded, mixed to mono, saved as a take of kind `file`. Works while recording | 296, 315, 319, shared.js 224-234 |
| Bottom-right dot (28 px of (W−34, H−34)) | tap, mic open | toggles retro capture. Off: the buffer is cleared at once and the ring fades out. On: the ring starts again from empty. Works while recording | 297, 316 |
| Bottom-right dot | tap, mic not open, retro on (the default) | no toggle. Asks for the mic, which arms retro capture, with no take | 316 |
| Bottom-right dot | tap, mic not open, retro off | turns retro on and asks for the mic | 316 |
| Anywhere else, recording | tap or touch-down (outside the bottom-left 70 × 70 px corner) | drops a marker at the touch-down time, red ring pulse (0.25 s), top-left count `M<n>` shown at (W/2−40, 80). Counted on touch-down, not release | 300, 361, 381 |
| Anywhere, recording, a second finger | touch-down while the first finger is still down | drops a marker (even over the record dot, the corner dots or a strip). The second finger does nothing else | 295, 300 |
| Take strip i (0 = newest, up to 6), stopped | tap (net move under 10 px, held under 220 ms or, if held longer, see hold) | plays the take; tap the playing take to stop it. Starting another take stops the first. Playing does not stop when a recording starts | 299, 312, 257-262 |
| Take strip, stopped | drag, strip follows horizontally once travel passes 8 px (vertical travel is ignored by the strip) | release with net horizontal displacement over 90 px to the right: export WAV (share sheet, else a download link). Over 90 px to the left: delete, at once, no undo. Between: nothing, the strip springs back | 303, 306, 312, 267-270, 271 |
| Take strip, stopped | hold 220 ms with under 10 px of travel | three buds fan out from the touch-down point, the editor preloads (`AT.preload('edit')`) | 329-330, 285-289 |
| Take strip, buds open | drag from the touch-down point, over 36 px, towards a bud (within 0.45 rad, about 26°, of the bud's direction; nearest angle wins) | that bud is chosen (its disc grows and shows its icon larger) | 304-305 |
| Take strip, buds open | release on a chosen bud | bud 0 (columns icon) puts the take on the editor timeline at the playhead and opens the editor. Bud 1 (arrow icon) exports WAV. Bud 2 (trash icon) deletes at once | 310, 167, 272-275 |
| Take strip, buds open | release with no bud chosen (under 36 px, or no bud within 0.45 rad), or `pointercancel` | nothing; the buds close | 310 |
| Take strip | touch-down while recording | not a strip gesture; it drops a marker | 299-300 |
| Take strip, `pointercancel` | any | never a swipe or tap | 309-311 |
| Hub (bottom-left, owned by the shell) | tap, hold-drag | see `shell.md`. The tool receives no touches in the 104 × 104 px corner | `shell.md` |

Bud order. Bud i sits at angle `th + (i−1)·38°` on a radius of 86 px around the touch-down point, where `th` is the
free direction closest to straight up that keeps 23 px from the screen edges, 75 px from the record dot centre and 42
px from the two corner dots, and avoids the bottom-left corner (x under 80, y over H−80). With room above, the order
left to right is place, export, delete. Near an edge the arc turns and the order follows the arc (clockwise on
screen).

Take strips on screen. Strip i has its centre at `y = C.y + 128 + 24 i` (RR + 44 below the dot centre, then every
24 px), so for a box of 800 px: 488, 512, 536, 560, 584, 608. The touch target is the band within 11 px of that y
(22 px of each 24 px) and between x = 50 and x = W − 50. The bars draw between x = 64 and x = W − 64. The hit test
ignores the strip's current swipe offset. When fewer than 6 takes exist, the lower rows are empty and do nothing.

Retro ring. 72 dots at radius 84 around the dot, starting at the top and filling clockwise. The filled fraction is
buffered seconds / 120. The green part is the newest part of the filled arc, as long as the chosen length.

## Reads and writes

- `AT.worklet(ctx)` loads `worklet-capture.js` (processor `capture`) while the mic is asked for. Capture batches are
  1024 frames. If the worklet fails to load, the stream is stopped and the page shows the refused state.
- `AT.mic()`: `getUserMedia` with echo cancellation, noise suppression and auto gain off. Asked on first touch-down on
  the record dot or the retro dot, and again on each touch-down in the refused state. The stream stays open until the
  track ends or the frame unloads. A track `ended` event stops and saves a recording in progress.
- `navigator.permissions.query({name:'microphone'})` on load sets the refused state if it is `denied`, and follows
  changes.
- One `AudioContext`, made on the first tap on the record dot, the retro dot or a take. Output goes to the
  destination only for take playback. The capture chain ends in a gain of 0.
- `AT.wake(true)` at record start, `AT.wake(false)` at stop. `shared.js` re-requests it when the page becomes visible
  again while a take runs.
- `AT.takes.list()` (newest first, the first 6 shown), `get(id)` (on touch-down on a strip, kept in memory for play and
  export), `put()` for rec, retro and file takes, `del()`. `AT.onTakes` re-syncs the strips when any tool changes the
  library.
- IndexedDB `audio` (v3): stores `meta`, `pcm`, `draft`. The take in progress is written to `draft` every 1.5 s of audio
  and at `visibilitychange` to hidden and `pagehide`. On load, `AT.takes.draft.recover()` turns any leftover drafts into
  takes marked `recovered`. A normal save removes the draft; a failed save keeps it.
- `AT.onLeave`: if recording or in the stop tail, stops at once and holds the frame until the take is saved.
- `AT.place(id)` on bud 0: appends `{id, at:'playhead'}` to localStorage `audio.place`, posts `place` on the
  BroadcastChannel and calls `AT.go('edit')`.
- BroadcastChannel `audio`: `takes` events on every put and delete (sent by `shared.js`).
- `AT.preload('edit')` when the buds open.
- Not used: `AT.tempo`, `AT.session`, `AT.storage`, `AT.onError`, `AT.onPlace`.
- Memory: a 120 s float ring of `sampleRate × 120` samples (about 23 MB at 48 kHz) is allocated at the first mic open,
  and a running take is held as float chunks (about 11.5 MB per minute at 48 kHz).
- Test hooks: `window.__S` (state), `window.__HOLD` (hold time in ms).

## URL switches

`?perf` only, from `shared.js`. There is no `?hold=` here; the hold time can be set only through `window.__HOLD`.

## Limits

- The stack shows 6 takes. Older ones are in the library and visible in the editor and the other tools, not here.
- The mic opens only on the first tap on the record dot or the bottom-right dot (an iOS requirement). Until then the
  ring is empty, the readout says 0:00 and nothing is buffered.
- Retro holds 120 s and only while the page is open and the mic is open. Leaving the tool drops it.
- A take cannot start inside the stop tail (up to 400 ms after a stop). A take is at least 0.3 s.
- No cap on recording length. Memory grows by about 11.5 MB per minute.
- A write that fails is logged to the console only (`take not saved`, `draft not saved`); the page does not use
  `AT.onError` and shows nothing. A failed save keeps its draft, so it comes back as a take the next time the page loads.
- Delete has no confirm and no undo. The recorder has no two-finger undo.
- A swipe-export that finds the samples not yet loaded runs after the touch and may be refused by iOS without a
  gesture; the error is swallowed. The samples are fetched at touch-down to avoid this.
- Playback is not stopped when recording starts.
- The tool keeps drawing every frame, even idle (MATRIX X5 is todo).
- A home-screen web app cannot record with the screen locked or in the background.
- The 70 × 70 px marker exclusion in the bottom-left corner is inside the shell's 104 × 104 px hub layer, so it
  never takes effect.

## Differs from the spec

- Spec: "Hold the dot and drag down." Code: no hold is needed. A drag of 14 px starts it, and a hold only grows the dot.
  MATRIX R4 already says "no hold needed".
- Spec: the saved length is 10 s to 2 min. Code: 10 s to 120 s is the choice range, but the save is capped at what is
  buffered, so it can be shorter than 10 s. MATRIX R4 repeats the spec wording.
- Spec: "while the recorder is open, a dotted ring fills." Code: only after the mic has been opened by a tap.
- Spec: takes are swiped and tapped. Code adds the hold with three buds (place on the editor timeline, export, delete).
  Place and the hold are not in the spec's Recorder section.
- Spec: markers confirm with a "red ripple". Code: a red ring that contracts onto the retro ring in 0.25 s.
- Spec: the level row is "red near clipping". Code: 28 dots from −60 dBFS to 0, the top 4 dots (from about −6.7 dBFS)
  are red. A dB number sits to the right of the marker count.
- Spec: "Takes go on the shared shelf." Code: all takes are in the library; the stack shows the newest 6.
- Spec: refused mic is a "dimmed" dot. Code: the red core goes, the disc becomes an outline, and a crossed-out
  microphone icon is drawn.
- MATRIX R4 and R5 are worded as passing the whole row; R5 notes that only the arming half has a test. The clearing of the
  buffer on retro off has no test named. G4 says the dark running state passes for the metronome only, while R1 names
  the inversion as passing for the recorder.
- MATRIX R10 sits after R12 in the table. No effect.

## Test status

From `audio/MATRIX.md`, Recorder rows. Pass: R1 (rec-record), R4 (rec-retro), R5 (edit-buds, arming only), R7
(rec-place), R8 (rec-record), R10 (rec-record), R11 (rec-file), R12 (rec-refused). Todo: R2 (markers), R3 (ring fills),
R6 (level dots), R9 (wake lock, device).

Related rows. Pass: L4, L9, L10, L11, W1, W2, W3, Z1 (harness; device todo), Z7, Z8, S16, S18. Pass for the
metronome only: G4. Todo: G14 (accent colours), X5, X7 (battery, 30 min), W6 (worklet offline on iPhone), S13 (mic
per tool, device).

## Hints

| Hint | Trigger | Failed attempt | Done |
|---|---|---|---|
| `rec.swipe` | the first time a take is on the list. Ghost swipes right on the newest strip | a swipe let go short of 90 px; the ghost goes the way the finger went | a swipe past 90 px either way |

The trigger swipes right only. A swipe left deletes with no undo, so the ghost shows it only to someone already swiping left.

## No visible cue

Gestures a person could not find by looking. "Failed" means the condition under which the code can tell the person
tried and did not get there. Most of these leave no trace in the code.

1. Swipe a take strip left to delete. Target: a strip at y = C.y + 128 + 24 i (i = 0 for the newest), x from 50 to
   W − 50, 22 px tall. Direction: finger moves left, net displacement under −90 px at release. Nothing on the screen
   suggests a swipe. Tried and failed: strip offset past 8 px but release between −90 and +90 px (`pr.dx`), moved 10 px
   or more. The code does not record it. The strip just springs back (line 344).
2. Swipe a take strip right to export WAV. Same target. Net displacement over +90 px at release. Failure case is the
   same as above. A release off the strip still counts, since the finger is captured by the box.
3. Hold a take strip for place, export, delete. Target: the same strip band. Needs 220 ms and under 10 px of travel
   at the moment a frame runs. Tried and failed: held 220 ms or more but moved 10 px or more before the check
   (`moved ≥ 10`), then no buds open and a release is read as a tap only if under 10 px, else nothing. Before the
   buds open, the pressed strip shows a small blob at the finger (`pressA`) as the only cue.
4. Pick a bud by direction. After the buds open, move more than 36 px from where the finger went down, towards a bud.
   The match tolerance is 0.45 rad (about 26°) around each bud's direction. Tried and failed: release with `sel` at −1
   (under 36 px of travel, or no bud inside 0.45 rad). The buds close and nothing happens.
5. Drag down from the record dot to save retro audio. Target: touch-down within 60 px of C (the red dot), drag down.
   Starts at 14 px of travel, saves only if travel is over 16 px at release. Tried and failed: travel over 12 px then
   released with 16 px or less of downward travel, or the mic not open (`S.live` false), or retro off, or recording.
   The code returns with no tap and no take. The ring turns green only when the drag is "on".
6. Retro buffer only fills after a first tap. Target: the record dot or the bottom-right dot (W−34, H−34). Before that
   the readout is 0:00 and nothing is buffered. A person who waits on a fresh page for the ring to fill fails; the
   code cannot tell.
7. Marker drop. Target: anywhere except the bottom-left 70 × 70 px, while recording. No instruction; the only cue is
   the red pulse and `M<n>`. A tap on a take strip while recording is also a marker, not play.
8. Retro off. Target: bottom-right dot (W−34, H−34), 28 px. The icon changes between a clock-arrow and a crossed one;
   nothing says what it does. Tried and failed: first tap before the mic is open only arms retro, with the retro on
   already, so "turn it off" needs a second tap (`S.live` false and `S.retro` true, line 316).
9. Open a file. Target: top-right dot (W−34, 34), a music-note icon, 28 px. If the file does not decode, the picker
   closes and nothing happens (`takes.pick` resolves null).
10. Retry the microphone. Target: the crossed-out microphone in the record dot. The refused state is known to the code
    (`S.micFail`). First tap only asks again; a person who expects it to record fails, and the code knows that
    (`pr.fail`).
11. Tap the playing strip to stop it. Target: the same strip. A tap on a playing take stops it, but a tap on another
    take switches playback to that take. The playhead fill on the strip is the only cue (`T.w`).
12. Drag down retro length scale. Length is 10 s at 16 px of travel and 120 s at 16 + 0.3 H px (for H = 800, 256 px).
    The top readout shows the length while dragging; there is no scale marking.
