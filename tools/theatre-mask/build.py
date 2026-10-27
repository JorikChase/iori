"""Build the theatre mask in Blender, add the muscle shape keys, light it as satin ivory, render a pose.

Headless, through the throttled wrapper (memory guards + 75 % duty cycle):
  SCRIPT=$PWD/tools/theatre-mask/build.py ~/Desktop/aiblender/run.sh --pose comedy --engine cycles

Args (after --):
  --pose neutral|surprise|tragedy|comedy|au:<name>   (au: renders one muscle action at full contraction)
  --engine workbench|cycles   workbench = fast clay check of the form
  --view front|three_quarter|profile
  --res 1024 --samples 128 --vs 0.05 (voxel size, cm)
  --out tools/theatre-mask/renders/<pose>_<engine>.png
  --blend path.blend   also save the scene
"""
import argparse, os, sys, time

import bpy
import numpy as np
import openvdb

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mask_geo as mg  # noqa: E402

CM = 0.01   # face-frame cm -> Blender metres


def to_bl(v):
    """Face frame (x, y up, z towards viewer) -> Blender (x, y away from camera, z up)."""
    v = np.asarray(v)
    return np.stack([v[..., 0], -v[..., 2], v[..., 1]], -1) * CM


def args():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--pose", default="neutral")
    p.add_argument("--engine", default="workbench")
    p.add_argument("--view", default="front")
    p.add_argument("--res", type=int, default=1024)
    p.add_argument("--samples", type=int, default=128)
    p.add_argument("--vs", type=float, default=0.05)
    p.add_argument("--out", default="")
    p.add_argument("--blend", default="")
    return p.parse_args(a)


def build_mesh(vs):
    t = time.time()
    sdf, origin, vs = mg.shell_sdf_grid(vs)
    print(f"[mask] sdf {sdf.shape} {time.time() - t:.1f}s")
    g = openvdb.FloatGrid(float(4 * vs))
    g.copyFromArray(sdf)
    pts, quads = g.convertToQuads(0.0)
    pts = np.asarray(pts, float) * vs + origin            # index space -> face cm
    pts = mg.snap_to_surface(pts)
    quads = np.asarray(quads, np.int32)
    print(f"[mask] mesh {len(pts)} verts {len(quads)} quads {time.time() - t:.1f}s")
    return pts, quads


