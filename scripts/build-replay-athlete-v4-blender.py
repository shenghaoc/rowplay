#!/usr/bin/env python3
"""Author the production RowPlay V4 athlete surface in Blender 5.

Replaces the mannequin multi-loft assembly with a production sports character:

* denser anatomical source volumes with deliberate kit silhouette
* voxel remesh so the primary body mass reads as coherent rather than assembled
* weight transfer from a carefully ring-weighted cage (not bone-heat)
* deliberate kit / skin / footwear / hair vertex colours

No downloaded model, scan, likeness, avatar generator, image, or texture is
used. The temporary GLB contributes the visible mesh, normals, vertex colours,
and skin weights; the Node build seals it onto the canonical V4 skeleton and
deterministic sport clips from ``src/lib/replay/rigV4.ts``.
"""

from __future__ import annotations

import argparse
import math
import pathlib
import sys
from dataclasses import dataclass
from typing import Callable, Sequence

import bpy
from mathutils import Vector


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

CONTACT_OFFSETS = {
    "v4LeftHand": (-0.08, -0.01, 0.035),
    "v4RightHand": (0.08, -0.01, 0.035),
    "v4LeftFoot": (0.0, -0.055, 0.13),
    "v4RightFoot": (0.0, -0.055, 0.13),
}

# sRGB vertex colours (written via Blender sRGB colour attributes).
FABRIC = (0.20, 0.18, 0.45, 1.0)
FABRIC_SIDE = (0.11, 0.12, 0.28, 1.0)
FABRIC_LIGHT = (0.34, 0.36, 0.66, 1.0)
SHORTS = (0.08, 0.09, 0.16, 1.0)
SHORTS_PANEL = (0.14, 0.16, 0.28, 1.0)
TRIM = (0.42, 0.38, 0.78, 1.0)
LEG_FABRIC = (0.22, 0.36, 0.44, 1.0)
LEG_FABRIC_SIDE = (0.14, 0.24, 0.30, 1.0)
LEG_FABRIC_LIGHT = (0.38, 0.52, 0.60, 1.0)
SKIN = (0.72, 0.48, 0.36, 1.0)
SKIN_LIGHT = (0.82, 0.60, 0.48, 1.0)
HAIR = (0.08, 0.09, 0.12, 1.0)
EYE = (0.055, 0.045, 0.04, 1.0)
SHOE = (0.88, 0.90, 0.93, 1.0)
SHOE_DARK = (0.12, 0.15, 0.19, 1.0)
SOLE = (0.06, 0.08, 0.10, 1.0)

# Coarser remesh keeps the production GLB deployable and clone-fast for
# live+ghost lanes in unit tests / CI, while remaining continuous and readable
# at chase-camera distance.
# A denser remesh keeps facial planes, garment seams, and the seated pelvis
# readable at the replay camera without crossing the reviewed 4.5 MB GLB cap.
VOXEL_SIZE = 0.0098
SMOOTH_ITERATIONS = 1


def parse_args() -> argparse.Namespace:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser(description="Build the RowPlay production athlete surface")
    parser.add_argument("--output", required=True, type=pathlib.Path)
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

    def add_ellipsoid(
        self,
        center: Vector,
        radii: tuple[float, float, float],
        weights: dict[str, float],
        color: tuple[float, float, float, float],
        radial_segments: int = 32,
        height_segments: int = 20,
        deform: Callable | None = None,
    ) -> None:
        start = len(self.vertices)
        for latitude in range(height_segments + 1):
            v = latitude / height_segments
            theta = v * math.pi
            sin_theta = math.sin(theta)
            cos_theta = math.cos(theta)
            for longitude in range(radial_segments):
                u = longitude / radial_segments
                phi = u * math.tau
                point = center + Vector(
                    (
                        math.cos(phi) * sin_theta * radii[0],
                        cos_theta * radii[1],
                        math.sin(phi) * sin_theta * radii[2],
                    )
                )
                if deform is not None:
                    point = deform(point, u, v)
                self.add_vertex(point, weights, color)
        for latitude in range(height_segments):
            row = start + latitude * radial_segments
            next_row = row + radial_segments
            for longitude in range(radial_segments):
                following = (longitude + 1) % radial_segments
                self.faces.append(
                    (row + longitude, next_row + longitude, next_row + following, row + following)
                )


