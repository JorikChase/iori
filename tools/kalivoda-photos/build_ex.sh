#!/bin/sh
# Curated exhibition photos -> kalivoda/img/ex/<slug>/NN.jpg (1600 px long edge) + NN-t.jpg (520 px).
# Re-run after changing the lists. Sources and credits: README.md in this folder.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
RAW="$HERE/raw"
OUT="$HERE/../../kalivoda/img/ex"

build() {  # slug file...
  slug=$1; shift
  mkdir -p "$OUT/$slug"
  n=0
  for f in "$@"; do
    n=$((n + 1)); nn=$(printf %02d $n)
    ffmpeg -v error -y -i "$RAW/$f" -frames:v 1 -vf "scale='if(gt(iw,ih),min(1600,iw),-2)':'if(gt(iw,ih),-2,min(1600,ih))',format=yuvj420p" -q:v 4 "$OUT/$slug/$nn.jpg"
    ffmpeg -v error -y -i "$RAW/$f" -frames:v 1 -vf "scale='if(gt(iw,ih),520,-2)':'if(gt(iw,ih),-2,520)',format=yuvj420p" -q:v 5 "$OUT/$slug/$nn-t.jpg"
    printf "%s/%s.jpg  %s  %s\n" "$slug" "$nn" "$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$OUT/$slug/$nn.jpg")" "$f"
  done
}

build lom-toku fryc-lomtoku-P1540780.jpg fryc-lomtoku-P1540783.jpg fryc-lomtoku-P1540779.jpg fryc-lomtoku-P1540781.jpg fryc-lomtoku-P1540777.jpg fryc-lomtoku-P1540774.jpg
build soft-cut mt-urbanek-1.avif mt-urbanek-3.avif mt-urbanek-4.avif kuzebauch-softcut-8849.avif kuzebauch-softcut-8879.avif kuzebauch-jemnyrez-photo.avif kuzebauch-softcut-4043.avif
build matches sedlec-matches-main.jpg mt-archiv2.avif mt-archiv3.avif
build matter-of-sensitivity portheimka-polak-R5A5637.jpg portheimka-work-01-Chveni-hladiny2.jpg portheimka-polak-R5A5642.jpg fryc-portheimka-P1640871.jpg portheimka-work-02-7-10-2019.jpg portheimka-work-03-6-2-2020.jpg
build painting-by-water meetfactory-Pano_1.jpg meetfactory-0020_1.jpg meetfactory-9996_1.jpg meetfactory-0042_1.jpg meetfactory-main.jpg
du -sh "$OUT"
