import * as THREE from "three";
import {
  clamp01,
  degrees,
  FULL_CIRCLE,
  makeSkyRadianceTexture,
  roundedVenueBlockGeometry,
  themed,
  WORLD_UP,
  type EnvironmentSector,
  type EnvironmentStyle,
  type QualityConfig,
  type ThemeColor,
  type ThemeName,
} from "./renderer3dVenueKit";
import { EnvironmentBuilder, type EnvironmentBuildContext } from "./renderer3dEnvironment";
import type { ReplayRenderer, RenderState } from "./renderer";
import { COLORS_DARK, COLORS_LIGHT, REDUCED_REPLAY_POSES } from "./renderer";
import type { RenderQuality } from "./replayRenderer";
import { catchTransitions, fallbackStrokePose, type StrokePose } from "./strokeModel";
import {
  solveSkierElbowDirection,
  solveSkierKinematics,
  type SkierElbowDirection,
  type SkierKinematics,
} from "./sportKinematics";
import {
  createBikeMotionGraphScratch,
  createRowerMotionGraphScratch,
  sampleBikeMotionGraphInto,
  sampleRowerMotionGraphInto,
  SKI_POLE_APPROACH_START_CYCLE,
  type BikeMotionGraph,
} from "./motionGraph";
import { BIKE_RIG, bikeSaddleTopY, bikeWheelAxleY } from "./bikeRig";
import { buildBikeSaddleGeometry } from "./bikeSaddle";
import type { Sport } from "../types";
import { fmtPace } from "../format";
import { METERS_PER_CYCLE, ParticlePool, PerfGovernor, clampDt, dampFactor } from "./motion";
import { solveRigidContactPoint3D, solveTwoBone3D, type FigurePoint3 } from "./figurePose";
import {
  applyReplayAssetLibrary,
  hideWithReplayAssets,
  setReplayAssetSlot,
  setReplayAssetTemplateAnchor,
  type ReplayAssetLibrary,
  type ReplayAssetMaterialResolver,
  type ReplayAssetMaterialRole,
} from "./renderer3dAssets";
import {
  tryCreateReplayV4AthleteInstance,
  type ReplayV4AssetTemplate,
  type ReplayV4EffectorMetric,
} from "./renderer3dV4Assets";
import {
  installReplayV4MotionController,
  type ReplayV4MotionController,
  type ReplayV4SeatContract,
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
    buoysPerRing: 12,
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
    buoysPerRing: 18,
    buoyRings: 2,
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
    buoysPerRing: 22,
    buoyRings: 2,
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
    buoysPerRing: 28,
    buoyRings: 2,
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
  /**
   * Capture-only framing used by the visual-QA harness. It is reachable only
   * through an explicit replay QA query, never through normal replay controls.
   */
  qaCamera?: "normal" | "athlete-close" | "athlete-front" | "athlete-grip";
  /** Draw the live V4 skeleton over the real rendered athlete for QA evidence. */
  showV4Skeleton?: boolean;
}

/**
 * Convert a loaded V4 arm metric into the target reach owned by each sport rig.
 * RowErg solves from the wrist before applying its sampled palm offset; SkiErg
 * and BikeErg solve directly to palm contact, whose offset is already included
 * exactly once in `totalReach` by the asset loader.
 */
export function replayV4ArmContactReach(
  sport: Sport,
  effector: Pick<ReplayV4EffectorMetric, "proximalLength" | "distalLength" | "totalReach">,
): number {
  return sport === "rower" ? effector.proximalLength + effector.distalLength : effector.totalReach;
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
  // Row sits slightly lower and longer than before so the water plane and
  // softened far bank fill more of the frame, without clipping the scull.
  rower: { back: 4.05, height: 1.78, ahead: 0.88, lateral: 2.05, aimY: 0.84 },
  skierg: { back: 3.15, height: 2.3, ahead: 0.9, lateral: 1.86, aimY: 1.14 },
  bike: { back: 3.12, height: 1.96, ahead: 0.58, lateral: 1.92, aimY: 0.92 },
};

const BASE_CAMERA_FOV: Record<Sport, number> = {
  // Slightly tighter than Ski/Bike so the far bank compresses into fog; still
  // wide enough that the full scull span survives portrait viewports.
  rower: 40,
  skierg: 42,
  bike: 42,
};
const SPEED_CAMERA_FOV_GAIN = 2;

/**
 * The directional key is an art-directed world vector, not a camera light.
 * Keep this single source of truth for the light, its shadow camera, and the
 * visible sun disc so the lighting direction always reads coherently.
 */
