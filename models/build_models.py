"""
Models for the Undertaker's Ledger v4 hero stage.
Run headless:  blender -b -P models/build_models.py -- static/models [casket skull candle spade lantern bell]

Sources (all CC0, see models/sources/LICENSES.md):
  casket  built here: toe-pincher body, plinth, raised-panel lid hinged on the back edge,
          brass bail handles, corner plates and nameplate; Poly Haven dark_wood PBR set
  skull   CDmir's sculpt from OpenGameArt (OBJ + 2K diffuse / normal / roughness / AO)
  candle  Poly Haven brass_candleholders, one holder with its candle (flame is a shader in scene3d.js)
  spade   Poly Haven rusted_spade_01
  lantern Poly Haven Lantern_01
  bell    built here, lathed brass
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = ARGS[0] if ARGS else "static/models"
ONLY = ARGS[1:]
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "sources")
os.makedirs(OUT, exist_ok=True)


# ── helpers ──────────────────────────────────────────────────────────
def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def img(path):
    return bpy.data.images.load(path, check_existing=True)


def pbr_material(name, diff=None, nor=None, arm=None, rough_map=None, ao=None, color=(1, 1, 1), rough=0.5, metal=0.0, scale=1.0, normal_strength=1.0):
    """Principled material from texture maps. arm = Poly Haven packed AO(R) Rough(G) Metal(B)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (scale, scale, scale)
    nt.links.new(tc.outputs["UV"], mp.inputs["Vector"])

    def tex(path, colorspace="sRGB"):
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img(path)
        t.image.colorspace_settings.name = colorspace
        nt.links.new(mp.outputs["Vector"], t.inputs["Vector"])
        return t

    base = None
    if diff:
        base = tex(diff)
        if ao:
            a = tex(ao, "Non-Color")
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 0.85
            nt.links.new(base.outputs["Color"], mix.inputs["A"])
            nt.links.new(a.outputs["Color"], mix.inputs["B"])
            nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
        else:
            nt.links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
    if nor:
        n = tex(nor, "Non-Color")
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = normal_strength
        nt.links.new(n.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if arm:
        a = tex(arm, "Non-Color")
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(a.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    if rough_map:
        r = tex(rough_map, "Non-Color")
        nt.links.new(r.outputs["Color"], bsdf.inputs["Roughness"])
    return m


def bevel(obj, width=0.01, segments=3, angle=35):
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(angle)
    return mod


def apply_mods(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    obj.select_set(False)


def smooth(obj, angle=40):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    obj.select_set(False)


def cube_uv(obj, size=1.0):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=size, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)


def new_obj(name, bm, mat=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    if mat:
        ob.data.materials.append(mat)
    return ob


def prism(name, profile, depth, mat=None, z0=0.0):
    bm = bmesh.new()
    verts = [bm.verts.new((x, y, z0)) for x, y in profile]
    bm.faces.new(verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    r = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    up = [g for g in r["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=up, vec=(0, 0, depth))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_obj(name, bm, mat)


def box(name, size, loc, mat, bev=0.004):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    o.data.materials.append(mat)
    if bev:
        bevel(o, bev, 2)
    return o


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active
    j.name = name
    return j


def shrink_images(max_px):
    """Downscale every loaded image so the GLB stays small; the hero strip never shows a prop larger than ~150 px."""
    for im in bpy.data.images:
        if im.size[0] > max_px or im.size[1] > max_px:
            f = max_px / max(im.size)
            im.scale(max(1, int(im.size[0] * f)), max(1, int(im.size[1] * f)))


def export(name, max_px=None):
    if max_px:
        shrink_images(max_px)
    path = os.path.join(OUT, f"{name}.glb")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_animations=False, export_materials="EXPORT",
        export_image_format="JPEG", export_jpeg_quality=74,
        export_texcoords=True, export_normals=True, export_tangents=False,
    )
    print(f"wrote {path} ({os.path.getsize(path) // 1024} KB)")


def scale_outline(pts, sx, sy):
    return [(x * sx, y * sy) for x, y in pts]


# ── CASKET ───────────────────────────────────────────────────────────
# Plan view: x across, y along the length, head at +y. A classic 1890s toe-pincher.
L = 1.98
HEAD, SHOULDER, FOOT = 0.46, 0.70, 0.36
SH_Y = 0.38
OUTLINE = [(-HEAD / 2, L / 2), (HEAD / 2, L / 2), (SHOULDER / 2, SH_Y), (FOOT / 2, -L / 2),
           (-FOOT / 2, -L / 2), (-SHOULDER / 2, SH_Y)]
H = 0.40       # body height
WALL = 0.045   # wall thickness
LID_H = 0.065  # lid slab
PANEL_H = 0.028


def build_casket():
    clear()
    wd = os.path.join(SRC, "textures", "dark_wood")
    wood = pbr_material("CasketWood", diff=f"{wd}/dark_wood_diff_1k.jpg", nor=f"{wd}/dark_wood_nor_gl_1k.jpg", arm=f"{wd}/dark_wood_arm_1k.jpg", scale=0.9)
    brass = pbr_material("Brass", color=(0.78, 0.58, 0.25), rough=0.32, metal=1.0)
    brass_dark = pbr_material("BrassAged", color=(0.52, 0.37, 0.15), rough=0.45, metal=1.0)
    velvet = pbr_material("Velvet", color=(0.16, 0.025, 0.035), rough=0.95)

    # body: solid prism, then carve the cavity by insetting the top face and pushing it down
    body = prism("CasketBody", OUTLINE, H, wood)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.faces.ensure_lookup_table()
    top = max(bm.faces, key=lambda f: f.calc_center_median().z)
    res = bmesh.ops.inset_individual(bm, faces=[top], thickness=WALL, depth=0.0)
    inner = [f for f in bm.faces if abs(f.calc_center_median().z - H) < 1e-4 and f not in res["faces"]]
    inner = [f for f in inner if f.calc_area() > 0.1]
    r = bmesh.ops.extrude_face_region(bm, geom=inner)
    vs = [g for g in r["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=vs, vec=(0, 0, -(H - 0.06)))
    bmesh.ops.delete(bm, geom=inner, context="FACES")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(body.data)
    bm.free()
    bevel(body, 0.012, 3)
    apply_mods(body)
    cube_uv(body, 1.0)
    # velvet lining: a soft pad sitting in the cavity
    pad = prism("Lining", scale_outline(OUTLINE, 0.84, 0.94), 0.05, velvet, z0=0.07)
    bevel(pad, 0.02, 3)
    apply_mods(pad)
    cube_uv(pad)
    # plinth moulding under the body
    plinth = prism("Plinth", scale_outline(OUTLINE, 1.06, 1.02), 0.05, wood, z0=-0.05)
    bevel(plinth, 0.015, 3)
    apply_mods(plinth)
    cube_uv(plinth)

    # lid: slab with a chamfered edge and a raised centre panel, hinge on the -x (back) side
    lid = prism("LidSlab", scale_outline(OUTLINE, 1.03, 1.012), LID_H, wood, z0=0.0)
    bevel(lid, 0.022, 4)
    apply_mods(lid)
    cube_uv(lid)
    panel = prism("LidPanel", scale_outline(OUTLINE, 0.72, 0.86), PANEL_H, wood, z0=LID_H)
    bevel(panel, 0.014, 4)
    apply_mods(panel)
    cube_uv(panel)
    plate = box("NamePlate", (0.11, 0.2, 0.006), (0, 0.18, LID_H + PANEL_H + 0.003), brass, 0.002)
    apply_mods(plate)
    cross_v = box("CrossV", (0.035, 0.44, 0.012), (0, -0.28, LID_H + PANEL_H + 0.004), brass_dark, 0.003)
    cross_h = box("CrossH", (0.16, 0.035, 0.012), (0, -0.14, LID_H + PANEL_H + 0.004), brass_dark, 0.003)
    for o in (cross_v, cross_h):
        apply_mods(o)
    lid = join([lid, panel, plate, cross_v, cross_h], "CasketLid")
    # move the pivot to the hinge line: back edge (-x), top of the body
    hinge = Vector((-SHOULDER / 2 * 1.03, 0, 0))
    lid.data.transform(Matrix.Translation(-hinge))
    lid.location = hinge + Vector((0, 0, H))

    # brass bail handles: three per side, each a backplate plus a swinging bail
    def side_point(t, sx):
        """point on the side polyline at parameter t in [0,1] from head to foot, side sx = +-1"""
        pts = [(sx * HEAD / 2, L / 2), (sx * SHOULDER / 2, SH_Y), (sx * FOOT / 2, -L / 2)]
        d1 = math.dist(pts[0], pts[1]); d2 = math.dist(pts[1], pts[2]); tot = d1 + d2
        s = t * tot
        if s <= d1:
            k = s / d1; a, b = pts[0], pts[1]
        else:
            k = (s - d1) / d2; a, b = pts[1], pts[2]
        x = a[0] + (b[0] - a[0]) * k; y = a[1] + (b[1] - a[1]) * k
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        return x, y, ang

    handles = []
    for sx in (-1, 1):
        for t in (0.18, 0.5, 0.82):
            x, y, ang = side_point(t, sx)
            nx, ny = math.cos(ang - math.pi / 2) * -sx, math.sin(ang - math.pi / 2) * -sx  # outward normal
            # outward normal pointing away from the centre line
            if (x * nx) < 0:
                nx, ny = -nx, -ny
            bp = box(f"Plate{sx}{t}", (0.012, 0.16, 0.09), (x + nx * 0.006, y + ny * 0.006, H * 0.52), brass, 0.003)
            bp.rotation_euler = (0, 0, ang)
            bpy.ops.mesh.primitive_torus_add(major_radius=0.052, minor_radius=0.009, major_segments=28, minor_segments=10,
                                             location=(x + nx * 0.03, y + ny * 0.03, H * 0.47))
            bail = bpy.context.active_object
            bail.name = f"Bail{sx}{t}"
            bail.rotation_euler = (0, math.radians(90), ang)
            bail.scale = (1, 1.35, 1)
            bail.data.materials.append(brass)
            handles += [bp, bail]
    # corner plates on the shoulders
    for sx in (-1, 1):
        cp = box(f"Corner{sx}", (0.04, 0.04, 0.12), (sx * SHOULDER / 2, SH_Y, H * 0.5), brass_dark, 0.004)
        cp.rotation_euler = (0, 0, math.radians(-25 * sx))
        handles.append(cp)
    for o in handles:
        apply_mods(o)
    brassware = join(handles, "Brassware")

    for ob in bpy.context.scene.objects:
        smooth(ob, 45)
    export("casket", max_px=1024)


# ── SKULL: CDmir's CC0 sculpt, textured ─────────────────────────────
def build_skull():
    clear()
    sk = os.path.join(SRC, "skull")
    bpy.ops.wm.obj_import(filepath=os.path.join(sk, "skull-Low4K.obj"))
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    skull = join(objs, "Skull") if len(objs) > 1 else objs[0]
    skull.name = "Skull"
    mat = pbr_material("Bone", diff=f"{sk}/Skull-Low.jpg", nor=f"{sk}/Skull-Low-normal.jpg", rough_map=f"{sk}/Skull-Low_r.jpg", ao=f"{sk}/Skull-AO.jpg", normal_strength=0.8)
    skull.data.materials.clear()
    skull.data.materials.append(mat)
    # normalise: 0.22 m tall, resting on z = 0, facing +y (OBJ from Blender is y-forward)
    bpy.context.view_layer.objects.active = skull
    skull.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    lo = Vector((min(v.co.x for v in skull.data.vertices), min(v.co.y for v in skull.data.vertices), min(v.co.z for v in skull.data.vertices)))
    hi = Vector((max(v.co.x for v in skull.data.vertices), max(v.co.y for v in skull.data.vertices), max(v.co.z for v in skull.data.vertices)))
    size = hi - lo
    s = 0.22 / size.z
    skull.data.transform(Matrix.Translation(-Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))) )
    skull.data.transform(Matrix.Scale(s, 4))
    print("skull dims", [round(v * s, 3) for v in size])
    smooth(skull, 60)
    export("skull", max_px=1024)


# ── Poly Haven props: import glTF, trim, export ─────────────────────
def import_gltf(path):
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.context.scene.objects]


def build_candle():
    clear()
    import_gltf(os.path.join(SRC, "brass_candleholders", "brass_candleholders_1k.gltf"))
    # keep holder 02 (the taller single stick) with its candle; drop the others and any flame card
    root = next(o for o in bpy.context.scene.objects if o.name.startswith("brass_candleholder_02"))
    keep_names = {root.name} | {c.name for c in root.children_recursive}
    for o in list(bpy.context.scene.objects):
        if o.name not in keep_names:
            bpy.data.objects.remove(o, do_unlink=True)
    # the flame is a textured card inside the same mesh: strip those faces, keep the holder and candle
    for o in list(bpy.context.scene.objects):
        if o.type != "MESH":
            continue
        flame_idx = {i for i, m in enumerate(o.data.materials) if m and "flame" in m.name}
        if not flame_idx:
            continue
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in flame_idx], context="FACES")
        bm.to_mesh(o.data); bm.free()
        for i in sorted(flame_idx, reverse=True):
            o.data.materials.pop(index=i)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    minz = min(p.z for p in pts); cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2; cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    for o in bpy.context.scene.objects:
        if o.parent is None:
            o.location -= Vector((cx, cy, minz))
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    print("candle size", round(max(p.x for p in pts) - min(p.x for p in pts), 3), "top z", round(max(p.z for p in pts), 3))
    export("candle", max_px=512)


def build_spade():
    clear()
    objs = import_gltf(os.path.join(SRC, "rusted_spade_01", "rusted_spade_01_1k.gltf"))
    export("spade", max_px=512)


def build_lantern():
    clear()
    objs = import_gltf(os.path.join(SRC, "Lantern_01", "Lantern_01_1k.gltf"))
    export("lantern", max_px=512)


# ── BELL: lathed brass with a thick lip and an iron crown ───────────
def build_bell():
    clear()
    brass = pbr_material("Brass", color=(0.74, 0.55, 0.22), rough=0.28, metal=1.0)
    iron = pbr_material("Iron", color=(0.12, 0.12, 0.13), rough=0.6, metal=0.9)
    prof = [(0.0, 0.0), (0.235, 0.0), (0.25, 0.03), (0.235, 0.075), (0.2, 0.12), (0.17, 0.26), (0.155, 0.40), (0.125, 0.48), (0.08, 0.53), (0.045, 0.555), (0.0, 0.56),
            (0.0, 0.5), (0.04, 0.5), (0.1, 0.47), (0.145, 0.4), (0.16, 0.26), (0.19, 0.12), (0.215, 0.04), (0.2, 0.0), (0.0, 0.0)]
    bm = bmesh.new()
    segs = 48
    rings = []
    for (r, z) in prof:
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), z)) for i in range(segs)])
    for a, b in zip(rings[:-1], rings[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            quad = []
            for q in (a[i], a[j], b[j], b[i]):
                if q not in quad:
                    quad.append(q)
            if len(quad) >= 3:
                try:
                    bm.faces.new(quad)
                except ValueError:
                    pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bell = new_obj("Bell", bm, brass)
    cube_uv(bell)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.04, segments=20, ring_count=12, location=(0, 0, 0.09))
    cl = bpy.context.active_object; cl.name = "Clapper"; cl.data.materials.append(iron)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.006, depth=0.42, vertices=10, location=(0, 0, 0.3))
    rod = bpy.context.active_object; rod.name = "ClapperRod"; rod.data.materials.append(iron)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.05, minor_radius=0.011, major_segments=24, minor_segments=10,
                                     location=(0, 0, 0.6), rotation=(math.radians(90), 0, 0))
    crown = bpy.context.active_object; crown.name = "Crown"; crown.data.materials.append(iron)
    for ob in bpy.context.scene.objects:
        smooth(ob, 45)
    export("bell")


if __name__ == "__main__":
    for n, fn in (("casket", build_casket), ("skull", build_skull), ("candle", build_candle), ("spade", build_spade), ("lantern", build_lantern), ("bell", build_bell)):
        if not ONLY or n in ONLY:
            fn()
