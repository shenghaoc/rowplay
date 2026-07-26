import { describe, expect, it } from "vite-plus/test";
import * as THREE from "three";
import {
  ROWER_ELBOW_CORRIDOR,
  ROWER_FOOT_CONTACT,
  ROWER_OARLOCK,
  ROWER_SCULL_GRIP,
  ROWER_STRETCHER,
  rowerElbowOutboard,
  rowerElbowPlane,
  solveRowerArm,
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

describe("scull grip contract", () => {
  it("keeps the rubber, thumb stop, and palm anchor mutually consistent", () => {
    // The anchor must sit inside the rubber, close enough to the flat end
    // that the thumb can press the stop while four fingers own the cylinder.
    expect(ROWER_SCULL_GRIP.anchorFromEnd).toBeGreaterThan(0.02);
    expect(ROWER_SCULL_GRIP.anchorFromEnd).toBeLessThan(ROWER_SCULL_GRIP.length / 2);
    // A scull rubber is a hook-sized cylinder, not a pencil the fingers
    // could swallow nor a bar too thick to enclose.
    expect(ROWER_SCULL_GRIP.radius).toBeGreaterThan(0.015);
    expect(ROWER_SCULL_GRIP.radius).toBeLessThan(0.032);
  });
});

describe("solveRowerArm elbow corridor", () => {
  const upperArm = 0.3048;
  const forearm = 0.2737;

  function solve(
    shoulder: THREE.Vector3,
    wrist: THREE.Vector3,
    side: number,
    draw: number,
    load: number,
  ) {
    const elbow = new THREE.Vector3();
    const hand = new THREE.Vector3();
    const plane = new THREE.Vector3();
    solveRowerArm(shoulder, wrist, upperArm, forearm, side, draw, load, elbow, hand, plane);
    return { elbow, hand, plane };
  }

  /** Representative right-side draw configuration (avatar frame, aft = -z). */
  const drawShoulder = new THREE.Vector3(0.241, 0.79, -0.45);
  const drawWrist = new THREE.Vector3(0.31, 0.71, -0.25);

  it("preserves both bone lengths while landing the wrist on the grip", () => {
    const { elbow, hand } = solve(drawShoulder, drawWrist, 1, 0.85, 1);
    expect(drawShoulder.distanceTo(elbow)).toBeCloseTo(upperArm, 6);
    expect(elbow.distanceTo(hand)).toBeCloseTo(forearm, 6);
    expect(hand.distanceTo(drawWrist)).toBeLessThan(1e-6);
  });

  it("keeps the drawn elbow on the downward half inside the outboard band", () => {
    for (const draw of [0, 0.25, 0.5, 0.75, 1]) {
      for (const load of [0, 0.6, 1]) {
        const { elbow } = solve(drawShoulder, drawWrist, 1, draw, load);
        const outboard = rowerElbowOutboard(drawShoulder, drawWrist, elbow, 1);
        expect(outboard, `outboard bound at draw=${draw} load=${load}`).toBeLessThanOrEqual(
          ROWER_ELBOW_CORRIDOR.maxOutboard + 1e-6,
        );
        expect(outboard, `inboard bound at draw=${draw} load=${load}`).toBeGreaterThanOrEqual(
          -ROWER_ELBOW_CORRIDOR.maxInboard - 1e-6,
        );
        // Downward half: the joint hangs below the shoulder→wrist chord.
        const along = elbow
          .clone()
          .sub(drawShoulder)
          .dot(drawWrist.clone().sub(drawShoulder).normalize());
        const onChord = drawShoulder
          .clone()
          .addScaledVector(drawWrist.clone().sub(drawShoulder).normalize(), along);
        expect(elbow.y, `downward branch at draw=${draw} load=${load}`).toBeLessThan(
          onChord.y + 1e-6,
        );
      }
    }
  });

  it("rejects a deliberately winged elbow that a rearward-only check would accept", () => {
    // Build the classic chicken wing: rearward of the shoulder (so any
    // "elbow moves aft" assertion passes) but hoisted far outboard of the
    // working plane. The corridor metric must flag it, and the solver must
    // never produce it from any draw/load input.
    const winged = new THREE.Vector3(
      drawShoulder.x + 0.28,
      drawShoulder.y - 0.05,
      drawShoulder.z - 0.1,
    );
    expect(winged.z).toBeLessThan(drawShoulder.z); // rearward — old checks pass
    const outboard = rowerElbowOutboard(drawShoulder, drawWrist, winged, 1);
    expect(outboard).toBeGreaterThan(ROWER_ELBOW_CORRIDOR.maxOutboard);
    for (let draw = 0; draw <= 1.0001; draw += 0.05) {
      const { elbow } = solve(drawShoulder, drawWrist, 1, draw, 1);
      expect(elbow.distanceTo(winged)).toBeGreaterThan(0.08);
      expect(rowerElbowOutboard(drawShoulder, drawWrist, elbow, 1)).toBeLessThanOrEqual(
        ROWER_ELBOW_CORRIDOR.maxOutboard + 1e-6,
      );
    }
  });

  it("keeps rearward travel dominant over outboard deviation through the draw", () => {
    // Sweep the draw as the wrist comes to the ribs the way the graph moves
    // it; the elbow's aft travel must clearly dominate its lateral wander.
    const shoulder = new THREE.Vector3(0.241, 0.79, -0.45);
    let previous: THREE.Vector3 | null = null;
    let rearward = 0;
    let outboardWander = 0;
    for (let step = 0; step <= 32; step++) {
      const draw = step / 32;
      const wrist = new THREE.Vector3(0.36 - 0.16 * draw, 0.74 - 0.05 * draw, -0.05 - 0.24 * draw);
      const { elbow } = solve(shoulder, wrist, 1, draw, 1);
      if (previous) {
        rearward += Math.max(0, previous.z - elbow.z);
        outboardWander += Math.max(
          0,
          Math.abs(elbow.x - shoulder.x) - Math.abs(previous.x - shoulder.x),
        );
      }
      previous = elbow.clone();
    }
    expect(rearward).toBeGreaterThan(0.1);
    expect(outboardWander / rearward).toBeLessThan(ROWER_ELBOW_CORRIDOR.maxOutboardPerRearward);
  });

  it("stays continuous and mirror-symmetric across a dense draw sweep", () => {
    let previousRight: THREE.Vector3 | null = null;
    for (let step = 0; step <= 256; step++) {
      const draw = step / 256;
      const load = Math.sin(Math.min(1, draw * 1.4) * Math.PI);
      const wrist = new THREE.Vector3(0.36 - 0.16 * draw, 0.74 - 0.05 * draw, -0.05 - 0.24 * draw);
      const shoulder = new THREE.Vector3(0.241, 0.79, -0.45);
      const { elbow: right } = solve(shoulder, wrist, 1, draw, load);
      const mirroredShoulder = shoulder.clone();
      mirroredShoulder.x *= -1;
      const mirroredWrist = wrist.clone();
      mirroredWrist.x *= -1;
      const { elbow: left } = solve(mirroredShoulder, mirroredWrist, -1, draw, load);
      expect(Math.abs(left.x + right.x), `mirror x at ${draw}`).toBeLessThan(1e-9);
      expect(Math.abs(left.y - right.y), `mirror y at ${draw}`).toBeLessThan(1e-9);
      expect(Math.abs(left.z - right.z), `mirror z at ${draw}`).toBeLessThan(1e-9);
      if (previousRight) {
        expect(right.distanceTo(previousRight), `continuity at ${draw}`).toBeLessThan(0.02);
      }
      previousRight = right.clone();
    }
  });

  it("publishes a down-dominant plane that rotates aft with the draw", () => {
    const start = rowerElbowPlane(1, 0, 0, new THREE.Vector3());
    const finish = rowerElbowPlane(1, 1, 1, new THREE.Vector3());
    expect(start.y).toBeLessThan(-0.85);
    expect(Math.abs(start.z)).toBeLessThan(0.1);
    expect(finish.y).toBeLessThan(-0.6);
    expect(finish.z).toBeLessThan(-0.3);
    // Slight outward tilt only — never a horizontal wing.
    expect(Math.abs(start.x)).toBeLessThan(0.25);
    expect(Math.abs(finish.x)).toBeLessThan(0.25);
  });
});
