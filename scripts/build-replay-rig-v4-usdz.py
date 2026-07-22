#!/usr/bin/env python3
import argparse
import hashlib
import pathlib
import sys


EXPECTED_BONES = [
    "v4Hips",
    "v4Spine",
    "v4Chest",
    "v4Neck",
    "v4Head",
    "v4LeftClavicle",
    "v4LeftUpperArm",
    "v4LeftForearm",
    "v4LeftHand",
    "v4RightClavicle",
    "v4RightUpperArm",
    "v4RightForearm",
    "v4RightHand",
    "v4LeftUpperLeg",
    "v4LeftLowerLeg",
    "v4LeftFoot",
    "v4RightUpperLeg",
    "v4RightLowerLeg",
    "v4RightFoot",
]


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_args() -> argparse.Namespace:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser(
        description="Convert the canonical RowPlay V4 GLB to a native USDZ derivative with Blender.",
    )
    parser.add_argument("--input", required=True, type=pathlib.Path)
    parser.add_argument("--output", required=True, type=pathlib.Path)
    return parser.parse_args(args)


def main() -> None:
    import bpy

    options = parse_args()
    input_path = options.input.resolve()
    output_path = options.output.resolve()
    if not input_path.is_file():
        raise SystemExit(f"missing input GLB: {input_path}")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0

    result = bpy.ops.import_scene.gltf(filepath=str(input_path))
    if "FINISHED" not in result:
        raise RuntimeError(f"GLB import failed: {result}")

    meshes = [object for object in bpy.context.scene.objects if object.type == "MESH"]
    armatures = [object for object in bpy.context.scene.objects if object.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one imported armature, received {len(armatures)}")

    armature = armatures[0]
    skinned_meshes = [
        object
        for object in meshes
        if any(modifier.type == "ARMATURE" and modifier.object == armature for modifier in object.modifiers)
    ]
    helper_meshes = [object for object in meshes if object not in skinned_meshes]
    if len(skinned_meshes) != 1:
        raise RuntimeError(f"expected one armature-bound athlete mesh, received {len(skinned_meshes)}")
    for helper in helper_meshes:
        if helper.vertex_groups or helper.name != "Icosphere":
            raise RuntimeError(f"unexpected unskinned GLB import mesh: {helper.name}")
        bpy.data.objects.remove(helper, do_unlink=True)

    mesh = skinned_meshes[0]
    bone_names = [bone.name for bone in armature.data.bones]
    if bone_names != EXPECTED_BONES:
        raise RuntimeError(f"bone order drifted after GLB import: {bone_names}")
    if not any(modifier.type == "ARMATURE" and modifier.object == armature for modifier in mesh.modifiers):
        raise RuntimeError("imported mesh is not bound to the imported armature")
    if sorted(group.name for group in mesh.vertex_groups) != sorted(EXPECTED_BONES):
        raise RuntimeError("imported mesh vertex groups do not match the V4 skeleton")
    if not bpy.data.actions:
        raise RuntimeError("imported GLB contains no animation actions")

    for object in bpy.context.scene.objects:
        object.select_set(True)
    bpy.context.view_layer.objects.active = mesh

    result = bpy.ops.wm.usd_export(
        filepath=str(output_path),
        selected_objects_only=False,
        export_animation=True,
        export_meshes=True,
        export_materials=True,
        export_mesh_colors=True,
        export_normals=True,
        export_armatures=True,
        only_deform_bones=False,
        export_custom_properties=True,
        convert_orientation=True,
        export_global_forward_selection="Z",
        export_global_up_selection="Y",
        convert_scene_units="METERS",
        meters_per_unit=1.0,
        triangulate_meshes=True,
        root_prim_path="/RowPlayV4Athlete",
        author_blender_name=False,
    )
    if "FINISHED" not in result:
        raise RuntimeError(f"USDZ export failed: {result}")
    if not output_path.is_file() or output_path.stat().st_size == 0:
        raise RuntimeError(f"USDZ export did not create a non-empty file: {output_path}")
    print(
        f"wrote {output_path}: {output_path.stat().st_size} bytes, sha256 {sha256(output_path)}"
    )


if __name__ == "__main__":
    main()
