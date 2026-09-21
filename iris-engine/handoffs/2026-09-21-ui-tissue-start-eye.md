# Handoff — the 3.11 shell by default, the Tissue window, the start eye (2026-09-21, engine 0.9.4-edge, v91-edge)

For whoever takes the iris engine next. Read this, then `study/10-feature-ledger.md` (every feature, its home in the
shell, its test, and §11 — the start-eye plan with the measurements), then the previous handoff
`2026-09-21-relief-and-edge.md` for the renderer line (relief, probe, inner edge, G0). The engine itself did not move
in this stretch: the isolated integrity bench is **61.6 / 68.3 / 70.5 / 66.4** at every commit below.

## 1. Where the project stands, in one paragraph

iori set the rules for this stretch: **one session only** (no parallel UI / renderer sessions), **flip to the Windows
3.11 shell**, **start with a feature ledger**, and — because iori "will only notice something missing if it looks bad
when testing" — the ledger and a reachability test are the only safety net for feature parity. That is done: the 3.11
shell is the default on iori.me, every control is ledgered and reachable, the layer model has a window of its own
(load, inspect, probe, dials), the four Commons photographs and eye 26's layer model are published with their credits,
and visitors now meet **eye 26** instead of the seed-42 brown. The open question is speed: the layer model takes
**11.9 s on iori's iPad** (4.1 s on the dev machine), 60 % of it two measurements that give the same answer every visit.

## 2. What exists that did not

| piece | where | what it is |
|---|---|---|
| feature ledger | `study/10-feature-ledger.md` | every feature × engine API × 3.11 home × test; §10 the parity work (P0–P6, FLIP, all done); §11 the start eye |
| reachability test | `tools/ui-contract/controls.json`, `__uiContract.reach()` | every control has a home (`window <key>` / `menu` / `lazy` / `internal — why`); reach() opens each window, asks the shell which ids its menus reach, and fails any unledgered control. Found CORNEA REFL unreachable in both shells on its first run |
| 3.11 shell as default | `ui.js` (Win98 frozen, `?ui=98`), `ui31.js`, `ui.css` | plus: debug views by name (View ▸ Debug view), keyboard (Alt / F10 menus, F6, arrows on a focused slider), hourglass, casebook in 3.11 chrome, self-hosted Urbanist (`fonts/`, OFL) |
| slider origin = the fit | `scrubber()` in ui31.js | notch, fill and double-click sit at the last value the ENGINE wrote (preset, ID, seed, fit), not the page default (§32 K1) |
| sliders, fixed gain + slow-down | same | the whole range is always 200 px of drag; pulling away from the ruler slows to ½ · ¼ · ⅛ (desktop and touch); with touch sizing a slider is two lines, the ruler across the whole row (42 → 192 px) |
| pinch | ui31.js pinch block | two fingers on the eye move the camera distance; the page no longer zooms (touch-action, Safari gesture events, ctrl + wheel) |
| layer-model liveness | `tools/brush_probe.js`, `study/p6-liveness.md`, `TISSUE_LIVE` in ui31.js | which knobs and brushes still act under the layer model; the windows grey the dead ones and mark the weak ones while it is on |
| Tissue window | `tissue-ui.js` (mock: `study/tissue-window-mock.html`) | load eye 26 (staged progress), on / off, Inspect: Point · Section · Contours on the live iris; Probe (tap to place, drag to look); Dials behind their page. Another eye switches the model off; every fit / bench entry point too |
| engine API for it | `tissue.js` | `IrisTissue.atUV`, `sectionUV`, `proof({ onStage, json })` — JS only, no shader |
| published data | `ref/{09,25,26,35}-*-isolated.jpg` (un-ignored), `data/tissue-26.json` | `study/` is never deployed, so the layer model lives in `data/` |
| photo credits | ui31.js, from `ref/refs.json` | Help ▸ Photo credits; one quiet line on the scene only while the eye comes from a photograph |
| start eye | `start-eye.js` (≈ 5 KB) + `X.startEye()` in tissue-ui.js | eye 26's colours / collarette / pose applied before the first frame; the layer model loads quietly and takes over, keeping the visitor's camera |
| load timing | Help ▸ Load timing | every layer-model load records steps and bytes, with the device's GPU / float support / screen — for measuring on real devices |
| deploy cache rule | `server_setup.sh` `@appcode` | folder apps' pages / js / css / json / fonts get `no-cache`, so a deploy shows up without a manual refresh |

## 3. Run it, test it, deploy it

