import * as THREE from "three";
import {
  SKI_HAND_CURL_AXIS,
  SKI_HAND_FIST_CENTRE,
  SKI_HAND_FIST_RADIUS,
  SKI_POLE_GRIP_RADIUS,
} from "./skiEquipment";

/**
 * Geometry-constrained hand grips shared by all three sports.
 *
 * A grip is not "a palm near a target plus curled finger constants": the
 * equipment must lie inside a collision-checked digit enclosure. This module
 * owns the pieces that make that checkable:
 *
 * - the hand's grip-channel model — where a cylinder of radius R sits in the
 *   hand, derived from the already-pinned SkiErg fist measurements rather
 *   than a new set of eyeballed offsets;
 * - the digit-closure solver — finger chains are posed into the carrying cup
 *   the channel was fitted in, then each phalanx flexes until its bone points
 *   reach the equipment surface and stops at contact, so curl angles are
 *   outputs of the equipment geometry, not per-sport tuning constants;
 * - the grip-frame orientation — the generalisation of the SkiErg pole frame
 *   to any cylindrical channel (scull handles, brake-hood bodies), aligning
 *   the hand's authored curl axis to the equipment axis and resolving the
 *   remaining spin explicitly.
 *
 * Everything here is deterministic and unit-testable without a renderer.
 */

/** Authored palm-surface contact of the right hand, from V4_CONTACT_OFFSETS. */
export const HAND_PALM_CONTACT = Object.freeze({ x: 0.08, y: -0.01, z: 0.035 } as const);

/**
 * Inward palm normal of the right hand: from the authored palm-surface
 * contact toward the fitted SkiErg fist-channel centre. Both endpoints are
 * pinned measurements of the shipped rig, so this direction is derived, not
 * invented. Left mirrors x.
 */
export const HAND_PALM_NORMAL_IN = (() => {
  const direction = new THREE.Vector3(
    SKI_HAND_FIST_CENTRE.x - HAND_PALM_CONTACT.x,
    SKI_HAND_FIST_CENTRE.y - HAND_PALM_CONTACT.y,
    SKI_HAND_FIST_CENTRE.z - HAND_PALM_CONTACT.z,
  ).normalize();
  return Object.freeze({ x: direction.x, y: direction.y, z: direction.z });
})();

/**
 * Distance from the palm skin to the surface of a held cylinder — the seat
 * flesh the fist measurement already encodes: |palm→fistCentre| minus the
 * fitted 0.0169 m channel radius.
 */
export const HAND_GRIP_SEAT_FLESH = (() => {
  const distance = Math.hypot(
    SKI_HAND_FIST_CENTRE.x - HAND_PALM_CONTACT.x,
    SKI_HAND_FIST_CENTRE.y - HAND_PALM_CONTACT.y,
    SKI_HAND_FIST_CENTRE.z - HAND_PALM_CONTACT.z,
  );
  return distance - SKI_HAND_FIST_RADIUS;
})();

/**
 * Hand-local centre of the channel that a cylinder of `radius` occupies when
 * held: the authored palm contact pushed inward by seat flesh plus the
 * radius. `channelCentre(SKI_HAND_FIST_RADIUS)` reproduces the pinned SkiErg
 * fist centre exactly; larger radii (the 0.023 m scull rubber, the brake-hood
 * body) seat proportionally further from the palm, which is what turns the
 * same hand from a fist into a relaxed hook. x mirrors by side.
 */
export function handChannelCentre(radius: number, side: number, out = new THREE.Vector3()) {
  const seat = HAND_GRIP_SEAT_FLESH + radius;
  out.set(
    HAND_PALM_CONTACT.x + HAND_PALM_NORMAL_IN.x * seat,
    HAND_PALM_CONTACT.y + HAND_PALM_NORMAL_IN.y * seat,
    HAND_PALM_CONTACT.z + HAND_PALM_NORMAL_IN.z * seat,
  );
  out.x *= Math.sign(side) || 1;
  return out;
}

/** Hand-local curl axis, mirrored the way the shipped rig mirrors hands. */
export function handCurlAxis(side: number, out = new THREE.Vector3()) {
  const mirror = Math.sign(side) || 1;
  return out
    .set(SKI_HAND_CURL_AXIS.x, mirror * SKI_HAND_CURL_AXIS.y, mirror * SKI_HAND_CURL_AXIS.z)
    .normalize();
}

/**
 * Curl axis signed from the pinky side toward the index/thumb side, measured
 * from the shipped rig's finger-root line (dot ±0.896 with the raw axis, so
 * the sign is unambiguous): the mirrored raw axis is already thumb-ward on
 * the right hand and pinky-ward on the left. Grip frames must use this
 * signed form or the left thumb lands on the wrong end of a stopped handle.
 */
export function handCurlAxisThumbward(side: number, out = new THREE.Vector3()) {
  return handCurlAxis(side, out).multiplyScalar(Math.sign(side) || 1);
}

