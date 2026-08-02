/**
 * RowErg avatar: shell, rigger, sculls, seat carriage and the seated athlete,
 * plus the per-frame drive/recovery placement the course renderer calls.
 *
 * Built on `renderer3dAvatarKit` and the contact authority in `rowRig`. The
 * grip contract that closes the hands onto the scull rubber stays in
 * `renderer3d`, which owns it for all three sports.
 */
import * as THREE from "three";
import { roundedVenueBlockGeometry } from "./renderer3dVenueKit";
import { REDUCED_REPLAY_POSES } from "./renderer";
import type { RenderQuality } from "./replayRenderer";
import { fallbackStrokePose, type StrokePose } from "./strokeModel";
import { createRowerMotionGraphScratch, sampleRowerMotionGraphInto } from "./motionGraph";
import { solveTwoBone3D } from "./figurePose";
import {
  ROWER_DRAW_FINISH_FLEXION,
  ROWER_DRAW_SOFT_FLEXION,
  ROWER_FOOT_CONTACT,
  ROWER_OARLOCK,
  ROWER_SCULL_GRIP,
  ROWER_STRETCHER,
  rowerReachForFlexion,
  solveRowerArm,
  solveRowerOarYaw,
} from "./rowRig";
import { orientHandToGripChannel, handLongAxis, refineGripTiltForWrist } from "./handGrip";
import {
  hideWithReplayAssets,
  setReplayAssetSlot,
  setReplayAssetTemplateAnchor,
} from "./renderer3dAssets";
import { type ReplayV4MotionController } from "./renderer3dV4Motion";
import {
  GRIP_FOREARM_SCRATCH,
  GRIP_LONG_SCRATCH,
  GRIP_ROLL_SCRATCH,
  GRIP_SHAFT_SCRATCH,
  GRIP_SPIN_SCRATCH,
  HUMAN_HAIR,
  HUMAN_KIT,
  HUMAN_KIT_DARK,
  HUMAN_SHOE,
  HUMAN_SKIN,
  STATIC_AVATAR_MOTION,
  accentEquipmentMaterial,
  accentMaterial,
  accentPart,
  boatMaterial,
  capsulePart,
  elbowCap,
  ellipsoid,
  finalizeAvatar,
  humanMat,
  jointCap,
  makeAssetMaterialResolver,
  makeFoot,
  makeHairMaterial,
  makeHand,
  makeHead,
  makeSkinMaterial,
  orientElbowCuff,
  placeFigureSegmentBetween,
  shapedTorso,
  taperedLimb,
  trapezoidPanel,
  tubeBetween,
  type Avatar,
  type AvatarMotionCues,
  type BoatDetail,
} from "./renderer3dAvatarKit";

/**
 * Sculling diagonal-hold relief. The oar handle sweeps ~50-70° from lateral
 * through the stroke, and the fist's channel axis is pinned 109.4° from the
 * hand's long axis — so a square hold forces 40-60° of wrist bend. Real
 * scullers keep the wrist flat and let the handle ride diagonally across the
 * palm instead; the tilt models that with the palm facing unchanged. Comfort
 * is the flat-wrist target (Concept2: "wrists should be flat"), the budget is
 * how diagonal the handle may sit in the palm.
 */
export const ROWER_PALM_TILT = 0.75;
export const ROWER_PALM_TILT_COMFORT = 0.3;

export function addRowerBoatQualityDetails(
  boatVisual: THREE.Group,
  detail: BoatDetail,
  lightMaterial: THREE.Material,
  metalMaterial: THREE.Material,
): void {
  const quality = new THREE.Group();
  quality.name = "rower-boat-quality-detail";
  quality.userData.boatDetail = detail;
  if (detail >= 2) {
    // High and Ultra spend geometry on the shell itself: two fine waterline
    // strakes follow the open cockpit instead of only increasing the canvas
    // DPR. They make the long, narrow hull legible in a rear three-quarter
    // camera without changing any contact target.
    for (const side of [-1, 1]) {
      quality.add(
        tubeBetween(
          side < 0 ? "rower-shell-waterline-port" : "rower-shell-waterline-starboard",
          { x: side * 0.205, y: 0.22, z: -2.55 },
          { x: side * 0.205, y: 0.22, z: 2.55 },
          detail >= 3 ? 0.006 : 0.004,
          lightMaterial,
        ),
      );
    }
  }
  if (detail >= 3) {
    // Ultra adds the visible cockpit load path: cross braces sit below the
    // coaming and visually connect the rails to the shell walls.
    for (const z of [-0.78, 0.93]) {
      quality.add(
        tubeBetween(
          `rower-cockpit-cross-brace-${z < 0 ? "aft" : "fore"}`,
          { x: -0.16, y: 0.235, z },
          { x: 0.16, y: 0.235, z },
          0.008,
          metalMaterial,
        ),
      );
    }
  }
  boatVisual.add(quality);
}
/**
 * Low-poly single scull: long thin hull (capsule), a seated rower, and two oars
 * with blades. The lower hull stays neutral while the deck and oar blades carry
 * `userData.accent`; the rower slides + leans and the oars sweep/feather per
 * stroke.
 */
