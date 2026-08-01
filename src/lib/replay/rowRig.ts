import * as THREE from "three";
import { solveTwoBone3D } from "./figurePose";

/**
 * Rowing-shell rig math shared by the 3D renderer: the physical contact
 * landmarks of the authored shell, the closed-chain oar-yaw solve, and the
 * down-plane elbow solve. Kept out of `renderer3d.ts` in the same spirit as
 * `bikeRig.js` and `skiEquipment.ts` so the rowing mechanics stay unit
 * testable without a renderer instance.
 */

export const ROWER_FOOT_CONTACT = Object.freeze({
  lateral: 0.12,
  y: 0.215,
  /** Stern-side and directly ahead of the aft-facing athlete. */
  z: 0.75,
});
export const ROWER_STRETCHER = Object.freeze({
  centerY: 0.295,
  centerZ: 0.68,
  boardRotation: THREE.MathUtils.degToRad(-48),
  shoeCatchPitch: THREE.MathUtils.degToRad(-35),
  shoeFinishPitch: THREE.MathUtils.degToRad(-42),
});
/**
 * Physical scull-handle contract shared by the oar geometry, the hand-grip
 * closure solve, and the grip tests. The rubber is a 0.023 m-radius cylinder
 * along oar-local X; `anchorFromEnd` is how far inboard of the flat thumb
 * stop the palm-contact anchor sits, which is what lets the thumb press the
 * handle end while four fingers hook the cylinder.
 */
export const ROWER_SCULL_GRIP = Object.freeze({
  radius: 0.023,
  length: 0.32,
  anchorFromEnd: 0.04,
} as const);

export const ROWER_OARLOCK = Object.freeze({
  lateral: 0.88,
  // The pin rides ~0.14 above the seat top — real sculling rigging height —
  // and stays below the lower-rib draw. With the 0.78 m inboard / 2.09 m
  // outboard levers, the drive-side roll that buries the spoon just below the
  // water then puts the handles at the drive height, and a small extra roll
  // lifts them the last few centimetres into the finish. The former 0.62 pin
  // sat so far above the water that no anatomical handle height could ever
  // reach the surface with the blade.
  y: 0.51,
  /** Stern-side pin keeps the scull handles in front of the torso at mid-draw. */
  z: 0.28,
});

const ARM_BEND_CHORD = new THREE.Vector3();
const ARM_PLANE = new THREE.Vector3();
const ARM_OUT_NORMAL = new THREE.Vector3();

/**
 * Choose the continuous yaw branch on a rigid oar's inboard circle that
 * satisfies a requested shoulder-to-grip reach. The motion-graph yaw is used
 * only for a degenerate fallback and the later late-draw blend.
 *
 * The oar's local x axis is transformed by yaw then blade-depth roll. Solving
 * that circle analytically keeps the hot path allocation-free and prevents
 * early elbow flexion from compensating for an underspecified handle sweep.
 */
