import * as THREE from "three";
import type { ReplayRenderer, RenderState } from "./renderer";
import { COLORS_DARK, COLORS_LIGHT, REDUCED_REPLAY_POSES } from "./renderer";
import type { RenderQuality } from "./replayRenderer";
import { catchTransitions, fallbackStrokePose, type StrokePose } from "./strokeModel";
import {
  solveBikeKinematics,
  solveRowerKinematics,
  solveSkierKinematics,
  type BikeKinematics,
  type RowerKinematics,
  type SkierKinematics,
} from "./sportKinematics";
import type { Sport } from "../types";
import { fmtPace } from "../format";
import { METERS_PER_CYCLE, ParticlePool, PerfGovernor, clampDt, dampFactor } from "./motion";

// Resolve lazily because this module is also imported during SSR. The returned
// MediaQueryList stays live as the OS preference changes, while avoiding a new
// matchMedia lookup on every animation frame.
let reducedMotionQuery: MediaQueryList | null = null;

function prefersReducedMotion(): boolean {
  if (
    reducedMotionQuery === null &&
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  }
  return reducedMotionQuery?.matches ?? false;
}

function hex(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

interface QualityConfig {
  dprCap: number;
  antialias: boolean;
  laneSegments: number;
  /** Plane segments per side (1 = flat, no displacement). */
  groundSegments: number;
  displacement: boolean;
  shadows: boolean;
  shadowMapSize: number;
  /** Number of wake segments trailing each boat (0 = no wake). */
  wake: number;
  /** Buoy lines marking the lane edges (one InstancedMesh, static). */
  buoys: boolean;
  buoysPerRing: number;
  buoyRings: number;
  /** Catch spray droplets on the live lane (one InstancedMesh draw). */
  spray: boolean;
  sprayParticles: number;
  sprayPerCatch: number;
}

const QUALITY: Record<RenderQuality, QualityConfig> = {
  low: {
    dprCap: 1,
    antialias: false,
    laneSegments: 48,
    groundSegments: 1,
    displacement: false,
    shadows: false,
    shadowMapSize: 0,
    wake: 0,
    buoys: false,
    buoysPerRing: 0,
    buoyRings: 0,
    spray: false,
    sprayParticles: 0,
    sprayPerCatch: 0,
  },
  medium: {
    dprCap: 2,
    antialias: true,
    laneSegments: 72,
    groundSegments: 16,
    displacement: true,
    shadows: false,
    shadowMapSize: 0,
    wake: 16,
    buoys: true,
    buoysPerRing: 48,
    buoyRings: 3,
    spray: true,
    sprayParticles: 40,
    sprayPerCatch: 4,
  },
  high: {
    dprCap: 2,
    antialias: true,
    laneSegments: 96,
    groundSegments: 28,
    displacement: true,
    shadows: true,
    shadowMapSize: 1024,
    wake: 28,
    buoys: true,
    buoysPerRing: 64,
    buoyRings: 3,
    spray: true,
    sprayParticles: 48,
    sprayPerCatch: 4,
  },
  ultra: {
    dprCap: 3,
    antialias: true,
    laneSegments: 144,
    groundSegments: 56,
    displacement: true,
    shadows: true,
    shadowMapSize: 2048,
    wake: 44,
    buoys: true,
    buoysPerRing: 96,
    buoyRings: 5,
    spray: true,
    sprayParticles: 72,
    sprayPerCatch: 6,
  },
};

export type Renderer3DBackend = "webgl" | "webgpu";

type RendererLike = {
  outputColorSpace?: string;
  shadowMap?: { enabled: boolean; type: unknown };
  setPixelRatio(dpr: number): void;
  setSize(width: number, height: number): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
  getContext?: () => unknown;
};

/**
 * Shape we duck-type onto Three's `Backend` after `WebGPURenderer.init()`:
 * the WebGPU backend sets `isWebGPUBackend = true`, the internal WebGL2
 * fallback sets `isWebGLBackend = true`. We read these in `ready()` to
 * detect a silent downgrade. Kept off `RendererLike` because Three's typed
 * `Backend` class doesn't expose these flag fields in its TypeScript shape.
 */
type ThreeBackendFlags = {
  backend?: { isWebGPUBackend?: boolean; isWebGLBackend?: boolean };
};

export type WebGPURendererCtor = new (opts: {
  canvas: HTMLCanvasElement;
  antialias: boolean;
  alpha: boolean;
}) => RendererLike & { init?: () => Promise<unknown> };

export interface Renderer3DOptions {
  backend?: Renderer3DBackend;
  WebGPURenderer?: WebGPURendererCtor;
}

function makeTextSprite(
  text: string,
  bg: string,
  fg: string,
  fontSize = 22,
): { sprite: THREE.Sprite; texture: THREE.CanvasTexture } {
  const pad = 10;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `600 ${fontSize}px "Source Code Pro", ui-monospace, monospace`;
  const tw = ctx.measureText(text).width;
  canvas.width = Math.ceil(tw + pad * 2);
  canvas.height = fontSize + pad * 2;
  ctx.font = `600 ${fontSize}px "Source Code Pro", ui-monospace, monospace`;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  const scale = 0.012;
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
  return { sprite, texture };
}

function updateTextSprite(
  sprite: THREE.Sprite,
  texture: THREE.CanvasTexture,
  text: string,
  bg: string,
  fg: string,
  fontSize = 22,
): void {
  const pad = 10;
  const canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  ctx.font = `600 ${fontSize}px "Source Code Pro", ui-monospace, monospace`;
  const tw = ctx.measureText(text).width;
  const targetWidth = Math.ceil(tw + pad * 2);
  const targetHeight = fontSize + pad * 2;
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  ctx.font = `600 ${fontSize}px "Source Code Pro", ui-monospace, monospace`;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  texture.needsUpdate = true;
  const scale = 0.012;
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
}

/**
 * A low-poly athlete + machine for one lane. `group` is placed on the lap
 * circle (and receives bob/roll); `animate` drives sport-specific motion from
 * the shared data-derived `StrokePose` and returns secondary outer-body cues
 * from that same solve. Distance is passed separately for BikeErg wheel roll.
 * Parts carrying `userData.accent` re-theme to the per-lane accent
 * (`--live` / `--ghost`); skin/kit/shafts stay fixed. Local +Z is travel.
 */
type AvatarMotionCues = { vertical: number; surge: number } | { rebound: number; surge: number };

const STATIC_AVATAR_MOTION: AvatarMotionCues = { vertical: 0, surge: 0 };

interface Avatar {
  group: THREE.Group;
  animate(
    phase: number,
    reduceMotion: boolean,
    pose?: StrokePose,
    meters?: number,
  ): AvatarMotionCues;
}

/** Per-sport scene + animation tuning. */
interface SportProfile {
  /** Displace the ground plane into rolling water. */
  waves: boolean;
  /** Lean the avatar side-to-side (hull roll on water). */
  roll: boolean;
  /** Vertical bob amplitude (0 = planted). */
  bobAmp: number;
  /** Distance (m) per full animation cycle — drives stroke/pedal cadence. */
  metersPerCycle: number;
  /** Stroke surge amplitude (m): the hull checks at the catch and runs on. */
  surgeAmp: number;
  /** Lateral offset (m) of the catch-spray spawn pair, or null for no spray. */
  sprayOffset: number | null;
  /** Ground opacity (water is translucent; snow/asphalt solid). */
  groundOpacity: number;
  /** Trailing-spray colour, or `null` for sports that leave no wake. */
  trailColor: number | null;
  /** Ground base colour for the active theme. */
  groundColor(theme: "light" | "dark"): number;
  /** Static course surface, lane line, and sport-specific marking colours. */
  course: CourseStyle;
  /** Build the lane avatar (athlete + machine). */
  make(accent: number, castShadow: boolean, opacity: number): Avatar;
}

interface CameraRig {
  readonly back: number;
  readonly height: number;
  readonly ahead: number;
  readonly lateral: number;
  readonly aimY: number;
}

const CAMERA_RIGS: Record<Sport, CameraRig> = {
  rower: { back: 5.55, height: 3.25, ahead: 3.1, lateral: 0.95, aimY: 0.8 },
  skierg: { back: 4.65, height: 3.35, ahead: 2.65, lateral: 0.72, aimY: 1.0 },
  bike: { back: 5.15, height: 2.9, ahead: 3.4, lateral: 0.78, aimY: 0.92 },
};

type ThemeName = "light" | "dark";
type CourseColor = (theme: ThemeName) => number;

interface CourseStyle {
  surface: CourseColor;
  edge: CourseColor;
  laneLine: CourseColor;
  detail: CourseColor;
  secondary: CourseColor;
  surfaceOpacity: number;
  roughness: number;
  metalness: number;
}

/**
 * Finalize an avatar group: cast shadows from every mesh (so heads, oars, poles,
 * wheels etc. aren't left floating shadowless) and, for the ghost lane, make all
 * materials translucent. Handles both single and multi-material meshes.
 */
function finalizeAvatar(group: THREE.Group, castShadow: boolean, opacity: number): void {
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = castShadow;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (opacity < 1 && mat instanceof THREE.Material) {
        mat.transparent = true;
        mat.opacity = opacity;
      }
    }
  });
}

const HUMAN_SKIN = 0xc99973;
const HUMAN_HAIR = 0x241c18;
const HUMAN_KIT = 0x202831;
const HUMAN_KIT_DARK = 0x111820;
const HUMAN_SHOE = 0x151719;

function humanMat(color: number, roughness = 0.74, metalness = 0.03): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function accentMaterial(accent: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: accent, roughness: 0.56, metalness: 0.04 });
}

function accentPart(mesh: THREE.Mesh): THREE.Mesh {
  mesh.userData.accent = true;
  return mesh;
}

function ellipsoid(
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

function capsulePart(
  radius: number,
  length: number,
  material: THREE.Material,
  axis: "x" | "y" | "z" = "y",
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 5, 10),
    material,
  );
  if (axis === "x") mesh.rotation.z = Math.PI / 2;
  if (axis === "z") mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function limbSegment(
  length: number,
  radius: number,
  material: THREE.Material,
  axis: "x" | "y" | "z" = "z",
): THREE.Mesh {
  const mesh = capsulePart(radius, length, material, axis);
  if (axis === "x") mesh.position.x = length / 2;
  else if (axis === "z") mesh.position.z = length / 2;
  else mesh.position.y = -length / 2;
  return mesh;
}

type Point3 = readonly [number, number, number];

const SEGMENT_FORWARD = new THREE.Vector3(0, 0, 1);
const SEGMENT_DIR = new THREE.Vector3();

