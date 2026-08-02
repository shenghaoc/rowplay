/**
 * Shared construction kit for the three sport avatars: figure and equipment
 * primitives, the material palette, limb placement, and the `Avatar` contract
 * the course renderer drives.
 *
 * Sibling of `renderer3dVenueKit` — that one builds the world around the
 * athlete, this one builds the athlete and the machine. Nothing here is
 * sport-specific: anything only one sport uses belongs in that sport's module,
 * so the primitives stay a single authority for all three rather than drifting
 * per sport. Module-level scratch vectors are shared and written in place, so
 * every consumer must finish with one before calling out.
 */
import * as THREE from "three";
import { type StrokePose } from "./strokeModel";
import { type FigurePoint3 } from "./figurePose";
import {
  hideWithReplayAssets,
  setReplayAssetSlot,
  type ReplayAssetMaterialResolver,
  type ReplayAssetMaterialRole,
} from "./renderer3dAssets";
import { type ReplayV4MotionController } from "./renderer3dV4Motion";

/**
 * One course lap, in metres. Lives here rather than on `CourseRenderer3D` so a
 * sport avatar can place course-relative hardware without importing the course
 * renderer that builds it; the class re-exposes it as its `LOOP_METERS` static.
 */
export const COURSE_LOOP_METERS = 1000;

export type AvatarMotionCues =
  | { vertical: number; surge: number; rollDamp?: number }
  | { rebound: number; surge: number };
export const STATIC_AVATAR_MOTION: AvatarMotionCues = { vertical: 0, surge: 0 };
/**
 * One athlete + sport machine for a lane. `group` is placed on the lap
 * circle (and receives bob/roll); `animate` drives sport-specific motion from
 * the shared data-derived `StrokePose` and returns secondary outer-body cues
 * from that same solve. Distance is passed separately for BikeErg wheel roll.
 * Parts carrying `userData.accent` re-theme to the per-lane accent
 * (`--live` / `--ghost`); skin/kit/shafts stay fixed. Local +Z is travel.
 */
export interface Avatar {
  group: THREE.Group;
  /** Maps V3's neutral geometry roles to this live/ghost rig's materials. */
  assetMaterialResolver: ReplayAssetMaterialResolver;
  /**
   * Contact-safe procedural landmarks retained as the authoritative target
   * rig when a skinned V4 athlete is installed over the visible body.
   */
  v4Targets: AvatarV4Targets;
  /**
   * Optional visible skinned hero. Clips own the base performance; the
   * post-clip contact pass keeps palms and soles on authoritative equipment.
   */
  v4Motion?: ReplayV4MotionController | null;
  /** Lets rigid hand-contact paths stay inside the installed skin's reach. */
  setV4ArmReach?(reach: number): void;
  /**
   * Re-solves equipment targets from the just-sampled visible V4 shoulders.
   * Equipment-specific arms use this because a generic clip bend plane cannot
   * describe every seated or planted machine contact.
   */
  refineV4Targets?(motion: ReplayV4MotionController): void;
  animate(
    phase: number,
    reduceMotion: boolean,
    pose?: StrokePose,
    meters?: number,
  ): AvatarMotionCues;
  /**
   * Resolve contacts which need the avatar's final course-space transform.
   * Ski poles use this second pass so planted tips are world anchors rather
   * than followers of a moving torso.
   */
  resolveWorldContacts?(): void;
}
export interface AvatarV4Targets {
  readonly pelvis: THREE.Object3D;
  readonly leftHand: THREE.Object3D;
  readonly rightHand: THREE.Object3D;
  readonly leftElbow: THREE.Object3D;
  readonly rightElbow: THREE.Object3D;
  readonly leftFoot: THREE.Object3D;
  readonly rightFoot: THREE.Object3D;
  readonly leftKnee: THREE.Object3D;
  readonly rightKnee: THREE.Object3D;
}
export type ReplayAssetMaterialPalette = Readonly<Record<ReplayAssetMaterialRole, THREE.Material>>;
export function makeAssetMaterialResolver(
  palette: ReplayAssetMaterialPalette,
): ReplayAssetMaterialResolver {
  return (role) => palette[role];
}
/**
 * Finalize an avatar group: cast shadows from every mesh (so heads, oars, poles,
 * wheels etc. aren't left floating shadowless) and, for the ghost lane, make all
 * materials translucent. Handles both single and multi-material meshes.
 */
