# Editor: the multitrack timeline of clips from the take library

Audit of `audio/t/edit.html` as committed (HEAD 5a04635, 999 lines), 2026-10-30. Line numbers are in that file unless another file is named. The hint calls added since move later lines by a few.
The editor runs in an iframe under the shell. It loads `shared.js`, `wheel.js` and `worklet-player.js`, and draws all of it in one WebGL canvas (`#ec`).
Coordinates below are CSS px inside the editor box, origin top-left, `W` wide and `H` high. Lane x is `30 + LW × (t − hx + 0.5)`, with `LW = (W − 36) / min(tracks, 4)` (88.5 px on a 390 px screen). `HW = min(64, LW/2 − 6)` is the clip half-width (38 px on a 390 px screen).

## Gestures

Hit order for every touch-down (`hit()` 348-369): clip panel items, property buds, property dot, play dot, add dot, track heads, dead bands (`y < 58` or `y > H − 60`), seam, edge, body, empty. The first match wins. All times use the event timestamp. The 220 ms hold is checked on the next animation frame, so it fires up to one frame late.

Constants (line 95): `HOLD` 220 ms, `EB` 14 px, `UNDO` 40 steps, twist start 15°, twist commit 90°.

### Corner dots and transport

| Where | Gesture | Result | Code |
|---|---|---|---|
| Play dot, centre (W/2, H−30), radius 28 | tap: release with at most 12 px travel, no time limit | plays from the playhead, or stops. Stop leaves the playhead where it stopped. The first play makes the AudioContext | 357, 738, 776, 519 |
| Play dot | press, travel over 12 px, release | nothing | 776 |
| Play dot | pointercancel with under 12 px travel | toggles play anyway (no cancel guard, unlike the buds) | 775-776 |
| Whole timeline | playback reaches the end of the last clip (or the timeline end if the playhead began past it) | stops, playhead goes to 0 | 827 |
| Whole timeline | playing, playhead below `H − 120` or above y 66, no finger on the timeline | the view eases so the playhead sits at 25 percent of the view | 828 |
| Add dot, top-left (18, 30), radius 22, only under 8 tracks | touch-down (acts at once, not on release) | adds a track, scrolls it into view, one undo step. The dot disappears at 8 tracks | 358, 739 |
| Property dot, bottom-right (W−34, H−30), radius 26, nothing selected | tap: release with at most 12 px travel | opens or closes the property row of 4 buds | 356, 734, 765, 777 |
| Property dot, a clip selected | same tap | hides or shows the clip panel. The selection stays | 765 |
| Property row, snap bud (W−61, H−94), radius 22 | tap on release | snap on or off. Not an undo step | 355, 766 |
| Property row, push bud (W−87, H−67) | tap on release | push on or off | 355, 766 |
| Property row, shelf bud (W−94, H−30) | tap on release | opens the take shelf wheel (see Wheels) | 766, 562 |
| Property row, save bud (W−24, H−104) | first tap | renders the mixdown and saves it as a library take. Ring fills while busy, then the bud turns green with a share glyph for 6 s | 605-621, 931-938 |
| Save bud while green | second tap within 6 s, mix unchanged | shares the WAV (download if the share sheet cannot take files). The share starts from the click that follows the second pointerup, within 1.5 s | 606, 785, 622-625 |
| Save bud, no audible clip | tap | nothing; the ring is dimmed | 605, 935-936 |
| Save bud, 6 s over, mix unchanged, file kept | tap | goes green again with no new take. A further tap shares | 607 |
| Anywhere while the row is open | touch-down on play, add, a head, a clip or empty space | the row closes. It reopens after the clip is deselected if it was open when the clip was tapped | 737, 580-581 |

### Empty timeline and the left gutter

