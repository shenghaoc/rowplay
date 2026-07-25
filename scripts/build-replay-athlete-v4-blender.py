#!/usr/bin/env python3
"""Author the production RowPlay V4 athlete surface in Blender 5.

The production surface adapts Blender Studio's reviewed CC0 Human Base Meshes
v1.4.1 realistic male topology into a generic performance athlete:

* one continuous anatomical body from head through hands and feet
* deterministic A-pose-to-V4 rest retargeting without bone-heat or identity data
* canonical V4 skin weights plus repository-authored grip helper influences
* repository-authored eyes, close sports hair, kit trim, shoe trim, and colours

The source is a documented generic anatomical base, not a scan, likeness, user
image, or avatar-generator output. The temporary GLB contributes the visible
mesh, normals, vertex colours, UVs, and skin weights; the Node build seals it
onto the canonical V4 skeleton and deterministic sport clips from
``src/lib/replay/rigV4.ts``.
"""

from __future__ import annotations

import argparse
import math
import pathlib
import sys
from collections import Counter
from dataclasses import dataclass
from typing import Callable, Sequence

import bpy
from mathutils import Vector


DEFAULT_BASE_MESH = (
    pathlib.Path(__file__).resolve().parents[1]
    / "static"
    / "replay-assets"
    / "source"
    / "rowplay-human-base-male-v1.4.1.blend"
)


BONE_DEFINITIONS = [
    ("v4Hips", None, (0.0, 1.02, 0.0)),
    ("v4Spine", "v4Hips", (0.0, 0.19, 0.0)),
    ("v4Chest", "v4Spine", (0.0, 0.235, 0.012)),
    ("v4Neck", "v4Chest", (0.0, 0.145, 0.018)),
    ("v4Head", "v4Neck", (0.0, 0.105, 0.02)),
    ("v4LeftClavicle", "v4Chest", (-0.18, 0.095, 0.01)),
    ("v4LeftUpperArm", "v4LeftClavicle", (-0.06, -0.02, 0.006)),
    ("v4LeftForearm", "v4LeftUpperArm", (-0.365, -0.128, 0.051)),
    ("v4LeftHand", "v4LeftForearm", (-0.354, -0.108, 0.06)),
    ("v4RightClavicle", "v4Chest", (0.18, 0.095, 0.01)),
    ("v4RightUpperArm", "v4RightClavicle", (0.06, -0.02, 0.006)),
    ("v4RightForearm", "v4RightUpperArm", (0.365, -0.128, 0.051)),
    ("v4RightHand", "v4RightForearm", (0.354, -0.108, 0.06)),
    ("v4LeftUpperLeg", "v4Hips", (-0.13, -0.025, 0.0)),
    ("v4LeftLowerLeg", "v4LeftUpperLeg", (0.0, -0.49, 0.038)),
    ("v4LeftFoot", "v4LeftLowerLeg", (0.0, -0.475, 0.065)),
    ("v4RightUpperLeg", "v4Hips", (0.13, -0.025, 0.0)),
    ("v4RightLowerLeg", "v4RightUpperLeg", (0.0, -0.49, 0.038)),
    ("v4RightFoot", "v4RightLowerLeg", (0.0, -0.475, 0.065)),
]

BONE_NAMES = [definition[0] for definition in BONE_DEFINITIONS]

# The Human Base face sets split every digit into anatomical sections. Preserve
# that information in the production skin instead of rotating all four fingers
# as one rigid mitten. `v4*Fingers` remains the stable palm-cup parent and
# `v4*Thumb` remains the proximal thumb joint; the phalanx helpers below are
# visual-only and are never targeted by the three semantic sport clips.
GRIP_DIGIT_FACE_SETS = {
    "Left": {
        "Index": (88, 89, 90, 91),
        "Middle": (92, 93, 94, 95),
        "Ring": (96, 97, 98, 99),
        "Pinky": (100, 101, 102, 103),
        "Thumb": (84, 85, 86, 87),
    },
    "Right": {
        "Index": (76, 77, 78, 79),
        "Middle": (72, 73, 74, 75),
        "Ring": (68, 69, 70, 71),
        "Pinky": (64, 65, 66, 67),
        "Thumb": (80, 81, 82, 83),
    },
}


def grip_digit_bone_names(side_name: str, digit_name: str) -> tuple[str, str, str]:
    if digit_name == "Thumb":
        return (
            f"v4{side_name}Thumb",
            f"v4{side_name}ThumbIntermediate",
            f"v4{side_name}ThumbDistal",
        )
    prefix = f"v4{side_name}{digit_name}"
    return (f"{prefix}Proximal", f"{prefix}Intermediate", f"{prefix}Distal")


HELPER_BONE_NAMES = []
for helper_side_name in ("Left", "Right"):
    HELPER_BONE_NAMES.append(f"v4{helper_side_name}Fingers")
    for helper_digit_name in ("Index", "Middle", "Pinky", "Ring", "Thumb"):
        HELPER_BONE_NAMES.extend(
            grip_digit_bone_names(helper_side_name, helper_digit_name)
        )

GRIP_FACE_SET_BINDINGS = {
    face_set: (side_name, digit_name, segment)
    for side_name, digits in GRIP_DIGIT_FACE_SETS.items()
    for digit_name, face_sets in digits.items()
    for segment, face_set in enumerate(face_sets)
}

CONTACT_OFFSETS = {
    "v4LeftHand": (-0.08, -0.01, 0.035),
    "v4RightHand": (0.08, -0.01, 0.035),
    "v4LeftFoot": (0.0, -0.055, 0.13),
    "v4RightFoot": (0.0, -0.055, 0.13),
}

ALL_DEFORM_BONE_NAMES = BONE_NAMES + HELPER_BONE_NAMES

