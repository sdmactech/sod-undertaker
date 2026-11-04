"""Render a quick preview of each GLB: blender -b -P models/preview.py -- static/models <outdir>"""
import sys, os, math, bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT = args[0], args[1]
os.makedirs(OUT, exist_ok=True)

for name in sorted(f for f in os.listdir(SRC) if f.endswith(".glb")):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, name))
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    center = (lo + hi) / 2; size = max(hi - lo)
    cam_data = bpy.data.cameras.new("Cam"); cam = bpy.data.objects.new("Cam", cam_data)
    bpy.context.collection.objects.link(cam)
    d = size * 2.2
    cam.location = center + Vector((d * 0.8, -d * 0.9, d * 0.6))
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    sun = bpy.data.lights.new("Sun", "SUN"); sun.energy = 3
    so = bpy.data.objects.new("Sun", sun); bpy.context.collection.objects.link(so)
    so.rotation_euler = (math.radians(50), math.radians(10), math.radians(30))
    key = bpy.data.lights.new("Key", "POINT"); key.energy = 400 * size
    ko = bpy.data.objects.new("Key", key); bpy.context.collection.objects.link(ko)
    ko.location = center + Vector((-d * 0.5, -d * 0.4, d * 0.7))
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE" if hasattr(bpy.types, "SceneEEVEE") else "BLENDER_WORKBENCH"
    try:
        sc.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        try: sc.render.engine = "BLENDER_EEVEE"
        except TypeError: sc.render.engine = "BLENDER_WORKBENCH"
    sc.render.resolution_x = 640; sc.render.resolution_y = 480
    sc.render.image_settings.file_format = "PNG"
    w = bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.08, 0.08, 0.09, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 1.2
    sc.render.filepath = os.path.join(OUT, name.replace(".glb", ".png"))
    bpy.ops.render.render(write_still=True)
    print("rendered", sc.render.filepath, "engine", sc.render.engine)
