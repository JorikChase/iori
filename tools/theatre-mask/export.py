"""Export the theatre mask for the web: one GLB with every muscle and wrinkle key as a morph target, plus
emotions.json (each emotion's muscle mix, the wrinkle onset curve) for the page to drive them.

  SCRIPT=$PWD/tools/theatre-mask/export.py ~/Desktop/aiblender/run.sh --vs 0.08
  then, for the page at theatre-mask/ (3die.fr/theatre-mask/, hidden):
  npx @gltf-transform/cli@4.1.1 optimize tools/theatre-mask/web/mask_raw.glb theatre-mask/mask.glb \
      --compress meshopt --simplify false --texture-compress false --flatten false --join false --instance false

Args (after --): --vs voxel size in cm (0.08 ~ 190k verts), --out tools/theatre-mask/web/mask_raw.glb
"""
import argparse, json, os, sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mask_geo as mg  # noqa: E402
import build  # noqa: E402  (build.py runs main() only as a script; see the guard there)


def args():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--vs", type=float, default=0.08)
    p.add_argument("--out", default=os.path.join(HERE, "web", "mask_raw.glb"))
    p.add_argument("--site", default=os.path.join(os.path.dirname(os.path.dirname(HERE)), "theatre-mask"))
    return p.parse_args(a)


def main():
    a = args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    pts, quads = build.build_mesh(a.vs)
    ob = build.make_object(pts, quads)
    build.add_keys(ob, pts)
    for kb in ob.data.shape_keys.key_blocks[1:]:
        kb.value = 0.0
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=a.out, export_format="GLB", use_selection=True,
                              export_morph=True, export_morph_normal=True, export_materials="NONE",
                              export_texcoords=False, export_apply=False)
    keys = [kb.name for kb in ob.data.shape_keys.key_blocks[1:]]
    meta = {
        "keys": keys,
        "emotions": mg.EMOTIONS,
        "wrinkle_onset": [0.15, 0.85],     # smoothstep edges: wrinkle key = onset(muscle weight)
    }
    with open(os.path.join(a.site, "emotions.json"), "w") as f:
        json.dump(meta, f, indent=1)
    print(f"[export] {a.out} verts {len(ob.data.vertices)} keys {len(keys)}")


main()
