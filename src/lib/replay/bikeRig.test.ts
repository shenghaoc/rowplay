import { describe, expect, it } from "vite-plus/test";
import * as THREE from "three";
import { BIKE_RIG, bikeRiderHipY, bikeSaddleTopY, bikeWheelAxleY } from "./bikeRig";
import { bikeChainPath } from "./renderer3d";

function point(value: readonly number[]): THREE.Vector3 {
  return new THREE.Vector3(...value);
}

describe("BikeErg fit contract", () => {
  it("keeps real road-bike proportions against the 1.83 m athlete", () => {
    const wheelbase = BIKE_RIG.frontAxleZ - BIKE_RIG.rearAxleZ;
    const wheelDiameter = (BIKE_RIG.wheelRadius + BIKE_RIG.tyreTube) * 2;

    // A 700c wheel is 0.67 m and a road wheelbase is about 1.00 m. These bounds
    // used to demand a 1.5-2.2 m wheelbase, which locked in a bike half again
    // too big for the rider and forced the front wheel far enough forward that
    // the fork had to rake out to 52° to reach it.
    expect(wheelDiameter).toBeGreaterThan(0.62);
    expect(wheelDiameter).toBeLessThan(0.72);
    expect(wheelbase).toBeGreaterThan(0.94);
    expect(wheelbase).toBeLessThan(1.12);
    expect(wheelbase / wheelDiameter).toBeGreaterThan(1.35);
    expect(wheelbase / wheelDiameter).toBeLessThan(1.7);

    // A steerer leans back as it rises; the head tube top must be rearward.
    expect(BIKE_RIG.headTop[2]!).toBeLessThan(BIKE_RIG.headBottom[2]!);
    const headAngle =
      (Math.atan2(
        BIKE_RIG.headTop[1]! - BIKE_RIG.headBottom[1]!,
        BIKE_RIG.headBottom[2]! - BIKE_RIG.headTop[2]!,
      ) *
        180) /
      Math.PI;
    expect(headAngle).toBeGreaterThan(70);
    expect(headAngle).toBeLessThan(76);

    // The pedal and shoe must clear the front wheel at top dead centre.
    const toeZ = BIKE_RIG.bottomBracket[2]! + 0.13;
    expect(BIKE_RIG.frontAxleZ - (BIKE_RIG.wheelRadius + BIKE_RIG.tyreTube)).toBeGreaterThan(toeZ);
    expect(BIKE_RIG.saddle[2]).toBeLessThan(BIKE_RIG.bottomBracket[2]!);
    expect(BIKE_RIG.handlebar.grip.z).toBeGreaterThan(BIKE_RIG.saddle[2]!);
    expect(BIKE_RIG.frontAxleZ).toBeGreaterThan(BIKE_RIG.bottomBracket[2]!);
    expect(BIKE_RIG.rearAxleZ).toBeLessThan(BIKE_RIG.saddle[2]!);
  });

  it("derives hip height from the sit surface and pad top — not a free Y tweak", () => {
    const saddle = point(BIKE_RIG.saddle);
    const hip = point(BIKE_RIG.rider.root).add(point(BIKE_RIG.rider.pelvisOffset));
    const sit = hip.clone().add(point(BIKE_RIG.rider.sitSurfaceFromHip));
    const saddleTopY = bikeSaddleTopY(BIKE_RIG);
    const leftGrip = new THREE.Vector3(
      -BIKE_RIG.handlebar.grip.halfSpan,
      BIKE_RIG.handlebar.grip.y,
      BIKE_RIG.handlebar.grip.z,
    );

    // Hip Y is the single derived seating value.
    expect(BIKE_RIG.rider.root[1]).toBeCloseTo(bikeRiderHipY(BIKE_RIG), 8);
    expect(saddleTopY).toBeCloseTo(saddle.y + BIKE_RIG.saddlePadHalfHeight, 8);

    // Sit surface is a real mesh offset (~20 cm worst-phase), not a token cm.
    expect(BIKE_RIG.rider.sitSurfaceFromHip[1]!).toBeLessThanOrEqual(-0.14);
    expect(BIKE_RIG.rider.sitSurfaceFromHip[1]!).toBeGreaterThanOrEqual(-0.24);

    // Hip above seat; sit on the pad (soft nestle only) — never through the top.
    expect(hip.y).toBeGreaterThan(saddleTopY);
    expect(sit.y).toBeGreaterThanOrEqual(saddleTopY - BIKE_RIG.rider.sitNestle - 1e-6);
    expect(sit.y).toBeLessThanOrEqual(saddleTopY + 0.02);
    expect(Math.abs(sit.z - saddle.z)).toBeLessThan(0.08);
    expect(leftGrip.distanceTo(hip)).toBeGreaterThan(0.5);
    expect(leftGrip.distanceTo(hip)).toBeLessThan(1.05);

    const bottomPedalY = BIKE_RIG.bottomBracket[1]! - BIKE_RIG.crank.pedalRadius;
    // Legs must still reach the bottom of the stroke after sit-driven hip lift.
    expect(hip.y - bottomPedalY).toBeLessThan(1.28);
  });

  it("places wheel axles so the tyre shell rests on the ground, not through it", () => {
    const axleY = bikeWheelAxleY(BIKE_RIG);
    // Outer tyre extent = major radius + tube; bottom at y = 0 when axle is at axleY.
    expect(axleY).toBeCloseTo(BIKE_RIG.wheelRadius + BIKE_RIG.tyreTube, 8);
    expect(axleY - BIKE_RIG.wheelRadius - BIKE_RIG.tyreTube).toBeCloseTo(0, 8);
  });

  it("keeps the opposed pedal radius and lateral spacing identical to the authored runtime", () => {
    expect(BIKE_RIG.crank.pedalRadius).toBeGreaterThan(0.15);
    expect(BIKE_RIG.crank.pedalRadius).toBeLessThan(0.25);
    expect(BIKE_RIG.crank.lateral).toBeGreaterThan(0.08);
    expect(BIKE_RIG.crank.lateral).toBeLessThan(0.13);
  });
});