/**
 * Hand long axis — wrist origin toward the middle-finger root — in hand-local
 * space, measured from the sealed contract's composed helper rest transforms
 * (right hand; x mirrors). A flat wrist is the pose where this axis continues
 * the forearm line, which makes it the lever the spin-relief below optimises.
 */
export const HAND_LONG_AXIS = Object.freeze({ x: 0.926, y: 0.105, z: 0.363 } as const);

export function handLongAxis(side: number, out = new THREE.Vector3()) {
  const mirror = Math.sign(side) || 1;
  return out.set(mirror * HAND_LONG_AXIS.x, HAND_LONG_AXIS.y, HAND_LONG_AXIS.z).normalize();
}

/**
 * Outward palm normal of the right hand in hand-local space — the direction
 * the palm actually faces. Measured from the shipped GLB's bind geometry as
 * the normal of the plane through the wrist origin, the middle-finger root
 * and the pinky→index knuckle line, signed toward the grip channel (a held
 * cylinder sits against the palm). Left mirrors x.
 *
 * This is NOT `HAND_PALM_NORMAL_IN`, and the distinction matters: that vector
 * is the palm-skin→channel-centre *construction* ray used to seat a cylinder,
 * and it sits 61.3° away from the true palm facing (signed about the
 * thumbward axis, invariant of shaft direction). Resolving a grip's roll
 * against the construction ray therefore mis-set the palm by that fixed 61.3°
 * everywhere; on a near-horizontal handle it happened to land on a plausible
 * overhand grip, but on a ski pole whose inclination sweeps 79° across the
 * cycle it drove forearm pronation through 147° of range and past the human
 * limit.
 */
export const HAND_PALM_NORMAL_OUT = Object.freeze({
  x: -0.1052,
  y: -0.8513,
  z: 0.514,
} as const);

export function handPalmNormalOut(side: number, out = new THREE.Vector3()) {
  const mirror = Math.sign(side) || 1;
  return out
    .set(mirror * HAND_PALM_NORMAL_OUT.x, HAND_PALM_NORMAL_OUT.y, HAND_PALM_NORMAL_OUT.z)
    .normalize();
}

/**
 * World-space direction the outward palm normal should face for a requested
 * forearm pronation, given the arm's own geometry.
 *
 * Pronation is the rotation of the palm about the forearm's long axis,
 * measured from the elbow's hinge axis: 0 is the neutral handshake (thumb up,
 * palm medial) and ±90° is roughly the human limit. Supplying this as the
 * grip's roll reference makes pronation a bounded *input* to the hand frame
 * rather than an unconstrained output of wherever the equipment happens to
 * point — which is what let the SkiErg hand rotate past anatomy.
 */
export function pronationRollReference(
  shoulder: THREE.Vector3,
  elbow: THREE.Vector3,
  wrist: THREE.Vector3,
  pronation: number,
  side: number,
  out = new THREE.Vector3(),
): boolean {
  PRONATION_FORE.copy(wrist).sub(elbow);
  PRONATION_UPPER.copy(elbow).sub(shoulder);
  if (PRONATION_FORE.lengthSq() < 1e-10 || PRONATION_UPPER.lengthSq() < 1e-10) return false;
  PRONATION_FORE.normalize();
  PRONATION_UPPER.normalize();
  // The hinge axis is a cross product, so it mirrors as a pseudovector; the
  // side factor restores one shared convention across both arms.
  PRONATION_HINGE.crossVectors(PRONATION_UPPER, PRONATION_FORE);
  if (PRONATION_HINGE.lengthSq() < 1e-8) return false; // straight arm: no hinge plane
  PRONATION_HINGE.normalize().multiplyScalar(Math.sign(side) || 1);
  out
    .copy(PRONATION_HINGE)
    .applyAxisAngle(PRONATION_FORE, (Math.sign(side) || 1) * pronation)
    .normalize();
  return true;
}

const PRONATION_FORE = new THREE.Vector3();
const PRONATION_UPPER = new THREE.Vector3();
const PRONATION_HINGE = new THREE.Vector3();

const SPIN_LONG = new THREE.Vector3();
const SPIN_FOREARM = new THREE.Vector3();
const SPIN_QUAT = new THREE.Quaternion();

/**
 * Relieve the wrist by spending the grip's one free degree of freedom — spin
 * about the shaft — on flatness: rotate the hand about the shaft so its long
 * axis continues the forearm line as nearly as the palm cone allows. Without
 * this, a frame pinned to "palm exactly on the reference" can demand ~100° of
 * combined wrist bend, which linear-blend skinning concentrates at the wrist
 * ring and renders as a severed hand. The clamp keeps the palm within
 * `maxPalmDeviation` of the requested reference, so the relief can never spin
 * the palm away from the side the technique requires. Deterministic and
 * continuous: the optimum angle is a smooth function of the forearm
 * direction, and the clamp is a plain interval clamp.
 */
