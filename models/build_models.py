"""
Procedural models for the Undertaker's Ledger v4.
Run headless:  blender -b -P models/build_models.py -- static/models
Every mesh is built from primitives in this file, so the repo carries no
third-party geometry. Exports one .glb per model with PBR materials.
Objects that must animate (the casket lid) keep their pivot at the hinge.
"""
import math
import sys
import os
import bpy
import bmesh
from mathutils import Vector

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "static/models"
os.makedirs(OUT, exist_ok=True)


# ── helpers ───────────────────────────────────────────────
def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, color, rough=0.6, metal=0.0, emit=None, emit_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    return m


WOOD = (0.075, 0.045, 0.028)      # near-black ebonised oak
WOOD_HI = (0.14, 0.085, 0.05)
BRASS = (0.72, 0.52, 0.22)
BONE = (0.80, 0.74, 0.60)
IRON = (0.16, 0.16, 0.17)
WAX = (0.90, 0.86, 0.74)
TEAL = (0.16, 0.64, 0.74)


def bevel(obj, width=0.012, segments=3):
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    return mod


def shade_smooth(obj, angle=math.radians(35)):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=angle) if hasattr(bpy.ops.object, "shade_smooth_by_angle") else bpy.ops.object.shade_smooth()
    obj.select_set(False)