describe("BikeErg chain path", () => {
  const ring = { y: BIKE_RIG.bottomBracket[1] ?? 0, z: BIKE_RIG.bottomBracket[2] ?? 0 };
  const cog = { y: bikeWheelAxleY(BIKE_RIG), z: BIKE_RIG.rearAxleZ };
  const ringRadius = 0.098;
  const cogRadius = 0.043;
  const path = bikeChainPath(ring, ringRadius, cog, cogRadius, -0.045);

  function distanceTo(centre: { y: number; z: number }, p: THREE.Vector3): number {
    return Math.hypot(p.z - centre.z, p.y - centre.y);
  }

  it("actually wraps both sprockets instead of floating between them", () => {
    // The old chain was straight tubes between two eyeballed points that
    // touched neither sprocket. Every point must now lie on or outside both
    // pitch circles, and a real share of them must lie *on* each one.
    let onRing = 0;
    let onCog = 0;
    for (const p of path) {
      const toRing = distanceTo(ring, p);
      const toCog = distanceTo(cog, p);
      expect(toRing).toBeGreaterThanOrEqual(ringRadius - 1e-6);
      expect(toCog).toBeGreaterThanOrEqual(cogRadius - 1e-6);
      if (Math.abs(toRing - ringRadius) < 1e-6) onRing += 1;
      if (Math.abs(toCog - cogRadius) < 1e-6) onCog += 1;
    }
    expect(onRing).toBeGreaterThan(4);
    expect(onCog).toBeGreaterThan(4);
  });

  it("stays on the drive side and closes into a loop", () => {
    expect(path.length).toBeGreaterThan(20);
    for (const p of path) expect(p.x).toBeCloseTo(-0.045, 9);
    // Closed loop: the ends meet, so the tube has no visible seam.
    const first = path[0]!;
    const last = path[path.length - 1]!;
    expect(distanceTo(ring, first)).toBeCloseTo(ringRadius, 9);
    expect(distanceTo(cog, last)).toBeCloseTo(cogRadius, 9);
  });

  it("runs its two straights tangent to both sprockets", () => {
    // Between the wrap arcs the chain must be straight and tangent, which is
    // what makes the top and bottom runs parallel to the real chain line.
    const span = Math.hypot(cog.z - ring.z, cog.y - ring.y);
    const tangentLength = Math.sqrt(span * span - (ringRadius - cogRadius) ** 2);
    let longest = 0;
    for (let i = 1; i < path.length; i++) {
      longest = Math.max(longest, path[i]!.distanceTo(path[i - 1]!));
    }
    // The arc-to-arc jump is the tangent run itself.
    expect(longest).toBeCloseTo(tangentLength, 6);
  });
});
