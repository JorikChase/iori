# Synth — the seed, its branches and the garden

Audit of `audio/t/synth.html` as of commit 5a04635, 2026-10-30. The hint calls added since move later lines by a few. Line numbers are in that file unless a file is named.
One WebGL canvas (`#sb`) takes every touch. Its size is the frame size, W × H. `touch-action:none`, `preventDefault` on pointerdown.
Thresholds come from the constants at lines 207 to 210: DTAP 320, HOLD 220, DWELL 350, ANCH 450, PLANT 0.25, SEEDHOLD 600.
Other constants in the code: slide step `dy × gear / 240` per px, gear `1 / (1 + |dx| / 30)`.

## Gestures

All positions are in canvas px. Seed C = (W/2, round(0.56 H)), radius 32. Hit radius is `max(radius + 16, 30)` (line 448), measured to the dot as drawn.
Hit order on touch-down: layer dots (12 px), parked branches (22 px), then roots by nearest. One pointer drives a gesture (`S.pid`).

| Where | Gesture | Result | Code |
|---|---|---|---|
| Anywhere | first touch-down | creates the AudioContext (`ensure`) and starts the 4-minute capture; iOS resumes it at touch end through `shared.js` | 239-242, 442 |
| Seed (within 48 px of C) | tap: up within 220 ms of down, moved 12 px or less | starts or stops the transport 280 ms after the lift (`DTAP − 40`); the e-ink inversion marks running | 489, 281 |
| Seed | double-tap: second tap also under 220 ms and 12 px, its lift within 280 ms of the first lift (timer clears at 280 ms, the 320 test alone would allow 320) | cancels the pending start or stop and toggles mute of the seed's own voice. Muted seed draws as a ring. Saved with the garden | 489 |
| Seed | press moves more than 12 px at any time before the menu opens | grows a branch from C. The finger's position drives it. Sound plays while it is held, even if stopped | 465, 384-390 |
| Seed | press moves 12 px or less and stays 600 ms (`SEEDHOLD`) | opens the path menu on the seed. A ring fills from 12 o'clock at radius 58 around the seed, drawn from 0.1 of the hold (60 ms) | 501, 506, 598 |
| Seed | lift after 220 ms but before 600 ms, moved 12 px or less | nothing. Not a tap, no menu, ring goes | 489 |
| Seed | lift by pointercancel under 220 ms | counts as a tap, same as a lift (line 489 does not read `still`) | 477, 489 |
| Branch (finger down, dragging) | distance L from the last anchor | mutation m = (L − 38) / 210 clamped 0..1 from the seed (offset 6 after an anchor); angle picks the mutation direction. Readout shows m × 100 | 386-387 |
| Branch | rest 450 ms (`ANCH`) with the finger inside 5 px of its resting point, m above 0.06, fewer than 5 points in the chain | drops an anchor under the finger. The branch restarts from it with m = 0. Up to 4 anchors. Readout 2 shows the count | 388, 502 |
| Branch | lift while at an anchor (`atA`: anchor dropped and the finger still within 10 px of it, one anchor or more) | parks the branch there: off, not focused. A 7th parked branch fades the oldest | 389, 393-395 |
| Branch | lift anywhere else, with anchors, or with m 0.25 or more (about 90 px from C on a first segment) | plants it as the new seed. Fresh phases, focus on a parked branch cleared | 396 |
| Branch | lift with no anchor and m under 0.25 | nothing, the old seed stays | 396 |
| Branch | pointercancel | nothing, branch dropped | 391-392 |
| Menu (open on the seed) | finger leaves the seed toward a bud at 92 px, 5 waves from 12 o'clock clockwise | picks by angle once the finger is 0.72 × the ring radius out and 110 ms after the last pick. Angle must be within `step × 0.6 + 0.12` rad of a bud | 473-476, 341 |
| Menu | finger back within 34 px of the previous node | steps the path back one node | 472 |
| Menu | rest 350 ms (`DWELL`) within 30 px of a node that has a value (base, level, amount, or a gene bud), finger moved under 4 px | value adjust starts: slide up or down. 1 px up = gear / 240 of the range. Sideways from the start point sets the gear | 503-504, 466-468 |
| Menu, adjusting | lift, moved under 8 px from the start of the dwell, numeric value | opens the number wheel at that node, value back at its old position until the wheel moves | 487, 427-428 |
| Menu | lift anywhere else | writes the values of the picked path, closes. Lifting on the root does nothing. pointercancel does the same (line 487 does not read `still`) | 377-379, 487 |
| Top-left dot (34, 34) | tap: lift under 220 ms, moved 12 px or less | all layers on or off (`layersOn`) | 490 |
| Top-left dot | hold 220 ms (`HOLD`), moved 12 px or less | opens the layers menu: drive, crush, filter, comb, each with shape and amount buds. Dot moves to (92, 196) | 501, 326-327, 339 |
| Top-left dot | moves more than 12 px before 220 ms | press is dropped. Nothing happens | 465 |
| Layers menu | same as the seed menu | lifting on the layer node applies variant 0 and amount 2 (the second of four). A deeper node applies its own. Sets layers on | 377-379, 288-290 |
| Layer dots at (62 + 22 i, 34), i = 0..3 | tap: moved 12 px or less, any duration | turns that layer off. Dots exist only while a layer is active and no menu, branch or spiral is open | 446, 484, 529 |
| Top-right dot (W − 34, 34) | tap: lift under 220 ms, moved 12 px or less | next setup: Serum-style, FM, mono, back to Serum | 490 |
| Top-right dot | hold 220 ms, or move more than 12 px | opens the setup dial: 3 buds at 96 px, at 100, 135 and 170 degrees from the dot. The middle bud is the pick | 465, 501, 338, 587 |
| Setup dial | drag away from the dot | under 56 px from the dot keeps the current setup; then every 46 px further steps forward, wrapping. Lift applies if changed | 459, 488 |
| Left edge, 5 colour dots at x = 26, y = round(0.3 H) + 55 i (55 = round(0.105 H) at H = 520) | hold 220 ms, moved 12 px or less | opens that category's genes (osc, filter, amp, mod, fx) as buds with their values. Dot moves to (78, y clamped 190..H − 190) | 501, 332, 339, 380 |
| Category menu | same as the seed menu | pick a gene bud, rest 350 ms for the slide, lift commits. List genes slide through their picks. Numeric genes open the wheel on lift without sliding | 503-504, 427 |
| Left-edge dot | tap, or moves over 12 px before 220 ms | nothing | 465, 489-490 |
| Bottom-right dot (W − 34, H − 34) | hold 220 ms, moved 12 px or less | opens the gene spiral: 31 dots packed in the corner, seed shrinks, other dots hide | 501, 371, 508 |
| Bottom-right dot | tap, or moves over 12 px before 220 ms | nothing | 465, 489-490 |
| Gene spiral | finger over a dot within 24 px | hover: readout shows that gene's value | 458 |
| Gene spiral | rest 350 ms on a hovered dot (finger moved under 4 px) | slide starts (undo step taken): up or down changes the value, sideways sets the gear | 457, 505, 456 |
| Gene spiral, sliding | lift, moved under 8 px, numeric gene | wheel opens at that dot with the starting value | 480 |
| Gene spiral | lift otherwise | closes; the slid value stays. pointercancel keeps it too | 480 |
| Right-edge dot (W − 30, round(0.4 H)) | press | track of 40 dots appears down the edge from 24 px under the dot; `AT.preload('edit')` | 450, 308, 530 |
| Right-edge dot | tap or hold with the finger moved 12 px or less, any duration | places the last 30 s (or all gathered if shorter) on the editor timeline | 483, 312-313 |
| Right-edge dot | drag more than 12 px and more than 16 px down from the press point | length selected: 240 × u² seconds, u = finger position along the track from 0 to 1, floor 10 s, cap what is gathered. Readout shows `-m:ss` and the gathered time | 464, 308-310 |
| Right-edge dot, dragging | lift while selection is on | places that length | 483 |
| Right-edge dot | moved over 12 px, then selection off at lift (finger not more than 16 px below start, or sideways), or pointercancel | nothing, cancelled | 464, 482-483 |
| Parked branch (within 22 px) | tap: moved 10 px or less | off becomes on and focused (and starts the transport if stopped); on but unfocused becomes focused; focused becomes off | 485-486 |
| Parked branch | drag more than 10 px | re-mutates it from its second-last anchor; plays while dragged even if off | 462, 398-399 |
| Parked branch, dragging | lift within 46 px of C | removes it | 485 |
| Parked branch, dragging | lift elsewhere | keeps it where dropped, state as before | 485 |
| Anywhere | two-finger tap: second finger lands, both lift within 450 ms of that landing, neither moved 12 px | undo, up to 20 steps | 439-440, 452, 478, 225 |
| Number wheel (`wheel.js` tap mode, centred on the value) | flick; tap the centre band or outside; tap the x above the top-right | spin with live sound; confirm; cancel (restores). Tap means moved under 8 px and under 450 ms | wheel.js 257-266, 429-435 |

