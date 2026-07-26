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
  maxOutboardPerRearward: 0.5,
} as const);

/**
 * Preferred rowing elbow-plane direction in the athlete frame (+z stretcher,
 * -z aft draw direction, +y up, x outboard by side).
 *
 * One continuous, C1 direction replaces the former two-branch scored
 * selection: down-dominant with a slight outward tilt through the whole
 * stroke, rotating aft as the late arm draw closes. The loaded finish keeps
 * the deepest down component (elbow below the handle line while the spoon is
 * buried); extraction releases depth continuously as the load fades. Because
 * both sides evaluate one formula mirrored by `side`, left and right can
 * never select opposite branches at the same phase.
 */
export function rowerElbowPlane(
  side: number,
  draw: number,
  load: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const drawAmount = THREE.MathUtils.clamp(draw, 0, 1);
  const loadAmount = THREE.MathUtils.clamp(load, 0, 1);
  const outboard = 0.14 + 0.06 * drawAmount;
  const aft = drawAmount * (0.34 + 0.52 * (1 - 0.5 * loadAmount));
  out.set(Math.sign(side) * outboard, -1, -aft);
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
 * Solve one equipment-locked sculling arm on the shared elbow-plane contract.
 *
 * The wrist lands exactly on the rigid grip and both bone lengths remain
 * authoritative; the one free degree of freedom — rotation of the elbow about
 * the shoulder→wrist chord — follows `rowerElbowPlane`, then two closed
 * secant passes clamp the solved joint into the boat-local corridor
 * (outboard band and behind-the-shoulder floor). Every step is continuous in
 * its inputs, so the draw cannot snap branches and mirrored arms stay
 * symmetric. `planeOut` receives the final plane direction for diagnostics.
 */
const ARM_CHORD3 = new THREE.Vector3();
const ARM_IN_PLANE_DOWN = new THREE.Vector3();

export function solveRowerArm(
  shoulder: THREE.Vector3,
  hand: THREE.Vector3,
  upperArmLength: number,
  forearmLength: number,
  side: number,
  draw: number,
  load: number,
  elbow: THREE.Vector3,
  handOut: THREE.Vector3,
  planeOut?: THREE.Vector3,
): void {
  rowerElbowPlane(side, draw, load, ARM_PLANE);
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
    return;
  }
  ARM_CHORD3.multiplyScalar(1 / chordLength);
  const along =
    (upperArmLength * upperArmLength - forearmLength * forearmLength + chordLength * chordLength) /
    (2 * chordLength);
  const radius = Math.sqrt(Math.max(0, upperArmLength * upperArmLength - along * along));
  if (radius <= 1e-4) {
    if (planeOut) planeOut.copy(ARM_PLANE);
    return;
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

  const maxOut = Math.min(1, ROWER_ELBOW_CORRIDOR.maxOutboard / radius);
  const maxIn = Math.min(1, ROWER_ELBOW_CORRIDOR.maxInboard / radius);
  outWeight = THREE.MathUtils.clamp(outWeight, -maxIn, maxOut);
  // Rebuild on the circle, keeping the elbow on its downward half. A clip or
  // degenerate hint that leaked an upward component is folded down rather
  // than allowed to select the mirror (chicken-wing) station. There is no
  // post-hoc behind-the-shoulder circle walk here: the plane's bounded aft
  // component owns that limit, because rotating around the circle to satisfy
  // a z floor moves the joint laterally and snapped the old release frames.
  downWeight = Math.sqrt(Math.max(0, 1 - outWeight * outWeight));

  ARM_PLANE.copy(ARM_IN_PLANE_DOWN)
    .multiplyScalar(downWeight)
    .addScaledVector(ARM_OUT_NORMAL, outWeight);
  elbow.copy(shoulder).addScaledVector(ARM_CHORD3, along).addScaledVector(ARM_PLANE, radius);
  if (planeOut) planeOut.copy(ARM_PLANE);
}
