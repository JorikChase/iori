#!/usr/bin/env bash
# Regenerates blackjach's runtime raster assets (assets/*.webp) from the
# full-size PNG masters in assets-reference/masters/.
#
# Why: the masters are 1000-1400px PNGs (1-1.3 MB each) but render at
# 56-352 CSS px. Shipping them as-is made the first load ~5 MB. Each
# runtime asset is cut to the size it is actually drawn at, in 1x/2x
# (and 3x for the card faces) variants picked by image-set()/srcset.
#
# Reskin workflow: overwrite the master, run this script, commit both.
# Needs cwebp (brew install webp). Run from anywhere.
set -euo pipefail
cd "$(dirname "$0")/.."
M=assets-reference/masters
O=assets
Q=82

enc() { # enc <master> <out> [cwebp args...]
  local src="$M/$1" out="$O/$2"; shift 2
  cwebp -quiet -q "$Q" -metadata none "$@" "$src" -o "$out"
  printf '%7d KB  %s\n' "$(( $(stat -f%z "$out" 2>/dev/null || stat -c%s "$out") / 1024 ))" "$out"
}

# Chips (masters 1024x1024, disk slightly off-center on a light studio
# background whose alpha was never fully removed). Crop to the disk's
# bounding square so CSS can clip a centred circle and drop the halo.
# Buttons render at 76 CSS px, corner decorations at 56 px.
enc chip-gold.png  chip-gold.webp     -crop 125 131 772 772 -resize 160 160
enc chip-gold.png  chip-gold@2x.webp  -crop 125 131 772 772 -resize 320 320
enc chip-red.png   chip-red.webp      -crop 152 151 717 717 -resize 160 160
enc chip-red.png   chip-red@2x.webp   -crop 152 151 717 717 -resize 320 320
enc chip-green.png chip-green.webp    -crop 111 105 803 803 -resize 160 160
enc chip-green.png chip-green@2x.webp -crop 111 105 803 803 -resize 320 320

# Plaque (1376x768) renders at up to 352 CSS px wide.
enc plaque-gold.png plaque-gold.webp    -resize 704 393
enc plaque-gold.png plaque-gold@2x.webp -resize 1376 768

# Card faces (1000x1400) render at up to 320 CSS px wide.
enc card-back.png  card-back.webp      -resize 320 448
enc card-back.png  card-back@2x.webp   -resize 640 896
enc card-back.png  card-back@3x.webp   -resize 960 1344
enc card-front.png card-front.webp     -resize 320 448
enc card-front.png card-front@2x.webp  -resize 640 896
enc card-front.png card-front@3x.webp  -resize 960 1344

# Header logo (1466x355) renders 165-215 CSS px wide (<img srcset>).
enc header-logo.png header-logo-440.webp  -resize 440 107
enc header-logo.png header-logo-880.webp  -resize 880 213
enc header-logo.png header-logo-1466.webp -resize 1466 355