export function solveRowerOarYaw(
  shoulder: THREE.Vector3,
  pinX: number,
  pinY: number,
  pinZ: number,
  signedInboard: number,
  bladeRoll: number,
  requestedReach: number,
  preferredYaw: number,
  forceReachBoundary = false,
): number {
  const pinDeltaX = pinX - shoulder.x;
  const pinDeltaY = pinY - shoulder.y;
  const pinDeltaZ = pinZ - shoulder.z;
  // Three's XYZ Euler order sends an oar-local X vector to
  // (cos(roll)cos(yaw), sin(roll), -cos(roll)sin(yaw)). Blade burial therefore
  // contributes a yaw-independent vertical term; treating that Y offset as
  // part of the yaw circle shortened the grip reach as soon as the blade
  // squared and made both fallback elbows fold during the leg drive.
  const rollCos = Math.cos(bladeRoll);
  const rollSin = Math.sin(bladeRoll);
  const projectedX = pinDeltaX * rollCos;
  const projectedZ = -pinDeltaZ * rollCos;
  const amplitude = Math.hypot(projectedX, projectedZ);
  if (amplitude < 1e-8 || Math.abs(signedInboard) < 1e-8) return preferredYaw;

  const baseDistanceSquared =
    pinDeltaX * pinDeltaX +
    pinDeltaY * pinDeltaY +
    pinDeltaZ * pinDeltaZ +
    signedInboard * signedInboard;
  const preferredDistanceSquared =
    baseDistanceSquared +
    2 *
      signedInboard *
      (projectedX * Math.cos(preferredYaw) +
        projectedZ * Math.sin(preferredYaw) +
        pinDeltaY * rollSin);
  // A bent elbow is a normal part of the drive. Follow the graph-authored
  // oar arc directly whenever the shoulder can reach it; solving only the
  // outer reach boundary would make the two circle intersections exchange
  // branches as soon as the hands become reachable, producing a visible
  // snap at the exact moment the handle should be travelling smoothly.
  if (!forceReachBoundary && preferredDistanceSquared <= requestedReach * requestedReach + 1e-5) {
    return preferredYaw;
  }
  const cosine = THREE.MathUtils.clamp(
    (requestedReach * requestedReach -
      baseDistanceSquared -
      2 * signedInboard * pinDeltaY * rollSin) /
      (2 * signedInboard * amplitude),
    -1,
    1,
  );
  const center = Math.atan2(projectedZ, projectedX);
  const offset = Math.acos(cosine);
  const first = center + offset;
  const second = center - offset;
  // The catch is the root whose inboard grip sits farther toward the
  // stretcher (+Z). Selecting by that physical relationship keeps both
  // mirrored oars forward even when the two angular roots exchange which one
  // is numerically closest to the staged yaw.
  const firstGripZ = pinZ - signedInboard * rollCos * Math.sin(first);
  const secondGripZ = pinZ - signedInboard * rollCos * Math.sin(second);
  const selected = firstGripZ >= secondGripZ ? first : second;
  // atan2 is periodic. Keep the selected reach-limited branch equivalent to
  // the staged yaw that was authored for this frame so the oar never takes a
  // visible ±2π jump when the analytic circle crosses its branch cut.
  return (
    preferredYaw + Math.atan2(Math.sin(selected - preferredYaw), Math.cos(selected - preferredYaw))
  );
}

/**
 * Boat-local rowing elbow corridor (single scull, shared by the procedural
 * renderer and the V4 branch markers).
 *
 * British Rowing's sculling guidance has each elbow follow its handle line
 * principally aft with the wrist and forearm aligned, and explicitly names
 * "winging" the elbows at the finish as a fault. Sculling hands are laterally
 * separated, so some natural outboard component exists — the corridor bounds
 * it instead of pretending it is zero. Bounds are derived from the shipped
 * rig: shoulder half-width 0.25 m, drawn-elbow circle radius ≤ 0.27 m, and
 * the 0.18 m torso-core clearance the skinned athlete needs.
 */
export const ROWER_ELBOW_CORRIDOR = Object.freeze({
  /**
   * Maximum outboard displacement of the elbow from the vertical working
   * plane through the shoulder→wrist chord. sin(≤24°) of the deepest elbow
   * circle — a visible but modest outward lean, far short of the horizontal
   * wing the former scored branch selection could produce (measured 0.30 m).
   */
  maxOutboard: 0.11,
  /** Token inboard excursion across the working plane toward the spine. */
  maxInboard: 0.05,
  /** The joint may trail the shoulder plane, never haul past vertical. */
  maxBehindShoulder: 0.19,
  /**
   * During the loaded draw the rearward elbow travel must clearly dominate
   * any unintended outboard deviation. 0.5 is the derived ceiling of
   * (outboard excursion)/(rearward travel) for the plane parameters below;
   * a winged pose measures well above 1.
   */
  // Recalibrated 0.5 -> 0.7 with the flat-wrist sculling grip: laying the
  // hand's long axis on the forearm rotates the wrist origin around the fixed
  // grip channel (~5 cm lever), which shifts the solved elbow slightly
  // outboard through the draw. The absolute corridor caps above still bound
  // the pose; this ratio only guards draw *style* against the chicken-wing
  // returning, and 0.61 measured with flat wrists is an arm drawing past the
  // body, not a wing.
  maxOutboardPerRearward: 0.7,
} as const);