| Where | Gesture | Result | Code |
|---|---|---|---|
| Empty space (x ≤ 30 counts as empty) | tap: travel under 6 px, any duration | deselects, puts the playhead at the touch time (rounded to a half-beat when snap is on, clamped to 0 .. timeline end). While playing, playback jumps there | 361, 369, 741, 771 |
| Empty space | drag: first 8 px set the axis, nothing scrolls during them | axis is sideways when the sideways travel is larger and there are more than 4 tracks, otherwise vertical | 747-748 |
| Empty space, vertical axis | drag | scrolls time, clamped to 0 .. `TL + 1 − view`. View is 66 .. `H − 60` | 750 |
| Empty space, sideways axis | drag | scrolls lanes, 0.35 rubber band past either end | 749 |
| Empty space | release within 80 ms of the last move | vertical: coasting scroll that decays at 0.04 per second. Sideways: carries up to 1.6 lanes then settles on a whole lane | 772-773, 829 |
| Empty space | travel from 6 to 8 px, release | nothing (not a tap, no axis yet) | 747-748, 771 |
| Empty space | pointercancel with under 6 px travel | acts as a tap (no cancel guard) | 770-771 |
| Dead bands (`y < 58`, `y > H − 60`) away from a dot | touch | nothing | 360 |

### Clip body, edge and seam

Lane test is `|x − laneX| ≤ HW + 4` for seams and edges and `≤ HW` for the body. Edge band at a clip top is from 8 px above the edge line to `min(14, height/4)` px below it. At the bottom it is `min(14, height/4)` px above to 8 px below. The nearer edge line wins. An edge touching a neighbour is not an edge, it is a seam. Seam band is from 14 px above the lower clip's start to 14 px below the upper clip's end. A crossfade (overlap) is a seam too (`touching()` is true for overlap).

| Where | Gesture | Result | Code |
|---|---|---|---|
| Clip body | tap: release before 220 ms or after, travel up to 10 px | selects the clip. The corner shows its panel. Tapping the selected clip again changes nothing | 368, 742, 780, 707-709 |
| Clip edge | tap, or hold (armed) and release with no vertical travel over 2 px | selects that clip | 780, 707-709 |
| Seam | tap | selects the clip on the half of the seam nearer the touch | 708 |
| Clip body | drag over 10 px before 220 ms | scrolls (axis picked from that first 10 px: sideways only with more than 4 tracks). Never moves the clip | 762 |
| Clip body | hold 220 ms with under 10 px travel | 4 buds fan out at radius 86 and 38° apart, laid out to stay on screen and off the hub corner. Order: cut, copy, move, delete | 820-822, 329, 370-374 |
| Open buds | move over 36 px, release | the bud whose direction is within 0.45 rad (about 26°) of the finger direction acts. No bud in reach, or under 36 px: nothing, buds close, the clip is not selected | 755-756, 778 |
| Open buds, move bud | drag over 70 px toward the move bud | the move starts at once, no release needed | 757, 545-546 |
| Cut bud | release on it | cuts at the held point (half-beat snapped if snap is on), at least half a beat from either end. A clip under 1 beat shakes and is not cut | 539-540 |
| Copy bud | release on it | copies right after the clip in its track. If that is not free, to the same time in the first other track with room. If none, the clip shakes | 541-543 |
| Delete bud | release on it | the clip shrinks away | 544 |
| Moving a clip | drag | follows the finger in time and track. Sticks to its origin until it is more than 10 px (time) away or in another track. With snap on it snaps within 8 px to clip edges, beats and its old start, with a green line. Dropped on others it takes the nearest gap; with push on, later clips in the track move down | 836-851 |
| Moving a clip | finger within 106 px of the top or 100 px of the bottom of the box | the view scrolls faster the closer to the edge | 837 |
| Moving a clip, more than 4 tracks | finger at x < 56 or x > W − 26 for 0.35 s | the lanes shift by one, repeating every 0.35 s | 838 |
| Moving a clip | release | commits. If it did not change place the undo step is dropped | 769 |
| Unwarped clip edge | drag: travel over 4 px before 220 ms | trims. Y travel from the press point sets the change. Snaps within 8 px to the half-beat grid and other clips' edges when snap is on. Limited by the take's ends and the neighbours. Readout shows the length in seconds | 759, 665-666, 686-688, 413-415 |
| Warped clip edge | same drag | stretches: the region stays, original tempo changes, ratio 0.25 to 4 and 20 to 300 BPM. Readout shows the ratio | 392-393, 686-688 |
| Clip edge | hold 220 ms with travel up to 4 px | armed: a blob in the lane colour and a bar on the edge | 821 |
| Armed edge | drag over 2 px vertically | fade. Top edge: down makes the fade-in longer. Bottom edge: up makes the fade-out longer. Fade is `start ± dy/pps` seconds, 0 .. clip length minus the other fade; under 3 px it snaps to 0. Readout shows seconds | 763, 667, 689-690 |
| Seam | drag: travel over 4 px before 220 ms | rolls the cut: both clips change together, snapping as above | 760, 668-670, 691-692 |
| Seam | hold 220 ms with travel up to 4 px | armed | 821 |
| Armed seam, clips just touching (overlap 4 px or less) | drag over 2 px vertically | crossfade. Drag down makes the upper clip run on under the lower one. Drag up makes the lower clip start earlier. If the take has no room on that side the other clip reaches over and the direction flips. Equal-power. Readout shows the overlap in seconds | 763, 671-677, 693-694 |
| Armed seam, clips already overlapping | drag | the end nearer the press point (upper end or lower start) is the one that moves | 672 |
| Fade or crossfade, any edit | release | commits; no change drops the undo step; pointercancel restores the clip | 698-699, 775 |

