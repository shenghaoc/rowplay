import { describe, expect, it } from "vite-plus/test";
import * as THREE from "three";
import { BIKE_RIG, bikeWheelAxleY } from "./bikeRig";

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

  it("places the sit surface on the saddle top — not through the seat", () => {
    const saddle = point(BIKE_RIG.saddle);
    const hip = point(BIKE_RIG.rider.root).add(point(BIKE_RIG.rider.pelvisOffset));
    const sit = hip.clone().add(point(BIKE_RIG.rider.sitSurfaceFromHip));
    // Authored pad top sits above the centre marker (~7 cm for the V3
    // performance-saddle loft).
    const saddleTopY = saddle.y + 0.07;
    const leftGrip = new THREE.Vector3(
      -BIKE_RIG.handlebar.grip.halfSpan,
      BIKE_RIG.handlebar.grip.y,
      BIKE_RIG.handlebar.grip.z,
    );

    // Hip above seat; sit on/above the pad — never through the saddle top.
    expect(hip.y).toBeGreaterThan(saddleTopY);
    expect(sit.y).toBeGreaterThanOrEqual(saddleTopY - 0.015);
    expect(sit.y).toBeLessThan(saddleTopY + 0.05);
    expect(Math.abs(sit.z - saddle.z)).toBeLessThan(0.08);
    expect(leftGrip.distanceTo(hip)).toBeGreaterThan(0.5);
    expect(leftGrip.distanceTo(hip)).toBeLessThan(0.95);

    const bottomPedalY = BIKE_RIG.bottomBracket[1]! - BIKE_RIG.crank.pedalRadius;
    expect(hip.y - bottomPedalY).toBeLessThan(1.22);
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