def torso_color(_ring_index: int, _angle: float, point: Vector, ring: Ring):
    if point.y < 1.12:
        if abs(point.x) > 0.13:
            return SHORTS_PANEL
        return SHORTS
    if abs(point.x) > 0.78 * ring.radii[0]:
        return FABRIC_SIDE
    if point.z > ring.center.z and abs(point.x) < 0.016 and point.y < 1.48:
        return TRIM
    if point.y > 1.42 and abs(point.x) < 0.1:
        return FABRIC_LIGHT
    return FABRIC


def build_torso(builder: AthleteMeshBuilder, bones: dict[str, Vector]) -> None:
    hips = bones["v4Hips"]
    spine = bones["v4Spine"]
    chest = bones["v4Chest"]
    neck = bones["v4Neck"]
    rings = [
        # The rear lower-pelvis section is deliberately tucked toward the
        # athlete's centreline. It keeps a seated BikeErg body from visibly
        # cutting through the fixed saddle shell while preserving the hips,
        # legs, and pedal contacts that the technique rig owns.
        Ring(Vector((0, 0.86, 0.016)), (0.155, 0.118), {"v4Hips": 1}, SHORTS, 0.03, 0.26),
        Ring(Vector((0, 0.92, 0.018)), (0.19, 0.142), {"v4Hips": 1}, SHORTS, 0.04, 0.3),
        Ring(hips + Vector((0, 0.0, 0.02)), (0.215, 0.16), {"v4Hips": 1}, SHORTS, 0.05, 0.32),
        Ring(Vector((0, 1.09, 0.018)), (0.185, 0.14), {"v4Hips": 0.78, "v4Spine": 0.22}, SHORTS, 0.0, 0.16),
        Ring(Vector((0, 1.14, 0.01)), (0.17, 0.13), {"v4Hips": 0.5, "v4Spine": 0.5}, TRIM),
        Ring(Vector((0, 1.19, 0.014)), (0.172, 0.132), {"v4Hips": 0.28, "v4Spine": 0.72}, FABRIC),
        Ring(spine + Vector((0, 0.01, 0.008)), (0.195, 0.148), {"v4Spine": 0.86, "v4Hips": 0.14}, FABRIC, 0.03, 0.04),
        Ring(Vector((0, 1.30, 0.02)), (0.222, 0.162), {"v4Spine": 0.7, "v4Chest": 0.3}, FABRIC, 0.04, 0.05),
        Ring(Vector((0, 1.38, 0.028)), (0.245, 0.172), {"v4Spine": 0.4, "v4Chest": 0.6}, FABRIC, 0.045, 0.08),
        Ring(chest + Vector((0, -0.01, 0.02)), (0.255, 0.175), {"v4Chest": 0.82, "v4Spine": 0.18}, FABRIC, 0.04, 0.1),
        Ring(chest + Vector((0, 0.03, 0.024)), (0.25, 0.165), {"v4Chest": 0.92, "v4Neck": 0.08}, FABRIC, 0.03, 0.08),
        Ring(Vector((0, 1.52, 0.045)), (0.215, 0.14), {"v4Chest": 0.78, "v4Neck": 0.22}, FABRIC, 0.02),
        Ring(Vector((0, 1.555, 0.05)), (0.14, 0.1), {"v4Chest": 0.4, "v4Neck": 0.6}, FABRIC),
        Ring(Vector((0, 1.58, 0.052)), (0.09, 0.078), {"v4Neck": 0.78, "v4Chest": 0.22}, SKIN),
    ]
    builder.add_loft(rings, 52, Vector((1, 0, 0)), torso_color)

    builder.add_loft(
        [
            Ring(neck + Vector((0, -0.025, 0.004)), (0.088, 0.076), {"v4Neck": 0.9, "v4Chest": 0.1}, SKIN),
            Ring(neck + Vector((0, 0.025, 0.01)), (0.068, 0.06), {"v4Neck": 0.88, "v4Head": 0.12}, SKIN),
            Ring(neck + Vector((0, 0.07, 0.014)), (0.07, 0.062), {"v4Neck": 0.5, "v4Head": 0.5}, SKIN),
            Ring(neck + Vector((0, 0.11, 0.016)), (0.076, 0.068), {"v4Head": 1}, SKIN),
        ],
        36,
        Vector((1, 0, 0)),
        cap_start=False,
    )