# sRGB vertex colours (written via Blender sRGB colour attributes).
FABRIC = (0.09, 0.14, 0.28, 1.0)
FABRIC_SIDE = (0.035, 0.055, 0.12, 1.0)
FABRIC_LIGHT = (0.18, 0.28, 0.52, 1.0)
SHORTS = (0.035, 0.045, 0.07, 1.0)
SHORTS_PANEL = (0.065, 0.08, 0.12, 1.0)
TRIM = (0.26, 0.38, 0.72, 1.0)
LEG_FABRIC = (0.075, 0.12, 0.15, 1.0)
LEG_FABRIC_SIDE = (0.04, 0.075, 0.095, 1.0)
SKIN = (0.64, 0.39, 0.285, 1.0)
SKIN_LIGHT = (0.73, 0.49, 0.37, 1.0)
SKIN_WARM = (0.69, 0.405, 0.285, 1.0)
SKIN_SHADOW = (0.49, 0.285, 0.225, 1.0)
HAIR = (0.13, 0.035, 0.008, 1.0)
HAIR_MID = (0.145, 0.041, 0.01, 1.0)
HAIR_HIGHLIGHT = (0.16, 0.05, 0.013, 1.0)
# Face accents stay chocolate-brown rather than black. They are applied only as
# compact anatomical regions; continuous painted masks remain forbidden.
IRIS = (0.24, 0.10, 0.035, 1.0)
LIMBAL = (0.075, 0.028, 0.012, 1.0)
PUPIL = (0.035, 0.018, 0.012, 1.0)
EYE_WHITE = (0.86, 0.82, 0.75, 1.0)
EYE_GLINT = (0.94, 0.97, 1.0, 1.0)
BROW = (0.25, 0.13, 0.08, 1.0)
MOUTH = (0.44, 0.24, 0.17, 1.0)
MOUTH_DARK = (0.29, 0.12, 0.09, 1.0)
NOSTRIL = (0.19, 0.075, 0.045, 1.0)
SHOE = (0.24, 0.28, 0.32, 1.0)
SHOE_DARK = (0.045, 0.055, 0.07, 1.0)
SOLE = (0.018, 0.024, 0.032, 1.0)

def parse_args() -> argparse.Namespace:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser(description="Build the RowPlay production athlete surface")
    parser.add_argument("--output", required=True, type=pathlib.Path)
    parser.add_argument("--base-mesh", default=DEFAULT_BASE_MESH, type=pathlib.Path)
    return parser.parse_args(args)


def to_blender(value: Vector) -> Vector:
    return Vector((value.x, -value.z, value.y))


def from_blender(value: Vector) -> Vector:
    return Vector((value.x, value.z, -value.y))


def normalized(weights: dict[str, float]) -> dict[str, float]:
    cleaned = {name: max(0.0, value) for name, value in weights.items() if value > 1e-7}
    total = sum(cleaned.values())
    if total <= 1e-8:
        raise ValueError("skin weight set cannot be empty")
    return {name: value / total for name, value in cleaned.items()}


def global_bone_positions() -> dict[str, Vector]:
    result: dict[str, Vector] = {}
    for name, parent, local in BONE_DEFINITIONS:
        position = Vector(local)
        if parent is not None:
            position += result[parent]
        result[name] = position
    return result


@dataclass(frozen=True)
class Ring:
    center: Vector
    radii: tuple[float, float]
    weights: dict[str, float]
    color: tuple[float, float, float, float]
    squash: float = 0.0
    front_bias: float = 0.0


class AthleteMeshBuilder:
    def __init__(self) -> None:
        self.vertices: list[tuple[float, float, float]] = []
        self.faces: list[tuple[int, ...]] = []
        self.colors: list[tuple[float, float, float, float]] = []
        self.weights: list[dict[str, float]] = []

    def add_vertex(
        self,
        position: Vector,
        weights: dict[str, float],
        color: tuple[float, float, float, float],
    ) -> int:
        index = len(self.vertices)
        mapped = to_blender(position)
        self.vertices.append((mapped.x, mapped.y, mapped.z))
        self.colors.append(color)
        self.weights.append(normalized(weights))
        return index

    def add_loft(
        self,
        rings: Sequence[Ring],
        radial_segments: int,
        normal_hint: Vector = Vector((1.0, 0.0, 0.0)),
        color_function: Callable | None = None,
        cap_start: bool = True,
        cap_end: bool = True,
    ) -> None:
        rings = list(rings)
        if len(rings) < 2:
            raise ValueError("loft requires at least two rings")
        start = len(self.vertices)
        previous_normal = Vector(normal_hint)
        for ring_index, ring in enumerate(rings):
            previous = rings[max(0, ring_index - 1)].center
            following = rings[min(len(rings) - 1, ring_index + 1)].center
            tangent = (following - previous).normalized()
            normal = Vector(normal_hint if ring_index == 0 else previous_normal)
            normal -= tangent * normal.dot(tangent)
            if normal.length_squared < 1e-8:
                normal = Vector((0.0, 0.0, 1.0))
                normal -= tangent * normal.dot(tangent)
            normal.normalize()
            bitangent = tangent.cross(normal).normalized()
            previous_normal = normal
            for side in range(radial_segments):
                angle = side / radial_segments * math.tau
                cos_a = math.cos(angle)
                sin_a = math.sin(angle)
                contour = 1.0 + ring.squash * math.cos(angle * 2.0)
                contour += ring.front_bias * max(0.0, sin_a)
                point = (
                    ring.center
                    + normal * (cos_a * ring.radii[0] * contour)
                    + bitangent * (sin_a * ring.radii[1] / max(0.6, contour * 0.9 + 0.1))
                )
                color = (
                    color_function(ring_index, angle, point, ring)
                    if color_function is not None
                    else ring.color
                )
                self.add_vertex(point, ring.weights, color)

        for ring_index in range(len(rings) - 1):
            lower = start + ring_index * radial_segments
            upper = lower + radial_segments
            for side in range(radial_segments):
                following = (side + 1) % radial_segments
                self.faces.append((lower + side, upper + side, upper + following, lower + following))

        if cap_start:
            center = self.add_vertex(rings[0].center, rings[0].weights, rings[0].color)
            for side in range(radial_segments):
                following = (side + 1) % radial_segments
                self.faces.append((center, start + following, start + side))
        if cap_end:
            center = self.add_vertex(rings[-1].center, rings[-1].weights, rings[-1].color)
            ring_start = start + (len(rings) - 1) * radial_segments
            for side in range(radial_segments):
                following = (side + 1) % radial_segments
                self.faces.append((center, ring_start + side, ring_start + following))


