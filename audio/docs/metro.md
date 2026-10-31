# Metronome — a ring of beat marks, the tempo in the middle, a play button at the bottom

Audit of `audio/t/metro.html` as of commit 5a04635, 2026-10-30. The hint calls added since move later lines by a few. Line numbers are in that file unless another file is named.
The tool runs in an iframe under the shell. It loads `../shared.js` and `../wheel.js`. One WebGL canvas draws everything;
there is no DOM control. The page is a box of the full frame: width W, height H, ring centre C = (W/2, 226), ring radius R = 128 (155, 156).
All coordinates below are in that box, in CSS px, from its top-left corner.

## Gestures

There are three touch zones, tested in this order on touch-down (185-191): the play button, the centre, the ring.
Distances are from C unless said otherwise. The same handlers serve touch, pen and mouse. There is no multi-touch code.

| Where | Gesture | Result | Code |
|---|---|---|---|
| Play button, within 26 px of (W/2, H−34) | touch-down (not lift) | starts or stops at once. The first press makes the AudioContext. Stopped to running: first click 60 ms later, beat 0 first. Running to stopped: `run` goes false, clicks already queued (up to 120 ms ahead) still sound. No drag follows; the touch is ignored after this | 187, 168-173 |
| Centre, distance < 84 (R − 44) | tap: lift, moved ≤ 8 px, lifted before 350 ms | tap tempo (see next row). Fires on `pointerup` only, not on cancel | 189, 197, 174-175 |
| Centre | tap tempo detail | keeps taps from the last 2.5 s. From the second tap: takes the median interval (upper median for an even count, after sorting), sets tempo to 60 / median, rounded to 0.1, clamped 20–300. So the slowest it can read is 24. Each tap also dims the digits to 55 % for a moment (`tapA`, decays at 0.002^dt) | 174-175, 222, 123 |
| Centre | hold still 350 ms (`setTimeout`, not event time); moved < 8 px the whole time | opens the tempo digit wheel (next row). The lift that follows does nothing | 179, 190 |
| Centre | hold, then wheel gestures | wheel in `tap` mode, anchored on C, stays open after the finger lifts. Four columns: hundreds 0–3 (no loop), tens, ones, tenths (these three loop, each on its own with no carry), separator `.` before the last. Range 20.0–300.0; `fix` bounces anything outside back in. Shows the current tempo (rounded to 0.1). Light colours when the screen is white. Nothing changes until it closes: no live tempo while turning. Commit sets the tempo exactly. Cancel leaves it | 180-184 |
| Wheel (wheel.js) | drag a column up or down | spins that column 1:1 with the finger (44 px per row), fling on lift | wheel.js 239-252, 213 |
| Wheel | tap (moved < 8 px and < 450 ms) | on the centre band (within 22 px of its middle): commit and close. On another row: scrolls that row to the band. Outside the panel: commit and close. On the small x above the panel's top-right corner (centre (right − 14, top − 20), radius 22): cancel | wheel.js 253-267 |
| Wheel | keys and mouse wheel | Enter commits, Escape cancels, arrows move, mouse wheel spins | wheel.js 268-292 |
| Wheel | where it sits | centred on C, pushed inside the safe area, 34 px lower than the top edge, and clear of the bottom-left 104 × 104 hub corner | wheel.js 138-151 |
| Centre | drag: move more than 8 px (strictly) | drag mode, no wheel, no tap tempo. At 8 px or more the hold timer is cleared; the drag mode starts above 8 px | 192-193 |
| Centre, drag | sideways | tempo = start tempo + dx × 0.3 BPM per px, rounded to 0.1, live, clamped 20–300. Measured from the touch-down point, not the last move | 193 |
| Centre, drag | up or down | beat count: `logN` = start + dy / 260 × ln(150), N = round(e^logN), limited 2–300. 260 px up multiplies the count by 150. Up is more beats | 193, 147 |
| Centre, drag | axis lock, from the angle of the whole drag from its start point | angle < 0.26 rad (14.9°) from horizontal: dy = 0, so the count returns to its start value. Angle > 1.31 rad (75.1°) from horizontal: dx = 0, so the tempo returns to its start value. Between the two: both change. The lock is recomputed on every move, so it follows the finger back and forth | 193 |
| Centre, drag | lift | if the last move had a sideways part (`bx` not 0): tempo rounds to a whole BPM. Always saves count and accents. Also runs on cancel | 197 |
| Ring, distance 84 to 238 (R + 110) at touch-down | tap: lift, moved ≤ 8 px, no time limit | accent tap, when the lift is 88 to 168 px from C (`abs(r − R) < 40`). Anywhere else in the zone: nothing (the 84–88 strip and the 168–238 band) | 191, 198-199 |
| Ring | accent tap, what it hits | the mark nearest in angle to the lift point. Not the mark under the finger: any point in the 80 px wide band picks the closest mark by angle. Angle is clockwise from 12 o'clock. Marks are laid out clockwise from 12 o'clock, mark 0 centred at the top, mark k at k / N of the circle when the marks are settled (during the spring they use the live widths). Only marks below the beat count N count | 199, 215 |
| Ring | accent tap, what it does | cycles that mark: normal, accent, muted, normal. Normal = filled, base size 18. Accent = filled, size 26, click 1760 Hz at gain 0.5. Normal click 1100 Hz at gain 0.32. Muted = hollow grey outline (0.45), silent. The mark pops (0.6) and the state is saved | 176, 164-165, 113, 116 |
| Ring | drag: move more than 8 px | turns the tempo like a dial: change = angle moved / 2π × 120 BPM × gear. Clockwise raises it. Gear by the finger's current distance: < 168 (R + 40) = 1; < 218 (R + 90) = 0.2; further = 0.04. The first 8 px give no change (the previous angle is tracked from touch-down, so nothing jumps afterwards) | 194-195 |
| Ring, drag | lift | rounds to a whole BPM only if the last move was inside gear 1 (inside 168 px). Gears 0.2 and 0.04 leave the fraction. No save | 200 |
| Running, any of the above | same gestures | same. Tempo changes keep the beat phase and the next beat does not jump. Count changes apply at once to the clicks queue (`index % N`) | 163, 166 |
| Stopped, any of the above | same gestures | same. Tempo and count can be set while stopped. The screen is white | |
| Beyond 238 px from C, outside the button | any | nothing. The touch is captured and dropped | 191 |
| Second finger while one is down | touch-down | replaces the current drag with a fresh one (start point = the second finger). Move events from both fingers go to that one drag. A lift of either ends it. No two-finger gesture exists. Not a feature, just what the code does | 185-201 |
| Wheel open | touch-down on the tool | ignored. The wheel's own overlay covers the screen anyway | 185 |
| Whole box | long press, right click | context menu suppressed | 202 |
| Screen-edge dots | none | The tool has no edge dots, no corners, no hub code. The bottom-left hub belongs to the shell | |