def build_head(builder: AthleteMeshBuilder, bones: dict[str, Vector]) -> None:
    center = bones["v4Head"] + Vector((0, 0.07, 0.018))

    def shape(point: Vector, _u: float, _v: float) -> Vector:
        local = point - center
        # Establish a recognisable generic cranium, brow, cheek and jaw before
        # adding small features. A rounded-only ellipsoid reads as a doll head
        # at the replay camera even when its material is otherwise polished.
        if local.y < -0.01:
            jaw_blend = max(0.0, min(1.0, (local.y + 0.13) / 0.12))
            local.x *= 0.79 + jaw_blend * 0.2
            local.z *= 0.9 + jaw_blend * 0.08
        elif local.y > 0.055:
            # Slightly broader cranial mass prevents a pinched, toy-like cap.
            local.x *= 1.035
        front = max(0.0, local.z / 0.104)
        forehead = math.exp(-((local.x / 0.082) ** 2 + ((local.y - 0.055) / 0.05) ** 2))
        nose_bridge = math.exp(-((local.x / 0.022) ** 2 + ((local.y - 0.012) / 0.06) ** 2))
        nose_tip = math.exp(-((local.x / 0.03) ** 2 + ((local.y + 0.018) / 0.027) ** 2))
        brow = math.exp(-((abs(local.x) - 0.046) / 0.026) ** 2) * math.exp(
            -((local.y - 0.024) / 0.021) ** 2
        )
        eye_socket = math.exp(-((abs(local.x) - 0.047) / 0.022) ** 2) * math.exp(
            -((local.y + 0.005) / 0.022) ** 2
        )
        cheek = math.exp(-((abs(local.x) - 0.058) / 0.04) ** 2) * math.exp(
            -((local.y + 0.04) / 0.04) ** 2
        )
        chin = math.exp(-((local.y + 0.094) / 0.028) ** 2) * math.exp(-(local.x / 0.05) ** 2)
        # A readable generic face plane at replay distance: no likeness or
        # photoreal detail, but enough forehead/brow/eye/nose/chin structure
        # that the head does not read as a featureless egg.
        local.z += front * (
            0.008 * forehead
            + 0.032 * nose_bridge
            + 0.022 * nose_tip
            + 0.014 * brow
            - 0.009 * eye_socket
            + 0.008 * cheek
            + 0.018 * chin
        )
        return center + local

    builder.add_ellipsoid(center, (0.116, 0.144, 0.11), {"v4Head": 1}, SKIN, 48, 34, shape)

    # These overlapping planes survive voxel remesh as one coherent face
    # rather than decals or separate toy parts.
    builder.add_ellipsoid(
        center + Vector((0, -0.006, 0.124)),
        (0.026, 0.042, 0.026),
        {"v4Head": 1},
        SKIN_LIGHT,
        20,
        16,
    )
    builder.add_ellipsoid(
        center + Vector((0, -0.094, 0.042)),
        (0.07, 0.04, 0.06),
        {"v4Head": 1},
        SKIN,
        24,
        16,
    )
    for side in (-1.0, 1.0):
        builder.add_ellipsoid(
            center + Vector((side * 0.047, 0.024, 0.108)),
            (0.032, 0.013, 0.017),
            {"v4Head": 1},
            SKIN_LIGHT,
            18,
            12,
        )

    for side in (-1.0, 1.0):
        builder.add_ellipsoid(
            center + Vector((side * 0.102, -0.004, -0.01)),
            (0.013, 0.026, 0.016),
            {"v4Head": 1},
            SKIN_LIGHT,
            14,
            10,
        )

    hair_center = center + Vector((0, 0.078, -0.014))

    def shape_hair(point: Vector, _u: float, _v: float) -> Vector:
        local = point - hair_center
        if local.y < 0:
            local.y *= 0.24
            local.x *= 0.9
        if local.z > 0:
            local.z *= 0.3
            local.y = max(local.y, 0.002)
        if local.y > 0.038:
            local.y = 0.038 + (local.y - 0.038) * 0.48
        return hair_center + local

    builder.add_ellipsoid(hair_center, (0.11, 0.07, 0.102), {"v4Head": 1}, HAIR, 36, 24, shape_hair)
    for side in (-1.0, 1.0):
        builder.add_ellipsoid(
            center + Vector((side * 0.087, 0.025, -0.004)),
            (0.018, 0.06, 0.026),
            {"v4Head": 1},
            HAIR,
            14,
            12,
        )