def make_object(pts, quads):
    me = bpy.data.meshes.new("mask")
    me.vertices.add(len(pts))
    me.vertices.foreach_set("co", to_bl(pts).ravel())
    me.loops.add(quads.size)
    me.loops.foreach_set("vertex_index", quads[:, ::-1].ravel())   # VDB winding faces inward in this frame
    me.polygons.add(len(quads))
    me.polygons.foreach_set("loop_start", np.arange(0, quads.size, 4, dtype=np.int32))
    me.polygons.foreach_set("loop_total", np.full(len(quads), 4, np.int32))
    me.update(calc_edges=True)
    me.validate()
    me.polygons.foreach_set("use_smooth", np.ones(len(quads), bool))
    ob = bpy.data.objects.new("mask", me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def add_keys(ob, pts):
    t = time.time()
    ob.shape_key_add(name="Basis", from_mix=False)
    base = to_bl(pts)
    fields = mg.au_fields(pts[:, 0], pts[:, 1])
    for name, (mv, wr) in fields.items():
        kb = ob.shape_key_add(name=name, from_mix=False)
        kb.data.foreach_set("co", (base + to_bl(mv)).ravel())
        kb.slider_min = -1.0
        kb.slider_max = 1.5
        if np.abs(wr).max() > 0:
            kw = ob.shape_key_add(name=name + "_w", from_mix=False)
            kw.data.foreach_set("co", (base + to_bl(wr)).ravel())
            kw.slider_max = 1.5
    print(f"[mask] {len(ob.data.shape_keys.key_blocks) - 1} keys {time.time() - t:.1f}s")


def set_pose(ob, pose):
    kbs = ob.data.shape_keys.key_blocks
    for kb in kbs[1:]:
        kb.value = 0.0
    if pose.startswith("au:"):
        mix = {pose[3:]: 1.0}
    else:
        mix = mg.EMOTIONS[pose]
    for name, w in mix.items():
        kbs[name].value = w
        if name + "_w" in kbs:
            kbs[name + "_w"].value = mg.wrinkle_onset(w)


def ivory():
    m = bpy.data.materials.new("satin_ivory")
    m.use_nodes = True
    nt = m.node_tree
    bs = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    inp = bs.inputs
    inp["Base Color"].default_value = (0.90, 0.86, 0.76, 1)      # ivory
    inp["Roughness"].default_value = 0.34                          # satin: broad soft highlights
    inp["Specular IOR Level"].default_value = 0.5
    inp["Subsurface Weight"].default_value = 0.12
    inp["Subsurface Radius"].default_value = (1.0, 0.7, 0.45)
    inp["Subsurface Scale"].default_value = 0.002
    inp["Coat Weight"].default_value = 0.25
    inp["Coat Roughness"].default_value = 0.22
    return m


def area(name, loc, target, size, power, color):
    ld = bpy.data.lights.new(name, "AREA")
    ld.shape = "DISK"
    ld.size = size
    ld.energy = power
    ld.color = color
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    d = np.asarray(target) - np.asarray(loc)
    from mathutils import Vector
    ob.rotation_euler = Vector(d).to_track_quat("-Z", "Y").to_euler()
    return ob


def stage(view, engine, res, samples):
    sc = bpy.context.scene
    from mathutils import Vector
    tgt = Vector((0, -0.04, 0.0))
    cam_d = bpy.data.cameras.new("cam")
    cam_d.lens = 105
    cam = bpy.data.objects.new("cam", cam_d)
    sc.collection.objects.link(cam)
    dirs = {"front": (0, -1, 0.06), "three_quarter": (-0.62, -0.78, 0.08), "profile": (-1, -0.05, 0.04)}
    d = Vector(dirs[view]).normalized()
    cam.location = tgt + d * 0.98
    cam.rotation_euler = (tgt - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    cam_d.dof.use_dof = engine == "cycles"
    cam_d.dof.focus_distance = (cam.location - Vector((0, -0.075, -0.02))).length
    cam_d.dof.aperture_fstop = 11.0

    # one warm stage key, high on the mask's right; a cool rim from behind; a whisper of fill
    # high and to one side, so every crease, socket and fold casts its own shadow
    area("key", (-0.55, -0.50, 0.85), (0, 0, 0), 0.30, 11.0, (1.0, 0.86, 0.70))
    area("rim", (0.55, 0.40, 0.30), (0, -0.03, 0), 0.20, 4.0, (0.62, 0.74, 1.0))
    area("fill", (0.6, -0.8, -0.2), (0, 0, 0), 0.8, 1.2, (0.85, 0.9, 1.0))

    w = bpy.data.worlds.new("black")
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0, 0, 0, 1)
    sc.world = w

    r = sc.render
    r.resolution_x = res
    r.resolution_y = int(res * 1.15)
    r.image_settings.file_format = "PNG"
    try:
        sc.view_settings.view_transform = "AgX"
        sc.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    if engine == "cycles":
        r.engine = "CYCLES"
        sc.cycles.samples = samples
        sc.cycles.use_denoising = True
        prefs = bpy.context.preferences.addons["cycles"].preferences
        dev = os.environ.get("CYCLES_DEVICE", "cpu")   # METAL peaked at 5.6 GB, CPU at 2 GB
        if dev != "cpu":
            try:
                prefs.compute_device_type = dev
                prefs.get_devices()
                for dv in prefs.devices:
                    dv.use = True
                sc.cycles.device = "GPU"
            except TypeError:
                sc.cycles.device = "CPU"
    else:
        try:
            r.engine = "BLENDER_WORKBENCH"
        except TypeError:
            r.engine = "BLENDER_WORKBENCH_NEXT"
        sh = sc.display.shading
        sh.light = "STUDIO"
        sh.color_type = "SINGLE"
        sh.single_color = (0.85, 0.83, 0.8)
        sh.show_cavity = True
        sh.cavity_type = "BOTH"
        sc.display.render_aa = "8"


def main():
    a = args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    pts, quads = build_mesh(a.vs)
    ob = make_object(pts, quads)
    ob.data.materials.append(ivory())
    add_keys(ob, pts)
    set_pose(ob, a.pose)
    stage(a.view, a.engine, a.res, a.samples)
    out = a.out or os.path.join(HERE, "renders", f"{a.pose.replace(':', '_')}_{a.view}_{a.engine}.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.context.scene.render.filepath = out
    t = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"[mask] rendered {out} {time.time() - t:.1f}s")
    if a.blend:
        bpy.ops.wm.save_as_mainfile(filepath=a.blend)


if __name__ == "__main__":
    main()
