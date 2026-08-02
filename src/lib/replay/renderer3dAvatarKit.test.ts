import { describe, expect, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import {
  COURSE_LOOP_METERS,
  ELBOW_AXIS,
  GRIP_SHAFT_SCRATCH,
  SEGMENT_DIR,
  boatMaterial,
  ellipsoid,
  finalizeAvatar,
  humanMat,
  placeSegmentCoordinates,
} from "./renderer3dAvatarKit";
import {
  CourseRenderer3D,
  ROWER_PALM_TILT,
  ROWER_PALM_TILT_COMFORT,
  SKI_PALM_TILT,
  SKI_PALM_TILT_COMFORT,
} from "./renderer3d";

const SOURCE = readFileSync(new URL("./renderer3dAvatarKit.ts", import.meta.url), "utf8");

describe("renderer3dAvatarKit layering", () => {
  it("stays sport-neutral and below the course renderer", () => {
    // The kit is the bottom of the avatar layer: the three sport modules and
    // the course renderer import it, never the reverse. Importing any of them
    // here would re-create the cycle the split removed — a sport avatar could
    // no longer be built without pulling in the whole course renderer.
    for (const forbidden of [
      "./renderer3d",
      "./renderer3dRowAvatar",
      "./renderer3dSkiAvatar",
      "./renderer3dBikeAvatar",
    ]) {
      expect(SOURCE, `avatar kit must not import ${forbidden}`).not.toContain(
        `from "${forbidden}"`,
      );
    }
  });

  it("is the single authority for the course lap length", () => {
    // The ski avatar places course-relative pole hardware from this constant.
    // It used to read `CourseRenderer3D.LOOP_METERS`, which is what forced the
    // avatar to depend on the renderer; the class now re-exposes the constant
    // instead, so the two can never disagree.
    expect(CourseRenderer3D.LOOP_METERS).toBe(COURSE_LOOP_METERS);
    expect(COURSE_LOOP_METERS).toBe(1000);
  });

  it("leaves sport-specific grip policy in the owning sport modules", () => {
    for (const sportPolicy of [
      "ROWER_PALM_TILT",
      "ROWER_PALM_TILT_COMFORT",
      "SKI_PALM_TILT",
      "SKI_PALM_TILT_COMFORT",
    ]) {
      expect(SOURCE, `avatar kit must not own ${sportPolicy}`).not.toContain(sportPolicy);
    }
    // The stable renderer entry point still exposes the established API.
    expect([ROWER_PALM_TILT, ROWER_PALM_TILT_COMFORT]).toEqual([0.75, 0.3]);
    expect([SKI_PALM_TILT, SKI_PALM_TILT_COMFORT]).toEqual([0.65, 1.15]);
  });

  it("owns its scratch vectors as shared singletons", () => {
    // Module-level scratch is written in place and shared by every consumer,
    // so a caller may read one but must never retain it across a call into
    // another kit function. Distinct identities keep unrelated solves apart.
    expect(SEGMENT_DIR).not.toBe(ELBOW_AXIS);
    expect(SEGMENT_DIR).not.toBe(GRIP_SHAFT_SCRATCH);
    expect(SEGMENT_DIR).toBeInstanceOf(THREE.Vector3);
  });
});

describe("renderer3dAvatarKit primitives", () => {
  it("spans a segment between two points and orients it along the run", () => {
    const segment = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), humanMat(0x808080));
    placeSegmentCoordinates(segment, 0, 0, 0, 0, 0, 2);
    expect(segment.position.toArray()).toEqual([0, 0, 1]);
    expect(segment.scale.z).toBeCloseTo(2, 6);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(segment.quaternion);
    expect(forward.z).toBeCloseTo(1, 6);
  });

  it("hides a collapsed segment and revives it when length returns", () => {
    const segment = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), humanMat(0x808080));
    placeSegmentCoordinates(segment, 0, 0, 0, 0, 0, 0);
    expect(segment.visible).toBe(false);
    expect(segment.userData.replaySegmentLengthCollapse).toBe(true);
    placeSegmentCoordinates(segment, 0, 0, 0, 0, 0, 1);
    expect(segment.visible).toBe(true);
    expect(segment.userData.replaySegmentLengthCollapse).toBeUndefined();
  });

  it("leaves a deliberately hidden segment hidden", () => {
    // V4 hides the procedural limb tubes once; a later placement must not
    // resurrect them, or the athlete renders with two sets of limbs.
    const segment = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), humanMat(0x808080));
    segment.visible = false;
    placeSegmentCoordinates(segment, 0, 0, 0, 0, 0, 1);
    expect(segment.visible).toBe(false);
  });

  it("spends material response on the tiers that can show it", () => {
    const low = boatMaterial(0x336699, 0, 0.34, 0.08);
    const ultra = boatMaterial(0x336699, 3, 0.34, 0.08);
    expect(low).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(ultra).toBeInstanceOf(THREE.MeshPhysicalMaterial);
  });

  it("makes ghost lanes transparent without disturbing the live lane", () => {
    const opaque = new THREE.Group();
    opaque.add(new THREE.Mesh(ellipsoid([0.1, 0.1, 0.1], humanMat(0x808080)).geometry));
    const ghost = new THREE.Group();
    ghost.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), humanMat(0x808080)));
    finalizeAvatar(opaque, true, 1);
    finalizeAvatar(ghost, false, 0.4);
    const ghostMesh = ghost.children[0] as THREE.Mesh;
    const ghostMat = ghostMesh.material as THREE.Material;
    expect(ghostMesh.castShadow).toBe(false);
    expect(ghostMat.transparent).toBe(true);
    expect(ghostMat.opacity).toBeCloseTo(0.4, 6);
    expect(ghostMat.depthWrite).toBe(false);
  });
});
