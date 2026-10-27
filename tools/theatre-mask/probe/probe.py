import bpy, sys, numpy as np
S = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=S + "/notex.glb")
face = next(o for o in bpy.context.scene.objects if o.type == "MESH" and o.data.shape_keys and len(o.data.shape_keys.key_blocks) > 40)
kb = face.data.shape_keys.key_blocks
n = len(face.data.vertices)
base = np.zeros(n * 3); kb[0].data.foreach_get("co", base)
for name in ("jawOpen", "mouthSmile_L", "browInnerUp", "mouthFrown_L"):
    a = np.zeros(n * 3); kb[name].data.foreach_get("co", a)
    print(name, "max delta", np.abs(a - base).max(), "mute", kb[name].mute, "rel", kb[name].relative_key.name)
print("scale", tuple(face.scale), "parent", face.parent and face.parent.name, face.parent and tuple(face.parent.scale))