function placeSegmentBetween(segment: THREE.Object3D, start: Point3, end: Point3): void {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const length = Math.hypot(dx, dy, dz);
  if (length < 0.001) {
    segment.visible = false;
    return;
  }
  segment.visible = true;
  segment.position.set((start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2);
  segment.scale.set(1, 1, length);
  SEGMENT_DIR.set(dx / length, dy / length, dz / length);
  segment.quaternion.setFromUnitVectors(SEGMENT_FORWARD, SEGMENT_DIR);
}

// ── Upgraded avatar body helpers ─────────────────────────────────────────────
// These replace uniform-radius capsules and plain ellipsoids with shaped body
// parts that give visible muscle definition, hands/feet, and facial features.

/**
 * A muscle-shaped limb: a lathe geometry that tapers from proximal to distal
 * radius with a slight belly, giving visible bicep/quadricep shape.
 * Returns a unit-length mesh along +Z for placement by placeSegmentBetween().
 */
function taperedLimb(
  proximalRadius: number,
  distalRadius: number,
  material: THREE.Material,
  segments = 8,
): THREE.Mesh {
  const pts: THREE.Vector2[] = [];
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Smooth taper with a slight belly at 30%
    const belly = Math.sin(t * Math.PI) * 0.06 * proximalRadius;
    const r = proximalRadius + (distalRadius - proximalRadius) * t + belly;
    pts.push(new THREE.Vector2(r, t));
  }
  const geo = new THREE.LatheGeometry(pts, segments);
  // Bake the limb's long axis onto +Z and centre it at the origin so
  // placeSegmentBetween()'s `scale.z = length, position = midpoint,
  // quaternion = (+Z → start→end)` contract aligns the proximal end at
  // `start` and the distal end at `end`. Without baking, the runtime
  // `mesh.rotation.x` was being wiped out by placeSegmentBetween's
  // quaternion assignment, leaving every lathe-limb welded to its native
  // Y axis — i.e. arms and legs pointing straight up regardless of where
  // the IK targets sent them. That's the Frankenstein silhouette.
  geo.translate(0, -0.5, 0);
  geo.rotateX(Math.PI / 2);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

/**
 * A hand mesh: palm ellipsoid with four fingers and a thumb.
 */
function makeHand(material: THREE.Material, segments = 8): THREE.Group {
  const hand = new THREE.Group();
  hand.name = "athlete:hand";
  const palm = ellipsoid([0.04, 0.025, 0.05], material, segments);
  palm.name = "athlete:hand:palm";
  hand.add(palm);
  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.03, 2, 4), material);
    finger.position.set((i - 1.5) * 0.012, 0, 0.04);
    hand.add(finger);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.025, 2, 4), material);
  thumb.position.set(-0.03, 0.005, 0.02);
  thumb.rotation.z = 0.5;
  hand.add(thumb);
  return hand;
}

/**
 * A foot mesh: shoe-shaped sole with toe box and heel.
 */
function makeFoot(material: THREE.Material, segments = 8): THREE.Group {
  const foot = new THREE.Group();
  foot.name = "athlete:foot";
  const sole = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.035, 0.16, segments, 1, segments),
    material,
  );
  sole.position.z = 0.04;
  foot.add(sole);
  const toe = ellipsoid([0.04, 0.024, 0.048], material, segments);
  toe.position.set(0, -0.005, 0.12);
  foot.add(toe);
  const heel = ellipsoid([0.035, 0.028, 0.028], material, segments);
  heel.position.set(0, 0, -0.04);
  foot.add(heel);
  return foot;
}

/**
 * A head with jaw/chin, ears, and hair cap — instead of a single ellipsoid.
 */
function makeHead(skinMat: THREE.Material, hairMat: THREE.Material, segments = 16): THREE.Group {
  const head = new THREE.Group();
  head.name = "athlete:head";
  // Cranium
  const cranium = ellipsoid([0.105, 0.13, 0.1], skinMat, segments);
  cranium.name = "athlete:head:cranium";
  cranium.position.y = 0;
  head.add(cranium);
  // Jaw — smaller sphere below for chin/jawline
  const jaw = ellipsoid([0.08, 0.05, 0.07], skinMat, Math.max(8, segments / 2));
  jaw.position.set(0, -0.07, 0.02);
  head.add(jaw);
  // Ears
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 4, 4), skinMat);
    ear.scale.set(0.5, 1, 1);
    ear.position.set(side * 0.1, -0.01, -0.01);
    head.add(ear);
  }
  // Hair cap
  const hair = ellipsoid([0.11, 0.055, 0.105], hairMat, Math.max(8, segments / 2));
  hair.position.y = 0.09;
  head.add(hair);
  return head;
}

/**
 * Low-poly single scull: long thin hull (capsule), a seated rower, and two oars
 * with blades. The hull, deck and oar blades carry `userData.accent`; the rower
 * slides + leans and the oars sweep/feather per stroke.
 */
function makeRowerAvatar(accent: number, castShadow: boolean, opacity = 1): Avatar {
  const group = new THREE.Group();
  const accentMat = () => accentMaterial(accent);
  const kinematics: RowerKinematics = {
    legExtension: 0,
    bodySwing: 0,
    armDraw: 0,
    bladeDepth: 0,
    bladeFeather: 0,
    surge: 0,
    vertical: 0,
  };

  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 3.0, 4, 8), accentMat());
  hull.rotation.x = Math.PI / 2; // capsule axis Y -> Z (travel)
  hull.scale.set(0.5, 0.42, 1); // narrow + low profile
  hull.position.y = 0.16;
  hull.userData.accent = true;
  group.add(hull);

  // Deck with a thin racing stripe for visual interest.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 2.6), accentMat());
  deck.position.y = 0.3;
  deck.userData.accent = true;
  group.add(deck);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.015, 2.2),
    humanMat(0xf8fafc, 0.4, 0.08),
  );
  stripe.name = "rower-deck-stripe";
  stripe.position.y = 0.335;
  group.add(stripe);

  const footPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.05, 0.12),
    humanMat(HUMAN_KIT_DARK),
  );
  footPlate.name = "rower-footplate";
  footPlate.position.set(0, 0.34, 0.72);
  group.add(footPlate);
  for (const side of [-1, 1]) {
    const anchor = new THREE.Object3D();
    anchor.name = side < 0 ? "rower-footplate-contact-left" : "rower-footplate-contact-right";
    anchor.position.set(side * 0.12, 0.34, 0.72);
    group.add(anchor);
  }

  // Rower in its own group so slide, layback, legs and arms all move from the
  // recorded stroke pose rather than as one rigid toy block.
  const rower = new THREE.Group();
  rower.name = "rower-athlete";
  const hips = ellipsoid([0.24, 0.11, 0.16], humanMat(HUMAN_KIT_DARK));
  hips.name = "rower-hips";
  hips.position.y = 0.38;
  const torso = ellipsoid([0.25, 0.36, 0.16], humanMat(HUMAN_KIT));
  torso.name = "rower-torso";
  torso.position.set(0, 0.64, -0.02);
  torso.rotation.x = -0.12;
  const bib = accentPart(ellipsoid([0.17, 0.24, 0.024], accentMat(), 12));
  bib.position.set(0, 0.65, 0.15);
  const shoulderLine = capsulePart(0.035, 0.58, humanMat(HUMAN_KIT_DARK), "x");
  shoulderLine.position.set(0, 0.82, 0.02);
  const neck = capsulePart(0.045, 0.13, humanMat(HUMAN_SKIN), "y");
  neck.position.y = 0.94;
  const headGroup = makeHead(humanMat(HUMAN_SKIN), humanMat(HUMAN_HAIR));
  headGroup.position.set(0, 1.07, 0.04);
  rower.add(hips, torso, bib, shoulderLine, neck, headGroup);

  const arms: Array<{
    side: number;
    upper: THREE.Mesh;
    forearm: THREE.Mesh;
    hand: THREE.Group;
  }> = [];
  const legs: Array<{
    side: number;
    thigh: THREE.Mesh;
    shin: THREE.Mesh;
    foot: THREE.Group;
    knee: THREE.Mesh;
  }> = [];
  for (const side of [-1, 1]) {
    // Tapered leg segments — positioned per-frame by IK from hip to foot.
    const thigh = taperedLimb(0.055, 0.042, humanMat(HUMAN_KIT_DARK));
    const shin = taperedLimb(0.042, 0.032, humanMat(HUMAN_KIT_DARK));
    const foot = makeFoot(humanMat(HUMAN_SHOE));
    foot.name = side < 0 ? "rower-foot-contact-left" : "rower-foot-contact-right";
    const knee = ellipsoid([0.065, 0.055, 0.065], humanMat(HUMAN_KIT_DARK), 10);
    rower.add(thigh, shin, foot, knee);
    legs.push({ side, thigh, shin, foot, knee });

    const upperArm = taperedLimb(0.04, 0.03, humanMat(HUMAN_SKIN));
    const forearm = taperedLimb(0.03, 0.022, humanMat(HUMAN_SKIN));
    const hand = makeHand(humanMat(HUMAN_SKIN));
    hand.name = side < 0 ? "rower-hand-left" : "rower-hand-right";
    rower.add(upperArm, forearm, hand);
    arms.push({ side, upper: upperArm, forearm, hand });
  }
  rower.position.z = -0.1;
  group.add(rower);

  // Oars pivot at their rigger pins. Each inboard grip has an explicit contact
  // transform that arm IK consumes, so the hands cannot drift away from the
  // equipment while the seat slides.
  const oars: Array<{
    side: number;
    group: THREE.Group;
    blade: THREE.Mesh;
    handleAnchor: THREE.Object3D;
  }> = [];
  for (const side of [-1, 1]) {
    const oar = new THREE.Group();
    oar.name = side < 0 ? "rower-oar-left" : "rower-oar-right";
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 2.8, 6),
      new THREE.MeshStandardMaterial({ color: 0xe7eef0, roughness: 0.6 }),
    );
    shaft.rotation.z = Math.PI / 2; // cylinder axis Y -> X
    shaft.position.x = side * 1.0;
    oar.add(shaft);
    const grip = capsulePart(0.045, 0.3, humanMat(0x262c31), "x");
    grip.name = side < 0 ? "rower-handle-left" : "rower-handle-right";
    grip.position.x = -side * 0.28;
    oar.add(grip);
    const handleAnchor = new THREE.Object3D();
    handleAnchor.name = side < 0 ? "rower-hand-contact-left" : "rower-hand-contact-right";
    handleAnchor.position.x = -side * 0.38;
    oar.add(handleAnchor);
    // Oar collar — a small ring near the blade end for visual detail.
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.05, 0.015, 6, 10),
      humanMat(0x8a9097, 0.5),
    );
    collar.name = "rower-oar-collar";
    collar.position.set(side * 1.9, 0, 0);
    collar.rotation.y = Math.PI / 2;
    oar.add(collar);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.26), accentMat());
    blade.name = side < 0 ? "rower-blade-left" : "rower-blade-right";
    blade.position.set(side * 2.4, -0.05, 0);
    blade.userData.accent = true;
    oar.add(blade);
    // Rigger pin sits outside the hull; blade depth is animated continuously.
    oar.position.set(side * 0.52, 0.34, 0);
    oar.userData.side = side;
    group.add(oar);
    oars.push({ side, group: oar, blade, handleAnchor });
  }

  const handlePoint = new THREE.Vector3();
  const placeArms = (bodySwing: number): void => {
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i];
      if (!arm) continue;
      const shoulder: Point3 = [arm.side * 0.26, 0.79 - bodySwing * 0.025, 0.02 + bodySwing * 0.08];
      const oar = oars[i];
      if (!oar) continue;
      // Convert the oar-local grip endpoint into rower-local coordinates. Both
      // objects share the avatar group as parent, so this is exact even before
      // Three updates matrixWorld for the draw.
      handlePoint.copy(oar.handleAnchor.position).applyQuaternion(oar.group.quaternion);
      handlePoint.add(oar.group.position).sub(rower.position);
      const handTarget: Point3 = [handlePoint.x, handlePoint.y, handlePoint.z];
      const elbow: Point3 = [
        arm.side * 0.24,
        (shoulder[1] + handTarget[1]) / 2 - 0.065,
        (shoulder[2] + handTarget[2]) / 2 - 0.055 + bodySwing * 0.025,
      ];
      placeSegmentBetween(arm.upper, shoulder, elbow);
      placeSegmentBetween(arm.forearm, elbow, handTarget);
      arm.hand.position.set(handTarget[0], handTarget[1], handTarget[2]);
    }
  };

  const placeLegs = (legExtension: number): void => {
    for (const leg of legs) {
      // Hip is fixed relative to the rower group.
      const hip: Point3 = [leg.side * 0.12, 0.38, -0.14];
      // The plate is in BOAT space, while these limbs live in the translating
      // rower group. Subtract the slide so the world foot contact stays fixed.
      const footTarget: Point3 = [
        leg.side * 0.12,
        0.34 - rower.position.y,
        0.72 - rower.position.z,
      ];
      // The staged channel straightens the knee before body swing and arm draw.
      const knee: Point3 = [
        leg.side * 0.14,
        (hip[1] + footTarget[1]) / 2 + 0.14 - legExtension * 0.11,
        (hip[2] + footTarget[2]) / 2 - 0.14 + legExtension * 0.11,
      ];
      placeSegmentBetween(leg.thigh, hip, knee);
      placeSegmentBetween(leg.shin, knee, footTarget);
      // makeFoot() is a fixed-size shoe, not a unit-length segment — running
      // it through placeSegmentBetween()'s 1×1×length scale would crush it to
      // a sliver. Place it directly at the heel/ankle with the shoe sole
      // pitched slightly downward into the stretcher.
      leg.foot.position.set(footTarget[0], footTarget[1], footTarget[2]);
      leg.foot.rotation.set(-0.22, 0, 0);
      leg.foot.scale.set(1, 1, 1);
      leg.knee.position.set(knee[0], knee[1], knee[2]);
    }
  };

  const placeUpperBody = (bodySwing: number): void => {
    // Rotate and translate only the upper-body pieces around the hips. Rotating
    // the whole rower group would also rotate the contact-locked feet and hands.
    const pitch = -0.24 + bodySwing * 0.38;
    torso.rotation.x = pitch;
    torso.position.z = -0.04 + bodySwing * 0.08;
    bib.rotation.x = pitch;
    bib.position.z = 0.13 + bodySwing * 0.08;
    shoulderLine.position.z = 0.01 + bodySwing * 0.08;
    neck.position.z = 0.02 + bodySwing * 0.1;
    headGroup.position.z = 0.03 + bodySwing * 0.12;
  };

  const placeOars = (
    legExtension: number,
    bodySwing: number,
    armDraw: number,
    bladeDepth: number,
    bladeFeather: number,
  ): void => {
    // The handle path is staged by the same leg/body/arm order as the athlete.
    const handleProgress = legExtension * 0.44 + bodySwing * 0.34 + armDraw * 0.22;
    for (const oar of oars) {
      oar.group.rotation.y = oar.side * (-0.5 + handleProgress);
      // Both blade tips dip into the water together despite opposite X signs.
      oar.group.rotation.z = -oar.side * bladeDepth * 0.055;
      oar.group.position.y = 0.34 - bladeDepth * 0.1;
      // The blade squares for catch/drive, feathers flat through recovery, then
      // squares again continuously before the next catch.
      oar.blade.rotation.x = (1 - bladeFeather) * (Math.PI / 2);
    }
  };

  const animate = (phase: number, reduce: boolean, pose?: StrokePose): AvatarMotionCues => {
    const resolvedPose = reduce
      ? REDUCED_REPLAY_POSES.rower
      : (pose ?? fallbackStrokePose("rower", phase));
    const motion = solveRowerKinematics(resolvedPose, kinematics);
    // Seat motion follows leg extension only; body swing and arm draw happen on
    // their later staged channels, eliminating the old one-cosine puppet motion.
    rower.position.z = 0.12 - motion.legExtension * 0.44;
    rower.position.y = reduce ? 0 : motion.vertical * 0.012;
    rower.rotation.set(0, 0, 0);
    placeUpperBody(motion.bodySwing);
    placeOars(
      motion.legExtension,
      motion.bodySwing,
      motion.armDraw,
      motion.bladeDepth,
      motion.bladeFeather,
    );
    placeLegs(motion.legExtension);
    placeArms(motion.bodySwing);
    return reduce ? STATIC_AVATAR_MOTION : motion;
  };

  finalizeAvatar(group, castShadow, opacity);
  return { group, animate };
}

