# Tuner — a pitch line, a note on a dot grid, and an A4 reference

Audit of `audio/t/tuner.html` as coded, 2026-10-30. Line numbers are in that file unless the Code column says `wheel.js` or `shared.js`.
One WebGL canvas fills the frame. Everything is drawn in one shader, so there are no DOM controls except the microphone icon.
Coordinates below are in px inside the frame (`W` wide, `H` high, origin top-left).

## Gestures

| Where | Gesture | Result | Code |
|---|---|---|---|
| Anywhere except the A4 zone and the mic dot, mic stopped | pointer down | starts the microphone (fires on touch-down, not on release). No hold, no move test | 190 |
| Anywhere except the A4 zone and the mic dot, mic running | pointer down | nothing | 190 |
| Mic dot, within 26 px of (W−34, H−28) | pointer down, mic stopped | starts the microphone | 189, 178 |
| Mic dot, same circle | pointer down, mic running | stops it: tracks stopped, analyser dropped, context closed | 189, 178, 175 |
| Mic dot or anywhere, while the permission request is pending | pointer down | nothing (`S.req` blocks a second request) | 179 |
| Mic dot or anywhere, after a refusal or failure | pointer down | tries again; the icon shows `microphone-off` until a request succeeds | 177–184, 244 |
| A4 zone, within 34 px sideways and 26 px up or down of (W−34, 34) | pointer down | arms the A4 tap and captures the pointer. Never starts the microphone | 167, 188 |
| A4 zone | pointer up, moved less than 10 px in total and released inside the zone | opens the A4 wheel. No time limit, so a long press that stays still also opens it | 191–193 |
| A4 zone | pointer up after 10 px or more of movement, or released outside the zone | nothing | 191–193 |
| A4 zone | pointer cancel | nothing | 193 |
| Anywhere, wheel open | pointer down | ignored by the tool (the wheel covers the screen) | 187 |
| A4 wheel, drag on the column | vertical drag spins 1:1, release flings | choose 415–466; value shown on the wheel only, detection does not change yet | `wheel.js` 239–266, 185 |
| A4 wheel, tap on the centre row | less than 8 px and under 450 ms, not on a spinning column | commits, closes | `wheel.js` 257–262 |
| A4 wheel, tap on another row | same limits | scrolls that row to the centre (animation constant 12), stays open | `wheel.js` 261–265 |
| A4 wheel, tap outside the panel | same limits | commits the value on the wheel and closes | `wheel.js` 259 |
| A4 wheel, cancel x, within 22 px of (panel right edge − 14, panel top − 20) | same limits | closes with no change | `wheel.js` 234, 258 |
| A4 wheel, finger catches a flinging column | touch | stops the fling; the lift is then not a tap | `wheel.js` 233, 261 |
| A4 wheel, pointer cancel | system interruption | the column snaps to a row, stays open | `wheel.js` 255 |
| A4 wheel, mouse wheel | scroll | spins the column, snaps 110 ms after the last tick (desktop) | `wheel.js` 268–273 |
| A4 wheel, keys | Up, Down, Enter, Escape | one row, commit, cancel (desktop) | `wheel.js` 274–281 |

The wheel hangs 156 px below the A4 readout (anchor (W−34, 190) in the page), pushed to stay inside the safe area and out of the hub corner (`wheel.js` 148–150). It opens on the stored value. Commit saves it and clears the cents cache (172).
Not handled: second finger, drag, long hold, flick, screen-edge dots (the bottom-left hub belongs to the shell, see `shell.md`). A second finger down while stopped starts the mic like any other touch. A second finger in the A4 zone replaces the armed A4 tap.

What the screen does with no gesture:

- Pitch is read every 70 ms (201). A note counts once two reads in a row give the same note, or when no note is shown yet (206).
- The line splits into strips from 2 cents off, fully split at 13 cents (213). Green and a straight line after 0.35 s within 3 cents; it unlocks beyond 5 cents or when the sound stops (214–215).
- Text refreshes every 120 ms. Note letter, sharp sign, octave (0–9), cents, and Hz with one decimal (219–225).
- The A4 number at the top-right is drawn at 55 % when it is 440 and full white otherwise (242).

## Reads and writes

- `AT.mic()` (`shared.js` 255): `getUserMedia` with echo cancellation, noise suppression and auto gain all off, then a resume of every context. The tool makes its own `AudioContext` inside the pointer-down (180) and joins the stream when granted. It does not use `AT.worklet`, so analysis runs on the main thread from an `AnalyserNode`, `fftSize` 4096.
- `AT.session.load('tuner')` once at load (164): key `audio.session.tuner`, value `{a4}`. Accepted only when 415–466, rounded. Guarded by `window.AT`.
- `AT.session.save('tuner', {a4})` on wheel commit (172). A failed write reports through `AT.onError`.
- `shared.js` also resumes every `AudioContext` on touch end and after an interruption, and sends the ready signal two frames after load.
- Not used: `AT.tempo`, `AT.takes`, `AT.place`, `AT.go`, `AT.wake`, `AT.onLeave`, IndexedDB, BroadcastChannel. Nothing is written to `localStorage` directly.
- `window.__S` is the test hook (249).

