# Audio Tools — test matrix

One row per function in the spec (claude.ai/artifact/Wj9UFEEyyDuqTp4AadfTQN). `*.md` never deploys.

- **How** — `H`: headless harness (`tools/audio-test`, `node run.js <scenario>`), `D`: on device only (feel, GPU, iOS permissions), `H+D`: harness proves the logic, device proves the feel.
- **Status** — `todo` · `pass` · `fail` · `n/a` (not built yet). Status is set by a harness run or a device session, never by reading code.
- Timing values come from the spec's Design system section; a row fails if the tool's constant differs from the table at the top of this file.

## Timing table (the one set every tool must use)

| Constant | Spec | ms |
|---|---|---|
| hold → radial buds | "about 220 ms" | 220 |
| rest → anchor (synth) | "about 450 ms" | 450 |
| e-ink flash | inverse flash | 70 |
| e-ink hold | hold | 70 |
| e-ink dither | 5 steps × 56 ms | 280 |
| double-tap window | — (unspecified; propose 300) | 300 |

Today's constants (audit 2026-10-09): hold 220 (edit), 260 (ana, synth), 300 (play); dwell 380 (synth). Rows marked `T` depend on unifying these.

## Shell

| # | Function | How | Status |
|---|---|---|---|
| S1 | Home: orb draws (field lines, tool-colour planes, slow roll) | H+D | todo |
| S2 | Hold orb + drag → melt toward finger, neck, eight icons bloom | H | todo |
| S3 | Release on a tool opens it | H | todo |
| S4 | Tap a satellite dot opens its tool | H | pass (pane, 2026-10-09) |
| S5 | Transition (owner, 2026-10-10, second pass): seamless full-screen e-ink sweep — the tool unmasked through a natural wave with five ordered-dither steps at its edge; no flash, no line; soft start, glide, settle; 0.8 s (owner chose ?td=0.8; ?td= still overrides) | H | pass (motion-transition sheets; 775 ms after lift) |
| S6 | Going home: the same sweep reversed into the hub | H | pass (806 ms after lift) |
| S7 | Orb shrinks to bottom-left hub inside a tool | H | todo |
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
| L1 | Tempo persists (localStorage) and broadcasts to open tools | H | todo |
| L2 | Metronome writes tempo live; BPM detector writes it on selection only, not on open | H | pass (bpm-library: stop and file load leave the tempo alone; a drag selection sets it to 120) |
| L3 | Editor grid, synth pattern and practice readout read the tempo on open | H | todo |
| L4 | Takes persist in IndexedDB (meta + 16-bit pcm) and come back after reload | H | pass (rec-record: same id and length after reload) |
| L5 | Editor shelf: open-file bud + the four most recent takes; tapping places at the playhead / first free track / new track | H | pass (edit-file, edit-place) |
| L6 | Practice source cycles the three most recent takes, then open file | H | pass (play-library) |
| L7 | Synth: passive 4-minute capture of its output; hold the right-edge dot and drag down to choose 10 s – 4 min, release places it on the timeline; tap places the last 30 s | H | pass (synth-place, synth-tap; WebKit too) |
| L8 | Projects: typed names, autosave, share-sheet bundles | — | n/a |
| L9 | Recorder places a take on the editor timeline (hold → place bud → shell opens editor → clip at playhead); editor preloads during the hold | H | pass (flow-record-place: 3.13 s take, release→editor 418 ms, clip restored after leaving) |
| L10 | Editor timeline persists across leaving (session) | H | pass (edit-place, flow-record-place) |
| L11 | Every opened file joins the library (recorder, editor, practice, BPM, analyzer) | H | pass (rec-file, edit-file, play-library, bpm-library, ana-real) |

## Design system (every tool)

