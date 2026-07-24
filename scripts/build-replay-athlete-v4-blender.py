#!/usr/bin/env python3
"""Author the production RowPlay V4 athlete surface in Blender 5.

Replaces the mannequin multi-loft assembly with a production sports character:

* denser anatomical source volumes with deliberate kit silhouette
* voxel remesh on the primary body mass only (coherent torso/limbs)
* post-remesh authored hands, face landmarks, ears, hair, kit trim, shoe overlays
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

import bmesh
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

# Visual-only deformation helpers. Clips never target these; the Node seal and
# web runtime inherit their pose from the parent hand, then apply a sport grip
# curl after contact. Keep names stable — they are production skin contracts.
HELPER_BONE_NAMES = [
    "v4LeftFingers",
    "v4LeftThumb",
    "v4RightFingers",
    "v4RightThumb",
]

CONTACT_OFFSETS = {
    "v4LeftHand": (-0.08, -0.01, 0.035),
    "v4RightHand": (0.08, -0.01, 0.035),
    "v4LeftFoot": (0.0, -0.055, 0.13),
    "v4RightFoot": (0.0, -0.055, 0.13),
}

ALL_DEFORM_BONE_NAMES = BONE_NAMES + HELPER_BONE_NAMES

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
HAIR = (0.30, 0.17, 0.09, 1.0)
# Face accents stay chocolate-brown rather than black. They are applied only as
# two compact eye regions; continuous painted brows or a mouth line become a
# visor or cartoon mask at normal replay distance.
EYE = (0.35, 0.20, 0.14, 1.0)
EYE_WHITE = (0.78, 0.72, 0.64, 1.0)
BROW = (0.25, 0.13, 0.08, 1.0)
MOUTH = (0.44, 0.24, 0.17, 1.0)
SHOE = (0.88, 0.90, 0.93, 1.0)
SHOE_DARK = (0.12, 0.15, 0.19, 1.0)
SOLE = (0.06, 0.08, 0.10, 1.0)

# Hard surface rebuild: fine voxel remesh preserves athletic silhouette and
# cage-authored facial planes instead of melting them into a soft mannequin.
# Hands stay post-remesh islands. Validator ceiling is 16 MB / 220k verts /
# 450k tris for live+ghost clone delivery.
VOXEL_SIZE = 0.0046
SMOOTH_ITERATIONS = 1
SMOOTH_FACTOR = 0.28


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
    # One continuous garment body: no geometric waist gap. Colour paint draws
    # shorts/jersey panels; radii stay continuous so remesh cannot open a
    # mannequin midsection. Hip solid is deliberately narrower so remesh-safe
    # legs (laterally offset) can emerge instead of being swallowed.
    rings = [
        # Deep shorts solid — continuous with long thigh stubs, no mid-body hole.
        Ring(Vector((0, 0.78, 0.01)), (0.135, 0.105), {"v4Hips": 1}, SHORTS, 0.05, 0.22),
        Ring(Vector((0, 0.86, 0.012)), (0.16, 0.122), {"v4Hips": 1}, SHORTS, 0.05, 0.26),
        Ring(Vector((0, 0.92, 0.014)), (0.172, 0.132), {"v4Hips": 1}, SHORTS, 0.06, 0.28),
        Ring(hips + Vector((0, -0.02, 0.016)), (0.18, 0.14), {"v4Hips": 1}, SHORTS, 0.06, 0.3),
        Ring(hips + Vector((0, 0.04, 0.016)), (0.178, 0.138), {"v4Hips": 1}, SHORTS, 0.05, 0.26),
        Ring(Vector((0, 1.08, 0.014)), (0.172, 0.132), {"v4Hips": 0.78, "v4Spine": 0.22}, SHORTS, 0.03, 0.16),
        Ring(Vector((0, 1.12, 0.012)), (0.17, 0.13), {"v4Hips": 0.5, "v4Spine": 0.5}, SHORTS_PANEL, 0.02, 0.1),
        # Continuous waist — jersey begins without a geometric pinch/gap.
        Ring(Vector((0, 1.15, 0.012)), (0.172, 0.132), {"v4Hips": 0.32, "v4Spine": 0.68}, TRIM, 0.02, 0.08),
        Ring(Vector((0, 1.18, 0.014)), (0.178, 0.135), {"v4Spine": 0.86, "v4Hips": 0.14}, FABRIC, 0.03, 0.06),
        Ring(spine + Vector((0, 0.01, 0.012)), (0.198, 0.148), {"v4Spine": 0.92, "v4Hips": 0.08}, FABRIC, 0.04, 0.06),
        Ring(Vector((0, 1.28, 0.02)), (0.222, 0.16), {"v4Spine": 0.7, "v4Chest": 0.3}, FABRIC_SIDE, 0.05, 0.08),
        Ring(Vector((0, 1.34, 0.026)), (0.242, 0.166), {"v4Spine": 0.45, "v4Chest": 0.55}, FABRIC, 0.05, 0.09),
        Ring(Vector((0, 1.4, 0.03)), (0.25, 0.17), {"v4Spine": 0.25, "v4Chest": 0.75}, FABRIC, 0.045, 0.1),
        Ring(chest + Vector((0, -0.02, 0.024)), (0.252, 0.172), {"v4Chest": 0.88, "v4Spine": 0.12}, FABRIC, 0.04, 0.1),
        Ring(chest + Vector((0, 0.02, 0.028)), (0.246, 0.162), {"v4Chest": 0.94, "v4Neck": 0.06}, FABRIC_LIGHT, 0.03, 0.08),
        Ring(Vector((0, 1.5, 0.042)), (0.22, 0.144), {"v4Chest": 0.8, "v4Neck": 0.2}, FABRIC, 0.025, 0.05),
        Ring(Vector((0, 1.535, 0.05)), (0.168, 0.112), {"v4Chest": 0.55, "v4Neck": 0.45}, TRIM, 0.02),
        Ring(Vector((0, 1.56, 0.052)), (0.118, 0.086), {"v4Chest": 0.28, "v4Neck": 0.72}, FABRIC_LIGHT, 0.015),
        Ring(Vector((0, 1.585, 0.054)), (0.082, 0.07), {"v4Neck": 0.85, "v4Chest": 0.15}, SKIN),
    ]
    builder.add_loft(rings, 72, Vector((1, 0, 0)), torso_color)

    # Crotch + lower shorts fill so the remeshed pelvis is a solid block.
    builder.add_loft(
        [
            Ring(Vector((0, 0.8, 0.015)), (0.12, 0.09), {"v4Hips": 1}, SHORTS, 0.1, 0.22),
            Ring(Vector((0, 0.88, 0.025)), (0.14, 0.1), {"v4Hips": 1}, SHORTS, 0.08, 0.2),
            Ring(Vector((0, 0.96, 0.03)), (0.15, 0.105), {"v4Hips": 1}, SHORTS, 0.06, 0.16),
            Ring(Vector((0, 1.04, 0.02)), (0.14, 0.1), {"v4Hips": 1}, SHORTS, 0.05, 0.12),
        ],
        40,
        Vector((1, 0, 0)),
        cap_start=True,
        cap_end=True,
    )

    builder.add_loft(
        [
            Ring(chest + Vector((0, 0.0, -0.04)), (0.2, 0.06), {"v4Chest": 0.9, "v4Spine": 0.1}, FABRIC_SIDE, 0.1),
            Ring(chest + Vector((0, 0.05, -0.055)), (0.175, 0.055), {"v4Chest": 0.85, "v4Neck": 0.15}, FABRIC, 0.08),
            Ring(neck + Vector((0, -0.02, -0.03)), (0.1, 0.04), {"v4Neck": 0.7, "v4Chest": 0.3}, FABRIC, 0.04),
        ],
        36,
        Vector((1, 0, 0)),
        cap_start=False,
        cap_end=False,
    )

    builder.add_loft(
        [
            Ring(neck + Vector((0, -0.02, 0.006)), (0.086, 0.074), {"v4Neck": 0.9, "v4Chest": 0.1}, SKIN),
            Ring(neck + Vector((0, 0.02, 0.012)), (0.066, 0.058), {"v4Neck": 0.88, "v4Head": 0.12}, SKIN),
            Ring(neck + Vector((0, 0.065, 0.016)), (0.068, 0.06), {"v4Neck": 0.5, "v4Head": 0.5}, SKIN),
            Ring(neck + Vector((0, 0.105, 0.018)), (0.074, 0.066), {"v4Head": 1}, SKIN),
        ],
        48,
        Vector((1, 0, 0)),
        cap_start=False,
    )


def build_head(builder: AthleteMeshBuilder, bones: dict[str, Vector]) -> None:
    center = bones["v4Head"] + Vector((0, 0.068, 0.02))

    def shape(point: Vector, _u: float, _v: float) -> Vector:
        local = point - center
        # Continuous face plane authored into the cage so fine remesh keeps a
        # human head rather than an egg with stick-on features.
        if local.y < -0.01:
            jaw_blend = max(0.0, min(1.0, (local.y + 0.14) / 0.13))
            local.x *= 0.72 + jaw_blend * 0.22
            local.z *= 0.84 + jaw_blend * 0.12
            # Square the jaw slightly for athletic broadcast silhouette.
            local.x *= 1.0 + 0.08 * max(0.0, -local.y - 0.04)
        elif local.y > 0.05:
            local.x *= 1.02
            local.z *= 0.97
        front = max(0.0, local.z / 0.1)
        forehead = math.exp(-((local.x / 0.078) ** 2 + ((local.y - 0.058) / 0.048) ** 2))
        temple = math.exp(-((abs(local.x) - 0.07) / 0.035) ** 2) * math.exp(
            -((local.y - 0.02) / 0.05) ** 2
        )
        nose_bridge = math.exp(-((local.x / 0.016) ** 2 + ((local.y - 0.01) / 0.055) ** 2))
        nose_tip = math.exp(-((local.x / 0.024) ** 2 + ((local.y + 0.022) / 0.022) ** 2))
        brow = math.exp(-((abs(local.x) - 0.042) / 0.024) ** 2) * math.exp(
            -((local.y - 0.028) / 0.018) ** 2
        )
        eye_socket = math.exp(-((abs(local.x) - 0.044) / 0.02) ** 2) * math.exp(
            -((local.y + 0.002) / 0.018) ** 2
        )
        cheek = math.exp(-((abs(local.x) - 0.055) / 0.038) ** 2) * math.exp(
            -((local.y + 0.038) / 0.036) ** 2
        )
        chin = math.exp(-((local.y + 0.1) / 0.026) ** 2) * math.exp(-(local.x / 0.045) ** 2)
        mouth_plane = math.exp(-((local.x / 0.042) ** 2 + ((local.y + 0.06) / 0.012) ** 2))
        philtrum = math.exp(-((local.x / 0.012) ** 2 + ((local.y + 0.04) / 0.018) ** 2))
        local.z += front * (
            0.009 * forehead
            + 0.018 * nose_bridge
            + 0.016 * nose_tip
            + 0.01 * brow
            - 0.01 * eye_socket
            + 0.007 * cheek
            + 0.014 * chin
            - 0.004 * mouth_plane
            + 0.004 * philtrum
            - 0.004 * temple
        )
        # Slight vertical nose ridge so remesh cannot flatten the midface.
        local.y += front * (0.004 * nose_bridge - 0.003 * eye_socket)
        return center + local

    # Dense cranium so facial planes survive voxel remesh.
    builder.add_ellipsoid(center, (0.1, 0.14, 0.096), {"v4Head": 1}, SKIN, 72, 52, shape)
    for side in (-1.0, 1.0):
        # Ear volume authored into the cage (not only post-remesh islands).
        builder.add_ellipsoid(
            center + Vector((side * 0.095, -0.004, -0.012)),
            (0.016, 0.03, 0.018),
            {"v4Head": 1},
            SKIN_LIGHT,
            20,
            14,
        )


def build_arm(builder: AthleteMeshBuilder, bones: dict[str, Vector], side_name: str) -> None:
    clavicle_name = f"v4{side_name}Clavicle"
    upper_name = f"v4{side_name}UpperArm"
    fore_name = f"v4{side_name}Forearm"
    hand_name = f"v4{side_name}Hand"
    chest = bones["v4Chest"]
    clavicle = bones[clavicle_name]
    shoulder = bones[upper_name]
    elbow = bones[fore_name]
    wrist = bones[hand_name]

    # Arm cage ends at the wrist. Authored palms/fingers join after remesh so
    # voxelisation cannot collapse them into mittens.
    rings = [
        # Thick, deeply buried sleeve root so remesh cannot open an armpit hole.
        Ring(chest.lerp(clavicle, 0.35), (0.055, 0.048), {"v4Chest": 0.88, clavicle_name: 0.12}, FABRIC),
        Ring(chest.lerp(clavicle, 0.7), (0.07, 0.06), {"v4Chest": 0.55, clavicle_name: 0.35, upper_name: 0.1}, FABRIC),
        Ring(clavicle, (0.08, 0.068), {"v4Chest": 0.3, clavicle_name: 0.5, upper_name: 0.2}, FABRIC, 0.04),
        # Keep a human deltoid sweep rather than a spherical shoulder pad.
        # The sleeve still overlaps the rib cage deeply enough for the raised
        # SkiErg and RowErg poses, but it tapers immediately into the upper arm.
        # Slightly fuller deltoid mass for Phase-C athletic read at chase distance.
        Ring(shoulder, (0.078, 0.07), {clavicle_name: 0.32, upper_name: 0.68, "v4Chest": 0.0}, FABRIC, 0.05, 0.04),
        Ring(shoulder.lerp(elbow, 0.12), (0.082, 0.072), {upper_name: 0.92, clavicle_name: 0.08}, FABRIC, 0.055, 0.04),
        Ring(shoulder.lerp(elbow, 0.28), (0.076, 0.067), {upper_name: 1}, FABRIC, 0.045, 0.035),
        Ring(shoulder.lerp(elbow, 0.42), (0.069, 0.06), {upper_name: 1}, TRIM, 0.03),
        Ring(shoulder.lerp(elbow, 0.55), (0.067, 0.057), {upper_name: 0.96, fore_name: 0.04}, SKIN_LIGHT, 0.025),
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
    builder.add_loft(rings, 52, Vector((0, 0, 1)), cap_start=False, cap_end=True)


def build_leg_stubs(builder: AthleteMeshBuilder, bones: dict[str, Vector], side_name: str) -> None:
    """Long thigh stubs remeshed with the torso — the continuous hip shell."""

    upper_name = f"v4{side_name}UpperLeg"
    hip = bones[upper_name]
    knee = bones[f"v4{side_name}LowerLeg"]
    # Stub runs almost to the knee so post-remesh legs can bury deep inside it.
    rings = [
        Ring(hip + Vector((0, 0.08, 0.0)), (0.13, 0.115), {"v4Hips": 0.92, upper_name: 0.08}, SHORTS, 0.06, 0.1),
        Ring(hip + Vector((0, 0.03, 0.004)), (0.145, 0.128), {"v4Hips": 0.6, upper_name: 0.4}, SHORTS, 0.07, 0.12),
        Ring(hip.lerp(knee, 0.2), (0.148, 0.13), {upper_name: 0.88, "v4Hips": 0.12}, SHORTS, 0.08, 0.12),
        Ring(hip.lerp(knee, 0.38), (0.145, 0.128), {upper_name: 1}, SHORTS, 0.07, 0.1),
        Ring(hip.lerp(knee, 0.55), (0.138, 0.122), {upper_name: 1}, SHORTS_PANEL, 0.06, 0.09),
        Ring(hip.lerp(knee, 0.7), (0.128, 0.114), {upper_name: 1}, SHORTS, 0.05, 0.07),
        Ring(hip.lerp(knee, 0.82), (0.115, 0.102), {upper_name: 1}, LEG_FABRIC, 0.04),
    ]
    builder.add_loft(rings, 52, Vector((1, 0, 0)), cap_start=False, cap_end=True)


def add_authored_legs(surface: bpy.types.Object, bones: dict[str, Vector]) -> None:
    """Join full legs after remesh; oversize thigh roots bury into remeshed stubs.

    Voxel remesh destroys thin shin tubes, so legs stay authored. A deep, fatter
    thigh root completely encloses the remeshed stub so bind pose has no skirt
    gap. No second remesh — that would re-eat the shins.
    """

    for side_name in ("Left", "Right"):
        upper_name = f"v4{side_name}UpperLeg"
        lower_name = f"v4{side_name}LowerLeg"
        foot_name = f"v4{side_name}Foot"
        hip = bones[upper_name]
        knee = bones[lower_name]
        ankle = bones[foot_name]
        builder = AthleteMeshBuilder()
        # Thigh root is tights-coloured and buried deep in the remeshed shorts
        # stub — never a second floating shorts shell under the jersey.
        rings = [
            Ring(hip.lerp(knee, 0.2), (0.148, 0.13), {upper_name: 0.95, "v4Hips": 0.05}, LEG_FABRIC, 0.08, 0.1),
            Ring(hip.lerp(knee, 0.35), (0.145, 0.128), {upper_name: 1}, LEG_FABRIC, 0.07, 0.09),
            Ring(hip.lerp(knee, 0.48), (0.136, 0.12), {upper_name: 0.96, lower_name: 0.04}, LEG_FABRIC, 0.06, 0.08),
            Ring(hip.lerp(knee, 0.6), (0.126, 0.112), {upper_name: 0.9, lower_name: 0.1}, LEG_FABRIC, 0.05, 0.06),
            Ring(hip.lerp(knee, 0.72), (0.118, 0.106), {upper_name: 0.78, lower_name: 0.22}, LEG_FABRIC, 0.05, 0.05),
            Ring(hip.lerp(knee, 0.86), (0.108, 0.1), {upper_name: 0.58, lower_name: 0.42}, LEG_FABRIC),
            Ring(knee, (0.1, 0.094), {upper_name: 0.4, lower_name: 0.6}, LEG_FABRIC, 0.04, 0.05),
            Ring(knee.lerp(ankle, 0.12), (0.11, 0.102), {upper_name: 0.16, lower_name: 0.84}, LEG_FABRIC, 0.055, 0.05),
            Ring(knee.lerp(ankle, 0.28), (0.114, 0.104), {lower_name: 0.95, upper_name: 0.05}, LEG_FABRIC, 0.06, 0.05),
            Ring(knee.lerp(ankle, 0.48), (0.106, 0.096), {lower_name: 0.97, foot_name: 0.03}, LEG_FABRIC, 0.05),
            Ring(knee.lerp(ankle, 0.66), (0.09, 0.084), {lower_name: 0.9, foot_name: 0.1}, LEG_FABRIC_SIDE, 0.04),
            Ring(knee.lerp(ankle, 0.84), (0.074, 0.07), {lower_name: 0.72, foot_name: 0.28}, LEG_FABRIC_SIDE),
            Ring(ankle, (0.054, 0.052), {lower_name: 0.3, foot_name: 0.7}, SHOE_DARK),
        ]
        builder.add_loft(rings, 48, Vector((1, 0, 0)), cap_start=False, cap_end=False)

        bone_cleat = ankle + Vector(CONTACT_OFFSETS[foot_name])
        bone_toe = ankle + Vector((0, -0.032, 0.22))
        bone_heel = ankle + Vector((0, -0.03, -0.048))
        bone_mid = ankle + Vector((0, -0.04, 0.09))
        weights = {foot_name: 1.0}
        builder.add_loft(
            [
                Ring(bone_heel, (0.066, 0.044), weights, SHOE_DARK, 0.03),
                Ring(ankle + Vector((0, -0.016, -0.01)), (0.08, 0.052), weights, SHOE, 0.04),
                Ring(bone_mid, (0.094, 0.052), weights, SHOE, 0.05),
                Ring(bone_cleat, (0.096, 0.044), weights, SHOE, 0.04),
                Ring(bone_toe, (0.072, 0.03), weights, SHOE, 0.02),
            ],
            30,
            Vector((1, 0, 0)),
        )
        builder.add_loft(
            [
                Ring(bone_heel + Vector((0, -0.03, 0.0)), (0.068, 0.011), weights, SOLE),
                Ring(bone_mid + Vector((0, -0.032, 0.0)), (0.096, 0.012), weights, SOLE),
                Ring(bone_cleat + Vector((0, -0.03, 0.0)), (0.098, 0.011), weights, SOLE),
                Ring(bone_toe + Vector((0, -0.022, -0.004)), (0.074, 0.01), weights, SOLE),
            ],
            24,
            Vector((1, 0, 0)),
        )
        join_builder_detail(
            surface, f"rowplay-v4-leg-{side_name.lower()}", builder, default_bone=upper_name
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

    # Visual finger helpers: knuckle/thumb pivots for grip-weighted skinning.
    for side_name in ("Left", "Right"):
        hand_name = f"v4{side_name}Hand"
        _wrist, _contact, forward, palm_right, palm_up, knuckle = hand_helper_landmarks(
            bones, side_name
        )
        fingers_name = f"v4{side_name}Fingers"
        thumb_name = f"v4{side_name}Thumb"
        fingers = armature_data.edit_bones.new(fingers_name)
        fingers.head = to_blender(knuckle)
        fingers.tail = to_blender(knuckle + forward * 0.055 - palm_up * 0.022)
        fingers.parent = edit_bones[hand_name]
        fingers.use_connect = False
        fingers.use_deform = True
        edit_bones[fingers_name] = fingers

        thumb_base = bones[hand_name].lerp(
            bones[hand_name] + Vector(CONTACT_OFFSETS[hand_name]), 0.28
        ) - palm_right * 0.034 - palm_up * 0.004
        thumb = armature_data.edit_bones.new(thumb_name)
        thumb.head = to_blender(thumb_base)
        thumb.tail = to_blender(
            thumb_base + forward * 0.03 - palm_right * 0.034 - palm_up * 0.016
        )
        thumb.parent = edit_bones[hand_name]
        thumb.use_connect = False
        thumb.use_deform = True
        edit_bones[thumb_name] = thumb

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


def add_authored_hands(surface: bpy.types.Object, bones: dict[str, Vector]) -> None:
    """Join grip-ready palms with four fingers and a thumb after body remesh.

    Finger and thumb mass weight onto visual helper joints so the runtime can
    apply a sport grip curl without expanding the 19-bone motion API.
    """

    for side_name in ("Left", "Right"):
        hand_name = f"v4{side_name}Hand"
        fingers_name = f"v4{side_name}Fingers"
        thumb_name = f"v4{side_name}Thumb"
        wrist, contact, forward, palm_right, palm_up, knuckle = hand_helper_landmarks(
            bones, side_name
        )
        builder = AthleteMeshBuilder()
        palm_weights = {hand_name: 1.0}
        finger_root = {hand_name: 0.35, fingers_name: 0.65}
        finger_tip = {fingers_name: 1.0}
        thumb_root = {hand_name: 0.3, thumb_name: 0.7}
        thumb_tip = {thumb_name: 1.0}

        # Palm mass starts slightly inside the remeshed wrist stump so the join
        # reads continuous, and places the grip contact inside the palm curl.
        palm_rings = [
            Ring(wrist - forward * 0.008, (0.03, 0.022), palm_weights, SKIN, 0.02),
            Ring(wrist + forward * 0.02, (0.04, 0.028), palm_weights, SKIN_LIGHT, 0.05),
            Ring(wrist.lerp(contact, 0.42), (0.05, 0.03), palm_weights, SKIN_LIGHT, 0.09),
            Ring(contact - forward * 0.012, (0.048, 0.026), palm_weights, SKIN_LIGHT, 0.07),
            Ring(contact + forward * 0.008, (0.04, 0.022), palm_weights, SKIN, 0.04),
        ]
        builder.add_loft(palm_rings, 22, palm_up, cap_start=False, cap_end=False)

        # Knuckle pad ridge so the finger root reads as a hand, not a paddle.
        builder.add_loft(
            [
                Ring(knuckle - forward * 0.01, (0.046, 0.018), palm_weights, SKIN, 0.05),
                Ring(knuckle, (0.05, 0.02), finger_root, SKIN_LIGHT, 0.06),
                Ring(knuckle + forward * 0.012, (0.044, 0.016), finger_root, SKIN, 0.04),
            ],
            18,
            palm_up,
            cap_start=False,
            cap_end=False,
        )

        # Four finger blocks: index→pinky, moderate bind curl; runtime adds grip.
        finger_spans = (-0.03, -0.01, 0.01, 0.028)
        finger_lengths = (0.062, 0.068, 0.064, 0.052)
        finger_radii = ((0.0105, 0.0095), (0.011, 0.01), (0.0105, 0.0095), (0.009, 0.0085))
        for span, length, radii in zip(finger_spans, finger_lengths, finger_radii, strict=True):
            base = knuckle + palm_right * span
            mid = base + forward * (length * 0.42) - palm_up * 0.012
            tip = base + forward * length - palm_up * 0.028
            builder.add_loft(
                [
                    Ring(base, (radii[0] * 1.2, radii[1] * 1.15), finger_root, SKIN, 0.05),
                    Ring(mid, radii, finger_tip, SKIN_LIGHT, 0.04),
                    Ring(tip, (radii[0] * 0.72, radii[1] * 0.72), finger_tip, SKIN, 0.03),
                    Ring(
                        tip + forward * 0.012 - palm_up * 0.006,
                        (0.0035, 0.0035),
                        finger_tip,
                        SKIN,
                    ),
                ],
                14,
                palm_up,
                cap_start=False,
                cap_end=True,
            )

        # Opposable thumb with helper-weighted segments.
        thumb_base = wrist.lerp(contact, 0.28) - palm_right * 0.034 - palm_up * 0.004
        thumb_mid = thumb_base + forward * 0.02 - palm_right * 0.022 - palm_up * 0.012
        thumb_end = thumb_base + forward * 0.034 - palm_right * 0.04 - palm_up * 0.022
        builder.add_loft(
            [
                Ring(thumb_base, (0.015, 0.013), thumb_root, SKIN, 0.05),
                Ring(thumb_mid, (0.013, 0.011), thumb_tip, SKIN_LIGHT, 0.04),
                Ring(thumb_end, (0.01, 0.009), thumb_tip, SKIN, 0.03),
                Ring(
                    thumb_end - palm_right * 0.012 - palm_up * 0.008,
                    (0.0045, 0.0045),
                    thumb_tip,
                    SKIN,
                ),
            ],
            14,
            palm_up,
            cap_start=False,
            cap_end=True,
        )
        join_builder_detail(
            surface, f"rowplay-v4-hand-{side_name.lower()}", builder, default_bone=hand_name
        )


def add_flush_face_details(surface: bpy.types.Object, bones: dict[str, Vector]) -> None:
    """Add only the smallest post-remesh eye accents.

    Nose, brow, jaw, chin, and ears are cage-authored into the continuous head
    so the portrait no longer reads as stickers on an egg. Eyes remain slightly
    proud colour islands for readable sclera/iris at chase distance.
    """

    center = bones["v4Head"] + Vector((0, 0.068, 0.02))

    for side in (-1.0, 1.0):
        side_name = "left" if side < 0 else "right"
        join_ellipsoid_detail(
            surface,
            f"rowplay-v4-eye-white-{side_name}",
            center + Vector((side * 0.042, 0.004, 0.09)),
            (0.015, 0.001, 0.0055),
            EYE_WHITE,
            "v4Head",
            segments=24,
            rings=12,
        )
        join_ellipsoid_detail(
            surface,
            f"rowplay-v4-iris-{side_name}",
            center + Vector((side * 0.042, 0.004, 0.093)),
            (0.0042, 0.0009, 0.0042),
            EYE,
            "v4Head",
            segments=18,
            rings=10,
        )


def add_short_hair_cap(surface: bpy.types.Object, bones: dict[str, Vector]) -> None:
    """Lay a close-fitting short-hair volume with a natural hairline."""

    center = bones["v4Head"] + Vector((0, 0.102, 0.024))
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=40,
        ring_count=24,
        location=to_blender(center),
    )
    hair = bpy.context.active_object
    hair.name = "rowplay-v4-short-hair-cap"
    # Blender axes map to RowPlay x / -z / y. Cap sits a few millimetres proud
    # of the cranium so it reads as cut hair rather than a helmet.
    hair.scale = (0.11, 0.11, 0.122)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mesh = hair.data
    edit = bmesh.new()
    edit.from_mesh(mesh)
    # Upper dome only: forehead rises, temples recede, rear skull sits lower.
    bmesh.ops.delete(
        edit,
        geom=[
            vertex
            for vertex in edit.verts
            if vertex.co.z
            < (
                -0.032
                + max(0.0, min(1.0, -vertex.co.y / 0.11))
                * (
                    0.068
                    + 0.026 * (abs(vertex.co.x) / 0.11) ** 1.8
                    - 0.014 * math.exp(-((vertex.co.x / 0.04) ** 2))
                )
            )
        ],
        context="VERTS",
    )
    edit.to_mesh(mesh)
    edit.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    color = mesh.color_attributes.new(name="Color", type="BYTE_COLOR", domain="POINT")
    for value in color.data:
        value.color_srgb = HAIR
    group = hair.vertex_groups.new(name="v4Head")
    group.add(list(range(len(mesh.vertices))), 1.0, "REPLACE")
    bpy.ops.object.select_all(action="DESELECT")
    surface.select_set(True)
    hair.select_set(True)
    bpy.context.view_layer.objects.active = surface
    bpy.ops.object.join()

    # Soft sideburn wedges so the hairline is not a single helmet rim.
    for side in (-1.0, 1.0):
        join_ellipsoid_detail(
            surface,
            f"rowplay-v4-sideburn-{'left' if side < 0 else 'right'}",
            bones["v4Head"] + Vector((side * 0.086, 0.02, 0.01)),
            (0.012, 0.028, 0.016),
            HAIR,
            "v4Head",
            segments=14,
            rings=10,
        )


def add_kit_trim(surface: bpy.types.Object, bones: dict[str, Vector]) -> None:
    """Join only sleeve cuffs as flush garment ridges.

    Collar and waistband breaks are now cage-authored into the torso so they
    remesh as continuous kit form rather than floating hoops.
    """

    builder = AthleteMeshBuilder()

    for side_name in ("Left", "Right"):
        upper = bones[f"v4{side_name}UpperArm"]
        elbow = bones[f"v4{side_name}Forearm"]
        cuff_center = upper.lerp(elbow, 0.48)
        cuff_weights = {f"v4{side_name}UpperArm": 0.9, f"v4{side_name}Forearm": 0.1}
        axis = (upper - elbow).normalized()
        builder.add_loft(
            [
                Ring(cuff_center + axis * 0.008, (0.06, 0.052), cuff_weights, TRIM, 0.03),
                Ring(cuff_center, (0.062, 0.054), cuff_weights, TRIM, 0.03),
                Ring(cuff_center - axis * 0.006, (0.058, 0.05), cuff_weights, FABRIC, 0.02),
            ],
            22,
            Vector((0, 0, 1)),
            cap_start=False,
            cap_end=False,
        )

    join_builder_detail(surface, "rowplay-v4-kit-trim", builder, default_bone="v4Chest")


def add_shoe_overlays(surface: bpy.types.Object, bones: dict[str, Vector]) -> None:
    """Join a slim heel counter only — soles are authored with the legs."""

    for side_name in ("Left", "Right"):
        foot_name = f"v4{side_name}Foot"
        ankle = bones[foot_name]
        builder = AthleteMeshBuilder()
        weights = {foot_name: 1.0}
        heel = ankle + Vector((0, -0.02, -0.04))
        builder.add_loft(
            [
                Ring(heel + Vector((0, 0.014, -0.006)), (0.058, 0.04), weights, SHOE_DARK, 0.04),
                Ring(heel + Vector((0, 0.0, 0.0)), (0.068, 0.046), weights, SHOE_DARK, 0.04),
                Ring(heel + Vector((0, -0.006, 0.016)), (0.062, 0.038), weights, SHOE, 0.03),
            ],
            16,
            Vector((1, 0, 0)),
            cap_start=False,
            cap_end=False,
        )
        join_builder_detail(
            surface,
            f"rowplay-v4-shoe-{side_name.lower()}",
            builder,
            default_bone=foot_name,
        )


def create_production_surface(cage: bpy.types.Object, bones: dict[str, Vector]) -> bpy.types.Object:
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

    # Light smooth only — heavy smooth is what melted earlier athletes into
    # soft mannequins and erased cage-authored facial / kit planes.
    smooth = surface.modifiers.new(name="ProductionSmooth", type="SMOOTH")
    smooth.factor = SMOOTH_FACTOR
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

    # Hands + full legs after remesh (shins must not go through another remesh).
    # Fat thigh roots bury into long remeshed stubs so the hip has no skirt gap.
    add_authored_hands(surface, bones)
    add_authored_legs(surface, bones)
    add_flush_face_details(surface, bones)
    add_short_hair_cap(surface, bones)
    add_kit_trim(surface, bones)
    add_shoe_overlays(surface, bones)

    # Preserve an authored texture-coordinate seam on the coherent remeshed
    # body. Runtime PBR detail maps use this single UV set for cloth weave,
    # skin micro-relief, footwear grain, and hair direction; the portable GLB
    # remains one mesh and one material.
    bpy.ops.object.select_all(action="DESELECT")
    surface.select_set(True)
    bpy.context.view_layer.objects.active = surface
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.15192, island_margin=0.028)
    bpy.ops.object.mode_set(mode="OBJECT")

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    # Hide the cage; only the production surface is exported.
    cage.hide_render = True
    cage.hide_viewport = True
    return surface


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
        if (y > 1.62 and abs(x) < 0.105) or (1.57 < y < 1.62 and abs(x) < 0.05 and z > 0.035):
            color = SKIN
        elif near_hand:
            color = SKIN_LIGHT if abs(x) > 0.58 else SKIN
        elif near_foot:
            color = SOLE if y < 0.035 else (SHOE_DARK if z < -0.01 else SHOE)
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

    bones = global_bone_positions()
    builder = AthleteMeshBuilder()
    build_torso(builder, bones)
    build_head(builder, bones)
    build_arm(builder, bones, "Left")
    build_arm(builder, bones, "Right")
    build_leg_stubs(builder, bones, "Left")
    build_leg_stubs(builder, bones, "Right")

    cage = create_cage(builder)
    armature = create_armature(bones)
    surface = create_production_surface(cage, bones)
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