export function finalizeAvatar(group: THREE.Group, castShadow: boolean, opacity: number): void {
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = castShadow;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (opacity < 1 && mat instanceof THREE.Material) {
        mat.transparent = true;
        mat.opacity = opacity;
        mat.depthWrite = false;
      }
    }
  });
}
// Semantic body values stay independent of lane accents so live purple and
// ghost cyan never collapse skin, kit, or footwear into one value family.
export const HUMAN_SKIN = 0xe8b48c;
export const HUMAN_HAIR = 0x3d322c;
export const HUMAN_KIT = 0x5e7386;
export const HUMAN_KIT_DARK = 0x1f2b36;
export const HUMAN_SHOE = 0xdde6ea;
export function humanMat(
  color: number,
  roughness = 0.62,
  metalness = 0,
): THREE.MeshStandardMaterial {
  // Athlete shells are deliberately smooth-shaded. The authored rig carries
  // controlled anatomical planes in its normals; forcing every material flat
  // made even the higher-detail rider read like a blocky game figurine.
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
export function makeSkinMaterial(color: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.34,
    metalness: 0.02,
    sheen: 0.16,
    sheenColor: new THREE.Color(0xffddcc),
    sheenRoughness: 0.62,
  });
}
export function makeHairMaterial(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.04,
  });
}
/**
 * Fabric gets its own physically based response.  Keeping jersey, hull, pole
 * blade, and bicycle frame on one purple material was the biggest remaining
 * reason the premium shell still read like a painted toy.
 */
export function accentMaterial(accent: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: accent,
    roughness: 0.62,
    metalness: 0,
    sheen: 0.28,
    sheenColor: new THREE.Color(0xdde9ff),
    sheenRoughness: 0.72,
    emissive: accent,
    emissiveIntensity: 0.012,
  });
}
export type BoatDetail = 0 | 1 | 2 | 3;

/** Painted composite equipment carries a restrained clearcoat, never fabric. */
export function boatMaterial(
  color: number,
  detail: BoatDetail,
  roughness: number,
  metalness: number,
): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
  if (detail === 0) return humanMat(color, Math.min(0.88, roughness + 0.2), metalness * 0.45);
  const level = detail - 1;
  const clearcoat = [0.18, 0.42, 0.7][level] ?? 0.7;
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: Math.max(0.16, roughness - level * 0.055),
    metalness: Math.min(0.82, metalness + level * 0.035),
    clearcoat,
    clearcoatRoughness: [0.28, 0.2, 0.12][level] ?? 0.12,
    sheen: detail >= 3 ? 0.08 : 0,
    emissive: color,
    emissiveIntensity: 0.006,
  });
}

export function accentEquipmentMaterial(
  accent: number,
  detail: BoatDetail = 3,
): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
  return boatMaterial(accent, detail, 0.34, 0.08);
}
export function accentPart(mesh: THREE.Mesh): THREE.Mesh {
  mesh.userData.accent = true;
  return mesh;
}
export function ellipsoid(
  scale: [number, number, number],
  material: THREE.Material,
  segments = 16,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, segments, Math.max(8, segments / 2)),
    material,
  );
  mesh.scale.set(scale[0], scale[1], scale[2]);
  return mesh;
}
/**
 * A watertight procedural torso with a visible waist, rib cage and shoulder
 * taper. Elliptical rings preserve authored width and depth while producing a
 * recognisably human silhouette from front, side and rear views.
 */
