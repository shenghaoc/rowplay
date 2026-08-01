import { describe, expect, it } from "vite-plus/test";
import * as THREE from "three";
import {
  ROWER_ELBOW_PLANE,
  ROWER_FOOT_CONTACT,
  ROWER_OARLOCK,
  ROWER_STRETCHER,
  rowerElbowFlexion,
  rowerElbowPlaneAuthority,
  solveRowerArmWithCorridor,
  solveRowerOarYaw,
} from "./rowRig";

/** Grip world position for a pin-mounted oar under Three's XYZ Euler order. */
function gripAt(
  pin: THREE.Vector3,
  signedInboard: number,
  yaw: number,
  roll: number,
): THREE.Vector3 {
  return new THREE.Vector3(signedInboard, 0, 0)
    .applyEuler(new THREE.Euler(0, yaw, roll, "XYZ"))
    .add(pin);
}

describe("rowRig constants", () => {
  it("keeps the stretcher inside British Rowing rigging guidance", () => {
    const rampFromHorizontal =
      90 - Math.abs(THREE.MathUtils.radToDeg(ROWER_STRETCHER.boardRotation));
    expect(rampFromHorizontal).toBeGreaterThanOrEqual(38);
    expect(rampFromHorizontal).toBeLessThanOrEqual(45);
    expect(ROWER_FOOT_CONTACT.z).toBeGreaterThan(ROWER_STRETCHER.centerZ);
    expect(ROWER_FOOT_CONTACT.y).toBeLessThan(ROWER_STRETCHER.centerY);
  });

  it("keeps the oarlock pin between the gunwale and the lower-rib draw", () => {
    expect(ROWER_OARLOCK.y).toBeGreaterThan(0.3);
    expect(ROWER_OARLOCK.y).toBeLessThan(0.62);
    expect(ROWER_OARLOCK.lateral).toBeGreaterThan(0.7);
  });
});

