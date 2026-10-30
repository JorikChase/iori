# Synplant 2 and comparable mutation-based or touch-first synthesizers

Research date: 2026-10-30. Evidence tags used below:
- **[V]** verified from the vendor's own page, manual, or App Store listing.
- **[R]** reported by a review, retailer, wiki or forum, not checked against a vendor source.
- **[V1]** comes from the Synplant 1.2 manual (older), read through a third-party mirror. V2 is backward compatible with the core design, but specific V1 details may have changed.

Method limits: pages were read through a fetch-and-summarise tool, so paraphrases are close but exact wording was not independently checked. The official Synplant 2 PDF, the official Drambo PDF, and the Animoog Z manual were not retrieved. App Store changelog dates that show no year are marked as such.

## Synplant 2: features, seed and branch model, genes, Genopatch, voice architecture, playing, patches

### Takeaway
Synplant is a two-oscillator FM subtractive synth whose parameters are hidden behind a radial plant: one seed (a full parameter set), up to 12 branches mapped to the 12 notes of an octave, and branch length as mutation distance. Its power comes from a small genome tuned so random change still sounds good. Version 2 adds Genopatch (audio to patch), a readable DNA editor, mono/glide/tempo sync and basic MPE. No phone or tablet version was found.

### Cited Findings

**Product status, October 2026**
- [V] Mac: stand-alone plus VST 2.4, VST3 and AU2. Windows: plug-in only, no stand-alone. Three-week trial. €149; v1 upgrade €50 — [Sonic Charge](https://soniccharge.com/synplant)
- [R] Released October 2023 — [Sonic Field](https://sonicfield.org/phenotype-synplant-2-text-to-patch). The CDM hands-on is dated 4 October 2023 — [CDM tag page](https://cdm.link/tag/synplant/)
- [R] PhenoType 1.0, a free text-to-patch script, requires Synplant 2.0.2 — [Sonic Field](https://sonicfield.org/phenotype-synplant-2-text-to-patch). Date conflict on when it appeared: Synth Anatomy search metadata points to 10 June 2026 ([Synth Anatomy](https://synthanatomy.com/tag/phenotype)); Sonic Field's article is dated 20 July 2026 but gives no release date.
- No iOS, Android or web version turned up. The product page lists Mac and Windows only — [Sonic Charge](https://soniccharge.com/synplant)

**Seed, branches, growth**
- [V1] The seed holds one sound. Dragging inside the bulb grows branches. Branches near the seed sound like it, and the further out, the more different — [manual p.4](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=4)
- [V1] Each branch maps to a note in an octave, so different keys trigger different sounds. Dragging a branch auditions it automatically (can be turned off). Shift gives finer length — [manual p.4](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=4)
- [V1] Cut a branch and re-plant it with the Seed button to get a new root and up to 12 new branches. Cmd/Ctrl-click retracts a branch to the root — [manual p.4](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=4)
- [V1] Key Ring plays notes without changing branch lengths. Mod Wheel Ring or the MIDI mod wheel grows all branches at once. Wheel Scaling sets how far — [manual p.5](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=5)
- [V1] Rotation Control changes which branches each key triggers; the manual suggests automating it — [manual p.5](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=5)
- [R, v2] Dragging a second branch evolves differently. Alt-click on the seed clones the selected branch to all branches, giving one playable sound across the range — [Sound on Sound](https://www.soundonsound.com/reviews/sonic-charge-synplant-2?amp)
- [V1] New Random Seed keeps all sliders except Tuning. Atonality steers seed type: near 0 melodic, near 100 unpitched effects. Cmd/Ctrl-click on the seed previews — [manual p.8](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=8)

**Mutation and inheritance**
- [R, Lidström] DNA is "the set of parameters from which the branches semi-randomly morph" — [CDM](https://cdm.link/synplant-2-hands-on/)
- [R, Lidström] The synth is built to give interesting results when its parameters are mutated — [CDM interview](https://cdm.link/?p=117612)
- [R] Gene scales and response ranges were tuned so random mutation yields useful sounds — [search summary of the manual and rekkerd coverage](https://rekkerd.org/?p=6603). The underlying sentence was not read directly.
- [V1] Atonality has a subtle effect on short branches and a drastic one on grown branches. Low values keep long branches playable and in tune, useful for mod-wheel morphs — [manual p.6](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=6)
- [V1] Editing a seed's genome does not fully control branches: "any grown branches may produce sounds that could be radically different from the seed" — [manual p.10](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=10)
- [V1] `fx_size` is excluded from growth to avoid audio disruption, so genes are not all treated equally — [manual p.15](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=15)
- [V1] Tuning is estimated per new seed so the slider centre is right, with manual correction of up to one octave either way — [manual p.6](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=6)

**Complete V1 genome: 37 genes, all normalised, many with 0.5 as neutral**
- [V1] 37 genes in total; Cmd/Ctrl-click resets one to 0.5 — [manual p.10](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=10)
- [V1] Envelope (10). `env_time` total duration, near 1.0 is effectively infinite. `env_loop` loop time. `env_tilt` skews attack against decay. `vol_atk`, `vol_dcy`, `vol_sus`. `mod_atk`, `mod_dcy`, `mod_sh`, `mod_vel`. The same envelope drives modulation and volume — [manual p.14](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=14)
- [V1] LFO (3). `lfo_rate`, `lfo_amt` (below 0.5 is off), `lfo_bal` (vibrato to tremolo) — [manual p.15](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=15)
- [V1] Oscillator A (5). `a_form` morphs sine, saw, square, pulse. `a_noise`, `a_color`, `a_freq` (sets overall pitch; B and the filters follow), `a_mod` — [manual p.15](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=15)
- [V1] Oscillator B (5). `b_form`, `b_noise`, `b_freq` (relative to A), `b_mod`, `b_sh` (sample-and-hold) — [manual p.15](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=15)
- [V1] FM and mix (4). `fm_amt` (A modulated by B, bipolar), `fm_mod`, `sub_am` (AM of B one octave down), `balance` — [manual p.15](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=15)
- [V1] Filter (5). `flt_freq` (relative to A), `flt_mod`, `flt_sep` (two parallel filters), `flt_q`, `flt_kf` (below 0.25 fixed, above 0.75 full tracking) — [manual p.15](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=15)
- [V1] Effect (5). `fx_mix`, `fx_len`, `fx_damp`, `fx_chors`, `fx_size` (chorusing reverb) — [manual p.15](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=15)

**Version 2 engine**
- [R] Twin oscillators with FM, envelope and modulation system, filter section, plus reverb, saturation, EQ and panning — [Sound on Sound](https://www.soundonsound.com/reviews/sonic-charge-synplant-2?amp)
- [R, Lidström] Core design kept similar for full backward compatibility, most DSP overhauled. Morphable filter mixes the two SVF outputs. Per-voice asymmetric saturation. Output two-band EQ and adjustable soft clipper. Distortion before and after mix-down. Reverb has an attack envelope that fades it in on each note — [CDM interview](https://cdm.link/?p=117612)
- [R] "Entirely rewritten" engine with more parameters. New: mono patches, glide, tempo sync for any rhythmic component — [CDM](https://cdm.link/synplant-2-hands-on/)
- [V] Polyphonic and monophonic play modes with portamento and tempo sync; Layer mode stacks sounds — [Sonic Charge](https://soniccharge.com/synplant)
- [V1] Polyphonic with one global reverb; the last key pressed sets the active reverb, so a short-reverb branch cuts a long tail — [manual p.6](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=6)

**Playing and control**
- [R] Four bulb modes set how branches respond to MIDI notes, one of them layering — [Sound on Sound](https://www.soundonsound.com/reviews/sonic-charge-synplant-2?amp)
- [V] Notes and velocities produce variations of a sound — [Sonic Charge](https://soniccharge.com/synplant)
- [V1] Velocity Sensitivity is per patch, default 50%; a global curve sits outside the patch — [manual p.7](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=7)
- [R] Basic MPE: per-channel modulation, pitch bend and pressure. Mod wheel can be reassigned to cutoff, LFO amount, envelope time. Genes accept MIDI CC and automation, allowing live morphing — [CDM](https://cdm.link/synplant-2-hands-on/)
- [V1] Four sliders around the plant: Atonality, Release, Tuning, Effect — [manual p.5](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=5)

**DNA editor**
- [R, Lidström] V1 had a deliberately difficult DNA spiral. V2 adds knobs and graphs so Genopatch's power is clearer, and keeps the spiral as an overview of all genes. Coloured lines show how grown branches move settings — [CDM](https://cdm.link/synplant-2-hands-on/)
- [R] Each horizontal gene line is a control. Three sections top to bottom: envelope and LFO; oscillators; filter and effects. Selecting a section shows rotary controls beside it; hover gives a description — [Sound on Sound](https://www.soundonsound.com/reviews/sonic-charge-synplant-2?amp)

**Genopatch and PhenoType**
- [V] Builds patches from audio, runs locally with no internet — [Sonic Charge](https://soniccharge.com/synplant)
- [R] Uses up to two seconds of a sample, is CPU heavy, grows four strands offering matches as coloured dots. Click to audition, save as a user patch, or Plant Seed. Best on plucks, short basses and percussion. A single-note source will not give a fully playable patch with the original's dynamics — [Sound on Sound](https://www.soundonsound.com/reviews/sonic-charge-synplant-2?amp)
- [R] Sample is converted to mono before analysis — [MusicTech](https://www.musictech.net/reviews/plug-ins/sonic-charges-synplant-2-review/)
- [R, Lidström] Combines machine-learning algorithms tuned over 10 years, the last five on neural nets. The net trains on semi-random sounds from the synth, learning to go from output sound to parameters. Training takes months for a small net that runs on the CPU and tests "hundreds of settings" per second. Confidence is set low, so it starts with wild guesses — [CDM interview](https://cdm.link/?p=117612)
- [R] PhenoType: runs in Synplant's JavaScript engine with no cloud or language model. About 210 tags and roughly 1,000 synonyms and negations. Classifier trained on almost 60,000 semi-random patches scores candidates. Broad categories work better than specific instruments. Output is an ordinary editable patch — [Sonic Field](https://sonicfield.org/phenotype-synplant-2-text-to-patch)
- [R] The same site describes it as a randomizer with intention, attributing that to CDM's Peter Kirn; CDM's teaser confirms no online connection and no large dataset — [CDM tag page](https://cdm.link/tag/synplant/)

**Patches and browsing**
- [V1] `.synp` files are plain text and can be copied, edited and pasted. Open dialog previews and plays patches before loading. Undo is nearly unlimited but cleared when the window closes — [manual p.8](https://www.manualsdir.com/manuals/349730/sonic-charge-synplant.html?page=8)
- [V] Hundreds of patches bundled, more downloadable — [Sonic Charge](https://soniccharge.com/synplant)
- [R] Criticised as a basic preset system with no tagging; DNA editing still tricky — [MusicTech](https://www.musictech.net/reviews/plug-ins/sonic-charges-synplant-2-review/)
- [R] JavaScript extensions are supported — [CDM](https://cdm.link/synplant-2-hands-on/)

### Inferences
- The tally of cited genes is 10 + 3 + 5 + 5 + 4 + 5 + 5 = 37, matching the stated count, so this V1 list is likely complete. V2 has more parameters, so it is a floor.
- Branch length behaves as a mutation-amount scalar applied to a per-branch random direction in gene space. The exact function is not public. Atonality appears to scale how much pitch-affecting genes may move.
- Inheritance is single-parent. Re-planting replaces the root and restarts with fresh branches. There is no crossover in any source read.
- The Synplant model trades reachability for safety. It works because the genome is small, normalised, and range-tuned. A larger engine would likely need per-gene mutation weights and locks, like `fx_size`.
- Mapping 12 sounds to 12 keys conflicts with melodic playing, which is why Alt-click clone exists. A jamming-capable design needs two explicit modes: per-note branches, and one branch across all notes.
- The neighbour-audition gesture (drag equals hear) is well suited to touch, and is what a phone version would keep first.

### Gaps
- Official Synplant 2 PDF was not retrievable (a guessed URL returned 404). The V2 gene list and count, voice count, the four bulb modes' names, and the V2 waveform and filter type lists are unconfirmed.
- Whether branch mutation is deterministic per seed, or how random directions are drawn: no source found.
- Genopatch's network architecture is not public.
- Whether Synplant supports microtuning: CDM does not cover it.
- A Synplant 2 changelog past 2.0.2 was not found.

## Note input, scale lock, layouts, polyphony, modulation, libraries and live recording across the comparison set

### Takeaway
Three approaches recur: a continuous touch surface with pitch correction (Moog), a tracker with a helper keyboard (SunVox), and small pad grids with scales and sample-to-keys (Koala, EP-133, Ableton Note). Voice counts sit at 4 to 16 for playing instruments. Live capture is usually one-button overdub on a looping pattern with quantise as a setting, not a separate mode.

### Cited Findings

| Instrument | Note input | Scale handling | Voices | Modulation | Library | Recording while playing |
|---|---|---|---|---|---|---|
| Animoog Z | Touch-surface keyboard with per-voice pitch and pressure | Configurable scales, key spacing, pitch correction, glide | 16 | 10-lane MOD page | Tags, sharing, random presets, packs | Arp and Looper, no sequencer listed |
| Model 15 | Moog keys, Animoog keys, 1150 ribbon, typing keys | 22 scales on Animoog keys | Mono or 4 | Patch cables | 160+ presets, packs | Looping recorder with overdub, 8-step arp |
| SunVox | Tracker cells, on-screen keyboard, Touch Theremin | Pattern "scale" action, details not read | Per-module Polyphony control | MultiCtl, LFO, ADSR, Sound2Ctl | `.sunvox`, `.sunsynth` | Rec button in timeline |
| Drambo | Piano roll with side keys, pads, MIDI | CV Quantizer as a post-process | Up to 16 per rack | Auto-routing, morph groups, scene morph | Patchstorage community | Sequencer, record details unread |
| Koala | Pads, piano keys, grid mode | 10 grid scales | 5-voice chords in grid | Not read | Sample kits | One-tap overdub |
| EP-133 | 12 pads, keys mode | Hold keys + knob Y | 16 mono or 12 stereo | One assignable fader, punch-in FX | 999 sample slots | Hold Record during Play |
| OP-1 Field | Physical keys, seven sequencers | Not found | 6 per engine (retailers) | One LFO slot | Presets | 4-track tape |
| Bitwig Grid | Desktop, not touch-first | Pitch modules | Inspector-set, stack up to 16 per note | Modulators on any parameter | Bitwig library | Standard DAW |

**Moog Animoog Z and Model 15**
- [V] Animoog Z: 16 voices. Touch surface with configurable scales, key spacing, pitch correction and glide, controlling pitch and pressure per voice, with MIDI out. MPE-compliant engine. MOD page with 10 lanes plus Solo and Enable to isolate routings. Latest listed 1.3.4, 8 June (no year shown). $29.99 unlock, packs $4.99 — [App Store](https://apps.apple.com/app/id1586841361)
- [V] Timbres can be recorded or imported; orbit path dragged through X, Y and Z — [App Store](https://apps.apple.com/app/id1586841361)
- [R] 8 × 16 grid of waves, three LFOs, pitch and mod wheels — [MusicRadar](https://www.musicradar.com/reviews/moog-animoog-z); [Attack Magazine](https://www.attackmagazine.com/technique/synth-secrets/programming-an-evolving-pad-with-moog-animoog-z/)
- [R] Touch-strip keyboard is easy to play but best on iPad, since the larger surface suits polyphony — [MusicRadar](https://www.musicradar.com/reviews/moog-animoog-z)
- [R] Sliding on an expanded key adds per-note modulation, a limited MPE-style option — [Engadget](https://www.engadget.com/moog-animoog-z-i-os-softsynth-music-app-170019893.html)
- [V1-era] In the original Animoog, Scale Lock keeps the chosen keyboard scale when changing presets. Not confirmed for Z — [Moog manual](https://api.moogmusic.com/sites/default/files/2018-10/AnimoogManual.pdf)
- [V] Model 15: mono or 4-voice, traditional and Animoog keyboards, typing keyboard, 1150 ribbon, 22 scales, 8-step sequencing arp, looping recorder with overdub, portrait and landscape, cable colouring, 160+ presets, MPE. Latest 2.4.4, 8 June (no year), iPad support only — [App Store](https://apps.apple.com/us/app/moog-model-15/id1041465860)

**SunVox**
- [V] Polyphony controller on Analog Generator, DrumSynth, FM, Kicker, Sampler, SpectraVoice, Generator; lower it to cut CPU — [manual](https://warmplace.ru/soft/sunvox/manual.php)
- [V] Rec button in timeline records live input; preferences cover metronome, grid fitting, note and automation quantisation. Controller moves can be recorded in real time — [manual](https://warmplace.ru/soft/sunvox/manual.php)
- [V] Touch Theremin: tap for voice, vertical for volume, horizontal for pitch. Multi-touch connects modules by touching source then target — [manual](https://warmplace.ru/soft/sunvox/manual.php)
- [V] MultiCtl drives up to 16 controllers from one value. MetaModule embeds a project and saves as `.sunsynth`; polyphony works only through its Input Module — [manual](https://warmplace.ru/soft/sunvox/manual.php)
- [R] Tracker cursor moves by drag, so a finger does not cover the cell — [Creative Applications](https://creativeapplications.net/sound/sunvox-iphone-sound). This is an old review.
- [R] Hard to adjust parameters while playing the on-screen keyboard; touch entry slower than external keyboard — [Audiobus forum](https://forum.audiob.us/discussion/comment/334712/)

**Drambo**
- [V] Up to 16 voices per rack, 16-track polyphonic sequencer, 140+ modules, cable-less left-to-right flow, morph groups, scene morphing, parameter locks, eight step editors, piano roll, clip launcher. Version 2.57 (16 October, no year shown): on-screen pitch and mod wheels with recording, dual oscillator cross-mod, 16-wave LFO. 2.56 added a generative sequencer for chords within a scale. 2.48 added a Meta randomizer with polyphonic Drift — [App Store](https://apps.apple.com/us/app/drambo/id1469365718)
- [R] Scale constraint is usually done post-sequencer with the CV Quantizer — [Beepstreet forum](https://forum.beepstreet.com/discussion/comment/50369)
- [R] Manual dates from April 2020 and lags the app — [Beepstreet forum](https://forum.beepstreet.com/discussion/comment/26529)

**Koala Sampler**
- [V] Keyboard mode needs the SAMURAI purchase. Modes: piano keys (lockable visible range, drag for octaves), VEL (key height sets velocity, lower is louder), note repeat (1/4 to 1/64, SNAP, triplets, slide for pitch or velocity), and Grid — [Koala docs](https://metawork-studio.github.io/koala-documentation/mobile/5-sequence.html)
- [V] Grid scales: Chromatic, Pentatonic, Major, Minor, Whole Tone, Diminished, Hexatonic, Japanese, Pelog, Ying Zhong. Chords up to 5 voices — [Koala docs](https://metawork-studio.github.io/koala-documentation/mobile/5-sequence.html)
- [V] Record overdubs on existing material. Tap another slot while recording to keep going. Quantise off or 1/16. SEQ SNAP aligns note ends to beat, bar or sequence end. 32 slots, up to 64 bars. Drag in the bar strip sets a loop. Double-up duplicates content — [Koala docs](https://metawork-studio.github.io/koala-documentation/mobile/5-sequence.html)
- [R] Changing the root in keyboard mode was an open question on a forum — [Loopy Pro forum](https://forum.loopypro.com/discussion/comment/1312923/)

**Teenage Engineering EP-133**
- [V] Keys mode spreads one sample chromatically across 12 pads. Hold KEYS + MINUS/PLUS for octave, + pad to transpose — [guide](https://teenage.engineering/guides/ep-133/play-and-record)
- [V] Hold KEYS + knob X for key, + knob Y for scale. Pad velocity off, hi or low — [how-to](https://teenage.engineering/guides/ep-133/how-to)
- [V] Live record: Record then Play gives 4-beat count-in; together skips it. Overdub: Play, then hold Record and hit pads. Step entry only when stopped. 96 PPQN, step of 24 ticks, up to 99 bars per group, length changeable during playback — [guide](https://teenage.engineering/guides/ep-133/play-and-record)
- [V] Fader takes an assigned parameter per group; hold Record and move it to record — [guide](https://teenage.engineering/guides/ep-133/play-and-record)
- [V] 16 mono or 12 stereo voices — [TE product page](https://teenage.engineering/products/ep-133). Some retailers list lower figures for earlier units — [soundtech](https://soundtech.co.uk/products/dealer-redirect/6131/302)
- [R] Pads are pressure and velocity sensitive — [MusicRadar](https://www.musicradar.com/news/teenage-engineering-ep-133-ko-2)

**Teenage Engineering OP-1**
- [V] Engines listed: FM, phase, pulse, string, voltage, vocoder, cluster, digital, dimension, DNA, DR wave/DSynth, synth sampler. Six LFO types: random, element, MIDI, tremolo, value, velocity. ADSR envelope. Sequencers: arpeggio, endless, finger, hold, pattern, sketch, tombola — [guide index](https://teenage.engineering/guides/op-1)
- [V] 4-track tape recorder; T4 shows the LFO screen — [user guide PDF, as summarised in search](https://teenage.engineering/_img/676030a8ef599a28c8bc97cf_original.pdf)
- [R] 6 notes per engine; retailer listings conflict, and a 24-voice figure relates to the sampler or original unit — [zZounds](https://www.zzounds.com/item--TEEOP1FIELD?siid=342475)
- [R] 8 tapes of 6 minutes, 4 stereo tracks — [zZounds](https://www.zzounds.com/item--TEEOP1FIELD?siid=342475)
- [R] LFO is a single slot per sound — [OP-1 reference](https://www.scribd.com/document/222303000/OP-1-Reference)

**Bitwig Grid**
- [V] Grid module categories: I/O, Display, Phase, Data, Oscillator, Random, LFO, Envelope, Filter, Shaper, Delay/FX, Mix, Level, Pitch, Math, Logic. Note Grid and FX Grid offer voice stacking and poly effects — [user guide](https://bitwig.com/userguide/latest/the_grid_devices)
- [R] Poly Grid is polyphonic by default, voices set in the inspector; a 2019 user cites up to 24 — [KVR forum](https://www.kvraudio.com/forum/viewtopic.php?p=7460156)
- [R] 5.1 (October 2023): stacks up to 16 voices per note, eight new Stack Spread modes, three new voice-stacking Grid modules, per-voice solo — [RouteNote](https://routenote.com/blog/bitwig-studio-5-1/); [Synthtopia](https://www.synthtopia.com/?p=140751)
- [R] A user reported 16 stacked voices got 16 times louder — [Synthtopia](https://www.synthtopia.com/?p=140751)

**Ableton, for comparison**
- [V] Ableton Note (iPhone): 25-pad grid, key and scale, piano roll and MIDI editor. Capture keeps what you just played, detects tempo and phrase length and makes a loop — [App Store](https://apps.apple.com/dk/app/id1633243177)
- [R] User reviews complain of pad latency, and of pads showing a fixed note set without octave scrolling — [App Store reviews](https://apps.apple.com/dk/app/id1633243177)
- [R] Move: 32 polyphonic aftertouch pads, a 16-pad drum layout, and a melodic layout across octaves and keys — [retailer listing](https://reverb.com/item/94775367-ableton-move-b-stock?id=eura)

### Inferences
- Capture-after-the-fact (Ableton Note) is the lowest-friction way to record on a phone, because it removes the need to arm first. EP-133's hold-to-overdub is the next best, and maps well to touch.
- Scale lock appears in two different senses: a key layout that omits notes (Koala Grid), and a pitch snap on a continuous surface (Animoog). They are different features and could be specified separately.
- Sound-design parameters and a keyboard competing for one phone screen is a named pain point in SunVox. Latched notes, external keys, or a small keyboard strip beside controls would each address it.
- Bitwig is the reference for voice semantics (voices versus stacks per note), not touch interaction. Gain compensation for unison looks needed.

### Gaps
- Animoog Z manual not retrieved, so its iPhone layout, chord features and Scale Lock wording are unconfirmed.
- Drambo's pad and keyboard behaviour, and its live-record workflow, were not found.
- OP-1's four-encoder page mapping and TE-published polyphony were not confirmed: the guide subpages tried returned only an index or 404.
- SunVox's mobile Rec workflow and pattern "scale" action were not detailed.
- Ableton Move's row interval was not confirmed; the only manual hit was an unofficial PDF's table of contents.
- Koala's stated polyphony outside grid mode was not found.

## What "fully featured" means and what each instrument exposes or hides on small screens

### Takeaway
The de facto baseline across these instruments is two or more oscillators or a wavetable, a filter with envelope, at least one or two LFOs, a routable modulation system, effects, a play mode including mono and glide, velocity, and preset browsing. Small-screen instruments rarely remove depth. They hide it behind pages, single-gesture controls and randomisation.

### Cited Findings

| Feature | Synplant 2 | Animoog Z | Model 15 | OP-1 | Drambo / SunVox / Grid |
|---|---|---|---|---|---|
| Oscillators | 2 + sub + noise | Wavetable-like timbres | Modular | Engine-based | Modular |
| FM | B to A | Not listed | Not read | FM engine | SunVox FM module, Drambo cross-mod |
| Wavetable | Morph sine to pulse only (V1) | Core feature | No | Not confirmed | Modules available |
| Filters | 2 parallel, morphable SVF | Not read | Moog modules | Not confirmed | Many |
| Envelopes | Shared, 2 shapes | Not read | Modular | ADSR | Multi-segment in Drambo |
| LFOs | 1 (V1) | 3 | Modular | 1 slot | Many |
| Mod matrix | None; branches move genes | 10 lanes | Cables | 4 parameters | Auto-route, modulators |
| Unison | `fx_chors`; Layer | Thick (detail unread) | Not found | Not confirmed | Stacking in Grid |
| Per-voice FX | Saturation per voice | Not found | No | No | Yes in Grid, Drambo |
| Macros | Mod wheel, wheel assign | Controllers in MOD | Not found | Encoders | Morph groups, MultiCtl |
| Mutation | Core | Random presets | No | No | Meta randomizer (Drambo) |

Cells above draw on sources cited in this file. Blank-equivalent values ("Not found") mean no source was read, not that the feature is absent.

- [V] Animoog Z groups its surface into pages, including a MOD page and Effects page with Arpeggiator and Looper — [App Store](https://apps.apple.com/app/id1586841361)
- [R] Animoog Z uses a KB Scale page for scale and mono or poly — [Attack Magazine](https://www.attackmagazine.com/technique/synth-secrets/programming-an-evolving-pad-with-moog-animoog-z/)
- [R] Drambo's interface generates modulation controls when needed — [App Store listing text](https://apps.apple.com/us/app/drambo/id1469365718)
- [V] Drambo morph groups and scenes reduce many controls to one slider — [App Store](https://apps.apple.com/us/app/drambo/id1469365718)
- [V] SunVox MultiCtl provides a macro as a module — [manual](https://warmplace.ru/soft/sunvox/manual.php)
- [V] EP-133 exposes one fader at a time by assignment — [guide](https://teenage.engineering/guides/ep-133/play-and-record)
- [R] Synplant hides parameters in gestures, and the DNA editor reveals them by section — [Sound on Sound](https://www.soundonsound.com/reviews/sonic-charge-synplant-2?amp)
- [R] Reviewers call the DNA editing "a little tricky" and the workflow fiddly — [MusicTech](https://www.musictech.net/reviews/plug-ins/sonic-charges-synplant-2-review/); [Bonedo](https://www.bonedo.de/artikel/sonic-charge-synplant-2-test/)
- [V] Model 15 keeps a full patching surface and offers portrait and landscape, relying on cable colouring to stay legible — [App Store](https://apps.apple.com/us/app/moog-model-15/id1041465860)

### Inferences
Baseline a user would likely expect, ordered by how often it appears above:
1. Two oscillators with morphing waveforms, sub, noise, and FM. Wavetable as an extension, since Animoog makes it the identity.
2. Amp and mod envelopes, ideally independent. Synplant's shared envelope is its most conspicuous limit by comparison.
3. Two LFOs at minimum, with sync. Synplant 2 added tempo sync; Animoog has three.
4. A modulation list, not a graph. Ten lanes with Solo and Enable (Animoog Z) is a proven phone-sized form.
5. Unison with detune and spread, with gain compensation.
6. Mono, legato, glide, poly with a visible voice count.
7. Per-voice saturation or drive, then shared chorus, delay and reverb.
8. Four to eight macros, and at least one on a jamming surface.

Other inferences:
- Mutation can coexist with a modulation list: branches change the seed's values, while lanes add motion. Modulation depths could be genes too, though no source describes this.
- The strongest small-screen pattern seen is "hide by gesture, reveal by page": a performance surface first, an editor one step away, and a grouped gene strip for overview.

### Gaps
- Animoog Z's envelope count, filter types and unison details were not read from a primary source.
- Filter details in the table for Animoog Z are unverified.
- No quantitative data found on which features users of phone synths actually touch.

## On-screen note-entry layouts for phones, with evidence

### Takeaway
No controlled study comparing piano, pads, strips and isomorphic grids on phones was found. The evidence is indirect: target-size guidance, the theoretical advantage of isomorphic layouts, and what shipped products do. Together they favour in-key pad grids for phones and larger scrollable strips for tablets. This is an inference, not a tested result.

### Cited Findings
- [R] Apple guidance 44 × 44 pt, Material 48 × 48 dp, WCAG 2.5.8 24 × 24 CSS px as a floor and 2.5.5 (AAA) 44 × 44 — [BrowserStack rule docs](https://www.browserstack.com/docs/app-accessibility/rule-repository/rules-list/touch-target-size-spacing); [Deque](https://dequeuniversity.com/rules/axe/4.8/target-size). Primary documents were not opened.
- [R] Average adult thumb about 2.5 cm wide. Errors fell as target size rose in one-handed thumb use — [Smashing Magazine](https://www.smashingmagazine.com/2012/02/finger-friendly-design-ideal-mobile-touchscreen-target-sizes/). The article is from 2012.
- [R] Isomorphic layouts keep each interval, chord and scale the same shape in every key — [Milne, Sethares, Plamondon 2007](https://sethares.engr.wisc.edu/paperspdf/InvariantFingering.pdf)
- [R] Historic squeeze-box use is argued as evidence the Wicki layout is practical — [Sethares paper](https://sethares.engr.wisc.edu/paperspdf/CMS2009.pdf)
- [R] Claims of educational benefit exist, but the underlying studies were not retrieved — [Wikipedia](https://en.wikipedia.org/wiki/Isomorphic_keyboard)
- [R] NIME 2014 argues mobile music apps are limiting when they mimic non-touch interfaces or offer too little control — [Pitch Canvas](https://nime.org/proc/nime2014_jallison/)
- [V] Shipped layouts: Ableton Note 25 pads in key — [App Store](https://apps.apple.com/dk/app/id1633243177); Koala Grid with 10 scales — [Koala docs](https://metawork-studio.github.io/koala-documentation/mobile/5-sequence.html); EP-133 12 pads — [guide](https://teenage.engineering/guides/ep-133/play-and-record); Animoog strips with key spacing and pitch correction — [App Store](https://apps.apple.com/app/id1586841361)
- [R] Animoog Z's keyboard suits iPad better for polyphony — [MusicRadar](https://www.musicradar.com/reviews/moog-animoog-z)
- [V] Koala maps vertical position to velocity on the key, an example of a phone velocity substitute — [Koala docs](https://metawork-studio.github.io/koala-documentation/mobile/5-sequence.html)

### Inferences
Arithmetic, assuming a 390 × 844 pt phone with no margins and no gaps:

| Layout | Portrait fit at 44 pt | Landscape fit at 44 pt |
|---|---|---|
| Piano white keys | 8 keys, about 1 octave | 19 keys, about 2.7 octaves |
| Chromatic grid | 8 per row | 19 per row |
| 5 × 5 pad grid | 78 pt pads filling the width | 78 pt pads filling the height |

- Piano is the most limited at 44 pt, and its black keys are narrower still. It still has recognition value for trained players, so it is worth keeping as an option in landscape or a scrollable strip.
- In-key pads remove wrong notes and use larger targets. They reduce jam risk, at the cost of accidentals. A chromatic toggle or a "16 pitches" layout (Move lists one in its manual table of contents) would cover that.
- Isomorphic grids make chord shapes transferable, and row-offset grids get several octaves on few columns. The lack of phone evidence means A/B testing with real thumbs is warranted.
- Velocity is the biggest missing input on a phone. Y-on-pad (Koala) is a shipped option; pressure is not generally available. Slide-after-press for per-note modulation (Animoog) is the other.
- Target layout suggestions to test: 5 × 5 or 4 × 8 in-key pads for phones, plus a scrollable strip with scale snap on tablets, plus Synplant's 12 branches as a separate pad view.

### Gaps
- No direct study of piano versus pads versus isomorphic grids on phones was found. Two searches returned only text-entry and general touch-target work.
- No latency figures per layout or for web audio were sought; that belongs to another research track.
- Move's and Note's exact row intervals were not confirmed.
