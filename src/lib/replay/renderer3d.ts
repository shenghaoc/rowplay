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
import { BIKE_RIG } from "./bikeRig";
import type { Sport } from "../types";
import { fmtPace } from "../format";
import { METERS_PER_CYCLE, ParticlePool, PerfGovernor, clampDt, dampFactor } from "./motion";
import { ROWER_SCULL_GRIP } from "./rowRig";
import { handChannelCentre, HAND_FIST_CENTRE } from "./handGrip";
import { applyReplayAssetLibrary, type ReplayAssetLibrary } from "./renderer3dAssets";
import {
  materialTextures,
  tryCreateReplayV4AthleteInstance,
  type ReplayV4AssetTemplate,
  type ReplayV4EffectorMetric,
} from "./renderer3dV4Assets";
import {
  installReplayV4MotionController,
  type ReplayV4EffectorOffsetOverrides,
  type ReplayV4HandGripContract,
} from "./renderer3dV4Motion";
import { SKI_POLE_GRIP_RADIUS } from "./skiEquipment";
import { makeRowerAvatar, ROWER_PALM_TILT, ROWER_PALM_TILT_COMFORT } from "./renderer3dRowAvatar";
import { makeSkierAvatar, SKI_PALM_TILT, SKI_PALM_TILT_COMFORT } from "./renderer3dSkiAvatar";
import { bikeChainPath, bikeSeatContract, makeBikeAvatar } from "./renderer3dBikeAvatar";
import { COURSE_LOOP_METERS, finalizeAvatar, type Avatar } from "./renderer3dAvatarKit";

export { SKI_PALM_TILT, SKI_PALM_TILT_COMFORT, ROWER_PALM_TILT, ROWER_PALM_TILT_COMFORT };
export { bikeChainPath };

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
  qaCamera?:
    | "normal"
    | "athlete-close"
    | "athlete-front"
    | "athlete-grip"
    | "athlete-grip-left"
    | "athlete-rear"
    | "athlete-top";
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
  make(
    accent: number,
    castShadow: boolean,
    opacity: number,
    bodySegments: number,
    quality: RenderQuality,
  ): Avatar;
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
  // The 7.8 m shell pulls the desktop chase back to 5.4 m; lateral rises with
  // it so the rear-three-quarter ratio (lateral/retreat) stays above the 0.38
  // composition contract instead of flattening into a rear view.
  rower: { back: 4.05, height: 1.78, ahead: 0.88, lateral: 2.16, aimY: 0.84 },
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
    hemisphereSky: themed(0x8a8f96, 0x707f8e),
    hemisphereGround: themed(0x6b5844, 0x312d28),
    hemisphereIntensity: 1.15,
    // The one warm cone: a high haloed key doing the work the daylight did.
    sun: themed(0xffe2b0, 0xffd49a),
    sunIntensity: 3.5,
    fill: themed(0x7d94a8, 0x6d8ba0),
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
 * Replace the authored palm-surface contact with the centre of the active
 * grip channel. SkiErg uses the fitted fist centre; RowErg seats the larger
 * rubber proportionally farther from the palm so the same hand becomes a
 * relaxed hook instead of burying the handle in its roots.
 */
