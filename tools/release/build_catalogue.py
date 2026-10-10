#!/usr/bin/env python3
"""Build catalogue.csv: every SoundCloud upload with its album, distribution state,
duplicates, artwork size and the blockers the distribution form will hit.

Inputs (snapshots read from SoundCloud for Artists on 2026-10-06):
  data/sc_tracks_*.json        title, permalink, public, fileType, seconds, distStatus,
                               releaseCount, isrc, songwriterSet, rejection, genre
  data/sc_artwork_dims_*.json  per-permalink artwork pixel size
Album membership, duplicates and flags are curated below; edit them, rerun.
"""
import csv, json, re
from pathlib import Path

HERE = Path(__file__).resolve().parent
tracks = json.load(open(sorted((HERE / "data").glob("sc_tracks_*.json"))[-1]))
art = json.load(open(sorted((HERE / "data").glob("sc_artwork_dims_*.json"))[-1]))

ALBUMS = {  # SoundCloud album → permalinks in album order
    "atlas (2026-09-26)": "yaspis-8 radio1-6 seemee_instrumental-3 cloud_4tl4s_instrumental-4 vertex_painter_instrumental-5 piskaci-tycky-7 ens0-1 fhgj dead_fred zig dino sparkles motyli-stromy i-can-hear-them-too nedelni_obed xory waves ding-dong srandickiki-2 aaaaaaa digitalni-koreny in-heaven a-walk-in-the-woods iluzorni-stena blu aishteru",
    "0b1ivi0n (2026-09-15)": "adhdej sleeping_4ngel i-can-hear-them schizoid-man-w-tapwaterkeelan-2 klekanice-5g-3 yama-yama bdsm-cut-w-roy-5g-5 oblivion-6",
    "herbální pohoří (2026-09-15)": "nembutsu bz33-1 facedrift-2",
    "î iori ï (2025-12-04)": "always-sunny-in-samorost-land 6-snem-elii-2024-6 3-wholesome-no-sound-no-life-best-friend-jippy-3 4-freestyle-siren-4 5-ocult-lemegeton-5 snem-rashid-polarboi-franklin malomestacky-buh-trypslyx-dopelphin shellshock-threestyle asylum-bohnikte-stolen-from-dopelphin-10 11-threestyle-sch1z0-w0nd3rl4nd-crowmarnotratnost-11 12-freestyle-unreal-12 13-diary-so_much_soul-2022-13 endless-monochromatic-saint-anxt 14b-jedenkrat-lasku-15 xor-xor raining-blood-superorganism clinically-deaf 16b-mirror-mirror-18 17-rusty_fingers-19 18-diary-again-2023-20 20-pred-snemem-chrampejsti-2024-22 boom-dake playdough-cookie-jippy 23-where-is-your-mind-nvdes-27 27-unsure-123-2024-dj-marnotratnost-31 24-co-2024-saint-anxt-28 25-iaiai-houseki-no-kuni-29 brouk-ethereal 26-diary-zyxlexia-2023-30 21-zapometlivy-25 planar-crowned-crow 31-freestyle-beats_to_think_to-35 mitina-ili-33 remix-in-u-prod-kinh-ky 33-hiddencensored-freestyle-morena-37 32-demo-take-3-2023-36 34-liluziny-38 35-outro-pueblo-crow-archduke-bambus-bjoern-39 19-ocult-lake-21",
    "in_tongues (2025-09-12)": "ghidra kleptocrat-partaj blood-oath robuck-mogul 15e0a694-0605-48bd-bda1-8ad2e2738063 ocult-6 malomestsky-buh-3 playdough-cookie-2 where-is-your-mind-4 lakeii",
    "oculi solis (2025-03-16)": "psychopatologie ocult",
    "Darkwood (2025-01-15)": "intro-to-tro freestyle czechia-velicenstvo reveres groovy-1 orchids-and-forget-me-do-u shellshock glow shizohop solaris darkwood",
}
ALBUM_ART = {"î iori ï (2025-12-04)": "iori-album", "in_tongues (2025-09-12)": "in_tongues-album", "Darkwood (2025-01-15)": "darkwood-album"}

# Stuck in a release marked "Edits Needed" (rejection notes read 2026-10-06)
STUCK = {
    "aesop-fabled": "single 'aesop fabled': content-recognition match; declared CC/public domain, no licence attached; composer typo 'Joeik Chas'",
    "4mn3s14c": "single '4mn3s14c': artwork cut-off text/uneven border; composer not a full legal name",
    "shellshock-threestyle": "single 'shellshock threestyle': composer not a full legal name",
}
for p in "intro-to-tro freestyle czechia-velicenstvo reveres groovy-1 orchids-and-forget-me-do-u shellshock glow shizohop solaris".split():
    STUCK[p] = "album 'darkwood': artwork tagline text; content-recognition match, no samples declared"

