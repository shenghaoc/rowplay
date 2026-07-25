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

  it("places the pelvis over the saddle and the hoods inside an arm-length reach", () => {
    const saddle = point(BIKE_RIG.saddle);
    const pelvis = point(BIKE_RIG.rider.root).add(point(BIKE_RIG.rider.pelvisOffset));
    const leftGrip = new THREE.Vector3(
      -BIKE_RIG.handlebar.grip.halfSpan,
      BIKE_RIG.handlebar.grip.y,
      BIKE_RIG.handlebar.grip.z,
    );
    const rightGrip = leftGrip.clone().setX(BIKE_RIG.handlebar.grip.halfSpan);

    expect(Math.abs(pelvis.y - saddle.y)).toBeLessThan(0.02);
    expect(Math.abs(pelvis.z - saddle.z)).toBeLessThan(0.025);
    expect(leftGrip.y).toBeLessThan(pelvis.y);
    expect(rightGrip.y).toBeLessThan(pelvis.y);
    expect(leftGrip.distanceTo(pelvis)).toBeGreaterThan(0.55);
    expect(leftGrip.distanceTo(pelvis)).toBeLessThan(0.78);
    expect(rightGrip.distanceTo(pelvis)).toBeCloseTo(leftGrip.distanceTo(pelvis), 8);
  });

  it("keeps the opposed pedal radius and lateral spacing identical to the authored runtime", () => {
    expect(BIKE_RIG.crank.pedalRadius).toBeGreaterThan(0.18);
    expect(BIKE_RIG.crank.pedalRadius).toBeLessThan(0.24);
    expect(BIKE_RIG.crank.lateral).toBeGreaterThan(0.08);
    expect(BIKE_RIG.crank.lateral).toBeLessThan(0.13);
  });
});