/**
 * Arm-draw schedule: the elbow's interior flexion — the visually meaningful
 * quantity — grows linearly with the motion graph's cruise-shaped armDraw
 * channel, reaching the measured production finish fold at draw = 1. The
 * renderer converts the scheduled flexion into a requested shoulder→wrist
 * reach via the law of cosines and lets the rigid-oar solve place the
 * handle, so the channel is the *only* velocity profile in the chain — the
 * former stack (reach-relaxation smoothstep + boundary/staged yaw blend +
 * renderer smoothstep) compressed the visible pull into ~3 frames.
 */
export const ROWER_DRAW_FINISH_FLEXION = 2.46;

/**
 * Soft elbow unlock held through the whole drive (radians from straight).
 * A rower's arms hang long but never locked; geometrically this keeps the
 * shoulder→wrist chord away from the straight-arm singularity, where the
 * flexion-per-millimetre gain of the law of cosines diverges and mm-scale
 * IK settling reads as a multi-degree elbow pop exactly at draw onset.
 *
 * The value is measured on the production V4 rig: the refined grip-sphere →
 * wrist-sphere mapping carries a ~8 mm contact-offset bias, so scheduled
 * flexion below ~0.32 rad leaves the wrist target outside the skeleton's
 * natural chord — a dead zone the arm then rushed to catch up, which was
 * the last remaining onset velocity spike. At 0.32 rad the arm engages the
 * shrinking sphere from the first millimetre of the draw window.
 */
export const ROWER_DRAW_SOFT_FLEXION = 0.32;

/** Shoulder→wrist reach that yields `flexion` for the given segment pair. */
export function rowerReachForFlexion(
  flexion: number,
  upperArmLength: number,
  forearmLength: number,
): number {
  const clamped = THREE.MathUtils.clamp(flexion, 0, Math.PI - 1e-3);
  return Math.sqrt(
    Math.max(
      0,
      upperArmLength * upperArmLength +
        forearmLength * forearmLength +
        2 * upperArmLength * forearmLength * Math.cos(clamped),
    ),
  );
}

/**
 * Elbow-plane schedule driven by the arm's *actual* flexion, not by a phase
 * channel: the shoulder→wrist distance determines how bent the arm is, and
 * only a visibly bent arm has a visually meaningful bend plane. Near full
 * extension the elbow circle is a singular, low-authority region — forcing a
 * strong preferred direction there twists the limb about its own long axis
 * for no visible positional gain, which is exactly the artefact this
 * schedule removes.
 */
export const ROWER_ELBOW_PLANE = Object.freeze({
  /** Flexion (rad from straight) below which the plane has no authority. */
  authorityStart: 0.14,
  /** Flexion at which the drawn plane owns the joint completely. */
  authorityFull: 0.55,
  /**
   * Relaxed near-straight direction, athlete frame: a soft under-arm hang
   * with the natural sculling outboard lean, derived from the authored
   * catch pose. Positionally almost inert at low flexion; it exists to keep
   * the singular region deterministic and mirror-symmetric.
   */
  relaxed: Object.freeze({ x: 0.32, y: -1, z: -0.12 }),
  /**
   * Drawn direction, athlete frame. Used only as the two-bone branch hint:
   * once the circle is decomposed, `drawnDownWeight`/`drawnOutboardWeight`
   * own the station at full authority. Down-and-aft picks the correct
   * (non-mirrored, non-winged) branch at every draw chord.
   */
  drawn: Object.freeze({ x: 0.02, y: -0.72, z: -0.69 }),
  /**
   * Chord-frame station of the drawn elbow on its circle. The chord itself
   * swings ~30° of azimuth between mid-draw and finish, so no fixed
   * athlete-frame direction can be modestly outboard at both — expressed in
   * the working basis (in-plane-down v̂, outboard ŵ) the preference is
   * chord-relative and the outboard offset scales with the circle radius:
   * 0.24 · radius stays a visible but modest lean (≈ 0.067 m mid-draw,
   * ≈ 0.087 m at the deep finish fold) and leaves the absolute-metre
   * corridor as a dormant safety limit instead of the operating pose.
   */
  drawnOutboardWeight: 0.24,
  drawnDownWeight: Math.sqrt(1 - 0.24 * 0.24),
} as const);