def add_authored_footwear(surface: bpy.types.Object, bones: dict[str, Vector]) -> None:
    """Join performance shoes over the continuous remeshed ankle chains."""

    for side_name in ("Left", "Right"):
        foot_name = f"v4{side_name}Foot"
        ankle = bones[foot_name]
        builder = AthleteMeshBuilder()

        bone_cleat = ankle + Vector(CONTACT_OFFSETS[foot_name])
        bone_toe = ankle + Vector((0, -0.032, 0.22))
        bone_heel = ankle + Vector((0, -0.03, -0.048))
        bone_mid = ankle + Vector((0, -0.04, 0.09))
        weights = {foot_name: 1.0}
        builder.add_loft(
            [
                Ring(bone_heel, (0.044, 0.034), weights, SHOE_DARK, 0.03),
                Ring(ankle + Vector((0, -0.016, -0.01)), (0.05, 0.04), weights, SHOE, 0.04),
                Ring(bone_mid, (0.055, 0.043), weights, SHOE, 0.05),
                Ring(bone_cleat, (0.058, 0.039), weights, SHOE, 0.04),
                Ring(bone_toe, (0.05, 0.027), weights, SHOE, 0.02),
            ],
            30,
            Vector((1, 0, 0)),
        )
        builder.add_loft(
            [
                Ring(bone_heel + Vector((0, -0.03, 0.0)), (0.046, 0.009), weights, SOLE),
                Ring(bone_mid + Vector((0, -0.032, 0.0)), (0.057, 0.01), weights, SOLE),
                Ring(bone_cleat + Vector((0, -0.03, 0.0)), (0.06, 0.009), weights, SOLE),
                Ring(bone_toe + Vector((0, -0.022, -0.004)), (0.052, 0.008), weights, SOLE),
            ],
            24,
            Vector((1, 0, 0)),
        )
        join_builder_detail(
            surface,
            f"rowplay-v4-footwear-{side_name.lower()}",
            builder,
            default_bone=foot_name,
        )
        for lace_index, forward in enumerate((0.055, 0.09, 0.125)):
            join_ellipsoid_detail(
                surface,
                f"rowplay-v4-footwear-{side_name.lower()}-lace-{lace_index}",
                ankle + Vector((0, -0.006, forward)),
                (0.043 - lace_index * 0.0025, 0.006, 0.0018),
                TRIM,
                foot_name,
                segments=18,
                rings=8,
            )


def hand_helper_landmarks(
    bones: dict[str, Vector], side_name: str
) -> tuple[Vector, Vector, Vector, Vector, Vector, Vector]:
    """Return wrist, contact, forward, palm_right, palm_up, knuckle for one hand."""

    hand_name = f"v4{side_name}Hand"
    wrist = bones[hand_name]
    contact = wrist + Vector(CONTACT_OFFSETS[hand_name])
    forward, palm_right, palm_up = hand_basis(wrist, contact, side_name)
    knuckle = contact - forward * 0.004 + palm_up * 0.006
    return wrist, contact, forward, palm_right, palm_up, knuckle


def create_armature(
    bones: dict[str, Vector], grip_centers: dict[int, Vector]
) -> bpy.types.Object:
    armature_data = bpy.data.armatures.new("RowPlayV4Armature")
    armature = bpy.data.objects.new("RowPlayV4Armature", armature_data)
    bpy.context.scene.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    children: dict[str, list[str]] = {name: [] for name in BONE_NAMES}
    for name, parent, _local in BONE_DEFINITIONS:
        if parent:
            children[parent].append(name)

    edit_bones = {}
    for name, parent, _local in BONE_DEFINITIONS:
        bone = armature_data.edit_bones.new(name)
        bone.head = to_blender(bones[name])
        child_names = children[name]
        if child_names:
            preferred = child_names[0]
            for candidate in child_names:
                if any(token in candidate for token in ("Spine", "Chest", "Neck", "Head")):
                    preferred = candidate
                    break
            bone.tail = to_blender(bones[preferred])
        elif parent is not None:
            direction = (bones[name] - bones[parent]).normalized()
            bone.tail = to_blender(bones[name] + direction * 0.14)
        else:
            bone.tail = bone.head + Vector((0, 0, 0.15))
        if (bone.tail - bone.head).length < 0.02:
            bone.tail = bone.head + Vector((0, 0, 0.1))
        bone.use_deform = True
        edit_bones[name] = bone
        if parent is not None:
            bone.parent = edit_bones[parent]
            bone.use_connect = False

    # Visual grip helpers. Each source phalanx gets its own joint so fingers can
    # form a cylindrical wrap instead of swinging as one straight fan.
    for side_name in ("Left", "Right"):
        hand_name = f"v4{side_name}Hand"
        _wrist, _contact, _forward, _palm_right, palm_up, _knuckle = hand_helper_landmarks(
            bones, side_name
        )
        fingers_name = f"v4{side_name}Fingers"
        digit_points: dict[str, tuple[Vector, Vector, Vector, Vector]] = {}
        for digit_name, face_sets in GRIP_DIGIT_FACE_SETS[side_name].items():
            try:
                digit_points[digit_name] = tuple(
                    grip_centers[face_set] for face_set in face_sets
                )
            except KeyError as error:
                raise RuntimeError(
                    f"reviewed human base is missing {side_name} {digit_name} face set "
                    f"{error.args[0]}"
                ) from error

        finger_bases = []
        finger_first_joints = []
        for digit_name in ("Index", "Middle", "Ring", "Pinky"):
            first, second, _third, _tip = digit_points[digit_name]
            finger_bases.append(first + (first - second) * 0.62)
            finger_first_joints.append(first.lerp(second, 0.54))

        fingers = armature_data.edit_bones.new(fingers_name)
        fingers.head = to_blender(
            sum(finger_bases, Vector((0.0, 0.0, 0.0))) / len(finger_bases)
        )
        fingers.tail = to_blender(
            sum(finger_first_joints, Vector((0.0, 0.0, 0.0)))
            / len(finger_first_joints)
        )
        fingers.parent = edit_bones[hand_name]
        fingers.use_connect = False
        fingers.use_deform = True
        fingers.align_roll(to_blender(palm_up))
        edit_bones[fingers_name] = fingers

        # Blender exports sibling joints in this stable lexical order.
        for digit_name in ("Index", "Middle", "Pinky", "Ring", "Thumb"):
            first, second, third, tip = digit_points[digit_name]
            base = first + (first - second) * 0.62
            first_joint = first.lerp(second, 0.54)
            second_joint = second.lerp(third, 0.56)
            fingertip = tip + (tip - third) * 0.16
            names = grip_digit_bone_names(side_name, digit_name)
            points = (base, first_joint, second_joint, fingertip)
            parent_name = hand_name if digit_name == "Thumb" else fingers_name
            for index, name in enumerate(names):
                bone = armature_data.edit_bones.new(name)
                bone.head = to_blender(points[index])
                bone.tail = to_blender(points[index + 1])
                bone.parent = edit_bones[parent_name]
                bone.use_connect = index > 0
                bone.use_deform = True
                bone.align_roll(to_blender(palm_up))
                edit_bones[name] = bone
                parent_name = name

    bpy.ops.object.mode_set(mode="OBJECT")
    return armature



