# MOSHINE — the "1080p long-export hang" (2026-10-25)

**Verdict: the app never hung. The headless rig did.** The FAMU film scripts (`~/Desktop/aiblender/tools/moshine_pass.js`)
returned each finished export as one base64 string through `Runtime.evaluate`. Past ~100 MB the DevTools socket
stalls for good. A 1920×1080 mosh is ~0.2–0.5 MB a frame at quality high, so 1000 frames always stalled, and Bass pump
(noisier, larger frames) stalled from ~250. Chrome's `btoa` also returns an empty string silently above ~490 MB.

Measured in headless Chrome (Metal), exporting to OPFS through `__app.runExport({ where: 'opfs' })`:

| clip | look | frames | export | file |
|---|---|---|---|---|
| synthetic 1080p25, noisy | Bass pump | 250 | 5.1 s | 119 MB |
| synthetic 1080p25, noisy | Bass pump | 1000 | 12.4 s | 488 MB |
| film v5b frames 1000–2000, CRF 16 | 06 Motion Hijack + 27 hit markers | 1000 | 11.0 s | 222 MB |
| same, returned as base64 (the old rig) | | | finished at 13 s | then stalled until killed |

Heap stayed at 100–250 MB throughout.

**Fix:** `tools/bench.mjs --out <file>`. The driver returns `{ opfs: out.target.name }` and the bench pulls
`moshine-exports/<name>` in 8 MB pieces, then deletes it from OPFS. The same 1000-frame run lands on disk in 28 s.
The 125-frame segments and lead-ins in `moshine_long.sh` can go, along with the clean flash at every cut.

In the app (save picker on Chrome/Edge, OPFS + DOWNLOAD elsewhere) nothing changes: it streams to disk.