The two-finger tap is ignored while a branch, spiral, menu, dial, parked-branch drag or right-edge selection is going, or while a wheel is open (`doUndo` returns).
A third finger spoils a two-finger tap (`mv = 99`). A second finger during any other gesture is nothing (439, 444).

What a held transport looks like: the screen inverts (white stopped, dark running) with a 70 ms flash, 70 ms hold, five 56 ms dither steps (574).

## Reads and writes

- `AT.tempo()`: read at every scheduled note, step = 30 / tempo seconds (an eighth note). Live changes from other tools apply at once (280).
- `AT.takes.put`: right-edge placement writes `{name:'synth-YYYYMMDD-HHMMSS', kind:'synth', sr, data}` to IndexedDB `audio` (stores `meta`, `pcm`). Asks for persistent storage. Emits `takes` on BroadcastChannel `audio` (312-313).
- `AT.place(id)`: queues the take in localStorage `audio.place`, emits `place`, then `AT.go('edit')`. The synth frame goes with it (shared.js `place`, `go`).
- `AT.preload('edit')`: on touch-down on the right-edge dot (450).
- `AT.worklet(ctx)`: loads `worklet-capture.js` for the capture node (297).
- `AT.session`: not used. `AT.onLeave`: not used. `AT.mic`, `AT.wake`: not used. No microphone, no wake lock.
- localStorage `seed-garden-v1`: seed genes, phases, setup, mute, `layersOn`, parked branches (position, genes, colour, anchors; always saved off). Written every 2 s from the frame loop except during a branch, and after each wheel commit and each undo. Read once at load. A leave inside the 2 s loses that change (217-222, 500).
- The passive capture: master output after effects, Int16 ring of 240 s at the context rate (23 MB at 48 kHz). Runs whenever the context runs, silence included. Not stored; lost on leaving the tool (295-304).
- Reads `parent.location.search` for `?hold=` (209).
- Test hooks: `window.__S`, `window.__SW`, `window.__CAP`; window globals `__DTAP`, `__HOLD`, `__DWELL`, `__ANCH`, `__PLANT`, `__SEEDHOLD` override constants (207, 210, 604).