## Reads and writes

- `AT.tempo()` once at load: initial tempo. `localStorage` `audio.tempo`, 20–300, else 100. If `shared.js` is missing the tool starts at 120 (148).
- `AT.setTempo(bpm, 'metro')` on every tempo change, including every move event of a drag (161). It rounds to 0.1, writes `audio.tempo`, and broadcasts `{t:'tempo'}` on BroadcastChannel `audio`. Broadcasts are sent at most once per 60 ms, with a trailing one 70 ms later.
- `AT.onTempo` (162): another tool's tempo (source not `metro`) is applied to the running clock. The metronome does not echo it back.
- The tool's own `S.bpm` is not rounded by the ring dial at gears 0.2 and 0.04. Only the stored and broadcast value is.
- `AT.session.load('metro')` at load and `AT.session.save('metro', {n, st})` (152-154). Key `audio.session.metro` in `localStorage`. `n` is the beat count, `st` the first 300 mark states (0 muted, 1 normal, 2 accent). On load `n` must be 2–300 and each state 0, 1 or 2. Defaults: N = 4, all normal, mark 0 an accent (150). Saved after an accent tap and after a centre drag. Not saved after a wheel commit (it does not touch the count). The tempo is not in the session; it is the shared one.
- Not used: `AT.takes`, `AT.place`, `AT.go`, `AT.preload`, `AT.onLeave`, IndexedDB, microphone, `AT.wake`, `AT.onError`.
- Audio: one `AudioContext` made on the first play press and never closed or suspended. Each click is a triangle oscillator with a 2 ms attack and a 60 ms decay. A 25 ms `setInterval` queues clicks up to 120 ms ahead on the audio clock (166-167). The ring's drop uses `outputLatency` so the picture follows what is heard (207).
- `shared.js` resumes every `AudioContext` on each touch end and after an interruption. The press creates the context; the lift unlocks it on iOS.
- Ready signal: `shared.js` tells the shell two frames after load. While the shell pauses drawing (`AT.pauseDraw`) the tool's frame callbacks are held and the audio keeps running.
- Test hook: `window.__S`.