### Track heads

| Where | Gesture | Result | Code |
|---|---|---|---|
| Head dot (lane x, 30), radius 24, only while x is 40 .. W−6 | tap | nothing | 359, 780, 700-709 |
| Head dot | drag over 10 px | nothing (the press is dropped, no scroll) | 762 |
| Head dot | hold 220 ms with travel under 10 px | buds: mute, solo, remove. Remove is left out when only one track exists | 822, 329 |
| Head buds | as the clip buds | mute and solo toggle (solo plays only soloed tracks; both apply to playback and to the mixdown). Remove deletes the track with its clips and shifts later tracks. One undo step each | 534-537, 425 |

### Clip panel (a clip is selected)

Panel items hit only once the panel is more than half open. Items are 20 px radius circles, or for readouts a box from the number's left edge minus 12 px to its right edge plus 26 px (plus 6 px for tempo), 19 px above and below the row.
Rows, bottom to top, with x = W−34: fade curve buds at (x−80, x−40, x; H−80), gain readout (H−122), transpose readout (H−164), warp mode buds (x−80, x−40, x; H−206), warp bud (x; H−248) with the original-tempo readout to its left. Readout right edge is x−26.

| Where | Gesture | Result | Code |
|---|---|---|---|
| Curve bud (linear, equal power, exponential) | release | sets the fade curve of the clip. Same value: nothing | 336-337, 702 |
| Mode bud (beats, tones, repitch) | release | sets the warp mode. Settable while warp is off, only drawn dimmed | 703, 944 |
| Warp bud | release | warp on or off. First use also estimates the original tempo from the take | 704, 405, 451 |
| Any panel item | release after any travel | still acts, even if the finger left the item (the pending press is not cancelled by movement for buds) | 758-761, 780 |
| Readout (tempo, transpose, gain) | tap: travel up to 6 px | opens a value wheel | 705, 710-725 |
| Readout | drag over 6 px, up or down | slides the value. Up raises. Per pixel: tempo 0.25 BPM, transpose 1/14 semitone, gain 0.1 dB. Sideways distance from the press makes it finer: gear `1 / (1 + dx/30)`. The finger blob size shows the gear. Release commits | 761, 679-682, 695-696, 957 |
| Panel box, any miss | touch inside the panel rectangle (x from W−143 to W−8, y from H−276 to H−54) but 26 px or more from the dot | nothing; it does not reach what lies under the panel | 343, 354 |
| Empty space | tap | deselects; the property row returns | 771, 581 |

