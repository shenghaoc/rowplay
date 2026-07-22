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
# replay themes and in the opaque, cool-tinted ghost lane.
FABRIC = rgb(0x343078)
FABRIC_SIDE = rgb(0x222651)
FABRIC_LIGHT = rgb(0x5D62AE)
SHORTS = rgb(0x171C2E)
SHORTS_PANEL = rgb(0x292E4B)
TRIM = rgb(0x6258C9)
# Slate performance tights keep both leg chains readable against the purple
# shell and carbon cockpit without turning the athlete into colour blocks.
LEG_FABRIC = rgb(0x3D6478)
LEG_FABRIC_SIDE = rgb(0x263E50)
LEG_FABRIC_LIGHT = rgb(0x7192A5)
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
    if point.z > ring.center.z and abs(point.x) < 0.018 and point.y < 1.48:
        return TRIM
    # No light yoke band at the throat — that painted a white collar ring under
    # high/ultra VSM that looked like a floating neck hoop.
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
        Ring(Vector((0, 1.37, 0.025)), (0.236, 0.172), {"v4Spine": 0.44, "v4Chest": 0.56}, FABRIC, 0.03),
        # Slightly narrower chest and sharper clavicle shelf so buried arm roots
        # do not read as a continuous rubber torso-to-sleeve tube.
        Ring(chest + Vector((0, -0.002, 0.016)), (0.248, 0.174), {"v4Chest": 0.82, "v4Spine": 0.18}, FABRIC, 0.025),
        # Jersey ends with a smooth radius ramp into the neck; no step that
        # high/ultra VSM can pick up as a floating collar.
        Ring(Vector((0, 1.5, 0.042)), (0.245, 0.16), {"v4Chest": 0.92, "v4Neck": 0.08}, FABRIC, 0.02),
        Ring(Vector((0, 1.535, 0.048)), (0.2, 0.138), {"v4Chest": 0.7, "v4Neck": 0.3}, FABRIC),
        Ring(Vector((0, 1.56, 0.05)), (0.145, 0.11), {"v4Chest": 0.35, "v4Neck": 0.65}, FABRIC),
        # Last torso ring already skin-coloured and neck-sized so the jersey
        # simply becomes the neck instead of ending on a dark fabric edge.
        Ring(Vector((0, 1.58, 0.052)), (0.095, 0.082), {"v4Neck": 0.75, "v4Chest": 0.25}, SKIN),
    ]
    builder.add_vertical_loft(rings, 54, torso_color)

    # The front zip is vertex colour in `torso_color`, not a second near-
    # coplanar tube. That avoids a moving depth seam across the chest.
    # Pure-skin neck continuation into the head. Starts inside the last torso
    # ring so there is no second silhouette edge.
    builder.add_vertical_loft(
        [
            Ring(neck + Vector((0, -0.03, 0.004)), (0.09, 0.078), {"v4Neck": 0.9, "v4Chest": 0.1}, SKIN),
            Ring(neck + Vector((0, 0.02, 0.008)), (0.07, 0.063), {"v4Neck": 0.9, "v4Head": 0.1}, SKIN),
            Ring(neck + Vector((0, 0.065, 0.012)), (0.068, 0.061), {"v4Neck": 0.55, "v4Head": 0.45}, SKIN),
            Ring(neck + Vector((0, 0.105, 0.014)), (0.074, 0.068), {"v4Head": 1}, SKIN),
        ],
        36,
    )


