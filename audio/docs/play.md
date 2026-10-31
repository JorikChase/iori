# Practice player — a take scrolls past a fixed playhead, with speed, pitch, loop and trainer

Audit of `audio/t/play.html` as coded, 2026-10-30. The tool is one WebGL canvas (`#pc`) in a box (`#pb`) that fills the tool frame. W and H below are the box width and height in px. All coordinates are box-local.
Line numbers are `audio/t/play.html` unless a file is named. The tool uses the wheel picker (`audio/wheel.js`) and the audio engine `audio/worklet-player.js`.

## Gestures

Hit tests run in this order on pointerdown (`play.html:279-285`): source dot, trainer dot, play dot, readouts, waveform. The first that matches owns the press. One press is tracked at a time (see Limits).

| Where | Gesture | Result | Code |
|---|---|---|---|
| Play dot, bottom centre, hit radius 36 px around (W/2, H−46), drawn radius 20 | tap (release with at most 8 px of travel, any duration) | play or pause. Starts the AudioContext and loads the worklet on the first touch-down. A play tap while the worklet is still loading is remembered and plays when the node exists. The screen does the e-ink refresh: 70 ms inverse flash, 70 ms hold, then 5 steps at 56 ms each, done 364 ms after the tap. Dark means playing | `279-283`, `301`, `266`, `314` |
| Play dot | hold, no move | same as a tap on release. There is no hold meaning and no time limit | `301` |
| Play dot | drag, more than 6 px from touch-down | both axes at once, no axis lock. Speed = speed at touch-down + dx × 0.0025, rounded to 1 %, clamped 50 to 150 %. That is 1 % per 4 px. Pitch = pitch at touch-down − round(dy / 14), clamped −12 to +12. Up raises pitch, 14 px per semitone. The dot leans toward the finger up to 40 px and a small blob buds off it. Applied live to the engine. Release does not toggle play when travel passed 8 px | `288-289`, `300`, `317-323` |
| Play dot, empty player (no take loaded) | any touch | nothing. The press is not even recorded. The dot is a hollow ring at 0.3 opacity | `283`, `321`, `341` |
| Source dot, top right, hit radius 28 px around (W−34, 34), drawn radius 13 | tap (up to 8 px travel) | library not empty: a tap-mode take wheel opens. Library empty, or `Wheel` not loaded: the system file picker opens at once | `242`, `302` |
| Source dot | press, drag more than 8 px, release (only when the library has a take) | one-gesture wheel in drag mode. It opens when travel passes 8 px, sits at an anchor 198 px below the box top (not under the finger) and spins 1:1 from the touch-down point. The release commits the row it is on. Dragging down walks back through older takes | `287`, `240`, `245-248` |
| Source dot, empty library | press, drag more than 8 px | nothing happens. The wheel is only opened when the library has a take, and the release returns on travel above 8 px | `287`, `300` |
| Source wheel rows | pick a row | top row OPEN FILE, then the library oldest to newest downward. The row of the current take is marked and is where the wheel opens, else the newest. A take row loads that take unless it is the current one. OPEN FILE opens the system picker inside the commit gesture; the chosen file is imported to the library and loaded. Picker cancel changes nothing | `243-246`, `241` |
| Tap-mode wheel (source or value) | flick the drum | spins and settles on a row | `wheel.js:229-267` |
| Tap-mode wheel | tap (under 8 px and under 450 ms) on the centre band, or anywhere outside the panel | confirms the row under the band | `wheel.js:257-263` |
| Tap-mode wheel | tap the x mark above the top-right corner of the panel (22 px radius around the panel's right edge minus 14 px, 20 px above its top) | cancels | `wheel.js:234`, `258` |
| Tap-mode wheel | tap a row off the band | scrolls that row to the band | `wheel.js:264` |
| Speed readout, big number, top centre, tap area x within 64 px of W/2, y 16 to 68 | tap (up to 8 px travel) | wheel 50 to 150, one row per percent, opens at the current speed. Hangs below the readouts (see the note under the table). The engine follows each row as it crosses. Commit keeps it. Cancel restores the speed and pitch from before. Needs a take loaded | `254`, `259`, `262-265` |
| Pitch readout, left of the pair, x within 36 px of W/2−40, y 66 to 96 | tap | wheel −12 to +12 with signs, opens at the current pitch. Same live follow and cancel | `255`, `260`, `262-265` |
| Tempo readout, right of the pair, x within 36 px of W/2+40, y 66 to 96 | tap | wheel of whole BPM from ceil(0.5 × take BPM) to floor(1.5 × take BPM). Sets speed = chosen BPM / take BPM (not rounded to 1 %, clamped 50 to 150 %). Does nothing when the take has no tempo (shows `--`) | `255`, `261-262` |
| Any readout | press and drag more than 8 px | nothing | `300` |
| Readouts overlap | y 66 to 68 inside x within 64 px of W/2 | the speed test runs first, so it wins | `254-255` |
| Trainer dot, bottom right, hit radius 28 px around (W−34, H−34), drawn radius 13 | tap (up to 8 px travel) | toggles the trainer. Icon `repeat` when off, `trending-up` when on. Works with no take loaded (the dot is only dimmed to 0.35) | `282`, `304`, `340` |
| Trainer dot | hold or drag | nothing | `300` |
| Waveform, y from 97 to H−85 (TOP 96, BOT H−84), whole width | tap (release within 220 ms, at most 8 px travel) | tap outside the loop: jump to the time under the touch-down point, clamped to the take. Tap inside the loop (its A to B, inclusive): clears the loop and does not seek. Not snapped to the beat | `285`, `299`, `313` |
| Waveform | drag more than 8 px while less than 220 ms have passed since touch-down | scrub. The take position follows the finger one to one at 42 px per second. Dragging down goes back in time. Playing continues from the new spot after release. Release changes nothing else | `292-293`, `298` |
| Waveform | hold 220 ms without moving more than 8 px | loop mode starts, checked once per frame. A loop selection starts at the touch-down time | `313` |
| Waveform, loop mode | drag up or down | the selection runs from the touch-down time to the finger's time. Both ends snap to half-beats (60 / BPM / 2 s from the beat offset) when the take has a tempo, else they are raw. The selection is clamped to 0 and the take length and shows green | `291`, `276` |
| Waveform, loop mode | release | selection of at least 0.25 s becomes the loop, the pass count resets and playback jumps to the loop start (it stays paused if it was paused). A shorter selection is dropped without a sound or mark. A new loop replaces an old one | `297` |
| Waveform | pointer cancel in loop mode | selection dropped, the old loop stays | `295` |
| Waveform, empty player | any touch | nothing | `285` |
| Both dots and readouts, running vs stopped | none differs | the gestures are the same running or stopped. Running only changes colours, the playhead motion and, for the trainer, the speed | `301-304` |
| Two-finger | none | nothing is read | `279-305` |

Note on the value wheels: all three hang below the readout block. The anchor is box top + 88 + 8 + 30 + 110 = 236 px for the centre of the band (`240`, `259-261`, `263`), with x at W/2, W/2−40 and W/2+40. The source wheel's band is centred at x = W−34, y = 198 (`240`, `244`).

## Reads and writes

- `AT.takes.list()` on open, on every `AT.onTakes` event, and after a file import (`201`, `360`). It feeds the wheel and the source icon.
- `AT.takes.get(id)` when a take is chosen or restored (`189`). Reads meta and PCM from IndexedDB `audio`, returns mono Float32.
- `AT.takes.pick()` from OPEN FILE and from the empty-library source tap (`241`). It imports through `AT.takes.put` (IndexedDB `meta` and `pcm`, a persistent-storage request, and a `takes` broadcast).
- `AT.session` key `play`, in localStorage as `audio.session.play`: `{id, pos (s, 2 decimals), speed, semi, loop {a,b} | null, trainer}`. It is written only when a take is the source and the JSON changed (`198-200`). Triggers: a take loads, play toggles, a value wheel closes, `visibilitychange` to hidden, `pagehide`, and every 500 ms or more from the frame loop (`329`, `362-363`). It is read once at open: speed, pitch and trainer apply at once; the take, position (when 0 < pos < length) and loop (when b > a and b ≤ length + 0.01 s) apply when the take has loaded (`356-359`, `192-194`). Play state is never restored.
- `AT.onTakes` refreshes the list only. A take deleted elsewhere stays loaded here.
- `AT.onTempo` calls `beatGrid()` (`361`). The tool does not read `AT.tempo()` and never calls `AT.setTempo`. The grid, snap and tempo readout use the take's own estimate (`166-185`).
- BroadcastChannel `audio`: listens through `AT.onTakes` and `AT.onTempo`. Sends nothing itself, apart from the `takes` broadcast of an import.
- AudioContext, created on the first touch-down on the play dot or the first play tap (`211`). It is never closed or suspended by the tool. `shared.js` resumes it on every touch end and after iOS interruptions. The worklet `../worklet-player.js` (processor `practice-player`) is added there and connected to the output (`214-216`). No microphone.
- The take crosses to the audio thread once, transferred, with a 4× averaged copy for the alignment search; the page then holds only the envelope and onsets (`220-222`). After that only `state` messages go (`225`). The worklet reports its position every 3 render quanta and once after each state message (`229`, `worklet-player.js:152`).
- Not used: `AT.mic`, `AT.wake`, `AT.place`, `AT.go`, `AT.preload`, `AT.onLeave`, `AT.storage`, `AT.onError`. The shell can pause the drawing with `AT.pauseDraw` during a sweep (rAF callbacks are held).
- Test hook: `window.__S` (`364`). `window.__HOLD` overrides the 220 ms hold (`269`).

## URL switches

- `?engine=ola` selects plain overlap-add in place of WSOLA (`210`).
- `?perf` is read by `shared.js` and adds the frame-time overlay.

## Limits

- Needs WebGL. Without it the box shows one line saying so and nothing else runs (`80`).
- Needs `AudioWorklet`. With none (`S.eng = 'none'`) or when the module fails to load (`S.eng = 'error'`) there is no fallback: the play dot still toggles and goes dark, no sound plays and the position does not move. Nothing on screen says so (`212`, `217`, `230`).
- The loop trainer adds 5 % per loop pass only while a loop exists and speed is under 100 %. It stops at 100 %, never lowers a speed above 100 % and does nothing without a loop (`worklet-player.js:101-102`, the speed test is on line 102). The pass count is not shown. The saved speed includes the trainer's raises.
- At the end of the take, playback wraps to 0 and keeps playing (`232`, `worklet-player.js:105`).
- A take is analysed on the main thread when it loads: envelope at 50 frames a second, onsets at 100, then the tempo search (`157-185`). A long take blocks the page for that time. No length limit is enforced.
- The tempo is the take's own: autocorrelation over 50 to 215 BPM, kept only when confidence is 0.25 or more, and only for takes of at least 2 s. Otherwise BPM is 0: no beat dots, no snap, the tempo readout shows `--` and is not tappable (`169-179`).
- Beat dots mark every beat on the left edge (x = 20), with a bigger dot every 4th beat from the beat offset (shader). A bar is always 4 beats.
- One press at a time. A second finger replaces the current press, and any pointer's move or up acts on it, because the handlers do not compare pointer ids (`279`, `286`, `294`).
- The position display runs from the worklet's reports and the audio clock (at most 0.1 s of extrapolation). If the context is not `running`, the playhead stays still while the play dot says playing (`230`).
- A take that cannot load (missing, empty, or removed) leaves the player empty with no message. Its restored speed and pitch stay (`189`).
- The take id in the session is not cleared when that take is deleted in another tool.
- There is no time readout, no loop pass counter and no undo.
- The check `!(p.x<70&&p.y>H-70)` on the waveform press can never be true, because the waveform stops at y = H−84 (`285`). The shell's 104 × 104 hub corner is outside the waveform anyway.
- A tap on the waveform seeks to the touch-down y plus the time that has passed since, because it uses the current position (`299`). While playing, it lands up to 0.22 s × speed later than the touched time.
- During a loop drag while playing, the end of the selection is computed from the current position, so it drifts with the scroll while the finger is still (`291`).
- A play-dot drag of 6 to 8 px changes speed or pitch (dx of 2 px already moves speed by 1 %, dy of 7 px moves pitch by 1) and then the release still toggles play, because the toggle threshold is 8 px (`288`, `300`).
- The speed set by the tempo wheel is not rounded, so the speed readout rounds it for display only (`262`).
- The panel readouts rewrite only on text change, at most every 90 ms (`325`).
- Orientation: the box fills the frame, and the size is re-read only on window `resize` (`139-140`).

## Differs from the spec

- Source: the spec cycles through a demo song, the three newest takes and a file. As coded, there is no demo. A wheel lists every take plus OPEN FILE, and the player is empty until one is chosen (MATRIX L6, K5).
- Value wheels on the readouts (speed, pitch, tempo) are not in the spec.
- The spec has "tap the loop to clear it" and a tap that jumps. Both are coded as one tap rule: inside the loop it clears and does not seek.
- Trainer: the spec says each pass adds 5 % to 100 %. As coded, it only raises speed that is below 100 % and only inside a loop.
- The e-ink refresh: the spec says 70 ms flash, 70 ms hold, 5 steps of 56 ms. The code reaches the final state at 364 ms: the first dither step lands at 140 ms and the fifth at 140 + 4 × 56 ms (`314`).
- Drag on the play dot: sideways and vertical act together from 6 px. The spec does not say there is no axis lock.
- The engine is WSOLA on an AudioWorklet. The spec's overlap-add prototype is kept only as `?engine=ola` (MATRIX W5).
- Tempo: the spec says the player shows the tempo at its speed from the shared tempo. As coded, it is the take's own estimate (`L3`, 2026-10-30). The `AT.onTempo` hook still calls `beatGrid()`, which recomputes the same answer from the same onsets (`361`, `182`) and has no visible effect.
- Session: the spec says it restores source and place. As coded, it also restores speed, pitch, loop and trainer.
- MATRIX P8 still says "three recent takes" and "open file"; the code has the full wheel.
- MATRIX P9 is `todo`, but W5 already records the same check as a pass (440.00 Hz at 75 %, 879.94 Hz at +12).
- MATRIX G4 lists the practice player in its text and its status says metronome only.
- The spec's bottom-right "properties" corner holds only the trainer here.

## Test status

From `audio/MATRIX.md`. Harness scenarios: `play-library`, `play-tempo`, `play-wheel`, `play-worklet`.

- Pass: P2 (play-library), P3 (play-library, 75 % advances 1.504 s per 2 s), P8 (play-library), L3 practice only (play-tempo), L6 (play-wheel), L11 (play-library), W1 (worklet-static, play-worklet), W5 (play-worklet), K5 (play-wheel), K8 (play-wheel), K10 (play-wheel).
- Todo: P1 (waveform, dimming, beat dots), P4 (readouts), P5 (scrub, tap jump), P6 (loop mark, snap, tap to clear), P7 (loop trainer), P9 (speed and pitch independent), G14 (accent colours).
- Pass for metronome only: G4 (white stopped, dark running).
- Not built: P10 (n/a).

## No visible cue

Each item lists the target, then the condition that means the person tried and failed, where the code can tell.

- **Hold then drag to mark a loop.** Target: the waveform, y 97 to H−85, anywhere. Nothing on screen says to hold. Failed when `S.press.mode === 'loop'` ends in a release with `S.sel.b − S.sel.a < 0.25` s (`297`). The selection vanishes with no mark. Also failed when the finger moved more than 8 px before 220 ms: that becomes a scrub, not a loop.
- **Tap the loop to clear it.** Target: the green region of the waveform, between the loop's A and B. Nothing says it is a control. The code cannot tell a failed attempt: a tap just outside the loop seeks (`299`).
- **Scrub by dragging the waveform.** Target: the waveform. Failed when the finger starts moving after 220 ms with travel under 9 px: loop mode has started instead (`313`), and a drag that ends with `mode === 'loop'` and a selection under 0.25 s is the failed scrub.
- **Tap the waveform to jump.** Target: the waveform. Failed when the press lasts past 220 ms without moving more than 8 px: loop mode starts and the release then does nothing (`297`).
- **Tap a readout to set it exactly.** Target: speed (x within 64 px of W/2, y 16 to 68), pitch (x within 36 px of W/2−40, y 66 to 96), tempo (x within 36 px of W/2+40, y 66 to 96). The numbers do not look pressable. Failed when `pr.k === 'read'` and `pr.moved > 8` (a slide on the number, `300`). Failed on the tempo area when `S.song.bpm` is 0 (`255`): no press is recorded.
- **Drag the play dot sideways and vertically.** Target: the play dot at (W/2, H−46). Nothing says it also moves. Failed when travel stays under 6 px (it is a tap and toggles play on release, `301`) or no take is loaded (`283`: no press is recorded).
- **Play dot on an empty player.** Target: the hollow ring. Failed on any touch within 36 px of (W/2, H−46) while `S.song` is null (`283`). The only cue is the source dot breathing (radius 13 to 16, `322`).
- **Press-drag the source dot.** Target: (W−34, 34), radius 28. Nothing says a drag opens the wheel in one gesture. Failed when `pr.k === 'src'`, `pr.moved > 8` and `S.lib` is empty or `Wheel` is missing (`287`, `300`).
- **Source wheel order.** Target: the wheel. OPEN FILE is the top row, the take list runs oldest to newest downward (`243-244`). Nothing labels this.
- **Dismiss a tap-mode wheel.** Target: anywhere outside the panel. It confirms the row under the band instead of cancelling (`wheel.js:259`). Cancel is the x above the panel's top-right corner. The code cannot tell the person meant to cancel.
- **Loop trainer.** Target: the bottom-right dot at (W−34, H−34), radius 28. Nothing says what the two icons mean or that a loop is needed. It does nothing when `S.trainer && (!S.loop || S.speed >= 1)`. The pass count is kept in `S.pass` and not drawn.
- **No beat grid.** Target: the waveform. When the take has no steady pulse (`S.song.bpm === 0`), there are no beat dots, loops do not snap and the tempo readout shows `--`. Nothing says why.
- **Audio engine missing.** Target: the play dot. When `S.eng` is `'none'` or `'error'`, play looks active and is silent. Nothing says so.
