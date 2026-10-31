# Audio Tools — test matrix

One row per function in the spec (claude.ai/artifact/Wj9UFEEyyDuqTp4AadfTQN). `*.md` never deploys.

- **How** — `H`: headless harness (`tools/audio-test`, `node run.js <scenario>`), `D`: on device only (feel, GPU, iOS permissions), `H+D`: harness proves the logic, device proves the feel.
- **Status** — `todo` · `pass` · `fail` · `n/a` (not built yet). Status is set by a harness run or a device session, never by reading code. `todo (written…)`: a scenario exists, waiting for a run on a quiet machine.
- Timing values come from the spec's Design system section; a row fails if the tool's constant differs from the table at the top of this file.

## Timing table (the one set every tool must use)

| Constant | Spec | ms |
|---|---|---|
| hold → the other meaning of a spot, radial buds | "about 220 ms" | 220 |
| still hold → wheel | owner 2026-10-11 | 350 |
| hold seed → synth menu | Stage 0, 2026-10-30; `?hold=` tries others | 600 |
| rest → anchor (synth) | "about 450 ms" | 450 |
| e-ink flash | inverse flash | 70 |
| e-ink hold | hold | 70 |
| e-ink dither | 5 steps × 56 ms | 280 |
| double-tap window | — (unspecified; propose 300) | 300 |

Unified 2026-10-30 (hold-times, dial-hold, synth-seed-gesture); synth double-tap stays 320 and dwell is 350.

## Shell