### Two fingers

Decided in `moveTwo()` (793-801) from the movement since the second finger landed. Angle is summed across frames. Scale is `|ln(d/d0)|`.

| Where | Gesture | Result | Code |
|---|---|---|---|
| Anywhere, second finger lands | both fingers | the first finger's pending press, hold or scroll is cancelled, open buds close. Not if an edit (trim, fade, roll, crossfade, slide) is already running, or a move | 788-792 |
| A clip under the midpoint or under either finger | rotate over 15° and over 1.5 × the scale change, before the pinch test passes | twist mode. The clip turns with the fingers, up to 200° (3.5 rad). Readout shows degrees | 798, 800 |
| Twist | release the first finger at 90° or more | the clip flips to a half turn and becomes reversed (fades swap ends); the reversal lands when the spring settles | 805, 802, 868-869 |
| Twist | release under 90° | the clip springs back, nothing changes | 805 |
| Anywhere (clip or not) | scale change over 0.08 (about 8 percent) or midpoint travel over 14 px, and not already a twist | pinch mode. The distance is rebased at that moment | 799 |
| Pinch | spread or close | zoom, 8 to 160 px per second (readout shows px/30 as `x`), anchored at the time under the midpoint. Midpoint travel scrolls time as well | 801 |
| Anywhere | both fingers down and up within 450 ms of the second landing, no mode decided, distance and midpoint travel under 12 px, rotation under 0.14 rad (8°) | undo one step (40 kept). Empty stack: nothing | 806, 577-579 |
| Third finger | lands while two are down | restarts the two-finger state with the first two ids | 731 |

### Wheels

| Where | Gesture | Result | Code |
|---|---|---|---|
| Shelf wheel (opened from the shelf bud), single column, anchor (W−110, H−240) | opens on the newest take; first row is the open-file row | rows: open file, then every take newest first, each with its kind icon and length m:ss | 562-568, `wheel.js` 434-441 |
| Any tap-mode wheel | flick or drag on the column | spins with momentum, snaps to a row | `wheel.js` 239-252, 266 |
| Tap-mode wheel | tap (under 8 px, under 450 ms) on a row off centre | moves to that row | `wheel.js` 261-264 |
| Tap-mode wheel | tap on the centre band (within half a row of the middle) | commits | `wheel.js` 262-263 |
| Tap-mode wheel | tap anywhere outside the panel | commits the highlighted row | `wheel.js` 259 |
| Tap-mode wheel | tap the x above the top-right corner (panel right − 14, panel top − 20, 22 px) | cancels | `wheel.js` 234, 258 |
| Shelf wheel | commit on a take | the take goes in at the playhead (beat-snapped when snap is on, current time if playing), in the first track with room, else a new track, else the nearest gap. The property row closes | 567-568, 571-576 |
| Shelf wheel | commit on the file row | opens the system file picker inside that tap, imports, places | 568, 591 |
| Value wheel (tempo) | 4 columns: 0-3, then three looping digits, a dot before the last. Range 20.0 to 300.0, a value outside bounces back | sets the original tempo exactly. Committed on the opening digits: nothing, so a finer slid value is kept | 712-714, 722-724 |
| Value wheel (transpose, gain) | one column: -12 to +12 whole semitones; -48.0 to +12.0 dB in 0.5 steps | sets the value | 715-716, 723 |
| Value wheel | opening position | centre y is the readout's row, lifted to `H − 164` at most, x centre `W − 80` | 720 |

## Reads and writes