/** Elbow flexion (radians away from a straight arm) for a given reach. */
export function rowerElbowFlexion(
  chordLength: number,
  upperArmLength: number,
  forearmLength: number,
): number {
  const clamped = THREE.MathUtils.clamp(
    chordLength,
    Math.abs(upperArmLength - forearmLength) + 1e-6,
    upperArmLength + forearmLength - 1e-6,
  );
  const cosInterior =
    (upperArmLength * upperArmLength + forearmLength * forearmLength - clamped * clamped) /
    (2 * upperArmLength * forearmLength);
  return Math.PI - Math.acos(THREE.MathUtils.clamp(cosInterior, -1, 1));
}

/**
 * How much the preferred plane may steer the joint, 0 near straight → 1 once
 * flexion is clearly visible. C2 (smootherstep), so plane authority cannot
 * step while the draw develops.
 */
export function rowerElbowPlaneAuthority(flexion: number): number {
  const span = ROWER_ELBOW_PLANE.authorityFull - ROWER_ELBOW_PLANE.authorityStart;
  const unit = THREE.MathUtils.clamp((flexion - ROWER_ELBOW_PLANE.authorityStart) / span, 0, 1);
  return unit * unit * unit * (unit * (unit * 6 - 15) + 10);
}

/**
 * Preferred rowing elbow-plane direction in the athlete frame (+z stretcher,
 * -z aft draw direction, +y up, x outboard by side), blended from the
 * relaxed hang to the aft draw by plane authority. Because both sides
 * evaluate one formula mirrored by `side`, left and right can never select
 * opposite branches at the same flexion.
 */
export function rowerElbowPlane(
  side: number,
  authority: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const mix = THREE.MathUtils.clamp(authority, 0, 1);
  const sign = Math.sign(side) || 1;
  out.set(
    sign * THREE.MathUtils.lerp(ROWER_ELBOW_PLANE.relaxed.x, ROWER_ELBOW_PLANE.drawn.x, mix),
    THREE.MathUtils.lerp(ROWER_ELBOW_PLANE.relaxed.y, ROWER_ELBOW_PLANE.drawn.y, mix),
    THREE.MathUtils.lerp(ROWER_ELBOW_PLANE.relaxed.z, ROWER_ELBOW_PLANE.drawn.z, mix),
  );
  return out.normalize();
}

/**
 * Signed elbow displacement from the vertical working plane that contains the
 * shoulder→wrist chord. Positive is outboard (away from the boat centreline),
 * negative crosses inboard over the chord. This is the corridor's measured
 * quantity — used by the solver clamp, the V4 diagnostics, and the tests.
 */
