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
const ARM_BEND_AXIS = new THREE.Vector3();
const ARM_BEND_CROSS = new THREE.Vector3();
const ARM_BEND_CANDIDATE = new THREE.Vector3();
const ARM_BEND_BEST = new THREE.Vector3();
const ARM_BEND_TRIAL = new THREE.Vector3();
const ARM_BEND_TRIAL_END = new THREE.Vector3();

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
 * Solve the equipment-locked arm while keeping its elbow in the soft
 * shoulder-to-grip corridor. The margin represents elbow/upper-arm thickness,
 * not a second target: the wrist remains exactly on the oar grip and the
 * two-bone lengths remain authoritative. The rowing arm intersects the elbow
 * circle with a below-handle height plane every frame and chooses its
 * anatomical down/rear solution; the closed form is continuous in its inputs
 * so no per-frame steering or fade is needed. Other callers retain the short
 * projected hint correction used when a rigid grip passes the shoulder line.
 */
export function solveRowerArmWithCorridor(
  shoulder: THREE.Vector3,
  hand: THREE.Vector3,
  upperArmLength: number,
  forearmLength: number,
  bendHint: THREE.Vector3,
  elbow: THREE.Vector3,
  handOut: THREE.Vector3,
  minimumElbowZ?: number,
  minimumElbowY?: number,
  maximumElbowY?: number,
  side = 0,
): void {
  solveTwoBone3D(shoulder, hand, upperArmLength, forearmLength, bendHint, elbow, handOut);

  // A drawing elbow hangs close under its own shoulder line: allow a modest
  // outboard lean and only a token inboard excursion. The former 0.2–0.45 m
  // outboard band pushed the joint past the hand line and, combined with a
  // chord-height target, read as elbows pointing left/right instead of down.
  const corridorMin =
    side < 0
      ? shoulder.x - 0.2
      : side > 0
        ? shoulder.x - 0.03
        : Math.min(shoulder.x, hand.x) - 0.04;
  const corridorMax =
    side < 0
      ? shoulder.x + 0.03
      : side > 0
        ? shoulder.x + 0.2
        : Math.max(shoulder.x, hand.x) + 0.04;

  if (minimumElbowY !== undefined && maximumElbowY !== undefined) {
    // A bent two-bone arm has one remaining degree of freedom: the elbow can
    // rotate around the shoulder-to-wrist chord. Intersect that circle with
    // the finish handle-height plane and score its two solutions. This keeps
    // the upper arm sloping down toward the handle without an iterative solve
    // in the per-frame render path.
    ARM_BEND_CHORD.copy(hand).sub(shoulder);
    const chordLength = ARM_BEND_CHORD.length();
    if (chordLength <= 1e-6) return;
    ARM_BEND_CHORD.multiplyScalar(1 / chordLength);
    ARM_BEND_AXIS.set(0, 1, 0);
    ARM_BEND_AXIS.addScaledVector(ARM_BEND_CHORD, -ARM_BEND_AXIS.dot(ARM_BEND_CHORD));
    const verticalProjection = ARM_BEND_AXIS.length();
    if (verticalProjection <= 1e-6) return;
    ARM_BEND_AXIS.multiplyScalar(1 / verticalProjection);
    ARM_BEND_CROSS.crossVectors(ARM_BEND_CHORD, ARM_BEND_AXIS).normalize();

    const solveDistance = Math.max(
      Math.abs(upperArmLength - forearmLength),
      Math.min(upperArmLength + forearmLength, chordLength),
    );
    const along =
      (upperArmLength * upperArmLength -
        forearmLength * forearmLength +
        solveDistance * solveDistance) /
      (2 * Math.max(1e-9, solveDistance));
    const elbowRadius = Math.sqrt(Math.max(0, upperArmLength * upperArmLength - along * along));
    if (elbowRadius <= 1e-6) return;

    const targetY = (minimumElbowY + maximumElbowY) * 0.5;
    const circleCenterY = shoulder.y + ARM_BEND_CHORD.y * along;
    const verticalDirection = THREE.MathUtils.clamp(
      (targetY - circleCenterY) / elbowRadius,
      -verticalProjection,
      verticalProjection,
    );
    const verticalWeight = THREE.MathUtils.clamp(verticalDirection / verticalProjection, -1, 1);
    const crossWeight = Math.sqrt(Math.max(0, 1 - verticalWeight * verticalWeight));
    const corridorCenter = (corridorMin + corridorMax) * 0.5;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestBranch = 1;
    let bestTrialZ = Number.POSITIVE_INFINITY;

    for (let branch = -1; branch <= 1; branch += 2) {
      ARM_BEND_CANDIDATE.copy(ARM_BEND_AXIS)
        .multiplyScalar(verticalWeight)
        .addScaledVector(ARM_BEND_CROSS, branch * crossWeight);
      solveTwoBone3D(
        shoulder,
        hand,
        upperArmLength,
        forearmLength,
        ARM_BEND_CANDIDATE,
        ARM_BEND_TRIAL,
        ARM_BEND_TRIAL_END,
      );
      const xPenalty = Math.max(corridorMin - ARM_BEND_TRIAL.x, 0, ARM_BEND_TRIAL.x - corridorMax);
      const yPenalty = Math.max(
        minimumElbowY - ARM_BEND_TRIAL.y,
        0,
        ARM_BEND_TRIAL.y - maximumElbowY,
      );
      const zPenalty =
        minimumElbowZ === undefined ? 0 : Math.max(minimumElbowZ - ARM_BEND_TRIAL.z, 0);
      const score =
        (xPenalty + yPenalty + zPenalty) * 100 +
        Math.abs(ARM_BEND_TRIAL.y - targetY) +
        Math.abs(ARM_BEND_TRIAL.x - corridorCenter) * 0.01;
      if (score < bestScore) {
        bestScore = score;
        bestBranch = branch;
        bestTrialZ = ARM_BEND_TRIAL.z;
        ARM_BEND_BEST.copy(ARM_BEND_CANDIDATE);
      }
    }

    if (minimumElbowZ !== undefined && bestTrialZ < minimumElbowZ - 1e-6) {
      // The height plane fixes the elbow's vertical station, but the finish
      // also forbids the joint from slipping behind the shoulder plane.
      // Rotate the winning branch along the elbow circle onto the z-floor
      // plane instead of merely scoring the violation: elbow position is
      // center + r·(u·axis + v·cross) with v = branch·sqrt(1-u²), so the
      // floor is a quadratic in u with a closed-form root. The correction is
      // continuous in its inputs, so it cannot introduce a frame pop.
      const axisZ = ARM_BEND_AXIS.z;
      const crossZ = ARM_BEND_CROSS.z;
      const planeNorm = axisZ * axisZ + crossZ * crossZ;
      const circleCenterZ = shoulder.z + ARM_BEND_CHORD.z * along;
      const zTarget = (minimumElbowZ - circleCenterZ) / elbowRadius;
      if (planeNorm > 1e-9 && zTarget * zTarget <= planeNorm) {
        const rootSpread = Math.abs(crossZ) * Math.sqrt(planeNorm - zTarget * zTarget);
        let floorU = Number.NaN;
        for (const root of [
          (zTarget * axisZ + rootSpread) / planeNorm,
          (zTarget * axisZ - rootSpread) / planeNorm,
        ]) {
          // Keep only roots on the winning branch's half of the circle, then
          // prefer the one nearest the height-plane solution so the elbow
          // gives up as little of its handle-line station as possible.
          if (Math.abs(root) > 1) continue;
          if (bestBranch * crossZ * (zTarget - root * axisZ) < -1e-9) continue;
          if (
            !Number.isFinite(floorU) ||
            Math.abs(root - verticalWeight) < Math.abs(floorU - verticalWeight)
          ) {
            floorU = root;
          }
        }
        if (Number.isFinite(floorU)) {
          ARM_BEND_BEST.copy(ARM_BEND_AXIS)
            .multiplyScalar(floorU)
            .addScaledVector(
              ARM_BEND_CROSS,
              bestBranch * Math.sqrt(Math.max(0, 1 - floorU * floorU)),
            );
        }
      }
    }

    bendHint.copy(ARM_BEND_BEST);
    solveTwoBone3D(shoulder, hand, upperArmLength, forearmLength, bendHint, elbow, handOut);
    return;
  }

  for (let iteration = 0; iteration < 16; iteration++) {
    const xViolation =
      elbow.x < corridorMin
        ? corridorMin - elbow.x
        : elbow.x > corridorMax
          ? elbow.x - corridorMax
          : 0;
    const zViolation =
      minimumElbowZ !== undefined && elbow.z < minimumElbowZ ? minimumElbowZ - elbow.z : 0;
    if (xViolation <= 1e-5 && zViolation <= 1e-5) return;

    const correctZ = zViolation > xViolation;
    const desiredDirection = correctZ ? 1 : elbow.x < corridorMin ? 1 : -1;
    let bestMovement = 0;
    for (let axis = 0; axis < 3; axis++) {
      for (let sign = -1; sign <= 1; sign += 2) {
        ARM_BEND_CANDIDATE.copy(bendHint);
        if (axis === 0) ARM_BEND_CANDIDATE.x += sign * 0.12;
        else if (axis === 1) ARM_BEND_CANDIDATE.y += sign * 0.12;
        else ARM_BEND_CANDIDATE.z += sign * 0.12;
        solveTwoBone3D(
          shoulder,
          hand,
          upperArmLength,
          forearmLength,
          ARM_BEND_CANDIDATE,
          ARM_BEND_TRIAL,
          ARM_BEND_TRIAL_END,
        );
        const movement =
          (correctZ ? ARM_BEND_TRIAL.z : ARM_BEND_TRIAL.x) - (correctZ ? elbow.z : elbow.x);
        const directedMovement = movement * desiredDirection;
        if (directedMovement > bestMovement) {
          bestMovement = directedMovement;
          ARM_BEND_BEST.copy(ARM_BEND_CANDIDATE);
        }
      }
    }

    if (bestMovement <= 1e-5) {
      if (correctZ) bendHint.y += 0.12;
      else bendHint.x += desiredDirection * 0.12;
      solveTwoBone3D(shoulder, hand, upperArmLength, forearmLength, bendHint, elbow, handOut);
      continue;
    }

    const violation = correctZ
      ? minimumElbowZ! - elbow.z
      : desiredDirection > 0
        ? corridorMin - elbow.x
        : elbow.x - corridorMax;
    const blend = THREE.MathUtils.clamp(violation / bestMovement, 0, 1);
    bendHint.lerp(ARM_BEND_BEST, blend);
    solveTwoBone3D(shoulder, hand, upperArmLength, forearmLength, bendHint, elbow, handOut);
  }
}

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
