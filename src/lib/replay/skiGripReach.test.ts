import { describe, expect, it } from "vite-plus/test";
import * as THREE from "three";
import { HAND_FIST_CENTRE } from "./handGrip";
import {
  SKI_GRIP_REACH_MARGIN_M,
  SKI_POST_RELEASE_EXTENSION_CYCLE,
  SKI_POST_RELEASE_EXTENSION_END_CYCLE,
  SkiGripReachSolver,
  skiPostReleaseExtensionAuthority,
} from "./skiGripReach";

const POLE_LENGTH = 1.37;
const MINIMUM_REACH = 0.028;
const STRUCTURAL_REACH = 0.765;

function wristWorld(
  contact: THREE.Vector3,
  side: number,
  quaternion = new THREE.Quaternion(),
): THREE.Vector3 {
  return contact
    .clone()
    .sub(
      new THREE.Vector3(
        side * HAND_FIST_CENTRE.x,
        HAND_FIST_CENTRE.y,
        HAND_FIST_CENTRE.z,
      ).applyQuaternion(quaternion),
    );
}

describe("SkiGripReachSolver", () => {
  it("moves only a released basket enough to close an unreachable grip", () => {
    const solver = new SkiGripReachSolver(POLE_LENGTH, MINIMUM_REACH);
    const shoulder = new THREE.Vector3(0, 1.1, 0);
    const preferred = new THREE.Vector3(-0.35, 1.3, 0.5);
    const tip = new THREE.Vector3(-0.45, 0.055, 2.4);
    const originalTip = tip.clone();
    const solved = new THREE.Vector3();

    expect(
      solver.solve(
        shoulder,
        preferred,
        tip,
        STRUCTURAL_REACH,
        -1,
        new THREE.Quaternion(),
        new THREE.Quaternion(),
        true,
        solved,
      ),
    ).toBe(true);
    expect(tip.distanceTo(originalTip)).toBeGreaterThan(0);
    expect(solved.distanceTo(tip)).toBeCloseTo(POLE_LENGTH, 9);
    expect(wristWorld(solved, -1).distanceTo(shoulder)).toBeLessThanOrEqual(STRUCTURAL_REACH);
  });

  it("never moves a planted basket when the same geometry is unreachable", () => {
    const solver = new SkiGripReachSolver(POLE_LENGTH, MINIMUM_REACH);
    const shoulder = new THREE.Vector3(0, 1.1, 0);
    const preferred = new THREE.Vector3(-0.35, 1.3, 0.5);
    const tip = new THREE.Vector3(-0.45, 0.055, 2.4);
    const originalTip = tip.clone();
    const solved = new THREE.Vector3();

    expect(
      solver.solve(
        shoulder,
        preferred,
        tip,
        STRUCTURAL_REACH,
        -1,
        new THREE.Quaternion(),
        new THREE.Quaternion(),
        false,
        solved,
      ),
    ).toBe(false);
    expect(tip.toArray()).toEqual(originalTip.toArray());
    expect(solved.distanceTo(tip)).toBeCloseTo(POLE_LENGTH, 9);
  });

  it("mirrors the fitted channel and clamps free preferences per arm", () => {
    const solver = new SkiGripReachSolver(POLE_LENGTH, MINIMUM_REACH);
    const shoulderLeft = new THREE.Vector3(-0.25, 1, 0);
    const shoulderRight = new THREE.Vector3(0.25, 1, 0);
    const preferredLeft = new THREE.Vector3(-1.4, 1.4, 0.2);
    const preferredRight = new THREE.Vector3(1.4, 1.4, 0.2);

    solver.clampPreferredContact(shoulderLeft, preferredLeft, STRUCTURAL_REACH);
    solver.clampPreferredContact(shoulderRight, preferredRight, STRUCTURAL_REACH);

    expect(preferredLeft.distanceTo(shoulderLeft)).toBeCloseTo(
      STRUCTURAL_REACH + solver.channelLength - SKI_GRIP_REACH_MARGIN_M,
      9,
    );
    expect(preferredRight.distanceTo(shoulderRight)).toBeCloseTo(
      STRUCTURAL_REACH + solver.channelLength - SKI_GRIP_REACH_MARGIN_M,
      9,
    );
    expect(preferredLeft.x).toBeCloseTo(-preferredRight.x, 9);
    expect(preferredLeft.y).toBeCloseTo(preferredRight.y, 9);
    expect(preferredLeft.z).toBeCloseTo(preferredRight.z, 9);
  });

  it("holds maximum extension just after pole-off, then returns recovery authority", () => {
    expect(skiPostReleaseExtensionAuthority(0.29)).toBe(0);
    expect(skiPostReleaseExtensionAuthority(SKI_POST_RELEASE_EXTENSION_CYCLE)).toBe(1);
    expect(skiPostReleaseExtensionAuthority(SKI_POST_RELEASE_EXTENSION_END_CYCLE)).toBe(0);
    expect(skiPostReleaseExtensionAuthority(0.315)).toBeGreaterThan(0);
    expect(skiPostReleaseExtensionAuthority(0.39)).toBeGreaterThan(0);
    expect(skiPostReleaseExtensionAuthority(0.6)).toBe(0);
  });
});