def build_arm(builder: AthleteMeshBuilder, bones: dict[str, Vector], side_name: str) -> None:
    sign = -1.0 if side_name == "Left" else 1.0
    clavicle_name = f"v4{side_name}Clavicle"
    upper_name = f"v4{side_name}UpperArm"
    fore_name = f"v4{side_name}Forearm"
    hand_name = f"v4{side_name}Hand"
    chest = bones["v4Chest"]
    clavicle = bones[clavicle_name]
    shoulder = bones[upper_name]
    elbow = bones[fore_name]
    wrist = bones[hand_name]
    contact = wrist + Vector(CONTACT_OFFSETS[hand_name])

    rings = [
        # Thick, deeply buried sleeve root so remesh cannot open an armpit hole.
        Ring(chest.lerp(clavicle, 0.35), (0.055, 0.048), {"v4Chest": 0.88, clavicle_name: 0.12}, FABRIC),
        Ring(chest.lerp(clavicle, 0.7), (0.07, 0.06), {"v4Chest": 0.55, clavicle_name: 0.35, upper_name: 0.1}, FABRIC),
        Ring(clavicle, (0.08, 0.068), {"v4Chest": 0.3, clavicle_name: 0.5, upper_name: 0.2}, FABRIC, 0.04),
        Ring(shoulder, (0.095, 0.082), {clavicle_name: 0.32, upper_name: 0.68, "v4Chest": 0.0}, FABRIC, 0.06, 0.05),
        Ring(shoulder.lerp(elbow, 0.12), (0.098, 0.086), {upper_name: 0.92, clavicle_name: 0.08}, FABRIC, 0.07, 0.05),
        Ring(shoulder.lerp(elbow, 0.28), (0.084, 0.074), {upper_name: 1}, FABRIC, 0.05, 0.04),
        Ring(shoulder.lerp(elbow, 0.42), (0.076, 0.066), {upper_name: 1}, TRIM, 0.04),
        Ring(shoulder.lerp(elbow, 0.55), (0.07, 0.06), {upper_name: 0.96, fore_name: 0.04}, SKIN_LIGHT, 0.03),
        Ring(shoulder.lerp(elbow, 0.7), (0.062, 0.054), {upper_name: 0.88, fore_name: 0.12}, SKIN, 0.025),
        Ring(shoulder.lerp(elbow, 0.85), (0.052, 0.046), {upper_name: 0.7, fore_name: 0.3}, SKIN),
        Ring(shoulder.lerp(elbow, 0.95), (0.046, 0.042), {upper_name: 0.52, fore_name: 0.48}, SKIN),
        Ring(elbow, (0.045, 0.042), {upper_name: 0.42, fore_name: 0.58}, SKIN, 0.02, 0.03),
        Ring(elbow.lerp(wrist, 0.12), (0.054, 0.046), {upper_name: 0.2, fore_name: 0.8}, SKIN, 0.04, 0.04),
        Ring(elbow.lerp(wrist, 0.32), (0.056, 0.048), {fore_name: 0.94, upper_name: 0.06}, SKIN, 0.05, 0.03),
        Ring(elbow.lerp(wrist, 0.52), (0.05, 0.042), {fore_name: 0.96, hand_name: 0.04}, SKIN, 0.04),
        Ring(elbow.lerp(wrist, 0.72), (0.04, 0.034), {fore_name: 0.86, hand_name: 0.14}, SKIN, 0.03),
        Ring(elbow.lerp(wrist, 0.9), (0.032, 0.028), {fore_name: 0.62, hand_name: 0.38}, SKIN),
        Ring(wrist, (0.028, 0.024), {fore_name: 0.28, hand_name: 0.72}, SKIN),
    ]
    builder.add_loft(rings, 40, Vector((0, 0, 1)), cap_start=False)

    hand_dir = (contact - wrist).normalized()
    palm = wrist.lerp(contact, 0.5)
    builder.add_loft(
        [
            Ring(wrist + hand_dir * 0.004, (0.028, 0.02), {hand_name: 1}, SKIN),
            Ring(wrist.lerp(contact, 0.22), (0.04, 0.024), {hand_name: 1}, SKIN_LIGHT, 0.06),
            Ring(palm, (0.046, 0.023), {hand_name: 1}, SKIN_LIGHT, 0.08),
            Ring(wrist.lerp(contact, 0.72), (0.04, 0.02), {hand_name: 1}, SKIN_LIGHT, 0.05),
            Ring(contact, (0.032, 0.018), {hand_name: 1}, SKIN, 0.03),
            Ring(contact + hand_dir * 0.022, (0.022, 0.014), {hand_name: 1}, SKIN, 0.02),
            Ring(contact + hand_dir * 0.04, (0.012, 0.009), {hand_name: 1}, SKIN),
            Ring(contact + hand_dir * 0.05, (0.004, 0.004), {hand_name: 1}, SKIN),
        ],
        28,
        Vector((0, 1, 0)),
        cap_start=False,
        cap_end=True,
    )
    thumb_base = palm + Vector((-sign * 0.02, -0.014, 0.012))
    thumb_tip = palm + Vector((-sign * 0.038, -0.032, 0.032))
    builder.add_loft(
        [
            Ring(thumb_base, (0.015, 0.013), {hand_name: 1}, SKIN),
            Ring(thumb_base.lerp(thumb_tip, 0.55), (0.012, 0.01), {hand_name: 1}, SKIN_LIGHT),
            Ring(thumb_tip, (0.009, 0.008), {hand_name: 1}, SKIN),
            Ring(thumb_tip + (thumb_tip - thumb_base).normalized() * 0.012, (0.004, 0.004), {hand_name: 1}, SKIN),
        ],
        14,
        Vector((0, 0, 1)),
        cap_start=False,
        cap_end=True,
    )