- `AT.tempo()` once at load. `AT.onTempo` follows it live (values 20 to 300). Warped clips follow the new tempo and are cut short at the next clip, keeping the overlap they had. Unwarped clips whose original tempo was never set follow it. The editor never calls `AT.setTempo`.
- `AT.takes.list()` on open (to restore the session), for the shelf and for placements. `AT.takes.get(id)` for each clip's samples, lazily; a failed get marks the take failed. `AT.takes.put()` for the mixdown (kind `mix`, name `mix-YYYYMMDD-HHMMSS`, mono). `AT.takes.pick()` for the file row. It never calls `takes.del`.
- `AT.onTakes`: only `op: 'del'` is used. Clips of a deleted take shrink away while open and are dropped on open.
- `AT.session` key `edit` (localStorage `audio.session.edit`): saved 300 ms after a change when no finger is on the timeline, on `visibilitychange` to hidden and on `pagehide`. Format v3 (633-635). A failed write is retried because the saved copy is only updated on success. Restored values are range-checked (642, 645-649).
- `AT.placements()` reads and clears localStorage `audio.place`. It runs after the library list has loaded, on `visibilitychange` to visible, on a `storage` event for `audio.place`, and on a BroadcastChannel `audio` message `t: 'place'`. The editor opens its own `BroadcastChannel('audio')` for that. A placement whose take is not in the library is dropped without a sign.
- IndexedDB `audio` is touched only through `AT.takes`.
- Own AudioContext, created on the first play. One buffer source per clip into a gain per track (0.8, or 0 when muted or not soloed). Every edit while playing stops all sources and schedules them again from the current time. `shared.js` resumes the context on touch end. An `OfflineAudioContext` renders the mixdown.
- WSOLA warp and transpose run on the main thread from `worklet-player.js` in slices of 6 ms. Until a render is ready the clip plays at its stretch rate (pitch moves).
- `navigator.share` with a WAV file for export, or a download link.
- Not used: `AT.mic`, `AT.wake`, `AT.onLeave`, `AT.place`, `AT.go`, `AT.preload`. The shell ready signal comes from `shared.js` itself.

## URL switches

None are read by the editor. `?perf` is handled by `shared.js`. Test hooks on `window`: `__HOLD` (hold ms), `__VIS` (shader slot count), `__S`, `__D`, `__E`.

## Limits

- 8 tracks, 4 lanes on screen. Up to 48 clips drawn at once (16 at least, from the GPU uniform budget); with more on screen, neighbours in a track draw merged. At most 8 crossfade bridges are drawn, at most 24 round shapes.
- Undo: 40 steps. It covers clip and track edits, adds, removes, curve, mode, warp, value changes and reverse. It does not cover playhead, zoom, snap, push, selection, or the saved mix take.
- Minimum clip length is `max(0.05 s, 12 px)`. Zoom 8 to 160 px per second. Tempo 20 to 300. Transpose ±12 whole semitones. Gain -48 to +12 dB.
- The timeline has no end: 8 empty bars follow the last clip, minimum 14 bars. Playback stops at the last clip and the playhead returns to 0. It does not loop.
- The mixdown skips muted and non-soloed tracks, is mono at the highest take sample rate, and ends at the last audible clip. A failed render goes back to idle with the error kept in `S.mix.err` and no sign on screen.
- Leaving the editor mid-render loses the render (no `AT.onLeave`). The timeline itself is saved on `pagehide`.
- No WebGL: the page shows one line of text and nothing else.
- While a clip is selected, the property row (snap, push, shelf, save) cannot be reached. Deselect first.
- A press that misses a panel item but lands inside the panel rectangle is swallowed, also when a clip or empty space is under it.
- Four dead zones: empty-space travel of 6 to 8 px; two-finger rotation of 8° to 15° with little scale change; two-finger distance change of 12 px up to the 8 percent pinch threshold at finger gaps over about 150 px; a head tap.
- Possible bug, not tested: a third finger during a twist replaces the two-finger state (731). The old twist keeps its target angle (800), so the clip stays tilted until another twist.
- Possible bug: pointercancel on the play dot toggles play (776) and on empty space sets the playhead (771). Taps elsewhere in the editor are guarded (777, 780).
- `S.mix.err` and a take that failed to load (`st: 3`) have no visible sign. A clip of such a take draws its coarse strip and plays nothing.

## Differs from the spec