/**
 * Low-poly SkiErg skier: a standing athlete on skis, double-poling. Skis, vest
 * and pole baskets carry `userData.accent`; the upper body crunches forward and
 * both poles swing fore/aft together on each pull.
 */
function makeSkierAvatar(accent: number, castShadow: boolean, opacity = 1): Avatar {
  const group = new THREE.Group();
  const accentMat = () => accentMaterial(accent);
  const neutralMat = (c: number) => humanMat(c);
  const kinematics: SkierKinematics = {
    armPress: 0,
    hipHinge: 0,
    kneeFlex: 0,
    poleContact: 0,
    poleSweep: 0,
    rebound: 0,
    surge: 0,
  };

  // Skis: two thin planks along travel (+Z), with a slightly upturned tip.
  for (const side of [-1, 1]) {
    const ski = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 2.4), accentMat());
    ski.position.set(side * 0.18, 0.03, 0.2);
    ski.userData.accent = true;
    group.add(ski);
    // Ski tip — a small wedge at the front for a more realistic profile.
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.3), accentMat());
    tip.name = "skierg-ski-tip";
    tip.position.set(side * 0.18, 0.06, 1.45);
    tip.rotation.x = -0.25;
    tip.userData.accent = true;
    group.add(tip);
  }

  // Legs are planted; the upper body pivots from the hips for the crunch.
  const legParts: Array<{ thigh: THREE.Group; shin: THREE.Group }> = [];
  for (const side of [-1, 1]) {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.34), neutralMat(HUMAN_SHOE));
    boot.position.set(side * 0.18, 0.11, 0.18);
    group.add(boot);

    const thigh = new THREE.Group();
    thigh.position.set(side * 0.15, 0.72, 0.02);
    thigh.add(limbSegment(0.46, 0.06, neutralMat(HUMAN_KIT_DARK), "y"));
    const shin = new THREE.Group();
    shin.position.set(side * 0.16, 0.38, 0.08);
    shin.add(limbSegment(0.48, 0.052, neutralMat(HUMAN_KIT_DARK), "y"));
    group.add(thigh, shin);
    legParts.push({ thigh, shin });
  }
  const upper = new THREE.Group();
  upper.name = "skierg-upper";
  upper.position.y = 0.7;
  const hips = ellipsoid([0.24, 0.11, 0.16], neutralMat(HUMAN_KIT_DARK), 12);
  hips.position.y = -0.02;
  const torso = ellipsoid([0.25, 0.38, 0.16], neutralMat(HUMAN_KIT), 16);
  torso.position.y = 0.31;
  const vest = accentPart(ellipsoid([0.17, 0.25, 0.024], accentMat(), 12));
  vest.position.set(0, 0.33, 0.15);
  const shoulderLine = capsulePart(0.035, 0.62, neutralMat(HUMAN_KIT_DARK), "x");
  shoulderLine.position.y = 0.56;
  const neck = capsulePart(0.045, 0.13, neutralMat(HUMAN_SKIN), "y");
  neck.position.y = 0.67;
  const headGroup = makeHead(neutralMat(HUMAN_SKIN), neutralMat(HUMAN_HAIR));
  headGroup.position.set(0, 0.81, 0.03);
  upper.add(hips, torso, vest, shoulderLine, neck, headGroup);
  // Arms are placed from shoulders to pole grips, so the hands stay on the
  // handles while the pole groups pivot from the same point.
  const arms: Array<{
    side: number;
    upper: THREE.Mesh;
    forearm: THREE.Mesh;
    hand: THREE.Group;
  }> = [];
  for (const side of [-1, 1]) {
    const upperArm = taperedLimb(0.04, 0.03, neutralMat(HUMAN_SKIN));
    const forearm = taperedLimb(0.03, 0.022, neutralMat(HUMAN_SKIN));
    const hand = makeHand(neutralMat(HUMAN_SKIN));
    hand.name = side < 0 ? "skierg-hand-left" : "skierg-hand-right";
    upper.add(upperArm, forearm, hand);
    arms.push({ side, upper: upperArm, forearm, hand });
  }
  group.add(upper);

  // Poles are solved between explicit grip and tip contacts. During the plant
  // the tip target sits on the snow; during recovery it lifts clear instead of
  // pivoting through the course surface.
  const poles: Array<{
    side: number;
    shaft: THREE.Mesh;
    grip: THREE.Object3D;
    basket: THREE.Mesh;
    tipAnchor: THREE.Object3D;
  }> = [];
  for (const side of [-1, 1]) {
    const shaftGeo = new THREE.CylinderGeometry(0.02, 0.02, 1, 6);
    shaftGeo.rotateX(Math.PI / 2); // bake the unit pole onto +Z for endpoint placement
    const shaft = new THREE.Mesh(shaftGeo, neutralMat(0xe7eef0));
    const grip = capsulePart(0.022, 0.16, neutralMat(0x20242a), "x");
    grip.name = side < 0 ? "skierg-pole-grip-left" : "skierg-pole-grip-right";
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 8), accentMat());
    basket.name = side < 0 ? "skierg-pole-tip-left" : "skierg-pole-tip-right";
    basket.userData.accent = true;
    const tipAnchor = new THREE.Object3D();
    tipAnchor.name = side < 0 ? "skierg-pole-contact-left" : "skierg-pole-contact-right";
    upper.add(shaft, grip, basket, tipAnchor);
    poles.push({ side, shaft, grip, basket, tipAnchor });
  }

  const tipGroupPoint = new THREE.Vector3();
  const tipLocalPoint = new THREE.Vector3();
  const inverseUpper = new THREE.Quaternion();
  const placePoleArms = (
    armPress: number,
    poleContact: number,
    poleSweep: number,
    rebound: number,
  ): void => {
    const handY = 0.58 - armPress * 0.46;
    const handZ = 0.4 - armPress * 0.5;
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i];
      const shoulder: Point3 = [arm.side * 0.28, 0.53, 0.05];
      const handTarget: Point3 = [arm.side * 0.3, handY, handZ];
      const elbow: Point3 = [
        arm.side * 0.32,
        (shoulder[1] + handTarget[1]) / 2 - 0.06,
        (shoulder[2] + handTarget[2]) / 2 + 0.03,
      ];
      placeSegmentBetween(arm.upper, shoulder, elbow);
      placeSegmentBetween(arm.forearm, elbow, handTarget);
      arm.hand.position.set(handTarget[0], handTarget[1], handTarget[2]);
      const pole = poles[i];
      if (!pole) continue;

      // Author the tip in avatar/ground space, then convert to the rotating
      // upper-body local space used by the pole meshes. Contact reaches the
      // snow only during the solver's plant window; otherwise the basket lifts.
      const liftedY = 0.19 + rebound * 0.12;
      const tipY = liftedY + (0.055 - liftedY) * poleContact;
      tipGroupPoint.set(pole.side * 0.43, tipY, 0.92 - poleSweep * 1.36);
      inverseUpper.copy(upper.quaternion).invert();
      tipLocalPoint.copy(tipGroupPoint).sub(upper.position).applyQuaternion(inverseUpper);
      const tipTarget: Point3 = [tipLocalPoint.x, tipLocalPoint.y, tipLocalPoint.z];
      placeSegmentBetween(pole.shaft, handTarget, tipTarget);
      pole.grip.position.set(handTarget[0], handTarget[1], handTarget[2]);
      pole.basket.position.set(tipTarget[0], tipTarget[1], tipTarget[2]);
      pole.tipAnchor.position.copy(pole.basket.position);
    }
  };

  const animate = (phase: number, reduce: boolean, pose?: StrokePose): AvatarMotionCues => {
    const resolvedPose = reduce
      ? REDUCED_REPLAY_POSES.skierg
      : (pose ?? fallbackStrokePose("skierg", phase));
    const motion = solveSkierKinematics(resolvedPose, kinematics);
    upper.position.y = 0.7 + (reduce ? 0 : motion.rebound * 0.025);
    upper.rotation.x = 0.12 + motion.hipHinge * 0.5;
    for (const leg of legParts) {
      leg.thigh.rotation.x = 0.06 + motion.kneeFlex * 0.18;
      leg.shin.rotation.x = -0.05 - motion.kneeFlex * 0.15;
    }
    placePoleArms(motion.armPress, motion.poleContact, motion.poleSweep, motion.rebound);
    return reduce ? STATIC_AVATAR_MOTION : motion;
  };

  finalizeAvatar(group, castShadow, opacity);
  return { group, animate };
}