def build_leg(builder: AthleteMeshBuilder, bones: dict[str, Vector], side_name: str) -> None:
    upper_name = f"v4{side_name}UpperLeg"
    lower_name = f"v4{side_name}LowerLeg"
    foot_name = f"v4{side_name}Foot"
    hip = bones[upper_name]
    knee = bones[lower_name]
    ankle = bones[foot_name]

    rings = [
        Ring(hip + Vector((0, 0.03, 0.0)), (0.105, 0.095), {"v4Hips": 0.86, upper_name: 0.14}, SHORTS, 0.04, 0.03),
        Ring(hip + Vector((0, -0.01, 0.004)), (0.122, 0.108), {"v4Hips": 0.52, upper_name: 0.48}, SHORTS, 0.05, 0.05),
        Ring(hip.lerp(knee, 0.12), (0.126, 0.11), {upper_name: 0.88, "v4Hips": 0.12}, SHORTS, 0.06, 0.06),
        Ring(hip.lerp(knee, 0.28), (0.128, 0.112), {upper_name: 1}, SHORTS, 0.06, 0.07),
        Ring(hip.lerp(knee, 0.44), (0.12, 0.106), {upper_name: 1}, SHORTS_PANEL, 0.05, 0.05),
        Ring(hip.lerp(knee, 0.58), (0.112, 0.1), {upper_name: 0.96, lower_name: 0.04}, TRIM, 0.04),
        Ring(hip.lerp(knee, 0.72), (0.105, 0.094), {upper_name: 0.88, lower_name: 0.12}, LEG_FABRIC, 0.035),
        Ring(hip.lerp(knee, 0.86), (0.095, 0.088), {upper_name: 0.72, lower_name: 0.28}, LEG_FABRIC),
        Ring(hip.lerp(knee, 0.95), (0.088, 0.082), {upper_name: 0.55, lower_name: 0.45}, LEG_FABRIC),
        Ring(knee, (0.086, 0.08), {upper_name: 0.45, lower_name: 0.55}, LEG_FABRIC_LIGHT, 0.025, 0.04),
        Ring(knee.lerp(ankle, 0.12), (0.094, 0.086), {upper_name: 0.22, lower_name: 0.78}, LEG_FABRIC, 0.04, 0.04),
        Ring(knee.lerp(ankle, 0.3), (0.098, 0.088), {lower_name: 0.94, upper_name: 0.06}, LEG_FABRIC, 0.05, 0.04),
        Ring(knee.lerp(ankle, 0.5), (0.09, 0.08), {lower_name: 0.97, foot_name: 0.03}, LEG_FABRIC, 0.04),
        Ring(knee.lerp(ankle, 0.68), (0.076, 0.07), {lower_name: 0.9, foot_name: 0.1}, LEG_FABRIC_SIDE, 0.03),
        Ring(knee.lerp(ankle, 0.84), (0.062, 0.058), {lower_name: 0.72, foot_name: 0.28}, LEG_FABRIC_SIDE),
        Ring(ankle, (0.05, 0.048), {lower_name: 0.32, foot_name: 0.68}, SHOE_DARK),
    ]
    builder.add_loft(rings, 42, Vector((1, 0, 0)), cap_start=False)

    heel = ankle + Vector((0, -0.032, -0.05))
    rear = ankle + Vector((0, -0.018, -0.01))
    mid = ankle + Vector((0, -0.042, 0.09))
    cleat = ankle + Vector(CONTACT_OFFSETS[foot_name])
    toe = ankle + Vector((0, -0.034, 0.23))
    builder.add_loft(
        [
            Ring(heel, (0.076, 0.052), {foot_name: 1}, SHOE_DARK, 0.03),
            Ring(rear, (0.09, 0.06), {foot_name: 1}, SHOE, 0.04),
            Ring(mid, (0.106, 0.06), {foot_name: 1}, SHOE, 0.05),
            Ring(cleat, (0.11, 0.05), {foot_name: 1}, SHOE, 0.04),
            Ring(toe, (0.084, 0.034), {foot_name: 1}, SHOE, 0.02),
        ],
        30,
        Vector((1, 0, 0)),
    )
    builder.add_loft(
        [
            Ring(heel + Vector((0, -0.032, 0.0)), (0.078, 0.012), {foot_name: 1}, SOLE),
            Ring(mid + Vector((0, -0.036, 0.0)), (0.108, 0.013), {foot_name: 1}, SOLE),
            Ring(cleat + Vector((0, -0.032, 0.0)), (0.112, 0.012), {foot_name: 1}, SOLE),
            Ring(toe + Vector((0, -0.024, -0.004)), (0.088, 0.01), {foot_name: 1}, SOLE),
        ],
        26,
        Vector((1, 0, 0)),
    )