## URL switches

`?hold=<ms>` seed menu hold time, accepted from 80 to 5000, in the tool's own URL or the shell's. Anything else keeps 600 (209-210). `?perf` frame-time overlay (`shared.js`).

## Limits

- Parked branches: 6. A 7th marks the oldest dead and it fades (395).
- Anchors per branch: 4 added (the chain is capped at 5 points) (502).
- Undo: 20 steps, held in memory only. Covers seed, phases, setup, layers on/off, parked branches. Not mute, not running state, not the capture. Refused while a wheel is open (225, 229).
- Capture: 240 s. Selection floor 10 s unless less is gathered. If the worklet fails to load the failure is swallowed and nothing can be placed (301). A placement with nothing gathered does nothing and shows nothing (303, 312).
- Genes: 31, of which 24 are numeric (wheel) and 7 are lists (wave, oct2, ftype, dtime, drvShape, fltType, fmRatio) with no wheel (163-194, 427).
- Menu edits write to the focused parked branch if one is focused, otherwise to the seed (375).
- Voices: one per owner per eighth note, seed plus up to 6 parked, each with its own effects strip. Note gate is a fixed 0.16 s (268).
- Drawing runs in the frame loop. The garden save and the e-ink inversion pause with it while the shell holds drawing during a sweep (`AT.pauseDraw`).
- Leaving the tool stops everything and drops the capture. Nothing registers `AT.onLeave`.
- Hit testing does not look at whether a dot is visible (448).
- pointercancel: the seed, setup dot, layers dot, layer dots and parked branches all treat it as a lift (484-490); the layers, category and menu paths commit on it (487). Only the right-edge dot checks `still` (482).

