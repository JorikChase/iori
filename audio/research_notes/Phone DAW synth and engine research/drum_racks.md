# Drum Racks and Sampler Pads: Comparison for a Phone/Tablet Web DAW

Researched 2026-10-30. Evidence tags used throughout: **[P]** read directly from a primary source (maker's manual, product page or release notes). **[S]** primary source seen only through a search excerpt, or a reputable review or retailer. **[F]** forum or user opinion. Anything untagged under Inferences is my reasoning, not a sourced fact. Several manuals were blocked or too large (Akai PDFs, Ableton help, Elektron manual PDFs), so the MPC and Octatrack rows lean on older manual pages and are marked as such.

## Ableton Drum Rack: structure, chains, choke, sends, per-pad FX, note mapping, import and export

### Takeaway
A Drum Rack is a note router, not a sound engine: 128 pads, one per MIDI note, each pad fronting one or more full device chains, with 16 choke groups and up to 6 internal returns. That split between the pad (a note), the chain (a sound) and the rack (shared returns) is the model to copy. There is no interchange format for the rack itself; only MIDI notes and audio travel.

### Cited Findings
- [P] "Each pad represents one of the 128 available MIDI notes"; the pad overview shifts the visible pads in groups of 16, or by single rows with Cmd/Alt — [Ableton manual, Racks](https://www.ableton.com/en/manual/instrument-drum-and-effect-racks/)
- [P] Pad states: empty pad shows note and suggested GM instrument; one chain shows chain name plus mute, solo, preview and Hot-Swap; several chains show "Multi" and disable Hot-Swap and rename — [Ableton manual, Racks](https://www.ableton.com/en/manual/instrument-drum-and-effect-racks/)
- [P] Each drum chain receives input from only a single assigned MIDI note. Dragging a sample to an empty pad creates a chain with a Simpler — [Ableton manual, Racks](https://www.ableton.com/en/manual/instrument-drum-and-effect-racks/)
- [P] Each chain has three note controls: **Receive** (incoming note, listed by name, number and GM equivalent), **Play** (the note sent to the chain's devices) and **Choke**. Receive = "All Notes" disables Play and Choke and passes notes through. Several chains can share one Receive note — [Ableton manual, Racks](https://www.ableton.com/en/manual/instrument-drum-and-effect-racks/)
- [P] Sixteen choke groups; chains in the same group silence each other — [Ableton manual, Racks](https://www.ableton.com/en/manual/instrument-drum-and-effect-racks/)
- [P] Up to six return chains inside the rack. Send sliders are post-fader. A return's Audio To can target the rack's main output or the Set's return tracks — [Ableton manual, Racks](https://www.ableton.com/en/manual/instrument-drum-and-effect-racks/)
- [P] Per-pad effects sit in the chain after the Simpler. Dropping a new sample on the pad replaces only the Simpler and sample, keeping upstream MIDI effects and downstream audio effects — [Ableton manual, Racks](https://www.ableton.com/en/manual/instrument-drum-and-effect-racks/)
- [P] Up to 16 macros (8 shown by default), with Rand and Variations — [Ableton manual, Racks](https://www.ableton.com/en/manual/instrument-drum-and-effect-racks/)
- [P] Slice to New MIDI Track splits by beat resolution, transients or Warp Markers, and creates one MIDI clip with one note per slice in chromatic order, plus a Drum Rack with one Simpler chain per slice. A Rack holds at most 128 chains, so Live refuses finer slicing — [Ableton manual, Converting Audio to MIDI](https://www.ableton.com/en/live-manual/12/converting-audio-to-midi/)
- [S] Slices are triggered from C1 (MIDI note 36) upward — [Ableton manual excerpt](https://www.ableton.com/en/manual/converting-audio-to-midi/)
- [P] Convert Drums to New MIDI Track detects kick, snare and hi-hat and places them to trigger matching sounds in a preloaded Drum Rack; the note numbers are not stated — [Ableton manual, Converting Audio to MIDI](https://www.ableton.com/en/live-manual/12/converting-audio-to-midi/)
- [S] MIDI clips export as .mid via right-click Export MIDI Clip or Cmd/Ctrl+Shift+E — [ProRec guide](https://ProRec.com/?p=4705)
- [S] Ableton Note sets reach Live through Ableton Cloud with sounds and effects intact; Note instruments open as their Live counterparts such as a Drum Rack — [MusicRadar](https://www.musicradar.com/news/ableton-note-app-iphone-ableton-live)
- [F] Note has no direct MIDI export short of moving the project to Live — [Loopy Pro forum](https://forum.loopypro.com/discussion/comment/1393297/)

### Inferences
- Copy the separation of Receive note (pad identity, what goes on the timeline) from Play note (pitch sent to the sound). It lets a pad be re-pitched without rewriting the MIDI, and it is what makes one data model cover samples and synths.
- "Swap sample, keep FX" is a good rule for re-recording onto a pad: a new take should inherit pitch, envelope, choke and FX.
- Six returns is desktop scale. Two or three shared sends suit a phone (see the Koala and EP-133 evidence below).
- Export realistically means .mid plus a folder of rendered WAVs. A pad's synth patch cannot travel to Ableton in any format found here, so each synth pad needs a rendered audio path for export.

### Gaps
- Whether Drum Rack ignores the MIDI channel of an imported .mid (I believe it does, but found no source).
- The .adg/.als format has no public interchange spec that I found; generating Drum Rack presets from a web app was not researched.
- I could not read the manual's body text on nested racks inside pads: the second page of the fetch returned only the table of contents.

## Koala Sampler, MPC, Digitakt II, Octatrack, EP-133: pads, banks, recording, slicing, playback modes, pitch, FX

### Takeaway
Two families exist. Pad samplers (Koala, MPC, EP-133) bind a sound to a pad and record by holding a pad or arming one. Track samplers (Digitakt, Octatrack) bind a sound to a sequencer track, so pad count is really track count. Every product records from a mic or line input and also resamples its own output. Every one slices too, by some mix of equal division, transient or threshold detection, and manual marks; only Octatrack's grid was found to be equal division alone, and that comes from older manual pages.

### Comparison table

| | Koala Sampler | MPC (drum program) | Digitakt II | Octatrack MKII | EP-133 K.O. II |
|---|---|---|---|---|---|
| Sounds at once | 64 pads | 128 pads | 16 tracks | 8 tracks | 12 pads × 4 groups (48, by arithmetic) |
| Banks | A–D of 16 | A–H of 16 | 8 pattern banks; not sound banks | Pattern banks; 128 flex + 128 static slots | Groups A–D |
| Mic / line | Mic, or USB input | Input (External) | 2 balanced stereo inputs | Inputs A/B, C/D | Mic, line (mono, stereo, L, R), USB |
| Own output | Resample from app; sequence bounce to pad | Resample input setting | Internal resampling | SRC3: main, cue or a track | Resample mono/stereo; resample pattern |
| Trigger to record | Hold empty pad, release to stop | Threshold or manual; record window | Free or quantized | Manual, recorder trigs, pickup | Hold pad; threshold knob; hands-free mode |
| Slicing | Auto-chop, in the Samurai IAP in 2022 | Threshold, regions, manual; Convert to new program | Slice: 64 free points, transient detect; Grid machine | Slice grid 2–64 | Equal auto chop; live chop by pad taps |
| Play modes | One-shot, gate, loop, hold toggle | One Shot / Note On (loop while held) | Machines: Oneshot, Werp, Stretch, Repitch, Slice, Grid | Static/Flex machines | oneshot, key, legato |
| Choke | 6 choke groups | 32 mute groups, plus 4 mute targets per pad | Not verified | Not verified | Mute groups |
| Per-pad FX | EQ per pad; pad effects unverified | Per-sample effects listed | Per-track filter, overdrive, LFOs; shared send FX | Not verified | None at 2024 launch; group send only |
| Evidence level | [P] docs, [S] | [S] older manuals | [P] product page, [S] | [S] manual pages | [P] guide v2.5, [S] |

### Cited Findings

**Koala Sampler**
- [P] 64 pads in banks A–D; features include looping, stem extraction, time stretching, resampling, EQ per pad and auto-chop; tap and hold a free pad to record from mic, release to stop — [Koala docs, overview](https://metawork-studio.github.io/koala-documentation/mobile/2-general-overview.html)
- [P] Sources: Mic with 8 input effects, Input (USB interface or AUv3 host), Resample from app (tap a free pad, then play pads or a sequence, with live effects), Import audio, Samples browser including whole banks from other songs, Import video. Sequences can also be bounced to a pad — [Koala docs, Sample Sources](https://metawork-studio.github.io/koala-documentation/mobile/4-sample)
- [P] 16 live effects in series, all usable at once; paid mixer adds 4 bus channels plus main, each with 5 effect slots — [Koala docs, overview](https://metawork-studio.github.io/koala-documentation/mobile/2-general-overview.html)
- [S] ONE SHOT on = plays through on tap, off = plays only while pressed; enabling LOOP turns the button into HOLD (tap to start, tap to stop); loop options include ping-pong, loop marker and crossfade; CHOKE assigns one of 6 groups — [Koala docs excerpt](https://metawork-studio.github.io/koala-documentation/mobile/4-sample) (exact subsection not confirmed); one-shot default in [Settings](https://metawork-studio.github.io/koala-documentation/mobile/8-settings)
- [S] In Oct 2022, 32 sequences; time-stretch, piano roll and slicing were in the "Samurai" purchase, AUv3 a separate purchase; £4.49 — [Sound On Sound](https://www.soundonsound.com/reviews/elf-audio-koala-sampler)
- [F] Capture of other apps' audio is claimed for some phones by one tutorial; the official docs do not mention it — [community tutorial](https://djkokumoproductions.netlify.app/tut-koala)

**MPC**
- [S] Drum programs have 128 pads, 16 across eight banks — [MPC X manual](https://www.manualslib.com/manual/3354237/Akai-Mpc-X.html?page=83)
- [S] Programs store per-sample settings including pad assignments, loop points, pitch tuning and effects — [MPC X manual](https://www.manualslib.com/manual/3354237/Akai-Mpc-X.html?page=83)
- [S] Up to four sample layers per pad; One Shot plays to completion, Note On loops while held; 32 mute groups; up to four Mute Targets per pad (Drum Programs only) — [MPC manual, Mute Target](https://www.manualslib.com/manual/875177/Akai-Mpc.html?page=96) and [MPC X manual, Drum Programs](https://www.manualslib.com/manual/1282429/Akai-Mpcx.html?page=41) (excerpts, older versions)
- [S] Sample Record input switches between External and Resample; threshold auto-starts recording, and too high a value clips the start — [MPC manual](https://www.manualslib.com/manual/724425/Akai-Mpc.html?page=68)
- [S] Chop: tap Threshold to chop and assign segments to pads, drag tabs to adjust, Shift + Convert to make a new drum program — [Akai support](https://support.akaipro.com/en/support/solutions/articles/69000859300-mpc-series-convert-your-chopped-samples-into-a-drum-program)
- [S] MPC Beats: free, classic 4×4 grid, piano roll, sample editor, 8 MIDI/instrument tracks plus 2 stereo audio tracks, 2020 launch — [Synthanatomy](https://synthanatomy.com/2020/07/akai-mpc-beats-is-a-complete-beat-making-daw-that-cost-you-nothing.html); banks in Beats not confirmed

**Digitakt II**
- [P] 16 tracks, each stereo, mono or MIDI; machines Oneshot, Werp, Stretch, Repitch, Slice, Grid; external and internal resampling, free or quantized; up to 30 minutes of stereo per project; 400 MB sample memory plus 20 GB +Drive; per-track base-width filter plus one swappable filter, overdrive, 3 LFOs; send Delay, Reverb, Chorus; master overdrive and compressor; 48 kHz/24-bit — [Elektron](https://www.elektron.se/digitakt-ii)
- [P] OS 1.15 "Added Slice machine" — [Elektron release notes](https://www.elektron.se/release-notes/digitakt-ii)
- [S] June 2025: up to 64 freely placed slices, equal-division start, transient detection, per-slice start, end and loop, link mode — [Gearnews](https://www.gearnews.com/elektron-digitakt-ii-review/), [MatrixSynth](https://www.matrixsynth.com/2025/06/digitakt-ii-os-115-upgrade.html)
- [S] 128 patterns in 8 banks, up to 128 steps; 66 seconds per sample and 1024 samples per project on retailer pages — [Thomann](https://www.thomann.de/be/elektron_digitakt_ii.htm). The 66 s figure and the 30-minute figure are per-sample and per-project, so they need not conflict
- Note that a launch review saying Slice was renamed Grid — [Sound On Sound](https://www.soundonsound.com/reviews/elektron-digitakt-ii) — is overtaken by OS 1.15, which added Slice alongside Grid

**Octatrack MKII**
- [S] Eight tracks; Static, Flex, Thru, Neighbor and Pickup machines; 80 MB flex RAM per project; Static streams from CF; 128 + 128 sample slots plus recorder buffers — [Elektron](https://www.elektron.se/octatrack-mkii/), [manual page](https://www.manualsdir.com/manuals/657165/elektron-octatrack.html?page=22)
- [S] Recorder sources: INAB, INCD, and SRC3 = main mix, cue mix or one audio track. Eight recorder buffers sit in the flex slot list, are overwritten on the next take and are lost on power-off or project change — [manual page](https://www.manualsdir.com/manuals/657165/elektron-octatrack.html?page=62), [track recorders](https://www.manualsdir.com/manuals/657165/elektron-octatrack.html?page=60)
- [S] Sampling can be manual or sequenced with recorder trigs — [manual page](https://www.manualsdir.com/manuals/657165/elektron-octatrack.html?page=144)
- [S] Slice grid of 2, 3, 4, 6, 8, 12, 16, 24, 32, 48 or 64 between trim points, optional zero-cross alignment, optional linear locks to the sequencer — [manual, via search](https://www.manualsdir.com/manuals/657165/elektron-octatrack.html?page=111) (page approximate)

**EP-133 K.O. II**
- [P] Guide is at v2.5: USB audio, reverse sample playback, selectable recording sample rate, longer mono samples, equal length auto chop, arpeggio and keys improvements — [TE guide](https://teenage.engineering/guides/ep-133)
- [P] 999 samples or 128 MB; default slot ranges by type: kicks 1–99, snares 100–199, hats 200–299, percussion 300–399, bass 400–499, melodic 500–599 — [TE modes](https://teenage.engineering/guides/ep-133/modes)
- [P] Press SAMPLE, then hold a pad to record. Plus/minus cycles mic, line, resample, line L/R, USB. Knob X = input level, knob Y = threshold. Press SAMPLE again to retake. Shift + pad = hands-free. Resample pattern: Shift, pad, Play, then set bar count — [TE functions](https://teenage.engineering/guides/ep-133/functions)
- [P] Chop: equal length auto chop resets the group's pad assignments; live chop is pressing pads during playback, then fine trim with knobs — [TE functions](https://teenage.engineering/guides/ep-133/functions)
- [P] Sound edit: oneshot (monophonic, plays the whole sample), key (polyphonic), legato (monophonic, continues from the same point), plus pan, trim, attack and release, BPM, BAR or reverse, MIDI channel and root, mute group. Edits apply to the project and do not change the sample, except crop, which overwrites and cannot be undone — [TE modes](https://teenage.engineering/guides/ep-133/modes)
- [S] Sound mode sets per-sample level, pan, pitch and envelope; one master FX slot; fader sends each group to FX; fader assignable per group to level, pitch, filter or send; 12-note polyphony; no per-sound FX — [Sound On Sound, March 2024](https://www.soundonsound.com/reviews/teenage-engineering-ep-133-ko-ii)
- Conflict: that review says no USB audio and no resampling; the current [TE guide](https://teenage.engineering/guides/ep-133/functions) lists both, so firmware has overtaken the review

### Inferences
- The strongest shared pattern is that record is a pad gesture: pick the destination by touching it. Koala's hold-to-record is the fastest; EP-133 adds the two things hold-to-record lacks, a threshold and a hands-free mode. Both matter on a phone, where one hand may hold the device.
- Source choice should be a small persistent setting (Mic / Master), not a dialog. EP-133's plus/minus cycling and Koala's mode are both one touch.
- Master capture on a web app is an internal tap on our own audio graph, so it needs no OS permission; capturing other apps is a different problem, and even Koala's support for it is unverified.
- Use EP-133's rule of keeping edits as non-destructive pad metadata, but avoid its unrecoverable crop.
- Octatrack's volatile buffers are the warning: a recorded take should be saved at once.
- Default play mode by content: short drum takes one-shot, longer takes gate or loop. This is a design guess; I found no product that auto-picks mode by length.

### Gaps
- Current MPC 3 / MPC Software 3 manuals could not be read: the Akai PDF exceeded fetch size and manualmachine returned 403. MPC figures come from older editions; no 2026 confirmation.
- MPC per-pad insert FX count, filter and tuning ranges were not verified.
- Octatrack per-track FX, parts and scenes, and Digitakt II choke behaviour, were not verified.
- Koala's current IAP split, sample length cap and whether Samurai still gates slicing; the 2022 review is the newest statement I have.
- Whether EP-133 has firmware past v2.5 by October 2026, and when v2.5 shipped.
- Pitch ranges per pad on all products.

## What pad count and banking fits a phone screen?

### Takeaway
Practice converges on a 4×4 grid per view, with banks to reach more. I found no controlled study of pad layouts on phones, so this is convergent practice rather than proof. The platform tap minimum does not constrain 4×4, but it does rule out 8×8 on a portrait phone with normal gaps.

### Cited Findings
- [P] Koala: 64 pads across 4 banks of 16 — [Koala docs](https://metawork-studio.github.io/koala-documentation/mobile/2-general-overview.html)
- [S] Ableton Note: 16-pad grid for kits — [App Store listing](https://apps.apple.com/nl/app/ableton-note/id1633243177?uo=2); a [MusicRadar review](https://www.musicradar.com/news/ableton-note-app-iphone-ableton-live) instead calls input a 5×5 grid, probably the pitched view but not confirmed
- [F] Note 1.3 reportedly added a 16 pitches mode for Drum Racks; I could not confirm this — [Loopy Pro forum](https://forum.loopypro.com/discussion/comment/1393297/)
- [S] Korg Gadget 2 Beatmaker: 16 pads across eight banks, 128 sounds; Patterning 2: 4×4 of 16 — [roundup](https://emastered.com/blog/best-beat-making-app) (exact source within the search set not pinned)
- [S] GarageBand iOS drum pads reported at 16 in one source; weak sourcing — [Point Blank](https://www.pointblankmusicschool.com/blog/7-best-beat-making-apps-for-music-production-on-the-go/)
- [P] EP-133 uses 12 pads, a phone-keypad layout, across 4 groups — [TE system](https://teenage.engineering/guides/ep-133/system)
- [S] Apple recommends 44×44 pt controls (about 7 mm); Material 48×48 dp (about 9 mm); WCAG 2.2 AA minimum 24×24 CSS px, AAA 44×44 — [touch target summary](https://blog.openreplay.com/improving-tap-targets-mobile-ux/), [Roselli](https://adrianroselli.com/2019/06/target-size-)
- [F] Koala bank change is by swipe or by tapping bank buttons — [community tutorial](https://djkokumoproductions.netlify.app/tut-koala)

### Inferences
- Pad geometry on a 390 pt wide phone with 8 pt margins and 6 pt gaps: 4×4 gives about 89 pt pads, roughly twice the Apple minimum. 8×8 gives about 42 pt, below it. 8×8 only passes at 2 pt gaps (45 pt).
- Recommendation: 16 pads per view, 4 banks (A–D) for 64 total on phone, as in Koala. Tablet can show two banks side by side or 8×8.
- 64 fits a note range cleanly: A 36–51, B 52–67, C 68–83, D 84–99. It stays well inside the 128 limit that Ableton allows and matches its 16-pad view steps.
- Avoid swipe-to-bank on the pad surface itself: during finger drumming a slid hit could flip banks. Use bank buttons, with swipe only on a strip outside the grid. This is design reasoning, not a user finding.
- Reserve vertical space for a waveform or record strip; a portrait phone leaves room below a square 4×4 grid. That is also the natural home for the pad's edit panel.

### Gaps
- No usability study or accuracy data found for pad size vs finger-drumming timing on phones.
- Web touch latency and multitouch limits on iOS Safari were not covered here.
- Whether BandLab's Sampler uses 16 pads was not confirmed; [its help page](https://help.bandlab.com/hc/en-us/articles/4403006058009-How-do-I-use-Sampler) confirms gate, one-shot and grouped choke modes only.

## How do live synth pads work, and what are the CPU tradeoffs against rendered samples?

### Takeaway
In both Ableton and Bitwig a pad is a full device chain, so a synth is just another chain behind a note. CPU evidence is anecdotal: sample pads are light, live synthesis scales with voices and patch, and the standard fix is to render or freeze. No benchmarks were found.

### Cited Findings
- [P] Bitwig Drum Machine: "made to house multiple instruments, each of which will be triggered by a specific note message"; up to 128 drum chains with 16 shown at a time; each chain is a full device chain; right-click a chain to set choke target or which chain chokes it — [Bitwig guide](https://www.bitwig.com/userguide/latest/advanced_device_concepts/)
- [P] Described as a container that routes note signals to chains by pitch, with internal mixer controls — [Bitwig Drum Kit](https://www.bitwig.com/userguide/latest/drum#drum_machine)
- [P] Bitwig ships dedicated drum instruments (kick, snare and others across its v8, v9 and v0 families) — [Bitwig guide index](https://www.bitwig.com/userguide/latest/)
- [P] Ableton's Drum Rack chains take a single note and can contain instruments and effects, with a Play note setting what the device receives — [Ableton manual, Racks](https://www.ableton.com/en/manual/instrument-drum-and-effect-racks/)
- [F] One producer renders drums and bass to audio because too many sounds over MIDI overloaded the CPU, keeping live MIDI only for what is performed — [Ableton forum](https://forum.ableton.com/viewtopic.php?p=1720171) (thread attribution approximate)
- [F] Idle large Drum Racks still added around 12% CPU in one report; very large racks caused clicks with CPU near 15% in another — [Ableton forum](https://forum.ableton.com/viewtopic.php?p=1201815)
- [S] Short drum samples are fairly light on modern machines; automating rack on/off stops unused racks from drawing CPU — [Modern Drummer](https://www.moderndrummer.com/?p=147087)
- [F] Wavetable load varies by preset — [Ableton forum](https://forum.ableton.com/viewtopic.php?p=1798247) (attribution approximate)

### Inferences
- Bitwig's choke model is pairwise targets; Ableton's is numbered groups; MPC offers both. Numbered groups are simpler on a phone.
- Tradeoff table (reasoning, not measured):
  - Live synth pad: pitch, velocity and patch stay editable, per-hit variation is possible, no memory for audio; costs per voice, per block, and scales badly with fast rolls and long tails.
  - Rendered sample: fixed cost near a buffer read, predictable polyphony, safe for phones; timbre is frozen at render, and velocity and pitch response are lost or become simple resampling.
- A hybrid suits the brief: the pad stores both the patch and a cached render. Play the cache by default; re-render when the patch changes; switch to live only for pads with pitch or velocity variation that matters, or on tablets with headroom. Timeline data stays MIDI in every case.
- Voice caps are needed per pad and globally. EP-133 lives with 12 voices and steals, which shows a small budget is workable.
- Rendering at several velocity layers (MPC's four layers is a useful ceiling) would keep dynamics at low cost.
- Web Audio specifically: synth pads in an AudioWorklet share one thread budget, so the render fallback matters more than on desktop. This needs measuring on real phones, which another researcher may cover.

### Gaps
- No published benchmarks comparing a synth drum voice with sample playback; no web-audio or mobile figures.
- Ableton's Freeze behaviour and Live 12's newer Drum Sampler and drum synth devices were not read in the manual here.
- Bitwig's handling of GM names or per-chain note remapping was not in the pages read; a [community page](https://bitwig.community/device-drum-machine) mentions GM names, unconfirmed.

## What do users most complain about or praise in record-to-pad workflows?

### Takeaway
Praise goes to speed and low friction: touch, record, play. Complaints concentrate on what comes after capture: export and interoperability on apps, slicing limits on Digitakt, learning load on Octatrack, and FX limits on EP-133. Sentiment evidence is thin and anecdotal; there is no survey data.

### Cited Findings
- [S] Koala: "efficient" workflow, easy navigation, deep features, and low price; UI "not the most beautiful" — [Sound On Sound](https://www.soundonsound.com/reviews/elf-audio-koala-sampler)
- [F] A Koala user finds its workflow easier and its routing more flexible than comparable hardware but prefers the hardware's sound — [r/KoalaSampler mirror](https://redlib.hyperreal.coffee/r/KoalaSampler/comments/1jw0q4d/anyone_here_use_koala_with_sp404/mmelf1g/?context=3)
- [F] Koala wishes: MIDI file export of patterns, step-based undo for trim, normalize and slice, MIDI out, better AUM and Audiobus sync — [community wishlist](https://hiphopdrumsamples.com/blogs/hip-hop-producer-blog/koala-sampler-feature-wishlist); per-pad export — [Loopy Pro](https://forum.loopypro.com/discussion/39285/koala-app-feature-wishes-what-are-yours)
- [F] Global undo/redo shipped in Koala 2.0.3 (date not given) — [RouteNote](https://create.routenote.com/blog/koala-sampler-gains-new-mix-powers/)
- [F] Koala issues: empty samples when exporting stems to Ableton — [Loopy Pro](https://forum.loopypro.com/discussion/54600/ableton-koala-problem); samples missing on project reopen and AUv3 trigger bugs — [Blip forum](https://www.blipinteractive.co.uk/community/discussion/comment/12562). These are dated and may be fixed
- [F] Digitakt lacked real slicing for years, and sample chains are "painful" when unequal; some defended this as the design — [Elektronauts](https://www.elektronauts.com/t/about-slicing-samples-no-slice-mode-in-dt-should-i-trade-dt-for-a-ot/40332), [slicing update thread](https://www.elektronauts.com/t/silly-question-but-will-we-ever-see-an-update-for-slicing/161373?page=3)
- [S] The eventual Slice machine was presented as a major user-requested feature — [MusicRadar](https://www.musicradar.com/music-tech/samplers/digitakt-iis-new-firmware-update-adds-a-major-user-requested-feature-and-finally-lets-it-step-out-of-the-shadow-of-the-original)
- [F] Octatrack: split on the learning curve; the different ways of sampling are named as the confusing part — [Elektronauts](https://www.elektronauts.com/t/struggling-octatrack-newbie-needs-advice/138507), [Considering an Octatrack](https://www.elektronauts.com/t/considering-an-octatrack/39247)
- [S] EP-133 criticisms in 2024: one master FX, no per-sound FX, no filter envelope, "ropey" stretch at times, no backup at launch, faulty fader reports — [Sound On Sound](https://www.soundonsound.com/reviews/teenage-engineering-ep-133-ko-ii)

### Inferences
- Slicing is non-negotiable. Digitakt spent years being criticised for lacking free-point slicing, and Elektron eventually added it.
- MIDI export to Ableton is a differentiator: it is a real Koala wish, and Note routes it through Live. Since pad hits are already MIDI here, this is cheap to offer.
- Undo across recording and trimming matters more on touch, where mis-taps are common. Keep the raw take until the user commits.
- Octatrack's lesson: many recording routes cost understanding. Keep two sources (Mic, Master) and one gesture.
- Provide save and export reliability first; lost samples are the most damaging class of complaint found.

### Gaps
- r/ableton sentiment on record-to-pad was not retrieved; Reddit evidence is one mirrored thread.
- No quantified complaint data. [Kimola's review analysis](https://kimola.com/reports/koala-sampler-feedback-analysis-unlock-user-insights-app-store-us-153467) exists, but its method is unclear and I did not use its numbers.
- Reports of current MPC sampling pain points were not found; one [forum report](https://www.mpc-forums.com/viewtopic.php?p=1872301) area was seen only in passing.

## What is the standard General MIDI / Ableton drum note mapping for exporting .mid to Ableton?

### Takeaway
Note numbers are the standard; note names are not. GM percussion runs from 35 to 81 on channel 10, with the kick at 36 (also 35), snare 38, closed hat 42, open hat 46. Ableton calls note 36 "C1", while the GM table in Wikipedia and EP-133 call it "C2". Write numbers into the .mid file and never derive from names.

### Cited Findings
- [S] GM percussion is reserved for channel 10. Core keys: 35 Acoustic Bass Drum, 36 Electric or High Bass Drum, 37 Side Stick, 38 Acoustic Snare, 39 Hand Clap, 40 Electric Snare, 41 Low Floor Tom, 42 Closed Hi-hat, 43 High Floor Tom, 44 Pedal Hi-hat, 45 Low Tom, 46 Open Hi-hat, 47 Low-Mid Tom, 48 High-Mid Tom, 49 Crash 1, 50 High Tom, 51 Ride 1, 52 Chinese, 53 Ride Bell, 54 Tambourine, 55 Splash, 56 Cowbell, 57 Crash 2, 58 Vibraslap, 59 Ride 2, 60–61 Bongos, 62–64 Congas, 65–66 Timbales, 67–68 Agogô, 69 Cabasa, 70 Maracas, 71–72 Whistles, 73–74 Güiro, 75 Claves, 76–77 Woodblocks, 78–79 Cuíca, 80–81 Triangle — [Wikipedia, General MIDI](https://en.wikipedia.org/wiki/General_MIDI)
- [S] 35 and 36 are named differently across tables ("Bass Drum 1" for 36 in Finale) — [Finale GM table](https://www.finalemusic.com/UserManuals/Finale2011Mac/Content/Finale/General_MIDI_Percussion_Map_Table.htm)
- [S] Ableton: slices start at C1 = MIDI note 36 — [Ableton manual excerpt](https://www.ableton.com/en/manual/converting-audio-to-midi/)
- [P] Drum Rack's Receive chooser lists note name, note number and GM equivalent — [Ableton manual, Racks](https://www.ableton.com/en/manual/instrument-drum-and-effect-racks/)
- [S] Wikipedia labels 60 as C4 and so 36 as C2 — [Wikipedia](https://en.wikipedia.org/wiki/General_MIDI)
- [F] MIDI fixes only that note 60 is middle C; Ableton labels it C3; other software differs — [Ableton forum, staff reply](https://forum.ableton.com/viewtopic.php?p=1181868)
- [F] One VCV thread says Ableton's middle C is note 72; it contradicts the C1 = 36 statement and should be ignored — [VCV forum](https://community.vcvrack.com/t/midi-gate-map-wrong/15188/19)
- [P] EP-133 sends group A 36–47, B 48–59, C 60–71, D 72–83, labelled C2–B5, basic channel 1; order within a group is ".", 0, Enter, then 1–9; keys mode changes this to chromatic — [TE system](https://teenage.engineering/guides/ep-133/system)
- [P] Bitwig uses C1 for kick and F#1 for closed hat in its example — [Bitwig guide](https://www.bitwig.com/userguide/latest/advanced_device_concepts/). This agrees with Ableton if Bitwig's C1 is also note 36, which the page does not state

### Inferences
- Export spec: pad note = 36 + 16 × bank + pad index, counted from the bottom-left of the grid, ascending left to right then upward. Bank A then spans 36–51 and contains GM kick (36), snare (38), clap (39), closed hat (42), pedal hat (44), open hat (46). Dropping a .mid on an Ableton kit should then land on matching sounds if default kits follow GM, which their Receive chooser suggests.
- A "GM layout" for the default kit means placing kick on pad 1, snare on pad 3, closed hat on pad 7, open hat on pad 11 of bank A (1-based pad numbers on the chromatic grid). Alternatively, keep a friendlier layout and remap on export.
- Show pad note labels using Ableton's naming (36 = C1) since Ableton is the named target, but state the number too.
- Channel: use channel 10 only if GM file compatibility matters. Drum Rack probably ignores it, which needs testing with a real Live set.
- Pitched pads: keep pad pitch in pad metadata, not in the note, so the Drum Rack mapping survives. For a synth pad played melodically, export a separate track with real pitches, not pad notes.
- Slices should follow Ableton: chromatic from 36. That gives a slice export identical to Slice to New MIDI Track.
- Export bundle: one .mid per kit or pattern, plus WAVs named with note and pad (for example `A07_F#1_42_closedhat.wav`).

### Gaps
- Ableton's own text on octave naming beyond C1 = 36 was not retrieved, so "60 = C3" is arithmetic plus forum support.
- Whether Live's default Drum Rack layout starts its lowest visible pad at C1 was not read directly in the fetched text; slices starting there suggest it.
- Velocity, PPQ and tempo-map conventions for .mid export were out of scope here.
- A real round-trip test (write a .mid, load in Live via the LiveBridge setup in this repo's tooling) has not been done.
