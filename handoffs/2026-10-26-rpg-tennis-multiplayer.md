# RPG Tennis multiplayer handoff (3die.fr/game_multiplayer.html, 2026-10-26)

Start here in a new conversation about the multiplayer tennis game. It is one of the front-door links of the
star-shaped 3die.fr/start.html (art + games direction), which is why it was rebuilt.

## State

- **Live** on 3die.fr since 2026-10-26, commit `cfc6a4c`. That commit changes only
  `game_multiplayer.html`; it was built on GitHub's `main` and deployed with `server_setup.sh`. The live page
  loads with no console errors.
- **Local `main` is not in sync** (see Next, item 1): it still holds three unpushed fractal-engine commits
  and is one commit behind `origin/main`.
- The single-player `game.html` is **unchanged**: it is still the old code (see Next).

## What iori asked for and decided

The request: tidy and speed up the game, improve the gameplay, improve the racket, and add basic UX and
optimisation features. iori answered the scoping questions with:

- **Gameplay:** no tennis match. Keep the free-for-all world, but a ball you hit that lands on another player
  **splats paint**: on their body for everyone and over their own screen (it blocks their view for a few
  seconds). **Voice chat** is opt-in.
- **Room:** keep **one global room** for everyone, with host takeover.
- **Racket:** stylised low-poly.
- **Hit model:** a timed swing.
- **Later feedback:** where the browser blocks pointer lock, look by **hovering** (no dragging). Moving the
  cursor turns the view; holding it at an edge keeps turning.

## How it is built

Everything is in `game_multiplayer.html`: one module script. Line anchors are as of `cfc6a4c`.

| Section | Line | Notes |
|---|---|---|
| Renderer | ~547 | One `RenderPixelatedPass`, no separate `renderer.render`. Pixel ratio 1, 4 CSS px blocks, canvas `image-rendering: pixelated`. `shadowMap.autoUpdate = false` + `needsUpdate` once per frame (the pass renders twice: beauty + normals). PCF shadows. |
| Quality | ~589 | 3 levels (pixel 6/5/4, shadow 0/512/1024); phones start at 1. The governor steps down above 24 ms average, steps up after 10 s under 18 ms, and stops retrying a level that failed twice. Selectable in pause. |
| Physics | ~659 | Original capsule + octree physics, 5 substeps. 60 balls in one `InstancedMesh`; sleeping balls skip the octree; Magnus force from spin `w`. |
| Splats (host) | `maybeSplat` ~884 | Owner = slot of the last hitter; splats once (owner cleared); `SPLAT_SPEED` 8; original knockback (`speed*0.45+5`). |
| Racket | ~917 | Tube frame with open throat, octagonal taped grip, string bed as one alpha-tested disc: 3 draw calls. `POSES` ~1037 are camera-space key poses; backhand is mirrored. `viewRig` moves the racket in on narrow screens. |
| Swing | `ARC` ~1109, `hitBall` ~1166 | Strings sweep an arc ±1.25 rad at 0.95 m from the eye. A ball in the band (r ±0.55, y −0.72…+0.4) is hit when the arc crosses its angle. u = 0.5 dead ahead = PERFECT; swing side = "late" (pushes wide); across = "early" (pulls across). Spin comes from mouse-up/down (or a slide on the touch button) during the swing. Clients predict their own hits, then send `hit`. |
| Avatars | ~1273 | Capsule body + head + visor, racket on a shoulder pivot; DOM name labels. Decals (`DecalGeometry`) are capped at 8 per avatar and expire after 25 s. |
| Screen splats | ~1451 | A 1/4-resolution canvas; each splat is drawn opaque on a scratch canvas, then faded as one layer. Seeded generator, no per-frame allocations. |
| Sound | ~1630 | Hit, whoosh and splat are synthesized with WebAudio. `tennis_sound.mp3` (6.4 MB, 5 min) is optional looping music, `preload="none"`, starts only after Play. |
| Network | ~1728 | Public PeerJS broker; `HOST_ID = krutart-tennis-global-host-v2` (+ `-<room>` from `?room=`). Every player has a random personal id (roster identity, voice calls, survives takeover). Channels: `ev` = reliable JSON events, `st` = unreliable raw Float32 snapshots at 30 Hz (moving balls + 4 resting per tick). Clients simulate balls locally and ease out corrections. |
| Takeover | `scheduleTakeover` ~1997 | Ranked by sorted ids. The join timeout is 8 s: a broker-held id that nobody answers raises no error. A host whose tab is hidden 2.5 s with others present sends `bye` and rejoins as a client. Losing the broker does not end open games. |
| Voice | ~2237 | Opt-in; players with voice on call each other directly (the lower id calls). `<audio>` elements with distance volume (kept off WebAudio so echo cancellation works). |
| Input | ~2463 | Pointer lock first. On `pointerlockerror` before any lock succeeded → hover-look (`useHoverLook`, `edgeTurn`: outer 12 % turns up to 2.4 rad/s). Touch: floating stick in the left 38 %, look elsewhere, each finger on its own pointer id; swing/toss/jump buttons. |
| Loop | `animate` ~2722 | Checks the window size every frame (this fixed the black screen when the page loaded hidden). |