- The spec's shelf of the four most recent takes as numbered dots is now a wheel of every take with an open-file row.
- The spec's clip actions include reverse. Reverse is now the two-finger twist; the buds are cut, copy, move, delete.
- The spec's head actions include record-arm. The code offers mute, solo and remove only (`ACT.head`, 329). No UI path sets arm. The page's screen-reader text (74) still says "arm". MATRIX E11 says arm is hidden until recording into a track exists; in code it is not built (E16).
- The spec's up-to-five buds is four on a clip and three on a head.
- The spec's value adjust says rest first, then slide. The code starts the slide after 6 px of travel with no rest, and the gear comes from sideways distance as the spec says.
- The spec's tap on empty space places the playhead. The code also deselects, and snaps only when snap is on.
- The spec has no snap, push, save/export, clip panel (warp, mode, tempo, transpose, gain, curve), fades, crossfades, roll, trim, stretch, or timeline growth. All are in the code.
- MATRIX Z7 (pointercancel is never a tap) passes, but its scenario `cancel-taps` does not open the editor. See the play dot and empty-space cases under Limits.
- MATRIX E12 says the axis locks "in the first 8 px". In code the axis is chosen once travel passes 8 px, and nothing scrolls before that (747-748).
- MATRIX E14 names 40 undo steps; its pass note covers undoing one move. MATRIX L3 says "pass practice only" for the editor grid, while E15 passes for the editor.
- MATRIX E13 (snap, push, shelf) is `todo`, while L5, K5 and Z5 pass with scenarios that use the shelf and buds.

## Test status

From `audio/MATRIX.md`.
Pass: E1 (edit-empty), E8 (edit-place, edit-gesture-panel), E11 (edit-buds), E12 (edit-lanes), E14 (edit-place, one undo of a move), E15 (edit-place), E17 (edit-deleted), E18 (edit-many), E19 (edit-export), E20 (edit-gesture-trim, -fade, -seams, -twist), E21 (edit-gesture-panel, -stretch), E22 (edit-gesture-mixdown), E23 (edit-gesture-session), E24 (edit-gesture-slots), Z2 (edit-endless), Z5 (edit-buds), L5 (edit-wheel-shelf, edit-file), L9 (flow-record-place), L10, L11, K1, K5, K9 (edit-wheel-values), X8 (software GL, editor 46 fps, measured 2026-10-09).
Todo: E2, E3, E4, E5, E6, E7, E9, E10, E13, G7, G8, G10, G11, G12, G13, G14, X3 (device), L1, and the editor part of L3. K4 passes on the harness; the owner try-out is todo.
Fail: none recorded.
Not built: E16 (record into an armed track, volume, pan, effects).

## Hints

Both from `AT.hint` in `shared.js`. Ghost hand on the clip, no words.

| Hint | Trigger | Failed attempt | Done |
|---|---|---|---|
| `edit.fade` | the first trim | an edge held 120 ms or more and let go without dragging | `beginFade` |
| `edit.twist` | the first clip selected | a twist let go short of 90° | `startFlip` |

## No visible cue

Gestures a person cannot find by looking. "Tried and failed" is the exact state the code can tell apart.