export function makeRowerAvatar(
  accent: number,
  castShadow: boolean,
  opacity = 1,
  bodySegments = 16,
  quality: RenderQuality = "medium",
): Avatar {
  // RowErg shell finish/detail ladder follows the shared quality tier the
  // sport-profile factory now passes to every avatar maker.
  const boatDetail: BoatDetail =
    quality === "low" ? 0 : quality === "medium" ? 1 : quality === "high" ? 2 : 3;
  const segs = bodySegments;
  const capSegs = Math.max(10, Math.round(segs * 0.82));
  const headSegs = Math.max(14, segs + 2);
  const eqCylSegs = Math.max(12, Math.round(segs * 0.7));
  const eqTorSegs = Math.max(10, Math.round(segs * 0.6));
  const group = new THREE.Group();
  // Each avatar owns its sampled graph so live and ghost athletes never share
  // mutable frame state. This keeps the motion path allocation-free in 3D.
  const rowMotionGraph = createRowerMotionGraphScratch();
  const laneMaterial = accentEquipmentMaterial(accent, boatDetail);
  const jerseyMaterial = accentMaterial(accent);
  const accentMat = () => laneMaterial;
  const skinMaterial = makeSkinMaterial(HUMAN_SKIN);
  const hairMaterial = makeHairMaterial(HUMAN_HAIR);
  const kitMaterial = humanMat(HUMAN_KIT, 0.58);
  const kitDarkMaterial = humanMat(HUMAN_KIT_DARK, 0.64);
  const shoeMaterial = humanMat(HUMAN_SHOE, 0.46);
  const boatDarkMaterial = boatMaterial(0x162631, boatDetail, 0.42, 0.16);
  const boatTrimMaterial = boatMaterial(0xc8d4dc, boatDetail, 0.34, 0.08);
  const equipmentLightMaterial = boatMaterial(0xf1f5f9, boatDetail, 0.42, 0.12);
  const equipmentMetalMaterial = boatMaterial(0x8a9097, boatDetail, 0.38, 0.58);
  const equipmentGripMaterial = boatMaterial(0x26343d, boatDetail, 0.56, 0.04);
  const resolveAssetMaterial = makeAssetMaterialResolver({
    "athlete-skin": skinMaterial,
    "athlete-fabric": jerseyMaterial,
    "athlete-hair": hairMaterial,
    "athlete-footwear": shoeMaterial,
    "equipment-painted": laneMaterial,
    "equipment-dark": boatDarkMaterial,
    "equipment-light": equipmentLightMaterial,
    "equipment-metal": equipmentMetalMaterial,
    "equipment-rubber": equipmentGripMaterial,
    "equipment-grip": equipmentGripMaterial,
    "equipment-trim": boatTrimMaterial,
  });
  const hull = setReplayAssetSlot(
    new THREE.Mesh(
      new THREE.CapsuleGeometry(0.34, 7.12, eqCylSegs, Math.round(eqCylSegs * 1.4)),
      boatDarkMaterial,
    ),
    "equipment:row:hull",
  );
  hull.rotation.x = Math.PI / 2; // capsule axis Y -> Z (travel)
  // Object scale applies in capsule-local axes *before* that rotation: local Y
  // is the long axis (kept at full length so the fallback matches the 7.8 m
  // deck/gunwale footprint) and local Z becomes world height, flattened so the
  // fallback hull stays below the visible leg chain and the gunwales.
  hull.scale.set(0.55, 1, 0.3);
  hull.position.y = 0.135;
  group.add(hull);

  // Two short decks leave a genuine cockpit opening around the athlete. The
  // old full-length slab hid both legs and made the seat look glued on top.
  const sternDeck = new THREE.Mesh(
    roundedVenueBlockGeometry(0.18, 0.045, 2.92, 0.022),
    accentMat(),
  );
  sternDeck.name = "rower-bow-deck";
  sternDeck.position.set(0, 0.275, -2.34);
  sternDeck.userData.accent = true;
  group.add(sternDeck);
  const bowDeck = new THREE.Mesh(roundedVenueBlockGeometry(0.17, 0.043, 2.86, 0.021), accentMat());
  bowDeck.name = "rower-stern-deck";
  bowDeck.position.set(0, 0.273, 2.37);
  bowDeck.userData.accent = true;
  group.add(bowDeck);
  const cockpitFloor = new THREE.Mesh(
    roundedVenueBlockGeometry(0.27, 0.025, 1.48, 0.01),
    kitDarkMaterial,
  );
  cockpitFloor.name = "rower-cockpit-floor";
  cockpitFloor.position.set(0, 0.17, 0.05);
  group.add(cockpitFloor);
  const sternStripe = new THREE.Mesh(
    roundedVenueBlockGeometry(0.04, 0.014, 2.42, 0.007),
    equipmentLightMaterial,
  );
  sternStripe.name = "rower-bow-deck-stripe";
  sternStripe.position.set(0, 0.305, -2.31);
  group.add(sternStripe);
  const bowStripe = sternStripe.clone();
  bowStripe.name = "rower-stern-deck-stripe";
  bowStripe.position.set(0, 0.304, 2.28);
  group.add(bowStripe);
  const bowBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.042, Math.max(12, eqCylSegs), Math.max(8, eqTorSegs)),
    equipmentLightMaterial,
  );
  bowBall.name = "rower-bow-ball";
  bowBall.position.set(0, 0.205, -3.91);
  group.add(bowBall);
  const gunwale = new THREE.Mesh(
    roundedVenueBlockGeometry(0.02, 0.032, 2.86, 0.009),
    equipmentLightMaterial,
  );
  gunwale.name = "rower-gunwale-left";
  gunwale.position.set(-0.15, 0.285, 0);
  group.add(gunwale);
  const gunwaleR = gunwale.clone();
  gunwaleR.name = "rower-gunwale-right";
  gunwaleR.position.x = 0.15;
  group.add(gunwaleR);

  const slideRails: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const rail = capsulePart(0.012, 1, equipmentMetalMaterial, "z");
    rail.name = side < 0 ? "rower-slide-rail-left" : "rower-slide-rail-right";
    rail.position.set(side * 0.078, 0.267, -0.16);
    slideRails.push(rail);
    group.add(rail);
  }

  const footPlate = new THREE.Mesh(
    roundedVenueBlockGeometry(0.38, 0.29, 0.036, 0.018),
    kitDarkMaterial,
  );
  footPlate.name = "rower-footplate";
  footPlate.position.set(0, ROWER_STRETCHER.centerY, ROWER_STRETCHER.centerZ);
  footPlate.rotation.x = ROWER_STRETCHER.boardRotation;
  group.add(footPlate);
  const heelCups: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const heelCup = new THREE.Mesh(
      roundedVenueBlockGeometry(0.105, 0.075, 0.12, 0.016),
      equipmentGripMaterial,
    );
    heelCup.name = side < 0 ? "rower-heel-cup-left" : "rower-heel-cup-right";
    heelCup.position.set(
      side * ROWER_FOOT_CONTACT.lateral,
      ROWER_FOOT_CONTACT.y,
      ROWER_FOOT_CONTACT.z,
    );
    heelCup.rotation.x = ROWER_STRETCHER.boardRotation;
    heelCups.push(heelCup);
    group.add(heelCup);
  }
  const instepBar = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.012, 0.336, 8, 12),
    equipmentMetalMaterial,
  );
  instepBar.name = "rower-footplate-instep-bar";
  instepBar.rotation.z = Math.PI / 2;
  instepBar.position.set(0, 0.35, 0.625);
  group.add(instepBar);
  const stretcherSupports: THREE.Mesh[] = [];
  const heelRestraints: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const support = tubeBetween(
      side < 0 ? "rower-footplate-support-left" : "rower-footplate-support-right",
      { x: side * 0.17, y: 0.175, z: 0.84 },
      {
        x: side * 0.17,
        y: ROWER_STRETCHER.centerY,
        z: ROWER_STRETCHER.centerZ,
      },
      0.009,
      equipmentMetalMaterial,
    );
    stretcherSupports.push(support);
    group.add(support);
    const heelRestraint = tubeBetween(
      side < 0 ? "rower-heel-restraint-left" : "rower-heel-restraint-right",
      { x: side * 0.12, y: 0.185, z: 0.785 },
      { x: side * 0.12, y: 0.245, z: 0.72 },
      0.006,
      equipmentGripMaterial,
    );
    heelRestraints.push(heelRestraint);
    group.add(heelRestraint);
  }
  for (const side of [-1, 1]) {
    const anchor = new THREE.Object3D();
    anchor.name = side < 0 ? "rower-footplate-contact-left" : "rower-footplate-contact-right";
    anchor.position.set(
      side * ROWER_FOOT_CONTACT.lateral,
      ROWER_FOOT_CONTACT.y,
      ROWER_FOOT_CONTACT.z,
    );
    group.add(anchor);
  }
  // V3 keeps the entire scull as one designed assembly while the existing
  // footplate contact nodes remain parented to the rig and authoritative.
  const boatVisual = new THREE.Group();
  boatVisual.name = "rower-boat-visual";
  group.add(boatVisual);
  setReplayAssetTemplateAnchor(boatVisual, "equipment:row:boat-assembly", {
    fallback: [
      hull,
      sternDeck,
      bowDeck,
      cockpitFloor,
      sternStripe,
      bowStripe,
      bowBall,
      gunwale,
      gunwaleR,
      ...slideRails,
      footPlate,
      ...heelCups,
      instepBar,
      ...stretcherSupports,
      ...heelRestraints,
    ],
  });
  addRowerBoatQualityDetails(
    boatVisual,
    boatDetail,
    equipmentLightMaterial,
    equipmentMetalMaterial,
  );

  // Rower in its own group so slide, layback, legs and arms all move from the
  // recorded stroke pose rather than as one rigid toy block.
  const rower = new THREE.Group();
  rower.name = "rower-athlete";
  const seatCarriage = new THREE.Group();
  seatCarriage.name = "rower-seat-carriage";
  seatCarriage.position.set(0, 0.29, -0.14);
  const seat = new THREE.Mesh(roundedVenueBlockGeometry(0.31, 0.055, 0.24, 0.04), kitMaterial);
  seat.name = "rower-seat";
  seat.position.y = 0.05;
  const seatFrame = new THREE.Mesh(
    roundedVenueBlockGeometry(0.28, 0.032, 0.2, 0.009),
    equipmentMetalMaterial,
  );
  seatFrame.name = "rower-seat-frame";
  seatFrame.position.y = 0.012;
  const seatRollers: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    for (const fore of [-1, 1]) {
      const roller = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.055, Math.max(12, eqCylSegs)),
        equipmentGripMaterial,
      );
      roller.name = `rower-seat-roller-${side < 0 ? "left" : "right"}-${fore < 0 ? "aft" : "fore"}`;
      roller.rotation.z = Math.PI / 2;
      roller.position.set(side * 0.078, -0.012, fore * 0.085);
      seatRollers.push(roller);
    }
  }
  seatCarriage.add(seat, seatFrame, ...seatRollers);
  setReplayAssetTemplateAnchor(seatCarriage, "equipment:row:seat-carriage", {
    fallback: [seat, seatFrame, ...seatRollers],
  });
  const hips = ellipsoid([0.18, 0.125, 0.16], kitDarkMaterial, segs);
  setReplayAssetSlot(hips, "athlete:pelvis");
  hips.name = "rower-hips";
  hips.position.set(0, 0.38, -0.14);

  // Pelvis-pivoted spine: torso, shoulders, neck and head now swing as one
  // articulated chain instead of being translated as disconnected pieces.
  const torso = new THREE.Group();
  torso.name = "rower-torso";
  torso.position.copy(hips.position);
  const torsoShell = accentPart(shapedTorso(0.29, 0.64, 0.175, jerseyMaterial, segs));
  setReplayAssetSlot(torsoShell, "athlete:torso");
  torsoShell.name = "rower-torso-shell";
  torsoShell.position.y = 0.3;
  const frontYoke = hideWithReplayAssets(trapezoidPanel(0.48, 0.34, 0.16, 0.032, kitDarkMaterial));
  frontYoke.name = "rower-jersey-front";
  frontYoke.position.set(0, 0.5, 0.168);
  const backYoke = hideWithReplayAssets(trapezoidPanel(0.48, 0.34, 0.16, 0.032, kitDarkMaterial));
  backYoke.name = "rower-jersey-back";
  backYoke.position.set(0, 0.5, -0.168);
  const shoulderLine = hideWithReplayAssets(capsulePart(0.062, 0.56, kitDarkMaterial, "x"));
  shoulderLine.name = "rower-shoulder-trim";
  shoulderLine.position.set(0, 0.53, 0.01);
  const neck = capsulePart(0.053, 0.11, skinMaterial, "y");
  setReplayAssetSlot(neck, "athlete:neck");
  neck.position.set(0, 0.67, 0.015);
  const headGroup = makeHead(skinMaterial, hairMaterial, headSegs);
  headGroup.position.set(0, 0.79, 0.025);
  torso.add(torsoShell, frontYoke, backYoke, shoulderLine, neck, headGroup);
  rower.add(seatCarriage, hips, torso);

  const arms: Array<{
    side: number;
    upper: THREE.Mesh;
    forearm: THREE.Mesh;
    hand: THREE.Group;
    shoulder: THREE.Mesh;
    elbow: THREE.Mesh;
    shoulderPoint: THREE.Vector3;
    elbowPoint: THREE.Vector3;
    handTarget: THREE.Vector3;
    wristTarget: THREE.Vector3;
    handPoint: THREE.Vector3;
    bendHint: THREE.Vector3;
  }> = [];
  const legs: Array<{
    side: number;
    thigh: THREE.Mesh;
    shin: THREE.Mesh;
    foot: THREE.Group;
    knee: THREE.Mesh;
    hipPoint: THREE.Vector3;
    kneePoint: THREE.Vector3;
    footTarget: THREE.Vector3;
    footPoint: THREE.Vector3;
    bendHint: THREE.Vector3;
  }> = [];
  for (const side of [-1, 1]) {
    // Tapered leg segments — positioned per-frame by IK from hip to foot.
    const thigh = taperedLimb(0.08, 0.058, kitMaterial, segs);
    setReplayAssetSlot(thigh, "athlete:thigh");
    thigh.name = side < 0 ? "rower-thigh-left" : "rower-thigh-right";
    const shin = taperedLimb(0.058, 0.042, kitMaterial, segs);
    setReplayAssetSlot(shin, "athlete:shin");
    shin.name = side < 0 ? "rower-shin-left" : "rower-shin-right";
    const foot = makeFoot(shoeMaterial);
    foot.name = side < 0 ? "rower-foot-contact-left" : "rower-foot-contact-right";
    const knee = jointCap(0.075, skinMaterial, capSegs);
    knee.name = side < 0 ? "rower-knee-left" : "rower-knee-right";
    rower.add(thigh, shin, foot, knee);
    legs.push({
      side,
      thigh,
      shin,
      foot,
      knee,
      hipPoint: new THREE.Vector3(),
      kneePoint: new THREE.Vector3(),
      footTarget: new THREE.Vector3(),
      footPoint: new THREE.Vector3(),
      bendHint: new THREE.Vector3(side * 0.46, 0.7, -0.28),
    });

    const upperArm = taperedLimb(0.064, 0.047, skinMaterial, segs);
    setReplayAssetSlot(upperArm, "athlete:upper-arm");
    upperArm.name = side < 0 ? "rower-upper-arm-left" : "rower-upper-arm-right";
    const forearm = taperedLimb(0.05, 0.036, skinMaterial, segs);
    setReplayAssetSlot(forearm, "athlete:forearm");
    forearm.name = side < 0 ? "rower-forearm-left" : "rower-forearm-right";
    const hand = makeHand(skinMaterial, side, capSegs);
    hand.name = side < 0 ? "rower-hand-left" : "rower-hand-right";
    const shoulder = jointCap(0.07, kitMaterial, capSegs);
    shoulder.userData.hideWithReplayAssets = false;
    setReplayAssetSlot(shoulder, "athlete:shoulder");
    shoulder.name = side < 0 ? "rower-shoulder-left" : "rower-shoulder-right";
    const elbow = elbowCap(0.055, skinMaterial, capSegs);
    elbow.name = side < 0 ? "rower-elbow-left" : "rower-elbow-right";
    rower.add(upperArm, forearm, hand, shoulder, elbow);
    arms.push({
      side,
      upper: upperArm,
      forearm,
      hand,
      shoulder,
      elbow,
      shoulderPoint: new THREE.Vector3(),
      elbowPoint: new THREE.Vector3(),
      handTarget: new THREE.Vector3(),
      wristTarget: new THREE.Vector3(),
      handPoint: new THREE.Vector3(),
      bendHint: new THREE.Vector3(side * 0.56, -0.48, -0.18),
    });
  }
  rower.position.z = -0.1;
  group.add(rower);

  // Oars pivot at their rigger pins. The inboard lever is long enough that a
  // full ~90° sweep moves the handle ~1 m — without that, arms barely travel
  // and the stroke looks like a shoulder shrug. Arm IK consumes the explicit
  // grip anchor so hands stay locked to the equipment while the seat slides.
  const oars: Array<{
    side: number;
    group: THREE.Group;
    blade: THREE.Mesh;
    handleAnchor: THREE.Object3D;
  }> = [];
  for (const side of [-1, 1]) {
    const oar = new THREE.Group();
    oar.name = side < 0 ? "rower-oar-left" : "rower-oar-right";
    // Regulation-scale 2.89 m scull: 0.82 m inboard of the pin and a 2.07 m
    // outboard lever including the spoon. The former 3.4 m overall assembly
    // read as a sweep oar and overwhelmed a one-person shell.
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.021, 2.22, eqCylSegs),
      equipmentLightMaterial,
    );
    shaft.rotation.z = Math.PI / 2; // cylinder axis Y -> X
    shaft.position.x = side * 0.61;
    oar.add(shaft);
    // The rendered rubber and the grip-closure contract are one surface: the
    // solver closes digits onto exactly this cylinder, so the mesh reads the
    // shared constant instead of repeating its numbers.
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(
        ROWER_SCULL_GRIP.radius,
        ROWER_SCULL_GRIP.radius,
        ROWER_SCULL_GRIP.length,
        eqCylSegs,
      ),
      equipmentGripMaterial,
    );
    grip.rotation.z = Math.PI / 2;
    grip.name = side < 0 ? "rower-handle-left" : "rower-handle-right";
    // A regulation-scale scull has roughly 0.8–0.9 m of inboard leverage. The
    // shorter placeholder forced a false choice between centreline hands and
    // long arms; this reach lets both coexist while the fixed pin remains on
    // the rigger.
    grip.position.x = -side * 0.66;
    grip.position.y = -0.04;
    oar.add(grip);
    const handleAnchor = new THREE.Object3D();
    handleAnchor.name = side < 0 ? "rower-hand-contact-left" : "rower-hand-contact-right";
    // Land the grip channel within the rubber, `anchorFromEnd` inboard of the
    // flat thumb stop: the enclosure solve drives the hand's channel centre
    // onto this axis point, so four fingers hook over the cylinder while the
    // thumb presses its end. Targeting the cap or shaft seam instead makes
    // the grip read as a fist floating beside the oar.
    handleAnchor.position.x =
      -side * (0.66 + ROWER_SCULL_GRIP.length / 2 - ROWER_SCULL_GRIP.anchorFromEnd);
    // The contact and rendered rubber share one axis. Keeping equipment and
    // solver coordinates identical prevents a visually closed fist from
    // floating above or below the actual handle.
    handleAnchor.position.y = -0.04;
    oar.add(handleAnchor);
    // The collar/button bears against the oarlock at the fixed pin.
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.05, 0.015, eqTorSegs, eqCylSegs),
      equipmentMetalMaterial,
    );
    collar.name = "rower-oar-collar";
    collar.position.set(side * 0.02, 0, 0);
    collar.rotation.y = Math.PI / 2;
    oar.add(collar);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.022, 0.3), accentMat());
    setReplayAssetSlot(blade, "equipment:row:blade");
    blade.name = side < 0 ? "rower-blade-left" : "rower-blade-right";
    blade.position.set(side * 1.82, -0.06, 0);
    blade.userData.accent = true;
    oar.add(blade);
    // The authored oar has one canonical +X outboard direction. Mirror the
    // left visual only; the solver still owns this parent group's sweep/depth
    // and the separate blade continues to feather per stroke.
    const oarVisual = new THREE.Group();
    oarVisual.name = side < 0 ? "rower-oar-visual-left" : "rower-oar-visual-right";
    if (side < 0) oarVisual.rotation.y = Math.PI;
    oar.add(oarVisual);
    setReplayAssetTemplateAnchor(oarVisual, "equipment:row:oar-rig", {
      fallback: [shaft, grip, collar],
    });
    // Rigger pin sits outside the hull; blade depth is animated continuously.
    // The 1.56 m span matches a full-width sculling rigger. Its pins sit beside
    // the athlete rather than ahead of the knees, keeping the grips on their
    // own lateral halves and the forearms clear of the torso.
    // The pin sits bow-side of the athlete's hip line. This leaves the
    // catch handle ahead of the torso while the seat drives aft, keeps the
    // two scull grips separated at the finish, and still gives the inboard
    // lever enough sweep to finish at the lower chest.
    oar.position.set(side * ROWER_OARLOCK.lateral, ROWER_OARLOCK.y, ROWER_OARLOCK.z);
    oar.userData.side = side;
    group.add(oar);
    oars.push({ side, group: oar, blade, handleAnchor });
  }

  // Authored visual ranges. Channels from the solver are 0..1; these scales
  // turn them into a stroke that reads at a glance without leaving the hull.
  // Seat start is biased forward so travel can grow without pulling the hips
  // past the fixed footplate reach of the thigh+shin chain (~1.10 m).
  const SEAT_TRAVEL = -0.44;
  // The aft-facing athlete and fixed stretcher point toward local +Z. At the
  // catch the seat is closest to the feet; the drive carries it bowward (-Z)
  // while the feet stay fixed.
  const SEAT_CATCH_Z = 0.26;
  const THIGH_LENGTH = 0.552;
  const SHIN_LENGTH = 0.552;
  const UPPER_ARM_LENGTH = 0.39;
  const FOREARM_LENGTH = 0.38;
  const BASE_ARM_REACH = UPPER_ARM_LENGTH + FOREARM_LENGTH;
  const UPPER_ARM_SHARE = UPPER_ARM_LENGTH / BASE_ARM_REACH;
  let contactArmReach = BASE_ARM_REACH;
  // The athlete faces +Z: positive X rotation tips the spine toward the feet
  // at the catch, while negative rotation opens it into the finish. Keep this
  // hidden authority shoulder in the same frame as the V4 clip so its rigid
  // grip targets do not manufacture an early elbow fold.
  const BODY_PITCH_CATCH = 0.56;
  const BODY_PITCH_FINISH = -0.3;
  const PELVIS_PITCH_CATCH = 0.07;
  const PELVIS_PITCH_FINISH = -0.105;
  // Concept2 / scull handle path: early drive keeps grips forward so arms can
  // stay long; late draw brings the bar to the *lower chest / ribs*, not behind
  // the back (British Rowing / Concept2 finish coaching).
  // Positive catch yaw puts each inboard grip ahead of the shoulders toward
  // the stretcher. The drive crosses the pin normal and finishes on the
  // athlete-facing side, at the lower ribs. Keeping both values negative put
  // the catch behind the torso and made the rower reach backward for the oars.
  const OAR_YAW_CATCH = 0.68;
  const OAR_DRAW_YAW = -0.8;
  const OAR_YAW_SPAN = OAR_DRAW_YAW - OAR_YAW_CATCH;
  // A scull blade is buried only just below the surface. With the 0.51 pin
  // and the 2.09 m outboard lever, ~16 degrees of fixed-pin roll drops the
  // spoon comfortably under the -0.05 water plane for the whole bladeWater
  // window — with margin for the damped drive-phase hull roll — while the
  // 0.78 m inboard lever holds the handles at the drive height. The former
  // 0.1 rad dip left the loaded spoon ~0.3 m airborne through the entire
  // drive and only wet it at the release.
  const BLADE_DIP = 0.28;
  // Real handles rise only a few centimetres into the finish — any more and
  // the pin leverage digs the spoon half a metre deep. This small extra roll
  // adds ~3 cm of grip height across the draw; the lower-rib finish comes from
  // the layback carrying the ribs to the hands, not from hauling the handles
  // up. The former 0.24 rad rise was doing the burial work the drive roll
  // should have done, which is why immersion happened only at the extraction.
  const HANDLE_RISE_ROLL = 0.04;

  const handlePoint = new THREE.Vector3();
  const sampledV4Shoulders = [new THREE.Vector3(), new THREE.Vector3()] as const;
  const sampledV4Knees = [new THREE.Vector3(), new THREE.Vector3()] as const;
  const sampledV4ReachOrigins = [new THREE.Vector3(), new THREE.Vector3()] as const;
  const sampledV4ContactOffsets = [new THREE.Vector3(), new THREE.Vector3()] as const;
  const sampledV4ArmReaches: [number, number] = [BASE_ARM_REACH, BASE_ARM_REACH];
  const sampledV4ReachCorrections: [number, number] = [0, 0];
  let pendingBodySwing = 0;
  let pendingArmDraw = 0;
  /**
   * Authored feather window for the flat-wrist grip roll: 1 through the drive
   * and recovery, easing to 0 across the extraction (warped cycle
   * 0.475-0.61, measured: the flat-roll target passes exactly through the
   * ±π ambiguity at warped 0.530-0.546, where any scheme that keeps rolling
   * toward it must jump). Keyed on the warped phase — the domain where the
   * drive/recovery split is stationary — so the window stays on the
   * extraction at any stroke ratio. Inside it the hand falls back to the
   * stable down-reference: a brief wrist flex through the feather, which is
   * what a real extraction does.
   */
  let pendingFlatWristWindow = 1;
  let pendingShoulderSet = 0;
  let pendingHandleTravel = 0;
  const requestedRowerWristReach = (armReach: number, draw: number): number => {
    const upperArmLength = armReach * UPPER_ARM_SHARE;
    const forearmLength = armReach - upperArmLength;
    return (
      rowerReachForFlexion(
        ROWER_DRAW_SOFT_FLEXION + draw * (ROWER_DRAW_FINISH_FLEXION - ROWER_DRAW_SOFT_FLEXION),
        upperArmLength,
        forearmLength,
      ) - 0.002
    );
  };
  const placeArms = (
    bodySwing: number,
    armDraw: number,
    shoulderSet: number,
    handleTravel: number,
    v4Refinement?: {
      readonly shoulders: readonly [THREE.Vector3, THREE.Vector3];
      readonly reachOrigins: readonly [THREE.Vector3, THREE.Vector3];
      readonly contactOffsets: readonly [THREE.Vector3, THREE.Vector3];
      readonly armReaches: readonly [number, number];
      readonly reachCorrections: readonly [number, number];
    },
  ): void => {
    // The shoulders lead the late draw but never detach from the torso. A
    // small catch protraction shortens the reach to a long handle; the finish
    // reverses it into a relaxed scapular set rather than folding the hands
    // through the jersey.
    const shoulderSpread = 0.25 + shoulderSet * 0.014;
    const shoulderHeight = 0.58 + (1 - shoulderSet) * 0.006 - shoulderSet * 0.008;
    const shoulderReach = 0.015 + (1 - handleTravel) * 0.028 - shoulderSet * 0.018;
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i];
      if (!arm) continue;
      const shoulderOverride = v4Refinement?.shoulders[i];
      if (shoulderOverride) {
        arm.shoulderPoint.copy(shoulderOverride);
      } else {
        arm.shoulderPoint
          .set(arm.side * shoulderSpread, shoulderHeight, shoulderReach)
          .applyQuaternion(torso.quaternion)
          .add(torso.position);
      }
      const oar = oars[i];
      if (!oar) continue;
      // Preserve the graph-authored sweep as the preferred solution, but make
      // the rigid inboard lever meet a long arm until the late draw. This is
      // the 3D equivalent of the Canvas closed-chain reach floor.
      // `armDraw` is the graph's late eased channel. Consume it directly so
      // the close spans the full anatomical draw without stacking another
      // easing curve that would accelerate the middle of the pull.
      const draw = THREE.MathUtils.clamp(armDraw, 0, 1);
      // V4 refinement supplies the sampled shoulder and its structural
      // shoulder-to-wrist reach. The sampled wrist-to-palm offset is applied
      // separately below, so the solve neither double-counts the hand nor
      // manufactures an early elbow fold.
      const activeArmReach =
        v4Refinement?.armReaches[i] ?? Math.max(BASE_ARM_REACH, contactArmReach);
      const activeUpperArmLength = activeArmReach * UPPER_ARM_SHARE;
      const activeForearmLength = activeArmReach - activeUpperArmLength;
      // Finish at a realistic lower-rib draw. Public sculling coaching (e.g.
      // British Rowing / Concept2): hands draw *to the lower chest*, elbows
      // tuck beside/slightly behind the shoulder plane — never hauled through
      // the torso into an illegal behind-the-back finish.
      //
      // The armDraw channel is the only velocity profile in this chain: it
      // schedules the elbow's interior flexion affinely from the soft
      // long-arm unlock to the measured production finish fold, the law of
      // cosines converts that flexion into the requested shoulder→wrist
      // reach, and the rigid-oar solve places the handle on that shrinking
      // reach sphere. During the leg drive (draw = 0) this is the soft
      // long-arm reach boundary — elbows unlocked, never at the straight
      // singularity where mm-scale IK settling reads as an onset pop — so
      // the fixed oarlock still sweeps the handles while the arms stay
      // long; as the channel opens, the arm folds at constant angular
      // velocity with C2-flat ends inherited from the channel. The former
      // reach-relaxation smoothstep and boundary→staged yaw blend re-eased
      // this path twice and compressed the visible pull into ~3 frames.
      const requestedReach =
        requestedRowerWristReach(activeArmReach, draw) - (v4Refinement?.reachCorrections[i] ?? 0);
      const solvedYaw = solveRowerOarYaw(
        v4Refinement?.reachOrigins[i] ?? arm.shoulderPoint,
        oar.group.position.x - rower.position.x,
        oar.group.position.y - rower.position.y,
        oar.group.position.z - rower.position.z,
        oar.handleAnchor.position.x,
        oar.group.rotation.z,
        requestedReach,
        oar.side * (OAR_YAW_CATCH + draw * OAR_YAW_SPAN),
        true,
      );
      oar.group.rotation.y = solvedYaw;
      // Convert the oar-local grip endpoint into rower-local coordinates. Both
      // objects share the avatar group as parent, so this is exact even before
      // Three updates matrixWorld for the draw.
      handlePoint.copy(oar.handleAnchor.position).applyQuaternion(oar.group.quaternion);
      handlePoint.add(oar.group.position).sub(rower.position);
      arm.handTarget.copy(handlePoint);
      arm.wristTarget.copy(handlePoint);
      const v4ContactOffset = v4Refinement?.contactOffsets[i];
      if (v4ContactOffset) arm.wristTarget.sub(v4ContactOffset);
      // A sculling elbow follows its handle line principally aft (British
      // Rowing technique) once the arm actually bends. The solver schedules
      // its own plane authority from the flexion the reach demands: a long
      // early-drive arm keeps its relaxed hang (no forced down vector at the
      // near-straight singularity), and the aft draw takes over smoothly as
      // the handle comes to the ribs. The corridor remains a lateral safety
      // clamp, not the desired pose.
      solveRowerArm(
        arm.shoulderPoint,
        arm.wristTarget,
        activeUpperArmLength,
        activeForearmLength,
        arm.side,
        arm.elbowPoint,
        arm.handPoint,
        arm.bendHint,
      );
      arm.shoulder.position.copy(arm.shoulderPoint);
      placeFigureSegmentBetween(arm.upper, arm.shoulderPoint, arm.elbowPoint);
      placeFigureSegmentBetween(arm.forearm, arm.elbowPoint, arm.handPoint);
      arm.elbow.position.copy(arm.elbowPoint);
      orientElbowCuff(arm.elbow, arm.shoulderPoint, arm.elbowPoint, arm.handPoint, arm.side);
      // The visible V4 target is the grip-channel centre, not the wrist bone.
      // Keep the hidden anatomical solve at the wrist while the terminal
      // hand marker remains exactly on the rigid grip.
      arm.hand.position.copy(arm.handTarget);
      // Build the full sculling grip frame from the equipment: the hand's
      // authored curl axis lies along the rubber, signed so the thumb faces
      // the flat handle end. The free spin about the shaft is the wrist's
      // flexion, so resolve it by laying the hand's long axis on the solved
      // forearm — Concept2's "wrists should be flat" made literal. The old
      // reference was a fixed world-down that claimed "knuckles up / flat
      // wrist" while actually pointing the FINGERS at the floor: with a
      // horizontal forearm that cocks the wrist ~60° at every phase of the
      // stroke (measured 56–71°, spiking to 121° at the finish). The oar's
      // feathering roll about its own shaft still cancels out, so the handle
      // rolls inside the fingers instead of twisting the wrist with it.
      GRIP_SHAFT_SCRATCH.set(-oar.side, 0, 0).applyQuaternion(oar.group.quaternion);
      // Baseline: the legacy stable down-reference. It is never singular, so
      // it anchors continuity through the feather; on its own it cocks the
      // wrist ~60°, which the flat-wrist roll below removes.
      GRIP_ROLL_SCRATCH.set(0, -1, 0);
      orientHandToGripChannel(
        arm.hand,
        oar.side,
        ROWER_SCULL_GRIP.radius,
        GRIP_SHAFT_SCRATCH,
        GRIP_ROLL_SCRATCH,
        oar.group.quaternion,
      );
      // Flat wrist as an explicit extra roll about the shaft: rotate the
      // hand's long axis onto the forearm (Concept2: "wrists should be
      // flat"), weighted to zero through the feather window where the forearm
      // crosses the handle line and the projected target spins. An angle
      // scaled by the weight cannot flip through zero the way a blended
      // reference vector can, so continuity survives the window edges; the
      // brief wrist flex left at the extraction is how a real feather reads.
      GRIP_ROLL_SCRATCH.set(
        arm.handPoint.x - arm.elbowPoint.x,
        arm.handPoint.y - arm.elbowPoint.y,
        arm.handPoint.z - arm.elbowPoint.z,
      ).normalize();
      GRIP_FOREARM_SCRATCH.copy(GRIP_ROLL_SCRATCH);
      const foreAcrossShaft = GRIP_FOREARM_SCRATCH.addScaledVector(
        GRIP_SHAFT_SCRATCH,
        -GRIP_FOREARM_SCRATCH.dot(GRIP_SHAFT_SCRATCH),
      ).length();
      const flatWristWeight =
        pendingFlatWristWindow * THREE.MathUtils.smoothstep(foreAcrossShaft, 0.12, 0.3);
      if (flatWristWeight > 1e-4) {
        handLongAxis(oar.side, GRIP_LONG_SCRATCH).applyQuaternion(arm.hand.quaternion);
        GRIP_LONG_SCRATCH.addScaledVector(
          GRIP_SHAFT_SCRATCH,
          -GRIP_LONG_SCRATCH.dot(GRIP_SHAFT_SCRATCH),
        );
        if (GRIP_LONG_SCRATCH.lengthSq() > 1e-8 && GRIP_FOREARM_SCRATCH.lengthSq() > 1e-8) {
          GRIP_LONG_SCRATCH.normalize();
          const flatCos = THREE.MathUtils.clamp(GRIP_LONG_SCRATCH.dot(GRIP_FOREARM_SCRATCH), -1, 1);
          const flatSin = GRIP_LONG_SCRATCH.cross(GRIP_FOREARM_SCRATCH).dot(GRIP_SHAFT_SCRATCH);
          const flatAngle = Math.atan2(flatSin, flatCos);
          // atan2 wraps at ±π, and inside the feather window the flat target
          // passes near-antiparallel to the baseline — a raw θ·w would jump
          // by 2π·w across the wrap. Fade the blend out as |θ| approaches π
          // so the applied roll goes smoothly to zero on BOTH sides of the
          // wrap; a near-antiparallel target only occurs inside the window
          // where the baseline is the wanted pose anyway.
          const wrapGuard = THREE.MathUtils.smoothstep(Math.PI - Math.abs(flatAngle), 0.15, 0.6);
          arm.hand.quaternion.premultiply(
            GRIP_SPIN_SCRATCH.setFromAxisAngle(
              GRIP_SHAFT_SCRATCH,
              flatAngle * flatWristWeight * wrapGuard,
            ),
          );
        }
      }
      // The roll above reaches the flattest wrist the square hold permits,
      // but the swept handle leaves a 40-60° floor; close the rest with the
      // sculler's diagonal hold, faded by the same feather-window weight.
      GRIP_ROLL_SCRATCH.set(
        arm.handPoint.x - arm.elbowPoint.x,
        arm.handPoint.y - arm.elbowPoint.y,
        arm.handPoint.z - arm.elbowPoint.z,
      );
      refineGripTiltForWrist(
        arm.hand,
        oar.side,
        GRIP_ROLL_SCRATCH,
        ROWER_PALM_TILT_COMFORT,
        ROWER_PALM_TILT,
        flatWristWeight,
      );
    }
  };

  const placeLegs = (legExtension: number): void => {
    for (const leg of legs) {
      // Hip is fixed relative to the rower group.
      leg.hipPoint.set(leg.side * 0.13, hips.position.y, hips.position.z);
      // The plate is in BOAT space, while these limbs live in the translating
      // rower group. Subtract the slide so the world foot contact stays fixed.
      leg.footTarget.set(
        leg.side * ROWER_FOOT_CONTACT.lateral,
        ROWER_FOOT_CONTACT.y - rower.position.y,
        ROWER_FOOT_CONTACT.z - rower.position.z,
      );
      // Keep the knees above the recessed cockpit without spreading them over
      // the gunwales. The old, wider/high marker made the leg chain read as a
      // separate object laid across the shell instead of a seated rower.
      leg.bendHint.set(
        leg.side * (0.22 - legExtension * 0.08),
        0.35 - legExtension * 0.2,
        leg.footTarget.z - 0.04 - legExtension * 0.2,
      );
      solveTwoBone3D(
        leg.hipPoint,
        leg.footTarget,
        THIGH_LENGTH,
        SHIN_LENGTH,
        leg.bendHint,
        leg.kneePoint,
        leg.footPoint,
      );
      placeFigureSegmentBetween(leg.thigh, leg.hipPoint, leg.kneePoint);
      placeFigureSegmentBetween(leg.shin, leg.kneePoint, leg.footPoint);
      // makeFoot() is a fixed-size shoe, not a unit-length segment — running
      // it through placeSegmentBetween()'s 1×1×length scale would crush it to
      // a sliver. Place it directly at the heel/ankle with the shoe sole
      // pitched slightly downward into the stretcher.
      leg.foot.position.copy(leg.footPoint);
      leg.foot.rotation.set(
        THREE.MathUtils.lerp(
          ROWER_STRETCHER.shoeCatchPitch,
          ROWER_STRETCHER.shoeFinishPitch,
          legExtension,
        ),
        0,
        0,
      );
      leg.foot.scale.set(1, 1, 1);
      leg.knee.position.copy(leg.kneePoint);
    }
  };

  const placeUpperBody = (
    bodySwing: number,
    shoulderSet: number,
    handleTravel: number,
    headBob: number,
  ): void => {
    // Rotate and translate only the upper-body pieces around the hips. Rotating
    // the whole rower group would also rotate the contact-locked feet and hands.
    // The pelvis, spine, clavicles, and head read from the same graph, so the
    // final arm draw no longer makes a rigid torso appear to leave its rider.
    const pitch = BODY_PITCH_CATCH + bodySwing * (BODY_PITCH_FINISH - BODY_PITCH_CATCH);
    const pelvisPitch =
      PELVIS_PITCH_CATCH +
      bodySwing * (PELVIS_PITCH_FINISH - PELVIS_PITCH_CATCH) +
      (shoulderSet - bodySwing) * 0.025;
    hips.rotation.x = pelvisPitch;
    // A restrained rearward settle gives the spine a living handoff at the
    // finish while increasing, rather than reducing, the jersey/handle margin.
    torso.position.set(
      0,
      hips.position.y + shoulderSet * 0.008,
      hips.position.z - shoulderSet * 0.014,
    );
    torso.rotation.x = pitch + (shoulderSet - bodySwing) * 0.025;
    shoulderLine.position.set(0, 0.53 - shoulderSet * 0.008, 0.01 - shoulderSet * 0.014);
    shoulderLine.rotation.x = shoulderSet * 0.07;
    neck.position.set(0, 0.67 - shoulderSet * 0.004, 0.015 - shoulderSet * 0.006);
    neck.rotation.x = -pitch * 0.08;
    // Counter-pitch preserves a down-course gaze through the catch and the
    // finish. `headBob` is an expressive local cue, not an invented change to
    // the athlete's recorded body position.
    headGroup.position.set(
      0,
      0.79 + headBob * 0.038 - shoulderSet * 0.004,
      0.025 + (1 - handleTravel) * 0.009 - shoulderSet * 0.008,
    );
    headGroup.rotation.x = -pitch * 0.32 - 0.02 + headBob * 0.12;
  };

  const placeOars = (handleTravel: number, bladeDepth: number, bladeFeather: number): void => {
    // The graph carries the staged leg → body → arm handle path directly.
    // Keeping the oar sweep on this cue makes the equipment and athlete reach
    // agree without reconstructing another, subtly different sequence here.
    const handleProgress = handleTravel;
    for (const oar of oars) {
      oar.group.rotation.y = oar.side * (OAR_YAW_CATCH + handleProgress * OAR_YAW_SPAN);
      // Both blade tips dip together despite opposite X signs. The bladeWater
      // channel buries the spoon for the whole loaded drive; the small extra
      // draw roll lifts the inboard grips a few centimetres toward the finish
      // without lifting the oarlocks or digging the spoon.
      oar.group.rotation.z =
        -oar.side * (bladeDepth * BLADE_DIP + handleProgress * HANDLE_RISE_ROLL);
      // The oarlock is a hull-fixed fulcrum. Moving this parent to bury the
      // blade made every drive visibly detach the shaft from its rigger; the
      // existing rotation supplies immersion while the real pivot stays put.
      oar.group.position.y = ROWER_OARLOCK.y;
      // The blade squares for catch/drive, feathers flat through recovery, then
      // squares again continuously before the next catch.
      oar.blade.rotation.x = (1 - bladeFeather) * (Math.PI / 2);
    }
  };

  const animate = (phase: number, reduce: boolean, pose?: StrokePose): AvatarMotionCues => {
    const resolvedPose = reduce
      ? REDUCED_REPLAY_POSES.rower
      : (pose ?? fallbackStrokePose("rower", phase));
    const graph = sampleRowerMotionGraphInto(resolvedPose, rowMotionGraph);
    // Seat motion follows leg extension only; body swing and arm draw happen on
    // their later staged channels, eliminating the old one-cosine puppet motion.
    rower.position.z = SEAT_CATCH_Z + graph.body.pelvisTravel.value * SEAT_TRAVEL;
    rower.position.y = reduce ? 0 : graph.accents.vertical.value * 0.03;
    rower.rotation.set(0, 0, 0);
    const graphHandleTravel = graph.body.handleTravel.value;
    // The oarlock is fixed to the shell. During the leg drive the athlete
    // slides away from a nearly stationary catch handle; the late arm-draw
    // channel is the equipment cue that moves the handle aft toward the
    // chest. Using the aggregate handle channel here would include its leg
    // contribution and pull the grip through the knees and torso too early.
    // The graph's armDraw channel is consumed verbatim: it is the single
    // authored velocity profile for the pull (C2-flat cruise over the
    // widened 0.68–0.995 drive window), and stacking another smoothstep on
    // top of it re-compressed the visible draw into ~3 frames — the finish
    // teleport this rework removes. The graph already opens the channel only
    // after the legs have finished driving, so the raised grips travel above
    // the flat knee envelope without a renderer-side gate.
    const equipmentHandleTravel = graph.body.armDraw.value;
    placeUpperBody(
      graph.body.spineHinge.value,
      graph.body.shoulderSet.value,
      graphHandleTravel,
      graph.body.headBob.value,
    );
    placeOars(
      equipmentHandleTravel,
      graph.contacts.bladeWater.value,
      graph.contacts.bladeFeather.value,
    );
    placeLegs(graph.body.legExtension.value);
    const warpedCycle = THREE.MathUtils.euclideanModulo(
      resolvedPose.warpedPhase / (2 * Math.PI),
      1,
    );
    pendingFlatWristWindow =
      (1 -
        (THREE.MathUtils.smoothstep(warpedCycle, 0.475, 0.53) -
          THREE.MathUtils.smoothstep(warpedCycle, 0.555, 0.61))) *
      // The wrist also yields slightly at the deepest catch reach: holding
      // the hand perfectly flat there demands ~4 mm more reach than the arm
      // has, which surfaced as a 5.8 mm grip-channel gap at one recovery
      // sample. A human reaching full stretch lets the hand follow the
      // handle line; both edges of the dip rejoin 1 so the catch itself
      // stays flat.
      (1 -
        0.35 *
          (THREE.MathUtils.smoothstep(warpedCycle, 0.8, 0.88) -
            THREE.MathUtils.smoothstep(warpedCycle, 0.98, 1)));
    pendingBodySwing = graph.body.spineHinge.value;
    pendingArmDraw = equipmentHandleTravel;
    pendingShoulderSet = graph.body.shoulderSet.value;
    pendingHandleTravel = equipmentHandleTravel;
    placeArms(pendingBodySwing, pendingArmDraw, pendingShoulderSet, pendingHandleTravel);
    return reduce
      ? STATIC_AVATAR_MOTION
      : {
          vertical: graph.accents.vertical.value,
          surge: graph.accents.surge.value,
          // Two buried spoons act as water-locked outriggers: a real scull is
          // roll-stabilised for exactly the part of the stroke when the
          // blades are in the water. Undamped hull roll swings the 2.97 m
          // levers enough to porpoise the loaded blade back out of the water.
          rollDamp: 1 - 0.8 * graph.contacts.bladeWater.value,
        };
  };

  const [leftArm, rightArm] = arms;
  const [leftLeg, rightLeg] = legs;
  if (!leftArm || !rightArm || !leftLeg || !rightLeg) {
    throw new Error("RowErg V4 target rig is incomplete");
  }
  const v4ArmRefinement = {
    shoulders: sampledV4Shoulders,
    reachOrigins: sampledV4ReachOrigins,
    contactOffsets: sampledV4ContactOffsets,
    armReaches: sampledV4ArmReaches,
    reachCorrections: sampledV4ReachCorrections,
  } as const;
  const sampleV4ArmRefinement = (motion: ReplayV4MotionController): void => {
    motion.getShoulderWorld("left", sampledV4Shoulders[0]);
    motion.getShoulderWorld("right", sampledV4Shoulders[1]);
    motion.getHandContactOffsetWorld("left", sampledV4ContactOffsets[0]);
    motion.getHandContactOffsetWorld("right", sampledV4ContactOffsets[1]);
    sampledV4ReachOrigins[0].copy(sampledV4Shoulders[0]).add(sampledV4ContactOffsets[0]);
    sampledV4ReachOrigins[1].copy(sampledV4Shoulders[1]).add(sampledV4ContactOffsets[1]);
    sampledV4ArmReaches[0] = motion.getArmReach("left");
    sampledV4ArmReaches[1] = motion.getArmReach("right");
    // The sampled bones and procedural authority live below the same avatar
    // parent, but RowErg limbs are authored in the translating seat frame.
    // Convert the real V4 shoulders into that frame before solving the fixed
    // oar-pin circles and shared elbow branch markers.
    rower.worldToLocal(sampledV4Shoulders[0]);
    rower.worldToLocal(sampledV4Shoulders[1]);
    rower.worldToLocal(sampledV4ReachOrigins[0]);
    rower.worldToLocal(sampledV4ReachOrigins[1]);
    sampledV4ContactOffsets[0].copy(sampledV4ReachOrigins[0]).sub(sampledV4Shoulders[0]);
    sampledV4ContactOffsets[1].copy(sampledV4ReachOrigins[1]).sub(sampledV4Shoulders[1]);
  };
  const refineV4Targets = (motion: ReplayV4MotionController): void => {
    motion.getLegJointTargetWorld("left", sampledV4Knees[0]);
    motion.getLegJointTargetWorld("right", sampledV4Knees[1]);
    rower.worldToLocal(sampledV4Knees[0]);
    rower.worldToLocal(sampledV4Knees[1]);
    // The authored V4 lower body has its own segment proportions. Use the
    // same constrained two-bone solve to derive its knee marker rather than
    // asking that chain to imitate the shorter procedural fallback leg.
    leftLeg.knee.position.copy(sampledV4Knees[0]);
    rightLeg.knee.position.copy(sampledV4Knees[1]);
    // The first rigid-oar solve changes the full grip-channel frame. Settle the
    // prepared arm onto it, then measure how far that post-IK frame exceeds the
    // structural wrist sphere. The second solve cancels only that excess;
    // otherwise recovery retains the clip wrist offset and reopens centimetres
    // of contact.
    sampledV4ReachCorrections[0] = 0;
    sampledV4ReachCorrections[1] = 0;
    sampleV4ArmRefinement(motion);
    placeArms(
      pendingBodySwing,
      pendingArmDraw,
      pendingShoulderSet,
      pendingHandleTravel,
      v4ArmRefinement,
    );
    if (!motion.settleHandContacts()) return;
    sampleV4ArmRefinement(motion);
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i];
      if (!arm) continue;
      arm.wristTarget.copy(arm.handTarget).sub(sampledV4ContactOffsets[i]);
      sampledV4ReachCorrections[i] = Math.max(
        0,
        arm.wristTarget.distanceTo(sampledV4Shoulders[i]) - (sampledV4ArmReaches[i] - 0.002),
      );
    }
    if (!motion.restoreHandPoseAfterSettle()) return;
    placeArms(
      pendingBodySwing,
      pendingArmDraw,
      pendingShoulderSet,
      pendingHandleTravel,
      v4ArmRefinement,
    );
  };
  finalizeAvatar(group, castShadow, opacity);
  const rowerAvatar: Avatar = {
    group,
    animate,
    refineV4Targets,
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
  return rowerAvatar;
}

/**
 * Low-poly SkiErg skier: a standing athlete on skis, double-poling. Skis, vest
 * and pole baskets carry `userData.accent`; the upper body crunches forward and
 * both poles swing fore/aft together on each pull.
 */