## URL switches

None of its own. `?perf` is read by `shared.js` and adds the frame-time overlay, with `lat` (base and output latency) once the context exists.

## Limits

- Tempo 20.0–300.0. Beat count 2–300 (`NMAX` 300; the arrays hold 512). Count through the drag only; the wheel sets tempo only.
- Leaving the tool unloads its frame (no `AT.onLeave`), so the clicks stop. The metronome does not run across tools.
- No wake lock. The screen can dim and lock while it runs, and the audio then follows the phone's lock rules.
- At high counts the marks are very thin. At N = 300 they are about 2.7 px apart on the ring (804 px round), so an accent tap picks by angle and a finger cannot choose reliably. The drop hides once the mark width limit `T` falls to 4 or less (about 121 marks); marks become strips below about 27.
- Accent and mute state belong to the mark's index. Reducing the count and raising it again keeps the earlier states (up to 300 are saved). The queue uses `index % N`, so changing N while running changes which state each click uses mid-bar and the drop jumps (`pos = beats % N`).
- The play press is on touch-down, the lift is what unlocks audio on iOS. A very quick tap is fine; a press that is cancelled before lift stays silent until the next touch end.
- A centre drag that goes vertical sets the tempo back to its start value (dx = 0 gives start + 0). A drag that goes horizontal sets the count back to its start value. This is by the lock, not a bug in itself, but a person who swings through steep angles loses the tempo change.
- The play button is 52 px wide to hit, drawn 34 px across. On a very short frame (H < about 500) the ring zone reaches the button; the button wins.
- Hold uses `setTimeout`, tap tempo uses `performance.now()`, the e-ink steps use the frame clock. None use the event's own timestamp.

## Differs from the spec

- The spec says tap the centre to start or stop. As coded the start/stop is a button at the bottom centre; a tap in the centre is tap tempo (MATRIX M1 says the same).
- The spec's drag is "diagonal changes both, the count matching the drag". As coded there are angle locks at 14.9° and 75.1° (193). MATRIX M4 does not mention the locks.
- Not in the spec: the tempo wheel on a still hold (350 ms) in the centre, tap tempo (median of the last 2.5 s), accent and mute per mark, beat count and accents kept over a leave, a whole-BPM snap on lift. These are built (MATRIX K6 for the wheel; M9 for accents).
- The spec lists subdivisions as phase 4 and open. Not built. MATRIX M9 says "n/a" but its text says accents are built; the row has no test status for them. No MATRIX row covers tap tempo, the accent tap, or the 14.9° / 75.1° locks.
- The spec says all timing uses the touch event's timestamp. This tool uses `setTimeout` and the frame clock (see Limits).
- The spec says the e-ink refresh is a 70 ms flash, a 70 ms hold, then 5 dither steps of 56 ms. As coded: 0–70 ms flash on the old state, 70–140 hold, then at 140 ms the first of five steps, one every 56 ms, done at 420 ms (221). It uses the frame time. A press during a refresh starts from the picture as it is.
- The spec's "ring marks with no circle edge" and "drop swells the mark" are built. The drop is hidden at high counts; see Limits.
- MATRIX M1 text calls the bottom-centre dot the start/stop dot; that is right. The play icon becomes a stop icon while running.

