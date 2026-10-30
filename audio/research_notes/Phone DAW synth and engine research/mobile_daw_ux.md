# Mobile DAW UX and Ableton interoperability (state as of 30 October 2026)

Evidence labels used throughout:
- **[P]** = primary page read in full or in relevant part (vendor manual text, repo README, NN/g article).
- **[S]** = search-engine summary or snippet only; the underlying page was not read, or it blocked fetching. Treat as weaker.
- **[U]** = user report (forum, review). Not vendor-confirmed and may be version-stale.
- Everything under "Inferences" is my reasoning, not a sourced fact.

Scope warning that affects everything below: **Logic Pro does not exist on iPhone.** It is an iPad and Mac product, so its "phone-sized" evidence is really "tablet" evidence. Of the eight named apps, the phone-native data points are GarageBand iPhone, Ableton Note, Auxy, Koala, BandLab, FL Studio Mobile and Cubasis (phone and tablet from one manual). Steinberg's web help is labelled Cubasis 3; the App Store listing mentions 3.8.3 [S], and the help text may lag that version. Logic Pro 13 was announced on 27 October 2026 for November, with an AI assistant and a redesigned browser, per pre-release press [S] ([MusicRadar](https://www.musicradar.com/music-tech/apple-goes-all-in-on-ai-with-logic-pro-13-introducing-an-intelligent-assistant-that-can-control-your-daw)); the Apple guide pages read here predate it, and I did not establish what changes on iPad.

## 1. Channel strips, insert chains and sends on a small screen; tap counts

### Takeaway
Nobody fits a full strip on a phone. The apps split into two families: the "desktop mixer shrunk" family (Logic, Cubasis), which keeps real strips and adds modes or a per-track inspector, and the "fixed recipe" family (Note, Koala, Auxy, GarageBand), which caps the signal path so there is little to navigate. The best single idea is Logic's Setup/Mix mode split, where the same slot gesture means "edit the chain" or "perform the mix".