| Gesture | Target | Tried and failed when | Code |
|---|---|---|---|
| Hold for fade | A clip's top or bottom edge. Lane x ± (HW + 4). Top band: 8 px above the edge to `min(14, height/4)` px below. Bottom band: `min(14, height/4)` above to 8 below. An edge that touches another clip is a seam, not an edge | (a) Lifted before 220 ms with up to 4 px travel: the clip is selected instead. (b) Travel over 4 px before 220 ms: it trims or stretches. (c) Held, armed (blob and bar appear), released with vertical travel of 2 px or less: the clip is selected, no fade. (d) Armed, then dragged outward (top edge up, bottom edge down): fade stays 0 and the undo step is dropped | 759, 763, 780, 821, 689-690, 698-699 |
| Hold for crossfade | The seam between clips that touch or overlap: lane x ± (HW + 4), from 14 px above the lower clip's start to 14 px below the upper clip's end | Same as the fade, with roll in place of trim for (b). On release with vertical travel of 2 px or less the clip nearer the touch is selected. Both clips with no source left to extend: the range is zero and nothing changes | 760, 763, 780, 708, 671-677 |
| Drag an edge to trim or stretch | The same edge band. No handle is drawn until the drag begins | Travel under 4 px: it stays a tap and selects the clip. A drag past the take's end or into a neighbour is clamped; if nothing changed the undo step is dropped | 759, 665-666, 698-699 |
| Drag a seam to roll the cut | The seam band | Travel under 4 px: select. A roll blocked at both clips' limits changes nothing | 760, 668-670 |
| Hold a clip body for buds | Inside the clip, away from its edge bands | Lifted before 220 ms: select. Travel over 10 px before 220 ms: scrolls | 762, 822 |
| Drag to the move bud | Third bud (arrows) of the clip's buds | Released with the finger over 36 px out but not within 0.45 rad of any bud, or under 36 px out: buds close, nothing happens. Move needs over 70 px toward the bud, without releasing | 755-757, 778 |
| Hold a track head for mute, solo, remove | Head dot at (lane x, 30), radius 24 | A head press released with no buds open (a tap, or lifted before 220 ms): nothing, silently. Travel over 10 px before the hold: nothing | 359, 762, 780 |
| Two-finger twist to reverse | Two fingers with the midpoint, or either finger, inside a clip body (`HW` wide, between its start and end) | Twist mode was entered (angle over 15° and 1.5 × the scale change) and the fingers were released under 90°: the clip springs back. Rotation of 8° to 15° with no scale change: neither twist nor undo. No clip under the fingers: a twist cannot start, only a pinch | 798, 805, 791 |
| Two-finger pinch zoom | Anywhere on the timeline | Never fails visibly except at the limits: zoom is clamped at 8 and 160 px per second. Scale change under 8 percent and midpoint travel under 14 px: no mode, then a quick lift counts as undo | 799, 801 |
| Two-finger drag to scroll | Anywhere | Midpoint travel over 14 px starts pinch mode, which also scrolls time. No separate cue | 799, 801 |
| Two-finger tap to undo | Anywhere (the undo does not depend on target) | The second finger landed more than 450 ms before the last lift, travel reached 12 px, or rotation reached 0.14 rad: no undo. Empty undo stack: no sign | 806, 577 |
| Tap empty space for the playhead | Any point in y 58 .. `H − 60` not on a clip or dot, and the left gutter x ≤ 30 | Travel of 6 to 8 px: nothing. Travel over 8 px: it scrolls | 771, 747-748 |
| Sideways drag for lanes | Empty space or a clip body, only with more than 4 tracks | With 4 tracks or fewer a sideways drag scrolls time instead | 748, 762 |
| Drag a clip to the edge for lanes | Finger at x < 56 or x > W − 26 while moving, more than 4 tracks | Held under 0.35 s: no shift | 838 |
| Tap the property dot while a clip is selected | (W−34, H−30), radius 26 | It hides the panel instead of opening the row. The row is back only after the clip is deselected | 765 |
| Deselect | Tap empty space (or the gutter). Not on the panel rectangle | A tap inside the panel rectangle, off the items, is swallowed | 354, 771 |
| Tap on a value readout for a wheel, drag on it to slide | The number to the left of its bud (no bud for tempo) | Travel over 6 px becomes a slide, not a wheel. Releasing a slide on the wheel opening digits keeps the slid value | 761, 722 |
| Tap outside a wheel | Anywhere off the wheel panel | Commits the highlighted row. On the shelf wheel, which opens on the newest take, a stray tap places that take at the playhead | `wheel.js` 259, 563-568 |
| Second tap on the save bud to share | Save bud (W−24, H−104), within 6 s | Tapped after the 6 s green window: it goes green again with no new take and the next tap shares. The share fires from the click that follows the second pointerup, within 1.5 s | 785, 607, 932 |
| Add track | Dot at (18, 30) | None: it acts on touch-down. It is gone at 8 tracks | 358, 739 |