## Test status

From `audio/MATRIX.md`, metronome rows only. Pass: M1 (harness motion-metro, diag-metro-clock), K6 (metro-wheel, still hold gives 137.5), L2 (writes the tempo live; the detector does not on open), G4 and G5 (metronome only so far), S16, S18 (metronome silent without the iOS unlock, works with it). Todo: M2, M3, M4, M5, M6, M7, M8, L1, G14. N/a: M9 (subdivisions; accents and persistence mentioned as built, scenario `metro-session` named in the row but the row has no status). No row at all: tap tempo, accent tap, the stopped/running state of each gesture, the 350 ms hold edge, the whole-BPM snap.

## Hints

| Hint | Trigger | Failed attempt | Done |
|---|---|---|---|
| `metro.accent` | the first start, 1.2 s after it. Ghost taps the second mark | a tap in the ring zone outside the accent band | `cycle` |

## No visible cue

Things a person cannot find by looking. Where the code can tell they tried and failed, the condition is given. The code never records a failed try for any of them, and nothing is shown after a failed try.

1. **Accent tap on a mark.** What is tapped: the ring itself, a quick touch with less than 8 px of movement, lifted 88–168 px from C = (W/2, 226). That is a band 40 px each side of the marks' radius (128), which is wider than the marks (about 18–26 px thick). It picks the mark nearest in angle (clockwise from 12 o'clock, mark 0 at the top), not the one under the finger. Nothing on screen says a mark can be touched; no hint, no highlight. The only feedback is the mark's pop and its change from filled to bigger to hollow. Tried and failed, if the code could tell: a lift outside 88–168 px from C (including the 84–88 strip and 168–238 px) with ≤ 8 px of movement does nothing. A touch that moves more than 8 px becomes a tempo dial.
2. **Tempo wheel by still hold.** Target: the tempo digits, any point within 84 px of C. Hold 350 ms without moving 8 px. A person who lifts at 349 ms gets a tap tempo tap instead (a tap that counts toward the next median and dims the digits). A person who moves 8 px or more in that time gets no wheel; at 8 px exactly the hold is cancelled but the touch is still a tap (it lifts as a tap tempo tap). The failed try is observable only as tap tempo: a lift under 350 ms, moved ≤ 8 px, in the centre.
3. **Tap tempo.** Target: the centre, within 84 px of C. Two taps within 2.5 s. One tap does nothing but dims the digits briefly. A person who waits more than 2.5 s between taps starts again (the earlier tap is dropped).
4. **Beat count by dragging up or down in the centre.** Nothing shows that the vertical axis exists. Condition for failure: a drag that is steeper than 75.1° keeps the tempo at its start value (dx = 0) while the count changes; a drag flatter than 14.9° keeps the count at its start value.
5. **Tempo by turning around the ring.** Target: the zone 84–238 px from C, dragged more than 8 px. Fine control by distance: inside 168 px full speed (120 BPM per turn, snaps to whole BPM on lift); 168–218 px at 0.2; beyond 218 px at 0.04. No guide marks the gear zones. A drag that starts in the ring but moves 8 px or less is read as a possible accent tap, and does nothing unless it ends in the 88–168 px band.
6. **Muted and accented marks.** Nothing explains the three states. Three taps return a mark to normal.
7. **Beat count and accents survive leaving.** No cue. They are saved on an accent tap or at the end of a centre drag (also on cancel).