export function shapedTorso(
  halfWidth: number,
  height: number,
  halfDepth: number,
  material: THREE.Material,
  segments = 10,
): THREE.Mesh {
  // Explicit elliptical rings make the chest, waist and back planes part of
  // one watertight body. Bias toward a broadcast sports illustration: broad
  // scapular shelf, athletic waist, and enough rear depth that the chase
  // camera never flattens the jersey into a cardboard panel.
  const rings = [
    { y: -0.5, width: 0.72, depth: 0.78 },
    { y: -0.38, width: 0.82, depth: 0.88 },
    { y: -0.16, width: 0.74, depth: 0.9 },
    { y: 0.06, width: 0.9, depth: 0.98 },
    { y: 0.3, width: 1.06, depth: 1.04 },
    { y: 0.44, width: 1.02, depth: 0.9 },
    { y: 0.52, width: 0.68, depth: 0.72 },
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  for (const ring of rings) {
    for (let side = 0; side < segments; side++) {
      const angle = (side / segments) * Math.PI * 2;
      positions.push(Math.cos(angle) * ring.width, ring.y, Math.sin(angle) * ring.depth);
    }
  }
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let side = 0; side < segments; side++) {
      const next = (side + 1) % segments;
      const a = ring * segments + side;
      const b = ring * segments + next;
      const c = (ring + 1) * segments + side;
      const d = (ring + 1) * segments + next;
      indices.push(a, c, b, b, c, d);
    }
  }
  const bottomCenter = positions.length / 3;
  positions.push(0, rings[0]?.y ?? -0.5, 0);
  const topCenter = positions.length / 3;
  positions.push(0, rings.at(-1)?.y ?? 0.5, 0);
  for (let side = 0; side < segments; side++) {
    const next = (side + 1) % segments;
    // Outward cap normals: bottom points -Y, top points +Y. Reversing these
    // windings makes the supposedly watertight torso disappear at its neck
    // and waist when the default FrontSide material culls back faces.
    indices.push(bottomCenter, side, next);
    const top = (rings.length - 1) * segments;
    indices.push(topCenter, top + next, top + side);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const torso = new THREE.Mesh(geometry, material);
  torso.scale.set(halfWidth, height, halfDepth);
  return torso;
}
export function trapezoidPanel(
  topWidth: number,
  bottomWidth: number,
  height: number,
  depth: number,
  material: THREE.Material,
): THREE.Mesh {
  const shape = new THREE.Shape();
  // A jersey yoke is cloth, not a four-cornered plate. Rounding and lightly
  // beveling this contour prevents the dark trim from reading as a blocky
  // backpack in the rear three-quarter camera while retaining its clear kit
  // separation at replay scale.
  const radius = Math.min(height * 0.18, topWidth * 0.11, bottomWidth * 0.11);
  const top = topWidth / 2;
  const bottom = bottomWidth / 2;
  const halfHeight = height / 2;
  shape.moveTo(-bottom + radius, -halfHeight);
  shape.lineTo(bottom - radius, -halfHeight);
  shape.quadraticCurveTo(bottom, -halfHeight, bottom - radius * 0.3, -halfHeight + radius);
  shape.lineTo(top, halfHeight - radius);
  shape.quadraticCurveTo(top, halfHeight, top - radius, halfHeight);
  shape.lineTo(-top + radius, halfHeight);
  shape.quadraticCurveTo(-top, halfHeight, -top, halfHeight - radius);
  shape.lineTo(-bottom + radius * 0.3, -halfHeight + radius);
  shape.quadraticCurveTo(-bottom, -halfHeight, -bottom + radius, -halfHeight);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: 8,
    bevelEnabled: true,
    bevelThickness: Math.min(depth * 0.32, 0.012),
    bevelSize: Math.min(radius * 0.42, 0.014),
    bevelSegments: 2,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}
export function jointCap(radius: number, material: THREE.Material, segments = 8): THREE.Mesh {
  // Keep fallback joint masses small and soft so procedural limbs read as
  // continuous tubes; authored shells hide these completely when the GLB loads.
  return hideWithReplayAssets(
    ellipsoid([radius * 0.92, radius * 0.86, radius * 0.92], material, segments),
  );
}
/**
 * Preserve a compact fallback elbow, but let the authored v2 flex cuff replace
 * it when available. Other joint caps remain hidden under their overlapping
 * shells; an elbow needs a visible transitional form at deep flex.
 */
