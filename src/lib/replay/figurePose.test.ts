import { describe, expect, it } from "vite-plus/test";
import { solveTwoBone2D, solveTwoBone3D } from "./figurePose";

const TAU = Math.PI * 2;
const LENGTH_TOLERANCE = 1e-9;

function distance2(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distance3(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function expectFinite2(point: { x: number; y: number }): void {
  expect(Number.isFinite(point.x)).toBe(true);
  expect(Number.isFinite(point.y)).toBe(true);
}

function expectFinite3(point: { x: number; y: number; z: number }): void {
  expectFinite2(point);
  expect(Number.isFinite(point.z)).toBe(true);
}

describe("figurePose two-bone IK", () => {
  it("holds both 2D segment lengths over 128 animation phases", () => {
    const root = { x: 1.25, y: -0.75 };
    const target = { x: 0, y: 0 };
    const joint = { x: 0, y: 0 };
    const end = { x: 0, y: 0 };
    const firstLength = 4;
    const secondLength = 3;

    for (let phase = 0; phase < 128; phase++) {
      const angle = (phase / 128) * TAU;
      const reach = 1.05 + (Math.sin(angle * 3) * 0.5 + 0.5) * 5.9;
      target.x = root.x + Math.cos(angle) * reach;
      target.y = root.y + Math.sin(angle) * reach;

      expect(solveTwoBone2D(root, target, firstLength, secondLength, 1, joint, end)).toBe(joint);
      expect(end).toEqual(target);
      expect(distance2(root, joint)).toBeCloseTo(firstLength, 9);
      expect(distance2(joint, end)).toBeCloseTo(secondLength, 9);
    }
  });

  it("holds both 3D segment lengths over 128 animation phases", () => {
    const root = { x: -0.4, y: 1.1, z: 0.7 };
    const target = { x: 0, y: 0, z: 0 };
    const bendHint = { x: 0.2, y: 1, z: -0.1 };
    const joint = { x: 0, y: 0, z: 0 };
    const end = { x: 0, y: 0, z: 0 };
    const firstLength = 2.8;
    const secondLength = 2.2;

    for (let phase = 0; phase < 128; phase++) {
      const angle = (phase / 128) * TAU;
      const reach = 0.65 + (Math.cos(angle * 5) * 0.5 + 0.5) * 4.3;
      target.x = root.x + Math.cos(angle) * reach * 0.8;
      target.y = root.y + Math.sin(angle * 0.5) * reach * 0.35;
      target.z = root.z + Math.sin(angle) * reach * 0.8;

      // Normalise the authored target radius back inside the reachable annulus.
      const deltaX = target.x - root.x;
      const deltaY = target.y - root.y;
      const deltaZ = target.z - root.z;
      const authoredReach = Math.hypot(deltaX, deltaY, deltaZ);
      const safeReach = Math.max(0.65, Math.min(4.95, authoredReach));
      target.x = root.x + (deltaX / authoredReach) * safeReach;
      target.y = root.y + (deltaY / authoredReach) * safeReach;
      target.z = root.z + (deltaZ / authoredReach) * safeReach;

      expect(solveTwoBone3D(root, target, firstLength, secondLength, bendHint, joint, end)).toBe(
        joint,
      );
      expect(end).toEqual(target);
      expect(distance3(root, joint)).toBeCloseTo(firstLength, 9);
      expect(distance3(joint, end)).toBeCloseTo(secondLength, 9);
    }
  });

  it("keeps the requested 2D bend side stable through a full cycle", () => {
    const root = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    const positiveJoint = { x: 0, y: 0 };
    const negativeJoint = { x: 0, y: 0 };
    const positiveEnd = { x: 0, y: 0 };
    const negativeEnd = { x: 0, y: 0 };

    for (let phase = 0; phase < 128; phase++) {
      const angle = (phase / 128) * TAU;
      target.x = Math.cos(angle) * 5;
      target.y = Math.sin(angle) * 5;
      solveTwoBone2D(root, target, 3.5, 3, 1, positiveJoint, positiveEnd);
      solveTwoBone2D(root, target, 3.5, 3, -1, negativeJoint, negativeEnd);

      const positiveCross = target.x * positiveJoint.y - target.y * positiveJoint.x;
      const negativeCross = target.x * negativeJoint.y - target.y * negativeJoint.x;
      expect(positiveCross).toBeGreaterThan(LENGTH_TOLERANCE);
      expect(negativeCross).toBeLessThan(-LENGTH_TOLERANCE);
    }
  });

  it("projects a 3D bend hint without flipping across animation phases", () => {
    const root = { x: 0, y: 0, z: 0 };
    const target = { x: 0, y: 0, z: 0 };
    const bendHint = { x: 0, y: 1, z: 0 };
    const joint = { x: 0, y: 0, z: 0 };
    const end = { x: 0, y: 0, z: 0 };

    for (let phase = 0; phase < 128; phase++) {
      const angle = (phase / 128) * TAU;
      target.x = Math.cos(angle) * 4;
      target.y = Math.sin(angle) * 0.4;
      target.z = Math.sin(angle) * 4;
      solveTwoBone3D(root, target, 3, 2.5, bendHint, joint, end);

      const targetLengthSquared = target.x * target.x + target.y * target.y + target.z * target.z;
      const projectedHintY = 1 - (target.y * target.y) / targetLengthSquared;
      const projectedHintX = -(target.x * target.y) / targetLengthSquared;
      const projectedHintZ = -(target.z * target.y) / targetLengthSquared;
      const bendComponent =
        joint.x * projectedHintX + joint.y * projectedHintY + joint.z * projectedHintZ;
      expect(bendComponent).toBeGreaterThan(LENGTH_TOLERANCE);
    }
  });

  it("folds coincident equal-length chains toward the requested bend", () => {
    const root2 = { x: 2, y: -3 };
    const joint2 = { x: 0, y: 0 };
    const end2 = { x: 0, y: 0 };
    solveTwoBone2D(root2, root2, 4, 4, -1, joint2, end2);
    expect(end2).toEqual(root2);
    expect(joint2).toEqual({ x: 2, y: -7 });
    expect(distance2(root2, joint2)).toBe(4);

    const root3 = { x: 2, y: -3, z: 1 };
    const hint3 = { x: 0, y: 0, z: -1 };
    const joint3 = { x: 0, y: 0, z: 0 };
    const end3 = { x: 0, y: 0, z: 0 };
    solveTwoBone3D(root3, root3, 4, 4, hint3, joint3, end3);
    expect(end3).toEqual(root3);
    expect(joint3).toEqual({ x: 2, y: -3, z: -3 });
    expect(distance3(root3, joint3)).toBe(4);
  });

  it("clamps unreachable and degenerate inputs to finite rigid-root poses", () => {
    const cases2 = [
      { root: { x: 0, y: 0 }, target: { x: 100, y: 20 }, first: 4, second: 3 },
      { root: { x: 0, y: 0 }, target: { x: 0.1, y: 0 }, first: 5, second: 1 },
      { root: { x: 0, y: 0 }, target: { x: 0, y: 0 }, first: 5, second: 1 },
      { root: { x: Number.NaN, y: 2 }, target: { x: Infinity, y: 3 }, first: 2, second: 2 },
      { root: { x: 1, y: 2 }, target: { x: 3, y: 4 }, first: Number.NaN, second: -2 },
    ];
    const joint2 = { x: 0, y: 0 };
    const end2 = { x: 0, y: 0 };
    for (const entry of cases2) {
      solveTwoBone2D(entry.root, entry.target, entry.first, entry.second, Number.NaN, joint2, end2);
      expectFinite2(joint2);
      expectFinite2(end2);
      if (Number.isFinite(entry.first)) {
        const sanitizedRoot = {
          x: Number.isFinite(entry.root.x) ? entry.root.x : 0,
          y: Number.isFinite(entry.root.y) ? entry.root.y : 0,
        };
        expect(distance2(sanitizedRoot, joint2)).toBeCloseTo(Math.abs(entry.first), 8);
        const secondLength = Number.isFinite(entry.second) ? Math.abs(entry.second) : 0;
        expect(distance2(joint2, end2)).toBeCloseTo(secondLength, 8);
      }
    }

    const cases3 = [
      { root: { x: 0, y: 0, z: 0 }, target: { x: 100, y: 20, z: -4 } },
      { root: { x: 0, y: 0, z: 0 }, target: { x: 0.1, y: 0, z: 0 } },
      { root: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
      { root: { x: Number.NaN, y: 2, z: 3 }, target: { x: Infinity, y: 3, z: 4 } },
    ];
    const joint3 = { x: 0, y: 0, z: 0 };
    const end3 = { x: 0, y: 0, z: 0 };
    for (const entry of cases3) {
      solveTwoBone3D(entry.root, entry.target, 5, 1, entry.target, joint3, end3);
      expectFinite3(joint3);
      expectFinite3(end3);
      const sanitizedRoot = {
        x: Number.isFinite(entry.root.x) ? entry.root.x : 0,
        y: Number.isFinite(entry.root.y) ? entry.root.y : 0,
        z: Number.isFinite(entry.root.z) ? entry.root.z : 0,
      };
      expect(distance3(sanitizedRoot, joint3)).toBeCloseTo(5, 8);
      expect(distance3(joint3, end3)).toBeCloseTo(1, 8);
    }
  });

  it("uses a deterministic perpendicular when the 3D hint is parallel or zero", () => {
    const root = { x: 0, y: 0, z: 0 };
    const target = { x: 4, y: 4, z: 4 };
    const parallelHint = { x: 4, y: 4, z: 4 };
    const zeroHint = { x: 0, y: 0, z: 0 };
    const parallelJoint = { x: 0, y: 0, z: 0 };
    const zeroJoint = { x: 0, y: 0, z: 0 };
    const parallelEnd = { x: 0, y: 0, z: 0 };
    const zeroEnd = { x: 0, y: 0, z: 0 };

    solveTwoBone3D(root, target, 4, 4, parallelHint, parallelJoint, parallelEnd);
    solveTwoBone3D(root, target, 4, 4, zeroHint, zeroJoint, zeroEnd);
    expectFinite3(parallelJoint);
    expect(zeroJoint).toEqual(parallelJoint);
    expect(zeroEnd).toEqual(parallelEnd);
    expect(distance3(root, parallelJoint)).toBeCloseTo(4, 9);
    expect(distance3(parallelJoint, target)).toBeCloseTo(4, 9);
  });
});