export function refineGripSpinForWrist(
  hand: THREE.Object3D,
  side: number,
  shaftDir: THREE.Vector3,
  forearmDir: THREE.Vector3,
  maxPalmDeviation: number,
): void {
  const shaft = FRAME_TARGET.copy(shaftDir).normalize();
  handLongAxis(side, SPIN_LONG).applyQuaternion(hand.quaternion);
  SPIN_LONG.addScaledVector(shaft, -SPIN_LONG.dot(shaft));
  SPIN_FOREARM.copy(forearmDir).addScaledVector(shaft, -forearmDir.dot(shaft));
  if (SPIN_LONG.lengthSq() < 1e-8 || SPIN_FOREARM.lengthSq() < 1e-6) return;
  SPIN_LONG.normalize();
  SPIN_FOREARM.normalize();
  const angle = Math.atan2(
    FRAME_ROLL.crossVectors(SPIN_LONG, SPIN_FOREARM).dot(shaft),
    SPIN_LONG.dot(SPIN_FOREARM),
  );
  const clamped = THREE.MathUtils.clamp(angle, -maxPalmDeviation, maxPalmDeviation);
  if (Math.abs(clamped) < 1e-6) return;
  hand.quaternion.premultiply(SPIN_QUAT.setFromAxisAngle(shaft, clamped));
}

/** Hand-local inward palm normal, mirrored the way the rig mirrors hands. */
export function handPalmNormalIn(side: number, out = new THREE.Vector3()) {
  const mirror = Math.sign(side) || 1;
  return out
    .set(mirror * HAND_PALM_NORMAL_IN.x, HAND_PALM_NORMAL_IN.y, HAND_PALM_NORMAL_IN.z)
    .normalize();
}

/**
 * Relieve the wrist with the grip's second anatomical freedom — the shaft
 * running *diagonally* across the palm — by tilting the hand about its own
 * palm normal toward the forearm line, but only for the misalignment beyond
 * `comfort`. A real pole is never held exactly square across the fist at a
 * high reach: the grip rides from the index base toward the pinky heel,
 * which is precisely a rotation about the palm normal. Because the palm
 * normal is the rotation axis, the palm's facing direction is bit-exact
 * unchanged — the palms-inward contract cannot be traded away by this
 * relief. The comfort gate keeps calm phases untouched: the digit closure
 * is solved once in rest space against the authored channel, so a tilt is a
 * real (bounded) divergence between the closed fingers and the shaft, spent
 * only where the square-across-the-fist convention would otherwise tear the
 * wrist ring open. Deterministic and continuous: the misalignment angle is
 * a smooth function of the pose and the excess-over-comfort mapping is
 * continuous at the gate.
 */
export function refineGripTiltForWrist(
  hand: THREE.Object3D,
  side: number,
  forearmDir: THREE.Vector3,
  comfort: number,
  maxTilt: number,
  /**
   * 0..1 scale on the applied tilt. When the forearm sweeps near the shaft
   * line (a sculling feather/extraction), the projected flat-wrist target
   * spins and a full-strength tilt chases it, breaking frame-to-frame
   * continuity. Callers fade the tilt smoothly through that window instead —
   * a brief wrist flex at the feather is textbook rowing.
   */
  strength = 1,
): void {
  // Rotate about the TRUE palm normal. This used `HAND_PALM_NORMAL_IN`, which
  // is the channel-construction ray sitting 75.5° away — so the "palm facing
  // unchanged" guarantee in this function's own contract was false, and the
  // tilt silently re-rolled the palm by up to `maxTilt` after the grip frame
  // had deliberately set it. That is what let the inversion return.
  handPalmNormalOut(side, FRAME_TARGET).applyQuaternion(hand.quaternion).normalize();
  handLongAxis(side, SPIN_LONG).applyQuaternion(hand.quaternion);
  SPIN_LONG.addScaledVector(FRAME_TARGET, -SPIN_LONG.dot(FRAME_TARGET));
  SPIN_FOREARM.copy(forearmDir).addScaledVector(FRAME_TARGET, -forearmDir.dot(FRAME_TARGET));
  if (SPIN_LONG.lengthSq() < 1e-8 || SPIN_FOREARM.lengthSq() < 1e-6) return;
  SPIN_LONG.normalize();
  SPIN_FOREARM.normalize();
  const angle = Math.atan2(
    FRAME_ROLL.crossVectors(SPIN_LONG, SPIN_FOREARM).dot(FRAME_TARGET),
    SPIN_LONG.dot(SPIN_FOREARM),
  );
  const excess = Math.max(0, Math.abs(angle) - comfort);
  const clamped =
    Math.sign(angle) * Math.min(excess, maxTilt) * THREE.MathUtils.clamp(strength, 0, 1);
  if (Math.abs(clamped) < 1e-6) return;
  hand.quaternion.premultiply(SPIN_QUAT.setFromAxisAngle(FRAME_TARGET, clamped));
}

/** One solved digit-stage rotation: rest × oppose × flex, as radians. */
export interface HandDigitStagePose {
  readonly helper: string;
  readonly flex: number;
  readonly oppose: number;
}

