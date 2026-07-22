#!/usr/bin/env python3
"""Render reproducible Blender studio frames for the checked V4 athlete."""

from __future__ import annotations

import argparse
import math
import pathlib
import sys

import bpy
from mathutils import Vector


SPORT_FRAMES = {
    "rower": ("rowplay-v4-row-cycle", (0.03, 0.38, 0.72)),
    "skier": ("rowplay-v4-ski-cycle", (0.03, 0.28, 0.58)),
    "bike": ("rowplay-v4-bike-cycle", (0.0, 0.25, 0.5)),
}


def parse_args() -> argparse.Namespace:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser(description="Render RowPlay V4 studio QA frames")
    parser.add_argument("--input", required=True, type=pathlib.Path)
    parser.add_argument("--output", required=True, type=pathlib.Path)
    parser.add_argument("--sport", choices=(*SPORT_FRAMES, "all"), default="all")
    return parser.parse_args(args)


def point_at(object, target: Vector) -> None:
    object.rotation_euler = (target - object.location).to_track_quat("-Z", "Y").to_euler()


def area_light(name: str, location, energy: float, size: float, color) -> None:
    data = bpy.data.lights.new(name=name, type="AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    light = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(light)
    light.location = location
    point_at(light, Vector((0, 0, 1.0)))


def add_studio() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "JPEG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.quality = 92
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world.color = (0.018, 0.025, 0.045)

    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, -0.08))
    floor = bpy.context.object
    floor.name = "QA floor"
    material = bpy.data.materials.new("QA floor material")
    material.diffuse_color = (0.035, 0.055, 0.085, 1.0)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is not None:
        principled.inputs["Base Color"].default_value = (0.035, 0.055, 0.085, 1.0)
        principled.inputs["Roughness"].default_value = 0.82
    floor.data.materials.append(material)

    camera_data = bpy.data.cameras.new("QA camera")
    camera = bpy.data.objects.new("QA camera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    camera.location = (2.55, -4.75, 2.18)
    camera.data.lens = 62
    point_at(camera, Vector((0, 0, 0.96)))
    scene.camera = camera

    area_light("Key", (3.8, -3.8, 5.2), 980, 4.2, (1.0, 0.88, 0.76))
    area_light("Fill", (-4.5, -2.4, 3.1), 620, 4.8, (0.45, 0.67, 1.0))
    area_light("Rim", (0.6, 3.4, 4.4), 1050, 3.2, (0.64, 0.5, 1.0))
    area_light("Top", (-0.6, 0.2, 6.0), 210, 3.0, (1.0, 1.0, 1.0))


def main() -> None:
    options = parse_args()
    source = options.input.resolve()
    output = options.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    if not source.is_file():
        raise SystemExit(f"missing V4 GLB: {source}")

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    result = bpy.ops.import_scene.gltf(filepath=str(source))
    if "FINISHED" not in result:
        raise RuntimeError(f"GLB import failed: {result}")

    armatures = [object for object in bpy.context.scene.objects if object.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one armature, received {len(armatures)}")
    armature = armatures[0]
    for object in bpy.context.scene.objects:
        if object.type == "MESH" and object.name == "Icosphere":
            object.hide_render = True
            object.hide_viewport = True

    if armature.animation_data is None:
        armature.animation_data_create()
    for track in armature.animation_data.nla_tracks:
        track.mute = True

    add_studio()
    selected_sports = SPORT_FRAMES if options.sport == "all" else {options.sport: SPORT_FRAMES[options.sport]}
    for sport, (action_name, phases) in selected_sports.items():
        action = bpy.data.actions.get(action_name)
        if action is None:
            raise RuntimeError(f"missing imported action: {action_name}")
        armature.animation_data.action = action
        for index, phase in enumerate(phases):
            frame = action.frame_range[0] + phase * (action.frame_range[1] - action.frame_range[0])
            whole_frame = math.floor(frame)
            bpy.context.scene.frame_set(whole_frame, subframe=frame - whole_frame)
            bpy.context.scene.render.filepath = str(output / f"v4-blender-{sport}-{index + 1}.jpg")
            bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