export function rowerElbowOutboard(
  shoulder: THREE.Vector3,
  wrist: THREE.Vector3,
  elbow: THREE.Vector3,
  side: number,
): number {
  ARM_BEND_CHORD.copy(wrist).sub(shoulder);
  ARM_BEND_CHORD.y = 0;
  if (ARM_BEND_CHORD.lengthSq() < 1e-10) ARM_BEND_CHORD.set(0, 0, 1);
  ARM_BEND_CHORD.normalize();
  // Horizontal normal of the vertical plane through the chord.
  ARM_OUT_NORMAL.set(-ARM_BEND_CHORD.z, 0, ARM_BEND_CHORD.x);
  if (Math.abs(ARM_OUT_NORMAL.x) > 1e-3) {
    if (ARM_OUT_NORMAL.x * Math.sign(side) < 0) ARM_OUT_NORMAL.negate();
  } else if (ARM_OUT_NORMAL.z * Math.sign(side) * Math.sign(ARM_BEND_CHORD.x || 1) < 0) {
    // Chord nearly fore-aft-free: fall back to a stable outboard sign.
    ARM_OUT_NORMAL.negate();
  }
  return (
    (elbow.x - shoulder.x) * ARM_OUT_NORMAL.x +
    (elbow.y - shoulder.y) * ARM_OUT_NORMAL.y +
    (elbow.z - shoulder.z) * ARM_OUT_NORMAL.z
  );
}

/**
 * Solve one equipment-locked sculling arm on the flexion-scheduled elbow
 * contract.
 *
 * The wrist lands exactly on the rigid grip and both bone lengths remain
 * authoritative. The one free degree of freedom — rotation of the elbow
 * about the shoulder→wrist chord — is steered by `rowerElbowPlane` with
 * authority proportional to the *actual* flexion the reach demands: a
 * near-straight arm keeps its relaxed hang (the singular region is left
 * alone), and the aft draw takes over smoothly as the arm genuinely bends.
 * The corridor then acts purely as a safety clamp, and an up-clamp prevents
 * an above-horizontal wing at visible flexion without ever dragging the
 * joint downward. Every step is continuous in its inputs, so the draw
 * cannot snap branches and mirrored arms stay symmetric. `planeOut`
 * receives the final plane direction for diagnostics.
 */
const ARM_CHORD3 = new THREE.Vector3();
const ARM_IN_PLANE_DOWN = new THREE.Vector3();

