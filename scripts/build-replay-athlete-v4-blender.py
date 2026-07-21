#!/usr/bin/env python3
"""Author the production RowPlay V4 athlete surface in Blender 5.

The script deliberately builds a generic sports illustration from reviewed
parametric source. It uses no downloaded model, scan, likeness, avatar
generator, image, or texture. The resulting temporary GLB contributes the
visible mesh, smooth normals, vertex colours, and skin weights; the Node build
step seals it onto the canonical V4 skeleton and deterministic sport clips.
"""

from __future__ import annotations

import argparse
import math
import pathlib
import sys
from dataclasses import dataclass
from typing import Callable, Iterable

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


def rgb(value: int) -> tuple[float, float, float, float]:
    return (
        ((value >> 16) & 0xFF) / 255.0,
        ((value >> 8) & 0xFF) / 255.0,
        (value & 0xFF) / 255.0,
        1.0,
    )


# High-contrast but restrained performance kit. Vertex colour keeps the final
# GLB to one primitive while preserving skin/kit/trim readability in both
# replay themes and in translucent ghost lanes.
FABRIC = rgb(0x343078)
FABRIC_SIDE = rgb(0x222651)
FABRIC_LIGHT = rgb(0x5D62AE)
SHORTS = rgb(0x171C2E)
SHORTS_PANEL = rgb(0x292E4B)
TRIM = rgb(0x6258C9)
SKIN = rgb(0xB97455)
SKIN_LIGHT = rgb(0xD69672)
HAIR = rgb(0x161B24)
SHOE = rgb(0xE0E7EC)
SHOE_DARK = rgb(0x202A35)
SOLE = rgb(0x111820)


def parse_args() -> argparse.Namespace:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser(description="Build the RowPlay V4 athlete surface in Blender")
    parser.add_argument("--output", required=True, type=pathlib.Path)
    return parser.parse_args(args)


def to_blender(value: Vector) -> Vector:
    """Map Three/glTF X-right, Y-up, Z-forward into Blender Z-up space."""

    return Vector((value.x, -value.z, value.y))


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