export function elbowCap(radius: number, material: THREE.Material, segments = 8): THREE.Mesh {
  const elbow = jointCap(radius, material, segments);
  elbow.userData.hideWithReplayAssets = false;
  return setReplayAssetSlot(elbow, "athlete:elbow");
}
export function capsulePart(
  radius: number,
  length: number,
  material: THREE.Material,
  axis: "x" | "y" | "z" = "y",
): THREE.Mesh {
  // Bake the axis into the geometry, rather than leaving it on the mesh
  // transform. Authored-shell fitting intentionally compares local bounds, so
  // a Z-long pole grip needs Z-long fallback bounds before its runtime
  // quaternion is replaced by the pole-shaft contact solve.
  const geometry = new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 8, 16);
  if (axis === "x") geometry.rotateZ(Math.PI / 2);
  if (axis === "z") geometry.rotateX(Math.PI / 2);
  return new THREE.Mesh(geometry, material);
}
export function tubeBetween(
  name: string,
  start: FigurePoint3,
  end: FigurePoint3,
  radius: number,
  material: THREE.Material,
): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(radius, radius, 1, 8);
  geometry.rotateX(Math.PI / 2);
  const tube = new THREE.Mesh(geometry, material);
  tube.name = name;
  placeSegmentCoordinates(tube, start.x, start.y, start.z, end.x, end.y, end.z);
  return tube;
}
export const SEGMENT_FORWARD = new THREE.Vector3(0, 0, 1);
export const SEGMENT_DIR = new THREE.Vector3();
export const ELBOW_AXIS = new THREE.Vector3();
export const ELBOW_INSIDE = new THREE.Vector3();
export const ELBOW_SIDE = new THREE.Vector3();
export const ELBOW_FRAME = new THREE.Matrix4();
export const ARM_BEND_SCRATCH = new THREE.Vector3();
export const GRIP_FOREARM_SCRATCH = new THREE.Vector3();
export const GRIP_SHAFT_SCRATCH = new THREE.Vector3();
export const GRIP_ROLL_SCRATCH = new THREE.Vector3();
export const GRIP_LONG_SCRATCH = new THREE.Vector3();
export const GRIP_SPIN_SCRATCH = new THREE.Quaternion();
/**
 * How far the pole may ride diagonally across the palm (rotation about the
 * palm normal) to keep the hand's long axis near the forearm line. Real
 * double-pole grips sit diagonal at the high reach; without this freedom the
 * square-across-the-fist channel demanded ~130° of hand-vs-forearm
 * reorientation and linear-blend skinning tore the wrist ring open.
 */
export const SKI_PALM_TILT = 0.65;
/**
 * Sculling diagonal-hold relief. The oar handle sweeps ~50-70° from lateral
 * through the stroke, and the fist's channel axis is pinned 109.4° from the
 * hand's long axis — so a square hold forces 40-60° of wrist bend. Real
 * scullers keep the wrist flat and let the handle ride diagonally across the
 * palm instead; the tilt models that with the palm facing unchanged. Comfort
 * is the flat-wrist target (Concept2: "wrists should be flat"), the budget is
 * how diagonal the handle may sit in the palm.
 */
export const ROWER_PALM_TILT = 0.75;
export const ROWER_PALM_TILT_COMFORT = 0.3;
/**
 * Hand-long-axis-vs-forearm misalignment (about the palm normal) a wrist
 * carries comfortably without any diagonal-grip relief. Below this the
 * closed fist stays exactly on its authored square channel; only the excess
 * beyond it is tilted away, up to SKI_PALM_TILT.
 */
export const SKI_PALM_TILT_COMFORT = 1.15;
/**
 * Stable two-bone arm bend direction for equipment-locked hands.
 *
 * A fixed world hint (pure lateral / pure aft) flips elbows through the body
 * or into a chicken-wing when the grip path changes. Project a preferred
 * out/up/aft cue onto the plane perpendicular to the shoulder→hand chord so
 * the joint stays outside the torso and on the correct side of the arm.
 */