def create_armature(bones: dict[str, Vector]) -> bpy.types.Object:
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
    bpy.ops.object.mode_set(mode="OBJECT")
    return armature


def create_cage(builder: AthleteMeshBuilder) -> bpy.types.Object:
    """Ring-weighted source cage used for production surface weight transfer."""

    mesh = bpy.data.meshes.new("v4AthleteCage")
    mesh.from_pydata(builder.vertices, [], list(builder.faces))
    mesh.update(calc_edges=True)
    for polygon in mesh.polygons:
        polygon.use_smooth = True

    color_layer = mesh.color_attributes.new(name="Color", type="BYTE_COLOR", domain="POINT")
    for index, color in enumerate(builder.colors):
        color_layer.data[index].color_srgb = color
    mesh.color_attributes.active_color = color_layer
    mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index

    cage = bpy.data.objects.new("v4AthleteCage", mesh)
    bpy.context.scene.collection.objects.link(cage)
    groups = {name: cage.vertex_groups.new(name=name) for name in BONE_NAMES}
    for vertex_index, weights in enumerate(builder.weights):
        for bone_name, weight in weights.items():
            groups[bone_name].add([vertex_index], weight, "REPLACE")
    return cage


def create_production_surface(cage: bpy.types.Object) -> bpy.types.Object:
    """Remesh a visual copy, then transfer cage weights and vertex colours."""

    bpy.ops.object.select_all(action="DESELECT")
    cage.select_set(True)
    bpy.context.view_layer.objects.active = cage
    bpy.ops.object.duplicate()
    surface = bpy.context.view_layer.objects.active
    surface.name = "v4Athlete"
    surface.data.name = "v4Athlete"

    # Drop cage groups/colours after duplication; transfer restores them cleanly.
    for group in list(surface.vertex_groups):
        surface.vertex_groups.remove(group)

    remesh = surface.modifiers.new(name="ProductionRemesh", type="REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = VOXEL_SIZE
    remesh.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=remesh.name)

    smooth = surface.modifiers.new(name="ProductionSmooth", type="SMOOTH")
    smooth.factor = 0.45
    smooth.iterations = SMOOTH_ITERATIONS
    bpy.ops.object.modifier_apply(modifier=smooth.name)

    # Transfer weights from the authored cage. Vertex colours are repainted by
    # region after remesh (Blender 5 colour-attribute transfer is fragile across
    # domain changes).
    transfer = surface.modifiers.new(name="TransferCage", type="DATA_TRANSFER")
    transfer.object = cage
    transfer.use_vert_data = True
    transfer.data_types_verts = {"VGROUP_WEIGHTS"}
    transfer.vert_mapping = "POLYINTERP_NEAREST"
    transfer.mix_mode = "REPLACE"
    bpy.ops.object.datalayout_transfer(modifier=transfer.name)
    bpy.ops.object.modifier_apply(modifier=transfer.name)

    # Ensure every semantic group exists and weights are finite four-influence sets.
    for name in BONE_NAMES:
        if name not in surface.vertex_groups:
            surface.vertex_groups.new(name=name)
    for group in list(surface.vertex_groups):
        if group.name not in BONE_NAMES:
            surface.vertex_groups.remove(group)

    mesh = surface.data
    for vertex in mesh.vertices:
        p = from_blender(vertex.co)
        # BikeErg derives its hip location from the frozen semantic motion
        # target, so the visible skin needs a small, anatomical underside
        # relief rather than a moved pelvis or altered pedal solve.  Compress
        # only the rear/underside of the glute mass into a shallow saddle
        # channel.  This keeps the seated silhouette supported by the saddle
        # without letting the closed skin volume occupy the saddle solid as
        # the hips pitch through a crank cycle.
        seat_height = max(0.0, 1.0 - abs(p.y - 1.01) / 0.18)
        seat_rear = max(0.0, min(1.0, (0.06 - p.z) / 0.2))
        seat_center = max(0.0, 1.0 - abs(p.x) / 0.22)
        seat_channel = seat_height * seat_rear * seat_center
        if seat_channel > 0.0:
            p.y += 0.12 * seat_channel
            p.z += 0.055 * seat_channel
            vertex.co = to_blender(p)
        weights: list[tuple[str, float]] = []
        for group in surface.vertex_groups:
            try:
                value = group.weight(vertex.index)
            except RuntimeError:
                continue
            if value > 1e-5:
                weights.append((group.name, value))
        # The compressed rear seat region belongs to the pelvis rather than
        # following the cycling thigh.  Without this blend, the hip/thigh seam
        # sweeps the glute surface down through the fixed saddle at top-dead
        # centre even though the semantic hip itself is correctly seated.
        if seat_channel > 0.08:
            weights.append(("v4Hips", 1.4 + seat_channel * 2.0))
        # Keep ribcage influence in the armpit so raised arms cannot open a hole.
        if 1.32 < p.y < 1.55 and 0.1 < abs(p.x) < 0.28:
            weights.append(("v4Chest", 0.45))
            weights.append(("v4Spine", 0.15))
        weights.sort(key=lambda item: item[1], reverse=True)
        # Merge duplicates after the armpit boost.
        merged: dict[str, float] = {}
        for name, value in weights:
            merged[name] = merged.get(name, 0.0) + value
        ranked = sorted(merged.items(), key=lambda item: item[1], reverse=True)[:4]
        total = sum(value for _name, value in ranked)
        if total <= 1e-8:
            fallback = "v4Hips"
            if p.y > 1.55:
                fallback = "v4Head"
            elif p.y > 1.35:
                fallback = "v4Chest"
            elif p.y > 1.15:
                fallback = "v4Spine"
            ranked = [(fallback, 1.0)]
            total = 1.0
        for group in surface.vertex_groups:
            try:
                group.remove([vertex.index])
            except RuntimeError:
                pass
        for name, value in ranked:
            surface.vertex_groups[name].add([vertex.index], value / total, "REPLACE")

    # Remesh discards colour attributes; repaint deliberate kit/skin regions.
    paint_vertex_colors(surface)

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    # Hide the cage; only the production surface is exported.
    cage.hide_render = True
    cage.hide_viewport = True
    return surface