function gripEffectorOffsets(sport: Sport): ReplayV4EffectorOffsetOverrides | undefined {
  if (sport === "skierg") {
    const { x, y, z } = HAND_FIST_CENTRE;
    return {
      leftHand: { x: -x, y, z },
      rightHand: { x, y, z },
    };
  }
  if (sport === "rower") {
    const left = handChannelCentre(ROWER_SCULL_GRIP.radius, -1);
    const right = handChannelCentre(ROWER_SCULL_GRIP.radius, 1);
    return {
      leftHand: { x: left.x, y: left.y, z: left.z },
      rightHand: { x: right.x, y: right.y, z: right.z },
    };
  }
  if (sport === "bike") {
    const radius = BIKE_RIG.handlebar.hood.radius;
    const left = handChannelCentre(radius, -1);
    const right = handChannelCentre(radius, 1);
    return {
      leftHand: { x: left.x, y: left.y, z: left.z },
      rightHand: { x: right.x, y: right.y, z: right.z },
    };
  }
  return undefined;
}
/** Sport geometry handed to the V4 digit-closure solve in this stack layer. */
function gripContractFor(sport: Sport): ReplayV4HandGripContract | undefined {
  if (sport === "rower") {
    return {
      radius: ROWER_SCULL_GRIP.radius,
      // Sculling thumb: light opposition keeps it near the end of the handle
      // where it presses the flat thumb stop instead of folding across.
      thumbOppose: 0.3,
      thumbEndAxial: ROWER_SCULL_GRIP.anchorFromEnd,
    };
  }
  if (sport === "skierg") {
    // The rendered pole rubber, not the fitted `HAND_FIST_RADIUS` channel:
    // the closure adds pad flesh itself and comes to rest at radius + flesh,
    // which for this grip is the fitted channel exactly. Passing the channel
    // radius here double-counts the flesh and stands every digit ~0.9 mm off
    // the pole — see the `radius` contract on `HandGripSurface`.
    return { radius: SKI_POLE_GRIP_RADIUS, thumbOppose: 0.62 };
  }
  return {
    radius: BIKE_RIG.handlebar.hood.radius,
    wrapFingerStages: true,
    /*
     * Hood thumb hooks under the core opposite the fingers, and must actually
     * reach it: the radial thumb pad only lands on the hood body once the
     * opposition carries it far enough around. Measured on the shipped rig at
     * the hood channel — `surfaceDistance`, then the thumb tip's height below
     * the hood core at its worst point in the cycle:
     *
     *   0.70 -> 20.1 mm off      1.52..1.60 -> seated, and still >10 mm under
     *   1.30 -> 12.2 mm off                    the core at every cycle sample
     *   1.50 ->  4.3 mm off      1.61       -> seated, but the tip rises to
     *   1.55 ->  seated                        10.0 mm under at cycle 0.25
     *
     * So the thumb is both seated on the hood and hooked beneath it only over
     * roughly 1.52..1.60; 1.56 is the centre of that band. Below it the pad
     * floats, above it the pad climbs toward the core's own height and stops
     * reading as a hook. The old 0.70 stood the pad two centimetres off the
     * hood — it was carried over from the SkiErg fist, which is solved against
     * a pole held inside the fist and asserts nothing about thumb contact.
     *
     * The band is narrow, so re-measure it rather than nudging this constant if
     * the hood radius or the hand channel ever moves. These are bone-frame
     * radians, not anatomical thumb rotation: read the measured envelope above
     * instead of converting to degrees.
     */
    thumbOppose: 1.56,
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
      // Dimmer than the old daylight groom: the floodlight pools are the lit
      // subject now, and they can only read if the ring between them is not
      // already bright.
      surface: (t) => (t === "dark" ? 0x849daa : 0xc7d6e2),
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
      // Dark stays NEAR-WHITE too: the wood map multiplies it, and the dark
      // room already dims the result — a dark tint × dark map × dim light was
      // charcoal three times over. Separation from equipment passes on the
      // bright side of the gap.
      surface: (t) => (t === "dark" ? 0xe6cfa8 : 0xdbc09a),
      edge: (t) => (t === "dark" ? 0xdfe7e8 : 0xf4f2eb),
      laneLine: (t) => (t === "dark" ? 0x5fa4c4 : 0x2f7298),
      detail: (t) => (t === "dark" ? 0xe9685e : 0xc63f38),
      secondary: (t) => (t === "dark" ? 0x51463e : 0x725f4d),
      surfaceOpacity: 1,
      // Matte, not varnish: with the roughness map multiplying this down, the
      // glossy value mirrored the dark roof cavity and the timber read black
      // at night no matter what colour it was.
      roughness: 0.82,
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
  static readonly LOOP_METERS = COURSE_LOOP_METERS; // one lap = 1 km
  private readonly loopRadius = 30;
  private readonly ghostRadius = 26;

  private readonly quality: RenderQuality;
  private readonly qaCamera: NonNullable<Renderer3DOptions["qaCamera"]>;
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
  private waterRadiance: THREE.DataTexture | null = null;
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
      this.quality,
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
      this.quality,
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
      // SkiErg drives the centre of the closed fist onto the shaft, not the
      // authored palm-surface point: the latter lays the pole across the
      // knuckles and the fingers shut beside it instead of around it.
      const effectorOffsets = gripEffectorOffsets(this.sport);
      const gripContract = gripContractFor(this.sport);
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
        effectorOffsets,
        gripContract,
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
        effectorOffsets,
        gripContract,
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
        addPatch("hull-reflection", 0, 0, 3.9, 0.12);
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
    if (this.cfg.environmentDetail < 1) return;
    const previous = this.skyRadiance;
    this.skyRadiance = makeSkyRadianceTexture(this.environment, themeName, this.sunOffset);
    if (this.environment.envIntensity > 0) {
      this.scene.environment = this.skyRadiance;
      this.scene.environmentIntensity = this.environment.envIntensity;
      // Hand the ambient budget over to the radiance map rather than paying it
      // twice. Low never reaches here and keeps the original hemisphere value.
      this.hemisphereLight.intensity = this.environment.hemisphereIntensityIbl;
    } else if (this.profile.waves) {
      // RowErg's Fresnel-aware share: scene-wide IBL desaturated the whole
      // basin (measured, see the palette note), and Three r184's WebGPU path
      // ignores per-material envMapIntensity — but it does honour a
      // per-material envMap. So the water alone carries the sky: grazing
      // angles pick up the morning sky and sun streak through the PBR Fresnel
      // term, steep angles keep the authored teal, and every other material
      // keeps the art-directed rig untouched.
      const water = this.groundMesh.material;
      if (water instanceof THREE.MeshPhysicalMaterial) {
        // A separate dimmed bake, not this.skyRadiance: at full strength the
        // clearcoat water mirrors the pale sky at every angle and the teal
        // reads as ice. envMapIntensity cannot dial this down on WebGPU, so
        // the gain is baked into the texture.
        const previousWater = this.waterRadiance;
        this.waterRadiance = makeSkyRadianceTexture(
          this.environment,
          themeName,
          this.sunOffset,
          0.32,
        );
        water.envMap = this.waterRadiance;
        water.needsUpdate = true;
        previousWater?.dispose();
      }
    }
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

    // Install the current course frame before any sport solver samples world
    // space. Leaving the previous frame here made an exact seek depend on the
    // pose rendered immediately before it: RowErg's rigid-oar refinement and
    // SkiErg's pole solve both cross this parent transform.
    outer.position.set(x, 0, z);
    // Rowing shells travel bow-first while the athlete faces the stern. The
    // rower rig's fixed-contact anatomy faces local +Z, so its racing bow is
    // local -Z and the complete shell needs a half-turn relative to the course
    // tangent. The other sport rigs continue to face local +Z down-course.
    outer.rotation.y = Math.atan2(tx, tz) + (this.sport === "rower" ? Math.PI : 0);
    outer.updateMatrixWorld(true);

    // Reuse the solved cues for outer-body motion. This avoids solving
    // RowErg/SkiErg kinematics a second time per live/ghost lane.
    const motion = avatar.animate(pose.phase, reduce, pose, meters);
    const v4Sample = reduce ? REDUCED_REPLAY_POSES[this.sport] : pose;
    // SkiErg's vertical cue is recovery rebound only, so planted pole tips stay
    // on the course throughout the solver's contact stage.
    const vertical = "vertical" in motion ? motion.vertical : motion.rebound;
    const bob = reduce || this.profile.bobAmp === 0 ? 0 : vertical * this.profile.bobAmp;
    avatar.group.position.y = bob;
    // Stroke surge: the hull checks at the catch and runs out through the
    // drive — a local longitudinal offset synced to the shared stroke phase.
    const surge = reduce || this.profile.surgeAmp === 0 ? 0 : motion.surge * this.profile.surgeAmp;
    avatar.group.position.z = this.sport === "rower" ? -surge : surge;
    // Hull roll mixes a slow ambient rock with a stroke-synced check so the
    // shell visibly loads at the catch instead of only drifting side to side.
    // Sport rigs may damp it while their equipment is water-locked (buried
    // scull blades stabilise the shell like outriggers through the drive).
    const ambientRoll = Math.sin(this.animPhase + cadence * 0.05) * 0.035;
    const strokeRoll = "surge" in motion ? motion.surge * 0.045 : 0;
    const rollDamp = "rollDamp" in motion && motion.rollDamp !== undefined ? motion.rollDamp : 1;
    avatar.group.rotation.z =
      reduce || !this.profile.roll ? 0 : (ambientRoll + strokeRoll) * rollDamp;
    // Sample the visible skin only after the complete deterministic lane frame
    // is current. RowErg can then solve each rigid inboard oar circle from the
    // real shoulder for this exact pose instead of inheriting floating-point
    // residue from the preceding seek.
    outer.updateMatrixWorld(true);
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

    const liveSurge = this.liveAvatar.group.position.z * (this.sport === "rower" ? -1 : 1);
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

    const liveWakeOffset = this.sport === "rower" ? 4.15 : 1.6;
    this.advanceWake(
      this.liveWake,
      dLive,
      p.x - p.tx * liveWakeOffset,
      p.z - p.tz * liveWakeOffset,
    );

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
      const ghostSurge = this.ghostAvatar.group.position.z * (this.sport === "rower" ? -1 : 1);
      this.ghostContactFootprint.position.set(
        gp.x + gp.tx * ghostSurge,
        this.sport === "rower" ? 0.021 : 0.017,
        gp.z + gp.tz * ghostSurge,
      );
      this.ghostContactFootprint.rotation.y = Math.atan2(gp.tx, gp.tz) - Math.PI / 2;
      const ghostWakeOffset = this.sport === "rower" ? 4.15 : 1.6;
      this.advanceWake(
        this.ghostWake,
        dGhost,
        gp.x - gp.tx * ghostWakeOffset,
        gp.z - gp.tz * ghostWakeOffset,
      );
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
      this.sport === "rower" ? (state.ghost ? 2.12 : 2.1) : state.ghost ? 1.38 : 1.2;
    const baseBack = this.reduceMotion
      ? (this.sport === "rower" ? 6.2 : sportRig.back + 0.8) + ghostPullback
      : narrow
        ? (sportRig.back + ghostPullback) * narrowScale
        : this.sport === "rower"
          ? 5.4 + ghostPullback
          : sportRig.back + ghostPullback;
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
    const qaGripLeft = this.qaCamera === "athlete-grip-left" && !state.ghost;
    const qaGrip = (this.qaCamera === "athlete-grip" || qaGripLeft) && !state.ghost;
    if (qaGrip) {
      this.liveAvatar.v4Targets.leftHand.getWorldPosition(this.qaGripFocus);
      this.liveAvatar.v4Targets.rightHand.getWorldPosition(this.qaGripOther);
      if (this.sport === "rower" && !qaGripLeft) {
        // Sculling hands converge at the finish, so their midpoint sits behind
        // the torso from every useful close-up. Track the starboard palm itself
        // to make the finger/handle enclosure reviewable at catch and finish.
        this.qaGripFocus.copy(this.qaGripOther);
      } else if (!qaGripLeft) {
        this.qaGripFocus.add(this.qaGripOther).multiplyScalar(0.5);
      }
      // `athlete-grip-left` keeps the port palm focus for the mirrored
      // enclosure evidence — both hands get their own close-up lane.
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
    // Capture-only complements: `athlete-rear` closes in from the athlete's
    // back side (opposite tangent to `athlete-front`) and `athlete-top`
    // hangs a steep arm-path view above the athlete. Query-gated like the
    // rest of the QA rig; the production chase never uses them.
    const qaRear = this.qaCamera === "athlete-rear" && !state.ghost;
    const qaTop = this.qaCamera === "athlete-top" && !state.ghost;
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
    const closeScale = qaGrip
      ? qaGripFront
        ? 0.035
        : 0.15
      : qaFront
        ? 0.22
        : qaTop
          ? 0.12
          : qaClose
            ? 0.42
            : 1;
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
        : qaTop
          ? sportRig.aimY + 3.1
          : (baseHeight + Math.min(2.5, comparisonSpan * 0.16)) * (qaClose ? 0.84 : 1);
    const qaLateral = qaGrip
      ? qaGripFront
        ? Math.min(0.12, lateral * 0.07)
        : Math.min(0.32, lateral * 0.14)
      : qaFront
        ? Math.min(0.16, lateral * 0.13)
        : lateral;
    const qaAhead = qaFront || qaGrip || qaTop ? 0 : ahead;
    // Front portraits approach ski/bike from ahead and the aft-facing rower
    // from behind the hull; the rear view is exactly the opposite side.
    const qaFromPositiveTangent =
      ((qaFront || qaGripFront) && this.sport !== "rower") || (qaRear && this.sport === "rower");
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
      (qaGrip ? 32 : 0) |
      (qaRear ? 64 : 0) |
      (qaTop ? 128 : 0) |
      (qaGripLeft ? 256 : 0);
    const cameraLayoutChanged = cameraLayoutMode !== this.cameraLayoutMode;
    this.cameraLayoutMode = cameraLayoutMode;
    // The port-palm close-up approaches from the port side of the course.
    const qaLateralSigned = qaGripLeft ? -qaLateral : qaLateral;
    this.chase.set(
      focusX +
        (qaFromPositiveTangent ? focusTx : -focusTx) * back +
        rx * (qaFromPositiveTangent ? -qaLateralSigned : qaLateralSigned),
      height,
      focusZ +
        (qaFromPositiveTangent ? focusTz : -focusTz) * back +
        rz * (qaFromPositiveTangent ? -qaLateralSigned : qaLateralSigned),
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
          if (m instanceof THREE.Material) {
            // Material-owned textures need an explicit dispose; the procedural
            // scenery maps are not tracked anywhere else.
            for (const texture of materialTextures(m)) texture.dispose();
            m.dispose();
          }
        }
      }
    });
    this.liveWake?.dispose();
    this.ghostWake?.dispose();
    // The radiance map hangs off scene.environment, not off any mesh, so the
    // traversal above never reaches it.
    this.skyRadiance?.dispose();
    this.skyRadiance = null;
    this.waterRadiance?.dispose();
    this.waterRadiance = null;
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
