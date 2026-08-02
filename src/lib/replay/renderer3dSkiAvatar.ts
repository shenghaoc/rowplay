/**
 * SkiErg avatar: skis, boots, poles and the standing athlete, plus the
 * double-pole plant/press/recovery placement the course renderer calls.
 *
 * Built on `renderer3dAvatarKit` and the equipment measurements in
 * `skiEquipment`. Course-relative pole hardware reads `COURSE_LOOP_METERS`
 * from the kit rather than the course renderer, so this module never imports
 * the renderer that builds it.
 */
import * as THREE from "three";
import { roundedVenueBlockGeometry } from "./renderer3dVenueKit";
import { REDUCED_REPLAY_POSES } from "./renderer";
import type { RenderQuality } from "./replayRenderer";
import { fallbackStrokePose, type StrokePose } from "./strokeModel";
import {
  solveSkierElbowDirection,
  solveSkierKinematics,
  type SkierElbowDirection,
  type SkierKinematics,
} from "./sportKinematics";
import { SKI_POLE_APPROACH_START_CYCLE, SKI_POLE_OFF_CYCLE } from "./motionGraph";
import { solveRigidContactPoint3D, solveTwoBone3D } from "./figurePose";
import {
  orientHandToGripChannel,
  refineGripSpinForWrist,
  handPalmNormalOut,
  refineGripTiltForWrist,
} from "./handGrip";
import {
  hideWithReplayAssets,
  setReplayAssetSlot,
  setReplayAssetTemplateAnchor,
} from "./renderer3dAssets";
import { type ReplayV4MotionController } from "./renderer3dV4Motion";
import {
  skiEquipmentDetail,
  SKI_ATHLETE_PROPORTIONS,
  SKI_GRIP_SHIFT,
  SKI_POLE_GRIP_RADIUS,
  type SkiEquipmentDetail,
} from "./skiEquipment";
import { SkiGripReachSolver, skiPostReleaseExtensionAuthority } from "./skiGripReach";
import {
  COURSE_LOOP_METERS,
  GRIP_FOREARM_SCRATCH,
  GRIP_LONG_SCRATCH,
  HUMAN_HAIR,
  HUMAN_KIT,
  HUMAN_KIT_DARK,
  HUMAN_SKIN,
  SEGMENT_DIR,
  STATIC_AVATAR_MOTION,
  accentEquipmentMaterial,
  accentMaterial,
  accentPart,
  capsulePart,
  elbowCap,
  ellipsoid,
  finalizeAvatar,
  humanMat,
  jointCap,
  makeAssetMaterialResolver,
  makeHairMaterial,
  makeHand,
  makeHead,
  makeSkinMaterial,
  orientElbowCuff,
  placeFigureSegmentBetween,
  setArmBendHint,
  shapedTorso,
  taperedLimb,
  trapezoidPanel,
  tubeBetween,
  type Avatar,
  type AvatarMotionCues,
} from "./renderer3dAvatarKit";

export const HUMAN_NORDIC_BOOT = 0x1a1f24;
/**
 * How far the pole may ride diagonally across the palm (rotation about the
 * palm normal) to keep the hand's long axis near the forearm line. Real
 * double-pole grips sit diagonal at the high reach; without this freedom the
 * square-across-the-fist channel demanded ~130° of hand-vs-forearm
 * reorientation and linear-blend skinning tore the wrist ring open.
 */
export const SKI_PALM_TILT = 0.65;
/**
 * Hand-long-axis-vs-forearm misalignment (about the palm normal) a wrist
 * carries comfortably without any diagonal-grip relief. Below this the
 * closed fist stays exactly on its authored square channel; only the excess
 * beyond it is tilted away, up to SKI_PALM_TILT.
 */
export const SKI_PALM_TILT_COMFORT = 1.15;

/**
 * A race-classic needle ski: long thin runner, mild sidecut, and a gradual
 * raised tip. Width is the maximum shovel width; waist sits slightly inside.
 */
