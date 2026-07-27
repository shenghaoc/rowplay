import { describe, expect, it } from "vite-plus/test";
import * as THREE from "three";
import {
  ROWER_ELBOW_CORRIDOR,
  ROWER_ELBOW_PLANE,
  ROWER_FOOT_CONTACT,
  ROWER_OARLOCK,
  ROWER_SCULL_GRIP,
  ROWER_STRETCHER,
  rowerElbowOutboard,
  rowerElbowPlane,
  rowerElbowPlaneAuthority,
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

describe("solveRowerArm flexion-scheduled elbow", () => {
  // Production V4 segment lengths: the shipped athlete's shoulder→grip reach
  // is 0.7651 m split by the procedural share (0.39/0.38 of 0.77).
  const upperArm = 0.3876;
  const forearm = 0.3776;

  function solve(shoulder: THREE.Vector3, wrist: THREE.Vector3, side: number) {
    const elbow = new THREE.Vector3();
    const hand = new THREE.Vector3();
    const plane = new THREE.Vector3();
    const authority = solveRowerArm(shoulder, wrist, upperArm, forearm, side, elbow, hand, plane);
    return { elbow, hand, plane, authority };
  }

  /**
   * Production-measured right-side finish (avatar frame, aft = -z): the
   * shoulder and the wrist on the rigid grip as the shipped athlete actually
   * solves them at the loaded finish. The wrist sits *outboard* of the
   * shoulder (the scull handle ends at the rigger side) and forward of it —
   * the chord azimuth this geometry creates is exactly why the drawn station
   * is expressed in the chord frame rather than the athlete frame.
   */
  const drawShoulder = new THREE.Vector3(0.241, 0.866, -0.28);
  const drawWrist = new THREE.Vector3(0.355, 0.754, -0.079);

  it("preserves both bone lengths while landing the wrist on the grip", () => {
    const { elbow, hand } = solve(drawShoulder, drawWrist, 1);
    expect(drawShoulder.distanceTo(elbow)).toBeCloseTo(upperArm, 6);
    expect(elbow.distanceTo(hand)).toBeCloseTo(forearm, 6);
    expect(hand.distanceTo(drawWrist)).toBeLessThan(1e-6);
  });

  it("schedules plane authority from actual flexion, C2 and monotonic", () => {
    expect(rowerElbowPlaneAuthority(0)).toBe(0);
    expect(rowerElbowPlaneAuthority(ROWER_ELBOW_PLANE.authorityStart)).toBe(0);
    expect(rowerElbowPlaneAuthority(ROWER_ELBOW_PLANE.authorityFull)).toBe(1);
    let previous = 0;
    for (let step = 0; step <= 200; step++) {
      const flexion = (step / 200) * (ROWER_ELBOW_PLANE.authorityFull + 0.4);
      const authority = rowerElbowPlaneAuthority(flexion);
      expect(authority).toBeGreaterThanOrEqual(previous - 1e-12);
      expect(authority).toBeLessThanOrEqual(1);
      previous = authority;
    }
    // The solver reports the authority it used, derived from the reach.
    // Flexion rises steeply near extension (1 cm short of full reach is
    // already ~21° of bend), so the genuinely straight case sits within
    // half a millimetre of the full reach.
    const reachDirection = new THREE.Vector3(0.05, -0.2, 0.53).normalize();
    const nearStraight = solve(
      drawShoulder,
      drawShoulder.clone().addScaledVector(reachDirection, upperArm + forearm - 0.0005),
      1,
    );
    expect(nearStraight.authority).toBeLessThan(0.05);
    const bent = solve(drawShoulder, drawWrist, 1);
    expect(bent.authority).toBeGreaterThan(0.95);
  });

  it("leaves the near-straight singular region alone: no flip, no twist, mirrored", () => {
    // Sweep the wrist from full extension down to visible flexion along one
    // reach ray and require the solved plane to vary continuously with no
    // hemisphere flip and exact left/right mirroring — the region where the
    // former permanent down-plane twisted the limb about its own axis.
    const direction = new THREE.Vector3(0.2, -0.35, 0.91).normalize();
    let previousPlane: THREE.Vector3 | null = null;
    for (let step = 0; step <= 256; step++) {
      const reach = upperArm + forearm - 0.001 - (step / 256) * 0.24;
      const wrist = drawShoulder.clone().addScaledVector(direction, reach);
      const { plane, elbow } = solve(drawShoulder, wrist, 1);
      const mirroredShoulder = drawShoulder.clone();
      mirroredShoulder.x *= -1;
      const mirroredWrist = wrist.clone();
      mirroredWrist.x *= -1;
      const mirrored = solve(mirroredShoulder, mirroredWrist, -1);
      expect(Math.abs(mirrored.elbow.x + elbow.x), `mirror x at ${reach}`).toBeLessThan(1e-9);
      expect(Math.abs(mirrored.elbow.y - elbow.y), `mirror y at ${reach}`).toBeLessThan(1e-9);
      expect(Math.abs(mirrored.elbow.z - elbow.z), `mirror z at ${reach}`).toBeLessThan(1e-9);
      // Determinism: same inputs, bit-identical output.
      const again = solve(drawShoulder, wrist, 1);
      expect(again.elbow.distanceTo(elbow)).toBe(0);
      if (previousPlane) {
        expect(
          previousPlane.angleTo(plane),
          `no plane jump at reach ${reach.toFixed(3)}`,
        ).toBeLessThan(0.12);
      }
      previousPlane = plane.clone();
    }
  });

  it("keeps a bent draw inside the outboard corridor without sitting on it", () => {
    const { elbow } = solve(drawShoulder, drawWrist, 1);
    const outboard = rowerElbowOutboard(drawShoulder, drawWrist, elbow, 1);
    expect(outboard).toBeLessThanOrEqual(ROWER_ELBOW_CORRIDOR.maxOutboard + 1e-6);
    expect(outboard).toBeGreaterThanOrEqual(-ROWER_ELBOW_CORRIDOR.maxInboard - 1e-6);
    // The corridor is a safety limit, not the desired pose: the drawn plane
    // itself should land clearly inside it.
    expect(outboard).toBeLessThan(ROWER_ELBOW_CORRIDOR.maxOutboard * 0.85);
  });

  it("rejects a deliberately winged elbow that a rearward-only check would accept", () => {
    // Build the classic chicken wing at a mid-draw chord (wrist still
    // outboard, where the working-plane metric is well-conditioned):
    // rearward of the shoulder — so any "elbow moves aft" assertion passes —
    // but hoisted far outboard. The corridor metric must flag it, and the
    // solver must never produce it from any reach input.
    const midShoulder = new THREE.Vector3(0.241, 0.79, -0.45);
    const midWrist = new THREE.Vector3(0.31, 0.71, -0.25);
    const winged = new THREE.Vector3(
      midShoulder.x + 0.28,
      midShoulder.y - 0.05,
      midShoulder.z - 0.1,
    );
    expect(winged.z).toBeLessThan(midShoulder.z); // rearward — old checks pass
    expect(rowerElbowOutboard(midShoulder, midWrist, winged, 1)).toBeGreaterThan(
      ROWER_ELBOW_CORRIDOR.maxOutboard,
    );
    for (let step = 0; step <= 24; step++) {
      const wrist = midWrist
        .clone()
        .lerp(midShoulder.clone().add(new THREE.Vector3(0.1, -0.1, 0.5)), step / 24);
      const { elbow } = solve(midShoulder, wrist, 1);
      expect(elbow.distanceTo(winged)).toBeGreaterThan(0.08);
      expect(rowerElbowOutboard(midShoulder, wrist, elbow, 1)).toBeLessThanOrEqual(
        ROWER_ELBOW_CORRIDOR.maxOutboard + 1e-6,
      );
    }
  });

  it("rejects a drooped finish and a horizontally winged finish by observable metrics", () => {
    // At the production finish the hands converge inboard and the
    // shoulder→wrist chord swings lateral, so the finish acceptance is
    // expressed in the observable boat-frame relationships the technique
    // references use, not the mid-draw working-plane metric.
    const { elbow } = solve(drawShoulder, drawWrist, 1);
    const outboardOfShoulder = elbow.x - drawShoulder.x; // right side: + = outboard
    // Behind the shoulder plane enough to complete the draw, never hauled
    // past vertical.
    expect(elbow.z).toBeLessThan(drawShoulder.z + 0.02);
    expect(elbow.z).toBeGreaterThan(drawShoulder.z - ROWER_ELBOW_CORRIDOR.maxBehindShoulder);
    // Modestly outboard — visibly clear of the ribs, nowhere near a wing.
    expect(outboardOfShoulder).toBeGreaterThan(-0.03);
    expect(outboardOfShoulder).toBeLessThan(0.16);
    // Below the shoulder, but not drooped far under the handle line. The
    // deep production fold (141°) forces a 0.36 m bend radius whose in-plane
    // aft direction is largely down, so "not drooped" is bounded relative to
    // the wrist rather than by a upper-arm-angle ideal the chord geometry
    // cannot produce.
    expect(elbow.y).toBeLessThan(drawShoulder.y - 0.04);
    expect(elbow.y).toBeGreaterThan(drawWrist.y - 0.3);
    // A drooped pose hangs the joint far below the wrist; a winged pose
    // hoists it to shoulder height far outboard. Both violate the bounds
    // the solved joint just satisfied.
    const drooped = new THREE.Vector3(drawShoulder.x + 0.04, drawWrist.y - 0.36, drawShoulder.z);
    expect(drooped.y).toBeLessThan(drawWrist.y - 0.3);
    expect(elbow.distanceTo(drooped)).toBeGreaterThan(0.1);
    const wing = new THREE.Vector3(drawShoulder.x + 0.3, drawShoulder.y, drawShoulder.z - 0.05);
    expect(wing.x - drawShoulder.x).toBeGreaterThan(0.16);
    expect(elbow.distanceTo(wing)).toBeGreaterThan(0.1);
  });

  it("keeps rearward travel dominant over outboard deviation through the draw", () => {
    // Sweep the wrist to the ribs the way the graph moves it; the elbow's
    // aft travel must clearly dominate its lateral wander. Flexion (and so
    // plane authority) rises naturally as the reach shortens.
    const shoulder = new THREE.Vector3(0.241, 0.79, -0.45);
    let previous: THREE.Vector3 | null = null;
    let rearward = 0;
    let outboardWander = 0;
    for (let step = 0; step <= 32; step++) {
      const draw = step / 32;
      const wrist = new THREE.Vector3(0.36 - 0.16 * draw, 0.74 - 0.05 * draw, -0.05 - 0.24 * draw);
      const { elbow } = solve(shoulder, wrist, 1);
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
      const wrist = new THREE.Vector3(0.36 - 0.16 * draw, 0.74 - 0.05 * draw, -0.05 - 0.24 * draw);
      const shoulder = new THREE.Vector3(0.241, 0.79, -0.45);
      const { elbow: right } = solve(shoulder, wrist, 1);
      const mirroredShoulder = shoulder.clone();
      mirroredShoulder.x *= -1;
      const mirroredWrist = wrist.clone();
      mirroredWrist.x *= -1;
      const { elbow: left } = solve(mirroredShoulder, mirroredWrist, -1);
      expect(Math.abs(left.x + right.x), `mirror x at ${draw}`).toBeLessThan(1e-9);
      expect(Math.abs(left.y - right.y), `mirror y at ${draw}`).toBeLessThan(1e-9);
      expect(Math.abs(left.z - right.z), `mirror z at ${draw}`).toBeLessThan(1e-9);
      if (previousRight) {
        expect(right.distanceTo(previousRight), `continuity at ${draw}`).toBeLessThan(0.02);
      }
      previousRight = right.clone();
    }
  });

  it("publishes a relaxed hang near straight and a chord-frame drawn station", () => {
    const relaxed = rowerElbowPlane(1, 0, new THREE.Vector3());
    const drawn = rowerElbowPlane(1, 1, new THREE.Vector3());
    // Near straight: a soft under-arm hang — down-leaning, mildly outboard,
    // NOT a forced vertical and NOT rotated aft.
    expect(relaxed.y).toBeLessThan(-0.85);
    expect(Math.abs(relaxed.z)).toBeLessThan(0.2);
    expect(relaxed.x).toBeGreaterThan(0.15);
    // Drawn hint: aft-and-down with no meaningful athlete-frame lateral pull
    // — it only selects the two-bone branch; the chord-frame station weights
    // own the joint at full authority.
    expect(drawn.z).toBeLessThan(-0.5);
    expect(drawn.y).toBeLessThan(-0.5);
    expect(drawn.y).toBeGreaterThan(-0.85);
    expect(drawn.x).toBeGreaterThan(-0.05);
    expect(drawn.x).toBeLessThan(0.1);
    // The hint blend is continuous in authority.
    let previous = relaxed;
    for (let step = 1; step <= 64; step++) {
      const plane = rowerElbowPlane(1, step / 64, new THREE.Vector3());
      expect(previous.angleTo(plane)).toBeLessThan(0.06);
      previous = plane;
    }
    // The drawn station is a unit circle point with a modest outboard share,
    // so the lateral offset scales with the bend radius instead of chasing a
    // fixed athlete-frame direction across the chord's azimuth swing.
    expect(ROWER_ELBOW_PLANE.drawnOutboardWeight).toBeGreaterThan(0.15);
    expect(ROWER_ELBOW_PLANE.drawnOutboardWeight).toBeLessThan(0.35);
    expect(
      Math.hypot(ROWER_ELBOW_PLANE.drawnDownWeight, ROWER_ELBOW_PLANE.drawnOutboardWeight),
    ).toBeCloseTo(1, 9);
    // At the production finish the solved joint sits at exactly that station:
    // outboard displacement over bend radius reproduces the authored weight,
    // clearly inside the absolute corridor.
    const { elbow } = solve(drawShoulder, drawWrist, 1);
    const chord = drawWrist.clone().sub(drawShoulder);
    const chordLength = chord.length();
    const along =
      (upperArm * upperArm - forearm * forearm + chordLength * chordLength) / (2 * chordLength);
    const radius = Math.sqrt(upperArm * upperArm - along * along);
    const outboard = rowerElbowOutboard(drawShoulder, drawWrist, elbow, 1);
    expect(outboard / radius).toBeCloseTo(ROWER_ELBOW_PLANE.drawnOutboardWeight, 1);
    expect(outboard).toBeLessThan(ROWER_ELBOW_CORRIDOR.maxOutboard * 0.85);
  });
});