const SUN_OFFSETS: Record<Sport, readonly [number, number, number]> = {
  rower: [-22, 18, 14],
  skierg: [16, 28, 10],
  bike: [12, 20, -10],
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
 * Art-directed venue palettes. Athlete accents remain deliberately absent:
 * physical scenery is shared by live and ghost competitors and never changes
 * material identity with lane colour.
 */
const ENVIRONMENTS: Record<Sport, EnvironmentStyle> = {
  rower: {
    // Bright temperate daylight. The earlier beige horizon flattened water,
    // woodland and mountains into one value family; this clearer blue/green
    // stack leaves enough luminance for real bank and building separation.
    skyZenith: themed(0x4b91bd, 0x0b2639),
    skyHorizon: themed(0xdceef1, 0x557c8c),
    skyNadir: themed(0x5f8f8e, 0x12333c),
    fog: themed(0xbfd4ca, 0x2e5059),
    fogNear: 62,
    fogFar: 178,
    hemisphereSky: themed(0xf2fbff, 0x7eabb9),
    hemisphereGround: themed(0x426c5b, 0x173535),
    hemisphereIntensity: 1.3,
    sun: themed(0xffedc1, 0xffce82),
    sunIntensity: 2.55,
    fill: themed(0xbfe9f1, 0x568b9a),
    fillIntensity: 0.7,
    exposure: 1.06,
    farSilhouette: themed(0x78947b, 0x23454a),
    midSilhouette: themed(0x3f6d50, 0x1c493d),
    venueStructure: themed(0xe8e4d8, 0x7f9093),
    venueAccent: themed(0xa65e3b, 0xd9a066),
    // Infield and apron are the same lake as the outer basin, not a second floor.
    infield: themed(0x2f8198, 0x124f62),
    apron: themed(0x3c91a3, 0x175a69),
    // No IBL. The basin is mostly a semi-transparent, low-roughness water
    // plane over a dark bed, and global image-based lighting lifts and
    // desaturates it across the whole surface: measured at -27 points of
    // saturation and -13 local contrast even at a third strength, which reads
    // as grey slack water instead of a teal lagoon. The per-material escape
    // hatch does not exist on the primary backend — Three r184 ignores
    // `envMapIntensity` on the WebGPU path (verified: changing it on both the
    // water and the lake bed moved zero pixels, while scene-level
    // `environmentIntensity` and ordinary material properties both did). Until
    // the water is reworked to take a Fresnel-weighted share, RowErg keeps its
    // art-directed rig. See docs/visual-qa/replay-premium-environments.md.
    envIntensity: 0,
    hemisphereIntensityIbl: 1.22,
  },
  skierg: {
    // Blue-hour dusk over a lit track. Snow against a bright sky can only
    // white-out — the daylight versions of this venue kept proving it — so the
    // contrast is flipped instead: deep blue-grey dome, near-black spruce, and
    // the groomed course as the brightest surface in frame under a warm
    // floodlight key. Two temperatures carry the scene — cold shadow snow,
    // warm lit snow — which is the Nordic night-race look, and it makes the
    // athlete's legibility structural rather than tuned: a jersey on lit snow
    // cannot vanish. Dark theme stays full night, so the pair reads as
    // dusk/night rather than day/night.
    skyZenith: themed(0x1f3c58, 0x102b45),
    skyHorizon: themed(0xa2b4c4, 0x6f8d9f),
    skyNadir: themed(0x7e97a9, 0x385669),
    fog: themed(0x64798c, 0x718d9b),
    fogNear: 74,
    fogFar: 205,
    hemisphereSky: themed(0xb9cfe2, 0xa0bfd0),
    hemisphereGround: themed(0x5d7789, 0x405c6d),
    hemisphereIntensity: 0.9,
    // The key is a floodlight now, not the sun: warm-white against the cold
    // ambient, at full strength so the lit snow genuinely separates.
    sun: themed(0xffe8c0, 0xeaf6ff),
    sunIntensity: 2.7,
    fill: themed(0x7fa3c4, 0x719bb5),
    fillIntensity: 0.62,
    exposure: 1.02,
    // Faint alpenglow: the far massif carries the day's last warmth while the
    // mid range has already gone cold — the one warm/cold seam in the backdrop.
    farSilhouette: themed(0x9a8b96, 0x506f82),
    midSilhouette: themed(0x435d72, 0x315267),
    venueStructure: themed(0x25394a, 0x192f3d),
    venueAccent: themed(0xe04852, 0xff6670),
    // Snow stays the brightest value in the frame — brighter than the horizon —
    // which is the entire point of the flip.
    infield: themed(0xcfdfe9, 0x9fb7c5),
    apron: themed(0xdfeaf1, 0xc7d7df),
    // Snow already bounces hard into the hemisphere light; a full-strength sky
    // on top of that is what blows the venue out to flat white.
    envIntensity: 0.62,
    hemisphereIntensityIbl: 0.36,
  },
  bike: {
    // Evening session under one warm cone. Indoor venues live or die on light
    // shaping, and a pale skylit hall gave the frame no shape at all: the
    // track band is the lit subject, the seating bowl falls toward shadow, and
    // the roof cavity stays dim so the architecture reads as enclosure rather
    // than as a second bright surface competing with the timber. Light theme
    // is the evening session; dark theme is the late session with the house
    // lights further down — same building, one hour apart.
    skyZenith: themed(0x2e3540, 0x1c2a38),
    skyHorizon: themed(0x4a4e54, 0x344252),
    skyNadir: themed(0x33383f, 0x202d36),
    fog: themed(0x3d4249, 0x2b3944),
    fogNear: 72,
    fogFar: 165,
    hemisphereSky: themed(0x8a8f96, 0x5f7485),
    hemisphereGround: themed(0x6b5844, 0x312d28),
    hemisphereIntensity: 1.15,
    // The one warm cone: a high haloed key doing the work the daylight did.
    sun: themed(0xffe2b0, 0xffd49a),
    sunIntensity: 3.5,
    fill: themed(0x7d94a8, 0x607e93),
    fillIntensity: 0.62,
    exposure: 1.16,
    farSilhouette: themed(0x525c63, 0x263442),
    midSilhouette: themed(0x454f58, 0x314352),
    venueStructure: themed(0x5a646c, 0x344452),
    venueAccent: themed(0xd79a50, 0xf0b667),
    infield: themed(0x6d7a74, 0x405149),
    apron: themed(0x847d70, 0x3c3c3a),
    // The pale roof acts as a broad indirect source; the generated radiance
    // map supplies that response without an external HDR panorama.
    envIntensity: 0.72,
    hemisphereIntensityIbl: 0.34,
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
const ARM_BEND_SCRATCH = new THREE.Vector3();

/**
 * Stable two-bone arm bend direction for equipment-locked hands.
 *
 * A fixed world hint (pure lateral / pure aft) flips elbows through the body
 * or into a chicken-wing when the grip path changes. Project a preferred
 * out/up/aft cue onto the plane perpendicular to the shoulder→hand chord so
 * the joint stays outside the torso and on the correct side of the arm.
 */
function setArmBendHint(
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

/**
 * Choose the continuous yaw branch on a rigid oar's inboard circle that
 * satisfies a requested shoulder-to-grip reach. The motion-graph yaw is used
 * only for a degenerate fallback and the later late-draw blend.
 *
 * The oar's local x axis is transformed by yaw then blade-depth roll. Solving
 * that circle analytically keeps the hot path allocation-free and prevents
 * early elbow flexion from compensating for an underspecified handle sweep.
 */
function solveRowerOarYaw(
  shoulder: THREE.Vector3,
  pinX: number,
  pinY: number,
  pinZ: number,
  signedInboard: number,
  bladeRoll: number,
  requestedReach: number,
  preferredYaw: number,
): number {
  const pinDeltaX = pinX - shoulder.x;
  const pinDeltaY = pinY - shoulder.y;
  const pinDeltaZ = pinZ - shoulder.z;
  // Three's XYZ Euler order sends an oar-local X vector to
  // (cos(roll)cos(yaw), sin(roll), -cos(roll)sin(yaw)). Blade burial therefore
  // contributes a yaw-independent vertical term; treating that Y offset as
  // part of the yaw circle shortened the grip reach as soon as the blade
  // squared and made both fallback elbows fold during the leg drive.
  const rollCos = Math.cos(bladeRoll);
  const rollSin = Math.sin(bladeRoll);
  const projectedX = pinDeltaX * rollCos;
  const projectedZ = -pinDeltaZ * rollCos;
  const amplitude = Math.hypot(projectedX, projectedZ);
  if (amplitude < 1e-8 || Math.abs(signedInboard) < 1e-8) return preferredYaw;

  const baseDistanceSquared =
    pinDeltaX * pinDeltaX +
    pinDeltaY * pinDeltaY +
    pinDeltaZ * pinDeltaZ +
    signedInboard * signedInboard;
  const cosine = THREE.MathUtils.clamp(
    (requestedReach * requestedReach -
      baseDistanceSquared -
      2 * signedInboard * pinDeltaY * rollSin) /
      (2 * signedInboard * amplitude),
    -1,
    1,
  );
  const center = Math.atan2(projectedZ, projectedX);
  const offset = Math.acos(cosine);
  const first = center + offset;
  // With regulation-scale inboards and the full-width rigger, this fixed
  // mirrored branch is the centreline/forward catch for both sculls. Never
  // choose per-frame by nearest angle or lateral distance: those scores can
  // exchange at a tangent and snap an otherwise continuous elbow across the
  // boat.
  return first;
}

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

const ROWER_FOOT_CONTACT = Object.freeze({
  lateral: 0.12,
  y: 0.35,
  z: 0.72,
});

/**
 * Low-poly single scull: long thin hull (capsule), a seated rower, and two oars
 * with blades. The lower hull stays neutral while the deck and oar blades carry
 * `userData.accent`; the rower slides + leans and the oars sweep/feather per
 * stroke.
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
      kitDarkMaterial,
    ),
    "equipment:row:hull",
  );
  hull.rotation.x = Math.PI / 2; // capsule axis Y -> Z (travel)
  hull.scale.set(0.55, 0.3, 1); // keep the fallback below the visible leg chain
  hull.position.y = 0.135;
  group.add(hull);

  // Two short decks leave a genuine cockpit opening around the athlete. The
  // old full-length slab hid both legs and made the seat look glued on top.
  const sternDeck = new THREE.Mesh(roundedVenueBlockGeometry(0.18, 0.045, 1.0, 0.022), accentMat());
  sternDeck.name = "rower-stern-deck";
  sternDeck.position.set(0, 0.275, -1.32);
  sternDeck.userData.accent = true;
  group.add(sternDeck);
  const bowDeck = new THREE.Mesh(roundedVenueBlockGeometry(0.17, 0.043, 0.94, 0.021), accentMat());
  bowDeck.name = "rower-bow-deck";
  bowDeck.position.set(0, 0.273, 1.42);
  bowDeck.userData.accent = true;
  group.add(bowDeck);
  const cockpitFloor = new THREE.Mesh(
    roundedVenueBlockGeometry(0.27, 0.025, 1.48, 0.01),
    kitDarkMaterial,
  );
  cockpitFloor.name = "rower-cockpit-floor";
  cockpitFloor.position.set(0, 0.17, 0.05);
  group.add(cockpitFloor);
  const sternStripe = new THREE.Mesh(
    roundedVenueBlockGeometry(0.04, 0.014, 0.74, 0.007),
    equipmentLightMaterial,
  );
  sternStripe.name = "rower-stern-deck-stripe";
  sternStripe.position.set(0, 0.305, -1.34);
  group.add(sternStripe);
  const bowStripe = sternStripe.clone();
  bowStripe.name = "rower-bow-deck-stripe";
  bowStripe.position.set(0, 0.304, 1.4);
  group.add(bowStripe);
  const gunwale = new THREE.Mesh(
    roundedVenueBlockGeometry(0.02, 0.032, 2.86, 0.009),
    equipmentLightMaterial,
  );
  gunwale.name = "rower-gunwale-left";
  gunwale.position.set(-0.15, 0.285, 0);
  group.add(gunwale);
  const gunwaleR = gunwale.clone();
  gunwaleR.name = "rower-gunwale-right";
  gunwaleR.position.x = 0.15;
  group.add(gunwaleR);

  const slideRails: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const rail = capsulePart(0.012, 1, equipmentMetalMaterial, "z");
    rail.name = side < 0 ? "rower-slide-rail-left" : "rower-slide-rail-right";
    rail.position.set(side * 0.078, 0.267, -0.16);
    slideRails.push(rail);
    group.add(rail);
  }

  const footPlate = new THREE.Mesh(
    roundedVenueBlockGeometry(0.38, 0.18, 0.04, 0.018),
    kitDarkMaterial,
  );
  footPlate.name = "rower-footplate";
  footPlate.position.set(0, 0.31, ROWER_FOOT_CONTACT.z);
  footPlate.rotation.x = -0.28;
  group.add(footPlate);
  const heelCups: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const heelCup = new THREE.Mesh(
      roundedVenueBlockGeometry(0.105, 0.065, 0.11, 0.016),
      equipmentGripMaterial,
    );
    heelCup.name = side < 0 ? "rower-heel-cup-left" : "rower-heel-cup-right";
    heelCup.position.set(
      side * ROWER_FOOT_CONTACT.lateral,
      ROWER_FOOT_CONTACT.y - 0.035,
      ROWER_FOOT_CONTACT.z - 0.03,
    );
    heelCup.rotation.x = -0.28;
    heelCups.push(heelCup);
    group.add(heelCup);
  }
  const instepBar = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.012, 0.336, 8, 12),
    equipmentMetalMaterial,
  );
  instepBar.name = "rower-footplate-instep-bar";
  instepBar.rotation.z = Math.PI / 2;
  instepBar.position.set(0, ROWER_FOOT_CONTACT.y + 0.06, ROWER_FOOT_CONTACT.z - 0.03);
  group.add(instepBar);
  const stretcherSupports: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const support = tubeBetween(
      side < 0 ? "rower-footplate-support-left" : "rower-footplate-support-right",
      { x: side * 0.17, y: 0.205, z: ROWER_FOOT_CONTACT.z - 0.12 },
      { x: side * 0.17, y: 0.31, z: ROWER_FOOT_CONTACT.z },
      0.009,
      equipmentMetalMaterial,
    );
    stretcherSupports.push(support);
    group.add(support);
  }
  for (const side of [-1, 1]) {
    const anchor = new THREE.Object3D();
    anchor.name = side < 0 ? "rower-footplate-contact-left" : "rower-footplate-contact-right";
    anchor.position.set(
      side * ROWER_FOOT_CONTACT.lateral,
      ROWER_FOOT_CONTACT.y,
      ROWER_FOOT_CONTACT.z,
    );
    group.add(anchor);
  }
  // V3 keeps the entire scull as one designed assembly while the existing
  // footplate contact nodes remain parented to the rig and authoritative.
  const boatVisual = new THREE.Group();
  boatVisual.name = "rower-boat-visual";
  group.add(boatVisual);
  setReplayAssetTemplateAnchor(boatVisual, "equipment:row:boat-assembly", {
    fallback: [
      hull,
      sternDeck,
      bowDeck,
      cockpitFloor,
      sternStripe,
      bowStripe,
      gunwale,
      gunwaleR,
      ...slideRails,
      footPlate,
      ...heelCups,
      instepBar,
      ...stretcherSupports,
    ],
  });

  // Rower in its own group so slide, layback, legs and arms all move from the
  // recorded stroke pose rather than as one rigid toy block.
  const rower = new THREE.Group();
  rower.name = "rower-athlete";
  const seatCarriage = new THREE.Group();
  seatCarriage.name = "rower-seat-carriage";
  seatCarriage.position.set(0, 0.29, -0.14);
  const seat = new THREE.Mesh(roundedVenueBlockGeometry(0.31, 0.055, 0.24, 0.04), kitMaterial);
  seat.name = "rower-seat";
  seat.position.y = 0.05;
  const seatFrame = new THREE.Mesh(
    roundedVenueBlockGeometry(0.28, 0.032, 0.2, 0.009),
    equipmentMetalMaterial,
  );
  seatFrame.name = "rower-seat-frame";
  seatFrame.position.y = 0.012;
  const seatRollers: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    for (const fore of [-1, 1]) {
      const roller = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.055, Math.max(12, eqCylSegs)),
        equipmentGripMaterial,
      );
      roller.name = `rower-seat-roller-${side < 0 ? "left" : "right"}-${fore < 0 ? "aft" : "fore"}`;
      roller.rotation.z = Math.PI / 2;
      roller.position.set(side * 0.078, -0.012, fore * 0.085);
      seatRollers.push(roller);
    }
  }
  seatCarriage.add(seat, seatFrame, ...seatRollers);
  setReplayAssetTemplateAnchor(seatCarriage, "equipment:row:seat-carriage", {
    fallback: [seat, seatFrame, ...seatRollers],
  });
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
  rower.add(seatCarriage, hips, torso);

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
    wristTarget: THREE.Vector3;
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
      wristTarget: new THREE.Vector3(),
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
      new THREE.CylinderGeometry(0.018, 0.021, 3.15, eqCylSegs),
      equipmentLightMaterial,
    );
    shaft.rotation.z = Math.PI / 2; // cylinder axis Y -> X
    shaft.position.x = side * 0.7;
    oar.add(shaft);
    const grip = capsulePart(0.021, 0.24, equipmentGripMaterial, "x");
    grip.name = side < 0 ? "rower-handle-left" : "rower-handle-right";
    // A regulation-scale scull has roughly 0.8–0.9 m of inboard leverage. The
    // shorter placeholder forced a false choice between centreline hands and
    // long arms; this reach lets both coexist while the fixed pin remains on
    // the rigger.
    grip.position.x = -side * 0.82;
    oar.add(grip);
    const handleAnchor = new THREE.Object3D();
    handleAnchor.name = side < 0 ? "rower-hand-contact-left" : "rower-hand-contact-right";
    // Land each palm eight centimetres outboard of the grip centre. The point
    // remains well inside the 28 cm rubber grip, while the resulting hand
    // separation prevents real scull handles from reading as crossed wrists
    // at the centreline.
    handleAnchor.position.x = -side * 0.74;
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
    // The 1.56 m span matches a full-width sculling rigger. Its pins sit beside
    // the athlete rather than ahead of the knees, keeping the grips on their
    // own lateral halves and the forearms clear of the torso.
    oar.position.set(side * 0.78, 0.38, 0.095);
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
  const UPPER_ARM_LENGTH = 0.39;
  const FOREARM_LENGTH = 0.38;
  const BASE_ARM_REACH = UPPER_ARM_LENGTH + FOREARM_LENGTH;
  const UPPER_ARM_SHARE = UPPER_ARM_LENGTH / BASE_ARM_REACH;
  let contactArmReach = BASE_ARM_REACH;
  // The athlete faces +Z: positive X rotation tips the spine toward the feet
  // at the catch, while negative rotation opens it into the finish. Keep this
  // hidden authority shoulder in the same frame as the V4 clip so its rigid
  // grip targets do not manufacture an early elbow fold.
  const BODY_PITCH_CATCH = 0.56;
  const BODY_PITCH_FINISH = -0.3;
  const PELVIS_PITCH_CATCH = 0.07;
  const PELVIS_PITCH_FINISH = -0.105;
  // Concept2 / scull handle path: early drive keeps grips forward so arms can
  // stay long; late draw brings the bar to the *lower chest / ribs*, not behind
  // the back (British Rowing / Concept2 finish coaching).
  const OAR_YAW_CATCH = 0.3;
  const OAR_YAW_SPAN = -0.58;
  // A scull blade is buried only just below the surface. The former deep roll
  // lifted the 0.82 m inboard handle by more than 11 cm during the first few
  // drive frames, making the otherwise closed-chain grip surge forward.
  const BLADE_DIP = 0.055;

  const handlePoint = new THREE.Vector3();
  const sampledV4Shoulders = [new THREE.Vector3(), new THREE.Vector3()] as const;
  const sampledV4ReachOrigins = [new THREE.Vector3(), new THREE.Vector3()] as const;
  const sampledV4ContactOffsets = [new THREE.Vector3(), new THREE.Vector3()] as const;
  const sampledV4ArmReaches: [number, number] = [BASE_ARM_REACH, BASE_ARM_REACH];
  let pendingBodySwing = 0;
  let pendingArmDraw = 0;
  let pendingShoulderSet = 0;
  let pendingHandleTravel = 0;
  const placeArms = (
    bodySwing: number,
    armDraw: number,
    shoulderSet: number,
    handleTravel: number,
    v4Refinement?: {
      readonly shoulders: readonly [THREE.Vector3, THREE.Vector3];
      readonly reachOrigins: readonly [THREE.Vector3, THREE.Vector3];
      readonly contactOffsets: readonly [THREE.Vector3, THREE.Vector3];
      readonly armReaches: readonly [number, number];
    },
  ): void => {
    // The shoulders lead the late draw but never detach from the torso. A
    // small catch protraction shortens the reach to a long handle; the finish
    // reverses it into a relaxed scapular set rather than folding the hands
    // through the jersey.
    const shoulderSpread = 0.25 + shoulderSet * 0.014;
    const shoulderHeight = 0.58 + (1 - shoulderSet) * 0.006 - shoulderSet * 0.008;
    const shoulderReach = 0.015 + (1 - handleTravel) * 0.028 - shoulderSet * 0.018;
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i];
      if (!arm) continue;
      const shoulderOverride = v4Refinement?.shoulders[i];
      if (shoulderOverride) {
        arm.shoulderPoint.copy(shoulderOverride);
      } else {
        arm.shoulderPoint
          .set(arm.side * shoulderSpread, shoulderHeight, shoulderReach)
          .applyQuaternion(torso.quaternion)
          .add(torso.position);
      }
      const oar = oars[i];
      if (!oar) continue;
      // Preserve the graph-authored sweep as the preferred solution, but make
      // the rigid inboard lever meet a long arm until the late draw. This is
      // the 3D equivalent of the Canvas closed-chain reach floor.
      // `armDraw` is already the graph's late, eased channel. Using it
      // directly spreads the handle close over the whole anatomical draw;
      // re-smoothing a narrow sub-range made the oar jump by ~10 degrees in a
      // single dense-sample frame and visibly snapped the elbow.
      const draw = THREE.MathUtils.clamp(armDraw, 0, 1);
      // V4 refinement supplies the sampled shoulder and its structural
      // shoulder-to-wrist reach. The sampled wrist-to-palm offset is applied
      // separately below, so the solve neither double-counts the hand nor
      // manufactures an early elbow fold.
      const activeArmReach =
        v4Refinement?.armReaches[i] ?? Math.max(BASE_ARM_REACH, contactArmReach);
      const activeUpperArmLength = activeArmReach * UPPER_ARM_SHARE;
      const activeForearmLength = activeArmReach - activeUpperArmLength;
      const longReachYaw = solveRowerOarYaw(
        v4Refinement?.reachOrigins[i] ?? arm.shoulderPoint,
        oar.group.position.x - rower.position.x,
        oar.group.position.y - rower.position.y,
        oar.group.position.z - rower.position.z,
        oar.handleAnchor.position.x,
        oar.group.rotation.z,
        activeArmReach - 0.002,
        oar.group.rotation.y,
      );
      // Finish at a realistic lower-rib draw. Public sculling coaching (e.g.
      // British Rowing / Concept2): hands draw *to the lower chest*, elbows
      // tuck beside/slightly behind the shoulder plane — never hauled through
      // the torso into an illegal behind-the-back finish.
      const drawYaw = -oar.side * 0.58;
      const yawDelta = Math.atan2(
        Math.sin(drawYaw - longReachYaw),
        Math.cos(drawYaw - longReachYaw),
      );
      oar.group.rotation.y = longReachYaw + yawDelta * draw;
      // Convert the oar-local grip endpoint into rower-local coordinates. Both
      // objects share the avatar group as parent, so this is exact even before
      // Three updates matrixWorld for the draw.
      handlePoint.copy(oar.handleAnchor.position).applyQuaternion(oar.group.quaternion);
      handlePoint.add(oar.group.position).sub(rower.position);
      arm.handTarget.copy(handlePoint);
      arm.wristTarget.copy(handlePoint);
      const v4ContactOffset = v4Refinement?.contactOffsets[i];
      if (v4ContactOffset) arm.wristTarget.sub(v4ContactOffset);
      // Elbow branch: clearly rearward of the shoulder with restrained lateral
      // clearance, while the palm target stays on the chest-level grip.
      setArmBendHint(arm.shoulderPoint, arm.wristTarget, arm.side, arm.bendHint, {
        lateral: -0.06 + draw * 0.09 + shoulderSet * 0.004,
        up: 0.06 + draw * 0.05,
        aft: -0.34 - bodySwing * 0.12 - handleTravel * 0.08 - draw * 0.34,
      });
      solveTwoBone3D(
        arm.shoulderPoint,
        arm.wristTarget,
        activeUpperArmLength,
        activeForearmLength,
        arm.bendHint,
        arm.elbowPoint,
        arm.handPoint,
      );
      arm.shoulder.position.copy(arm.shoulderPoint);
      placeFigureSegmentBetween(arm.upper, arm.shoulderPoint, arm.elbowPoint);
      placeFigureSegmentBetween(arm.forearm, arm.elbowPoint, arm.handPoint);
      arm.elbow.position.copy(arm.elbowPoint);
      orientElbowCuff(arm.elbow, arm.shoulderPoint, arm.elbowPoint, arm.handPoint, arm.side);
      // The visible V4 target is the palm contact, not its wrist bone. Keep the
      // hidden anatomical solve at the wrist while the terminal hand marker
      // remains exactly on the rigid grip.
      arm.hand.position.copy(arm.handTarget);
      // Palm faces the scull grip: wrap fingers around the handle so V4's grip
      // curl closes a fist *on* the rubber rather than an open mitt beside it.
      arm.hand.quaternion.copy(oar.group.quaternion);
      arm.hand.rotateZ(arm.side * (Math.PI / 2));
      arm.hand.rotateX(-0.55 - shoulderSet * 0.08);
      arm.hand.rotateY(arm.side * 0.12);
    }
  };

  const placeLegs = (legExtension: number): void => {
    for (const leg of legs) {
      // Hip is fixed relative to the rower group.
      leg.hipPoint.set(leg.side * 0.13, hips.position.y, hips.position.z);
      // The plate is in BOAT space, while these limbs live in the translating
      // rower group. Subtract the slide so the world foot contact stays fixed.
      leg.footTarget.set(
        leg.side * ROWER_FOOT_CONTACT.lateral,
        ROWER_FOOT_CONTACT.y - rower.position.y,
        ROWER_FOOT_CONTACT.z - rower.position.z,
      );
      // Keep the knees above the recessed cockpit without spreading them over
      // the gunwales. The old, wider/high marker made the leg chain read as a
      // separate object laid across the shell instead of a seated rower.
      leg.bendHint.set(leg.side * 0.42, 0.65 - legExtension * 0.06, -0.26);
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
      oar.group.position.y = 0.38;
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
    pendingBodySwing = graph.body.spineHinge.value;
    pendingArmDraw = graph.body.armDraw.value;
    pendingShoulderSet = graph.body.shoulderSet.value;
    pendingHandleTravel = graph.body.handleTravel.value;
    placeArms(pendingBodySwing, pendingArmDraw, pendingShoulderSet, pendingHandleTravel);
    return reduce
      ? STATIC_AVATAR_MOTION
      : { vertical: graph.accents.vertical.value, surge: graph.accents.surge.value };
  };

  const [leftArm, rightArm] = arms;
  const [leftLeg, rightLeg] = legs;
  if (!leftArm || !rightArm || !leftLeg || !rightLeg) {
    throw new Error("RowErg V4 target rig is incomplete");
  }
  const refineV4Targets = (motion: ReplayV4MotionController): void => {
    motion.getShoulderWorld("left", sampledV4Shoulders[0]);
    motion.getShoulderWorld("right", sampledV4Shoulders[1]);
    motion.getHandContactOffsetWorld("left", sampledV4ContactOffsets[0]);
    motion.getHandContactOffsetWorld("right", sampledV4ContactOffsets[1]);
    sampledV4ReachOrigins[0].copy(sampledV4Shoulders[0]).add(sampledV4ContactOffsets[0]);
    sampledV4ReachOrigins[1].copy(sampledV4Shoulders[1]).add(sampledV4ContactOffsets[1]);
    sampledV4ArmReaches[0] = motion.getArmReach("left");
    sampledV4ArmReaches[1] = motion.getArmReach("right");
    // The sampled bones and procedural authority live below the same avatar
    // parent, but RowErg limbs are authored in the translating seat frame.
    // Convert the real V4 shoulders into that frame before solving the fixed
    // oar-pin circles and shared elbow branch markers.
    rower.worldToLocal(sampledV4Shoulders[0]);
    rower.worldToLocal(sampledV4Shoulders[1]);
    rower.worldToLocal(sampledV4ReachOrigins[0]);
    rower.worldToLocal(sampledV4ReachOrigins[1]);
    sampledV4ContactOffsets[0].copy(sampledV4ReachOrigins[0]).sub(sampledV4Shoulders[0]);
    sampledV4ContactOffsets[1].copy(sampledV4ReachOrigins[1]).sub(sampledV4Shoulders[1]);
    placeArms(pendingBodySwing, pendingArmDraw, pendingShoulderSet, pendingHandleTravel, {
      shoulders: sampledV4Shoulders,
      reachOrigins: sampledV4ReachOrigins,
      contactOffsets: sampledV4ContactOffsets,
      armReaches: sampledV4ArmReaches,
    });
  };
  finalizeAvatar(group, castShadow, opacity);
  const rowerAvatar: Avatar = {
    group,
    animate,
    refineV4Targets,
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
  return rowerAvatar;
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
    cycle: 0,
    armPress: 0,
    hipHinge: 0,
    kneeFlex: 0,
    poleContact: 0,
    poleSweep: 0,
    elbowLoad: 0,
    armExtension: 0,
    poleLift: 0,
    poleFlight: 0,
    rebound: 0,
    surge: 0,
  };
  const elbowDirection: SkierElbowDirection = { vertical: -1, foreAft: 0 };

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
    const shaftGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, eqCylSegs);
    shaftGeo.rotateX(Math.PI / 2); // unit shaft lives on +Z for endpoint placement
    const shaft = setReplayAssetSlot(
      new THREE.Mesh(shaftGeo, side < 0 ? farPoleMaterial : poleMaterial),
      "equipment:ski:pole-shaft",
    );
    shaft.name = side < 0 ? "skierg-pole-shaft-left" : "skierg-pole-shaft-right";
    const grip = setReplayAssetSlot(
      capsulePart(0.018, 0.16, gripMaterial, "z"),
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
  const solvedHandWorld = new THREE.Vector3();
  const shoulderWorld = new THREE.Vector3();
  const sampledV4Shoulders = [new THREE.Vector3(), new THREE.Vector3()] as const;
  const tipLocalPoint = new THREE.Vector3();
  const groundUpLocal = new THREE.Vector3();
  const courseCenterAtPlant = new THREE.Vector3();
  const courseRightWorld = new THREE.Vector3();
  const courseForwardWorld = new THREE.Vector3();
  const inverseUpperWorld = new THREE.Quaternion();
  // Fixed arm lengths must contain every authored hand keyframe. A finish
  // target outside this reach collapses to a short pull no matter how far
  // aft the preferred Z claims to go.
  const UPPER_ARM_LENGTH = 0.49;
  const FOREARM_LENGTH = 0.47;
  const MAX_ARM_REACH = UPPER_ARM_LENGTH + FOREARM_LENGTH - 0.02;
  let contactArmReach = UPPER_ARM_LENGTH + FOREARM_LENGTH;
  const THIGH_LENGTH = 0.4;
  const SHIN_LENGTH = 0.39;
  // A 1.55 m classic-technique pole keeps the high catch reachable for this
  // human-scale athlete while still permitting an exact ground plant. The
  // former 1.42 m shaft was shorter than the catch hand's vertical clearance,
  // forcing an impossible last-frame hand drop at the cycle seam.
  const POLE_LENGTH = 1.55;
  const POLE_CONTACT_Y = 0.055;
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
  /**
   * Reference-backed sagittal hand arc.
   *
   * Radius encodes the observed early elbow flexion followed by near-extension
   * at pole-off. Angle carries the hand from high/forward to beside the thigh.
   * Unlike the former three-point line, this path never crosses close to the
   * shoulder, so the IK sphere intersection cannot flip into a horizontal
   * backwards elbow branch.
   */
  const skiPreferredHand = (motion: SkierKinematics, side: number, out: THREE.Vector3): void => {
    const reach = 0.44 - motion.elbowLoad * 0.08 + motion.armExtension * 0.36;
    const angle = 0.56 - motion.poleSweep * 2.56;
    out.set(side * 0.3, 0.54 + Math.sin(angle) * reach, 0.05 + Math.cos(angle) * reach);
    // Hard clamp: if authoring ever drifts outside reach, pull the target
    // toward the shoulder so the arm IK stays rigid.
    const sx = side * 0.25;
    const sy = 0.54;
    const sz = 0.05;
    const dx = out.x - sx;
    const dy = out.y - sy;
    const dz = out.z - sz;
    const dist = Math.hypot(dx, dy, dz);
    const maxReach = Math.min(MAX_ARM_REACH, Math.max(0.4, contactArmReach - 0.002));
    if (dist > maxReach && dist > 1e-6) {
      const scale = maxReach / dist;
      out.set(sx + dx * scale, sy + dy * scale, sz + dz * scale);
    }
  };

  let pendingPose = fallbackStrokePose("skierg", 0);
  let pendingMeters = 0;
  let pendingMotion: SkierKinematics = kinematics;
  let hasSampledV4Shoulders = false;

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
    const plantCycle = pose.index + (pose.cycleFrac >= SKI_POLE_APPROACH_START_CYCLE ? 1 : 0);
    const currentCycle = pose.index + pose.cycleFrac;
    const distanceSincePlant = (currentCycle - plantCycle) * Math.max(0, pose.strokeMeters);
    const courseTurn = (distanceSincePlant / CourseRenderer3D.LOOP_METERS) * Math.PI * 2;
    const cos = Math.cos(courseTurn);
    const sin = Math.sin(courseTurn);
    // Move the current course centre to the deterministic catch position. At
    // the C2-flat flight apex this switches invisibly to the next catch, then
    // the recovery arc converges continuously instead of dropping at preplant.
    courseCenterAtPlant.set(
      outer.position.x * cos - outer.position.z * sin,
      POLE_CONTACT_Y,
      outer.position.x * sin + outer.position.z * cos,
    );
    const yaw = outer.rotation.y - courseTurn;
    // Plant just outside the ski and behind the high handle. The previous
    // 1.15 m forward offset reversed this relationship, so the shaft pointed
    // forward at impact instead of slanting backward into the snow.
    const localX = side * 0.49;
    const localZ = 0.04;
    output.set(
      courseCenterAtPlant.x + localX * Math.cos(yaw) + localZ * Math.sin(yaw),
      POLE_CONTACT_Y,
      courseCenterAtPlant.z - localX * Math.sin(yaw) + localZ * Math.cos(yaw),
    );
  };

  const placePoleArms = (motion: SkierKinematics, pose: StrokePose, meters: number): void => {
    const outer = group.parent;
    if (!outer) return;
    upper.getWorldQuaternion(inverseUpperWorld).invert();
    groundUpLocal.set(0, 1, 0).applyQuaternion(inverseUpperWorld).normalize();
    // Recovery free-tip directions live in the course frame so the lap turn
    // does not counter-rotate the pole sweep.
    courseRightWorld.set(1, 0, 0).transformDirection(outer.matrixWorld);
    courseForwardWorld.set(0, 0, 1).transformDirection(outer.matrixWorld);
    solveSkierElbowDirection(motion, elbowDirection);
    // The bend plane follows the technique phase instead of holding one fixed
    // down/forward vector for the whole cycle. Local -y points down, local -z
    // is rearward. During recovery the hand/pole path itself lifts and travels
    // forward while this hint takes the shortest sagittal route back underneath
    // the arm. A small side-out component preserves anatomical clearance
    // without creating the former horizontal goalpost silhouette.
    const bendLateral = 0.08 + motion.elbowLoad * 0.04 + motion.poleFlight * 0.015;
    const bendUp = elbowDirection.vertical * 0.78;
    const bendAft = elbowDirection.foreAft * 0.78;
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i];
      const pole = poles[i];
      if (!arm || !pole) continue;
      // Shoulders live on the hinging upper body; refresh the local origin so
      // the press tracks torso pitch instead of a stale rest pose.
      if (hasSampledV4Shoulders) arm.shoulderPoint.copy(sampledV4Shoulders[i]!);
      else arm.shoulderPoint.set(arm.side * 0.25, 0.54, 0.05);
      // Start from the authored double-pole arc, then solve the exact rigid
      // pole/arm closure once the course-space basket position is known.
      skiPreferredHand(motion, arm.side, arm.handTarget);
      // Keep the elbow close to the sagittal plane with modest anatomical
      // clearance. This target also drives the V4 post-clip arm correction;
      // preserving the old clip plane is what produced the backwards goalpost.
      setArmBendHint(arm.shoulderPoint, arm.handTarget, arm.side, arm.bendHint, {
        lateral: bendLateral,
        up: bendUp,
        aft: bendAft,
      });

      desiredHandWorld.copy(arm.handTarget);
      upper.localToWorld(desiredHandWorld);

      setPlantTipWorld(plantTipWorld, arm.side, pose, meters, outer);

      // The free basket trails the hand in the course frame. Its shaft rotates
      // from the measured shallow pole-off attitude (~23°) toward a steep
      // plant (~80°), while a clearance envelope keeps it above the snow.
      const poleAngle = THREE.MathUtils.degToRad(80 - motion.poleSweep * 57);
      const clearance = 0.08 + motion.poleLift * 0.3;
      const desiredVertical = -Math.sin(poleAngle) * POLE_LENGTH;
      const vertical = Math.min(
        POLE_LENGTH * 0.985,
        Math.max(
          -POLE_LENGTH * 0.985,
          desiredVertical,
          POLE_CONTACT_Y + clearance - desiredHandWorld.y,
        ),
      );
      const horizontal = Math.sqrt(Math.max(0, POLE_LENGTH * POLE_LENGTH - vertical * vertical));
      const lateral = arm.side * 0.22;
      const forward = -Math.sqrt(1 - lateral * lateral);
      freeTipWorld
        .copy(desiredHandWorld)
        .addScaledVector(courseRightWorld, lateral * horizontal)
        .addScaledVector(courseForwardWorld, forward * horizontal);
      freeTipWorld.y += vertical;

      // Match basket velocity at both ends of flight. Contact can therefore
      // switch from ground authority to the free arc without a one-frame tip
      // or grip jump, and late recovery converges on the next plant instead of
      // dropping vertically from an unrelated sweep.
      freeTipWorld.lerp(plantTipWorld, 1 - motion.poleFlight);
      tipWorld.lerpVectors(freeTipWorld, plantTipWorld, motion.poleContact);

      shoulderWorld.copy(arm.shoulderPoint);
      upper.localToWorld(shoulderWorld);
      // `contactArmReach` includes the palm offset beyond the terminal hand
      // bone. Reserve only solver epsilon: subtracting the palm length—or
      // counting it twice—breaks the visible V4 reach contract.
      const maximumReach = Math.min(MAX_ARM_REACH, Math.max(0.4, contactArmReach - 0.002));
      solveRigidContactPoint3D(
        shoulderWorld,
        desiredHandWorld,
        tipWorld,
        POLE_LENGTH,
        Math.abs(UPPER_ARM_LENGTH - FOREARM_LENGTH) + 0.008,
        maximumReach,
        solvedHandWorld,
      );
      arm.handTarget.copy(solvedHandWorld);
      upper.worldToLocal(arm.handTarget);
      // Recompute the bend plane from the solved target. This keeps the elbow
      // on its anatomical outside/back branch instead of preserving a hint for
      // a preferred point the hand no longer occupies.
      setArmBendHint(arm.shoulderPoint, arm.handTarget, arm.side, arm.bendHint, {
        lateral: bendLateral,
        up: bendUp,
        aft: bendAft,
      });

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

      // The solved hand and the basket are the endpoints of one rigid pole in
      // every phase. Neither planted nor recovering hardware may telescope.
      tipLocalPoint.copy(tipWorld);
      upper.worldToLocal(tipLocalPoint);
      placeFigureSegmentBetween(pole.shaft, arm.handPoint, tipLocalPoint);
      pole.grip.position.copy(arm.handPoint);
      pole.grip.quaternion.copy(pole.shaft.quaternion);
      pole.basket.position.copy(tipLocalPoint).addScaledVector(groundUpLocal, 0.026);
      pole.basket.quaternion.copy(inverseUpperWorld);
      pole.tipAnchor.position.copy(tipLocalPoint);
      // Establish the terminal frame only after the current-frame rigid pole
      // has been placed. The old mild assignment here overwrote the intended
      // pole wrap above, leaving both procedural and V4 hands open against the
      // grip even though their contact points were numerically coincident.
      arm.hand.quaternion.copy(pole.grip.quaternion);
      arm.hand.rotateX(1.15);
      arm.hand.rotateZ(arm.side * 0.2);
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
    hasSampledV4Shoulders = false;
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
    placePoleArms(pendingMotion, pendingPose, pendingMeters);
  };

  const refineV4Targets = (motion: ReplayV4MotionController): void => {
    motion.getShoulderWorld("left", sampledV4Shoulders[0]);
    motion.getShoulderWorld("right", sampledV4Shoulders[1]);
    // The pole authority and the V4 skin share the avatar parent but not the
    // same torso node. Convert the visible shoulder roots into the pole
    // solver's frame before the final course-space contact pass.
    upper.worldToLocal(sampledV4Shoulders[0]);
    upper.worldToLocal(sampledV4Shoulders[1]);
    hasSampledV4Shoulders = true;
  };

  const [leftArm, rightArm] = arms;
  const [leftLeg, rightLeg] = legParts;
  if (!leftArm || !rightArm || !leftLeg || !rightLeg) {
    throw new Error("SkiErg V4 target rig is incomplete");
  }
  finalizeAvatar(group, castShadow, opacity);
  const skiAvatar: Avatar = {
    group,
    animate,
    refineV4Targets,
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
  return skiAvatar;
}

/** Chainring pitch radius (≈50T) in the shared metric bike space. */
const CHAINRING_RADIUS = 0.098;
/** Rear sprocket pitch radius (≈17T). */
const COG_RADIUS = 0.043;
/** Drive-side chainline offset from the frame centreline. */
const CHAIN_X = -0.045;

/**
 * Centreline of a chain wrapped around two sprockets, as a closed loop.
 *
 * A chain is two external tangents plus the arcs it wraps, so this solves for
 * the tangent contact angle rather than drawing a straight line between two
 * eyeballed points. `beta` is the tilt of the tangent caused by the sprockets
 * having different radii; at equal radii it collapses to zero and the tangents
 * are parallel to the centre line, as they should be.
 */
export function bikeChainPath(
  ring: { y: number; z: number },
  ringRadius: number,
  cog: { y: number; z: number },
  cogRadius: number,
  x: number,
): THREE.Vector3[] {
  const dz = cog.z - ring.z;
  const dy = cog.y - ring.y;
  const span = Math.hypot(dz, dy);
  const alpha = Math.atan2(dy, dz);
  const beta = Math.asin(Math.max(-1, Math.min(1, (ringRadius - cogRadius) / span)));
  const tangent = Math.PI / 2 - beta;
  // Increasing angle runs the loop the correct way round both sprockets: over
  // the top of the chainring's front, back along the top run, around the rear
  // of the cog, and forward along the bottom run.
  const ringLow = alpha + tangent;
  const ringHigh = alpha - tangent + Math.PI * 2;
  const points: THREE.Vector3[] = [];
  const arc = (
    centre: { y: number; z: number },
    radius: number,
    from: number,
    to: number,
    steps: number,
  ): void => {
    for (let i = 0; i <= steps; i++) {
      const angle = from + ((to - from) * i) / steps;
      points.push(
        new THREE.Vector3(
          x,
          centre.y + radius * Math.sin(angle),
          centre.z + radius * Math.cos(angle),
        ),
      );
    }
  };
  arc(ring, ringRadius, ringLow, ringHigh, 14);
  arc(cog, cogRadius, alpha - tangent, alpha + tangent, 10);
  return points;
}

/**
 * Seat contract for the V4 controller, in avatar-group-local space.
 *
 * Only BikeErg has one: the rower sits on a sliding seat their pelvis marker
 * already tracks exactly, and the skier stands. Returning `undefined` for those
 * leaves their pelvis alignment exact rather than merely bounded.
 */
function bikeSeatContract(sport: Sport): ReplayV4SeatContract | undefined {
  if (sport !== "bike") return undefined;
  return {
    padTopY: bikeSaddleTopY(BIKE_RIG),
    sitSurfaceOffsetY: BIKE_RIG.rider.sitSurfaceFromHip[1] ?? -0.2,
    nestle: BIKE_RIG.rider.sitNestle ?? 0.005,
    // The clip's own hip pitch is the only thing this absorbs; anything larger
    // means the rig and the saddle have genuinely drifted apart.
    maxLift: 0.08,
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
  // Vulcanised rubber is nearly black and almost fully diffuse. The old tyre
  // was a mid blue-grey at roughness 0.4 with a touch of metalness, which is
  // why the wheels read as moulded plastic no matter how good the shape was.
  const tyreMaterial = humanMat(0x17191b, 0.95, 0);
  // Bar tape and hoods: matte, slightly warmer than the tyre so the two dark
  // materials stay separable where the hand meets the bar.
  const equipmentMaterial = humanMat(0x24282c, 0.88, 0.02);
  // Butted stainless spokes and a machined rim — bright, but not chrome.
  const spokeMaterial = humanMat(0xb9c2c9, 0.34, 0.72);
  const hubMaterial = humanMat(0x2b3238, 0.42, 0.55);
  // A black saddle is realistic and unreadable: it merges with both the dark
  // kit above it and the dark track behind it, which is how "is the rider
  // actually on the seat?" became impossible to answer by eye. A grey-topped
  // saddle keeps the semantic contrast rule and makes the contact legible.
  const saddleMaterial = humanMat(0x9aa2a8, 0.66, 0.04);
  // Alloy crank and clipless body: darker and rougher than the spokes.
  const crankMaterial = humanMat(0x8f979d, 0.44, 0.7);
  const pedalMaterial = humanMat(0x2a2e32, 0.6, 0.35);
  // A chain is oiled steel: darker than bare alloy, and glossier than the
  // frame because the oil film is what catches the light.
  const chainMaterial = humanMat(0x6d7278, 0.38, 0.86);
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
  const wheelR = BIKE_RIG.wheelRadius;
  const tyreTube = BIKE_RIG.tyreTube;
  // Axle height includes tyre tube so the outer shell rests on y = 0 — never
  // through the ground (穿模).  Bike has two equal wheels; both touch the
  // ground plane without clipping through it.
  const wheelAxleY = bikeWheelAxleY(BIKE_RIG);
  const wheels: THREE.Group[] = [];
  for (const z of [BIKE_RIG.frontAxleZ, BIKE_RIG.rearAxleZ]) {
    const wheel = new THREE.Group();
    wheel.name = z > 0 ? "bike-wheel-front" : "bike-wheel-rear";
    const tyre = setReplayAssetSlot(
      new THREE.Mesh(
        new THREE.TorusGeometry(wheelR, tyreTube, eqCylSegs, eqCylSegs * 2),
        tyreMaterial,
      ),
      "equipment:bike:tyre",
    );
    tyre.rotation.y = Math.PI / 2; // axle along X (perpendicular to travel)
    wheel.add(tyre);
    const wheelFallback: THREE.Object3D[] = [tyre];
    // Nine spoke pairs — eighteen visible arms, the density that reads as a
    // laced wheel at chase distance without paying for a real 32-spoke lacing.
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI;
      const spoke = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0022, 0.0022, wheelR * 1.94, eqCylSegs),
        spokeMaterial,
      );
      spoke.name = `${wheel.name}-spoke-${i}`;
      spoke.rotation.x = angle;
      wheel.add(spoke);
      wheelFallback.push(spoke);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.1, 12), hubMaterial);
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
    wheel.position.set(0, wheelAxleY, z);
    group.add(wheel);
    wheels.push(wheel);
  }

  // Clean diamond frame — down tube, seat tube, top tube, and head tube form
  // the main triangle.  Paired chain- and seat-stays complete the rear end.
  const bottomBracket = {
    x: 0,
    y: BIKE_RIG.bottomBracket[1] ?? 0,
    z: BIKE_RIG.bottomBracket[2] ?? -0.05,
  };
  const seatCluster = {
    x: 0,
    y: BIKE_RIG.seatCluster[1] ?? 0,
    z: BIKE_RIG.seatCluster[2] ?? -0.24,
  };
  const headBottom = { x: 0, y: BIKE_RIG.headBottom[1] ?? 0, z: BIKE_RIG.headBottom[2] ?? 0.38 };
  const headTop = { x: 0, y: BIKE_RIG.headTop[1] ?? 0, z: BIKE_RIG.headTop[2] ?? 0.34 };
  const frameFallback: THREE.Object3D[] = [];
  // Real road tubing: ~35 mm down tube tapering to ~28 mm stays. The previous
  // 55 mm tubes were sized for a bike half again too big and read as scaffolding.
  const downTube = accentPart(
    tubeBetween("bike-down-tube", bottomBracket, headBottom, 0.0185, accentMat()),
  );
  setReplayAssetSlot(downTube, "equipment:bike:frame-tube");
  const seatTube = accentPart(
    tubeBetween("bike-seat-tube", bottomBracket, seatCluster, 0.0165, accentMat()),
  );
  setReplayAssetSlot(seatTube, "equipment:bike:frame-tube");
  const topTube = accentPart(
    tubeBetween("bike-top-tube", seatCluster, headTop, 0.015, accentMat()),
  );
  setReplayAssetSlot(topTube, "equipment:bike:frame-tube");
  const headTube = accentPart(
    tubeBetween("bike-head-tube", headBottom, headTop, 0.021, accentMat()),
  );
  setReplayAssetSlot(headTube, "equipment:bike:frame-tube");
  group.add(downTube, seatTube, topTube, headTube);
  frameFallback.push(downTube, seatTube, topTube, headTube);
  for (const side of [-1, 1]) {
    const rearAxle = { x: side * 0.055, y: wheelAxleY, z: BIKE_RIG.rearAxleZ };
    const bbSide = { ...bottomBracket, x: side * 0.036 };
    const seatSide = { ...seatCluster, x: side * 0.026 };
    const chainStay = accentPart(
      tubeBetween("bike-chain-stay", rearAxle, bbSide, 0.0115, accentMat()),
    );
    const seatStay = accentPart(
      tubeBetween("bike-seat-stay", rearAxle, seatSide, 0.0095, accentMat()),
    );
    setReplayAssetSlot(chainStay, "equipment:bike:frame-tube");
    setReplayAssetSlot(seatStay, "equipment:bike:frame-tube");
    group.add(chainStay, seatStay);
    frameFallback.push(chainStay, seatStay);
    // Fork blades run from the crown down to the axle, so the front wheel is
    // carried on the steering axis rather than hung off a single raked spar.
    const frontAxlePt = { x: side * 0.048, y: wheelAxleY, z: BIKE_RIG.frontAxleZ };
    const crown = { x: side * 0.022, y: headBottom.y - 0.012, z: headBottom.z + 0.004 };
    const forkBlade = accentPart(
      tubeBetween(
        `bike-fork-blade-${side > 0 ? "right" : "left"}`,
        crown,
        frontAxlePt,
        0.0115,
        accentMat(),
      ),
    );
    setReplayAssetSlot(forkBlade, "equipment:bike:frame-tube");
    group.add(forkBlade);
    frameFallback.push(forkBlade);
  }

  // Cranks: spin about the bottom bracket (X axis) with two pedals.
  const cranks = new THREE.Group();
  cranks.name = "bike-cranks";
  cranks.position.set(bottomBracket.x, bottomBracket.y, bottomBracket.z);
  // Chain ring — a toroidal disc at the bottom bracket.
  const chainRing = new THREE.Mesh(
    new THREE.TorusGeometry(CHAINRING_RADIUS, 0.006, eqCylSegs, eqCylSegs * 2),
    chainMaterial,
  );
  chainRing.name = "bike-chain-ring";
  chainRing.rotation.y = Math.PI / 2;
  cranks.add(chainRing);
  const drivetrainFallback: THREE.Object3D[] = [chainRing];
  const pedals: Array<{ side: number; crankY: number }> = [];
  for (const side of [-1, 1]) {
    const crankY = side * BIKE_RIG.crank.pedalRadius;
    // The arm is what makes a crank read as a crank; a pedal alone floats.
    const crankArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.017, BIKE_RIG.crank.pedalRadius, 0.03),
      crankMaterial,
    );
    crankArm.name = side < 0 ? "bike-crank-arm-left" : "bike-crank-arm-right";
    crankArm.position.set(side * 0.038, crankY / 2, 0);
    cranks.add(crankArm);
    drivetrainFallback.push(crankArm);

    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.014, 0.062), pedalMaterial);
    setReplayAssetSlot(pedal, "equipment:bike:pedal");
    pedal.name = side < 0 ? "bike-pedal-left" : "bike-pedal-right";
    pedal.position.set(side * BIKE_RIG.crank.lateral, crankY, 0);
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

  // Rear cassette, so the chain has something real to wrap at the back.
  const cassette = new THREE.Mesh(
    new THREE.CylinderGeometry(COG_RADIUS, COG_RADIUS, 0.026, eqCylSegs),
    chainMaterial,
  );
  cassette.name = "bike-cassette";
  cassette.rotation.z = Math.PI / 2;
  cassette.position.set(CHAIN_X, wheelAxleY, BIKE_RIG.rearAxleZ);
  group.add(cassette);
  frameFallback.push(cassette);

  // One closed chain loop that runs tangent to both sprockets and wraps them.
  // The previous chain was 48 straight tubes between two arbitrary points that
  // touched neither the chainring nor the cassette, so the drivetrain read as
  // a floating line rather than a transmission.
  const chain = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(
        bikeChainPath(
          { y: bottomBracket.y, z: bottomBracket.z },
          CHAINRING_RADIUS,
          { y: wheelAxleY, z: BIKE_RIG.rearAxleZ },
          COG_RADIUS,
          CHAIN_X,
        ),
        true,
        "centripetal",
      ),
      96,
      0.0042,
      Math.max(4, Math.round(eqCylSegs / 2)),
      true,
    ),
    chainMaterial,
  );
  chain.name = "bike-chain";
  group.add(chain);
  frameFallback.push(chain);

  // Seat post — visible tube from the seat cluster up to the saddle shell.
  // It stops at the pad underside: the rider's sit surface is one nestle above
  // the pad top, so a post that outruns the cushion goes through the athlete.
  const seatPost = tubeBetween(
    "bike-seat-post",
    seatCluster,
    { x: 0, y: BIKE_RIG.saddleClamp[1] ?? 0, z: BIKE_RIG.saddleClamp[2] ?? 0 },
    0.0135,
    accentMat(),
  );
  setReplayAssetSlot(seatPost, "equipment:bike:frame-tube");
  group.add(seatPost);
  frameFallback.push(seatPost);

  // Winged, cut-out performance saddle from the shared BIKE_SADDLE contract —
  // the same table the authored V3 pad and the penetration guard read, so the
  // cushion the tests trust is the cushion this renderer draws. Geometry
  // contact (sit surface on pad top) owns the no-穿模 contract; depthWrite
  // stays on so the cushion remains a solid support rather than a draw-order
  // band-aid over a penetrating mesh.
  const saddle = new THREE.Mesh(
    buildBikeSaddleGeometry(THREE, {
      lateralSegments: Math.max(4, Math.round(eqCylSegs / 3)),
      stationsPerSpan: bodySegments >= 16 ? 2 : 1,
    }),
    saddleMaterial,
  );
  setReplayAssetSlot(saddle, "equipment:bike:saddle");
  saddle.name = "bike-saddle";
  saddle.position.set(BIKE_RIG.saddle[0] ?? 0, BIKE_RIG.saddle[1] ?? 0, BIKE_RIG.saddle[2] ?? 0);
  group.add(saddle);
  frameFallback.push(saddle);

  // Stem — connects the handlebar to the head tube so the cockpit doesn't float.
  const stem = tubeBetween(
    "bike-stem",
    headTop,
    { x: 0, y: BIKE_RIG.handlebar.base[1] ?? 0, z: BIKE_RIG.handlebar.base[2] ?? 0 },
    0.0125,
    accentMat(),
  );
  setReplayAssetSlot(stem, "equipment:bike:frame-tube");
  group.add(stem);
  frameFallback.push(stem);

  const handlebar = new THREE.Group();
  handlebar.name = "bike-handlebar";
  const barHalfSpan = BIKE_RIG.handlebar.grip.halfSpan;
  const gripLocalY = BIKE_RIG.handlebar.grip.y - (BIKE_RIG.handlebar.base[1] ?? 0);
  const gripLocalZ = BIKE_RIG.handlebar.grip.z - (BIKE_RIG.handlebar.base[2] ?? 0);
  const crossbar = capsulePart(0.0125, barHalfSpan * 2, equipmentMaterial, "x");
  handlebar.add(crossbar);
  frameFallback.push(crossbar);
  const barContacts: Array<{ side: number; anchor: THREE.Object3D }> = [];
  for (const side of [-1, 1]) {
    // A drop bar, not a straight rod: the tops sweep forward into a shaped
    // hood that the palm closes over, then the drop curves down and back.
    // The hand contact anchor stays exactly on the hood, so the IK target is
    // unchanged by any of this shaping.
    const hoodCurve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(side * barHalfSpan, 0, 0),
        new THREE.Vector3(side * barHalfSpan, gripLocalY * 0.45, gripLocalZ * 0.55),
        new THREE.Vector3(side * barHalfSpan, gripLocalY, gripLocalZ),
        new THREE.Vector3(side * barHalfSpan, gripLocalY - 0.045, gripLocalZ + 0.045),
        new THREE.Vector3(side * barHalfSpan, gripLocalY - 0.115, gripLocalZ + 0.012),
      ],
      false,
      "centripetal",
    );
    const grip = new THREE.Mesh(
      new THREE.TubeGeometry(hoodCurve, 18, 0.0125, Math.max(4, Math.round(eqCylSegs / 2)), false),
      equipmentMaterial,
    );
    grip.name = side < 0 ? "bike-handlebar-grip-left" : "bike-handlebar-grip-right";

    // The hood body itself — the raised lever housing the palm rests on.
    const hood = new THREE.Mesh(
      roundedVenueBlockGeometry(0.036, 0.036, 0.105, 0.016),
      equipmentMaterial,
    );
    hood.name = side < 0 ? "bike-brake-hood-left" : "bike-brake-hood-right";
    hood.position.set(side * barHalfSpan, gripLocalY + 0.012, gripLocalZ - 0.012);
    hood.rotation.x = -0.24;

    const anchor = new THREE.Object3D();
    anchor.name = side < 0 ? "bike-hand-contact-left" : "bike-hand-contact-right";
    anchor.position.set(side * barHalfSpan, gripLocalY, gripLocalZ);
    handlebar.add(grip, hood, anchor);
    frameFallback.push(grip, hood);
    barContacts.push({ side, anchor });
  }
  handlebar.position.set(
    BIKE_RIG.handlebar.base[0] ?? 0,
    BIKE_RIG.handlebar.base[1] ?? 0,
    BIKE_RIG.handlebar.base[2] ?? 0,
  );
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
  rider.position.set(
    BIKE_RIG.rider.root[0] ?? 0,
    BIKE_RIG.rider.root[1] ?? 0,
    BIKE_RIG.rider.root[2] ?? 0,
  );
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
      crankY: pedals.find((p) => p.side === side)?.crankY ?? side * BIKE_RIG.crank.pedalRadius,
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
  const sampledV4Shoulders = [new THREE.Vector3(), new THREE.Vector3()] as const;
  const UPPER_ARM_LENGTH = 0.39;
  const FOREARM_LENGTH = 0.375;
  // Taken from the V4 rig rather than chosen. These were 0.63/0.63 — a 1.26 m
  // leg — purely so the procedural rider could reach an oversized bike; the
  // rower's equivalents are 0.552. With the bike at true scale the fallback
  // figure uses the same femur and tibia as the skinned athlete above it.
  const THIGH_LENGTH = BIKE_RIG.athlete.thigh;
  const SHIN_LENGTH = BIKE_RIG.athlete.shin;
  const BIKE_AERO_SPINE_LEAN = 0.74;
  const BIKE_HEAD_GAZE_COMPENSATION = -0.47;
  // Pelvis stays at the rider root derived by bikeRiderHipY() — sit surface
  // on pad top. Do not add a vertical dig: averagePedalLoad used to sink the
  // hips into the cushion and re-open butt/saddle 穿模 every downstroke.
  const BIKE_PELVIS_BASE_Y = BIKE_RIG.rider.pelvisOffset[1] ?? 0;
  const BIKE_PELVIS_BASE_Z = BIKE_RIG.rider.pelvisOffset[2] ?? -0.005;
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
      // Pronated hoods grip: palm over the bar, fingers curling forward/down
      // so the cyclist is clearly holding the cockpit rather than floating.
      arm.hand.rotation.set(-0.72, arm.side * 0.06, arm.side * 0.18);
    }
  };

  const placePedalLegs = (motion: BikeMotionGraph): void => {
    for (const leg of legs) {
      const pedal = leg.side < 0 ? motion.leftPedal : motion.rightPedal;
      // The graph owns one circular state per pedal. Deriving the target from
      // that state (rather than a separate limb phase) keeps both shoes locked
      // to their mechanically opposed pedals at the 0 / 2π wrap boundary.
      const pedalRadius = BIKE_RIG.crank.pedalRadius;
      const pedalY = -pedalRadius * pedal.rotation.cos;
      const pedalZ = -pedalRadius * pedal.rotation.sin;
      leg.pedalTarget.set(
        leg.side * BIKE_RIG.crank.lateral,
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
      // A bicycle knee always selects the forward (+Z), slightly outward
      // branch of the hip/pedal sphere intersection. Deriving the hint from an
      // "upward" perpendicular to the rotating crank chord made that branch
      // orbit and could send the knee aft near dead centre. This rider-space
      // anatomical plane is fixed while solveTwoBone3D projects it against the
      // current chord, producing one continuous flexion path over 0 / 2π.
      leg.bendHint.set(leg.side * 0.2, -0.18, 1).normalize();
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
    const pelvisRock = motion.body.pelvisRock.value * animationScale;
    const torsoSway = motion.body.torsoSway.value * animationScale;
    const spineLean = motion.body.spineLean.value * animationScale;
    const shoulderCounterRotation = motion.body.shoulderCounterRotation.value * animationScale;
    const headStabilization = motion.body.headStabilization.value * animationScale;

    // A seated rider shifts pressure across the saddle with each downstroke.
    // Lateral/fore-aft only — vertical load is absorbed by the pad nestle in
    // BIKE_RIG, not by translating the hip through the cushion.
    pelvis.position.set(
      pelvisRock * 0.12 + pedalLoadShift * 0.014,
      BIKE_PELVIS_BASE_Y,
      BIKE_PELVIS_BASE_Z + pedalExtensionShift * 0.014,
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

  const refineV4Targets = (motion: ReplayV4MotionController): void => {
    motion.getShoulderWorld("left", sampledV4Shoulders[0]);
    motion.getShoulderWorld("right", sampledV4Shoulders[1]);
    // The visible V4 shoulder is the anatomical origin. Rebuild the shared
    // elbow branch from that shoulder and the fixed hood contact so the
    // post-clip solver bends the arms under the shoulder instead of replaying
    // a generic clip plane that was authored without a bicycle cockpit.
    for (let index = 0; index < arms.length; index++) {
      const arm = arms[index];
      const sampledShoulder = sampledV4Shoulders[index];
      if (!arm || !sampledShoulder) continue;
      rider.worldToLocal(sampledShoulder);
      setArmBendHint(sampledShoulder, arm.hand.position, arm.side, arm.bendHint, {
        lateral: 0.2,
        up: -0.28,
        aft: -0.18,
      });
      arm.elbow.position.copy(sampledShoulder).add(arm.bendHint);
    }
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
    refineV4Targets,
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
    // A broad blue-green basin; the course markings sit on top of this water
    // instead of turning the whole loop into a teal race-track ribbon.
    groundColor: (t) => (t === "dark" ? 0x104d60 : 0x2f879c),
    course: {
      surface: (t) => (t === "dark" ? 0x155568 : 0x378da0),
      edge: (t) => (t === "dark" ? 0x8ed5e1 : 0xd9eef2),
      laneLine: (t) => (t === "dark" ? 0x68bed0 : 0xc9e5ea),
      detail: (t) => (t === "dark" ? 0xf6c453 : 0xf59e0b),
      secondary: (t) => (t === "dark" ? 0xe8fbff : 0xffffff),
      surfaceOpacity: 0.035,
      roughness: 0.18,
      metalness: 0.06,
    },
    make: makeRowerAvatar,
  },
  skierg: {
    waves: false,
    roll: false,
    bobAmp: 0.08,
    metersPerCycle: METERS_PER_CYCLE.skierg,
    // Preserve human-scale travel through the planted phase. The course loop
    // is visually compressed (1 km around a 30 m stage), so this compensating
    // 1.45 m travel restores the skier's forward motion relative to a
    // course-locked basket and reaches the measured ~23° pole-off attitude.
    surgeAmp: 1.45,
    sprayOffset: 0.4, // at the pole baskets
    groundOpacity: 1,
    trailColor: 0xffffff,
    // Dusk snowfield: dimmer and cooler than the floodlit course ring, so the
    // lit track reads as lit rather than the whole bowl being bright.
    groundColor: (t) => (t === "dark" ? 0x8fa5b3 : 0xaabfd0),
    course: {
      surface: (t) => (t === "dark" ? 0x849daa : 0xd8e7ee),
      edge: (t) => (t === "dark" ? 0x7893a2 : 0xb6ccd8),
      laneLine: (t) => (t === "dark" ? 0x607f8e : 0x8eafbd),
      detail: (t) => (t === "dark" ? 0x7c6cf0 : 0x6d5ef5),
      secondary: (t) => (t === "dark" ? 0x556e7b : 0x7898a7),
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
    groundColor: (t) => (t === "dark" ? 0x303a40 : 0x98a09d),
    course: {
      // Near-white, not timber-brown: at High/Ultra the wood-floor diffuse map
      // multiplies this colour, and brown × brown ≈ black — the track spent a
      // whole art pass reading as charcoal because the albedo was paid twice.
      // The map carries the wood; this tint only warms it.
      surface: (t) => (t === "dark" ? 0x977244 : 0xdbc09a),
      edge: (t) => (t === "dark" ? 0xdfe7e8 : 0xf4f2eb),
      laneLine: (t) => (t === "dark" ? 0x5fa4c4 : 0x2f7298),
      detail: (t) => (t === "dark" ? 0xe9685e : 0xc63f38),
      secondary: (t) => (t === "dark" ? 0x51463e : 0x725f4d),
      surfaceOpacity: 1,
      roughness: 0.56,
      metalness: 0.025,
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

  private readonly quality: RenderQuality;
  private readonly qaCamera: "normal" | "athlete-close" | "athlete-front" | "athlete-grip";
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
  private fovCurrent = 42;
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
  /** Query-gated grip camera scratch; inert during normal replay. */
  private readonly qaGripFocus = new THREE.Vector3();
  private readonly qaGripOther = new THREE.Vector3();
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
  /** Opt-in QA overlay; normal replay rendering never allocates this helper. */
  private v4SkeletonHelper: THREE.SkeletonHelper | null = null;
  /** Current image-based lighting map; rebuilt per theme, disposed on destroy. */
  private skyRadiance: THREE.DataTexture | null = null;
  /** Desired chase-camera position for the current frame. */
  private chase = new THREE.Vector3();
  /** Desired point of interest; kept separate so both translation and aim damp. */
  private lookAt = new THREE.Vector3();
  /** Smoothed point of interest actually used by `camera.lookAt`. */
  private cameraAim = new THREE.Vector3();
  /** Framing mode bits that require an immediate paused-render camera update. */
  private cameraLayoutMode = -1;
  private disposables: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];
  private snowSurfaceTexture: THREE.DataTexture | null = null;
  private geometries: THREE.BufferGeometry[] = [];
  private instancedMeshes: THREE.InstancedMesh[] = [];
  private courseThemeMats: Array<{ material: THREE.MeshStandardMaterial; color: CourseColor }> = [];
  private environmentThemeMats: Array<{
    material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
    color: ThemeColor;
  }> = [];
  /** Builds the sport venue worlds. See `renderer3dEnvironment.ts`. */
  private environmentBuilder!: EnvironmentBuilder;
  private cellMatDark!: THREE.MeshStandardMaterial;
  private cellMatLight!: THREE.MeshStandardMaterial;

  constructor(
    host: HTMLElement,
    quality: RenderQuality = "medium",
    sport: Sport = "rower",
    options: Renderer3DOptions = {},
  ) {
    this.quality = quality;
    this.qaCamera = options.qaCamera ?? "normal";
    this.cfg = QUALITY[quality];
    this.sport = sport;
    this.profile = SPORT_PROFILES[sport];
    this.environment = ENVIRONMENTS[sport];
    // The builders own no registries: every geometry, material, and texture they
    // create is registered here, so destroy() stays authoritative.
    this.environmentBuilder = new EnvironmentBuilder({
      sport,
      quality,
      cfg: this.cfg,
      environment: this.environment,
      textures: this.textures,
      environmentThemeMats: this.environmentThemeMats,
      mat: (m) => this.mat(m),
      track: (g) => this.track(g),
      trackInstanced: (mesh) => this.trackInstanced(mesh),
      environmentStandardMat: (name, color, opts) => this.environmentStandardMat(name, color, opts),
      environmentBasicMat: (name, color, opts) => this.environmentBasicMat(name, color, opts),
      makeVerticalArc: (name, radius, height, y, sector, material) =>
        this.makeVerticalArc(name, radius, height, y, sector, material),
    } satisfies EnvironmentBuildContext);
    this.backend = options.backend ?? "webgl";
    // A canvas can only ever hold ONE context type for its lifetime, and the 2D
    // renderer locks the shared page canvas to '2d'. So the 3D renderer creates
    // and owns its own canvas (and removes it on destroy) — this also means a
    // fresh context every time, so destroy()'s loseContext() can't poison reuse.
    this.host = host;
    this.canvas = document.createElement("canvas");
    // Minimal DOM/canvas hosts used by renderer consumers need not implement
    // HTMLElement.dataset. The marker is QA-only and must never make 3D setup
    // depend on that optional browser convenience.
    if (this.canvas.dataset) this.canvas.dataset.replayQaCamera = this.qaCamera;
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
    this.camera = new THREE.PerspectiveCamera(BASE_CAMERA_FOV[this.sport], 1, 0.1, 500);
    this.fovCurrent = BASE_CAMERA_FOV[this.sport];

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
      // BikeErg is the one sport the athlete sits on top of, so the controller
      // needs the pad plane to keep the posterior out of the cushion. The
      // avatar group is the space BIKE_RIG is authored in, and it is exactly
      // the parent installed below, so these values need no conversion.
      const seatContract = bikeSeatContract(this.sport);
      this.liveAvatar.v4Motion = installReplayV4MotionController({
        sport: this.sport,
        parent: this.liveAvatar.group,
        fallbackRoot: this.liveAvatar.group,
        instance: tryCreateReplayV4AthleteInstance(options.v4Assets),
        targets: this.liveAvatar.v4Targets,
        quality: this.quality,
        diagnosticMode: options.showV4Skeleton ? "skeleton" : undefined,
        castShadow: this.cfg.shadows,
        receiveShadow: this.cfg.shadows,
        seatContract,
      });
      this.ghostAvatar.v4Motion = installReplayV4MotionController({
        sport: this.sport,
        parent: this.ghostAvatar.group,
        fallbackRoot: this.ghostAvatar.group,
        instance: tryCreateReplayV4AthleteInstance(options.v4Assets),
        targets: this.ghostAvatar.v4Targets,
        quality: this.quality,
        opacity: 0.45,
        castShadow: false,
        receiveShadow: false,
        laneColor: COLORS_LIGHT.ghost,
        seatContract,
      });
      this.liveAvatar.group.userData.authoredReplayV4 = !!this.liveAvatar.v4Motion;
      this.ghostAvatar.group.userData.authoredReplayV4 = !!this.ghostAvatar.v4Motion;
      // The marker is intentionally QA-only. It lets the capture harness wait
      // for the real skinned production athlete instead of racing the first
      // empty renderer frame, while remaining inert for every normal replay.
      if (this.canvas.dataset) {
        this.canvas.dataset.replayV4Athlete = this.liveAvatar.v4Motion ? "ready" : "unavailable";
      }
      const contactReach = (side: "leftHand" | "rightHand"): number => {
        const effector = options.v4Assets!.effectors[side];
        return replayV4ArmContactReach(this.sport, effector);
      };
      const v4ArmReach = Math.min(contactReach("leftHand"), contactReach("rightHand"));
      if (this.liveAvatar.v4Motion) this.liveAvatar.setV4ArmReach?.(v4ArmReach);
      if (this.ghostAvatar.v4Motion) this.ghostAvatar.setV4ArmReach?.(v4ArmReach);
      if (options.showV4Skeleton && this.liveAvatar.v4Motion) {
        const helper = new THREE.SkeletonHelper(this.liveAvatar.v4Motion.root);
        helper.name = "qa:v4-live-skeleton";
        const material = helper.material as THREE.LineBasicMaterial;
        material.depthTest = false;
        material.depthWrite = false;
        material.transparent = true;
        material.opacity = 0.92;
        helper.setColors(new THREE.Color(0xffd34e), new THREE.Color(0xfff4a8));
        helper.renderOrder = 8;
        this.v4SkeletonHelper = helper;
        this.scene.add(helper);
      }
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

  /**
   * BikeErg needs track-following UVs: the bundled oak boards run tangentially
   * around the lap instead of staying world-aligned and slicing diagonally
   * through every bend. Row/Ski retain Three's ordinary radial surface.
   */
  private makeLaneGeometry(innerR: number, outerR: number): THREE.BufferGeometry {
    if (this.sport !== "bike") {
      return this.track(new THREE.RingGeometry(innerR, outerR, this.cfg.laneSegments));
    }
    const segments = this.cfg.laneSegments;
    const positions = new Float32Array((segments + 1) * 2 * 3);
    const normals = new Float32Array((segments + 1) * 2 * 3);
    const uvs = new Float32Array((segments + 1) * 2 * 2);
    const indices: number[] = [];
    for (let index = 0; index <= segments; index++) {
      const angle = (index / segments) * FULL_CIRCLE;
      for (const [side, radius] of [innerR, outerR].entries()) {
        const vertex = index * 2 + side;
        positions[vertex * 3] = Math.sin(angle) * radius;
        positions[vertex * 3 + 1] = -Math.cos(angle) * radius;
        positions[vertex * 3 + 2] = 0;
        normals[vertex * 3 + 2] = 1;
        // U crosses the track; V follows travel, matching the long direction
        // of the floorboards in the seamless CC0 source.
        uvs[vertex * 2] = side;
        uvs[vertex * 2 + 1] = index / segments;
      }
      if (index === segments) continue;
      const inner = index * 2;
      const outer = inner + 1;
      const nextInner = inner + 2;
      const nextOuter = inner + 3;
      indices.push(inner, nextInner, outer, outer, nextInner, nextOuter);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.name = "course:bike:tangential-timber";
    geometry.userData.trackFollowingUv = true;
    return this.track(geometry);
  }

  private addRowerCourseDetails(group: THREE.Group, innerR: number, outerR: number): void {
    const style = this.profile.course;
    // Keep only the course boundaries at Low. Medium and above add the two
    // athlete lane cables, but never return to the six-ring wire diagram that
    // made the basin look like a spreadsheet laid over water.
    const cableMat = this.courseMat("course:rower:lane-line", style.laneLine, {
      roughness: 0.34,
      metalness: 0.12,
    });
    const laneRadii =
      this.cfg.environmentDetail === 0
        ? [innerR + 0.55, outerR - 0.55]
        : [innerR + 0.55, this.ghostRadius, this.loopRadius, outerR - 0.55];
    for (const r of laneRadii) {
      this.addCourseRing(group, r, 0.012, cableMat, "course:rower:lane-line", 0.048);
    }

    // A few long, broken highlights establish flow. Their count is deliberately
    // capped: water reads from broad light and normal response, not dozens of
    // identical white capsules.
    const streakMat = this.courseMat("course:rower:water-streak", style.secondary, {
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      roughness: 0.22,
      metalness: 0.14,
    });
    const streakGeo = this.track(new THREE.CapsuleGeometry(0.018, 2.8, 4, 10));
    streakGeo.rotateX(Math.PI / 2);
    const streaks = [8, 12, 16, 22][this.cfg.environmentDetail];
    for (let i = 0; i < streaks; i++) {
      const band = (i % 4) / 3;
      const radius = innerR + 1.1 + (outerR - innerR - 2.2) * band;
      const angle = ((i * 0.61803398875 + (i % 4) * 0.071) % 1) * FULL_CIRCLE;
      this.addCourseBlock(group, streakGeo, streakMat, radius, angle, "course:rower:water-streak");
    }

    // One distance board at each quarter, instead of three-block clusters.
    const buoyTickMat = this.courseMat("course:rower:distance-buoy", style.detail, {
      roughness: 0.48,
      metalness: 0.04,
    });
    const buoyTickGeo = this.track(roundedVenueBlockGeometry(0.14, 0.055, 0.55, 0.025));
    for (const marker of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      this.addCourseBlock(
        group,
        buoyTickGeo,
        buoyTickMat,
        outerR - 0.32,
        marker,
        "course:rower:distance-buoy",
        0.078,
      );
    }
  }

  private addSkierCourseDetails(group: THREE.Group, innerR: number, outerR: number): void {
    const style = this.profile.course;
    // A skier's lane is compressed and slightly blue from repeated grooming.
    // These broad shoulders sit below the fine grooves, giving the track a
    // soft packed-snow volume instead of a white painted oval.
    const packedMat = this.courseMat("course:skierg:packed-snow", style.secondary, {
      transparent: true,
      opacity: 0.34,
      roughness: 0.99,
      metalness: 0,
    });
    for (const center of [this.ghostRadius, this.loopRadius]) {
      this.addCourseRing(group, center, 0.19, packedMat, "course:skierg:packed-snow", 0.043);
    }

    // One paired groove per athlete lane. The previous four centres produced
    // eight concentric grooves and made the piste read as a rail yard.
    const grooveMat = this.courseMat("course:skierg:groomed-groove", style.laneLine, {
      roughness: 0.96,
      metalness: 0.01,
    });
    const trackCenters = [this.ghostRadius, this.loopRadius];
    for (const center of trackCenters) {
      this.addCourseRing(
        group,
        center - 0.11,
        0.026,
        grooveMat,
        "course:skierg:groomed-groove",
        0.05,
      );
      this.addCourseRing(
        group,
        center + 0.11,
        0.026,
        grooveMat,
        "course:skierg:groomed-groove",
        0.05,
      );
    }

    // Soft corduroy comb reads as groomed snow rather than polished ice.
    const combMat = this.courseMat("course:skierg:snow-comb", style.secondary, {
      transparent: true,
      opacity: 0.18,
      roughness: 0.98,
      metalness: 0,
    });
    const combGeo = this.track(new THREE.CapsuleGeometry(0.022, outerR - innerR - 1.88, 4, 10));
    combGeo.rotateZ(Math.PI / 2);
    const combs = [14, 20, 28, 36][this.cfg.environmentDetail];
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

    // Sparse control markers belong to two course sectors, not the full loop.
    const gateMat = this.courseMat("course:skierg:gate", style.detail, {
      roughness: 0.42,
      metalness: 0.05,
    });
    const gateGeo = this.track(roundedVenueBlockGeometry(0.18, 0.07, 0.55, 0.035));
    const gateCount = [4, 6, 8, 10][this.cfg.environmentDetail];
    for (let i = 0; i < gateCount; i++) {
      const local = (i + 0.5) / gateCount;
      const angle =
        i % 2 === 0 ? degrees(-18) + local * degrees(44) : degrees(174) + local * degrees(46);
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

    // Sparse pursuit dashes supplement the permanent timber-track lines.
    const dashMat = this.courseMat("course:bike:dash", style.laneLine, {
      roughness: 0.5,
      metalness: 0.05,
    });
    const dashGeo = this.track(roundedVenueBlockGeometry(0.14, 0.045, 1.7, 0.035));
    const dashCount = [18, 24, 30, 36][this.cfg.environmentDetail];
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

    // Velodrome grammar is continuous black/red/blue paint on timber, not
    // hundreds of red kerb blocks and purple balls.
    const blackLine = this.courseMat("course:bike:measure-line", style.secondary, {
      roughness: 0.52,
      metalness: 0.02,
    });
    const redLine = this.courseMat("course:bike:sprinter-line", style.detail, {
      roughness: 0.48,
      metalness: 0.02,
    });
    // The côte d'azur: the pale blue apron band between the infield and the
    // measurement line. It is the third colour of the "black/red/blue" grammar
    // above, and the strongest single cue that this floor is a velodrome and
    // not a running track.
    const azurMat = this.courseMat(
      "course:bike:cote-d-azur",
      (t) => (t === "dark" ? 0x2c5a6e : 0x7db6cc),
      { roughness: 0.55, metalness: 0.02 },
    );
    const azurGeo = this.track(new THREE.RingGeometry(innerR + 0.06, innerR + 0.58, 96));
    const azur = new THREE.Mesh(azurGeo, azurMat);
    azur.name = "course:bike:cote-d-azur";
    azur.rotation.x = -Math.PI / 2;
    azur.position.y = 0.052;
    azur.receiveShadow = this.cfg.shadows;
    group.add(azur);

    this.addCourseRing(group, innerR + 0.72, 0.026, blackLine, "course:bike:measure-line", 0.063);
    this.addCourseRing(
      group,
      (this.ghostRadius + this.loopRadius) / 2,
      0.028,
      dashMat,
      "course:bike:pursuit-line",
      0.064,
    );
    this.addCourseRing(group, outerR - 0.8, 0.026, redLine, "course:bike:sprinter-line", 0.063);

    // Short sprint markers live only on the two straights.
    const markerGeo = this.track(roundedVenueBlockGeometry(0.11, 0.035, 0.9, 0.025));
    for (let i = 0; i < 8; i++) {
      const angle = (i < 4 ? degrees(-6) : Math.PI - degrees(6)) + (i % 4) * degrees(4);
      this.addCourseBlock(
        group,
        markerGeo,
        redLine,
        outerR - 1.35,
        angle,
        "course:bike:sprint-marker",
        0.076,
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

  private buildEnvironment(innerR: number, outerR: number): void {
    this.buildSky();
    this.environmentMidGroup.name = `environment:${this.sport}:midground`;
    this.environmentDetailGroup.name = `environment:${this.sport}:detail`;
    this.environmentMidGroup.userData.environmentQuality = this.quality;
    this.environmentMidGroup.userData.environmentDetail = this.cfg.environmentDetail;
    this.scene.add(this.environmentMidGroup, this.environmentDetailGroup);

    // BikeErg is an indoor velodrome — no distant horizon or valley skyline.
    // Ski and Row keep authored horizon rings for their outdoor settings.
    if (this.sport !== "bike") {
      const farHeight = this.sport === "skierg" ? 22 : 12.5;
      const farVariation = this.sport === "skierg" ? 9 : 5.2;
      const midHeight = this.sport === "skierg" ? 12 : 8.4;
      const midVariation = this.sport === "skierg" ? 6 : 3.6;
      // Low owns one clear graphic silhouette. Medium introduces a second,
      // more distant atmospheric band; High/Ultra spend their budget on the
      // authored venue zones rather than merely subdividing these same rings.
      if (this.cfg.environmentDetail >= 1) {
        this.environmentMidGroup.add(
          this.environmentBuilder.makeHorizonRing(
            `environment:${this.sport}:horizon-far`,
            116,
            -2.5,
            farHeight,
            farVariation,
            72,
            this.environment.farSilhouette,
            0.7,
          ),
        );
      }
      this.environmentMidGroup.add(
        this.environmentBuilder.makeHorizonRing(
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
    }

    const infieldMat = this.environmentStandardMat(
      `environment:${this.sport}:infield-material`,
      this.environment.infield,
      {
        roughness: this.sport === "rower" ? 0.2 : 0.9,
        metalness: this.sport === "rower" ? 0.06 : 0.01,
      },
    );
    if (this.sport === "skierg" && this.cfg.environmentDetail >= 1) {
      infieldMat.map = this.environmentBuilder.makeSnowSurfaceTexture(this.cfg.environmentDetail);
      infieldMat.needsUpdate = true;
    }
    if (this.sport === "rower" && this.cfg.environmentDetail >= 1) {
      // Same lake language as the outer ground plane — the circle centre is
      // open basin water, not a painted disk under the lanes.
      infieldMat.map = this.environmentBuilder.makeWaterSurfaceTexture(this.cfg.environmentDetail);
      infieldMat.needsUpdate = true;
    }
    // Ski bowl centre and Bike infield park own their own centre geometry;
    // keep the generic infield only as a fallback underlay for those sports.
    const infield = new THREE.Mesh(
      this.track(new THREE.CircleGeometry(innerR - 0.8, this.cfg.laneSegments)),
      infieldMat,
    );
    infield.name = `environment:${this.sport}:infield`;
    infield.rotation.x = -Math.PI / 2;
    infield.position.y = this.sport === "bike" ? -0.04 : -0.015;
    infield.receiveShadow = this.cfg.shadows;
    // Row island and Ski bowl centre own their geometry; hide the generic
    // underlay.  Bike uses the generic infield as its velodrome floor.
    if (this.sport === "rower" || this.sport === "skierg") {
      infield.visible = false;
    }
    this.scene.add(infield);

    const apronMat = this.environmentStandardMat(
      `environment:${this.sport}:apron-material`,
      this.environment.apron,
      {
        roughness: this.sport === "rower" ? 0.22 : 0.9,
        metalness: this.sport === "rower" ? 0.05 : 0.01,
      },
    );
    if (this.sport === "skierg" && this.cfg.environmentDetail >= 1) {
      apronMat.map = this.environmentBuilder.makeSnowSurfaceTexture(this.cfg.environmentDetail);
      apronMat.needsUpdate = true;
    }
    if (this.sport === "rower" && this.cfg.environmentDetail >= 1) {
      apronMat.map = this.environmentBuilder.makeWaterSurfaceTexture(this.cfg.environmentDetail);
      apronMat.needsUpdate = true;
    }
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
      this.environmentBuilder.addRowerRegattaWorld(
        this.environmentMidGroup,
        this.environmentDetailGroup,
        outerR,
      );
    } else if (this.sport === "skierg") {
      this.environmentBuilder.addSkiStadiumWorld(
        this.environmentMidGroup,
        this.environmentDetailGroup,
        outerR,
      );
    } else {
      this.environmentBuilder.addBikeCircuitWorld(
        this.environmentMidGroup,
        this.environmentDetailGroup,
        outerR,
      );
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
    const positions = geometry.getAttribute("position");
    const colors = new Float32Array(positions.count * 3);
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const broad = Math.sin(x * 0.17 + y * 0.11) * 0.5 + Math.sin(x * 0.067 - y * 0.13) * 0.5;
      const fine = Math.sin(x * 0.91 + y * 1.17) * 0.5 + Math.sin(x * 1.73 - y * 0.61) * 0.5;
      if (this.profile.waves) {
        // Water needs a basin-wide value field, not one uniformly lit plane.
        // The broad term is deliberately non-radial so it does not turn into
        // another set of perfect rings around the course. Higher tiers also
        // start with a quiet static surface before animated displacement takes
        // over, so a paused replay still shows water.
        const radius = Math.hypot(x, y);
        const depth = clamp01((radius - 8) / 88);
        const sheen =
          0.82 -
          depth * 0.1 +
          broad * 0.09 +
          fine * (this.cfg.environmentDetail >= 2 ? 0.045 : 0.025);
        const relief =
          this.cfg.environmentDetail === 0
            ? 0
            : this.cfg.environmentDetail === 1
              ? 0.018
              : this.cfg.environmentDetail === 2
                ? 0.032
                : 0.046;
        positions.setZ(
          index,
          (Math.sin(y * 0.18 + x * 0.035) * 0.58 +
            Math.sin(x * 0.31 - y * 0.09) * 0.27 +
            Math.sin((x + y) * 0.63) * 0.15) *
            relief,
        );
        colors[index * 3] = sheen * 0.88;
        colors[index * 3 + 1] = sheen * 1.03;
        colors[index * 3 + 2] = Math.min(1, sheen * 1.12);
      } else if (this.sport === "skierg") {
        // Snow gets very shallow wind-packed undulations and a cool/bright
        // variation. Keep it below the course profile so poles and skis remain
        // visually and physically contact-locked.
        positions.setZ(index, broad * 0.012 + fine * 0.0035);
        const radius = Math.hypot(x, y);
        const packed = clamp01(
          1 - Math.abs(radius - (this.ghostRadius + this.loopRadius) * 0.5) / 7.5,
        );
        const value = 0.89 + broad * 0.065 + fine * 0.018 - packed * 0.055;
        // Compressed ski lanes are cooler and slightly darker than the loose
        // snow beside them. This broad value change remains visible even when
        // the high-tier bitmap has not finished loading.
        colors[index * 3] = value * (0.98 - packed * 0.12);
        colors[index * 3 + 1] = value * (1 - packed * 0.045);
        colors[index * 3 + 2] = Math.min(1, value * 1.025);
      } else {
        // The arena slab stays quiet and pale beneath the authored timber
        // track. Relief remains near-zero so tyre shadows never shimmer.
        positions.setZ(index, broad * 0.0018 + fine * 0.0008);
        const value = 0.9 + broad * 0.04 + fine * 0.018;
        colors[index * 3] = value * 0.98;
        colors[index * 3 + 1] = value;
        colors[index * 3 + 2] = value * 0.99;
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
            transparent: true,
            opacity: 0.82,
            roughness: 0.12,
            metalness: 0.03,
            clearcoat: 0.92,
            clearcoatRoughness: 0.06,
            emissive: 0x062535,
            emissiveIntensity: 0.35,
            vertexColors: true,
            depthWrite: true,
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
    groundMat.userData.environmentQuality = this.quality;
    groundMat.userData.environmentMaterialTier =
      this.cfg.environmentDetail === 0
        ? "graphic"
        : this.cfg.environmentDetail === 1
          ? "shaped"
          : this.cfg.environmentDetail === 2
            ? "pbr"
            : "pbr-normal";
    if (
      this.sport === "skierg" &&
      this.cfg.environmentDetail >= 2 &&
      groundMat instanceof THREE.MeshStandardMaterial
    ) {
      this.environmentBuilder.loadEnvironmentTexture(
        groundMat,
        "map",
        "/replay-assets/environments/snow-02/snow-diffuse-512.jpg",
        [18, 18],
      );
      this.environmentBuilder.loadEnvironmentTexture(
        groundMat,
        "roughnessMap",
        "/replay-assets/environments/snow-02/snow-roughness-512.jpg",
        [18, 18],
      );
      if (this.cfg.environmentDetail >= 3) {
        this.environmentBuilder.loadEnvironmentTexture(
          groundMat,
          "normalMap",
          "/replay-assets/environments/snow-02/snow-normal-gl-512.jpg",
          [22, 22],
        );
        // Stronger normals give snow a crystalline, wind-sculpted surface
        // rather than a flat white floor.
        groundMat.normalScale.set(0.35, 0.35);
      }
      groundMat.needsUpdate = true;
    }
    if (
      this.sport === "bike" &&
      this.cfg.environmentDetail >= 2 &&
      groundMat instanceof THREE.MeshStandardMaterial
    ) {
      // A pale brushed-concrete arena slab sits beneath the timber track. It
      // keeps the venue bright and material-rich without turning the course
      // itself back into the old black asphalt loop.
      this.environmentBuilder.loadEnvironmentTexture(
        groundMat,
        "map",
        "/replay-assets/environments/brushed-concrete-2/brushed-concrete-2-diffuse-512.jpg",
        [14, 14],
      );
      this.environmentBuilder.loadEnvironmentTexture(
        groundMat,
        "roughnessMap",
        "/replay-assets/environments/brushed-concrete-2/brushed-concrete-2-roughness-512.jpg",
        [14, 14],
      );
      if (this.cfg.environmentDetail >= 3) {
        this.environmentBuilder.loadEnvironmentTexture(
          groundMat,
          "normalMap",
          "/replay-assets/environments/brushed-concrete-2/brushed-concrete-2-normal-gl-512.jpg",
          [18, 18],
        );
        groundMat.normalScale.set(0.08, 0.08);
      }
      groundMat.needsUpdate = true;
    }
    if (
      this.sport === "rower" &&
      this.cfg.environmentDetail >= 1 &&
      groundMat instanceof THREE.MeshPhysicalMaterial
    ) {
      groundMat.map = this.environmentBuilder.makeWaterSurfaceTexture(this.cfg.environmentDetail);
      groundMat.needsUpdate = true;
    }
    if (
      this.sport === "rower" &&
      this.cfg.environmentDetail >= 2 &&
      groundMat instanceof THREE.MeshPhysicalMaterial
    ) {
      groundMat.normalMap = this.environmentBuilder.makeWaterNormalTexture(
        this.cfg.environmentDetail >= 3,
      );
      groundMat.normalScale.set(
        this.cfg.environmentDetail >= 3 ? 0.46 : 0.3,
        this.cfg.environmentDetail >= 3 ? 0.34 : 0.22,
      );
      groundMat.needsUpdate = true;
    }
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.name = "ground";
    ground.receiveShadow = this.cfg.shadows;
    this.groundMesh = ground;
    this.scene.add(ground);

    // Rowing: a dark lake bed beneath the translucent water gives real depth.
    // Without it the water looks like paint on a track, not a body of water.
    if (this.sport === "rower") {
      const bedGeo = new THREE.PlaneGeometry(260, 260);
      const bedMat = new THREE.MeshStandardMaterial({
        color: 0x0a2a30,
        roughness: 0.95,
        metalness: 0,
        depthWrite: true,
      });
      bedMat.name = "environment:rower:lake-bed";
      const bed = new THREE.Mesh(bedGeo, bedMat);
      bed.rotation.x = -Math.PI / 2;
      bed.position.y = -1.2;
      bed.name = "environment:rower:lake-bed";
      bed.receiveShadow = false;
      this.scene.add(bed);
    }

    this.buildEnvironment(innerR, outerR);

    const course = new THREE.Group();
    course.name = `course:${this.sport}`;
    this.scene.add(course);

    const laneGeo = this.makeLaneGeometry(innerR, outerR);
    const laneMat = this.courseMat("lane", this.profile.course.surface, {
      transparent: this.profile.course.surfaceOpacity < 1,
      opacity: this.profile.course.surfaceOpacity,
      depthWrite: this.profile.course.surfaceOpacity >= 1,
      roughness: this.profile.course.roughness,
      metalness: this.profile.course.metalness,
    });
    laneMat.name = "lane";
    if (this.sport === "skierg" && this.cfg.environmentDetail >= 1) {
      // Keep the visible course deterministic across WebGL and WebGPU. The
      // bundled CC0 snow maps detail the broad terrain receiver, while this
      // tiny procedural groom map gives the close course ring its own packed
      // albedo without waiting on an image decode.
      laneMat.map = this.environmentBuilder.makeSnowSurfaceTexture(this.cfg.environmentDetail);
      laneMat.needsUpdate = true;
    }
    if (this.sport === "bike" && this.cfg.environmentDetail >= 2) {
      // High/Ultra turn the course into varnished timber. The map is a generic
      // seamless floor surface, while all velodrome lines remain authored
      // geometry, so this never claims a recorded or real-world venue.
      this.environmentBuilder.loadEnvironmentTexture(
        laneMat,
        "map",
        "/replay-assets/environments/wood-floor/wood-floor-diffuse-512.jpg",
        [1.2, 12],
      );
      this.environmentBuilder.loadEnvironmentTexture(
        laneMat,
        "roughnessMap",
        "/replay-assets/environments/wood-floor/wood-floor-roughness-512.jpg",
        [1.2, 12],
      );
      if (this.cfg.environmentDetail >= 3) {
        this.environmentBuilder.loadEnvironmentTexture(
          laneMat,
          "normalMap",
          "/replay-assets/environments/wood-floor/wood-floor-normal-gl-512.jpg",
          [1.2, 12],
        );
        laneMat.normalScale.set(0.1, 0.1);
      }
      laneMat.needsUpdate = true;
    }
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

    // Start/finish line — thin painted checker, positioned per sport so it
    // never reads as stuck to the wrong surface. Rowing floats it above the
    // water like a real regatta start platform; Ski/Bike keep it flush.
    this.cellMatDark = this.mat(
      new THREE.MeshStandardMaterial({ color: hex(COLORS_LIGHT.finishDark) }),
    );
    this.cellMatLight = this.mat(
      new THREE.MeshStandardMaterial({ color: hex(COLORS_LIGHT.finishLight) }),
    );
    const cellGeo = this.track(new THREE.BoxGeometry(0.9, 0.004, 0.95));
    const cellY = this.sport === "rower" ? 0.1 : 0.002;
    for (let zc = 0; zc < 9; zc++) {
      for (let xc = 0; xc < 2; xc++) {
        const cell = new THREE.Mesh(
          cellGeo,
          (zc + xc) % 2 === 0 ? this.cellMatDark : this.cellMatLight,
        );
        cell.position.set(-0.5 + xc, cellY, innerR + 0.6 + zc * 0.95);
        this.scene.add(cell);
      }
    }

    this.buildContactFootprints();
  }

  /**
   * Point the scene's image-based lighting at the current theme.
   *
   * Held in a field rather than the shared `textures` registry because the map
   * is rebuilt on every light/dark switch: pushing each one would grow the
   * registry for the lifetime of the renderer. The previous map is released
   * here and the survivor is disposed in destroy().
   *
   * Low skips IBL entirely. It is the tier that already drops shadows and
   * displacement, and prefiltering a radiance map is exactly the kind of
   * one-off GPU cost it exists to avoid.
   */
  private applySkyRadiance(themeName: "light" | "dark"): void {
    // envIntensity 0 opts a venue out entirely (see RowErg).
    if (this.cfg.environmentDetail < 1 || this.environment.envIntensity <= 0) return;
    const previous = this.skyRadiance;
    this.skyRadiance = makeSkyRadianceTexture(this.environment, themeName, this.sunOffset);
    this.scene.environment = this.skyRadiance;
    this.scene.environmentIntensity = this.environment.envIntensity;
    // Hand the ambient budget over to the radiance map rather than paying it
    // twice. Low never reaches here and keeps the original hemisphere value.
    this.hemisphereLight.intensity = this.environment.hemisphereIntensityIbl;
    previous?.dispose();
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
    this.applySkyRadiance(themeName);
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
        themed.material.emissiveIntensity = 0.28;
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
        this.groundMesh.material.emissiveIntensity = 0.2;
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
    const v4Sample = reduce ? REDUCED_REPLAY_POSES[this.sport] : pose;
    // Sample the visible skin before final equipment closure. RowErg can then
    // solve each rigid inboard oar circle from the real shoulder for this exact
    // pose instead of forcing IK to compensate for a hidden-rig mismatch.
    const v4Motion = avatar.v4Motion;
    let v4Prepared = v4Motion?.prepare(v4Sample) ?? false;
    // RowErg pre-orients palms before refining the rigid oar arc so the wrist→
    // palm vector is part of the exact grip solve. SkiErg/BikeErg keep their
    // pole-led / hood-led terminal frames through the contact pass (pre-orient
    // here would break seek-exact pose identity for those sports).
    if (v4Prepared && this.sport === "rower") {
      v4Prepared = v4Motion!.orientHandsToTargets();
    }
    if (v4Prepared && v4Motion) avatar.refineV4Targets?.(v4Motion);
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
    if (v4Prepared) v4Motion?.constrain();
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
    const baseFov = BASE_CAMERA_FOV[this.sport];
    if (this.reduceMotion) {
      this.smoothedSpeed = 0;
      this.fovCurrent = baseFov;
    } else {
      if (dt > 0 && dLive >= 0 && dLive < dt * 120) {
        const inst = dLive > 0 ? Math.min(dLive / dt, 40) : 0;
        this.smoothedSpeed += (inst - this.smoothedSpeed) * dampFactor(3, dt);
      }
      const fovTarget =
        baseFov + Math.max(0, Math.min(1, (this.smoothedSpeed - 3) / 6)) * SPEED_CAMERA_FOV_GAIN;
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
      this.sport === "rower" ? (state.ghost ? 2.12 : 1.96) : state.ghost ? 1.38 : 1.2;
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
    const qaGrip = this.qaCamera === "athlete-grip" && !state.ghost;
    if (qaGrip) {
      this.liveAvatar.v4Targets.leftHand.getWorldPosition(this.qaGripFocus);
      this.liveAvatar.v4Targets.rightHand.getWorldPosition(this.qaGripOther);
      if (this.sport === "rower") {
        // Sculling hands converge at the finish, so their midpoint sits behind
        // the torso from every useful close-up. Track the starboard palm itself
        // to make the finger/handle enclosure reviewable at catch and finish.
        this.qaGripFocus.copy(this.qaGripOther);
      } else {
        this.qaGripFocus.add(this.qaGripOther).multiplyScalar(0.5);
      }
    }
    const focusX = qaGrip
      ? this.qaGripFocus.x
      : state.ghost
        ? (p.x + this.ghostPlacement.x) * 0.5
        : p.x;
    const focusZ = qaGrip
      ? this.qaGripFocus.z
      : state.ghost
        ? (p.z + this.ghostPlacement.z) * 0.5
        : p.z;
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
    // The close rig exists solely for the query-gated visual-QA harness. It
    // preserves the production chase composition for every normal replay,
    // while letting evidence inspect the shoulder/elbow/hip surface directly.
    const qaClose = this.qaCamera !== "normal" && !state.ghost;
    // `athlete-front` is a capture-only portrait, not a reversed chase view:
    // it must make the actual head, shoulder mass, and face treatment legible
    // enough to review. The normal and diagnostic-close cameras keep their
    // broadcast framing unchanged.
    const qaFront = this.qaCamera === "athlete-front" && !state.ghost;
    // Row grips finish against the front of the lower ribs and are completely
    // occluded from a rear chase close-up. The grip diagnostic approaches only
    // RowErg from ahead; SkiErg/BikeErg retain the rear-three-quarter view that
    // shows both independent handles.
    const qaGripFront = qaGrip && this.sport === "rower";
    const normalBack = baseBack + comparisonPullback;
    const closeScale = qaGrip ? (qaGripFront ? 0.035 : 0.15) : qaFront ? 0.22 : qaClose ? 0.42 : 1;
    const back = normalBack * closeScale;
    const baseHeight = this.reduceMotion
      ? sportRig.height + 0.7
      : sportRig.height + (narrow ? 0.3 : 0);
    // The camera looks gently down toward the face instead of shooting upward
    // from chest height. This branch is query-gated and never changes the
    // production chase view.
    const portraitAimY = sportRig.aimY + 0.28;
    const height = qaGrip
      ? this.qaGripFocus.y + (qaGripFront ? 0.55 : 0.24)
      : qaFront
        ? portraitAimY + 0.42
        : (baseHeight + Math.min(2.5, comparisonSpan * 0.16)) * (qaClose ? 0.84 : 1);
    const qaLateral = qaGrip
      ? qaGripFront
        ? Math.min(0.12, lateral * 0.07)
        : Math.min(0.32, lateral * 0.14)
      : qaFront
        ? Math.min(0.16, lateral * 0.13)
        : lateral;
    const qaAhead = qaFront || qaGrip ? 0 : ahead;
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
    const cameraLayoutMode =
      (narrow ? 1 : 0) |
      (state.ghost ? 2 : 0) |
      (this.reduceMotion ? 4 : 0) |
      (qaClose ? 8 : 0) |
      (qaFront ? 16 : 0) |
      (qaGrip ? 32 : 0);
    const cameraLayoutChanged = cameraLayoutMode !== this.cameraLayoutMode;
    this.cameraLayoutMode = cameraLayoutMode;
    this.chase.set(
      focusX +
        (qaFront || qaGripFront ? focusTx : -focusTx) * back +
        rx * (qaFront || qaGripFront ? -qaLateral : qaLateral),
      height,
      focusZ +
        (qaFront || qaGripFront ? focusTz : -focusTz) * back +
        rz * (qaFront || qaGripFront ? -qaLateral : qaLateral),
    );
    this.lookAt.set(
      focusX + focusTx * qaAhead,
      qaGrip ? this.qaGripFocus.y : qaFront ? portraitAimY : sportRig.aimY + (qaClose ? 0.12 : 0),
      focusZ + focusTz * qaAhead,
    );
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
      qaClose ||
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

    this.v4SkeletonHelper?.updateMatrixWorld(true);
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
    if (this.v4SkeletonHelper) {
      this.v4SkeletonHelper.removeFromParent();
      this.v4SkeletonHelper.dispose();
      this.v4SkeletonHelper = null;
    }
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
    // The radiance map hangs off scene.environment, not off any mesh, so the
    // traversal above never reaches it.
    this.skyRadiance?.dispose();
    this.skyRadiance = null;
    this.scene.environment = null;
    // Instance buffers are owned by the InstancedMesh, not its geometry or
    // material, so they still need their own dispose() after the traversal.
    this.buoyMesh?.dispose();
    this.sprayMesh?.dispose();
    for (const mesh of this.instancedMeshes) mesh.dispose();
    if (this.liveLabel.material instanceof THREE.Material) this.liveLabel.material.dispose();
    if (this.ghostLabel?.material instanceof THREE.Material) this.ghostLabel.material.dispose();
    this.liveLabelTex.dispose();
    this.ghostLabelTex?.dispose();
    for (const texture of this.textures) texture.dispose();
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
