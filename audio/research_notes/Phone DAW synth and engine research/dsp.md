# High-quality audio DSP for an AudioWorklet phone DAW: algorithms, costs, tiers

Evidence labels used throughout:
- **Cited**: read in the linked source. "Secondary" or "forum" is stated where the source is not primary.
- **Measured here**: run on this Mac on 2026-10-30. It is not phone data. The method is under "WASM vs JS".
- **Inference**: my reasoning from the above. Not verified.
- **Prior knowledge**: standard practice I could not confirm in a source this session.

## Band-limited oscillators: PolyBLEP vs BLEP vs wavetable with mipmaps

### Takeaway
Use mipmapped wavetables as the main oscillator, including for the classic shapes. Plain 2-point PolyBLEP is cheap, but it leaves aliasing at only -23 to -41 dB in this session's measurements. Keep it for hard sync, PWM and cheap voices, and only with oversampling at higher quality.

### Cited Findings
- PolyBLEP was introduced as a BLEP variant that replaces table lookup with a closed-form polynomial — [Välimäki & Huovilainen 2007 (abstract)](https://www.bohrium.com/paper-details/antialiasing-oscillators-in-subtractive-synthesis/811998722756968449-3748)
- Forum view: PolyBLEP is not a sharp cutoff and removes only part of the aliasing. It suits formula-generated shapes, and applying it to arbitrary wavetables is harder — [KVR thread](https://www.kvraudio.com/forum/viewtopic.php?p=5882084)
- **Surge XT Classic oscillator** is BLIT-style. Each discontinuity is replaced by a windowed-sinc kernel placed at the sub-sample position, using a table with 256 steps per sample plus a derivative table for a first-order correction — [Surge source](https://raw.githubusercontent.com/surge-synthesizer/surge/main/src/common/dsp/oscillators/ClassicOscillator.cpp)
- **Vital** uses 2048-sample frames ([wave_frame.h](https://raw.githubusercontent.com/mtytel/vital/main/src/synthesis/lookups/wave_frame.h)) with 11 frequency bins selected by log2 ([wavetable.h](https://raw.githubusercontent.com/mtytel/vital/main/src/synthesis/lookups/wavetable.h))
- Vital's author (forum, 2018, before release) described 11 band-limited tables at one per octave, 2x oversampling, a half-band polyphase IIR decimator, and table changes about every 50 ms with a 50 ms fade — [KVR](https://www.kvraudio.com/forum/viewtopic.php?p=7139015). The shipped default is reported as 2x, with users preferring 4x plus hi-res tables — [Vital forum](https://forum.vital.audio/t/are-vitals-effects-oversampled/12304)
- u-he's Urs Heckmann (forum) prefers 3–4 tables per octave and no oversampling, spending CPU rather than RAM. For scannable tables of 100+ frames he suggests storing spectra and running an iFFT every ~256 samples. Vital's author says per-voice iFFT would be too heavy for unison — [KVR](https://www.kvraudio.com/forum/viewtopic.php?p=7139015)
- Same thread: one table per octave without oversampling starts aliasing at one-third of the sample rate (earlevel). Aliasing can be kept above about 17–18 kHz with denser tables (Urs). 4- or 6-point splines work if the table is oversampled (Vaneev) — [KVR](https://www.kvraudio.com/forum/viewtopic.php?p=7139015)

**Measured here: aliasing.** Sawtooth at 48 kHz, static pitch, non-commensurate f0, Kaiser window (beta 40). Figures are total in-band (≤20 kHz) alias power relative to harmonic power, in dB. WT means a 2048-sample table per mip, ideally band-limited.

| Method | 441 Hz | 1014 Hz | 3142 Hz | 7043 Hz | 11987 Hz |
|---|---|---|---|---|---|
| Naive | -20.7 | -16.8 | -11.5 | -7.2 | -5.7 |
| PolyBLEP 2-point | -40.7 | -36.8 | -29.8 | -23.0 | -28.6 |
| PolyBLEP + 2x OS | -62.0 | -57.6 | -54.2 | -47.0 | -49.7 |
| PolyBLEP + 4x OS | -96.1 | -77.1 | -71.6 | -68.2 | -68.7 |
| WT 1 mip/oct, linear read | -90.4 | -99.1 | -115.9 | -123.1 | -129.1 |
| WT 1 mip/oct, cubic read | -122.5 | -136.1 | -165.6 | -178.2 | -189.6 |
| WT 1 mip/oct, cubic, 2x OS | -96.7 | -111.9 | -159.1 | -160.2 | -172.7 |

These WT figures ignore mip crossfades, fast pitch modulation and table morphing. The 2x OS row is limited by the test's decimation filter. It should be read as "at least this good".

**Measured here: CPU.** See the WASM section for the full table. Two PolyBLEP saws plus SVF cost 4.2 ns per voice-sample scalar and 1.4 ns with 4-lane SIMD. Two oscillators doing two cubic table reads each, plus SVF, cost about 10.5 ns, which works out at roughly 2.5 ns per read.

### Inferences
- An all-wavetable design gets very low aliasing at low CPU. The price is high-frequency bandwidth: at one mip per octave a note just above a mip boundary loses up to an octave of top harmonics unless 2x oversampling is used. That is why Vital and u-he each spend something: 2x CPU or denser tables.
- Tier choice: Reduced is 1x at 2–3 mips per octave. Full is 2x with a half-band IIR decimator and 1 mip per octave for RAM, or 3–4 per octave if RAM allows.
- RAM arithmetic: 2048 floats × 11 mips = 88 KB per frame, so 22.5 MB for a 256-frame table. Morphing wavetables need a frame cap in Reduced. Mips must be built by FFT away from the audio thread.
- 4-lane SIMD helps PolyBLEP far more than wavetables, because WASM SIMD has no gather and table reads remain scalar loads.
- Fixed classic shapes can share one mip set across voices, so their RAM cost is trivial.

### Gaps
- No published dB figures for PolyBLEP were found. The table above is my own measurement.
- No CPU comparison from any commercial synth. Serum, Massive and other proprietary engines have no verifiable internals, so "leading soft synths" here means Surge and Vital plus forum statements from u-he.
- BLEP with long tables (Surge-like) was not measured. It should sit between PolyBLEP and wavetable on both axes, but that is unmeasured.

## Oversampling for saturation and filters

### Takeaway
Use first-order ADAA plus 2x in Reduced and first-order ADAA plus 4x in Full. Use polyphase IIR half-bands for voices and FIR half-bands where linear phase matters, such as dry/wet paths. An 8-coefficient IIR already reaches 100 dB for a 20k/28k transition at 96 kHz.

### Cited Findings
- On a 1/f spectrum such as a hard-driven saturator, 2x oversampling only reduces aliasing by 6 dB and 4x by 12 dB. ADAA steepens the falloff, and ADAA with 4x "makes aliasing practically a non-issue even for a hard clipper" — [Vicanek](https://www.vicanek.de/articles/AADistortion.pdf)
- ADAA is good at low-frequency aliases and less efficient at high frequencies, because its sinc filter is not steep — [Vicanek](https://www.vicanek.de/articles/AADistortion.pdf)
- ADAA replaces the nonlinearity with a difference quotient of its antiderivative — [Parker, Zavalishin, Le Bivic, DAFx-16](https://dafx.de/paper-archive/details/vem_XXF5qBbfiWOH2RVVAA)
- Antiderivatives can be expensive for transcendental functions, so lookup tables are suggested. Second-order ADAA adds a sample of latency and slight HF rolloff — [DAFx20in21 paper 27](https://dafx2020.mdw.ac.at/proceedings/papers/DAFx20in21_paper_27.pdf)
- HIIR 1.50 is a two-path polyphase IIR library for 2x rate changes, with NEON support among others — [de Soras](https://ldesoras.fr/prod.html)
- IIR half-bands are steeper, lower latency and cheaper than FIR, but their phase delay is not constant — [halfband crate](https://docs.rs/crate/halfband/0.1.0)

**Measured here: half-band design.** HIIR-style coefficients, with stopband verified from the computed frequency response, at 96 kHz.

| Coefs | Stopband, 20k/28k | Stopband, 22.1k/25.9k | LF group delay (samples @96k) |
|---|---|---|---|
| 4 | -50 dB | -40 dB | 1.9 / 1.6 |
| 6 | -75 dB | -61 dB | 2.8 / 2.4 |
| 8 | -101 dB | -82 dB | 3.6 / 3.1 |
| 10 | -126 dB | -102 dB | 4.5 / 3.8 |
| 12 | -151 dB | -123 dB | 5.3 / 4.6 |

FIR half-band by Kaiser estimate, for comparison, at 96 kHz with a 20k/28k transition: 80 dB needs 63 taps (17 non-zero), 100 dB needs 79 taps (21 non-zero), 120 dB needs 95 taps (25 non-zero). Latency is about 15–24 samples at 48 kHz. A 22.1k/25.9k transition needs about twice as many.

Measured cost: a scalar 12-coefficient IIR 2x up plus down took 15–21 ns per input sample per channel. That is 0.075–0.10% of a 128-frame quantum on a full-clock M3 Pro P-core. It was an unoptimised scalar version with no SIMD.

### Inferences
- Tiers: Reduced uses 6 coefficients (75 dB) for voice and saturator stages. Full uses 8–10 coefficients. Export or mastering uses 12 or FIR.
- A 4x cascade's second stage has a very wide transition, so it needs only a few coefficients and adds roughly 30–50% to the 2x cost, not 100%. Not measured.
- Oversampling costs more in the voices (×N of all DSP inside) than in the filter itself, so saturator oversampling on the master bus is cheap and per-voice oversampling is the real budget item.
- IIR phase rotation means a dry/wet saturator must run the dry path through a matching allpass, or use FIR. This is a textbook consequence, not a cited recommendation.

### Gaps
- Exact HIIR benchmark numbers on NEON or WASM SIMD: not found. The HIIR licence should be checked in the zip; the site footer says CC0/WTFPL unless specified otherwise.

## Filters: zero-delay-feedback SVF and ladder

### Takeaway
Use a trapezoidal (TPT) SVF as the default filter, because it is linear, solved in closed form and costs very little. Use a nonlinear ZDF ladder as a premium filter. In this session's test it cost roughly 7 times the SVF voice, so linearise from the previous sample in Reduced and iterate only in Full.

### Cited Findings
- TPT replaces each integrator with its bilinear approximation, creating an instantaneous feedback loop. The linear case can be pre-solved, while the nonlinear case needs an iterative solver — [secondary summary](https://synthengineer.pages.dev/blog/zero-delay-feedback-filters). Primary text: [Zavalishin, VA Filter Design 2.1.0](https://www.native-instruments.com/fileadmin/ni_media/downloads/pdf/VAFilterDesign_2.1.0.pdf), chapters 3.9, 5.4–5.5 and 6.4 (table of contents only was read)
- Mystran's approach replaces the nonlinearity with a factor computed from the previous sample, making the equation linear — [KVR](https://www.kvraudio.com/forum/viewtopic.php?p=8500128)
- Urs Heckmann suggests solving once with the previous sample's linearisation, updating factors, then solving again. Reusing one LU factorisation depends on sparsity — [KVR](https://www.kvraudio.com/forum/viewtopic.php?p=8500294)
- Faust documents that moving costly math to sample rate is much more expensive and parameter smoothing adds cost — [Faust optimising](https://faustdoc.grame.fr/manual/optimizing/)

**Measured here.** All on the M3 Pro, fixed coefficients:
- 2 PolyBLEP saws plus linear TPT SVF: 4.2 ns per voice-sample scalar.
- 2 PolyBLEP saws plus 4-pole ZDF ladder, per-stage tanh approximation linearised from the previous sample, one input tanh: 34–38 ns, so the ladder alone is about 30 ns.

### Inferences
- Reduced ladder: previous-sample linearisation at 1x, ADAA on the input stage. Full ladder: two solves per sample at 2x. That gives about 4× the Reduced ladder's cost.
- The ladder is scalar in my test. Four-lane SIMD should give roughly a 2.5–3× gain, as PolyBLEP did. Its divisions and branches may reduce this.
- The bench excludes per-sample cutoff modulation. A `tan()` per sample would add real cost, so update coefficients every 16–32 samples with interpolation, or use a polynomial approximation.

### Gaps
- No per-sample Newton iteration cost was found in a published source.

## Glue compressor: SSL-style bus compressor

### Takeaway
Build a stereo-linked, feed-forward, peak-detecting compressor with stepped SSL-style timings and a two-stage auto release. Use a smooth log-domain design. Knee, sidechain filter and auto-release constants are design choices, because no authoritative figures were found.

### Cited Findings
- G-series controls: attack 0.1, 0.3, 1, 3, 10, 30 ms; release 0.1, 0.3, 0.6, 1.2 s plus Auto; ratio 2, 4, 10:1 — [MusicRadar on UA G Bus](https://www.musicradar.com/reviews/universal-audio-ssl-4000-g-bus-compressor), [Sound On Sound on XLogic G](https://www.soundonsound.com/reviews/ssl-xlogic-g-series-compressor)
- Later 500-series module differs: added 1.5, 3, 5:1 ratios and 0.1–1.6 s releases, with listings disagreeing on details — [Reverb listing](https://reverb.com/item/40453968-ssl-g-comp-mk2-500-series-single-channel-stereo-bus-compressor-module)
- Described as a VCA compressor with peak detection and feed-forward control, whose Auto release works in two stages and follows programme material — [Bonedo review](https://www.bonedo.de/artikel/ssl-bus-comp-classic-test/). **Conflict:** a free clone claims a feedback topology, an unverified vendor claim — [KVR product page](https://www.kvraudio.com/product/g-bus-compressor-by-studio9-plugins)
- Forum: the original detector is peak-sensing with a fairly complicated rectifier around the ratio selection — [GroupDIY](https://groupdiy.com/threads/average-to-peak-detector-for-ssl-clone-schemo.3388)
- A 2026 paper states the SSL's effective release depends on recent input history, so a fixed-time model misses it — [arXiv summary](https://huggingface.co/papers/2606.18573.md)
- Feedback and feed-forward trajectories can be made equivalent with a level-dependent time constant — [AES paper, abstract only](https://www.aes.org/e-lib/browse.cfm?elib=12380)
- Standard design reference: Giannoulis, Massberg, Reiss, JAES 60(6), 2012, covering detection methods — [AES](https://www.aes.org/e-lib/browse.cfm?elib=16354) (abstract-level only)
- Open references: [CTAGDRC](https://github.com/p-hlp/CTAGDRC) has threshold, ratio, knee and auto attack/release with documented level detection, gain computer and ballistics, and is GPL-3.0. [Faust compressors.lib](https://sources.debian.org/src/faust/2.30.5~ds0-2/libraries/compressors.lib) is another

### Inferences
- Signal flow: sidechain HPF → max(|L|,|R|) → dB → soft-knee gain computer → attack/release smoothing → dB to linear → gain applied to both channels. Linked detection keeps the stereo image.
- Two-stage auto release: run a fast and a slow release envelope and combine them, so short peaks recover fast and sustained compression recovers slowly.
- Cost should be well under a ladder voice, since it is one detector per stereo pair. Log and exp can use polynomial approximations, and detection can run every 4–8 samples at slow attacks. Not measured.
- Attack below about 1 ms needs oversampled detection or a little lookahead to hit peaks consistently. Run the compressor inside the 2x section if a saturating VCA stage is modelled.
- Prior knowledge, not confirmed this session: Giannoulis recommends log-domain gain computation with smooth branching release to avoid level-dependent artefacts. It is the reason for the log-domain choice above.

### Gaps
- Sidechain HPF frequency, knee width and auto-release time constants of the original hardware: no reliable source. A 60–120 Hz HPF option and about a 6 dB knee are my suggested defaults, not specifications.
- No open-source reference found that is a verified SSL circuit model. The arXiv dataset may be the best route to fitting one.
- Molot is free but no source says it is open — [TDR Molot](https://www.audiotechnology.com/free-stuff/tdr-vladg-molot-compressor)

## Limiter: true-peak limiting per ITU-R BS.1770

### Takeaway
Use a lookahead brickwall limiter whose gain target comes from a 4x interpolated sidechain, with the audio path otherwise only delayed. On M3 Pro the sidechain costs about 5–10 ns per channel-sample, so full oversampling of the audio path is unnecessary. Target -1 dBTP so the 0.69 dB 4x worst-case under-read stays inside the margin.

### Cited Findings
- Design: per-sample maximum gain, then a moving minimum (peak-hold inverted), then a finite weighted moving average no longer than the hold, with the audio delayed to match. If the average is finite the output stays strictly below the limit — [Signalsmith limiter](https://signalsmith-audio.co.uk/writing/2022/limiter/)
- Article examples are 30 ms hold and smoothing, or 5 ms attack, 15 ms hold, 40 ms release. It says the direct true-peak method is to upsample, measure and feed those values into the gain calculation, with no factor stated — [Signalsmith limiter](https://signalsmith-audio.co.uk/writing/2022/limiter/)
- BS.1770-5 Annex 2: attenuate 12.04 dB, oversample 4x to 192 kHz, take the absolute value, re-add 12.04 dB. Meters using at least 192 kHz report dB TP. A 96 kHz input needs only 2x. It gives one example order-48, 4-phase FIR — [ITU BS.1770-5](https://www.itu.int/dms_pubrec/itu-r/rec/bs/R-REC-BS.1770-5-202311-I!!PDF-E.pdf)
- Worst-case under-read from the same document, `20·log(cos(π·fnorm/n))`:

| Oversampling | fnorm 0.45 | fnorm 0.5 |
|---|---|---|
| 4x | 0.554 dB | 0.688 dB |
| 8x | 0.136 dB | 0.169 dB |
| 16x | 0.034 dB | 0.042 dB |
| 32x | 0.008 dB | 0.010 dB |

- Peak-sample meters can under-read by 3 dB for a badly phased tone at fs/4 — [ITU BS.1770-5](https://www.itu.int/dms_pubrec/itu-r/rec/bs/R-REC-BS.1770-5-202311-I!!PDF-E.pdf)
- libebur128 uses a 49-tap Hann-windowed sinc, 4x below 96 kHz and 2x from 96 to 192 kHz — [libebur128](https://raw.githubusercontent.com/jiixyj/libebur128/master/ebur128/ebur128.c)
- R128 maximum true peak is -1 dBTP — [EBU R128](https://tech.ebu.ch/docs/r/r128-2014.pdf)

**Measured here:** 4 phases × 12 taps, 1 channel: 9.4–10 ns per input sample scalar, 5.2–5.6 ns with v128. That is 0.026–0.048% of a quantum per channel.

### Inferences
- Reduced: 4x sidechain, about 1.5 ms lookahead. Full: 8x sidechain in export and about 5 ms lookahead. Keep lookahead on the master only, and report it for delay compensation.
- Sidechain gain from interpolated peaks does not guarantee every reconstruction after gain modulation is below ceiling, but smooth gain adds little bandwidth. A post-limiter meter should confirm the export.
- For a ceiling tighter than about -0.3 dBTP use 8x, since 4x can miss 0.69 dB.
- A final safety clip at the ceiling, with 4x oversampling or ADAA, covers the small IIR undershoot the Signalsmith article mentions.

### Gaps
- Measured limiter overshoot from sidechain-only versus full-path oversampling: not found.

## Loudness: BS.1770-4/5, EBU R128 gating, true-peak meter; simple 38 Hz HP plus +4 dB shelf

### Takeaway
The simple filter idea is fine if the high-pass is second-order, with error at most 0.04 dB at 48 kHz. A first-order high-pass is not, with up to 6.6 dB error. The exact version costs the same two biquads, so use the exact coefficients. The real gap between a "simple meter" and a standards meter is gating, not the filter.

### Cited Findings
- Algorithm: K-weighting, then 400 ms gating blocks overlapping 75%, gates at -70 LKFS and -10 dB relative; the constant -0.691 cancels K-weighting gain at 997 Hz; incomplete final blocks are dropped — [ITU BS.1770-5](https://www.itu.int/dms_pubrec/itu-r/rec/bs/R-REC-BS.1770-5-202311-I!!PDF-E.pdf)
- 48 kHz coefficients, from the same document:

| Stage | b0 | b1 | b2 | a1 | a2 |
|---|---|---|---|---|---|
| Shelf | 1.53512485958697 | -2.69169618940638 | 1.19839281085285 | -1.69065929318241 | 0.73248077421585 |
| RLB high-pass | 1.0 | -2.0 | 1.0 | -1.99004745483398 | 0.99007225036621 |

- For other rates, libebur128 recomputes from prototypes: shelf f0 1681.974450955533 Hz, G 3.999843853973347 dB, Q 0.7071752369554196; high-pass f0 38.13547087602444 Hz, Q 0.5003270373238773 — [libebur128](https://raw.githubusercontent.com/jiixyj/libebur128/master/ebur128/ebur128.c)
- libebur128 implements momentary 400 ms, short-term 3 s, and LRA from 3 s blocks at 1 s hop, gated at -70 LUFS and -20 LU relative, 10th to 95th percentile — [libebur128](https://raw.githubusercontent.com/jiixyj/libebur128/master/ebur128/ebur128.c)
- R128 sets -23.0 LUFS and -1 dBTP — [EBU R128](https://tech.ebu.ch/docs/r/r128-2014.pdf). EBU Mode has Momentary, Short-term, Integrated — [secondary](https://doc.flux.audio/mira/Metering_Loudness.html)
- BS.1770-5 uses Annex 1 for channel-based audio, Annex 3 for advanced sound systems, and Annex 4 for channel plus object audio — [ITU BS.1770-5](https://www.itu.int/dms_pubrec/itu-r/rec/bs/R-REC-BS.1770-5-202311-I!!PDF-E.pdf)
- A ±0.1 LU Tech 3341 tolerance appears in secondary sources, with others citing ±0.5 or ±1 LU in different contexts. It should be checked against the EBU PDF — [Wikipedia](https://en.wikipedia.org/wiki/EBU_R_128)

**Measured here: filter comparison.** Magnitude response at 48 kHz, 20 Hz to 20 kHz, against true K-weighting.

| Simple version | Max error | White | Pink | Brown |
|---|---|---|---|---|
| 2nd-order HP 38 Hz Q 0.5 + RBJ shelf +4 dB 1.5 kHz | 0.043 dB | -0.04 LU | -0.04 LU | -0.03 LU |
| 1st-order 38 Hz HP + same shelf | 6.6 dB at 20 Hz | -0.04 LU | +0.13 LU | +1.52 LU |

Using the 48 kHz coefficients unchanged at 44.1 kHz gives up to 1.13 dB error near the top of the band, and almost none at 10 kHz.

### Inferences
- An ungated average under-reads material with long quiet passages. A track that is half silence reads 3 LU low from the energy average alone. Gating removes that.
- Integrated loudness requires storing block energies for the relative gate. libebur128's histogram mode is a bounded alternative. Run filters per channel in the worklet and gate blocks every 100 ms, so UI reads are cheap.
- Annex 2 says "at least 192 kHz" for the dB TP label, so 4x at 44.1 kHz (176.4 kHz) falls just short on a literal reading, even though libebur128 uses 4x there. Run the engine at 48 kHz, or use 8x at 44.1 kHz.
- Meter cost is 4 biquads plus 2 true-peak filters, about 0.1% of a quantum on M3 Pro.

### Gaps
- What changed between BS.1770-4 and -5 for stereo: I did not locate a change log. Annex 1 appears to be the path for stereo.
- Current streaming platform targets: only forum claims found, so not reported as facts.

## Dither for 24-bit and 16-bit export

### Takeaway
Always apply TPDF at 16 bits, as the last step before quantisation. Noise shaping is an optional 16-bit mastering choice. At 24 bits dither is harmless and almost never audible. For 32-bit float export apply none.

### Cited Findings
- Word-length reduction without dither adds signal-correlated distortion, and TPDF at ±1 LSB is the lowest-power dither that removes it. Rectangular dither leaves noise modulation. Noise shaping moves noise to less audible frequencies without reducing total power — [Wikipedia: Dither](https://en.wikipedia.org/wiki/Dither)
- Lipshitz, Vanderkooy, Wannamaker 1991 report up to 10.9 dB perceived-noise reduction with a simple second-order shaper under one audibility model — [JAES abstract](https://bvbvf1.bib-bvb.de/vufind/PrimoRecord/cdi_audioengineering_primary_5956)
- Stereophile's analysis found most analysed 24-bit recordings could be truncated to 16 bits with few or no correlated errors. Single-author observation — [Stereophile](https://stereophile.com/content/contingent-dither-page-3)

### Inferences
- Arithmetic: TPDF plus quantisation gives noise at q/2 RMS. That is about -96.3 dB re peak full scale at 16 bits, or -93.3 dB re a full-scale sine, and about -144.5 / -141.5 dB at 24 bits. Dithering 24-bit is therefore about correctness, not audibility.
- Stereophile's finding applies to noisy real recordings. Synth-only material with digital silence, fades and pure tones is the case where 16-bit truncation errors are most likely to matter, so this app should dither regardless.
- Order: SRC → limiter → dither → quantise. Per-channel independent generators. Do not reapply if a file is processed later, and avoid strong noise shaping for files likely to be mastered again.
- Noise shaping raises peak level slightly, so run it under the limiter ceiling. It should be disabled at exact digital silence only if the user opts in.
- A seeded PRNG keeps exports reproducible, as required by the bounce section.
- Cost: trivial, offline only.

### Gaps
- No controlled listening study was found that sets a threshold for when dither is audible.

## Sample-rate conversion and stereo time-stretch

### Takeaway
Bypass `decodeAudioData` for quality-critical imports, because it forces resampling to the context rate. Use r8brain-free-src (MIT, stop-band 49–218 dB) compiled to WASM, or libsamplerate (BSD) for imports and exports. Use Signalsmith Stretch (MIT, with a Web release) for stretch.

### Cited Findings
- `decodeAudioData` resamples to the AudioContext's rate, and MDN says nothing about method or quality — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData)
- r8brain-free-src: MIT ([GitHub API metadata](https://github.com/avaneev/r8brain-free-src)). It first produces 2x oversampled signal, then uses polynomial-interpolated sinc fractional-delay filters of 8–30 taps. Stop-band 49–218 dB, transition band 0.5–45%. The transition range spans 175% of the specified band, so a 2% band is linear below 0.965·Nyquist. Power-of-2 and related ratios use a faster path. Attribution is requested — [README](https://github.com/avaneev/r8brain-free-src)
- libsoxr: LGPL-2.1, combines J. O. Smith bandlimited interpolation with FFT-based oversampling, with configurable phase and bandwidth. It may have higher latency in real time — [soxr](https://github.com/chirlu/soxr)
- libsamplerate: BSD-2-Clause per [GitHub metadata](https://github.com/libsndfile/libsamplerate). "Best" is quoted at worst-case 97 dB SNR with 97% bandwidth by a [third-party binding](https://chiselapp.com/user/MistressRemilia/repository/remiaudio/artifact/fec2c29144); the official quality page is incomplete — [libsamplerate](https://libsndfile.github.io/libsamplerate/quality.html). Debian lists BSD-2-Clause and GPL-2+ for the package — [Debian](https://developer.puri.sm/licenses/Librem5/Birch/libsamplerate0.html)
- Infinitewave compares many converters by sweep, 1 kHz tones, passband, transition, phase and impulse, including SoX and r8brain, updated April 2026 — [SRC Comparisons](https://src.infinitewave.ca/)
- **Signalsmith Stretch:** MIT, with a WASM/AudioWorklet Web release on NPM that stays in sync with the C++ algorithm. Presets are `presetDefault` and `presetCheaper`, with reported input and output latency, and `splitComputation` spreads CPU at the cost of one extra interval of output latency — [GitHub](https://github.com/Signalsmith-Audio/signalsmith-stretch)
- Its stereo method: the loudest channel gets full phase prediction, and input inter-channel phase differences are then copied to the output to preserve the image — [Stretch design](https://signalsmith-audio.co.uk/writing/2023/stretch-design/)
- It has no dedicated transient handling. Stretching smears transients, and a mitigation limits vertical phase scaling and randomises slightly. The author calls the result still wrong — [Stretch design](https://signalsmith-audio.co.uk/writing/2023/stretch-design/)
- **Rubber Band:** GPL or commercial licence — [Breakfast Quay](https://breakfastquay.com/rubberband/). R2 is a phase vocoder with lamination for vertical phase coherence and offers real-time streaming; those notes do not describe R3 — [technical notes](https://breakfastquay.com/rubberband/technical.html)
- Forum (anecdotal): stereo issues reported with Rubber Band in HISE — [HISE forum](https://forum.hise.audio/post/7170)

### Inferences
- Decode files with a WASM decoder or WebCodecs at native rate, and resample with your own SRC at import time. Store project audio at the engine rate so playback needs no realtime SRC.
- Tiers: 100–120 dB and 2–4% transition for imports, 140+ dB and about 1% for export. Double precision only in export.
- Rough scale: an 8–30 tap sinc is on the order of my true-peak filter's cost per output sample, so resampling is far faster than realtime even in scalar WASM. Not measured.
- For transient material, consider splitting at detected transients and stretching segments, since Signalsmith has no transient mode. Evaluate on drums before committing.

### Gaps
- No numeric CPU figures for Signalsmith presets on a phone.
- Rubber Band R3 WASM builds and R3 stereo behaviour: no primary detail found.
- No independent measurement of r8brain in WASM.

## Reverb and delay algorithms that fit a phone

### Takeaway
Both fit comfortably. An 8-line Householder FDN measured about 5 ns per sample on M3 Pro. Use a Signalsmith-style 8-channel diffuser plus FDN in Reduced and 16 lines in Full. A Dattorro plate is an excellent, cheap alternative with a distinct sound. Reverb should not be the tier-limited item.

### Cited Findings
- Signalsmith design: multi-channel diffuser, then FDN. Each diffusion step has per-channel delay, shuffle and polarity flips, and a Hadamard matrix. "At least 8 internal channels for a high-quality output". Example: 8 channels, 4 steps over 0–60 ms; feedback uses a Householder matrix — [Let's Write a Reverb](https://signalsmith-audio.co.uk/writing/2021/lets-write-a-reverb/)
- Hadamard costs N·log₂N additions, Householder is O(N) while a generic matrix is N² — [Signalsmith](https://signalsmith-audio.co.uk/writing/2021/lets-write-a-reverb/), [arXiv 2404.00082](https://arxiv.org/pdf/2404.00082)
- DAFx 2020 reports lowest useful order for high-quality sound is 16, and that Householder implementation details strongly affect the result — [DAFx2020 paper 51](https://dafx2020.mdw.ac.at/Proceedings/papers/DAFx2020_paper_51.pdf)
- FluidSynth's 12-line FDN is about 50% more CPU than 8 lines — [fluid_rev.c](https://git.ardour.org/ardour/livetrax/src/commit/539ef331d158516145c22d6390ccdfccc4004162/libs/fluidsynth/src/fluid_rev.c)
- Forum: cost is mostly memory access and cache use, not arithmetic — [KVR](https://www.kvraudio.com/forum/viewtopic.php?p=8089808)
- Dattorro plate: 4 input diffusers then a recirculating tank with 4 diffusers, damping and modulated excursion, at Fs 29761 Hz — [Dattorro 1997](https://ccrma.stanford.edu/~dattorro/EffectDesignPart1.pdf). The paper notes 22K words of memory at a 30 kHz rate for a classic machine — [same](https://ccrma.stanford.edu/~dattorro/EffectDesignPart1.pdf)
- Modulated delay needs fractional delay, which adds a small CPU cost — [Signalsmith](https://signalsmith-audio.co.uk/writing/2021/lets-write-a-reverb/)

**Measured here:** FDN with 8 lines, Householder, one-pole damping per line, mono in: 4.6–5.8 ns per sample, 0.023–0.028% of a quantum. SIMD gave no gain as auto-vectorised. It would need explicit v128 code.

### Inferences
- With diffusion (4 steps × 8 channels) and modulation, expect about 15–30 ns per sample, under 0.15% of a quantum on M3 Pro. A 16-line version adds about 2×.
- Dattorro delay lengths must be scaled from 29761 Hz to 48 kHz, which is 1.61× in samples.
- Tempo delay: cubic-interpolated read, one-pole or SVF damping in the feedback path, a mild saturator, and block-interpolated time changes. About 3–5 ns per channel-sample. Not measured.
- Preallocate delay memory and use power-of-2 sizes.

### Gaps
- Full convolution reverb cost on phone not researched. Partitioned FFT in WASM SIMD would be the route, and the Cabin benchmark in the next section gives a time-domain reference only.

## WASM vs JS in AudioWorklet, voice counts, libraries and licences

### Takeaway
Scalar WASM was no faster than clean typed-array JS in this session's tests, on either JavaScriptCore or V8. Explicit 128-bit SIMD gave about 3× on voice kernels and WASM kept tighter worst-case timing. Choose WASM SIMD for determinism and tail latency, not scalar speed. Raw throughput is not the phone limit: a scheduler that may run the audio thread on slow cores is, so budget far below 100%.

### Cited Findings
- Safari: SIMD 16.4; relaxed SIMD behind a flag; threads 14.1 desktop and 14.5 iOS; tail calls 18.2. Chrome: SIMD 91, relaxed 114. Firefox: SIMD 89, relaxed 145 — [WebAssembly features.json](https://github.com/WebAssembly/website/blob/main/features.json)
- Ethereal engine, µs per 128-frame quantum, V8 on Node 24, before and after SIMD: 16 synths 45.6 → 28.2, 8-track mix 120 → 80, empty 32 tracks 18.5 → 9.1. No iPhone or JS baseline — [PR #475](https://github.com/diegoimbert/ethereal/pull/475)
- Cabin FIR, Node, not in a browser: 1024 taps 5.6% → 1.7% of quantum, 3.3–4.4× gain. WASM binary about 36 KB. The PR says AudioWorkletGlobalScope has no `performance.now` — [PR #324](https://github.com/ford442/webgpu_streetview/pull/324)
- A bachelor thesis found WASM not always faster than JS for AudioWorklet work, partly due to call overhead — [HAW Hamburg thesis](https://reposit.haw-hamburg.de/bitstream/20.500.12738/16337/1/BA_Browser-based%20Engine%20Prototype%20for%20a%20Digital%20Audio%20Workstation.pdf)
- **Ableton AudioPerfLab:** the performance controller places light work on efficiency cores at low clocks. A 0.5 ms task on a fast core can exceed 3 ms, overshooting the 2.7 ms deadline at 128 frames. Bursty loads can drop out because clocks do not ramp fast enough. Below 256 frames, a work interval is needed even for small loads. iOS 14+ workgroups help native worker threads. It warns that workarounds may break — [AudioPerfLab](https://raw.githubusercontent.com/Ableton/AudioPerfLab/master/README.md)
- WebKit 2018 report: DOM interaction caused severe underruns under high load, and a contributor said only JS-based nodes should be exposed to main-thread effects — [WebKit 190552](https://bugs.webkit.org/show_bug.cgi?id=190552)
- WASM has no FTZ control. The design deliberately favoured IEEE compliance — [Mixxx PR](https://github.com/mixxxdj/mixxx/pull/12917) (secondary). Chrome enabled FTZ for its audio graph in 2017, and Raymond Toy warned about JS behaving differently in worklets — [W3C list](https://lists.w3.org/Archives/Public/public-audio/2017JulSep/0008.html)
- Single-core Geekbench 6: A19 Pro about 3,907 and M5 iPad about 4,133; multi-core about 10,074 versus 15,500–16,500. Sources are aggregator averages and early runs — [cpu-monkey](https://www.cpu-monkey.com/en/compare_cpu-apple_a19_pro-vs-apple_m5), [Geekbench](https://browser.geekbench.com/v6/cpu/baseline/15734150)
- `ringbuf.js` is a wait-free SPSC SharedArrayBuffer ring buffer for worklet transfer, and may need HTTP headers — [ringbuf.js](https://npmjs.com/package/ringbuf.js). Adenot: AudioWorklet can run on a real-time thread — [W3C list](https://lists.w3.org/Archives/Public/public-audio/2020AprJun/0009.html)

**Measured here: method.** Apple M3 Pro, macOS, 2026-10-30. Engines: the system `jsc` shell (JavaScriptCore, Safari's engine) and Node 26 (V8). C kernels were compiled by `zig cc -O3` to wasm32, with and without `-msimd128`, about 32 KB each. JS ports used Float32Array state and double math. All ran 128-frame blocks at 48 kHz, 3000 blocks × 12 runs after warm-up, and results are medians or best/median ranges. Budget is 2667 µs per quantum, or 20,833 ns per sample. The kernels are synthetic: no modulation, envelopes or voice management. This is a shell on a laptop P-core, not a worklet on a phone.

| Kernel | JS (JSC / V8) | WASM scalar (JSC / V8) | WASM SIMD (JSC / V8) | % of quantum, best build |
|---|---|---|---|---|
| 2 PolyBLEP + SVF, ns per voice-sample | 4.3 / 4.2 | 4.2 / 4.2 | 1.4 / 1.4 | 0.007% |
| 4 cubic WT reads + SVF | 10.6 / 10.9 | 10.0–10.6 / 10.6–11.3 | no gather, not vectorised | 0.05% |
| 2 PolyBLEP + ZDF ladder | — | 36–39 / 35–38 | scalar only | 0.17% |
| True peak 4×12 tap, ns per ch-sample | — | 9.8 / 10.0 | 5.6 / 5.5 | 0.026% |
| FDN8 Householder, ns per sample | — | 4.7 / 5.1 | no gain | 0.023% |
| IIR half-band up+down, 12 coefs, per ch-sample | — | 21 / 15 | no gain | 0.075–0.10% |

**Measured here: block timing,** 64 voices of 2 PolyBLEP + SVF, 40,000 blocks, in ms, 2.667 ms deadline. "Cold" is the very first block.

| Build | Cold | p50 | p99.9 | p99.99 | Max |
|---|---|---|---|---|---|
| JS clean (JSC) | 1.20 | 0.035 | 0.118 | 0.156 | 1.14 |
| JS allocating per block (JSC) | 0.96 | 0.037 | 0.201 | 0.742 | 1.54 |
| WASM SIMD (JSC) | 0.30 | 0.011 | 0.071 | 0.128 | 0.153 |
| JS clean (V8) | 1.51 | 0.033 | 0.101 | 0.148 | 0.171 |
| JS allocating per block (V8) | 0.79 | 0.042 | 0.147 | 0.235 | 0.472 |
| WASM SIMD (V8) | 0.07 | 0.012 | 0.063 | 0.115 | 0.125 |

No block missed the deadline at this light load. **Subnormals:** on both engines, a recursive filter kept in the subnormal range ran at the same speed as normal values (ratio 1.00) and values were not flushed. So on Apple Silicon subnormals are not a timing problem in this test, and they are not flushed by the engine either.

**Libraries and licences**

| Library | Licence | Fit |
|---|---|---|
| [Faust / faustwasm](https://github.com/grame-cncm/faustwasm) | faustwasm LGPL-2.1 (its licence file). Compiler GPL with exception, generated code usable under own terms per library exception — [Debian](https://tracker.debian.org/media/packages/f/faust/copyright-2.77.3ds-2), [secondhand](https://forum.hise.audio/post/115552) | Good for prototyping DSP. Whether its WASM output uses SIMD is unconfirmed |
| [Csound WASM](https://www.mintlify.com/csound/csound/platforms/web-assembly) | JS API Apache-2.0; WASM binary LGPL-2.1 | Heavy, LGPL awkward for commercial use — [forum](https://forum.csound.com/t/re-csnd-csound-wasm-and-the-lgpl-how-to-use-and-comply-in-a-web-app/2370) |
| [Elementary](https://github.com/elemaudio/elementary) | MIT | Last pushed Jan 2026 |
| [Tone.js](https://github.com/Tonejs/Tone.js) | MIT | Scheduling and graph layer, not an audiophile DSP core (inference) |
| [RNBO](https://support.cycling74.com/hc/articles/10730637742483) | Generated code under Cycling '74 licence or GPLv3; engine MIT. Commercial distribution requires contacting them. $200k threshold is forum-only and unverified | Licence dependency |
| [DaisySP](https://github.com/electro-smith/DaisySP) | MIT (repo licence) | Embedded C++ DSP, compiles to WASM (inference). Useful reference |
| [SuperSonic](https://github.com/samaaron/supersonic) (scsynth) | AGPL-3.0+ per its licence file | Viral network clause for a hosted app (inference) |
| [WebPd](https://github.com/sebpiq/WebPd) | LGPL-3.0 | Niche |
| [Surge XT](https://github.com/surge-synthesizer/surge), [Vital](https://github.com/mtytel/vital) | GPL-3.0 | Read for ideas; copying code makes the app GPL |
| [libebur128](https://github.com/jiixyj/libebur128), [Signalsmith Stretch](https://github.com/Signalsmith-Audio/signalsmith-stretch), [r8brain](https://github.com/avaneev/r8brain-free-src) | MIT | Direct dependencies |
| [Rubber Band](https://breakfastquay.com/rubberband/) | GPL or commercial | Fallback only |

### Inferences
- **Why WASM anyway:** 3× SIMD gain on the most repeated work; cold first block about 4–20× cheaper; no GC in the audio path, with p99.99 about 6× better than allocating JS on JSC; deterministic numerics, as covered in the next section.
- **Clean JS is viable** for a few light effects. Allocating JS raised JSC's p99.99 about 5× even at this light load, so a JS DSP path must be allocation-free.
- **The real constraint** is the 6×+ slowdown AudioPerfLab shows when work lands on efficiency cores. If that applies to Safari's audio thread, a budget of 100% on P-core measurement fails badly. Plan peak load at about 15% of a quantum as measured on a P-core at full clock, roughly 400 µs. Test on devices, and raise this cap only with evidence.
- AudioPerfLab's fix uses native workgroup APIs that a web page cannot call. A web app cannot request them. A steady DSP load, rather than bursts, may still help, by the same logic as its Minimum Load. Bursty voice starts are the risk.
- Use `-msimd128` only and explicit lanes. Skip relaxed SIMD: Safari lacks it and its results are nondeterministic.
- Warm up before transport start: render a few hundred silent blocks through the real DSP. JS cold blocks were about 35× steady state, WASM about 27× on JSC.
- Peak single-thread speed differs by only about 5–10% between A19 Pro and M5. The iPad's real advantages are multi-core and sustained thermals. AudioWorklet DSP is one thread, unless the app adds workers via SharedArrayBuffer, which needs cross-origin isolation and non-realtime-thread buffering.
- Denormals: still add flush logic or a tiny offset in feedback paths, to protect any non-Apple target and to stop silent tails consuming CPU.
- A hidden trap: Faust, Elementary and similar give fast progress, but the critical tier switching and null-test determinism are easier in a custom C, C++, Rust or Zig core. A small custom core is about the size of the kernels above.

**Estimated voice counts (Inference).** Scaled from M3 Pro measurements, and assuming newer iPhone P-core throughput is similar.

| Voice | ns/sample | % of quantum | Voices at 15% cap | Voices at 50% cap |
|---|---|---|---|---|
| 2 PolyBLEP + SVF, SIMD | 1.4 | 0.007% | 2000+ (not meaningful) | — |
| 2 osc × 2 WT reads + SVF | 10.5 | 0.05% | about 300 | about 1000 |
| 2 PolyBLEP + ZDF ladder | 36 | 0.17% | about 85 | about 290 |
| 3 WT osc, ladder, 2x OS, mod matrix | about 125 | 0.6% | about 25 | about 80 |

Each unison oscillator adds to these. Suggested product limits, before device testing: iPhone Reduced 16–32 voices; M5 iPad Full 32–64 voices. Add more only if the on-device load meter supports it.

### Gaps
- **No real iPhone AudioWorklet benchmark was found.** No published JS or WASM SIMD comparison on iOS Safari exists in what I could search. This is the largest gap. The kernels above should be run on a device.
- Whether Safari's AudioWorklet thread gets realtime treatment on iOS, and how it is placed on P or E cores: not found.
- Current iOS Safari AudioWorklet glitch bugs: no recent reports found; older reports only ([WebKit 218762](https://bugs.webkit.org/show_bug.cgi?id=218762)).
- Geekbench for M3 Pro was not sourced, so the scaling is approximate. No sustained-throttle figures for either device.
- iOS memory limits for WASM in a tab or PWA: not researched.

## Same-code realtime and offline render: guaranteeing bounce equals playback

### Takeaway
Run one WASM DSP core, at a fixed internal block size, driven only by sample-timestamped events and seeded PRNGs. Host it in the AudioWorklet for playback and in a Worker loop for bounce. Enforce it with an automated hash comparison. A bounce at a higher tier cannot null against Reduced playback, so offer two export modes.

### Cited Findings
- `OfflineAudioContext` generates audio as fast as it can into an AudioBuffer, not to hardware — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext)
- WASM floating-point nondeterminism is limited to NaN bit patterns and NaN sign, plus relaxed SIMD — [WebAssembly design](https://raw.githubusercontent.com/WebAssembly/design/main/Nondeterminism.md)
- With offline worklets, postMessage needs a delay or acknowledgement before `startRendering`, or output can be silent — [Offline worklet repro](https://jackschaedler.github.io/offline-audio-worklet-repro)
- A 2017 report said iOS 11 OfflineAudioContext started before `startRendering` and never completed — [WebKit 181939](https://bugs.webkit.org/show_bug.cgi?id=181939). Old; current status unknown
- A W3C 2013 discussion noted determinism breaks with nodes added partway through a render — [W3C IRC](https://www.w3.org/2013/05/09-audio-irc)
- Spec: AudioContext render quantum defaults to 128 frames, but a `hardware` option lets the browser choose another size — [Web Audio API](https://webaudio.github.io/web-audio-api/)

### Inferences
Requirements for a bit-exact bounce:
1. **Core:** all DSP inside one WASM module, no JS DSP. Own polynomial `sin`, `tanh`, `exp`. JS `Math` functions are implementation-defined (prior knowledge) and differ across engines.
2. **Block:** the core always processes a fixed internal size such as 32 or 64 samples, with control-rate updates on those boundaries. The host adapts to its quantum through a small FIFO. The render never depends on host quantum.
3. **Time:** every note, automation point and parameter change has a sample timestamp. Live gestures are recorded with the sample at which they were applied, not when received.
4. **Randomness:** seeded per track and voice, including analogue drift, unison phases and dither.
5. **State:** voice allocation is a pure function of the event stream. Same start state on each bounce, including free-running phases and reverb memory, so define whether bounce starts from silence and whether tails are included.
6. **Rate:** run at one engine rate, 48 kHz, and apply SRC after the bounce if a different export rate is wanted.
7. **Tier:** quality tier is part of render state. Do not auto-switch tier mid-render. If the realtime governor drops quality, record it or treat the output as a preview.
8. **Floats:** no relaxed SIMD or threading-order dependence. Bus sums must be in fixed order. Use WASM's strict floats.
9. **Host:** prefer a plain Worker over `OfflineAudioContext`. The Worker loop avoids browser variation and the message race above, and it can also run on the M5's spare cores.

Export modes:
- **As heard:** same tier as playback, null-test exact.
- **Full quality:** all tiers at maximum. It is not bit-identical to Reduced playback. It should be close: same patch, lower aliasing, and possibly small level and phase differences from filters.

Test: a CI harness renders fixtures in worklet capture and in worker bounce, then compares SHA-256 of the 32-bit float output, plus a per-sample null at below -140 dBFS. Also compare iPhone against M5 hashes on the same fixture. WASM's spec suggests they should match, but this must be tested.

### Gaps
- No current source was found confirming that Safari's offline and realtime graphs are sample-identical. The Worker design avoids needing one.
- Whether WASM SIMD arithmetic is fully bit-identical across WebKit and V8 in practice (for example fused operations) is expected from the spec but was not tested here. Compare with fixtures.

## Scaling between a reduced realtime mode on iPhone and full quality on M5 iPad

### Takeaway
Most of the chain can run at the same quality on both. Tier only three things: per-voice oversampling, voice count and ladder solver accuracy, plus wavetable frames for RAM. Metering, reverb, compressor and limiter are cheap, so keep them identical apart from lookahead and sidechain oversampling.

### Cited Findings
- Per-component data is cited in the sections above. A19 Pro and M5 single-core scores differ by only about 5–10% — [cpu-monkey](https://www.cpu-monkey.com/en/compare_cpu-apple_a19_pro-vs-apple_m5)
- Oversampling options are a normal CPU trade in synths — [JUCE forum](https://forum.juce.com/t/wavetable-synthesis-producing-artifacts-at-high-frequencies-how-to-fix-this-aliasing/34824)

### Inferences

| Component | Reduced (iPhone realtime) | Full (M5 iPad realtime, or any export) | Reduced cost on M3 Pro |
|---|---|---|---|
| Oscillator | WT 1x, 2–3 mips/oct, cubic, 1 read + crossfade at changes; PolyBLEP SIMD for pulses and sync | WT 2x, half-band down, 2 reads for frame and mip crossfade | 2.5 ns per read |
| Voice filter | TPT SVF, ladder with linearised solve at 1x | Ladder 2 solves at 2x | 2 ns / 30 ns |
| Saturation | ADAA 1 + 2x, 6-coef IIR | ADAA 1 + 4x, 8–10 coefs | about 10–20 ns per ch |
| Glue compressor | Same; detection every 4 samples | Same; detection per sample | not measured, low |
| Reverb | 8 line + diffusion | 16 line + diffusion | 15–30 ns |
| Limiter | 4x sidechain, 1.5 ms | 8x sidechain, 5 ms | 5–10 ns per ch |
| Meter | Full BS.1770 + 4x TP | Same, 8x in export | under 0.1% |
| SRC | None in realtime | Export only | offline |
| Dither | None in realtime | Export only | offline |
| Voices | 16–32 | 32–64 | see voice table |

Master chain total for stereo, Reduced: about 1% of a quantum on M3 Pro. So the budget goes to voices.

Governor:
- Measure core load by atomic cycle or time counters where available. Note the reported absence of `performance.now` in the worklet scope, so test `Date.now` resolution or use underrun detection.
- Use hysteresis: drop oversampling first, then voice limits, then polyphony stealing. Never change tier inside a held note. Crossfade or apply at note-on.
- Treat a detected tier change as non-reproducible playback, per the bounce section. Export mode remains unaffected.
- Default tier selection should be by measured warm-up benchmark, not device model. User overrides should be allowed.
- On an M5, a separate Worker can render frozen tracks ahead through a SharedArrayBuffer ring. That uses the iPad's multi-core lead, which a single worklet thread cannot.

### Gaps
- All tier targets are estimates until the kernels run on a real iPhone and an M5 iPad under thermal load.
- Listening tests on whether Reduced is distinguishable from Full were not done.
