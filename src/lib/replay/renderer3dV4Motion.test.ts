import { describe, expect, it } from "vite-plus/test";
import * as THREE from "three";
import type { Sport } from "../types";
import {
  REPLAY_V4_CLIP_NAMES,
  REPLAY_V4_BONE_NAMES,
  type ReplayV4AthleteInstance,
  type ReplayV4BoneName,
  type ReplayV4ClipName,
  type ReplayV4EffectorMetrics,
} from "./renderer3dV4Assets";
import {
  installReplayV4MotionController,
  type ReplayV4ContactTargets,
  type ReplayV4MotionController,
} from "./renderer3dV4Motion";

type TestLane = {
  readonly scene: THREE.Group;
  readonly parent: THREE.Group;
  readonly instance: ReplayV4AthleteInstance;
  readonly targets: ReplayV4ContactTargets;
  readonly athleteFallback: THREE.Object3D;
  readonly initiallyHiddenFallback: THREE.Object3D;
  readonly headband: THREE.Object3D;
  readonly equipment: THREE.Object3D;
};

const BONE_DEFINITIONS: readonly {
  readonly name: ReplayV4BoneName;
  readonly parent?: ReplayV4BoneName;
  readonly position: readonly [number, number, number];
}[] = [
  { name: "v4Hips", position: [0, 1, 0] },
  { name: "v4Spine", parent: "v4Hips", position: [0, 0.22, 0] },
  { name: "v4Chest", parent: "v4Spine", position: [0, 0.25, 0] },
  { name: "v4Neck", parent: "v4Chest", position: [0, 0.18, 0] },
  { name: "v4Head", parent: "v4Neck", position: [0, 0.14, 0.01] },
  { name: "v4LeftClavicle", parent: "v4Chest", position: [-0.18, 0.12, 0] },
  { name: "v4LeftUpperArm", parent: "v4LeftClavicle", position: [0, 0, 0] },
  { name: "v4LeftForearm", parent: "v4LeftUpperArm", position: [-0.3, -0.05, 0.02] },
  { name: "v4LeftHand", parent: "v4LeftForearm", position: [-0.27, -0.04, 0.02] },
  { name: "v4RightClavicle", parent: "v4Chest", position: [0.18, 0.12, 0] },
  { name: "v4RightUpperArm", parent: "v4RightClavicle", position: [0, 0, 0] },
  { name: "v4RightForearm", parent: "v4RightUpperArm", position: [0.3, -0.05, 0.02] },
  { name: "v4RightHand", parent: "v4RightForearm", position: [0.27, -0.04, 0.02] },
  { name: "v4LeftUpperLeg", parent: "v4Hips", position: [-0.11, 0, 0] },
  { name: "v4LeftLowerLeg", parent: "v4LeftUpperLeg", position: [0, -0.45, 0.02] },
  { name: "v4LeftFoot", parent: "v4LeftLowerLeg", position: [0, -0.45, 0.04] },
  { name: "v4RightUpperLeg", parent: "v4Hips", position: [0.11, 0, 0] },
  { name: "v4RightLowerLeg", parent: "v4RightUpperLeg", position: [0, -0.45, 0.02] },
  { name: "v4RightFoot", parent: "v4RightLowerLeg", position: [0, -0.45, 0.04] },
];

const IK_CHAIN_BONE_NAMES = [
  "v4LeftUpperArm",
  "v4LeftForearm",
  "v4LeftHand",
  "v4RightUpperArm",
  "v4RightForearm",
  "v4RightHand",
  "v4LeftUpperLeg",
  "v4LeftLowerLeg",
  "v4LeftFoot",
  "v4RightUpperLeg",
  "v4RightLowerLeg",
  "v4RightFoot",
] as const satisfies readonly ReplayV4BoneName[];

function quaternionValues(quaternion: THREE.Quaternion): number[] {
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}