/**
 * Low-poly BikeErg cyclist: a rider in an aero tuck on a two-wheeled frame.
 * Frame, wheel spokes and jersey carry `userData.accent`; the wheels roll, the
 * cranks turn and the rider's thighs pedal in opposition.
 */
function makeBikeAvatar(accent: number, castShadow: boolean, opacity = 1): Avatar {
  const group = new THREE.Group();
  const accentMat = () => accentMaterial(accent);
  const neutralMat = (c: number, rough = 0.7) => humanMat(c, rough);
  const kinematics: BikeKinematics = {
    crankAngle: 0,
    torsoSway: 0,
    hipRock: 0,
    anklePitchLeft: 0,
    anklePitchRight: 0,
  };

  const wheelR = 0.45;
  const wheels: THREE.Group[] = [];
  for (const z of [0.85, -0.85]) {
    const wheel = new THREE.Group();
    wheel.name = z > 0 ? "bike-wheel-front" : "bike-wheel-rear";
    const tyre = new THREE.Mesh(
      new THREE.TorusGeometry(wheelR, 0.06, 8, 16),
      neutralMat(0x20242a, 0.6),
    );
    tyre.rotation.y = Math.PI / 2; // axle along X (perpendicular to travel)
    wheel.add(tyre);
    // Crossed bright spokes make the spin legible at low poly.
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.04, wheelR * 1.8, 0.04), accentMat());
    spoke.userData.accent = true;
    wheel.add(spoke);
    const spoke2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, wheelR * 1.8, 0.04), accentMat());
    spoke2.rotation.x = Math.PI / 2;
    spoke2.userData.accent = true;
    wheel.add(spoke2);
    wheel.position.set(0, wheelR, z);
    group.add(wheel);
    wheels.push(wheel);
  }

  // Frame: down tube, seat tube, top tube, and chain stays for a proper
  // diamond-frame silhouette.
  const downTube = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.6), accentMat());
  downTube.position.set(0, wheelR + 0.15, 0);
  downTube.userData.accent = true;
  const seatTube = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), accentMat());
  seatTube.position.set(0, wheelR + 0.45, -0.4);
  seatTube.userData.accent = true;
  const topTube = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.1), accentMat());
  topTube.name = "bike-top-tube";
  topTube.position.set(0, wheelR + 0.75, -0.15);
  topTube.userData.accent = true;
  // Chain stays: two thin tubes from BB to rear axle.
  for (const side of [-1, 1]) {
    const stay = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.85), accentMat());
    stay.position.set(side * 0.06, wheelR + 0.05, 0.4);
    stay.userData.accent = true;
    group.add(stay);
  }
  group.add(downTube, seatTube, topTube);

  // Cranks: spin about the bottom bracket (X axis) with two pedals.
  const cranks = new THREE.Group();
  cranks.name = "bike-cranks";
  cranks.position.set(0, wheelR, -0.05);
  // Chain ring — a toroidal disc at the bottom bracket.
  const chainRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.018, 6, 18),
    neutralMat(0x555555, 0.4),
  );
  chainRing.name = "bike-chain-ring";
  chainRing.rotation.y = Math.PI / 2;
  cranks.add(chainRing);
  const pedals: Array<{ side: number; crankY: number }> = [];
  for (const side of [-1, 1]) {
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.1), neutralMat(0x20242a));
    pedal.name = side < 0 ? "bike-pedal-left" : "bike-pedal-right";
    const crankY = side * 0.18;
    pedal.position.set(side * 0.1, crankY, 0);
    cranks.add(pedal);
    pedals.push({ side, crankY });
  }
  group.add(cranks);

  const handlebar = new THREE.Group();
  handlebar.name = "bike-handlebar";
  const crossbar = capsulePart(0.026, 0.64, neutralMat(0x20242a), "x");
  handlebar.add(crossbar);
  const barContacts: Array<{ side: number; anchor: THREE.Object3D }> = [];
  for (const side of [-1, 1]) {
    const grip = capsulePart(0.024, 0.22, neutralMat(0x20242a), "z");
    grip.name = side < 0 ? "bike-handlebar-grip-left" : "bike-handlebar-grip-right";
    grip.position.set(side * 0.28, -0.02, 0.04);
    grip.rotation.x = -0.3;
    const anchor = new THREE.Object3D();
    anchor.name = side < 0 ? "bike-hand-contact-left" : "bike-hand-contact-right";
    anchor.position.copy(grip.position);
    handlebar.add(grip, anchor);
    barContacts.push({ side, anchor });
  }
  handlebar.position.set(0, wheelR + 0.8, 0.35);
  group.add(handlebar);

  // Rider: compact human proportions in an aero lean. The jersey/helmet carry
  // the lane accent, while limbs stay skin/kit coloured so the athlete does not
  // read as a single bright toy shape.
  const rider = new THREE.Group();
  rider.position.set(0, wheelR + 0.5, -0.35);
  const torso = ellipsoid([0.23, 0.34, 0.14], neutralMat(HUMAN_KIT), 16);
  torso.rotation.x = 0.74; // aero tuck
  torso.position.set(0, 0.28, 0.1);
  const jerseyPanel = accentPart(ellipsoid([0.15, 0.22, 0.022], accentMat(), 12));
  jerseyPanel.rotation.x = 0.74;
  jerseyPanel.position.set(0, 0.31, 0.23);
  const shoulderLine = capsulePart(0.032, 0.52, neutralMat(HUMAN_KIT_DARK), "x");
  shoulderLine.position.set(0, 0.47, 0.18);
  const neck = capsulePart(0.04, 0.11, neutralMat(HUMAN_SKIN), "y");
  neck.position.set(0, 0.54, 0.26);
  const headGroup = makeHead(neutralMat(HUMAN_SKIN), neutralMat(HUMAN_HAIR));
  headGroup.position.set(0, 0.66, 0.33);
  const helmet = accentPart(ellipsoid([0.108, 0.055, 0.1], accentMat(), 12));
  helmet.position.set(0, 0.74, 0.31);
  const legs: Array<{
    side: number;
    crankY: number;
    thigh: THREE.Mesh;
    shin: THREE.Mesh;
    shoe: THREE.Group;
  }> = [];
  for (const side of [-1, 1]) {
    const thigh = taperedLimb(0.052, 0.04, neutralMat(HUMAN_KIT_DARK));
    const shin = taperedLimb(0.04, 0.03, neutralMat(HUMAN_SKIN));
    const shoe = makeFoot(neutralMat(HUMAN_SHOE));
    shoe.name = side < 0 ? "bike-foot-contact-left" : "bike-foot-contact-right";
    rider.add(thigh, shin, shoe);
    legs.push({
      side,
      crankY: pedals.find((p) => p.side === side)?.crankY ?? side * 0.18,
      thigh,
      shin,
      shoe,
    });
  }
  // Arms from the shoulders down to the bars, fixed in the tuck.
  const arms: Array<{
    side: number;
    upper: THREE.Mesh;
    forearm: THREE.Mesh;
    hand: THREE.Group;
  }> = [];
  for (const side of [-1, 1]) {
    const upperArm = taperedLimb(0.038, 0.03, neutralMat(HUMAN_SKIN));
    const forearm = taperedLimb(0.03, 0.022, neutralMat(HUMAN_SKIN));
    const hand = makeHand(neutralMat(HUMAN_SKIN));
    hand.name = side < 0 ? "bike-hand-left" : "bike-hand-right";
    rider.add(upperArm, forearm, hand);
    arms.push({ side, upper: upperArm, forearm, hand });
  }
  rider.add(torso, jerseyPanel, shoulderLine, neck, headGroup, helmet);
  group.add(rider);

  const barPoint = new THREE.Vector3();
  const placeBarArms = (): void => {
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i];
      if (!arm) continue;
      const shoulder: Point3 = [arm.side * 0.22, 0.47, 0.18];
      const contact = barContacts[i];
      if (!contact) continue;
      // Handlebar and rider share the avatar group. Convert the explicit grip
      // contact into rider-local space so torso cues never detach the hands.
      barPoint
        .copy(contact.anchor.position)
        .applyQuaternion(handlebar.quaternion)
        .add(handlebar.position)
        .sub(rider.position);
      const handTarget: Point3 = [barPoint.x, barPoint.y, barPoint.z];
      const elbow: Point3 = [
        arm.side * 0.26,
        (shoulder[1] + handTarget[1]) / 2 - 0.02,
        (shoulder[2] + handTarget[2]) / 2 - 0.02,
      ];
      placeSegmentBetween(arm.upper, shoulder, elbow);
      placeSegmentBetween(arm.forearm, elbow, handTarget);
      arm.hand.position.set(handTarget[0], handTarget[1], handTarget[2]);
      arm.hand.rotation.set(-0.28, 0, arm.side * 0.08);
    }
  };
  placeBarArms();

  const placePedalLegs = (phase: number, anklePitchLeft: number, anklePitchRight: number): void => {
    for (const leg of legs) {
      const pedalY = leg.crankY * Math.cos(phase);
      const pedalZ = leg.crankY * Math.sin(phase);
      const foot: Point3 = [
        leg.side * 0.1,
        cranks.position.y + pedalY - rider.position.y,
        cranks.position.z + pedalZ - rider.position.z,
      ];
      const hip: Point3 = [leg.side * 0.1, -0.02, 0.08];
      const extension = Math.sin(phase) * leg.side;
      const knee: Point3 = [
        leg.side * 0.12,
        (hip[1] + foot[1]) / 2 + 0.15,
        (hip[2] + foot[2]) / 2 - 0.08 * extension,
      ];
      placeSegmentBetween(leg.thigh, hip, knee);
      placeSegmentBetween(leg.shin, knee, foot);
      leg.shoe.position.set(foot[0], foot[1], foot[2]);
      // Ankling is deliberately restrained; feet stay planted on the pedals
      // instead of tumbling through a full revolution with the crank.
      leg.shoe.rotation.x = leg.side < 0 ? anklePitchLeft : anklePitchRight;
    }
  };

  const placeBikeTorso = (sway: number, hipRock: number): void => {
    rider.rotation.set(0, 0, 0); // keep hands/feet in equipment space
    torso.rotation.set(0.74 + hipRock, 0, sway);
    jerseyPanel.rotation.set(0.74 + hipRock, 0, sway);
    shoulderLine.rotation.z = sway * 0.55;
    neck.position.x = sway * 0.24;
    headGroup.position.x = sway * 0.34;
    helmet.position.x = sway * 0.34;
  };

  const animate = (
    phase: number,
    reduce: boolean,
    pose?: StrokePose,
    meters = 0,
  ): AvatarMotionCues => {
    const resolvedPose = reduce
      ? REDUCED_REPLAY_POSES.bike
      : (pose ?? fallbackStrokePose("bike", phase));
    const motion = solveBikeKinematics(resolvedPose, kinematics);
    if (reduce) {
      for (const w of wheels) w.rotation.x = 0;
      cranks.rotation.x = motion.crankAngle;
      placePedalLegs(motion.crankAngle, motion.anklePitchLeft, motion.anklePitchRight);
      placeBarArms();
      placeBikeTorso(0, 0);
      return STATIC_AVATAR_MOTION;
    }
    // Wheel travel comes from distance, independent of cadence/gearing. Positive
    // rotation about +X moves the wheel top toward local +Z (forward).
    const wheelAngle = meters / wheelR;
    for (const w of wheels) w.rotation.x = wheelAngle;
    cranks.rotation.x = motion.crankAngle;
    placePedalLegs(motion.crankAngle, motion.anklePitchLeft, motion.anklePitchRight);
    placeBarArms();
    placeBikeTorso(motion.torsoSway, motion.hipRock);
    return STATIC_AVATAR_MOTION;
  };

  finalizeAvatar(group, castShadow, opacity);
  return { group, animate };
}

