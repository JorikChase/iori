#!/bin/bash
# Build a local test copy of game_multiplayer.html for the Browser pane.
#   bash tools/tennis-mp/make-dev.sh <out-dir>      (out-dir outside ~/Desktop: the pane can't read it)
#   python3 tools/tennis-mp/serve.py <out-dir> 8800 (or a .claude/launch.json entry running it)
# Then open http://localhost:8800/dev.html in two tabs.
# dev.html = the page with: its own room (?room default "dev", so it never touches the live room),
# window.__T test hooks, and /shim.js available (await import('/shim.js') in a hidden pane).
set -e
R="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${1:?usage: make-dev.sh <out-dir>}"
mkdir -p "$OUT/assets/obj"
cp "$R/game_multiplayer.html" "$R/manifest.json" "$OUT/"
cp "$R"/assets/{main.css,dogica.ttf,tennis.jpg,tennis_sound.mp3,menu.css,menu.js} "$OUT/assets/"
cp "$R/assets/obj/col-wld.glb" "$OUT/assets/obj/"
cp "$R/tools/tennis-mp/shim.js" "$OUT/shim.js"
python3 - "$OUT" <<'PY'
import sys
out = sys.argv[1]
s = open(out + "/game_multiplayer.html").read()
a = 'const room = (params.get("room") || "")'
assert a in s, "room line moved: update make-dev.sh"
s = s.replace(a, 'const room = (params.get("room") || "dev")', 1)
hooks = ("window.__T = { viewRacket, poseRacket, swing, balls, camera, net, players, self, startSwing, toss, "
         "spawnBall, quality, renderer, scene, setQuality, playerCollider, playerVelocity, POSES, POSE_SIDES, "
         "buildPoses, updateSwing, hitBall, get remotes() { return remotes; }, onSplat, addScreenSplat, "
         "setPaused, composer };\n")
b = "            animate();\n        </script>"
assert b in s, "end of module moved: update make-dev.sh"
s = s.replace(b, "            " + hooks + b, 1)
open(out + "/dev.html", "w").write(s)
print("wrote", out + "/dev.html")
PY