function sportClip(sport: Sport): THREE.AnimationClip {
  const axis =
    sport === "rower"
      ? new THREE.Vector3(1, 0, 0)
      : sport === "skierg"
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);
  const angle = sport === "rower" ? 0.32 : sport === "skierg" ? 0.44 : 0.56;
  const neutral = new THREE.Quaternion();
  const peak = new THREE.Quaternion().setFromAxisAngle(axis, angle);
  const spineTrack = new THREE.QuaternionKeyframeTrack(
    "v4Athlete.bones[v4Spine].quaternion",
    [0, 0.5, 1],
    [...quaternionValues(neutral), ...quaternionValues(peak), ...quaternionValues(neutral)],
  );
  const hipPeak = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(sport === "bike" ? 0.04 : 0.18, 0, sport === "bike" ? 0.16 : 0.03),
  );
  const hipsTrack = new THREE.QuaternionKeyframeTrack(
    "v4Athlete.bones[v4Hips].quaternion",
    [0, 0.5, 1],
    [...quaternionValues(neutral), ...quaternionValues(hipPeak), ...quaternionValues(neutral)],
  );
  const leftArmStart = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.06, 0.48));
  const leftArmPeak = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.14, -0.04, -0.38));
  const rightArmStart = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, -0.06, -0.48));
  const rightArmPeak = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.14, 0.04, 0.38));
  const leftArmTrack = new THREE.QuaternionKeyframeTrack(
    "v4Athlete.bones[v4LeftUpperArm].quaternion",
    [0, 0.5, 1],
    [
      ...quaternionValues(leftArmStart),
      ...quaternionValues(leftArmPeak),
      ...quaternionValues(leftArmStart),
    ],
  );
  const rightArmTrack = new THREE.QuaternionKeyframeTrack(
    "v4Athlete.bones[v4RightUpperArm].quaternion",
    [0, 0.5, 1],
    [
      ...quaternionValues(rightArmStart),
      ...quaternionValues(rightArmPeak),
      ...quaternionValues(rightArmStart),
    ],
  );
  return new THREE.AnimationClip(REPLAY_V4_CLIP_NAMES[sport], 1, [
    spineTrack,
    hipsTrack,
    leftArmTrack,
    rightArmTrack,
  ]);
}

function createInstance(): ReplayV4AthleteInstance {
  const root = new THREE.Group();
  const bones = {} as Record<ReplayV4BoneName, THREE.Bone>;
  for (const definition of BONE_DEFINITIONS) {
    const bone = new THREE.Bone();
    bone.name = definition.name;
    bone.position.fromArray(definition.position);
    bones[definition.name] = bone;
    const parent = definition.parent ? bones[definition.parent] : root;
    parent.add(bone);
  }
  root.updateMatrixWorld(true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-0.05, 1, 0, 0.05, 1, 0, 0, 1.1, 0], 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
  );
  geometry.setIndex([0, 1, 2]);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = "v4Athlete";
  const skeleton = new THREE.Skeleton(REPLAY_V4_BONE_NAMES.map((name) => bones[name]));
  mesh.bind(skeleton);
  root.add(mesh);
  root.updateMatrixWorld(true);

  const row = sportClip("rower");
  const ski = sportClip("skierg");
  const bike = sportClip("bike");
  const clips = new Map<ReplayV4ClipName, THREE.AnimationClip>([
    [REPLAY_V4_CLIP_NAMES.rower, row],
    [REPLAY_V4_CLIP_NAMES.skierg, ski],
    [REPLAY_V4_CLIP_NAMES.bike, bike],
  ]);
  const effectors: ReplayV4EffectorMetrics = Object.freeze({
    leftHand: Object.freeze({
      bone: "v4LeftHand",
      contactRole: "left-hand",
      contactOffset: [-0.04, 0, 0.02] as const,
      proximalLength: 0.3048,
      distalLength: 0.2737,
      totalReach: 0.5785,
    }),
    rightHand: Object.freeze({
      bone: "v4RightHand",
      contactRole: "right-hand",
      contactOffset: [0.04, 0, 0.02] as const,
      proximalLength: 0.3048,
      distalLength: 0.2737,
      totalReach: 0.5785,
    }),
    leftFoot: Object.freeze({
      bone: "v4LeftFoot",
      contactRole: "left-foot",
      contactOffset: [0, -0.04, 0.08] as const,
      proximalLength: 0.4504,
      distalLength: 0.4518,
      totalReach: 0.9022,
    }),
    rightFoot: Object.freeze({
      bone: "v4RightFoot",
      contactRole: "right-foot",
      contactOffset: [0, -0.04, 0.08] as const,
      proximalLength: 0.4504,
      distalLength: 0.4518,
      totalReach: 0.9022,
    }),
  });
  return {
    root,
    mesh,
    skeleton,
    bones: Object.freeze(bones),
    clips,
    clipsBySport: Object.freeze({ rower: row, skierg: ski, bike }),
    clipTimingBySport: Object.freeze({
      rower: Object.freeze({ clip: row, driveEnd: 0.38 }),
      skierg: Object.freeze({ clip: ski, driveEnd: 0.34 }),
      bike: Object.freeze({ clip: bike, driveEnd: 0.5 }),
    }),
    effectors,
    mixer: new THREE.AnimationMixer(root),
  };
}

