import * as THREE from "three";
import { solveRigidContactPoint3D, type FigurePoint3 } from "./figurePose";
import { SKI_POLE_FLIGHT_APEX_CYCLE, SKI_POLE_OFF_CYCLE } from "./motionGraph";
import { SKI_HAND_FIST_CENTRE } from "./skiEquipment";

/** Solver margin retained at the straight-arm boundary. */
export const SKI_GRIP_REACH_MARGIN_M = 0.002;
/** Maximum arm extension is held briefly after the 0.29 pole-off landmark. */
export const SKI_POST_RELEASE_EXTENSION_CYCLE = 0.34;
/** The reach floor is fully released when the free-pole flight reaches its apex. */
export const SKI_POST_RELEASE_EXTENSION_END_CYCLE = SKI_POLE_FLIGHT_APEX_CYCLE;
/** Reach band over which the post-release floor eases back to the authored arc. */
const SKI_POST_RELEASE_EXTENSION_RANGE_M = 0.06;
/**
 * Keep the post-release peak fractionally ahead of pole-off. This 0.1 mm
 * continuation remains inside the solver's 2 mm straight-arm margin, but
 * prevents fixed-point rounding from reading as an elbow re-bend.
 */
const SKI_POST_RELEASE_REACH_CONTINUATION_M = 0.0001;

/**
 * C2 window that prevents the arm from re-bending as the basket leaves snow,
 * then hands authority back to the authored recovery arc.
 */
export function skiPostReleaseExtensionAuthority(cycle: number): number {
  if (cycle <= SKI_POLE_OFF_CYCLE || cycle >= SKI_POST_RELEASE_EXTENSION_END_CYCLE) return 0;
  if (cycle <= SKI_POST_RELEASE_EXTENSION_CYCLE) {
    return THREE.MathUtils.smootherstep(
      cycle,
      SKI_POLE_OFF_CYCLE,
      SKI_POST_RELEASE_EXTENSION_CYCLE,
    );
  }
  return (
    1 -
    THREE.MathUtils.smootherstep(
      cycle,
      SKI_POST_RELEASE_EXTENSION_CYCLE,
      SKI_POST_RELEASE_EXTENSION_END_CYCLE,
    )
  );
}

/**
 * Allocation-free closure between one V4 SkiErg arm and its rigid pole.
 *
 * The sport rig authors a contact point, while the V4 chain reaches with a
 * wrist bone plus an oriented fist-channel offset. Treating that offset as a
 * scalar "extra arm length" is only valid when it points directly along the
 * shoulder-to-contact ray; through recovery it does not, which was the source
 * of the one-sided 135 mm grip gap.
 *
 * This focused solver converts the channel offset into world space, shifts the
 * arm sphere to the corresponding reach origin, and intersects it with the
 * rigid pole sphere. Once a basket is released, an infeasible authored basket
 * point is translated by the minimum distance required for the two spheres to
 * touch. A planted basket is never moved.
 */
export class SkiGripReachSolver {
  readonly channelLength = Math.hypot(
    SKI_HAND_FIST_CENTRE.x,
    SKI_HAND_FIST_CENTRE.y,
    SKI_HAND_FIST_CENTRE.z,
  );

  private readonly handWorldQuaternion = new THREE.Quaternion();
  private readonly contactOffsetWorld = new THREE.Vector3();
  private readonly reachOriginWorld = new THREE.Vector3();
  private readonly tipReachDeltaWorld = new THREE.Vector3();

  constructor(
    private readonly poleLength: number,
    private readonly minimumReach: number,
  ) {}