def join_builder_detail(
    surface: bpy.types.Object,
    name: str,
    builder: AthleteMeshBuilder,
    *,
    default_bone: str,
) -> None:
    """Join an AthleteMeshBuilder island into the production skinned surface."""

    if not builder.vertices:
        return
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(builder.vertices, [], list(builder.faces))
    mesh.update(calc_edges=True)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    color_layer = mesh.color_attributes.new(name="Color", type="BYTE_COLOR", domain="POINT")
    for index, color in enumerate(builder.colors):
        color_layer.data[index].color_srgb = color
    mesh.color_attributes.active_color = color_layer
    mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index
    detail = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(detail)
    needed = set(ALL_DEFORM_BONE_NAMES)
    for weights in builder.weights:
        needed.update(weights.keys())
    groups = {bone_name: detail.vertex_groups.new(name=bone_name) for bone_name in sorted(needed)}
    for vertex_index, weights in enumerate(builder.weights):
        ranked = sorted(weights.items(), key=lambda item: item[1], reverse=True)[:4]
        total = sum(value for _name, value in ranked) or 1.0
        if total <= 1e-8:
            groups[default_bone].add([vertex_index], 1.0, "REPLACE")
            continue
        for bone_name, value in ranked:
            groups[bone_name].add([vertex_index], value / total, "REPLACE")
    bpy.ops.object.select_all(action="DESELECT")
    surface.select_set(True)
    detail.select_set(True)
    bpy.context.view_layer.objects.active = surface
    bpy.ops.object.join()


def join_ellipsoid_detail(
    surface: bpy.types.Object,
    name: str,
    location: Vector,
    scale: tuple[float, float, float],
    color_value: tuple[float, float, float, float],
    bone_name: str,
    *,
    segments: int = 24,
    rings: int = 12,
    rotation_y: float = 0.0,
) -> None:
    """Join one shallow ellipsoid island into the shared production mesh."""

    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=to_blender(location),
    )
    detail = bpy.context.active_object
    detail.name = name
    detail.scale = scale
    detail.rotation_euler[1] = rotation_y
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for polygon in detail.data.polygons:
        polygon.use_smooth = True
    color = detail.data.color_attributes.new(name="Color", type="BYTE_COLOR", domain="POINT")
    for value in color.data:
        value.color_srgb = color_value
    group = detail.vertex_groups.new(name=bone_name)
    group.add(list(range(len(detail.data.vertices))), 1.0, "REPLACE")
    bpy.ops.object.select_all(action="DESELECT")
    surface.select_set(True)
    detail.select_set(True)
    bpy.context.view_layer.objects.active = surface
    bpy.ops.object.join()


def hand_basis(wrist: Vector, contact: Vector, side_name: str) -> tuple[Vector, Vector, Vector]:
    """Return (forward, palm_right, palm_up) axes for an authored hand."""

    forward = (contact - wrist).normalized()
    world_up = Vector((0.0, 1.0, 0.0))
    palm_right = forward.cross(world_up)
    if palm_right.length_squared < 1e-8:
        palm_right = Vector((1.0 if side_name == "Right" else -1.0, 0.0, 0.0))
    else:
        palm_right.normalize()
    # Keep the palm interior facing the athlete midline so grips read correctly.
    if side_name == "Left" and palm_right.x > 0:
        palm_right = -palm_right
    if side_name == "Right" and palm_right.x < 0:
        palm_right = -palm_right
    palm_up = palm_right.cross(forward).normalized()
    if palm_up.y < 0:
        palm_up = -palm_up
        palm_right = -palm_right
    return forward, palm_right, palm_up



def add_short_hair_cap(surface: bpy.types.Object, bones: dict[str, Vector]) -> None:
    """Duplicate the reviewed scalp into a close, curved sports haircut.

    A primitive sphere produces a mathematically level rim and reads as a
    helmet in a front close-up. Reusing the anatomical scalp preserves the
    cranium, temples, forehead, and occipital silhouette. The curved threshold
    creates a higher forehead, lower rear hairline, mild temple recession, and
    restrained centre peak without importing identity or hair-card assets.
    """

    del bones
    source_mesh = surface.data
    source_mesh.update(calc_edges=True)
    selected_faces: list[tuple[int, ...]] = []
    selected_vertices: set[int] = set()
    for polygon in source_mesh.polygons:
        points = [from_blender(source_mesh.vertices[index].co) for index in polygon.vertices]
        center = sum(points, Vector((0.0, 0.0, 0.0))) / len(points)
        if center.y < 1.66 or abs(center.x) > 0.145:
            continue
        front = max(0.0, min(1.0, (center.z + 0.075) / 0.205))
        temple = max(0.0, min(1.0, abs(center.x) / 0.105))
        centre_peak = math.exp(-((center.x / 0.025) ** 2)) * front
        hairline = (
            1.675
            + 0.096 * front
            + 0.018 * (temple**1.7) * front
            - 0.011 * centre_peak
        )
        if center.y < hairline:
            continue
        face = tuple(polygon.vertices)
        selected_faces.append(face)
        selected_vertices.update(face)
    if not selected_faces:
        raise RuntimeError("reviewed human scalp did not produce a hair shell")

    ordered = sorted(selected_vertices)
    remap = {source_index: index for index, source_index in enumerate(ordered)}
    vertices = []
    for source_index in ordered:
        source_vertex = source_mesh.vertices[source_index]
        point = from_blender(source_vertex.co)
        azimuth = math.atan2(point.z, point.x)
        strand = math.sin(azimuth * 19.0 + point.y * 31.0)
        breakup = math.sin(azimuth * 7.0 - point.y * 43.0)
        crown = max(0.0, min(1.0, (point.y - 1.69) / 0.115))
        side_fade = max(0.0, min(1.0, (0.145 - abs(point.x)) / 0.085))
        # A close fade stays nearly flush at the temples while the crown gains
        # enough irregular volume to stop reading as a painted skull cap.
        lift = (
            0.0014
            + crown * (0.0065 + 0.0042 * side_fade)
            + 0.0012 * strand * crown
            + 0.00075 * breakup
        )
        vertices.append(source_vertex.co + source_vertex.normal.normalized() * lift)
    faces = [tuple(remap[index] for index in face) for face in selected_faces]

    hair_mesh = bpy.data.meshes.new("rowplay-v4-short-hair-scalp")
    hair_mesh.from_pydata(vertices, [], faces)
    hair_mesh.update(calc_edges=True)
    hair = bpy.data.objects.new("rowplay-v4-short-hair-scalp", hair_mesh)
    bpy.context.scene.collection.objects.link(hair)
    bpy.ops.object.select_all(action="DESELECT")
    hair.select_set(True)
    bpy.context.view_layer.objects.active = hair
    subdivision = hair.modifiers.new(name="HairlineSubdivision", type="SUBSURF")
    subdivision.subdivision_type = "CATMULL_CLARK"
    subdivision.levels = 1
    subdivision.render_levels = 1
    bpy.ops.object.modifier_apply(modifier=subdivision.name)
    shrinkwrap = hair.modifiers.new(name="ScalpConform", type="SHRINKWRAP")
    shrinkwrap.target = surface
    shrinkwrap.wrap_method = "NEAREST_SURFACEPOINT"
    shrinkwrap.wrap_mode = "ABOVE_SURFACE"
    shrinkwrap.offset = 0.0025
    bpy.ops.object.modifier_apply(modifier=shrinkwrap.name)
    hair_mesh = hair.data
    for polygon in hair_mesh.polygons:
        polygon.use_smooth = True
    color = hair_mesh.color_attributes.new(name="Color", type="BYTE_COLOR", domain="POINT")
    for index, value in enumerate(color.data):
        # Vertex-index hashing breaks up the shell without the concentric
        # contour bands created by position-based stripes on a scalp mesh.
        strand_mix = (index * 37 + index * index * 11 + 17) % 101
        value.color_srgb = HAIR_HIGHLIGHT if strand_mix > 91 else HAIR_MID if strand_mix > 55 else HAIR
    group = hair.vertex_groups.new(name="v4Head")
    group.add(list(range(len(hair_mesh.vertices))), 1.0, "REPLACE")
    bpy.ops.object.select_all(action="DESELECT")
    surface.select_set(True)
    hair.select_set(True)
    bpy.context.view_layer.objects.active = surface
    bpy.ops.object.join()