# Same recording uploaded more than once → canonical permalink (never give one recording two ISRCs)
DUP = {
    "rusty_fingers": "17-rusty_fingers-19", "playdough-cookie": "playdough-cookie-jippy",
    "playdough-cookie-2": "playdough-cookie-jippy", "where-is-your-mind-4": "where-is-your-mind",
    "23-where-is-your-mind-nvdes-27": "where-is-your-mind", "lakeii": "lake", "19-ocult-lake-21": "lake",
    "ocult-6": "ocult", "eli": "6-snem-elii-2024-6", "elii-1": "6-snem-elii-2024-6",
    "lemegeton": "4f1610e6-3967-456f-95e9-ad69cb0dea29", "5-ocult-lemegeton-5": "4f1610e6-3967-456f-95e9-ad69cb0dea29",
    "xor-xor": "xor", "16b-mirror-mirror-18": "mirror-mirror", "34-liluziny-38": "liluziny",
    "i-can-hear-them-too": "i-can-hear-them", "malomestsky-buh-3": "malomestacky-buh-trypslyx-dopelphin",
    "endless-monochromatic-ili-st-anxt": "endless-monochromatic-saint-anxt",
    "asylum-bohnikte-stolen-from-dopelphin-10": "bohnice", "32-demo-take-3-2023-36": "take-3",
    "era-walk-1": "15e0a694-0605-48bd-bda1-8ad2e2738063", "orchids": "orchids-and-forget-me-do-u",
}
BORROWED = {  # title/credits say the beat, song or writing is someone else's → licence or skip
    "raining-blood-superorganism": "title references another song", "schizoid-man-w-tapwaterkeelan-2": "title references another song",
    "malomestacky-buh-trypslyx-dopelphin": "'stolen beat' in title", "malomestsky-buh-3": "'stolen beat' version",
    "asylum-bohnikte-stolen-from-dopelphin-10": "'stolen from dopelphin'", "bohnice": "same as bohnikte",
    "remix-in-u-prod-kinh-ky": "remix, beat by kinh ky", "dont-you-blink-1": "songwriter set to 'B. Young'",
    "where-is-your-mind": "title references another song (already live)",
}
ART_TEXT = {  # artwork content the reviewer will reject (visual check 2026-10-06)
    "whte_dust-4": "'3:33' text on cover", "4mn3s14c": "repeated 'AMN3S14C' text, cut off",
    "im-a-killer": "cartoon-mouse character (copyrighted-character risk)", "xor": "screenshot of chat UI text",
    "mirror-mirror": "screenshot of an error dialog", "iori-album": "handwritten tagline", "darkwood-album": "handwritten tagline",
}

album_of = {p: a for a, ps in ALBUMS.items() for p in ps.split()}
rows = []
for title, perm, pub, ftype, secs, dist, nrel, isrc, writer, rej, genre in tracks:
    alb = album_of.get(perm, "")
    live = bool(isrc) and dist == "PENDING"
    state = "live" if live else ("stuck" if perm in STUCK else "not distributed")
    a = art.get(perm) or art.get(ALBUM_ART.get(alb, ""), {})
    blockers = []
    if perm in DUP: blockers.append(f"duplicate of {DUP[perm]}")
    art_checked = perm not in STUCK or "artwork" in STUCK[perm]   # stuck releases carry their own uploaded artwork
    if not live:
        if ftype in ("aac", "mp3", None): blockers.append(f"lossy upload ({ftype}): WAV likely required (verify)")
        if not pub: blockers.append("private on SoundCloud")
        if secs and secs < 30: blockers.append("shorter than 30 s")
        if art_checked and a and not a.get("ok"): blockers.append(f"artwork {a.get('w')}px")
        if art_checked and not a: blockers.append("no artwork")
        if art_checked and perm in ART_TEXT: blockers.append("artwork: " + ART_TEXT[perm])
        if art_checked and alb and ALBUM_ART.get(alb) in ART_TEXT: blockers.append("album artwork: " + ART_TEXT[ALBUM_ART[alb]])
        if perm in BORROWED: blockers.append("borrowed material: " + BORROWED[perm])
        if re.search(r"[\[\]|<>]|^\d+\w?\s|\b20\d\d\b|_", title): blockers.append("needs a clean store title")
        if not re.search(r"[A-Za-z0-9]", title): blockers.append("title has no letters")
    if perm in STUCK: blockers.append("rejection: " + STUCK[perm])
    rows.append({"title": title, "permalink": perm, "kind": "album track" if alb else "single",
                 "album": alb, "state": state, "isrc": isrc, "public": pub, "file": ftype, "seconds": secs,
                 "art_px": a.get("w", ""), "blockers": "; ".join(blockers)})

with open(HERE / "catalogue.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
from collections import Counter
print(Counter((r["kind"], r["state"]) for r in rows))
print("not distributed, no blockers except art size:",
      sum(1 for r in rows if r["state"] == "not distributed" and all(b.startswith("artwork ") for b in r["blockers"].split("; ") if b)))
