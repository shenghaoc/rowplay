#!/usr/bin/env python3
"""Author RowPlay's open-cockpit racing shell and sliding seat in Blender 5.

The source is deliberately parametric and repository-owned: no downloaded
model, scan, texture, logo, or external asset is involved.  Blender supplies
the reviewed surface construction and bevelled hard-surface forms; the Node
asset build folds the named parts into the existing V3 equipment-template
contract so the deterministic contact rig remains authoritative.
"""

from __future__ import annotations

import argparse
import math
import pathlib
import sys
from collections.abc import Iterable

import bpy
from mathutils import Vector


# These are the physical contact landmarks shared with the runtime rowing rig.
# Keep the shell's fixed stretcher around the same point as the procedural and
# V4 foot targets so the authored boat cannot make correctly solved legs look
# detached or sunk into a panel.
# British Rowing rigging guidance puts a typical racing stretcher at 38-45
# degrees from the hull floor and the seat 15-20 cm above the heels. The board
# is authored as an XY plane, so a -48 degree object rotation leaves that plane
# 42 degrees above horizontal in the exported Three.js coordinate system.
ROWER_FOOT_CONTACT_Y = 0.21
ROWER_FOOT_CONTACT_Z = 0.75
ROWER_STRETCHER_ANGLE = math.radians(-48)
ROWER_STRETCHER_CENTER_Y = 0.295
ROWER_STRETCHER_CENTER_Z = 0.68


def parse_args() -> argparse.Namespace:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser(description="Build the RowPlay rowing shell source")
    parser.add_argument("--output", required=True, type=pathlib.Path)
    return parser.parse_args(args)


def to_blender(value: Iterable[float] | Vector) -> Vector:
    """Map Three/glTF X-right, Y-up, Z-forward into Blender Z-up space."""

    x, y, z = value
    return Vector((x, -z, y))


def set_part_metadata(obj: bpy.types.Object, part: str, role: str) -> None:
    obj["replayAssetPart"] = part
    obj["replayMaterialRole"] = role
    obj["replayAssetSource"] = "repository-authored Blender 5 parametric rowing shell"