BASE_BODY_NAME = "rowplayHumanBaseBody"
BASE_EYE_NAMES = ("rowplayHumanBaseEyeLeft", "rowplayHumanBaseEyeRight")
BASE_SCALE = Vector((1.02, 0.96, 1.08))
BASE_VERTICAL_OFFSET = 0.008


def transform_base_point(point: Vector) -> Vector:
    """Map the reviewed 1.69 m anatomical base into the V4 metre stage."""

    return Vector(
        (
            point.x * BASE_SCALE.x,
            point.y * BASE_SCALE.y,
            point.z * BASE_SCALE.z + BASE_VERTICAL_OFFSET,
        )
    )


def segment_map(
    point: Vector,
    source_start: Vector,
    source_end: Vector,
    target_start: Vector,
    target_end: Vector,
    *,
    radial_scale: float = 1.0,
) -> Vector:
    """Articulate one source limb segment into the canonical V4 rest segment."""

    source_delta = source_end - source_start
    target_delta = target_end - target_start
    source_length = source_delta.length
    target_length = target_delta.length
    if source_length < 1e-6 or target_length < 1e-6:
        raise ValueError("retarget segment cannot have zero length")
    source_axis = source_delta / source_length
    target_axis = target_delta / target_length
    fraction = (point - source_start).dot(source_axis) / source_length
    source_center = source_start + source_delta * fraction
    radial = point - source_center
    rotation = source_axis.rotation_difference(target_axis)
    # Preserve anatomical girth while mapping longitudinal length. The source
    # is already human-proportioned; scaling radial mass with the long RowPlay
    # contact reach is what produced the previous inflatable limbs.
    return target_start + target_delta * fraction + rotation @ (radial * radial_scale)


def source_vertex_face_sets(mesh: bpy.types.Mesh) -> list[int]:
    """Return the dominant sculpt face-set id for each subdivided source vertex."""

    attribute = mesh.attributes.get(".sculpt_face_set")
    if attribute is None or attribute.domain != "FACE":
        raise RuntimeError("reviewed human base is missing its anatomical face sets")
    counts = [Counter() for _ in mesh.vertices]
    for polygon, value in zip(mesh.polygons, attribute.data, strict=True):
        for vertex_index in polygon.vertices:
            counts[vertex_index][value.value] += 1
    return [counter.most_common(1)[0][0] if counter else 0 for counter in counts]


def base_retarget_chains(
    bones: dict[str, Vector],
) -> dict[str, tuple[tuple[Vector, Vector], ...]]:
    """Source and canonical limb chains in Blender coordinates."""

    chains: dict[str, tuple[tuple[Vector, Vector], ...]] = {}
    for side_name, side in (("Left", -1.0), ("Right", 1.0)):
        arm_source = tuple(
            transform_base_point(Vector((side * x, depth, height)))
            for x, depth, height in (
                (0.175, -0.012, 1.425),
                (0.292, -0.018, 1.075),
                (0.382, -0.085, 0.86),
                (0.435, -0.122, 0.745),
            )
        )
        hand_name = f"v4{side_name}Hand"
        arm_target = (
            to_blender(bones[f"v4{side_name}UpperArm"]),
            to_blender(bones[f"v4{side_name}Forearm"]),
            to_blender(bones[hand_name]),
            to_blender(bones[hand_name] + Vector(CONTACT_OFFSETS[hand_name])),
        )
        chains[f"{side_name}Arm"] = tuple(zip(arm_source, arm_target, strict=True))

        leg_source = tuple(
            transform_base_point(Vector((side * x, depth, height)))
            for x, depth, height in (
                (0.105, 0.0, 0.95),
                (0.108, -0.005, 0.445),
                (0.132, -0.012, 0.055),
                (0.205, -0.118, 0.008),
            )
        )
        foot_name = f"v4{side_name}Foot"
        leg_target = (
            to_blender(bones[f"v4{side_name}UpperLeg"]),
            to_blender(bones[f"v4{side_name}LowerLeg"]),
            to_blender(bones[foot_name]),
            to_blender(bones[foot_name] + Vector(CONTACT_OFFSETS[foot_name])),
        )
        chains[f"{side_name}Leg"] = tuple(zip(leg_source, leg_target, strict=True))
    return chains