export function setArmBendHint(
  shoulder: THREE.Vector3,
  hand: THREE.Vector3,
  side: number,
  out: THREE.Vector3,
  options: { readonly lateral?: number; readonly up?: number; readonly aft?: number } = {},
): void {
  const lateral = options.lateral ?? 0.5;
  const up = options.up ?? 0.2;
  const aft = options.aft ?? 0;
  out.set(side * lateral, up, aft);
  ARM_BEND_SCRATCH.set(hand.x - shoulder.x, hand.y - shoulder.y, hand.z - shoulder.z);
  const chordLen = ARM_BEND_SCRATCH.length();
  if (chordLen > 1e-6) {
    ARM_BEND_SCRATCH.multiplyScalar(1 / chordLen);
    const along = out.dot(ARM_BEND_SCRATCH);
    out.addScaledVector(ARM_BEND_SCRATCH, -along);
  }
  if (out.lengthSq() < 1e-6) {
    // Degenerate: fall back to pure side-out so the solver still has a plane.
    out.set(side, 0.25, 0);
  }
}
export function placeSegmentCoordinates(
  segment: THREE.Object3D,
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endY: number,
  endZ: number,
): void {
  const dx = endX - startX;
  const dy = endY - startY;
  const dz = endZ - startZ;
  const length = Math.hypot(dx, dy, dz);
  if (length < 0.001) {
    // Remember that *this* path collapsed the segment so a later non-zero
    // length can revive it. Do not stamp that flag when something else
    // (notably the V4 skinned hero) already hid the mesh.
    if (segment.visible) segment.userData.replaySegmentLengthCollapse = true;
    segment.visible = false;
    return;
  }
  // Never force-show a limb that V4 or the asset hide path intentionally
  // suppressed. The old unconditional `visible = true` resurrected the
  // procedural arm/leg tubes on every frame after V4's one-shot hide, so the
  // athlete rendered with two sets of limbs.
  if (segment.userData.replaySegmentLengthCollapse || segment.visible) {
    segment.visible = true;
    delete segment.userData.replaySegmentLengthCollapse;
  }
  segment.position.set((startX + endX) / 2, (startY + endY) / 2, (startZ + endZ) / 2);
  segment.scale.set(1, 1, length);
  SEGMENT_DIR.set(dx / length, dy / length, dz / length);
  segment.quaternion.setFromUnitVectors(SEGMENT_FORWARD, SEGMENT_DIR);
}
export function placeFigureSegmentBetween(
  segment: THREE.Object3D,
  start: FigurePoint3,
  end: FigurePoint3,
): void {
  placeSegmentCoordinates(segment, start.x, start.y, start.z, end.x, end.y, end.z);
}
/**
 * Aim the authored elbow cuff from the actual arm bend rather than leaving its
 * asymmetric flex groove in a fixed local orientation. Local +Z follows the
 * shoulder-to-wrist chord; local -Y exposes the olecranon to the outside of
 * the bend. The near-straight fallback is side-stable, so the shell cannot
 * suddenly roll 180 degrees while an arm reaches its longest pose.
 *
 * All scratch objects are module-owned and this function writes only to the
 * existing cuff transform, keeping the per-frame avatar path allocation-free.
 */
export function orientElbowCuff(
  cuff: THREE.Object3D,
  shoulder: FigurePoint3,
  elbow: FigurePoint3,
  wrist: FigurePoint3,
  side: number,
): void {
  ELBOW_AXIS.set(wrist.x - shoulder.x, wrist.y - shoulder.y, wrist.z - shoulder.z);
  if (ELBOW_AXIS.lengthSq() < 1e-8) ELBOW_AXIS.set(0, 0, 1);
  else ELBOW_AXIS.normalize();

  // The vector from the shoulder/wrist midpoint to the joint points out of
  // the elbow. The authored shell's olecranon sits on local -Y, so its local
  // +Y basis must face into the bend.
  ELBOW_INSIDE.set(
    shoulder.x + wrist.x - elbow.x * 2,
    shoulder.y + wrist.y - elbow.y * 2,
    shoulder.z + wrist.z - elbow.z * 2,
  );
  ELBOW_INSIDE.addScaledVector(ELBOW_AXIS, -ELBOW_INSIDE.dot(ELBOW_AXIS));
  if (ELBOW_INSIDE.lengthSq() < 1e-8) {
    // A fully extended arm has no bend-plane normal. Project a mirrored
    // lateral reference into the plane so left/right cuffs retain a stable,
    // readable roll instead of taking the solver's arbitrary fallback axis.
    ELBOW_INSIDE.set(side < 0 ? -1 : 1, 0, 0);
    ELBOW_INSIDE.addScaledVector(ELBOW_AXIS, -ELBOW_INSIDE.dot(ELBOW_AXIS));
  }
  if (ELBOW_INSIDE.lengthSq() < 1e-8) {
    ELBOW_INSIDE.set(0, 1, 0);
    ELBOW_INSIDE.addScaledVector(ELBOW_AXIS, -ELBOW_INSIDE.dot(ELBOW_AXIS));
  }
  ELBOW_INSIDE.normalize();
  ELBOW_SIDE.crossVectors(ELBOW_INSIDE, ELBOW_AXIS).normalize();
  // Rebuild the inside axis from the other two basis vectors to remove small
  // numerical skew before handing it to the authored shell quaternion.
  ELBOW_INSIDE.crossVectors(ELBOW_AXIS, ELBOW_SIDE).normalize();
  ELBOW_FRAME.makeBasis(ELBOW_SIDE, ELBOW_INSIDE, ELBOW_AXIS);
  cuff.quaternion.setFromRotationMatrix(ELBOW_FRAME);
}