describe("solveRowerOarYaw", () => {
  const shoulder = new THREE.Vector3(-0.19, 0.85, 0.3);
  const pin = new THREE.Vector3(-ROWER_OARLOCK.lateral, ROWER_OARLOCK.y, ROWER_OARLOCK.z);
  const inboard = 0.78;
  const roll = 0.28;

  it("returns the preferred yaw whenever the shoulder can reach it", () => {
    const preferred = -0.4;
    const reachable = gripAt(pin, inboard, preferred, roll).distanceTo(shoulder) + 0.05;
    const yaw = solveRowerOarYaw(
      shoulder,
      pin.x,
      pin.y,
      pin.z,
      inboard,
      roll,
      reachable,
      preferred,
    );
    expect(yaw).toBe(preferred);
  });

  it("places the grip exactly at the requested reach on the boundary", () => {
    // Any reach between the circle's nearest and farthest points must be met
    // exactly: the arm neither overstretches nor folds to satisfy the oar.
    for (const requested of [0.5, 0.58, 0.66]) {
      const yaw = solveRowerOarYaw(
        shoulder,
        pin.x,
        pin.y,
        pin.z,
        inboard,
        roll,
        requested,
        0.1,
        true,
      );
      const grip = gripAt(pin, inboard, yaw, roll);
      expect(grip.distanceTo(shoulder)).toBeCloseTo(requested, 6);
    }
  });

  it("selects the stretcher-side root so the catch stays in front of the athlete", () => {
    const requested = 0.58;
    const yaw = solveRowerOarYaw(
      shoulder,
      pin.x,
      pin.y,
      pin.z,
      inboard,
      roll,
      requested,
      0.1,
      true,
    );
    const chosen = gripAt(pin, inboard, yaw, roll);
    // The mirrored root at the same reach must not sit farther toward the
    // stretcher (+z) than the returned one.
    let best = -Infinity;
    for (let candidate = -Math.PI; candidate <= Math.PI; candidate += 1e-3) {
      const grip = gripAt(pin, inboard, candidate, roll);
      if (Math.abs(grip.distanceTo(shoulder) - requested) < 5e-4) {
        best = Math.max(best, grip.z);
      }
    }
    expect(chosen.z).toBeGreaterThan(best - 5e-3);
  });

  it("stays within a half-turn of the staged yaw across its branch cut", () => {
    for (const preferred of [-3, -1.5, 0, 1.5, 3]) {
      const yaw = solveRowerOarYaw(
        shoulder,
        pin.x,
        pin.y,
        pin.z,
        inboard,
        roll,
        0.55,
        preferred,
        true,
      );
      expect(Math.abs(yaw - preferred)).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });
});

describe("solveRowerArmWithCorridor", () => {
  const upperArm = 0.31;
  const forearm = 0.27;
  const shoulder = new THREE.Vector3(0.19, 0.88, -0.33);
  const wrist = new THREE.Vector3(0.36, 0.73, -0.08);

  function solve(minY: number, maxY: number, minZ = shoulder.z - 0.16) {
    const bendHint = new THREE.Vector3(0, -1, 0);
    const elbow = new THREE.Vector3();
    const hand = new THREE.Vector3();
    solveRowerArmWithCorridor(
      shoulder,
      wrist,
      upperArm,
      forearm,
      bendHint,
      elbow,
      hand,
      minZ,
      minY,
      maxY,
      1,
    );
    return { elbow, hand };
  }

  it("preserves both bone lengths while landing the wrist on the grip", () => {
    const { elbow, hand } = solve(wrist.y - 0.24, wrist.y - 0.05);
    expect(shoulder.distanceTo(elbow)).toBeCloseTo(upperArm, 6);
    expect(elbow.distanceTo(hand)).toBeCloseTo(forearm, 6);
    expect(hand.distanceTo(wrist)).toBeLessThan(1e-6);
  });

  it("hits a reachable height band exactly", () => {
    const target = wrist.y - 0.1;
    const { elbow } = solve(target - 0.001, target + 0.001, shoulder.z - 10);
    expect(elbow.y).toBeCloseTo(target, 3);
  });

  it("hangs the elbow at the bottom of its circle for a deep band", () => {
    // A band far below what the elbow circle can reach must clamp to the
    // lowest point: the down-pointing hang, not a sideways branch. Maximum
    // downness is bounded by the chord's own tilt — the perpendicular can
    // only be as vertical as the chord allows.
    const { elbow } = solve(wrist.y - 5, wrist.y - 4, shoulder.z - 10);
    const chord = wrist.clone().sub(shoulder);
    const chordDirection = chord.clone().normalize();
    const maxDownness = Math.sqrt(1 - chordDirection.y * chordDirection.y);
    const along = elbow.clone().sub(shoulder).dot(chord) / chord.lengthSq();
    const bendDirection = elbow
      .clone()
      .sub(shoulder.clone().addScaledVector(chord, along))
      .normalize();
    expect(bendDirection.y).toBeCloseTo(-maxDownness, 3);
  });

  it("rotates onto the behind-the-back floor instead of merely scoring it", () => {
    const unbounded = solve(wrist.y - 5, wrist.y - 4, shoulder.z - 10).elbow;
    const floor = unbounded.z + 0.02;
    const { elbow } = solve(wrist.y - 5, wrist.y - 4, floor);
    expect(elbow.z).toBeGreaterThanOrEqual(floor - 1e-6);
    expect(shoulder.distanceTo(elbow)).toBeCloseTo(upperArm, 6);
  });
});

describe("rowerElbowFlexion", () => {
  const upper = 0.32;
  const fore = 0.28;

  it("reads zero at full extension and grows as the arm draws in", () => {
    // Straight arm: chord is the summed segment lengths, interior angle pi.
    // The 1e-6 reach clamp lands just inside the singularity where acos'
    // slope is unbounded, so "straight" resolves to ~0.2 degrees rather than
    // exactly zero. That is far below the 0.14 rad (8 degrees) at which plane
    // authority starts, so it cannot reach the bend hint — but asserting an
    // exact zero here would be asserting a precision the geometry does not
    // have.
    const straight = rowerElbowFlexion(upper + fore, upper, fore);
    expect(straight).toBeGreaterThanOrEqual(0);
    expect(straight).toBeLessThan(0.005);
    expect(rowerElbowPlaneAuthority(straight)).toBe(0);
    // Drawing the hand in must increase flexion monotonically.
    let previous = 0;
    for (const chord of [0.58, 0.54, 0.5, 0.44, 0.38, 0.3]) {
      const flexion = rowerElbowFlexion(chord, upper, fore);
      expect(flexion, `chord ${chord} bends further than ${previous}`).toBeGreaterThan(previous);
      previous = flexion;
    }
  });

  it("stays finite on degenerate chords instead of returning NaN", () => {
    // Over-extension and full fold both sit outside the reachable triangle;
    // this runs every V4 rower frame, so a NaN here would poison the bend
    // hint rather than fail loudly.
    for (const chord of [0, -1, upper + fore + 0.5, Math.abs(upper - fore) - 0.01]) {
      const flexion = rowerElbowFlexion(chord, upper, fore);
      expect(Number.isFinite(flexion), `chord ${chord} is finite`).toBe(true);
      expect(flexion).toBeGreaterThanOrEqual(0);
      expect(flexion).toBeLessThanOrEqual(Math.PI);
    }
  });
});

describe("rowerElbowPlaneAuthority", () => {
  it("hands the plane no authority until flexion is visible, then all of it", () => {
    expect(rowerElbowPlaneAuthority(0)).toBe(0);
    expect(rowerElbowPlaneAuthority(ROWER_ELBOW_PLANE.authorityStart)).toBe(0);
    expect(rowerElbowPlaneAuthority(ROWER_ELBOW_PLANE.authorityFull)).toBe(1);
    expect(rowerElbowPlaneAuthority(Math.PI)).toBe(1);
    // Negative flexion cannot be produced by the solver, but the clamp must
    // hold anyway — this feeds a blend weight.
    expect(rowerElbowPlaneAuthority(-1)).toBe(0);
  });

  it("is C2 across the ramp so the bend hint cannot step mid-draw", () => {
    // Smootherstep: zero first and second derivatives at both ends. A step
    // here reads as the elbow snapping to a new branch during the draw.
    const { authorityStart, authorityFull } = ROWER_ELBOW_PLANE;
    const samples = 200;
    let previous = 0;
    let previousDelta = 0;
    for (let index = 1; index <= samples; index++) {
      const flexion = authorityStart + ((authorityFull - authorityStart) * index) / samples;
      const value = rowerElbowPlaneAuthority(flexion);
      const delta = value - previous;
      expect(value, "monotone").toBeGreaterThanOrEqual(previous);
      // Second difference stays small: no kink anywhere in the ramp.
      if (index > 1) expect(Math.abs(delta - previousDelta)).toBeLessThan(0.002);
      previous = value;
      previousDelta = delta;
    }
    expect(previous).toBeCloseTo(1, 9);
  });
});