export interface HandGripSurface {
  /** Cylinder/capsule radius of the held equipment (m). */
  readonly radius: number;
  /**
   * Signed axial coordinate (along the thumb-ward channel axis, from the
   * channel centre) of a flat handle end for the thumb to press — the scull
   * rubber's thumb stop. Omit for continuous shafts (pole, hood body).
   */
  readonly thumbEndAxial?: number;
}

export interface HandGripClosureOptions {
  readonly side: number;
  readonly surface: HandGripSurface;
  /** Base opposition (local Z at the thumb root) bringing the thumb across. */
  readonly thumbOppose: number;
  /**
   * Effective flesh radius of a finger pad pressed onto the surface.
   * Defaults to the rig-calibrated `DEFAULT_DIGIT_FLESH`.
   */
  readonly fingerFlesh?: number;
  /**
   * Effective flesh radius of the thumb pad. Defaults to the rig-calibrated
   * `DEFAULT_DIGIT_FLESH` radially and to `THUMB_END_PAD_ALLOWANCE` for the
   * axial press onto a flat handle end.
   */
  readonly thumbFlesh?: number;
}

export interface HandDigitContactReport {
  readonly digit: string;
  /** Distance of the closest bone point to the equipment surface (m, signed: negative = penetration). */
  readonly surfaceDistance: number;
  /** True when the digit stopped because it reached the surface, not its flex limit. */
  readonly contact: boolean;
  /** Solved tip position in hand-local space. */
  readonly tip: readonly [number, number, number];
}

export interface HandGripClosure {
  readonly poses: readonly HandDigitStagePose[];
  readonly contacts: readonly HandDigitContactReport[];
}

interface DigitJoint {
  readonly helper: string;
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
}

export interface HandDigitChain {
  readonly digit: "index" | "middle" | "ring" | "pinky" | "thumb";
  /** Joints proximal→distal, in hand-local rest space. */
  readonly joints: readonly DigitJoint[];
  /** Estimated distal-tip length beyond the last joint (m). */
  readonly tipLength: number;
  /**
   * Rest transform (relative to the hand) of the `v4*Fingers` palm-cup helper
   * the chain hangs under, when there is one — the pivot about which the
   * closure applies `HAND_CLOSURE_CUP` so the solve happens in the carrying
   * pose the grip channel was fitted in. Thumbs parent the hand directly and
   * carry no cup node.
   */
  readonly cupNode?: DigitJoint;
}

// Full-fist anatomical maxima (MCP ~90°, PIP ~110°, DIP ~80°; thumb MCP/IP
// ~60/80°): the closure stops at contact, so these bind only for digits that
// genuinely cannot reach a thin shaft — a pinky short of a 17 mm pole should
// close all the way, not hang half-open at a styled limit.
const FINGER_STAGE_LIMITS = [1.57, 1.92, 1.4] as const;
const THUMB_STAGE_LIMITS = [1.0, 1.25, 1.35] as const;
/**
 * Digit-pad flesh calibrated from the rig's own approved envelope, not from
 * anatomy tables: the fitted SkiErg fist closes its bone helpers onto a
 * 0.0169 m circle around the 0.016 m rendered rubber, so a helper of this
 * low-poly mesh sits ~0.9 mm off the equipment it presses — the helper lines
 * run at the skin, not at anatomical bone depth. The former textbook 8 mm pad
 * held every solved knuckle 8 mm off the shaft and left the closure a hook
 * that could never cage what the shipped mesh visibly grips.
 */
const DEFAULT_DIGIT_FLESH = SKI_HAND_FIST_RADIUS - SKI_POLE_GRIP_RADIUS;
/**
 * Axial allowance for a thumb pressing a flat handle end. This is a different
 * quantity from the radial digit flesh: the chain's tip point is an estimate
 * projected past the distal joint, and the end-press contact patch is the pad
 * *under* that tip, roughly a distal-phalanx pad length behind it. Pressing
 * the estimated tip all the way onto the end plane instead swings the thumb
 * around the handle rim chasing millimetres of axial reach.
 */
const THUMB_END_PAD_ALLOWANCE = 0.0095;
/**
 * Samples used to sweep one stage's flexion range: to bracket the emergence
 * of a digit that starts inside the grip surface, to catch a non-monotone
 * mid-range touch, and to hold the closest approach when the surface is
 * unreachable. The closure runs once per hand when a lane is built (never per
 * frame), so a dense sweep is free; 24 samples resolve every crossing on the
 * shipped rig at both the 16.9 mm pole and the 23 mm scull radius.
 */
const CLOSURE_EMERGE_SAMPLES = 24;

/**
 * Palm-cup carrying posture the grip channel was fitted under: the legacy
 * SkiErg render applies this rotation about the `v4*Fingers` helper's local Y
 * before curling, and the pinned `SKI_HAND_FIST_CENTRE` circle was measured
 * in that pose ("derives the SkiErg curl axis and grip channel from the
 * authored rig"). The closure must solve in the same space — with the cup at
 * rest the finger roots collapse onto the fitted axis and no digit can wrap
 * around a channel that runs through its own knuckles.
 */