function target(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Object3D {
  const object = new THREE.Object3D();
  object.position.set(x, y, z);
  parent.add(object);
  return object;
}

function createLane(): TestLane {
  const scene = new THREE.Group();
  scene.position.set(3, -1, 2);
  scene.rotation.set(0.08, -0.42, 0.03);
  const parent = new THREE.Group();
  parent.position.set(-0.7, 0.4, 1.1);
  parent.rotation.set(-0.05, 0.27, -0.04);
  parent.scale.setScalar(1.15);
  scene.add(parent);

  const athleteFallback = new THREE.Object3D();
  athleteFallback.userData.replayAssetSlot = "athlete:torso";
  const initiallyHiddenFallback = new THREE.Object3D();
  initiallyHiddenFallback.name = "athlete:head";
  initiallyHiddenFallback.visible = false;
  const headband = new THREE.Object3D();
  headband.name = "skierg-headband";
  const equipment = new THREE.Object3D();
  equipment.userData.replayAssetSlot = "equipment:bike:frame-tube";
  parent.add(athleteFallback, initiallyHiddenFallback, headband, equipment);

  const pelvis = target(parent, 0.02, 1.03, -0.03);
  pelvis.rotation.set(0.11, -0.06, 0.04);
  const targets: ReplayV4ContactTargets = {
    pelvis,
    leftHand: target(parent, -0.48, 1.34, 0.1),
    rightHand: target(parent, 0.48, 1.34, 0.1),
    leftElbow: target(parent, -0.43, 1.49, 0.18),
    rightElbow: target(parent, 0.43, 1.49, 0.18),
    leftFoot: target(parent, -0.13, 0.22, 0.1),
    rightFoot: target(parent, 0.13, 0.22, 0.1),
    leftKnee: target(parent, -0.18, 0.6, 0.34),
    rightKnee: target(parent, 0.18, 0.6, 0.34),
  };
  targets.leftHand.rotation.set(0.36, -0.12, 0.08);
  targets.rightHand.rotation.set(0.31, 0.1, -0.07);
  scene.updateMatrixWorld(true);
  return {
    scene,
    parent,
    instance: createInstance(),
    targets,
    athleteFallback,
    initiallyHiddenFallback,
    headband,
    equipment,
  };
}

function effectorWorld(
  instance: ReplayV4AthleteInstance,
  name: keyof ReplayV4EffectorMetrics,
): THREE.Vector3 {
  const metric = instance.effectors[name];
  return instance.bones[metric.bone].localToWorld(
    new THREE.Vector3().fromArray(metric.contactOffset),
  );
}

function disposeLane(lane: TestLane, controller?: ReplayV4MotionController | null): void {
  controller?.dispose();
  lane.instance.mixer.stopAllAction();
  lane.instance.skeleton.dispose();
  lane.instance.mesh.geometry.dispose();
  const materials = Array.isArray(lane.instance.mesh.material)
    ? lane.instance.mesh.material
    : [lane.instance.mesh.material];
  for (const material of materials) material.dispose();
}

/**
 * Place equipment targets a few centimetres from the pure-clip effectors so
 * the contact pass can close the residual from a known reachable setup.
 * Call after a clip-only (or full) sample with pelvis aligned.
 */
function placeTargetsNearClipEffectors(
  lane: TestLane,
  nudge = new THREE.Vector3(0.02, 0.01, -0.015),
): void {
  lane.parent.updateMatrixWorld(true);
  for (const [name, target] of [
    ["leftHand", lane.targets.leftHand],
    ["rightHand", lane.targets.rightHand],
    ["leftFoot", lane.targets.leftFoot],
    ["rightFoot", lane.targets.rightFoot],
  ] as const) {
    const world = effectorWorld(lane.instance, name);
    const side = name.startsWith("left") ? -1 : 1;
    world.x += nudge.x * side;
    world.y += nudge.y;
    world.z += nudge.z;
    lane.parent.worldToLocal(world);
    target.position.copy(world);
  }
  lane.scene.updateMatrixWorld(true);
}

describe.each([
  ["rower", "x"],
  ["skierg", "y"],
  ["bike", "z"],
] as const)("V4 %s motion controller", (sport, animatedAxis) => {
  it("samples its sport clip, aligns the pelvis, constrains contacts, and reveals only the hero", () => {
    const lane = createLane();
    const controller = installReplayV4MotionController({
      sport,
      parent: lane.parent,
      fallbackRoot: lane.parent,
      instance: lane.instance,
      targets: lane.targets,
      opacity: 0.45,
      castShadow: false,
      receiveShadow: false,
      laneColor: 0xd9f6ff,
      diagnosticMode: "clip-pelvis",
    });
    try {
      expect(controller).not.toBeNull();
      // Sample clip + pelvis, then place equipment near the authored pose.
      expect(controller?.update({ phase: 0, cycleFrac: 0.19, driveFrac: 0.38 })).toBe(true);
      placeTargetsNearClipEffectors(lane);
      controller?.setDiagnosticMode("full");
      expect(controller?.update({ phase: 0, cycleFrac: 0.19, driveFrac: 0.38 })).toBe(true);
      lane.scene.updateMatrixWorld(true);

      expect(controller?.root.name).toBe(`v4-athlete-${sport}`);
      expect(controller?.root.userData).toMatchObject({
        replayV4Athlete: true,
        replayV4Sport: sport,
        replayV4Architecture: "clip-contact-constrained",
      });
      expect(controller?.mesh.userData).toMatchObject({
        replayV4Athlete: true,
        replayV4Sport: sport,
      });
      expect(controller?.root.visible).toBe(true);
      expect(controller?.mesh.frustumCulled).toBe(false);
      expect(controller?.mesh.castShadow).toBe(false);
      expect(controller?.mesh.receiveShadow).toBe(false);

      const material = controller?.mesh.material as THREE.MeshStandardMaterial;
      expect(material.opacity).toBeCloseTo(0.45, 6);
      expect(material.transparent).toBe(true);
      expect(material.depthWrite).toBe(false);
      expect(material.color.getHex()).toBe(
        new THREE.Color(0xffffff).lerp(new THREE.Color(0xd9f6ff), 0.26).getHex(),
      );

      expect(lane.athleteFallback.visible).toBe(false);
      expect(lane.initiallyHiddenFallback.visible).toBe(false);
      expect(lane.headband.visible).toBe(false);
      expect(lane.equipment.visible).toBe(true);

      const pelvisPosition = lane.instance.bones.v4Hips.getWorldPosition(new THREE.Vector3());
      const targetPosition = lane.targets.pelvis.getWorldPosition(new THREE.Vector3());
      expect(pelvisPosition.distanceTo(targetPosition)).toBeLessThan(1e-6);
      const pelvisRotation = lane.instance.bones.v4Hips.getWorldQuaternion(new THREE.Quaternion());
      const targetRotation = lane.targets.pelvis.getWorldQuaternion(new THREE.Quaternion());
      expect(lane.instance.bones.v4Hips.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(
        0.01,
      );
      expect(pelvisRotation.angleTo(targetRotation)).toBeGreaterThan(0.03);

      // Soft contact closes a centimetre-scale residual from the clip pose.
      expect(
        effectorWorld(lane.instance, "leftHand").distanceTo(
          lane.targets.leftHand.getWorldPosition(new THREE.Vector3()),
        ),
      ).toBeLessThan(0.03);
      expect(
        effectorWorld(lane.instance, "rightHand").distanceTo(
          lane.targets.rightHand.getWorldPosition(new THREE.Vector3()),
        ),
      ).toBeLessThan(0.03);
      expect(
        effectorWorld(lane.instance, "leftFoot").distanceTo(
          lane.targets.leftFoot.getWorldPosition(new THREE.Vector3()),
        ),
      ).toBeLessThan(0.04);
      expect(
        effectorWorld(lane.instance, "rightFoot").distanceTo(
          lane.targets.rightFoot.getWorldPosition(new THREE.Vector3()),
        ),
      ).toBeLessThan(0.04);

      const spine = lane.instance.bones.v4Spine.quaternion;
      expect(Math.abs(spine[animatedAxis])).toBeGreaterThan(0.01);
      expect(lane.instance.mixer.time).toBeCloseTo(
        sport === "rower" ? 0.19 : sport === "skierg" ? 0.17 : 0.25,
        6,
      );
    } finally {
      disposeLane(lane, controller);
    }
  });
});

describe("V4 motion determinism and fallback safety", () => {
  it("piecewise-retimes recorded drive/recovery timing and repeats the exact same solve", () => {
    const lane = createLane();
    const controller = installReplayV4MotionController({
      sport: "rower",
      parent: lane.parent,
      instance: lane.instance,
      targets: lane.targets,
    });
    try {
      expect(controller?.update({ phase: 0, cycleFrac: 0.1, driveFrac: 0.2 })).toBe(true);
      expect(lane.instance.mixer.time).toBeCloseTo(0.19, 7);
      expect(controller?.update({ phase: 0, cycleFrac: 0.6, driveFrac: 0.2 })).toBe(true);
      expect(lane.instance.mixer.time).toBeCloseTo(0.69, 7);
      const first = {
        spine: quaternionValues(lane.instance.bones.v4Spine.quaternion),
        chainRotations: new Map(
          IK_CHAIN_BONE_NAMES.map((name) => [
            name,
            quaternionValues(lane.instance.bones[name].quaternion),
          ]),
        ),
        leftHand: effectorWorld(lane.instance, "leftHand").toArray(),
        rightFoot: effectorWorld(lane.instance, "rightFoot").toArray(),
      };
      expect(controller?.update({ phase: 0, cycleFrac: 0.6, driveFrac: 0.2 })).toBe(true);
      expect(quaternionValues(lane.instance.bones.v4Spine.quaternion)).toEqual(first.spine);
      for (const name of IK_CHAIN_BONE_NAMES) {
        expect(quaternionValues(lane.instance.bones[name].quaternion), name).toEqual(
          first.chainRotations.get(name),
        );
      }
      expect(
        effectorWorld(lane.instance, "leftHand").distanceTo(
          new THREE.Vector3().fromArray(first.leftHand),
        ),
      ).toBeLessThan(1e-9);
      expect(
        effectorWorld(lane.instance, "rightFoot").distanceTo(
          new THREE.Vector3().fromArray(first.rightFoot),
        ),
      ).toBeLessThan(1e-9);
    } finally {
      disposeLane(lane, controller);
    }
  });

  it("uses the shared RowErg aft-elbow marker while closing rigid hand contacts", () => {
    const lane = createLane();
    const controller = installReplayV4MotionController({
      sport: "rower",
      parent: lane.parent,
      instance: lane.instance,
      targets: lane.targets,
      diagnosticMode: "clip-pelvis",
    });
    try {
      expect(controller?.update({ phase: 0, cycleFrac: 0.32, driveFrac: 0.38 })).toBe(true);
      placeTargetsNearClipEffectors(lane);
      // In the RowErg parent frame the athlete faces +z, so both branch markers
      // sit rearward (-z) of their shoulder. The test scene itself is rotated/
      // scaled to prove the controller consumes this in world space.
      for (const side of ["left", "right"] as const) {
        const upper = side === "left" ? "v4LeftUpperArm" : "v4RightUpperArm";
        const marker = side === "left" ? lane.targets.leftElbow : lane.targets.rightElbow;
        const shoulder = lane.instance.bones[upper].getWorldPosition(new THREE.Vector3());
        lane.parent.worldToLocal(shoulder);
        marker.position
          .copy(shoulder)
          .add(new THREE.Vector3(side === "left" ? -0.04 : 0.04, 0, -0.24));
      }
      lane.scene.updateMatrixWorld(true);
      controller?.setDiagnosticMode("full");
      expect(controller?.update({ phase: 0, cycleFrac: 0.32, driveFrac: 0.38 })).toBe(true);
      lane.scene.updateMatrixWorld(true);

      for (const side of ["left", "right"] as const) {
        const upper = side === "left" ? "v4LeftUpperArm" : "v4RightUpperArm";
        const forearm = side === "left" ? "v4LeftForearm" : "v4RightForearm";
        const handBone = side === "left" ? "v4LeftHand" : "v4RightHand";
        const markerTarget = side === "left" ? lane.targets.leftElbow : lane.targets.rightElbow;
        const handTarget = side === "left" ? lane.targets.leftHand : lane.targets.rightHand;
        const shoulder = lane.instance.bones[upper].getWorldPosition(new THREE.Vector3());
        const elbow = lane.instance.bones[forearm].getWorldPosition(new THREE.Vector3());
        const hand = lane.instance.bones[handBone].getWorldPosition(new THREE.Vector3());
        const marker = markerTarget.getWorldPosition(new THREE.Vector3());
        const chord = hand.clone().sub(shoulder).normalize();
        const solvedPlane = elbow.clone().sub(shoulder);
        solvedPlane.addScaledVector(chord, -solvedPlane.dot(chord)).normalize();
        const markerPlane = marker.clone().sub(shoulder);
        markerPlane.addScaledVector(chord, -markerPlane.dot(chord)).normalize();
        const shoulderLocal = lane.parent.worldToLocal(shoulder.clone());
        const elbowLocal = lane.parent.worldToLocal(elbow.clone());

        expect(solvedPlane.dot(markerPlane), `${side} follows aft marker`).toBeGreaterThan(0.8);
        expect(elbowLocal.z, `${side} V4 elbow is rearward`).toBeLessThan(shoulderLocal.z - 0.01);
        expect(
          effectorWorld(lane.instance, side === "left" ? "leftHand" : "rightHand").distanceTo(
            handTarget.getWorldPosition(new THREE.Vector3()),
          ),
        ).toBeLessThan(0.03);
      }
      expect(controller?.root.userData.replayV4Architecture).toBe("clip-contact-constrained");
    } finally {
      disposeLane(lane, controller);
    }
  });

  it("uses the shared SkiErg elbow marker instead of the clip's sideways branch", () => {
    const lane = createLane();
    const controller = installReplayV4MotionController({
      sport: "skierg",
      parent: lane.parent,
      instance: lane.instance,
      targets: lane.targets,
      diagnosticMode: "clip-pelvis",
    });
    try {
      expect(controller?.update({ phase: 0, cycleFrac: 0.11, driveFrac: 0.34 })).toBe(true);
      // Nudge inward from the nearly straight high-reach pose so this test
      // isolates elbow-branch selection rather than asking an arm to exceed
      // its authored maximum reach.
      placeTargetsNearClipEffectors(lane, new THREE.Vector3(-0.02, -0.015, 0.01));
      lane.targets.leftElbow.position.set(-0.32, 1.14, 0.42);
      lane.scene.updateMatrixWorld(true);
      controller?.setDiagnosticMode("full");
      expect(controller?.update({ phase: 0, cycleFrac: 0.11, driveFrac: 0.34 })).toBe(true);
      lane.scene.updateMatrixWorld(true);

      const shoulder = lane.instance.bones.v4LeftUpperArm.getWorldPosition(new THREE.Vector3());
      const elbow = lane.instance.bones.v4LeftForearm.getWorldPosition(new THREE.Vector3());
      const hand = lane.instance.bones.v4LeftHand.getWorldPosition(new THREE.Vector3());
      const marker = lane.targets.leftElbow.getWorldPosition(new THREE.Vector3());
      const chord = hand.clone().sub(shoulder).normalize();
      const solvedPlane = elbow.clone().sub(shoulder);
      solvedPlane.addScaledVector(chord, -solvedPlane.dot(chord)).normalize();
      const markerPlane = marker.clone().sub(shoulder);
      markerPlane.addScaledVector(chord, -markerPlane.dot(chord)).normalize();

      expect(solvedPlane.dot(markerPlane)).toBeGreaterThan(0.8);
      expect(
        effectorWorld(lane.instance, "leftHand").distanceTo(
          lane.targets.leftHand.getWorldPosition(new THREE.Vector3()),
        ),
      ).toBeLessThan(0.03);
    } finally {
      disposeLane(lane, controller);
    }
  });

  it("soft-orients palms and soles without forcing full equipment quaternions", () => {
    const lane = createLane();
    // Mild target orientation so soft slerp can finish within budget.
    lane.targets.leftHand.rotation.set(0.08, -0.04, 0.03);
    lane.targets.rightFoot.rotation.set(0.05, 0.02, -0.02);
    const controller = installReplayV4MotionController({
      sport: "rower",
      parent: lane.parent,
      instance: lane.instance,
      targets: lane.targets,
      diagnosticMode: "clip-pelvis",
    });
    try {
      expect(controller?.update({ phase: 0, cycleFrac: 0.2, driveFrac: 0.38 })).toBe(true);
      placeTargetsNearClipEffectors(lane);
      controller?.setDiagnosticMode("full");
      expect(controller?.update({ phase: 0, cycleFrac: 0.2, driveFrac: 0.38 })).toBe(true);
      const orientedHand = lane.instance.bones.v4LeftHand.getWorldQuaternion(
        new THREE.Quaternion(),
      );
      const targetOrientation = lane.targets.leftHand.getWorldQuaternion(new THREE.Quaternion());
      // Soft orient budget is ~10° for arms.
      expect(orientedHand.angleTo(targetOrientation)).toBeLessThan(
        THREE.MathUtils.degToRad(12) + 1e-3,
      );
      const orientedFoot = lane.instance.bones.v4RightFoot.getWorldQuaternion(
        new THREE.Quaternion(),
      );
      const targetFootOrientation = lane.targets.rightFoot.getWorldQuaternion(
        new THREE.Quaternion(),
      );
      expect(orientedFoot.angleTo(targetFootOrientation)).toBeLessThan(
        THREE.MathUtils.degToRad(20) + 1e-3,
      );
      expect(
        effectorWorld(lane.instance, "leftHand").distanceTo(
          lane.targets.leftHand.getWorldPosition(new THREE.Vector3()),
        ),
      ).toBeLessThan(0.03);
    } finally {
      disposeLane(lane, controller);
    }
  });

  it("clip-only diagnostic mode samples without contact correction", () => {
    const lane = createLane();
    const controller = installReplayV4MotionController({
      sport: "rower",
      parent: lane.parent,
      instance: lane.instance,
      targets: lane.targets,
      diagnosticMode: "clip-only",
    });
    try {
      expect(controller?.update({ phase: 0, cycleFrac: 0.2, driveFrac: 0.38 })).toBe(true);
      expect(controller?.root.visible).toBe(true);
      controller?.setDiagnosticMode("full");
      expect(controller?.update({ phase: 0, cycleFrac: 0.2, driveFrac: 0.38 })).toBe(true);
    } finally {
      disposeLane(lane, controller);
    }
  });

  it("keeps live and ghost mixers, skeletons, materials, and solve state independent", () => {
    const live = createLane();
    const ghost = createLane();
    ghost.parent.position.x += 4;
    const liveController = installReplayV4MotionController({
      sport: "bike",
      parent: live.parent,
      instance: live.instance,
      targets: live.targets,
      opacity: 1,
      laneColor: 0xffffff,
    });
    const ghostController = installReplayV4MotionController({
      sport: "bike",
      parent: ghost.parent,
      instance: ghost.instance,
      targets: ghost.targets,
      opacity: 0.45,
      laneColor: 0xd9f6ff,
    });
    try {
      expect(liveController?.update({ phase: 0, cycleFrac: 0.1, driveFrac: 0.5 })).toBe(true);
      const liveSpine = quaternionValues(live.instance.bones.v4Spine.quaternion);
      const liveContact = effectorWorld(live.instance, "leftFoot").toArray();
      expect(ghostController?.update({ phase: 0, cycleFrac: 0.7, driveFrac: 0.5 })).toBe(true);

      expect(live.instance.mixer).not.toBe(ghost.instance.mixer);
      expect(live.instance.skeleton).not.toBe(ghost.instance.skeleton);
      expect(live.instance.mesh.material).not.toBe(ghost.instance.mesh.material);
      expect(quaternionValues(live.instance.bones.v4Spine.quaternion)).toEqual(liveSpine);
      expect(effectorWorld(live.instance, "leftFoot").toArray()).toEqual(liveContact);
      expect(live.instance.mixer.time).toBeCloseTo(0.1, 7);
      expect(ghost.instance.mixer.time).toBeCloseTo(0.7, 7);
    } finally {
      disposeLane(live, liveController);
      disposeLane(ghost, ghostController);
    }
  });

  it("safe-disables a detached hero and restores every fallback node's original state", () => {
    const lane = createLane();
    const controller = installReplayV4MotionController({
      sport: "skierg",
      parent: lane.parent,
      instance: lane.instance,
      targets: lane.targets,
    });
    try {
      expect(controller?.update({ phase: 0.2, driveFrac: 0.34 })).toBe(true);
      expect(lane.athleteFallback.visible).toBe(false);
      controller?.root.removeFromParent();
      expect(controller?.update({ phase: 0.3, driveFrac: 0.34 })).toBe(false);
      expect(controller?.enabled).toBe(false);
      expect(controller?.root.visible).toBe(false);
      expect(lane.athleteFallback.visible).toBe(true);
      expect(lane.initiallyHiddenFallback.visible).toBe(false);
      expect(lane.headband.visible).toBe(true);
      expect(lane.equipment.visible).toBe(true);
    } finally {
      disposeLane(lane, controller);
    }
  });

  it("keeps the hero enabled when a contact is outside anatomical reach", () => {
    // An impossible target clamps at anatomical reach; it must never disable
    // the skinned athlete or stretch the skeleton/equipment to fake closure.
    const lane = createLane();
    lane.targets.leftHand.position.set(-4, 3.5, 2);
    const controller = installReplayV4MotionController({
      sport: "rower",
      parent: lane.parent,
      instance: lane.instance,
      targets: lane.targets,
    });
    try {
      expect(controller?.update({ phase: 0.2, driveFrac: 0.38 })).toBe(true);
      expect(controller?.enabled).toBe(true);
      expect(controller?.root.visible).toBe(true);
      expect(lane.athleteFallback.visible).toBe(false);
      expect(lane.equipment.visible).toBe(true);
      // Residual stays large because a rigid two-link arm cannot reach 4 m.
      expect(
        effectorWorld(lane.instance, "leftHand").distanceTo(
          lane.targets.leftHand.getWorldPosition(new THREE.Vector3()),
        ),
      ).toBeGreaterThan(0.5);
    } finally {
      disposeLane(lane, controller);
    }
  });

  it("leaves fallback visibility untouched when no V4 instance exists", () => {
    const lane = createLane();
    try {
      expect(
        installReplayV4MotionController({
          sport: "rower",
          parent: lane.parent,
          instance: null,
          targets: lane.targets,
        }),
      ).toBeNull();
      expect(lane.athleteFallback.visible).toBe(true);
      expect(lane.initiallyHiddenFallback.visible).toBe(false);
      expect(lane.headband.visible).toBe(true);
      expect(lane.equipment.visible).toBe(true);
    } finally {
      disposeLane(lane);
    }
  });
});