```bash
python3 iris-engine/serve.py 8768            # or the launch config "iris-engine"; http://localhost:8768/iris-engine/
```
**Tests and benches open the page with `?start=off`** — otherwise the start eye loads the layer model in the
background and the page is not the baseline's. The gates, in the page:
```js
await import('/iris-engine/tools/ui-contract/contract.js');
await __uiContract.reach();                        // [] — every control reachable (3.11 shell)
__uiContract.start({ iters: 20 }); /* wait for stage 'done' */ await __uiContract.compare();   // [] — baseline recorded under 3.11
await __irisEngine.fit.benchIsolated({ iters: 120, save: false });   // 61.6 / 68.3 / 70.5 / 66.4 at NORMAL
```
Deploy (iori pushes, or asks me to push): always run the script from `origin/main`, never the server's own copy —
```bash
ssh iori-vps 'cd /root/iori && git -c http.version=HTTP/1.1 fetch -q origin && git show origin/main:server_setup.sh > /tmp/server_setup.sh && bash /tmp/server_setup.sh'
curl -sI https://iori.me/iris-engine/ | grep -i cache-control      # → no-cache
```

## 4. What this stretch learned, and what it cost to learn

- **A contract that checks ids exist is not a parity test.** CORNEA REFL (`spec-btn`) was added into `#ui-panel`,
  which both shells hide; the id test passed for a day. `reach()` checks that a hand can get there.
- **A hidden Browser pane stops rAF entirely** (1 frame in 5 s) **and does not advance CSS transitions.** Any UI state
  machine on rAF alone looks dead in tests — ui31, overlay.js and tissue-ui.js also step on a 250 ms timer. And
  `getBoundingClientRect` of `#gl` reports its start transform (the phone shift has a .25 s transition): set
  `transition: none` before hit-testing a phone layout in the pane.
- **Test contracts must not depend on timing.** Two flaky diffs were real bugs: the fitter's `ringR` setter wrote
  `state` but not `target` (the render loop then pulled the fitted value back after a fit — an exported ID differed
  from the scored one), and the overlay computed its home view as `(pose + 0.5) − 0.5`, not bit-exact. Both fixed;
  the baseline was re-recorded under 3.11.
- **A re-load of the layer model must be a FULL load** (case import + primitives). Re-loading on the current state
  calibrated on whatever the eye had drifted to: the same dials gave MATCH2 85.2 against the load's 84.6.
- **Loading a photo is not choosing one.** The casebook's thumbnails and the Tissue load both load photos through the
  fitter; the overlay adopted them and took over the workspace. `__irisOverlay.quietly(fn)` and the casebook guard.
  The casebook also left the last case loaded — it now puts back the eye you had.
- **Never run `/root/iori/server_setup.sh` when the pushed commits change it**: git swaps the file under bash and the
  old copy runs (it silently restored the old Caddyfile once).
- **The legacy presets are not "the best fits"**: MATCH2 65–70 with the lavender cast (Δab ≈ 12). The best eye is eye
  26's layer model (MATCH2 84.6), and it is the only layer-model eye.

## 5. Where to pick it up

| # | next | first step |
|---|---|---|
| **S0** | the phone's Help ▸ Load timing screenshot (iPad done: 11.9 s at CAPTURE) | ask iori |
| **S3** (recommended before S2) | ship the two measurements with the eye — `calibrate()` (1.7 s on iPad) and `measureDelight()` (5.4 s) never read the photo's pixels, they render flat-grey frames; drop the photo download and the 5 MB `ref/cases.json` (one small case file for eye 26) | save `T.irr` / the de-light grid after a load, load them instead of measuring; pixel-diff the result against a measured load |
| open decision | should the start eye always load at NORMAL, whatever quality the device has stored (the iPad had CAPTURE: 4× the pixels) | ask iori |
| S2 | the growing eye (holes → fibres → veins → guides → ruff → shading), only if S3 does not make the load feel instant | after S3's numbers |
| S4 / S5 | compact primitives (T5); 09, 25, 35 through the layer model (T7) | study/10 §11 |
| G1 → G4 → G2 → G3 | guide brush, journal serialisation, crypt / furrow / spot brushes, the generator | previous handoff §5 |

**Still open, named honestly.** The phone has not been measured. The pinch fix was verified with synthetic touch
events, not on the iPad. Tube heights from `tubesAt` are measured from the floor up (use `renderedTopUm` /
`renderedZUm` for absolute depth). The Win98 shell is frozen and misses everything built here (it is a fallback for one
version). `fit.js`'s first-load GL INVALID_VALUE (1281) predates all of this.

## 6. Commits of the stretch

`d221ffb` ledger + reach · `b7de06b` slider origin, font, fit canvas · `2e04580` debug views · `dc2165f` liveness ·
`96076cb` keyboard, hourglass, casebook · `dea0af6` **FLIP** · `c4af6d7` deploy cache rule · `11ad735` Tissue mock ·
`ebcda99` **Tissue window** · `515b69e` photos, model, credits · `8c281d3` start-eye plan · `5c5a8fc` **start eye + load
timing** · `e66dd38` sliders · `9c1a8e0` pinch · `003eb22` iPad timings. All pushed and deployed to iori.me.