export const HAND_CLOSURE_CUP = 0.14;

/**
 * Extract one hand's digit chains from a V4 skeleton in hand-local rest
 * space. Helper rest transforms come from the loaded asset (or the reference
 * rig), so the closure is solved against the athlete that actually renders.
 */
export function collectHandDigitChains(
  hand: THREE.Object3D,
  getBone: (name: string) => THREE.Object3D | null | undefined,
  side: number,
): HandDigitChain[] {
  const prefix = side < 0 ? "v4Left" : "v4Right";
  const chains: HandDigitChain[] = [];
  const digits: readonly ["index" | "middle" | "ring" | "pinky" | "thumb", readonly string[]][] = [
    ["index", [`${prefix}IndexProximal`, `${prefix}IndexIntermediate`, `${prefix}IndexDistal`]],
    ["middle", [`${prefix}MiddleProximal`, `${prefix}MiddleIntermediate`, `${prefix}MiddleDistal`]],
    ["ring", [`${prefix}RingProximal`, `${prefix}RingIntermediate`, `${prefix}RingDistal`]],
    ["pinky", [`${prefix}PinkyProximal`, `${prefix}PinkyIntermediate`, `${prefix}PinkyDistal`]],
    ["thumb", [`${prefix}Thumb`, `${prefix}ThumbIntermediate`, `${prefix}ThumbDistal`]],
  ];
  for (const [digit, names] of digits) {
    const joints: DigitJoint[] = [];
    let cupNode: DigitJoint | undefined;
    let complete = true;
    for (const name of names) {
      const bone = getBone(name);
      if (!bone) {
        complete = false;
        break;
      }
      // Compose the bone's rest transform relative to the hand bone.
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      let current: THREE.Object3D | null = bone;
      const stack: THREE.Object3D[] = [];
      while (current && current !== hand) {
        stack.push(current);
        current = current.parent;
      }
      if (current !== hand) {
        complete = false;
        break;
      }
      for (let index = stack.length - 1; index >= 0; index--) {
        const node = stack[index]!;
        position.add(node.position.clone().applyQuaternion(quaternion));
        quaternion.multiply(node.quaternion);
        if (!cupNode && node.name === `${prefix}Fingers`) {
          cupNode = {
            helper: node.name,
            position: position.clone(),
            quaternion: quaternion.clone(),
          };
        }
      }
      joints.push({ helper: name, position, quaternion });
    }
    if (!complete || joints.length < 3) continue;
    const tipLength = Math.max(0.012, joints[2]!.position.distanceTo(joints[1]!.position) * 0.92);
    chains.push({ digit, joints, tipLength, ...(cupNode ? { cupNode } : {}) });
  }
  return chains;
}

const CLOSURE_AXIS = new THREE.Vector3();
const CLOSURE_CENTRE = new THREE.Vector3();
const CLOSURE_DELTA = new THREE.Vector3();
const CLOSURE_STAGE_ROT = new THREE.Quaternion();
const CLOSURE_OPPOSE_ROT = new THREE.Quaternion();
const CLOSURE_LOCAL_X = new THREE.Vector3(1, 0, 0);
const CLOSURE_LOCAL_Y = new THREE.Vector3(0, 1, 0);
const CLOSURE_LOCAL_Z = new THREE.Vector3(0, 0, 1);

function distanceToAxis(point: THREE.Vector3): number {
  CLOSURE_DELTA.copy(point).sub(CLOSURE_CENTRE);
  const along = CLOSURE_DELTA.dot(CLOSURE_AXIS);
  return Math.sqrt(Math.max(0, CLOSURE_DELTA.lengthSq() - along * along));
}

function axialCoordinate(point: THREE.Vector3): number {
  return CLOSURE_DELTA.copy(point).sub(CLOSURE_CENTRE).dot(CLOSURE_AXIS);
}

/**
 * Forward-kinematics of one digit chain for candidate stage flexions.
 * Returns the chain's points (joint origins beyond the flexed stage plus the
 * tip) in hand-local space. Stages beyond `stageCount` keep their rest pose.
 */
