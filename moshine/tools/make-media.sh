#!/bin/sh
# tools/make-media.sh — generate local test footage with ffmpeg (dev only; tests/media/ is gitignored).
#   sh moshine/tools/make-media.sh          cut.mp4: 3 s testsrc2, a hard cut, 3 s zooming Mandelbrot, 640x360 @ 30, H.264 + AAC tone
#                                           beat.mp4: 6 s testsrc2 320x180 @ 30, a 10 ms 2 kHz click every 0.5 s from 0.2 s
#                                           (frames 6, 21, 36, ...) over silence, H.264 + AAC (the M7 exit rows)
#   sh moshine/tools/make-media.sh --long   long1080.mp4: 10 min 1920x1080 @ 30 (testsrc2 and Mandelbrot alternating every 30 s) + AAC
set -e
D="$(cd "$(dirname "$0")/.." && pwd)/tests/media"; mkdir -p "$D"
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "testsrc2=size=640x360:rate=30:duration=3" \
  -f lavfi -i "mandelbrot=size=640x360:rate=30:start_scale=3:end_scale=0.3:end_pts=60,trim=duration=3" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=6" \
  -filter_complex "[0:v][1:v]concat=n=2:v=1[v]" -map "[v]" -map 2:a -c:v libx264 -pix_fmt yuv420p -g 60 -bf 0 -crf 18 -c:a aac -b:a 96k -shortest "$D/cut.mp4"
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "testsrc2=size=320x180:rate=30:duration=6" \
  -f lavfi -i "aevalsrc='if(lt(mod(t-0.2+1,0.5),0.01),0.8*sin(2*PI*2000*t),0)':s=48000:d=6" \
  -map 0:v -map 1:a -c:v libx264 -pix_fmt yuv420p -g 60 -bf 0 -crf 18 -c:a aac -b:a 128k -shortest "$D/beat.mp4"
if [ "$1" = "--long" ]; then
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "testsrc2=size=1920x1080:rate=30:duration=600" \
    -f lavfi -i "mandelbrot=size=480x270:rate=30:start_scale=3:end_scale=1.2:end_pts=600:maxiter=256,scale=1920:1080,trim=duration=600" \
    -f lavfi -i "sine=frequency=330:sample_rate=48000:duration=600" \
    -filter_complex "[0:v][1:v]blend=all_expr='if(lt(mod(T,60),30),A,B)'[v]" -map "[v]" -map 2:a \
    -c:v libx264 -preset veryfast -pix_fmt yuv420p -g 120 -bf 0 -crf 26 -c:a aac -b:a 96k "$D/long1080.mp4"
fi
ls -la "$D"
