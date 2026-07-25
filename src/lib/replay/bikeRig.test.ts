import { describe, expect, it } from "vite-plus/test";
import * as THREE from "three";
import { BIKE_RIG } from "./bikeRig";

function point(value: readonly number[]): THREE.Vector3 {
  return new THREE.Vector3(...value);
}

describe("BikeErg fit contract", () => {
  it("keeps the frame human-scale instead of stretching the wheelbase around the rider", () => {
    const wheelbase = BIKE_RIG.frontAxleZ - BIKE_RIG.rearAxleZ;
    const wheelDiameter = BIKE_RIG.wheelRadius * 2;

    expect(wheelbase / wheelDiameter).toBeGreaterThan(1.5);
    expect(wheelbase / wheelDiameter).toBeLessThan(1.9);
    expect(BIKE_RIG.seatCluster[2]).toBeGreaterThan(BIKE_RIG.rearAxleZ);
    expect(BIKE_RIG.headTop[2]).toBeLessThan(BIKE_RIG.frontAxleZ);
  });

  it("places the hip above the saddle so the mesh sit surface lands on the seat", () => {
    const saddle = point(BIKE_RIG.saddle);
    const hip = point(BIKE_RIG.rider.root).add(point(BIKE_RIG.rider.pelvisOffset));
    const sit = hip.clone().add(point(BIKE_RIG.rider.sitSurfaceFromHip));
    const leftGrip = new THREE.Vector3(
      -BIKE_RIG.handlebar.grip.halfSpan,
      BIKE_RIG.handlebar.grip.y,
      BIKE_RIG.handlebar.grip.z,
    );
    const rightGrip = leftGrip.clone().setX(BIKE_RIG.handlebar.grip.halfSpan);

    // Hip is intentionally above the saddle marker; the sit surface is what
    // must land on the seat.
    expect(hip.y - saddle.y).toBeGreaterThan(0.05);
    expect(hip.y - saddle.y).toBeLessThan(0.12);
    expect(Math.abs(sit.y - saddle.y)).toBeLessThan(0.03);
    expect(Math.abs(sit.z - saddle.z)).toBeLessThan(0.05);
    expect(leftGrip.y).toBeLessThan(hip.y);
    expect(rightGrip.y).toBeLessThan(hip.y);
    expect(leftGrip.distanceTo(hip)).toBeGreaterThan(0.55);
    expect(leftGrip.distanceTo(hip)).toBeLessThan(0.85);
    expect(rightGrip.distanceTo(hip)).toBeCloseTo(leftGrip.distanceTo(hip), 8);

    // Bottom-dead-centre pedal still within thigh+shin reach (~1.07 m).
    const bottomPedalY = BIKE_RIG.bottomBracket[1]! - BIKE_RIG.crank.pedalRadius;
    expect(hip.y - bottomPedalY).toBeLessThan(1.07);
  });

  it("keeps the opposed pedal radius and lateral spacing identical to the authored runtime", () => {
    expect(BIKE_RIG.crank.pedalRadius).toBeGreaterThan(0.18);
    expect(BIKE_RIG.crank.pedalRadius).toBeLessThan(0.24);
    expect(BIKE_RIG.crank.lateral).toBeGreaterThan(0.08);
    expect(BIKE_RIG.crank.lateral).toBeLessThan(0.13);
  });
});
