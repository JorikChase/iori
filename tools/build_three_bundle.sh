#!/usr/bin/env bash
# Build assets/three-index.min.js — the Three.js bundle that index.html loads.
#
# index.html used to pull three plus eight addons straight from threejs.org via an
# importmap. That is the project's documentation site, not a CDN, and the import
# graph is four levels deep: three.module.js only reveals three.core.js once it has
# parsed, EffectComposer only reveals Pass/CopyShader/MaskPass once it has parsed,
# and so on. Measured cold on 3die.fr that chain took 1.35s to settle, and the HDRI
# the page needs in order to show anything could not start downloading until it had.
#
# Bundling collapses it to one same-origin request, and pinning stops the homepage
# riding three's tip — where the next breaking rename silently blanks the page.
#
#   ./tools/build_three_bundle.sh
#
# Needs node/npx. Everything is installed into a temp dir; nothing lands in the repo
# but the built file.

set -euo pipefail

THREE_VERSION="0.186.0"
ESBUILD_VERSION="0.25.10"

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$repo/assets/three-index.min.js"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cd "$work"
echo '{"name":"three-index-bundle","private":true,"type":"module"}' > package.json

echo "installing three@$THREE_VERSION + esbuild@$ESBUILD_VERSION ..."
npm install --silent --no-audit --no-fund \
  "three@$THREE_VERSION" "esbuild@$ESBUILD_VERSION"

# Only the symbols index.html actually touches. Naming them individually rather
# than re-exporting `import * as THREE` lets esbuild drop the rest of the library:
# it is the difference between ~139 KB and ~160 KB gzipped.
cat > entry.js <<'JS'
import {
  ACESFilmicToneMapping, BoxGeometry, CubeCamera,
  DodecahedronGeometry, EquirectangularReflectionMapping, HalfFloatType,
  IcosahedronGeometry, Mesh, MeshStandardMaterial, OctahedronGeometry,
  PerspectiveCamera, Scene, TetrahedronGeometry, TorusGeometry,
  WebGLCubeRenderTarget, WebGLRenderer,
} from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js';

export const THREE = {
  ACESFilmicToneMapping, BoxGeometry, CubeCamera,
  DodecahedronGeometry, EquirectangularReflectionMapping, HalfFloatType,
  IcosahedronGeometry, Mesh, MeshStandardMaterial, OctahedronGeometry,
  PerspectiveCamera, Scene, TetrahedronGeometry, TorusGeometry,
  WebGLCubeRenderTarget, WebGLRenderer,
};
export { HDRLoader, EffectComposer, RenderPass, ShaderPass, RGBShiftShader };
JS

./node_modules/.bin/esbuild entry.js \
  --bundle --format=esm --minify --target=es2020 \
  --legal-comments=none \
  --banner:js="/* three.js r${THREE_VERSION#0.} — bundled by tools/build_three_bundle.sh. MIT, see https://github.com/mrdoob/three.js */" \
  --outfile="$out"

printf 'wrote %s\n  %s bytes raw\n  %s bytes gzipped\n' \
  "${out#"$repo"/}" \
  "$(wc -c < "$out" | tr -d ' ')" \
  "$(gzip -9 -c "$out" | wc -c | tr -d ' ')"