function digitPoints(
  chain: HandDigitChain,
  flexions: readonly number[],
  oppose: number,
  output: THREE.Vector3[],
): THREE.Vector3[] {
  let parentPosition = chain.joints[0]!.position;
  let parentQuaternion = new THREE.Quaternion().copy(chain.joints[0]!.quaternion);
  CLOSURE_OPPOSE_ROT.setFromAxisAngle(CLOSURE_LOCAL_Z, oppose);
  CLOSURE_STAGE_ROT.setFromAxisAngle(CLOSURE_LOCAL_X, -(flexions[0] ?? 0));
  parentQuaternion.multiply(CLOSURE_OPPOSE_ROT).multiply(CLOSURE_STAGE_ROT);
  output[0]!.copy(parentPosition);
  for (let stage = 1; stage < chain.joints.length; stage++) {
    const joint = chain.joints[stage]!;
    const previous = chain.joints[stage - 1]!;
    // The child's rest offset/orientation relative to its parent joint.
    const localPosition = joint.position
      .clone()
      .sub(previous.position)
      .applyQuaternion(previous.quaternion.clone().invert());
    const localQuaternion = previous.quaternion.clone().invert().multiply(joint.quaternion);
    const worldPosition = localPosition.applyQuaternion(parentQuaternion).add(parentPosition);
    const worldQuaternion = parentQuaternion.clone().multiply(localQuaternion);
    CLOSURE_STAGE_ROT.setFromAxisAngle(CLOSURE_LOCAL_X, -(flexions[stage] ?? 0));
    worldQuaternion.multiply(CLOSURE_STAGE_ROT);
    output[stage]!.copy(worldPosition);
    parentPosition = worldPosition;
    parentQuaternion = worldQuaternion;
  }
  const tipOffset = new THREE.Vector3(0, chain.tipLength, 0).applyQuaternion(parentQuaternion);
  output[chain.joints.length]!.copy(parentPosition).add(tipOffset);
  return output;
}

/**
 * Apply the carrying cup to a finger chain: conjugate every joint by the cup
 * rotation about the `v4*Fingers` node, exactly the composition the renderer
 * applies to the live helper (`rest × R_y(-side·cup)`). Chains without a cup
 * node (thumbs, minimal test rigs) pass through untouched.
 */
function cupChain(chain: HandDigitChain, side: number): HandDigitChain {
  const cup = chain.cupNode;
  if (!cup) return chain;
  const roll = new THREE.Quaternion().setFromAxisAngle(
    CLOSURE_LOCAL_Y,
    -(Math.sign(side) || 1) * HAND_CLOSURE_CUP,
  );
  const conjugate = cup.quaternion.clone().multiply(roll).multiply(cup.quaternion.clone().invert());
  return {
    ...chain,
    joints: chain.joints.map((joint) => ({
      helper: joint.helper,
      position: joint.position
        .clone()
        .sub(cup.position)
        .applyQuaternion(conjugate)
        .add(cup.position),
      quaternion: conjugate.clone().multiply(joint.quaternion),
    })),
  };
}

/**
 * Close every digit of one hand around an equipment surface.
 *
 * The capsule axis runs through `handChannelCentre(radius)` along the hand's
 * curl axis, thumb-ward positive; finger chains are first posed into the
 * `HAND_CLOSURE_CUP` carrying posture the channel was fitted in. Each stage
 * flexes until the first constrained bone point reaches the surface
 * (radius + pad flesh) and stops there — a deep-penetration pose cannot be
 * produced because contact is the stop condition, and an unreachable surface
 * holds the closest approach with `contact: false` reported for the tests to
 * judge.
 */