def create_mesh_part(
    part: str,
    component: str,
    role: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    *,
    smooth: bool = True,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{part}-{component}-mesh")
    mesh.from_pydata([to_blender(vertex) for vertex in vertices], [], faces)
    mesh.update(calc_edges=True)
    for polygon in mesh.polygons:
        polygon.use_smooth = smooth
    obj = bpy.data.objects.new(f"{part}__{component}", mesh)
    bpy.context.collection.objects.link(obj)
    set_part_metadata(obj, part, role)
    return obj


def add_open_hull() -> None:
    # A real open U-shell: the central athlete volume is never covered by a
    # fake top deck.  Cross-sections taper aggressively into a racing bow and
    # stern while retaining enough side wall to read at replay scale.
    # Racing singles are commonly 7.4-8.3 m long. Keep the athlete/cockpit
    # coordinates unchanged while extending both closed decks into the slender
    # ends of a 7.8 m shell instead of the former 4.2 m toy-like hull.
    stations = [
        (-3.9, 0.018, 0.205, 0.185),
        (-3.68, 0.06, 0.225, 0.12),
        (-3.15, 0.115, 0.245, 0.07),
        (-2.35, 0.165, 0.268, 0.02),
        (-1.35, 0.205, 0.28, -0.008),
        (0.08, 0.222, 0.282, -0.016),
        (1.45, 0.2, 0.278, -0.004),
        (2.45, 0.16, 0.262, 0.04),
        (3.2, 0.11, 0.242, 0.11),
        (3.68, 0.05, 0.22, 0.16),
        (3.9, 0.016, 0.205, 0.185),
    ]
    cross_steps = 24
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, half_width, top_y, bottom_y in stations:
        depth = top_y - bottom_y
        for step in range(cross_steps + 1):
            angle = math.pi * step / cross_steps
            x = half_width * math.cos(angle)
            y = top_y - depth * math.sin(angle)
            vertices.append((x, y, z))
    row = cross_steps + 1
    for station in range(len(stations) - 1):
        for step in range(cross_steps):
            a = station * row + step
            b = a + 1
            c = (station + 1) * row + step
            d = c + 1
            faces.extend([(a, c, b), (b, c, d)])
    # End caps close only the tapered tips, never the cockpit opening.
    faces.append(tuple(reversed(range(row))))
    last = (len(stations) - 1) * row
    faces.append(tuple(last + index for index in range(row)))
    create_mesh_part("hull", "open-u-shell", "equipment-dark", vertices, faces)


def add_deck_surface(
    part: str,
    role: str,
    stations: list[tuple[float, float, float]],
    *,
    component: str,
) -> None:
    across = 14
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, half_width, edge_y in stations:
        for step in range(across + 1):
            fraction = -1 + (2 * step) / across
            x = fraction * half_width
            camber = 0.036 * max(0.0, 1 - fraction * fraction)
            vertices.append((x, edge_y + camber, z))
    row = across + 1
    for station in range(len(stations) - 1):
        for step in range(across):
            a = station * row + step
            b = a + 1
            c = (station + 1) * row + step
            d = c + 1
            # +Y-facing winding after the Three -> Blender axis mapping.
            faces.extend([(a, c, d), (a, d, b)])
    create_mesh_part(part, component, role, vertices, faces)


def add_bevelled_box(
    part: str,
    component: str,
    role: str,
    center: tuple[float, float, float],
    size: tuple[float, float, float],
    *,
    bevel: float = 0.008,
    segments: int = 3,
    rotation_x: float = 0.0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=to_blender(center))
    obj = bpy.context.object
    if obj is None:
        raise RuntimeError("Blender did not create a box")
    obj.name = f"{part}__{component}"
    # Three X/Y/Z size -> Blender X/Y/Z size.
    obj.scale = (size[0] * 0.5, size[2] * 0.5, size[1] * 0.5)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if rotation_x:
        obj.rotation_euler.x = rotation_x
    modifier = obj.modifiers.new(name="manufactured-edge", type="BEVEL")
    modifier.width = bevel
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    set_part_metadata(obj, part, role)
    return obj


def add_cylinder_between(
    part: str,
    component: str,
    role: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius: float,
    *,
    vertices: int = 20,
) -> bpy.types.Object:
    origin = to_blender(start)
    target = to_blender(end)
    direction = target - origin
    length = direction.length
    if length < 1e-6:
        raise ValueError("cylinder endpoints must be distinct")
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=length,
        end_fill_type="NGON",
        location=(origin + target) * 0.5,
    )
    obj = bpy.context.object
    if obj is None:
        raise RuntimeError("Blender did not create a cylinder")
    obj.name = f"{part}__{component}"
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.normalized().to_track_quat("Z", "Y")
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    set_part_metadata(obj, part, role)
    return obj


def add_torus(
    part: str,
    component: str,
    role: str,
    center: tuple[float, float, float],
    major_radius: float,
    minor_radius: float,
) -> bpy.types.Object:
    # Blender's default XY torus maps to the Three XZ plane, which is exactly
    # the horizontal oarlock collar plane around a vertical +Y post.
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=28,
        minor_segments=10,
        location=to_blender(center),
    )
    obj = bpy.context.object
    if obj is None:
        raise RuntimeError("Blender did not create a torus")
    obj.name = f"{part}__{component}"
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    set_part_metadata(obj, part, role)
    return obj


def add_sphere(
    part: str,
    component: str,
    role: str,
    center: tuple[float, float, float],
    radius: float,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=20,
        ring_count=12,
        radius=radius,
        location=to_blender(center),
    )
    obj = bpy.context.object
    if obj is None:
        raise RuntimeError("Blender did not create a sphere")
    obj.name = f"{part}__{component}"
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    set_part_metadata(obj, part, role)
    return obj


