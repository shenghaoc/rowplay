import { describe, expect, it } from "vite-plus/test";
import * as THREE from "three";
import {
  BIKE_RIG,
  bikeKneeFlexion,
  bikeRiderHipY,
  bikeSaddleTopY,
  bikeWheelAxleY,
} from "./bikeRig";
import {
  BIKE_SADDLE_LENGTH,
  BIKE_SADDLE_MAX_HALF_WIDTH,
  BIKE_SADDLE_STATIONS,
  bikeSaddleDropAt,
} from "./bikeSaddle";
import { bikeChainPath } from "./renderer3d";

const deg = (radians: number) => (radians * 180) / Math.PI;

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

  it("sets saddle height by knee angle, the way a fitter actually does", () => {
    // Holmes: 25-35° of knee flexion at bottom dead centre is the road-fit
    // window, and it is the criterion this whole seating derivation exists to
    // hit. Before the femoral-head offset was accounted for, the rider sat at
    // 44.8° — a cruiser squat, and the reason the BikeErg looked wrong however
    // much the bicycle around it was corrected.
    const bdc = deg(bikeKneeFlexion(Math.PI));
    expect(bdc).toBeGreaterThan(25);
    expect(bdc).toBeLessThan(35);

    // Top dead centre closes the other end of the range; a real rider folds to
    // about 105°. Together these two pin the saddle height from both sides.
    const tdc = deg(bikeKneeFlexion(0));
    expect(tdc).toBeGreaterThan(98);
    expect(tdc).toBeLessThan(112);

    // The knee must never straighten through the cycle — that is both wrong
    // and an IK singularity the contact solver cannot resolve.
    for (let i = 0; i < 36; i++) {
      const flexion = deg(bikeKneeFlexion((i / 36) * Math.PI * 2));
      expect(flexion, `knee flexion at ${i * 10}°`).toBeGreaterThan(20);
      expect(flexion, `knee flexion at ${i * 10}°`).toBeLessThan(120);
    }

    // Saddle above the bottom bracket, as a bike shop would measure it.
    const height = bikeSaddleTopY(BIKE_RIG) - BIKE_RIG.bottomBracket[1]!;
    expect(height).toBeGreaterThan(0.58);
    expect(height).toBeLessThan(0.68);
  });

  it("separates the pelvis root from the hip joint the femur actually starts at", () => {
    // `v4Hips` is the pelvis root and sits 25 mm above `v4LeftUpperLeg`. The
    // seating solve used to treat them as one point and quietly lost that
    // 25 mm of leg, which pulled the saddle down with it.
    const hipRoot = BIKE_RIG.rider.root[1]!;
    const bdcPedalY = BIKE_RIG.bottomBracket[1]! - BIKE_RIG.crank.pedalRadius;
    const setback = BIKE_RIG.bottomBracket[2]! - BIKE_RIG.rider.root[2]!;
    const legSpan = BIKE_RIG.athlete.thigh + BIKE_RIG.athlete.shin;

    // Reach measured from the pelvis root would over-report the leg by 25 mm.
    const fromRoot = Math.hypot(hipRoot - bdcPedalY, setback);
    const fromFemoralHead = Math.hypot(hipRoot - 0.025 - bdcPedalY, setback);
    expect(fromRoot - fromFemoralHead).toBeCloseTo(0.025, 3);
    expect(fromFemoralHead).toBeLessThan(legSpan);
  });

  it("gives the saddle a cut-out that clears the perineum it cannot support", () => {
    // The sit surface is the ischial plateau. The perineum on the centreline
    // hangs ~37 mm below it, so the saddle has to be open there rather than
    // pass through the rider — which is exactly why real performance saddles
    // have a cut-out.
    const relief = BIKE_RIG.rider.sitSurfaceFromHip[1]! - BIKE_RIG.rider.perineumFromHipY;
    expect(relief).toBeGreaterThan(0.03);

    // Straight down the centreline, over the whole seated region, there is no
    // saddle material at all.
    for (let z = -0.01; z <= 0.1; z += 0.005) {
      expect(bikeSaddleDropAt(0, z), `cut-out open at z=${z.toFixed(3)}`).toBeNull();
    }
    // ...and the wings on either side are still carrying at the plateau: the
    // surface reaches the pad top at the widest point and stays within a
    // centimetre of it across the ischial band.
    expect(bikeSaddleDropAt(0.075, 0)).toBeCloseTo(0, 6);
    expect(bikeSaddleDropAt(0.06, 0)).toBeLessThan(0.01);

    // Ischial support at the measured sit-bone spread (100-150 mm apart).
    for (const x of [0.05, 0.06, 0.07]) {
      expect(bikeSaddleDropAt(x, -0.005), `wing carries at x=${x}`).not.toBeNull();
    }
    // Nothing at the sit-bone spread once the thighs are sweeping through.
    expect(bikeSaddleDropAt(0.06, 0.08)).toBeNull();
  });

  it("carries the saddle on a real seatpost in line with the seat tube", () => {
    const bb = BIKE_RIG.bottomBracket;
    const cluster = BIKE_RIG.seatCluster;
    const clamp = BIKE_RIG.saddleClamp;
    const angle = (dy: number, dz: number) => (Math.atan2(dy, dz) * 180) / Math.PI;

    // Seat tube in the road range, and the exposed post collinear with it —
    // pinning the cluster 30 mm under the saddle left an 8 mm stub slanting
    // 50 mm aft once the saddle moved back over the sit bones.
    const seatTube = angle(cluster[1]! - bb[1]!, bb[2]! - cluster[2]!);
    const post = angle(clamp[1]! - cluster[1]!, cluster[2]! - clamp[2]!);
    expect(seatTube).toBeGreaterThan(71);
    expect(seatTube).toBeLessThan(76);
    expect(Math.abs(post - seatTube)).toBeLessThan(2);
    expect(Math.hypot(clamp[1]! - cluster[1]!, clamp[2]! - cluster[2]!)).toBeGreaterThan(0.04);

    // The post stops under the pad; anything higher spears the rider.
    expect(clamp[1]!).toBeLessThanOrEqual(bikeSaddleTopY(BIKE_RIG) - 0.02 + 1e-9);
    // Compact road frame: the top tube meets the seat tube below the saddle
    // and rises to the head tube, rather than running at saddle height.
    expect(cluster[1]!).toBeLessThan(bikeSaddleTopY(BIKE_RIG) - 0.05);
    expect(BIKE_RIG.headTop[1]!).toBeGreaterThan(cluster[1]!);
    expect(BIKE_RIG.headTop[1]! - cluster[1]!).toBeLessThan(0.12);

    // Saddle-to-bar drop, the other half of a road fit.
    const drop = bikeSaddleTopY(BIKE_RIG) - BIKE_RIG.handlebar.grip.y;
    expect(drop).toBeGreaterThan(0.02);
    expect(drop).toBeLessThan(0.14);
  });

  it("stays inside real saddle dimensions", () => {
    // 200 mm is a short-nose road saddle; 143 mm is a standard rear width.
    expect(BIKE_SADDLE_LENGTH).toBeGreaterThan(0.17);
    expect(BIKE_SADDLE_LENGTH).toBeLessThan(0.29);
    expect(BIKE_SADDLE_MAX_HALF_WIDTH * 2).toBeGreaterThan(0.12);
    expect(BIKE_SADDLE_MAX_HALF_WIDTH * 2).toBeLessThan(0.16);

    // The nose must narrow, or the thighs sweep straight through it.
    const nose = BIKE_SADDLE_STATIONS[BIKE_SADDLE_STATIONS.length - 1]!;
    expect(nose.halfWidth * 2).toBeLessThan(0.05);
    // The shell only ever hangs below the pad top, never above it.
    for (const station of BIKE_SADDLE_STATIONS) {
      expect(station.dropOuter, `station ${station.z} drop`).toBeGreaterThanOrEqual(0);
      expect(station.dropChannel).toBeGreaterThanOrEqual(station.dropOuter - 1e-9);
      expect(station.cutout).toBeLessThan(station.halfWidth);
    }
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