export function profiledSkiGeometry(
  length: number,
  width: number,
  thickness: number,
  radialSegments: number,
  baseY: number,
): THREE.BufferGeometry {
  // t is normalized along the runner (-0.5 tail … +0.5 tip). Width factors
  // describe race classic sidecut: narrower waist, slightly flared shovel,
  // tapered tip and tail rather than a constant plank.
  const sections = [
    { t: -0.5, width: 0.42, y: baseY, thickness: 0.72 },
    { t: -0.42, width: 0.88, y: baseY, thickness: 0.9 },
    { t: -0.18, width: 0.78, y: baseY, thickness: 1 },
    { t: 0.05, width: 0.82, y: baseY, thickness: 1 },
    { t: 0.28, width: 1, y: baseY + 0.002, thickness: 0.92 },
    { t: 0.4, width: 0.86, y: baseY + 0.012, thickness: 0.7 },
    { t: 0.47, width: 0.48, y: baseY + 0.038, thickness: 0.48 },
    { t: 0.5, width: 0.14, y: baseY + 0.072, thickness: 0.28 },
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  for (const section of sections) {
    for (let side = 0; side < radialSegments; side++) {
      const angle = (side / radialSegments) * Math.PI * 2;
      // Flatten the cross-section so the runner reads as a ski edge, not a tube.
      const rx = width * section.width * 0.5;
      const ry = thickness * section.thickness * 0.5;
      positions.push(
        Math.cos(angle) * rx,
        section.y + Math.sin(angle) * ry * 0.55,
        section.t * length,
      );
    }
  }
  for (let section = 0; section < sections.length - 1; section++) {
    for (let side = 0; side < radialSegments; side++) {
      const next = (side + 1) % radialSegments;
      const a = section * radialSegments + side;
      const b = section * radialSegments + next;
      const c = (section + 1) * radialSegments + side;
      const d = (section + 1) * radialSegments + next;
      indices.push(a, c, b, b, c, d);
    }
  }
  const firstCenter = positions.length / 3;
  positions.push(0, sections[0]?.y ?? baseY, -length * 0.5);
  const lastCenter = positions.length / 3;
  const last = sections.at(-1);
  positions.push(0, last?.y ?? baseY, length * 0.5);
  const lastStart = (sections.length - 1) * radialSegments;
  for (let side = 0; side < radialSegments; side++) {
    const next = (side + 1) % radialSegments;
    indices.push(firstCenter, next, side);
    indices.push(lastCenter, lastStart + side, lastStart + next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = "skierg-profiled-ski";
  return geometry;
}
export const SKI_FLAT_FOREARM = new THREE.Vector3();
export const SKI_CARRY_FORE = new THREE.Vector3();
export const SKI_CARRY_PALM = new THREE.Vector3();
export const SKI_CARRY_TMP = new THREE.Vector3();
export const SKI_CARRY_ROLL = new THREE.Quaternion();
export const SKI_HANG_CHORD = new THREE.Vector3();
export const SKI_HANG_DIR = new THREE.Vector3();
/**
 * Largest shaft-spin relief the SkiErg grip may spend on wrist flatness.
 * The dense-cycle guard still requires the true palm normal to face inward.
 */
export const SKI_FLAT_MAX_SPIN = THREE.MathUtils.degToRad(48);
/**
 * A free-heel Nordic boot sized to the ski platform: sole slightly wider than
 * the runner (real XC overhang), shell not an alpine brick and not wider than
 * the stance gap.
 */
export function makeSkiBoot(
  shellMaterial: THREE.Material,
  soleMaterial: THREE.Material,
  trimMaterial: THREE.Material,
  detail: SkiEquipmentDetail,
  useAuthoredLeaf: boolean,
): THREE.Group {
  const boot = new THREE.Group();
  boot.name = "athlete:foot";
  // Sole ≈ ski width + small overhang; shell a touch wider for volume.
  const soleWidth = SKI_ATHLETE_PROPORTIONS.skiWidth * 1.15;
  const shellWidth = SKI_ATHLETE_PROPORTIONS.skiWidth * 1.28;
  const shell = new THREE.Mesh(
    roundedVenueBlockGeometry(shellWidth, 0.095, 0.28, 0.02),
    shellMaterial,
  );
  shell.name = "skierg-ski-boot-shell";
  shell.position.set(0, 0.048, 0.01);
  if (useAuthoredLeaf) setReplayAssetSlot(shell, "athlete:shoe");
  const sole = new THREE.Mesh(
    roundedVenueBlockGeometry(soleWidth, 0.016, 0.29, 0.008),
    soleMaterial,
  );
  sole.name = "skierg-ski-boot-sole";
  sole.position.set(0, -0.006, 0.008);
  // Low cuff sits just above the ankle; free heel stays readable from chase.
  const cuff = new THREE.Mesh(
    roundedVenueBlockGeometry(shellWidth * 0.92, 0.075, 0.11, 0.018),
    shellMaterial,
  );
  cuff.name = "skierg-ski-boot-cuff";
  cuff.position.set(0, 0.1, -0.05);
  // NNN/Prolink-style toe bar: the only rigid ski attachment.
  const toeBar = new THREE.Mesh(
    roundedVenueBlockGeometry(soleWidth * 0.9, 0.014, 0.03, 0.006),
    trimMaterial,
  );
  toeBar.name = "skierg-ski-boot-toe-bar";
  toeBar.position.set(0, 0.002, -0.1);
  boot.add(shell, sole, cuff, toeBar);
  if (detail.bootClosures) {
    for (const [z, y] of [
      [-0.015, 0.085],
      [0.04, 0.078],
    ] as const) {
      const closure = new THREE.Mesh(
        roundedVenueBlockGeometry(shellWidth * 0.95, 0.012, 0.024, 0.004),
        trimMaterial,
      );
      closure.name = "skierg-ski-boot-closure";
      closure.position.set(0, y, z);
      boot.add(closure);
    }
  }
  return boot;
}
export function makeSkierAvatar(
  accent: number,
  castShadow: boolean,
  opacity = 1,
  bodySegments = 16,
  quality: RenderQuality = "medium",
): Avatar {
  const segs = bodySegments;
  const capSegs = Math.max(10, Math.round(segs * 0.82));
  const headSegs = Math.max(14, segs + 2);
  const equipment = skiEquipmentDetail(quality);
  const eqCylSegs = Math.max(equipment.radialSegments, Math.round(segs * 0.7));
  const useAuthoredSkiLeaves = quality !== "low";
  const useAuthoredSkiAssembly = quality === "high" || quality === "ultra";
  const group = new THREE.Group();
  const laneMaterial = accentEquipmentMaterial(accent);
  const jerseyMaterial = accentMaterial(accent);
  const accentMat = () => laneMaterial;
  const skinMaterial = makeSkinMaterial(HUMAN_SKIN);
  const hairMaterial = makeHairMaterial(HUMAN_HAIR);
  const kitMaterial = humanMat(HUMAN_KIT, 0.58);
  const kitDarkMaterial = humanMat(HUMAN_KIT_DARK, 0.64);
  const shoeMaterial = humanMat(HUMAN_NORDIC_BOOT, 0.48);
  const poleMaterial = humanMat(0x1c242c, 0.42, 0.18);
  const farPoleMaterial = humanMat(0x141a20, 0.5, 0.14);
  const gripMaterial = humanMat(0x14181c, 0.62);
  const equipmentMetalMaterial = humanMat(0x8a949c, 0.28, 0.72);
  const resolveAssetMaterial = makeAssetMaterialResolver({
    "athlete-skin": skinMaterial,
    "athlete-fabric": jerseyMaterial,
    "athlete-hair": hairMaterial,
    "athlete-footwear": shoeMaterial,
    "equipment-painted": laneMaterial,
    "equipment-dark": kitDarkMaterial,
    "equipment-light": poleMaterial,
    "equipment-metal": equipmentMetalMaterial,
    "equipment-rubber": gripMaterial,
    "equipment-grip": gripMaterial,
    "equipment-trim": kitMaterial,
  });
  const kinematics: SkierKinematics = {
    cycle: 0,
    armPress: 0,
    hipHinge: 0,
    kneeFlex: 0,
    poleContact: 0,
    poleSweep: 0,
    elbowLoad: 0,
    armExtension: 0,
    poleLift: 0,
    poleFlight: 0,
    rebound: 0,
    surge: 0,
  };
  const elbowDirection: SkierElbowDirection = { vertical: -1, foreAft: 0 };

  // Readable classic runners: thinner than toy planks, wide enough that the
  // boot still sits on a visible platform. Free-heel toe binding; progressive
  // hardware by tier.
  const halfSki = SKI_ATHLETE_PROPORTIONS.skiWidth * 0.5;
  for (const side of [-1, 1]) {
    const skiVisual = new THREE.Group();
    skiVisual.name = side < 0 ? "skierg-ski-visual-left" : "skierg-ski-visual-right";
    skiVisual.position.set(side * SKI_ATHLETE_PROPORTIONS.skiCenterOffset, 0, 0.16);
    group.add(skiVisual);
    const fallback: THREE.Object3D[] = [];
    const ski = new THREE.Mesh(
      profiledSkiGeometry(
        SKI_ATHLETE_PROPORTIONS.skiLength,
        SKI_ATHLETE_PROPORTIONS.skiWidth,
        0.022,
        equipment.radialSegments,
        0.016,
      ),
      kitDarkMaterial,
    );
    ski.name = side < 0 ? "skierg-ski-base-left" : "skierg-ski-base-right";
    if (useAuthoredSkiLeaves) setReplayAssetSlot(ski, "equipment:ski:ski");
    skiVisual.add(ski);
    fallback.push(ski);

    if (equipment.topSheet) {
      const deck = new THREE.Mesh(
        profiledSkiGeometry(
          SKI_ATHLETE_PROPORTIONS.skiLength * 0.9,
          SKI_ATHLETE_PROPORTIONS.skiWidth * 0.82,
          0.006,
          equipment.radialSegments,
          0.032,
        ),
        accentMat(),
      );
      deck.name = "skierg-ski-deck";
      deck.userData.accent = true;
      skiVisual.add(deck);
      fallback.push(deck);
    }

    // Tip accent is a short shovel cap, not a second full ski stacked on top.
    const tip = new THREE.Mesh(
      profiledSkiGeometry(
        0.22,
        SKI_ATHLETE_PROPORTIONS.skiWidth * 0.75,
        0.01,
        equipment.radialSegments,
        0.04,
      ),
      accentMat(),
    );
    tip.name = "skierg-ski-tip";
    tip.position.z = SKI_ATHLETE_PROPORTIONS.skiLength * 0.4;
    tip.userData.accent = true;
    skiVisual.add(tip);
    fallback.push(tip);

    if (equipment.metalEdges) {
      for (const edgeSide of [-1, 1]) {
        const edge = tubeBetween(
          `skierg-ski-edge-${edgeSide < 0 ? "left" : "right"}`,
          { x: edgeSide * halfSki * 0.94, y: 0.022, z: -SKI_ATHLETE_PROPORTIONS.skiLength * 0.42 },
          { x: edgeSide * halfSki * 0.98, y: 0.03, z: SKI_ATHLETE_PROPORTIONS.skiLength * 0.36 },
          0.0022,
          equipmentMetalMaterial,
        );
        skiVisual.add(edge);
        fallback.push(edge);
      }
    }

    if (equipment.bindingRails) {
      // Binding plate spans most of the ski width under midfoot; free heel.
      const plateWidth = SKI_ATHLETE_PROPORTIONS.skiWidth * 0.88;
      const bindingPlate = new THREE.Mesh(
        roundedVenueBlockGeometry(plateWidth, 0.012, 0.24, 0.006),
        kitDarkMaterial,
      );
      bindingPlate.name = "skierg-ski-binding-plate";
      bindingPlate.position.set(0, 0.036, 0.02);
      skiVisual.add(bindingPlate);
      fallback.push(bindingPlate);
      for (const railSide of [-1, 1]) {
        const rail = tubeBetween(
          `skierg-ski-binding-rail-${railSide < 0 ? "left" : "right"}`,
          { x: railSide * plateWidth * 0.32, y: 0.046, z: -0.08 },
          { x: railSide * plateWidth * 0.32, y: 0.046, z: 0.12 },
          0.003,
          equipmentMetalMaterial,
        );
        skiVisual.add(rail);
        fallback.push(rail);
      }
      const bindingToe = new THREE.Mesh(
        roundedVenueBlockGeometry(plateWidth * 0.92, 0.022, 0.045, 0.008),
        equipmentMetalMaterial,
      );
      bindingToe.name = "skierg-ski-binding-toe";
      bindingToe.position.set(0, 0.05, -0.08);
      skiVisual.add(bindingToe);
      fallback.push(bindingToe);
      const bindingHeel = new THREE.Mesh(
        roundedVenueBlockGeometry(plateWidth * 0.75, 0.008, 0.055, 0.006),
        kitMaterial,
      );
      bindingHeel.name = "skierg-ski-binding-heel";
      bindingHeel.position.set(0, 0.04, 0.1);
      skiVisual.add(bindingHeel);
      fallback.push(bindingHeel);
    }

    // The V3 ski is a coherent deck/binding/tip shell rooted at the same
    // measured anchor. Boots remain separate contact targets for the leg IK.
    if (useAuthoredSkiAssembly) {
      setReplayAssetTemplateAnchor(skiVisual, "equipment:ski:ski-assembly", { fallback });
    }
  }

  // Planted fixed-length legs solve from the moving pelvis to the boots.  The
  // previous independently rotated capsules separated at the knee and changed
  // length through the crunch.
  const legParts: Array<{
    side: number;
    foot: THREE.Object3D;
    thigh: THREE.Mesh;
    shin: THREE.Mesh;
    knee: THREE.Mesh;
    hipPoint: THREE.Vector3;
    kneePoint: THREE.Vector3;
    anklePoint: THREE.Vector3;
    solvedAnkle: THREE.Vector3;
    bendHint: THREE.Vector3;
  }> = [];
  for (const side of [-1, 1]) {
    const boot = makeSkiBoot(
      shoeMaterial,
      gripMaterial,
      kitMaterial,
      equipment,
      useAuthoredSkiLeaves,
    );
    boot.name = side < 0 ? "skierg-foot-contact-left" : "skierg-foot-contact-right";
    // Boot sole sits on the binding plate height (~0.05).
    boot.position.set(side * SKI_ATHLETE_PROPORTIONS.skiCenterOffset, 0.055, 0.18);
    group.add(boot);

    const thigh = taperedLimb(0.08, 0.058, kitDarkMaterial, segs);
    setReplayAssetSlot(thigh, "athlete:thigh");
    thigh.name = side < 0 ? "skierg-thigh-left" : "skierg-thigh-right";
    const shin = taperedLimb(0.058, 0.042, kitMaterial, segs);
    setReplayAssetSlot(shin, "athlete:shin");
    shin.name = side < 0 ? "skierg-shin-left" : "skierg-shin-right";
    const knee = jointCap(0.074, kitDarkMaterial, capSegs);
    knee.name = side < 0 ? "skierg-knee-left" : "skierg-knee-right";
    group.add(thigh, shin, knee);
    legParts.push({
      side,
      foot: boot,
      thigh,
      shin,
      knee,
      hipPoint: new THREE.Vector3(),
      kneePoint: new THREE.Vector3(),
      anklePoint: new THREE.Vector3(side * SKI_ATHLETE_PROPORTIONS.skiCenterOffset, 0.1, 0.18),
      solvedAnkle: new THREE.Vector3(),
      bendHint: new THREE.Vector3(side * 0.1, 0.08, 0.72),
    });
  }
  const upper = new THREE.Group();
  upper.name = "skierg-upper";
  upper.position.y = 0.72;
  const hips = ellipsoid([0.18, 0.125, 0.16], kitDarkMaterial, segs);
  setReplayAssetSlot(hips, "athlete:pelvis");
  hips.position.y = 0;
  const torso = accentPart(shapedTorso(0.3, 0.68, 0.18, jerseyMaterial, segs));
  setReplayAssetSlot(torso, "athlete:torso");
  torso.name = "skierg-torso";
  torso.position.y = 0.31;
  const frontYoke = hideWithReplayAssets(trapezoidPanel(0.5, 0.35, 0.17, 0.034, kitDarkMaterial));
  frontYoke.name = "skierg-jersey-front";
  frontYoke.position.set(0, 0.52, 0.172);
  const backYoke = hideWithReplayAssets(trapezoidPanel(0.5, 0.35, 0.17, 0.034, kitDarkMaterial));
  backYoke.name = "skierg-jersey-back";
  backYoke.position.set(0, 0.52, -0.172);
  const shoulderLine = hideWithReplayAssets(capsulePart(0.064, 0.58, kitDarkMaterial, "x"));
  shoulderLine.name = "skierg-shoulder-trim";
  shoulderLine.position.y = 0.58;
  const neck = capsulePart(0.053, 0.11, skinMaterial, "y");
  setReplayAssetSlot(neck, "athlete:neck");
  neck.position.y = 0.68;
  const headGroup = makeHead(skinMaterial, hairMaterial, headSegs);
  headGroup.position.set(0, 0.84, 0.03);
  // Nordic headband from the art direction — a small silhouette cue that
  // separates the skier from the rower without needing a new asset slot.
  const headband = new THREE.Mesh(
    new THREE.TorusGeometry(0.11, 0.018, eqCylSegs, Math.round(eqCylSegs * 1.4)),
    kitDarkMaterial,
  );
  headband.name = "skierg-headband";
  headband.rotation.x = Math.PI / 2;
  headband.position.set(0, 0.04, 0.01);
  headGroup.add(headband);
  upper.add(hips, torso, frontYoke, backYoke, shoulderLine, neck, headGroup);
  // Arms are placed from shoulders to pole grips, so the hands stay on the
  // handles while the pole groups pivot from the same point.
  const arms: Array<{
    side: number;
    upper: THREE.Mesh;
    forearm: THREE.Mesh;
    hand: THREE.Group;
    elbow: THREE.Mesh;
    shoulderPoint: THREE.Vector3;
    elbowPoint: THREE.Vector3;
    handTarget: THREE.Vector3;
    handPoint: THREE.Vector3;
    bendHint: THREE.Vector3;
  }> = [];
  for (const side of [-1, 1]) {
    const upperArm = taperedLimb(0.062, 0.046, kitMaterial, segs);
    setReplayAssetSlot(upperArm, "athlete:upper-arm");
    upperArm.name = side < 0 ? "skierg-upper-arm-left" : "skierg-upper-arm-right";
    const forearm = taperedLimb(0.048, 0.035, kitMaterial, segs);
    setReplayAssetSlot(forearm, "athlete:forearm");
    forearm.name = side < 0 ? "skierg-forearm-left" : "skierg-forearm-right";
    const hand = makeHand(kitDarkMaterial, side, capSegs);
    hand.name = side < 0 ? "skierg-hand-left" : "skierg-hand-right";
    const elbow = elbowCap(0.054, kitMaterial, capSegs);
    elbow.name = side < 0 ? "skierg-elbow-left" : "skierg-elbow-right";
    const shoulder = jointCap(0.068, kitMaterial, capSegs);
    shoulder.userData.hideWithReplayAssets = false;
    setReplayAssetSlot(shoulder, "athlete:shoulder");
    shoulder.name = side < 0 ? "skierg-shoulder-left" : "skierg-shoulder-right";
    shoulder.position.set(side * SKI_ATHLETE_PROPORTIONS.shoulderHalfWidth, 0.54, 0.05);
    upper.add(upperArm, forearm, hand, elbow, shoulder);
    arms.push({
      side,
      upper: upperArm,
      forearm,
      hand,
      elbow,
      shoulderPoint: new THREE.Vector3(
        side * SKI_ATHLETE_PROPORTIONS.shoulderHalfWidth,
        0.54,
        0.05,
      ),
      elbowPoint: new THREE.Vector3(),
      handTarget: new THREE.Vector3(),
      handPoint: new THREE.Vector3(),
      bendHint: new THREE.Vector3(side * 0.38, -0.55, 0.2),
    });
  }
  group.add(upper);

  // Poles are solved from a ground contact to a grip, not just drawn from a
  // hand toward a guessed tip. The authored shells remain replaceable, while
  // the rigid contact/length solve stays renderer-owned.
  const poles: Array<{
    side: number;
    shaft: THREE.Mesh;
    grip: THREE.Mesh;
    basket: THREE.Mesh;
    tipAnchor: THREE.Object3D;
  }> = [];
  for (const side of [-1, 1]) {
    // Readable carbon taper: ~18 mm near the grip down to ~12 mm at the basket.
    const shaftGeo = new THREE.CylinderGeometry(0.006, 0.009, 1, eqCylSegs, 2);
    shaftGeo.rotateX(Math.PI / 2); // unit shaft lives on +Z for endpoint placement
    const shaftMesh = new THREE.Mesh(shaftGeo, side < 0 ? farPoleMaterial : poleMaterial);
    const shaft = useAuthoredSkiLeaves
      ? setReplayAssetSlot(shaftMesh, "equipment:ski:pole-shaft")
      : shaftMesh;
    shaft.name = side < 0 ? "skierg-pole-shaft-left" : "skierg-pole-shaft-right";
    const gripMesh = capsulePart(SKI_POLE_GRIP_RADIUS, 0.15, gripMaterial, "z");
    const grip = useAuthoredSkiLeaves
      ? setReplayAssetSlot(gripMesh, "equipment:ski:pole-grip")
      : gripMesh;
    grip.name = side < 0 ? "skierg-pole-grip-left" : "skierg-pole-grip-right";
    if (equipment.gripStraps) {
      const strap = new THREE.Mesh(
        new THREE.TorusGeometry(0.019, 0.0032, 5, Math.max(8, eqCylSegs)),
        kitDarkMaterial,
      );
      strap.name = side < 0 ? "skierg-pole-grip-strap-left" : "skierg-pole-grip-strap-right";
      strap.position.z = -0.032;
      grip.add(strap);
    }
    // Hard-track basket ~55 mm — small, not a powder snowshoe disc.
    const basketMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.022, 0.014, eqCylSegs, 1),
      accentMat(),
    );
    const basket = useAuthoredSkiLeaves
      ? setReplayAssetSlot(basketMesh, "equipment:ski:pole-basket")
      : basketMesh;
    basket.name = side < 0 ? "skierg-pole-tip-left" : "skierg-pole-tip-right";
    basket.userData.accent = true;
    if (equipment.basketRibs) {
      for (let spoke = 0; spoke < 4; spoke++) {
        const angle = (spoke / 4) * Math.PI * 2;
        basket.add(
          tubeBetween(
            `skierg-pole-basket-rib-${side < 0 ? "left" : "right"}-${spoke}`,
            { x: 0, y: 0.006, z: 0 },
            { x: Math.cos(angle) * 0.022, y: 0.006, z: Math.sin(angle) * 0.022 },
            0.0016,
            equipmentMetalMaterial,
          ),
        );
      }
    }
    const tipAnchor = new THREE.Object3D();
    tipAnchor.name = side < 0 ? "skierg-pole-contact-left" : "skierg-pole-contact-right";
    upper.add(shaft, grip, basket, tipAnchor);
    poles.push({ side, shaft, grip, basket, tipAnchor });
  }

  const tipWorld = new THREE.Vector3();
  const freeTipWorld = new THREE.Vector3();
  const plantTipWorld = new THREE.Vector3();
  const desiredHandWorld = new THREE.Vector3();
  const solvedHandWorld = new THREE.Vector3();
  const shoulderWorld = new THREE.Vector3();
  const sampledV4Shoulders = [new THREE.Vector3(), new THREE.Vector3()] as const;
  const sampledV4ArmReaches: [number, number] = [
    SKI_ATHLETE_PROPORTIONS.upperArmLength + SKI_ATHLETE_PROPORTIONS.forearmLength,
    SKI_ATHLETE_PROPORTIONS.upperArmLength + SKI_ATHLETE_PROPORTIONS.forearmLength,
  ];
  const tipLocalPoint = new THREE.Vector3();
  const groundUpLocal = new THREE.Vector3();
  const courseCenterAtPlant = new THREE.Vector3();
  const courseRightWorld = new THREE.Vector3();
  const courseForwardWorld = new THREE.Vector3();
  const athleteRightLocal = new THREE.Vector3();
  const inverseUpperWorld = new THREE.Quaternion();
  const gripWorldQuaternion = new THREE.Quaternion();
  const gripThumbwardLocal = new THREE.Vector3();
  const gripRollLocal = new THREE.Vector3();
  const GRIP_PALM_SCRATCH = new THREE.Vector3();
  // Procedural fallback arm lengths from SKI_ATHLETE_PROPORTIONS. When V4
  // data is available the two-bone solver derives its segment lengths from
  // the rig's structural reach instead, matching the RowErg pattern. The
  // ratio is preserved so the elbow sits at the same proportional split.
  const UPPER_ARM_LENGTH = SKI_ATHLETE_PROPORTIONS.upperArmLength;
  const FOREARM_LENGTH = SKI_ATHLETE_PROPORTIONS.forearmLength;
  const UPPER_ARM_SHARE = UPPER_ARM_LENGTH / (UPPER_ARM_LENGTH + FOREARM_LENGTH);
  const MAX_ARM_REACH = UPPER_ARM_LENGTH + FOREARM_LENGTH - 0.02;
  const MINIMUM_ARM_REACH = Math.abs(UPPER_ARM_LENGTH - FOREARM_LENGTH) + 0.008;
  let contactArmReach = UPPER_ARM_LENGTH + FOREARM_LENGTH;
  const THIGH_LENGTH = SKI_ATHLETE_PROPORTIONS.thighLength;
  const SHIN_LENGTH = SKI_ATHLETE_PROPORTIONS.shinLength;
  // Classic double-pole length (~83.5% of the measured 1.64 m rig). Long
  // enough for the high catch and short enough to stay inside the arm reach
  // envelope; the forward plant offset keeps the pole+arm chain away from its
  // collinear singularity through the press.
  const POLE_LENGTH = SKI_ATHLETE_PROPORTIONS.poleLength;
  const skiGripReachSolver = new SkiGripReachSolver(POLE_LENGTH, MINIMUM_ARM_REACH);
  const POLE_CONTACT_Y = 0.055;
  // The SkiErg action is a compact double-pole press, not a deep squat. Keep
  // the pelvis high enough for the legs to read as springy, then make the
  // force come from a moderate hip hinge and a long hand path. These values
  // deliberately describe a canonical technique rather than inferring an
  // athlete's individual biomechanics from stroke telemetry.
  const SKI_STANDING_PELVIS_Y = 0.735;
  const SKI_PELVIS_KNEE_DROP = 0.11;
  const SKI_PELVIS_FORWARD_TRAVEL = 0.055;
  const SKI_RECOVERY_REBOUND_LIFT = 0.045;
  const SKI_NEUTRAL_TORSO_PITCH = 0.055;
  const SKI_TORSO_HINGE_RANGE = 0.56;
  const SKI_PELVIS_COUNTER_TILT = 0.14;
  const SKI_HEAD_GAZE_COUNTER_TILT = 0.38;
  /**
   * Reference-backed sagittal hand arc.
   *
   * Radius encodes the observed early elbow flexion followed by near-extension
   * at pole-off. Angle carries the hand from high/forward to beside the thigh.
   * Unlike the former three-point line, this path never crosses close to the
   * shoulder, so the IK sphere intersection cannot flip into a horizontal
   * backwards elbow branch.
   */
  const skiRecoveryScratch = new THREE.Vector3();
  const skiRecoveryPoints = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];
  // A cubic Bezier, not Catmull-Rom: Catmull-Rom extrapolates a phantom
  // point before the curve's start via reflection (2*P0 - P1, see
  // three.js's CatmullRomCurve3.getPoint), and when the first segment is
  // short relative to the next one, that reflected tangent overshoots —
  // measured as an 8.6 m/s hand jump in a single sample right after the
  // recovery starts. A Bezier has no such extrapolation: the curve is
  // provably bounded by the convex hull of its own four control points, so
  // this class of bug cannot occur by construction. It touches "off" and
  // "reach" exactly and is pulled toward "mid"/"high" in between, which is
  // all this path needs (a close waypoint, not an exact pass-through).
  const skiRecoveryCurve = new THREE.CubicBezierCurve3(
    skiRecoveryPoints[0],
    skiRecoveryPoints[1],
    skiRecoveryPoints[2],
    skiRecoveryPoints[3],
  );
  const skiPreferredHand = (motion: SkierKinematics, side: number, out: THREE.Vector3): void => {
    const reach = Math.min(
      0.72 - motion.elbowLoad * 0.28 + motion.armExtension * 0.08,
      MAX_ARM_REACH * 0.96,
    );
    const angle = 0.56 - motion.poleSweep * 2.56;
    out.set(
      side * (SKI_ATHLETE_PROPORTIONS.shoulderHalfWidth + 0.05),
      0.54 + Math.sin(angle) * reach,
      0.05 + Math.cos(angle) * reach,
    );
    if (motion.cycle > SKI_POLE_OFF_CYCLE) {
      // Recovery return. The polar arc above is only the CONTACT-phase seed
      // (the planted pole overrides it); retracing it in free flight swung
      // the hands 0.25 m below the hips and 0.83 m out front — a scooping
      // windmill no SkiErg return performs. The machine's return is simple:
      // from behind the thighs, the hands come forward CLOSE TO THE BODY at
      // hip-to-chest height, then lift to the high reach ("stand up and
      // elevate your arms"). Both endpoints reuse the polar formula at its
      // boundary sweeps, so the contact hand-off and the cycle seam stay
      // continuous; sweep itself is the C² recovery progress.
      const t = 1 - THREE.MathUtils.clamp(motion.poleSweep, 0, 1);
      // Endpoint at pole-off (sweep 1) from the same formula the contact
      // branch used on its last frame.
      const offY = 0.54 + Math.sin(0.56 - 2.56) * reach;
      const offZ = 0.05 + Math.cos(0.56 - 2.56) * reach;
      // Endpoint at the next reach (sweep 0) — identical to the polar pose
      // the contact branch resumes with at the seam.
      const reachY = 0.54 + Math.sin(0.56) * reach;
      const reachZ = 0.05 + Math.cos(0.56) * reach;
      // Interior waypoints: beside the thighs coming forward, then at the
      // chest on the way up. Authored in the hinging torso frame, so the
      // stand-up adds its own rise on top. One Catmull-Rom through all four
      // stations — piecewise smoothstep segments stopped dead at each
      // waypoint and sprinted between them, which tripped the elbow and
      // forearm continuity guards.
      skiRecoveryPoints[0]!.set(out.x, offY, offZ);
      skiRecoveryPoints[1]!.set(out.x, 0.1, 0.2);
      skiRecoveryPoints[2]!.set(out.x, 0.48, 0.3);
      skiRecoveryPoints[3]!.set(out.x, reachY, reachZ);
      skiRecoveryCurve.getPoint(t, skiRecoveryScratch);
      out.y = skiRecoveryScratch.y;
      out.z = skiRecoveryScratch.z;
    }
    // Hard clamp: if authoring ever drifts outside reach, pull the target
    // toward the shoulder so the arm IK stays rigid.
    const sx = side * SKI_ATHLETE_PROPORTIONS.shoulderHalfWidth;
    const sy = 0.54;
    const sz = 0.05;
    const dx = out.x - sx;
    const dy = out.y - sy;
    const dz = out.z - sz;
    const dist = Math.hypot(dx, dy, dz);
    const maxReach = Math.min(MAX_ARM_REACH, Math.max(0.4, contactArmReach - 0.002));
    if (dist > maxReach && dist > 1e-6) {
      const scale = maxReach / dist;
      out.set(sx + dx * scale, sy + dy * scale, sz + dz * scale);
    }
  };

  let pendingPose = fallbackStrokePose("skierg", 0);
  let pendingMeters = 0;
  let pendingMotion: SkierKinematics = kinematics;
  let hasSampledV4Shoulders = false;

  const placeSkiLegs = (): void => {
    for (const leg of legParts) {
      // Legs are children of the avatar root while the pelvis rotates in
      // `upper`. Convert that hip attachment back into root-local space so a
      // torso crunch cannot leave the thighs detached from the pelvis.
      leg.hipPoint
        .set(leg.side * SKI_ATHLETE_PROPORTIONS.hipHalfWidth, 0, 0.02)
        .applyQuaternion(upper.quaternion)
        .add(upper.position);
      solveTwoBone3D(
        leg.hipPoint,
        leg.anklePoint,
        THIGH_LENGTH,
        SHIN_LENGTH,
        leg.bendHint,
        leg.kneePoint,
        leg.solvedAnkle,
      );
      placeFigureSegmentBetween(leg.thigh, leg.hipPoint, leg.kneePoint);
      placeFigureSegmentBetween(leg.shin, leg.kneePoint, leg.solvedAnkle);
      leg.knee.position.copy(leg.kneePoint);
    }
  };

  /**
   * Reconstruct the course-space pole plant at the catch. `StrokePose` keeps
   * this deterministic across seeking: the current stroke index/cycle and its
   * distance span identify the same ground point instead of relying on the
   * last rendered frame.
   */
  const setPlantTipWorld = (
    output: THREE.Vector3,
    side: number,
    pose: StrokePose,
    meters: number,
    outer: THREE.Object3D,
  ): void => {
    const plantCycle = pose.index + (pose.cycleFrac >= SKI_POLE_APPROACH_START_CYCLE ? 1 : 0);
    const currentCycle = pose.index + pose.cycleFrac;
    const distanceSincePlant = (currentCycle - plantCycle) * Math.max(0, pose.strokeMeters);
    const courseTurn = (distanceSincePlant / COURSE_LOOP_METERS) * Math.PI * 2;
    const cos = Math.cos(courseTurn);
    const sin = Math.sin(courseTurn);
    // Move the current course centre to the deterministic catch position. At
    // the C2-flat flight apex this switches invisibly to the next catch, then
    // the recovery arc converges continuously instead of dropping at preplant.
    courseCenterAtPlant.set(
      outer.position.x * cos - outer.position.z * sin,
      POLE_CONTACT_Y,
      outer.position.x * sin + outer.position.z * cos,
    );
    const yaw = outer.rotation.y - courseTurn;
    // Plant just outside the ski and behind the high handle. The previous
    // 1.15 m forward offset reversed this relationship, so the shaft pointed
    // forward at impact instead of slanting backward into the snow.
    const localX = side * SKI_ATHLETE_PROPORTIONS.polePlantLateralOffset;
    const localZ = SKI_ATHLETE_PROPORTIONS.polePlantForwardOffset;
    output.set(
      courseCenterAtPlant.x + localX * Math.cos(yaw) + localZ * Math.sin(yaw),
      POLE_CONTACT_Y,
      courseCenterAtPlant.z - localX * Math.sin(yaw) + localZ * Math.cos(yaw),
    );
  };

  const placePoleArms = (motion: SkierKinematics, pose: StrokePose, meters: number): void => {
    const outer = group.parent;
    if (!outer) return;
    upper.getWorldQuaternion(inverseUpperWorld).invert();
    groundUpLocal.set(0, 1, 0).applyQuaternion(inverseUpperWorld).normalize();
    // Recovery free-tip directions live in the course frame so the lap turn
    // does not counter-rotate the pole sweep.
    courseRightWorld.set(1, 0, 0).transformDirection(outer.matrixWorld);
    courseForwardWorld.set(0, 0, 1).transformDirection(outer.matrixWorld);
    // Same frame conversion as `groundUpLocal`: the hands live under `upper`, so
    // the wrist pitch axis has to leave the course frame before it is applied.
    athleteRightLocal.copy(courseRightWorld).applyQuaternion(inverseUpperWorld).normalize();
    solveSkierElbowDirection(motion, elbowDirection);
    // The bend plane follows the technique phase instead of holding one fixed
    // down/forward vector for the whole cycle. Local -y points down, local -z
    // is rearward. Late in the press the sagittal hint can still run near
    // the shoulder→hand chord (both end up down-back); a mild lateral widen
    // through that window keeps the two-bone bend plane conditioned — the
    // elbows pass the ribs a touch wide, which is also the anatomical read.
    // The early aft swing of the down-elbow arc carries most of the
    // conditioning now, so the widen stays small: a large value here is the
    // measured source of the mid-press "elbows point sideways" look.
    const collapse =
      THREE.MathUtils.smoothstep(motion.poleSweep, 0.45, 0.85) *
      (1 - THREE.MathUtils.smoothstep(motion.poleSweep, 0.9, 1));
    // Plant window: used only to gate the flight hang-hold off while the
    // retrace hint carries the elbow into the next down-elbow plant.
    const plantFlare = Math.max(
      THREE.MathUtils.smoothstep(motion.cycle, 0.82, 0.94),
      1 - THREE.MathUtils.smoothstep(motion.cycle, 0.06, 0.16),
    );
    // The floor itself (not just the phase-specific windows above) was too
    // thin: through cyc 0.62-0.64, well outside both the collapse and
    // plantFlare windows (both keyed to poleSweep/cycle ranges that don't
    // cover the mid-recovery lift), the sagittal hint still passed close
    // enough to the shoulder-hand chord to flip the elbow's branch across
    // FOUR consecutive samples (measured up to 0.19 m elbow jumps and
    // forearm-orientation inversions — a genuine unstable region, not one
    // isolated point). Rather than add another narrow window for another
    // phase — the same class of bug recurring in a new spot each time —
    // raise the floor everywhere (0.08 -> 0.24, confirmed by a dense
    // 256-sample sweep to clear the whole cluster), which keeps the
    // bend-plane well-conditioned regardless of which phase the arm is in.
    const bendLateral =
      0.2 +
      motion.elbowLoad * 0.04 +
      motion.poleFlight * 0.015 +
      collapse * motion.poleContact * 0.1;
    const bendUp = elbowDirection.vertical * 0.78;
    const bendAft = elbowDirection.foreAft * 0.78 - motion.poleFlight * motion.poleSweep * 0.4;
    // Through the free-pole hang and early lift the retrace hint runs
    // chronically near the shoulder→hand chord (both track the arm's own
    // path), which used to hand the branch to the lateral floor and wing the
    // elbow out — forearms pointing across the body instead of forward at
    // the handles. Pin the flight elbow BELOW the chord instead (a relaxed
    // arm hangs; slight out-tilt only), and let the plant window hand over
    // to the retrace hint's down-elbow plant.
    // Two regimes cover the flight: the sweep-faded aft bias above shepherds
    // the early swing (a component-space nudge, gentle at the fling), and
    // this hold takes over once the arm has folded into the true hang —
    // where the below-chord direction is already nearly true, so engaging it
    // is a small rotation rather than a snap. Engaging earlier measurably
    // added to the post-release residual and tilted the fist frame.
    const hangHold =
      motion.poleFlight *
      (1 - plantFlare) *
      THREE.MathUtils.smoothstep(motion.cycle, 0.56, 0.7) *
      (1 - THREE.MathUtils.smoothstep(motion.cycle, 0.76, 0.86)) *
      0.9;
    const applyHangHold = (
      shoulder: THREE.Vector3,
      hand: THREE.Vector3,
      side: number,
      hint: THREE.Vector3,
    ) => {
      if (hangHold <= 1e-4) return;
      SKI_HANG_CHORD.set(hand.x - shoulder.x, hand.y - shoulder.y, hand.z - shoulder.z);
      if (SKI_HANG_CHORD.lengthSq() < 1e-8) return;
      SKI_HANG_CHORD.normalize();
      SKI_HANG_DIR.set(side * 0.18, -1, 0);
      SKI_HANG_DIR.addScaledVector(SKI_HANG_CHORD, -SKI_HANG_DIR.dot(SKI_HANG_CHORD));
      if (SKI_HANG_DIR.lengthSq() < 1e-6) return;
      SKI_HANG_DIR.normalize();
      hint.lerp(SKI_HANG_DIR, hangHold).normalize();
    };
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i];
      const pole = poles[i];
      if (!arm || !pole) continue;
      // Shoulders live on the hinging upper body; refresh the local origin so
      // the press tracks torso pitch instead of a stale rest pose.
      if (hasSampledV4Shoulders) arm.shoulderPoint.copy(sampledV4Shoulders[i]!);
      else arm.shoulderPoint.set(arm.side * SKI_ATHLETE_PROPORTIONS.shoulderHalfWidth, 0.54, 0.05);
      // Start from the authored double-pole arc, then solve the exact rigid
      // pole/arm closure once the course-space basket position is known.
      skiPreferredHand(motion, arm.side, arm.handTarget);
      // Keep the elbow close to the sagittal plane with modest anatomical
      // clearance. This target also drives the V4 post-clip arm correction;
      // preserving the old clip plane is what produced the backwards goalpost.
      setArmBendHint(arm.shoulderPoint, arm.handTarget, arm.side, arm.bendHint, {
        lateral: bendLateral,
        up: bendUp,
        aft: bendAft,
      });
      applyHangHold(arm.shoulderPoint, arm.handTarget, arm.side, arm.bendHint);
      desiredHandWorld.copy(arm.handTarget);
      upper.localToWorld(desiredHandWorld);
      shoulderWorld.copy(arm.shoulderPoint);
      upper.localToWorld(shoulderWorld);
      const structuralV4Reach = sampledV4ArmReaches[i]!;
      // The two-bone solver's segment lengths must match the V4 rig's bone
      // envelope, following the RowErg pattern.
      const activeArmReach = hasSampledV4Shoulders
        ? structuralV4Reach + skiGripReachSolver.channelLength
        : UPPER_ARM_LENGTH + FOREARM_LENGTH;
      const activeUpperArm = activeArmReach * UPPER_ARM_SHARE;
      const activeForearm = activeArmReach - activeUpperArm;
      if (hasSampledV4Shoulders) {
        // Author the free pole trajectory from a point the visible arm can
        // actually reach. The former path was clamped around a static
        // procedural shoulder with total arm+palm length, so immediately
        // after pole-off the basket eased toward a hand point 3–14 cm beyond
        // the sampled V4 shoulder. Clamping this *preference* to the real
        // structural reach keeps the shared C2 flight timing intact; the
        // rigid pole/oriented-offset passes below then find the exact contact.
        skiGripReachSolver.clampPreferredContact(
          shoulderWorld,
          desiredHandWorld,
          structuralV4Reach,
        );
      }

      setPlantTipWorld(plantTipWorld, arm.side, pose, meters, outer);

      // The free pole's carried angle is authored directly from the
      // technique phase — steep near the reach/plant (matching the on-snow
      // ~80 deg attitude) and shallowest at pole-off (~23 deg, also on-snow
      // measured). Deriving it from a neutral-wrist fist frame instead was
      // tried and rejected: the provisional forearm it solved against runs
      // close to horizontal through the close-to-body recovery return, so
      // the carried pole came out held nearly level through roughly 70% of
      // the cycle — a physically wrong carry, not merely an imperfect
      // wrist. The wrist's own flat-wrist relief still comes from the
      // grip-roll code below, same as contact; only the SHAFT direction is
      // authored here.
      const poleAngle = THREE.MathUtils.degToRad(80 - motion.poleSweep * 57);
      // The basket needs visible snow clearance without rising so fast that a
      // rigid classic-length pole outruns the athlete's arm during release.
      // The 1.5 cm direction-space margin composes with the contact height and
      // basket offset to keep the rendered basket above 10 cm; poleLift then
      // contributes up to another 20 cm without flattening the mid-return
      // shaft and forcing the wrist backward.
      const clearance = 0.015 + motion.poleLift * 0.2;
      const desiredVertical = -Math.sin(poleAngle) * POLE_LENGTH;
      const vertical = Math.min(
        POLE_LENGTH * 0.985,
        Math.max(
          -POLE_LENGTH * 0.985,
          desiredVertical,
          POLE_CONTACT_Y + clearance - desiredHandWorld.y,
        ),
      );
      const horizontal = Math.sqrt(Math.max(0, POLE_LENGTH * POLE_LENGTH - vertical * vertical));
      // Trail behind the athlete, splayed slightly outboard of the skis so
      // the two shafts stay visibly separated rather than crossing.
      const lateral = arm.side * 0.22;
      const forward = -Math.sqrt(Math.max(0, 1 - lateral * lateral));
      SKI_CARRY_TMP.copy(courseRightWorld)
        .multiplyScalar(lateral)
        .addScaledVector(courseForwardWorld, forward);
      freeTipWorld.copy(desiredHandWorld).addScaledVector(SKI_CARRY_TMP, horizontal);
      freeTipWorld.y += vertical;

      // Match basket attitude at both ends of flight IN DIRECTION SPACE. A
      // position lerp between the carried tip and the course plant point can
      // pass underneath the hand — the drawn shaft flips front-to-back and
      // the rigid grip solve snaps the wrist (measured 955 mm in one sample
      // at the pre-plant). Rotating the carried shaft direction toward the
      // hand->plant direction can never flip, releases the dead basket after
      // pole-off (the pole pivots around the hand instead of dragging the arm
      // to full extension against a receding snow point), and still converges
      // exactly: at contact the hand->plant distance IS the pole length, so
      // tip position and velocity are continuous at both boundaries.
      SKI_CARRY_PALM.copy(plantTipWorld).sub(desiredHandWorld);
      // After pole-off the plant point is dead: the athlete advances past it,
      // so holding the shaft aimed there for the whole flight-ramp dragged
      // the arm to a 763 mm straight-line stretch against a receding snow
      // point. Fade the plant attitude out over the first ~7% of the cycle
      // after release (velocity-matched at the boundary, free thereafter);
      // the approach side keeps the full ramp so the carry converges on the
      // NEXT plant.
      const releaseFade =
        motion.cycle > SKI_POLE_OFF_CYCLE && motion.cycle < SKI_POLE_APPROACH_START_CYCLE
          ? 1 -
            THREE.MathUtils.smoothstep(motion.cycle, SKI_POLE_OFF_CYCLE, SKI_POLE_OFF_CYCLE + 0.05)
          : 1;
      if (SKI_CARRY_PALM.lengthSq() > 1e-8 && motion.poleFlight < 1) {
        SKI_CARRY_PALM.normalize();
        SKI_CARRY_FORE.copy(freeTipWorld).sub(desiredHandWorld).normalize();
        const blendAngle =
          SKI_CARRY_FORE.angleTo(SKI_CARRY_PALM) * (1 - motion.poleFlight) * releaseFade;
        SKI_CARRY_TMP.crossVectors(SKI_CARRY_FORE, SKI_CARRY_PALM);
        if (SKI_CARRY_TMP.lengthSq() < 1e-10) {
          // Antiparallel shafts: rotate through a stable lateral axis.
          SKI_CARRY_TMP.copy(courseRightWorld);
        }
        SKI_CARRY_TMP.normalize();
        SKI_CARRY_FORE.applyQuaternion(SKI_CARRY_ROLL.setFromAxisAngle(SKI_CARRY_TMP, blendAngle));
        freeTipWorld.copy(desiredHandWorld).addScaledVector(SKI_CARRY_FORE, POLE_LENGTH);
      }
      tipWorld.lerpVectors(freeTipWorld, plantTipWorld, motion.poleContact);

      // A scalar total reach is only a broad first estimate: the grip-channel
      // offset does not point along the shoulder→contact ray at every phase.
      // The passes below enforce the exact oriented offset. Starting from the
      // fitted channel length (rather than the asset's unrelated palm marker)
      // keeps that fixed-point solve close and symmetric.
      const maximumReach = Math.min(
        MAX_ARM_REACH,
        Math.max(
          0.4,
          hasSampledV4Shoulders
            ? skiGripReachSolver.maximumContactReach(structuralV4Reach)
            : contactArmReach - 0.002,
        ),
      );
      solveRigidContactPoint3D(
        shoulderWorld,
        desiredHandWorld,
        tipWorld,
        POLE_LENGTH,
        MINIMUM_ARM_REACH,
        maximumReach,
        solvedHandWorld,
      );

      // The V4 constraint reaches with a wrist bone plus an oriented local
      // grip-channel offset. Solve that exact geometry as a short fixed-point:
      // every pass establishes the rigid pole and final wrist frame, then
      // shifts the reach-sphere origin by the resulting world-space offset.
      // The final pass only places the converged result. Procedural fallback
      // takes one pass because its visible hand point is the contact itself.
      const postReleaseExtension = skiPostReleaseExtensionAuthority(motion.cycle);
      // Always converge fully rather than switching pass count on a
      // threshold. The fixed-point loop hasn't converged after 2 passes, so
      // 2 and 4 passes land on measurably different results — toggling
      // between them at postReleaseExtension>0.95 produced a genuine
      // discontinuity (measured 0.13 m / ~8.6 m/s hand jump in one sample)
      // independent of how smoothly the underlying geometry moved. A few
      // extra fixed-point iterations are cheap; a step change in solver
      // precision is not free.
      const contactPasses = hasSampledV4Shoulders ? 4 : 1;
      for (let contactPass = 0; contactPass < contactPasses; contactPass++) {
        arm.handTarget.copy(solvedHandWorld);
        upper.worldToLocal(arm.handTarget);
        // Recompute the bend plane from the solved target. This keeps the elbow
        // on its anatomical outside/back branch instead of preserving a hint
        // for a preferred point the hand no longer occupies.
        setArmBendHint(arm.shoulderPoint, arm.handTarget, arm.side, arm.bendHint, {
          lateral: bendLateral,
          up: bendUp,
          aft: bendAft,
        });
        applyHangHold(arm.shoulderPoint, arm.handTarget, arm.side, arm.bendHint);

        solveTwoBone3D(
          arm.shoulderPoint,
          arm.handTarget,
          activeUpperArm,
          activeForearm,
          arm.bendHint,
          arm.elbowPoint,
          arm.handPoint,
        );
        placeFigureSegmentBetween(arm.upper, arm.shoulderPoint, arm.elbowPoint);
        placeFigureSegmentBetween(arm.forearm, arm.elbowPoint, arm.handPoint);
        arm.elbow.position.copy(arm.elbowPoint);
        orientElbowCuff(arm.elbow, arm.shoulderPoint, arm.elbowPoint, arm.handPoint, arm.side);
        arm.hand.position.copy(arm.handPoint);

        // The solved hand and the basket are the endpoints of one rigid pole in
        // every phase. Neither planted nor recovering hardware may telescope.
        tipLocalPoint.copy(tipWorld);
        upper.worldToLocal(tipLocalPoint);
        placeFigureSegmentBetween(pole.shaft, arm.handPoint, tipLocalPoint);
        pole.grip.quaternion.copy(pole.shaft.quaternion);
        // The hand wraps the upper portion of the grip, not its geometric centre.
        // A 0.15 m capsule centred at the hand reads as a grip floating above
        // the shaft instead of enclosing it. Shift the grip toward the tip so
        // the hand sits in the upper ~30 % and the shaft runs through the grip.
        pole.grip.position
          .copy(arm.handPoint)
          .addScaledVector(
            SEGMENT_DIR.set(
              tipLocalPoint.x - arm.handPoint.x,
              tipLocalPoint.y - arm.handPoint.y,
              tipLocalPoint.z - arm.handPoint.z,
            ).normalize(),
            SKI_GRIP_SHIFT,
          );
        pole.basket.position.copy(tipLocalPoint).addScaledVector(groundUpLocal, 0.026);
        pole.basket.quaternion.copy(inverseUpperWorld);
        pole.tipAnchor.position.copy(tipLocalPoint);
        // Thumb points toward the grip top and the palm rides inward. Built on
        // the one shared equipment-channel frame (which sculls and bike hoods
        // adopt in their own layers); SkiErg no longer maintains a duplicate
        // orientation system.
        gripThumbwardLocal.copy(SEGMENT_DIR).multiplyScalar(-1);
        // Pinning the fist's channel axis along the shaft leaves exactly one
        // freedom — spin about the shaft. Baseline: palm toward the athlete's
        // midline (never singular — the lateral axis cannot cross the
        // forearm), then an explicit extra roll lays the hand's long axis
        // onto the solved forearm for a FLAT WRIST, exactly as Concept2
        // specifies ("Your wrists should not bend"). The arm path now meets
        // the pole near the hand's 109.4° neutral cone at almost every
        // phase, so the flat roll is small and also lands the palm near the
        // ski pronation target for free. At the release stretch the shaft
        // passes near-parallel to the forearm and the flat-roll projection
        // spins — the same ±π singularity as the rowing feather — so the
        // extra roll fades on the projection quality and wrap-guards at π,
        // falling back to the stable palm-inward baseline through that
        // window.
        gripRollLocal.copy(athleteRightLocal).multiplyScalar(-arm.side);
        orientHandToGripChannel(
          arm.hand,
          arm.side,
          SKI_POLE_GRIP_RADIUS,
          gripThumbwardLocal,
          gripRollLocal,
          pole.shaft.quaternion,
          handPalmNormalOut(arm.side, GRIP_PALM_SCRATCH),
        );
        GRIP_FOREARM_SCRATCH.set(
          arm.handPoint.x - arm.elbowPoint.x,
          arm.handPoint.y - arm.elbowPoint.y,
          arm.handPoint.z - arm.elbowPoint.z,
        ).normalize();
        // The TRUE 3D forearm direction, kept intact (not projected) so the
        // candidate roll below can be judged against real anatomical bend,
        // not just projection alignment.
        SKI_FLAT_FOREARM.copy(GRIP_FOREARM_SCRATCH);
        GRIP_LONG_SCRATCH.copy(GRIP_FOREARM_SCRATCH);
        const skiForeAcross = GRIP_LONG_SCRATCH.addScaledVector(
          SEGMENT_DIR,
          -GRIP_LONG_SCRATCH.dot(SEGMENT_DIR),
        ).length();
        // Condition the refinement on geometry, not stroke phase. The former
        // pole-off fade left the free return with a measured 98° p95 wrist
        // bend even though the same grip freedom remains available in flight.
        // `skiForeAcross` fades continuously only where the forearm projection
        // becomes singular, so drive and recovery share one stable rule.
        const skiFlatWeight = THREE.MathUtils.smoothstep(skiForeAcross, 0.12, 0.35);
        if (skiFlatWeight > 1e-4) {
          // Spend the grip's one free degree of freedom — spin about the shaft
          // — on wrist flatness, using the shared Layer-1 relief rather than a
          // SkiErg copy of it. The allowance itself is geometry-weighted, so
          // the correction has no phase gate to switch at pole-off. Together
          // with the bounded diagonal hold below, the 257-sample production
          // sweep measures 87.9° p95 / 91.1° max while every palm remains
          // inward and the forearm segments remain continuous.
          refineGripSpinForWrist(
            arm.hand,
            arm.side,
            SEGMENT_DIR,
            SKI_FLAT_FOREARM,
            SKI_FLAT_MAX_SPIN * skiFlatWeight,
          );
        }
        // The pole may ride diagonally across the palm to keep the hand
        // continuous with the forearm. This rotates about the palm normal, so
        // the palm's facing — and therefore the pronation set above — is
        // unchanged by construction.
        //
        // Feed the true 3D forearm, not `GRIP_FOREARM_SCRATCH`: the flat-roll
        // block above reuses that scratch for a shaft-plane projection, so
        // reading it here would hand the tilt a projected vector whenever
        // that branch ran and the real forearm whenever it did not.
        refineGripTiltForWrist(
          arm.hand,
          arm.side,
          SKI_FLAT_FOREARM,
          SKI_PALM_TILT_COMFORT,
          SKI_PALM_TILT,
        );

        if (contactPass + 1 < contactPasses) {
          upper.getWorldQuaternion(gripWorldQuaternion);
          skiGripReachSolver.solve(
            shoulderWorld,
            desiredHandWorld,
            tipWorld,
            structuralV4Reach,
            arm.side,
            gripWorldQuaternion,
            arm.hand.quaternion,
            motion.poleContact < 1 - 1e-9,
            solvedHandWorld,
            postReleaseExtension,
          );
        }
      }
    }
  };

  const animate = (
    phase: number,
    reduce: boolean,
    pose?: StrokePose,
    meters = 0,
  ): AvatarMotionCues => {
    const resolvedPose = reduce
      ? REDUCED_REPLAY_POSES.skierg
      : (pose ?? fallbackStrokePose("skierg", phase));
    const motion = solveSkierKinematics(resolvedPose, kinematics);
    pendingPose = resolvedPose;
    pendingMeters = meters;
    pendingMotion = motion;
    hasSampledV4Shoulders = false;
    // Carry the pelvis through a restrained spring rather than lowering the
    // whole upper body into a broken-looking crouch. The small forward travel
    // lets the fixed-length legs share the load instead of making the torso
    // compensate with an extreme rotation.
    upper.position.set(
      0,
      SKI_STANDING_PELVIS_Y -
        motion.kneeFlex * SKI_PELVIS_KNEE_DROP +
        (reduce ? 0 : motion.rebound * SKI_RECOVERY_REBOUND_LIFT),
      motion.hipHinge * SKI_PELVIS_FORWARD_TRAVEL,
    );
    // A strong double-pole is a pronounced but still athletic hip hinge
    // (~35° at full press), not the former ~55° mannequin crunch. Counterpose
    // the pelvis and head locally: the body reads as a connected spine and the
    // skier keeps their gaze down-course while all pole and hand contacts stay
    // solved from their authoritative end points.
    upper.rotation.x = SKI_NEUTRAL_TORSO_PITCH + motion.hipHinge * SKI_TORSO_HINGE_RANGE;
    hips.rotation.x = -motion.hipHinge * SKI_PELVIS_COUNTER_TILT;
    headGroup.rotation.x = -motion.hipHinge * SKI_HEAD_GAZE_COUNTER_TILT;
    placeSkiLegs();
    return reduce ? STATIC_AVATAR_MOTION : motion;
  };

  const resolveWorldContacts = (): void => {
    placePoleArms(pendingMotion, pendingPose, pendingMeters);
  };

  const refineV4Targets = (motion: ReplayV4MotionController): void => {
    motion.getShoulderWorld("left", sampledV4Shoulders[0]);
    motion.getShoulderWorld("right", sampledV4Shoulders[1]);
    sampledV4ArmReaches[0] = motion.getArmReach("left");
    sampledV4ArmReaches[1] = motion.getArmReach("right");
    // The pole authority and the V4 skin share the avatar parent but not the
    // same torso node. Convert the visible shoulder roots into the pole
    // solver's frame before the final course-space contact pass; each side's
    // authored structural reach remains separate so an asymmetric rig cannot
    // reopen one hand while the other stays attached.
    upper.worldToLocal(sampledV4Shoulders[0]);
    upper.worldToLocal(sampledV4Shoulders[1]);
    hasSampledV4Shoulders = true;
  };

  const [leftArm, rightArm] = arms;
  const [leftLeg, rightLeg] = legParts;
  if (!leftArm || !rightArm || !leftLeg || !rightLeg) {
    throw new Error("SkiErg V4 target rig is incomplete");
  }
  finalizeAvatar(group, castShadow, opacity);
  const skiAvatar: Avatar = {
    group,
    animate,
    refineV4Targets,
    resolveWorldContacts,
    assetMaterialResolver: resolveAssetMaterial,
    v4Targets: {
      pelvis: hips,
      leftHand: leftArm.hand,
      rightHand: rightArm.hand,
      leftElbow: leftArm.elbow,
      rightElbow: rightArm.elbow,
      leftFoot: leftLeg.foot,
      rightFoot: rightLeg.foot,
      leftKnee: leftLeg.knee,
      rightKnee: rightLeg.knee,
    },
    setV4ArmReach(reach) {
      if (Number.isFinite(reach) && reach > 0) contactArmReach = reach;
    },
  };
  return skiAvatar;
}