const SPORT_PROFILES: Record<Sport, SportProfile> = {
  rower: {
    waves: true,
    roll: true,
    bobAmp: 0.06,
    metersPerCycle: METERS_PER_CYCLE.rower,
    surgeAmp: 0.22,
    sprayOffset: 2.2, // off the blade tips
    groundOpacity: 0.4,
    trailColor: 0xffffff,
    groundColor: (t) => hex((t === "dark" ? COLORS_DARK : COLORS_LIGHT).laneLine),
    course: {
      surface: (t) => (t === "dark" ? 0x123b47 : 0x7fc4d6),
      edge: (t) => (t === "dark" ? 0x8fe3f1 : 0xf8fbff),
      laneLine: (t) => (t === "dark" ? 0x4fb3c8 : 0xd9f7ff),
      detail: (t) => (t === "dark" ? 0xfbbf24 : 0xf59e0b),
      secondary: (t) => (t === "dark" ? 0xc8f7ff : 0xffffff),
      surfaceOpacity: 0.56,
      roughness: 0.52,
      metalness: 0.1,
    },
    make: makeRowerAvatar,
  },
  skierg: {
    waves: false,
    roll: false,
    bobAmp: 0.03,
    metersPerCycle: METERS_PER_CYCLE.skierg,
    surgeAmp: 0.08,
    sprayOffset: 0.4, // at the pole baskets
    groundOpacity: 1,
    trailColor: 0xffffff,
    groundColor: (t) => (t === "dark" ? 0xb8c4cc : 0xeef4f7),
    course: {
      surface: (t) => (t === "dark" ? 0xd8e2e8 : 0xf7fafc),
      edge: (t) => (t === "dark" ? 0x94a3b8 : 0xb9c8d2),
      laneLine: (t) => (t === "dark" ? 0xb7c9d6 : 0xd7e2e8),
      detail: (t) => (t === "dark" ? 0x60a5fa : 0x2563eb),
      secondary: (t) => (t === "dark" ? 0x7c8c98 : 0xcbd5dd),
      surfaceOpacity: 1,
      roughness: 0.92,
      metalness: 0.02,
    },
    make: makeSkierAvatar,
  },
  bike: {
    waves: false,
    roll: false,
    bobAmp: 0.02,
    metersPerCycle: METERS_PER_CYCLE.bike,
    surgeAmp: 0,
    sprayOffset: null,
    groundOpacity: 1,
    trailColor: null,
    groundColor: (t) => (t === "dark" ? 0x2a333a : 0x9aa4ac),
    course: {
      surface: (t) => (t === "dark" ? 0x262c32 : 0x3f464d),
      edge: (t) => (t === "dark" ? 0xe5e7eb : 0xf8fafc),
      laneLine: (t) => (t === "dark" ? 0xfbbf24 : 0xf59e0b),
      detail: (t) => (t === "dark" ? 0xef4444 : 0xb91c1c),
      secondary: (t) => (t === "dark" ? 0x94a3b8 : 0x6b7280),
      surfaceOpacity: 1,
      roughness: 0.78,
      metalness: 0.04,
    },
    make: makeBikeAvatar,
  },
};

/**
 * A fading trail of flat quads dropped along an avatar's recent path — water
 * foam for the rower, snow spray for the skier. Each segment owns its material
 * so opacity can fade toward the tail.
 */
class WakeTrail {
  private segs: THREE.Mesh[] = [];
  private mats: THREE.MeshBasicMaterial[] = [];
  private hist: THREE.Vector3[] = [];

  constructor(scene: THREE.Scene, n: number, geo: THREE.PlaneGeometry, color = 0xffffff) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const seg = new THREE.Mesh(geo, mat);
      seg.rotation.x = -Math.PI / 2;
      seg.position.y = 0.02;
      seg.visible = false;
      scene.add(seg);
      this.segs.push(seg);
      this.mats.push(mat);
    }
  }

  update(x: number, z: number): void {
    const n = this.segs.length;
    // Recycle the tail vector once at capacity — no per-frame allocation.
    const entry = this.hist.length >= n ? this.hist.pop()! : new THREE.Vector3();
    entry.set(x, 0.02, z);
    this.hist.unshift(entry);
    // Travel direction, refreshed per segment from its older neighbour and
    // reused when a neighbour is missing.
    let dx = 0;
    let dz = 0;
    for (let i = 0; i < n; i++) {
      const seg = this.segs[i];
      const h = this.hist[i];
      if (!h) {
        seg.visible = false;
        continue;
      }
      const older = this.hist[i + 1];
      if (older) {
        const ddx = h.x - older.x;
        const ddz = h.z - older.z;
        const len = Math.hypot(ddx, ddz);
        if (len > 1e-4) {
          dx = ddx / len;
          dz = ddz / len;
        }
      }
      const f = 1 - i / n; // 1 at boat, 0 at tail
      // Diverging V: alternate segments drift port/starboard as they age.
      const spread = (1 - f) * 0.6 * (i % 2 === 0 ? 1 : -1);
      seg.visible = true;
      seg.position.set(h.x - dz * spread, 0.02, h.z + dx * spread);
      // Foam disperses: it spreads and grows while it fades.
      this.mats[i].opacity = Math.sqrt(f) * f * 0.45;
      const s = 0.55 + (1 - f) * 1.2;
      seg.scale.set(s, s, s);
    }
  }

  reset(): void {
    this.hist.length = 0;
    for (const seg of this.segs) seg.visible = false;
  }

  dispose(): void {
    for (const seg of this.segs) seg.removeFromParent();
    for (const m of this.mats) m.dispose();
  }
}

/**
 * WebGL course replay — lazy-loaded; mirrors 2D RenderState in a low-poly scene.
 * The athlete travels around a circular loop: one lap = 1 km (matching ErgData),
 * so longer pieces wrap multiple times. The avatar (rowing scull, SkiErg skier,
 * or BikeErg cyclist) and ground (water / snow / asphalt) are chosen from the
 * workout's `sport`. `three` is imported only in this module.
 */
export class CourseRenderer3D implements ReplayRenderer {
  static readonly LOOP_METERS = 1000; // one lap = 1 km
  private readonly loopRadius = 30;
  private readonly ghostRadius = 26;

  private cfg: QualityConfig;
  private renderer: RendererLike;
  /**
   * Intent backend at construction. May be re-pointed to "webgl" by `ready()`
   * if Three's WebGPURenderer silently fell back to its internal WebGL2 path
   * after adapter/device init. Read via `backendKind`.
   */
  private backend: Renderer3DBackend;
  private initPromise: Promise<unknown> = Promise.resolve();
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private cameraInit = false;
  private w = 0;
  private h = 0;
  private animPhase = 0;
  private lastAnimPhase = NaN;
  /** Ghost fallback phase — only needed when `ghostStrokePose` is absent. */
  private ghostStrokePhase = 0;
  private lastLivePose: StrokePose | null = null;
  private lastGhostPose: StrokePose | null = null;
  private lastLiveMeters = 0;
  private lastGhostMeters = 0;
  private lastNowMs = NaN;
  /** Replay-space speed (m/s), smoothed; breathes the chase-camera FOV. */
  private smoothedSpeed = 0;
  private fovCurrent = 46;
  /** Steps effects down when frames run persistently over budget. */
  private governor = new PerfGovernor({ maxLevel: 3 });
  /** Set once the governor flattens the water (level 3). */
  private waterFlat = false;
  private sprayOff = false;
  private reduceMotion = false;
  private lastReduceMotion = false;
  private theme: "light" | "dark" = "light";

  private host: HTMLElement;
  private canvas: HTMLCanvasElement;
  private readonly sport: Sport;
  private readonly profile: SportProfile;
  private groundMesh!: THREE.Mesh;
  private liveBoat: THREE.Group; // outer: position + heading
  private liveAvatar: Avatar; // inner: bob + roll + stroke
  private ghostGroup: THREE.Group; // outer: position + heading + visibility
  private ghostAvatar: Avatar;
  private liveWake: WakeTrail | null = null;
  private ghostWake: WakeTrail | null = null;
  private sprayPool: ParticlePool | null = null;
  private sprayMesh: THREE.InstancedMesh | null = null;
  private sprayMat: THREE.MeshBasicMaterial | null = null;
  private buoyMesh: THREE.InstancedMesh | null = null;
  private buoyMat: THREE.MeshStandardMaterial | null = null;
  private tmpMat4 = new THREE.Matrix4();
  private liveLabel: THREE.Sprite;
  private liveLabelTex: THREE.CanvasTexture;
  private ghostLabel: THREE.Sprite | null = null;
  private ghostLabelTex: THREE.CanvasTexture | null = null;
  private lastLiveLabel = "";
  private lastGhostLabel = "";
  /** Desired chase-camera position for the current frame. */
  private chase = new THREE.Vector3();
  /** Desired point of interest; kept separate so both translation and aim damp. */
  private lookAt = new THREE.Vector3();
  /** Smoothed point of interest actually used by `camera.lookAt`. */
  private cameraAim = new THREE.Vector3();
  /** Framing mode bits that require an immediate paused-render camera update. */
  private cameraLayoutMode = -1;
  private disposables: THREE.Material[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private courseThemeMats: Array<{ material: THREE.MeshStandardMaterial; color: CourseColor }> = [];
  private postMatMajor!: THREE.MeshStandardMaterial;
  private postMatMinor!: THREE.MeshStandardMaterial;
  private cellMatDark!: THREE.MeshStandardMaterial;
  private cellMatLight!: THREE.MeshStandardMaterial;

  constructor(
    host: HTMLElement,
    quality: RenderQuality = "medium",
    sport: Sport = "rower",
    options: Renderer3DOptions = {},
  ) {
    this.cfg = QUALITY[quality];
    this.sport = sport;
    this.profile = SPORT_PROFILES[sport];
    this.backend = options.backend ?? "webgl";
    // A canvas can only ever hold ONE context type for its lifetime, and the 2D
    // renderer locks the shared page canvas to '2d'. So the 3D renderer creates
    // and owns its own canvas (and removes it on destroy) — this also means a
    // fresh context every time, so destroy()'s loseContext() can't poison reuse.
    this.host = host;
    this.canvas = document.createElement("canvas");
    this.canvas.style.display = "block";
    this.canvas.style.width = "100%";
    // Append the canvas first so the WebGL/WebGPU context is bound to a node
    // that's actually in the DOM. If renderer construction throws (missing
    // WebGPURenderer ctor, GL context-create failure), remove the canvas
    // before rethrowing so the caller's destroyFailedRenderer() — which can't
    // run because `this` was never returned — doesn't leak a stub canvas
    // under `host`.
    host.appendChild(this.canvas);
    try {
      if (this.backend === "webgpu") {
        if (!options.WebGPURenderer) throw new Error("WebGPU renderer unavailable");
        const renderer = new options.WebGPURenderer({
          canvas: this.canvas,
          antialias: this.cfg.antialias,
          alpha: true,
        });
        this.renderer = renderer;
        this.initPromise = renderer.init?.() ?? Promise.resolve();
      } else {
        this.renderer = new THREE.WebGLRenderer({
          canvas: this.canvas,
          antialias: this.cfg.antialias,
          alpha: true,
        });
      }
    } catch (err) {
      this.canvas.remove();
      throw err;
    }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (this.cfg.shadows && this.renderer.shadowMap) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 500);

    // Sky/ground hemisphere fill + a key sun give boats nicer shading than a
    // flat ambient. The sun casts shadows only at high quality.
    this.scene.add(new THREE.HemisphereLight(0xddeaf2, 0x4a5560, 0.9));
    const sun = new THREE.DirectionalLight(0xfff7ed, 0.85);
    sun.position.set(14, 26, 10);
    if (this.cfg.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(this.cfg.shadowMapSize, this.cfg.shadowMapSize);
      const c = sun.shadow.camera;
      c.near = 1;
      c.far = 90;
      c.left = c.bottom = -42;
      c.right = c.top = 42;
    }
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffd6a3, 0.18);
    fill.position.set(-10, 8, -6);
    this.scene.add(fill);