def new_mesh_obj(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    if mat:
        ob.data.materials.append(mat)
    return ob


def apply_all(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    obj.select_set(False)


def export(name):
    path = os.path.join(OUT, f"{name}.glb")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_animations=False,
        export_materials="EXPORT", export_texcoords=True, export_normals=True,
        export_draco_mesh_compression_enable=False,
    )
    print(f"wrote {path} ({os.path.getsize(path)//1024} KB)")


def prism(name, profile, depth, mat, z0=0.0):
    """Extrude a closed 2D profile (list of (x, y)) along +Z by depth."""
    bm = bmesh.new()
    verts = [bm.verts.new((x, y, z0)) for x, y in profile]
    bm.faces.new(verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    r = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    up = [g for g in r["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=up, vec=(0, 0, depth))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_mesh_obj(name, bm, mat)


# ── CASKET: Victorian toe-pincher, lid hinged along the back ─
def build_casket():
    clear()
    wood = material("Wood", WOOD, rough=0.45)
    trim = material("Brass", BRASS, rough=0.3, metal=1.0)
    lining = material("Lining", (0.10, 0.03, 0.04), rough=0.9)

    # plan view of the coffin (x across, y along the length). Head at +y.
    L, W_SH, W_HD, W_FT = 2.0, 0.72, 0.46, 0.38
    outer = [(-W_HD / 2, 1.0), (W_HD / 2, 1.0), (W_SH / 2, 0.42), (W_FT / 2, -1.0),
             (-W_FT / 2, -1.0), (-W_SH / 2, 0.42)]
    H = 0.42
    body = prism("CasketBody", outer, H, wood)
    bevel(body, 0.02, 3)

    # hollow it: inset the top face into a cavity
    t = 0.045
    inner = [(x * (1 - t * 2.2 / (abs(x) * 2 + 1e-6)) if abs(x) > 0.01 else x, y * (1 - t / 1.0)) for x, y in outer]
    cavity = prism("Cavity", inner, H, lining, z0=0.07)
    boolm = body.modifiers.new("Hollow", "BOOLEAN")
    boolm.operation = "DIFFERENCE"
    boolm.object = cavity
    apply_all(body)
    bpy.data.objects.remove(cavity)
    # dark lining pad inside
    pad = prism("Lining", [(x * 0.93, y * 0.95) for x, y in inner], 0.04, lining, z0=0.08)

    # lid: same outline, thin, slightly proud, pivot at the back edge (-x side) so it swings open sideways
    lid_h = 0.08
    lid = prism("CasketLid", [(x * 1.01, y * 1.01) for x, y in outer], lid_h, wood, z0=0.0)
    bevel(lid, 0.02, 3)
    apply_all(lid)
    # raised cross on the lid
    bar_v = prism("CrossV", [(-0.035, 0.62), (0.035, 0.62), (0.035, -0.55), (-0.035, -0.55)], 0.025, trim, z0=lid_h)
    bar_h = prism("CrossH", [(-0.19, 0.38), (0.19, 0.38), (0.19, 0.31), (-0.19, 0.31)], 0.025, trim, z0=lid_h)
    for o in (bar_v, bar_h):
        bevel(o, 0.006, 2); apply_all(o)
    # join cross into the lid, then move pivot to the hinge line (x = -W_SH/2, z = H)
    bpy.ops.object.select_all(action="DESELECT")
    for o in (lid, bar_v, bar_h):
        o.select_set(True)
    bpy.context.view_layer.objects.active = lid
    bpy.ops.object.join()
    lid = bpy.context.view_layer.objects.active
    # set origin to the hinge: translate mesh so the hinge line sits at the object origin
    hinge = Vector((-W_SH / 2 * 1.01, 0, 0))
    lid.data.transform(bpy.data.objects[lid.name].matrix_world.inverted() @ __import__("mathutils").Matrix.Translation(-hinge))
    lid.location = hinge + Vector((0, 0, H))

    # brass handles: three per side
    for side in (-1, 1):
        for i, y in enumerate((0.62, 0.05, -0.55)):
            wx = {0: W_HD / 2 * 0.78 + 0.1 * side * 0 + (W_SH / 2 - W_HD / 2) * 0.55, 1: W_SH / 2 * 0.96, 2: (W_SH / 2 + W_FT / 2) / 2 * 0.98}[i]
            bpy.ops.mesh.primitive_torus_add(major_radius=0.07, minor_radius=0.012, major_segments=24, minor_segments=10,
                                             location=(side * (wx + 0.02), y, H * 0.5), rotation=(0, math.radians(90), 0))
            h = bpy.context.active_object
            h.name = f"Handle{side}{i}"
            h.data.materials.append(trim)
            h.scale = (1, 1, 0.6)
            # mounting plate
            bpy.ops.mesh.primitive_cube_add(size=1, location=(side * wx, y, H * 0.5))
            p = bpy.context.active_object
            p.name = f"Plate{side}{i}"
            p.scale = (0.02, 0.1, 0.12)
            p.data.materials.append(trim)
            bevel(p, 0.004, 2)

    # four short feet
    for sx in (-1, 1):
        for sy in (-1, 1):
            bpy.ops.mesh.primitive_cylinder_add(radius=0.05, depth=0.06, vertices=16,
                                                location=(sx * 0.22, sy * 0.78, -0.03))
            f = bpy.context.active_object
            f.name = f"Foot{sx}{sy}"
            f.data.materials.append(wood)

    for ob in bpy.context.scene.objects:
        if ob.type == "MESH":
            shade_smooth(ob)
    export("casket")


# ── CANDLE: wax pillar in a brass holder, wick, no flame (flame is a shader) ─
def build_candle():
    clear()
    wax = material("Wax", WAX, rough=0.55)
    brass = material("Brass", BRASS, rough=0.3, metal=1.0)
    wick = material("Wick", (0.05, 0.04, 0.03), rough=1.0)

    bpy.ops.mesh.primitive_cylinder_add(radius=0.16, depth=0.03, vertices=32, location=(0, 0, 0.015))
    base = bpy.context.active_object; base.name = "HolderBase"; base.data.materials.append(brass); bevel(base, 0.006, 3)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.075, depth=0.06, vertices=32, location=(0, 0, 0.06))
    cup = bpy.context.active_object; cup.name = "HolderCup"; cup.data.materials.append(brass)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.13, minor_radius=0.012, major_segments=32, minor_segments=8,
                                     location=(0.19, 0, 0.05), rotation=(math.radians(90), 0, 0))
    ring = bpy.context.active_object; ring.name = "FingerLoop"; ring.data.materials.append(brass)
    ring.scale = (0.5, 0.5, 0.5)

    # the wax pillar with a sagged top: scale the upper ring down slightly
    bpy.ops.mesh.primitive_cylinder_add(radius=0.062, depth=0.55, vertices=32, location=(0, 0, 0.36))
    pillar = bpy.context.active_object; pillar.name = "Wax"; pillar.data.materials.append(wax)
    bevel(pillar, 0.015, 4)
    # drips: a few small spheres down one side
    for i, (a, z, r) in enumerate(((0.3, 0.55, 0.02), (0.6, 0.48, 0.016), (2.2, 0.52, 0.014))):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=12, ring_count=8,
                                             location=(math.cos(a) * 0.062, math.sin(a) * 0.062, z))
        d = bpy.context.active_object; d.name = f"Drip{i}"; d.data.materials.append(wax); d.scale = (1, 1, 2.2)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.006, depth=0.05, vertices=8, location=(0, 0, 0.655))
    w = bpy.context.active_object; w.name = "Wick"; w.data.materials.append(wick)
    for ob in bpy.context.scene.objects:
        shade_smooth(ob)
    export("candle")


