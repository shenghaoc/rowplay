import * as THREE from "three";
import type { ReplayRenderer, RenderState } from "./renderer";
import { COLORS_DARK, COLORS_LIGHT, REDUCED_REPLAY_POSES } from "./renderer";
import type { RenderQuality } from "./replayRenderer";
import { catchTransitions, fallbackStrokePose, type StrokePose } from "./strokeModel";
import { solveSkierKinematics, type SkierKinematics } from "./sportKinematics";
import {
  createBikeMotionGraphScratch,
  createRowerMotionGraphScratch,
  sampleBikeMotionGraphInto,
  sampleRowerMotionGraphInto,
  type BikeMotionGraph,
} from "./motionGraph";
import type { Sport } from "../types";
import { fmtPace } from "../format";
import { METERS_PER_CYCLE, ParticlePool, PerfGovernor, clampDt, dampFactor } from "./motion";
import { solveTwoBone3D, type FigurePoint3 } from "./figurePose";
import {
  applyReplayAssetLibrary,
  hideWithReplayAssets,
  setReplayAssetSlot,
  setReplayAssetTemplateAnchor,
  type ReplayAssetLibrary,
  type ReplayAssetMaterialResolver,
  type ReplayAssetMaterialRole,
} from "./renderer3dAssets";
import { tryCreateReplayV4AthleteInstance, type ReplayV4AssetTemplate } from "./renderer3dV4Assets";
import {
  installReplayV4MotionController,
  type ReplayV4MotionController,
} from "./renderer3dV4Motion";

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
  /** Procedural athlete body resolution: limb rings, caps, and hands. */
  bodySegments: number;
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
    bodySegments: 10,
  },
  medium: {
    dprCap: 2,
    antialias: true,
    laneSegments: 80,
    groundSegments: 20,
    displacement: true,
    shadows: false,
    shadowMapSize: 0,
    wake: 20,
    buoys: true,
    buoysPerRing: 40,
    buoyRings: 3,
    spray: true,
    sprayParticles: 64,
    sprayPerCatch: 7,
    environmentDetail: 1,
    bodySegments: 14,
  },
  high: {
    dprCap: 2,
    antialias: true,
    laneSegments: 112,
    groundSegments: 32,
    displacement: true,
    shadows: true,
    shadowMapSize: 1024,
    wake: 32,
    buoys: true,
    buoysPerRing: 52,
    buoyRings: 3,
    spray: true,
    sprayParticles: 80,
    sprayPerCatch: 8,
    environmentDetail: 2,
    bodySegments: 18,
  },
  ultra: {
    dprCap: 3,
    antialias: true,
    laneSegments: 160,
    groundSegments: 64,
    displacement: true,
    shadows: true,
    shadowMapSize: 2048,
    wake: 52,
    buoys: true,
    buoysPerRing: 72,
    buoyRings: 3,
    spray: true,
    sprayParticles: 112,
    sprayPerCatch: 10,
    environmentDetail: 3,
    bodySegments: 24,
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
  assets?: ReplayAssetLibrary | null;
  v4Assets?: ReplayV4AssetTemplate | null;
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
 * One athlete + sport machine for a lane. `group` is placed on the lap
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
  /** Maps V3's neutral geometry roles to this live/ghost rig's materials. */
  assetMaterialResolver: ReplayAssetMaterialResolver;
  /**
   * Contact-safe procedural landmarks retained as the authoritative target
   * rig when a skinned V4 athlete is installed over the visible body.
   */
  v4Targets: AvatarV4Targets;
  /** Optional visible skinned hero; the procedural rig remains its contact oracle. */
  v4Motion?: ReplayV4MotionController | null;
  /** Lets SkiErg keep its pole-sphere solve inside the installed skin's reach. */
  setV4ArmReach?(reach: number): void;
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

interface AvatarV4Targets {
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

type ReplayAssetMaterialPalette = Readonly<Record<ReplayAssetMaterialRole, THREE.Material>>;

function makeAssetMaterialResolver(
  palette: ReplayAssetMaterialPalette,
): ReplayAssetMaterialResolver {
  return (role) => palette[role];
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
  make(accent: number, castShadow: boolean, opacity: number, bodySegments: number): Avatar;
}

interface CameraRig {
  readonly back: number;
  readonly height: number;
  readonly ahead: number;
  readonly lateral: number;
  readonly aimY: number;
}

const CAMERA_RIGS: Record<Sport, CameraRig> = {
  // A deliberate rear-three-quarter line reveals the hand/equipment contacts,
  // elbow silhouette and the bicycle frame instead of flattening the athlete
  // into a rear-facing toy. The pullback logic below still owns narrow and
  // comparison framing, so this is a static composition choice, not an orbit.
  // Subject-first framing: RowErg needs its broad scull envelope, but the
  // former distant/high line made the athlete too small for the additional
  // anatomical detail to register. This stays wide enough for the grips and
  // blades while lowering the horizon and putting the seated body in the
  // composition's visual centre.
  rower: { back: 3.65, height: 2.02, ahead: 0.72, lateral: 2.25, aimY: 0.92 },
  skierg: { back: 3.15, height: 2.3, ahead: 0.9, lateral: 1.86, aimY: 1.14 },
  bike: { back: 3.12, height: 1.96, ahead: 0.58, lateral: 1.92, aimY: 0.92 },
};

const BASE_CAMERA_FOV = 42;
const SPEED_CAMERA_FOV_GAIN = 2;

/**
 * The directional key is an art-directed world vector, not a camera light.
 * Keep this single source of truth for the light, its shadow camera, and the
 * visible sun disc so the lighting direction always reads coherently.
 */
const SUN_OFFSETS: Record<Sport, readonly [number, number, number]> = {
  rower: [-22, 18, 14],
  skierg: [16, 28, 10],
  bike: [10, 14, -16],
};

/**
 * Compact per-sport orthographic envelopes give the moving athlete enough
 * clearance for its equipment without wasting a high-tier map on the arena.
 * They are centered on the athlete after light-space texel snapping.
 */
const SHADOW_FRAMES: Record<
  Sport,
  Readonly<{ left: number; right: number; bottom: number; top: number; near: number; far: number }>
> = {
  // A scull needs room for both blades at full reach; the other rigs can be
  // tighter, which keeps the penumbra clean at High as well as Ultra.
  rower: { left: -7, right: 7, bottom: -5, top: 7, near: 1, far: 48 },
  skierg: { left: -5.5, right: 5.5, bottom: -5, top: 6, near: 1, far: 46 },
  bike: { left: -5, right: 5, bottom: -4.5, top: 5.5, near: 1, far: 40 },
};

const SHADOW_TARGET_HEIGHT = 0.55;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

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

interface EnvironmentSector {
  /** World-space course angle, using +Z as zero and increasing with travel. */
  readonly start: number;
  readonly span: number;
  /** Relative placement density inside this sector. */
  readonly weight?: number;
}

interface EnvironmentPlacement {
  readonly angle: number;
  readonly radius: number;
  readonly name: string;
  readonly scale?: readonly [number, number, number];
}

interface HorizonComposition {
  readonly offsetX: number;
  readonly offsetZ: number;
  readonly floor: number;
  readonly lobes: readonly {
    readonly center: number;
    readonly halfSpan: number;
    readonly height: number;
  }[];
}

const FULL_CIRCLE = Math.PI * 2;
const degrees = (value: number): number => (value * Math.PI) / 180;

const ROW_PINE_SECTORS: readonly EnvironmentSector[] = [
  { start: degrees(-25), span: degrees(95), weight: 1.15 },
  { start: degrees(185), span: degrees(70), weight: 0.9 },
];
const SKI_PINE_SECTORS: readonly EnvironmentSector[] = [
  { start: degrees(-170), span: degrees(55), weight: 0.95 },
  { start: degrees(105), span: degrees(65), weight: 1.1 },
  { start: degrees(25), span: degrees(25), weight: 0.7 },
];
const SKI_PEAK_SECTORS: readonly EnvironmentSector[] = [
  { start: degrees(-150), span: degrees(65), weight: 1.1 },
  { start: degrees(35), span: degrees(60), weight: 1 },
];
const SKI_BERM_SECTORS: readonly EnvironmentSector[] = [
  { start: degrees(38), span: degrees(112), weight: 1 },
  { start: degrees(195), span: degrees(125), weight: 1.05 },
];
const BIKE_STAND_SECTORS: readonly EnvironmentSector[] = [
  { start: degrees(55), span: degrees(85), weight: 1.2 },
  { start: degrees(220), span: degrees(60), weight: 0.85 },
];

const ROW_LANDMARKS: readonly EnvironmentPlacement[] = [
  {
    angle: degrees(17),
    radius: 62,
    name: "environment:rower:regatta-pavilion",
    scale: [1.12, 1.08, 1],
  },
  {
    angle: degrees(32),
    radius: 65,
    name: "environment:rower:boathouse",
    scale: [0.82, 0.88, 0.9],
  },
  {
    angle: degrees(43),
    radius: 61,
    name: "environment:rower:timing-tower",
    scale: [0.6, 1.58, 0.68],
  },
];

const SKI_LANDMARKS: readonly EnvironmentPlacement[] = [
  {
    angle: degrees(4),
    radius: 59,
    name: "environment:skierg:timing-lodge",
    scale: [1.05, 1.12, 1],
  },
  {
    angle: degrees(150),
    radius: 62,
    name: "environment:skierg:wax-hut",
    scale: [0.68, 0.76, 0.74],
  },
];

const BIKE_SERVICE_BUILDING: EnvironmentPlacement = {
  angle: degrees(250),
  radius: 60,
  name: "environment:bike:service-building",
  scale: [0.82, 0.82, 1.05],
};
const BIKE_SCOREBOARD: EnvironmentPlacement = {
  angle: degrees(96),
  radius: 58,
  name: "environment:bike:scoreboard",
};

const SKI_FLOODLIGHTS: readonly EnvironmentPlacement[] = [
  -24, -9, 12, 28, 154, 174, 196, 216, -34, 38, 144, 226, 3, 186,
].map((angle, index) => ({
  angle: degrees(angle),
  radius: index < 4 ? 53 : index < 8 ? 55 : 56,
  name: `environment:skierg:floodlight-${index + 1}`,
}));

const BIKE_FLOODLIGHTS: readonly EnvironmentPlacement[] = [
  48, 72, 118, 142, 218, 282, 58, 130, 232, 270, 82, 108, 246, 258, 64, 124,
].map((angle, index) => ({
  angle: degrees(angle),
  radius: index < 6 ? 57 : 58.5,
  name: `environment:bike:floodlight-${index + 1}`,
}));

const HORIZON_COMPOSITIONS: Record<Sport, HorizonComposition> = {
  rower: {
    offsetX: -12,
    offsetZ: 8,
    floor: 0.34,
    lobes: [
      { center: degrees(22), halfSpan: degrees(72), height: 0.72 },
      { center: degrees(220), halfSpan: degrees(60), height: 0.58 },
    ],
  },
  skierg: {
    offsetX: 10,
    offsetZ: -15,
    floor: 0.2,
    lobes: [
      { center: degrees(-118), halfSpan: degrees(52), height: 0.92 },
      { center: degrees(65), halfSpan: degrees(49), height: 0.86 },
    ],
  },
  bike: {
    offsetX: -8,
    offsetZ: -10,
    floor: 0.48,
    lobes: [
      { center: degrees(98), halfSpan: degrees(68), height: 0.58 },
      { center: degrees(250), halfSpan: degrees(50), height: 0.42 },
    ],
  },
};

function angularDistance(a: number, b: number): number {
  const wrapped = (((a - b + Math.PI) % FULL_CIRCLE) + FULL_CIRCLE) % FULL_CIRCLE;
  return Math.abs(wrapped - Math.PI);
}

function sectorSample(
  index: number,
  count: number,
  sectors: readonly EnvironmentSector[],
): { angle: number; sector: number; local: number } {
  const total = sectors.reduce((sum, sector) => sum + sector.span * (sector.weight ?? 1), 0);
  let cursor = ((index + 0.5) / Math.max(1, count)) * total;
  for (let sectorIndex = 0; sectorIndex < sectors.length; sectorIndex++) {
    const sector = sectors[sectorIndex];
    const weightedSpan = sector.span * (sector.weight ?? 1);
    if (cursor <= weightedSpan || sectorIndex === sectors.length - 1) {
      const local = clamp01(cursor / weightedSpan);
      return { angle: sector.start + sector.span * local, sector: sectorIndex, local };
    }
    cursor -= weightedSpan;
  }
  return { angle: sectors[0]?.start ?? 0, sector: 0, local: 0 };
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
    // Golden-hour regatta: warm horizon (locked by test), cool zenith, soft fog.
    skyZenith: themed(0x3a7190, 0x0a1f30),
    skyHorizon: themed(0xf0c98e, 0x466d79),
    skyNadir: themed(0x1f5464, 0x081f2a),
    fog: themed(0xb0ccc8, 0x24404b),
    fogNear: 70,
    fogFar: 195,
    hemisphereSky: themed(0xffecd0, 0x7ba5b2),
    hemisphereGround: themed(0x2d5852, 0x132d31),
    hemisphereIntensity: 1.28,
    sun: themed(0xffe4ad, 0xffc978),
    sunIntensity: 2.35,
    fill: themed(0xa8dfea, 0x4b8090),
    fillIntensity: 0.62,
    exposure: 1.1,
    farSilhouette: themed(0x2f5244, 0x0e2a2c),
    midSilhouette: themed(0x244f3a, 0x154033),
    venueStructure: themed(0xede7d8, 0x6f7f83),
    venueAccent: themed(0xd07a42, 0xe0a05d),
    infield: themed(0x185668, 0x143f4c),
    apron: themed(0x247384, 0x1c5462),
  },
  skierg: {
    // Clear alpine morning: high-key snow, cool fill, crisp mountain air.
    skyZenith: themed(0x4a8ab5, 0x0e2136),
    skyHorizon: themed(0xeef6fb, 0x6e8799),
    skyNadir: themed(0xc5dae6, 0x2a4354),
    fog: themed(0xdce9ee, 0x78909c),
    fogNear: 68,
    fogFar: 190,
    hemisphereSky: themed(0xf2f9ff, 0x9db7c9),
    hemisphereGround: themed(0xb0c2cc, 0x3e5664),
    hemisphereIntensity: 1.35,
    sun: themed(0xfff4db, 0xe8f4ff),
    sunIntensity: 2.1,
    fill: themed(0xc4e5ff, 0x759db8),
    fillIntensity: 0.72,
    exposure: 1.08,
    farSilhouette: themed(0xa8c0ce, 0x4c6575),
    midSilhouette: themed(0x6e90a2, 0x294958),
    venueStructure: themed(0x2c4656, 0x172e3b),
    venueAccent: themed(0xe04852, 0xff6670),
    infield: themed(0xeaf2f6, 0xb4c5cd),
    apron: themed(0xf7fafb, 0xd5e0e5),
  },
  bike: {
    // Dusk velodrome: violet zenith, warm horizon glow, practical floodlights.
    skyZenith: themed(0x1a2848, 0x0e1628),
    skyHorizon: themed(0xd27a57, 0x874e58),
    skyNadir: themed(0x383544, 0x101622),
    fog: themed(0x5c5562, 0x1e2230),
    fogNear: 62,
    fogFar: 175,
    hemisphereSky: themed(0xb8cbe2, 0x5a6f8a),
    hemisphereGround: themed(0x352c2a, 0x12161e),
    hemisphereIntensity: 1.08,
    sun: themed(0xffa866, 0xff8a62),
    sunIntensity: 2.05,
    fill: themed(0x96b8ea, 0x4d6796),
    fillIntensity: 0.68,
    exposure: 1.12,
    farSilhouette: themed(0x2c3644, 0x0e131c),
    midSilhouette: themed(0x303948, 0x1f2634),
    venueStructure: themed(0x323e4e, 0x1c2432),
    venueAccent: themed(0xf4a45a, 0xffb46b),
    infield: themed(0x1a302e, 0x101e1c),
    apron: themed(0x423e3c, 0x282d35),
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

// Semantic body values stay independent of lane accents so live purple and
// ghost cyan never collapse skin, kit, or footwear into one value family.
const HUMAN_SKIN = 0xe8b48c;
const HUMAN_HAIR = 0x3d322c;
const HUMAN_KIT = 0x5e7386;
const HUMAN_KIT_DARK = 0x1f2b36;
const HUMAN_SHOE = 0xdde6ea;
const HUMAN_SNOW_SHOE = 0x1f2b36;

function humanMat(color: number, roughness = 0.62, metalness = 0): THREE.MeshStandardMaterial {
  // Athlete shells are deliberately smooth-shaded. The authored rig carries
  // controlled anatomical planes in its normals; forcing every material flat
  // made even the higher-detail rider read like a blocky game figurine.
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function makeSkinMaterial(color: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.34,
    metalness: 0.02,
    sheen: 0.16,
    sheenColor: new THREE.Color(0xffddcc),
    sheenRoughness: 0.62,
  });
}

function makeHairMaterial(color: number): THREE.MeshStandardMaterial {
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
function accentMaterial(accent: number): THREE.MeshPhysicalMaterial {
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

/** Painted composite equipment carries a restrained clearcoat, never fabric. */
function accentEquipmentMaterial(accent: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: accent,
    roughness: 0.34,
    metalness: 0.08,
    clearcoat: 0.32,
    clearcoatRoughness: 0.26,
    emissive: accent,
    emissiveIntensity: 0.008,
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

function trapezoidPanel(
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

function jointCap(radius: number, material: THREE.Material, segments = 8): THREE.Mesh {
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
function elbowCap(radius: number, material: THREE.Material, segments = 8): THREE.Mesh {
  const elbow = jointCap(radius, material, segments);
  elbow.userData.hideWithReplayAssets = false;
  return setReplayAssetSlot(elbow, "athlete:elbow");
}

function capsulePart(
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

/**
 * Build one shared-vertex radial surface from an authored vertical profile.
 *
 * `LatheGeometry` gives every mountain the same circular contour, which can
 * still read as a large low-poly cone even at a high segment count.  This
 * variation is baked into the geometry, needs no texture or shader feature,
 * and remains safe for both WebGL and WebGPU.  Adjacent rings share vertices
 * so the normal field stays continuous instead of exposing triangle bands.
 */
function organicRadialSurfaceGeometry(
  profile: readonly THREE.Vector2[],
  radialSegments: number,
  phase: number,
  name: string,
  irregularity = 1,
): THREE.BufferGeometry {
  const ringCount = profile.length;
  const maxRadius = Math.max(0.001, ...profile.map((point) => point.x));
  const positions = new Float32Array((ringCount * radialSegments + 2) * 3);
  const indices: number[] = [];
  let cursor = 0;

  for (let ring = 0; ring < ringCount; ring++) {
    const point = profile[ring];
    if (!point) continue;
    const radiusWeight = point.x / maxRadius;
    for (let segment = 0; segment < radialSegments; segment++) {
      const angle = (segment / radialSegments) * Math.PI * 2;
      // Three long-frequency lobes establish asymmetric shoulders; smaller
      // frequencies break the repetitive "lathed" highlight without becoming
      // noisy enough to sparkle when the camera moves around the course.
      const radialNoise =
        Math.sin(angle * 3 + phase) * 0.082 +
        Math.sin(angle * 7 - phase * 1.7 + ring * 0.31) * 0.037 +
        Math.sin(angle * 11 + ring * 0.67) * 0.015;
      const radius = Math.max(
        0.012,
        point.x * (1 + radialNoise * irregularity * (0.3 + radiusWeight * 0.7)),
      );
      const verticalNoise =
        (Math.sin(angle * 2 + phase * 0.73) * 0.105 +
          Math.sin(angle * 5 - phase + ring * 0.41) * 0.045) *
        radiusWeight *
        irregularity;
      positions[cursor++] = Math.cos(angle) * radius;
      positions[cursor++] = point.y + verticalNoise;
      positions[cursor++] = Math.sin(angle) * radius;
    }
  }

  for (let ring = 0; ring < ringCount - 1; ring++) {
    for (let segment = 0; segment < radialSegments; segment++) {
      const next = (segment + 1) % radialSegments;
      const a = ring * radialSegments + segment;
      const b = ring * radialSegments + next;
      const c = (ring + 1) * radialSegments + segment;
      const d = (ring + 1) * radialSegments + next;
      indices.push(a, c, b, b, c, d);
    }
  }

  // Cap the tiny first/last rings.  They remain almost point-like in the
  // silhouette, but closed geometry prevents sky leaks through a near peak.
  const bottomCenter = ringCount * radialSegments;
  const topCenter = bottomCenter + 1;
  const bottom = profile[0];
  const top = profile.at(-1);
  positions.set([0, bottom?.y ?? 0, 0], bottomCenter * 3);
  positions.set([0, top?.y ?? 0, 0], topCenter * 3);
  const topRing = (ringCount - 1) * radialSegments;
  for (let segment = 0; segment < radialSegments; segment++) {
    const next = (segment + 1) % radialSegments;
    indices.push(bottomCenter, next, segment);
    indices.push(topCenter, topRing + segment, topRing + next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = name;
  geometry.userData.organicRadialSurface = true;
  return geometry;
}

/**
 * A single tapered evergreen volume with varied bough tiers and a real needle
 * tip.  Keeping the crown inside this shared contour avoids the old floating
 * sphere that made the distant forest read as a row of green balls.
 */
function sculptedPineGeometry(): THREE.BufferGeometry {
  return organicRadialSurfaceGeometry(
    [
      new THREE.Vector2(0.035, -2.12),
      new THREE.Vector2(0.3, -2.06),
      new THREE.Vector2(0.78, -1.84),
      new THREE.Vector2(1.13, -1.55),
      new THREE.Vector2(0.99, -1.28),
      new THREE.Vector2(1.3, -0.94),
      new THREE.Vector2(1.08, -0.62),
      new THREE.Vector2(1.16, -0.28),
      new THREE.Vector2(0.9, 0.04),
      new THREE.Vector2(0.96, 0.35),
      new THREE.Vector2(0.72, 0.71),
      new THREE.Vector2(0.56, 1.08),
      new THREE.Vector2(0.39, 1.46),
      new THREE.Vector2(0.23, 1.78),
      new THREE.Vector2(0.11, 2.06),
      new THREE.Vector2(0.018, 2.34),
    ],
    40,
    0.91,
    "environment:evergreen-canopy",
    0.82,
  );
}

/** A broad, asymmetric alpine massif rather than a rotational volcano. */
function alpinePeakGeometry(): THREE.BufferGeometry {
  return organicRadialSurfaceGeometry(
    [
      new THREE.Vector2(0.025, -10),
      new THREE.Vector2(3.3, -9.96),
      new THREE.Vector2(5.85, -9.72),
      new THREE.Vector2(7.6, -9.28),
      new THREE.Vector2(7.52, -8.22),
      new THREE.Vector2(7.25, -6.72),
      new THREE.Vector2(6.88, -5.18),
      new THREE.Vector2(6.4, -3.82),
      new THREE.Vector2(5.88, -2.42),
      new THREE.Vector2(5.35, -1.12),
      new THREE.Vector2(4.86, 0.18),
      new THREE.Vector2(4.4, 1.52),
      new THREE.Vector2(3.72, 2.92),
      new THREE.Vector2(3.05, 4.32),
      new THREE.Vector2(2.3, 5.76),
      new THREE.Vector2(1.52, 7.26),
      new THREE.Vector2(0.9, 8.4),
      new THREE.Vector2(0.48, 9.16),
      new THREE.Vector2(0.018, 10),
    ],
    64,
    0.43,
    "environment:alpine-massif",
    1,
  );
}

/** Snow mantle follows the massif's uneven shoulders instead of a smooth cone. */
function alpineSnowcapGeometry(): THREE.BufferGeometry {
  return organicRadialSurfaceGeometry(
    [
      new THREE.Vector2(3.72, 3.56),
      new THREE.Vector2(3.28, 4.16),
      new THREE.Vector2(2.92, 4.9),
      new THREE.Vector2(2.57, 5.68),
      new THREE.Vector2(2.2, 6.5),
      new THREE.Vector2(1.8, 7.28),
      new THREE.Vector2(1.15, 8.35),
      new THREE.Vector2(0.6, 9.17),
      new THREE.Vector2(0.018, 10.08),
    ],
    64,
    0.43,
    "environment:alpine-snow-mantle",
    0.92,
  );
}

/** Low, elongated foreground terrain adds a parallax layer beneath the massif. */
function alpineFoothillGeometry(): THREE.BufferGeometry {
  return organicRadialSurfaceGeometry(
    [
      new THREE.Vector2(0.025, -2.5),
      new THREE.Vector2(0.96, -2.4),
      new THREE.Vector2(2.08, -2.05),
      new THREE.Vector2(2.86, -1.48),
      new THREE.Vector2(3.14, -0.72),
      new THREE.Vector2(2.9, 0.14),
      new THREE.Vector2(2.34, 1.02),
      new THREE.Vector2(1.64, 1.86),
      new THREE.Vector2(0.92, 2.68),
      new THREE.Vector2(0.36, 3.36),
      new THREE.Vector2(0.018, 3.72),
    ],
    48,
    1.37,
    "environment:alpine-foothill",
    0.88,
  );
}

/**
 * A beveled architectural panel used for close-enough venue forms.  This keeps
 * a pavilion, light bank, or scoreboard from exposing hard CG cube corners in
 * the same large pixels as the athlete.
 */
function roundedVenueBlockGeometry(
  width: number,
  height: number,
  depth: number,
  corner = Math.min(width, height) * 0.12,
): THREE.ExtrudeGeometry {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const radius = Math.min(corner, halfWidth * 0.45, halfHeight * 0.45);
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth + radius, -halfHeight);
  shape.lineTo(halfWidth - radius, -halfHeight);
  shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + radius);
  shape.lineTo(halfWidth, halfHeight - radius);
  shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - radius, halfHeight);
  shape.lineTo(-halfWidth + radius, halfHeight);
  shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - radius);
  shape.lineTo(-halfWidth, -halfHeight + radius);
  shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + radius, -halfHeight);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    curveSegments: 10,
    bevelEnabled: true,
    bevelThickness: Math.min(depth * 0.2, radius * 0.45),
    bevelSize: Math.min(depth * 0.16, radius * 0.38),
    bevelSegments: 3,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
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
const ELBOW_AXIS = new THREE.Vector3();
const ELBOW_INSIDE = new THREE.Vector3();
const ELBOW_SIDE = new THREE.Vector3();
const ELBOW_FRAME = new THREE.Matrix4();

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

function placeFigureSegmentBetween(
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
function orientElbowCuff(
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
function taperedLimb(
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
function makeHand(material: THREE.Material, side = 1, segments = 14): THREE.Group {
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
function makeFoot(material: THREE.Material): THREE.Group {
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
function makeHead(skinMat: THREE.Material, hairMat: THREE.Material, segments = 16): THREE.Group {
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

/**
 * Low-poly single scull: long thin hull (capsule), a seated rower, and two oars
 * with blades. The hull, deck and oar blades carry `userData.accent`; the rower
 * slides + leans and the oars sweep/feather per stroke.
 */
function makeRowerAvatar(
  accent: number,
  castShadow: boolean,
  opacity = 1,
  bodySegments = 16,
): Avatar {
  const segs = bodySegments;
  const capSegs = Math.max(10, Math.round(segs * 0.82));
  const headSegs = Math.max(14, segs + 2);
  const eqCylSegs = Math.max(12, Math.round(segs * 0.7));
  const eqTorSegs = Math.max(10, Math.round(segs * 0.6));
  const group = new THREE.Group();
  // Each avatar owns its sampled graph so live and ghost athletes never share
  // mutable frame state. This keeps the motion path allocation-free in 3D.
  const rowMotionGraph = createRowerMotionGraphScratch();
  const laneMaterial = accentEquipmentMaterial(accent);
  const jerseyMaterial = accentMaterial(accent);
  const accentMat = () => laneMaterial;
  const skinMaterial = makeSkinMaterial(HUMAN_SKIN);
  const hairMaterial = makeHairMaterial(HUMAN_HAIR);
  const kitMaterial = humanMat(HUMAN_KIT, 0.58);
  const kitDarkMaterial = humanMat(HUMAN_KIT_DARK, 0.64);
  const shoeMaterial = humanMat(HUMAN_SHOE, 0.46);
  const equipmentLightMaterial = humanMat(0xf1f5f9, 0.42, 0.12);
  const equipmentMetalMaterial = humanMat(0x8a9097, 0.38, 0.58);
  const equipmentGripMaterial = humanMat(0x26343d, 0.56, 0.04);
  const resolveAssetMaterial = makeAssetMaterialResolver({
    "athlete-skin": skinMaterial,
    "athlete-fabric": jerseyMaterial,
    "athlete-hair": hairMaterial,
    "athlete-footwear": shoeMaterial,
    "equipment-painted": laneMaterial,
    "equipment-dark": kitDarkMaterial,
    "equipment-light": equipmentLightMaterial,
    "equipment-metal": equipmentMetalMaterial,
    "equipment-rubber": equipmentGripMaterial,
    "equipment-grip": equipmentGripMaterial,
    "equipment-trim": kitMaterial,
  });
  const hull = setReplayAssetSlot(
    new THREE.Mesh(
      new THREE.CapsuleGeometry(0.34, 3.15, eqCylSegs, Math.round(eqCylSegs * 1.4)),
      accentMat(),
    ),
    "equipment:row:hull",
  );
  hull.rotation.x = Math.PI / 2; // capsule axis Y -> Z (travel)
  hull.scale.set(0.52, 0.44, 1); // narrow + low profile, still readable
  hull.position.y = 0.16;
  hull.userData.accent = true;
  group.add(hull);

  // Deck with a bright racing stripe — the art-direction hull signature.
  const deck = new THREE.Mesh(roundedVenueBlockGeometry(0.16, 0.055, 2.75, 0.025), accentMat());
  deck.position.y = 0.3;
  deck.userData.accent = true;
  group.add(deck);
  const stripe = new THREE.Mesh(
    roundedVenueBlockGeometry(0.055, 0.018, 2.35, 0.01),
    equipmentLightMaterial,
  );
  stripe.name = "rower-deck-stripe";
  stripe.position.y = 0.338;
  group.add(stripe);
  const gunwale = new THREE.Mesh(
    roundedVenueBlockGeometry(0.02, 0.04, 2.5, 0.009),
    equipmentLightMaterial,
  );
  gunwale.name = "rower-gunwale-left";
  gunwale.position.set(-0.1, 0.32, 0);
  group.add(gunwale);
  const gunwaleR = gunwale.clone();
  gunwaleR.name = "rower-gunwale-right";
  gunwaleR.position.x = 0.1;
  group.add(gunwaleR);

  const footPlate = new THREE.Mesh(
    roundedVenueBlockGeometry(0.48, 0.05, 0.12, 0.022),
    kitDarkMaterial,
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
  // V3 keeps the entire scull as one designed assembly while the existing
  // footplate contact nodes remain parented to the rig and authoritative.
  const boatVisual = new THREE.Group();
  boatVisual.name = "rower-boat-visual";
  group.add(boatVisual);
  setReplayAssetTemplateAnchor(boatVisual, "equipment:row:boat-assembly", {
    fallback: [hull, deck, stripe, gunwale, gunwaleR, footPlate],
  });

  // Rower in its own group so slide, layback, legs and arms all move from the
  // recorded stroke pose rather than as one rigid toy block.
  const rower = new THREE.Group();
  rower.name = "rower-athlete";
  const seat = new THREE.Mesh(roundedVenueBlockGeometry(0.34, 0.055, 0.29, 0.045), shoeMaterial);
  seat.name = "rower-seat";
  seat.position.set(0, 0.29, -0.14);
  const hips = ellipsoid([0.18, 0.125, 0.16], kitDarkMaterial, segs);
  setReplayAssetSlot(hips, "athlete:pelvis");
  hips.name = "rower-hips";
  hips.position.set(0, 0.38, -0.14);

  // Pelvis-pivoted spine: torso, shoulders, neck and head now swing as one
  // articulated chain instead of being translated as disconnected pieces.
  const torso = new THREE.Group();
  torso.name = "rower-torso";
  torso.position.copy(hips.position);
  const torsoShell = accentPart(shapedTorso(0.29, 0.64, 0.175, jerseyMaterial, segs));
  setReplayAssetSlot(torsoShell, "athlete:torso");
  torsoShell.name = "rower-torso-shell";
  torsoShell.position.y = 0.3;
  const frontYoke = hideWithReplayAssets(trapezoidPanel(0.48, 0.34, 0.16, 0.032, kitDarkMaterial));
  frontYoke.name = "rower-jersey-front";
  frontYoke.position.set(0, 0.5, 0.168);
  const backYoke = hideWithReplayAssets(trapezoidPanel(0.48, 0.34, 0.16, 0.032, kitDarkMaterial));
  backYoke.name = "rower-jersey-back";
  backYoke.position.set(0, 0.5, -0.168);
  const shoulderLine = hideWithReplayAssets(capsulePart(0.062, 0.56, kitDarkMaterial, "x"));
  shoulderLine.name = "rower-shoulder-trim";
  shoulderLine.position.set(0, 0.53, 0.01);
  const neck = capsulePart(0.053, 0.11, skinMaterial, "y");
  setReplayAssetSlot(neck, "athlete:neck");
  neck.position.set(0, 0.67, 0.015);
  const headGroup = makeHead(skinMaterial, hairMaterial, headSegs);
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
    const thigh = taperedLimb(0.08, 0.058, kitMaterial, segs);
    setReplayAssetSlot(thigh, "athlete:thigh");
    thigh.name = side < 0 ? "rower-thigh-left" : "rower-thigh-right";
    const shin = taperedLimb(0.058, 0.042, kitMaterial, segs);
    setReplayAssetSlot(shin, "athlete:shin");
    shin.name = side < 0 ? "rower-shin-left" : "rower-shin-right";
    const foot = makeFoot(shoeMaterial);
    foot.name = side < 0 ? "rower-foot-contact-left" : "rower-foot-contact-right";
    const knee = jointCap(0.075, skinMaterial, capSegs);
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

    const upperArm = taperedLimb(0.064, 0.047, skinMaterial, segs);
    setReplayAssetSlot(upperArm, "athlete:upper-arm");
    upperArm.name = side < 0 ? "rower-upper-arm-left" : "rower-upper-arm-right";
    const forearm = taperedLimb(0.05, 0.036, skinMaterial, segs);
    setReplayAssetSlot(forearm, "athlete:forearm");
    forearm.name = side < 0 ? "rower-forearm-left" : "rower-forearm-right";
    const hand = makeHand(skinMaterial, side, capSegs);
    hand.name = side < 0 ? "rower-hand-left" : "rower-hand-right";
    const shoulder = jointCap(0.07, kitMaterial, capSegs);
    shoulder.userData.hideWithReplayAssets = false;
    setReplayAssetSlot(shoulder, "athlete:shoulder");
    shoulder.name = side < 0 ? "rower-shoulder-left" : "rower-shoulder-right";
    const elbow = elbowCap(0.055, skinMaterial, capSegs);
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
      new THREE.CylinderGeometry(0.032, 0.038, 3.15, eqCylSegs),
      equipmentLightMaterial,
    );
    shaft.rotation.z = Math.PI / 2; // cylinder axis Y -> X
    shaft.position.x = side * 0.7;
    oar.add(shaft);
    const grip = capsulePart(0.045, 0.28, equipmentGripMaterial, "x");
    grip.name = side < 0 ? "rower-handle-left" : "rower-handle-right";
    // Keep each grip on its own side of centre. The previous ~0.5 m inboard
    // lever put left/right handles across the midline so the arms visually
    // crossed through the catch and recovery.
    grip.position.x = -side * 0.34;
    oar.add(grip);
    const handleAnchor = new THREE.Object3D();
    handleAnchor.name = side < 0 ? "rower-hand-contact-left" : "rower-hand-contact-right";
    handleAnchor.position.x = -side * 0.38;
    oar.add(handleAnchor);
    // Oar collar — a small ring near the blade end for visual detail.
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.05, 0.015, eqTorSegs, eqCylSegs),
      equipmentMetalMaterial,
    );
    collar.name = "rower-oar-collar";
    collar.position.set(side * 1.95, 0, 0);
    collar.rotation.y = Math.PI / 2;
    oar.add(collar);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.022, 0.3), accentMat());
    setReplayAssetSlot(blade, "equipment:row:blade");
    blade.name = side < 0 ? "rower-blade-left" : "rower-blade-right";
    blade.position.set(side * 2.36, -0.06, 0);
    blade.userData.accent = true;
    oar.add(blade);
    // The authored oar has one canonical +X outboard direction. Mirror the
    // left visual only; the solver still owns this parent group's sweep/depth
    // and the separate blade continues to feather per stroke.
    const oarVisual = new THREE.Group();
    oarVisual.name = side < 0 ? "rower-oar-visual-left" : "rower-oar-visual-right";
    if (side < 0) oarVisual.rotation.y = Math.PI;
    oar.add(oarVisual);
    setReplayAssetTemplateAnchor(oarVisual, "equipment:row:oar-rig", {
      fallback: [shaft, grip, collar],
    });
    // Rigger pin sits outside the hull; blade depth is animated continuously.
    // Inboard grips stay on their own lateral half so a scull stroke never
    // reads as crossed arms, while the pin station keeps palms clear of the
    // pelvis shell at the catch.
    oar.position.set(side * 0.52, 0.34, 0.095);
    oar.userData.side = side;
    group.add(oar);
    oars.push({ side, group: oar, blade, handleAnchor });
  }

  // Authored visual ranges. Channels from the solver are 0..1; these scales
  // turn them into a stroke that reads at a glance without leaving the hull.
  // Seat start is biased forward so travel can grow without pulling the hips
  // past the fixed footplate reach of the thigh+shin chain (~1.10 m).
  const SEAT_TRAVEL = 0.5;
  const SEAT_CATCH_Z = 0.26;
  const THIGH_LENGTH = 0.552;
  const SHIN_LENGTH = 0.552;
  const UPPER_ARM_LENGTH = 0.445;
  const FOREARM_LENGTH = 0.44;
  const BODY_PITCH_CATCH = -0.56;
  const BODY_PITCH_FINISH = 0.3;
  const PELVIS_PITCH_CATCH = -0.07;
  const PELVIS_PITCH_FINISH = 0.105;
  // At the catch the handles are clearly in front of the rib cage; through
  // the drive they travel back to the body. The old sign convention swept the
  // inboard grips through the torso, making every pull look physically wrong.
  const OAR_YAW_CATCH = 0.33;
  const OAR_YAW_SPAN = -0.78;
  const BLADE_DIP = 0.14;

  const handlePoint = new THREE.Vector3();
  const placeArms = (
    bodySwing: number,
    armDraw: number,
    shoulderSet: number,
    handleTravel: number,
  ): void => {
    // The shoulders lead the late draw but never detach from the torso. A
    // small catch protraction shortens the reach to a long handle; the finish
    // reverses it into a relaxed scapular set rather than folding the hands
    // through the jersey.
    const shoulderSpread = 0.25 + shoulderSet * 0.014;
    const shoulderHeight = 0.5 + (1 - shoulderSet) * 0.006 - shoulderSet * 0.008;
    const shoulderReach = 0.015 + (1 - handleTravel) * 0.028 - shoulderSet * 0.018;
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i];
      if (!arm) continue;
      arm.shoulderPoint
        .set(arm.side * shoulderSpread, shoulderHeight, shoulderReach)
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
      // Keep the elbow plane attached to the torso as the rower pivots. The
      // cue lifts and widens the elbow only as the shoulder completes its
      // follow-through: a long catch stays soft, while the finish reads as a
      // compact lateral draw instead of a dropped, inside-out forearm.
      arm.bendHint
        .set(
          arm.side * (0.72 + shoulderSet * 0.2 + armDraw * 0.06),
          -0.02 + shoulderSet * 0.14,
          -0.02 + bodySwing * 0.05,
        )
        .applyQuaternion(torso.quaternion);
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
      orientElbowCuff(arm.elbow, arm.shoulderPoint, arm.elbowPoint, arm.handPoint, arm.side);
      arm.hand.position.copy(arm.handPoint);
      // Grip orientation follows the oar exactly, with only a small local
      // pronation about its axis. This keeps the palm planted on the handle
      // while allowing the wrist to join the outward elbow finish.
      arm.hand.quaternion.copy(oar.group.quaternion);
      arm.hand.rotateX(arm.side * (0.04 + shoulderSet * 0.1 - handleTravel * 0.025));
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

  const placeUpperBody = (
    bodySwing: number,
    shoulderSet: number,
    handleTravel: number,
    headBob: number,
  ): void => {
    // Rotate and translate only the upper-body pieces around the hips. Rotating
    // the whole rower group would also rotate the contact-locked feet and hands.
    // The pelvis, spine, clavicles, and head read from the same graph, so the
    // final arm draw no longer makes a rigid torso appear to leave its rider.
    const pitch = BODY_PITCH_CATCH + bodySwing * (BODY_PITCH_FINISH - BODY_PITCH_CATCH);
    const pelvisPitch =
      PELVIS_PITCH_CATCH +
      bodySwing * (PELVIS_PITCH_FINISH - PELVIS_PITCH_CATCH) +
      (shoulderSet - bodySwing) * 0.025;
    hips.rotation.x = pelvisPitch;
    // A restrained rearward settle gives the spine a living handoff at the
    // finish while increasing, rather than reducing, the jersey/handle margin.
    torso.position.set(
      0,
      hips.position.y + shoulderSet * 0.008,
      hips.position.z - shoulderSet * 0.014,
    );
    torso.rotation.x = pitch + (shoulderSet - bodySwing) * 0.025;
    shoulderLine.position.set(0, 0.53 - shoulderSet * 0.008, 0.01 - shoulderSet * 0.014);
    shoulderLine.rotation.x = shoulderSet * 0.07;
    neck.position.set(0, 0.67 - shoulderSet * 0.004, 0.015 - shoulderSet * 0.006);
    neck.rotation.x = -pitch * 0.08;
    // Counter-pitch preserves a down-course gaze through the catch and the
    // finish. `headBob` is an expressive local cue, not an invented change to
    // the athlete's recorded body position.
    headGroup.position.set(
      0,
      0.79 + headBob * 0.038 - shoulderSet * 0.004,
      0.025 + (1 - handleTravel) * 0.009 - shoulderSet * 0.008,
    );
    headGroup.rotation.x = -pitch * 0.32 - 0.02 + headBob * 0.12;
  };

  const placeOars = (handleTravel: number, bladeDepth: number, bladeFeather: number): void => {
    // The graph carries the staged leg → body → arm handle path directly.
    // Keeping the oar sweep on this cue makes the equipment and athlete reach
    // agree without reconstructing another, subtly different sequence here.
    const handleProgress = handleTravel;
    for (const oar of oars) {
      oar.group.rotation.y = oar.side * (OAR_YAW_CATCH + handleProgress * OAR_YAW_SPAN);
      // Both blade tips dip into the water together despite opposite X signs.
      oar.group.rotation.z = -oar.side * bladeDepth * BLADE_DIP;
      // The oarlock is a hull-fixed fulcrum. Moving this parent to bury the
      // blade made every drive visibly detach the shaft from its rigger; the
      // existing rotation supplies immersion while the real pivot stays put.
      oar.group.position.y = 0.34;
      // The blade squares for catch/drive, feathers flat through recovery, then
      // squares again continuously before the next catch.
      oar.blade.rotation.x = (1 - bladeFeather) * (Math.PI / 2);
    }
  };

  const animate = (phase: number, reduce: boolean, pose?: StrokePose): AvatarMotionCues => {
    const resolvedPose = reduce
      ? REDUCED_REPLAY_POSES.rower
      : (pose ?? fallbackStrokePose("rower", phase));
    const graph = sampleRowerMotionGraphInto(resolvedPose, rowMotionGraph);
    // Seat motion follows leg extension only; body swing and arm draw happen on
    // their later staged channels, eliminating the old one-cosine puppet motion.
    rower.position.z = SEAT_CATCH_Z - graph.body.pelvisTravel.value * SEAT_TRAVEL;
    rower.position.y = reduce ? 0 : graph.accents.vertical.value * 0.03;
    rower.rotation.set(0, 0, 0);
    placeUpperBody(
      graph.body.spineHinge.value,
      graph.body.shoulderSet.value,
      graph.body.handleTravel.value,
      graph.body.headBob.value,
    );
    placeOars(
      graph.body.handleTravel.value,
      graph.contacts.bladeWater.value,
      graph.contacts.bladeFeather.value,
    );
    placeLegs(graph.body.legExtension.value);
    placeArms(
      graph.body.spineHinge.value,
      graph.body.armDraw.value,
      graph.body.shoulderSet.value,
      graph.body.handleTravel.value,
    );
    return reduce
      ? STATIC_AVATAR_MOTION
      : { vertical: graph.accents.vertical.value, surge: graph.accents.surge.value };
  };

  const [leftArm, rightArm] = arms;
  const [leftLeg, rightLeg] = legs;
  if (!leftArm || !rightArm || !leftLeg || !rightLeg) {
    throw new Error("RowErg V4 target rig is incomplete");
  }
  finalizeAvatar(group, castShadow, opacity);
  return {
    group,
    animate,
    assetMaterialResolver: resolveAssetMaterial,
    v4Targets: {
      pelvis: hips,
      leftHand: leftArm.hand,
      rightHand: rightArm.hand,
      leftElbow: leftArm.elbow,
      rightElbow: rightArm.elbow,
      leftFoot: leftLeg.foot,
      rightFoot: rightLeg.foot,
      leftKnee: leftLeg.knee,
      rightKnee: rightLeg.knee,
    },
  };
}

/**
 * Low-poly SkiErg skier: a standing athlete on skis, double-poling. Skis, vest
 * and pole baskets carry `userData.accent`; the upper body crunches forward and
 * both poles swing fore/aft together on each pull.
 */
function makeSkierAvatar(
  accent: number,
  castShadow: boolean,
  opacity = 1,
  bodySegments = 16,
): Avatar {
  const segs = bodySegments;
  const capSegs = Math.max(10, Math.round(segs * 0.82));
  const headSegs = Math.max(14, segs + 2);
  const eqCylSegs = Math.max(12, Math.round(segs * 0.7));
  const group = new THREE.Group();
  const laneMaterial = accentEquipmentMaterial(accent);
  const jerseyMaterial = accentMaterial(accent);
  const accentMat = () => laneMaterial;
  const skinMaterial = makeSkinMaterial(HUMAN_SKIN);
  const hairMaterial = makeHairMaterial(HUMAN_HAIR);
  const kitMaterial = humanMat(HUMAN_KIT, 0.58);
  const kitDarkMaterial = humanMat(HUMAN_KIT_DARK, 0.64);
  const shoeMaterial = humanMat(HUMAN_SNOW_SHOE, 0.5);
  const poleMaterial = humanMat(0x486775, 0.58);
  const farPoleMaterial = humanMat(0x2f5362, 0.7);
  const gripMaterial = humanMat(0x20242a);
  const equipmentMetalMaterial = humanMat(0x6d8490, 0.32, 0.62);
  const resolveAssetMaterial = makeAssetMaterialResolver({
    "athlete-skin": skinMaterial,
    "athlete-fabric": jerseyMaterial,
    "athlete-hair": hairMaterial,
    "athlete-footwear": shoeMaterial,
    "equipment-painted": laneMaterial,
    "equipment-dark": kitDarkMaterial,
    "equipment-light": poleMaterial,
    "equipment-metal": equipmentMetalMaterial,
    "equipment-rubber": shoeMaterial,
    "equipment-grip": gripMaterial,
    "equipment-trim": kitMaterial,
  });
  const kinematics: SkierKinematics = {
    armPress: 0,
    hipHinge: 0,
    kneeFlex: 0,
    poleContact: 0,
    poleSweep: 0,
    rebound: 0,
    surge: 0,
  };

  // Art-direction skis: dark base with a full accent top deck so the pair
  // reads as equipment without swallowing the athlete's legs.
  for (const side of [-1, 1]) {
    const ski = new THREE.Mesh(roundedVenueBlockGeometry(0.13, 0.04, 2.05, 0.035), kitDarkMaterial);
    setReplayAssetSlot(ski, "equipment:ski:ski");
    ski.position.set(side * 0.21, 0.028, 0.16);
    group.add(ski);
    const deck = new THREE.Mesh(roundedVenueBlockGeometry(0.11, 0.018, 1.85, 0.018), accentMat());
    deck.name = "skierg-ski-deck";
    deck.position.set(side * 0.21, 0.055, 0.12);
    deck.userData.accent = true;
    group.add(deck);
    const tip = new THREE.Mesh(roundedVenueBlockGeometry(0.12, 0.035, 0.32, 0.025), accentMat());
    tip.name = "skierg-ski-tip";
    tip.position.set(side * 0.21, 0.07, 1.28);
    tip.rotation.x = -0.28;
    tip.userData.accent = true;
    group.add(tip);
    // The V3 ski is a coherent deck/binding/tip shell rooted at the same
    // planted location. Boots remain separate contact targets for the leg IK.
    const skiVisual = new THREE.Group();
    skiVisual.name = side < 0 ? "skierg-ski-visual-left" : "skierg-ski-visual-right";
    skiVisual.position.set(side * 0.21, 0, 0.16);
    group.add(skiVisual);
    setReplayAssetTemplateAnchor(skiVisual, "equipment:ski:ski-assembly", {
      fallback: [ski, deck, tip],
    });
  }

  // Planted fixed-length legs solve from the moving pelvis to the boots.  The
  // previous independently rotated capsules separated at the knee and changed
  // length through the crunch.
  const legParts: Array<{
    side: number;
    foot: THREE.Object3D;
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
    setReplayAssetSlot(boot, "athlete:shoe");
    boot.name = side < 0 ? "skierg-foot-contact-left" : "skierg-foot-contact-right";
    boot.position.set(side * 0.21, 0.12, 0.18);
    group.add(boot);

    const thigh = taperedLimb(0.08, 0.058, kitDarkMaterial, segs);
    setReplayAssetSlot(thigh, "athlete:thigh");
    thigh.name = side < 0 ? "skierg-thigh-left" : "skierg-thigh-right";
    const shin = taperedLimb(0.058, 0.042, kitMaterial, segs);
    setReplayAssetSlot(shin, "athlete:shin");
    shin.name = side < 0 ? "skierg-shin-left" : "skierg-shin-right";
    const knee = jointCap(0.074, kitDarkMaterial, capSegs);
    knee.name = side < 0 ? "skierg-knee-left" : "skierg-knee-right";
    group.add(thigh, shin, knee);
    legParts.push({
      side,
      foot: boot,
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
  const hips = ellipsoid([0.18, 0.125, 0.16], kitDarkMaterial, segs);
  setReplayAssetSlot(hips, "athlete:pelvis");
  hips.position.y = 0;
  const torso = accentPart(shapedTorso(0.3, 0.68, 0.18, jerseyMaterial, segs));
  setReplayAssetSlot(torso, "athlete:torso");
  torso.name = "skierg-torso";
  torso.position.y = 0.31;
  const frontYoke = hideWithReplayAssets(trapezoidPanel(0.5, 0.35, 0.17, 0.034, kitDarkMaterial));
  frontYoke.name = "skierg-jersey-front";
  frontYoke.position.set(0, 0.52, 0.172);
  const backYoke = hideWithReplayAssets(trapezoidPanel(0.5, 0.35, 0.17, 0.034, kitDarkMaterial));
  backYoke.name = "skierg-jersey-back";
  backYoke.position.set(0, 0.52, -0.172);
  const shoulderLine = hideWithReplayAssets(capsulePart(0.064, 0.58, kitDarkMaterial, "x"));
  shoulderLine.name = "skierg-shoulder-trim";
  shoulderLine.position.y = 0.58;
  const neck = capsulePart(0.053, 0.11, skinMaterial, "y");
  setReplayAssetSlot(neck, "athlete:neck");
  neck.position.y = 0.68;
  const headGroup = makeHead(skinMaterial, hairMaterial, headSegs);
  headGroup.position.set(0, 0.84, 0.03);
  // Nordic headband from the art direction — a small silhouette cue that
  // separates the skier from the rower without needing a new asset slot.
  const headband = new THREE.Mesh(
    new THREE.TorusGeometry(0.11, 0.018, eqCylSegs, Math.round(eqCylSegs * 1.4)),
    kitDarkMaterial,
  );
  headband.name = "skierg-headband";
  headband.rotation.x = Math.PI / 2;
  headband.position.set(0, 0.04, 0.01);
  headGroup.add(headband);
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
    const upperArm = taperedLimb(0.062, 0.046, kitMaterial, segs);
    setReplayAssetSlot(upperArm, "athlete:upper-arm");
    upperArm.name = side < 0 ? "skierg-upper-arm-left" : "skierg-upper-arm-right";
    const forearm = taperedLimb(0.048, 0.035, kitMaterial, segs);
    setReplayAssetSlot(forearm, "athlete:forearm");
    forearm.name = side < 0 ? "skierg-forearm-left" : "skierg-forearm-right";
    const hand = makeHand(kitDarkMaterial, side, capSegs);
    hand.name = side < 0 ? "skierg-hand-left" : "skierg-hand-right";
    const elbow = elbowCap(0.054, kitMaterial, capSegs);
    elbow.name = side < 0 ? "skierg-elbow-left" : "skierg-elbow-right";
    const shoulder = jointCap(0.068, kitMaterial, capSegs);
    shoulder.userData.hideWithReplayAssets = false;
    setReplayAssetSlot(shoulder, "athlete:shoulder");
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

  // Poles are solved from a ground contact to a grip, not just drawn from a
  // hand toward a guessed tip. The authored shells remain replaceable, while
  // the rigid contact/length solve stays renderer-owned.
  const poles: Array<{
    side: number;
    shaft: THREE.Mesh;
    grip: THREE.Mesh;
    basket: THREE.Mesh;
    tipAnchor: THREE.Object3D;
  }> = [];
  for (const side of [-1, 1]) {
    const shaftGeo = new THREE.CylinderGeometry(0.028, 0.028, 1, eqCylSegs);
    shaftGeo.rotateX(Math.PI / 2); // unit shaft lives on +Z for endpoint placement
    const shaft = setReplayAssetSlot(
      new THREE.Mesh(shaftGeo, side < 0 ? farPoleMaterial : poleMaterial),
      "equipment:ski:pole-shaft",
    );
    shaft.name = side < 0 ? "skierg-pole-shaft-left" : "skierg-pole-shaft-right";
    const grip = setReplayAssetSlot(
      capsulePart(0.025, 0.18, gripMaterial, "z"),
      "equipment:ski:pole-grip",
    );
    grip.name = side < 0 ? "skierg-pole-grip-left" : "skierg-pole-grip-right";
    const basket = setReplayAssetSlot(
      new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, eqCylSegs), accentMat()),
      "equipment:ski:pole-basket",
    );
    basket.name = side < 0 ? "skierg-pole-tip-left" : "skierg-pole-tip-right";
    basket.userData.accent = true;
    const tipAnchor = new THREE.Object3D();
    tipAnchor.name = side < 0 ? "skierg-pole-contact-left" : "skierg-pole-contact-right";
    upper.add(shaft, grip, basket, tipAnchor);
    poles.push({ side, shaft, grip, basket, tipAnchor });
  }

  const tipWorld = new THREE.Vector3();
  const freeTipWorld = new THREE.Vector3();
  const plantTipWorld = new THREE.Vector3();
  const desiredHandWorld = new THREE.Vector3();
  const tipLocalPoint = new THREE.Vector3();
  const groundUpLocal = new THREE.Vector3();
  const courseCenterAtPlant = new THREE.Vector3();
  const poleAxis = new THREE.Vector3();
  const poleBase = new THREE.Vector3();
  const polePerpendicular = new THREE.Vector3();
  const courseRightWorld = new THREE.Vector3();
  const courseForwardWorld = new THREE.Vector3();
  const inverseUpperWorld = new THREE.Quaternion();
  const UPPER_ARM_LENGTH = 0.36;
  const FOREARM_LENGTH = 0.34;
  let contactArmReach = UPPER_ARM_LENGTH + FOREARM_LENGTH;
  const THIGH_LENGTH = 0.4;
  const SHIN_LENGTH = 0.39;
  const POLE_LENGTH = 1.38;
  const POLE_CONTACT_Y = 0.055;
  // Match the shared technique graph's first C2 plant sample so the
  // deterministic contact anchor and pole-contact envelope start together.
  const POLE_PLANT_START = 0.005;
  // The SkiErg action is a compact double-pole press, not a deep squat. Keep
  // the pelvis high enough for the legs to read as springy, then make the
  // force come from a moderate hip hinge and a long hand path. These values
  // deliberately describe a canonical technique rather than inferring an
  // athlete's individual biomechanics from stroke telemetry.
  const SKI_STANDING_PELVIS_Y = 0.735;
  const SKI_PELVIS_KNEE_DROP = 0.11;
  const SKI_PELVIS_FORWARD_TRAVEL = 0.055;
  const SKI_RECOVERY_REBOUND_LIFT = 0.045;
  const SKI_NEUTRAL_TORSO_PITCH = 0.055;
  const SKI_TORSO_HINGE_RANGE = 0.56;
  const SKI_PELVIS_COUNTER_TILT = 0.14;
  const SKI_HEAD_GAZE_COUNTER_TILT = 0.38;
  // High catch → long double-pole press that finishes with the hands behind
  // the hips. The previous finish sat almost on the pelvis (Z ≈ -0.1) so the
  // press never read as a backward arm twist.
  const SKI_HAND_CATCH_Y = 0.88;
  const SKI_HAND_FINISH_Y = 0.34;
  const SKI_HAND_CATCH_Z = 0.64;
  const SKI_HAND_FINISH_Z = -0.58;

  let pendingPose = fallbackStrokePose("skierg", 0);
  let pendingMeters = 0;
  let pendingMotion: SkierKinematics = kinematics;

  const placeSkiLegs = (): void => {
    for (const leg of legParts) {
      // Legs are children of the avatar root while the pelvis rotates in
      // `upper`. Convert that hip attachment back into root-local space so a
      // torso crunch cannot leave the thighs detached from the pelvis.
      leg.hipPoint
        .set(leg.side * 0.12, 0, 0.02)
        .applyQuaternion(upper.quaternion)
        .add(upper.position);
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

  /**
   * Reconstruct the course-space pole plant at the catch. `StrokePose` keeps
   * this deterministic across seeking: the current stroke index/cycle and its
   * distance span identify the same ground point instead of relying on the
   * last rendered frame.
   */
  const setPlantTipWorld = (
    output: THREE.Vector3,
    side: number,
    pose: StrokePose,
    meters: number,
    outer: THREE.Object3D,
  ): void => {
    const plantCycle = pose.index + Math.min(pose.cycleFrac, pose.driveFrac * POLE_PLANT_START);
    const currentCycle = pose.index + pose.cycleFrac;
    const distanceSincePlant =
      Math.max(0, currentCycle - plantCycle) * Math.max(0, pose.strokeMeters);
    const courseTurn = (distanceSincePlant / CourseRenderer3D.LOOP_METERS) * Math.PI * 2;
    const cos = Math.cos(courseTurn);
    const sin = Math.sin(courseTurn);
    // Move the current course centre back to the deterministic catch position.
    courseCenterAtPlant.set(
      outer.position.x * cos - outer.position.z * sin,
      POLE_CONTACT_Y,
      outer.position.x * sin + outer.position.z * cos,
    );
    const yaw = outer.rotation.y - courseTurn;
    // Plant outside the ski tracks and well forward of the hips so a long
    // back-press still keeps fixed-length poles rigid against the snow.
    const localX = side * 0.6;
    const localZ = 1.38;
    output.set(
      courseCenterAtPlant.x + localX * Math.cos(yaw) + localZ * Math.sin(yaw),
      POLE_CONTACT_Y,
      courseCenterAtPlant.z - localX * Math.sin(yaw) + localZ * Math.cos(yaw),
    );
  };

  /**
   * Select a grip point that satisfies both rigid systems exactly: the pole
   * sphere around its basket and the two-bone arm reach annulus. The preferred
   * hand path steers the intersection so the athlete still reads as a strong
   * press rather than a mechanical compass.
   */
  const solvePoleGripTarget = (
    shoulder: THREE.Vector3,
    tip: THREE.Vector3,
    preferred: THREE.Vector3,
    side: number,
    output: THREE.Vector3,
  ): void => {
    const separation = poleAxis.copy(shoulder).sub(tip).length();
    const minArmReach = Math.abs(UPPER_ARM_LENGTH - FOREARM_LENGTH) + 0.004;
    const maxArmReach =
      Math.min(UPPER_ARM_LENGTH + FOREARM_LENGTH, Math.max(minArmReach + 0.008, contactArmReach)) -
      0.004;
    const rawReach = shoulder.distanceTo(preferred);
    const minReachAtTip = Math.max(minArmReach, Math.abs(POLE_LENGTH - separation) + 0.003);
    const maxReachAtTip = Math.min(maxArmReach, POLE_LENGTH + separation - 0.003);

    // The free path is already a valid pole sphere point. Preserve it exactly
    // so touch-down begins without a visible target jump.
    if (
      Math.abs(preferred.distanceTo(tip) - POLE_LENGTH) < 1e-5 &&
      rawReach >= minReachAtTip &&
      rawReach <= maxReachAtTip
    ) {
      output.copy(preferred);
      return;
    }

    if (separation < 1e-6 || minReachAtTip > maxReachAtTip) {
      // Defensive finite fallback for malformed or degenerate source poses.
      output.copy(preferred);
      return;
    }

    const reach = Math.max(minReachAtTip, Math.min(maxReachAtTip, rawReach));
    poleAxis.multiplyScalar(1 / separation); // tip -> shoulder
    const along =
      (POLE_LENGTH * POLE_LENGTH - reach * reach + separation * separation) / (2 * separation);
    const perpendicularRadius = Math.sqrt(Math.max(0, POLE_LENGTH * POLE_LENGTH - along * along));
    poleBase.copy(tip).addScaledVector(poleAxis, along);
    polePerpendicular.copy(preferred).sub(poleBase);
    polePerpendicular.addScaledVector(poleAxis, -polePerpendicular.dot(poleAxis));
    if (polePerpendicular.lengthSq() < 1e-8) {
      polePerpendicular.set(side, 0, 0);
      polePerpendicular.addScaledVector(poleAxis, -polePerpendicular.dot(poleAxis));
    }
    polePerpendicular.normalize();
    output.copy(poleBase).addScaledVector(polePerpendicular, perpendicularRadius);
  };

  const placePoleArms = (
    armPress: number,
    poleContact: number,
    poleSweep: number,
    rebound: number,
    pose: StrokePose,
    meters: number,
  ): void => {
    const outer = group.parent;
    if (!outer) return;
    upper.getWorldQuaternion(inverseUpperWorld).invert();
    groundUpLocal.set(0, 1, 0).applyQuaternion(inverseUpperWorld).normalize();
    // Recovery is authored in the course frame. Moving it along global X/Z
    // would counter-rotate the pole sweep as the skier rounds the lap.
    courseRightWorld.set(1, 0, 0).transformDirection(outer.matrixWorld);
    courseForwardWorld.set(0, 0, 1).transformDirection(outer.matrixWorld);
    // High plant reach becomes a long double-pole press: hands drive back past
    // the hips while elbows swing wide and aft. The grip solver still owns the
    // rigid pole-length contact.
    const handY = THREE.MathUtils.lerp(SKI_HAND_CATCH_Y, SKI_HAND_FINISH_Y, armPress);
    const handZ = THREE.MathUtils.lerp(SKI_HAND_CATCH_Z, SKI_HAND_FINISH_Z, armPress);
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i];
      const pole = poles[i];
      if (!arm || !pole) continue;
      // Shoulders live on the hinging upper body; refresh the local origin so
      // the press tracks torso pitch instead of a stale rest pose.
      arm.shoulderPoint.set(arm.side * 0.25, 0.54, 0.05);
      arm.handTarget.set(arm.side * (0.44 + armPress * 0.08), handY, handZ);
      // Elbow plane starts slightly below the shoulder line and rotates aft as
      // the press loads — the silhouette of a Nordic double-pole finish.
      arm.bendHint.set(
        arm.side * (0.62 + armPress * 0.16),
        -0.2 + armPress * 0.35,
        0.42 - armPress * 1.2,
      );

      // Free recovery tip: exact pole length, lifted clear of the snow, and
      // a mirrored outward sweep so neither shaft cuts through the skier.
      desiredHandWorld.copy(arm.handTarget);
      upper.localToWorld(desiredHandWorld);
      const liftedY = 0.28 + rebound * 0.16;
      const vertical = Math.max(
        -POLE_LENGTH * 0.985,
        Math.min(POLE_LENGTH * 0.985, liftedY - desiredHandWorld.y),
      );
      const horizontal = Math.sqrt(Math.max(0, POLE_LENGTH * POLE_LENGTH - vertical * vertical));
      let lateral = arm.side * (0.52 + Math.sin(poleSweep * Math.PI) * 0.14);
      let forward = 0.82 - poleSweep * 0.42;
      const horizontalDirection = Math.max(1e-6, Math.hypot(lateral, forward));
      lateral /= horizontalDirection;
      forward /= horizontalDirection;
      freeTipWorld
        .copy(desiredHandWorld)
        .addScaledVector(courseRightWorld, lateral * horizontal)
        .addScaledVector(courseForwardWorld, forward * horizontal);
      freeTipWorld.y += vertical;

      setPlantTipWorld(plantTipWorld, arm.side, pose, meters, outer);
      tipWorld.lerpVectors(freeTipWorld, plantTipWorld, poleContact);
      tipLocalPoint.copy(tipWorld);
      upper.worldToLocal(tipLocalPoint);
      solvePoleGripTarget(
        arm.shoulderPoint,
        tipLocalPoint,
        arm.handTarget,
        arm.side,
        arm.handTarget,
      );
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
      orientElbowCuff(arm.elbow, arm.shoulderPoint, arm.elbowPoint, arm.handPoint, arm.side);
      arm.hand.position.copy(arm.handPoint);

      placeFigureSegmentBetween(pole.shaft, arm.handPoint, tipLocalPoint);
      pole.grip.position.copy(arm.handPoint);
      pole.grip.quaternion.copy(pole.shaft.quaternion);
      // The basket stays level with the snow while the shaft follows the arm.
      // Its actual carbide point is the separate, exact contact anchor below.
      pole.basket.position.copy(tipLocalPoint).addScaledVector(groundUpLocal, 0.026);
      pole.basket.quaternion.copy(inverseUpperWorld);
      pole.tipAnchor.position.copy(tipLocalPoint);
      arm.hand.quaternion.copy(pole.grip.quaternion);
    }
  };

  const animate = (
    phase: number,
    reduce: boolean,
    pose?: StrokePose,
    meters = 0,
  ): AvatarMotionCues => {
    const resolvedPose = reduce
      ? REDUCED_REPLAY_POSES.skierg
      : (pose ?? fallbackStrokePose("skierg", phase));
    const motion = solveSkierKinematics(resolvedPose, kinematics);
    pendingPose = resolvedPose;
    pendingMeters = meters;
    pendingMotion = motion;
    // Carry the pelvis through a restrained spring rather than lowering the
    // whole upper body into a broken-looking crouch. The small forward travel
    // lets the fixed-length legs share the load instead of making the torso
    // compensate with an extreme rotation.
    upper.position.set(
      0,
      SKI_STANDING_PELVIS_Y -
        motion.kneeFlex * SKI_PELVIS_KNEE_DROP +
        (reduce ? 0 : motion.rebound * SKI_RECOVERY_REBOUND_LIFT),
      motion.hipHinge * SKI_PELVIS_FORWARD_TRAVEL,
    );
    // A strong double-pole is a pronounced but still athletic hip hinge
    // (~35° at full press), not the former ~55° mannequin crunch. Counterpose
    // the pelvis and head locally: the body reads as a connected spine and the
    // skier keeps their gaze down-course while all pole and hand contacts stay
    // solved from their authoritative end points.
    upper.rotation.x = SKI_NEUTRAL_TORSO_PITCH + motion.hipHinge * SKI_TORSO_HINGE_RANGE;
    hips.rotation.x = -motion.hipHinge * SKI_PELVIS_COUNTER_TILT;
    headGroup.rotation.x = -motion.hipHinge * SKI_HEAD_GAZE_COUNTER_TILT;
    placeSkiLegs();
    return reduce ? STATIC_AVATAR_MOTION : motion;
  };

  const resolveWorldContacts = (): void => {
    placePoleArms(
      pendingMotion.armPress,
      pendingMotion.poleContact,
      pendingMotion.poleSweep,
      pendingMotion.rebound,
      pendingPose,
      pendingMeters,
    );
  };

  const [leftArm, rightArm] = arms;
  const [leftLeg, rightLeg] = legParts;
  if (!leftArm || !rightArm || !leftLeg || !rightLeg) {
    throw new Error("SkiErg V4 target rig is incomplete");
  }
  finalizeAvatar(group, castShadow, opacity);
  return {
    group,
    animate,
    resolveWorldContacts,
    assetMaterialResolver: resolveAssetMaterial,
    v4Targets: {
      pelvis: hips,
      leftHand: leftArm.hand,
      rightHand: rightArm.hand,
      leftElbow: leftArm.elbow,
      rightElbow: rightArm.elbow,
      leftFoot: leftLeg.foot,
      rightFoot: rightLeg.foot,
      leftKnee: leftLeg.knee,
      rightKnee: rightLeg.knee,
    },
    setV4ArmReach(reach) {
      if (Number.isFinite(reach) && reach > 0) contactArmReach = reach;
    },
  };
}

/**
 * Low-poly BikeErg cyclist: a rider in an aero tuck on a two-wheeled frame.
 * Frame, wheel spokes and jersey carry `userData.accent`; the wheels roll, the
 * cranks turn and the rider's thighs pedal in opposition.
 */
function makeBikeAvatar(
  accent: number,
  castShadow: boolean,
  opacity = 1,
  bodySegments = 16,
): Avatar {
  const segs = bodySegments;
  const capSegs = Math.max(10, Math.round(segs * 0.82));
  const headSegs = Math.max(14, segs + 2);
  const eqCylSegs = Math.max(12, Math.round(segs * 0.7));
  const group = new THREE.Group();
  // Retained by this avatar only; sampling must not couple live and ghost rigs.
  const bikeMotionGraph = createBikeMotionGraphScratch();
  const laneMaterial = accentEquipmentMaterial(accent);
  const jerseyMaterial = accentMaterial(accent);
  const accentMat = () => laneMaterial;
  const skinMaterial = makeSkinMaterial(HUMAN_SKIN);
  const hairMaterial = makeHairMaterial(HUMAN_HAIR);
  const kitMaterial = humanMat(HUMAN_KIT, 0.58);
  const kitDarkMaterial = humanMat(HUMAN_KIT_DARK, 0.64);
  const shoeMaterial = humanMat(HUMAN_SHOE, 0.46);
  const equipmentMaterial = humanMat(0x82949d, 0.42, 0.22);
  const tyreMaterial = humanMat(0x4d5b64, 0.4, 0.08);
  const spokeMaterial = humanMat(0xc8d3da, 0.28, 0.62);
  const hubMaterial = humanMat(0x33434e, 0.36, 0.48);
  const saddleMaterial = humanMat(0xaab8c0, 0.48, 0.08);
  const pedalMaterial = humanMat(0x61737d, 0.34, 0.46);
  const resolveAssetMaterial = makeAssetMaterialResolver({
    "athlete-skin": skinMaterial,
    "athlete-fabric": jerseyMaterial,
    "athlete-hair": hairMaterial,
    "athlete-footwear": shoeMaterial,
    "equipment-painted": laneMaterial,
    "equipment-dark": hubMaterial,
    "equipment-light": equipmentMaterial,
    "equipment-metal": spokeMaterial,
    "equipment-rubber": tyreMaterial,
    "equipment-grip": equipmentMaterial,
    "equipment-trim": saddleMaterial,
  });
  const wheelR = 0.45;
  const wheels: THREE.Group[] = [];
  for (const z of [0.85, -0.85]) {
    const wheel = new THREE.Group();
    wheel.name = z > 0 ? "bike-wheel-front" : "bike-wheel-rear";
    const tyre = setReplayAssetSlot(
      new THREE.Mesh(new THREE.TorusGeometry(wheelR, 0.06, eqCylSegs, eqCylSegs * 2), tyreMaterial),
      "equipment:bike:tyre",
    );
    tyre.rotation.y = Math.PI / 2; // axle along X (perpendicular to travel)
    wheel.add(tyre);
    const wheelFallback: THREE.Object3D[] = [tyre];
    // Three paired round spokes preserve visible cadence without the two thick
    // box crosses that made the bicycle read as a toy diagram at rest.
    for (const [index, angle] of [0, Math.PI / 3, (Math.PI * 2) / 3].entries()) {
      const spoke = new THREE.Mesh(
        new THREE.CylinderGeometry(0.011, 0.011, wheelR * 1.72, eqCylSegs),
        spokeMaterial,
      );
      spoke.name = `${wheel.name}-spoke-${index}`;
      spoke.rotation.x = angle;
      wheel.add(spoke);
      wheelFallback.push(spoke);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 12), hubMaterial);
    hub.name = `${wheel.name}-hub`;
    hub.rotation.z = Math.PI / 2;
    wheel.add(hub);
    wheelFallback.push(hub);
    const wheelVisual = new THREE.Group();
    wheelVisual.name = z > 0 ? "bike-wheel-visual-front" : "bike-wheel-visual-rear";
    wheel.add(wheelVisual);
    setReplayAssetTemplateAnchor(wheelVisual, "equipment:bike:wheel-assembly", {
      fallback: wheelFallback,
    });
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
  const frameFallback: THREE.Object3D[] = [];
  const downTube = accentPart(
    tubeBetween("bike-down-tube", bottomBracket, headBottom, 0.055, accentMat()),
  );
  setReplayAssetSlot(downTube, "equipment:bike:frame-tube");
  const seatTube = accentPart(
    tubeBetween("bike-seat-tube", bottomBracket, seatCluster, 0.052, accentMat()),
  );
  setReplayAssetSlot(seatTube, "equipment:bike:frame-tube");
  const topTube = accentPart(
    tubeBetween("bike-top-tube", seatCluster, headTop, 0.048, accentMat()),
  );
  setReplayAssetSlot(topTube, "equipment:bike:frame-tube");
  const headTube = accentPart(
    tubeBetween("bike-head-tube", headBottom, headTop, 0.06, accentMat()),
  );
  setReplayAssetSlot(headTube, "equipment:bike:frame-tube");
  group.add(downTube, seatTube, topTube, headTube);
  frameFallback.push(downTube, seatTube, topTube, headTube);
  // Paired chain and seat stays expose the frame triangle from the new
  // three-quarter chase angle.
  for (const side of [-1, 1]) {
    const rearAxle = { x: side * 0.07, y: wheelR, z: -0.85 };
    const bbSide = { ...bottomBracket, x: side * 0.055 };
    const seatSide = { ...seatCluster, x: side * 0.055 };
    const chainStay = accentPart(
      tubeBetween("bike-chain-stay", rearAxle, bbSide, 0.028, accentMat()),
    );
    const seatStay = accentPart(
      tubeBetween("bike-seat-stay", rearAxle, seatSide, 0.028, accentMat()),
    );
    setReplayAssetSlot(chainStay, "equipment:bike:frame-tube");
    setReplayAssetSlot(seatStay, "equipment:bike:frame-tube");
    group.add(chainStay, seatStay);
    frameFallback.push(chainStay, seatStay);
  }

  // Cranks: spin about the bottom bracket (X axis) with two pedals.
  const cranks = new THREE.Group();
  cranks.name = "bike-cranks";
  cranks.position.set(0, wheelR, -0.05);
  // Chain ring — a toroidal disc at the bottom bracket.
  const chainRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.018, eqCylSegs, eqCylSegs * 2),
    humanMat(0x555555, 0.4),
  );
  chainRing.name = "bike-chain-ring";
  chainRing.rotation.y = Math.PI / 2;
  cranks.add(chainRing);
  const drivetrainFallback: THREE.Object3D[] = [chainRing];
  const pedals: Array<{ side: number; crankY: number }> = [];
  for (const side of [-1, 1]) {
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.1), pedalMaterial);
    setReplayAssetSlot(pedal, "equipment:bike:pedal");
    pedal.name = side < 0 ? "bike-pedal-left" : "bike-pedal-right";
    const crankY = side * 0.21;
    pedal.position.set(side * 0.1, crankY, 0);
    cranks.add(pedal);
    drivetrainFallback.push(pedal);
    pedals.push({ side, crankY });
  }
  const drivetrainVisual = new THREE.Group();
  drivetrainVisual.name = "bike-drivetrain-visual";
  cranks.add(drivetrainVisual);
  setReplayAssetTemplateAnchor(drivetrainVisual, "equipment:bike:drivetrain-assembly", {
    fallback: drivetrainFallback,
  });
  group.add(cranks);

  // The saddle closes the previously visible gap between the frame and the
  // rider's pelvis, which was especially obvious from the chase camera.
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.055, 0.3), saddleMaterial);
  setReplayAssetSlot(saddle, "equipment:bike:saddle");
  saddle.name = "bike-saddle";
  saddle.position.set(0, wheelR + 0.77, -0.4);
  group.add(saddle);
  frameFallback.push(saddle);

  const handlebar = new THREE.Group();
  handlebar.name = "bike-handlebar";
  const crossbar = capsulePart(0.03, 0.72, equipmentMaterial, "x");
  handlebar.add(crossbar);
  frameFallback.push(crossbar);
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
    frameFallback.push(grip);
    barContacts.push({ side, anchor });
  }
  handlebar.position.set(0, wheelR + 0.8, 0.35);
  group.add(handlebar);
  // The frame template leaves the explicit hand contacts in this original
  // group alone, so bar IK keeps targeting the same moving-free anchors.
  const frameVisual = new THREE.Group();
  frameVisual.name = "bike-frame-visual";
  group.add(frameVisual);
  setReplayAssetTemplateAnchor(frameVisual, "equipment:bike:frame-assembly", {
    fallback: frameFallback,
  });

  // Rider: compact human proportions in an aero lean. The jersey/helmet carry
  // the lane accent, while limbs stay skin/kit coloured so the athlete does not
  // read as a single bright toy shape.
  const rider = new THREE.Group();
  rider.position.set(0, wheelR + 0.76, -0.38);
  const pelvis = ellipsoid([0.175, 0.125, 0.16], kitDarkMaterial, segs);
  setReplayAssetSlot(pelvis, "athlete:pelvis");
  pelvis.name = "bike-pelvis";
  pelvis.position.set(0, 0.02, -0.01);
  const torso = new THREE.Group();
  torso.name = "bike-spine";
  torso.position.set(0, 0.02, 0.01);
  const torsoShell = accentPart(shapedTorso(0.28, 0.64, 0.17, jerseyMaterial, segs));
  setReplayAssetSlot(torsoShell, "athlete:torso");
  torsoShell.name = "bike-torso";
  torsoShell.position.set(0, 0.28, 0.04);
  // The shoulder girdle is a distinct, high-chest pivot rather than a visual
  // decal on the torso. Its small counter-rotation gives the rider a connected
  // pelvis → spine → shoulders rhythm while the arm solver still owns the
  // exact bar contacts.
  const shoulderGirdle = new THREE.Group();
  shoulderGirdle.name = "bike-shoulder-girdle";
  shoulderGirdle.position.set(0, 0.49, 0.025);
  const frontYoke = hideWithReplayAssets(trapezoidPanel(0.46, 0.32, 0.16, 0.032, kitDarkMaterial));
  frontYoke.name = "bike-jersey-front";
  frontYoke.position.set(0, 0, 0.137);
  const backYoke = hideWithReplayAssets(trapezoidPanel(0.46, 0.32, 0.16, 0.032, kitDarkMaterial));
  backYoke.name = "bike-jersey-back";
  backYoke.position.set(0, 0, -0.187);
  const shoulderLine = hideWithReplayAssets(capsulePart(0.06, 0.54, kitDarkMaterial, "x"));
  shoulderLine.name = "bike-shoulder-trim";
  shoulderLine.position.set(0, 0.02, 0);
  const neck = capsulePart(0.05, 0.1, skinMaterial, "y");
  setReplayAssetSlot(neck, "athlete:neck");
  neck.position.set(0, 0.11, 0.01);
  const headGroup = makeHead(skinMaterial, hairMaterial, headSegs);
  const headStabilizer = new THREE.Group();
  headStabilizer.name = "bike-head-stabilizer";
  headStabilizer.position.set(0, 0.11, 0.01);
  headGroup.position.set(0, 0.15, 0.035);
  // Parent the helmet to the head so sway and counter-rotation can never leave
  // it floating above the rider.
  const helmetGroup = new THREE.Group();
  helmetGroup.name = "bike-helmet";
  const helmetShell = accentPart(ellipsoid([0.132, 0.075, 0.135], accentMat(), segs));
  setReplayAssetSlot(helmetShell, "athlete:helmet");
  helmetShell.name = "bike-helmet-shell";
  helmetShell.position.set(0, 0.1, -0.018);
  helmetShell.rotation.x = -0.16;
  helmetGroup.add(helmetShell);
  headGroup.add(helmetGroup);
  headStabilizer.add(headGroup);
  shoulderGirdle.add(frontYoke, backYoke, shoulderLine, neck, headStabilizer);
  torso.add(torsoShell, shoulderGirdle);
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
    const thigh = taperedLimb(0.078, 0.057, kitDarkMaterial, segs);
    setReplayAssetSlot(thigh, "athlete:thigh");
    thigh.name = side < 0 ? "bike-thigh-left" : "bike-thigh-right";
    const shin = taperedLimb(0.056, 0.041, skinMaterial, segs);
    setReplayAssetSlot(shin, "athlete:shin");
    shin.name = side < 0 ? "bike-shin-left" : "bike-shin-right";
    const shoe = makeFoot(shoeMaterial);
    shoe.name = side < 0 ? "bike-foot-contact-left" : "bike-foot-contact-right";
    const knee = jointCap(0.072, kitDarkMaterial, capSegs);
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
    const upperArm = taperedLimb(0.06, 0.045, skinMaterial, segs);
    setReplayAssetSlot(upperArm, "athlete:upper-arm");
    upperArm.name = side < 0 ? "bike-upper-arm-left" : "bike-upper-arm-right";
    const forearm = taperedLimb(0.047, 0.034, skinMaterial, segs);
    setReplayAssetSlot(forearm, "athlete:forearm");
    forearm.name = side < 0 ? "bike-forearm-left" : "bike-forearm-right";
    const hand = makeHand(skinMaterial, side, capSegs);
    hand.name = side < 0 ? "bike-hand-left" : "bike-hand-right";
    const elbow = elbowCap(0.053, skinMaterial, capSegs);
    elbow.name = side < 0 ? "bike-elbow-left" : "bike-elbow-right";
    const shoulder = jointCap(0.066, kitMaterial, capSegs);
    shoulder.userData.hideWithReplayAssets = false;
    setReplayAssetSlot(shoulder, "athlete:shoulder");
    shoulder.name = side < 0 ? "bike-shoulder-left" : "bike-shoulder-right";
    shoulder.position.set(side * 0.24, 0, 0);
    shoulderGirdle.add(shoulder);
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
  const BIKE_AERO_SPINE_LEAN = 0.74;
  const BIKE_HEAD_GAZE_COMPENSATION = -0.47;
  const BIKE_PELVIS_BASE_Y = 0.02;
  const BIKE_PELVIS_BASE_Z = -0.01;
  const BIKE_ANKLE_MIN = -0.22;
  const BIKE_ANKLE_MAX = 0.14;
  const placeBarArms = (): void => {
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i];
      if (!arm) continue;
      arm.shoulderPoint
        .set(arm.side * 0.24, 0, 0)
        .applyQuaternion(shoulderGirdle.quaternion)
        .add(shoulderGirdle.position)
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
      orientElbowCuff(arm.elbow, arm.shoulderPoint, arm.elbowPoint, arm.handPoint, arm.side);
      arm.hand.position.copy(arm.handPoint);
      arm.hand.rotation.set(-0.28, 0, arm.side * 0.08);
    }
  };

  const placePedalLegs = (motion: BikeMotionGraph): void => {
    for (const leg of legs) {
      const pedal = leg.side < 0 ? motion.leftPedal : motion.rightPedal;
      // The graph owns one circular state per pedal. Deriving the target from
      // that state (rather than a separate limb phase) keeps both shoes locked
      // to their mechanically opposed pedals at the 0 / 2π wrap boundary.
      const pedalRadius = Math.abs(leg.crankY);
      const pedalY = -pedalRadius * pedal.rotation.cos;
      const pedalZ = -pedalRadius * pedal.rotation.sin;
      leg.pedalTarget.set(
        leg.side * 0.1,
        cranks.position.y + pedalY - rider.position.y,
        cranks.position.z + pedalZ - rider.position.z,
      );
      // Let the hips follow the saddle-bound pelvis before solving both rigid
      // leg links. This makes each knee lead its upstroke without ever moving
      // the shoe away from the graph's pedal contact.
      leg.hipPoint
        .set(leg.side * 0.12, 0, 0)
        .applyQuaternion(pelvis.quaternion)
        .add(pelvis.position);
      // Stable bike knee plane: always prefer "up and slightly out" relative to
      // the current hip→pedal chord. A fixed world hint flips the joint behind
      // the crank once the pedal passes top/bottom dead centre under V4 IK.
      const chordX = leg.pedalTarget.x - leg.hipPoint.x;
      const chordY = leg.pedalTarget.y - leg.hipPoint.y;
      const chordZ = leg.pedalTarget.z - leg.hipPoint.z;
      // Perpendicular to the chord in the sagittal plane, forced upright, then
      // biased outward so left/right knees never collapse through the frame.
      let hintY = -chordZ;
      let hintZ = chordY;
      if (hintY < 0) {
        hintY = -hintY;
        hintZ = -hintZ;
      }
      const hintLen = Math.hypot(hintY, hintZ);
      if (hintLen > 1e-6) {
        hintY /= hintLen;
        hintZ /= hintLen;
      } else {
        hintY = 1;
        hintZ = 0.15;
      }
      leg.bendHint.set(leg.side * 0.28, hintY + 0.35, hintZ * 0.55 + 0.2);
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
      leg.shoe.rotation.set(
        THREE.MathUtils.clamp(-0.05 + pedal.ankleFlex.value * 0.3, BIKE_ANKLE_MIN, BIKE_ANKLE_MAX),
        0,
        0,
      );
    }
  };

  const placeBikeTorso = (motion: BikeMotionGraph, staticPose = false): void => {
    rider.rotation.set(0, 0, 0); // keep hands/feet in equipment space
    const animationScale = staticPose ? 0 : 1;
    const pedalLoadShift =
      (motion.leftPedal.drive.value - motion.rightPedal.drive.value) * animationScale;
    const pedalExtensionShift =
      (motion.leftPedal.legExtension.value - motion.rightPedal.legExtension.value) * animationScale;
    const averagePedalLoad =
      ((motion.leftPedal.drive.value + motion.rightPedal.drive.value) * 0.5 - 0.25) *
      animationScale;
    const pelvisRock = motion.body.pelvisRock.value * animationScale;
    const torsoSway = motion.body.torsoSway.value * animationScale;
    const spineLean = motion.body.spineLean.value * animationScale;
    const shoulderCounterRotation = motion.body.shoulderCounterRotation.value * animationScale;
    const headStabilization = motion.body.headStabilization.value * animationScale;

    // A seated rider shifts pressure across the saddle with each downstroke.
    // These are compact root cues, not free translations: hips remain within
    // the saddle shell while the contact solver preserves both pedal links.
    pelvis.position.set(
      pelvisRock * 0.16 + pedalLoadShift * 0.018,
      BIKE_PELVIS_BASE_Y - averagePedalLoad * 0.01,
      BIKE_PELVIS_BASE_Z + pedalExtensionShift * 0.018,
    );
    pelvis.rotation.set(
      spineLean * 0.3 + pedalExtensionShift * 0.01,
      pedalLoadShift * 0.024,
      pelvisRock * 0.7 + pedalLoadShift * 0.018,
    );

    // Keep the torso attached to that moving pelvis, then counterpose the
    // shoulder line instead of treating the rider as one rigid block.
    torso.position.set(pelvis.position.x, pelvis.position.y, pelvis.position.z + 0.02);
    torso.rotation.set(
      BIKE_AERO_SPINE_LEAN + spineLean * 0.9 + pedalExtensionShift * 0.015,
      pedalLoadShift * 0.018,
      torsoSway * 0.58,
    );
    shoulderGirdle.rotation.set(
      -spineLean * 0.28,
      pedalLoadShift * 0.024,
      shoulderCounterRotation * 0.7,
    );
    // The neck keeps a road-facing line of sight through the pedal cycle;
    // it counteracts the torso's small phase motion without cancelling the
    // intentional aero posture.
    headStabilizer.rotation.set(
      BIKE_HEAD_GAZE_COMPENSATION - spineLean * 0.78,
      -pedalLoadShift * 0.018,
      headStabilization * 0.55,
    );
  };

  const neutralBikeMotion = sampleBikeMotionGraphInto(
    fallbackStrokePose("bike", 0),
    bikeMotionGraph,
  );
  placeBikeTorso(neutralBikeMotion, true);
  placePedalLegs(neutralBikeMotion);
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
    const motion = sampleBikeMotionGraphInto(resolvedPose, bikeMotionGraph);
    if (reduce) {
      for (const w of wheels) w.rotation.x = 0;
      cranks.rotation.x = motion.crank.angle;
      placeBikeTorso(motion, true);
      placePedalLegs(motion);
      placeBarArms();
      return STATIC_AVATAR_MOTION;
    }
    // Wheel travel comes from distance, independent of cadence/gearing. Positive
    // rotation about +X moves the wheel top toward local +Z (forward).
    const wheelAngle = meters / wheelR;
    for (const w of wheels) w.rotation.x = wheelAngle;
    cranks.rotation.x = motion.crank.angle;
    placeBikeTorso(motion);
    // Update the pelvis before its two-bone leg solve. Otherwise the knees
    // target the previous frame's saddle shift and visibly lag behind a rider
    // whose shoes are correctly locked to the current pedals.
    placePedalLegs(motion);
    placeBarArms();
    return STATIC_AVATAR_MOTION;
  };

  const [leftArm, rightArm] = arms;
  const [leftLeg, rightLeg] = legs;
  if (!leftArm || !rightArm || !leftLeg || !rightLeg) {
    throw new Error("BikeErg V4 target rig is incomplete");
  }
  finalizeAvatar(group, castShadow, opacity);
  return {
    group,
    animate,
    assetMaterialResolver: resolveAssetMaterial,
    v4Targets: {
      pelvis,
      leftHand: leftArm.hand,
      rightHand: rightArm.hand,
      leftElbow: leftArm.elbow,
      rightElbow: rightArm.elbow,
      leftFoot: leftLeg.shoe,
      rightFoot: rightLeg.shoe,
      leftKnee: leftLeg.knee,
      rightKnee: rightLeg.knee,
    },
  };
}