  /** Keep the authored free-pole preference inside the visible arm envelope. */
  clampPreferredContact(
    shoulderWorld: FigurePoint3,
    preferredContactWorld: THREE.Vector3,
    structuralReach: number,
  ): void {
    // This preference is the fitted fist-channel centre, not the wrist bone.
    // Preserve room for the oriented channel; clamping it to bare arm length
    // over-shortened the free-flight preference and re-bent the elbow just
    // after pole-off. The exact solve below still enforces wrist reach.
    const maximumReach = this.maximumContactReach(structuralReach);
    const desiredReach = preferredContactWorld.distanceTo(shoulderWorld);
    if (desiredReach > maximumReach && desiredReach > 1e-6) {
      preferredContactWorld.sub(shoulderWorld).setLength(maximumReach).add(shoulderWorld);
    }
  }

  /** Broad contact-point reach used only to seed the oriented fixed-point. */
  maximumContactReach(structuralReach: number): number {
    return Math.max(
      SKI_GRIP_REACH_MARGIN_M,
      structuralReach + this.channelLength - SKI_GRIP_REACH_MARGIN_M,
    );
  }

  /**
   * Solve one oriented grip contact.
   *
   * `tipWorld` is mutated only when `allowFreeTipCorrection` is true and its
   * current pole sphere cannot intersect the arm sphere. `out` always receives
   * a finite point on the rigid pole sphere.
   */
  solve(
    shoulderWorld: FigurePoint3,
    preferredContactWorld: FigurePoint3,
    tipWorld: THREE.Vector3,
    structuralReach: number,
    side: number,
    parentWorldQuaternion: THREE.Quaternion,
    handLocalQuaternion: THREE.Quaternion,
    allowFreeTipCorrection: boolean,
    out: THREE.Vector3,
    extensionAuthority = 0,
  ): boolean {
    this.handWorldQuaternion.copy(parentWorldQuaternion).multiply(handLocalQuaternion);
    this.contactOffsetWorld
      .set(side * SKI_HAND_FIST_CENTRE.x, SKI_HAND_FIST_CENTRE.y, SKI_HAND_FIST_CENTRE.z)
      .applyQuaternion(this.handWorldQuaternion);
    this.reachOriginWorld.copy(shoulderWorld).add(this.contactOffsetWorld);

    const authority = THREE.MathUtils.clamp(extensionAuthority, 0, 1);
    const maximumReach = Math.max(
      SKI_GRIP_REACH_MARGIN_M,
      structuralReach - SKI_GRIP_REACH_MARGIN_M + authority * SKI_POST_RELEASE_REACH_CONTINUATION_M,
    );
    const minimumReach =
      authority > 0
        ? THREE.MathUtils.lerp(
            Math.max(this.minimumReach, maximumReach - SKI_POST_RELEASE_EXTENSION_RANGE_M),
            maximumReach,
            authority,
          )
        : this.minimumReach;
    let exact = solveRigidContactPoint3D(
      this.reachOriginWorld,
      preferredContactWorld,
      tipWorld,
      this.poleLength,
      minimumReach,
      maximumReach,
      out,
    );
    if (exact || !allowFreeTipCorrection) return exact;

    this.tipReachDeltaWorld.copy(this.reachOriginWorld).sub(tipWorld);
    const centerDistance = this.tipReachDeltaWorld.length();
    const maximumCenterDistance = this.poleLength + maximumReach;
    const minimumCenterDistance = Math.abs(this.poleLength - maximumReach);
    if (centerDistance > maximumCenterDistance && centerDistance > 1e-6) {
      tipWorld.addScaledVector(
        this.tipReachDeltaWorld,
        (centerDistance - maximumCenterDistance) / centerDistance,
      );
    } else if (centerDistance < minimumCenterDistance && centerDistance > 1e-6) {
      tipWorld.addScaledVector(
        this.tipReachDeltaWorld,
        -(minimumCenterDistance - centerDistance) / centerDistance,
      );
    }

    exact = solveRigidContactPoint3D(
      this.reachOriginWorld,
      preferredContactWorld,
      tipWorld,
      this.poleLength,
      minimumReach,
      maximumReach,
      out,
    );
    return exact;
  }
}
