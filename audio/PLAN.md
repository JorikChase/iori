# Audio — the plan

Written 2026-10-30. Replaces the phases in the original
[spec](https://claude.ai/artifact/Wj9UFEEyyDuqTp4AadfTQN), which stays useful for the look and the gestures of each
tool until the tool pages in `audio/docs/` take over. Evidence and sources are in [RESEARCH.md](RESEARCH.md); the
function ledger stays [MATRIX.md](MATRIX.md). `*.md` never deploys.

## Goal

Eight separate tools become one complete workflow on an iPhone and an iPad: capture, jam, design, arrange, mix, finish.
Two ways out: **Ableton stems**, and **a finished bounce** of a selected range with all effects, glue compression and
the master chain. It is for iori and audiophile friends first, and may be released further if it works.

## The two findings that shape everything

1. **On iOS 27 a live microphone damages playback, and no fix is scheduled.** With echo cancellation on, everything
   crackles. With it off, output moves to the quiet earpiece (WebKit bug 326286), and output may fold to mono (311451).
   `shared.js:214` uses the earpiece mode today. So the mic is a mode you enter, overdub is headphones-first, and
   capturing the app's own output needs no mic at all.
2. **Memory runs out without warning.** Going over the limit reloads the page with no error, and eight five-minute
   stereo tracks need 922 MB. So audio streams from storage, and everything saves continuously.

Everything else fits: one AudioContext in the shell, same-origin iframes, SharedArrayBuffer, WASM SIMD in the worklet,
OPFS, Wake Lock. Web MIDI, Ableton Link, stereo mic, file pickers and background audio do not.

No iPhone AudioWorklet benchmark exists anywhere. **Every voice count and tier in this plan is an estimate until
Stage 1 measures it.**

## Decisions

| Topic | Decision | Source |
|---|---|---|
| Outcomes | Ableton stems; range bounce with everything | iori |
| Synth | Fully featured: design, jam, drum-rack as MIDI on the timeline | iori |
| Devices | Both. iPhone at lessened quality; exporting there warns to open on a stronger device, user may choose lower quality | iori |
| Rack | Record onto pads from the recorder; no factory kits (my reading, iori to correct) | iori |
| Takes | Legible, organisable list | iori |
| Timeline | No finite end | iori |
| Automation | In, after channel effects; UI discussed then | iori |
| Hints | One-off, minimal, with access to docs | iori |
| Docs | Simple icon, bottom-right of the home screen | iori |
| Stem details | Wet/dry and Live Set discussed after MIDI and effect rack UX | iori |
| Audience | iori and audiophile friends, then maybe further | iori |
| Architecture | One audio engine in the shell; tool screens stay as iframes; no tool owns a context | iori accepted |
| Staying web | Yes. Native shell is the escape hatch, see Triggers | default accepted |
| Audio format | 48 kHz engine, 32-bit float inside, 24-bit WAV default out | default accepted |
| Tempo | Per project, one tempo and time signature first, tempo changes later | default accepted |
| Tracks | Up to 8 per project at first, audio or MIDI on any | default accepted |
| Effects | EQ, compressor, glue, saturation, delay, reverb, limiter; inserts, sends, master | default accepted |
| MIDI editing | Time runs down, pitch across, keyboard docked as the ruler | default accepted |
| Undo | Whole project, with redo, survives closing the app | default accepted |
| Moving projects | Share-sheet bundles, no cloud | default accepted |

Changed by the research, please object if you disagree:

| Topic | Was | Now | Why |
|---|---|---|---|
| Drum rack | 16 pads | 16 per view, 4 banks, 64 total | Four-by-four is what fits a thumb; 8×8 falls under the 44 pt minimum. Koala does the same |
| Keyboard | Pads with scale lock | 5×5 in-key pads with a chromatic toggle on phone, strip with scale snap on iPad | No study exists either way; A/B with thumbs in Stage 7 |
| Mic | Each tool asks itself | One owner in the shell, closed at the end of a take | A second capture may mute the first |
| Export modes | One | *As heard* (identical to playback) and *Full quality* (close, not identical) | Reduced playback cannot match a Full export exactly |
| Ableton | Maybe a Live Set | Stems + `.mid` zip first; `.als` only after proving audio clips work | Undocumented, version-locked format |

One thing I'm flagging against your iPhone decision: export doesn't run in real time, so the phone may manage Full
quality, only slowly. Stage 1 measures this. The warning and the choice stay as you specified, and fire when a project
is too heavy for the device, not on every iPhone export. If the measurement says otherwise it fires as you described.

## Principles for the engine

- **One DSP core in WASM**, C compiled with `zig cc`, hosted in the worklet for playback and in a Worker for bounce.
  Same code means the bounce is what you heard. A test compares hashes of both.
- **Deterministic:** fixed 32-sample block, events stamped in samples, seeded randomness, 48 kHz throughout.
- **Raw plus metadata:** takes are never altered. Offsets, trims, pad edits and quantize are all reversible data.
- **Streaming:** PCM in OPFS through a Worker, metadata in IndexedDB, a shared ring into the worklet.
- **Load cap:** peak about 15% of a quantum, until device evidence says otherwise.
- **Quality tiers differ only** in voice oversampling, voice count, ladder accuracy and wavetable frames. The master
  chain costs about 1% of a quantum, so it's the same everywhere.
- **Licences:** MIT or BSD only in the shipped core (r8brain, Signalsmith Stretch, libebur128). Surge, Vital and CTAGDRC
  are GPL: read them, never copy them.

## Stages

Size is S, M, L or XL. Each stage ends with something you can use on a device, and none starts until the one before has
met its exit test. Stages 2 and 3 run alongside the rest once started.

### Stage 0 — Fixes (M) — built 2026-10-30, seed timing on the iPad still open
Worth doing whatever happens later.
- Recording loss: guard the hub while recording, save incrementally. Prove it with a harness scenario first.
- Timeline with no end: empty space always after the last clip; moves and copies extend it; playback stops at the last
  clip (`edit.html:300,374,839`).
- Seed gesture: drag always branches; menu at about 600 ms with a filling ring; `?hold=` for trying timings on the iPad.
  Consider removing the seed menu, since the left-edge dots reach the same genes.
- Stray-swipe protection and undo in the synth: a release currently replaces the seed.
- Hold times down to two: 220 ms (the other meaning of this spot) and 350 ms (the wheel). Buds act on release everywhere.
- BPM ×2 reaches the shared tempo; arm button hidden until it works; mix button stops duplicating takes; practice grid
  stops using an unrelated tempo; retro can arm without starting a take.
- `shared.js`: surface `persist()` results and save errors; check `storage.estimate()`.
- `build.py` joins the deploy notes in AGENTS.md; lab pages leave the precache.

**Exit:** harness green with new scenarios for each fix; you've chosen the seed timing on the iPad.

### Stage 1 — Device gates (M, needs your iPhone and iPad)
Four measurements that can change the architecture. Build a hidden probe page from `tools/audio-test/bench`, run it
on iOS 27, an iPhone 15 Pro or newer if available, an older iPhone and the M5 iPad.
1. Playback with the mic open: speaker, wired, USB-C, AirPods. Route, level, crackle, stereo, recovery afterwards.
2. Real worklet load: JS vs WASM vs SIMD, step up to underrun, in Safari and installed.
3. Isolation and shell: SharedArrayBuffer, COEP iframes, offline launch from the service worker, iframe nodes on the
   parent's context surviving garbage collection.
4. Memory ceiling per device, and how it fails.

Also needed here: COOP/COEP headers on `/audio/*` in Caddy and kept by the service worker. The gtag script in the
generated head of `audio/index.html` will probably be refused under COEP, so `/audio/` likely loses analytics. Tool
pages must all carry COEP.

**Exit:** a one-page results table in RESEARCH.md, and a yes or no on each Trigger below.

### Stage 2 — Docs (M, then continuous)
`audio/docs/<tool>.md` for each tool: gesture map, what it reads and writes, limits, test status. Writing these is the
audit, so they start now and replace the spec's tool sections. A readable version ships in the app behind the home-screen
icon. Hints: one trigger, one hint, once, dismissed by doing it, a failed attempt also fires it, a ghost hand over the
real target, no words. None for pinch, scroll or drag. Every essential function keeps at least one visible path.

### Stage 3 — End-to-end tests (M, then continuous)
Finish the 83 untested MATRIX rows, starting with the synth's Y1–Y13. Add workflow scenarios: record → place → edit →
export; jam → capture → arrange → bounce; record to pad → MIDI → stems; leave and return at every step. Add the hash
test when Stage 4 lands. Update MATRIX rows that are stale.

### Stage 4 — First thin path (L)
The smallest thing that proves the whole design: one project, one MIDI track into a minimal WASM voice, one audio track
streaming from OPFS, one glue compressor, a limiter, one range bounce and a plain stem file, all in the shell engine.
**Exit:** bounce hash equals captured playback, on iPhone and iPad; runs 20 minutes without thermal trouble; no audible
quality loss you object to. If the phone can't carry this, we stop and redesign here.

### Stage 5 — Engine and projects (XL)
- Shell engine: context, graph, transport, metronome, capture, one mic owner.
- Move tools onto it in order of risk: metronome, tuner, analyzer, BPM, practice, recorder, editor, synth last.
- Metronome keeps running across tools; recording survives leaving a tool.
- Projects: names, date grid with thumbnails, continuous autosave, whole-project undo with redo.
- Share-sheet bundles between devices, which your export warning depends on.
- Imports: parse WAV and AIFF directly to keep stereo, 24-bit and the original rate. Stereo takes.
- Quality governor: tier chosen from a measured warm-up, not the device model.
- Recovery: verify audio after returning to the foreground; a tap-to-restart control.

### Stage 6 — Take library and pad recording (M)
All takes, with names, rename, order, tags, soft delete to a Trash. Real text enters the design language here, so this
needs a design pass first. Per-take tempo. "Open in tool X". Record to a pad from the recorder, with a threshold and a
hands-free latch, from Mic or Master.

### Stage 7 — Design sessions (M, with you)
We design these together before any building, with mock-ups you try on the device, the way clip-lab worked:
channel strip and effect slots, the rack, MIDI editing on a vertical roll (playhead position first), the keyboard
A/B, and automation. Map the whole gesture vocabulary at once, because dwell gestures compete with each other.

Starting proposals: one tall strip in focus at a time; two visible slots expanding to eight; hold to peek, tap to open;
automation by touching a control, shown dotted, confirmed by a tap, attached to clips.

### Stage 8 — Mixer and effects (L)
Track volume, pan, inserts, two or three sends, master chain with a true-peak limiter at −1 dBTP, delay compensation,
full BS.1770 metering. Then automation.

### Stage 9 — Overdub (L)
Recording into tracks while playing, headphones-first. Takes stay raw and shift by a per-route offset, so recalibrating
fixes old takes. Chirp calibration where it works, tap-to-click fallback, route changes mark takes suspect. Comping.
The design depends on gate 1.

### Stage 10 — Full synth (XL)
Seed and branches stay the front door. Behind them: two wavetable oscillators with morph, sub, noise, FM; independent
amp and mod envelopes; two or three LFOs; an 8–10 lane mod list whose depths are genes, so branches can mutate motion;
unison with gain compensation; mono, legato, glide; four to eight macros; per-voice drive then shared effects.
Mutation becomes a pure seeded function with per-gene weight and lock, and a pitch-stability gene. Gene schema is
versioned so old seeds survive, though the port will change their sound. Playing: per-note branches or one branch
across all notes, velocity from position on the pad, an always-on rolling MIDI buffer so you can keep what you just
played. Patch library with tags. Audio-to-patch is deferred.

### Stage 11 — Drum rack and MIDI (XL)
Pad = note, chain, cached render. 64 pads as 4 × 16, notes `36 + 16 × bank + pad`, numbered choke groups, one-shot,
gate and loop, two effect slots per pad, two or three rack sends, slicing up to 64. Synth pads play a cached render by
default, keyed by a hash of patch, seed, pitch, velocity layer and tier. New MIDI clip type on the timeline, note editing,
non-destructive quantize, `.mid` export.

### Stage 12 — Stems and export (M, discussed first)
We discuss this after Stages 8 and 11, as you asked. The groundwork will already exist: range selection, export sheet,
*As heard* and *Full quality*, dither on 16-bit, stems in one zip, `.mid`, a real round trip into Live through LiveBridge.
`.als` by template clone only if audio clips prove out. Your iPhone warning lands here.

## Triggers

| If | Then |
|---|---|
| Gate 1 shows no clean way to monitor while recording | Overdub moves to recording with the transport stopped, or the native shell moves up |
| Bug 326286 gets fixed | Speaker overdub reopens, Stage 9 gets simpler |
| Gate 2 shows far fewer voices than estimated | Reduce the Stage 10 engine, lean on cached renders |
| Gate 3 fails in the installed app | Revisit the shell; one-document rewrite comes back on the table |
| Gate 4 shows a low ceiling on an older iPhone | Set a minimum device, or a lighter project limit |
| Native shell is chosen | Hardware MIDI and Link become possible too |

## What this plan doesn't know yet

- Real iPhone performance, memory ceiling, touch-to-sound latency: Stage 1.
- Whether Reduced quality is audible: a blind test on fixtures, late, and only you and your friends can run it.
- Synplant 2's exact gene list and voice count: the official manual couldn't be retrieved.
- Vertical piano roll and phone keyboard layouts: no evidence exists; mock-ups decide.
- Whether `expressive-liveset` writes audio clips.
- How Ableton's licence applies to generated Live Sets.
- Whether "audioTM" is the app's name. It stays Audio Tools until you say.