## Differs from the spec

- Save: the spec says the last 2 minutes plus the 3 most recent runs as WAV. Code keeps 4 minutes and places a chosen length on the editor timeline as a take (MATRIX Y14, L7).
- The spec's centre-dot rule is hold or flick to open buds. Here a drag from the seed always grows a branch, and the menu needs a 600 ms still hold, not 220 ms. The other dots keep 220 ms.
- The spec does not describe the seed's path menu, the layer and category menus, the tap actions on the setup and layers dots, or the number wheels. All are coded.
- The spec says all timing uses the touch event's timestamp. Taps, the double-tap and the two-finger tap do. Holds, the anchor rest, the menu dwell and the spiral dwell use `performance.now()` in the frame loop (449, 498-505).
- The spec leaves the double-tap window open. MATRIX proposes 300 and its note says synth stays 320. Effective window is about 280 ms from the first lift, because the pending timer is cleared at `DTAP − 40`.
- The first tap starts the transport 280 ms late, so a double-tap can be told apart (489). MATRIX Y2 does not mention the delay.
- MATRIX Y7 and Z4 say a plant needs about 90 px. True only for a branch with no anchor (m 0.25, 38 + 52.5 px). A branch with an anchor plants at any distance unless it ends at the anchor.
- MATRIX Z7 says pointercancel is never a tap, and the `cancel-taps` scenario has no synth case. In the synth the seed, setup, layers, layer-dot and parked-branch taps and the menu commit all run on pointercancel (see Limits).
- The spec says Properties (bottom-right): go to a value, hold, slide. Coded: hold the corner dot 220 ms, hover a dot, rest 350 ms, then slide.
- MATRIX Y4 and the spec say 31 genes in 5 categories: confirmed.
- The page's hidden description (line 71) mentions the double-tap, but not the tap that toggles layers or cycles setups.

## Test status

From `audio/MATRIX.md`.
- Pass: Y14 (synth-place). L7 (synth-place, synth-tap; WebKit too). K9 (synth-wheel, synth-wheel-menus). Z3 (synth-seed-gesture, Chromium and WebKit; timing on the iPad todo). Z4 (synth-undo, Chromium only; CDP touch). S16, S18 (synth silent without the unlock, working with it). W1 (no ScriptProcessorNode). X8 (software GL rank, synth 24 fps, measured 2026-10-09).
- Partly: L3 passes for the practice tool only. The synth tempo read has no pass.
- Todo: Y1, Y2, Y3, Y4, Y5, Y6, Y7, Y8, Y9, Y10, Y11, Y12, Y13, Y15. X2 (6 parked branches at 60 fps). Shared gesture rows G8, G9, G10, G11, G12.
- No row: setup dial drag steps, tap actions on setup and layers dots, layer dot tap, category menus, gene spiral hover, menu path back-up, `?hold=` on the device.

## Hints

| Hint | Trigger | Failed attempt | Done |
|---|---|---|---|
| `synth.seed` | the first tap that starts the transport. Ghost drags out of the seed | a press held 220 ms or more and let go before the menu | `startBranch` |

## No visible cue

Gestures a person could not find by looking. The second column is the condition that tells the code the person tried and failed, where the code can tell. Targets are in canvas px.