# ── SKULL: cranium, brow, cheekbones, sunken sockets (no booleans: they fail on overlapping shells) ─
def build_skull():
    clear()
    bone = material("Bone", BONE, rough=0.75)
    dark = material("Socket", (0.015, 0.015, 0.015), rough=1.0)

    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, segments=40, ring_count=24, location=(0, 0, 0.55))
    cr = bpy.context.active_object; cr.name = "Cranium"; cr.data.materials.append(bone)
    cr.scale = (0.9, 1.05, 1.0)
    # brow ridge
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.36, 0.56))
    brow = bpy.context.active_object; brow.name = "Brow"; brow.scale = (0.74, 0.3, 0.14); brow.data.materials.append(bone)
    bevel(brow, 0.06, 4)
    # upper face / maxilla
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.3, 0.2))
    face = bpy.context.active_object; face.name = "Face"; face.scale = (0.6, 0.44, 0.5); face.data.materials.append(bone)
    bevel(face, 0.12, 5)
    # cheekbones
    for sx in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.12, segments=16, ring_count=10, location=(sx * 0.33, 0.4, 0.3))
        c = bpy.context.active_object; c.name = f"Cheek{sx}"; c.data.materials.append(bone); c.scale = (1, 0.8, 0.8)
    # sunken eye sockets: shallow black domes sitting just proud of the face
    for sx in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.14, segments=20, ring_count=12, location=(sx * 0.2, 0.5, 0.42))
        s = bpy.context.active_object; s.name = f"Socket{sx}"; s.data.materials.append(dark); s.scale = (1, 0.35, 1.15)
        # bone rim around each socket
        bpy.ops.mesh.primitive_torus_add(major_radius=0.15, minor_radius=0.035, major_segments=24, minor_segments=10,
                                         location=(sx * 0.2, 0.52, 0.42), rotation=(math.radians(90), 0, 0))
        r = bpy.context.active_object; r.name = f"Rim{sx}"; r.data.materials.append(bone); r.scale = (1, 1.15, 1)
    # nasal cavity: black inverted triangle
    nose = prism("Nose", [(-0.07, 0.0), (0.07, 0.0), (0.0, -0.2)], 0.03, dark)
    nose.rotation_euler = (math.radians(90), 0, 0); nose.location = (0, 0.56, 0.3)
    # teeth row and jaw
    for i in range(-3, 4):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(i * 0.075, 0.5, -0.06))
        t = bpy.context.active_object; t.name = f"Tooth{i}"; t.scale = (0.055, 0.06, 0.09); t.data.materials.append(bone)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.3, -0.2))
    jaw = bpy.context.active_object; jaw.name = "Jaw"; jaw.scale = (0.58, 0.44, 0.14); jaw.data.materials.append(bone)
    bevel(jaw, 0.06, 4)
    for ob in bpy.context.scene.objects:
        shade_smooth(ob)
    export("skull")


# ── SHOVEL: iron blade, ash handle, D grip ─
def build_shovel():
    clear()
    iron = material("Iron", IRON, rough=0.5, metal=0.9)
    ash = material("Ash", (0.30, 0.20, 0.11), rough=0.7)
    blade = prism("Blade", [(-0.16, 0.0), (0.16, 0.0), (0.14, -0.30), (0.0, -0.40), (-0.14, -0.30)], 0.012, iron)
    bevel(blade, 0.008, 2)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.022, depth=1.25, vertices=16, location=(0, 0.62, 0.0), rotation=(math.radians(90), 0, 0))
    h = bpy.context.active_object; h.name = "Handle"; h.data.materials.append(ash)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.032, depth=0.18, vertices=16, location=(0, 0.08, 0.0), rotation=(math.radians(90), 0, 0))
    s = bpy.context.active_object; s.name = "Socket"; s.data.materials.append(iron)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.08, minor_radius=0.018, major_segments=24, minor_segments=8,
                                     location=(0, 1.3, 0), rotation=(0, 0, 0))
    g = bpy.context.active_object; g.name = "Grip"; g.data.materials.append(ash); g.scale = (1, 0.8, 1)
    for ob in bpy.context.scene.objects:
        shade_smooth(ob)
    export("shovel")


# ── BELL: brass funeral bell on an iron yoke ─
def build_bell():
    clear()
    brass = material("Brass", BRASS, rough=0.28, metal=1.0)
    iron = material("Iron", IRON, rough=0.6, metal=0.8)
    # lathe a bell profile
    prof = [(0.0, 0.0), (0.22, 0.0), (0.24, 0.04), (0.21, 0.10), (0.17, 0.30), (0.15, 0.46), (0.10, 0.52), (0.0, 0.54)]
    bm = bmesh.new()
    segs = 40
    rings = []
    for (r, z) in prof:
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)) if r > 0 else None)
        rings.append(ring)
    # collapse the zero-radius rings to single verts
    for k in (0, len(prof) - 1):
        v = bm.verts.new((0, 0, prof[k][1]))
        rings[k] = [v] * segs
    for a, b in zip(rings[:-1], rings[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            quad = [a[i], a[j], b[j], b[i]]
            uniq = []
            for q in quad:
                if q not in uniq:
                    uniq.append(q)
            if len(uniq) >= 3:
                try:
                    bm.faces.new(uniq)
                except ValueError:
                    pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bell = new_mesh_obj("Bell", bm, brass)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.035, segments=16, ring_count=10, location=(0, 0, 0.07))
    cl = bpy.context.active_object; cl.name = "Clapper"; cl.data.materials.append(iron)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.05, minor_radius=0.012, major_segments=20, minor_segments=8,
                                     location=(0, 0, 0.58), rotation=(math.radians(90), 0, 0))
    loop = bpy.context.active_object; loop.name = "Crown"; loop.data.materials.append(iron)
    for ob in bpy.context.scene.objects:
        shade_smooth(ob)
    export("bell")


if __name__ == "__main__":
    only = sys.argv[sys.argv.index("--") + 2:] if "--" in sys.argv else []
    for n, fn in (("casket", build_casket), ("candle", build_candle), ("skull", build_skull), ("shovel", build_shovel), ("bell", build_bell)):
        if not only or n in only:
            fn()