Measured at 1024×768, DPR 2, with 60 balls moving: CPU+GPU **1.8 ms median / 6 ms p95** per frame, against
17–22 / 49–118 before, and **13 draw calls** against 73. three.js is pinned to 0.170.0 (jsdelivr); the old
page loaded an unpinned build from threejs.org.

## Testing (two clients locally)

- `bash tools/tennis-mp/make-dev.sh <dir outside ~/Desktop>`, then serve it with
  `python3 tools/tennis-mp/serve.py <dir> 8800` (a `.claude/launch.json` entry works; the sandbox stops the
  preview from reading ~/Desktop directly).
- Open `http://localhost:8800/dev.html` in two Browser pane tabs.
  - `dev.html` defaults to `?room=dev`, so it **never touches the live room**. Opening the real page locally
    *does* join the live room.
  - It exposes `window.__T` hooks: `spawnBall`, `startSwing`, `hitBall`, `onSplat`, `addScreenSplat`, `net`,
    `players`, `remotes`, `camera`, `playerCollider`, `POSES`/`buildPoses` for live pose tuning, and others.
- The pane is usually hidden and throttled (rAF at about 1–2 fps): `await import('/shim.js')` drives the loop
  through a MessageChannel at 60 fps.
- Hidden tabs **hand off hosting after 2.5 s**, so expect takeovers while testing; they are working as
  designed.
- `resize_window` gives a real size to a hidden pane (otherwise 0×0); the mobile preset emulates touch.
- Synthetic `PointerEvent`s with `pointerType: 'touch'` test the stick, look and swing slide.
- The pane refuses pointer lock, so it always runs the hover-look fallback.

## Next

1. **Sync local `main`** before anyone pushes the fractal-engine commits: `git pull --rebase --autostash`.
   The working tree's `game_multiplayer.html` matches `origin/main`, so the autostash reapplies to nothing.
2. **Not verified yet:**
   - Voice chat with real mics on two devices.
   - Real phones: iOS Safari pointer events, audio unlock, WebRTC.
   - Real networks: the public PeerJS broker has no TURN server, so players behind strict NAT may not
     connect.
   - Hidden-host handoff in a normal browser.
3. **Worth considering, ask iori first:**
   - Self-host a PeerJS server and a TURN server on the VPS so the game does not depend on 0.peerjs.com.
   - Port the render fixes to single-player `game.html`: it still renders twice, loads an unpinned three, and
     never resizes the composer (black screen on rotate or a hidden load).
   - Tuning after real play: knockback strength (it is the original's, strong), splat life (7 s), edge-turn
     speed, the swing band.
   - The `pages.meta.json` description still says "real-time 3D browser matches". The site track owns that
     file; a splat/voice wording could go in through it.

## Traps

- Never hand-edit inside `SEO:` or `MENU:` markers; `python3 site.py check` passes as of `cfc6a4c`.
- If `HOST_ID` changes, old cached tabs keep using the old id: bump the `-vN` suffix whenever the protocol
  changes, so old and new pages never mix.
- In the pane, screenshots can show a stale frame: trust `javascript_tool` state over a single screenshot.