| Gesture | Target | Tried and failed when |
|---|---|---|
| Tap seed to play | seed C = (W/2, 0.56 H), radius 48 | the press lasts 220 ms or more, or moves over 12 px. 220 to 600 ms at 12 px or less is a lifted hold: nothing happens (489). The code cannot tell a tap from silence caused by a muted seed |
| Double-tap seed to mute | same | two taps under 220 ms each but the second lift later than 280 ms after the first: two transport toggles instead (489). Only visible result of a mute is the seed turning from a filled disc to a ring |
| Seed still hold to the menu | same | lifted between 220 and 600 ms with 12 px or less of movement: ring filled part way and vanished, no menu. Moved over 12 px first: a branch grows instead (465, 489). The ring shows only from 60 ms (598) |
| Drag from seed to branch | same | lift with no anchor and under about 90 px from C (m under 0.25): nothing planted, `endBranch` leaves the seed as it was (396) |
| Rest to anchor | the finger, 450 ms | rest with m of 0.06 or less (under about 51 px from C on the first segment, 19 px later), or moved over 5 px in the 450 ms, or four anchors already: no anchor, no feedback (388, 502) |
| Lift on the anchor to park | the anchor, 10 px | lifted more than 10 px off the anchor with anchors in the chain: it plants and replaces the seed instead of parking (389, 396). Undo recovers it |
| Parked branch tap cycle | parked dot, radius 22, where the anchor was left | moved 10 to 12 px: a drag of the branch, not a tap. Three states, no label: off, on and focused, focused (485-486) |
| Drop on the seed to remove | within 46 px of C | lift farther than 46 px from C: the branch stays (485) |
| Hold left-edge dot to a category menu | x = 26, y = round(0.3 H) + 55 i, i = 0..4 | lift under 220 ms, or moved over 12 px first: nothing happens, no cue (465, 489-490) |
| Menu pick by angle | the bud ring around the dot | a pick needs 0.72 × the ring radius from the anchor and 110 ms since the last pick; short of that the finger is just on the dot (473) |
| Menu value dwell, then slide | a base, level, amount or gene bud | the finger moves over 4 px during the 350 ms, or strays over 30 px from the bud: no adjust starts. No cue until the value readout starts to follow the finger (503-504) |
| Lift on a value without sliding to open the wheel | the same bud | finger moved 8 px or more during the adjust, or the gene is a list: the value is kept, no wheel (487, 427) |
| Hold the bottom-right dot to open the gene spiral | (W − 34, H − 34), radius 30 | lift under 220 ms, or moved over 12 px first: nothing happens (465, 489-490) |
| Rest on a spiral dot to slide it | dots of `gpos(i)`, within 24 px | finger moves over 4 px before 350 ms, or lifts: the hover readout only, no change (457, 480, 505) |
| Hold or drag the top-right dot for the setup dial | (W − 34, 34), radius 30 | none: a tap cycles the setup, a hold opens the dial. Distance under 56 px keeps the setup, so a short drag changes nothing (459) |
| Tap the top-left dot for layers on or off | (34, 34), radius 30 | lift over 220 ms: it opens the layers menu instead. Moved over 12 px before 220 ms: nothing (465, 490) |
| Tap a layer dot to turn off one layer | (62 + 22 i, 34), radius 12, only after a layer is set | moved over 12 px: nothing. The dots appear only when a layer is active, so a fresh synth shows none (484, 529) |
| Right-edge dot: tap places the last 30 s and jumps to the editor | (W − 30, round(0.4 H)), radius 30 | nothing gathered, `AT` missing or capture worklet failed: no take, no jump, no message (303, 312). Gathered time shows in the readout only while the finger is down |
| Right-edge dot: drag down to choose a length | same, then down the edge from y = 0.4 H + 24 | less than 17 px down, or sideways first: it is not a selection, and if moved over 12 px the release places nothing (464, 483). The 40-dot track shows only after touch-down |
| Two-finger tap to undo | anywhere on the canvas | second finger lands during a branch, spiral, menu, dial, parked drag or right-edge selection; or the pair lasts 450 ms or longer; or either finger moves 12 px or more; or a third finger lands; or nothing is on the undo stack: nothing happens (439, 452, 478, 229) |
