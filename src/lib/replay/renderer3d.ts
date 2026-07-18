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
import { solveTwoBone3D, type FigurePoint3 } from "./figurePose";

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
  /** Density of optional venue dressing. The authored skyline remains at every tier. */
  environmentDetail: 0 | 1 | 2 | 3;
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
    buoys: true,
    buoysPerRing: 24,
    buoyRings: 2,
    spray: false,
    sprayParticles: 0,
    sprayPerCatch: 0,
    environmentDetail: 0,
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
    buoysPerRing: 36,
    buoyRings: 2,
    spray: true,
    sprayParticles: 40,
    sprayPerCatch: 4,
    environmentDetail: 1,
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
    buoysPerRing: 48,
    buoyRings: 2,
    spray: true,
    sprayParticles: 48,
    sprayPerCatch: 4,
    environmentDetail: 2,
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
    buoysPerRing: 64,
    buoyRings: 2,
    spray: true,
    sprayParticles: 72,
    sprayPerCatch: 6,
    environmentDetail: 3,
  },
};

export type Renderer3DBackend = "webgl" | "webgpu";

type RendererLike = {
  outputColorSpace?: string;
  toneMapping?: number;
  toneMappingExposure?: number;
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

const LABEL_SPRITE_SCALE = 0.0064;

function paintTextSprite(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  text: string,
  bg: string,
  fg: string,
  fontSize: number,
): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  ctx.roundRect(1, 1, canvas.width - 2, canvas.height - 2, canvas.height / 2);
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.globalAlpha = 0.86;
  ctx.strokeStyle = fg;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.font = `600 ${fontSize}px "Source Code Pro", ui-monospace, monospace`;
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
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
  paintTextSprite(ctx, canvas, text, bg, fg, fontSize);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(canvas.width * LABEL_SPRITE_SCALE, canvas.height * LABEL_SPRITE_SCALE, 1);
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
  paintTextSprite(ctx, canvas, text, bg, fg, fontSize);
  texture.needsUpdate = true;
  sprite.scale.set(canvas.width * LABEL_SPRITE_SCALE, canvas.height * LABEL_SPRITE_SCALE, 1);
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

interface AvatarPlacement {
  x: number;
  z: number;
  tx: number;
  tz: number;
  y: number;
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
  rower: { back: 4.4, height: 2.58, ahead: 1.0, lateral: 1.48, aimY: 0.78 },
  skierg: { back: 3.9, height: 2.7, ahead: 0.9, lateral: 1.42, aimY: 1.0 },
  bike: { back: 4.08, height: 2.36, ahead: 1.0, lateral: 1.32, aimY: 0.94 },
};

const BASE_CAMERA_FOV = 42;
const SPEED_CAMERA_FOV_GAIN = 2;

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

type ThemeColor = (theme: ThemeName) => number;

interface EnvironmentStyle {
  skyZenith: ThemeColor;
  skyHorizon: ThemeColor;
  skyNadir: ThemeColor;
  fog: ThemeColor;
  fogNear: number;
  fogFar: number;
  hemisphereSky: ThemeColor;
  hemisphereGround: ThemeColor;
  hemisphereIntensity: number;
  sun: ThemeColor;
  sunIntensity: number;
  fill: ThemeColor;
  fillIntensity: number;
  exposure: number;
  farSilhouette: ThemeColor;
  midSilhouette: ThemeColor;
  venueStructure: ThemeColor;
  venueAccent: ThemeColor;
  infield: ThemeColor;
  apron: ThemeColor;
}

const themed =
  (light: number, dark: number): ThemeColor =>
  (theme) =>
    theme === "dark" ? dark : light;

/**
 * Art-directed venue palettes. Athlete accents remain deliberately absent:
 * physical scenery is shared by live and ghost competitors and never changes
 * material identity with lane colour.
 */
const ENVIRONMENTS: Record<Sport, EnvironmentStyle> = {
  rower: {
    skyZenith: themed(0x3f7894, 0x0c2334),
    skyHorizon: themed(0xf0c98e, 0x466d79),
    skyNadir: themed(0x265b69, 0x0a2632),
    fog: themed(0x9ebfc0, 0x24404b),
    fogNear: 78,
    fogFar: 205,
    hemisphereSky: themed(0xd9eef3, 0x7ba5b2),
    hemisphereGround: themed(0x315a54, 0x132d31),
    hemisphereIntensity: 1.15,
    sun: themed(0xffe0a3, 0xffc978),
    sunIntensity: 2.0,
    fill: themed(0xb7e5ee, 0x4b8090),
    fillIntensity: 0.55,
    exposure: 1.04,
    farSilhouette: themed(0x365a4a, 0x102f31),
    midSilhouette: themed(0x285840, 0x17483a),
    venueStructure: themed(0xe5e1d4, 0x6f7f83),
    venueAccent: themed(0xc46e3d, 0xe0a05d),
    infield: themed(0x1e5d70, 0x174550),
    apron: themed(0x286f80, 0x205865),
  },
  skierg: {
    skyZenith: themed(0x4c82a8, 0x10243a),
    skyHorizon: themed(0xe8f3f8, 0x6e8799),
    skyNadir: themed(0xcadce6, 0x2a4354),
    fog: themed(0xd7e5ea, 0x78909c),
    fogNear: 72,
    fogFar: 198,
    hemisphereSky: themed(0xeaf7ff, 0x9db7c9),
    hemisphereGround: themed(0x9fb3bd, 0x3e5664),
    hemisphereIntensity: 1.22,
    sun: themed(0xfff1d3, 0xddeeff),
    sunIntensity: 1.8,
    fill: themed(0xbcdfff, 0x759db8),
    fillIntensity: 0.62,
    exposure: 1.02,
    farSilhouette: themed(0x9fb9c8, 0x4c6575),
    midSilhouette: themed(0x68899a, 0x294958),
    venueStructure: themed(0x314d5d, 0x172e3b),
    venueAccent: themed(0xd94048, 0xff6670),
    infield: themed(0xe4edf1, 0xafc0c8),
    apron: themed(0xf4f7f8, 0xd1dde2),
  },
  bike: {
    skyZenith: themed(0x172b44, 0x101b2f),
    skyHorizon: themed(0xd27a57, 0x874e58),
    skyNadir: themed(0x423f4b, 0x141a27),
    fog: themed(0x5f5962, 0x242838),
    fogNear: 70,
    fogFar: 185,
    hemisphereSky: themed(0xb3c9df, 0x61758e),
    hemisphereGround: themed(0x3b302d, 0x141820),
    hemisphereIntensity: 1.0,
    sun: themed(0xffb36f, 0xff8f68),
    sunIntensity: 1.85,
    fill: themed(0x8eb8e7, 0x536f9e),
    fillIntensity: 0.58,
    exposure: 1.08,
    farSilhouette: themed(0x333d4a, 0x111722),
    midSilhouette: themed(0x343d4a, 0x252c3a),
    venueStructure: themed(0x364250, 0x202837),
    venueAccent: themed(0xf0a75f, 0xffb46b),
    infield: themed(0x1f3633, 0x142622),
    apron: themed(0x4a4644, 0x30353d),
  },
};

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
        mat.depthWrite = false;
      }
    }
  });
}

const HUMAN_SKIN = 0xe0aa82;
const HUMAN_HAIR = 0x4a3a31;
const HUMAN_KIT = 0x667786;
const HUMAN_KIT_DARK = 0x26343d;
const HUMAN_SHOE = 0xd6e0e4;
const HUMAN_SNOW_SHOE = 0x26343d;

function humanMat(color: number, roughness = 0.82, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
}

function accentMaterial(accent: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: accent,
    roughness: 0.68,
    metalness: 0.01,
    flatShading: true,
    emissive: accent,
    emissiveIntensity: 0.05,
  });
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

/**
 * A watertight procedural torso with a visible waist, rib cage and shoulder
 * taper. Elliptical rings preserve authored width and depth while producing a
 * recognisably human silhouette from front, side and rear views.
 */