ColorFunction = Callable[[int, float, Vector, Ring], tuple[float, float, float, float]]
DeformFunction = Callable[[Vector, float, float], Vector]


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
        rings: Iterable[Ring],
        radial_segments: int,
        normal_hint: Vector = Vector((1.0, 0.0, 0.0)),
        color_function: ColorFunction | None = None,
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
                cos_angle = math.cos(angle)
                sin_angle = math.sin(angle)
                # Small second-order contour prevents mathematically perfect
                # tubes while remaining calm under smooth shading.
                contour = 1.0 + ring.squash * math.cos(angle * 2.0)
                point = (
                    ring.center
                    + normal * (cos_angle * ring.radii[0] * contour)
                    + bitangent * (sin_angle * ring.radii[1] / contour)
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

    def add_vertical_loft(
        self,
        rings: Iterable[Ring],
        radial_segments: int,
        color_function: ColorFunction | None = None,
    ) -> None:
        self.add_loft(rings, radial_segments, Vector((1.0, 0.0, 0.0)), color_function)

    def add_ellipsoid(
        self,
        center: Vector,
        radii: tuple[float, float, float],
        weights: dict[str, float],
        color: tuple[float, float, float, float],
        radial_segments: int = 28,
        height_segments: int = 18,
        deform: DeformFunction | None = None,
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
    # Dark side panels narrow the waist and make torso twist visible. A slim
    # front zip and upper yoke establish direction without a logo or likeness.
    if abs(point.x) > 0.78 * ring.radii[0]:
        return FABRIC_SIDE
    if point.z > ring.center.z and abs(point.x) < 0.018:
        return TRIM
    if point.y > 1.47 and point.z > ring.center.z + 0.04:
        return FABRIC_LIGHT
    return FABRIC


def build_torso(builder: AthleteMeshBuilder, bones: dict[str, Vector]) -> None:
    hips = bones["v4Hips"]
    spine = bones["v4Spine"]
    chest = bones["v4Chest"]
    neck = bones["v4Neck"]
    rings = [
        Ring(Vector((0, 0.865, -0.005)), (0.165, 0.125), {"v4Hips": 1}, SHORTS, 0.025),
        Ring(Vector((0, 0.925, -0.004)), (0.195, 0.145), {"v4Hips": 1}, SHORTS, 0.03),
        Ring(hips + Vector((0, 0.01, 0)), (0.215, 0.16), {"v4Hips": 1}, SHORTS, 0.035),
        Ring(Vector((0, 1.095, 0.004)), (0.188, 0.142), {"v4Hips": 0.78, "v4Spine": 0.22}, SHORTS),
        Ring(Vector((0, 1.135, 0.008)), (0.172, 0.13), {"v4Hips": 0.55, "v4Spine": 0.45}, TRIM),
        Ring(Vector((0, 1.175, 0.012)), (0.174, 0.132), {"v4Hips": 0.34, "v4Spine": 0.66}, FABRIC),
        Ring(spine + Vector((0, 0.005, 0.005)), (0.194, 0.145), {"v4Spine": 0.86, "v4Hips": 0.14}, FABRIC, 0.02),
        Ring(Vector((0, 1.29, 0.018)), (0.218, 0.16), {"v4Spine": 0.72, "v4Chest": 0.28}, FABRIC, 0.025),
        Ring(Vector((0, 1.37, 0.025)), (0.242, 0.176), {"v4Spine": 0.44, "v4Chest": 0.56}, FABRIC, 0.025),
        Ring(chest + Vector((0, -0.002, 0.016)), (0.258, 0.181), {"v4Chest": 0.82, "v4Spine": 0.18}, FABRIC, 0.02),
        Ring(Vector((0, 1.505, 0.045)), (0.266, 0.173), {"v4Chest": 0.9, "v4Neck": 0.1}, FABRIC, 0.015),
        Ring(Vector((0, 1.555, 0.052)), (0.225, 0.15), {"v4Chest": 0.84, "v4Neck": 0.16}, FABRIC),
        Ring(Vector((0, 1.59, 0.054)), (0.15, 0.105), {"v4Chest": 0.62, "v4Neck": 0.38}, FABRIC),
    ]
    builder.add_vertical_loft(rings, 52, torso_color)

    # A close front placket catches rim light without adding a floating collar
    # ring around a bending neck.
    builder.add_loft(
        [
            Ring(Vector((0, 1.19, 0.148)), (0.005, 0.004), {"v4Spine": 0.8, "v4Chest": 0.2}, FABRIC_LIGHT),
            Ring(Vector((0, 1.36, 0.194)), (0.005, 0.004), {"v4Spine": 0.35, "v4Chest": 0.65}, FABRIC_LIGHT),
            Ring(Vector((0, 1.53, 0.191)), (0.005, 0.004), {"v4Chest": 0.9, "v4Neck": 0.1}, FABRIC_LIGHT),
        ],
        10,
        Vector((1, 0, 0)),
    )
    # Neck has its own connected loft so head movement does not drag the broad
    # jersey collar into a rubber cone.
    builder.add_vertical_loft(
        [
            Ring(neck + Vector((0, -0.035, 0)), (0.076, 0.067), {"v4Chest": 0.35, "v4Neck": 0.65}, SKIN),
            Ring(neck + Vector((0, 0.02, 0.004)), (0.072, 0.064), {"v4Neck": 0.85, "v4Head": 0.15}, SKIN),
            Ring(neck + Vector((0, 0.075, 0.009)), (0.069, 0.061), {"v4Neck": 0.55, "v4Head": 0.45}, SKIN),
            Ring(neck + Vector((0, 0.112, 0.012)), (0.073, 0.065), {"v4Head": 1}, SKIN),
        ],
        32,
    )


def build_head(builder: AthleteMeshBuilder, bones: dict[str, Vector]) -> None:
    center = bones["v4Head"] + Vector((0, 0.075, 0.02))

    def shape_face(point: Vector, _u: float, _v: float) -> Vector:
        local = point - center
        # Taper jaw and chin while keeping cheek width; the exponentials build
        # a directional brow/nose/chin profile without copying a real face.
        if local.y < -0.025:
            taper = 0.76 + max(0.0, min(1.0, (local.y + 0.14) / 0.115)) * 0.24
            local.x *= taper
        front = max(0.0, local.z / 0.11)
        nose = math.exp(-((local.x / 0.028) ** 2 + ((local.y - 0.005) / 0.042) ** 2))
        brow = math.exp(-((local.y - 0.062) / 0.025) ** 2) * math.exp(-(local.x / 0.09) ** 4)
        chin = math.exp(-((local.y + 0.105) / 0.027) ** 2) * math.exp(-(local.x / 0.055) ** 2)
        local.z += front * (0.031 * nose + 0.009 * brow + 0.012 * chin)
        return center + local

    builder.add_ellipsoid(center, (0.116, 0.146, 0.108), {"v4Head": 1}, SKIN, 44, 30, shape_face)
    for side in (-1, 1):
        builder.add_ellipsoid(
            center + Vector((side * 0.114, 0.005, -0.004)),
            (0.017, 0.034, 0.021),
            {"v4Head": 1},
            SKIN_LIGHT,
            18,
            12,
        )

    # A close swept hair cap and narrow headband produce clear head direction
    # without a sport-specific helmet or facial identity.
    builder.add_loft(
        [
            Ring(center + Vector((0, 0.055, -0.014)), (0.111, 0.104), {"v4Head": 1}, HAIR),
            Ring(center + Vector((0, 0.095, -0.018)), (0.116, 0.108), {"v4Head": 1}, HAIR),
            Ring(center + Vector((0, 0.135, -0.02)), (0.091, 0.086), {"v4Head": 1}, HAIR),
            Ring(center + Vector((0, 0.158, -0.022)), (0.045, 0.043), {"v4Head": 1}, HAIR),
            Ring(center + Vector((0, 0.169, -0.023)), (0.014, 0.013), {"v4Head": 1}, HAIR),
            Ring(center + Vector((0, 0.172, -0.023)), (0.003, 0.003), {"v4Head": 1}, HAIR),
        ],
        38,
        Vector((1, 0, 0)),
        cap_start=False,
        cap_end=False,
    )
    # Two subtle brow bars survive a side-lit replay frame and keep the face
    # from becoming a blank sphere at desktop scale.
    for side in (-1, 1):
        builder.add_loft(
            [
                Ring(center + Vector((side * 0.064, 0.053, 0.106)), (0.006, 0.004), {"v4Head": 1}, HAIR),
                Ring(center + Vector((side * 0.027, 0.058, 0.116)), (0.006, 0.004), {"v4Head": 1}, HAIR),
            ],
            10,
            Vector((0, 1, 0)),
        )
        builder.add_ellipsoid(
            center + Vector((side * 0.042, 0.025, 0.111)),
            (0.011, 0.006, 0.004),
            {"v4Head": 1},
            HAIR,
            14,
            8,
        )
    builder.add_loft(
        [
            Ring(center + Vector((-0.028, -0.048, 0.107)), (0.0035, 0.0025), {"v4Head": 1}, HAIR),
            Ring(center + Vector((0, -0.054, 0.112)), (0.0035, 0.0025), {"v4Head": 1}, HAIR),
            Ring(center + Vector((0.028, -0.048, 0.107)), (0.0035, 0.0025), {"v4Head": 1}, HAIR),
        ],
        10,
        Vector((0, 1, 0)),
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

    def ring_at(
        center: Vector,
        radii: tuple[float, float],
        weights: dict[str, float],
        color,
        squash: float = 0.0,
    ) -> Ring:
        return Ring(center, radii, weights, color, squash)

    rings = [
        ring_at(chest.lerp(clavicle, 0.5), (0.035, 0.031), {"v4Chest": 0.72, clavicle_name: 0.28}, FABRIC),
        ring_at(clavicle, (0.055, 0.048), {"v4Chest": 0.18, clavicle_name: 0.66, upper_name: 0.16}, FABRIC),
        ring_at(shoulder, (0.079, 0.071), {clavicle_name: 0.32, upper_name: 0.68}, FABRIC, 0.04),
        ring_at(shoulder.lerp(elbow, 0.12), (0.088, 0.078), {upper_name: 0.96, clavicle_name: 0.04}, FABRIC, 0.055),
        ring_at(shoulder.lerp(elbow, 0.28), (0.084, 0.073), {upper_name: 1}, FABRIC, 0.045),
        ring_at(shoulder.lerp(elbow, 0.4), (0.077, 0.067), {upper_name: 1}, TRIM, 0.035),
        ring_at(shoulder.lerp(elbow, 0.48), (0.074, 0.064), {upper_name: 0.98, fore_name: 0.02}, SKIN_LIGHT, 0.03),
        ring_at(shoulder.lerp(elbow, 0.64), (0.069, 0.059), {upper_name: 0.92, fore_name: 0.08}, SKIN, 0.025),
        ring_at(shoulder.lerp(elbow, 0.8), (0.058, 0.05), {upper_name: 0.76, fore_name: 0.24}, SKIN),
        ring_at(shoulder.lerp(elbow, 0.92), (0.052, 0.047), {upper_name: 0.6, fore_name: 0.4}, SKIN),
        ring_at(elbow, (0.051, 0.046), {upper_name: 0.48, fore_name: 0.52}, SKIN),
        ring_at(elbow.lerp(wrist, 0.12), (0.058, 0.049), {upper_name: 0.26, fore_name: 0.74}, SKIN, 0.025),
        ring_at(elbow.lerp(wrist, 0.28), (0.063, 0.052), {upper_name: 0.08, fore_name: 0.92}, SKIN, 0.035),
        ring_at(elbow.lerp(wrist, 0.48), (0.057, 0.047), {fore_name: 0.98, hand_name: 0.02}, SKIN, 0.03),
        ring_at(elbow.lerp(wrist, 0.67), (0.049, 0.041), {fore_name: 0.9, hand_name: 0.1}, SKIN, 0.02),
        ring_at(elbow.lerp(wrist, 0.84), (0.04, 0.034), {fore_name: 0.72, hand_name: 0.28}, SKIN),
        ring_at(wrist, (0.033, 0.028), {fore_name: 0.32, hand_name: 0.68}, SKIN),
    ]
    builder.add_loft(rings, 34, Vector((0, 0, 1)), cap_start=False)

    # The palm and closed finger mass form a flattened grip around the exact
    # contact offset. A directional loft preserves a recognisable hand plane
    # even when the terminal bone points almost straight at the replay camera;
    # the old ellipsoid read as a round mitten in that view.
    hand_direction = (contact - wrist).normalized()
    palm_center = wrist.lerp(contact, 0.55)
    builder.add_loft(
        [
            Ring(wrist + hand_direction * 0.008, (0.031, 0.023), {hand_name: 1}, SKIN),
            Ring(wrist.lerp(contact, 0.28), (0.041, 0.025), {hand_name: 1}, SKIN_LIGHT, 0.04),
            Ring(palm_center, (0.046, 0.024), {hand_name: 1}, SKIN_LIGHT, 0.05),
            Ring(wrist.lerp(contact, 0.82), (0.04, 0.022), {hand_name: 1}, SKIN_LIGHT, 0.04),
            Ring(contact, (0.032, 0.019), {hand_name: 1}, SKIN, 0.02),
            Ring(contact + hand_direction * 0.018, (0.021, 0.015), {hand_name: 1}, SKIN),
            Ring(contact + hand_direction * 0.027, (0.009, 0.007), {hand_name: 1}, SKIN),
            Ring(contact + hand_direction * 0.031, (0.002, 0.002), {hand_name: 1}, SKIN),
        ],
        26,
        Vector((0, 1, 0)),
        cap_start=False,
        cap_end=False,
    )
    thumb_center = palm_center + Vector((-sign * 0.012, -0.017, 0.018))
    builder.add_ellipsoid(
        thumb_center,
        (0.025, 0.017, 0.022),
        {hand_name: 1},
        SKIN,
        18,
        12,
    )


def build_leg(builder: AthleteMeshBuilder, bones: dict[str, Vector], side_name: str) -> None:
    sign = -1.0 if side_name == "Left" else 1.0
    upper_name = f"v4{side_name}UpperLeg"
    lower_name = f"v4{side_name}LowerLeg"
    foot_name = f"v4{side_name}Foot"
    hips = bones["v4Hips"]
    hip = bones[upper_name]
    knee = bones[lower_name]
    ankle = bones[foot_name]

    # Begin each thigh inside the continuous pelvis volume and leave its buried
    # root uncapped. The original centreline cones and the first broad-root
    # revision both exposed planar end caps under hip flexion; a short,
    # co-axial weight transition produces a clean shorts-to-thigh silhouette.
    rings = [
        Ring(hip + Vector((0, 0.025, 0)), (0.112, 0.101), {"v4Hips": 0.86, upper_name: 0.14}, SHORTS, 0.035),
        Ring(hip + Vector((0, -0.018, 0.004)), (0.124, 0.109), {"v4Hips": 0.55, upper_name: 0.45}, SHORTS, 0.045),
        Ring(hip.lerp(knee, 0.1), (0.125, 0.111), {upper_name: 0.86, "v4Hips": 0.14}, SHORTS, 0.05),
        Ring(hip.lerp(knee, 0.24), (0.127, 0.112), {upper_name: 1}, SHORTS, 0.055),
        Ring(hip.lerp(knee, 0.4), (0.12, 0.105), {upper_name: 1}, SHORTS_PANEL, 0.045),
        Ring(hip.lerp(knee, 0.54), (0.112, 0.099), {upper_name: 0.98, lower_name: 0.02}, TRIM, 0.035),
        Ring(hip.lerp(knee, 0.68), (0.108, 0.096), {upper_name: 0.9, lower_name: 0.1}, FABRIC, 0.03),
        Ring(hip.lerp(knee, 0.82), (0.101, 0.091), {upper_name: 0.76, lower_name: 0.24}, FABRIC),
        Ring(hip.lerp(knee, 0.93), (0.095, 0.087), {upper_name: 0.58, lower_name: 0.42}, FABRIC),
        Ring(knee, (0.098, 0.09), {upper_name: 0.47, lower_name: 0.53}, FABRIC_LIGHT, 0.015),
        Ring(knee.lerp(ankle, 0.1), (0.101, 0.091), {upper_name: 0.24, lower_name: 0.76}, FABRIC, 0.025),
        Ring(knee.lerp(ankle, 0.24), (0.105, 0.094), {lower_name: 0.92, upper_name: 0.08}, FABRIC, 0.04),
        Ring(knee.lerp(ankle, 0.4), (0.098, 0.087), {lower_name: 0.98, foot_name: 0.02}, FABRIC, 0.035),
        Ring(knee.lerp(ankle, 0.57), (0.087, 0.079), {lower_name: 0.94, foot_name: 0.06}, FABRIC_SIDE, 0.025),
        Ring(knee.lerp(ankle, 0.72), (0.075, 0.069), {lower_name: 0.85, foot_name: 0.15}, FABRIC_SIDE, 0.015),
        Ring(knee.lerp(ankle, 0.86), (0.063, 0.058), {lower_name: 0.67, foot_name: 0.33}, FABRIC_SIDE),
        Ring(ankle, (0.057, 0.053), {lower_name: 0.32, foot_name: 0.68}, SHOE_DARK),
    ]
    builder.add_loft(rings, 38, Vector((1, 0, 0)), cap_start=False)

    # Separate, fully foot-weighted performance shoe: heel counter, shaped
    # upper, rocker toe, contrast sole, and laces. Its contact marker still
    # comes from the canonical terminal bone offset.
    heel = ankle + Vector((0, -0.035, -0.055))
    rear = ankle + Vector((0, -0.02, -0.015))
    mid = ankle + Vector((0, -0.045, 0.085))
    cleat = ankle + Vector(CONTACT_OFFSETS[foot_name])
    toe = ankle + Vector((0, -0.038, 0.235))
    builder.add_loft(
        [
            Ring(heel, (0.078, 0.054), {foot_name: 1}, SHOE_DARK, 0.03),
            Ring(rear, (0.09, 0.063), {foot_name: 1}, SHOE, 0.04),
            Ring(mid, (0.105, 0.061), {foot_name: 1}, SHOE, 0.045),
            Ring(cleat, (0.108, 0.052), {foot_name: 1}, SHOE, 0.035),
            Ring(toe, (0.086, 0.036), {foot_name: 1}, SHOE, 0.02),
        ],
        30,
        Vector((1, 0, 0)),
    )
    builder.add_loft(
        [
            Ring(heel + Vector((0, -0.035, 0.0)), (0.08, 0.012), {foot_name: 1}, SOLE),
            Ring(mid + Vector((0, -0.038, 0.0)), (0.108, 0.013), {foot_name: 1}, SOLE),
            Ring(cleat + Vector((0, -0.035, 0.0)), (0.112, 0.012), {foot_name: 1}, SOLE),
            Ring(toe + Vector((0, -0.026, -0.004)), (0.09, 0.01), {foot_name: 1}, SOLE),
        ],
        28,
        Vector((1, 0, 0)),
    )
    for z_offset in (0.075, 0.115, 0.155):
        builder.add_loft(
            [
                Ring(ankle + Vector((sign * -0.052, 0.018, z_offset)), (0.006, 0.004), {foot_name: 1}, TRIM),
                Ring(ankle + Vector((sign * 0.052, 0.018, z_offset)), (0.006, 0.004), {foot_name: 1}, TRIM),
            ],
            8,
            Vector((0, 1, 0)),
        )


def create_armature(bones: dict[str, Vector]):
    armature_data = bpy.data.armatures.new("RowPlayV4Armature")
    armature = bpy.data.objects.new("RowPlayV4Armature", armature_data)
    bpy.context.scene.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    definitions = {name: (parent, Vector(local)) for name, parent, local in BONE_DEFINITIONS}
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
            # Prefer the central child for torso; otherwise follow the first
            # declared chain. Bone roll is irrelevant to the final canonical
            # skeleton, but a sensible source armature keeps Blender inspection
            # readable and ensures stable skin export.
            preferred = child_names[0]
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


def create_mesh_object(builder: AthleteMeshBuilder, armature):
    mesh_data = bpy.data.meshes.new("RowPlayV4AthleteSurface")
    mesh_data.from_pydata(builder.vertices, [], builder.faces)
    mesh_data.update(calc_edges=True)
    for polygon in mesh_data.polygons:
        polygon.use_smooth = True

    color_layer = mesh_data.color_attributes.new(name="Color", type="BYTE_COLOR", domain="POINT")
    for index, color in enumerate(builder.colors):
        color_layer.data[index].color_srgb = color
    mesh_data.color_attributes.active_color = color_layer
    mesh_data.color_attributes.render_color_index = mesh_data.color_attributes.active_color_index

    athlete = bpy.data.objects.new("v4AthleteBlenderSource", mesh_data)
    bpy.context.scene.collection.objects.link(athlete)

    material = bpy.data.materials.new("RowPlayV4VertexColorMaterial")
    material.diffuse_color = (1.0, 1.0, 1.0, 1.0)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is not None:
        principled.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
        principled.inputs["Roughness"].default_value = 0.58
        if "Coat Weight" in principled.inputs:
            principled.inputs["Coat Weight"].default_value = 0.05
        if "Sheen Weight" in principled.inputs:
            principled.inputs["Sheen Weight"].default_value = 0.12
        vertex_color = material.node_tree.nodes.new("ShaderNodeVertexColor")
        vertex_color.layer_name = "Color"
        material.node_tree.links.new(vertex_color.outputs["Color"], principled.inputs["Base Color"])
    athlete.data.materials.append(material)

    groups = {name: athlete.vertex_groups.new(name=name) for name in BONE_NAMES}
    for vertex_index, weights in enumerate(builder.weights):
        for bone_name, weight in weights.items():
            groups[bone_name].add([vertex_index], weight, "REPLACE")

    modifier = athlete.modifiers.new(name="RowPlayV4Skin", type="ARMATURE")
    modifier.object = armature
    modifier.use_deform_preserve_volume = True
    athlete.parent = armature
    return athlete


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

    armature = create_armature(bones)
    athlete = create_mesh_object(builder, armature)

    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    athlete.select_set(True)
    bpy.context.view_layer.objects.active = athlete

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
    print(
        f"wrote Blender athlete source {output}: {len(builder.vertices)} vertices, "
        f"{sum(max(0, len(face) - 2) for face in builder.faces)} triangles, "
        f"{output.stat().st_size} bytes"
    )


if __name__ == "__main__":
    main()