| # | Function | How | Status |
|---|---|---|---|
| S1 | Home: orb draws (field lines, tool-colour planes, slow roll) | H+D | pass harness (shell-y-rows: orb draws, frames differ a second apart); device todo |
| S2 | Hold orb + drag → melt toward finger, neck, eight icons bloom | H | pass (shell-y-rows: melt and bloom past 0.8, 8 icons, picks by angle) |
| S3 | Release on a tool opens it | H | pass (shell-y-rows) |
| S4 | Tap a satellite dot opens its tool | H | pass (pane, 2026-10-09) |
| S5 | Transition (owner, 2026-10-10, second pass): seamless full-screen e-ink sweep — the tool unmasked through a natural wave with five ordered-dither steps at its edge; no flash, no line; soft start, glide, settle; 0.8 s (owner chose ?td=0.8; ?td= still overrides) | H | pass (motion-transition sheets; 775 ms after lift) |
| S6 | Going home: the same sweep reversed into the hub | H | pass (806 ms after lift) |
| S7 | Orb shrinks to bottom-left hub inside a tool | H | pass (shell-y-rows: hub bottom-left, under half size) |
| S8 | Hub tap → home; tool frame unloads (audio stops) | H | pass (pane) |
| S9 | Hub hold + drag: sideways steps forward, upward steps back, through all 7 other tools on either axis (step fitted to the shorter screen side, 40–70 px); back to the hub cancels; release switches; the picked tool preloads during the rest | H | pass (dial-reach, timing-switch) |
| S10 | Site menu visible on home (top-right), hidden inside a tool | H | pass (pane) |
| S11 | ?perf overlay shows in shell and is passed to frames | H | pass (harness smoke) |
| S16 | No placeholder audio anywhere: every sound is a real recording, file or take (owner rule 2026-10-10) | H | pass (2026-10-10: grep of all tools + per-tool scenarios; only synth and metronome generate sound, as instruments) |
| S20 | Tool-to-tool sweep: the outgoing tool's drawing is paused (its last frame stays on screen, audio untouched) | H | pass (flow-record-place: switch 1.03 → 0.86 s under software GL, frame median 50–67 → 33 ms) |
| S17 | Tool page load stall on the shell thread (first WebGL draw) | D | todo (harness: ~100 ms under software GL; measure on iPhone with ?perf; next lever = keep tools warm instead of reloading) |
| S12 | Install: manifest, icon, standalone launch, offline relaunch (service worker) | D | todo |
| S13 | Microphone: each tool asks itself (the shell-held stream was removed: on iOS it could mute a tool's capture) | D | todo |
| S18 | iOS audio rule: every tool's audio runs although iOS only starts audio on a touch END (shared unlock; BPM and synth create their context inside the touch) | H | pass (ios-audio, emulated iOS rule: tuner, recorder, BPM, metronome, synth silent without the unlock, all working with it) |
| S19 | File import: no type filter (iPadOS greyed out WAV under audio/*); WAV, AAC, AIFF decode in WebKit | H+D | pass harness (WebKit import of wav/m4a/aif); device todo |
| S14 | Persistent storage requested when installed | D | todo |
| S15 | Plasma-disc orb variant | — | n/a |

## Shared layer

| # | Function | How | Status |
|---|---|---|---|
| L1 | Tempo persists (localStorage) and broadcasts to open tools | H | pass (metro-y-rows: survives a reload, reaches a second page live) |
| L2 | Metronome writes tempo live; BPM detector writes it on selection only, not on open | H | pass (bpm-library: stop and file load leave the tempo alone; a drag selection sets it to 120) |
| L3 | Editor grid and synth pattern read the tempo on open; the practice grid, snap and tempo readout use the song's own estimate, or none (2026-10-30) | H | pass (flow-file-bpm-practice: editor grid from the shared tempo on open; synth-y-seed: the pattern follows it, live, not only on open; play-tempo: practice) |
| L4 | Takes persist in IndexedDB (meta + 16-bit pcm) and come back after reload | H | pass (rec-record: same id and length after reload) |
| L5 | Editor shelf: a take wheel of every take (kind icon + length) with the open-file row; commit inserts at the playhead | H | pass (edit-wheel-shelf, edit-file) |
| L6 | Practice source: tap → take wheel (+ open file), press-drag-release in one gesture; wheel hangs below the dot | H | pass (play-wheel) |
| L7 | Synth: passive 4-minute capture of its output; hold the right-edge dot and drag down to choose 10 s – 4 min, release places it on the timeline; tap places the last 30 s | H | pass (synth-place, synth-tap; WebKit too) |
| L8 | Projects: typed names, autosave, share-sheet bundles | — | n/a |
| L9 | Recorder places a take on the editor timeline (hold → place bud → shell opens editor → clip at playhead); editor preloads during the hold | H | pass (flow-record-place: 3.13 s take, release→editor 418 ms, clip restored after leaving) |
| L10 | Editor timeline persists across leaving (session) | H | pass (edit-place, flow-record-place) |
| L11 | Every opened file joins the library (recorder, editor, practice, BPM, analyzer) | H | pass (rec-file, edit-file, play-library, bpm-library, ana-real) |

## Design system (every tool)

| # | Function | How | Status |
|---|---|---|---|
| G1 | Values on 3×5 dot grid; sharp sign square with notches | H | pass metronome, synth, editor (design-y-rows reads the 3×5 cells back: 120, 220 / -12, 1.1); notched sharp seen in tuner-y-rows off-pitch frame |
| G2 | Value change: dots spring in, old ones shrink, staggered | H | todo (written, design-y-rows; awaiting a quiet run: stagger seen over 3 frames, overshoot not resolved at load 400) |
| G3 | Panels only rewritten when text changes (no flicker) | H | pass metronome (design-y-rows: cells unchanged 30 of 30 frames, same tempo written mid-way) |
| G4 | Running state: white stopped, dark running (metro, analyzer, recorder, practice) | H | pass (metronome diag-metro-clock; play-y-rows, rec-y-rows, ana-y-rows) |
| G5 | E-ink refresh: 70 ms flash, 70 ms hold, 5 dither steps of 56 ms | H | pass (metronome only so far (harness: 70 flash / 70 hold / 5×56 dither measured on the tool's own state)) |
| G6 | View changes inside a tool use the dithered refresh | H | todo (written, design-y-rows; awaiting a quiet run: analyzer view change takes about 0.5 s, too few frames at load 400 to see the steps) |
| G7 | Editor timeline never white; play/stop only flashes | H | pass (design-y-rows: inverse stays 1 through play and stop, one flash frame) |
| G8 | SDF shapes merge; pressed dot stretches toward the finger | H+D | pass harness (design-y-rows: practice dot reaches 12 px of ink toward the finger); device todo |
| G9 | Value adjust: rest, slide up/down; sideways sets the gear | H+D | pass harness (synth-y-setups gene slide; design-y-rows clip gain: 40 px up = +4.0 dB, gear 1/3 sideways); device todo |
| G10 | Radial actions: hold ~220 ms, up to five buds in free space, release to act | H (T) | todo (written, design-y-rows; awaiting a quiet run: 4 buds on screen 56 px apart at a corner clip pass, the hold read 381 ms at load 400) |
| G11 | Undo: two-finger tap | H+D | pass harness (design-y-rows: synth and editor, two-finger tap undoes); device todo |
| G12 | Timing uses the touch event's timestamp | H | pass synth (design-y-rows: a lift stamped 100 ms handled 400 ms later is a tap, the reverse is not; missed one run of three at load 400, re-check in the quiet run) |
| G13 | Corners: bottom-left hub only; bottom-right properties; top-right source/setup; top-left tool-specific | H | pass (design-y-rows: bottom-left free in all 8, bottom-right in 6 of 6, top-right in 6 of 6, top-left synth; metronome has no corner dots, editor no top-right) |
| G14 | Accent colours: blue playhead/peak, green snapped/on target, red record/clip/armed | H | pass (edit-y-rows blue playhead, green snap line; play-y-rows blue; rec-y-rows red near clipping) |

## Tuner

| # | Function | How | Status |
|---|---|---|---|
| T1 | Mic dot bottom-right starts/stops the mic | H | pass (harness audio-tuner, 2026-10-09) |
| T2 | 440 Hz sine → A4, 0 cents, 440 Hz readouts | H | pass (harness audio-tuner, 2026-10-09) |
| T3 | D#3 +20 cents → correct note, octave and cents sign | H | pass (harness audio-tuner, 2026-10-09) |
| T4 | In tune: straight line; off pitch: coloured strips taper, bend into an S | H+D | fail (tuner-y-rows: off pitch passes, strips drawn; in tune it does not: 440.02 Hz at +0.07 c bends the line ±10.2 px on a green screen. tuner.html:218 amplitude is 10·level with no in-tune term. If the moving line is intended the row is stale: owner to say) |
| T5 | Silence: line impossibly thin, not dimmed | H | pass thin (tuner-y-rows: 0.32 px at level 0); "not dimmed" unresolved: the tool caps at DPR 2 and the line sits on a pixel boundary, so full ink and dimmed look alike in pixels; device |
| T6 | Mic refused → microphone-off state, tap retries (no test signal) | H | pass (tuner-real: refused → microphone-off, no fallback audio; spec changed by owner rule) |
| T8 | Mic off: thin line, no note, no simulated pitch; tap anywhere starts listening | H | pass (tuner-real) |
| T9 | Quiet and higher voices (owner: a girl's voice was not accepted): gate lowered from −45 to −63 dBFS, quiet input must be more periodic; level drawn on a dB scale | H | pass (tuner-voices: female 262/523 Hz and male 110 Hz at −52 dBFS all read correctly, noise gives no note; lab/level_lab.js) |
| T7 | Lock window, flats/sharps, drone (A4 reference is K7) | — | n/a (open question) |

## BPM detector

| # | Function | How | Status |
|---|---|---|---|
| B1 | File load draws the whole song as a vertical strip | H | pass (bpm-library: file opened from the top-right dot draws the strip) |
| B2 | Mic recording via the record dot | H | pass (bpm-library: recording replaces the strip, saved to the library) |
| B3 | 120 BPM click → 120 ±1 detected | H | pass (bpm-library 120.0) |
| B4 | 100→130 BPM track → two sections, boundary within 4 s of 15 s | H | pass (bpm-library 100 / 130.4, boundary 16.0 s) |
| B5 | Drag on the strip selects a part; its tempo is drawn as a beat grid | H | pass (bpm-y-rows: drag 6–18 s selects it, grid 120) |
| B6 | Selecting sets the shared tempo (L2) | H | pass (bpm-y-rows: open leaves the tempo at 100, selection sets 120) |
| B7 | Octave correction keeps results in 50–215 BPM | H | pass (bpm-y-rows: 40 BPM click → 80, 260 → 130.4) |
| B8 | Hand sections to the editor grid | — | n/a |

## Metronome

| # | Function | How | Status |
|---|---|---|---|
| M1 | Tap centre starts/stops; e-ink inversion sequence (G5) | H | pass (harness motion-metro + diag-metro-clock; note: the start/stop dot is bottom-centre, a tap on the ring centre is tap-tempo — spec says tap the centre) |
| M2 | Click lands on the beat (audio start times vs tempo) | H | pass (metro-y-rows: gaps 0.5 s within 1 ms, accent first, a tempo change takes the next beat) |
| M3 | Drag from centre sideways: 0.3 BPM per px | H | pass (metro-y-rows: +100 px = +30.0) |
| M4 | Drag up/down changes beat count; diagonal changes both | H | pass (metro-y-rows: up, down, diagonal) |
| M5 | Turning around the ring adjusts tempo, finer further out | H | pass (metro-y-rows: quarter turn +30, +6, +1.2 by distance) |
| M6 | Marks: dots → rectangles → strips as count grows; spring in/out | H | pass (metro-y-rows: 4 dots, 32 rectangles, 280 strips; widths spring in) |
| M7 | Travelling drop swells each mark; hides once marks are strips | H | pass dots (metro-y-rows: drop drawn where S.da says, nowhere else); hiding at strips not separable from the marks in pixels |
| M8 | Reads and writes shared tempo live (L1, L2) | H | pass (metro-y-rows: reads 97.5 from another page, writes 113 to the store and the channel; a second metronome ignores src metro by design) |
| M9 | Subdivisions (accents are built; beat count and accents persist, metro-session) | — | n/a |

## Synth

| # | Function | How | Status |
|---|---|---|---|
| Y1 | Seed draws the live waveform as a circle, synced | H+D | pass harness (synth-y-seed: flat at rest, wave starts on the rising zero crossing every frame, outline moves 5–8 px); device todo |
| Y2 | Tap plays the pattern 0,12,7,0,3,0,10,7 in eighths of the shared tempo | H | pass (synth-y-seed: 0,12,7,0,3,0,10,7, gaps 0.25 s; 0.2 s after a tempo change) |
| Y3 | Double-tap mutes the seed | H | pass (synth-y-seed: silent, pattern still running; two slow taps stay two taps) |
| Y4 | 31 genes in 5 categories; category dots down the left edge | H | pass (synth-y-seed: 8+7+5+3+8 = 31 genes, dots in their colours, each opens its genes, menus on screen) |
| Y5 | Drag out of the seed grows a branch; direction mutates genes | H | pass (synth-y-branch: m by length, 27 genes moved, direction decides, deterministic, sounds with the seed stopped) |
| Y6 | Rest ~450 ms leaves an anchor | H (T) | pass (synth-y-branch: at 450–600 ms from the last move; shorter none; near the seed none; tremor under 5 px keeps it; 4 at most) |
| Y7 | Release at anchor parks (max 6); release while moving plants as new seed, past about 90 px (Z4) | H | pass (synth-y-branch; 6 kept, oldest goes) |
| Y8 | Parked tap cycle: off → on+focused → focus → off | H | pass (synth-y-branch: each step, both on-branches heard with the seed muted) |
| Y9 | Drag parked re-mutates; drop on seed removes | H | pass (synth-y-branch) |
| Y10 | Picked element takes a unique highlight colour | H | pass (synth-y-branch: tip in its colour, one ring on the focused branch, picked menu value alone coloured; two branches may share a hue, colour comes from the dominant category) |
| Y11 | Setups dial (top-right): Serum-style default, FM, mono | H | pass (synth-y-setups: 3 / 2 / 2 oscillators a note, FM modulator at 2×, tap and dial) |
| Y12 | Layers (top-left): drive, crush, filter, comb; top-edge dots turn a layer off | H | pass (synth-y-setups: tree sets each gene, captured output changes, dot and corner bypass restore it) |
| Y13 | Gene spiral (bottom-right): go, hold, slide; sideways = gear | H+D | pass harness (synth-y-setups: all 31 dots on screen and hit, rest about 380 ms, 48 px = 0.2, gear 1/3); device todo |
| Y14 | Place (right edge): selection of the passive 4-min capture → take → editor timeline (replaces the WAV save) | H | pass (synth-place) |
| Y15 | Garden saved every 2 s, restored on open | H | pass (synth-y-setups: saved inside 2 s; seed, phases, setup, mute, layers, parked restored, parked come back off) |

## Analyzer

| # | Function | How | Status |
|---|---|---|---|
| A1 | Control dot: tap listen/stop, dark while listening | H | pass (ana-y-rows) |
| A2 | Hold or flick opens three view buds: spectrum, spectrogram, loudness | H | pass (ana-y-rows: flick and hold) |
| A3 | Source: mic (default), three recent takes, open file | H | pass (ana-real) |
| A4 | Spectrum ring 20 Hz–20 kHz, ticks at 100, 1k, 10k; blue peak marker | H | pass (ana-y-rows: peak bin 145 of 256 = 1 kHz, blue marks drawn) |
| A5 | Three spectrum styles: dots (72, default), outline, fill | H | pass (ana-y-rows: cycle of 3, 73 rays counted against 72) |
| A6 | 1 kHz −20 dBFS tone → readout 1000 Hz, B5, level within 1 dB | H | pass (ana-real: 999.96 Hz) |
| A7 | Spectrogram: dithered waterfall with decade lines | H | pass (ana-y-rows: scrolls, tone a narrow line) |
| A8 | Loudness: momentary, short-term, integrated (green within ±1 LU of −14), peak, RMS; tap top resets | H | pass (ana-y-rows: −23.03 / −23.03 / −23.03 LUFS, peak −20.0, RMS −23.0; green at −14.1 only; reset passed 2 of 3 at load 400) |
| A9 | K-weighting and gating as specified (−20 dBFS sine ≈ −23 LUFS) | H | pass (ana-real: −20 dBFS 1 kHz sine → −23.03 LUFS momentary, −23.07 integrated) |
| A10 | Stereo/phase, pitch+harmonics, clip/silence finder, noise profile | — | n/a |

## Practice player

| # | Function | How | Status |
|---|---|---|---|
| P1 | Vertical waveform past a fixed blue playhead; played part dimmed; beat dots, bigger per bar | H | pass (play-y-rows: blue line at the fixed row, played part dimmed, beat dots with a larger one per bar) |
| P2 | Bottom dot: tap play/pause, dark while playing | H | pass (play-library) |
| P3 | Drag sideways: speed 50–150 %; up/down: pitch ±12; dot stretches | H+D | pass (play-library: 75 % advances 1.504 s per 2 s) |
| P4 | Readouts: speed, pitch shift, tempo at that speed | H | pass (play-y-rows: 75, +3, 90 read back from the cells) |
| P5 | Waveform: drag scrubs, tap jumps | H | pass (play-y-rows) |
| P6 | Hold then drag marks a loop; snaps to half-beats when tempo known; tap loop clears | H | pass (play-y-rows: loop on half-beats, seeks to its start, a tap inside clears) |
| P7 | Loop trainer: +5 % per pass up to 100 % | H | pass (play-y-rows: 90 → 95 → 100, stays) |
| P8 | Source: three recent takes, open file; empty state until chosen; session restores source, position, speed | H | pass (play-library: restored 4.420 s at 75 %) |
| P9 | Speed and pitch independent (pitch of a 440 Hz tone unchanged at 75 % speed) | H | pass (play-worklet pitch steps: 439.98 Hz at 75 %; its mouse-driven loop and scrub steps missed at load 400, those two pass in play-y-rows) |
| P10 | High-quality stretch; song splitting | — | n/a |

## Recorder

| # | Function | How | Status |
|---|---|---|---|
| R1 | Tap record: screen inverts, core turns square; tap again stops | H | pass (rec-record) |
| R2 | Markers: tap elsewhere while recording; red ripple; count shows as M2 | H | pass (rec-y-rows: spacing as tapped, red ripple, M2, saved with the take) |
| R3 | Retro ring fills with the last two minutes | H | pass (rec-y-rows: rate and a 2-minute ring; wrap-around not run. Rate 1.12 in one run at load 400, inside 10 % in the others) |
| R4 | Drag down from the dot (no hold needed): blob stretches, saved part turns green, length readout; release saves 10 s–2 min | H | pass (rec-retro: 5.035 s retro take) |
| R5 | Retro off from properties clears the buffer; with the mic closed the dot arms retro, with no take | H | pass (edit-buds, arming only) |
| R6 | Level dots under the time, red near clipping | H | pass (rec-y-rows: −20.0 and −1.1 dBFS read, red only when hot) |
| R7 | Takes stack as envelope strips: tap plays, swipe right exports WAV, swipe left deletes | H | pass (rec-place: hold → place/export/delete buds; swipes kept) |
| R8 | Takes land on the shared shelf (L4) | H | pass (rec-record) |
| R9 | Screen stays awake while recording | D | todo |
| R11 | Open file from the top-right dot becomes a take | H | pass (rec-file) |
| R12 | Mic refused: dimmed record dot with microphone-off, tap retries, files still open and play | H | pass (rec-refused: zero audio nodes created) |
| R10 | Take length matches recorded time within one block | H | pass (rec-record: 4.016 s for a 4.016 s tap-to-tap) |

## Editor

| # | Function | How | Status |
|---|---|---|---|
| E1 | Empty first open: two dark tracks, bar numbers, beat ticks, no clips | H | pass (edit-empty) |
| E2 | Track heads as coloured dots (orange, teal, violet, yellow) | H | pass (edit-y-rows) |
| E3 | Bottom-centre dot plays/stops; blue playhead follows; view scrolls | H | pass (edit-y-rows: rate 1.00, view follows, stop clears the nodes, blue line) |
| E4 | Tap empty space places the playhead (snaps to half-beats) | H | pass (edit-y-rows: half-beats; exact with snap off) |
| E5 | Drag empty space scrolls | H | pass (edit-y-rows) |
| E6 | Pinch zooms around the fingers; readout shows zoom while pinching | H | pass (edit-y-rows: zoom ×2.73 from where the pinch is recognised, anchor within 6 px, readout) |
| E7 | Readout shows bar.beat | H | pass (edit-y-rows) |
| E8 | Hold clip body → cut, copy, move, delete (reverse is now the twist) | H | pass (edit-place, edit-gesture-panel) |
| E9 | Move: picked up where held, follows across tracks, snaps to edges and beats with a green line, shows start time | H | pass (edit-y-rows: held point kept, across tracks, edge and beat snap, green line, start 7.1) |
| E10 | Edits take effect live during playback | H | pass (edit-y-rows: trim and delete during playback, no stop, playhead continuous) |
| E11 | Hold head → mute, solo, remove (arm hidden until recording into a track exists) | H | pass (edit-buds) |
| E12 | Up to 8 tracks, 4 lanes on screen: + adds a track and scrolls it into view; sideways drag on empty timeline scrolls lanes (axis lock in the first 8 px), settles on whole lanes with the flick; dots under the heads show the visible four; a clip dragged to a screen edge scrolls the lanes; offset saved in the session | H | pass (edit-lanes, Chromium + WebKit) |
| E13 | Properties: snap (on), push (off), takes shelf | H | pass (edit-y-rows: defaults, toggles, shelf; push moves later clips, without it the nearest gap) |
| E14 | Undo two-finger tap, 40 steps | H+D | pass (edit-place: two-finger tap undoes a move (CDP touch)) |
| E15 | Grid takes the shared tempo on open | H | pass (edit-place) |
| E17 | Clips reference takes by id; a deleted take's clips are dropped (closed) or shrink away (open) | H | pass (edit-deleted) |
| E18 | No clip limit (was 12): the shader draws on-screen clips in slots sized from the GPU (32–48 on phones); more on screen than slots → neighbours in a track draw merged. Bar numbers up to four digits (were blank past 99) | H | pass (edit-many: 40 clips persisted, played with 40 sources, all drawn zoomed out; merge path at 12 slots; bars 101–110 drawn) |
| E16 | Record into armed track, volume/pan, effects | — | n/a |

## Performance (device, `?perf`)

| # | Measure | Target | Status |
|---|---|---|---|
| X1 | Each tool idle: fps on iPhone, worst frame | 60 fps, worst < 20 ms | todo |
| X2 | Synth with 6 parked branches playing | 60 fps | todo |
| X3 | Editor playing 4 tracks while scrolling | 60 fps | todo |
| X4 | Flood transition | no long frames | todo |
| X5 | Idle draw stops when nothing moves (after the on-demand change) | 0 fps idle | todo |
| X6 | Audio: output latency per tool, dropouts over 5 min | none | todo |
| X7 | Battery: 30 min in the recorder with retro on | report | todo |
| X8 | Software-GL ranking (harness smoke, DPR 1): synth 24, edit 46, ana 52, others 60 fps | measured 2026-10-09 | pass |

## AudioWorklet (2026-10-10)

| # | Function | How | Status |
|---|---|---|---|
| W1 | No ScriptProcessorNode anywhere: capture (recorder, BPM, synth ring, analyzer metering) on worklet-capture.js, practice player on worklet-player.js | H | pass (worklet-static, play-worklet: constructors counted) |
| W2 | Recorder under main-thread load (blocked 120 of every 150 ms): no breaks in a 440 Hz take | H | pass (worklet-busy: 0 breaks, was 14–31) |
| W3 | Take alignment and meter latency | H | pass (worklet-rec: alignment 4–13 ms Chromium / 48–51 ms WebKit, was 28–52 / 70–77; meter 25–43 ms, was 43–47) |
| W4 | Analyzer numbers unchanged on the worklet | H | pass (worklet-ana: −23.028 LUFS momentary, identical) |
| W5 | Practice player: speed and pitch independent (WSOLA default; ?engine=ola keeps the old OLA) | H | pass (play-worklet: 440.00 Hz at 75 %, 879.94 Hz at 75 % +12; old OLA drifted to 423.7 / 892.5 Hz) |
| W6 | Device: worklet modules load offline from the precache; no glitches on iPhone | D | todo |

## Editor export, wheel, dial (2026-10-10)

| # | Function | How | Status |
|---|---|---|---|
| E19 | Save/export bud (4th in the properties row): first tap renders the mixdown (mute/solo respected) and saves it as a 'mix' take; second tap within 6 s shares the WAV (download on desktop) | H | pass (edit-export: length exact, samples match to 16-bit rounding, share inside the gesture; Chromium, WebKit, iOS emulation) |
| K1 | Wheel picker (wheel.js): drum columns like the iOS alarm, dot-matrix rows, flick with momentum and row snap, tap mode and press-drag-release mode | H | pass (wheel-drag, wheel-fling: no long frames, wheel-tap) |
| K2 | UX lab (audio/lab.html): timed A/B of wheel vs current fan and slide gestures for lists and values; results stored and exportable | H+D | pass harness (wheel-lab); owner sessions todo |
| K3 | Wheel adopted (owner 2026-10-11: take lists + every numeric value; option lists stay gestures) | H | pass (see K5–K9) |
| K4 | Clip gesture mock-up (audio/clip-lab.html): edge trim / hold-fade, seam roll / hold-crossfade, body buds (cut, copy, move, delete), two-finger twist reverses (?rev=dbl double-tap), tap selects → clip panel (warp switch, mode, original tempo with wheel, transpose, gain, fade curve), 4 ms declick, WSOLA warp | H+D | pass harness (cliplab-*: 8 scenarios Chromium + WebKit; 1.25× warp keeps 439.99 Hz, crossfade midpoint −3.04 dB per side); owner try-out todo |
| E20 | Clip gestures in the editor (ported from clip-lab, owner-approved): edge drag trims (snaps to half-beats and clip edges when snap is on) / stretches when warped; hold edge = fade; seam drag rolls; hold seam = equal-power crossfade; two-finger twist reverses; pinch zooms; two-finger tap undoes | H | pass (edit-gesture-trim/fade/seams/twist; Chromium + WebKit) |
| E21 | Tap a clip → its panel replaces the property buds: per-clip warp switch, mode beats/tones/repitch, original tempo (estimate + digit wheel), transpose, gain, fade curve; tap empty restores | H | pass (edit-gesture-panel, edit-gesture-stretch: warped stretch keeps pitch, warped clips follow the shared tempo) |
| E22 | Save/export mixdown and playback use per-clip rendered audio: fades, equal-power crossfades (−3 dB per side at the midpoint), reverse (sample-exact), warp, 4 ms declick | H | pass (edit-gesture-mixdown) |
| E23 | Session v3 stores every new clip field; v2 sessions load with defaults | H | pass (edit-gesture-session) |
| E24 | On-screen clip slots from the uniform budget with the larger per-clip data (16–48), merge fallback, the twisting clip always whole | H | pass (edit-gesture-slots) |
| K5 | Take wheels: practice and analyzer sources (top-right dot, older takes downward), BPM recent takes (hold the properties dot, drag mode, above the dot), editor shelf | H | pass (play-wheel, ana-wheel, bpm-wheel, edit-wheel-shelf; Chromium + WebKit) |
| K6 | Value wheels, metronome and BPM: still hold on the metronome centre → tempo with tenths (137.5 exact; tap tempo and drag unchanged); tap the BPM readout → sets the shared tempo exactly (128.0) | H | pass (metro-wheel, bpm-wheel) |
| K7 | Tuner A4 reference: new top-right control, wheel 415–466 Hz, persisted; detection follows it (432 Hz reads A4 +0.07 c; 440 Hz reads +31.84 c) | H | pass (tuner-wheel) |
| K8 | Practice speed 50–150 % and pitch ±12 wheels (−5 → 329.62 Hz measured), tempo readout → speed | H | pass (play-wheel) |
| K9 | Editor clip transpose/gain wheels; synth: 24 numeric genes, still-hold-and-lift opens the wheel with live preview, list genes unchanged | H | pass (edit-wheel-values, synth-wheel, synth-wheel-menus) |
| K10 | Wheel drag mode can sit at an anchor while spinning 1:1 from the finger (replaces per-tool workarounds) | H | pass (play-wheel, ana-wheel, bpm-wheel after the change; full run 70/70 Chromium, 15/15 WebKit) |

## Stage 0 fixes (2026-10-30, see PLAN.md)

| # | Function | How | Status |
|---|---|---|---|
| Z1 | Leaving the recorder mid-take stops and saves it; the shell keeps the frame until the save lands; drafts every 1.5 s recover a killed page | H | pass (rec-leave: hub, tool switch, reload; Chromium + WebKit); device todo |
| Z2 | Timeline has no end: 8 empty bars follow the last clip, drags and copies go past it, it settles back after an edit, playback stops at the last clip | H | pass (edit-endless, Chromium + WebKit) |
| Z3 | Seed: a drag always branches; menu after a 600 ms still hold, with a filling ring; `?hold=` | H+D | pass harness (synth-seed-gesture, Chromium + WebKit); timing on the iPad todo |
| Z4 | Synth undo: two-finger tap, 20 steps; a release plants only past about 90 px; pointercancel never plants | H+D | pass Chromium (synth-undo; CDP touch is Chromium only) |
| Z5 | Editor property buds act on release; an unchanged mix is not saved twice | H | pass (edit-buds, Chromium + WebKit) |
| Z6 | BPM multiplier reaches the shared tempo (rule L2 kept) | H | pass (bpm-mult, Chromium + WebKit) |
| Z7 | pointercancel is never a tap | H | pass (cancel-taps) |
| Z8 | AT.storage(), AT.onError(): results and failures exposed, no UI yet; failed session saves are retried | H | pass (storage-report, write-errors) |

## Workflows through the shell (Stage 3)

Real frames and transitions, Chromium, holds stretched (`flowkit.js`) because these prove the path, not the timings. Run 2026-10-30 at load 300–400, DPR 1; WebKit not run. Record to pad, MIDI, stems and the bounce hash wait for Stages 4 and 11.

| # | Function | How | Status |
|---|---|---|---|
| F1 | Record → place → edit → export; leave and return after the take, the clip, the edit and the mix | H | pass (flow-rec-edit-export: 3.17 s take, trimmed to 2.4 and moved, mix 4.2 s silent to the clip, WAV shared, no second mix) |
| F2 | Synth capture → place → arrange → export; leave and return | H | pass (flow-synth-arrange-export: 10 s and 4.3 s captures, a copy, mix 14.81 s, not silent; garden back, capture restarts empty after leaving the synth) |
| F3 | File in → BPM → practice; leave and return; tempo through metronome and editor | H | pass (flow-file-bpm-practice: 120 from the file; own tempo in practice with the shared tempo at 75; speed, loop, position, source back) |
| Z9 | Tool icons: tuning fork, stopwatch, solid red dot, spectrum curve (owner 2026-10-31); dots stay on icons when the safe areas arrive late (shell-safe-area) | H+D | pass harness; device todo |
| Z10 | An unchanged mix is not saved twice, also after leaving the editor | H | pass (flow-rec-edit-export) |
