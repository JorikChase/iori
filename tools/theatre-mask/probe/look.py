import bpy, sys, mathutils
S = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=S + "/notex.glb")
face = next(o for o in bpy.context.scene.objects if o.type == "MESH" and o.data.shape_keys and len(o.data.shape_keys.key_blocks) > 40)
for o in bpy.context.scene.objects:
    if o.type == "MESH" and o is not face:
        o.hide_render = True
face.data.shape_keys.animation_data_clear()
kb = face.data.shape_keys.key_blocks
print("verts", len(face.data.vertices), "dims", tuple(round(d, 3) for d in face.dimensions))
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"
sh = sc.display.shading
sh.light = "STUDIO"; sh.color_type = "SINGLE"; sh.single_color = (0.85, 0.83, 0.8); sh.show_cavity = True
sc.render.resolution_x = 480; sc.render.resolution_y = 560
bb = [face.matrix_world @ mathutils.Vector(c) for c in face.bound_box]
ctr = sum(bb, mathutils.Vector()) / 8
size = max((bb[6] - bb[0]))
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
poses = {
    "neutral": {},
    "sad": {"browInnerUp": 1, "mouthFrown_L": 1, "mouthFrown_R": 1, "jawOpen": 0.3, "mouthLowerDown_L": 0.4, "mouthLowerDown_R": 0.4, "mouthShrugLower": 0.5},
    "happy": {"mouthSmile_L": 1, "mouthSmile_R": 1, "cheekSquint_L": 1, "cheekSquint_R": 1, "eyeSquint_L": 0.6, "eyeSquint_R": 0.6, "jawOpen": 0.3, "mouthUpperUp_L": 0.3, "mouthUpperUp_R": 0.3},
}
# the face looks down which axis? try the front from the bbox: camera along the axis of smallest extent
d = bb[6] - bb[0]
for view, vec in (("front", None),):
    pass
dirs = {"y-": mathutils.Vector((0, -1, 0)), "z+": mathutils.Vector((0, 0, 1))}
for pose, mix in poses.items():
    for k in kb[1:]:
        k.value = 0
    for n, w in mix.items():
        kb[n].value = w
    for dn, dv in dirs.items():
        cam.location = ctr + dv * size * 2.2
        cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = f"{S}/fc_{pose}_{dn}.png"
        bpy.ops.render.render(write_still=True)