export function solveRowerArm(
  shoulder: THREE.Vector3,
  hand: THREE.Vector3,
  upperArmLength: number,
  forearmLength: number,
  side: number,
  elbow: THREE.Vector3,
  handOut: THREE.Vector3,
  planeOut?: THREE.Vector3,
): number {
  const reach = shoulder.distanceTo(hand);
  const flexion = rowerElbowFlexion(reach, upperArmLength, forearmLength);
  const authority = rowerElbowPlaneAuthority(flexion);
  rowerElbowPlane(side, authority, ARM_PLANE);
  solveTwoBone3D(shoulder, hand, upperArmLength, forearmLength, ARM_PLANE, elbow, handOut);

  // The remaining freedom of a bent two-bone arm is the elbow's station on a
  // circle around the shoulder→wrist chord. Decompose that circle into an
  // outboard basis vector and an in-working-plane down vector, then clamp the
  // outboard coefficient in closed form. A hint-space secant cannot do this:
  // when the chord itself tilts outboard-down, projecting the down-dominant
  // plane out of the chord leaks lateral displacement that no hint.x scaling
  // removes (the pre-fix draw measured 0.17 m outboard from exactly that).
  ARM_CHORD3.copy(handOut).sub(shoulder);
  const chordLength = ARM_CHORD3.length();
  if (chordLength <= 1e-6) {
    if (planeOut) planeOut.copy(ARM_PLANE);
    return authority;
  }
  ARM_CHORD3.multiplyScalar(1 / chordLength);
  const along =
    (upperArmLength * upperArmLength - forearmLength * forearmLength + chordLength * chordLength) /
    (2 * chordLength);
  const radius = Math.sqrt(Math.max(0, upperArmLength * upperArmLength - along * along));
  if (radius <= 1e-4) {
    if (planeOut) planeOut.copy(ARM_PLANE);
    return authority;
  }

  // Outboard normal of the vertical working plane; exactly perpendicular to
  // the full 3D chord because it is horizontal and the horizontal chord part
  // lies inside the plane.
  ARM_OUT_NORMAL.set(-ARM_CHORD3.z, 0, ARM_CHORD3.x);
  if (ARM_OUT_NORMAL.lengthSq() < 1e-10) ARM_OUT_NORMAL.set(Math.sign(side) || 1, 0, 0);
  ARM_OUT_NORMAL.normalize();
  if (ARM_OUT_NORMAL.x * Math.sign(side || 1) < 0) ARM_OUT_NORMAL.negate();
  ARM_IN_PLANE_DOWN.crossVectors(ARM_CHORD3, ARM_OUT_NORMAL).normalize();
  if (ARM_IN_PLANE_DOWN.y > 0) ARM_IN_PLANE_DOWN.negate();

  ARM_BEND_CHORD.copy(elbow)
    .sub(shoulder)
    .addScaledVector(ARM_CHORD3, -along)
    .multiplyScalar(1 / radius);
  let downWeight = ARM_BEND_CHORD.dot(ARM_IN_PLANE_DOWN);
  let outWeight = ARM_BEND_CHORD.dot(ARM_OUT_NORMAL);

  // Blend the natural station toward the chord-frame drawn station as the
  // plane gains authority. v̂ and ŵ span the circle plane, so the natural
  // decomposition is exact; renormalising after the lerp keeps the joint on
  // the circle rather than shrinking the bend radius.
  downWeight += (ROWER_ELBOW_PLANE.drawnDownWeight - downWeight) * authority;
  outWeight += (ROWER_ELBOW_PLANE.drawnOutboardWeight - outWeight) * authority;
  const stationNorm = Math.hypot(downWeight, outWeight);
  if (stationNorm > 1e-6) {
    downWeight /= stationNorm;
    outWeight /= stationNorm;
  } else {
    downWeight = 1;
    outWeight = 0;
  }

  const maxOut = Math.min(1, ROWER_ELBOW_CORRIDOR.maxOutboard / radius);
  const maxIn = Math.min(1, ROWER_ELBOW_CORRIDOR.maxInboard / radius);
  const clampedOut = THREE.MathUtils.clamp(outWeight, -maxIn, maxOut);
  if (clampedOut !== outWeight) {
    outWeight = clampedOut;
    // Re-normalise on the circle without changing the vertical hemisphere the
    // plane chose — the corridor is a lateral safety limit, not a pose.
    downWeight = Math.sign(downWeight || 1) * Math.sqrt(Math.max(0, 1 - outWeight * outWeight));
  }
  // Up-clamp: at visible flexion the joint may not rise above the horizontal
  // through the chord (that is the start of a wing), but nothing folds it
  // *down* — the drawn plane's own modest drop owns the finish depth, and
  // near-straight arms keep whatever hemisphere their relaxed hang gave
  // them. There is no post-hoc behind-the-shoulder circle walk here: the
  // plane's bounded aft component owns that limit, because rotating around
  // the circle to satisfy a z floor moves the joint laterally and snapped
  // the old release frames.
  const minimumDown = -(1 - authority);
  if (downWeight < minimumDown) {
    downWeight = minimumDown;
    outWeight =
      Math.sign(outWeight || 1) *
      Math.min(Math.sqrt(Math.max(0, 1 - downWeight * downWeight)), maxOut);
  }

  ARM_PLANE.copy(ARM_IN_PLANE_DOWN)
    .multiplyScalar(downWeight)
    .addScaledVector(ARM_OUT_NORMAL, outWeight);
  if (ARM_PLANE.lengthSq() > 1e-10) ARM_PLANE.normalize();
  else ARM_PLANE.copy(ARM_IN_PLANE_DOWN);
  elbow.copy(shoulder).addScaledVector(ARM_CHORD3, along).addScaledVector(ARM_PLANE, radius);
  if (planeOut) planeOut.copy(ARM_PLANE);
  return authority;
}
