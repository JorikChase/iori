# Audio project format

Version 1, written 2026-11-02. `audio/project.js` implements it and the `project-format` scenario tests it.

## Why it looks like this

The app used to keep nine separate `localStorage` keys and one anonymous editor session. A project has to hold everything
a song is, survive a phone killing the page with no warning, move between an iPhone and an iPad, and still open in
years, after the app has changed. Five rules follow.

1. **One document.** Everything that makes up the song is in one JSON document. Audio is referenced, never embedded.
2. **Raw audio plus metadata.** Takes are never altered. Trims, fades, warps, offsets, pad settings are data in the document.
3. **Names, not positions.** Synth genes are stored by name, so adding a gene can never shift an old patch.
4. **Keep what you don't understand.** Unknown fields are preserved on load and save, so an older app doesn't destroy
   work made by a newer one. Each document says its version; an app refuses a newer major version with a clear message
   instead of guessing.
5. **Device things stay on the device.** Latency offsets, quality tier and which hints you've seen belong to a phone, not
   to a song, so they aren't in the file.

## The save file

A project leaves the device as `<name>.audio.zip`: an ordinary ZIP, stored without compression, because audio barely
compresses and phones shouldn't spend the battery on it. Anyone can unzip it on any computer and find playable WAV files.

```
My song.audio.zip
├── project.json          the document, always the first entry
└── takes/
    ├── mvw2sja1sfwzs.wav one WAV per take the song uses, exactly the stored samples
    └── mvw3gvg31731b.wav
```

Importing checks each take's SHA-256 against the document. A take already on the device with the same hash isn't
copied twice.

## The document

```jsonc
{
  "format": "audio-project", "version": 1,
  "id": "…", "name": "My song", "created": 1793500000000, "modified": 1793500000000,
  "rev": 42,                       // goes up by one with every save
  "app": "bc0b55bb1440",           // the build that wrote it

  "time": { "sr": 48000, "ppq": 960, "tempo": 120, "sig": [4, 4], "map": [] },

  "tracks":  [ /* Track */ ],
  "returns": [ /* Track with kind "return": shared effects the sends feed */ ],
  "master":  { "gain": 0, "inserts": [ /* Insert */ ] },

  "takes":   { "<id>": /* TakeRef */ },
  "patches": { "<id>": /* Patch */ },
  "racks":   { "<id>": /* Rack */ },

  "markers": [ { "at": 96000, "name": "chorus" } ],
  "range":   null,                 // the last export range: { "from": 0, "to": 480000 }
  "tools":   { /* what each tool remembers for this project */ },
  "view":    { "playhead": 0, "scroll": 0, "zoom": 60, "lane": 0, "snap": true, "push": false }   // empty in a new project
}
```

### Time

Two kinds of time exist, because audio and music behave differently when the tempo changes.

- **Samples at 48 kHz, as integers.** Engine time. An unwarped clip stays at its place in seconds.
- **Ticks, 960 per quarter note.** Musical time. A MIDI clip or a warped clip follows the tempo.

Each clip says which it uses in `anchor`: `"time"` means its `at` and `len` are samples, `"beats"` means ticks. Integers
are required, since a bounce must be reproducible and float positions drift. Positions inside a take (`off`, `span`) are
samples at that take's own rate. `time.map` is for tempo changes later: `[{ "at": ticks, "tempo": 140 }]`.

### Track

```jsonc
{
  "id": "t1", "kind": "audio",     // "audio", "midi" or "return"
  "name": "", "color": 0, "mute": false, "solo": false,
  "gain": 0, "pan": 0,             // dB, -1 to 1
  "inserts": [ /* Insert */ ],
  "sends": [ { "to": "r1", "gain": -12 } ],
  "instrument": null,              // MIDI tracks: { "patch": "<id>" } or { "rack": "<id>" }
  "clips": [ /* Clip */ ]
}
```

### Clip

```jsonc
{ // audio
  "id": "c1", "type": "audio", "take": "<id>",
  "anchor": "time", "at": 57600, "len": 144000,
  "off": 48000, "span": 144000, "rev": false,
  "gain": 0, "fadeIn": 0, "fadeOut": 0, "curve": 0,
  "warp": { "on": false, "mode": "beats", "bpm": 120, "source": "shared", "semi": 0 },
  "automation": []
}
{ // MIDI: notes are [start, length, pitch, velocity], ticks from the clip's start
  "id": "c2", "type": "midi", "anchor": "beats", "at": 0, "len": 3840,
  "notes": [[0, 240, 36, 100], [480, 240, 38, 90]],
  "automation": []
}
```

`automation` is attached to the clip, so it follows a copy: `[{ "param": "inserts.0.mix", "points": [[0, 0.5], [960, 1]] }]`.

### Insert

`{ "type": "glue", "v": 1, "on": true, "params": { "ratio": 4 } }`. One per effect in a chain. `v` is that effect's
own version, so a new compressor can coexist with the old one a project was mixed on.

### TakeRef

```jsonc
{
  "id": "…", "hash": "sha256 of the samples", "name": "rec-20261030-123000", "kind": "rec",
  "sr": 48000, "ch": 1, "bits": 16, "frames": 144000,
  "created": 1793500000000, "tags": [], "markers": []
}
```

### Patch

```jsonc
{
  "id": "…", "name": "", "tags": [], "schema": 1,
  "setup": 0, "mute": false, "layers": true,
  "genes": { "wave": 0.1, "base": 0.5 /* … by name */ },
  "ph":    { "wave": [1, 3, 0.2, 4.1] /* mutation phases by name: k1, k2, p1, p2 */ },
  "parked": [ { "x": 120, "y": 300, "color": [1, 0, 0], "on": false, "genes": {}, "path": [] } ],
  "mods": [], "macros": []
}
```

### Rack

```jsonc
{
  "id": "…", "name": "", "sends": [],
  "pads": [ {
    "note": 36, "source": { "take": "<id>" },   // or { "patch": "<id>" }
    "off": 0, "span": 0, "pitch": 0, "gain": 0, "pan": 0,
    "mode": "oneshot", "poly": false, "choke": 0, "inserts": [], "sends": []
  } ]
}
```

A pad's note is `36 + 16 × bank + pad`. A rendered cache is never saved: it can be rebuilt from the patch.

## On the device

| Store | Holds |
|---|---|
| IndexedDB `projects` | One row per project for the list: id, name, modified, rev |
| IndexedDB `docs` | Two slots per project, written in turn |
| IndexedDB `undo` | The undo history of a project |
| IndexedDB `meta`, `pcm` | The take library, shared by every project on the device |
| `localStorage` `audio.project` | Which project is open |

**Two slots.** Each save overwrites the older slot, with the document's length and a checksum. Opening takes the newest
slot that checks out, so a damaged write costs one save, never the project. The page can be killed at any moment with no
warning, so saving is continuous and every save stands alone.

**Undo** is stored as small differences, not whole copies. The history survives closing the app and has a size limit, so
it can't fill the phone. It doesn't travel in the save file.

**The take library is shared.** One recording can appear in many projects, and it's stored once. A take used by a project
can't be silently lost: the save file carries its own copy.

## Upgrades

`Project.upgrade()` runs each step from a document's version to the current one, in order, on a copy. Old steps are never
removed, so a file from version 1 opens forever. A new optional field doesn't need a new version. Changing the meaning of
an existing field does.

The first open after this format arrives builds one project from the existing session, tool settings and synth garden.
The old keys are left alone until every tool has moved over.
