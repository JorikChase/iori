# tools/release — getting releases through distribution

Tooling for the 3DIE / IORI release pipeline. The distributor is SoundCloud for
Artists (Artist Pro). Its review rejects whole releases with generic notes and
never says which track or which sample matched; this folder is where we answer
those questions ourselves before submitting.

## acr_scan.py — "which recording does my track match?"

Runs each track through ACRCloud, the same kind of fingerprinting the
distributors use, and names every recording it matches with the position in the
track, the label, the ISRC and a confidence score. A foreign match on a track
that uses a loop almost always means another artist released a song with the
same loop: declare the sample on that track in the SoundCloud form and attach
the loop's licence.

### One-time setup (you, in a browser — I can't create accounts)

1. Go to <https://console.acrcloud.com/signup> and create an account. The
   14-day trial covers these scans.
2. In the console: **Projects ▸ Audio & Video Recognition ▸ Create project**.
   - name: anything (e.g. `iori-release-scan`)
   - region: **eu-west-1**
   - audio source: **Line-in Audio** (we send clean files, not microphone recordings)
   - buckets: tick **ACRCloud Music**
3. Open the project and copy its **Host**, **Access Key** and **Access Secret**.
4. Create `tools/release/.acr.env` (gitignored) with:

       ACR_HOST=identify-eu-west-1.acrcloud.com
       ACR_ACCESS_KEY=paste
       ACR_ACCESS_SECRET=paste

5. Optional, for the deeper **File Scanning** engine (catches pitch- and
   tempo-shifted loops): **File Scanning ▸ Create container** (region eu-west-1,
   engine Fingerprinting, bucket ACRCloud Music), then **Developer ▸ Console API
   ▸ Create token**, and add to `.acr.env`:

       ACR_CONSOLE_TOKEN=paste
       ACR_CONTAINER_ID=paste

### Running

    # dry run: slices the tracks, counts requests, sends nothing
    python3 tools/release/acr_scan.py identify @tools/release/sets/darkwood.txt --name darkwood --dry-run

    # the real scan (≈ 1 request per 10 s of audio; darkwood ≈ 220 requests)
    python3 tools/release/acr_scan.py identify @tools/release/sets/darkwood.txt --name darkwood

    # File Scanning engine
    python3 tools/release/acr_scan.py fs upload @tools/release/sets/darkwood.txt --name darkwood
    python3 tools/release/acr_scan.py fs results --name darkwood

Reports: `tools/release/reports/<name>-<engine>-<date>.md` (+ `.json`). Tracks
with a foreign match are marked ⚠. Matches against IORI's own catalogue are
listed separately: a track already live on Spotify will match itself.

## SoundCloud review rules we keep hitting (Oct 2026)

- **Samples.** Every track's *Edit* dialog has "This track contains …" with a
  line for royalty-free loops (Splice etc.) and a **License documentation**
  upload (PDF/JPG/PNG/Word). Declare on each sample track and attach the
  licence there; that is what "send through the valid license" means.
- **Artwork text** must be only the artist, title or label, and must match the
  release fields exactly. A tagline, lyric or motto on the cover is a rejection.
  No cut-off text, no uneven borders. 3000×3000 minimum.
- **Songwriter names** must be full legal names, first and last, spelled right.
- **Social Platforms / digital fingerprinting** toggle (Platforms step) must stay
  off for anything with non-exclusive samples. It was already off.