export function solveHandGripClosure(
  chains: readonly HandDigitChain[],
  options: HandGripClosureOptions,
): HandGripClosure {
  const { surface } = options;
  const fingerFlesh = options.fingerFlesh ?? DEFAULT_DIGIT_FLESH;
  // Pose the finger chains into the fitted carrying cup before any geometry
  // is read: axis signing, closure, and contact reporting all happen in the
  // same space the renderer will draw.
  const posed = chains.map((chain) => cupChain(chain, options.side));
  handCurlAxis(options.side, CLOSURE_AXIS);
  // Thumb-ward sign: the axis must point from the pinky side toward the
  // index/thumb side so `thumbEndAxial` has one meaning on both hands.
  const index = posed.find((chain) => chain.digit === "index");
  const pinky = posed.find((chain) => chain.digit === "pinky");
  if (index && pinky) {
    CLOSURE_DELTA.copy(index.joints[0]!.position).sub(pinky.joints[0]!.position);
    if (CLOSURE_DELTA.dot(CLOSURE_AXIS) < 0) CLOSURE_AXIS.negate();
  }
  handChannelCentre(surface.radius, options.side, CLOSURE_CENTRE);

  const poses: HandDigitStagePose[] = [];
  const contacts: HandDigitContactReport[] = [];

  const points = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];
  for (const chain of posed) {
    const isThumb = chain.digit === "thumb";
    const limits = isThumb ? THUMB_STAGE_LIMITS : FINGER_STAGE_LIMITS;
    const oppose = isThumb ? Math.sign(options.side) * options.thumbOppose : 0;
    const flexions: number[] = [0, 0, 0];
    const thumbEnd = isThumb && surface.thumbEndAxial !== undefined;
    const flesh = isThumb
      ? (options.thumbFlesh ?? (thumbEnd ? THUMB_END_PAD_ALLOWANCE : DEFAULT_DIGIT_FLESH))
      : fingerFlesh;

    // A thumb lies nearly along the shaft it opposes: its thenar and web
    // press flesh-deep against the grip by design (that press *is* the
    // required web-seat contact), so in radial mode only the pad tip is the
    // opposing contact the solver may constrain. Fingers wrap across the
    // shaft and constrain every downstream point.
    const firstCollisionPoint = (stage: number): number =>
      isThumb && !thumbEnd ? chain.joints.length : stage + 1;

    const clearance = (stage: number): number => {
      digitPoints(chain, flexions, oppose, points);
      let nearest = Number.POSITIVE_INFINITY;
      for (
        let pointIndex = firstCollisionPoint(stage);
        pointIndex <= chain.joints.length;
        pointIndex++
      ) {
        const point = points[pointIndex]!;
        if (thumbEnd) {
          // The thumb lies along the handle beyond its flat end and presses
          // the end face from outside — "thumbs on the handle ends" — so
          // clearance is the axial distance still to travel down onto the
          // stop, positive while beyond it and zero at pad contact.
          const axial = axialCoordinate(point);
          nearest = Math.min(nearest, axial - surface.thumbEndAxial! - flesh);
        } else {
          nearest = Math.min(nearest, distanceToAxis(point) - surface.radius - flesh);
        }
      }
      return nearest;
    };

    for (let stage = 0; stage < chain.joints.length; stage++) {
      const limit: number = limits[stage] ?? 1;
      flexions[stage] = 0;
      if (clearance(stage) > 0) {
        // Outside the surface: close until the first constrained bone point
        // lands on it.
        flexions[stage] = limit;
        if (clearance(stage) > 0) {
          // Fully flexed still clears. Either the surface is beyond reach, or
          // the sweep is non-monotone: it can dip onto the surface mid-range
          // and recede again (the thumb's arc bows away from a shaft seated
          // against its own web). Scan for a mid-range touch first.
          let best = limit;
          let bestClearance = clearance(stage);
          let touched = -1;
          let before = 0;
          for (let sample = 0; sample < CLOSURE_EMERGE_SAMPLES; sample++) {
            const candidate = (limit * sample) / CLOSURE_EMERGE_SAMPLES;
            flexions[stage] = candidate;
            const value = clearance(stage);
            if (value <= 0) {
              touched = candidate;
              break;
            }
            before = candidate;
            if (value < bestClearance) {
              bestClearance = value;
              best = candidate;
            }
          }
          if (touched < 0) {
            // No touch anywhere in range. A finger's non-terminal stage still
            // curls fully: the wrap it carries is what brings the *next*
            // segment around the shaft (a pinky short of the surface closes
            // all the way, not half-open at a styled hover). The tip stage —
            // and every stage of a radial thumb, whose single pad contact all
            // three stages share — instead holds the closest approach, since
            // curling past it walks the pad away from the equipment.
            const holdClosest = (isThumb && !thumbEnd) || stage === chain.joints.length - 1;
            flexions[stage] = holdClosest ? best : limit;
            continue;
          }
          let low = before;
          let high = touched;
          for (let iteration = 0; iteration < 28; iteration++) {
            const middle = (low + high) / 2;
            flexions[stage] = middle;
            if (clearance(stage) > 0) low = middle;
            else high = middle;
          }
          flexions[stage] = low;
          continue;
        }
        let low = 0;
        let high = limit;
        for (let iteration = 0; iteration < 28; iteration++) {
          const middle = (low + high) / 2;
          flexions[stage] = middle;
          if (clearance(stage) > 0) low = middle;
          else high = middle;
        }
        flexions[stage] = low;
        continue;
      }

      // The stage starts *inside* the surface. This is not "already
      // touching": the channel model seats a cylinder of the requested radius
      // against the palm, so on a thick handle the ulnar knuckles genuinely
      // begin inboard of the rubber. Freezing the stage at rest there authors
      // precisely the deep penetration this solver promises it cannot
      // produce — the pinky proximal phalanx ended 5.4 mm inside the 23 mm
      // scull grip, which renders as fingers passing through the handle.
      // Close further instead: the segment sweeps around the shaft and
      // emerges onto the far side, which is what a real finger does when the
      // handle is thicker than the span from its own knuckle. Clearance is
      // not monotonic across that sweep, so sample first and then bisect the
      // bracket that contains the crossing.
      let previous = 0;
      let emerged = -1;
      for (let sample = 1; sample <= CLOSURE_EMERGE_SAMPLES; sample++) {
        const candidate = (limit * sample) / CLOSURE_EMERGE_SAMPLES;
        flexions[stage] = candidate;
        if (clearance(stage) > 0) {
          emerged = candidate;
          break;
        }
        previous = candidate;
      }
      if (emerged < 0) {
        // No pose in anatomical range clears the surface. Keep the flexion
        // that penetrates least so the reported contact distance is the
        // honest best this anatomy can reach rather than the rest-pose worst,
        // and `contact` still tells callers the digit never made a clean
        // landing.
        let best = 0;
        let bestClearance = Number.NEGATIVE_INFINITY;
        for (let sample = 0; sample <= CLOSURE_EMERGE_SAMPLES; sample++) {
          const candidate = (limit * sample) / CLOSURE_EMERGE_SAMPLES;
          flexions[stage] = candidate;
          const value = clearance(stage);
          if (value > bestClearance) {
            bestClearance = value;
            best = candidate;
          }
        }
        flexions[stage] = best;
        continue;
      }
      // Stop at the first flexion that clears: the segment rests on the
      // surface instead of continuing to curl into free space.
      let low = previous;
      let high = emerged;
      for (let iteration = 0; iteration < 28; iteration++) {
        const middle = (low + high) / 2;
        flexions[stage] = middle;
        if (clearance(stage) > 0) high = middle;
        else low = middle;
      }
      flexions[stage] = high;
    }

    digitPoints(chain, flexions, oppose, points);
    let surfaceDistance = Number.POSITIVE_INFINITY;
    for (let pointIndex = firstCollisionPoint(0); pointIndex <= chain.joints.length; pointIndex++) {
      const point = points[pointIndex]!;
      surfaceDistance = Math.min(
        surfaceDistance,
        thumbEnd
          ? axialCoordinate(point) - surface.thumbEndAxial! - flesh
          : distanceToAxis(point) - surface.radius - flesh,
      );
    }
    contacts.push({
      digit: chain.digit,
      surfaceDistance,
      contact: surfaceDistance < 0.004,
      tip: [
        points[chain.joints.length]!.x,
        points[chain.joints.length]!.y,
        points[chain.joints.length]!.z,
      ],
    });
    for (let stage = 0; stage < chain.joints.length; stage++) {
      poses.push({
        helper: chain.joints[stage]!.helper,
        flex: flexions[stage]!,
        oppose: stage === 0 ? oppose : 0,
      });
    }
  }
  return { poses, contacts };
}