    this.liveAvatar = this.profile.make(hex(COLORS_LIGHT.live), this.cfg.shadows, 1);
    this.liveBoat = new THREE.Group();
    this.liveBoat.add(this.liveAvatar.group);
    // Ghost: translucent + no shadow so it reads as a phantom, clearly distinct
    // from the solid live avatar.
    this.ghostAvatar = this.profile.make(hex(COLORS_LIGHT.ghost), false, 0.45);
    this.ghostGroup = new THREE.Group();
    this.ghostGroup.visible = false;
    this.ghostGroup.add(this.ghostAvatar.group);
    this.scene.add(this.liveBoat, this.ghostGroup);

    const liveSpr = makeTextSprite("", COLORS_LIGHT.labelBg, COLORS_LIGHT.live);
    this.liveLabel = liveSpr.sprite;
    this.liveLabelTex = liveSpr.texture;
    this.scene.add(this.liveLabel);

    this.buildStaticScene();

    if (this.cfg.wake > 0 && this.profile.trailColor !== null) {
      const wakeGeo = this.track(new THREE.PlaneGeometry(0.9, 0.9));
      const c = this.profile.trailColor;
      this.liveWake = new WakeTrail(this.scene, this.cfg.wake, wakeGeo, c);
      this.ghostWake = new WakeTrail(this.scene, this.cfg.wake, wakeGeo, c);
    }