def paint_vertex_colors(obj: bpy.types.Object) -> None:
    """Region paint in bind-pose space (Three/glTF Y-up metres)."""

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
        # ankles ~0.06. Shoe paint is restricted to the foot block only.
        # Shoes live only in the foot block (ankle ~0.06, toe forward in +Z).
        near_foot = y < 0.12 and abs(x) > 0.05 and z > -0.08
        near_hand = y > 1.05 and abs(x) > 0.48
        # A clear swept cap and sideburn silhouette stop the head reading as a
        # bald doll even when the chase camera is too far away for face planes.
        if y > 1.855 or (y > 1.805 and z < 0.045) or (1.70 < y < 1.79 and z < -0.01):
            color = HAIR
        # Two small recessed eye marks orient the face at chase-camera
        # distance. Keep them narrow: broader dark vertex regions read as a
        # visor or mask instead of a generic human face.
        elif 1.768 < y < 1.784 and z > 0.14 and 0.037 < abs(x) < 0.058:
            color = EYE
        elif y > 1.64 and z < 0.04:
            color = HAIR
        elif y > 1.55 or (y > 1.48 and abs(x) < 0.12 and z > -0.02):
            color = SKIN
        elif near_hand:
            color = SKIN_LIGHT if abs(x) > 0.58 else SKIN
        elif near_foot:
            color = SOLE if y < 0.04 else (SHOE_DARK if z < 0.0 else SHOE)
        elif y < 1.02 and abs(x) > 0.05:
            # Full lower-leg performance tights — never shoe white on the shin.
            if abs(y - 0.53) < 0.07:
                color = LEG_FABRIC_LIGHT
            elif abs(x) > 0.11:
                color = LEG_FABRIC_SIDE
            else:
                color = LEG_FABRIC
        elif y < 1.16:
            color = SHORTS_PANEL if abs(x) > 0.12 else SHORTS
        elif y < 1.28 and abs(x) > 0.22:
            # Outer deltoid still kit.
            color = FABRIC
        elif abs(x) > 0.2 and y > 1.2:
            color = FABRIC_SIDE if abs(x) > 0.24 else FABRIC
        elif abs(x) < 0.016 and z > 0.02 and 1.18 < y < 1.48:
            color = TRIM
        elif y > 1.35 and abs(x) < 0.12:
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

    bones = global_bone_positions()
    builder = AthleteMeshBuilder()
    build_torso(builder, bones)
    build_head(builder, bones)
    build_arm(builder, bones, "Left")
    build_arm(builder, bones, "Right")
    build_leg(builder, bones, "Left")
    build_leg(builder, bones, "Right")

    cage = create_cage(builder)
    armature = create_armature(bones)
    surface = create_production_surface(cage)
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