def build_head(builder: AthleteMeshBuilder, bones: dict[str, Vector]) -> None:
    """Clean high/ultra head: one continuous cranium, soft features, tight hair.

    Previous passes stacked open hair lofts, floating brow/eye/mouth tubes, and
    a hard jersey collar. Those read as black rings and smudges under high-tier
    VSM lighting. Features now live in vertex colour + mild displacement on the
    same ellipsoid so nothing floats off the skull.
    """

    center = bones["v4Head"] + Vector((0, 0.072, 0.018))

    def shape_and_paint(point: Vector, _u: float, _v: float) -> Vector:
        local = point - center
        # Gentle jaw taper — avoid the old sharp chin spike that faceted under
        # chase-camera lighting.
        if local.y < -0.02:
            taper = 0.84 + max(0.0, min(1.0, (local.y + 0.13) / 0.11)) * 0.16
            local.x *= taper
        front = max(0.0, local.z / 0.105)
        # Tiny nose/chin only. A continuous brow ridge previously cast a solid
        # black shadow band across the eyes under high/ultra key light — the
        # "visor" artefact. No brow extrusion, no painted features.
        nose = math.exp(-((local.x / 0.028) ** 2 + ((local.y + 0.0) / 0.04) ** 2))
        chin = math.exp(-((local.y + 0.09) / 0.03) ** 2) * math.exp(-(local.x / 0.055) ** 2)
        local.z += front * (0.012 * nose + 0.006 * chin)
        return center + local

    # Clean skull only — no painted brows/eyes/mouth. Those vertex-colour marks
    # read as a black visor or smudge under high/ultra lighting. Direction comes
    # from mild geometry (jaw taper, soft nose plane) and the hair cap silhouette.
    builder.add_ellipsoid(center, (0.112, 0.14, 0.104), {"v4Head": 1}, SKIN, 48, 32, shape_and_paint)

    # Compact ears, buried into the skull so they never read as floating disks.
    for side in (-1, 1):
        builder.add_ellipsoid(
            center + Vector((side * 0.108, 0.0, -0.008)),
            (0.014, 0.028, 0.018),
            {"v4Head": 1},
            SKIN_LIGHT,
            16,
            12,
        )

    # Low crown hair cap hugging the skull. Tall free-floating peeks and full
    # ring lofts both produce high/ultra artefacts; keep a short rear-biased
    # ellipsoid that never clears the head silhouette.
    hair_center = center + Vector((0, 0.078, -0.018))

    def shape_hair(point: Vector, _u: float, _v: float) -> Vector:
        local = point - hair_center
        # Flatten underside and front so the cap sits on the crown only.
        if local.y < 0:
            local.y *= 0.28
            local.x *= 0.9
        if local.z > 0:
            local.z *= 0.35
            local.y = max(local.y, 0.004)
        # Soften the peak so it does not read as a floating sphere tip.
        if local.y > 0.04:
            local.y = 0.04 + (local.y - 0.04) * 0.45
        return hair_center + local

    builder.add_ellipsoid(
        hair_center,
        (0.1, 0.055, 0.092),
        {"v4Head": 1},
        HAIR,
        32,
        20,
        shape_hair,
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

    # Buried sleeve root → athletic deltoid → tapered forearm → slim wrist.
    # The previous sleeve root was too thick and read as a sock joint under IK.
    rings = [
        ring_at(chest.lerp(clavicle, 0.55), (0.028, 0.025), {"v4Chest": 0.78, clavicle_name: 0.22}, FABRIC),
        ring_at(clavicle, (0.048, 0.042), {"v4Chest": 0.2, clavicle_name: 0.62, upper_name: 0.18}, FABRIC),
        ring_at(shoulder, (0.072, 0.064), {clavicle_name: 0.28, upper_name: 0.72}, FABRIC, 0.05),
        ring_at(shoulder.lerp(elbow, 0.1), (0.086, 0.076), {upper_name: 0.95, clavicle_name: 0.05}, FABRIC, 0.06),
        ring_at(shoulder.lerp(elbow, 0.24), (0.08, 0.07), {upper_name: 1}, FABRIC, 0.05),
        ring_at(shoulder.lerp(elbow, 0.38), (0.072, 0.063), {upper_name: 1}, TRIM, 0.04),
        ring_at(shoulder.lerp(elbow, 0.5), (0.068, 0.059), {upper_name: 0.97, fore_name: 0.03}, SKIN_LIGHT, 0.03),
        ring_at(shoulder.lerp(elbow, 0.66), (0.062, 0.054), {upper_name: 0.9, fore_name: 0.1}, SKIN, 0.025),
        ring_at(shoulder.lerp(elbow, 0.82), (0.052, 0.046), {upper_name: 0.72, fore_name: 0.28}, SKIN),
        # Pinch into a readable elbow before the forearm swells again.
        ring_at(shoulder.lerp(elbow, 0.94), (0.044, 0.04), {upper_name: 0.55, fore_name: 0.45}, SKIN),
        ring_at(elbow, (0.042, 0.039), {upper_name: 0.45, fore_name: 0.55}, SKIN),
        ring_at(elbow.lerp(wrist, 0.1), (0.05, 0.043), {upper_name: 0.22, fore_name: 0.78}, SKIN, 0.03),
        ring_at(elbow.lerp(wrist, 0.28), (0.056, 0.047), {fore_name: 0.94, upper_name: 0.06}, SKIN, 0.04),
        ring_at(elbow.lerp(wrist, 0.48), (0.05, 0.042), {fore_name: 0.97, hand_name: 0.03}, SKIN, 0.03),
        ring_at(elbow.lerp(wrist, 0.68), (0.042, 0.036), {fore_name: 0.88, hand_name: 0.12}, SKIN, 0.02),
        ring_at(elbow.lerp(wrist, 0.86), (0.034, 0.03), {fore_name: 0.68, hand_name: 0.32}, SKIN),
        ring_at(wrist, (0.028, 0.024), {fore_name: 0.28, hand_name: 0.72}, SKIN),
    ]
    builder.add_loft(rings, 36, Vector((0, 0, 1)), cap_start=False)

    # Flattened palm + closed finger wedge around the exact contact offset.
    # A longer finger loft and offset thumb keep the grip readable at chase
    # camera distance without reading as a spherical mitten.
    hand_direction = (contact - wrist).normalized()
    palm_center = wrist.lerp(contact, 0.48)
    builder.add_loft(
        [
            Ring(wrist + hand_direction * 0.006, (0.028, 0.02), {hand_name: 1}, SKIN),
            Ring(wrist.lerp(contact, 0.22), (0.038, 0.022), {hand_name: 1}, SKIN_LIGHT, 0.05),
            Ring(palm_center, (0.044, 0.021), {hand_name: 1}, SKIN_LIGHT, 0.06),
            Ring(wrist.lerp(contact, 0.72), (0.038, 0.019), {hand_name: 1}, SKIN_LIGHT, 0.05),
            Ring(contact, (0.03, 0.017), {hand_name: 1}, SKIN, 0.03),
            Ring(contact + hand_direction * 0.022, (0.022, 0.014), {hand_name: 1}, SKIN, 0.02),
            Ring(contact + hand_direction * 0.038, (0.014, 0.01), {hand_name: 1}, SKIN),
            Ring(contact + hand_direction * 0.048, (0.006, 0.005), {hand_name: 1}, SKIN),
            Ring(contact + hand_direction * 0.052, (0.002, 0.002), {hand_name: 1}, SKIN),
        ],
        28,
        Vector((0, 1, 0)),
        cap_start=False,
        cap_end=False,
    )
    # Thumb as a short opposing wedge rather than a floating ball.
    thumb_base = palm_center + Vector((-sign * 0.018, -0.012, 0.01))
    thumb_tip = palm_center + Vector((-sign * 0.034, -0.028, 0.028))
    builder.add_loft(
        [
            Ring(thumb_base, (0.014, 0.012), {hand_name: 1}, SKIN),
            Ring(thumb_base.lerp(thumb_tip, 0.55), (0.012, 0.01), {hand_name: 1}, SKIN_LIGHT),
            Ring(thumb_tip, (0.008, 0.007), {hand_name: 1}, SKIN),
            Ring(thumb_tip + (thumb_tip - thumb_base).normalized() * 0.012, (0.003, 0.003), {hand_name: 1}, SKIN),
        ],
        14,
        Vector((0, 0, 1)),
        cap_start=False,
        cap_end=False,
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
        Ring(hip.lerp(knee, 0.68), (0.108, 0.096), {upper_name: 0.9, lower_name: 0.1}, LEG_FABRIC, 0.03),
        Ring(hip.lerp(knee, 0.82), (0.101, 0.091), {upper_name: 0.76, lower_name: 0.24}, LEG_FABRIC),
        Ring(hip.lerp(knee, 0.93), (0.088, 0.082), {upper_name: 0.58, lower_name: 0.42}, LEG_FABRIC),
        # Knee pinch then calf swell — avoids a continuous sausage under flex.
        Ring(knee, (0.084, 0.08), {upper_name: 0.47, lower_name: 0.53}, LEG_FABRIC_LIGHT, 0.02),
        Ring(knee.lerp(ankle, 0.1), (0.092, 0.084), {upper_name: 0.24, lower_name: 0.76}, LEG_FABRIC, 0.03),
        Ring(knee.lerp(ankle, 0.24), (0.098, 0.088), {lower_name: 0.92, upper_name: 0.08}, LEG_FABRIC, 0.045),
        Ring(knee.lerp(ankle, 0.4), (0.092, 0.082), {lower_name: 0.98, foot_name: 0.02}, LEG_FABRIC, 0.035),
        Ring(knee.lerp(ankle, 0.57), (0.08, 0.074), {lower_name: 0.94, foot_name: 0.06}, LEG_FABRIC_SIDE, 0.025),
        Ring(knee.lerp(ankle, 0.72), (0.068, 0.064), {lower_name: 0.85, foot_name: 0.15}, LEG_FABRIC_SIDE, 0.015),
        Ring(knee.lerp(ankle, 0.86), (0.058, 0.054), {lower_name: 0.67, foot_name: 0.33}, LEG_FABRIC_SIDE),
        Ring(ankle, (0.052, 0.05), {lower_name: 0.32, foot_name: 0.68}, SHOE_DARK),
    ]
    builder.add_loft(rings, 40, Vector((1, 0, 0)), cap_start=False)

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
