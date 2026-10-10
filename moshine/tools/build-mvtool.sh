#!/bin/sh
# tools/build-mvtool.sh — build the fidelity bench's reference decoder against Homebrew FFmpeg (dev only).
set -e
FF="${FFMPEG_PREFIX:-$(brew --prefix ffmpeg 2>/dev/null || echo /opt/homebrew/opt/ffmpeg)}"
D="$(cd "$(dirname "$0")" && pwd)"; mkdir -p "$D/bin"
clang -O2 -Wall -o "$D/bin/mvtool" "$D/mvtool.c" -I"$FF/include" -L"$FF/lib" -lavformat -lavcodec -lswscale -lavutil -Wl,-rpath,"$FF/lib"
echo "built $D/bin/mvtool"