function shapedTorso(
  halfWidth: number,
  height: number,
  halfDepth: number,
  material: THREE.Material,
  segments = 10,
): THREE.Mesh {
  // Explicit elliptical rings make the chest, waist and back planes part of
  // one watertight body. A lathed circle squashed in Z produced a vase-like
  // torso; the ring depths below preserve a broad athletic back and a narrow
  // waist from the actual rear three-quarter replay camera.
  const rings = [
    { y: -0.5, width: 0.68, depth: 0.74 },
    { y: -0.4, width: 0.78, depth: 0.82 },
    { y: -0.18, width: 0.7, depth: 0.84 },
    { y: 0.08, width: 0.84, depth: 0.94 },
    { y: 0.34, width: 1, depth: 1 },
    { y: 0.5, width: 0.72, depth: 0.74 },
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

function trapezoidPanel(
  topWidth: number,
  bottomWidth: number,
  height: number,
  depth: number,
  material: THREE.Material,
): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-bottomWidth / 2, -height / 2);
  shape.lineTo(bottomWidth / 2, -height / 2);
  shape.lineTo(topWidth / 2, height / 2);
  shape.lineTo(-topWidth / 2, height / 2);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: false,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function jointCap(radius: number, material: THREE.Material, segments = 8): THREE.Mesh {
  return ellipsoid([radius * 1.06, radius, radius], material, segments);
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

function tubeBetween(
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

const SEGMENT_FORWARD = new THREE.Vector3(0, 0, 1);
const SEGMENT_DIR = new THREE.Vector3();

function placeSegmentCoordinates(
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
    segment.visible = false;
    return;
  }
  segment.visible = true;
  segment.position.set((startX + endX) / 2, (startY + endY) / 2, (startZ + endZ) / 2);
  segment.scale.set(1, 1, length);
  SEGMENT_DIR.set(dx / length, dy / length, dz / length);
  segment.quaternion.setFromUnitVectors(SEGMENT_FORWARD, SEGMENT_DIR);
}

function placeFigureSegmentBetween(
  segment: THREE.Object3D,
  start: FigurePoint3,
  end: FigurePoint3,
): void {
  placeSegmentCoordinates(segment, start.x, start.y, start.z, end.x, end.y, end.z);
}

// ── Upgraded avatar body helpers ─────────────────────────────────────────────
// These replace uniform-radius capsules and plain ellipsoids with replay-scale
// faceted masses that preserve body planes, grip contacts and footwear.

/**
 * A faceted limb that tapers from proximal to distal radius with a slight
 * belly. Returns a unit-length mesh along +Z for segment placement.
 */
function taperedLimb(
  proximalRadius: number,
  distalRadius: number,
  material: THREE.Material,
  segments = 8,
): THREE.Mesh {
  const ringCount = 6;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring < ringCount; ring++) {
    const t = ring / (ringCount - 1);
    const base = proximalRadius + (distalRadius - proximalRadius) * t;
    const belly = Math.sin(t * Math.PI) * proximalRadius * 0.2;
    const radius = base + belly;
    for (let side = 0; side < segments; side++) {
      const angle = (side / segments) * Math.PI * 2;
      positions.push(Math.cos(angle) * radius * 1.08, Math.sin(angle) * radius * 0.82, t - 0.5);
    }
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
function makeHand(material: THREE.Material, side = 1, segments = 8): THREE.Group {
  const hand = new THREE.Group();
  hand.name = "athlete:hand";
  const palm = ellipsoid([0.06, 0.04, 0.075], material, segments);
  palm.name = "athlete:hand:palm";
  palm.rotation.z = side * 0.08;
  hand.add(palm);
  return hand;
}

/**
 * A foot mesh: shoe-shaped sole with toe box and heel.
 */
function makeFoot(material: THREE.Material): THREE.Group {
  const foot = new THREE.Group();
  foot.name = "athlete:foot";
  const geometry = new THREE.BoxGeometry(0.12, 0.065, 0.23, 1, 1, 1);
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const z = positions.getZ(i);
    const x = positions.getX(i);
    positions.setX(i, x * (z > 0 ? 1.08 : 0.82));
    if (z > 0 && positions.getY(i) > 0) positions.setY(i, positions.getY(i) + 0.018);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  const shoe = new THREE.Mesh(geometry, material);
  shoe.position.z = 0.055;
  shoe.name = "athlete:foot:shoe";
  foot.add(shoe);
  return foot;
}

/**
 * A bold faceted head and hair mass sized for the replay camera.
 */
function makeHead(skinMat: THREE.Material, hairMat: THREE.Material, segments = 16): THREE.Group {
  const head = new THREE.Group();
  head.name = "athlete:head";
  const cranium = ellipsoid([0.115, 0.125, 0.108], skinMat, segments);
  cranium.name = "athlete:head:cranium";
  head.add(cranium);
  const hair = ellipsoid([0.119, 0.055, 0.114], hairMat, Math.max(8, segments / 2));
  hair.position.y = 0.087;
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
  const laneMaterial = accentMaterial(accent);
  const accentMat = () => laneMaterial;
  const skinMaterial = humanMat(HUMAN_SKIN);
  const hairMaterial = humanMat(HUMAN_HAIR);
  const kitMaterial = humanMat(HUMAN_KIT);
  const kitDarkMaterial = humanMat(HUMAN_KIT_DARK);
  const shoeMaterial = humanMat(HUMAN_SHOE);
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

  const footPlate = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.05, 0.12), kitDarkMaterial);
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
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.055, 0.29), shoeMaterial);
  seat.name = "rower-seat";
  seat.position.set(0, 0.29, -0.14);
  const hips = ellipsoid([0.18, 0.125, 0.16], kitDarkMaterial, 10);
  hips.name = "rower-hips";
  hips.position.set(0, 0.38, -0.14);

  // Pelvis-pivoted spine: torso, shoulders, neck and head now swing as one
  // articulated chain instead of being translated as disconnected pieces.
  const torso = new THREE.Group();
  torso.name = "rower-torso";
  torso.position.copy(hips.position);
  const torsoShell = accentPart(shapedTorso(0.27, 0.62, 0.165, accentMat(), 10));
  torsoShell.name = "rower-torso-shell";
  torsoShell.position.y = 0.3;
  const frontYoke = trapezoidPanel(0.42, 0.31, 0.14, 0.028, kitDarkMaterial);
  frontYoke.name = "rower-jersey-front";
  frontYoke.position.set(0, 0.49, 0.158);
  const backYoke = trapezoidPanel(0.42, 0.31, 0.14, 0.028, kitDarkMaterial);
  backYoke.name = "rower-jersey-back";
  backYoke.position.set(0, 0.49, -0.158);
  const shoulderLine = capsulePart(0.055, 0.5, kitDarkMaterial, "x");
  shoulderLine.position.set(0, 0.51, 0.01);
  const neck = capsulePart(0.053, 0.11, skinMaterial, "y");
  neck.position.set(0, 0.63, 0.015);
  const headGroup = makeHead(skinMaterial, hairMaterial);
  headGroup.position.set(0, 0.79, 0.025);
  torso.add(torsoShell, frontYoke, backYoke, shoulderLine, neck, headGroup);
  rower.add(seat, hips, torso);

  const arms: Array<{
    side: number;
    upper: THREE.Mesh;
    forearm: THREE.Mesh;
    hand: THREE.Group;
    shoulder: THREE.Mesh;
    elbow: THREE.Mesh;
    shoulderPoint: THREE.Vector3;
    elbowPoint: THREE.Vector3;
    handTarget: THREE.Vector3;
    handPoint: THREE.Vector3;
    bendHint: THREE.Vector3;
  }> = [];
  const legs: Array<{
    side: number;
    thigh: THREE.Mesh;
    shin: THREE.Mesh;
    foot: THREE.Group;
    knee: THREE.Mesh;
    hipPoint: THREE.Vector3;
    kneePoint: THREE.Vector3;
    footTarget: THREE.Vector3;
    footPoint: THREE.Vector3;
    bendHint: THREE.Vector3;
  }> = [];
  for (const side of [-1, 1]) {
    // Tapered leg segments — positioned per-frame by IK from hip to foot.
    const thigh = taperedLimb(0.08, 0.058, kitMaterial);
    thigh.name = side < 0 ? "rower-thigh-left" : "rower-thigh-right";
    const shin = taperedLimb(0.058, 0.042, skinMaterial);
    shin.name = side < 0 ? "rower-shin-left" : "rower-shin-right";
    const foot = makeFoot(shoeMaterial);
    foot.name = side < 0 ? "rower-foot-contact-left" : "rower-foot-contact-right";
    const knee = jointCap(0.075, skinMaterial, 8);
    knee.name = side < 0 ? "rower-knee-left" : "rower-knee-right";
    rower.add(thigh, shin, foot, knee);
    legs.push({
      side,
      thigh,
      shin,
      foot,
      knee,
      hipPoint: new THREE.Vector3(),
      kneePoint: new THREE.Vector3(),
      footTarget: new THREE.Vector3(),
      footPoint: new THREE.Vector3(),
      bendHint: new THREE.Vector3(side * 0.46, 0.7, -0.28),
    });

    const upperArm = taperedLimb(0.064, 0.047, skinMaterial);
    upperArm.name = side < 0 ? "rower-upper-arm-left" : "rower-upper-arm-right";
    const forearm = taperedLimb(0.05, 0.036, skinMaterial);
    forearm.name = side < 0 ? "rower-forearm-left" : "rower-forearm-right";
    const hand = makeHand(skinMaterial, side);
    hand.name = side < 0 ? "rower-hand-left" : "rower-hand-right";
    const shoulder = jointCap(0.07, kitMaterial);
    shoulder.name = side < 0 ? "rower-shoulder-left" : "rower-shoulder-right";
    const elbow = jointCap(0.055, skinMaterial);
    elbow.name = side < 0 ? "rower-elbow-left" : "rower-elbow-right";
    rower.add(upperArm, forearm, hand, shoulder, elbow);
    arms.push({
      side,
      upper: upperArm,
      forearm,
      hand,
      shoulder,
      elbow,
      shoulderPoint: new THREE.Vector3(),
      elbowPoint: new THREE.Vector3(),
      handTarget: new THREE.Vector3(),
      handPoint: new THREE.Vector3(),
      bendHint: new THREE.Vector3(side * 0.56, -0.48, -0.18),
    });
  }
  rower.position.z = -0.1;
  group.add(rower);

  // Oars pivot at their rigger pins. The inboard lever is long enough that a
  // full ~90° sweep moves the handle ~1 m — without that, arms barely travel
  // and the stroke looks like a shoulder shrug. Arm IK consumes the explicit
  // grip anchor so hands stay locked to the equipment while the seat slides.
  const oars: Array<{
    side: number;
    group: THREE.Group;
    blade: THREE.Mesh;
    handleAnchor: THREE.Object3D;
  }> = [];
  for (const side of [-1, 1]) {
    const oar = new THREE.Group();
    oar.name = side < 0 ? "rower-oar-left" : "rower-oar-right";
    // 3.1 m shaft: ~0.85 m inboard of the pin, ~2.25 m outboard to the blade.
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 3.1, 6),
      new THREE.MeshStandardMaterial({ color: 0xe7eef0, roughness: 0.6 }),
    );
    shaft.rotation.z = Math.PI / 2; // cylinder axis Y -> X
    shaft.position.x = side * 0.7;
    oar.add(shaft);
    const grip = capsulePart(0.045, 0.28, humanMat(0x26343d), "x");
    grip.name = side < 0 ? "rower-handle-left" : "rower-handle-right";
    grip.position.x = -side * 0.49;
    oar.add(grip);
    const handleAnchor = new THREE.Object3D();
    handleAnchor.name = side < 0 ? "rower-hand-contact-left" : "rower-hand-contact-right";
    handleAnchor.position.x = -side * 0.56;
    oar.add(handleAnchor);
    // Oar collar — a small ring near the blade end for visual detail.
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.05, 0.015, 6, 10),
      humanMat(0x8a9097, 0.5),
    );
    collar.name = "rower-oar-collar";
    collar.position.set(side * 1.95, 0, 0);
    collar.rotation.y = Math.PI / 2;
    oar.add(collar);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.025, 0.28), accentMat());
    blade.name = side < 0 ? "rower-blade-left" : "rower-blade-right";
    blade.position.set(side * 2.35, -0.06, 0);
    blade.userData.accent = true;
    oar.add(blade);
    // Rigger pin sits outside the hull; blade depth is animated continuously.
    oar.position.set(side * 0.52, 0.34, 0.05);
    oar.userData.side = side;
    group.add(oar);
    oars.push({ side, group: oar, blade, handleAnchor });
  }

  // Authored visual ranges. Channels from the solver are 0..1; these scales
  // turn them into a stroke that reads at a glance without leaving the hull.
  const SEAT_TRAVEL = 0.42;
  const THIGH_LENGTH = 0.552;
  const SHIN_LENGTH = 0.552;
  const UPPER_ARM_LENGTH = 0.445;
  const FOREARM_LENGTH = 0.44;
  const BODY_PITCH_CATCH = -0.52;
  const BODY_PITCH_FINISH = 0.22;
  const OAR_YAW_CATCH = -0.92;
  const OAR_YAW_SPAN = 1.42;
  const BLADE_BURY = 0.16;
  const BLADE_DIP = 0.12;

  const handlePoint = new THREE.Vector3();
  const placeArms = (bodySwing: number, armDraw: number): void => {
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i];
      if (!arm) continue;
      arm.shoulderPoint
        .set(arm.side * 0.25, 0.5, 0.015)
        .applyQuaternion(torso.quaternion)
        .add(torso.position);
      const oar = oars[i];
      if (!oar) continue;
      // Convert the oar-local grip endpoint into rower-local coordinates. Both
      // objects share the avatar group as parent, so this is exact even before
      // Three updates matrixWorld for the draw.
      handlePoint.copy(oar.handleAnchor.position).applyQuaternion(oar.group.quaternion);
      handlePoint.add(oar.group.position).sub(rower.position);
      arm.handTarget.copy(handlePoint);
      arm.bendHint.set(arm.side * (0.56 - armDraw * 0.12), -0.48, -0.18 + bodySwing * 0.12);
      solveTwoBone3D(
        arm.shoulderPoint,
        arm.handTarget,
        UPPER_ARM_LENGTH,
        FOREARM_LENGTH,
        arm.bendHint,
        arm.elbowPoint,
        arm.handPoint,
      );
      arm.shoulder.position.copy(arm.shoulderPoint);
      placeFigureSegmentBetween(arm.upper, arm.shoulderPoint, arm.elbowPoint);
      placeFigureSegmentBetween(arm.forearm, arm.elbowPoint, arm.handPoint);
      arm.elbow.position.copy(arm.elbowPoint);
      arm.hand.position.copy(arm.handPoint);
      arm.hand.quaternion.copy(oar.group.quaternion);
    }
  };

  const placeLegs = (legExtension: number): void => {
    for (const leg of legs) {
      // Hip is fixed relative to the rower group.
      leg.hipPoint.set(leg.side * 0.13, hips.position.y, hips.position.z);
      // The plate is in BOAT space, while these limbs live in the translating
      // rower group. Subtract the slide so the world foot contact stays fixed.
      leg.footTarget.set(leg.side * 0.12, 0.34 - rower.position.y, 0.72 - rower.position.z);
      leg.bendHint.set(leg.side * 0.46, 0.7 - legExtension * 0.1, -0.28);
      solveTwoBone3D(
        leg.hipPoint,
        leg.footTarget,
        THIGH_LENGTH,
        SHIN_LENGTH,
        leg.bendHint,
        leg.kneePoint,
        leg.footPoint,
      );
      placeFigureSegmentBetween(leg.thigh, leg.hipPoint, leg.kneePoint);
      placeFigureSegmentBetween(leg.shin, leg.kneePoint, leg.footPoint);
      // makeFoot() is a fixed-size shoe, not a unit-length segment — running
      // it through placeSegmentBetween()'s 1×1×length scale would crush it to
      // a sliver. Place it directly at the heel/ankle with the shoe sole
      // pitched slightly downward into the stretcher.
      leg.foot.position.copy(leg.footPoint);
      leg.foot.rotation.set(-0.22, 0, 0);
      leg.foot.scale.set(1, 1, 1);
      leg.knee.position.copy(leg.kneePoint);
    }
  };

  const placeUpperBody = (bodySwing: number): void => {
    // Rotate and translate only the upper-body pieces around the hips. Rotating
    // the whole rower group would also rotate the contact-locked feet and hands.
    const pitch = BODY_PITCH_CATCH + bodySwing * (BODY_PITCH_FINISH - BODY_PITCH_CATCH);
    torso.rotation.x = pitch;
    // Slight head counter-tilt so the athlete looks down the course at catch.
    headGroup.rotation.x = -pitch * 0.18 - 0.03;
  };

  const placeOars = (
    legExtension: number,
    bodySwing: number,
    armDraw: number,
    bladeDepth: number,
    bladeFeather: number,
  ): void => {
    // The handle path is staged by the same leg/body/arm order as the athlete.
    const handleProgress = legExtension * 0.42 + bodySwing * 0.34 + armDraw * 0.24;
    for (const oar of oars) {
      oar.group.rotation.y = oar.side * (OAR_YAW_CATCH + handleProgress * OAR_YAW_SPAN);
      // Both blade tips dip into the water together despite opposite X signs.
      oar.group.rotation.z = -oar.side * bladeDepth * BLADE_DIP;
      oar.group.position.y = 0.34 - bladeDepth * BLADE_BURY;
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
    rower.position.z = 0.18 - motion.legExtension * SEAT_TRAVEL;
    rower.position.y = reduce ? 0 : motion.vertical * 0.02;
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
    placeArms(motion.bodySwing, motion.armDraw);
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
  const laneMaterial = accentMaterial(accent);
  const accentMat = () => laneMaterial;
  const skinMaterial = humanMat(HUMAN_SKIN);
  const hairMaterial = humanMat(HUMAN_HAIR);
  const kitMaterial = humanMat(HUMAN_KIT);
  const kitDarkMaterial = humanMat(HUMAN_KIT_DARK);
  const shoeMaterial = humanMat(HUMAN_SNOW_SHOE);
  const poleMaterial = humanMat(0x486775, 0.58);
  const farPoleMaterial = humanMat(0x2f5362, 0.7);
  const gripMaterial = humanMat(0x20242a);
  const kinematics: SkierKinematics = {
    armPress: 0,
    hipHinge: 0,
    kneeFlex: 0,
    poleContact: 0,
    poleSweep: 0,
    rebound: 0,
    surge: 0,
  };

  // Neutral skis keep the accent on the athlete; oversized purple planks made
  // the equipment read as a pair of giant legs from the chase view.
  for (const side of [-1, 1]) {
    const ski = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.055, 1.95), kitDarkMaterial);
    ski.position.set(side * 0.21, 0.03, 0.14);
    group.add(ski);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.28), accentMat());
    tip.name = "skierg-ski-tip";
    tip.position.set(side * 0.21, 0.07, 1.2);
    tip.rotation.x = -0.25;
    tip.userData.accent = true;
    group.add(tip);
  }

  // Planted fixed-length legs solve from the moving pelvis to the boots.  The
  // previous independently rotated capsules separated at the knee and changed
  // length through the crunch.
  const legParts: Array<{
    side: number;
    thigh: THREE.Mesh;
    shin: THREE.Mesh;
    knee: THREE.Mesh;
    hipPoint: THREE.Vector3;
    kneePoint: THREE.Vector3;
    anklePoint: THREE.Vector3;
    solvedAnkle: THREE.Vector3;
    bendHint: THREE.Vector3;
  }> = [];
  for (const side of [-1, 1]) {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.34), shoeMaterial);
    boot.name = side < 0 ? "skierg-foot-contact-left" : "skierg-foot-contact-right";
    boot.position.set(side * 0.21, 0.12, 0.18);
    group.add(boot);

    const thigh = taperedLimb(0.08, 0.058, kitDarkMaterial);
    thigh.name = side < 0 ? "skierg-thigh-left" : "skierg-thigh-right";
    const shin = taperedLimb(0.058, 0.042, skinMaterial);
    shin.name = side < 0 ? "skierg-shin-left" : "skierg-shin-right";
    const knee = jointCap(0.074, kitDarkMaterial, 8);
    knee.name = side < 0 ? "skierg-knee-left" : "skierg-knee-right";
    group.add(thigh, shin, knee);
    legParts.push({
      side,
      thigh,
      shin,
      knee,
      hipPoint: new THREE.Vector3(),
      kneePoint: new THREE.Vector3(),
      anklePoint: new THREE.Vector3(side * 0.21, 0.16, 0.18),
      solvedAnkle: new THREE.Vector3(),
      bendHint: new THREE.Vector3(side * 0.12, 0.08, 0.72),
    });
  }
  const upper = new THREE.Group();
  upper.name = "skierg-upper";
  upper.position.y = 0.72;
  const hips = ellipsoid([0.18, 0.125, 0.16], kitDarkMaterial, 10);
  hips.position.y = 0;
  const torso = accentPart(shapedTorso(0.28, 0.66, 0.17, accentMat(), 10));
  torso.name = "skierg-torso";
  torso.position.y = 0.31;
  const frontYoke = trapezoidPanel(0.44, 0.32, 0.15, 0.03, kitDarkMaterial);
  frontYoke.name = "skierg-jersey-front";
  frontYoke.position.set(0, 0.51, 0.163);
  const backYoke = trapezoidPanel(0.44, 0.32, 0.15, 0.03, kitDarkMaterial);
  backYoke.name = "skierg-jersey-back";
  backYoke.position.set(0, 0.51, -0.163);
  const shoulderLine = capsulePart(0.058, 0.52, kitDarkMaterial, "x");
  shoulderLine.position.y = 0.56;
  const neck = capsulePart(0.053, 0.11, skinMaterial, "y");
  neck.position.y = 0.68;
  const headGroup = makeHead(skinMaterial, hairMaterial);
  headGroup.position.set(0, 0.84, 0.03);
  upper.add(hips, torso, frontYoke, backYoke, shoulderLine, neck, headGroup);
  // Arms are placed from shoulders to pole grips, so the hands stay on the
  // handles while the pole groups pivot from the same point.
  const arms: Array<{
    side: number;
    upper: THREE.Mesh;
    forearm: THREE.Mesh;
    hand: THREE.Group;
    elbow: THREE.Mesh;
    shoulderPoint: THREE.Vector3;
    elbowPoint: THREE.Vector3;
    handTarget: THREE.Vector3;
    handPoint: THREE.Vector3;
    bendHint: THREE.Vector3;
  }> = [];
  for (const side of [-1, 1]) {
    const upperArm = taperedLimb(0.062, 0.046, skinMaterial);
    upperArm.name = side < 0 ? "skierg-upper-arm-left" : "skierg-upper-arm-right";
    const forearm = taperedLimb(0.048, 0.035, skinMaterial);
    forearm.name = side < 0 ? "skierg-forearm-left" : "skierg-forearm-right";
    const hand = makeHand(skinMaterial, side);
    hand.name = side < 0 ? "skierg-hand-left" : "skierg-hand-right";
    const elbow = jointCap(0.054, skinMaterial);
    elbow.name = side < 0 ? "skierg-elbow-left" : "skierg-elbow-right";
    const shoulder = jointCap(0.068, kitMaterial);
    shoulder.name = side < 0 ? "skierg-shoulder-left" : "skierg-shoulder-right";
    shoulder.position.set(side * 0.25, 0.54, 0.05);
    upper.add(upperArm, forearm, hand, elbow, shoulder);
    arms.push({
      side,
      upper: upperArm,
      forearm,
      hand,
      elbow,
      shoulderPoint: new THREE.Vector3(side * 0.25, 0.54, 0.05),
      elbowPoint: new THREE.Vector3(),
      handTarget: new THREE.Vector3(),
      handPoint: new THREE.Vector3(),
      bendHint: new THREE.Vector3(side * 0.38, -0.55, 0.2),
    });
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
    const shaftGeo = new THREE.CylinderGeometry(0.028, 0.028, 1, 6);
    shaftGeo.rotateX(Math.PI / 2); // bake the unit pole onto +Z for endpoint placement
    const shaft = new THREE.Mesh(shaftGeo, side < 0 ? farPoleMaterial : poleMaterial);
    shaft.name = side < 0 ? "skierg-pole-shaft-left" : "skierg-pole-shaft-right";
    const grip = capsulePart(0.025, 0.18, gripMaterial, "x");
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
  const UPPER_ARM_LENGTH = 0.36;
  const FOREARM_LENGTH = 0.34;
  const THIGH_LENGTH = 0.4;
  const SHIN_LENGTH = 0.39;
  const POLE_LENGTH = 1.38;

  const placeSkiLegs = (): void => {
    for (const leg of legParts) {
      leg.hipPoint.set(leg.side * 0.12, upper.position.y, 0.02);
      solveTwoBone3D(
        leg.hipPoint,
        leg.anklePoint,
        THIGH_LENGTH,
        SHIN_LENGTH,
        leg.bendHint,
        leg.kneePoint,
        leg.solvedAnkle,
      );
      placeFigureSegmentBetween(leg.thigh, leg.hipPoint, leg.kneePoint);
      placeFigureSegmentBetween(leg.shin, leg.kneePoint, leg.solvedAnkle);
      leg.knee.position.copy(leg.kneePoint);
    }
  };

  const placePoleArms = (
    armPress: number,
    poleContact: number,
    poleSweep: number,
    rebound: number,
  ): void => {
    // High reach at plant → deep press past the hips at the finish.
    const handY = 0.72 - armPress * 0.64;
    const handZ = 0.52 - armPress * 0.68;
    inverseUpper.copy(upper.quaternion).invert();
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i];
      // The far arm gets a small silhouette correction: five centimetres of
      // extra reach keeps its hand and pole clear of the torso from the chase
      // side without changing either authored bone length.
      const handBaseX = arm.side < 0 ? 0.42 : 0.37;
      const elbowBaseX = arm.side < 0 ? 0.43 : 0.38;
      arm.handTarget.set(arm.side * (handBaseX + armPress * 0.04), handY, handZ);
      arm.bendHint.set(arm.side * (elbowBaseX + armPress * 0.08), -0.55, 0.2);
      solveTwoBone3D(
        arm.shoulderPoint,
        arm.handTarget,
        UPPER_ARM_LENGTH,
        FOREARM_LENGTH,
        arm.bendHint,
        arm.elbowPoint,
        arm.handPoint,
      );
      placeFigureSegmentBetween(arm.upper, arm.shoulderPoint, arm.elbowPoint);
      placeFigureSegmentBetween(arm.forearm, arm.elbowPoint, arm.handPoint);
      arm.elbow.position.copy(arm.elbowPoint);
      arm.hand.position.copy(arm.handPoint);
      const pole = poles[i];
      if (!pole) continue;

      // Resolve a rigid pole in avatar/ground space, then convert its tip to
      // the rotating upper-body local space used by the meshes. The planted
      // branch stays forward while loaded; after release it travels around the
      // outside of the skier instead of flipping through the body.
      tipGroupPoint.copy(arm.handPoint).applyQuaternion(upper.quaternion).add(upper.position);
      const handGroupX = tipGroupPoint.x;
      const handGroupY = tipGroupPoint.y;
      const handGroupZ = tipGroupPoint.z;
      const liftedY = 0.28 + rebound * 0.16;
      const tipY = liftedY + (0.055 - liftedY) * poleContact;
      const vertical = Math.max(
        -POLE_LENGTH * 0.999,
        Math.min(POLE_LENGTH * 0.999, tipY - handGroupY),
      );
      const horizontal = Math.sqrt(Math.max(0, POLE_LENGTH * POLE_LENGTH - vertical * vertical));
      const freeAngle = 0.25 + poleSweep * (Math.PI - 0.5);
      // Retain an outward component through the whole recovery. Letting freeX
      // approach zero points the pole nearly down the camera axis, shortening
      // it to a hidden stub and making double-pole skiing read as one-pole.
      // The camera-side pole needs a wider authored lateral component than the
      // far pole. With a symmetric path it points almost directly into the
      // three-quarter chase lens and visually collapses even though its world
      // length remains exact. This silhouette correction keeps both shafts
      // readable without changing their grip, basket, or 1.38 m solve.
      const freeBase = pole.side < 0 ? 0.18 : 1;
      const freeX = pole.side * (freeBase + Math.sin(freeAngle) * 0.18);
      const freeZ = Math.cos(freeAngle);
      // After the basket releases, route the shaft around the outside of the
      // skier instead of cutting the shortest chord through the body. Besides
      // being a more credible recovery, the bowed path avoids briefly aiming
      // the camera-side pole straight down the rear three-quarter chase lens.
      const releaseBlend = 1 - poleContact;
      const plantedX = pole.side * (pole.side < 0 ? 0.27 : 1);
      const outsideArc = Math.sin(Math.sqrt(releaseBlend) * Math.PI) * (pole.side < 0 ? 0.65 : 0.9);
      let directionX = plantedX + (freeX - plantedX) * releaseBlend + pole.side * outsideArc;
      let directionZ = 1 + (freeZ - 1) * releaseBlend;
      const directionLength = Math.max(1e-6, Math.hypot(directionX, directionZ));
      directionX /= directionLength;
      directionZ /= directionLength;
      tipGroupPoint.set(
        handGroupX + directionX * horizontal,
        handGroupY + vertical,
        handGroupZ + directionZ * horizontal,
      );
      tipLocalPoint.copy(tipGroupPoint).sub(upper.position).applyQuaternion(inverseUpper);
      placeFigureSegmentBetween(pole.shaft, arm.handPoint, tipLocalPoint);
      pole.grip.position.copy(arm.handPoint);
      pole.basket.position.copy(tipLocalPoint);
      pole.tipAnchor.position.copy(pole.basket.position);
      arm.hand.quaternion.copy(pole.shaft.quaternion);
    }
  };

  const animate = (phase: number, reduce: boolean, pose?: StrokePose): AvatarMotionCues => {
    const resolvedPose = reduce
      ? REDUCED_REPLAY_POSES.skierg
      : (pose ?? fallbackStrokePose("skierg", phase));
    const motion = solveSkierKinematics(resolvedPose, kinematics);
    upper.position.y = 0.72 - motion.kneeFlex * 0.12 + (reduce ? 0 : motion.rebound * 0.04);
    // Deep crunch through the pull so the double-pole reads at a glance.
    upper.rotation.x = 0.1 + motion.hipHinge * 0.72;
    placeSkiLegs();
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
  const laneMaterial = accentMaterial(accent);
  const accentMat = () => laneMaterial;
  const skinMaterial = humanMat(HUMAN_SKIN);
  const hairMaterial = humanMat(HUMAN_HAIR);
  const kitMaterial = humanMat(HUMAN_KIT);
  const kitDarkMaterial = humanMat(HUMAN_KIT_DARK);
  const shoeMaterial = humanMat(HUMAN_SHOE);
  const equipmentMaterial = humanMat(0x82949d, 0.62);
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
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(wheelR, 0.06, 8, 16), equipmentMaterial);
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

  // Endpoint-built tubes form a real diamond frame. The previous horizontal
  // boxes never met at frame nodes, so the rear wheel swallowed the machine.
  const bottomBracket = { x: 0, y: wheelR, z: -0.05 };
  const seatCluster = { x: 0, y: wheelR + 0.76, z: -0.4 };
  const headBottom = { x: 0, y: wheelR + 0.55, z: 0.42 };
  const headTop = { x: 0, y: wheelR + 0.8, z: 0.5 };
  const downTube = accentPart(
    tubeBetween("bike-down-tube", bottomBracket, headBottom, 0.055, accentMat()),
  );
  const seatTube = accentPart(
    tubeBetween("bike-seat-tube", bottomBracket, seatCluster, 0.052, accentMat()),
  );
  const topTube = accentPart(
    tubeBetween("bike-top-tube", seatCluster, headTop, 0.048, accentMat()),
  );
  const headTube = accentPart(
    tubeBetween("bike-head-tube", headBottom, headTop, 0.06, accentMat()),
  );
  group.add(downTube, seatTube, topTube, headTube);
  // Paired chain and seat stays expose the frame triangle from the new
  // three-quarter chase angle.
  for (const side of [-1, 1]) {
    const rearAxle = { x: side * 0.07, y: wheelR, z: -0.85 };
    const bbSide = { ...bottomBracket, x: side * 0.055 };
    const seatSide = { ...seatCluster, x: side * 0.055 };
    group.add(
      accentPart(tubeBetween("bike-chain-stay", rearAxle, bbSide, 0.028, accentMat())),
      accentPart(tubeBetween("bike-seat-stay", rearAxle, seatSide, 0.028, accentMat())),
    );
  }

  // Cranks: spin about the bottom bracket (X axis) with two pedals.
  const cranks = new THREE.Group();
  cranks.name = "bike-cranks";
  cranks.position.set(0, wheelR, -0.05);
  // Chain ring — a toroidal disc at the bottom bracket.
  const chainRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.018, 6, 18),
    humanMat(0x555555, 0.4),
  );
  chainRing.name = "bike-chain-ring";
  chainRing.rotation.y = Math.PI / 2;
  cranks.add(chainRing);
  const pedals: Array<{ side: number; crankY: number }> = [];
  for (const side of [-1, 1]) {
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.1), equipmentMaterial);
    pedal.name = side < 0 ? "bike-pedal-left" : "bike-pedal-right";
    const crankY = side * 0.21;
    pedal.position.set(side * 0.1, crankY, 0);
    cranks.add(pedal);
    pedals.push({ side, crankY });
  }
  group.add(cranks);

  // The saddle closes the previously visible gap between the frame and the
  // rider's pelvis, which was especially obvious from the chase camera.
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.055, 0.3), equipmentMaterial);
  saddle.name = "bike-saddle";
  saddle.position.set(0, wheelR + 0.77, -0.4);
  group.add(saddle);

  const handlebar = new THREE.Group();
  handlebar.name = "bike-handlebar";
  const crossbar = capsulePart(0.03, 0.72, equipmentMaterial, "x");
  handlebar.add(crossbar);
  const barContacts: Array<{ side: number; anchor: THREE.Object3D }> = [];
  for (const side of [-1, 1]) {
    const grip = capsulePart(0.024, 0.22, equipmentMaterial, "z");
    grip.name = side < 0 ? "bike-handlebar-grip-left" : "bike-handlebar-grip-right";
    grip.position.set(side * 0.32, -0.02, 0.04);
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
  rider.position.set(0, wheelR + 0.76, -0.38);
  const pelvis = ellipsoid([0.175, 0.125, 0.16], kitDarkMaterial, 10);
  pelvis.name = "bike-pelvis";
  pelvis.position.set(0, 0.02, -0.01);
  const torso = new THREE.Group();
  torso.name = "bike-spine";
  torso.position.set(0, 0.02, 0.01);
  const torsoShell = accentPart(shapedTorso(0.26, 0.62, 0.16, accentMat(), 10));
  torsoShell.name = "bike-torso";
  torsoShell.position.set(0, 0.28, 0.04);
  const frontYoke = trapezoidPanel(0.4, 0.29, 0.14, 0.028, kitDarkMaterial);
  frontYoke.name = "bike-jersey-front";
  frontYoke.position.set(0, 0.48, 0.153);
  const backYoke = trapezoidPanel(0.4, 0.29, 0.14, 0.028, kitDarkMaterial);
  backYoke.name = "bike-jersey-back";
  backYoke.position.set(0, 0.48, -0.153);
  const shoulderLine = capsulePart(0.054, 0.48, kitDarkMaterial, "x");
  shoulderLine.position.set(0, 0.49, 0.025);
  const neck = capsulePart(0.05, 0.1, skinMaterial, "y");
  neck.position.set(0, 0.6, 0.035);
  const headGroup = makeHead(skinMaterial, hairMaterial);
  headGroup.position.set(0, 0.75, 0.07);
  // Parent the helmet to the head so sway and counter-rotation can never leave
  // it floating above the rider.
  const helmetGroup = new THREE.Group();
  helmetGroup.name = "bike-helmet";
  const helmetShell = accentPart(ellipsoid([0.132, 0.075, 0.135], accentMat(), 10));
  helmetShell.name = "bike-helmet-shell";
  helmetShell.position.set(0, 0.1, -0.018);
  helmetShell.rotation.x = -0.16;
  helmetGroup.add(helmetShell);
  headGroup.add(helmetGroup);
  torso.add(torsoShell, frontYoke, backYoke, shoulderLine, neck, headGroup);
  const legs: Array<{
    side: number;
    crankY: number;
    thigh: THREE.Mesh;
    shin: THREE.Mesh;
    shoe: THREE.Group;
    knee: THREE.Mesh;
    hipPoint: THREE.Vector3;
    kneePoint: THREE.Vector3;
    pedalTarget: THREE.Vector3;
    pedalPoint: THREE.Vector3;
    bendHint: THREE.Vector3;
  }> = [];
  for (const side of [-1, 1]) {
    const thigh = taperedLimb(0.078, 0.057, kitDarkMaterial);
    thigh.name = side < 0 ? "bike-thigh-left" : "bike-thigh-right";
    const shin = taperedLimb(0.056, 0.041, skinMaterial);
    shin.name = side < 0 ? "bike-shin-left" : "bike-shin-right";
    const shoe = makeFoot(shoeMaterial);
    shoe.name = side < 0 ? "bike-foot-contact-left" : "bike-foot-contact-right";
    const knee = jointCap(0.072, kitDarkMaterial, 8);
    knee.name = side < 0 ? "bike-knee-left" : "bike-knee-right";
    rider.add(thigh, shin, shoe, knee);
    legs.push({
      side,
      crankY: pedals.find((p) => p.side === side)?.crankY ?? side * 0.18,
      thigh,
      shin,
      shoe,
      knee,
      hipPoint: new THREE.Vector3(),
      kneePoint: new THREE.Vector3(),
      pedalTarget: new THREE.Vector3(),
      pedalPoint: new THREE.Vector3(),
      bendHint: new THREE.Vector3(side * 0.13, 0.18, 0.72),
    });
  }
  // Arms from the shoulders down to the bars, fixed in the tuck.
  const arms: Array<{
    side: number;
    upper: THREE.Mesh;
    forearm: THREE.Mesh;
    hand: THREE.Group;
    elbow: THREE.Mesh;
    shoulderPoint: THREE.Vector3;
    elbowPoint: THREE.Vector3;
    handTarget: THREE.Vector3;
    handPoint: THREE.Vector3;
    bendHint: THREE.Vector3;
  }> = [];
  for (const side of [-1, 1]) {
    const upperArm = taperedLimb(0.06, 0.045, skinMaterial);
    upperArm.name = side < 0 ? "bike-upper-arm-left" : "bike-upper-arm-right";
    const forearm = taperedLimb(0.047, 0.034, skinMaterial);
    forearm.name = side < 0 ? "bike-forearm-left" : "bike-forearm-right";
    const hand = makeHand(skinMaterial, side);
    hand.name = side < 0 ? "bike-hand-left" : "bike-hand-right";
    const elbow = jointCap(0.053, skinMaterial);
    elbow.name = side < 0 ? "bike-elbow-left" : "bike-elbow-right";
    const shoulder = jointCap(0.066, kitMaterial);
    shoulder.name = side < 0 ? "bike-shoulder-left" : "bike-shoulder-right";
    shoulder.position.set(side * 0.24, 0.49, 0.025);
    torso.add(shoulder);
    rider.add(upperArm, forearm, hand, elbow);
    arms.push({
      side,
      upper: upperArm,
      forearm,
      hand,
      elbow,
      shoulderPoint: new THREE.Vector3(),
      elbowPoint: new THREE.Vector3(),
      handTarget: new THREE.Vector3(),
      handPoint: new THREE.Vector3(),
      bendHint: new THREE.Vector3(side * 0.38, -0.52, -0.12),
    });
  }
  rider.add(pelvis, torso);
  group.add(rider);

  const barPoint = new THREE.Vector3();
  const UPPER_ARM_LENGTH = 0.37;
  const FOREARM_LENGTH = 0.35;
  const THIGH_LENGTH = 0.54;
  const SHIN_LENGTH = 0.53;
  const placeBarArms = (): void => {
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i];
      if (!arm) continue;
      arm.shoulderPoint
        .set(arm.side * 0.24, 0.49, 0.025)
        .applyQuaternion(torso.quaternion)
        .add(torso.position);
      const contact = barContacts[i];
      if (!contact) continue;
      // Handlebar and rider share the avatar group. Convert the explicit grip
      // contact into rider-local space so torso cues never detach the hands.
      barPoint
        .copy(contact.anchor.position)
        .applyQuaternion(handlebar.quaternion)
        .add(handlebar.position)
        .sub(rider.position);
      arm.handTarget.copy(barPoint);
      solveTwoBone3D(
        arm.shoulderPoint,
        arm.handTarget,
        UPPER_ARM_LENGTH,
        FOREARM_LENGTH,
        arm.bendHint,
        arm.elbowPoint,
        arm.handPoint,
      );
      placeFigureSegmentBetween(arm.upper, arm.shoulderPoint, arm.elbowPoint);
      placeFigureSegmentBetween(arm.forearm, arm.elbowPoint, arm.handPoint);
      arm.elbow.position.copy(arm.elbowPoint);
      arm.hand.position.copy(arm.handPoint);
      arm.hand.rotation.set(-0.28, 0, arm.side * 0.08);
    }
  };

  const placePedalLegs = (phase: number, anklePitchLeft: number, anklePitchRight: number): void => {
    for (const leg of legs) {
      // Foot stays exactly on the pedal mesh (crankY is the authored arm length).
      const pedalY = leg.crankY * Math.cos(phase);
      const pedalZ = leg.crankY * Math.sin(phase);
      leg.pedalTarget.set(
        leg.side * 0.1,
        cranks.position.y + pedalY - rider.position.y,
        cranks.position.z + pedalZ - rider.position.z,
      );
      leg.hipPoint.set(leg.side * 0.12, 0.02, -0.01);
      const extension = Math.sin(phase) * leg.side;
      leg.bendHint.set(leg.side * 0.08, 0.18, 0.72 - extension * 0.1);
      solveTwoBone3D(
        leg.hipPoint,
        leg.pedalTarget,
        THIGH_LENGTH,
        SHIN_LENGTH,
        leg.bendHint,
        leg.kneePoint,
        leg.pedalPoint,
      );
      placeFigureSegmentBetween(leg.thigh, leg.hipPoint, leg.kneePoint);
      placeFigureSegmentBetween(leg.shin, leg.kneePoint, leg.pedalPoint);
      leg.knee.position.copy(leg.kneePoint);
      leg.shoe.position.copy(leg.pedalPoint);
      // Ankling is deliberately restrained; feet stay planted on the pedals
      // instead of tumbling through a full revolution with the crank.
      leg.shoe.rotation.x = leg.side < 0 ? anklePitchLeft : anklePitchRight;
    }
  };

  const placeBikeTorso = (sway: number, hipRock: number): void => {
    rider.rotation.set(0, 0, 0); // keep hands/feet in equipment space
    torso.rotation.set(0.74 + hipRock, 0, sway);
    headGroup.rotation.z = -sway * 0.22;
  };

  placeBikeTorso(0, 0);
  placeBarArms();

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
      placeBikeTorso(0, 0);
      placeBarArms();
      return STATIC_AVATAR_MOTION;
    }
    // Wheel travel comes from distance, independent of cadence/gearing. Positive
    // rotation about +X moves the wheel top toward local +Z (forward).
    const wheelAngle = meters / wheelR;
    for (const w of wheels) w.rotation.x = wheelAngle;
    cranks.rotation.x = motion.crankAngle;
    placePedalLegs(motion.crankAngle, motion.anklePitchLeft, motion.anklePitchRight);
    placeBikeTorso(motion.torsoSway, motion.hipRock);
    placeBarArms();
    return STATIC_AVATAR_MOTION;
  };

  finalizeAvatar(group, castShadow, opacity);
  return { group, animate };
}