def retarget_base_vertex(
    point: Vector,
    face_set: int,
    chains: dict[str, tuple[tuple[Vector, Vector], ...]],
) -> Vector:
    """Retarget a reviewed anatomical region without changing the motion rig."""

    mapped = transform_base_point(point)
    if face_set == 20:
        source, target = zip(*chains["LeftArm"], strict=True)
        articulated = segment_map(
            mapped, source[0], source[1], target[0], target[1], radial_scale=0.9
        )
        shoulder_blend = max(0.0, min(1.0, (abs(mapped.x) - 0.16) / 0.14))
        shoulder_blend = shoulder_blend * shoulder_blend * (3.0 - 2.0 * shoulder_blend)
        return mapped.lerp(articulated, shoulder_blend)
    if face_set == 21:
        source, target = zip(*chains["RightArm"], strict=True)
        articulated = segment_map(
            mapped, source[0], source[1], target[0], target[1], radial_scale=0.9
        )
        shoulder_blend = max(0.0, min(1.0, (abs(mapped.x) - 0.16) / 0.14))
        shoulder_blend = shoulder_blend * shoulder_blend * (3.0 - 2.0 * shoulder_blend)
        return mapped.lerp(articulated, shoulder_blend)
    if face_set == 11:
        source, target = zip(*chains["LeftArm"], strict=True)
        return segment_map(
            mapped, source[1], source[2], target[1], target[2], radial_scale=0.92
        )
    if face_set == 12:
        source, target = zip(*chains["RightArm"], strict=True)
        return segment_map(
            mapped, source[1], source[2], target[1], target[2], radial_scale=0.92
        )
    if face_set == 10 or 84 <= face_set <= 103:
        source, target = zip(*chains["LeftArm"], strict=True)
        return segment_map(mapped, source[2], source[3], target[2], target[3])
    if face_set == 9 or 64 <= face_set <= 83:
        source, target = zip(*chains["RightArm"], strict=True)
        return segment_map(mapped, source[2], source[3], target[2], target[3])

    if face_set == 23:
        source, target = zip(*chains["LeftLeg"], strict=True)
        return segment_map(mapped, source[0], source[1], target[0], target[1])
    if face_set == 24:
        source, target = zip(*chains["RightLeg"], strict=True)
        return segment_map(mapped, source[0], source[1], target[0], target[1])
    if face_set == 16:
        source, target = zip(*chains["LeftLeg"], strict=True)
        return segment_map(mapped, source[1], source[2], target[1], target[2])
    if face_set == 15:
        source, target = zip(*chains["RightLeg"], strict=True)
        return segment_map(mapped, source[1], source[2], target[1], target[2])
    if point.z < 0.15:
        chain_name = "LeftLeg" if point.x < 0 else "RightLeg"
        source, target = zip(*chains[chain_name], strict=True)
        return segment_map(
            mapped,
            source[2],
            source[3],
            target[2],
            target[3],
            radial_scale=0.72,
        )
    return mapped


def blend_pair(
    first: str,
    second: str,
    fraction: float,
    *,
    first_floor: float = 0.0,
) -> dict[str, float]:
    amount = max(0.0, min(1.0, fraction))
    first_weight = max(first_floor, 1.0 - amount)
    return {first: first_weight, second: amount}


def base_vertex_weights(face_set: int, point: Vector) -> dict[str, float]:
    """Assign deterministic four-influence skin weights to the retargeted base."""

    left_upper = face_set == 20
    right_upper = face_set == 21
    left_forearm = face_set == 11
    right_forearm = face_set == 12
    left_hand = face_set == 10 or 84 <= face_set <= 103
    right_hand = face_set == 9 or 64 <= face_set <= 83

    if left_upper or right_upper:
        side_name = "Left" if left_upper else "Right"
        shoulder_x = abs(point.x)
        if shoulder_x < 0.22:
            return {
                "v4Chest": 0.25,
                f"v4{side_name}Clavicle": 0.5,
                f"v4{side_name}UpperArm": 0.25,
            }
        if shoulder_x < 0.38:
            arm_blend = max(0.0, min(1.0, (shoulder_x - 0.22) / 0.16))
            return {
                "v4Chest": 0.25 * (1.0 - arm_blend),
                f"v4{side_name}Clavicle": 0.5 * (1.0 - arm_blend),
                f"v4{side_name}UpperArm": 0.25 + 0.75 * arm_blend,
            }
        if shoulder_x > 0.55:
            return {
                f"v4{side_name}UpperArm": 0.72,
                f"v4{side_name}Forearm": 0.28,
            }
        return {f"v4{side_name}UpperArm": 1.0}

    if left_forearm or right_forearm:
        side_name = "Left" if left_forearm else "Right"
        wrist_blend = max(0.0, min(0.3, (abs(point.x) - 0.82) * 1.5))
        return {
            f"v4{side_name}Forearm": 1.0 - wrist_blend,
            f"v4{side_name}Hand": wrist_blend,
        }

    if left_hand or right_hand:
        side_name = "Left" if left_hand else "Right"
        if face_set in ({10} if left_hand else {9}):
            return {f"v4{side_name}Hand": 1.0}
        binding = GRIP_FACE_SET_BINDINGS.get(face_set)
        if binding is None:
            return {f"v4{side_name}Hand": 1.0}
        _bound_side, digit_name, segment = binding
        proximal, middle, distal = grip_digit_bone_names(side_name, digit_name)
        if segment == 0:
            if digit_name == "Thumb":
                return {f"v4{side_name}Hand": 0.18, proximal: 0.82}
            return {
                f"v4{side_name}Hand": 0.18,
                f"v4{side_name}Fingers": 0.12,
                proximal: 0.7,
            }
        if segment == 1:
            return {proximal: 0.15, middle: 0.85}
        if segment == 2:
            return {middle: 0.15, distal: 0.85}
        return {distal: 1.0}

    if face_set in {23, 24}:
        side_name = "Left" if face_set == 23 else "Right"
        hip_blend = max(0.0, min(0.35, (point.z - 0.82) * 1.8))
        return {
            f"v4{side_name}UpperLeg": 1.0 - hip_blend,
            "v4Hips": hip_blend,
        }
    if face_set in {16, 15}:
        side_name = "Left" if face_set == 16 else "Right"
        knee_blend = max(0.0, min(0.28, (point.z - 0.45) * 2.4))
        return {
            f"v4{side_name}LowerLeg": 1.0 - knee_blend,
            f"v4{side_name}UpperLeg": knee_blend,
        }
    if point.z < 0.18:
        side_name = "Left" if point.x < 0 else "Right"
        return {f"v4{side_name}Foot": 1.0}

    if point.z < 1.08:
        side_name = "Left" if point.x < 0 else "Right"
        lateral = min(1.0, abs(point.x) / 0.13)
        return {
            "v4Hips": 0.68 + 0.2 * (1.0 - lateral),
            f"v4{side_name}UpperLeg": 0.32 - 0.2 * (1.0 - lateral),
        }
    if point.z < 1.25:
        return blend_pair("v4Hips", "v4Spine", (point.z - 1.08) / 0.17)
    if point.z < 1.48:
        return blend_pair("v4Spine", "v4Chest", (point.z - 1.25) / 0.23)
    if point.z < 1.58:
        return {"v4Chest": 0.62, "v4Neck": 0.38}
    if point.z < 1.66:
        return {
            "v4Chest": 0.12,
            "v4Neck": 0.52,
            "v4Head": 0.36,
        }
    return {"v4Head": 1.0}


def load_base_objects(source: pathlib.Path) -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    source = source.resolve()
    if not source.is_file():
        raise RuntimeError(f"missing reviewed human base source: {source}")
    names = [BASE_BODY_NAME, *BASE_EYE_NAMES]
    with bpy.data.libraries.load(str(source), link=False) as (available, loaded):
        missing = [name for name in names if name not in available.objects]
        if missing:
            raise RuntimeError(f"reviewed human base is missing: {', '.join(missing)}")
        loaded.objects = names
    objects = [obj for obj in loaded.objects if obj is not None]
    if len(objects) != len(names):
        raise RuntimeError("reviewed human base did not load all required objects")
    for obj in objects:
        bpy.context.scene.collection.objects.link(obj)
    body = next(obj for obj in objects if obj.name == BASE_BODY_NAME)
    eyes = [obj for obj in objects if obj.name in BASE_EYE_NAMES]
    return body, eyes


