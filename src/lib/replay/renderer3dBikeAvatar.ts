/**
 * BikeErg avatar: frame, wheels, drivetrain, saddle and bars plus the seated
 * athlete, and the crank-phase placement the course renderer calls.
 *
 * Built on `renderer3dAvatarKit` and the true-scale measurements in `bikeRig`,
 * whose `handlebar.hood` is the authority for both the rendered hood and the
 * hand contact solved against it.
 */
import * as THREE from "three";
import { roundedVenueBlockGeometry } from "./renderer3dVenueKit";
import { REDUCED_REPLAY_POSES } from "./renderer";
import { fallbackStrokePose, type StrokePose } from "./strokeModel";
import {
  createBikeMotionGraphScratch,
  sampleBikeMotionGraphInto,
  type BikeMotionGraph,
} from "./motionGraph";
import { BIKE_RIG, bikeSaddleTopY, bikeWheelAxleY } from "./bikeRig";
import { buildBikeSaddleGeometry } from "./bikeSaddle";
import type { Sport } from "../types";
import { solveTwoBone3D } from "./figurePose";
import { orientHandToGripChannel } from "./handGrip";
import {
  hideWithReplayAssets,
  setReplayAssetSlot,
  setReplayAssetTemplateAnchor,
} from "./renderer3dAssets";
import { type ReplayV4MotionController, type ReplayV4SeatContract } from "./renderer3dV4Motion";
import {
  GRIP_ROLL_SCRATCH,
  GRIP_SHAFT_SCRATCH,
  HUMAN_HAIR,
  HUMAN_KIT,
  HUMAN_KIT_DARK,
  HUMAN_SHOE,
  HUMAN_SKIN,
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
  makeFoot,
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

export const BIKE_HOOD_QUAT = new THREE.Quaternion();
export const BIKE_HOOD_AXIS_X = new THREE.Vector3(1, 0, 0);
/** Chainring pitch radius (≈50T) in the shared metric bike space. */
export const CHAINRING_RADIUS = 0.098;
/** Rear sprocket pitch radius (≈17T). */
export const COG_RADIUS = 0.043;
/** Drive-side chainline offset from the frame centreline. */
export const CHAIN_X = -0.045;
/**
 * Centreline of a chain wrapped around two sprockets, as a closed loop.
 *
 * A chain is two external tangents plus the arcs it wraps, so this solves for
 * the tangent contact angle rather than drawing a straight line between two
 * eyeballed points. `beta` is the tilt of the tangent caused by the sprockets
 * having different radii; at equal radii it collapses to zero and the tangents
 * are parallel to the centre line, as they should be.
 */
export function bikeChainPath(
  ring: { y: number; z: number },
  ringRadius: number,
  cog: { y: number; z: number },
  cogRadius: number,
  x: number,
): THREE.Vector3[] {
  const dz = cog.z - ring.z;
  const dy = cog.y - ring.y;
  const span = Math.hypot(dz, dy);
  const alpha = Math.atan2(dy, dz);
  const beta = Math.asin(Math.max(-1, Math.min(1, (ringRadius - cogRadius) / span)));
  const tangent = Math.PI / 2 - beta;
  // Increasing angle runs the loop the correct way round both sprockets: over
  // the top of the chainring's front, back along the top run, around the rear
  // of the cog, and forward along the bottom run.
  const ringLow = alpha + tangent;
  const ringHigh = alpha - tangent + Math.PI * 2;
  const points: THREE.Vector3[] = [];
  const arc = (
    centre: { y: number; z: number },
    radius: number,
    from: number,
    to: number,
    steps: number,
  ): void => {
    for (let i = 0; i <= steps; i++) {
      const angle = from + ((to - from) * i) / steps;
      points.push(
        new THREE.Vector3(
          x,
          centre.y + radius * Math.sin(angle),
          centre.z + radius * Math.cos(angle),
        ),
      );
    }
  };
  arc(ring, ringRadius, ringLow, ringHigh, 14);
  arc(cog, cogRadius, alpha - tangent, alpha + tangent, 10);
  return points;
}
/**
 * Seat contract for the V4 controller, in avatar-group-local space.
 *
 * Only BikeErg has one: the rower sits on a sliding seat their pelvis marker
 * already tracks exactly, and the skier stands. Returning `undefined` for those
 * leaves their pelvis alignment exact rather than merely bounded.
 */
export function bikeSeatContract(sport: Sport): ReplayV4SeatContract | undefined {
  if (sport !== "bike") return undefined;
  return {
    padTopY: bikeSaddleTopY(BIKE_RIG),
    sitSurfaceOffsetY: BIKE_RIG.rider.sitSurfaceFromHip[1] ?? -0.2,
    nestle: BIKE_RIG.rider.sitNestle ?? 0.005,
    // The clip's own hip pitch is the only thing this absorbs; anything larger
    // means the rig and the saddle have genuinely drifted apart.
    maxLift: 0.08,
  };
}
/**
 * Low-poly BikeErg cyclist: a rider in an aero tuck on a two-wheeled frame.
 * Frame, wheel spokes and jersey carry `userData.accent`; the wheels roll, the
 * cranks turn and the rider's thighs pedal in opposition.
 */
export function makeBikeAvatar(
  accent: number,
  castShadow: boolean,
  opacity = 1,
  bodySegments = 16,
): Avatar {
  const segs = bodySegments;
  const capSegs = Math.max(10, Math.round(segs * 0.82));
  const headSegs = Math.max(14, segs + 2);
  const eqCylSegs = Math.max(12, Math.round(segs * 0.7));
  const group = new THREE.Group();
  // Retained by this avatar only; sampling must not couple live and ghost rigs.
  const bikeMotionGraph = createBikeMotionGraphScratch();
  const laneMaterial = accentEquipmentMaterial(accent);
  const jerseyMaterial = accentMaterial(accent);
  const accentMat = () => laneMaterial;
  const skinMaterial = makeSkinMaterial(HUMAN_SKIN);
  const hairMaterial = makeHairMaterial(HUMAN_HAIR);
  const kitMaterial = humanMat(HUMAN_KIT, 0.58);
  const kitDarkMaterial = humanMat(HUMAN_KIT_DARK, 0.64);
  const shoeMaterial = humanMat(HUMAN_SHOE, 0.46);
  // Vulcanised rubber is nearly black and almost fully diffuse. The old tyre
  // was a mid blue-grey at roughness 0.4 with a touch of metalness, which is
  // why the wheels read as moulded plastic no matter how good the shape was.
  const tyreMaterial = humanMat(0x17191b, 0.95, 0);
  // Bar tape and hoods: matte, slightly warmer than the tyre so the two dark
  // materials stay separable where the hand meets the bar.
  const equipmentMaterial = humanMat(0x24282c, 0.88, 0.02);
  // Butted stainless spokes and a machined rim — bright, but not chrome.
  const spokeMaterial = humanMat(0xb9c2c9, 0.34, 0.72);
  const hubMaterial = humanMat(0x2b3238, 0.42, 0.55);
  // A black saddle is realistic and unreadable: it merges with both the dark
  // kit above it and the dark track behind it, which is how "is the rider
  // actually on the seat?" became impossible to answer by eye. A grey-topped
  // saddle keeps the semantic contrast rule and makes the contact legible.
  const saddleMaterial = humanMat(0x9aa2a8, 0.66, 0.04);
  // Alloy crank and clipless body: darker and rougher than the spokes.
  const crankMaterial = humanMat(0x8f979d, 0.44, 0.7);
  const pedalMaterial = humanMat(0x2a2e32, 0.6, 0.35);
  // A chain is oiled steel: darker than bare alloy, and glossier than the
  // frame because the oil film is what catches the light.
  const chainMaterial = humanMat(0x6d7278, 0.38, 0.86);
  const resolveAssetMaterial = makeAssetMaterialResolver({
    "athlete-skin": skinMaterial,
    "athlete-fabric": jerseyMaterial,
    "athlete-hair": hairMaterial,
    "athlete-footwear": shoeMaterial,
    "equipment-painted": laneMaterial,
    "equipment-dark": hubMaterial,
    "equipment-light": equipmentMaterial,
    "equipment-metal": spokeMaterial,
    "equipment-rubber": tyreMaterial,
    "equipment-grip": equipmentMaterial,
    "equipment-trim": saddleMaterial,
  });
  const wheelR = BIKE_RIG.wheelRadius;
  const tyreTube = BIKE_RIG.tyreTube;
  // Axle height includes tyre tube so the outer shell rests on y = 0 — never
  // through the ground (穿模).  Bike has two equal wheels; both touch the
  // ground plane without clipping through it.
  const wheelAxleY = bikeWheelAxleY(BIKE_RIG);
  const wheels: THREE.Group[] = [];
  for (const z of [BIKE_RIG.frontAxleZ, BIKE_RIG.rearAxleZ]) {
    const wheel = new THREE.Group();
    wheel.name = z > 0 ? "bike-wheel-front" : "bike-wheel-rear";
    const tyre = setReplayAssetSlot(
      new THREE.Mesh(
        new THREE.TorusGeometry(wheelR, tyreTube, eqCylSegs, eqCylSegs * 2),
        tyreMaterial,
      ),
      "equipment:bike:tyre",
    );
    tyre.rotation.y = Math.PI / 2; // axle along X (perpendicular to travel)
    wheel.add(tyre);
    const wheelFallback: THREE.Object3D[] = [tyre];
    // Nine spoke pairs — eighteen visible arms, the density that reads as a
    // laced wheel at chase distance without paying for a real 32-spoke lacing.
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI;
      const spoke = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0022, 0.0022, wheelR * 1.94, eqCylSegs),
        spokeMaterial,
      );
      spoke.name = `${wheel.name}-spoke-${i}`;
      spoke.rotation.x = angle;
      wheel.add(spoke);
      wheelFallback.push(spoke);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.1, 12), hubMaterial);
    hub.name = `${wheel.name}-hub`;
    hub.rotation.z = Math.PI / 2;
    wheel.add(hub);
    wheelFallback.push(hub);
    const wheelVisual = new THREE.Group();
    wheelVisual.name = z > 0 ? "bike-wheel-visual-front" : "bike-wheel-visual-rear";
    wheel.add(wheelVisual);
    setReplayAssetTemplateAnchor(wheelVisual, "equipment:bike:wheel-assembly", {
      fallback: wheelFallback,
    });
    wheel.position.set(0, wheelAxleY, z);
    group.add(wheel);
    wheels.push(wheel);
  }

  // Clean diamond frame — down tube, seat tube, top tube, and head tube form
  // the main triangle.  Paired chain- and seat-stays complete the rear end.
  const bottomBracket = {
    x: 0,
    y: BIKE_RIG.bottomBracket[1] ?? 0,
    z: BIKE_RIG.bottomBracket[2] ?? -0.05,
  };
  const seatCluster = {
    x: 0,
    y: BIKE_RIG.seatCluster[1] ?? 0,
    z: BIKE_RIG.seatCluster[2] ?? -0.24,
  };
  const headBottom = { x: 0, y: BIKE_RIG.headBottom[1] ?? 0, z: BIKE_RIG.headBottom[2] ?? 0.38 };
  const headTop = { x: 0, y: BIKE_RIG.headTop[1] ?? 0, z: BIKE_RIG.headTop[2] ?? 0.34 };
  const frameFallback: THREE.Object3D[] = [];
  // Real road tubing: ~35 mm down tube tapering to ~28 mm stays. The previous
  // 55 mm tubes were sized for a bike half again too big and read as scaffolding.
  const downTube = accentPart(
    tubeBetween("bike-down-tube", bottomBracket, headBottom, 0.0185, accentMat()),
  );
  setReplayAssetSlot(downTube, "equipment:bike:frame-tube");
  const seatTube = accentPart(
    tubeBetween("bike-seat-tube", bottomBracket, seatCluster, 0.0165, accentMat()),
  );
  setReplayAssetSlot(seatTube, "equipment:bike:frame-tube");
  const topTube = accentPart(
    tubeBetween("bike-top-tube", seatCluster, headTop, 0.015, accentMat()),
  );
  setReplayAssetSlot(topTube, "equipment:bike:frame-tube");
  const headTube = accentPart(
    tubeBetween("bike-head-tube", headBottom, headTop, 0.021, accentMat()),
  );
  setReplayAssetSlot(headTube, "equipment:bike:frame-tube");
  group.add(downTube, seatTube, topTube, headTube);
  frameFallback.push(downTube, seatTube, topTube, headTube);
  for (const side of [-1, 1]) {
    const rearAxle = { x: side * 0.055, y: wheelAxleY, z: BIKE_RIG.rearAxleZ };
    const bbSide = { ...bottomBracket, x: side * 0.036 };
    const seatSide = { ...seatCluster, x: side * 0.026 };
    const chainStay = accentPart(
      tubeBetween("bike-chain-stay", rearAxle, bbSide, 0.0115, accentMat()),
    );
    const seatStay = accentPart(
      tubeBetween("bike-seat-stay", rearAxle, seatSide, 0.0095, accentMat()),
    );
    setReplayAssetSlot(chainStay, "equipment:bike:frame-tube");
    setReplayAssetSlot(seatStay, "equipment:bike:frame-tube");
    group.add(chainStay, seatStay);
    frameFallback.push(chainStay, seatStay);
    // Fork blades run from the crown down to the axle, so the front wheel is
    // carried on the steering axis rather than hung off a single raked spar.
    const frontAxlePt = { x: side * 0.048, y: wheelAxleY, z: BIKE_RIG.frontAxleZ };
    const crown = { x: side * 0.022, y: headBottom.y - 0.012, z: headBottom.z + 0.004 };
    const forkBlade = accentPart(
      tubeBetween(
        `bike-fork-blade-${side > 0 ? "right" : "left"}`,
        crown,
        frontAxlePt,
        0.0115,
        accentMat(),
      ),
    );
    setReplayAssetSlot(forkBlade, "equipment:bike:frame-tube");
    group.add(forkBlade);
    frameFallback.push(forkBlade);
  }

  // Cranks: spin about the bottom bracket (X axis) with two pedals.
  const cranks = new THREE.Group();
  cranks.name = "bike-cranks";
  cranks.position.set(bottomBracket.x, bottomBracket.y, bottomBracket.z);
  // Chain ring — a toroidal disc at the bottom bracket.
  const chainRing = new THREE.Mesh(
    new THREE.TorusGeometry(CHAINRING_RADIUS, 0.006, eqCylSegs, eqCylSegs * 2),
    chainMaterial,
  );
  chainRing.name = "bike-chain-ring";
  chainRing.rotation.y = Math.PI / 2;
  cranks.add(chainRing);
  const drivetrainFallback: THREE.Object3D[] = [chainRing];
  const pedals: Array<{ side: number; crankY: number }> = [];
  for (const side of [-1, 1]) {
    const crankY = side * BIKE_RIG.crank.pedalRadius;
    // The arm is what makes a crank read as a crank; a pedal alone floats.
    const crankArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.017, BIKE_RIG.crank.pedalRadius, 0.03),
      crankMaterial,
    );
    crankArm.name = side < 0 ? "bike-crank-arm-left" : "bike-crank-arm-right";
    crankArm.position.set(side * 0.038, crankY / 2, 0);
    cranks.add(crankArm);
    drivetrainFallback.push(crankArm);

    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.014, 0.062), pedalMaterial);
    setReplayAssetSlot(pedal, "equipment:bike:pedal");
    pedal.name = side < 0 ? "bike-pedal-left" : "bike-pedal-right";
    pedal.position.set(side * BIKE_RIG.crank.lateral, crankY, 0);
    cranks.add(pedal);
    drivetrainFallback.push(pedal);
    pedals.push({ side, crankY });
  }
  const drivetrainVisual = new THREE.Group();
  drivetrainVisual.name = "bike-drivetrain-visual";
  cranks.add(drivetrainVisual);
  setReplayAssetTemplateAnchor(drivetrainVisual, "equipment:bike:drivetrain-assembly", {
    fallback: drivetrainFallback,
  });
  group.add(cranks);

  // Rear cassette, so the chain has something real to wrap at the back.
  const cassette = new THREE.Mesh(
    new THREE.CylinderGeometry(COG_RADIUS, COG_RADIUS, 0.026, eqCylSegs),
    chainMaterial,
  );
  cassette.name = "bike-cassette";
  cassette.rotation.z = Math.PI / 2;
  cassette.position.set(CHAIN_X, wheelAxleY, BIKE_RIG.rearAxleZ);
  group.add(cassette);
  frameFallback.push(cassette);

  // One closed chain loop that runs tangent to both sprockets and wraps them.
  // The previous chain was 48 straight tubes between two arbitrary points that
  // touched neither the chainring nor the cassette, so the drivetrain read as
  // a floating line rather than a transmission.
  const chain = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(
        bikeChainPath(
          { y: bottomBracket.y, z: bottomBracket.z },
          CHAINRING_RADIUS,
          { y: wheelAxleY, z: BIKE_RIG.rearAxleZ },
          COG_RADIUS,
          CHAIN_X,
        ),
        true,
        "centripetal",
      ),
      96,
      0.0042,
      Math.max(4, Math.round(eqCylSegs / 2)),
      true,
    ),
    chainMaterial,
  );
  chain.name = "bike-chain";
  group.add(chain);
  frameFallback.push(chain);

  // Seat post — visible tube from the seat cluster up to the saddle shell.
  // It stops at the pad underside: the rider's sit surface is one nestle above
  // the pad top, so a post that outruns the cushion goes through the athlete.
  const seatPost = tubeBetween(
    "bike-seat-post",
    seatCluster,
    { x: 0, y: BIKE_RIG.saddleClamp[1] ?? 0, z: BIKE_RIG.saddleClamp[2] ?? 0 },
    0.0135,
    accentMat(),
  );
  setReplayAssetSlot(seatPost, "equipment:bike:frame-tube");
  group.add(seatPost);
  frameFallback.push(seatPost);

  // Winged, cut-out performance saddle from the shared BIKE_SADDLE contract —
  // the same table the authored V3 pad and the penetration guard read, so the
  // cushion the tests trust is the cushion this renderer draws. Geometry
  // contact (sit surface on pad top) owns the no-穿模 contract; depthWrite
  // stays on so the cushion remains a solid support rather than a draw-order
  // band-aid over a penetrating mesh.
  const saddle = new THREE.Mesh(
    buildBikeSaddleGeometry(THREE, {
      lateralSegments: Math.max(4, Math.round(eqCylSegs / 3)),
      stationsPerSpan: bodySegments >= 16 ? 2 : 1,
    }),
    saddleMaterial,
  );
  setReplayAssetSlot(saddle, "equipment:bike:saddle");
  saddle.name = "bike-saddle";
  saddle.position.set(BIKE_RIG.saddle[0] ?? 0, BIKE_RIG.saddle[1] ?? 0, BIKE_RIG.saddle[2] ?? 0);
  group.add(saddle);
  frameFallback.push(saddle);

  // Stem — connects the handlebar to the head tube so the cockpit doesn't float.
  const stem = tubeBetween(
    "bike-stem",
    headTop,
    { x: 0, y: BIKE_RIG.handlebar.base[1] ?? 0, z: BIKE_RIG.handlebar.base[2] ?? 0 },
    0.0125,
    accentMat(),
  );
  setReplayAssetSlot(stem, "equipment:bike:frame-tube");
  group.add(stem);
  frameFallback.push(stem);

  const handlebar = new THREE.Group();
  handlebar.name = "bike-handlebar";
  const barHalfSpan = BIKE_RIG.handlebar.grip.halfSpan;
  const gripLocalY = BIKE_RIG.handlebar.grip.y - (BIKE_RIG.handlebar.base[1] ?? 0);
  const gripLocalZ = BIKE_RIG.handlebar.grip.z - (BIKE_RIG.handlebar.base[2] ?? 0);
  const crossbar = capsulePart(0.0125, barHalfSpan * 2, equipmentMaterial, "x");
  handlebar.add(crossbar);
  frameFallback.push(crossbar);
  const barContacts: Array<{ side: number; anchor: THREE.Object3D }> = [];
  for (const side of [-1, 1]) {
    // A drop bar, not a straight rod: the tops sweep forward into a shaped
    // hood that the palm closes over, then the drop curves down and back.
    // The hand contact anchor stays exactly on the hood, so the IK target is
    // unchanged by any of this shaping.
    const hoodCurve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(side * barHalfSpan, 0, 0),
        new THREE.Vector3(side * barHalfSpan, gripLocalY * 0.45, gripLocalZ * 0.55),
        new THREE.Vector3(side * barHalfSpan, gripLocalY, gripLocalZ),
        new THREE.Vector3(side * barHalfSpan, gripLocalY - 0.045, gripLocalZ + 0.045),
        new THREE.Vector3(side * barHalfSpan, gripLocalY - 0.115, gripLocalZ + 0.012),
      ],
      false,
      "centripetal",
    );
    const grip = new THREE.Mesh(
      new THREE.TubeGeometry(hoodCurve, 18, 0.0125, Math.max(4, Math.round(eqCylSegs / 2)), false),
      equipmentMaterial,
    );
    grip.name = side < 0 ? "bike-handlebar-grip-left" : "bike-handlebar-grip-right";

    // The hood body itself — the raised lever housing the palm rests on.
    const hood = new THREE.Mesh(
      roundedVenueBlockGeometry(
        BIKE_RIG.handlebar.hood.radius * 2,
        BIKE_RIG.handlebar.hood.radius * 2,
        0.105,
        0.016,
      ),
      equipmentMaterial,
    );
    hood.name = side < 0 ? "bike-brake-hood-left" : "bike-brake-hood-right";
    hood.position.set(side * barHalfSpan, gripLocalY + 0.012, gripLocalZ - 0.012);
    hood.rotation.x = BIKE_RIG.handlebar.hood.rotationX;

    const anchor = new THREE.Object3D();
    anchor.name = side < 0 ? "bike-hand-contact-left" : "bike-hand-contact-right";
    anchor.position.set(side * barHalfSpan, gripLocalY, gripLocalZ);
    handlebar.add(grip, hood, anchor);
    frameFallback.push(grip, hood);
    barContacts.push({ side, anchor });
  }
  handlebar.position.set(
    BIKE_RIG.handlebar.base[0] ?? 0,
    BIKE_RIG.handlebar.base[1] ?? 0,
    BIKE_RIG.handlebar.base[2] ?? 0,
  );
  group.add(handlebar);
  // The frame template leaves the explicit hand contacts in this original
  // group alone, so bar IK keeps targeting the same moving-free anchors.
  const frameVisual = new THREE.Group();
  frameVisual.name = "bike-frame-visual";
  group.add(frameVisual);
  setReplayAssetTemplateAnchor(frameVisual, "equipment:bike:frame-assembly", {
    fallback: frameFallback,
  });

  // Rider: compact human proportions in an aero lean. The jersey/helmet carry
  // the lane accent, while limbs stay skin/kit coloured so the athlete does not
  // read as a single bright toy shape.
  const rider = new THREE.Group();
  rider.position.set(
    BIKE_RIG.rider.root[0] ?? 0,
    BIKE_RIG.rider.root[1] ?? 0,
    BIKE_RIG.rider.root[2] ?? 0,
  );
  const pelvis = ellipsoid([0.175, 0.125, 0.16], kitDarkMaterial, segs);
  setReplayAssetSlot(pelvis, "athlete:pelvis");
  pelvis.name = "bike-pelvis";
  pelvis.position.set(0, 0.02, -0.01);
  const torso = new THREE.Group();
  torso.name = "bike-spine";
  torso.position.set(0, 0.02, 0.01);
  const torsoShell = accentPart(shapedTorso(0.28, 0.64, 0.17, jerseyMaterial, segs));
  setReplayAssetSlot(torsoShell, "athlete:torso");
  torsoShell.name = "bike-torso";
  torsoShell.position.set(0, 0.28, 0.04);
  // The shoulder girdle is a distinct, high-chest pivot rather than a visual
  // decal on the torso. Its small counter-rotation gives the rider a connected
  // pelvis → spine → shoulders rhythm while the arm solver still owns the
  // exact bar contacts.
  const shoulderGirdle = new THREE.Group();
  shoulderGirdle.name = "bike-shoulder-girdle";
  shoulderGirdle.position.set(0, 0.49, 0.025);
  const frontYoke = hideWithReplayAssets(trapezoidPanel(0.46, 0.32, 0.16, 0.032, kitDarkMaterial));
  frontYoke.name = "bike-jersey-front";
  frontYoke.position.set(0, 0, 0.137);
  const backYoke = hideWithReplayAssets(trapezoidPanel(0.46, 0.32, 0.16, 0.032, kitDarkMaterial));
  backYoke.name = "bike-jersey-back";
  backYoke.position.set(0, 0, -0.187);
  const shoulderLine = hideWithReplayAssets(capsulePart(0.06, 0.54, kitDarkMaterial, "x"));
  shoulderLine.name = "bike-shoulder-trim";
  shoulderLine.position.set(0, 0.02, 0);
  const neck = capsulePart(0.05, 0.1, skinMaterial, "y");
  setReplayAssetSlot(neck, "athlete:neck");
  neck.position.set(0, 0.11, 0.01);
  const headGroup = makeHead(skinMaterial, hairMaterial, headSegs);
  const headStabilizer = new THREE.Group();
  headStabilizer.name = "bike-head-stabilizer";
  headStabilizer.position.set(0, 0.11, 0.01);
  headGroup.position.set(0, 0.15, 0.035);
  // Parent the helmet to the head so sway and counter-rotation can never leave
  // it floating above the rider.
  const helmetGroup = new THREE.Group();
  helmetGroup.name = "bike-helmet";
  const helmetShell = accentPart(ellipsoid([0.132, 0.075, 0.135], accentMat(), segs));
  setReplayAssetSlot(helmetShell, "athlete:helmet");
  helmetShell.name = "bike-helmet-shell";
  helmetShell.position.set(0, 0.1, -0.018);
  helmetShell.rotation.x = -0.16;
  helmetGroup.add(helmetShell);
  headGroup.add(helmetGroup);
  headStabilizer.add(headGroup);
  shoulderGirdle.add(frontYoke, backYoke, shoulderLine, neck, headStabilizer);
  torso.add(torsoShell, shoulderGirdle);
  const legs: Array<{
    side: number;
    crankY: number;
    thigh: THREE.Mesh;
    shin: THREE.Mesh;
    shoe: THREE.Group;
    knee: THREE.Mesh;
    hipPoint: THREE.Vector3;
    kneePoint: THREE.Vector3;
    pedalTarget: THREE.Vector3;
    pedalPoint: THREE.Vector3;
    bendHint: THREE.Vector3;
  }> = [];
  for (const side of [-1, 1]) {
    const thigh = taperedLimb(0.078, 0.057, kitDarkMaterial, segs);
    setReplayAssetSlot(thigh, "athlete:thigh");
    thigh.name = side < 0 ? "bike-thigh-left" : "bike-thigh-right";
    const shin = taperedLimb(0.056, 0.041, skinMaterial, segs);
    setReplayAssetSlot(shin, "athlete:shin");
    shin.name = side < 0 ? "bike-shin-left" : "bike-shin-right";
    const shoe = makeFoot(shoeMaterial);
    shoe.name = side < 0 ? "bike-foot-contact-left" : "bike-foot-contact-right";
    const knee = jointCap(0.072, kitDarkMaterial, capSegs);
    knee.name = side < 0 ? "bike-knee-left" : "bike-knee-right";
    rider.add(thigh, shin, shoe, knee);
    legs.push({
      side,
      crankY: pedals.find((p) => p.side === side)?.crankY ?? side * BIKE_RIG.crank.pedalRadius,
      thigh,
      shin,
      shoe,
      knee,
      hipPoint: new THREE.Vector3(),
      kneePoint: new THREE.Vector3(),
      pedalTarget: new THREE.Vector3(),
      pedalPoint: new THREE.Vector3(),
      bendHint: new THREE.Vector3(side * 0.13, 0.18, 0.72),
    });
  }
  // Arms from the shoulders down to the bars, fixed in the tuck.
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
    const upperArm = taperedLimb(0.06, 0.045, skinMaterial, segs);
    setReplayAssetSlot(upperArm, "athlete:upper-arm");
    upperArm.name = side < 0 ? "bike-upper-arm-left" : "bike-upper-arm-right";
    const forearm = taperedLimb(0.047, 0.034, skinMaterial, segs);
    setReplayAssetSlot(forearm, "athlete:forearm");
    forearm.name = side < 0 ? "bike-forearm-left" : "bike-forearm-right";
    const hand = makeHand(skinMaterial, side, capSegs);
    hand.name = side < 0 ? "bike-hand-left" : "bike-hand-right";
    const elbow = elbowCap(0.053, skinMaterial, capSegs);
    elbow.name = side < 0 ? "bike-elbow-left" : "bike-elbow-right";
    const shoulder = jointCap(0.066, kitMaterial, capSegs);
    shoulder.userData.hideWithReplayAssets = false;
    setReplayAssetSlot(shoulder, "athlete:shoulder");
    shoulder.name = side < 0 ? "bike-shoulder-left" : "bike-shoulder-right";
    shoulder.position.set(side * 0.24, 0, 0);
    shoulderGirdle.add(shoulder);
    rider.add(upperArm, forearm, hand, elbow);
    arms.push({
      side,
      upper: upperArm,
      forearm,
      hand,
      elbow,
      shoulderPoint: new THREE.Vector3(),
      elbowPoint: new THREE.Vector3(),
      handTarget: new THREE.Vector3(),
      handPoint: new THREE.Vector3(),
      bendHint: new THREE.Vector3(side * 0.38, -0.52, -0.12),
    });
  }
  rider.add(pelvis, torso);
  group.add(rider);

  const barPoint = new THREE.Vector3();
  const sampledV4Shoulders = [new THREE.Vector3(), new THREE.Vector3()] as const;
  const UPPER_ARM_LENGTH = 0.39;
  const FOREARM_LENGTH = 0.375;
  // Taken from the V4 rig rather than chosen. These were 0.63/0.63 — a 1.26 m
  // leg — purely so the procedural rider could reach an oversized bike; the
  // rower's equivalents are 0.552. With the bike at true scale the fallback
  // figure uses the same femur and tibia as the skinned athlete above it.
  const THIGH_LENGTH = BIKE_RIG.athlete.thigh;
  const SHIN_LENGTH = BIKE_RIG.athlete.shin;
  // 0.74 -> 0.80: matches the deepened V4 clip hinge; the shoulders sat
  // ~26 mm beyond full arm reach so the palms hovered off the hoods with
  // locked elbows. Weight belongs on the hands.
  const BIKE_AERO_SPINE_LEAN = 0.8;
  const BIKE_HEAD_GAZE_COMPENSATION = -0.47;
  // Pelvis stays at the rider root derived by bikeRiderHipY() — sit surface
  // on pad top. Do not add a vertical dig: averagePedalLoad used to sink the
  // hips into the cushion and re-open butt/saddle 穿模 every downstroke.
  const BIKE_PELVIS_BASE_Y = BIKE_RIG.rider.pelvisOffset[1] ?? 0;
  const BIKE_PELVIS_BASE_Z = BIKE_RIG.rider.pelvisOffset[2] ?? -0.005;
  const BIKE_ANKLE_MIN = -0.22;
  const BIKE_ANKLE_MAX = 0.14;
  const placeBarArms = (): void => {
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i];
      if (!arm) continue;
      arm.shoulderPoint
        .set(arm.side * 0.24, 0, 0)
        .applyQuaternion(shoulderGirdle.quaternion)
        .add(shoulderGirdle.position)
        .applyQuaternion(torso.quaternion)
        .add(torso.position);
      const contact = barContacts[i];
      if (!contact) continue;
      // Handlebar and rider share the avatar group. Convert the explicit grip
      // contact into rider-local space so torso cues never detach the hands.
      barPoint
        .copy(contact.anchor.position)
        .applyQuaternion(handlebar.quaternion)
        .add(handlebar.position)
        .sub(rider.position);
      arm.handTarget.copy(barPoint);
      solveTwoBone3D(
        arm.shoulderPoint,
        arm.handTarget,
        UPPER_ARM_LENGTH,
        FOREARM_LENGTH,
        arm.bendHint,
        arm.elbowPoint,
        arm.handPoint,
      );
      placeFigureSegmentBetween(arm.upper, arm.shoulderPoint, arm.elbowPoint);
      placeFigureSegmentBetween(arm.forearm, arm.elbowPoint, arm.handPoint);
      arm.elbow.position.copy(arm.elbowPoint);
      orientElbowCuff(arm.elbow, arm.shoulderPoint, arm.elbowPoint, arm.handPoint, arm.side);
      arm.hand.position.copy(arm.handPoint);
      // Pronated hoods grip built from the hood contract: the curl axis lies
      // along the hood body's long axis (pinky at the bar tops, index toward
      // the nose) and the spin resolves the palm heel onto the hood's upper
      // surface, so the fingers close onto the hood body and the thumb hooks
      // under it rather than posing a fixed Euler fist beside it.
      //
      // Bike opts into the shared solver's far-side enclosure mode: the palm
      // stays supported on top while each finger chain closes around the hood
      // body without changing the authoritative hand-contact anchor.
      const hoodRotation = BIKE_RIG.handlebar.hood.rotationX;
      GRIP_SHAFT_SCRATCH.set(0, -Math.sin(hoodRotation), Math.cos(hoodRotation));
      GRIP_ROLL_SCRATCH.set(0, -Math.cos(hoodRotation), -Math.sin(hoodRotation));
      BIKE_HOOD_QUAT.setFromAxisAngle(BIKE_HOOD_AXIS_X, hoodRotation);
      orientHandToGripChannel(
        arm.hand,
        arm.side,
        BIKE_RIG.handlebar.hood.radius,
        GRIP_SHAFT_SCRATCH,
        GRIP_ROLL_SCRATCH,
        BIKE_HOOD_QUAT,
      );
    }
  };

  const placePedalLegs = (motion: BikeMotionGraph): void => {
    for (const leg of legs) {
      const pedal = leg.side < 0 ? motion.leftPedal : motion.rightPedal;
      // The graph owns one circular state per pedal. Deriving the target from
      // that state (rather than a separate limb phase) keeps both shoes locked
      // to their mechanically opposed pedals at the 0 / 2π wrap boundary.
      const pedalRadius = BIKE_RIG.crank.pedalRadius;
      const pedalY = -pedalRadius * pedal.rotation.cos;
      const pedalZ = -pedalRadius * pedal.rotation.sin;
      leg.pedalTarget.set(
        leg.side * BIKE_RIG.crank.lateral,
        cranks.position.y + pedalY - rider.position.y,
        cranks.position.z + pedalZ - rider.position.z,
      );
      // Let the hips follow the saddle-bound pelvis before solving both rigid
      // leg links. This makes each knee lead its upstroke without ever moving
      // the shoe away from the graph's pedal contact.
      leg.hipPoint
        .set(leg.side * 0.12, 0, 0)
        .applyQuaternion(pelvis.quaternion)
        .add(pelvis.position);
      // A bicycle knee always selects the forward (+Z), slightly outward
      // branch of the hip/pedal sphere intersection. Deriving the hint from an
      // "upward" perpendicular to the rotating crank chord made that branch
      // orbit and could send the knee aft near dead centre. This rider-space
      // anatomical plane is fixed while solveTwoBone3D projects it against the
      // current chord, producing one continuous flexion path over 0 / 2π.
      leg.bendHint.set(leg.side * 0.2, -0.18, 1).normalize();
      solveTwoBone3D(
        leg.hipPoint,
        leg.pedalTarget,
        THIGH_LENGTH,
        SHIN_LENGTH,
        leg.bendHint,
        leg.kneePoint,
        leg.pedalPoint,
      );
      placeFigureSegmentBetween(leg.thigh, leg.hipPoint, leg.kneePoint);
      placeFigureSegmentBetween(leg.shin, leg.kneePoint, leg.pedalPoint);
      leg.knee.position.copy(leg.kneePoint);
      leg.shoe.position.copy(leg.pedalPoint);
      // Ankling is deliberately restrained; feet stay planted on the pedals
      // instead of tumbling through a full revolution with the crank.
      leg.shoe.rotation.set(
        THREE.MathUtils.clamp(-0.05 + pedal.ankleFlex.value * 0.3, BIKE_ANKLE_MIN, BIKE_ANKLE_MAX),
        0,
        0,
      );
    }
  };

  const placeBikeTorso = (motion: BikeMotionGraph, staticPose = false): void => {
    rider.rotation.set(0, 0, 0); // keep hands/feet in equipment space
    const animationScale = staticPose ? 0 : 1;
    const pedalLoadShift =
      (motion.leftPedal.drive.value - motion.rightPedal.drive.value) * animationScale;
    const pedalExtensionShift =
      (motion.leftPedal.legExtension.value - motion.rightPedal.legExtension.value) * animationScale;
    const pelvisRock = motion.body.pelvisRock.value * animationScale;
    const torsoSway = motion.body.torsoSway.value * animationScale;
    const spineLean = motion.body.spineLean.value * animationScale;
    const shoulderCounterRotation = motion.body.shoulderCounterRotation.value * animationScale;
    const headStabilization = motion.body.headStabilization.value * animationScale;

    // A seated rider shifts pressure across the saddle with each downstroke.
    // Lateral/fore-aft only — vertical load is absorbed by the pad nestle in
    // BIKE_RIG, not by translating the hip through the cushion.
    pelvis.position.set(
      pelvisRock * 0.12 + pedalLoadShift * 0.014,
      BIKE_PELVIS_BASE_Y,
      BIKE_PELVIS_BASE_Z + pedalExtensionShift * 0.014,
    );
    pelvis.rotation.set(
      spineLean * 0.3 + pedalExtensionShift * 0.01,
      pedalLoadShift * 0.024,
      pelvisRock * 0.7 + pedalLoadShift * 0.018,
    );

    // Keep the torso attached to that moving pelvis, then counterpose the
    // shoulder line instead of treating the rider as one rigid block.
    torso.position.set(pelvis.position.x, pelvis.position.y, pelvis.position.z + 0.02);
    torso.rotation.set(
      BIKE_AERO_SPINE_LEAN + spineLean * 0.9 + pedalExtensionShift * 0.015,
      pedalLoadShift * 0.018,
      torsoSway * 0.58,
    );
    shoulderGirdle.rotation.set(
      -spineLean * 0.28,
      pedalLoadShift * 0.024,
      shoulderCounterRotation * 0.7,
    );
    // The neck keeps a road-facing line of sight through the pedal cycle;
    // it counteracts the torso's small phase motion without cancelling the
    // intentional aero posture.
    headStabilizer.rotation.set(
      BIKE_HEAD_GAZE_COMPENSATION - spineLean * 0.78,
      -pedalLoadShift * 0.018,
      headStabilization * 0.55,
    );
  };

  const refineV4Targets = (motion: ReplayV4MotionController): void => {
    motion.getShoulderWorld("left", sampledV4Shoulders[0]);
    motion.getShoulderWorld("right", sampledV4Shoulders[1]);
    // The visible V4 shoulder is the anatomical origin. Rebuild the shared
    // elbow branch from that shoulder and the fixed hood contact so the
    // post-clip solver bends the arms under the shoulder instead of replaying
    // a generic clip plane that was authored without a bicycle cockpit.
    for (let index = 0; index < arms.length; index++) {
      const arm = arms[index];
      const sampledShoulder = sampledV4Shoulders[index];
      if (!arm || !sampledShoulder) continue;
      rider.worldToLocal(sampledShoulder);
      setArmBendHint(sampledShoulder, arm.hand.position, arm.side, arm.bendHint, {
        lateral: 0.2,
        up: -0.28,
        aft: -0.18,
      });
      arm.elbow.position.copy(sampledShoulder).add(arm.bendHint);
    }
  };

  const neutralBikeMotion = sampleBikeMotionGraphInto(
    fallbackStrokePose("bike", 0),
    bikeMotionGraph,
  );
  placeBikeTorso(neutralBikeMotion, true);
  placePedalLegs(neutralBikeMotion);
  placeBarArms();

  const animate = (
    phase: number,
    reduce: boolean,
    pose?: StrokePose,
    meters = 0,
  ): AvatarMotionCues => {
    const resolvedPose = reduce
      ? REDUCED_REPLAY_POSES.bike
      : (pose ?? fallbackStrokePose("bike", phase));
    const motion = sampleBikeMotionGraphInto(resolvedPose, bikeMotionGraph);
    if (reduce) {
      for (const w of wheels) w.rotation.x = 0;
      cranks.rotation.x = motion.crank.angle;
      placeBikeTorso(motion, true);
      placePedalLegs(motion);
      placeBarArms();
      return STATIC_AVATAR_MOTION;
    }
    // Wheel travel comes from distance, independent of cadence/gearing. Positive
    // rotation about +X moves the wheel top toward local +Z (forward).
    const wheelAngle = meters / wheelR;
    for (const w of wheels) w.rotation.x = wheelAngle;
    cranks.rotation.x = motion.crank.angle;
    placeBikeTorso(motion);
    // Update the pelvis before its two-bone leg solve. Otherwise the knees
    // target the previous frame's saddle shift and visibly lag behind a rider
    // whose shoes are correctly locked to the current pedals.
    placePedalLegs(motion);
    placeBarArms();
    return STATIC_AVATAR_MOTION;
  };

  const [leftArm, rightArm] = arms;
  const [leftLeg, rightLeg] = legs;
  if (!leftArm || !rightArm || !leftLeg || !rightLeg) {
    throw new Error("BikeErg V4 target rig is incomplete");
  }
  finalizeAvatar(group, castShadow, opacity);
  return {
    group,
    animate,
    refineV4Targets,
    assetMaterialResolver: resolveAssetMaterial,
    v4Targets: {
      pelvis,
      leftHand: leftArm.hand,
      rightHand: rightArm.hand,
      leftElbow: leftArm.elbow,
      rightElbow: rightArm.elbow,
      leftFoot: leftLeg.shoe,
      rightFoot: rightLeg.shoe,
      leftKnee: leftLeg.knee,
      rightKnee: rightLeg.knee,
    },
  };
}