def build_boat() -> None:
    add_open_hull()
    add_deck_surface(
        "bow-deck",
        "equipment-painted",
        [
            (-3.88, 0.022, 0.208),
            (-3.55, 0.075, 0.238),
            (-2.8, 0.13, 0.265),
            (-1.8, 0.18, 0.283),
            (-1.2, 0.198, 0.287),
            (-0.8, 0.202, 0.287),
        ],
        component="fore-camber",
    )
    add_deck_surface(
        "stern-deck",
        "equipment-painted",
        [
            (0.94, 0.192, 0.284),
            (1.5, 0.19, 0.282),
            (2.4, 0.158, 0.268),
            (3.2, 0.105, 0.245),
            (3.65, 0.05, 0.22),
            (3.88, 0.02, 0.208),
        ],
        component="aft-camber",
    )

    # Recessed cockpit tub: its floor is below the knees and shoes, with no
    # opaque slab between camera and athlete.  End bulkheads visibly connect
    # the open well to the two deck shells.
    add_bevelled_box(
        "cockpit-tub",
        "floor",
        "equipment-dark",
        (0, 0.145, 0.05),
        (0.27, 0.026, 1.52),
        bevel=0.012,
    )
    for side in (-1, 1):
        add_bevelled_box(
            "cockpit-tub",
            "port-wall" if side < 0 else "starboard-wall",
            "equipment-dark",
            (side * 0.145, 0.205, 0.05),
            (0.026, 0.12, 1.56),
            bevel=0.008,
        )
    add_bevelled_box(
        "bulkheads",
        "aft",
        "equipment-trim",
        (0, 0.23, -0.79),
        (0.32, 0.16, 0.035),
        bevel=0.01,
    )
    add_bevelled_box(
        "bulkheads",
        "fore",
        "equipment-trim",
        (0, 0.23, 0.93),
        (0.32, 0.16, 0.035),
        bevel=0.01,
    )

    # Continuous coamings explain the shell edge without painting a fake
    # cockpit. Twin metal rails are the physical track for the moving seat.
    for side in (-1, 1):
        add_cylinder_between(
            "gunwales",
            "port" if side < 0 else "starboard",
            "equipment-light",
            (side * 0.192, 0.292, -1.42),
            (side * 0.192, 0.292, 1.42),
            0.012,
            vertices=18,
        )
        add_cylinder_between(
            "slide-rails",
            "port" if side < 0 else "starboard",
            "equipment-metal",
            (side * 0.078, 0.267, -0.66),
            (side * 0.078, 0.267, 0.34),
            0.013,
            vertices=18,
        )
    add_cylinder_between(
        "accent-strakes",
        "aft",
        "equipment-light",
        (0, 0.325, -3.55),
        (0, 0.326, -0.9),
        0.012,
        vertices=16,
    )
    add_cylinder_between(
        "accent-strakes",
        "fore",
        "equipment-light",
        (0, 0.323, 1.02),
        (0, 0.3, 3.55),
        0.012,
        vertices=16,
    )
    # World Rowing racing shells carry a visible bow ball. Keep it in the
    # existing light-detail part family so the strict V3 template schema stays
    # compatible while the silhouette gains a recognisable racing-shell end.
    add_sphere(
        "accent-strakes",
        "bow-ball",
        "equipment-light",
        (0, 0.205, -3.91),
        0.042,
    )

    # Angled stretcher, heel cups, and instep bar make the fixed foot contact
    # look load-bearing instead of a detached rectangular prop. The previous
    # tall board rose well above the contact target, so the legs appeared to
    # terminate in front of a wall rather than on a foot stretcher.
    add_bevelled_box(
        "foot-stretcher",
        "board",
        "equipment-dark",
        (0, ROWER_STRETCHER_CENTER_Y, ROWER_STRETCHER_CENTER_Z),
        (0.38, 0.29, 0.036),
        bevel=0.014,
        rotation_x=ROWER_STRETCHER_ANGLE,
    )
    for side in (-1, 1):
        add_bevelled_box(
            "heel-cups",
            "left-heel-cup" if side < 0 else "right-heel-cup",
            "equipment-rubber",
            (side * 0.12, ROWER_FOOT_CONTACT_Y, ROWER_FOOT_CONTACT_Z),
            (0.105, 0.075, 0.12),
            bevel=0.016,
            rotation_x=ROWER_STRETCHER_ANGLE,
        )
    add_cylinder_between(
        "stretcher-hardware",
        "instep-bar",
        "equipment-metal",
        (-0.18, 0.35, 0.625),
        (0.18, 0.35, 0.625),
        0.012,
        vertices=16,
    )
    for side in (-1, 1):
        add_cylinder_between(
            "stretcher-hardware",
            "left-support" if side < 0 else "right-support",
            "equipment-metal",
            (side * 0.17, 0.175, 0.84),
            (side * 0.17, ROWER_STRETCHER_CENTER_Y, ROWER_STRETCHER_CENTER_Z),
            0.009,
            vertices=14,
        )
        add_cylinder_between(
            "heel-cups",
            "left-heel-restraint" if side < 0 else "right-heel-restraint",
            "equipment-rubber",
            (side * 0.12, 0.185, 0.785),
            (side * 0.12, 0.245, 0.72),
            0.006,
            vertices=12,
        )

    # The wing rigger terminates at the exact runtime oar pivots. Diagonal
    # braces and collars make the load path from shell to blade unambiguous.
    # Regulation-scale inboards need a full-width sculling span. Keeping the
    # pins close to the narrow hull crossed the grips at the catch and forced
    # both forearms through the torso; these wider pins keep
    # each hand on its own grip while preserving the long lever and open shell.
    pivots = [(-0.78, 0.38, 0.095), (0.78, 0.38, 0.095)]
    for index, pivot in enumerate(pivots):
        side_name = "port" if index == 0 else "starboard"
        sign = -1 if index == 0 else 1
        add_cylinder_between(
            "riggers",
            f"{side_name}-main",
            "equipment-metal",
            (sign * 0.105, 0.286, -0.02),
            pivot,
            0.019,
            vertices=20,
        )
        add_cylinder_between(
            "riggers",
            f"{side_name}-brace-aft",
            "equipment-metal",
            (sign * 0.17, 0.286, -0.24),
            pivot,
            0.012,
            vertices=16,
        )
        add_cylinder_between(
            "riggers",
            f"{side_name}-brace-fore",
            "equipment-metal",
            (sign * 0.17, 0.286, 0.18),
            pivot,
            0.012,
            vertices=16,
        )
        add_cylinder_between(
            "oarlocks",
            f"{side_name}-post",
            "equipment-metal",
            (pivot[0], 0.284, pivot[2]),
            pivot,
            0.021,
            vertices=18,
        )
        add_torus(
            "oarlocks",
            f"{side_name}-collar",
            "equipment-metal",
            pivot,
            0.034,
            0.008,
        )

    # A restrained stern fin gives the shell a credible underwater profile.
    profile = [
        (0.095, 2.95),
        (0.025, 2.88),
        (-0.055, 2.68),
        (0.045, 2.48),
        (0.095, 2.43),
    ]
    fin_vertices = [(-0.008, y, z) for y, z in profile] + [
        (0.008, y, z) for y, z in profile
    ]
    fin_faces = [tuple(reversed(range(5))), tuple(range(5, 10))]
    for edge in range(5):
        following = (edge + 1) % 5
        fin_faces.append((edge, following, 5 + following, 5 + edge))
    create_mesh_part("keel-fin", "stern", "equipment-dark", fin_vertices, fin_faces)