### Cited Findings
**Logic Pro for iPad**
- Platforms: macOS and iPadOS, no iPhone [S] — [Wikipedia](https://en.wikipedia.org/wiki/Logic_Pro), [Shade pricing guide](https://shade.inc/blog/apple-logic-pro-pricing). No official Apple statement ruling out iPhone was found.
- The Mixer has two modes. Setup mode adds, replaces, reorders and removes plug-ins. Mix mode opens plug-ins in Details view and toggles them on or off [P] — [Apple: Mixer](https://support.apple.com/guide/logicpro-ipad/mixer-lpip2dc06e7c/ipados).
- Opening the Mixer is one tap on the Mixer button in the view control bar [P] — [Apple: Mixer](https://support.apple.com/guide/logicpro-ipad/mixer-lpip2dc06e7c/ipados).
- In Setup mode, tapping an empty Audio Effect slot then choosing an effect adds it. Tapping a filled slot offers Open, Replace, Copy and Remove. Touch-and-hold then drag reorders within a strip or moves to another strip [P] — [Apple: plug-ins in the Mixer](https://support.apple.com/guide/logicpro-ipad/work-with-plug-ins-in-the-mixer-lpip806df382/ipados).
- In Mix mode, tapping a slot opens Details view and touch-and-hold opens a mini view of key parameters in place. A global On/Off button turns slot taps into bypass toggles for plug-ins and sends [P] — [Apple: plug-ins in the Mixer](https://support.apple.com/guide/logicpro-ipad/work-with-plug-ins-in-the-mixer-lpip806df382/ipados).
- A strip holds MIDI Effect, Input, Instrument, Output, Audio Effect and Send slots, Send Level knob, Group menu, Automation Mode menu, Pan knob, peak display, fader, meter and Record Enable [P] — [Apple: channel strip controls](https://support.apple.com/guide/logicpro-ipad/channel-strip-controls-lpipfc8ea6fc/ipados).
- Pan is changed by swiping up or down on the knob, and the fader by dragging its handle [P] — [Apple: Mixer](https://support.apple.com/guide/logicpro-ipad/mixer-lpip2dc06e7c/ipados).
- Up to 12 sends per audio, instrument or aux strip [S] — [Apple: channel strip types](https://support.apple.com/guide/logicpro-ipad/channel-strip-types-lpip311d4448/ipados).
- A separate Plug-ins area shows one track's chain, with Track, Sends and Output views [S] — [Apple: Plug-ins area](https://support.apple.com/en-lamr/guide/logicpro-ipad/lpip1cb3655f/3.3/ipados/26).
- Global mixer gestures: double-tap any slider or knob resets it, and multiple fingers can move several faders or knobs at once [P] — [Apple: Mixer gestures](https://support.apple.com/guide/logicpro-ipad/mixer-gestures-lpip70ec7de4/ipados).
- Panels resize by dragging a handle; dragging all the way hides or closes an area. Swipe down closes a dialog. Dragging up or down on a number field changes its value [P] — [Apple: Main gestures](https://support.apple.com/guide/logicpro-ipad/main-gestures-lpip05674184/ipados).

**Cubasis 3**
- Each strip carries pan, fader with meter and dB readout, mute, solo, Read, Write, Effects, Monitor and Record Enable. Double-tap resets pan and volume [P] — [Steinberg: Mixer](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/MIXER.html).
- On tablets, pinch or S/M/XL buttons change strip width, and dragging the upper bar changes mixer height. The page does not describe iPhone-specific behaviour [P] — [Steinberg: Mixer](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/MIXER.html).
- Up to eight inserts per track, each track starting with StudioEQ and Channel Strip. Reorder by press and drag. Section colour encodes state: light blue active, dark gray present but inactive, light gray empty [P] — [Steinberg: Effects](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/EFFECTS.html).
- Eight global send buses shared by all tracks, with a per-track send level; Stereo Out has eight inserts then a post-fader Brickwall Limiter [P] — [Steinberg: Effects](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/EFFECTS.html).
- The mixer help page reportedly says send effects route only to Stereo Output 1/2. My reader also reported "only the master channel has inserts" from that page, which contradicts the Effects page; I take that to mean only the master has mixer-page inserts [P, ambiguous] — [Steinberg: Mixer](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/MIXER.html).
- The track Inspector is a second route to track controls, opened by a coloured symbol at the far left, with handles that jump straight to a section [P] — [Steinberg: Inspector](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/INSPECTOR.html).
- A user notes the aux channels are effectively just sends, not full aux channels [U] — [audiob.us forum](https://forum.audiob.us/discussion/comment/727021/).

**GarageBand iPhone**
- Track Controls button sits in the control bar and adjusts volume, pan and effect levels; on iPhone SE it is under Settings [S] — [Apple: GarageBand iPhone](https://support.apple.com/guide/garageband-iphone/chs175dc411/ios).
- Users list missing bus sends and master track as weaknesses. This is opinion, and I found no Apple text on sends [U] — [Loopy Pro forum](https://forum.loopypro.com/discussion/23785/when-compared-to-other-ios-hosts-what-are-the-weaknesses-of-ios-garageband).

**FL Studio Mobile**
- Each Playlist track has a Rack holding any number of instrument and effect plugins, limited only by CPU [P] — [Image-Line manual](https://www.image-line.com/fl-studio-learning/fl-studio-mobile-online-manual/html/plugins/FL%20Studio%20Mobile.htm).
- The Main Mixer has one strip per Playlist track with fader, pan, activate (mute) and solo, and mirrors the Playlist's Track Mixer. The manual maps tap-and-hold to right-click [P] — [Image-Line: Mixer](https://www.image-line.com/fl-studio-learning/fl-studio-mobile-online-manual/html/plugins/FL%20Studio%20Mobile_Mixer.htm).
- App Store listing mentions an effect bus per track [S] — [App Store](https://apps.apple.com/fj/app/id432850619?l=en-gb).

**Ableton Note**
- Mixer is one tap from the Session grid; it has mute, solo and a volume slider. No per-track pan or sends are described [P] — [Ableton Note manual](https://www.ableton.com/en/note/manual).
- Each Track Preset has exactly two effects, FX1 feeding FX2. Drum Racks have Pad FX (with a Send Amount) and Kit FX [P] — [Ableton Note manual](https://www.ableton.com/en/note/manual).
- Hard limits of eight tracks and eight scenes per Set [P] — [Ableton Note manual](https://www.ableton.com/en/note/manual).

**Koala, Auxy, BandLab**
- Koala's Mixer is a paid add-on giving four mix buses and a master bus, with five effect slots per channel; a reviewer calls the base mixing tools "very basic" [S] — [App Store listing](https://apps.apple.com/ca/app/koala-sampler/id1449584007), [RouteNote](https://create.routenote.com/blog/?p=12385). The exact figures come from a search summary.
- Auxy 6 gives each sound customisable distortion, delay, reverb, chorus, filter, ducker and EQ, reached through a Tweak panel [P, 2019] — [CDM](https://cdm.link/auxy-ableton-export-tweaks/).
- BandLab: its mobile app has a smaller editing area and fewer precision tools than the browser Mix Editor, per a third-party guide [S] — [Audeobox](https://www.audeobox.com/learn/bandlab/bandlab-mobile-vs-desktop/).

### Inferences
Tap counts below are **derived by me from the documented steps**, not published figures, and assume the relevant parent screen is closed. Menu depth in plug-in pickers is not counted.

| Task | Logic iPad | Cubasis | Note | GarageBand iPhone |
|---|---|---|---|---|
| Reach mixer | 1 | 1 (assumed) | 1 | n/a, Track Controls 1 |
| Add insert | 3 (Mixer, Setup, slot) + pick | 2–3 (Effects, slot) + pick | 0 extra, fixed 2 slots | not established |
| Open effect parameters | 2 (Mixer, slot) | 2–3 | 1–2 | not established |
| Change a send level | 2, then drag | not established | not offered | not established |
| Bypass an effect | 3 (Mixer, On/Off, slot) | not established | not established | not established |

- A vertical-timeline phone DAW could treat a strip as a **single tall column in focus**, reached by a gesture from its track, instead of a horizontal row of strips. Logic's mini view (hold a slot, get key parameters in place) maps well to this: no navigation, immediate dismissal.
- Logic's mode button is the weakest part for a gesture-only app, since it is a hidden global state. Touch-and-hold for a peek, plus tap for open, gives the same reach with no mode.
- Note's fixed "two slots" is a strong default for phones. Cubasis's eight-plus-EQ-plus-strip is what an expert expects. A short chain visible at once, expandable on demand, sits between them.
- State colours on a slot (Cubasis) replace text labels, which suits an icon-only interface.

### Gaps
- Cubasis's iPhone-specific layout is not documented on the pages read; the help text is tablet-centred.
- No independent, measured "taps to reach" study of mobile DAWs was found. The table is reconstruction only.
- BandLab's official help was blocked (403), so its mixer on mobile rests on third-party guides.
- Koala and Auxy have no public manual that I reached; Auxy detail dates from 2019.

## 2. Automation on touch

### Takeaway
All serious apps offer two paths: perform a control while playing, or draw on a lane. The real design differences are in choosing the parameter (Logic and Cubasis use a menu; Note and FL use "touch the control itself") and in protecting existing data (Note previews before committing). "Touch the control you want to automate" is the most gesture-native choice and needs no parameter list.

### Cited Findings
**Logic Pro for iPad**
- Two automation types: track automation stays with the track position; region automation moves with the region and has priority if both exist. Step Sequencer data outranks region automation [P] — [Apple: Intro to automation](https://support.apple.com/guide/logicpro-ipad/intro-to-automation-lpip5e86f830/ipados).
- Automation curves are hidden until Automation view is turned on, with independent buttons for Tracks and Editors. In that view regions are visible but not editable, track headers gain Mode, Parameter and Value controls, and the tool buttons change [P] — [Apple: Show automation](https://support.apple.com/guide/logicpro-ipad/show-automation-lpip9e8b7cac/ipados).
- The tool set is Move, Pencil (add, move, delete points), Brush (draw a curve or delete) and Curve (bend lines), plus Select, Copy and Stepped modifiers. Automation has its own Snap value [P] — [Apple: Automation drawing tools](https://support.apple.com/guide/logicpro-ipad/automation-drawing-tools-lpip418c4763/ipados), [Apple: Show automation](https://support.apple.com/guide/logicpro-ipad/show-automation-lpip9e8b7cac/ipados).
- Parameters are chosen from a per-track pop-up. Volume is always first, followed by a Main submenu (Volume, Pan, Solo, Mute). Volume and Pan each have Absolute and Relative (±) curves, the latter acting as an offset [P] — [Apple: Automation parameters](https://support.apple.com/guide/logicpro-ipad/automation-parameters-lpipbf8cb678/ipados).
- MIDI data points (program change, expression, CC) look and behave like automation points in the same view [P] — [Apple: Intro to automation](https://support.apple.com/guide/logicpro-ipad/intro-to-automation-lpip5e86f830/ipados).
- Real-time writing uses Touch (writes while held, then returns to existing data) or Latch (keeps writing the last value until stop), chosen from the track's mode menu [S] — [Apple: Write automation in real time](https://support.apple.com/guide/logicpro-ipad/write-automation-in-real-time-lpip38f0b9e0/ipados).

**Cubasis 3**
- The editor opens from the Inspector's Automation tab (slots list every automated parameter) or an automation button in the Mixer, Effect Rack or Instrument Rack title bar [P] — [Steinberg: Automation](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/IS_Automation.html).
- A drop-down lists every automatable parameter and highlights those containing data. "Goto source" closes the editor and opens that parameter's control [P] — [Steinberg: Automation](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/IS_Automation.html).
- Tools: Select, Draw (overwrites, density follows grid), Erase, Reset all, **Reduce** (thins points; repeatable; lowers CPU load), and axis-constrained Move [P] — [Steinberg: Automation](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/IS_Automation.html).
- Read and Write toggles sit on each strip and effect. To record: enable Write, press Play, move the control [P] — [Steinberg: Automation](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/IS_Automation.html).
- MIDI parameters are edited in the Key Editor, not the automation editor [P] — [Steinberg: Automation](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/IS_Automation.html).

**Ableton Note**
- Change a parameter while the transport runs. A **dotted line** in the Clip Preview shows the captured change and tapping **Add** commits it as a solid line. Tapping a parameter name offers Insert (a flat line at the current value) or Delete [P] — [Ableton Note manual](https://www.ableton.com/en/note/manual).

**FL Studio Mobile**
- Most movable controls can be automated; manually creating a clip starts by tweaking the control you want [S] — [Image-Line: Playlist](https://www.image-line.com/fl-studio-learning/fl-studio-mobile-online-manual/html/plugins/FL%20Studio%20Mobile_Playlist.htm).
- Automation lives as clips on the Playlist. Tap a clip to open a pop-up editor; tap to add points, drag to select several, then delete, move, copy or paste [P] — [Image-Line: Editors](https://www.image-line.com/fl-studio-learning-content/fl-studio-mobile-online-manual/html/plugins/FL%20Studio%20Mobile_Editors.htm).
- A 2018 user said pitch automation worked but tempo did not; status today is unknown [U] — [Image-Line forum](https://forum.image-line.com/viewtopic.php?p=1348182).

**GarageBand, Auxy, BandLab**
- GarageBand iPhone: tap a track header then Automation; the guide covers volume. Hold the Edit Automation button and drag on the curve to add points. Bypass disables a track's automation and locks editing [S] — [Apple: Automate volume changes](https://support.apple.com/guide/garageband-iphone/automate-volume-changes-chsf716994ec/ios).
- Auxy 6 added a Free grid mode that moves notes and automation off the grid [P, 2019] — [CDM](https://cdm.link/auxy-ableton-export-tweaks/).
- BandLab: an Automation icon in the Studio timeline, then draw points for volume, pan and effect parameters, on mobile and web [S] — [BandLab Studio FAQ](https://blog.bandlab.com/studio-faq/).

### Inferences
- Most gesture-fit pattern: **arm by touching the control, then perform while playing, then confirm**, combining FL's pick-by-touch with Note's dotted preview. It avoids Logic's parameter menu entirely.
- Provide a "what is automated here" affordance: Cubasis's highlight on parameters holding data becomes a marker on controls in an icon UI.
- A finger-drawn curve produces many points. Cubasis's Reduce (or automatic simplification on stroke end) is a necessity on small screens, not a luxury.
- With time running downward, an automation lane is a vertical strip where value runs left to right. A thumb can trace it straight down the screen, which is a more natural stroke than Logic's horizontal one. Note this is reasoning only; no shipping example was found.
- Logic's track-versus-region split is a heavy concept for phones. Note and FL attach automation to the clip, which also survives copying.

### Gaps
- Logic's exact point-editing gestures come partly from search summaries.
- Whether Note's commit step applies across all parameter types is not stated.
- I found no usability data comparing draw-first with perform-first automation on phones.

## 3. Piano roll on touch

### Takeaway
All mainstream piano rolls keep time horizontal, and Note even advises landscape. I found no mainstream DAW with a vertical or rotated piano roll. Time-downward layouts exist in trackers (SunVox) and in falling-note learning apps, so a vertical roll is genuinely unoccupied ground. Common mechanics are tap to add, drag an edge to resize, and pinch to zoom. They differ on tool modes versus modeless gestures and on how velocity is edited.

### Cited Findings
**Logic Pro for iPad**
- Function buttons Trim, Pencil, Brush and Velocity change what tap and drag do. Holding the Select or Copy button makes it momentary [P] — [Apple: Piano Roll overview](https://support.apple.com/guide/logicpro-ipad/piano-roll-editor-overview-lpip2bd3cd79/ipados).
- With Pencil, tap adds a note at velocity 80 and length 1/16. Changing an existing note's length sets the new default. Touch-and-hold then drag positions it before release. Brush paints a repeating series at the Snap rate [P] — [Apple: Add notes](https://support.apple.com/guide/logicpro-ipad/add-notes-lpip3d423c4b/ipados).
- Selected notes gain trim handles, and you may need to zoom to see them. **Waiting about a second after touching a note auto-zooms the work area horizontally for precise trimming.** With Pencil, note edges can be dragged with no visible handles [P] — [Apple: Trim notes](https://support.apple.com/guide/logicpro-ipad/trim-notes-lpipb3614476/ipados).
- Velocity is shown by a line inside the note or as colour (purple to green to red). Velocity mode: drag a selected note up or down; multi-note edits keep relative differences and stop when any note reaches 1 or 127 [P] — [Apple: Change note velocity](https://support.apple.com/guide/logicpro-ipad/change-note-velocity-lpip383b00ed/ipados).
- Quantize is in the inspector (Note or Region) with value, Q-Swing and Q-Strength. Setting it to Off restores original timing, so quantize is non-destructive [P] — [Apple: Quantize timing](https://support.apple.com/guide/logicpro-ipad/quantize-timing-lpipaab75231/ipados).

**Cubasis 3**
- The Key Editor opens by double-tapping a MIDI event. Pinch zooms on both axes. Tapping a piano key auditions it, and keys light up in playback [P] — [Steinberg: Key Editor](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/ED_MIDI.html).
- Select and Draw are the main modes. In Draw, tap adds, tap on a note deletes, and hold-after-placing then move sets length. An arrow icon at the right of a note adjusts length. Sliding across the velocity lane redraws velocities in one stroke [P] — [Steinberg: Key Editor](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/ED_MIDI.html).
- Double-tap selects all; tap-hold in empty space starts a band select; undo briefly shows an overlay naming the action [P] — [Steinberg: Key Editor](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/ED_MIDI.html).

**Ableton Note**
- Tap a cell to add a note, tap a note to delete it, hold and drag to draw, drag the right edge for length. Long-press selects a note, or long-press on empty space then drag for box select [P] — [Ableton Note manual](https://www.ableton.com/en/note/manual).
- The note menu has Operations, Transpose, Quantization and Velocity tabs. Editor goes full screen, zooms by two-finger pinch, and the manual mentions landscape use [P] — [Ableton Note manual](https://www.ableton.com/en/note/manual).
- Live entry uses 5×5 grid or Keys pads (4×4 or Single for Drum Racks), with fixed 1–16 bar or free-length capture [P] — [Ableton Note manual](https://www.ableton.com/en/note/manual).

**FL Studio Mobile**
- Tap empty grid to add; delete via tap-and-hold pop-up. Length uses a "Set length" command rather than an edge drag in the text read. Velocity and Pan are per-note bars in a drag-up panel [P] — [Image-Line: Editors](https://www.image-line.com/fl-studio-learning-content/fl-studio-mobile-online-manual/html/plugins/FL%20Studio%20Mobile_Editors.htm).
- Quantize: set a snap value (short tap toggles, long press opens options), select, then Snap. Drag on the timeline selects a time range for Insert space, Duplicate, Delete space or Trim [P] — [Image-Line: Editors](https://www.image-line.com/fl-studio-learning-content/fl-studio-mobile-online-manual/html/plugins/FL%20Studio%20Mobile_Editors.htm).

**Vertical precedents**
- SunVox has a vertical tracker pattern editor on phones [S] — [App Store](https://apps.apple.com/au/app/sunvox/id324462544).
- In SunVox you move the cursor by dragging rather than tapping, which a Tape Op reviewer notes keeps your finger from hiding the target [S] — [Tape Op](https://new.tapeop.com/reviews/gear/110/sunvox-modular-music-studio).
- On small screens SunVox shows either the pattern timeline or the module display, with a switch button [S] — [SunVox tutorial](https://kwx.liehendr.com/content/wikibooks_en_all_maxi_2021-03/A/Sunvox_Tutorial/The_sunvox_interface).
- Falling-note apps show time running vertically but are trainers or video tools, not DAWs [S] — [Falling Notes Piano Trainer](https://apps.apple.com/us/app/falling-notes-piano-trainer/id6447489785), [Synthesia](https://apps.apple.com/us/app/synthesia/id579518445).
- Auxy's interface is a simplified piano-roll view, not vertical as far as sources show [P, 2019] — [CDM](https://cdm.link/auxy-ableton-export-tweaks/).

### Inferences
- A vertical roll puts pitch on the horizontal axis, matching a real keyboard and the falling-note idiom. A keyboard docked at the bottom edge lines up with the columns, so the playing surface doubles as the pitch ruler. In portrait this gives time the long screen axis, but pitch only the short one, so pitch zoom or scale-fold matters more than in a landscape roll.
- Finger occlusion differs too: with a playhead moving down, a thumb at the lower edge hides the music *about to be heard*. The playhead may need to stay near the screen's top third with future notes above or below it decided deliberately. Test this first.
- Worth copying: Logic's dwell-to-zoom (precision without a tool), Logic's "last length becomes default", Cubasis's one-stroke velocity lane (rotated, a vertical lane beside the column), Logic's velocity colouring, non-destructive quantize with Off.
- Avoid: Logic's persistent tool modes for a gesture-only app, and tap-on-note-deletes (Note, Cubasis Draw) when the tap also means audition. A long press can carry a deliberate delete.
- Dwell gestures compete with each other. Logic uses hold for select or move, and also hold for auto-zoom; a gesture vocabulary needs mapping as a whole.

### Gaps
- I found no vertical piano roll in any mainstream DAW, but one search cannot prove none exists, especially among small iOS apps. Atom Piano Roll 2's orientation was not confirmed.
- Whether BandLab, Koala or GarageBand offer unique note-editing gestures was not researched in depth.
- No usability data on portrait versus landscape note editing was found.

## 4. Overdub, latency, Bluetooth and AirPods

### Takeaway
Cubasis is the clearest model on wired audio: an explicit Audio Recording Offset Compensation with an automatic **Calibrate** button using speaker-to-mic loopback. Logic documents PDC and Low Latency Monitoring but I found no user calibration on iPad. Bluetooth is treated as unfixable for monitoring; the one documented approach for alignment is to measure with a chirp and shift the timeline, leaving the raw take untouched. iOS's reported Bluetooth latency values are not trustworthy.

### Cited Findings
**Calibration and compensation**
- Cubasis: "Audio Recording Offset Compensation" should equal device loopback latency. Tapping Calibrate sets it automatically, provided the input can hear the output (nothing connected, or speakers and a mic with an interface). It must be redone after changing Latency or Guard Buffer or connecting or disconnecting an interface [P] — [Steinberg: Setup](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/SETUP.html).
- Cubasis buffer range: about 1.3 ms (64 samples at 48 kHz) to 43 ms (2048). A "?" button breaks down total I/O latency. On iOS, the setting is system-wide, so only the first audio app launched can change it [P] — [Steinberg: Setup](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/SETUP.html).
- Cubasis on Android cannot know device I/O latency, so Ableton Link gets a manual slider tuned by matching metronome ticks [P] — [Steinberg: Setup](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/SETUP.html).
- Cubasis PDC: a forum reply said it was absent at the time and planned, and users later called it unreliable in Cubasis 3. Current state unverified [U] — [Steinberg forum](https://forums.steinberg.net/t/cubasis-3-pdc-broken/140169).
- Logic iPad: automatic PDC delays other strips to the slowest. Low Latency Monitoring disables PDC on the focused instrument and record-enabled tracks, bypasses plug-ins over a set limit, turns off sends, and shows those items in orange. A per-send "Low Latency Safe" option keeps, for instance, a reverb [P] — [Apple: Low Latency Monitoring](https://support.apple.com/guide/logicpro-ipad/record-with-low-latency-monitoring-mode-lpip828e667e/ipados).
- The Logic limit goes up to 30 ms [S] — [Apple: Low Latency Monitoring](https://support.apple.com/guide/logicpro-ipad/record-with-low-latency-monitoring-mode-lpip828e667e/ipados).
- BandLab says there is no latency fix needed on iOS because it is automatically compensated; a manual offset is Android-only; and it recommends against Bluetooth for recording [S, page returned 403] — [BandLab help](https://help.bandlab.com/hc/en-us/articles/115002959414-Fixing-Latency).
- Ableton Note's manual mentions no latency compensation or settings at all [P] — [Ableton Note manual](https://www.ableton.com/en/note/manual).
- FL Studio Mobile's main manual page does not mention calibration; it lists "CPU/Audio settings" on the Home Panel, not read [P] — [Image-Line manual](https://www.image-line.com/fl-studio-learning/fl-studio-mobile-online-manual/html/plugins/FL%20Studio%20Mobile.htm).

**Bluetooth and AirPods**
- Cubasis says Bluetooth and AirPlay "operate with fairly high latency" and offers an Output Device picker [P] — [Steinberg: Setup](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/SETUP.html).
- Logic for Mac: use Bluetooth for mixing or listening only; its latency can't be changed. No iPad equivalent was found [S] — [Apple: input monitoring latency](https://support.apple.com/en-au/105040).
- Logic iPad: with Autoselect off, AirPods Pro do not appear as an output; you must choose AirPlay and pick the device there [P] — [Apple: Audio Devices settings](https://support.apple.com/guide/logicpro-ipad/devices-lpip53bd0492/ipados).
- A vendor post (TakeOne) gives A2DP round-trip delay of roughly 230–310 ms and says `outputLatency` is often unreliable or zero on Bluetooth routes. Its method: 16 sweeps (2–6 kHz) at 1 s spacing, mic capture, cross-correlation, median, pass at 12+ chirps. It leaves the recording raw and shifts the timeline, flags takes when the route changes, and reports ±10 ms as hard to notice. Figures are the vendor's own [P] — [Musevv blog](https://www.musevv.com/blog/how-i-solved-bluetooth-audio-latency-on-ios.html).
- Developers report AirPods latency near 160 ms that drifts over time, as if the link "warms up" [U] — [Apple Developer Forums](https://developer.apple.com/forums/thread/679274).
- A community test read about 163 ms on A2DP and 9 ms on HFP, yet the audible gain was only about 30 ms, implying reported figures can mislead [U] — [Apple Community](https://discussions.apple.com/thread/256097737).
- While audio input is active on Bluetooth, the route has to be HFP; if both options are enabled and supported, Core Audio prefers HFP [S] — [Medium overview](https://medium.com/@mehsamadi/understanding-avaudiosession-routes-on-ios-7718d934d0c0), [Apple Developer Forums](https://developer.apple.com/forums/thread/784318).
- A Steinberg user's manual workaround: record taps to a metronome, measure how late they land, shift the track [U] — [Steinberg forum](https://forums.steinberg.net/t/incorporate-some-kind-of-delay-compensation-for-bluetooth-or-ability-to-move-audio-by-msecs/1004415).

**On the web**
- `AudioContext.outputLatency` is listed from Safari iOS 18.4 and `baseLatency` from 14.5 in one compatibility table. This needs a check against current data and feature detection [S] — [MDN mirror](https://www-igm.univ-mlv.fr/~forax/MDN/developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency.html).
- An older blog reports incomplete support and a WebKit fixme [S] — [jamieonkeys](https://www.jamieonkeys.dev/posts/web-audio-api-output-latency/).

### Inferences
- Treat the offset as **a per-route stored value** keyed by output device. Calibrate on first use of a route, and on any route change mark takes as suspect (TakeOne's Route Guard) rather than silently trusting a stale value.
- Store takes raw and apply offset as metadata on the clip, so a later re-calibration can correct old takes. This follows the TakeOne principle and costs nothing in a non-destructive engine.
- With AirPods as output and the phone mic as input, an overdub is measurable and alignable but never live-monitorable. Hide input monitoring on Bluetooth routes rather than offering a bad experience.
- Using AirPods' mic forces HFP, so recording via AirPods degrades playback quality. Prefer the built-in mic while AirPods stay on A2DP if the platform allows; the iOS Forums thread suggests this is possible natively, but a web app may not control it.
- A chirp method works well on phones since the mic hears the speaker, and for Bluetooth buds it needs the earbud held near the mic. Very quiet playback will fail, per the vendor's limitation note.
- For a web build, `outputLatency` should be a hint only. The loopback measurement stays the source of truth.
- Plug-in delay handling is cheap to get right from the start: Logic's Low Latency mode with orange-marked casualties is a clean model if heavy effects are added later.

### Gaps
- Whether Logic for iPad has a user-visible recording delay or calibration setting: "Recording settings" text read did not show one, but the page was only partly checked. iOS-native automatic compensation details were not found in an Apple primary source.
- I found no measured AirPods latency from a neutral lab. All numbers are vendor or user figures.
- Whether a web page on iOS Safari can hold A2DP output with built-in mic input is unverified and should be tested on a device.
- GarageBand, Koala and Auxy behaviour for Bluetooth and calibration was not found.

## 5. Time-range selection and export

### Takeaway
The standard is a ruler range (Cycle or Locators) that also drives export, with options for tail, normalise and separate tracks. Cubasis has the fullest phone-capable export (WAV, AIFF, FLAC, M4A, MP3, MIDI). **I found no dither option in any manual read**, on pages for Logic iPad and Cubasis. Stems are usually a ZIP or a folder of per-track files.

### Cited Findings
**Selection**
- Logic: drag the ruler's upper part to set the cycle; tap to toggle; drag the centre to move, edges to resize; "Set to selection" via a region's menu [P] — [Apple: cycle area](https://support.apple.com/guide/logicpro-ipad/use-the-cycle-area-lpip6e450da3/ipados).
- Cubasis: left and right locators; tap-hold an event to fit locators to it; tap-hold a locator for a second to move both together [P] — [Steinberg: Project View](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/TRACKS.html).
- FL Studio Mobile: drag the Piano Roll timeline for a time selection [P] — [Image-Line: Editors](https://www.image-line.com/fl-studio-learning-content/fl-studio-mobile-online-manual/html/plugins/FL%20Studio%20Mobile_Editors.htm).

**Logic Pro for iPad export**
- AIFF, WAVE or M4A; only unmuted tracks routed to Stereo Out are included. The Entire Project Length switch gives Start and End fields; if Cycle is on, the cycle range fills them [P] — [Apple: Export project](https://support.apple.com/guide/logicpro-ipad/export-a-project-to-an-audio-file-lpipbde89132/ipados).
- Uncompressed offers 16-bit, 24-bit, 32-bit float plus a sample-rate menu [P] — [Apple: AIFF and WAVE options](https://support.apple.com/guide/logicpro-ipad/aiff-and-wave-file-options-lpip13845bbf/ipados).
- Processing: Automatic, Offline or Realtime; Bounce 2nd Cycle Pass (start on the second repeat so tails from the first pass are included; Realtime only); Include Audio Tail; Include Mastering Assistant; Normalize (Off, On, Overload Protection Only); Include Master Effect Plug-ins; song metadata including ISRC for compressed files [P] — [Apple: processing details](https://support.apple.com/guide/logicpro-ipad/set-processing-details-exporting-projects-lpip3ca1a2f4/ipados).
- Stems: uncompressed only, all or selected tracks into one ZIP. Options: tail, normalize, effect plug-ins, volume and pan automation [P] — [Apple: Export tracks](https://support.apple.com/guide/logicpro-ipad/export-tracks-as-individual-audio-files-lpip1f5dd156/ipados), [Apple: track processing](https://support.apple.com/guide/logicpro-ipad/set-processing-details-exporting-tracks-lpipaced6863/ipados).
- "Dither" does not appear on the export option pages read; a string check confirmed that for the project processing, AIFF/WAVE and track export pages [P] — [Apple: AIFF and WAVE options](https://support.apple.com/guide/logicpro-ipad/aiff-and-wave-file-options-lpip13845bbf/ipados).
- Logic for iPad also exports MIDI, takes and comps, and shares whole projects by Files or AirDrop [P] — [Apple: Share a project](https://support.apple.com/guide/logicpro-ipad/share-a-project-lpipb58fb5a5/ipados).

**Cubasis 3**
- Mixdown formats: WAV, AIFF, FLAC, M4A, MP3 (44.1/48 kHz only), MIDI. Options: between locators, include effect tail (on by default, off for seamless loops), separate files for tracks (non-muted stems), dry, normalize to 0 dB, mono downmix [P] — [Steinberg: MediaBay](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/MEDIA.html).
- Project rate 44.1, 48 or 96 kHz; bit depth 16, 24 or 32 for recording and mixdown; 96 kHz needs compatible hardware; Mixdown uses project rate and depth [P] — [Steinberg: Setup](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/SETUP.html).
- A Cubasis 2 help page lists bit depths of only 16 and 24, so this differs by version [S] — [Steinberg Cubasis 2 Setup](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_2_Web_Help/SETUP.html).
- Users report extra milliseconds appended to exported loops (April 2026) and leakage at export starts [U] — [Cubasis store chart page](https://clickyourapp.com/charts/app-store/com.steinberg.cubasis3/), [Steinberg forum](https://forums.steinberg.net/t/silence-at-the-beginning-of-stereo-out-export/744034).

**Others**
- Ableton Note: WAV at 48 kHz/16-bit or M4A; scenes export top to bottom, with the longest clip setting each scene's length [P] — [Ableton Note manual](https://www.ableton.com/en/note/manual).
- GarageBand iPhone: share as project, audio file or ringtone. The audio path has a quality picker plus artist, composer and title fields [P] — [Apple: Share songs](https://support.apple.com/guide/garageband-iphone/share-songs-chs39284d66/ios). A user complains of no stem export [U] — [Loopy Pro forum](https://forum.loopypro.com/discussion/23785/when-compared-to-other-ios-hosts-what-are-the-weaknesses-of-ios-garageband).
- FL Studio Mobile: Save > MP3 or WAV into My Tracks [P] — [Image-Line manual](https://www.image-line.com/fl-studio-learning/fl-studio-mobile-online-manual/html/plugins/FL%20Studio%20Mobile.htm).
- Auxy: stems, project files for Live, Bitwig Studio and Studio One, AAC or WAV, MIDI, and SoundCloud, per listing [S] — [App Store](https://apps.apple.com/us/app/auxy-studio/id1034348186).
- BandLab mobile: per-track export via a track's menu per one guide; sources conflict on format, with M4A on Android per one and 16-bit WAV per another. ZIP stems on web [S, conflicting] — [bchillmix](https://bchillmix.com/blogs/news/how-to-export-stems-from-bandlab-for-a-mixing-engineer), [Geekchamp](https://geekchamp.com/?p=248673).

### Inferences
- A sensible default set: WAV 24-bit at project rate, plus M4A for sharing, plus FLAC if cheap. Note's fixed 48/16 shows a phone app can go far with a single sensible preset.
- Dither is a low-stakes differentiator: mobile DAWs seem not to expose it. If you export 16-bit from a float engine, add TPDF dither by default and omit the option from the UI, in keeping with an icon-only interface.
- Range-as-gesture: drag along the time axis to mark a range, and the export sheet inherits it, as in Logic's Cycle behaviour. Avoid numeric Start and End fields for the default path.
- The loop-export reports show a real trap: "include tail" must be off and sample-accurate length preserved for loop bounces. Cubasis's explicit note on this is a useful design prompt.
- Export a multi-track ZIP via the iOS share sheet, as Logic and the Ableton SDK both suggest.

### Gaps
- No Cubasis or Logic statement explicitly says "no dither". This is absence on the pages read, not a confirmed lack. Logic has dither-related settings elsewhere that I did not exhaustively search.
- Logic iPad's exact list of export sample rates was not given on the page.
- Koala's export options were not established. BandLab's mobile formats are in dispute.

## 6. Project and take management

### Takeaway
Apps either lean on the OS file browser (Logic, GarageBand's document model) or build a media store (Cubasis MediaBay, Note Library). Search and tags are mostly inherited from the OS file browser; I found no app with a music-native tag system. Logic has the only well-documented take system on mobile: take folders, a pop-up to choose, rename, colour, and swipe comping.

### Cited Findings
- Logic's Projects browser is a Files-style view: icon, list and column views, sort and group by name, kind, date, size or tags, folders, find, duplicate, Recents [P] — [Apple: Projects browser shortcuts](https://support.apple.com/guide/logicpro-ipad/projects-browser-lpip92be7200/ipados).
- Closing a project via the Projects Browser button saves it; Logic also autosaves. Long-press on the Home Screen icon opens recent projects [P] — [Apple: Open and close projects](https://support.apple.com/guide/logicpro-ipad/open-and-close-projects-lpipd32cbe65/ipados), [Apple: Special gestures](https://support.apple.com/guide/logicpro-ipad/special-gestures-lpip3b88cd2e/ipados).
- Logic Takes: multiple passes form a take folder with a Takes pop-up; audio takes comp by Quick Swipe Comping; takes can auto-colour while recording; rename via Takes pop-up or tapping the folder twice [P] — [Apple: Takes and comps](https://support.apple.com/guide/logicpro-ipad/intro-to-takes-and-comps-lpip458ce486/ipados), [Apple: Rename takes](https://support.apple.com/guide/logicpro-ipad/rename-takes-and-comps-lpipbe89157e/ipados).
- Cubasis: Hub at launch for new, last-opened, browse, tutorials. MediaBay stores projects, audio, MIDI, instruments, mixdowns and a Trash folder, auto-sorted by file type; columns sort; drag into Templates to make a template; drag files between apps [P] — [Steinberg: MediaBay](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/MEDIA.html).
- Cubasis projects are a folder containing `.cbp`, audio and backups, and open in desktop Cubase [P] — [Steinberg: MediaBay](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/MEDIA.html).
- Note: Set Library with Cloud and Local sections; Set Options for duplicate, rename, artwork, upload, share. Demo Sets included [P] — [Ableton Note manual](https://www.ableton.com/en/note/manual).
- GarageBand iPhone: My Songs browser; touch-and-hold for Share [P] — [Apple: Share songs](https://support.apple.com/guide/garageband-iphone/share-songs-chs39284d66/ios).
- FL Studio Mobile: projects load and save from the Home Panel [P] — [Image-Line manual](https://www.image-line.com/fl-studio-learning/fl-studio-mobile-online-manual/html/plugins/FL%20Studio%20Mobile.htm).

### Inferences
- For a web or PWA build with no file system to inherit, you need your own browser, and it can be simple: a date-ordered grid with artwork or a waveform/MIDI thumbnail, since Note's artwork field is a cheap visual identifier suited to an icon-only UI.
- Auto-name takes by time and let the waveform identify them, with renaming optional. Logic's colour-while-recording suits a stack of takes in a vertical column.
- A soft-delete Trash (Cubasis) is valuable when destructive actions are gesture-triggered.
- "New project, last project" at launch (Cubasis Hub, Logic's Home Screen shortcut) cuts time-to-sound. PWAs can declare app shortcuts, though I did not verify iOS behaviour.

### Gaps
- No app was confirmed to have in-app tags or full-text search beyond OS facilities. Logic's Sort by Tags is inherited from Files.
- BandLab's cloud project library, Koala's project handling and Auxy's browser were not researched in detail.
- Note's take handling (if any) and FL's take handling were not established.

## 7. Ableton interoperability: Note to Live, `.als` writing, Link on the web

### Takeaway
Writing `.als` from third-party code is feasible, and it has been done commercially: Ableton itself offers a Live Set Export library (iOS, by licence request), which Auxy used. For a web app, the most relevant route is template cloning: gunzip a set saved by Live, inject tracks and clips. An MIT Rust implementation that compiles to WASM exists. Sets are version-locked one way (newer Live opens older sets; older Live refuses newer). Link cannot run in a browser: all known routes need a native companion process.

### Cited Findings
**Note to Live**
- Note sends Sets to Live's browser via Ableton Cloud; they appear under Cloud in Places. An ableton.com account is needed; uploads queue offline; mobile data can be disabled [P] — [Ableton Note manual](https://www.ableton.com/en/note/manual).
- Cloud capacity conflict: the Note manual says up to eight Sets (from Note and Move); Ableton's help article, in a search summary, says five [P vs S] — [Ableton Note manual](https://www.ableton.com/en/note/manual), [Setting Up Ableton Cloud](https://help.ableton.com/hc/articles/6242153675676). Treat eight as current, since the manual text mentions Move.
- Share To creates a `.ablbundle` containing samples and metadata, sent by AirDrop or Files. It opens in other Note instances or in Live 11.2.5+. The transfer is one-way: Live Sets can't open in Note [P] — [Ableton Note manual](https://www.ableton.com/en/note/manual).
- After editing in Live, save as `.als` with Collect All and Save. Note's native file is `.abl`, and Live changes do not flow back [S] — [Ableton help article](https://help.ableton.com/hc/en-us/articles/6240279343772).
- Samples go to Live's User Library [S] — [Ableton help article](https://help.ableton.com/hc/en-us/articles/6240279343772).

**The `.als` format**
- `.als` files are gzipped, undocumented, version-specific XML [P, third party] — [expressive-liveset](https://github.com/swwallowws/expressive-liveset).
- Forum and tool reports say Live also loads uncompressed XML saved with a `.als` extension [S, U] — [Ableton Forum thread](https://forum.ableton.com/viewtopic.php?t=121089&start=45), [guard-live-set](https://github.com/mgarriss/guard-live-set).
- Official rule: sets saved in later versions can't be opened in earlier versions; Live prompts Save As after an update [S] — [Ableton: Backward Compatibility](https://help.ableton.com/hc/en-us/articles/360000841004).
- Editing the header to force an older Live to open a set is an unofficial hack, and can fail with an "Unknown Compound Stream Type" error [U] — [unverified guide](https://paste.brianrianrehan.com/YDnJs8480). Low-quality source; do not rely on it.

**Writers and tools**
- **Ableton Live Set Export** (official, by Ableton): iOS static library `libALSExportKit.a` with Objective-C wrapper, by licence request. Writes ALS plus project folder and copies audio. Audio and MIDI tracks, session or arrangement clips, tempo 20–999, time signature, labels, colours, loops, volume, warp mode. MIDI is note on/off with velocity only. Cannot read sets, no networking, no warp engine, tracks not reorderable. Live Lite limit is 8 tracks and 8 scenes, Intro 16 and 8; exceeding it forces demo mode. Suggests zipping and using the share sheet [P] — [Ableton: Live Set Export docs](https://ableton.github.io/export/).
- Auxy used Ableton's SDK so arrangement carries to Live, with audio stems and MIDI patterns; CDM noted other developers could access it [P, 2019] — [CDM](https://cdm.link/auxy-ableton-export-tweaks/).
- **expressive-liveset** (Rust, MIT, one dependency `flate2`, builds for `wasm32-unknown-unknown`): clones a set saved by Live 12.4.6 and injects tracks, session clips, one arrangement clip per track, scenes and tempo map; targets schema `12.0_12402`; to change version, "re-save the template". Instruments are optional, referencing Core Library devices. Device IDs are moved above all template IDs and offset per track. Unaffiliated with Ableton [P] — [expressive-liveset](https://github.com/swwallowws/expressive-liveset).
- **fmtals** (C++17, MIT): imports and exports sets as data structures, with an `export_project` for a chosen Live version. 21 commits, no stars at capture; versions not listed [P] — [fmtals](https://github.com/adriensalon/fmtals).
- Parsers only: [als-parser](https://github.com/jbremz/als-parser), [ableton-parser](https://github.com/jake-g/ableton-parser), [pyableton](https://pypi.org/project/pyableton/) [S]. Schema package [daw-schemas](https://pypi.org/project/daw-schemas/) reportedly covers Live 11 and 12 [S; page did not load when fetched].
- Live-control tools work against a running Live, not files: [ableton-live-mcp](https://github.com/wstierhout/ableton-live-mcp), [ableton-liveapi-tools](https://github.com/Ziforge/ableton-liveapi-tools) [S].

**Link**
- Link is dual-licensed GPLv2+ and proprietary (contact link-devs@ableton.com). It is header-only C++. iOS apps use the separate LinkKit SDK. Output latency should be added to system time so devices line up. The README mentions no WASM or web support. Link Audio is an add-on via `LinkAudio.hpp`; its licensing is not stated [P] — [Ableton/link](https://github.com/Ableton/link).
- Link discovers peers by UDP multicast at 224.76.78.75:20808 [S] — [JackTrip discussion](https://github.com/jacktrip/jacktrip/discussions/815).
- A project's PR states browsers can't join since the web has no UDP, and that all five browser-Link projects it checked wrap the C++ SDK in a local process. Its own bridge is marked experimental: a Python `aalink` companion relaying tempo, beat and phase by WebSocket at 25 Hz [S] — [ricochet PR](https://github.com/MohamedFekryyy/ricochet/pull/3).
- A Node example bridges Link to browsers by WebSocket [S] — [browser-sync-ableton-link](https://github.com/vigliensoni/browser-sync-ableton-link). The npm `abletonlink` package shows 0.2.0-beta.0, about three years old [S] — [npm](https://www.npmjs.com/package/abletonlink).
- Note exposes a Link toggle, local network permission prompt, peer notifications, Sync Start/Stop and a peer count [P] — [Ableton Note manual](https://www.ableton.com/en/note/manual).

### Inferences
- **Best path for a web DAW:** ship a zipped Live project (a `.als` built by template cloning plus a `Samples/` folder of bounced clips), delivered by the share sheet. Include audio stems and MIDI as Auxy did, so a set still has sound with no matching instruments on the desktop.
- **Pick the lowest template version you can support.** Since newer Live opens older sets but not the reverse, a Live 11 template would reach Live 11 and 12 users; a 12.4 template excludes anyone behind it. expressive-liveset's README says only "re-save the template"; older targets are untested here, and if Live is available, saved templates at each target are the safest.
- Live's own Live Lite limit (8 tracks, 8 scenes) is a useful cap to warn about. Exceeding it in an exported set could put a Lite user in demo mode.
- Effects and automation are the hard part. Ableton's own SDK leaves out automation and devices, so a "mix-accurate" `.als` is much more work than "notes and audio". Baking effects into stems, and keeping dry MIDI alongside, gives most of the value.
- Whether template-cloned `.als` contains anything Ableton would object to, and how its licence applies, is a question for iori, not one this research answers.
- Link on a phone-installed PWA is effectively out of reach, as an iOS PWA can't start a background process or open multicast UDP. Options: a desktop companion (only helps when a computer is present), a native wrapper with LinkKit, or a manual tap-tempo and nudge fallback.
- LinkKit in a native shell has the GPL or proprietary licence question to settle with Ableton.
- The reverse direction (`.als` into the app) is unnecessary. Note itself ships one-way.

### Gaps
- I found no published specification of `.als` root attributes such as Creator, MinorVersion or SchemaChangeCount; the one notes repo fetched did not cover them.
- Whether the Live Set Export library is still licensed to new developers in 2026 and its current Live version support are unknown; the docs name none.
- Whether expressive-liveset outputs audio clips at all was not established; its README, as read, describes MIDI and pitch.
- The `.abl` and `.ablbundle` formats are undocumented as far as I found.
- Web MIDI on iOS Safari, as an alternate sync path, was not researched.
- Whether a WASM Link build could work over WebRTC or any relay is unexplored. None was found.

## 8. One-off onboarding hints for gesture-heavy apps

### Takeaway
NN/g's position is that pushed tutorials and chains of coach marks don't improve performance; help should be "pull" (triggered by a signal of need), single-purpose, visual, and recallable. This fits one-off hints fired at the moment a gesture becomes relevant. Gesture discoverability remains a known weakness, so hints must be paired with a way to bring them back.

### Cited Findings
- Tutorials and What's New lists are "push revelations": they interrupt, get skipped, and "don't result in better task performance". Users want to start at once (paradox of the active user) [P, 2023] — [NN/g: Onboarding Tutorials vs. Contextual Help](https://www.nngroup.com/articles/onboarding-tutorials/).
- "Pull revelations" fire on a signal of need. Examples: Figma's tip when a text box is added; Photoshop's tooltip with an animated demo [P, 2023] — [NN/g: Onboarding Tutorials vs. Contextual Help](https://www.nngroup.com/articles/onboarding-tutorials/).
- Walkthroughs still fit novel interactions; ArcGIS's AR tutorial required the user to perform the task and stayed available afterward [P, 2023] — [NN/g: Onboarding Tutorials vs. Contextual Help](https://www.nngroup.com/articles/onboarding-tutorials/).
- Recommendations: easy to dismiss and recall; progressive disclosure; show help alongside each step; skip obvious conventions; use research to find the signals [P, 2023] — [NN/g: Onboarding Tutorials vs. Contextual Help](https://www.nngroup.com/articles/onboarding-tutorials/).
- Overlay guidelines: one primary action per tip, no chains, visuals with minimal text, visually distinct from the interface. In one study users tried to interact with overlay annotations they mistook for UI [P, 2014] — [NN/g: Instructional Overlays and Coach Marks](https://www.nngroup.com/articles/mobile-instructional-overlay/).
- A study of 70 users across 4 apps found those who read tutorials found tasks harder; NN/g extends this concern to overlays [S] — [NN/g: Mobile Tutorials](https://www.nngroup.com/articles/mobile-tutorials/).
- Norman and Nielsen (2010) argued gestural interfaces break discoverability, defined as all operations being discoverable by users [S; scanned copy] — [Gestural Interfaces: A Step Backward](https://kawilliams.github.io/teaching/hci/papers/gesture-interfaces.pdf).
- A TU Dresden study separates first-launch tutorials from in-flow overlays and rates tutorials as effective for unfamiliar interactions, which qualifies NN/g's stance [S; the URL is my best match from the search results, so confirm before citing] — [core.ac.uk PDF](https://core.ac.uk/download/478591672.pdf).
- DAW examples: Cubasis's Hub surfaces tutorials [P] — [Steinberg: MediaBay](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/MEDIA.html). Holding Command on iOS shows a shortcut overlay [P] — [Steinberg: Setup](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/SETUP.html). Cubasis's undo shows a brief overlay naming the reverted action [P] — [Steinberg: Key Editor](https://download.steinberg.net/downloads_software/Cubasis/Cubasis_3_Web_Help/ED_MIDI.html). Note ships Demo Sets and links videos from Help [P] — [Ableton Note manual](https://www.ableton.com/en/note/manual).

### Inferences
- **Trigger, not timer.** Each hint is bound to one event, such as the first time a fingertip dwells on a note or the first time a recording ends. Show one hint, once, and record it in a per-gesture "seen" store.
- **Learn by doing.** The hint is dismissed by performing the gesture, as in ArcGIS, not by tapping OK. A failed attempt (wrong gesture on a target) is a strong pull signal.
- **Ghost animation over text.** A short looping hand-path over the real target suits an icon-only interface and fits NN/g's visuals-plus-minimal-text guidance. It must look unlike controls, for example drawn or outlined, so nobody tries to tap it.
- **One recall point.** Keep a single gesture for "show me what I can do here" that replays the hint for the current surface. This addresses the NN/g recall guideline and the known weakness of gesture-only interfaces.
- **Skip the universal gestures.** Pinch zoom, scroll and drag need no hint. Spend hints on the special ones: dwell behaviours, two-finger modifiers.
- **Name actions after the fact.** Cubasis's undo overlay shows confirmation in gesture UIs where nothing else tells you what just happened. A fleeting icon or word after an uncommon gesture does quiet teaching.
- A hidden-by-default gesture set will always have parts some users never find. Keep every critical function reachable by at least one visible path, even if slow, and accept lower discovery for power gestures.

### Gaps
- NN/g's overlay article is from 2014 and about tablets. I found no NN/g article on gesture-specific one-off hints as of 2026.
- No DAW-specific onboarding research was found; comparison across the named apps' first-run experience was not possible from documentation alone.
- A 2024 paper by Khurana and Chilana on novice mental models of gesture discoverability, and an earlier study of contextual help for teaching gestures, surfaced in search, but I could not tie either to a confirmed URL and did not read them.