const SPORT_PROFILES: Record<Sport, SportProfile> = {
  rower: {
    waves: true,
    roll: true,
    bobAmp: 0.09,
    metersPerCycle: METERS_PER_CYCLE.rower,
    surgeAmp: 0.34,
    sprayOffset: 2.2, // off the blade tips
    groundOpacity: 1,
    trailColor: 0xffffff,
    groundColor: (t) => (t === "dark" ? 0x165a68 : 0x155a70),
    course: {
      surface: (t) => (t === "dark" ? 0x1a5968 : 0x397f92),
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
    bobAmp: 0.05,
    metersPerCycle: METERS_PER_CYCLE.skierg,
    surgeAmp: 0.14,
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
    groundColor: (t) => (t === "dark" ? 0x242a31 : 0x7e898f),
    course: {
      surface: (t) => (t === "dark" ? 0x343942 : 0x474e54),
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
  private lastX = NaN;
  private lastZ = NaN;

  constructor(scene: THREE.Scene, n: number, geo: THREE.BufferGeometry, color = 0xffffff) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: true,
      });
      const seg = new THREE.Mesh(geo, mat);
      seg.rotation.x = -Math.PI / 2;
      seg.position.y = 0.02;
      seg.renderOrder = -1;
      seg.visible = false;
      scene.add(seg);
      this.segs.push(seg);
      this.mats.push(mat);
    }
  }

  update(x: number, z: number): void {
    // Distance-sample instead of stamping once per display frame. The former
    // dense square stack changed length with refresh rate and merged into a
    // giant opaque card at 4×/8× playback.
    if (Number.isFinite(this.lastX) && Math.hypot(x - this.lastX, z - this.lastZ) < 0.18) return;
    this.lastX = x;
    this.lastZ = z;
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
      this.mats[i].opacity = Math.sqrt(f) * f * 0.22;
      const s = 0.42 + (1 - f) * 0.48;
      seg.scale.set(s, s, s);
    }
  }

  reset(): void {
    this.hist.length = 0;
    this.lastX = NaN;
    this.lastZ = NaN;
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
  private readonly livePlacement: AvatarPlacement = { x: 0, z: 0, tx: 0, tz: 0, y: 0 };
  private readonly ghostPlacement: AvatarPlacement = { x: 0, z: 0, tx: 0, tz: 0, y: 0 };
  private lastNowMs = NaN;
  /** Replay-space speed (m/s), smoothed; breathes the chase-camera FOV. */
  private smoothedSpeed = 0;
  private fovCurrent = BASE_CAMERA_FOV;
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
  private readonly environment: EnvironmentStyle;
  private groundMesh!: THREE.Mesh;
  private skyGeometry!: THREE.SphereGeometry;
  private hemisphereLight!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;
  private worldFill!: THREE.DirectionalLight;
  private readonly environmentMidGroup = new THREE.Group();
  private readonly environmentDetailGroup = new THREE.Group();
  private liveContactShadow!: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private ghostContactShadow!: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
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
  private instancedMeshes: THREE.InstancedMesh[] = [];
  private courseThemeMats: Array<{ material: THREE.MeshStandardMaterial; color: CourseColor }> = [];
  private environmentThemeMats: Array<{
    material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
    color: ThemeColor;
  }> = [];
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
    this.environment = ENVIRONMENTS[sport];
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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.environment.exposure;
    if (this.cfg.shadows && this.renderer.shadowMap) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(BASE_CAMERA_FOV, 1, 0.1, 500);

    // Venue-specific sky/ground fill plus a warm key and cool bounce establish
    // a deliberate broadcast-lighting rig instead of a flat ambient wash.
    this.hemisphereLight = new THREE.HemisphereLight(
      this.environment.hemisphereSky("light"),
      this.environment.hemisphereGround("light"),
      this.environment.hemisphereIntensity,
    );
    this.hemisphereLight.name = "environment:hemisphere";
    this.scene.add(this.hemisphereLight);
    this.sunLight = new THREE.DirectionalLight(
      this.environment.sun("light"),
      this.environment.sunIntensity,
    );
    this.sunLight.name = "environment:key-light";
    this.sunLight.position.set(18, 30, 12);
    if (this.cfg.shadows) {
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.set(this.cfg.shadowMapSize, this.cfg.shadowMapSize);
      const c = this.sunLight.shadow.camera;
      c.near = 1;
      c.far = 58;
      c.left = -10;
      c.right = 10;
      c.bottom = -8;
      c.top = 12;
      this.sunLight.shadow.bias = -0.0002;
      this.sunLight.shadow.normalBias = 0.035;
    }
    this.sunLight.target.name = "environment:key-light-target";
    this.scene.add(this.sunLight, this.sunLight.target);
    this.worldFill = new THREE.DirectionalLight(
      this.environment.fill("light"),
      this.environment.fillIntensity,
    );
    this.worldFill.name = "environment:world-fill";
    this.worldFill.position.set(-12, 9, -8);
    this.scene.add(this.worldFill);

    // Camera-relative lights keep the athlete's rear planes readable around
    // the whole loop. Fixed world lights alone left half the course as an
    // almost black silhouette, especially at Medium where shadows are off.
    const cameraFill = new THREE.DirectionalLight(0xdbeafe, 0.48);
    cameraFill.name = "camera-athlete-fill";
    cameraFill.position.set(-3.5, 4.5, 2);
    cameraFill.target.position.set(0, 0, -8);
    const cameraRim = new THREE.DirectionalLight(0xf8fafc, 0.3);
    cameraRim.name = "camera-athlete-rim";
    cameraRim.position.set(4, 2.5, 1);
    cameraRim.target.position.set(0, 0, -8);
    this.camera.add(cameraFill, cameraFill.target, cameraRim, cameraRim.target);
    this.scene.add(this.camera);

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
      // A bounded faceted disc has no square texture corners; low-opacity
      // overlap becomes broken foam/snow instead of a white trapezoid.
      const wakeGeo = this.track(new THREE.CircleGeometry(0.44, 10));
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

    // Apply the light theme immediately. Previously this happened only after
    // a theme change, leaving the initial alpha canvas to reveal a black page
    // behind an otherwise light scene.
    this.applyTheme("light");
  }

  private track<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private mat<T extends THREE.Material>(m: T): T {
    this.disposables.push(m);
    return m;
  }

  private trackInstanced<T extends THREE.InstancedMesh>(mesh: T): T {
    this.instancedMeshes.push(mesh);
    return mesh;
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

  private environmentStandardMat(
    name: string,
    color: ThemeColor,
    opts: Omit<THREE.MeshStandardMaterialParameters, "color"> = {},
  ): THREE.MeshStandardMaterial {
    const material = this.mat(
      new THREE.MeshStandardMaterial({
        ...opts,
        color: color("light"),
      }),
    );
    material.name = name;
    this.environmentThemeMats.push({ material, color });
    return material;
  }

  private environmentBasicMat(
    name: string,
    color: ThemeColor,
    opts: Omit<THREE.MeshBasicMaterialParameters, "color"> = {},
  ): THREE.MeshBasicMaterial {
    const material = this.mat(
      new THREE.MeshBasicMaterial({
        ...opts,
        color: color("light"),
      }),
    );
    material.name = name;
    this.environmentThemeMats.push({ material, color });
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

  private updateSkyColors(themeName: ThemeName): void {
    if (!this.skyGeometry) return;
    const position = this.skyGeometry.getAttribute("position");
    const color = this.skyGeometry.getAttribute("color") as THREE.BufferAttribute;
    const zenith = new THREE.Color(this.environment.skyZenith(themeName));
    const horizon = new THREE.Color(this.environment.skyHorizon(themeName));
    const nadir = new THREE.Color(this.environment.skyNadir(themeName));
    const sample = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      const normalizedY = THREE.MathUtils.clamp(position.getY(i) / 175, -1, 1);
      if (normalizedY >= 0) {
        sample.copy(horizon).lerp(zenith, Math.pow(normalizedY, 0.58));
      } else {
        sample.copy(horizon).lerp(nadir, Math.pow(-normalizedY, 0.72));
      }
      color.setXYZ(i, sample.r, sample.g, sample.b);
    }
    color.needsUpdate = true;
  }

  private buildSky(): void {
    const widthSegments = this.cfg.environmentDetail >= 2 ? 48 : 32;
    const heightSegments = this.cfg.environmentDetail >= 2 ? 24 : 16;
    this.skyGeometry = this.track(new THREE.SphereGeometry(175, widthSegments, heightSegments));
    const positions = this.skyGeometry.getAttribute("position");
    this.skyGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(positions.count * 3), 3),
    );
    const skyMat = this.mat(
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
      }),
    );
    skyMat.name = "environment:sky-material";
    const sky = new THREE.Mesh(this.skyGeometry, skyMat);
    sky.name = `environment:${this.sport}:sky`;
    sky.frustumCulled = false;
    sky.renderOrder = -1000;
    this.scene.add(sky);
    this.updateSkyColors("light");

    const sunMat = this.environmentBasicMat("environment:sun-disc-material", this.environment.sun, {
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    });
    const sun = new THREE.Mesh(this.track(new THREE.CircleGeometry(7.5, 32)), sunMat);
    sun.name = `environment:${this.sport}:sun-disc`;
    sun.position.set(-104, 51, -104);
    sun.lookAt(0, 8, 0);
    sun.renderOrder = -900;
    this.scene.add(sun);
  }

  private makeHorizonRing(
    name: string,
    radius: number,
    baseY: number,
    averageHeight: number,
    variation: number,
    segments: number,
    color: ThemeColor,
    phase: number,
  ): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
    const positions = new Float32Array(segments * 18);
    let cursor = 0;
    const heightAt = (i: number): number => {
      const a = (i / segments) * Math.PI * 2;
      const broad = Math.sin(a * 3 + phase) * 0.46 + Math.sin(a * 7 - phase * 0.7) * 0.28;
      const ridge = Math.abs(Math.sin(a * 11 + phase * 1.9)) * 0.34;
      return averageHeight + variation * (broad + ridge);
    };
    const radiusAt = (i: number): number => {
      const a = (i / segments) * Math.PI * 2;
      return radius + Math.sin(a * 5 + phase) * 2.1 + Math.sin(a * 13) * 0.8;
    };
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const r0 = radiusAt(i);
      const r1 = radiusAt(i + 1);
      const x0 = Math.sin(a0) * r0;
      const z0 = Math.cos(a0) * r0;
      const x1 = Math.sin(a1) * r1;
      const z1 = Math.cos(a1) * r1;
      const y0 = baseY + Math.max(0.4, heightAt(i));
      const y1 = baseY + Math.max(0.4, heightAt(i + 1));
      const quad = [
        x0,
        baseY,
        z0,
        x1,
        y1,
        z1,
        x1,
        baseY,
        z1,
        x0,
        baseY,
        z0,
        x0,
        y0,
        z0,
        x1,
        y1,
        z1,
      ];
      positions.set(quad, cursor);
      cursor += quad.length;
    }
    const geometry = this.track(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const material = this.environmentBasicMat(`${name}:material`, color, {
      side: THREE.DoubleSide,
      fog: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    return mesh;
  }

  private addInstancedPines(
    group: THREE.Group,
    count: number,
    radiusMin: number,
    radiusMax: number,
  ): void {
    const canopyGeo = this.track(new THREE.ConeGeometry(1.45, 4.2, 7, 1));
    const crownGeo = this.track(new THREE.ConeGeometry(1.02, 3.4, 7, 1));
    const trunkGeo = this.track(new THREE.CylinderGeometry(0.1, 0.16, 1.35, 6));
    const pineColor =
      this.sport === "skierg" ? themed(0x335d51, 0x244d45) : themed(0x2d6548, 0x1c503c);
    const crownColor =
      this.sport === "skierg" ? themed(0x416f61, 0x2e5d52) : themed(0x397657, 0x276148);
    // Distant foliage is intentionally unlit: it keeps readable colour in the
    // dusk themes rather than collapsing into black spike silhouettes.
    const canopyMat = this.environmentBasicMat(
      `environment:${this.sport}:pine-canopy-material`,
      pineColor,
      { fog: true },
    );
    const crownMat = this.environmentBasicMat(
      `environment:${this.sport}:pine-crown-material`,
      crownColor,
      { fog: true },
    );
    const trunkMat = this.environmentStandardMat(
      `environment:${this.sport}:pine-trunk-material`,
      themed(0x5a4635, 0x261f1b),
      { roughness: 1, metalness: 0, flatShading: true },
    );
    const canopies = this.trackInstanced(new THREE.InstancedMesh(canopyGeo, canopyMat, count));
    const crowns = this.trackInstanced(new THREE.InstancedMesh(crownGeo, crownMat, count));
    const trunks = this.trackInstanced(new THREE.InstancedMesh(trunkGeo, trunkMat, count));
    canopies.name = `environment:${this.sport}:pines`;
    crowns.name = `environment:${this.sport}:pine-crowns`;
    trunks.name = `environment:${this.sport}:pine-trunks`;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.sin(i * 2.19) * 0.035;
      const radius =
        radiusMin + (radiusMax - radiusMin) * (0.18 + 0.82 * (0.5 + Math.sin(i * 12.9898) * 0.5));
      const size = 0.75 + (0.5 + Math.sin(i * 7.31) * 0.5) * 0.8;
      position.set(Math.sin(a) * radius, 2.05 * size, Math.cos(a) * radius);
      scale.set(size, size, size);
      matrix.compose(position, quaternion, scale);
      canopies.setMatrixAt(i, matrix);
      position.y = 3.85 * size;
      scale.set(size, size, size);
      matrix.compose(position, quaternion, scale);
      crowns.setMatrixAt(i, matrix);
      position.y = 0.55 * size;
      scale.set(size, size, size);
      matrix.compose(position, quaternion, scale);
      trunks.setMatrixAt(i, matrix);
    }
    canopies.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    trunks.instanceMatrix.needsUpdate = true;
    group.add(trunks, canopies, crowns);
  }

  private addAlpinePeaks(group: THREE.Group, count: number): void {
    const peakGeo = this.track(new THREE.ConeGeometry(7.2, 24, 5, 1));
    const capGeo = this.track(new THREE.ConeGeometry(3.25, 6.2, 5, 1));
    const peakMat = this.environmentBasicMat(
      "environment:skierg:mountain-material",
      themed(0x7897a8, 0x4f6a7a),
      { fog: true },
    );
    const capMat = this.environmentBasicMat(
      "environment:skierg:snowcap-material",
      themed(0xe8f2f5, 0xaec1ca),
      { fog: true },
    );
    const peaks = this.trackInstanced(new THREE.InstancedMesh(peakGeo, peakMat, count));
    const caps = this.trackInstanced(new THREE.InstancedMesh(capGeo, capMat, count));
    peaks.name = "environment:skierg:mountain-peaks";
    caps.name = "environment:skierg:snowcaps";
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.sin(i * 1.73) * 0.045;
      const radius = 79 + (0.5 + Math.sin(i * 8.17) * 0.5) * 13;
      const size = 0.72 + (0.5 + Math.sin(i * 4.91) * 0.5) * 0.62;
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a + (i % 3) * 0.31);
      position.set(Math.sin(a) * radius, 9.5 * size, Math.cos(a) * radius);
      scale.set(size * (0.9 + (i % 4) * 0.08), size, size);
      matrix.compose(position, quaternion, scale);
      peaks.setMatrixAt(i, matrix);
      position.y = 19.7 * size;
      scale.set(size, size, size);
      matrix.compose(position, quaternion, scale);
      caps.setMatrixAt(i, matrix);
    }
    peaks.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    group.add(peaks, caps);
  }

  private addPavilions(group: THREE.Group, count: number, radius: number): void {
    const bodyGeo = this.track(new THREE.BoxGeometry(9, 2.6, 3.6));
    const roofGeo = this.track(new THREE.ConeGeometry(5.4, 1.8, 4));
    const glassGeo = this.track(new THREE.BoxGeometry(7.4, 0.8, 0.08));
    const bodyMat = this.environmentStandardMat(
      `environment:${this.sport}:pavilion-body-material`,
      this.environment.venueStructure,
      { roughness: 0.82, metalness: 0.04, flatShading: true },
    );
    const roofMat = this.environmentStandardMat(
      `environment:${this.sport}:pavilion-roof-material`,
      this.environment.venueAccent,
      { roughness: 0.68, metalness: 0.06, flatShading: true },
    );
    const glassMat = this.environmentBasicMat(
      `environment:${this.sport}:pavilion-glass-material`,
      themed(0x8ed4e5, 0x173a4d),
      { transparent: true, opacity: 0.75, depthWrite: false },
    );
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.34;
      const pavilion = new THREE.Group();
      pavilion.name = `environment:${this.sport}:pavilion`;
      pavilion.position.set(Math.sin(a) * radius, 0, Math.cos(a) * radius);
      pavilion.rotation.y = a;
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 1.45;
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.y = 3.45;
      roof.rotation.y = Math.PI / 4;
      roof.scale.z = 0.52;
      const glass = new THREE.Mesh(glassGeo, glassMat);
      glass.position.set(0, 1.8, -1.84);
      pavilion.add(body, roof, glass);
      group.add(pavilion);
    }
  }

  private addFloodlights(group: THREE.Group, count: number, radius: number): void {
    const poleGeo = this.track(new THREE.CylinderGeometry(0.1, 0.15, 8, 8));
    const panelGeo = this.track(new THREE.BoxGeometry(2.2, 0.7, 0.22));
    const poleMat = this.environmentStandardMat(
      `environment:${this.sport}:floodlight-pole-material`,
      this.environment.venueStructure,
      { roughness: 0.48, metalness: 0.55 },
    );
    const panelMat = this.environmentBasicMat(
      `environment:${this.sport}:floodlight-panel-material`,
      themed(0xfff4d0, 0xffd89c),
      { fog: true },
    );
    const poles = this.trackInstanced(new THREE.InstancedMesh(poleGeo, poleMat, count));
    const panels = this.trackInstanced(new THREE.InstancedMesh(panelGeo, panelMat, count));
    poles.name = `environment:${this.sport}:floodlight-poles`;
    panels.name = `environment:${this.sport}:floodlight-panels`;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      position.set(Math.sin(a) * radius, 4, Math.cos(a) * radius);
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      matrix.compose(position, quaternion, scale);
      poles.setMatrixAt(i, matrix);
      position.y = 8.15;
      matrix.compose(position, quaternion, scale);
      panels.setMatrixAt(i, matrix);
    }
    poles.instanceMatrix.needsUpdate = true;
    panels.instanceMatrix.needsUpdate = true;
    group.add(poles, panels);
  }

  private addArenaPanels(group: THREE.Group, count: number, radius: number): void {
    const panelGeo = this.track(new THREE.BoxGeometry(5.1, 1.45, 0.16));
    const ribGeo = this.track(new THREE.BoxGeometry(0.13, 4.4, 0.22));
    const panelMat = this.mat(
      new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true, vertexColors: false }),
    );
    panelMat.name = "environment:bike:wall-panel-material";
    const ribMat = this.environmentBasicMat(
      "environment:bike:wall-rib-material",
      themed(0x647181, 0x384458),
      { fog: true },
    );
    const panels = this.trackInstanced(new THREE.InstancedMesh(panelGeo, panelMat, count));
    const ribs = this.trackInstanced(new THREE.InstancedMesh(ribGeo, ribMat, count));
    panels.name = "environment:bike:wall-panels";
    ribs.name = "environment:bike:wall-ribs";
    const panelColors = [
      new THREE.Color(0x3c5074),
      new THREE.Color(0x5a3e68),
      new THREE.Color(0x32616a),
    ];
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const position = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      quaternion.setFromAxisAngle(up, a);
      position.set(Math.sin(a) * radius, 2.15, Math.cos(a) * radius);
      matrix.compose(position, quaternion, scale);
      panels.setMatrixAt(i, matrix);
      panels.setColorAt(i, panelColors[i % panelColors.length]);
      position.y = 2.2;
      matrix.compose(position, quaternion, scale);
      ribs.setMatrixAt(i, matrix);
    }
    panels.instanceMatrix.needsUpdate = true;
    if (panels.instanceColor) panels.instanceColor.needsUpdate = true;
    ribs.instanceMatrix.needsUpdate = true;
    group.add(panels, ribs);
  }

  private buildEnvironment(innerR: number, outerR: number): void {
    this.buildSky();
    this.environmentMidGroup.name = `environment:${this.sport}:midground`;
    this.environmentDetailGroup.name = `environment:${this.sport}:detail`;
    this.scene.add(this.environmentMidGroup, this.environmentDetailGroup);

    const farHeight = this.sport === "skierg" ? 18 : this.sport === "bike" ? 11 : 5.5;
    const farVariation = this.sport === "skierg" ? 9 : this.sport === "bike" ? 3 : 2.4;
    const midHeight = this.sport === "skierg" ? 8 : this.sport === "bike" ? 7 : 4.2;
    const midVariation = this.sport === "skierg" ? 5.5 : this.sport === "bike" ? 2 : 1.8;
    this.environmentMidGroup.add(
      this.makeHorizonRing(
        `environment:${this.sport}:horizon-far`,
        116,
        -2.5,
        farHeight,
        farVariation,
        72,
        this.environment.farSilhouette,
        0.7,
      ),
      this.makeHorizonRing(
        `environment:${this.sport}:horizon-mid`,
        84,
        -1.4,
        midHeight,
        midVariation,
        64,
        this.environment.midSilhouette,
        2.1,
      ),
    );

    const infieldMat = this.environmentStandardMat(
      `environment:${this.sport}:infield-material`,
      this.environment.infield,
      {
        roughness: this.sport === "rower" ? 0.42 : 0.9,
        metalness: this.sport === "rower" ? 0.1 : 0.01,
      },
    );
    const infield = new THREE.Mesh(
      this.track(new THREE.CircleGeometry(innerR - 0.8, this.cfg.laneSegments)),
      infieldMat,
    );
    infield.name = `environment:${this.sport}:infield`;
    infield.rotation.x = -Math.PI / 2;
    infield.position.y = -0.015;
    infield.receiveShadow = this.cfg.shadows;
    this.scene.add(infield);

    const apronMat = this.environmentStandardMat(
      `environment:${this.sport}:apron-material`,
      this.environment.apron,
      {
        roughness: this.sport === "rower" ? 0.45 : 0.9,
        metalness: this.sport === "rower" ? 0.08 : 0.01,
      },
    );
    const apron = new THREE.Mesh(
      this.track(new THREE.RingGeometry(outerR + 0.2, 55, this.cfg.laneSegments)),
      apronMat,
    );
    apron.name = `environment:${this.sport}:apron`;
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.005;
    apron.receiveShadow = this.cfg.shadows;
    this.scene.add(apron);

    if (this.sport === "rower") {
      this.addInstancedPines(
        this.environmentMidGroup,
        24 + this.cfg.environmentDetail * 14,
        66,
        79,
      );
      this.addPavilions(this.environmentDetailGroup, 4, 62);
    } else if (this.sport === "skierg") {
      this.addAlpinePeaks(this.environmentMidGroup, 14 + this.cfg.environmentDetail * 3);
      const snowbankMat = this.environmentStandardMat(
        "environment:skierg:snowbank-material",
        this.environment.apron,
        { roughness: 0.98, metalness: 0, flatShading: true },
      );
      const snowbank = new THREE.Mesh(
        this.track(new THREE.TorusGeometry(outerR + 2.1, 1.1, 6, this.cfg.laneSegments)),
        snowbankMat,
      );
      snowbank.name = "environment:skierg:snowbank";
      snowbank.rotation.x = Math.PI / 2;
      snowbank.position.y = 0.25;
      snowbank.receiveShadow = this.cfg.shadows;
      this.environmentMidGroup.add(snowbank);
      this.addInstancedPines(
        this.environmentMidGroup,
        32 + this.cfg.environmentDetail * 18,
        56,
        76,
      );
      this.addFloodlights(this.environmentDetailGroup, 8 + this.cfg.environmentDetail * 2, 48);
      if (this.cfg.environmentDetail >= 1) this.addPavilions(this.environmentDetailGroup, 3, 59);
    } else {
      const wallMat = this.environmentBasicMat(
        "environment:bike:arena-wall-material",
        this.environment.venueStructure,
        { side: THREE.BackSide, fog: true },
      );
      const arenaWall = new THREE.Mesh(
        this.track(new THREE.CylinderGeometry(52, 52, 5, 72, 1, true)),
        wallMat,
      );
      arenaWall.name = "environment:bike:arena-wall";
      arenaWall.position.y = 2.15;
      this.environmentMidGroup.add(arenaWall);
      this.addArenaPanels(this.environmentMidGroup, 28 + this.cfg.environmentDetail * 4, 51.75);
      const canopyMat = this.environmentStandardMat(
        "environment:bike:canopy-material",
        this.environment.venueAccent,
        { roughness: 0.52, metalness: 0.34 },
      );
      const canopy = new THREE.Mesh(
        this.track(new THREE.TorusGeometry(51.5, 0.85, 8, 96)),
        canopyMat,
      );
      canopy.name = "environment:bike:canopy";
      canopy.rotation.x = Math.PI / 2;
      canopy.position.y = 5.25;
      this.environmentMidGroup.add(canopy);
      const ledMat = this.environmentBasicMat(
        "environment:bike:led-band-material",
        this.environment.venueAccent,
        { fog: true },
      );
      for (const y of [0.95, 4.05]) {
        const led = new THREE.Mesh(this.track(new THREE.TorusGeometry(51, 0.075, 4, 112)), ledMat);
        led.name = "environment:bike:led-band";
        led.rotation.x = Math.PI / 2;
        led.position.y = y;
        this.environmentMidGroup.add(led);
      }
      const tierMat = this.environmentBasicMat(
        "environment:bike:stands-material",
        this.environment.midSilhouette,
      );
      for (const [radius, y] of [
        [45.5, 0.8],
        [47, 1.65],
        [48.5, 2.55],
      ] as const) {
        const tier = new THREE.Mesh(
          this.track(new THREE.TorusGeometry(radius, 0.48, 5, 96)),
          tierMat,
        );
        tier.name = "environment:bike:stands-tier";
        tier.rotation.x = Math.PI / 2;
        tier.position.y = y;
        this.environmentMidGroup.add(tier);
      }
      this.addFloodlights(this.environmentDetailGroup, 10 + this.cfg.environmentDetail * 2, 46);
      if (this.cfg.environmentDetail >= 1) this.addPavilions(this.environmentDetailGroup, 4, 58);
    }
  }

  private buildContactShadows(): void {
    const geometry = this.track(new THREE.CircleGeometry(1, 28));
    const liveMaterial = this.mat(
      new THREE.MeshBasicMaterial({
        color: this.sport === "rower" ? 0x071f2a : 0x101820,
        transparent: true,
        opacity: this.sport === "rower" ? 0.18 : 0.25,
        depthWrite: false,
      }),
    );
    const ghostMaterial = this.mat(liveMaterial.clone());
    ghostMaterial.opacity *= 0.48;
    this.liveContactShadow = new THREE.Mesh(geometry, liveMaterial);
    this.ghostContactShadow = new THREE.Mesh(geometry, ghostMaterial);
    this.liveContactShadow.name = "athlete:live:contact-shadow";
    this.ghostContactShadow.name = "athlete:ghost:contact-shadow";
    const shadowScale =
      this.sport === "rower"
        ? new THREE.Vector3(1.9, 0.52, 1)
        : this.sport === "bike"
          ? new THREE.Vector3(1.2, 0.42, 1)
          : new THREE.Vector3(0.72, 0.42, 1);
    for (const shadow of [this.liveContactShadow, this.ghostContactShadow]) {
      // Yaw the flat ellipse around world-up before pitching its CircleGeometry
      // into the ground plane. Default XYZ order would turn the long axis
      // vertical at quarter laps when rotation.y reaches 90 degrees.
      shadow.rotation.order = "YXZ";
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.08;
      shadow.scale.copy(shadowScale);
      shadow.renderOrder = 1;
    }
    this.ghostContactShadow.visible = false;
    this.scene.add(this.liveContactShadow, this.ghostContactShadow);
  }

  private buildStaticScene(): void {
    const innerR = this.ghostRadius - 4;
    const outerR = this.loopRadius + 4;
    const seg = this.profile.waves ? this.cfg.groundSegments : 1;
    // The terrain extends behind the authored horizon/fog so its edge can
    // never reveal the alpha canvas. Rowing uses a clear-coated opaque water
    // body; snow and asphalt stay deliberately rough and grounded.
    const groundGeo = this.track(new THREE.PlaneGeometry(260, 260, seg, seg));
    const groundMat = this.mat(
      this.profile.waves
        ? new THREE.MeshPhysicalMaterial({
            color: this.profile.groundColor("light"),
            transparent: false,
            opacity: 1,
            roughness: 0.24,
            metalness: 0.04,
            clearcoat: 0.92,
            clearcoatRoughness: 0.18,
            emissive: 0x08232a,
            emissiveIntensity: 0.34,
          })
        : new THREE.MeshStandardMaterial({
            color: this.profile.groundColor("light"),
            transparent: false,
            opacity: 1,
            roughness: this.sport === "skierg" ? 0.96 : 0.86,
            metalness: 0.02,
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

    this.buildEnvironment(innerR, outerR);

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

    // Only the regatta basin carries buoy strings. Ski/Bike previously shared
    // this generic sphere field, which read as hundreds of black rocks. The
    // former universal upright distance posts are gone too: their foreground
    // silhouettes could eclipse the athlete, while each sport already carries
    // authored low-profile course marks and a start/finish checker.
    if (this.sport === "rower" && this.cfg.buoys) {
      const buoyGeo = this.track(new THREE.SphereGeometry(0.085, 8, 5));
      this.buoyMat = this.mat(
        new THREE.MeshStandardMaterial({ color: hex(COLORS_LIGHT.markerCap), roughness: 0.6 }),
      );
      const rings = Array.from({ length: this.cfg.buoyRings }, (_, i) => {
        const t = this.cfg.buoyRings === 1 ? 0.5 : i / (this.cfg.buoyRings - 1);
        return this.ghostRadius - 2.5 + (this.loopRadius + 5 - this.ghostRadius) * t;
      });
      const perRing = this.cfg.buoysPerRing;
      const inst = new THREE.InstancedMesh(buoyGeo, this.buoyMat, rings.length * perRing);
      inst.name = "environment:rower:buoy-strings";
      const m = new THREE.Matrix4();
      const warm = new THREE.Color(0xf6c453);
      const pale = new THREE.Color(0xf4fbff);
      let bi = 0;
      for (const r of rings) {
        for (let k = 0; k < perRing; k++) {
          const a = (k / perRing) * Math.PI * 2;
          m.makeScale(1, 0.56, 1);
          m.setPosition(r * Math.sin(a), 0.045, r * Math.cos(a));
          inst.setMatrixAt(bi++, m);
          inst.setColorAt(bi - 1, k % 12 === 0 ? warm : pale);
        }
      }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
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

    this.buildContactShadows();
  }

  private applyTheme(themeName: "light" | "dark"): void {
    const C = themeName === "dark" ? COLORS_DARK : COLORS_LIGHT;
    this.theme = themeName;
    // Text is not the only input to the telemetry sprites: both the pill
    // background and its live/ghost accent come from the active theme. Force
    // the next render to repaint them even when pace/progress did not change
    // (the common paused-theme-toggle case).
    this.lastLiveLabel = "";
    this.lastGhostLabel = "";
    // The sky dome is the visible background; this colour is a defensive
    // fallback for context restore / the one frame before the dome is ready.
    this.scene.background = new THREE.Color(this.environment.skyHorizon(themeName));
    this.scene.fog = new THREE.Fog(
      this.environment.fog(themeName),
      this.environment.fogNear,
      this.environment.fogFar,
    );
    this.updateSkyColors(themeName);
    this.hemisphereLight.color.setHex(this.environment.hemisphereSky(themeName));
    this.hemisphereLight.groundColor.setHex(this.environment.hemisphereGround(themeName));
    this.sunLight.color.setHex(this.environment.sun(themeName));
    this.worldFill.color.setHex(this.environment.fill(themeName));
    this.renderer.toneMappingExposure =
      this.environment.exposure * (themeName === "dark" ? 0.91 : 1);

    for (const themed of this.courseThemeMats) {
      const color = themed.color(themeName);
      themed.material.color.setHex(color);
      if (this.profile.waves && themed.material.name === "lane") {
        themed.material.emissive.setHex(color).multiplyScalar(themeName === "dark" ? 0.16 : 0.05);
        themed.material.emissiveIntensity = 0.5;
      }
    }
    for (const themed of this.environmentThemeMats) {
      themed.material.color.setHex(themed.color(themeName));
    }
    if (this.groundMesh.material instanceof THREE.MeshStandardMaterial) {
      this.groundMesh.material.color.setHex(this.profile.groundColor(themeName));
      if (this.profile.waves) {
        this.groundMesh.material.emissive
          .setHex(this.profile.groundColor(themeName))
          .multiplyScalar(themeName === "dark" ? 0.2 : 0.08);
      }
    }

    this.cellMatDark.color.setHex(hex(C.finishDark));
    this.cellMatLight.color.setHex(hex(C.finishLight));
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
        o.material.emissive.setHex(c);
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
   * Map governor levels to concrete savings. Optional venue dressing leaves
   * first, then dynamic shadows, then surface/particle animation. The sky,
   * horizon, course, finish infrastructure, athletes and contact cues remain.
   */
  private applyPerfLevel(): void {
    if (this.governor.level >= 1) {
      this.environmentDetailGroup.visible = false;
      this.resize(this.w, this.h);
    }
    if (this.governor.level >= 2 && this.renderer.shadowMap) {
      this.renderer.shadowMap.enabled = false;
    }
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
    output: AvatarPlacement,
  ): AvatarPlacement {
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
    output.x = x;
    output.z = z;
    output.tx = tx;
    output.tz = tz;
    output.y = bob;
    return output;
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
      this.livePlacement,
    );

    this.liveContactShadow.position.set(p.x, 0.08, p.z);
    // The ellipse's local X axis is its long axis; rotate that axis onto the
    // course tangent so the grounding cue follows the hull/skis/bike instead
    // of turning sideways at quarter laps.
    this.liveContactShadow.rotation.y = Math.atan2(p.tx, p.tz) - Math.PI / 2;
    // Keep the expensive high-tier shadow map concentrated around the live
    // athlete instead of spending texels across the entire 70 m arena.
    this.sunLight.position.set(p.x + 18, 30, p.z + 12);
    this.sunLight.target.position.set(p.x, 0.45, p.z);
    this.sunLight.target.updateMatrixWorld();

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
        this.ghostPlacement,
      );
      this.ghostContactShadow.visible = true;
      this.ghostContactShadow.position.set(gp.x, 0.079, gp.z);
      this.ghostContactShadow.rotation.y = Math.atan2(gp.tx, gp.tz) - Math.PI / 2;
      this.advanceWake(this.ghostWake, dGhost, gp.x - gp.tx * 1.6, gp.z - gp.tz * 1.6);
      const ghostText = `${state.ghost.label || "PB"} · ${Math.round(state.ghost.distFrac * 100)}%`;
      if (ghostText !== this.lastGhostLabel && this.ghostLabel && this.ghostLabelTex) {
        updateTextSprite(this.ghostLabel, this.ghostLabelTex, ghostText, C.labelBg, C.ghost);
        this.lastGhostLabel = ghostText;
      }
      this.ghostLabel.position.set(gp.x, 2.2 + gp.y, gp.z);
    } else {
      this.ghostGroup.visible = false;
      this.ghostContactShadow.visible = false;
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
      this.fovCurrent = BASE_CAMERA_FOV;
    } else {
      if (dt > 0 && dLive >= 0 && dLive < dt * 120) {
        const inst = dLive > 0 ? Math.min(dLive / dt, 40) : 0;
        this.smoothedSpeed += (inst - this.smoothedSpeed) * dampFactor(3, dt);
      }
      const fovTarget =
        BASE_CAMERA_FOV +
        Math.max(0, Math.min(1, (this.smoothedSpeed - 3) / 6)) * SPEED_CAMERA_FOV_GAIN;
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
    // keeps the static three-quarter composition while disabling FOV breathing
    // and secondary chase easing, keeping the athlete locked in frame.
    const narrow = this.camera.aspect < 1.25;
    const sportRig = CAMERA_RIGS[this.sport];
    const ghostPullback = state.ghost ? 1.05 : 0;
    // Portrait RowErg needs substantially more room for the full oar span;
    // upright SkiErg and compact BikeErg can stay closer.
    const narrowScale =
      this.sport === "rower" ? (state.ghost ? 1.7 : 1.5) : state.ghost ? 1.38 : 1.2;
    const baseBack = this.reduceMotion
      ? sportRig.back + 0.8 + ghostPullback
      : (sportRig.back + ghostPullback) * (narrow ? narrowScale : 1);
    const ahead = sportRig.ahead;
    // A static lateral offset is not an animation trigger. Preserving it keeps
    // paired limbs and equipment from collapsing into a direct-rear silhouette.
    const lateral = sportRig.lateral;
    // A comparison occupies the inner lane, four metres inside the live
    // athlete and may also be hundreds of metres ahead or behind. Frame the
    // actual midpoint, orient the chase to the average tangent, and derive the
    // pullback from the current horizontal lens. This treats the comparison as
    // a bounded pair instead of assuming a small lane-only offset. Scalars keep
    // this render-hot path allocation-free.
    const focusX = state.ghost ? (p.x + this.ghostPlacement.x) * 0.5 : p.x;
    const focusZ = state.ghost ? (p.z + this.ghostPlacement.z) * 0.5 : p.z;
    const comparisonSpan = state.ghost
      ? Math.hypot(p.x - this.ghostPlacement.x, p.z - this.ghostPlacement.z)
      : 0;
    const verticalHalfFov = THREE.MathUtils.degToRad(this.camera.fov * 0.5);
    const horizontalHalfFov = Math.atan(
      Math.tan(verticalHalfFov) * Math.max(0.01, this.camera.aspect),
    );
    // Preserve a little screen-space air around the pair (and the RowErg oar
    // envelope). Unlike a fixed cap, this remains valid all the way to the
    // largest possible 500 m chord on the one-kilometre visual loop.
    const comparisonMargin = this.sport === "rower" ? 1.6 : 1.1;
    const requiredComparisonBack = state.ghost
      ? (comparisonSpan * 0.5 + comparisonMargin) /
        Math.max(0.05, Math.tan(horizontalHalfFov) * 0.9)
      : baseBack;
    const comparisonPullback = Math.max(0, requiredComparisonBack - baseBack);
    const back = baseBack + comparisonPullback;
    const baseHeight = this.reduceMotion
      ? sportRig.height + 0.7
      : sportRig.height + (narrow ? 0.3 : 0);
    const height = baseHeight + Math.min(2.5, comparisonSpan * 0.16);
    // A small live-lane bias keeps the vector non-zero when the two course
    // tangents cancel at half a lap. Adding it before normalization makes the
    // heading continuous as the gap crosses that point; a binary fallback
    // would introduce a visible quarter-turn camera orbit near 500 m.
    const comparisonTangentBias = state.ghost ? 0.22 : 0;
    const tangentX = state.ghost
      ? p.tx + this.ghostPlacement.tx + p.tx * comparisonTangentBias
      : p.tx;
    const tangentZ = state.ghost
      ? p.tz + this.ghostPlacement.tz + p.tz * comparisonTangentBias
      : p.tz;
    const tangentLength = Math.hypot(tangentX, tangentZ);
    const focusTx = tangentX / Math.max(1e-6, tangentLength);
    const focusTz = tangentZ / Math.max(1e-6, tangentLength);
    const focusRadius = Math.max(1e-6, Math.hypot(focusX, focusZ));
    const rx = focusX / focusRadius;
    const rz = focusZ / focusRadius;
    const cameraLayoutMode = (narrow ? 1 : 0) | (state.ghost ? 2 : 0) | (this.reduceMotion ? 4 : 0);
    const cameraLayoutChanged = cameraLayoutMode !== this.cameraLayoutMode;
    this.cameraLayoutMode = cameraLayoutMode;
    this.chase.set(
      focusX - focusTx * back + rx * lateral,
      height,
      focusZ - focusTz * back + rz * lateral,
    );
    this.lookAt.set(focusX + focusTx * ahead, sportRig.aimY, focusZ + focusTz * ahead);
    if (!this.cameraInit) {
      this.camera.position.copy(this.chase);
      this.cameraAim.copy(this.lookAt);
      this.cameraInit = true;
    } else if (playing && this.reduceMotion) {
      // Tracking the athlete is essential on a loop, but reduced motion should
      // not add camera lag or spring-like easing on top. An exact relative rig
      // keeps the athlete stable while the required course translation remains.
      this.camera.position.copy(this.chase);
      this.cameraAim.copy(this.lookAt);
    } else if (playing) {
      // Exponential damping is frame-rate independent. Aim is deliberately
      // softer than translation so course curvature cannot snap the horizon.
      const speedFollow = Math.min(18, this.smoothedSpeed * 0.55);
      const positionRate = 8 + speedFollow;
      const aimRate = 6 + speedFollow * 0.65;
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
    for (const mesh of this.instancedMeshes) mesh.dispose();
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