def build_seat_carriage() -> None:
    # Coordinates are local to the moving runtime seat anchor.
    add_bevelled_box(
        "seat-pad",
        "ergonomic-pad",
        "equipment-trim",
        (0, 0.05, 0),
        (0.31, 0.055, 0.24),
        bevel=0.032,
        segments=5,
    )
    add_bevelled_box(
        "seat-carriage",
        "cross-member",
        "equipment-metal",
        (0, 0.012, 0),
        (0.28, 0.032, 0.2),
        bevel=0.009,
    )
    for side in (-1, 1):
        for fore in (-1, 1):
            # Rollers turn about X and sit directly over the two fixed rails.
            add_cylinder_between(
                "seat-rollers",
                f"{'port' if side < 0 else 'starboard'}-{'aft' if fore < 0 else 'fore'}",
                "equipment-rubber",
                (side * 0.105, -0.012, fore * 0.085),
                (side * 0.05, -0.012, fore * 0.085),
                0.022,
                vertices=20,
            )
    for side in (-1, 1):
        add_bevelled_box(
            "seat-guides",
            "port" if side < 0 else "starboard",
            "equipment-trim",
            (side * 0.078, -0.005, 0),
            (0.026, 0.046, 0.22),
            bevel=0.006,
        )


def main() -> None:
    options = parse_args()
    output = options.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.materials):
        for item in list(collection):
            if item.users == 0:
                collection.remove(item)

    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0

    placeholder = bpy.data.materials.new("RowPlayAuthoringPlaceholder")
    placeholder.diffuse_color = (0.42, 0.48, 0.56, 1.0)
    build_boat()
    build_seat_carriage()
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.data.materials.append(placeholder)
            obj.select_set(True)

    result = bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )
    if "FINISHED" not in result:
        raise RuntimeError(f"Blender glTF export failed: {result}")
    if not output.is_file() or output.stat().st_size == 0:
        raise RuntimeError(f"Blender did not create a non-empty GLB: {output}")
    mesh_count = sum(1 for obj in bpy.context.scene.objects if obj.type == "MESH")
    print(f"wrote Blender rowing-shell source {output}: {mesh_count} components, {output.stat().st_size} bytes")


if __name__ == "__main__":
    main()