const FRAME_AXIS = new THREE.Vector3();
const FRAME_TARGET = new THREE.Vector3();
const FRAME_ROLL = new THREE.Vector3();
const FRAME_SWING = new THREE.Quaternion();

/**
 * Orient a hand target so its authored grip channel encloses the equipment:
 * the curl axis lands exactly on the thumb-ward signed shaft direction and
 * the remaining spin about the shaft is resolved so the channel sits on the
 * requested side of the wrist. This is the SkiErg pole-frame construction
 * generalised to sculls and hoods; equipment roll about its own axis (blade
 * feathering) cancels out, which is exactly "the handle rolls within the
 * fingers". All arguments are read-only; the function is allocation-free so
 * it may run in the per-frame avatar path.
 *
 * @param shaftDirThumbward equipment channel axis in the hand's parent
 *   frame, already signed from the pinky side toward the thumb/index side —
 *   a signed axis (instead of nearest-arc guessing) makes the thumb end of a
 *   stopped handle deterministic.
 * @param rollReference desired direction of (channel centre − wrist) in the
 *   same frame — which side of the shaft the palm rides on.
 */
export function orientHandToGripChannel(
  hand: THREE.Object3D,
  side: number,
  radius: number,
  shaftDirThumbward: THREE.Vector3,
  rollReference: THREE.Vector3,
  baseQuaternion: THREE.Quaternion,
  /**
   * Hand-local vector aligned to `rollReference` when resolving the remaining
   * spin about the shaft. Defaults to the channel-centre construction ray for
   * the sports whose rendered grips were approved against it; pass
   * `handPalmNormalOut(side)` to resolve roll against the palm's true facing.
   */
  rollVectorLocal?: THREE.Vector3,
): void {
  hand.quaternion.copy(baseQuaternion);
  handCurlAxisThumbward(side, FRAME_AXIS).applyQuaternion(hand.quaternion);
  FRAME_TARGET.copy(shaftDirThumbward).normalize();
  hand.quaternion.premultiply(FRAME_SWING.setFromUnitVectors(FRAME_AXIS, FRAME_TARGET));

  if (rollVectorLocal) FRAME_AXIS.copy(rollVectorLocal).normalize();
  else handChannelCentre(radius, side, FRAME_AXIS).normalize();
  FRAME_AXIS.applyQuaternion(hand.quaternion);
  FRAME_ROLL.copy(rollReference).normalize();
  FRAME_AXIS.addScaledVector(FRAME_TARGET, -FRAME_AXIS.dot(FRAME_TARGET));
  FRAME_ROLL.addScaledVector(FRAME_TARGET, -FRAME_ROLL.dot(FRAME_TARGET));
  if (FRAME_AXIS.lengthSq() > 1e-8 && FRAME_ROLL.lengthSq() > 1e-8) {
    FRAME_AXIS.normalize();
    FRAME_ROLL.normalize();
    const cosine = THREE.MathUtils.clamp(FRAME_AXIS.dot(FRAME_ROLL), -1, 1);
    // Both vectors are perpendicular to FRAME_TARGET, so their signed angle
    // is an axial roll. Using atan2 keeps the exact 180° case on the shaft
    // axis; setFromUnitVectors has no unique cross-axis there and can choose a
    // swing that destroys the alignment established above.
    const sine = FRAME_AXIS.cross(FRAME_ROLL).dot(FRAME_TARGET);
    hand.quaternion.premultiply(
      FRAME_SWING.setFromAxisAngle(FRAME_TARGET, Math.atan2(sine, cosine)),
    );
  }
}