def add_base_eye_details(surface: bpy.types.Object) -> None:
    """Add close-up facial colour and wet-line detail to the anatomical base."""

    for side_name, side in (("left", -1.0), ("right", 1.0)):
        center_blender = transform_base_point(Vector((side * 0.033, -0.122, 1.574)))
        center = from_blender(center_blender)
        # Recess the ocular surface under the source eyelids. The old 14 mm
        # projection exposed too much sclera and created a staring toy eye.
        iris_center = center + Vector((0, 0, 0.0105))
        join_ellipsoid_detail(
            surface,
            f"rowplay-v4-limbal-ring-{side_name}",
            iris_center,
            (0.0066, 0.00055, 0.0066),
            LIMBAL,
            "v4Head",
            segments=22,
            rings=12,
        )
        join_ellipsoid_detail(
            surface,
            f"rowplay-v4-iris-{side_name}",
            iris_center + Vector((0, 0, 0.00045)),
            (0.0058, 0.0007, 0.0058),
            IRIS,
            "v4Head",
            segments=20,
            rings=12,
        )
        join_ellipsoid_detail(
            surface,
            f"rowplay-v4-pupil-{side_name}",
            iris_center + Vector((0, 0, 0.00115)),
            (0.0024, 0.00045, 0.0024),
            PUPIL,
            "v4Head",
            segments=16,
            rings=10,
        )
        join_ellipsoid_detail(
            surface,
            f"rowplay-v4-eye-glint-{side_name}",
            iris_center + Vector((-side * 0.001, 0.0012, 0.00175)),
            (0.00055, 0.00025, 0.00055),
            EYE_GLINT,
            "v4Head",
            segments=10,
            rings=8,
        )
        # Warm, shallow brows and nostrils restore facial hierarchy without
        # black lines or floating cards at replay distance.
        join_ellipsoid_detail(
            surface,
            f"rowplay-v4-brow-{side_name}",
            center + Vector((0, 0.017, 0.006)),
            (0.019, 0.0011, 0.0022),
            BROW,
            "v4Head",
            segments=22,
            rings=10,
            rotation_y=side * 0.09,
        )
        join_ellipsoid_detail(
            surface,
            f"rowplay-v4-nostril-{side_name}",
            center + Vector((-side * 0.024, -0.046, 0.024)),
            (0.0028, 0.0008, 0.0017),
            NOSTRIL,
            "v4Head",
            segments=14,
            rings=8,
        )

    face_center = from_blender(transform_base_point(Vector((0, -0.122, 1.574))))
    join_ellipsoid_detail(
        surface,
        "rowplay-v4-upper-lip",
        face_center + Vector((0, -0.064, 0.012)),
        (0.0185, 0.001, 0.0021),
        MOUTH_DARK,
        "v4Head",
        segments=26,
        rings=10,
    )
    join_ellipsoid_detail(
        surface,
        "rowplay-v4-lower-lip",
        face_center + Vector((0, -0.071, 0.011)),
        (0.018, 0.0011, 0.0023),
        MOUTH,
        "v4Head",
        segments=26,
        rings=10,
    )


def create_base_production_surface(
    source: pathlib.Path,
    bones: dict[str, Vector],
) -> tuple[bpy.types.Object, dict[int, Vector]]:
    """Retarget and skin the reviewed CC0 human base to the canonical V4 rig."""

    surface, eyes = load_base_objects(source)
    surface.name = "v4Athlete"
    surface.data.name = "v4Athlete"
    for modifier in list(surface.modifiers):
        surface.modifiers.remove(modifier)
    for group in list(surface.vertex_groups):
        surface.vertex_groups.remove(group)
    groups = {
        name: surface.vertex_groups.new(name=name)
        for name in (*BONE_NAMES, *HELPER_BONE_NAMES)
    }

    face_sets = source_vertex_face_sets(surface.data)
    chains = base_retarget_chains(bones)
    grip_points: dict[int, list[Vector]] = {
        face_set: [] for face_set in GRIP_FACE_SET_BINDINGS
    }
    for vertex, face_set in zip(surface.data.vertices, face_sets, strict=True):
        original = vertex.co.copy()
        mapped = retarget_base_vertex(original, face_set, chains)

        # A shallow anatomical saddle channel keeps the support silhouette
        # visible without moving the frozen BikeErg hip target.
        rowplay = from_blender(mapped)
        seat_height = max(0.0, 1.0 - abs(rowplay.y - 1.01) / 0.16)
        seat_rear = max(0.0, min(1.0, (0.055 - rowplay.z) / 0.18))
        seat_center = max(0.0, 1.0 - abs(rowplay.x) / 0.19)
        seat_channel = seat_height * seat_rear * seat_center
        if seat_channel > 0.0:
            rowplay.y += 0.075 * seat_channel
            rowplay.z += 0.04 * seat_channel
            mapped = to_blender(rowplay)
        vertex.co = mapped
        if face_set in grip_points:
            grip_points[face_set].append(from_blender(mapped))

        weights = base_vertex_weights(face_set, mapped)
        if seat_channel > 0.08:
            weights = {**weights, "v4Hips": weights.get("v4Hips", 0.0) + 1.8}
        ranked = sorted(weights.items(), key=lambda item: item[1], reverse=True)[:4]
        total = sum(value for _name, value in ranked) or 1.0
        for bone_name, value in ranked:
            groups[bone_name].add([vertex.index], value / total, "REPLACE")

    surface.data.update(calc_edges=True)
    for polygon in surface.data.polygons:
        polygon.use_smooth = True
    paint_vertex_colors(surface)
    add_short_hair_cap(surface, bones)

    # Source sclerae share the head rest transform and stay inside the same
    # exported skinned mesh; compact overlays provide iris/cornea readability.
    for eye in eyes:
        for vertex in eye.data.vertices:
            vertex.co = transform_base_point(vertex.co)
            # Keep the anatomical eyeball behind the eyelid margin; iris,
            # limbal ring and glint overlays restore the wet forward surface.
            vertex.co.y += 0.0025
        color = eye.data.color_attributes.new(name="Color", type="BYTE_COLOR", domain="POINT")
        for value in color.data:
            value.color_srgb = EYE_WHITE
        head = eye.vertex_groups.new(name="v4Head")
        head.add(list(range(len(eye.data.vertices))), 1.0, "REPLACE")
        for name in (*BONE_NAMES, *HELPER_BONE_NAMES):
            if name not in eye.vertex_groups:
                eye.vertex_groups.new(name=name)
        for polygon in eye.data.polygons:
            polygon.use_smooth = True
        bpy.ops.object.select_all(action="DESELECT")
        surface.select_set(True)
        eye.select_set(True)
        bpy.context.view_layer.objects.active = surface
        bpy.ops.object.join()

    add_base_eye_details(surface)
    add_authored_footwear(surface, bones)

    bpy.ops.object.select_all(action="DESELECT")
    surface.select_set(True)
    bpy.context.view_layer.objects.active = surface
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.15192, island_margin=0.028)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    grip_centers = {}
    for face_set, points in grip_points.items():
        if not points:
            raise RuntimeError(f"reviewed human base grip face set {face_set} is empty")
        grip_centers[face_set] = sum(points, Vector((0.0, 0.0, 0.0))) / len(points)
    return surface, grip_centers



