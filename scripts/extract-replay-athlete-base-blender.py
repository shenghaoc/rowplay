#!/usr/bin/env python3
"""Extract the reviewed CC0 Blender human base used by the V4 athlete build.

Run from the official Human Base Meshes v1.4.1 library:

    blender --background human_base_meshes_bundle.blend \
      --python scripts/extract-replay-athlete-base-blender.py -- \
      --output static/replay-assets/source/rowplay-human-base-male-v1.4.1.blend

The resulting repository source contains only the realistic male body and its
two eyes. It applies one multires level for stable facial/anatomical topology,
removes editor-only metadata, resets the library-layout transform, and embeds a
plain-text provenance record. It does not create an identity or use a scan.
"""

from __future__ import annotations

import argparse
import pathlib
import sys

import bpy
from mathutils import Matrix


SOURCE_OBJECTS = {
    "GEO-body_male_realistic": "rowplayHumanBaseBody",
    "GEO-body_male_realistic.eye.L": "rowplayHumanBaseEyeLeft",
    "GEO-body_male_realistic.eye.R": "rowplayHumanBaseEyeRight",
}

PROVENANCE = """# RowPlay athlete anatomical base

Source: Blender Human Base Meshes v1.4.1
Source URL: https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip
Source creator: Dan Ulrich / Blender Studio
Source licence: Creative Commons Zero v1.0 Universal (CC0-1.0)
Downloaded: 2026-07-25

Modifications:
- retained GEO-body_male_realistic and its two eye objects only
- reset the source library display transform
- applied one level of the source Multires modifier
- removed library-only modifiers, materials, animation, and custom properties
- renamed objects to stable RowPlay source names

This is a generic anatomical base, not a scan, likeness, user image, or
avatar-generator output. The V4 production build reshapes it to the canonical
RowPlay skeleton, assigns deterministic skin weights, paints sports apparel
regions, and adds repository-authored hair and footwear detail.
"""


def parse_args() -> argparse.Namespace:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser(description="Extract the reviewed RowPlay human base")
    parser.add_argument("--output", required=True, type=pathlib.Path)
    return parser.parse_args(args)


def main() -> None:
    options = parse_args()
    output = options.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    missing = [name for name in SOURCE_OBJECTS if name not in bpy.data.objects]
    if missing:
        raise RuntimeError(f"Human Base Meshes source is missing: {', '.join(missing)}")

    keep = {bpy.data.objects[name] for name in SOURCE_OBJECTS}
    layout_origin = bpy.data.objects["GEO-body_male_realistic"].location.copy()
    for obj in list(bpy.data.objects):
        if obj not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)

    for source_name, target_name in SOURCE_OBJECTS.items():
        obj = bpy.data.objects[source_name]
        relative_matrix = Matrix.Translation(-layout_origin) @ obj.matrix_world
        obj.data.transform(relative_matrix)
        obj.name = target_name
        obj.data.name = target_name
        obj.matrix_world = Matrix.Identity(4)
        obj.animation_data_clear()
        for key in list(obj.keys()):
            del obj[key]
        if obj.type == "MESH":
            obj.data.materials.clear()

    body = bpy.data.objects["rowplayHumanBaseBody"]
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    for modifier in list(body.modifiers):
        if modifier.type == "MULTIRES":
            modifier.levels = 1
            modifier.sculpt_levels = 1
            modifier.render_levels = 1
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        else:
            body.modifiers.remove(modifier)

    for name in ("rowplayHumanBaseEyeLeft", "rowplayHumanBaseEyeRight"):
        eye = bpy.data.objects[name]
        for modifier in list(eye.modifiers):
            eye.modifiers.remove(modifier)

    for collection in list(bpy.data.collections):
        if collection != bpy.context.scene.collection:
            bpy.data.collections.remove(collection)
    for obj in keep:
        if obj.name not in bpy.context.scene.collection.objects:
            bpy.context.scene.collection.objects.link(obj)

    text = bpy.data.texts.new("ROWPLAY_SOURCE_PROVENANCE.md")
    text.write(PROVENANCE)
    bpy.ops.wm.save_as_mainfile(filepath=str(output), compress=True)
    print(
        f"wrote {output}: {len(body.data.vertices)} body vertices, "
        f"{sum(len(p.vertices) - 2 for p in body.data.polygons)} body triangles"
    )


if __name__ == "__main__":
    main()