const SPORT_PROFILES: Record<Sport, SportProfile> = {
  rower: {
    waves: true,
    roll: true,
    bobAmp: 0.13,
    metersPerCycle: METERS_PER_CYCLE.rower,
    surgeAmp: 0.48,
    sprayOffset: 2.2, // off the blade tips
    groundOpacity: 1,
    trailColor: 0xffffff,
    // Deep regatta basin rather than a teal race-track ribbon.
    groundColor: (t) => (t === "dark" ? 0x0d3f4c : 0x0f4f63),
    course: {
      surface: (t) => (t === "dark" ? 0x146a7c : 0x1f7d96),
      edge: (t) => (t === "dark" ? 0xb8f0fb : 0xf5fcff),
      laneLine: (t) => (t === "dark" ? 0x7ad4e8 : 0xe8f9ff),
      detail: (t) => (t === "dark" ? 0xf6c453 : 0xf59e0b),
      secondary: (t) => (t === "dark" ? 0xe8fbff : 0xffffff),
      surfaceOpacity: 0.42,
      roughness: 0.28,
      metalness: 0.12,
    },
    make: makeRowerAvatar,
  },
  skierg: {
    waves: false,
    roll: false,
    bobAmp: 0.08,
    metersPerCycle: METERS_PER_CYCLE.skierg,
    surgeAmp: 0.22,
    sprayOffset: 0.4, // at the pole baskets
    groundOpacity: 1,
    trailColor: 0xffffff,
    // Cool alpine snowfield: not pure white, so tracks and kit separate.
    groundColor: (t) => (t === "dark" ? 0xa8b7c2 : 0xe6eef3),
    course: {
      surface: (t) => (t === "dark" ? 0xd0dce4 : 0xf4f8fb),
      edge: (t) => (t === "dark" ? 0x8fa3b4 : 0xc5d4de),
      laneLine: (t) => (t === "dark" ? 0x9bb0c0 : 0xd5e2ea),
      detail: (t) => (t === "dark" ? 0x7c6cf0 : 0x6d5ef5),
      secondary: (t) => (t === "dark" ? 0x6b7d8c : 0xb8c8d2),
      surfaceOpacity: 1,
      roughness: 0.94,
      metalness: 0.01,
    },
    make: makeSkierAvatar,
  },
  bike: {
    waves: false,
    roll: false,
    bobAmp: 0.03,
    metersPerCycle: METERS_PER_CYCLE.bike,
    surgeAmp: 0,
    sprayOffset: null,
    groundOpacity: 1,
    trailColor: null,
    groundColor: (t) => (t === "dark" ? 0x1a1f26 : 0x5f6a72),
    course: {
      surface: (t) => (t === "dark" ? 0x2a3038 : 0x3f464e),
      edge: (t) => (t === "dark" ? 0xf1f5f9 : 0xfafcfe),
      laneLine: (t) => (t === "dark" ? 0xfbbf24 : 0xf59e0b),
      detail: (t) => (t === "dark" ? 0xef4444 : 0xdc2626),
      secondary: (t) => (t === "dark" ? 0x9aa8b8 : 0x74808c),
      surfaceOpacity: 1,
      roughness: 0.84,
      metalness: 0.05,
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
  /** Fixed target-to-light direction for this venue's visible sun and key. */
  private readonly sunOffset = new THREE.Vector3();
  /** Reused vectors keep shadow-focus stabilization allocation-free per frame. */
  private readonly shadowTarget = new THREE.Vector3();
  private readonly shadowDirection = new THREE.Vector3();
  private readonly shadowRight = new THREE.Vector3();
  private readonly shadowUp = new THREE.Vector3();
  private worldFill!: THREE.DirectionalLight;
  private readonly environmentMidGroup = new THREE.Group();
  private readonly environmentDetailGroup = new THREE.Group();
  private liveContactFootprint!: THREE.Group;
  private ghostContactFootprint!: THREE.Group;
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
      // PCFSoftShadowMap is deprecated by current Three WebGL and silently
      // becomes a screen-space dithered PCF path. VSM is supported by both
      // renderer backends here and gives the replay one stable soft penumbra.
      this.renderer.shadowMap.type = THREE.VSMShadowMap;
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
    // Low golden-hour key for row, higher alpine key for ski, dusk side-key
    // for the velodrome — each venue's sun sits where the art direction places it.
    this.sunOffset.fromArray(SUN_OFFSETS[this.sport]);
    this.sunLight.position.copy(this.sunOffset);
    if (this.cfg.shadows) {
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.set(this.cfg.shadowMapSize, this.cfg.shadowMapSize);
      const c = this.sunLight.shadow.camera as THREE.OrthographicCamera;
      const frame = SHADOW_FRAMES[this.sport];
      c.near = frame.near;
      c.far = frame.far;
      c.left = frame.left;
      c.right = frame.right;
      c.bottom = frame.bottom;
      c.top = frame.top;
      // Keep thin oars, poles and shoe soles attached to their contact
      // shadows. Larger normal offsets visibly detach these fine features.
      this.sunLight.shadow.bias = -0.00008;
      this.sunLight.shadow.normalBias = 0.012;
      this.sunLight.shadow.radius = 1.35;
      this.sunLight.shadow.blurSamples = 8;
      this.sunLight.shadow.intensity = 0.58;
    }
    this.sunLight.target.name = "environment:key-light-target";
    this.sunLight.target.position.set(0, SHADOW_TARGET_HEIGHT, 0);
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
    const cameraFill = new THREE.DirectionalLight(0xe8f2ff, 0.34);
    cameraFill.name = "camera-athlete-fill";
    cameraFill.position.set(-3.2, 4.8, 2.2);
    cameraFill.target.position.set(0, 0.4, -8);
    const cameraRim = new THREE.DirectionalLight(0xfff6e8, 0.24);
    cameraRim.name = "camera-athlete-rim";
    cameraRim.position.set(4.2, 2.8, 1.2);
    cameraRim.target.position.set(0, 0.5, -8);
    this.camera.add(cameraFill, cameraFill.target, cameraRim, cameraRim.target);
    this.scene.add(this.camera);

    this.liveAvatar = this.profile.make(
      hex(COLORS_LIGHT.live),
      this.cfg.shadows,
      1,
      this.cfg.bodySegments,
    );
    this.liveBoat = new THREE.Group();
    this.liveBoat.add(this.liveAvatar.group);
    // Ghost: translucent + no shadow so it reads as a phantom, clearly distinct
    // from the solid live avatar.
    this.ghostAvatar = this.profile.make(
      hex(COLORS_LIGHT.ghost),
      false,
      0.45,
      this.cfg.bodySegments,
    );
    this.ghostGroup = new THREE.Group();
    this.ghostGroup.visible = false;
    this.ghostGroup.add(this.ghostAvatar.group);
    if (options.assets) {
      const liveCount = applyReplayAssetLibrary(
        this.liveAvatar.group,
        options.assets,
        this.liveAvatar.assetMaterialResolver,
      );
      const ghostCount = applyReplayAssetLibrary(
        this.ghostAvatar.group,
        options.assets,
        this.ghostAvatar.assetMaterialResolver,
      );
      this.liveAvatar.group.userData.authoredReplayAsset = liveCount > 0;
      this.ghostAvatar.group.userData.authoredReplayAsset = ghostCount > 0;
      // V3 composites attach after each maker's initial finalization. Walk the
      // completed rig once so every cloned detail participates in the same
      // live shadow / ghost-opacity contract as the fallback equipment.
      finalizeAvatar(this.liveAvatar.group, this.cfg.shadows, 1);
      finalizeAvatar(this.ghostAvatar.group, false, 0.45);
    }
    if (options.v4Assets) {
      this.liveAvatar.v4Motion = installReplayV4MotionController({
        sport: this.sport,
        parent: this.liveAvatar.group,
        fallbackRoot: this.liveAvatar.group,
        instance: tryCreateReplayV4AthleteInstance(options.v4Assets),
        targets: this.liveAvatar.v4Targets,
        castShadow: this.cfg.shadows,
        receiveShadow: this.cfg.shadows,
      });
      this.ghostAvatar.v4Motion = installReplayV4MotionController({
        sport: this.sport,
        parent: this.ghostAvatar.group,
        fallbackRoot: this.ghostAvatar.group,
        instance: tryCreateReplayV4AthleteInstance(options.v4Assets),
        targets: this.ghostAvatar.v4Targets,
        opacity: 0.45,
        castShadow: false,
        receiveShadow: false,
        laneColor: COLORS_LIGHT.ghost,
      });
      this.liveAvatar.group.userData.authoredReplayV4 = !!this.liveAvatar.v4Motion;
      this.ghostAvatar.group.userData.authoredReplayV4 = !!this.ghostAvatar.v4Motion;
      const v4ArmReach = Math.min(
        options.v4Assets.effectors.leftHand.totalReach,
        options.v4Assets.effectors.rightHand.totalReach,
      );
      if (this.liveAvatar.v4Motion) this.liveAvatar.setV4ArmReach?.(v4ArmReach);
      if (this.ghostAvatar.v4Motion) this.ghostAvatar.setV4ArmReach?.(v4ArmReach);
    }
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
    // Fine lane dressing should not compete with the single matte course
    // receiver in the tightly focused athlete shadow map.
    ring.receiveShadow = false;
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
    block.receiveShadow = false;
    group.add(block);
    return block;
  }

  private addRowerCourseDetails(group: THREE.Group, innerR: number, outerR: number): void {
    const style = this.profile.course;
    // Parallel regatta lane cables — thin continuous rings, not sparse ticks.
    const cableMat = this.courseMat("course:rower:lane-line", style.laneLine, {
      roughness: 0.34,
      metalness: 0.12,
    });
    const laneRadii = [
      innerR + 0.55,
      innerR + 1.65,
      this.ghostRadius,
      this.loopRadius,
      outerR - 1.65,
      outerR - 0.55,
    ];
    for (const r of laneRadii) {
      this.addCourseRing(group, r, 0.012, cableMat, "course:rower:lane-line", 0.048);
    }

    // Specular water streaks give the basin a living surface without textures.
    const streakMat = this.courseMat("course:rower:water-streak", style.secondary, {
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      roughness: 0.22,
      metalness: 0.14,
    });
    const streakGeo = this.track(new THREE.CapsuleGeometry(0.022, 2.02, 4, 10));
    streakGeo.rotateX(Math.PI / 2);
    const streaks = this.cfg.laneSegments >= 120 ? 96 : this.cfg.laneSegments >= 90 ? 68 : 44;
    for (let i = 0; i < streaks; i++) {
      const band = (i % 6) / 5;
      const radius = innerR + 1.1 + (outerR - innerR - 2.2) * band;
      const angle = ((i * 0.61803398875 + (i % 6) * 0.061) % 1) * FULL_CIRCLE;
      this.addCourseBlock(group, streakGeo, streakMat, radius, angle, "course:rower:water-streak");
    }

    // Distance buoy clusters at cardinals — warm markers against cool water.
    const buoyTickMat = this.courseMat("course:rower:distance-buoy", style.detail, {
      roughness: 0.48,
      metalness: 0.04,
    });
    const buoyTickGeo = this.track(roundedVenueBlockGeometry(0.14, 0.055, 0.55, 0.025));
    for (const marker of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      for (const offset of [-degrees(1.1), 0, degrees(1.1)]) {
        this.addCourseBlock(
          group,
          buoyTickGeo,
          buoyTickMat,
          outerR - 0.32,
          marker + offset,
          "course:rower:distance-buoy",
          0.078,
        );
      }
    }
  }

  private addSkierCourseDetails(group: THREE.Group, innerR: number, outerR: number): void {
    const style = this.profile.course;
    // Paired ski tracks (two grooves per lane) instead of evenly spaced combs.
    const grooveMat = this.courseMat("course:skierg:groomed-groove", style.laneLine, {
      roughness: 0.96,
      metalness: 0.01,
    });
    const trackCenters = [
      this.ghostRadius - 0.55,
      this.ghostRadius + 0.55,
      this.loopRadius - 0.55,
      this.loopRadius + 0.55,
    ];
    for (const center of trackCenters) {
      this.addCourseRing(
        group,
        center - 0.09,
        0.02,
        grooveMat,
        "course:skierg:groomed-groove",
        0.05,
      );
      this.addCourseRing(
        group,
        center + 0.09,
        0.02,
        grooveMat,
        "course:skierg:groomed-groove",
        0.05,
      );
    }

    // Soft corduroy comb reads as groomed snow rather than polished ice.
    const combMat = this.courseMat("course:skierg:snow-comb", style.secondary, {
      transparent: true,
      opacity: 0.28,
      roughness: 0.98,
      metalness: 0,
    });
    const combGeo = this.track(new THREE.CapsuleGeometry(0.014, outerR - innerR - 1.88, 4, 10));
    combGeo.rotateZ(Math.PI / 2);
    const combs = this.cfg.laneSegments >= 120 ? 72 : 42;
    for (let i = 0; i < combs; i++) {
      this.addCourseBlock(
        group,
        combGeo,
        combMat,
        (innerR + outerR) / 2,
        (i / combs) * Math.PI * 2,
        "course:skierg:snow-comb",
        0.06,
      );
    }

    // Low purple course gates — match the art-direction marker language.
    const gateMat = this.courseMat("course:skierg:gate", style.detail, {
      roughness: 0.42,
      metalness: 0.05,
    });
    const gateGeo = this.track(roundedVenueBlockGeometry(0.18, 0.07, 0.55, 0.035));
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      this.addCourseBlock(
        group,
        gateGeo,
        gateMat,
        innerR + 0.48,
        angle,
        "course:skierg:gate",
        0.075,
      );
      this.addCourseBlock(
        group,
        gateGeo,
        gateMat,
        outerR - 0.48,
        angle,
        "course:skierg:gate",
        0.075,
      );
    }
  }

  private addBikeCourseDetails(group: THREE.Group, innerR: number, outerR: number): void {
    const style = this.profile.course;
    const seamMat = this.courseMat("course:bike:seam", style.secondary, {
      roughness: 0.86,
      metalness: 0.03,
    });
    this.addCourseRing(group, this.ghostRadius, 0.016, seamMat, "course:bike:seam", 0.056);
    this.addCourseRing(group, this.loopRadius, 0.016, seamMat, "course:bike:seam", 0.056);

    // Continuous yellow centre dashes — velodrome lane grammar.
    const dashMat = this.courseMat("course:bike:dash", style.laneLine, {
      roughness: 0.5,
      metalness: 0.05,
    });
    const dashGeo = this.track(roundedVenueBlockGeometry(0.14, 0.045, 1.7, 0.035));
    const dashCount = this.cfg.laneSegments >= 120 ? 64 : 46;
    for (let i = 0; i < dashCount; i++) {
      this.addCourseBlock(
        group,
        dashGeo,
        dashMat,
        (this.ghostRadius + this.loopRadius) / 2,
        (i / dashCount) * Math.PI * 2,
        "course:bike:dash",
        0.082,
      );
    }

    const curbRed = this.courseMat("course:bike:curb-red", style.detail, {
      roughness: 0.46,
      metalness: 0.04,
    });
    const curbWhite = this.courseMat("course:bike:curb-white", style.edge, {
      roughness: 0.48,
      metalness: 0.03,
    });
    const curbGeo = this.track(roundedVenueBlockGeometry(0.38, 0.07, 0.92, 0.045));
    const curbCount = this.cfg.laneSegments >= 120 ? 80 : 54;
    for (let i = 0; i < curbCount; i++) {
      const angle = (i / curbCount) * Math.PI * 2;
      const mat = i % 2 === 0 ? curbRed : curbWhite;
      this.addCourseBlock(group, curbGeo, mat, innerR + 0.28, angle, "course:bike:curb", 0.092);
      this.addCourseBlock(group, curbGeo, mat, outerR - 0.28, angle, "course:bike:curb", 0.092);
    }

    // Soft outer speed marks for dusk track depth.
    const speedMat = this.courseMat("course:bike:speed-bars", style.edge, {
      transparent: true,
      opacity: 0.36,
      roughness: 0.55,
      metalness: 0.02,
    });
    const speedGeo = this.track(roundedVenueBlockGeometry(1.2, 0.03, 0.12, 0.025));
    for (let i = 0; i < 32; i++) {
      const angle = (i / 32) * Math.PI * 2 + 0.03;
      this.addCourseBlock(
        group,
        speedGeo,
        speedMat,
        outerR - 1.45,
        angle,
        "course:bike:speed-bars",
        0.07,
      );
    }

    // Purple course markers from the art direction — low balls that read as
    // velodrome lane furniture without competing with the athlete silhouette.
    const markerMat = this.courseMat("course:bike:lane-marker", themed(0x8b7cf5, 0x7c6cf0), {
      roughness: 0.42,
      metalness: 0.08,
      emissive: 0x5b4fd1,
      emissiveIntensity: 0.18,
    });
    const markerGeo = this.track(new THREE.SphereGeometry(0.11, 8, 6));
    const markerCount = this.cfg.laneSegments >= 120 ? 40 : 28;
    for (let i = 0; i < markerCount; i++) {
      const angle = (i / markerCount) * Math.PI * 2;
      this.addCourseBlock(
        group,
        markerGeo,
        markerMat,
        outerR - 0.95,
        angle,
        "course:bike:lane-marker",
        0.12,
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
    // Three-tier interpolation: zenith → high-mid (preserves blue depth),
    // high-mid → horizon (warms toward the sun), horizon → nadir (fades
    // into the fog colour so it meets the fog plane without a seam).
    const aboveMid = new THREE.Color().copy(zenith).lerp(horizon, 0.35);
    const belowMid = new THREE.Color().copy(horizon).lerp(nadir, 0.55);
    for (let i = 0; i < position.count; i++) {
      const normalizedY = THREE.MathUtils.clamp(position.getY(i) / 175, -1, 1);
      if (normalizedY >= 0.55) {
        sample.copy(aboveMid).lerp(zenith, (normalizedY - 0.55) / 0.45);
      } else if (normalizedY >= 0) {
        sample.copy(horizon).lerp(aboveMid, Math.pow(normalizedY / 0.55, 0.62));
      } else if (normalizedY >= -0.45) {
        sample.copy(horizon).lerp(belowMid, Math.pow(-normalizedY / 0.45, 0.68));
      } else {
        sample.copy(belowMid).lerp(nadir, Math.pow((-normalizedY - 0.45) / 0.55, 0.72));
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
    // The visible sun and the movable directional-light focus share the same
    // world direction. The light follows the athlete only to retain a dense
    // local map; it is never a second, contradictory camera light.
    sun.position.copy(this.sunOffset).normalize().multiplyScalar(132);
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
    const composition = HORIZON_COMPOSITIONS[this.sport];
    let cursor = 0;
    const envelopeAt = (angle: number): number => {
      let envelope = composition.floor;
      for (const lobe of composition.lobes) {
        const distance = angularDistance(angle, lobe.center);
        if (distance >= lobe.halfSpan) continue;
        const edge = 0.5 + Math.cos((distance / lobe.halfSpan) * Math.PI) * 0.5;
        envelope += edge * lobe.height;
      }
      return envelope;
    };
    const heightAt = (i: number): number => {
      const a = (i / segments) * Math.PI * 2;
      const broad = Math.sin(a * 3 + phase) * 0.46 + Math.sin(a * 7 - phase * 0.7) * 0.28;
      const ridge = Math.abs(Math.sin(a * 11 + phase * 1.9)) * 0.34;
      const envelope = envelopeAt(a);
      return averageHeight * envelope + variation * (broad + ridge) * (0.38 + envelope * 0.62);
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
      const x0 = composition.offsetX + Math.sin(a0) * r0;
      const z0 = composition.offsetZ + Math.cos(a0) * r0;
      const x1 = composition.offsetX + Math.sin(a1) * r1;
      const z1 = composition.offsetZ + Math.cos(a1) * r1;
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
    sectors: readonly EnvironmentSector[],
  ): void {
    const canopyGeo = this.track(sculptedPineGeometry());
    const trunkGeo = this.track(new THREE.CylinderGeometry(0.11, 0.17, 1.38, 16));
    const pineColor =
      this.sport === "skierg" ? themed(0x335d51, 0x244d45) : themed(0x2d6548, 0x1c503c);
    // A single continuous canopy keeps the silhouette coniferous at replay
    // distance. The separate spherical crown still read as a row of green
    // balls above the SkiErg tree line against the bright snow.
    const canopyMat = this.environmentStandardMat(
      `environment:${this.sport}:pine-canopy-material`,
      pineColor,
      { fog: true, roughness: 0.82, metalness: 0.005 },
    );
    const trunkMat = this.environmentStandardMat(
      `environment:${this.sport}:pine-trunk-material`,
      themed(0x5a4635, 0x261f1b),
      { roughness: 0.96, metalness: 0 },
    );
    const canopies = this.trackInstanced(new THREE.InstancedMesh(canopyGeo, canopyMat, count));
    const trunks = this.trackInstanced(new THREE.InstancedMesh(trunkGeo, trunkMat, count));
    canopies.name = `environment:${this.sport}:pines`;
    trunks.name = `environment:${this.sport}:pine-trunks`;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const { angle: a } = sectorSample(i, count, sectors);
      const radius =
        radiusMin + (radiusMax - radiusMin) * (0.18 + 0.82 * (0.5 + Math.sin(i * 12.9898) * 0.5));
      const size = 0.75 + (0.5 + Math.sin(i * 7.31) * 0.5) * 0.8;
      // The canopy deliberately has asymmetric boughs, so rotate every
      // instance independently rather than exposing the same silhouette at
      // every point on the ridge.
      quaternion.setFromAxisAngle(WORLD_UP, (i * 2.399963229728653) % FULL_CIRCLE);
      position.set(Math.sin(a) * radius, 2.02 * size, Math.cos(a) * radius);
      scale.set(size * 1.04, size * 1.04, size * 1.04);
      matrix.compose(position, quaternion, scale);
      canopies.setMatrixAt(i, matrix);
      position.y = 0.55 * size;
      scale.set(size, size, size);
      matrix.compose(position, quaternion, scale);
      trunks.setMatrixAt(i, matrix);
    }
    canopies.instanceMatrix.needsUpdate = true;
    trunks.instanceMatrix.needsUpdate = true;
    group.add(trunks, canopies);
  }

  private addAlpinePeaks(group: THREE.Group, count: number): void {
    // Keep the massif monumental without letting it consume the whole lens:
    // a visible sky band is essential to the valley read at replay height.
    const peakGeo = this.track(alpinePeakGeometry());
    const capGeo = this.track(alpineSnowcapGeometry());
    const peakMat = this.environmentStandardMat(
      "environment:skierg:mountain-material",
      themed(0x7897a8, 0x4f6a7a),
      { fog: true, roughness: 0.92, metalness: 0 },
    );
    const capMat = this.environmentStandardMat(
      "environment:skierg:snowcap-material",
      themed(0xe8f2f5, 0xaec1ca),
      { fog: true, roughness: 0.9, metalness: 0 },
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
      const { angle: a } = sectorSample(i, count, SKI_PEAK_SECTORS);
      const radius = 79 + (0.5 + Math.sin(i * 8.17) * 0.5) * 13;
      const size = 0.72 + (0.5 + Math.sin(i * 4.91) * 0.5) * 0.62;
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a + (i % 3) * 0.31);
      position.set(Math.sin(a) * radius, 7.2 * size, Math.cos(a) * radius);
      scale.set(size * (0.9 + (i % 4) * 0.08), size, size);
      matrix.compose(position, quaternion, scale);
      peaks.setMatrixAt(i, matrix);
      position.y = 7.2 * size;
      scale.set(size, size, size);
      matrix.compose(position, quaternion, scale);
      caps.setMatrixAt(i, matrix);
    }
    peaks.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    group.add(peaks, caps);
  }

  /**
   * A nearer terrain band beneath the distant massif. It stays outside the
   * snow berms and below the tree line, creating a valley-floor parallax cue
   * without turning the athlete's chase frame into a wall of scenery.
   */
  private addAlpineFoothills(group: THREE.Group, count: number): void {
    const geometry = this.track(alpineFoothillGeometry());
    const material = this.environmentStandardMat(
      "environment:skierg:foothill-material",
      themed(0x638794, 0x3a5968),
      { fog: true, roughness: 0.96, metalness: 0 },
    );
    const foothills = this.trackInstanced(new THREE.InstancedMesh(geometry, material, count));
    foothills.name = "environment:skierg:foothills";
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const { angle: a } = sectorSample(i, count, SKI_PEAK_SECTORS);
      const size = 0.76 + (0.5 + Math.sin(i * 6.13) * 0.5) * 0.52;
      const verticalScale = size * 0.84;
      const radius = 48.5 + Math.sin(i * 4.41) * 2.1;
      quaternion.setFromAxisAngle(WORLD_UP, a + 0.36 + (i % 4) * 0.29);
      position.set(Math.sin(a) * radius, 2.5 * verticalScale, Math.cos(a) * radius);
      scale.set(size * 1.5, verticalScale, size * 0.88);
      matrix.compose(position, quaternion, scale);
      foothills.setMatrixAt(i, matrix);
    }
    foothills.instanceMatrix.needsUpdate = true;
    group.add(foothills);
  }

  private addPavilions(group: THREE.Group, placements: readonly EnvironmentPlacement[]): void {
    const bodyGeo = this.track(roundedVenueBlockGeometry(9, 2.6, 3.6, 0.36));
    const roofGeo = this.track(new THREE.CylinderGeometry(5.35, 4.35, 1.25, 24, 2));
    const glassGeo = this.track(roundedVenueBlockGeometry(7.4, 0.8, 0.08, 0.1));
    const mullionGeo = this.track(roundedVenueBlockGeometry(0.09, 1.16, 0.11, 0.025));
    const bodyMat = this.environmentStandardMat(
      `environment:${this.sport}:pavilion-body-material`,
      this.environment.venueStructure,
      { roughness: 0.76, metalness: 0.06 },
    );
    const roofMat = this.environmentStandardMat(
      `environment:${this.sport}:pavilion-roof-material`,
      this.environment.venueAccent,
      { roughness: 0.5, metalness: 0.16 },
    );
    const glassMat = this.mat(
      new THREE.MeshPhysicalMaterial({
        color: themed(0x8ed4e5, 0x173a4d)("light"),
        roughness: 0.18,
        metalness: 0.12,
        transparent: true,
        opacity: 0.72,
        clearcoat: 0.42,
        clearcoatRoughness: 0.16,
        depthWrite: false,
      }),
    );
    glassMat.name = `environment:${this.sport}:pavilion-glass-material`;
    this.environmentThemeMats.push({ material: glassMat, color: themed(0x8ed4e5, 0x173a4d) });
    for (const placement of placements) {
      const a = placement.angle;
      const pavilion = new THREE.Group();
      pavilion.name = placement.name;
      pavilion.position.set(Math.sin(a) * placement.radius, 0, Math.cos(a) * placement.radius);
      pavilion.rotation.y = a;
      pavilion.scale.set(...(placement.scale ?? [1, 1, 1]));
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 1.45;
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.y = 3.45;
      roof.scale.z = 0.52;
      const glass = new THREE.Mesh(glassGeo, glassMat);
      glass.position.set(0, 1.8, -1.84);
      pavilion.add(body, roof, glass);
      for (const x of [-2.45, 0, 2.45]) {
        const mullion = new THREE.Mesh(mullionGeo, bodyMat);
        mullion.position.set(x, 1.8, -1.91);
        pavilion.add(mullion);
      }
      group.add(pavilion);
    }
  }

  private addFloodlights(
    group: THREE.Group,
    placements: readonly EnvironmentPlacement[],
    count: number,
  ): void {
    const authored = placements.slice(0, count);
    const poleGeo = this.track(new THREE.CylinderGeometry(0.1, 0.15, 8, 12));
    const panelGeo = this.track(roundedVenueBlockGeometry(2.2, 0.7, 0.22, 0.1));
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
    const poles = this.trackInstanced(new THREE.InstancedMesh(poleGeo, poleMat, authored.length));
    const panels = this.trackInstanced(
      new THREE.InstancedMesh(panelGeo, panelMat, authored.length),
    );
    poles.name = `environment:${this.sport}:floodlight-poles`;
    panels.name = `environment:${this.sport}:floodlight-panels`;
    poles.userData.authoredPlacements = authored.map((placement) => placement.name);
    panels.userData.authoredPlacements = poles.userData.authoredPlacements;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < authored.length; i++) {
      const placement = authored[i];
      const a = placement.angle;
      position.set(Math.sin(a) * placement.radius, 4, Math.cos(a) * placement.radius);
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

  private addArenaPanels(
    group: THREE.Group,
    count: number,
    radius: number,
    sectors: readonly EnvironmentSector[],
  ): void {
    const panelGeo = this.track(roundedVenueBlockGeometry(5.1, 1.45, 0.16, 0.12));
    const ribGeo = this.track(roundedVenueBlockGeometry(0.13, 4.4, 0.22, 0.04));
    const panelMat = this.mat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        fog: true,
        vertexColors: false,
        roughness: 0.58,
        metalness: 0.18,
      }),
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
    const neutralPanel = new THREE.Color(0x3b4658);
    const alternatePanel = new THREE.Color(0x46546a);
    const mainStraightAccent = new THREE.Color(0xd88749);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const position = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const sample = sectorSample(i, count, sectors);
      const a = sample.angle;
      quaternion.setFromAxisAngle(up, a);
      position.set(Math.sin(a) * radius, 2.15, Math.cos(a) * radius);
      matrix.compose(position, quaternion, scale);
      panels.setMatrixAt(i, matrix);
      panels.setColorAt(
        i,
        sample.sector === 0 && sample.local > 0.3 && sample.local < 0.7
          ? mainStraightAccent
          : i % 5 === 0
            ? alternatePanel
            : neutralPanel,
      );
      position.y = 2.2;
      matrix.compose(position, quaternion, scale);
      ribs.setMatrixAt(i, matrix);
    }
    panels.instanceMatrix.needsUpdate = true;
    if (panels.instanceColor) panels.instanceColor.needsUpdate = true;
    ribs.instanceMatrix.needsUpdate = true;
    group.add(panels, ribs);
  }

  private makeHorizontalArc(
    name: string,
    innerRadius: number,
    outerRadius: number,
    y: number,
    sector: EnvironmentSector,
    material: THREE.Material,
  ): THREE.Mesh {
    const segments = Math.max(6, Math.ceil((this.cfg.laneSegments * sector.span) / FULL_CIRCLE));
    const positions = new Float32Array(segments * 18);
    let cursor = 0;
    for (let i = 0; i < segments; i++) {
      const a0 = sector.start + (i / segments) * sector.span;
      const a1 = sector.start + ((i + 1) / segments) * sector.span;
      const inner0 = [Math.sin(a0) * innerRadius, y, Math.cos(a0) * innerRadius];
      const outer0 = [Math.sin(a0) * outerRadius, y, Math.cos(a0) * outerRadius];
      const inner1 = [Math.sin(a1) * innerRadius, y, Math.cos(a1) * innerRadius];
      const outer1 = [Math.sin(a1) * outerRadius, y, Math.cos(a1) * outerRadius];
      positions.set([...inner0, ...outer0, ...outer1, ...inner0, ...outer1, ...inner1], cursor);
      cursor += 18;
    }
    const geometry = this.track(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.receiveShadow = this.cfg.shadows;
    mesh.userData.authoredSector = { start: sector.start, span: sector.span };
    return mesh;
  }

  private makeVerticalArc(
    name: string,
    radius: number,
    height: number,
    y: number,
    sector: EnvironmentSector,
    material: THREE.Material,
  ): THREE.Mesh {
    const segments = Math.max(6, Math.ceil((this.cfg.laneSegments * sector.span) / FULL_CIRCLE));
    const geometry = this.track(
      new THREE.CylinderGeometry(
        radius,
        radius,
        height,
        segments,
        1,
        true,
        sector.start,
        sector.span,
      ),
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.y = y;
    mesh.receiveShadow = this.cfg.shadows;
    mesh.userData.authoredSector = { start: sector.start, span: sector.span };
    return mesh;
  }

  private addSnowBerms(group: THREE.Group, outerR: number, count: number): void {
    const geometry = this.track(new THREE.SphereGeometry(1, 18, 12));
    const material = this.environmentStandardMat(
      "environment:skierg:snowbank-material",
      this.environment.apron,
      { roughness: 0.98, metalness: 0 },
    );
    const berms = this.trackInstanced(new THREE.InstancedMesh(geometry, material, count));
    berms.name = "environment:skierg:snowbank";
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const { angle } = sectorSample(i, count, SKI_BERM_SECTORS);
      const radius = outerR + 2.8 + Math.sin(i * 5.31) * 0.62;
      const width = 1.55 + (0.5 + Math.sin(i * 7.77) * 0.5) * 0.8;
      const height = 0.42 + (0.5 + Math.sin(i * 4.17) * 0.5) * 0.28;
      quaternion.setFromAxisAngle(up, angle);
      position.set(Math.sin(angle) * radius, 0.12 + height * 0.25, Math.cos(angle) * radius);
      scale.set(width, height, 0.82 + (i % 3) * 0.12);
      matrix.compose(position, quaternion, scale);
      berms.setMatrixAt(i, matrix);
    }
    berms.instanceMatrix.needsUpdate = true;
    berms.receiveShadow = this.cfg.shadows;
    group.add(berms);
  }

  /**
   * Low-opacity, rounded cloud banks add aerial depth without a panorama or
   * image texture. They remain outside the course silhouette and are static,
   * so they cost one instanced draw rather than a post-processing pass.
   */
  private addAtmosphericClouds(
    group: THREE.Group,
    count: number,
    sectors: readonly EnvironmentSector[],
  ): void {
    const geometry = this.track(new THREE.SphereGeometry(1, 20, 12));
    const color = this.sport === "skierg" ? themed(0xf8fcff, 0x2a4d65) : themed(0xfff1df, 0x193947);
    const material = this.environmentBasicMat(`environment:${this.sport}:cloud-material`, color, {
      transparent: true,
      opacity: this.sport === "skierg" ? 0.13 : 0.1,
      depthWrite: false,
      fog: true,
    });
    const clouds = this.trackInstanced(new THREE.InstancedMesh(geometry, material, count));
    clouds.name = `environment:${this.sport}:cloud-banks`;
    clouds.renderOrder = -700;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    for (let index = 0; index < count; index++) {
      const { angle } = sectorSample(index, count, sectors);
      const size = 2.6 + (0.5 + Math.sin(index * 4.91) * 0.5) * 2.1;
      const radius = 98 + Math.sin(index * 9.37) * 11;
      position.set(
        Math.sin(angle) * radius,
        12 + Math.sin(index * 2.73) * 2.6,
        Math.cos(angle) * radius,
      );
      quaternion.setFromAxisAngle(WORLD_UP, angle + index * 0.37);
      scale.set(size * 2.7, size * 0.38, size * 1.12);
      matrix.compose(position, quaternion, scale);
      clouds.setMatrixAt(index, matrix);
    }
    clouds.instanceMatrix.needsUpdate = true;
    group.add(clouds);
  }

  private addScoreboard(group: THREE.Group, placement: EnvironmentPlacement): void {
    const structureMat = this.environmentStandardMat(
      "environment:bike:scoreboard-structure-material",
      this.environment.venueStructure,
      { roughness: 0.5, metalness: 0.46 },
    );
    const screenMat = this.environmentBasicMat(
      "environment:bike:scoreboard-screen-material",
      themed(0x172334, 0x080d17),
      { fog: true },
    );
    const accentMat = this.environmentBasicMat(
      "environment:bike:scoreboard-accent-material",
      this.environment.venueAccent,
      { fog: true },
    );
    const scoreboard = new THREE.Group();
    scoreboard.name = placement.name;
    scoreboard.position.set(
      Math.sin(placement.angle) * placement.radius,
      0,
      Math.cos(placement.angle) * placement.radius,
    );
    scoreboard.rotation.y = placement.angle;
    const supports = this.track(new THREE.CylinderGeometry(0.16, 0.2, 4.8, 12));
    for (const x of [-3.35, 3.35]) {
      const support = new THREE.Mesh(supports, structureMat);
      support.position.set(x, 2.4, 0);
      scoreboard.add(support);
    }
    const frame = new THREE.Mesh(
      this.track(roundedVenueBlockGeometry(9.4, 3.6, 0.42, 0.2)),
      structureMat,
    );
    frame.position.y = 5.25;
    const screen = new THREE.Mesh(
      this.track(roundedVenueBlockGeometry(8.65, 2.78, 0.08, 0.12)),
      screenMat,
    );
    screen.name = "environment:bike:scoreboard-screen";
    screen.position.set(0, 5.25, -0.25);
    const header = new THREE.Mesh(
      this.track(roundedVenueBlockGeometry(8.65, 0.18, 0.1, 0.04)),
      accentMat,
    );
    header.position.set(0, 6.35, -0.31);
    const split = new THREE.Mesh(
      this.track(roundedVenueBlockGeometry(0.1, 2.15, 0.1, 0.035)),
      accentMat,
    );
    split.position.set(0, 5.08, -0.31);
    scoreboard.add(frame, screen, header, split);
    group.add(scoreboard);
  }

  private buildEnvironment(innerR: number, outerR: number): void {
    this.buildSky();
    this.environmentMidGroup.name = `environment:${this.sport}:midground`;
    this.environmentDetailGroup.name = `environment:${this.sport}:detail`;
    this.scene.add(this.environmentMidGroup, this.environmentDetailGroup);

    const farHeight = this.sport === "skierg" ? 14 : this.sport === "bike" ? 11 : 5.5;
    const farVariation = this.sport === "skierg" ? 6.5 : this.sport === "bike" ? 3 : 2.4;
    const midHeight = this.sport === "skierg" ? 7 : this.sport === "bike" ? 7 : 4.2;
    const midVariation = this.sport === "skierg" ? 4 : this.sport === "bike" ? 2 : 1.8;
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
      this.addAtmosphericClouds(
        this.environmentMidGroup,
        4 + this.cfg.environmentDetail,
        ROW_PINE_SECTORS,
      );
      this.addInstancedPines(
        this.environmentMidGroup,
        28 + this.cfg.environmentDetail * 16,
        64,
        82,
        ROW_PINE_SECTORS,
      );
      this.addPavilions(this.environmentDetailGroup, ROW_LANDMARKS);
    } else if (this.sport === "skierg") {
      this.addAtmosphericClouds(
        this.environmentMidGroup,
        5 + this.cfg.environmentDetail,
        SKI_PEAK_SECTORS,
      );
      this.addAlpineFoothills(this.environmentMidGroup, 7 + this.cfg.environmentDetail * 3);
      this.addAlpinePeaks(this.environmentMidGroup, 16 + this.cfg.environmentDetail * 4);
      this.addSnowBerms(this.environmentMidGroup, outerR, 22 + this.cfg.environmentDetail * 8);
      this.addInstancedPines(
        this.environmentMidGroup,
        38 + this.cfg.environmentDetail * 20,
        56,
        80,
        SKI_PINE_SECTORS,
      );
      this.addFloodlights(
        this.environmentDetailGroup,
        SKI_FLOODLIGHTS,
        8 + this.cfg.environmentDetail * 2,
      );
      this.addPavilions(
        this.environmentDetailGroup,
        SKI_LANDMARKS.slice(0, this.cfg.environmentDetail >= 1 ? 2 : 1),
      );
    } else {
      const wallMat = this.environmentBasicMat(
        "environment:bike:arena-wall-material",
        this.environment.venueStructure,
        { side: THREE.BackSide, fog: true },
      );
      const arenaWall = new THREE.Group();
      arenaWall.name = "environment:bike:arena-wall";
      for (const [index, sector] of BIKE_STAND_SECTORS.entries()) {
        arenaWall.add(
          this.makeVerticalArc(
            `environment:bike:arena-wall-sector-${index + 1}`,
            58,
            5,
            2.25,
            sector,
            wallMat,
          ),
        );
      }
      this.environmentMidGroup.add(arenaWall);
      this.addArenaPanels(
        this.environmentMidGroup,
        28 + this.cfg.environmentDetail * 4,
        57.75,
        BIKE_STAND_SECTORS,
      );
      const canopyMat = this.environmentStandardMat(
        "environment:bike:canopy-material",
        this.environment.venueAccent,
        { roughness: 0.52, metalness: 0.34, side: THREE.DoubleSide },
      );
      const canopy = new THREE.Group();
      canopy.name = "environment:bike:canopy";
      for (const [index, sector] of BIKE_STAND_SECTORS.entries()) {
        canopy.add(
          this.makeHorizontalArc(
            `environment:bike:canopy-sector-${index + 1}`,
            54.4,
            59,
            5.35,
            sector,
            canopyMat,
          ),
        );
      }
      this.environmentMidGroup.add(canopy);
      const ledMat = this.environmentBasicMat(
        "environment:bike:led-band-material",
        this.environment.venueAccent,
        { fog: true, side: THREE.BackSide },
      );
      const ledBands = new THREE.Group();
      ledBands.name = "environment:bike:led-bands";
      for (const [sectorIndex, sector] of BIKE_STAND_SECTORS.entries()) {
        for (const [heightIndex, y] of [1.02, 4.12].entries()) {
          ledBands.add(
            this.makeVerticalArc(
              `environment:bike:led-band-${sectorIndex + 1}-${heightIndex + 1}`,
              57.86,
              0.12,
              y,
              sector,
              ledMat,
            ),
          );
        }
      }
      this.environmentMidGroup.add(ledBands);
      const tierMat = this.environmentBasicMat(
        "environment:bike:stands-material",
        this.environment.midSilhouette,
        { side: THREE.DoubleSide, fog: true },
      );
      const stands = new THREE.Group();
      stands.name = "environment:bike:stands";
      for (const [innerRadius, outerRadius, y] of [
        [47.8, 51.2, 0.72],
        [50.8, 54.1, 1.52],
        [53.7, 57.2, 2.46],
      ] as const) {
        for (const sector of BIKE_STAND_SECTORS) {
          stands.add(
            this.makeHorizontalArc(
              "environment:bike:stands-tier",
              innerRadius,
              outerRadius,
              y,
              sector,
              tierMat,
            ),
          );
        }
      }
      this.environmentMidGroup.add(stands);
      this.addFloodlights(
        this.environmentDetailGroup,
        BIKE_FLOODLIGHTS,
        10 + this.cfg.environmentDetail * 2,
      );
      this.addScoreboard(this.environmentDetailGroup, BIKE_SCOREBOARD);
      if (this.cfg.environmentDetail >= 1)
        this.addPavilions(this.environmentDetailGroup, [BIKE_SERVICE_BUILDING]);
    }
  }

  private buildContactFootprints(): void {
    const geometry = this.track(new THREE.CircleGeometry(1, 28));
    const liveMaterial = this.mat(
      new THREE.MeshBasicMaterial({
        color: this.sport === "rower" ? 0x0b3442 : this.sport === "skierg" ? 0x70818d : 0x101820,
        transparent: true,
        opacity: this.sport === "rower" ? 0.11 : this.sport === "skierg" ? 0.17 : 0.23,
        depthWrite: false,
      }),
    );
    const ghostMaterial = this.mat(liveMaterial.clone());
    ghostMaterial.opacity *= 0.48;

    const makeFootprint = (
      lane: "live" | "ghost",
      material: THREE.MeshBasicMaterial,
    ): THREE.Group => {
      const footprint = new THREE.Group();
      footprint.name = `athlete:${lane}:contact-footprint`;
      footprint.userData.sport = this.sport;
      const addPatch = (
        suffix: string,
        along: number,
        across: number,
        length: number,
        width: number,
      ): void => {
        const patch = new THREE.Mesh(geometry, material);
        patch.name = `athlete:${lane}:contact-${suffix}`;
        // The parent is pitched into the course plane. Its local X axis is
        // travel and local Y is equipment lateral, so offsets remain authored
        // in the athlete's equipment coordinates around the whole lap.
        patch.position.set(along, across, 0);
        patch.scale.set(length, width, 1);
        patch.renderOrder = 1;
        footprint.add(patch);
      };

      if (this.sport === "rower") {
        addPatch("hull-reflection", 0, 0, 1.72, 0.12);
      } else if (this.sport === "skierg") {
        addPatch("ski-left", 0.08, -0.21, 0.98, 0.055);
        addPatch("ski-right", 0.08, 0.21, 0.98, 0.055);
      } else {
        addPatch("tyre-rear", -0.85, 0, 0.16, 0.075);
        addPatch("tyre-front", 0.85, 0, 0.16, 0.075);
      }

      // Default XYZ order would turn the ground plane upright at quarter laps.
      footprint.rotation.order = "YXZ";
      footprint.rotation.x = -Math.PI / 2;
      footprint.position.y = this.sport === "rower" ? 0.022 : 0.018;
      return footprint;
    };

    this.liveContactFootprint = makeFootprint("live", liveMaterial);
    this.ghostContactFootprint = makeFootprint("ghost", ghostMaterial);
    // Native High/Ultra shadows ground the solid live athlete. Leave the
    // authored contact treatment available only where native shadows are off;
    // the ghost remains decal-grounded because it deliberately does not cast.
    this.liveContactFootprint.visible = !this.liveShadowsActive();
    this.ghostContactFootprint.visible = false;
    this.scene.add(this.liveContactFootprint, this.ghostContactFootprint);
  }

  /**
   * Give snow and asphalt a restrained, geometry-owned material grain.  It is
   * deterministic and static (so no frame cost), works identically in WebGPU
   * and WebGL, and keeps the course free of an external bitmap dependency.
   */
  private makeGroundGeometry(): THREE.PlaneGeometry {
    const subdivision = this.profile.waves
      ? this.cfg.groundSegments
      : Math.max(12, Math.round(this.cfg.groundSegments * 0.7));
    const geometry = this.track(new THREE.PlaneGeometry(260, 260, subdivision, subdivision));
    if (this.profile.waves) return geometry;

    const positions = geometry.getAttribute("position");
    const colors = new Float32Array(positions.count * 3);
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const broad = Math.sin(x * 0.17 + y * 0.11) * 0.5 + Math.sin(x * 0.067 - y * 0.13) * 0.5;
      const fine = Math.sin(x * 0.91 + y * 1.17) * 0.5 + Math.sin(x * 1.73 - y * 0.61) * 0.5;
      if (this.sport === "skierg") {
        // Snow gets very shallow wind-packed undulations and a cool/bright
        // variation. Keep it below the course profile so poles and skis remain
        // visually and physically contact-locked.
        positions.setZ(index, broad * 0.012 + fine * 0.0035);
        const value = 0.92 + broad * 0.055 + fine * 0.015;
        colors[index * 3] = value * 0.97;
        colors[index * 3 + 1] = value;
        colors[index * 3 + 2] = Math.min(1, value * 1.025);
      } else {
        // Asphalt reads from a fine charcoal aggregate rather than a single
        // flat slab. The relief is intentionally near-zero so tyre shadows do
        // not shimmer or lift from the lane.
        positions.setZ(index, broad * 0.0025 + fine * 0.0012);
        const value = 0.79 + broad * 0.055 + fine * 0.028;
        colors[index * 3] = value * 0.94;
        colors[index * 3 + 1] = value * 0.97;
        colors[index * 3 + 2] = value;
      }
    }
    positions.needsUpdate = true;
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  private buildStaticScene(): void {
    const innerR = this.ghostRadius - 4;
    const outerR = this.loopRadius + 4;
    // The terrain extends behind the authored horizon/fog so its edge can
    // never reveal the alpha canvas. Rowing uses a clear-coated opaque water
    // body; snow and asphalt stay deliberately rough and grounded.
    const groundGeo = this.makeGroundGeometry();
    const groundMat = this.mat(
      this.profile.waves
        ? new THREE.MeshPhysicalMaterial({
            color: this.profile.groundColor("light"),
            transparent: false,
            opacity: 1,
            roughness: 0.12,
            metalness: 0.04,
            clearcoat: 0.95,
            clearcoatRoughness: 0.08,
            emissive: this.profile.groundColor("light"),
            emissiveIntensity: 0.55,
          })
        : new THREE.MeshStandardMaterial({
            color: this.profile.groundColor("light"),
            transparent: false,
            opacity: 1,
            roughness: this.sport === "skierg" ? 0.97 : 0.88,
            metalness: this.sport === "bike" ? 0.04 : 0.01,
            vertexColors: true,
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
    // Water already has the opaque physical ground receiver below it. Letting
    // its translucent lane overlay receive as well fragments a single hull
    // shadow into two offset layers as the waves animate.
    lane.receiveShadow = this.cfg.shadows && this.sport !== "rower";
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
      // Classic regatta buoy necklace: dense alternating warm/cool spheres on
      // the lane cables so the course reads as water lanes, not a toy ring.
      const buoyGeo = this.track(new THREE.SphereGeometry(0.095, 8, 5));
      this.buoyMat = this.mat(
        new THREE.MeshStandardMaterial({ color: hex(COLORS_LIGHT.markerCap), roughness: 0.52 }),
      );
      const rings = Array.from({ length: Math.max(2, this.cfg.buoyRings) }, (_, i) => {
        const t = this.cfg.buoyRings <= 1 ? 0.5 : i / (this.cfg.buoyRings - 1);
        return this.ghostRadius - 2.2 + (this.loopRadius + 4.6 - this.ghostRadius) * t;
      });
      const perRing = this.cfg.buoysPerRing;
      const inst = new THREE.InstancedMesh(buoyGeo, this.buoyMat, rings.length * perRing);
      inst.name = "environment:rower:buoy-strings";
      const m = new THREE.Matrix4();
      const warm = new THREE.Color(0xf6c453);
      const coral = new THREE.Color(0xf07167);
      const pale = new THREE.Color(0xf4fbff);
      const finishGap = degrees(14);
      let bi = 0;
      for (const r of rings) {
        for (let k = 0; k < perRing; k++) {
          const a = finishGap * 0.5 + ((k + 0.5) / perRing) * (FULL_CIRCLE - finishGap);
          m.makeScale(1, 0.58, 1);
          m.setPosition(r * Math.sin(a), 0.05, r * Math.cos(a));
          inst.setMatrixAt(bi++, m);
          const hue = k % 8 === 0 ? warm : k % 2 === 0 ? coral : pale;
          inst.setColorAt(bi - 1, hue);
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

    this.buildContactFootprints();
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
    if (this.renderer.shadowMap) {
      // High and Ultra keep their authored shadows through the first two
      // quality reductions. Only the emergency level that also removes spray
      // and dynamic water swaps to the deterministic contact-mark fallback.
      this.renderer.shadowMap.enabled = this.cfg.shadows && this.governor.level < 3;
      this.updateLiveContactFootprintVisibility();
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

  /** True while the live athlete has a native directional shadow receiver. */
  private liveShadowsActive(): boolean {
    return (
      this.cfg.shadows && this.sunLight.castShadow && this.renderer.shadowMap?.enabled !== false
    );
  }

  /**
   * Contact marks are a no-shadow fallback, not a second fake shadow. Keeping
   * the two systems mutually exclusive removes the dark double-images that
   * otherwise slide apart when a rig bobs or surges through a stroke.
   */
  private updateLiveContactFootprintVisibility(): void {
    if (this.liveContactFootprint) this.liveContactFootprint.visible = !this.liveShadowsActive();
  }

  /**
   * Follow the live athlete with a directional-light shadow camera while
   * snapping its origin in the camera's own X/Y plane. Raw world X/Z snapping
   * fails on a curved course because it does not align with the shadow texels;
   * light-space snapping prevents sub-texel shadow swimming without widening
   * the map or changing the art-directed sun direction.
   */
  private updateStableShadowAnchor(x: number, z: number): void {
    const target = this.shadowTarget.set(x, SHADOW_TARGET_HEIGHT, z);
    if (this.cfg.shadows) {
      const camera = this.sunLight.shadow.camera as THREE.OrthographicCamera;
      const mapSize = this.sunLight.shadow.mapSize;
      const texelX = (camera.right - camera.left) / Math.max(1, mapSize.x);
      const texelY = (camera.top - camera.bottom) / Math.max(1, mapSize.y);

      // DirectionalLightShadow uses a camera with world +X aligned to
      // cross(worldUp, targetToLight), and world +Y completing that frame.
      this.shadowDirection.copy(this.sunOffset).normalize();
      this.shadowRight.crossVectors(WORLD_UP, this.shadowDirection).normalize();
      this.shadowUp.crossVectors(this.shadowDirection, this.shadowRight).normalize();
      const alongRight = target.dot(this.shadowRight);
      const alongUp = target.dot(this.shadowUp);
      if (texelX > 0)
        target.addScaledVector(
          this.shadowRight,
          Math.round(alongRight / texelX) * texelX - alongRight,
        );
      if (texelY > 0)
        target.addScaledVector(this.shadowUp, Math.round(alongUp / texelY) * texelY - alongUp);
    }

    this.sunLight.position.copy(target).add(this.sunOffset);
    this.sunLight.target.position.copy(target);
    this.sunLight.target.updateMatrixWorld();
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
    const surge = reduce || this.profile.surgeAmp === 0 ? 0 : motion.surge * this.profile.surgeAmp;
    avatar.group.position.z = surge;
    // Hull roll mixes a slow ambient rock with a stroke-synced check so the
    // shell visibly loads at the catch instead of only drifting side to side.
    const ambientRoll = Math.sin(this.animPhase + cadence * 0.05) * 0.035;
    const strokeRoll = "surge" in motion ? motion.surge * 0.045 : 0;
    avatar.group.rotation.z = reduce || !this.profile.roll ? 0 : ambientRoll + strokeRoll;
    // Most contacts are local to their equipment. Nordic poles are different:
    // their basket has to stay fixed in the course while the skier advances and
    // folds through the drive. Resolve that only after the outer course pose,
    // bob and surge have all reached their final values for this frame.
    outer.updateMatrixWorld(true);
    avatar.resolveWorldContacts?.();
    avatar.v4Motion?.update(reduce ? REDUCED_REPLAY_POSES[this.sport] : pose);
    output.x = x;
    output.z = z;
    output.tx = tx;
    output.tz = tz;
    output.y = bob;
    return output;
  }

  render(state: RenderState, playing: boolean, themeName: "light" | "dark" = "light"): void {
    if (this.w === 0) return;
    try {
      this._renderImpl(state, playing, themeName);
    } catch (err) {
      // A single frame exception must not break the render loop permanently.
      // Log once per unique error and skip the frame so the next frame has a
      // chance to recover with fresh state.
      if (import.meta.env.DEV) console.warn("[renderer3d] frame skipped — render error:", err);
      this._renderErrorCount++;
      // After 5 consecutive failures, propagate the error so the page-level
      // safeRender wrapper can swap to its established 2D/Canvas fallback.
      if (this._renderErrorCount >= 5) {
        throw err;
      }
      return;
    }
    this._renderErrorCount = 0;
  }

  private _renderErrorCount = 0;

  private _renderImpl(state: RenderState, playing: boolean, themeName: "light" | "dark"): void {
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
          : Math.sin(ly * 0.22 + t) * 0.065 +
            Math.sin(ly * 0.38 + t * 0.74) * 0.028 +
            Math.sin(lx * 0.28 + t * 1.58) * 0.038 +
            Math.sin((lx + ly) * 0.11 - t * 0.55) * 0.034 +
            Math.sin(ly * 0.55 + t * 2.12) * 0.016 +
            Math.sin(lx * 0.82 - t * 2.95) * 0.012 +
            Math.sin(lx * 1.3 + ly * 0.45 + t * 1.23) * 0.008 +
            Math.sin(lx * 0.17 - ly * 0.62 + t * 3.4) * 0.006;
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

    const liveSurge = this.liveAvatar.group.position.z;
    this.liveContactFootprint.position.set(
      p.x + p.tx * liveSurge,
      this.sport === "rower" ? 0.022 : 0.018,
      p.z + p.tz * liveSurge,
    );
    // Local X is equipment travel: align the hull strip, both skis, or the
    // separate tyre patches to the independently solved course tangent.
    this.liveContactFootprint.rotation.y = Math.atan2(p.tx, p.tz) - Math.PI / 2;
    this.updateLiveContactFootprintVisibility();
    // Keep the expensive high-tier shadow map concentrated around the live
    // athlete, but stabilize its projection rather than letting it swim over
    // fractional texels as the athlete rounds the 70 m arena.
    this.updateStableShadowAnchor(p.x, p.z);

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
          const effort = 0.85 + clamp01(livePose.intensity) * 0.85;
          for (const side of [-1, 1]) {
            for (let k = 0; k < this.cfg.sprayPerCatch; k++) {
              pool.spawn(
                p.x + rx * off * side + (Math.random() - 0.5) * 0.42,
                0.1 + Math.random() * 0.08,
                p.z + rz * off * side + (Math.random() - 0.5) * 0.42,
                (rx * side * (0.35 + Math.random() * 0.7) - p.tx * (0.45 + Math.random() * 0.7)) *
                  effort,
                (1.35 + Math.random() * 1.55) * effort,
                (rz * side * (0.35 + Math.random() * 0.7) - p.tz * (0.45 + Math.random() * 0.7)) *
                  effort,
                0.45 + Math.random() * 0.38,
                (0.55 + Math.random() * 1.15) * effort,
              );
            }
          }
        } else if (
          playing &&
          this.sport === "rower" &&
          livePose.drive &&
          livePose.driveProgress > 0.08 &&
          livePose.driveProgress < 0.78 &&
          pool.alive < pool.capacity * 0.55
        ) {
          // A thin mid-drive mist keeps the blade contact readable between
          // catch bursts without filling the pool on every frame.
          const off = this.profile.sprayOffset ?? 0;
          const rx = p.x / this.loopRadius;
          const rz = p.z / this.loopRadius;
          for (const side of [-1, 1]) {
            if (Math.random() > 0.35) continue;
            pool.spawn(
              p.x + rx * off * side + (Math.random() - 0.5) * 0.25,
              0.08,
              p.z + rz * off * side + (Math.random() - 0.5) * 0.25,
              rx * side * 0.2 - p.tx * (0.4 + Math.random() * 0.4),
              0.35 + Math.random() * 0.55,
              rz * side * 0.2 - p.tz * (0.4 + Math.random() * 0.4),
              0.22 + Math.random() * 0.18,
              0.28 + Math.random() * 0.35,
            );
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
      this.ghostContactFootprint.visible = true;
      const ghostSurge = this.ghostAvatar.group.position.z;
      this.ghostContactFootprint.position.set(
        gp.x + gp.tx * ghostSurge,
        this.sport === "rower" ? 0.021 : 0.017,
        gp.z + gp.tz * ghostSurge,
      );
      this.ghostContactFootprint.rotation.y = Math.atan2(gp.tx, gp.tz) - Math.PI / 2;
      this.advanceWake(this.ghostWake, dGhost, gp.x - gp.tx * 1.6, gp.z - gp.tz * 1.6);
      const ghostText = `${state.ghost.label || "PB"} · ${Math.round(state.ghost.distFrac * 100)}%`;
      if (ghostText !== this.lastGhostLabel && this.ghostLabel && this.ghostLabelTex) {
        updateTextSprite(this.ghostLabel, this.ghostLabelTex, ghostText, C.labelBg, C.ghost);
        this.lastGhostLabel = ghostText;
      }
      this.ghostLabel.position.set(gp.x, 2.2 + gp.y, gp.z);
    } else {
      this.ghostGroup.visible = false;
      this.ghostContactFootprint.visible = false;
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
      this.sport === "rower" ? (state.ghost ? 2.02 : 1.78) : state.ghost ? 1.38 : 1.2;
    const baseBack = this.reduceMotion
      ? sportRig.back + 0.8 + ghostPullback
      : (sportRig.back + ghostPullback) * (narrow ? narrowScale : 1);
    const ahead = sportRig.ahead;
    // A static lateral offset is not an animation trigger. Preserve the full
    // three-quarter line on desktop; on the narrow SkiErg stage, ease toward
    // rear-three-quarter so both pole shafts survive the mobile pixel budget
    // instead of one disappearing behind the torso.
    const lateral = sportRig.lateral * (narrow && this.sport === "skierg" ? 0.68 : 1);
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
    // V4 owns lane-local skeleton/mixer/geometry/material resources. Remove it
    // before the generic scene walk so shared cache templates remain untouched.
    this.liveAvatar.v4Motion?.dispose();
    this.ghostAvatar.v4Motion?.dispose();
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
