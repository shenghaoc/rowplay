import { HAND_FIST_REFERENCE_GRIP_RADIUS } from "./handGrip";
import type { RenderQuality } from "./replayRenderer";

/**
 * Human-scale SkiErg proportions shared by the procedural equipment rig and
 * its authored V3 replacement.
 *
 * These are **readable** proportions for a chase-camera replay — not literal
 * FIS millimetres and not the previous toy planks. Real race skis are
 * ~44–47 mm wide, but at our stage distance that becomes an invisible
 * toothpick under a still-readable boot. The contract below keeps:
 * - ski width clearly narrower than the old 110 mm planks, but wide enough to
 *   read under the boot;
 * - stance near hip width so the athlete does not stand on one rail.
 *
 * Ski and pole length are derived from the measured 1.64 m rig into the
 * classic bands: skis at ~116% (112–117% band) and poles at ~83.5%
 * (83–84% band). Their previous 126% / 93% values were sized against a
 * nominal 1.8 m figure that matched no rig in this repository.
 *
 * Boots, bindings, and ski width must stay in one family: a 10 cm boot on a
 * 4.6 cm ski is what made the last pass look absurd.
 */
export const SKI_ATHLETE_PROPORTIONS = Object.freeze({
  /**
   * Measured rest-pose stature of the shipped V4 athlete, pinned by
   * `renderer3d.test.ts`. The earlier nominal 1.8 m described no rig in this
   * repository, which let the ski/pole ratios below drift unnoticed.
   */
  standingHeight: 1.64,
  shoulderHalfWidth: 0.25,
  hipHalfWidth: 0.12,
  // Contact-safe limb lengths retained from PR172 so the V4 silhouette and the
  // procedural hand/pole and knee/ski closures share one reach envelope.
  upperArmLength: 0.49,
  forearmLength: 0.47,
  thighLength: 0.4,
  shinLength: 0.39,
  /** Half of ski centre-to-centre (~0.30 m stance, slightly outside the hips). */
  skiCenterOffset: 0.15,
  /**
   * Runner length: 1.64 m × 1.16 ≈ 1.90 m, inside the classic 112–117% band.
   * The GLB generator scales its authored 2.06 m native profile to this value
   * at build time, so the checked-in ski cannot drift from the contract.
   */
  skiLength: 1.9,
  /**
   * Maximum shovel width. Readable needle (~72 mm): thinner than the old
   * 110 mm planks, wider than literal 44–47 mm race stock so the boot still
   * sits on a visible platform.
   */
  skiWidth: 0.072,
  /**
   * Double-pole length: 1.64 m × 0.835 ≈ 1.37 m, inside the classic 83–84%
   * band. The rigid hand↔basket link and the plant solver read this value, so
   * the shorter pole steepens the plant without breaking the closure — the
   * hand is placed exactly `poleLength` from the tip inside the arm annulus.
   */
  poleLength: 1.37,
  /** Basket plant just outside the ski pair for a compact double-pole press. */
  polePlantLateralOffset: 0.46,
  /**
   * How far ahead of the athlete's centre the basket plants. Classic-length
   * poles plant closer to the feet than the previous long pair did: the
   * athlete advances past the fixed basket through the press, and with 1.37 m
   * of pole the old 0.04 m plant let the pole+arm chain reach collinearity
   * before release — a mechanism singularity where a centimetre of advance
   * swings the hand several, which is what broke grip continuity on the last
   * resize attempt. Planting 0.24 m forward restores the pre-resize taut
   * margin (~0.23 m) while the shaft still slants backward at impact.
   */
  polePlantForwardOffset: 0.24,
} as const);

/**
 * The palm rides this far down the shaft from the grip top, so the contact
 * solver targets a point inside the 0.15 m grip capsule rather than its rim.
 * Production and the contact assertions must read the same number.
 */
export const SKI_GRIP_SHIFT = 0.042;

/**
 * Physical radius of the rendered pole-grip capsule.
 *
 * The pole grip is the equipment the shipped hand's fist channel was
 * calibrated against, so this is not a free styling number: it *is*
 * `HAND_FIST_REFERENCE_GRIP_RADIUS`, and the pair (fitted 0.0169 m channel
 * around this 0.016 m rubber) is what pins the rig's digit-flesh envelope in
 * `handGrip.ts`. Re-sizing the rubber without re-fitting the channel silently
 * moves every solved grip on all three sports.
 */
export const SKI_POLE_GRIP_RADIUS = HAND_FIST_REFERENCE_GRIP_RADIUS;

export interface SkiEquipmentDetail {
  /** Radial resolution for the visible hard-surface fallback. */
  readonly radialSegments: number;
  /** Detail that earns geometry only when the tier can display it. */
  readonly topSheet: boolean;
  readonly metalEdges: boolean;
  readonly bindingRails: boolean;
  readonly bootClosures: boolean;
  readonly gripStraps: boolean;
  readonly basketRibs: boolean;
}

/**
 * Equipment is progressive in geometry, not only in pixel density. Low keeps a
 * complete, credible silhouette; Medium adds functional hardware; High and Ultra
 * spend additional geometry on edges, closures, and grip details.
 *
 * Shading stays procedural at every tier. The authored V3 ski composite carries
 * only POSITION and NORMAL — see `scripts/validate-replay-assets.mjs` — so a
 * texture map bound to those parts would sample a single texel. Any future map
 * has to arrive together with UVs and a relaxed slot validator.
 */
export const SKI_EQUIPMENT_DETAIL: Readonly<Record<RenderQuality, SkiEquipmentDetail>> =
  Object.freeze({
    low: {
      radialSegments: 8,
      topSheet: false,
      metalEdges: false,
      bindingRails: false,
      bootClosures: false,
      gripStraps: false,
      basketRibs: false,
    },
    medium: {
      radialSegments: 12,
      topSheet: true,
      metalEdges: false,
      bindingRails: true,
      bootClosures: true,
      gripStraps: true,
      basketRibs: false,
    },
    high: {
      radialSegments: 16,
      topSheet: true,
      metalEdges: true,
      bindingRails: true,
      bootClosures: true,
      gripStraps: true,
      basketRibs: true,
    },
    ultra: {
      radialSegments: 20,
      topSheet: true,
      metalEdges: true,
      bindingRails: true,
      bootClosures: true,
      gripStraps: true,
      basketRibs: true,
    },
  });

export function skiEquipmentDetail(quality: RenderQuality): SkiEquipmentDetail {
  return SKI_EQUIPMENT_DETAIL[quality];
}