| # | Function | How | Status |
|---|---|---|---|
| G1 | Values on 3×5 dot grid; sharp sign square with notches | H | todo |
| G2 | Value change: dots spring in, old ones shrink, staggered | H | todo |
| G3 | Panels only rewritten when text changes (no flicker) | H | todo |
| G4 | Running state: white stopped, dark running (metro, analyzer, recorder, practice) | H | pass (metronome only so far (harness diag-metro-clock: white at rest, dark running)) |
| G5 | E-ink refresh: 70 ms flash, 70 ms hold, 5 dither steps of 56 ms | H | pass (metronome only so far (harness: 70 flash / 70 hold / 5×56 dither measured on the tool's own state)) |
| G6 | View changes inside a tool use the dithered refresh | H | todo |
| G7 | Editor timeline never white; play/stop only flashes | H | todo |
| G8 | SDF shapes merge; pressed dot stretches toward the finger | H+D | todo |
| G9 | Value adjust: rest, slide up/down; sideways sets the gear | H+D | todo |
| G10 | Radial actions: hold ~220 ms, up to five buds in free space, release to act | H (T) | todo |
| G11 | Undo: two-finger tap | H+D | todo |
| G12 | Timing uses the touch event's timestamp | H | todo |
| G13 | Corners: bottom-left hub only; bottom-right properties; top-right source/setup; top-left tool-specific | H | todo |
| G14 | Accent colours: blue playhead/peak, green snapped/on target, red record/clip/armed | H | todo |

## Tuner

| # | Function | How | Status |
|---|---|---|---|
| T1 | Mic dot bottom-right starts/stops the mic | H | pass (harness audio-tuner, 2026-10-09) |
| T2 | 440 Hz sine → A4, 0 cents, 440 Hz readouts | H | pass (harness audio-tuner, 2026-10-09) |
| T3 | D#3 +20 cents → correct note, octave and cents sign | H | pass (harness audio-tuner, 2026-10-09) |
| T4 | In tune: straight line; off pitch: coloured strips taper, bend into an S | H+D | todo |
| T5 | Silence: line impossibly thin, not dimmed | H | todo |
| T6 | Mic refused → microphone-off state, tap retries (no test signal) | H | pass (tuner-real: refused → microphone-off, no fallback audio; spec changed by owner rule) |
| T8 | Mic off: thin line, no note, no simulated pitch; tap anywhere starts listening | H | pass (tuner-real) |
| T9 | Quiet and higher voices (owner: a girl's voice was not accepted): gate lowered from −45 to −63 dBFS, quiet input must be more periodic; level drawn on a dB scale | H | pass (tuner-voices: female 262/523 Hz and male 110 Hz at −52 dBFS all read correctly, noise gives no note; lab/level_lab.js) |
| T7 | Lock window, flats/sharps, A4 reference, drone | — | n/a (open question) |

## BPM detector

| # | Function | How | Status |
|---|---|---|---|
| B1 | File load draws the whole song as a vertical strip | H | pass (bpm-library: file opened from the top-right dot draws the strip) |
| B2 | Mic recording via the record dot | H | pass (bpm-library: recording replaces the strip, saved to the library) |
| B3 | 120 BPM click → 120 ±1 detected | H | pass (bpm-library 120.0) |
| B4 | 100→130 BPM track → two sections, boundary within 4 s of 15 s | H | pass (bpm-library 100 / 130.4, boundary 16.0 s) |
| B5 | Drag on the strip selects a part; its tempo is drawn as a beat grid | H | todo |
| B6 | Selecting sets the shared tempo (L2) | H | todo |
| B7 | Octave correction keeps results in 50–215 BPM | H | todo |
| B8 | Hand sections to the editor grid | — | n/a |

## Metronome

| # | Function | How | Status |
|---|---|---|---|
| M1 | Tap centre starts/stops; e-ink inversion sequence (G5) | H | pass (harness motion-metro + diag-metro-clock; note: the start/stop dot is bottom-centre, a tap on the ring centre is tap-tempo — spec says tap the centre) |
| M2 | Click lands on the beat (audio start times vs tempo) | H | todo |
| M3 | Drag from centre sideways: 0.3 BPM per px | H | todo |
| M4 | Drag up/down changes beat count; diagonal changes both | H | todo |
| M5 | Turning around the ring adjusts tempo, finer further out | H | todo |
| M6 | Marks: dots → rectangles → strips as count grows; spring in/out | H | todo |
| M7 | Travelling drop swells each mark; hides once marks are strips | H | todo |
| M8 | Reads and writes shared tempo live (L1, L2) | H | todo |
| M9 | Subdivisions and accents | — | n/a |

## Synth

| # | Function | How | Status |
|---|---|---|---|
| Y1 | Seed draws the live waveform as a circle, synced | H+D | todo |
| Y2 | Tap plays the pattern 0,12,7,0,3,0,10,7 in eighths of the shared tempo | H | todo |
| Y3 | Double-tap mutes the seed | H | todo |
| Y4 | 31 genes in 5 categories; category dots down the left edge | H | todo |
| Y5 | Drag out of the seed grows a branch; direction mutates genes | H | todo |
| Y6 | Rest ~450 ms leaves an anchor | H (T) | todo |
| Y7 | Release at anchor parks (max 6); release while moving plants as new seed | H | todo |
| Y8 | Parked tap cycle: off → on+focused → focus → off | H | todo |
| Y9 | Drag parked re-mutates; drop on seed removes | H | todo |
| Y10 | Picked element takes a unique highlight colour | H | todo |
| Y11 | Setups dial (top-right): Serum-style default, FM, mono | H | todo |
| Y12 | Layers (top-left): drive, crush, filter, comb; top-edge dots turn a layer off | H | todo |
| Y13 | Gene spiral (bottom-right): go, hold, slide; sideways = gear | H+D | todo |
| Y14 | Place (right edge): selection of the passive 4-min capture → take → editor timeline (replaces the WAV save) | H | pass (synth-place) |
| Y15 | Garden saved every 2 s, restored on open | H | todo |

## Analyzer

| # | Function | How | Status |
|---|---|---|---|
| A1 | Control dot: tap listen/stop, dark while listening | H | todo |
| A2 | Hold or flick opens three view buds: spectrum, spectrogram, loudness | H | todo |
| A3 | Source: mic (default), three recent takes, open file | H | pass (ana-real) |
| A4 | Spectrum ring 20 Hz–20 kHz, ticks at 100, 1k, 10k; blue peak marker | H | todo |
| A5 | Three spectrum styles: dots (72, default), outline, fill | H | todo |
| A6 | 1 kHz −20 dBFS tone → readout 1000 Hz, B5, level within 1 dB | H | pass (ana-real: 999.96 Hz) |
| A7 | Spectrogram: dithered waterfall with decade lines | H | todo |
| A8 | Loudness: momentary, short-term, integrated (green within ±1 LU of −14), peak, RMS; tap top resets | H | todo |
| A9 | K-weighting and gating as specified (−20 dBFS sine ≈ −23 LUFS) | H | pass (ana-real: −20 dBFS 1 kHz sine → −23.03 LUFS momentary, −23.07 integrated) |
| A10 | Stereo/phase, pitch+harmonics, clip/silence finder, noise profile | — | n/a |

## Practice player

| # | Function | How | Status |
|---|---|---|---|
| P1 | Vertical waveform past a fixed blue playhead; played part dimmed; beat dots, bigger per bar | H | todo |
| P2 | Bottom dot: tap play/pause, dark while playing | H | pass (play-library) |
| P3 | Drag sideways: speed 50–150 %; up/down: pitch ±12; dot stretches | H+D | pass (play-library: 75 % advances 1.504 s per 2 s) |
| P4 | Readouts: speed, pitch shift, tempo at that speed | H | todo |
| P5 | Waveform: drag scrubs, tap jumps | H | todo |
| P6 | Hold then drag marks a loop; snaps to half-beats when tempo known; tap loop clears | H | todo |
| P7 | Loop trainer: +5 % per pass up to 100 % | H | todo |
| P8 | Source: three recent takes, open file; empty state until chosen; session restores source, position, speed | H | pass (play-library: restored 4.420 s at 75 %) |
| P9 | Speed and pitch independent (pitch of a 440 Hz tone unchanged at 75 % speed) | H | todo |
| P10 | High-quality stretch; song splitting | — | n/a |

## Recorder

| # | Function | How | Status |
|---|---|---|---|
| R1 | Tap record: screen inverts, core turns square; tap again stops | H | pass (rec-record) |
| R2 | Markers: tap elsewhere while recording; red ripple; count shows as M2 | H | todo |
| R3 | Retro ring fills with the last two minutes | H | todo |
| R4 | Hold dot + drag down: blob stretches, saved part turns green, length readout; release saves 10 s–2 min | H | pass (rec-retro: 5.035 s retro take) |
| R5 | Retro off from properties clears the buffer | H | todo |
| R6 | Level dots under the time, red near clipping | H | todo |
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
| E2 | Track heads as coloured dots (orange, teal, violet, yellow) | H | todo |
| E3 | Bottom-centre dot plays/stops; blue playhead follows; view scrolls | H | todo |
| E4 | Tap empty space places the playhead (snaps to half-beats) | H | todo |
| E5 | Drag empty space scrolls | H | todo |
| E6 | Pinch zooms around the fingers; readout shows zoom while pinching | H | todo |
| E7 | Readout shows bar.beat | H | todo |
| E8 | Hold clip → cut, copy, move, reverse, delete | H (T) | todo |
| E9 | Move: picked up where held, follows across tracks, snaps to edges and beats with a green line, shows start time | H | todo |
| E10 | Edits take effect live during playback | H | todo |
| E11 | Hold head → mute, solo, arm (red), remove | H | todo |
| E12 | Up to 8 tracks, 4 lanes on screen: + adds a track and scrolls it into view; sideways drag on empty timeline scrolls lanes (axis lock in the first 8 px), settles on whole lanes with the flick; dots under the heads show the visible four; a clip dragged to a screen edge scrolls the lanes; offset saved in the session | H | pass (edit-lanes, Chromium + WebKit) |
| E13 | Properties: snap (on), push (off), takes shelf | H | todo |
| E14 | Undo two-finger tap, 40 steps | H+D | pass (edit-place: two-finger tap undoes a move (CDP touch)) |
| E15 | Grid takes the shared tempo on open | H | pass (edit-place) |
| E17 | Clips reference takes by id; a deleted take's clips are dropped (closed) or shrink away (open) | H | pass (edit-deleted) |
| E18 | No clip limit (was 12): the shader draws on-screen clips in slots sized from the GPU (32–48 on phones); more on screen than slots → neighbours in a track draw merged. Bar numbers up to four digits (were blank past 99) | H | pass (edit-many: 40 clips persisted, played with 40 sources, all drawn zoomed out; merge path at 12 slots; bars 101–110 drawn) |
| E16 | Trim, record into armed track, volume/pan, effects | — | n/a |

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
| K3 | Wheel adopted where lists live today (synth setups, analyzer views/sources, practice source, editor shelf, BPM ×/÷) | — | todo (after lab results) |