## URL switches

`?perf` only, through `shared.js` (frame-time overlay).

## Limits

- Detection range: lag 1/1500 s to 1/52 s, so about 52–1500 Hz (151). Strings below 52 Hz give no note. The octave readout is clamped to 0–9 (221).
- Gate: RMS under 0.0005 gives nothing (152). A read needs more than −63 dBFS and a confidence above 0.85, or above 0.9 when under −45 dBFS (204). The level display maps −66 to −30 dB to 0–1, and the strips and note need level above 0.08 (202, 210).
- A4 is whole Hz only, 415–466. The stored value is read once at load, so another open copy of the tool does not follow.
- The microphone is not stopped when the page is hidden or when the track ends. The code listens to neither `visibilitychange` nor the track `ended` event. Leaving the tool through the shell unloads the frame and ends it.
- If `AT` is missing (`shared.js` failed to load) the mic start throws at 182, since only the session load is guarded.
- If the `AudioContext` cannot be created, `micFail` is set and no request is made (180).
- WebGL is required; without it the frame shows a text message only (80). The shader compile result is not checked.
- The canvas pixel ratio is capped at 2 (135). Size is read at load and on window resize.
- `S.req` is cleared on grant or refusal. A request that never settles leaves every tap dead.

## Differs from the spec

- The spec says the tuner falls back to a test signal when the mic is refused. As coded there is no test signal; a refusal shows `microphone-off` and a tap retries (MATRIX T6, T8, owner rule).
- The spec has no A4 control. As coded the top-right shows the A4 number and a tap opens a wheel (MATRIX K7). The spec lists the A4 reference as an open question.
- The spec's open items, lock window, flats and sharps, drone, are partly decided in code: lock is 0.35 s within 3 cents, sharps only (no flats), no drone. MATRIX T7 still says n/a.
- The spec's corner rule gives top-right to "source or setup (mic / test / file / takes)". The tuner puts the A4 reference top-right and the mic dot bottom-right, where the spec puts "properties".
- The spec says the mic dot starts and stops the mic. As coded a tap anywhere also starts it, but only the dot stops it. MATRIX T1 says only "mic dot starts/stops".
- MATRIX T9 says the gate was lowered to −63 dBFS. This matches the code. MATRIX numbering has T7 after T9 and no T10.
- MATRIX T4 text says strips "bend into an S". The S comes from a 24-step history, 50 ms apart (233), and is only visible while the pitch is off and moving.

## Test status

From `audio/MATRIX.md`.
Pass: T1, T2, T3 (harness `audio-tuner`, 2026-10-09), T6, T8 (`tuner-real`), T9 (`tuner-voices`), K7 (`tuner-wheel`); S18 covers the tuner with the shared unlock (`ios-audio`).
Todo: T4 (straight line in tune, strips taper and bend; harness plus device), T5 (silence gives a hair-thin line).
N/A: T7 (lock window, flats and sharps, drone).
Nothing in MATRIX covers: the mic dot stop, a second finger, the wheel cancel x and outside-tap, a hidden page with the mic open.

## No visible cue

1. **Tap the A4 number to open a wheel.** Target: the number at the top-right, centre (W−34, 34); the drawn digits are only 35 × 16 px, the hit zone is 68 × 52 px (x within 34, y within 26). Nothing on screen says it is a button, and at 440 it is dimmed to 55 %. The code can tell a failed try: a pointer down in the zone that ends with 10 px or more of movement, or that ends outside the zone (192). It does nothing then and keeps no record.
2. **Tap the mic dot to stop.** Target: the circle at (W−34, H−28). A tap anywhere else while listening does nothing (190). The outline-versus-filled circle shows the state but not that it is the only stop. Failed try: pointer down more than 26 px from the dot while `S.mic` is 1.
3. **Tap anywhere to start listening.** There is no label. The sr-only heading says it (71), the screen does not. Failed try: none; any touch outside the A4 zone starts it.
4. **Retry after a refusal.** The icon changes to `microphone-off` (244). If the browser then blocks the prompt, a tap changes nothing. Failed try: `S.micFail` still true after a tap (the request was rejected again, 184); the page shows no reason.
5. **Wheel: tap outside the panel commits.** A person who taps outside to dismiss keeps the value on the wheel. The cancel x sits 20 px above the panel's top-right corner, at (left + panel width − 14, top − 20), radius 22. Failed try: a down outside the panel that lasts 450 ms or more, or moves 8 px or more, is neither commit nor cancel, and the wheel stays open (`wheel.js` 257–259).
6. **Wheel: tap a row to scroll it to the centre, tap the centre to confirm.** No hint. Failed try: a tap that moves 8 px or more, or takes 450 ms or more, is read as a drag and fling (`wheel.js` 257, 264).
7. **Wheel: catching a flinging column.** A tap on a spinning column only stops it and does not confirm (`wheel.js` 233, 261). The person has to tap again.
