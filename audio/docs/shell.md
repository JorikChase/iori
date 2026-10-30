# Shell — the home screen, the hub and the switch between tools

Audit of `audio/index.html` as coded, 2026-10-30. The readable version for friends is `audio/docs.html`.
The shell runs in one page and each tool runs inside it in an iframe. It does not load `shared.js`.

## Gestures

| Where | Gesture | Result | Code |
|---|---|---|---|
| Home, satellite dot | tap (down within 24 px, up within 30 px of it) | opens that tool; it starts loading at touch-down | `index.html` `HIT` pointerdown, `up()` |
| Home, orb | press within 1.2 × radius, drag out | orb melts to the finger, icons bloom; past 0.75 × radius the nearest of 8 tools is picked, release opens it, release near the orb cancels | `HIT` pointermove |
| Home, orb | rest 70 ms on a picked tool | that tool preloads | `frame()` |
| Home, top-right | site menu | the 3die burger; hidden inside a tool | `body.in-tool` |
| Home, bottom-right | docs icon | opens the docs over the home screen | `#docs` |
| Docs page | close, top-right | back where you were | `ATS.docsClose` |
| Tool, hub (bottom-left, within 52 px of (44, H−44)) | tap | home; the tool unloads and its audio stops | `up()` → `leave()` |
| Tool, hub | hold 220 ms or move 8 px, then drag | dial of 3 buds. The first move past 56 px sets the axis: more than 45° up = upward steps back, otherwise sideways steps forward. Step 40–70 px, fitted to the shorter screen side, up to 7 steps. Back within 56 px clears the axis. Release on another tool switches | `HIT` pointermove |

The hit layer covers the whole screen at home and only a 104 × 104 px corner inside a tool, so the rest of the screen
belongs to the tool.

## Reads and writes

- Exposes `window.ATS` to the tools: `go`, `preload`, `ready`, `persist`, `persisted`, `standalone`, `maybeReload`, `docsClose`.
- Holds two frames, the current tool and the next. A tool that registered `AT.onLeave` keeps its frame until its
  `AT.leaving()` promise settles (20 s at most), so a take in progress is saved before the frame goes.
- Pauses the outgoing tool's drawing during a tool-to-tool sweep (`AT.pauseDraw`). Audio keeps running.
- Stores nothing itself. `persist()` asks for persistent storage when installed.
- Registers `sw.js`. A new version reloads the page at once on home, and otherwise the next time home is reached,
  never inside a tool.

## Docs and hints

- `AT.docs(tool)` opens `docs.html#tool` over a tool, in that tool's document. The tool keeps running and its drawing
  pauses. The home icon opens the same page in the shell. Neither is a transition.
- `AT.hint` and `AT.did` live in `shared.js`. State is the map in localStorage `audio.hints`, written when a hint first
  shows or its gesture is done, never cleared except by the button on the docs page. The layer takes no touches, and
  nothing runs until a hint is called. The tools' own docs list each trigger.

## URL switches

`?perf` frame-time overlay, passed on to the tools. `?td=<seconds>` sweep length, 0.05–5.

## Limits

- Leaving a tool stops it. Nothing runs in the background across tools yet (Stage 5).
- If a tool never signals ready, the sweep starts anyway, 600 ms after its `load` event or 1.2 s after the switch.
- Orientation is locked to portrait by the manifest once installed.

## Differs from the spec

- The spec's colour flood with a wobbling edge is now a full-screen e-ink sweep with five dither steps and no colour
  band, 0.8 s (owner's choice, MATRIX S5).
- The spec's hub dial turns as you drag away from the corner. As coded, sideways steps forward and upward steps back.
- The spec's plasma-disc orb variant is not built (MATRIX S15).
- Each tool asks for the microphone itself (MATRIX S13). The plan moves this to one owner in the shell in Stage 5.

## Test status

From `audio/MATRIX.md`. Pass: S4, S5, S6, S8, S9, S10, S11, S16, S18, S19 (harness), S20. Todo: S1, S2, S3, S7, S17
(device), S12, S13, S14 (device). Not built: S15. Docs icon and overlay: `audio-docs` scenario.
