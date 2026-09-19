#!/usr/bin/env python3
"""Render the shared test views through Octane's Gaussian splat primitive in Blender.

Usage (headless):
  "/Applications/Blender 52.app/Contents/MacOS/Blender" -b --python tools/splat-rig/octane_render.py -- [view_id ...] [--samples N] [--scale S]

Reads tools/splat-rig/views.json (same camera spec as the web rig pages), loads
splat-work/ply/<scene>.ply into an Octane Gaussian-splat geometry node, matches the camera
(pos / look / up / vertical fov, 16:9) and writes PNGs to splat-work/renders/octane/<view_id>.png.
Requires the Octane addon enabled in this Blender and an Octane server/licence available.
"""
import bpy, json, os, sys, math
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
VIEWS = os.path.join(ROOT, 'tools', 'splat-rig', 'views.json')
PLY_DIR = os.path.join(ROOT, 'splat-work', 'ply')
OUT_DIR = os.path.join(ROOT, 'splat-work', 'renders', 'octane')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
samples = int(argv[argv.index('--samples') + 1]) if '--samples' in argv else 256
scale = float(argv[argv.index('--scale') + 1]) if '--scale' in argv else 0.5
dry = '--dry' in argv   # build the scene and save a .blend, skip the render (no Octane server needed)
wanted = [a for a in argv if not a.startswith('--') and not a.replace('.', '').isdigit()]

cfg = json.load(open(VIEWS))
W, H = cfg['resolution']
os.makedirs(OUT_DIR, exist_ok=True)

def look_at_matrix(pos, look, up):
    """Blender camera looks down -Z with +Y up. Same pos/look/up as the web rig, raw PLY frame."""
    pos, look, up = Vector(pos), Vector(look), Vector(up)
    f = (look - pos).normalized()          # forward
    r = f.cross(up).normalized()           # right
    u = r.cross(f).normalized()            # true up
    m = Matrix(((r.x, u.x, -f.x, pos.x), (r.y, u.y, -f.y, pos.y), (r.z, u.z, -f.z, pos.z), (0, 0, 0, 1)))
    return m

def add_splat_object(name, ply_path):
    """Mirror of OCTANE_OT_quick_add_octane_geometry with the GaussianSplat node and a filename."""
    from octane.nodes.base_node_tree import NodeTreeHandler
    from octane.utils import utility, consts
    bpy.ops.mesh.primitive_cube_add()
    obj = bpy.context.active_object
    obj.name = f'OctaneGeometry[{name}]'
    obj.display_type = 'WIRE'
    mat = bpy.data.materials.new(obj.name + '_Material'); mat.use_nodes = True
    NodeTreeHandler._on_material_new(mat.node_tree, mat)
    NodeTreeHandler.update_node_tree_count(bpy.context.scene)
    obj.data.materials.append(mat)
    node = mat.node_tree.nodes.new('OctaneGaussianSplat')
    owner_type = utility.get_node_tree_owner_type(mat)
    out = utility.find_active_output_node(mat.node_tree, owner_type)
    mat.node_tree.links.new(node.outputs[0], out.inputs['Displacement'])
    coll = obj.data.octane.octane_geo_node_collections
    coll.node_graph_tree = mat.name; coll.osl_geo_node = node.name
    node.a_filename = ply_path
    # Luma PLYs are stored display-referred; keep sRGB, no axis flip (we match the raw frame like the web rig)
    for s in node.inputs:
        if s.bl_idname == 'OctaneGaussianSplatFlipAxes': s.default_value = False
        if s.bl_idname == 'OctaneGaussianSplatColorSpace': s.default_value = 'sRGB'
        if s.bl_idname == 'OctaneGaussianSplatAlphaMin': s.default_value = 1.0 / 255.0
    return obj, node

def render_view(v):
    bpy.ops.wm.read_homefile(use_empty=True)  # keeps user prefs (Octane addon enabled)
    import addon_utils; addon_utils.enable("octane", default_set=False)
    sc = bpy.context.scene
    sc.render.engine = 'octane'
    sc.render.resolution_x, sc.render.resolution_y = W, H
    sc.render.resolution_percentage = int(scale * 100)
    sc.render.image_settings.file_format = 'PNG'
    sc.render.filepath = os.path.join(OUT_DIR, v['id'] + '.png')
    ply = os.path.join(PLY_DIR, v['scene'] + '.ply')
    add_splat_object(v['scene'], ply)
    cam_data = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_data)
    sc.collection.objects.link(cam); sc.camera = cam
    cam_data.sensor_fit = 'VERTICAL'; cam_data.sensor_height = 24.0
    cam_data.lens = (cam_data.sensor_height / 2) / math.tan(math.radians(v['fov']) / 2)
    cam_data.clip_start, cam_data.clip_end = 0.05, 1000
    cam.matrix_world = look_at_matrix(v['pos'], v['look'], v['up'])
    # kernel samples (property names differ per addon version; best effort)
    try:
        k = sc.octane
        for attr in ('max_samples', 'maxsamples'):
            if hasattr(k, attr): setattr(k, attr, samples)
    except Exception as e:
        print('kernel samples not set:', e)
    if dry:
        blend = os.path.join(OUT_DIR, v['id'] + '.blend'); bpy.ops.wm.save_as_mainfile(filepath=blend)
        n = bpy.data.materials[0].node_tree.nodes; print('DRY', v['id'], 'nodes', [x.bl_idname for x in n], 'file', [x.a_filename for x in n if hasattr(x,'a_filename')], 'cam', [round(c,3) for c in cam.matrix_world.translation], 'lens', round(cam_data.lens,2), '->', blend)
        return
    print('rendering', v['id'], '->', sc.render.filepath)
    bpy.ops.render.render(write_still=True)

for v in cfg['views']:
    if wanted and v['id'] not in wanted: continue
    render_view(v)
print('done')
