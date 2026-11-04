"""
Render the Light-mode sprites from the same GLBs the 3D stage uses, so both modes match.
  blender -b -P models/render_sprites.py -- static/models static/img
Outputs transparent PNGs lit like the parlour (warm candle key, cold teal rim):
  casket_body.png + casket_lid.png (same frame; the lid swings in CSS around its back edge),
  candelabra.png, skull.png, lantern.png, bell.png, spade.png
Prints the lid hinge line as a fraction of the image height for fx.css.
"""
import math
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT = ARGS[0], ARGS[1]
os.makedirs(OUT, exist_ok=True)


def fresh():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    names = [i.identifier for i in sc.view_settings.bl_rna.properties["view_transform"].enum_items]
    sc.view_settings.view_transform = "AgX" if "AgX" in names else ("Filmic" if "Filmic" in names else "Standard")
    sc.view_settings.look = "None"
    w = bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True
    # a warm, dim room so brass reflects candlelight rather than the void
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.20, 0.13, 0.07, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.45
    return sc


def bounds(objs):
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in objs:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            p = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, p)); hi = Vector(map(max, hi, p))
    return lo, hi


def light_rig(center, size):
    # warm key from front-left-above (candlelight), teal rim from behind-right, soft fill
    def point(name, color, energy, loc):
        l = bpy.data.lights.new(name, "POINT"); l.color = color; l.energy = energy; l.shadow_soft_size = size * 0.25
        o = bpy.data.objects.new(name, l); bpy.context.collection.objects.link(o); o.location = loc; return o
    point("Key", (1.0, 0.72, 0.42), 260 * size * size, center + Vector((size * 1.3, -size * 1.1, size * 1.2)))
    point("Fill", (0.55, 0.62, 0.7), 50 * size * size, center + Vector((size * 1.6, size * 0.8, size * 0.5)))
    point("Rim", (0.16, 0.64, 0.74), 160 * size * size, center + Vector((-size * 1.2, size * 1.2, size * 1.4)))


def camera_for(center, size, azimuth_deg, elev_deg, dist_mult, res, ortho=False):
    cam_data = bpy.data.cameras.new("Cam")
    cam = bpy.data.objects.new("Cam", cam_data); bpy.context.collection.objects.link(cam)
    d = size * dist_mult
    az = math.radians(azimuth_deg); el = math.radians(elev_deg)
    cam.location = center + Vector((math.cos(az) * math.cos(el) * d, math.sin(az) * math.cos(el) * d, math.sin(el) * d))
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam_data.lens = 50
    bpy.context.scene.camera = cam
    bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y = res
    return cam


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("rendered", path)


def load(name):
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, f"{name}.glb"))
    return [o for o in bpy.context.scene.objects if o.type in ("MESH", "EMPTY")]


# ── casket: camera square-on to the long side, elevated, so the back edge of the lid is level in the image
fresh()
objs = load("casket")
lo, hi = bounds(objs); center = (lo + hi) / 2; size = max(hi - lo)
# the casket's long axis is glTF -Z (Blender Y after import); the hinge is on the -X side
light_rig(center, size)
cam = camera_for(center, size, azimuth_deg=-22, elev_deg=27, dist_mult=1.85, res=(1400, 640))
lid = bpy.data.objects.get("CasketLid")
sc = bpy.context.scene
# hinge line: the lid's origin sits on it. Project it to image space.
bpy.context.view_layer.update()
h = world_to_camera_view(sc, cam, lid.matrix_world.translation)
lo2, hi2 = bounds([lid]); print('LIDBOX', [round(v, 3) for v in lo2], [round(v, 3) for v in hi2])
print(f"HINGE image x={h.x:.4f} y_from_top={1 - h.y:.4f}")
# body only
lid.hide_render = True
render(os.path.join(OUT, "casket_body.png"))
# lid only
lid.hide_render = False
for o in objs:
    if o.type == "MESH" and o is not lid:
        o.hide_render = True
render(os.path.join(OUT, "casket_lid.png"))

# ── the props, same light and a matching low three-quarter camera
for name, az, el, dist, res in (
    ("candle", -60, 14, 2.4, (900, 1100)),
    ("skull", -40, 12, 2.6, (900, 900)),
    ("lantern", -70, 10, 2.4, (700, 1100)),
    ("bell", -60, 14, 2.6, (700, 800)),
):
    fresh()
    objs = load(name)
    lo, hi = bounds(objs); center = (lo + hi) / 2; size = max(hi - lo)
    light_rig(center, size)
    camera_for(center, size, az, el, dist, res)
    render(os.path.join(OUT, f"{name}.png"))