def paint_vertex_colors(obj: bpy.types.Object) -> None:
    """Region paint hard kit panels in bind-pose space (Three/glTF Y-up metres)."""

    mesh = obj.data
    # Replace any prior colour attribute from remesh leftovers.
    while mesh.color_attributes:
        mesh.color_attributes.remove(mesh.color_attributes[0])
    color_layer = mesh.color_attributes.new(name="Color", type="BYTE_COLOR", domain="POINT")
    mesh.color_attributes.active_color = color_layer
    mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index
    for index, vertex in enumerate(mesh.vertices):
        p = from_blender(vertex.co)
        y = p.y
        x = p.x
        z = p.z
        # Bind-pose landmarks: head ~1.72, chest ~1.45, hips ~1.02, knees ~0.53,
        # ankles ~0.06. Hard panel breaks match the art-direction kit language.
        near_foot = y < 0.12 and abs(x) > 0.05 and z > -0.08
        near_hand = y > 1.05 and abs(x) > 0.68
        is_face = (y > 1.59 and abs(x) < 0.135) or (
            1.54 < y < 1.59 and abs(x) < 0.075 and z > 0.025
        )
        if is_face:
            cheek = (
                1.64 < y < 1.73
                and 0.032 < abs(x) < 0.095
                and z > 0.075
            )
            nose = 1.625 < y < 1.735 and abs(x) < 0.031 and z > 0.09
            brow_plane = 1.71 < y < 1.775 and abs(x) < 0.105 and z > 0.055
            beard_plane = 1.585 < y < 1.665 and abs(x) < 0.105 and z > 0.045
            if cheek or nose:
                color = SKIN_WARM
            elif brow_plane:
                color = SKIN_LIGHT
            elif beard_plane:
                color = SKIN_SHADOW
            else:
                color = SKIN
        elif near_hand:
            color = SKIN_LIGHT if abs(x) > 0.58 else SKIN
        elif near_foot:
            color = SOLE if y < -0.02 else (SHOE_DARK if z < -0.01 else SHOE)
        elif y < 0.95 and abs(x) > 0.06:
            # Performance tights under the remeshed shorts hem.
            color = LEG_FABRIC_SIDE if abs(x) > 0.11 else LEG_FABRIC
        elif y < 1.14:
            # One continuous shorts block (no mid-waist hole in colour).
            color = SHORTS_PANEL if abs(x) > 0.11 else SHORTS
        elif y < 1.17:
            color = TRIM
        elif y < 1.28 and abs(x) > 0.2:
            color = FABRIC_SIDE if abs(x) > 0.22 else FABRIC
        elif abs(x) > 0.18 and y > 1.22:
            color = FABRIC_SIDE if abs(x) > 0.22 else FABRIC
        elif abs(x) < 0.03 and z > 0.015 and 1.18 < y < 1.5:
            color = TRIM
        elif y > 1.48 and abs(x) < 0.14:
            color = FABRIC_LIGHT if abs(x) < 0.09 else FABRIC
        elif y > 1.32 and abs(x) < 0.1 and z > 0.02:
            color = FABRIC_LIGHT
        else:
            color = FABRIC
        color_layer.data[index].color_srgb = color


def bind_surface(surface: bpy.types.Object, armature: bpy.types.Object) -> None:
    surface.parent = armature
    modifier = surface.modifiers.new(name="RowPlayV4Skin", type="ARMATURE")
    modifier.object = armature
    modifier.use_deform_preserve_volume = True
    modifier.use_vertex_groups = True


def create_material(obj: bpy.types.Object) -> None:
    material = bpy.data.materials.new("RowPlayV4ProductionMaterial")
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is not None:
        principled.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
        principled.inputs["Roughness"].default_value = 0.62
        principled.inputs["Metallic"].default_value = 0.0
        if "Coat Weight" in principled.inputs:
            principled.inputs["Coat Weight"].default_value = 0.04
        if "Sheen Weight" in principled.inputs:
            principled.inputs["Sheen Weight"].default_value = 0.18
        vertex_color = material.node_tree.nodes.new("ShaderNodeVertexColor")
        # Prefer transferred colour layer name.
        layer_name = "Color"
        if obj.data.color_attributes:
            layer_name = obj.data.color_attributes[0].name
        vertex_color.layer_name = layer_name
        material.node_tree.links.new(vertex_color.outputs["Color"], principled.inputs["Base Color"])
    if obj.data.materials:
        obj.data.materials[0] = material
    else:
        obj.data.materials.append(material)


def main() -> None:
    options = parse_args()
    output = options.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials):
        for item in list(collection):
            if item.users == 0:
                collection.remove(item)

    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0

    base_mesh = options.base_mesh.resolve()
    bones = global_bone_positions()
    surface, grip_centers = create_base_production_surface(base_mesh, bones)
    armature = create_armature(bones, grip_centers)
    create_material(surface)
    bind_surface(surface, armature)

    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    surface.select_set(True)
    bpy.context.view_layer.objects.active = surface

    result = bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_animations=False,
        export_skins=True,
        export_all_vertex_colors=True,
        export_active_vertex_color_when_no_material=True,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
    )
    if "FINISHED" not in result:
        raise RuntimeError(f"Blender glTF export failed: {result}")
    if not output.is_file() or output.stat().st_size == 0:
        raise RuntimeError(f"Blender did not create a non-empty GLB: {output}")

    vertex_count = len(surface.data.vertices)
    triangle_count = sum(len(p.vertices) - 2 for p in surface.data.polygons)
    print(
        f"wrote production athlete source {output}: {vertex_count} vertices, "
        f"{triangle_count} triangles, {output.stat().st_size} bytes"
    )


if __name__ == "__main__":
    main()