    // Catch spray for the live lane: one InstancedMesh, one draw call. The
    // droplets shrink as they die, so no per-particle materials are needed.
    if (this.cfg.spray && this.profile.sprayOffset !== null) {
      this.sprayPool = new ParticlePool(this.cfg.sprayParticles);
      const sprayGeo = this.track(new THREE.IcosahedronGeometry(0.05, 0));
      this.sprayMat = this.mat(new THREE.MeshBasicMaterial({ color: hex(COLORS_LIGHT.foam) }));
      this.sprayMesh = new THREE.InstancedMesh(sprayGeo, this.sprayMat, this.sprayPool.capacity);
      this.sprayMesh.count = 0;
      this.sprayMesh.frustumCulled = false;
      this.scene.add(this.sprayMesh);
    }
  }

  private track<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private mat<T extends THREE.Material>(m: T): T {
    this.disposables.push(m);
    return m;
  }

  private courseMat(
    name: string,
    color: CourseColor,
    opts: Omit<THREE.MeshStandardMaterialParameters, "color"> = {},
  ): THREE.MeshStandardMaterial {
    const material = this.mat(
      new THREE.MeshStandardMaterial({
        ...opts,
        color: color("light"),
      }),
    );
    material.name = name;
    this.courseThemeMats.push({ material, color });
    return material;
  }

  async ready(): Promise<unknown> {
    const result = await this.initPromise;
    // Three's WebGPURenderer can survive `requestAdapter()` returning an
    // adapter and `init()` resolving while still being unable to bring up a
    // WebGPU device — in that case it installs its own WebGL2 backend and
    // keeps rendering. Detect that here so the factory in renderer3dLoader
    // can downgrade quality (Ultra is WebGPU-only) and report the correct
    // backend, instead of mislabelling a WebGL fallback as WebGPU.
    if (this.backend === "webgpu") {
      const probed = this.renderer as ThreeBackendFlags;
      if (probed.backend?.isWebGLBackend) this.backend = "webgl";
    }
    return result;
  }

  get backendKind(): Renderer3DBackend {
    return this.backend;
  }

  private loopAngle(meters: number): number {
    return (meters / CourseRenderer3D.LOOP_METERS) * Math.PI * 2;
  }

  private addCourseRing(
    group: THREE.Group,
    radius: number,
    tube: number,
    material: THREE.Material,
    name: string,
    y = 0.045,
  ): THREE.Mesh {
    const ring = new THREE.Mesh(
      this.track(new THREE.TorusGeometry(radius, tube, 6, this.cfg.laneSegments)),
      material,
    );
    ring.name = name;
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    ring.receiveShadow = this.cfg.shadows;
    group.add(ring);
    return ring;
  }

  private addCourseBlock(
    group: THREE.Group,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    radius: number,
    angle: number,
    name: string,
    y = 0.055,
  ): THREE.Mesh {
    const block = new THREE.Mesh(geometry, material);
    const tx = Math.cos(angle);
    const tz = -Math.sin(angle);
    block.name = name;
    block.position.set(radius * Math.sin(angle), y, radius * Math.cos(angle));
    block.rotation.y = Math.atan2(tx, tz);
    block.receiveShadow = this.cfg.shadows;
    group.add(block);
    return block;
  }

  private addRowerCourseDetails(group: THREE.Group, innerR: number, outerR: number): void {
    const style = this.profile.course;
    const laneMat = this.courseMat("course:rower:lane-line", style.laneLine, {
      roughness: 0.46,
      metalness: 0.08,
    });
    for (const r of [innerR + 0.75, this.ghostRadius, this.loopRadius, outerR - 0.75]) {
      this.addCourseRing(group, r, 0.018, laneMat, "course:rower:lane-line", 0.055);
    }

    const streakMat = this.courseMat("course:rower:water-streak", style.secondary, {
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      roughness: 0.38,
      metalness: 0.08,
    });
    const streakGeo = this.track(new THREE.BoxGeometry(0.045, 0.025, 1.65));
    const streaks = this.cfg.laneSegments >= 120 ? 72 : this.cfg.laneSegments >= 90 ? 54 : 36;
    for (let i = 0; i < streaks; i++) {
      const band = (i % 5) / 4;
      const radius = innerR + 1.4 + (outerR - innerR - 2.8) * band;
      const angle = (i / streaks) * Math.PI * 2 + (i % 2) * 0.04;
      this.addCourseBlock(group, streakGeo, streakMat, radius, angle, "course:rower:water-streak");
    }

    const buoyTickMat = this.courseMat("course:rower:distance-buoy", style.detail, {
      roughness: 0.52,
      metalness: 0.03,
    });
    const buoyTickGeo = this.track(new THREE.BoxGeometry(0.12, 0.05, 0.5));
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      this.addCourseBlock(
        group,
        buoyTickGeo,
        buoyTickMat,
        outerR - 0.35,
        angle,
        "course:rower:distance-buoy",
        0.075,
      );
    }
  }

  private addSkierCourseDetails(group: THREE.Group, innerR: number, outerR: number): void {
    const style = this.profile.course;
    const grooveMat = this.courseMat("course:skierg:groomed-groove", style.laneLine, {
      roughness: 0.94,
      metalness: 0.01,
    });
    const grooveCount = 7;
    for (let i = 0; i < grooveCount; i++) {
      const t = i / (grooveCount - 1);
      this.addCourseRing(
        group,
        innerR + 1.1 + (outerR - innerR - 2.2) * t,
        0.014,
        grooveMat,
        "course:skierg:groomed-groove",
        0.052,
      );
    }

    const combMat = this.courseMat("course:skierg:snow-comb", style.secondary, {
      transparent: true,
      opacity: 0.36,
      roughness: 0.96,
      metalness: 0,
    });
    const combGeo = this.track(new THREE.BoxGeometry(outerR - innerR - 2.2, 0.018, 0.035));
    const combs = this.cfg.laneSegments >= 120 ? 60 : 36;
    for (let i = 0; i < combs; i++) {
      this.addCourseBlock(
        group,
        combGeo,
        combMat,
        (innerR + outerR) / 2,
        (i / combs) * Math.PI * 2,
        "course:skierg:snow-comb",
        0.064,
      );
    }

    const gateMat = this.courseMat("course:skierg:gate", style.detail, {
      roughness: 0.45,
      metalness: 0.04,
    });
    const gateGeo = this.track(new THREE.BoxGeometry(0.22, 0.06, 0.82));
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      this.addCourseBlock(
        group,
        gateGeo,
        gateMat,
        innerR + 0.55,
        angle,
        "course:skierg:gate",
        0.08,
      );
      this.addCourseBlock(
        group,
        gateGeo,
        gateMat,
        outerR - 0.55,
        angle,
        "course:skierg:gate",
        0.08,
      );
    }
  }

  private addBikeCourseDetails(group: THREE.Group, innerR: number, outerR: number): void {
    const style = this.profile.course;
    const seamMat = this.courseMat("course:bike:seam", style.secondary, {
      roughness: 0.82,
      metalness: 0.03,
    });
    this.addCourseRing(group, this.ghostRadius, 0.018, seamMat, "course:bike:seam", 0.058);
    this.addCourseRing(group, this.loopRadius, 0.018, seamMat, "course:bike:seam", 0.058);

    const dashMat = this.courseMat("course:bike:dash", style.laneLine, {
      roughness: 0.55,
      metalness: 0.04,
    });
    const dashGeo = this.track(new THREE.BoxGeometry(0.16, 0.05, 1.45));
    const dashCount = this.cfg.laneSegments >= 120 ? 56 : 40;
    for (let i = 0; i < dashCount; i++) {
      this.addCourseBlock(
        group,
        dashGeo,
        dashMat,
        (this.ghostRadius + this.loopRadius) / 2,
        (i / dashCount) * Math.PI * 2,
        "course:bike:dash",
        0.085,
      );
    }

    const curbRed = this.courseMat("course:bike:curb-red", style.detail, {
      roughness: 0.48,
      metalness: 0.04,
    });
    const curbWhite = this.courseMat("course:bike:curb-white", style.edge, {
      roughness: 0.5,
      metalness: 0.03,
    });
    const curbGeo = this.track(new THREE.BoxGeometry(0.34, 0.065, 0.86));
    const curbCount = this.cfg.laneSegments >= 120 ? 72 : 48;
    for (let i = 0; i < curbCount; i++) {
      const angle = (i / curbCount) * Math.PI * 2;
      const mat = i % 2 === 0 ? curbRed : curbWhite;
      this.addCourseBlock(group, curbGeo, mat, innerR + 0.3, angle, "course:bike:curb", 0.09);
      this.addCourseBlock(group, curbGeo, mat, outerR - 0.3, angle, "course:bike:curb", 0.09);
    }

    const speedMat = this.courseMat("course:bike:speed-bars", style.edge, {
      transparent: true,
      opacity: 0.44,
      roughness: 0.52,
      metalness: 0.02,
    });
    const speedGeo = this.track(new THREE.BoxGeometry(1.1, 0.035, 0.14));
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2 + 0.03;
      this.addCourseBlock(
        group,
        speedGeo,
        speedMat,
        outerR - 1.6,
        angle,
        "course:bike:speed-bars",
        0.074,
      );
    }
  }

  private addSportCourseDetails(group: THREE.Group, innerR: number, outerR: number): void {
    if (this.sport === "rower") this.addRowerCourseDetails(group, innerR, outerR);
    else if (this.sport === "skierg") this.addSkierCourseDetails(group, innerR, outerR);
    else this.addBikeCourseDetails(group, innerR, outerR);
  }

  private buildStaticScene(): void {
    const seg = this.profile.waves ? this.cfg.groundSegments : 1;
    const groundGeo = this.track(new THREE.PlaneGeometry(140, 140, seg, seg));
    // Water is glossier than snow/asphalt so the sun glints off the moving
    // wave normals; the displacement loop recomputes them each frame.
    const groundMat = this.mat(
      new THREE.MeshStandardMaterial({
        color: this.profile.groundColor("light"),
        transparent: this.profile.groundOpacity < 1,
        opacity: this.profile.groundOpacity,
        roughness: this.profile.waves ? 0.45 : 0.85,
        metalness: this.profile.waves ? 0.12 : 0.05,
      }),
    );
    groundMat.name = "ground";
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.name = "ground";
    ground.receiveShadow = this.cfg.shadows;
    this.groundMesh = ground;
    this.scene.add(ground);

    const innerR = this.ghostRadius - 4;
    const outerR = this.loopRadius + 4;
    const course = new THREE.Group();
    course.name = `course:${this.sport}`;
    this.scene.add(course);

    const laneGeo = this.track(new THREE.RingGeometry(innerR, outerR, this.cfg.laneSegments));
    const laneMat = this.courseMat("lane", this.profile.course.surface, {
      transparent: this.profile.course.surfaceOpacity < 1,
      opacity: this.profile.course.surfaceOpacity,
      depthWrite: this.profile.course.surfaceOpacity >= 1,
      roughness: this.profile.course.roughness,
      metalness: this.profile.course.metalness,
    });
    laneMat.name = "lane";
    const lane = new THREE.Mesh(laneGeo, laneMat);
    lane.name = "lane";
    lane.rotation.x = -Math.PI / 2;
    lane.receiveShadow = this.cfg.shadows;
    course.add(lane);

    const edgeMat = this.courseMat("course:edge", this.profile.course.edge, {
      roughness: 0.52,
      metalness: 0.04,
    });
    this.addCourseRing(course, innerR, 0.035, edgeMat, "course:edge-inner", 0.06);
    this.addCourseRing(course, outerR, 0.035, edgeMat, "course:edge-outer", 0.06);
    this.addSportCourseDetails(course, innerR, outerR);

    this.postMatMajor = this.mat(
      new THREE.MeshStandardMaterial({ color: hex(COLORS_LIGHT.tickMajor) }),
    );
    this.postMatMinor = this.mat(
      new THREE.MeshStandardMaterial({ color: hex(COLORS_LIGHT.tickMinor) }),
    );
    const postGeo = this.track(new THREE.BoxGeometry(0.14, 1.55, 0.14));
    const postCapGeo = this.track(new THREE.SphereGeometry(0.09, 8, 6));
    const postR = outerR + 1.4;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const isMajor = i % 5 === 0;
      const postMat = isMajor ? this.postMatMajor : this.postMatMinor;
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(postR * Math.sin(a), 0.78, postR * Math.cos(a));
      post.castShadow = this.cfg.shadows;
      this.scene.add(post);
      const cap = new THREE.Mesh(postCapGeo, postMat);
      cap.position.set(postR * Math.sin(a), 1.58, postR * Math.cos(a));
      cap.castShadow = this.cfg.shadows;
      this.scene.add(cap);
    }

    // Buoy lines marking the lane edges — static, one InstancedMesh draw call.
    if (this.cfg.buoys) {
      const buoyGeo = this.track(new THREE.SphereGeometry(0.11, 6, 4));
      this.buoyMat = this.mat(
        new THREE.MeshStandardMaterial({ color: hex(COLORS_LIGHT.markerCap), roughness: 0.6 }),
      );
      const rings = Array.from({ length: this.cfg.buoyRings }, (_, i) => {
        const t = this.cfg.buoyRings === 1 ? 0.5 : i / (this.cfg.buoyRings - 1);
        return this.ghostRadius - 2.5 + (this.loopRadius + 5 - this.ghostRadius) * t;
      });
      const perRing = this.cfg.buoysPerRing;
      const inst = new THREE.InstancedMesh(buoyGeo, this.buoyMat, rings.length * perRing);
      const m = new THREE.Matrix4();
      let bi = 0;
      for (const r of rings) {
        for (let k = 0; k < perRing; k++) {
          const a = (k / perRing) * Math.PI * 2;
          m.setPosition(r * Math.sin(a), 0.06, r * Math.cos(a));
          inst.setMatrixAt(bi++, m);
        }
      }
      inst.instanceMatrix.needsUpdate = true;
      this.buoyMesh = inst;
      this.scene.add(inst);
    }

    // Start/finish line — flat checker across the lane at the lap crossing.
    this.cellMatDark = this.mat(
      new THREE.MeshStandardMaterial({ color: hex(COLORS_LIGHT.finishDark) }),
    );
    this.cellMatLight = this.mat(
      new THREE.MeshStandardMaterial({ color: hex(COLORS_LIGHT.finishLight) }),
    );
    const cellGeo = this.track(new THREE.BoxGeometry(0.9, 0.06, 0.95));
    for (let zc = 0; zc < 9; zc++) {
      for (let xc = 0; xc < 2; xc++) {
        const cell = new THREE.Mesh(
          cellGeo,
          (zc + xc) % 2 === 0 ? this.cellMatDark : this.cellMatLight,
        );
        cell.position.set(-0.5 + xc, 0.04, innerR + 0.6 + zc * 0.95);
        this.scene.add(cell);
      }
    }
  }

  private applyTheme(themeName: "light" | "dark"): void {
    const C = themeName === "dark" ? COLORS_DARK : COLORS_LIGHT;
    this.theme = themeName;
    this.scene.background = new THREE.Color(C.courseFill);
    this.scene.fog = new THREE.Fog(C.courseFill, 55, 170);

    for (const themed of this.courseThemeMats) {
      themed.material.color.setHex(themed.color(themeName));
    }
    if (this.groundMesh.material instanceof THREE.MeshStandardMaterial) {
      this.groundMesh.material.color.setHex(this.profile.groundColor(themeName));
    }

    this.postMatMajor.color.setHex(hex(C.tickMajor));
    this.postMatMinor.color.setHex(hex(C.tickMinor));
    this.cellMatDark.color.setHex(hex(C.finishDark));
    this.cellMatLight.color.setHex(hex(C.finishLight));
    this.buoyMat?.color.setHex(hex(C.markerCap));
    this.sprayMat?.color.setHex(hex(C.foam));

    this.recolorAccent(this.liveAvatar.group, C.live);
    this.recolorAccent(this.ghostAvatar.group, C.ghost);
  }

  private recolorAccent(group: THREE.Group, color: string): void {
    const c = hex(color);
    group.traverse((o) => {
      if (
        o instanceof THREE.Mesh &&
        o.userData.accent &&
        o.material instanceof THREE.MeshStandardMaterial
      ) {
        o.material.color.setHex(c);
      }
    });
  }

  resize(cssWidth: number, cssHeight: number): void {
    this.w = cssWidth;
    this.h = cssHeight;
    // The governor tightens the dpr cap when the GPU can't hold the budget —
    // resolution is the cheapest visual to sacrifice on weak hardware.
    const cap =
      this.governor.level >= 2
        ? 1
        : this.governor.level === 1
          ? Math.min(this.cfg.dprCap, 1.5)
          : this.cfg.dprCap;
    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, cap);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(cssWidth, cssHeight);
    this.camera.aspect = cssWidth / Math.max(cssHeight, 1);
    this.camera.updateProjectionMatrix();
  }

  /**
   * Map governor levels to concrete savings. Levels 1–2 lower the pixel
   * ratio; level 3 flattens the water and stops the spray. Geometry,
   * lighting and avatars are untouched, so the scene degrades gracefully.
   */
  private applyPerfLevel(): void {
    if (this.governor.level >= 1) this.resize(this.w, this.h);
    if (this.governor.level >= 3) {
      this.sprayOff = true;
      this.sprayPool?.clear();
      if (this.sprayMesh) this.sprayMesh.count = 0;
      this.flattenWater();
    }
  }

  private flattenWater(): void {
    if (this.waterFlat) return;
    this.waterFlat = true;
    const water = this.groundMesh;
    if (this.profile.waves && water?.geometry instanceof THREE.PlaneGeometry) {
      const pos = water.geometry.attributes.position;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < pos.count; i++) arr[i * 3 + 2] = 0;
      pos.needsUpdate = true;
      water.geometry.computeVertexNormals();
    }
  }

  /** Place an avatar on its lap circle and animate bob/roll + the stroke. */
  private placeAvatar(
    outer: THREE.Group,
    avatar: Avatar,
    radius: number,
    meters: number,
    cadence: number,
    pose: StrokePose,
  ): { x: number; z: number; tx: number; tz: number; y: number } {
    const a = this.loopAngle(meters);
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    const x = radius * sin;
    const z = radius * cos;
    const tx = cos; // unit tangent (direction of increasing distance)
    const tz = -sin;
    const reduce = this.reduceMotion;
    // Animate first and reuse its solved cues for the outer-body motion. This
    // avoids solving RowErg/SkiErg kinematics a second time per live/ghost lane.
    const motion = avatar.animate(pose.phase, reduce, pose, meters);
    // SkiErg's vertical cue is recovery rebound only, so planted pole tips stay
    // on the course throughout the solver's contact stage.
    const vertical = "vertical" in motion ? motion.vertical : motion.rebound;
    const bob = reduce || this.profile.bobAmp === 0 ? 0 : vertical * this.profile.bobAmp;
    outer.position.set(x, 0, z);
    outer.rotation.y = Math.atan2(tx, tz); // local +Z (travel) -> tangent
    avatar.group.position.y = bob;
    // Stroke surge: the hull checks at the catch and runs out through the
    // drive — a local +Z (travel) offset synced to the shared stroke phase.
    avatar.group.position.z =
      reduce || this.profile.surgeAmp === 0 ? 0 : motion.surge * this.profile.surgeAmp;
    avatar.group.rotation.z =
      reduce || !this.profile.roll ? 0 : Math.sin(this.animPhase + cadence * 0.05) * 0.05;
    return { x, z, tx, tz, y: bob };
  }

  render(state: RenderState, playing: boolean, themeName: "light" | "dark" = "light"): void {
    if (this.w === 0) return;
    if (themeName !== this.theme) this.applyTheme(themeName);
    const C = themeName === "dark" ? COLORS_DARK : COLORS_LIGHT;
    this.reduceMotion = prefersReducedMotion();

    // Wall-clock dt (clamped) keeps water, camera and FOV motion identical on
    // 30/60/120 Hz displays — phases advance by time, not by frame count.
    const nowMs = performance.now();
    const rawDtMs = playing && Number.isFinite(this.lastNowMs) ? nowMs - this.lastNowMs : 0;
    const dt = playing ? clampDt(rawDtMs) : 0;
    this.lastNowMs = playing ? nowMs : NaN;

    // Adaptive degradation: a sustained run of over-budget frames steps the
    // governor, shedding resolution first and effects last.
    if (playing && this.governor.sample(rawDtMs) !== null) this.applyPerfLevel();

    if (playing && !this.reduceMotion) this.animPhase += (2.4 + state.frame.spm / 13) * dt;

    // RenderState.strokePose is required, so the live lane always has a
    // Concept2-derived pose — one visible cycle per stroke row, no drift from
    // the data. The ghost fallback stays because non-data ghosts (constant
    // pace, uploaded file, session without strokes) don't supply a pose.
    const liveMeters = state.frame.d;
    const dLive = liveMeters - this.lastLiveMeters;
    this.lastLiveMeters = liveMeters;
    if (!state.ghostStrokePose && !this.reduceMotion && dt > 0 && state.ghost?.spm)
      this.ghostStrokePhase += (state.ghost.spm / 60) * dt * Math.PI * 2;
    const livePose = state.strokePose;
    const ghostPose =
      state.ghost &&
      (state.ghostStrokePose ??
        fallbackStrokePose(state.sport ?? "rower", this.ghostStrokePhase, state.ghost.spm));

    // Water displacement (rowing only; skipped when flat/low quality, governor
    //-flattened, or phase unchanged). Three interfering wave trains read as a
    // living surface where one sine reads as a conveyor belt.
    const water = this.groundMesh;
    const reduceMotionChanged = this.reduceMotion !== this.lastReduceMotion;
    if (
      this.cfg.displacement &&
      this.profile.waves &&
      !this.waterFlat &&
      (this.animPhase !== this.lastAnimPhase || reduceMotionChanged) &&
      water?.geometry instanceof THREE.PlaneGeometry
    ) {
      const pos = water.geometry.attributes.position;
      const arr = pos.array as Float32Array;
      const count = pos.count;
      const t = this.animPhase;
      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        // local y (arr[idx+1]) maps to world Z after the -90° X rotation, so
        // the primary ripple runs along the course rather than as uniform
        // cross-lane bands; the two faster trains break up the pattern.
        const lx = arr[idx];
        const ly = arr[idx + 1];
        arr[idx + 2] = this.reduceMotion
          ? 0
          : Math.sin(ly * 0.25 + t) * 0.055 +
            Math.sin(lx * 0.31 + t * 1.7) * 0.033 +
            Math.sin((lx + ly) * 0.13 - t * 0.6) * 0.026 +
            Math.sin(ly * 0.6 + t * 2.3) * 0.009;
      }
      pos.needsUpdate = true;
      water.geometry.computeVertexNormals();
      this.lastAnimPhase = this.animPhase;
      this.lastReduceMotion = this.reduceMotion;
    }

    const p = this.placeAvatar(
      this.liveBoat,
      this.liveAvatar,
      this.loopRadius,
      liveMeters,
      state.frame.spm,
      livePose,
    );

    this.advanceWake(this.liveWake, dLive, p.x - p.tx * 1.6, p.z - p.tz * 1.6);

    // Catch spray on the live lane: spawn a burst as each stroke catches,
    // integrate, and write the survivors into the InstancedMesh.
    if (this.sprayPool && this.sprayMesh && !this.sprayOff) {
      const pool = this.sprayPool;
      if (this.reduceMotion) {
        pool.clear();
      } else {
        if (dt > 0) pool.update(dt, 0, -5.5, 0);
        if (playing && catchTransitions(this.lastLivePose, livePose) > 0) {
          const off = this.profile.sprayOffset ?? 0;
          const rx = p.x / this.loopRadius;
          const rz = p.z / this.loopRadius;
          for (const side of [-1, 1]) {
            for (let k = 0; k < this.cfg.sprayPerCatch; k++) {
              pool.spawn(
                p.x + rx * off * side + (Math.random() - 0.5) * 0.3,
                0.12,
                p.z + rz * off * side + (Math.random() - 0.5) * 0.3,
                rx * side * (0.3 + Math.random() * 0.5) - p.tx * (0.3 + Math.random() * 0.5),
                1.1 + Math.random() * 1.2,
                rz * side * (0.3 + Math.random() * 0.5) - p.tz * (0.3 + Math.random() * 0.5),
                0.4 + Math.random() * 0.3,
                0.5 + Math.random(),
              );
            }
          }
        }
      }
      for (let i = 0; i < pool.alive; i++) {
        const sc = pool.size[i] * (0.4 + 0.6 * pool.fade(i));
        this.tmpMat4.makeScale(sc, sc, sc);
        this.tmpMat4.setPosition(pool.x[i], pool.y[i], pool.z[i]);
        this.sprayMesh.setMatrixAt(i, this.tmpMat4);
      }
      this.sprayMesh.count = pool.alive;
      this.sprayMesh.instanceMatrix.needsUpdate = true;
    }

    const laps = Math.max(1, Math.ceil(state.totalDistance / CourseRenderer3D.LOOP_METERS));
    const lap = Math.min(laps, Math.floor(liveMeters / CourseRenderer3D.LOOP_METERS) + 1);
    const liveText =
      laps > 1
        ? `YOU · ${fmtPace(state.frame.pace)} · L${lap}/${laps}`
        : `YOU · ${fmtPace(state.frame.pace)} · ${Math.round(clamp01(state.distFrac) * 100)}%`;
    if (liveText !== this.lastLiveLabel) {
      updateTextSprite(this.liveLabel, this.liveLabelTex, liveText, C.labelBg, C.live);
      this.lastLiveLabel = liveText;
    }
    this.liveLabel.position.set(p.x, 2.4 + p.y, p.z);

    if (state.ghost) {
      if (!this.ghostLabel) {
        const spr = makeTextSprite("", C.labelBg, C.ghost);
        this.ghostLabel = spr.sprite;
        this.ghostLabelTex = spr.texture;
        this.scene.add(this.ghostLabel);
      }
      this.ghostLabel.visible = true;
      this.ghostGroup.visible = true;
      const ghostMeters = clamp01(state.ghost.distFrac) * state.totalDistance;
      const dGhost = ghostMeters - this.lastGhostMeters;
      this.lastGhostMeters = ghostMeters;
      // Ghost uses its own stroke pose when it has stroke rows; constant-pace
      // ghosts synthesize a smooth fallback.
      const gp = this.placeAvatar(
        this.ghostGroup,
        this.ghostAvatar,
        this.ghostRadius,
        ghostMeters,
        state.ghost.spm,
        ghostPose as StrokePose,
      );
      this.advanceWake(this.ghostWake, dGhost, gp.x - gp.tx * 1.6, gp.z - gp.tz * 1.6);
      const ghostText = `${state.ghost.label || "PB"} · ${Math.round(state.ghost.distFrac * 100)}%`;
      if (ghostText !== this.lastGhostLabel && this.ghostLabel && this.ghostLabelTex) {
        updateTextSprite(this.ghostLabel, this.ghostLabelTex, ghostText, C.labelBg, C.ghost);
        this.lastGhostLabel = ghostText;
      }
      this.ghostLabel.position.set(gp.x, 2.2 + gp.y, gp.z);
    } else {
      this.ghostGroup.visible = false;
      if (this.ghostLabel) this.ghostLabel.visible = false;
      this.ghostWake?.reset();
      this.lastGhostLabel = "";
      this.lastGhostMeters = NaN;
      this.lastGhostPose = null;
    }
    this.lastLivePose = livePose;
    this.lastGhostPose = ghostPose || null;

    // Speed-aware FOV: the lens breathes out gently as the boat runs faster
    // (or the playback rate rises), selling the sense of speed. A zoom is a
    // vestibular trigger, so it is pinned flat under reduced motion; seek-
    // sized distance jumps are excluded from the speed estimate so a scrub
    // doesn't pulse the lens.
    if (this.reduceMotion) {
      this.smoothedSpeed = 0;
      this.fovCurrent = 46;
    } else {
      if (dt > 0 && dLive >= 0 && dLive < dt * 120) {
        const inst = dLive > 0 ? Math.min(dLive / dt, 40) : 0;
        this.smoothedSpeed += (inst - this.smoothedSpeed) * dampFactor(3, dt);
      }
      const fovTarget = 46 + Math.max(0, Math.min(1, (this.smoothedSpeed - 3) / 6)) * 5;
      this.fovCurrent +=
        (fovTarget - this.fovCurrent) * (this.cameraInit ? dampFactor(2.5, dt) : 1);
    }
    if (Math.abs(this.camera.fov - this.fovCurrent) > 0.01) {
      this.camera.fov = this.fovCurrent;
      this.camera.updateProjectionMatrix();
    }

    // Sport-aware chase camera. Rowing needs enough room for the oar span,
    // SkiErg benefits from a slightly taller view of the full body, and the
    // bike reads best from a lower pursuit angle. Narrow canvases and a ghost
    // lane pull back rather than cropping the athlete/equipment. Reduced motion
    // uses a centred, higher, slower-damped rig with no lateral orbit or FOV
    // breathing, keeping the horizon substantially steadier.
    const narrow = this.camera.aspect < 1.25;
    const sportRig = CAMERA_RIGS[this.sport];
    const ghostPullback = state.ghost ? 0.9 : 0;
    // Portrait RowErg needs substantially more room for the full oar span;
    // upright SkiErg and compact BikeErg can stay closer.
    const narrowScale = this.sport === "rower" ? 1.8 : this.sport === "skierg" ? 1.28 : 1.32;
    const back = this.reduceMotion
      ? sportRig.back + 2.2 + ghostPullback
      : (sportRig.back + ghostPullback) * (narrow ? narrowScale : 1);
    const height = this.reduceMotion
      ? sportRig.height + 2.1
      : sportRig.height + (narrow ? 0.45 : 0);
    const ahead = this.reduceMotion ? 1.8 : sportRig.ahead;
    const lateral = this.reduceMotion ? 0 : sportRig.lateral;
    const rx = p.x / this.loopRadius;
    const rz = p.z / this.loopRadius;
    const cameraLayoutMode = (narrow ? 1 : 0) | (state.ghost ? 2 : 0) | (this.reduceMotion ? 4 : 0);
    const cameraLayoutChanged = cameraLayoutMode !== this.cameraLayoutMode;
    this.cameraLayoutMode = cameraLayoutMode;
    this.chase.set(p.x - p.tx * back + rx * lateral, height, p.z - p.tz * back + rz * lateral);
    this.lookAt.set(p.x + p.tx * ahead, sportRig.aimY, p.z + p.tz * ahead);
    if (!this.cameraInit) {
      this.camera.position.copy(this.chase);
      this.cameraAim.copy(this.lookAt);
      this.cameraInit = true;
    } else if (playing) {
      // Exponential damping is frame-rate independent. Aim is deliberately
      // softer than translation so course curvature cannot snap the horizon.
      const positionRate = this.reduceMotion ? 3.2 : 7.5;
      const aimRate = this.reduceMotion ? 2.2 : 5.5;
      this.camera.position.lerp(this.chase, dampFactor(positionRate, dt));
      this.cameraAim.lerp(this.lookAt, dampFactor(aimRate, dt));
    } else if (
      dLive !== 0 ||
      cameraLayoutChanged ||
      this.camera.position.distanceToSquared(this.chase) > 9
    ) {
      // Paused renders are on-demand, so nothing would drive a gradual
      // convergence: snap only when the target actually jumped (seek,
      // workout change). The sub-metre trailing lag left at the pause
      // boundary is kept, avoiding a visible pop.
      this.camera.position.copy(this.chase);
      this.cameraAim.copy(this.lookAt);
    } else if (this.cameraAim.distanceToSquared(this.lookAt) > 1) {
      // Paused renders are on-demand, so a seek-sized aim change must snap too.
      this.cameraAim.copy(this.lookAt);
    }
    this.camera.lookAt(this.cameraAim);

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Advance a wake trail for a frame's travel `d` (m). Backward seeks and
   * teleport-sized jumps restart the trail instead of painting quads along
   * the scrub chord; paused renders (d = 0) leave it untouched.
   */
  private advanceWake(wake: WakeTrail | null, d: number, x: number, z: number): void {
    if (!wake) return;
    if (this.reduceMotion || d < 0 || d > 30) wake.reset();
    else if (d > 0) wake.update(x, z);
  }

  destroy(): void {
    // Walk the whole scene — avatar helper geometries (taperedLimb, makeHand,
    // makeFoot, makeHead) are created inline by makeRowerAvatar / makeSkier /
    // makeBike and never tracked in `this.geometries`. Disposing through
    // traversal catches them and is a no-op for the geometries/materials
    // already tracked below (Three's dispose() is idempotent).
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m instanceof THREE.Material) m.dispose();
        }
      }
    });
    this.liveWake?.dispose();
    this.ghostWake?.dispose();
    // Instance buffers are owned by the InstancedMesh, not its geometry or
    // material, so they still need their own dispose() after the traversal.
    this.buoyMesh?.dispose();
    this.sprayMesh?.dispose();
    if (this.liveLabel.material instanceof THREE.Material) this.liveLabel.material.dispose();
    if (this.ghostLabel?.material instanceof THREE.Material) this.ghostLabel.material.dispose();
    this.liveLabelTex.dispose();
    this.ghostLabelTex?.dispose();
    for (const m of this.disposables) m.dispose();
    for (const g of this.geometries) g.dispose();
    // Lose the context *before* dispose(): once disposed, getContext() may
    // return a stale/null reference in some three versions.
    const gl = this.renderer.getContext?.();
    if (gl && typeof (gl as WebGLRenderingContext).getExtension === "function") {
      (gl as WebGLRenderingContext).getExtension("WEBGL_lose_context")?.loseContext();
    }
    this.renderer.dispose();
    // Remove the owned canvas so the next 3D activation builds a fresh one.
    this.canvas.remove();
  }
}
