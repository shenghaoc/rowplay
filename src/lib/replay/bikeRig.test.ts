import { describe, expect, it } from "vite-plus/test";
import * as THREE from "three";
import { BIKE_RIG, bikeRiderHipY, bikeSaddleTopY, bikeWheelAxleY } from "./bikeRig";

function point(value: readonly number[]): THREE.Vector3 {
  return new THREE.Vector3(...value);
}

describe("BikeErg fit contract", () => {
  it("keeps a clean diamond-frame proportion with two equal wheels", () => {
    const wheelbase = BIKE_RIG.frontAxleZ - BIKE_RIG.rearAxleZ;
    const wheelDiameter = BIKE_RIG.wheelRadius * 2;

    expect(wheelbase).toBeGreaterThan(1.5);
    expect(wheelbase).toBeLessThan(2.2);
    expect(wheelbase / wheelDiameter).toBeGreaterThan(1.6);
    expect(wheelbase / wheelDiameter).toBeLessThan(2.2);
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