// ── Upgraded avatar body helpers ─────────────────────────────────────────────
// These replace uniform-radius capsules and plain ellipsoids with replay-scale
// faceted masses that preserve body planes, grip contacts and footwear.
/**
 * A faceted limb that tapers from proximal to distal radius with a slight
 * belly. Returns a unit-length mesh along +Z for segment placement.
 */
export function taperedLimb(
  proximalRadius: number,
  distalRadius: number,
  material: THREE.Material,
  segments = 16,
): THREE.Mesh {
  const ringCount = 14;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring < ringCount; ring++) {
    const t = ring / (ringCount - 1);
    const base = proximalRadius + (distalRadius - proximalRadius) * t;
    const belly = Math.sin(t * Math.PI) * proximalRadius * 0.12;
    const radius = base + belly;
    for (let side = 0; side < segments; side++) {
      const angle = (side / segments) * Math.PI * 2;
      // Slightly elliptical cross-section reads as muscle from the chase view.
      positions.push(Math.cos(angle) * radius * 1.14, Math.sin(angle) * radius * 0.86, t - 0.5);
    }
  }
  // Cap both ends so the limb is watertight — the old open-ended tube exposed
  // the environment through the ends whenever a knee or elbow folded in view.
  const proximalCenter = positions.length / 3;
  positions.push(0, 0, -0.5);
  const distalBase = (ringCount - 1) * segments;
  const distalCenter = positions.length / 3;
  positions.push(0, 0, 0.5);
  for (let side = 0; side < segments; side++) {
    const next = (side + 1) % segments;
    indices.push(proximalCenter, side, next);
    indices.push(distalCenter, distalBase + next, distalBase + side);
  }
  for (let ring = 0; ring < ringCount - 1; ring++) {
    for (let side = 0; side < segments; side++) {
      const next = (side + 1) % segments;
      const a = ring * segments + side;
      const b = ring * segments + next;
      const c = (ring + 1) * segments + side;
      const d = (ring + 1) * segments + next;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}
/** One replay-scale mitten mass; sub-pixel fingers would only add noise. */
export function makeHand(material: THREE.Material, side = 1, segments = 14): THREE.Group {
  const hand = new THREE.Group();
  hand.name = "athlete:hand";
  const palm = setReplayAssetSlot(
    ellipsoid([0.06, 0.04, 0.075], material, segments),
    "athlete:hand",
  );
  palm.name = "athlete:hand:palm";
  palm.rotation.z = side * 0.08;
  hand.add(palm);
  return hand;
}
/**
 * A foot mesh: shoe-shaped sole with toe box and heel.
 */
export function makeFoot(material: THREE.Material): THREE.Group {
  const foot = new THREE.Group();
  foot.name = "athlete:foot";
  const geometry = new THREE.BoxGeometry(0.12, 0.065, 0.23, 2, 2, 4);
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const z = positions.getZ(i);
    const x = positions.getX(i);
    positions.setX(i, x * (z > 0 ? 1.08 : 0.82));
    if (z > 0 && positions.getY(i) > 0) positions.setY(i, positions.getY(i) + 0.018);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  const shoe = setReplayAssetSlot(new THREE.Mesh(geometry, material), "athlete:shoe");
  shoe.position.z = 0.055;
  shoe.name = "athlete:foot:shoe";
  foot.add(shoe);
  return foot;
}
/**
 * A bold faceted head and hair mass sized for the replay camera. Jaw and hair
 * planes give the silhouette a facing direction from the rear three-quarter.
 */
export function makeHead(
  skinMat: THREE.Material,
  hairMat: THREE.Material,
  segments = 16,
): THREE.Group {
  const head = new THREE.Group();
  head.name = "athlete:head";
  const cranium = setReplayAssetSlot(
    ellipsoid([0.118, 0.132, 0.112], skinMat, segments),
    "athlete:head",
  );
  cranium.name = "athlete:head:cranium";
  head.add(cranium);
  const jaw = ellipsoid([0.078, 0.042, 0.07], skinMat, Math.max(12, segments));
  jaw.name = "athlete:head:jaw";
  jaw.position.set(0, -0.07, 0.028);
  head.add(jaw);
  const hair = setReplayAssetSlot(
    ellipsoid([0.122, 0.058, 0.118], hairMat, segments),
    "athlete:hair",
  );
  hair.position.set(0, 0.09, -0.012);
  head.add(hair);
  return head;
}
