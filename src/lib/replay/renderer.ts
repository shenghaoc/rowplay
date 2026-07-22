import type { Frame } from "./engine";
import type { Sport } from "../types";
import { fmtPace } from "../format";
import { ParticlePool, clampDt } from "./motion";
import { solveRigidContactPoint2D, solveTwoBone2D, type MutableFigurePoint2 } from "./figurePose";
import { SKI_POLE_APPROACH_START_CYCLE } from "./motionGraph";
import { catchTransitions, fallbackStrokePose, type StrokePose } from "./strokeModel";
import {
  solveBikeKinematics,
  solveRowerKinematics,
  solveSkierKinematics,
  type BikeKinematics,
  type RowerKinematics,
  type SkierKinematics,
} from "./sportKinematics";

// The replay playback itself is essential, user-initiated motion (the user
// presses play), so it is preserved under `prefers-reduced-motion`. What we do
// suppress is the *decorative* wake animation behind each avatar — a continuous
// sine wiggle that isn't conveying any data. One module-level MediaQueryList,
// read per frame: `.matches` updates live with the OS setting, so there's no
// per-frame allocation and no listener to leak.
const reducedMotionQuery =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

function prefersReducedMotion(): boolean {
  return reducedMotionQuery?.matches ?? false;
}

interface CanvasColors {
  tickMajor: string;
  tickMinor: string;
  tickText: string;
  laneLine: string;
  bibFill: string;
  bibText: string;
  bibDot: string;
  finishDark: string;
  finishLight: string;
  labelBg: string;
  labelText: string;
  /** Lane panel background — the "paper" the course is drawn on. */
  courseFill: string;
  /** Live athlete accent (mirrors --live). */
  live: string;
  /** Ghost comparison accent (mirrors --ghost). */
  ghost: string;
  /** Strip background top (sky gradient top). */
  skyTop: string;
  /** Strip background bottom (sky gradient bottom). */
  skyBottom: string;
  /** Buoy dot at tick × waterline. */
  markerCap: string;
  /** Bow wave / pod highlight. */
  foam: string;
  /** Pod cast shadow base (rgba mix). */
  shadow: string;
  /** Athlete skin, kept distinct from both live and ghost race-kit colours. */
  skin: string;
  /** Recessed/far-side skin used to preserve depth in the side silhouette. */
  skinShade: string;
  /** Hair and helmet-detail colour. */
  hair: string;
  /** Shoes, boots, and other contact-point footwear. */
  shoe: string;
}

// Canvas can't read CSS custom properties, so these mirror app.css. The
// `live`/`ghost` values in particular MUST stay in sync with `--live`/`--ghost`
// (light + dark) in app.css — `renderer.test.ts` parses app.css and fails if
// they drift. Exported for that test.
export const COLORS_LIGHT: CanvasColors = {
  tickMajor: "#bed0d7",
  tickMinor: "#d0dbdf",
  tickText: "#4a6470",
  laneLine: "#bed0d7",
  bibFill: "#f0f4f6",
  bibText: "#0f2a36",
  bibDot: "#f7fafb",
  finishDark: "#0f2a36",
  finishLight: "#f7fafb",
  labelBg: "#f7fafb",
  labelText: "#0f2a36",
  courseFill: "#e4ecef",
  live: "#5240ce",
  ghost: "#176b8c",
  skyTop: "#f2f7f9",
  skyBottom: "#e3edf1",
  markerCap: "#9fb8c2",
  foam: "#ffffff",
  shadow: "#0f2a36",
  skin: "#bb7053",
  skinShade: "#8e4f3d",
  hair: "#263840",
  shoe: "#172a33",
};

export const COLORS_DARK: CanvasColors = {
  tickMajor: "#3d505a",
  tickMinor: "#2e3d45",
  tickText: "#8aa2ac",
  laneLine: "#3d505a",
  bibFill: "#1c2a32",
  bibText: "#dce6ea",
  bibDot: "#0f2a36",
  finishDark: "#dce6ea",
  finishLight: "#0f2a36",
  labelBg: "#0f2a36",
  labelText: "#dce6ea",
  courseFill: "#142128",
  live: "#8c7cf0",
  ghost: "#3aa8cc",
  skyTop: "#0e1d26",
  skyBottom: "#0a151c",
  markerCap: "#3d505a",
  foam: "#bcd3dd",
  shadow: "#000000",
  skin: "#e2a27f",
  skinShade: "#ad6c54",
  hair: "#78919c",
  shoe: "#d9e4e8",
};

export interface AvatarState {
  /** Distance fraction 0..1 (position along the course). */
  distFrac: number;
  /** Pace label shown above the avatar. */
  pace: number;
  /** Stroke rate, drives the bob animation. */
  spm: number;
  /** Prefix shown above the ghost avatar (e.g. "PB", "2:00/500m", a filename). */
  label?: string;
}

export interface RenderState {
  frame: Frame;
  distFrac: number;
  totalDistance: number;
  /** Data-derived live stroke pose; replay views must build this for every frame. */
  strokePose: StrokePose;
  /** Optional ghost (a past session being raced), drawn in its own lane. */
  ghost?: AvatarState;
  /** Data-derived ghost stroke pose, when the ghost has stroke data. */
  ghostStrokePose?: StrokePose;
  /** Optional sport, used for the avatar pod glyph. Renderer degrades to a neutral marker when absent. */
  sport?: Sport;
}

/** Shared contract for 2D canvas and lazy-loaded 3D WebGL renderers. */
export interface ReplayRenderer {
  render(state: RenderState, playing: boolean, theme: "light" | "dark"): void;
  resize(cssWidth: number, cssHeight: number): void;
  destroy(): void;
}

// ── Constants ───────────────────────────────────────────────────────────────
const PAD_L = 58;
const PAD_R = 30;
const WATER_H = 34;
const POD_R = 9;
const BOB_AMP = 4.6;
/** Keep the athlete as the primary read inside the taller authored venue. */
// Canvas is the overview renderer, but it still needs enough visual mass for
// anatomy, contact hardware, and material separation to survive a high-DPI
// desktop or a narrow phone. This is deliberately modest: the course remains
// an overview rather than becoming a second chase camera.
const ATHLETE_SCALE = 2.32;
/** Forward/back hull surge per stroke (px), per sport. Bike pedals smoothly. */
const SURGE_PX: Record<Sport, number> = { rower: 6.4, skierg: 8.2, bike: 0 };
/** Splash droplets per lane; small and brief, so a tiny pool suffices. */
const SPLASH_CAP = 28;
/** Canvas y grows downward, so droplet gravity is positive (px/s²). */
const SPLASH_GRAVITY = 300;
const STREAK_ALPHAS = [0.35, 0.28, 0.22, 0.16] as const;
const STREAK_LENGTH_FACTORS = [1, 0.75, 0.55, 0.4] as const;
const STREAK_Y_OFFSETS = [-3, 0, 3, -5] as const;
const SKI_GROOVE_DASH = [6, 7];
const BIKE_CURB_DASH = [8, 8];
const BIKE_LANE_DASH = [12, 8];
const SOLID_LINE: number[] = [];
const BIKE_WHEEL_SPOKE_COUNT = 6;
/** Stable mid-drive pose used when decorative athlete motion is reduced. */
const REDUCED_POSE_PHASE = Math.PI * 0.5;
/** One shared readable pose for 2D/3D when decorative motion is reduced. */
export const REDUCED_REPLAY_POSES: Readonly<Record<Sport, StrokePose>> = {
  rower: fallbackStrokePose("rower", REDUCED_POSE_PHASE, 30),
  skierg: fallbackStrokePose("skierg", REDUCED_POSE_PHASE, 34),
  bike: fallbackStrokePose("bike", REDUCED_POSE_PHASE, 85),
};

/**
 * Environment colours are deliberately independent of the two racer accents.
 * Live/ghost colours identify athletes; these colours identify real materials
 * and venue depth. Keeping those semantic jobs separate prevents the course
 * from turning purple or cyan when a comparison lane is enabled.
 */
interface VenuePalette {
  skyTop: string;
  skyHorizon: string;
  haze: string;
  sun: string;
  ridgeFar: string;
  ridgeNear: string;
  foliageFar: string;
  foliageNear: string;
  structure: string;
  structureShade: string;
  structureLight: string;
  groundTop: string;
  groundMid: string;
  groundBottom: string;
  surfaceLine: string;
  surfaceHighlight: string;
  surfaceShadow: string;
  marker: string;
  safety: string;
  safetyLight: string;
}

const VENUES_LIGHT: Readonly<Record<Sport, VenuePalette>> = {
  rower: {
    skyTop: "#31769f",
    skyHorizon: "#e7c68d",
    haze: "#f8dfac",
    sun: "#fff0bd",
    ridgeFar: "#6f8d76",
    ridgeNear: "#365f4f",
    foliageFar: "#416d56",
    foliageNear: "#1d493f",
    structure: "#ece6d9",
    structureShade: "#8c7b67",
    structureLight: "#ffd68a",
    groundTop: "#3d879b",
    groundMid: "#185a6c",
    groundBottom: "#0a3544",
    surfaceLine: "#8fd0db",
    surfaceHighlight: "#e0f5f7",
    surfaceShadow: "#082a37",
    marker: "#ef5b42",
    safety: "#d9e7e7",
    safetyLight: "#ffffff",
  },
  skierg: {
    skyTop: "#357db3",
    skyHorizon: "#dcecf5",
    haze: "#f6fbfd",
    sun: "#fff5cf",
    ridgeFar: "#b8cedb",
    ridgeNear: "#66899e",
    foliageFar: "#43675d",
    foliageNear: "#244a42",
    structure: "#e7edf1",
    structureShade: "#607887",
    structureLight: "#fff1b2",
    groundTop: "#f2f7fa",
    groundMid: "#d5e4ee",
    groundBottom: "#b0c9d8",
    surfaceLine: "#8eb5c8",
    surfaceHighlight: "#ffffff",
    surfaceShadow: "#6f96ab",
    marker: "#6d5ef5",
    safety: "#1e6292",
    safetyLight: "#f5fbfd",
  },
  bike: {
    skyTop: "#3b5877",
    skyHorizon: "#e4a06f",
    haze: "#f5c997",
    sun: "#ffe0a1",
    ridgeFar: "#65727c",
    ridgeNear: "#3b474f",
    foliageFar: "#46584f",
    foliageNear: "#2a3935",
    structure: "#d6d9da",
    structureShade: "#565f66",
    structureLight: "#ffd77f",
    groundTop: "#4f575f",
    groundMid: "#343b42",
    groundBottom: "#1d2329",
    surfaceLine: "#8e989e",
    surfaceHighlight: "#c2c9cc",
    surfaceShadow: "#12171c",
    marker: "#e8483f",
    safety: "#d6d2c9",
    safetyLight: "#f5f0e7",
  },
};

const VENUES_DARK: Readonly<Record<Sport, VenuePalette>> = {
  rower: {
    skyTop: "#071724",
    skyHorizon: "#294f62",
    haze: "#718c93",
    sun: "#f0c67b",
    ridgeFar: "#294b46",
    ridgeNear: "#173832",
    foliageFar: "#23483d",
    foliageNear: "#102e29",
    structure: "#8c908c",
    structureShade: "#3b4648",
    structureLight: "#f0b65c",
    groundTop: "#1f5a6c",
    groundMid: "#0f3644",
    groundBottom: "#061c26",
    surfaceLine: "#5aa3b4",
    surfaceHighlight: "#b6dce2",
    surfaceShadow: "#03141c",
    marker: "#ef6a4e",
    safety: "#60777c",
    safetyLight: "#c8d9db",
  },
  skierg: {
    skyTop: "#061522",
    skyHorizon: "#28516a",
    haze: "#7795a5",
    sun: "#e8d5a1",
    ridgeFar: "#60798a",
    ridgeNear: "#334f60",
    foliageFar: "#28473f",
    foliageNear: "#142f2b",
    structure: "#71838c",
    structureShade: "#293c47",
    structureLight: "#ffe099",
    groundTop: "#cfe3ec",
    groundMid: "#9fbfd0",
    groundBottom: "#6e93a6",
    surfaceLine: "#6f9eb3",
    surfaceHighlight: "#f1f7f9",
    surfaceShadow: "#456c80",
    marker: "#8b7cf5",
    safety: "#1f5f85",
    safetyLight: "#d7e8ee",
  },
  bike: {
    skyTop: "#070f1b",
    skyHorizon: "#3a3546",
    haze: "#86644f",
    sun: "#d9a55f",
    ridgeFar: "#303a43",
    ridgeNear: "#1c252c",
    foliageFar: "#26342e",
    foliageNear: "#141f1d",
    structure: "#777e82",
    structureShade: "#293036",
    structureLight: "#ffd16e",
    groundTop: "#3a4249",
    groundMid: "#262d33",
    groundBottom: "#13181d",
    surfaceLine: "#6e7b82",
    surfaceHighlight: "#aab5ba",
    surfaceShadow: "#080c10",
    marker: "#ef554a",
    safety: "#9a9a94",
    safetyLight: "#e5e2d9",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Convert `#rgb` or `#rrggbb` to `rgba(r,g,b,a)`.
 *
 * Memoised: the renderer calls this ~20×/frame but only ever with a small,
 * constant set of `(hex, alpha)` pairs per theme, so the cache keeps the hot
 * path allocation-free after warm-up (no per-frame `parseInt` or string churn).
 */
const alphaCache = new Map<string, string>();
function withAlpha(hex: string, a: number): string {
  const key = `${hex}@${a}`;
  const cached = alphaCache.get(key);
  if (cached) return cached;
  let r = 0,
    g = 0,
    b = 0;
  const h = hex.replace("#", "");
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
  } else {
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  }
  const rgba = `rgba(${r},${g},${b},${a})`;
  alphaCache.set(key, rgba);
  return rgba;
}

/**
 * Map pace (seconds per 500m) to a speed-streak length.
 * Faster (smaller pace) => longer streak. Clamped to [6, 22].
 * Safe for pace === 0 or NaN.
 */
function streakLen(pace: number): number {
  if (!pace || !isFinite(pace)) return 6;
  // Reference range: 90s/500m (sprint) -> 22, 200s/500m (slow) -> 6
  const clamped = Math.max(90, Math.min(200, pace));
  const t = (clamped - 90) / (200 - 90); // 0 = fast, 1 = slow
  return 22 - t * (22 - 6); // 22 down to 6
}

// ── Sport avatars ─────────────────────────────────────────────────────────────
// Each draws a side-profile athlete (facing the finish, +x). The shared sport
// solvers turn a StrokePose into sequenced joint channels, so cadence changes
// timing without collapsing the legs/body/arms order. `y` is the contact line;
// `bobY` is the floating centre; reduced motion receives a representative pose.

const jointRootScratch: MutableFigurePoint2 = { x: 0, y: 0 };
const jointTargetScratch: MutableFigurePoint2 = { x: 0, y: 0 };
const jointEndScratch: MutableFigurePoint2 = { x: 0, y: 0 };
const rigidCenterScratch: MutableFigurePoint2 = { x: 0, y: 0 };

/** Adapt scalar Canvas coordinates to the shared allocation-free figure solver. */
function solveTwoBoneJoint2D(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  firstLength: number,
  secondLength: number,
  bendDirection: number,
  out: MutableFigurePoint2,
): MutableFigurePoint2 {
  jointRootScratch.x = startX;
  jointRootScratch.y = startY;
  jointTargetScratch.x = endX;
  jointTargetScratch.y = endY;
  return solveTwoBone2D(
    jointRootScratch,
    jointTargetScratch,
    firstLength,
    secondLength,
    bendDirection,
    out,
    jointEndScratch,
  );
}

const rowerElbowAlternateScratch: MutableFigurePoint2 = { x: 0, y: 0 };

/**
 * Solve a side-profile rowing arm on the rearward elbow branch.
 *
 * Rowers face +x in Canvas, so behind the torso / toward the bow is -x. A generic
 * signed bend parameter is fragile here: as the shoulder-to-grip chord passes
 * through vertical it can select the forward-pointing solution even though both
 * solutions preserve identical segment lengths and hand contact. Resolve both
 * branches and retain the one with the smaller x coordinate instead. At the
 * near-straight catch the branches converge; once the late arm draw creates a
 * visible elbow, it therefore travels behind the shoulder rather than into the
 * chest or toward the handle.
 */
export function solveRowerElbow2D(
  shoulderX: number,
  shoulderY: number,
  handX: number,
  handY: number,
  upperArmLength: number,
  forearmLength: number,
  out: MutableFigurePoint2,
): MutableFigurePoint2 {
  solveTwoBoneJoint2D(shoulderX, shoulderY, handX, handY, upperArmLength, forearmLength, 1, out);
  solveTwoBoneJoint2D(
    shoulderX,
    shoulderY,
    handX,
    handY,
    upperArmLength,
    forearmLength,
    -1,
    rowerElbowAlternateScratch,
  );
  if (rowerElbowAlternateScratch.x < out.x) {
    out.x = rowerElbowAlternateScratch.x;
    out.y = rowerElbowAlternateScratch.y;
  }
  return out;
}

/**
 * Solve the continuous side-profile SkiErg arm branch.
 *
 * Canvas y increases downward and the skier faces +x. On this outside branch,
 * a high/forward hand puts the elbow below the shoulder at plant; as the same
 * rigid hand arc passes the torso, that elbow naturally migrates rearward.
 * Keeping one branch through recovery prevents the old horizontal inversion,
 * and the arm returns to the down-pointing plant without a discrete swap.
 */
export function solveSkierElbow2D(
  shoulderX: number,
  shoulderY: number,
  handX: number,
  handY: number,
  upperArmLength: number,
  forearmLength: number,
  out: MutableFigurePoint2,
): MutableFigurePoint2 {
  return solveTwoBoneJoint2D(
    shoulderX,
    shoulderY,
    handX,
    handY,
    upperArmLength,
    forearmLength,
    1,
    out,
  );
}

/** Resolve a continuous oar angle whose rigid inboard grip meets an arm reach. */
function solveRowerOarAngle2D(
  shoulderX: number,
  shoulderY: number,
  lockX: number,
  lockY: number,
  inboardLength: number,
  requestedReach: number,
  preferredAngle: number,
): number {
  const pinDeltaX = lockX - shoulderX;
  const pinDeltaY = lockY - shoulderY;
  const amplitude = Math.hypot(pinDeltaX, pinDeltaY);
  if (amplitude < 1e-8 || inboardLength < 1e-8) return preferredAngle;
  const signedInboard = -inboardLength;
  const baseDistanceSquared =
    pinDeltaX * pinDeltaX + pinDeltaY * pinDeltaY + signedInboard * signedInboard;
  const cosine = Math.max(
    -1,
    Math.min(
      1,
      (requestedReach * requestedReach - baseDistanceSquared) / (2 * signedInboard * amplitude),
    ),
  );
  const center = Math.atan2(pinDeltaY, pinDeltaX);
  const offset = Math.acos(cosine);
  // The +offset branch is the continuous rearward-elbow solution for the
  // side-profile scull. Choosing whichever branch happened to be nearest the
  // aesthetic sweep let the two valid circle intersections swap mid-draw,
  // producing a one-frame elbow jump.
  return center + offset;
}

function interpolateAngle(from: number, to: number, amount: number): number {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * amount;
}

/** Scalar adapter for the allocation-free planar closed-chain solver. */
function constrainRigidContact2D(
  rootX: number,
  rootY: number,
  preferredX: number,
  preferredY: number,
  centerX: number,
  centerY: number,
  contactLength: number,
  minimumReach: number,
  maximumReach: number,
  out: MutableFigurePoint2,
): boolean {
  jointRootScratch.x = rootX;
  jointRootScratch.y = rootY;
  jointTargetScratch.x = preferredX;
  jointTargetScratch.y = preferredY;
  rigidCenterScratch.x = centerX;
  rigidCenterScratch.y = centerY;
  return solveRigidContactPoint2D(
    jointRootScratch,
    jointTargetScratch,
    rigidCenterScratch,
    contactLength,
    minimumReach,
    maximumReach,
    out,
  );
}

export interface RigidOar2D {
  handleX: number;
  handleY: number;
  bladeRootX: number;
  bladeRootY: number;
  bladeTipX: number;
  bladeTipY: number;
}

/**
 * Resolve a point on a BikeErg wheel or crank in Canvas coordinates.
 *
 * Canvas y grows downward, so an increasing angle is visibly clockwise. That
 * is the forward-rolling direction for the drive-side profile used here. Keep
 * this signed convention shared by the wheels, cranks, and direction markers:
 * reversing only one of them creates the familiar "pedalling backwards"
 * illusion even when every individual pose still looks plausible.
 */
export function solveBikeRotationPoint2D(
  centerX: number,
  centerY: number,
  radius: number,
  clockwiseAngle: number,
  out: MutableFigurePoint2,
): MutableFigurePoint2 {
  out.x = centerX + Math.cos(clockwiseAngle) * radius;
  out.y = centerY + Math.sin(clockwiseAngle) * radius;
  return out;
}

/** Resolve one straight oar from handle through oarlock to blade tip. */
export function solveRigidOar2D(
  lockX: number,
  lockY: number,
  angle: number,
  inboardLength: number,
  outboardLength: number,
  bladeLength: number,
  out: RigidOar2D,
): RigidOar2D {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  out.handleX = lockX - ux * inboardLength;
  out.handleY = lockY - uy * inboardLength;
  out.bladeRootX = lockX + ux * outboardLength;
  out.bladeRootY = lockY + uy * outboardLength;
  out.bladeTipX = out.bladeRootX + ux * bladeLength;
  out.bladeTipY = out.bladeRootY + uy * bladeLength;
  return out;
}

/**
 * Reconstruct the screen-space course point where a 2D SkiErg basket planted.
 * The athlete advances with workout distance; subtracting the within-stroke
 * travel keeps the loaded basket in world space instead of dragging it with
 * the torso. This mirrors the 3D course-anchor reconstruction.
 */
export function skiPolePlantCourseX2D(
  currentCourseX: number,
  pixelsPerMeter: number,
  pose: StrokePose,
): number {
  // As the airborne basket begins its final approach it is already targeting
  // the *next* catch. The anchor changes exactly while poleFlight is one, so
  // the handoff has zero visible weight; the subsequent C2 descent cannot
  // drop or snap from the previous plant to the next one.
  const plantCycle = pose.index + (pose.cycleFrac >= SKI_POLE_APPROACH_START_CYCLE ? 1 : 0);
  const currentCycle = pose.index + pose.cycleFrac;
  const distanceSincePlant = (currentCycle - plantCycle) * Math.max(0, pose.strokeMeters);
  const scale = Number.isFinite(pixelsPerMeter) ? Math.max(0, pixelsPerMeter) : 0;
  return currentCourseX - distanceSincePlant * scale;
}

/** Approximate scaled silhouette height above the contact line for HUD clearance. */
export const ATHLETE_TOP_CLEARANCE_2D: Readonly<Record<Sport, number>> = {
  rower: 50,
  skierg: 57,
  bike: 62,
};

const jointScratchA: MutableFigurePoint2 = { x: 0, y: 0 };
const jointScratchB: MutableFigurePoint2 = { x: 0, y: 0 };
const rowOarNear: RigidOar2D = {
  handleX: 0,
  handleY: 0,
  bladeRootX: 0,
  bladeRootY: 0,
  bladeTipX: 0,
  bladeTipY: 0,
};
const rowOarFar: RigidOar2D = {
  handleX: 0,
  handleY: 0,
  bladeRootX: 0,
  bladeRootY: 0,
  bladeTipX: 0,
  bladeTipY: 0,
};

/** Rounded limb / machine strut segment. */
function limb(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w: number,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/**
 * Filled tapered anatomical segment, wider at its proximal end.
 *
 * The prior four-edge trapezoid was technically concise but its perfectly
 * straight shoulders read as a cardboard limb once the replay was rendered at
 * Retina scale. Keep the exact distal edge (the geometry tests use it to pin
 * pedal/foot contacts), then curve the long sides and proximal transition so
 * each segment reads as connected anatomy rather than a block.
 */
function taperedLimb(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  proximalWidth: number,
  distalWidth: number,
  color: string,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length < 1e-5) return;
  const nx = -dy / length;
  const ny = dx / length;
  const p = proximalWidth * 0.5;
  const d = distalWidth * 0.5;
  const curveX = dx * 0.26;
  const curveY = dy * 0.26;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1 + nx * p, y1 + ny * p);
  // Retain paired straight distal edges so the visual segment terminates on
  // its solved contact point, while the main shaft remains softly contoured.
  ctx.quadraticCurveTo(
    x1 + curveX + nx * (p * 0.92 + d * 0.08),
    y1 + curveY + ny * (p * 0.92 + d * 0.08),
    x2 + nx * d,
    y2 + ny * d,
  );
  ctx.lineTo(x2 - nx * d, y2 - ny * d);
  ctx.quadraticCurveTo(
    x1 + curveX - nx * (p * 0.92 + d * 0.08),
    y1 + curveY - ny * (p * 0.92 + d * 0.08),
    x1 - nx * p,
    y1 - ny * p,
  );
  ctx.quadraticCurveTo(x1 - dx * 0.075, y1 - dy * 0.075, x1 + nx * p, y1 + ny * p);
  ctx.closePath();
  ctx.fill();
}

/** Filled disc (hub / anatomical joint). */
function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Shoulder-tapered jersey rather than a single stick through the torso. */
function shapedTorso(
  ctx: CanvasRenderingContext2D,
  hipX: number,
  hipY: number,
  shoulderX: number,
  shoulderY: number,
  hipHalfWidth: number,
  shoulderHalfWidth: number,
  color: string,
  seam: string,
) {
  const dx = shoulderX - hipX;
  const dy = shoulderY - hipY;
  const length = Math.max(1e-5, Math.hypot(dx, dy));
  const nx = -dy / length;
  const ny = dx / length;
  const midX = (hipX + shoulderX) * 0.5;
  const midY = (hipY + shoulderY) * 0.5;
  const waistHalfWidth = Math.min(hipHalfWidth, shoulderHalfWidth) * 0.74;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(hipX + nx * hipHalfWidth, hipY + ny * hipHalfWidth);
  ctx.quadraticCurveTo(
    midX + nx * waistHalfWidth,
    midY + ny * waistHalfWidth,
    shoulderX + nx * shoulderHalfWidth,
    shoulderY + ny * shoulderHalfWidth,
  );
  ctx.quadraticCurveTo(
    shoulderX + dx * 0.05,
    shoulderY + dy * 0.05,
    shoulderX - nx * shoulderHalfWidth,
    shoulderY - ny * shoulderHalfWidth,
  );
  ctx.quadraticCurveTo(
    midX - nx * waistHalfWidth,
    midY - ny * waistHalfWidth,
    hipX - nx * hipHalfWidth,
    hipY - ny * hipHalfWidth,
  );
  ctx.closePath();
  ctx.fill();

  // A tiny shoulder-to-waist panel is enough to establish fabric direction at
  // this scale. It deliberately follows the torso axis, so it reads in every
  // stroke pose instead of becoming a static stripe painted across a body.
  ctx.strokeStyle = withAlpha(seam, 0.7);
  ctx.lineWidth = 0.52;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(hipX + nx * waistHalfWidth * 0.55, hipY + ny * waistHalfWidth * 0.55);
  ctx.quadraticCurveTo(
    midX + nx * waistHalfWidth * 0.72,
    midY + ny * waistHalfWidth * 0.72,
    shoulderX + nx * shoulderHalfWidth * 0.57,
    shoulderY + ny * shoulderHalfWidth * 0.57,
  );
  ctx.stroke();

  ctx.strokeStyle = seam;
  ctx.lineWidth = 0.65;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(shoulderX, shoulderY);
  ctx.stroke();
}

/** Side-profile head with a jaw, nose, neck, and either hair or a helmet. */
function profileHead(
  ctx: CanvasRenderingContext2D,
  shoulderX: number,
  shoulderY: number,
  skin: string,
  hair: string,
  helmet: string | null = null,
) {
  const headX = shoulderX + 0.85;
  const headY = shoulderY - 3.55;
  taperedLimb(
    ctx,
    shoulderX + 0.15,
    shoulderY - 0.35,
    headX - 0.25,
    headY + 1.85,
    1.65,
    1.35,
    skin,
  );
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(headX, headY, 2.35, 2.75, -0.12, 0, Math.PI * 2);
  ctx.fill();

  // One cheek shade, ear, and facing eye prevent the high-resolution head
  // from resolving into a featureless circle. These marks stay intentionally
  // tiny so the athlete remains a generic illustration, not a likeness.
  ctx.fillStyle = withAlpha(hair, 0.32);
  ctx.beginPath();
  ctx.ellipse(headX + 0.72, headY + 0.72, 1.05, 0.78, -0.08, 0, Math.PI * 2);
  ctx.fill();
  disc(ctx, headX - 1.72, headY + 0.28, 0.42, withAlpha(skin, 0.76));
  disc(ctx, headX + 1.36, headY - 0.34, 0.28, hair);
  // Jaw and brow give the head a facing direction from the side profile.
  ctx.beginPath();
  ctx.ellipse(headX + 0.15, headY + 1.1, 1.55, 1.05, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(headX + 1.8, headY - 0.55);
  ctx.lineTo(headX + 3.05, headY + 0.08);
  ctx.lineTo(headX + 1.7, headY + 0.55);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = helmet ?? hair;
  ctx.beginPath();
  ctx.moveTo(headX - 2.1, headY - 0.1);
  ctx.quadraticCurveTo(headX - 1.2, headY - 3.25, headX + 1.45, headY - 2.4);
  ctx.quadraticCurveTo(headX + 2.35, headY - 1.85, headX + 1.95, headY - 1.15);
  ctx.quadraticCurveTo(headX - 0.1, headY - 1.85, headX - 2.1, headY - 0.1);
  ctx.closePath();
  ctx.fill();
  if (helmet) {
    limb(ctx, headX + 0.35, headY + 1.4, headX + 1.8, headY + 1.65, 0.6, hair);
    limb(ctx, headX + 1.25, headY - 1.2, headX + 2.85, headY - 0.95, 0.75, helmet);
    limb(ctx, headX - 0.7, headY - 2.05, headX + 0.8, headY - 2.5, 0.45, withAlpha(skin, 0.55));
  }
}

function drawShoe(
  ctx: CanvasRenderingContext2D,
  ankleX: number,
  ankleY: number,
  toeX: number,
  toeY: number,
  color: string,
) {
  taperedLimb(ctx, ankleX, ankleY, toeX, toeY, 1.55, 2.15, color);
  disc(ctx, toeX, toeY, 0.85, color);
}

/** Compact shoulder mass that keeps the upper arm attached at replay scale. */
function drawShoulderCap(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  radius = 1.28,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, radius, radius * 0.82, -0.16, 0, Math.PI * 2);
  ctx.fill();
}

/** Ski shaft finishing hardware: a grip collar at the hand and a real basket. */
function drawSkiPoleHardware(
  ctx: CanvasRenderingContext2D,
  handX: number,
  handY: number,
  tipX: number,
  tipY: number,
  shaftColor: string,
  detailColor: string,
) {
  const dx = tipX - handX;
  const dy = tipY - handY;
  const length = Math.max(1e-5, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;

  // The grip follows the rigid shaft; the hand is painted over its root later.
  limb(ctx, handX, handY, handX + ux * 1.8, handY + uy * 1.8, 1.6, detailColor);
  // A perpendicular basket makes the planted end legible even without spray.
  limb(
    ctx,
    tipX - nx * 1.05,
    tipY - ny * 1.05,
    tipX + nx * 1.05,
    tipY + ny * 1.05,
    0.62,
    shaftColor,
  );
  disc(ctx, tipX, tipY, 0.48, detailColor);
  ctx.strokeStyle = withAlpha(shaftColor, 0.82);
  ctx.lineWidth = 0.46;
  ctx.beginPath();
  ctx.ellipse(tipX, tipY, 1.18, 0.52, Math.atan2(uy, ux), 0, Math.PI * 2);
  ctx.stroke();
}

/** Short neutral ski with a restrained upturned tip beneath one planted boot. */
function drawSki(
  ctx: CanvasRenderingContext2D,
  footX: number,
  groundY: number,
  bodyColor: string,
  tipColor: string,
) {
  limb(ctx, footX - 3.1, groundY + 0.35, footX + 2.65, groundY + 0.35, 1.18, bodyColor);
  limb(
    ctx,
    footX - 2.25,
    groundY + 0.08,
    footX + 1.95,
    groundY + 0.08,
    0.34,
    withAlpha(tipColor, 0.72),
  );
  limb(ctx, footX + 2.65, groundY + 0.35, footX + 3.45, groundY - 0.3, 1.05, tipColor);
  roundRect(ctx, footX - 0.82, groundY - 0.55, 1.65, 0.78, 0.28);
  ctx.fillStyle = withAlpha(bodyColor, 0.78);
  ctx.fill();
}

/** A level pedal platform keeps foot contact readable through the full cycle. */
function drawBikePedal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  width = 0.9,
) {
  limb(ctx, x - 1.25, y + 0.12, x + 1.25, y - 0.12, width, color);
  disc(ctx, x, y, Math.max(0.36, width * 0.42), color);
}

/**
 * Paint one wheel with a single tracked valve/chevron.
 *
 * Symmetric spokes repeat every quarter turn and can alias into reverse motion
 * at some cadences (the wagon-wheel effect). The asymmetric valve and tangent
 * chevron preserve an unambiguous clockwise cue without falsifying wheel roll.
 */
function drawBikeWheel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  clockwiseAngle: number,
  markerOffset: number,
  accent: string,
  rim: string,
  shoe: string,
) {
  ctx.strokeStyle = withAlpha(shoe, 0.72);
  ctx.lineWidth = 2.15;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(x, y, radius - 0.55, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = withAlpha(rim, 0.52);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(x, y, radius - 1.2, 0, Math.PI * 2);
  ctx.stroke();

  for (let spoke = 0; spoke < BIKE_WHEEL_SPOKE_COUNT; spoke++) {
    const angle = clockwiseAngle + (spoke * Math.PI * 2) / BIKE_WHEEL_SPOKE_COUNT;
    solveBikeRotationPoint2D(x, y, radius, angle, jointScratchB);
    limb(ctx, x, y, jointScratchB.x, jointScratchB.y, 0.62, withAlpha(rim, 0.74));
    limb(
      ctx,
      x + (jointScratchB.x - x) * 0.18,
      y + (jointScratchB.y - y) * 0.18,
      x + (jointScratchB.x - x) * 0.92,
      y + (jointScratchB.y - y) * 0.92,
      0.22,
      withAlpha(shoe, 0.5),
    );
  }

  const markerAngle = clockwiseAngle + markerOffset;
  const cosine = Math.cos(markerAngle);
  const sine = Math.sin(markerAngle);
  const radialX = cosine;
  const radialY = sine;
  // Positive-angle tangent in a y-down canvas: this points clockwise.
  const tangentX = -sine;
  const tangentY = cosine;
  const markerX = x + radialX * radius * 0.82;
  const markerY = y + radialY * radius * 0.82;
  limb(
    ctx,
    markerX - tangentX * 1.15 + radialX * 0.48,
    markerY - tangentY * 1.15 + radialY * 0.48,
    markerX + tangentX * 0.62,
    markerY + tangentY * 0.62,
    0.72,
    shoe,
  );
  limb(
    ctx,
    markerX - tangentX * 1.15 - radialX * 0.48,
    markerY - tangentY * 1.15 - radialY * 0.48,
    markerX + tangentX * 0.62,
    markerY + tangentY * 0.62,
    0.72,
    shoe,
  );
  disc(ctx, markerX, markerY, 0.58, accent);
  disc(ctx, x, y, 1.1, accent);
}

/** A soft, asymmetric evergreen silhouette rather than a repeated triangle. */
function drawEvergreen(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  height: number,
  body: string,
  light: string,
) {
  const half = height * 0.21;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(x, baseY - height);
  ctx.quadraticCurveTo(
    x - half * 0.36,
    baseY - height * 0.72,
    x - half * 0.58,
    baseY - height * 0.61,
  );
  ctx.quadraticCurveTo(
    x - half * 1.08,
    baseY - height * 0.39,
    x - half * 0.82,
    baseY - height * 0.31,
  );
  ctx.quadraticCurveTo(x - half * 1.3, baseY - height * 0.12, x - half, baseY);
  ctx.lineTo(x + half, baseY);
  ctx.quadraticCurveTo(
    x + half * 1.2,
    baseY - height * 0.12,
    x + half * 0.72,
    baseY - height * 0.31,
  );
  ctx.quadraticCurveTo(x + half, baseY - height * 0.43, x + half * 0.42, baseY - height * 0.6);
  ctx.quadraticCurveTo(x + half * 0.22, baseY - height * 0.79, x, baseY - height);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = withAlpha(light, 0.36);
  ctx.beginPath();
  ctx.moveTo(x - height * 0.025, baseY - height * 0.87);
  ctx.quadraticCurveTo(
    x - half * 0.52,
    baseY - height * 0.49,
    x - half * 0.36,
    baseY - height * 0.16,
  );
  ctx.lineTo(x - half * 0.05, baseY - height * 0.12);
  ctx.quadraticCurveTo(
    x + half * 0.07,
    baseY - height * 0.52,
    x - height * 0.025,
    baseY - height * 0.87,
  );
  ctx.closePath();
  ctx.fill();
}

interface AvatarDrawCtx {
  x: number;
  /** Course-space athlete X at this stroke's SkiErg pole plant. */
  polePlantCourseX: number;
  /** Waterline / ground. */
  y: number;
  /** Bobbing centre for floating parts. */
  bobY: number;
  /** Cumulative course distance, used for distance-locked wheel rotation. */
  meters: number;
  accent: string;
  rim: string;
  foam: string;
  skin: string;
  skinShade: string;
  hair: string;
  shoe: string;
  reduce: boolean;
}

/** Rowing shell with fixed feet and legs → body → arms drive sequencing. */
function drawRower(ctx: CanvasRenderingContext2D, a: AvatarDrawCtx, k: RowerKinematics) {
  const { x, bobY, accent, rim, foam, skin, skinShade, hair, shoe, reduce } = a;
  const HL = 17;
  const HH = 2.8;

  // Resolve the body and both sculling oars before painting so far-side parts
  // sit behind the shell while near-side joints remain readable.
  const seatX = x + 4.2 - k.legExtension * 11.4;
  const seatY = bobY - 2;
  // A fixed-length torso rotates from a forward catch to a restrained finish
  // layback. The former linear x/y interpolation put the shoulders far behind
  // the seat, forcing a nominally correct arm solver to point the elbows at the
  // bow simply to reach the grips.
  const torsoAngle = -1.04 - k.bodySwing * 0.58;
  const torsoLength = 8.9;
  const shX = seatX + Math.cos(torsoAngle) * torsoLength;
  const shY = seatY + Math.sin(torsoAngle) * torsoLength;
  const footX = x + 10.4;
  const footY = bobY - 1;
  // Mirror the shared graph's leg → body → arm handle weighting. A slightly
  // higher finish angle brings the hands toward the lower ribs instead of
  // leaving the arms stretched toward the knees after the body has opened.
  const strokeProgress = k.legExtension * 0.42 + k.bodySwing * 0.32 + k.armDraw * 0.26;
  const oarCatchAngle = Math.PI - 0.22;
  const oarFinishAngle = 0.7;
  const preferredOarAngle = oarCatchAngle - strokeProgress * (oarCatchAngle - oarFinishAngle);
  const oarlockX = x + 0.4;
  const oarlockY = bobY - 0.2;
  // Match the visible arm scale to the torso and grip path: nearly straight
  // through the catch/leg drive, with enough late-draw flex to read clearly.
  const upperArmLength = 4.3;
  const forearmLength = 4.2;
  // Keep the pre-draw elbow softly unlocked but visually straight. The shared
  // armDraw channel is already a late, C2-eased curve whose onset coincides
  // with the drive-side hand/knee crossover; applying another threshold here
  // used to postpone visible flexion until well after the hand had cleared the
  // knee. Consume that channel directly, matching the procedural/V4 3D path.
  const structuralMaximumReach = upperArmLength + forearmLength - 0.006;
  const armClosure = clamp01(k.armDraw);
  const farLockY = oarlockY - 0.65;
  const farLongAngle = solveRowerOarAngle2D(
    shX - 0.4,
    shY - 0.4,
    oarlockX,
    farLockY,
    7.1,
    structuralMaximumReach,
    preferredOarAngle + 0.035,
  );
  solveRigidOar2D(
    oarlockX,
    farLockY,
    interpolateAngle(farLongAngle, oarFinishAngle + 0.035, armClosure),
    7.1,
    13.8,
    4.0,
    rowOarFar,
  );
  const nearLockY = oarlockY + 0.4;
  const nearLongAngle = solveRowerOarAngle2D(
    shX,
    shY + 0.2,
    oarlockX,
    nearLockY,
    7.1,
    structuralMaximumReach,
    preferredOarAngle,
  );
  solveRigidOar2D(
    oarlockX,
    nearLockY,
    interpolateAngle(nearLongAngle, oarFinishAngle, armClosure),
    7.1,
    13.8,
    4.0,
    rowOarNear,
  );
  const farKit = withAlpha(accent, 0.52);

  // Feathering changes blade thickness only: the oar remains one straight,
  // fixed-length lever from the far hand through the lock to the blade tip.
  limb(
    ctx,
    rowOarFar.handleX,
    rowOarFar.handleY,
    rowOarFar.bladeRootX,
    rowOarFar.bladeRootY,
    1.05,
    withAlpha(rim, 0.55),
  );
  taperedLimb(
    ctx,
    rowOarFar.bladeRootX,
    rowOarFar.bladeRootY,
    rowOarFar.bladeTipX,
    rowOarFar.bladeTipY,
    2.45 - k.bladeFeather * 1.15,
    3.1 - k.bladeFeather * 1.45,
    farKit,
  );
  limb(
    ctx,
    rowOarFar.bladeRootX,
    rowOarFar.bladeRootY,
    rowOarFar.bladeTipX,
    rowOarFar.bladeTipY,
    0.4,
    withAlpha(foam, 0.34),
  );

  // Hull — long, pointed racing shell on the water.
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(x - HL, bobY);
  ctx.quadraticCurveTo(x - HL * 0.2, bobY - HH, x + HL, bobY);
  ctx.quadraticCurveTo(x - HL * 0.2, bobY + HH, x - HL, bobY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1;
  ctx.stroke();

  // A recessed cockpit, gunwale highlight, and bow deck line turn the shell
  // into a lightweight racing boat rather than a flat colour capsule.
  ctx.fillStyle = withAlpha(rim, 0.26);
  ctx.beginPath();
  ctx.ellipse(x - 0.55, bobY + 0.05, HL * 0.46, HH * 0.47, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha(foam, 0.78);
  ctx.lineWidth = 0.48;
  ctx.beginPath();
  ctx.moveTo(x - HL * 0.64, bobY - HH * 0.43);
  ctx.quadraticCurveTo(x + HL * 0.22, bobY - HH * 0.9, x + HL * 0.75, bobY - HH * 0.2);
  ctx.stroke();
  ctx.fillStyle = withAlpha(foam, 0.64);
  roundRect(ctx, x + HL * 0.38, bobY - 0.48, HL * 0.23, 0.84, 0.36);
  ctx.fill();

  // The seat rail and foot stretcher keep the lower body visibly supported.
  // Both solved ankles terminate at this fixed plate rather than floating in
  // the hull colour.
  limb(ctx, seatX - 1.4, seatY + 0.65, footX - 0.4, footY + 0.45, 0.72, withAlpha(rim, 0.7));
  limb(ctx, footX, footY - 2.15, footX, footY + 1.15, 1.15, rim);
  limb(ctx, footX - 0.65, footY - 1.35, footX + 0.65, footY - 1.35, 0.72, withAlpha(foam, 0.78));

  // Oarlock collars survive feathering and make the lever pivots explicit.
  disc(ctx, oarlockX, oarlockY - 0.65, 0.86, withAlpha(rim, 0.72));
  disc(ctx, oarlockX, oarlockY - 0.65, 0.36, farKit);

  // Far leg and arm establish depth behind the near-side anatomy.
  solveTwoBoneJoint2D(
    seatX - 0.45,
    seatY - 0.45,
    footX,
    footY - 0.5,
    7.85,
    7.65,
    -1,
    jointScratchA,
  );
  taperedLimb(ctx, seatX - 0.45, seatY - 0.45, jointScratchA.x, jointScratchA.y, 2.8, 2.1, farKit);
  taperedLimb(
    ctx,
    jointScratchA.x,
    jointScratchA.y,
    jointEndScratch.x,
    jointEndScratch.y,
    2.15,
    1.5,
    skinShade,
  );
  disc(ctx, jointScratchA.x, jointScratchA.y, 1.05, skinShade);
  drawShoe(
    ctx,
    jointEndScratch.x,
    jointEndScratch.y,
    jointEndScratch.x + 1.65,
    jointEndScratch.y + 0.05,
    shoe,
  );

  solveRowerElbow2D(
    shX - 0.4,
    shY - 0.4,
    rowOarFar.handleX,
    rowOarFar.handleY,
    upperArmLength,
    forearmLength,
    jointScratchA,
  );
  drawShoulderCap(ctx, shX - 0.4, shY - 0.4, farKit, 1.16);
  taperedLimb(ctx, shX - 0.4, shY - 0.4, jointScratchA.x, jointScratchA.y, 2.2, 1.65, farKit);
  taperedLimb(
    ctx,
    jointScratchA.x,
    jointScratchA.y,
    jointEndScratch.x,
    jointEndScratch.y,
    1.75,
    1.25,
    skinShade,
  );
  disc(ctx, jointScratchA.x, jointScratchA.y, 0.9, skinShade);
  disc(ctx, jointEndScratch.x, jointEndScratch.y, 0.96, skinShade);

  // Constant femur/tibia lengths remove the old telescoping knee.
  solveTwoBoneJoint2D(seatX, seatY, footX, footY, 7.85, 7.65, -1, jointScratchA);
  taperedLimb(ctx, seatX, seatY, jointScratchA.x, jointScratchA.y, 3, 2.2, accent);
  taperedLimb(
    ctx,
    jointScratchA.x,
    jointScratchA.y,
    jointEndScratch.x,
    jointEndScratch.y,
    2.25,
    1.55,
    skin,
  );
  disc(ctx, jointScratchA.x, jointScratchA.y, 1.12, skin);
  drawShoe(
    ctx,
    jointEndScratch.x,
    jointEndScratch.y,
    jointEndScratch.x + 1.75,
    jointEndScratch.y + 0.05,
    shoe,
  );
  disc(ctx, seatX, seatY, 1.65, withAlpha(rim, 0.8));

  shapedTorso(ctx, seatX, seatY - 0.35, shX, shY, 1.95, 2.75, accent, withAlpha(foam, 0.72));
  limb(ctx, seatX + 0.25, seatY - 1.1, shX + 0.35, shY + 0.2, 0.78, withAlpha(foam, 0.78));
  profileHead(ctx, shX, shY, skin, hair);

  // The visible oar is also rigid; the near hand terminates at its handle.
  limb(
    ctx,
    rowOarNear.handleX,
    rowOarNear.handleY,
    rowOarNear.bladeRootX,
    rowOarNear.bladeRootY,
    1.25,
    rim,
  );
  taperedLimb(
    ctx,
    rowOarNear.bladeRootX,
    rowOarNear.bladeRootY,
    rowOarNear.bladeTipX,
    rowOarNear.bladeTipY,
    2.75 - k.bladeFeather * 1.3,
    3.45 - k.bladeFeather * 1.65,
    accent,
  );
  limb(
    ctx,
    rowOarNear.bladeRootX,
    rowOarNear.bladeRootY,
    rowOarNear.bladeTipX,
    rowOarNear.bladeTipY,
    0.48,
    withAlpha(foam, 0.62),
  );
  disc(ctx, oarlockX, oarlockY + 0.4, 0.96, rim);
  disc(ctx, oarlockX, oarlockY + 0.4, 0.4, foam);
  solveRowerElbow2D(
    shX,
    shY + 0.2,
    rowOarNear.handleX,
    rowOarNear.handleY,
    upperArmLength,
    forearmLength,
    jointScratchA,
  );
  drawShoulderCap(ctx, shX, shY + 0.2, accent, 1.38);
  taperedLimb(ctx, shX, shY + 0.2, jointScratchA.x, jointScratchA.y, 2.35, 1.75, accent);
  taperedLimb(
    ctx,
    jointScratchA.x,
    jointScratchA.y,
    jointEndScratch.x,
    jointEndScratch.y,
    1.8,
    1.3,
    skin,
  );
  disc(ctx, jointScratchA.x, jointScratchA.y, 0.95, skin);
  disc(ctx, jointEndScratch.x, jointEndScratch.y, 1.05, skin);
  if (!reduce && k.bladeDepth > 0.06) {
    // Catch foam plus a lighter mid-drive mist keep the buried blade readable.
    const depth = k.bladeDepth;
    disc(ctx, rowOarNear.bladeTipX, bobY + 2.8, 1.15 + depth * 0.85, foam);
    disc(ctx, rowOarNear.bladeTipX + 2.6, bobY + 1.5, 0.85 + depth * 0.55, foam);
    disc(ctx, rowOarNear.bladeTipX - 1.6, bobY + 1.9, 0.7 + depth * 0.4, foam);
    disc(ctx, rowOarNear.bladeTipX + 0.8, bobY + 3.4, 0.55 + depth * 0.35, withAlpha(foam, 0.55));
    disc(ctx, rowOarFar.bladeTipX, bobY + 1.8, 0.7 + depth * 0.4, withAlpha(foam, 0.4));
  }
}

/** Skier double-poling: arms/poles swing from a high reach to a low back-pull. */
function drawSkier(ctx: CanvasRenderingContext2D, a: AvatarDrawCtx, k: SkierKinematics) {
  const { x, y, bobY, polePlantCourseX, accent, rim, foam, skin, skinShade, hair, shoe, reduce } =
    a;
  const hipX = x + k.hipHinge * 2.4;
  const hipY = bobY - 7.4 + k.kneeFlex * 2.4;
  const shX = x + 0.6 + k.hipHinge * 6;
  const shY = bobY - 14 + k.hipHinge * 2.8;
  const farKit = withAlpha(accent, 0.5);
  // A double-pole cycle uses a narrow parallel stance. In this side-profile
  // projection the lateral lane cannot be drawn literally, so encode it as a
  // small, constant depth offset shared by hip, knee, boot and ski. The old
  // -3.3/+4.3 boot stagger put one foot far ahead of the other and made the
  // two leg chains form an X even though double-poling has no striding step.
  const skiStanceHalfWidth = 1.05;
  const farHipX = hipX - skiStanceHalfWidth;
  const nearHipX = hipX + skiStanceHalfWidth;
  const farFootX = x - skiStanceHalfWidth;
  const nearFootX = x + skiStanceHalfWidth;

  const poleLength = 13.8;
  // Keep the wrist on a radius-preserving sagittal arc around the shoulder.
  // The old linear high→low interpolation crossed close to the shoulder,
  // making the two-bone solver swap elbow branches. Published double-pole
  // timing calls for early flexion followed by near-extension at pole-off.
  const handReach = 6.6 - k.elbowLoad * 1.65 + k.armExtension * 3.3;
  const handAngle = -0.56 + k.poleSweep * 2.56;
  const preferredNearHandX = shX + Math.cos(handAngle) * handReach;
  const preferredNearHandY = shY + Math.sin(handAngle) * handReach;
  const farHandReach = handReach * 0.97;
  const preferredFarHandX = shX - 0.45 + Math.cos(handAngle + 0.025) * farHandReach;
  const preferredFarHandY = shY - 0.4 + Math.sin(handAngle + 0.025) * farHandReach;

  // A recovering pole always trails the hand and stays above the snow. It
  // rotates from the measured shallow pole-off attitude (~23°) back toward a
  // steep plant (~80°); clearance, rather than a downward sweep scalar, caps
  // the free basket so it cannot drop through the course.
  const freePoleAngle = 1.745 + k.poleSweep * 0.995;
  const nearClearance = 0.55 + k.poleLift * 2.8;
  const nearRawDy = Math.sin(freePoleAngle) * poleLength;
  const nearDy = Math.max(
    -poleLength * 0.985,
    Math.min(nearRawDy, y - nearClearance - preferredNearHandY),
  );
  const nearDx = -Math.sqrt(Math.max(0, poleLength * poleLength - nearDy * nearDy));
  const nearFreeTipX = preferredNearHandX + nearDx;
  const nearFreeTipY = preferredNearHandY + nearDy;
  const farAngle = freePoleAngle + 0.025;
  const farRawDy = Math.sin(farAngle) * poleLength;
  const farDy = Math.max(
    -poleLength * 0.985,
    Math.min(farRawDy, y - 0.75 - k.poleLift * 2.55 - preferredFarHandY),
  );
  const farDx = -Math.sqrt(Math.max(0, poleLength * poleLength - farDy * farDy));
  const farFreeTipX = preferredFarHandX + farDx;
  const farFreeTipY = preferredFarHandY + farDy;
  // Place the basket at the catch point, just behind the forward high grip.
  // The old +4.4/+5 offsets put it ahead of the boots for the entire press;
  // the closed-chain solve then had no choice but to leave the pole upright.
  const farPlantX = polePlantCourseX + 0.2;
  const farPlantY = y - 0.15;
  const nearPlantX = polePlantCourseX + 0.8;
  const nearPlantY = y;
  const farFlightTipX = farPlantX + (farFreeTipX - farPlantX) * k.poleFlight;
  const farFlightTipY = farPlantY + (farFreeTipY - farPlantY) * k.poleFlight;
  const nearFlightTipX = nearPlantX + (nearFreeTipX - nearPlantX) * k.poleFlight;
  const nearFlightTipY = nearPlantY + (nearFreeTipY - nearPlantY) * k.poleFlight;
  const farPoleTipX = farFlightTipX + (farPlantX - farFlightTipX) * k.poleContact;
  const farPoleTipY = farFlightTipY + (farPlantY - farFlightTipY) * k.poleContact;
  const nearPoleTipX = nearFlightTipX + (nearPlantX - nearFlightTipX) * k.poleContact;
  const nearPoleTipY = nearFlightTipY + (nearPlantY - nearFlightTipY) * k.poleContact;
  const armMinimumReach = Math.abs(5.2 - 5) + 0.02;
  const armMaximumReach = 5.2 + 5 - 0.02;
  constrainRigidContact2D(
    shX - 0.45,
    shY - 0.4,
    preferredFarHandX,
    preferredFarHandY,
    farPoleTipX,
    farPoleTipY,
    poleLength,
    armMinimumReach,
    armMaximumReach,
    jointScratchA,
  );
  const farHandX = jointScratchA.x;
  const farHandY = jointScratchA.y;
  constrainRigidContact2D(
    shX,
    shY,
    preferredNearHandX,
    preferredNearHandY,
    nearPoleTipX,
    nearPoleTipY,
    poleLength,
    armMinimumReach,
    armMaximumReach,
    jointScratchA,
  );
  const nearHandX = jointScratchA.x;
  const nearHandY = jointScratchA.y;

  // Far pole, arm, and leg establish depth. Both poles stay the same length
  // throughout reach, plant, press, and recovery.
  limb(ctx, farHandX, farHandY, farPoleTipX, farPoleTipY, 1.05, withAlpha(rim, 0.55));
  drawSkiPoleHardware(
    ctx,
    farHandX,
    farHandY,
    farPoleTipX,
    farPoleTipY,
    withAlpha(rim, 0.55),
    withAlpha(shoe, 0.62),
  );
  solveSkierElbow2D(shX - 0.45, shY - 0.4, farHandX, farHandY, 5.2, 5, jointScratchA);
  drawShoulderCap(ctx, shX - 0.45, shY - 0.4, farKit, 1.18);
  taperedLimb(ctx, shX - 0.45, shY - 0.4, jointScratchA.x, jointScratchA.y, 2.15, 1.6, farKit);
  taperedLimb(
    ctx,
    jointScratchA.x,
    jointScratchA.y,
    jointEndScratch.x,
    jointEndScratch.y,
    1.65,
    1.2,
    skinShade,
  );
  disc(ctx, jointScratchA.x, jointScratchA.y, 0.88, skinShade);
  disc(ctx, jointEndScratch.x, jointEndScratch.y, 0.96, skinShade);

  // Skis paint behind both legs and boots. They are intentionally short and
  // neutral so equipment support reads without dominating the athlete.
  drawSki(ctx, farFootX, y - 0.15, withAlpha(shoe, 0.56), withAlpha(accent, 0.62));
  drawSki(ctx, nearFootX, y, shoe, accent);

  solveTwoBoneJoint2D(farHipX, hipY - 0.3, farFootX, y - 0.15, 5.25, 5.05, -1, jointScratchA);
  taperedLimb(ctx, farHipX, hipY - 0.3, jointScratchA.x, jointScratchA.y, 2.8, 2.05, farKit);
  taperedLimb(
    ctx,
    jointScratchA.x,
    jointScratchA.y,
    jointEndScratch.x,
    jointEndScratch.y,
    2.1,
    1.5,
    skinShade,
  );
  disc(ctx, jointScratchA.x, jointScratchA.y, 1, skinShade);
  drawShoe(
    ctx,
    jointEndScratch.x,
    jointEndScratch.y - 0.3,
    jointEndScratch.x + 2.1,
    jointEndScratch.y - 0.2,
    shoe,
  );

  // Both boots remain planted while the knees and hip absorb the press.
  solveTwoBoneJoint2D(nearHipX, hipY, nearFootX, y, 5.25, 5.05, -1, jointScratchA);
  taperedLimb(ctx, nearHipX, hipY, jointScratchA.x, jointScratchA.y, 3, 2.2, accent);
  taperedLimb(
    ctx,
    jointScratchA.x,
    jointScratchA.y,
    jointEndScratch.x,
    jointEndScratch.y,
    2.25,
    1.55,
    skin,
  );
  disc(ctx, jointScratchA.x, jointScratchA.y, 1.08, skin);
  drawShoe(
    ctx,
    jointEndScratch.x,
    jointEndScratch.y - 0.25,
    jointEndScratch.x + 2.2,
    jointEndScratch.y - 0.2,
    shoe,
  );
  disc(ctx, hipX, hipY, 1.5, withAlpha(rim, 0.7));
  shapedTorso(ctx, hipX, hipY - 0.3, shX, shY, 2.05, 2.85, accent, withAlpha(foam, 0.72));
  limb(ctx, hipX + 0.1, hipY - 1, shX + 0.25, shY + 0.15, 0.8, withAlpha(foam, 0.78));
  profileHead(ctx, shX, shY, skin, hair);

  // Reach → plant → press → recovery. Contact intensity controls the snow
  // burst, while the rigid visual pole keeps a stable length throughout.
  limb(ctx, nearHandX, nearHandY, nearPoleTipX, nearPoleTipY, 1.3, rim);
  drawSkiPoleHardware(ctx, nearHandX, nearHandY, nearPoleTipX, nearPoleTipY, rim, shoe);
  solveSkierElbow2D(shX, shY + 0.2, nearHandX, nearHandY, 5.2, 5, jointScratchA);
  drawShoulderCap(ctx, shX, shY + 0.2, accent, 1.4);
  taperedLimb(ctx, shX, shY + 0.2, jointScratchA.x, jointScratchA.y, 2.35, 1.75, accent);
  taperedLimb(
    ctx,
    jointScratchA.x,
    jointScratchA.y,
    jointEndScratch.x,
    jointEndScratch.y,
    1.85,
    1.3,
    skin,
  );
  disc(ctx, jointScratchA.x, jointScratchA.y, 0.95, skin);
  disc(ctx, jointEndScratch.x, jointEndScratch.y, 1.02, skin);
  if (!reduce && k.poleContact > 0.08) {
    const plant = k.poleContact;
    disc(ctx, nearPoleTipX, y, 1 + plant * 0.7, foam);
    disc(ctx, nearPoleTipX + 2.4, y - 1.2, 0.8 + plant * 0.45, foam);
    disc(ctx, nearPoleTipX - 1.8, y - 0.8, 0.65 + plant * 0.35, foam);
    disc(ctx, farPoleTipX, y - 0.4, 0.7 + plant * 0.35, withAlpha(foam, 0.45));
    disc(ctx, nearPoleTipX + 0.6, y - 2.1, 0.45 + plant * 0.25, withAlpha(foam, 0.4));
  }
}

/** Cyclist whose wheels spin and legs pedal with the phase. */
function drawCyclist(ctx: CanvasRenderingContext2D, a: AvatarDrawCtx, k: BikeKinematics) {
  const { x, y, accent, rim, foam, skin, skinShade, hair, shoe, meters, reduce } = a;
  const wr = 5.4;
  const rearX = x - 8.5;
  const frontX = x + 8.5;
  const wheelY = y - wr;
  // Wheel rotation is tied to road distance, not cadence. A gearing change can
  // alter crank speed without making the tyres slide along the course.
  const wheelSpin = reduce ? 0.3 : meters / 0.34;

  // Symmetric spokes alone can alias into reverse motion. Each wheel therefore
  // carries a unique valve/chevron phase while preserving true distance roll.
  drawBikeWheel(ctx, rearX, wheelY, wr, wheelSpin, 0.28, accent, rim, shoe);
  drawBikeWheel(ctx, frontX, wheelY, wr, wheelSpin, 1.12, accent, rim, shoe);

  // Frame and wheels stay grounded; only the rider gets restrained secondary
  // movement from the kinematics solver.
  const bbX = x;
  const bbY = wheelY + 1;
  const seatX = x - 3.2;
  const seatY = wheelY - 7.4;
  const barX = frontX - 1.2;
  const barY = wheelY - 6.4;
  // Rider anchors are known before the frame is painted so the far limbs can
  // sit behind the bicycle and the near limbs can overlap it cleanly.
  const hipLift = reduce ? 0 : k.hipRock * 28;
  const torsoShift = reduce ? 0 : k.torsoSway * 26;
  const hipX = seatX + torsoShift * 0.25;
  const hipY = seatY + hipLift;
  const rShX = x + 1.2 + torsoShift;
  const rShY = wheelY - 12.5 + hipLift * 0.4;
  const farKit = withAlpha(accent, 0.5);
  const farDrive = withAlpha(shoe, 0.48);

  // Both crank endpoints come from one signed clockwise angle. Computing the
  // opposite pedal by adding PI (rather than independent animation channels)
  // guarantees a rigid 180-degree crankset at every cadence.
  solveBikeRotationPoint2D(bbX, bbY, 3.1, k.crankAngle, jointScratchA);
  const nearCrankX = jointScratchA.x;
  const nearCrankY = jointScratchA.y;
  solveBikeRotationPoint2D(bbX, bbY, 3.1, k.crankAngle + Math.PI, jointScratchA);
  const farCrankX = jointScratchA.x;
  const farCrankY = jointScratchA.y;

  // The recessed crank/pedal sits behind the far shoe and far leg.
  limb(ctx, bbX, bbY, farCrankX, farCrankY, 1.15, farDrive);
  drawBikePedal(ctx, farCrankX, farCrankY, farDrive, 0.72);

  // Far leg and exact pedal contact, followed by the bicycle drivetrain/frame.
  solveTwoBoneJoint2D(
    hipX - 0.45,
    hipY - 0.25,
    farCrankX,
    farCrankY,
    7.35,
    7.05,
    -1,
    jointScratchA,
  );
  taperedLimb(ctx, hipX - 0.45, hipY - 0.25, jointScratchA.x, jointScratchA.y, 3, 2.1, farKit);
  taperedLimb(
    ctx,
    jointScratchA.x,
    jointScratchA.y,
    jointEndScratch.x,
    jointEndScratch.y,
    2.15,
    1.45,
    skinShade,
  );
  disc(ctx, jointScratchA.x, jointScratchA.y, 1.02, skinShade);
  const farShoeX = jointEndScratch.x + Math.cos(k.anklePitchRight) * 1.8;
  const farShoeY = jointEndScratch.y + Math.sin(k.anklePitchRight) * 1.8;
  drawShoe(ctx, jointEndScratch.x, jointEndScratch.y, farShoeX, farShoeY, withAlpha(shoe, 0.65));

  // Chain and sprockets sit behind the frame triangle. Two strands make the
  // transmission direction legible without pretending cadence drives wheels.
  limb(ctx, rearX + 0.65, wheelY - 0.65, bbX - 1.15, bbY - 1.85, 0.62, farDrive);
  limb(ctx, rearX + 0.65, wheelY + 0.65, bbX - 1.15, bbY + 1.85, 0.62, farDrive);
  ctx.strokeStyle = farDrive;
  ctx.lineWidth = 0.72;
  ctx.beginPath();
  ctx.arc(rearX, wheelY, 1.32, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(bbX, bbY, 2.38, 0, Math.PI * 2);
  ctx.stroke();

  // Frame tubes receive a dark under-stroke so joints remain crisp over wheel
  // spokes and the rider rather than collapsing into one flat accent colour.
  limb(ctx, rearX, wheelY, bbX, bbY, 2.5, withAlpha(shoe, 0.34));
  limb(ctx, bbX, bbY, seatX, seatY, 2.5, withAlpha(shoe, 0.34));
  limb(ctx, seatX, seatY, barX, barY, 2.5, withAlpha(shoe, 0.34));
  limb(ctx, bbX, bbY, barX, barY, 2.5, withAlpha(shoe, 0.34));
  limb(ctx, frontX, wheelY, barX, barY, 2.5, withAlpha(shoe, 0.34));
  limb(ctx, rearX, wheelY, bbX, bbY, 1.7, accent);
  limb(ctx, bbX, bbY, seatX, seatY, 1.7, accent);
  limb(ctx, seatX, seatY, barX, barY, 1.7, accent);
  limb(ctx, bbX, bbY, barX, barY, 1.7, accent);
  limb(ctx, frontX, wheelY, barX, barY, 1.7, accent);
  limb(ctx, seatX - 2.2, seatY + 0.2, seatX + 1.2, seatY + 0.2, 1.35, rim);
  ctx.fillStyle = withAlpha(shoe, 0.42);
  roundRect(ctx, seatX - 2.35, seatY - 0.25, 3.7, 0.72, 0.34);
  ctx.fill();
  disc(ctx, seatX, seatY, 0.72, withAlpha(rim, 0.72));
  disc(ctx, barX, barY, 0.62, withAlpha(rim, 0.72));
  // Separate far/near grips make both hand contacts readable on the compact
  // side-profile handlebar instead of ending on an invisible frame point.
  limb(ctx, barX - 1.2, barY - 0.35, barX + 0.72, barY - 0.35, 1.02, farDrive);
  limb(ctx, barX - 0.8, barY, barX + 1.08, barY, 1.18, rim);
  ctx.strokeStyle = withAlpha(rim, 0.82);
  ctx.lineWidth = 0.58;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(barX + 0.95, barY);
  ctx.quadraticCurveTo(barX + 1.9, barY + 0.8, barX + 1.18, barY + 2.05);
  ctx.stroke();

  // The drive-side chainring and near crank sit above the frame but below the
  // near leg. A final cleat cap is painted after the shoe to lock the contact.
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.05;
  ctx.beginPath();
  ctx.arc(bbX, bbY, 2.38, 0, Math.PI * 2);
  ctx.stroke();
  disc(ctx, bbX, bbY, 0.68, shoe);
  limb(ctx, bbX, bbY, nearCrankX, nearCrankY, 1.45, rim);
  drawBikePedal(ctx, nearCrankX, nearCrankY, rim, 1.02);

  // Far arm precedes every near-side limb so it cannot paint across the near
  // leg. The near anatomy then finishes the silhouette over the bicycle.
  solveTwoBoneJoint2D(
    rShX - 0.4,
    rShY - 0.35,
    barX - 0.45,
    barY - 0.35,
    4.92,
    4.62,
    1,
    jointScratchB,
  );
  drawShoulderCap(ctx, rShX - 0.4, rShY - 0.35, farKit, 1.16);
  taperedLimb(ctx, rShX - 0.4, rShY - 0.35, jointScratchB.x, jointScratchB.y, 2.1, 1.55, farKit);
  taperedLimb(
    ctx,
    jointScratchB.x,
    jointScratchB.y,
    jointEndScratch.x,
    jointEndScratch.y,
    1.6,
    1.15,
    skinShade,
  );
  disc(ctx, jointScratchB.x, jointScratchB.y, 0.88, skinShade);
  disc(ctx, jointEndScratch.x, jointEndScratch.y, 0.94, skinShade);

  // Near leg uses the same fixed femur/tibia lengths at every crank angle.
  solveTwoBoneJoint2D(hipX, hipY, nearCrankX, nearCrankY, 7.35, 7.05, -1, jointScratchA);
  taperedLimb(ctx, hipX, hipY, jointScratchA.x, jointScratchA.y, 3.2, 2.25, accent);
  taperedLimb(
    ctx,
    jointScratchA.x,
    jointScratchA.y,
    jointEndScratch.x,
    jointEndScratch.y,
    2.3,
    1.55,
    skin,
  );
  disc(ctx, jointScratchA.x, jointScratchA.y, 1.12, skin);
  const nearShoeX = jointEndScratch.x + Math.cos(k.anklePitchLeft) * 1.9;
  const nearShoeY = jointEndScratch.y + Math.sin(k.anklePitchLeft) * 1.9;
  drawShoe(ctx, jointEndScratch.x, jointEndScratch.y, nearShoeX, nearShoeY, shoe);
  // Bright cleat/spindle cap: the shoe visibly terminates on the exact pedal
  // anchor instead of appearing to orbit a hidden crank.
  drawBikePedal(ctx, nearCrankX, nearCrankY, shoe, 0.62);
  disc(ctx, nearCrankX, nearCrankY, 0.48, rim);

  // Shorts/pelvis bridge the rider to the saddle instead of floating above it.
  disc(ctx, hipX, hipY, 2, withAlpha(rim, 0.82));
  shapedTorso(ctx, hipX, hipY - 0.35, rShX, rShY, 2.05, 2.8, accent, withAlpha(foam, 0.72));
  limb(ctx, hipX + 0.2, hipY - 1, rShX + 0.3, rShY + 0.15, 0.7, withAlpha(foam, 0.7));

  solveTwoBoneJoint2D(rShX, rShY + 0.2, barX, barY, 4.92, 4.62, 1, jointScratchB);
  drawShoulderCap(ctx, rShX, rShY + 0.2, accent, 1.4);
  taperedLimb(ctx, rShX, rShY + 0.2, jointScratchB.x, jointScratchB.y, 2.3, 1.7, accent);
  taperedLimb(
    ctx,
    jointScratchB.x,
    jointScratchB.y,
    jointEndScratch.x,
    jointEndScratch.y,
    1.75,
    1.25,
    skin,
  );
  disc(ctx, jointScratchB.x, jointScratchB.y, 0.95, skin);
  disc(ctx, jointEndScratch.x, jointEndScratch.y, 1.02, skin);
  profileHead(ctx, rShX, rShY, skin, hair, accent);
}

/** Glossy neutral pod — fallback when `sport` is absent. */
function drawNeutralPod(
  ctx: CanvasRenderingContext2D,
  x: number,
  bobY: number,
  accent: string,
  rim: string,
  foam: string,
) {
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(x, bobY, POD_R, 0, Math.PI * 2);
  ctx.fill();
  const gloss = ctx.createRadialGradient(x - POD_R * 0.3, bobY - POD_R * 0.4, 0, x, bobY, POD_R);
  gloss.addColorStop(0, withAlpha(foam, 0.5));
  gloss.addColorStop(0.5, withAlpha(foam, 0.1));
  gloss.addColorStop(1, withAlpha(foam, 0));
  ctx.fillStyle = gloss;
  ctx.beginPath();
  ctx.arc(x, bobY, POD_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, bobY, POD_R, 0, Math.PI * 2);
  ctx.stroke();
  disc(ctx, x, bobY, 2.5, withAlpha(foam, 0.85));
}

// ── Lane types ───────────────────────────────────────────────────────────────

interface LaneOpts {
  startX: number;
  span: number;
  y: number;
  frac: number;
  accent: string;
  /** Cumulative course distance; drives material parallax in both directions. */
  meters: number;
  phase: number;
  pace: number;
  isYou: boolean;
  nameTab: string;
  padL: number;
  sport?: Sport;
}

interface AvatarOpts {
  x: number;
  y: number;
  accent: string;
  /** Distance-driven stroke phase (radians; one cycle per stroke). */
  phase: number;
  /** Cumulative course distance in metres. */
  meters: number;
  /** Screen-space course scale used to reconstruct planted SkiErg baskets. */
  pixelsPerMeter?: number;
  pose?: StrokePose;
  spm: number;
  isYou: boolean;
  sport?: Sport;
  label: string;
  /** Splash droplets for this lane (drawn in foam, frozen while paused). */
  splash: ParticlePool;
}

/**
 * Draws the race-board course strip — a layered, broadcast-style race scene:
 * depth background, water lanes, illuminated wake with speed streaks, glossy
 * sport-aware avatar pods, buoy-capped markers, and a checkered finish gate.
 */
export class CourseRenderer implements ReplayRenderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;
  private h = 0;
  /** Decorative water phase (ripples, wake undulation) — wall-clock driven. */
  private wavePhase = 0;
  private ghostWavePhase = 0;
  /** Ghost stroke phase — only needed when ghostStrokePose is absent (ghost without stroke data). */
  private ghostStrokePhase = 0;
  private lastLivePose: StrokePose | null = null;
  private lastGhostPose: StrokePose | null = null;

  private lastNow = NaN;
  private liveSplash = new ParticlePool(SPLASH_CAP);
  private ghostSplash = new ParticlePool(SPLASH_CAP);
  private colors: CanvasColors = COLORS_LIGHT;
  private darkTheme = false;
  // Refreshed each render() from the OS setting; flattens the avatar wake.
  private reduceMotion = false;
  /** Reused solver outputs keep the per-frame course draw allocation-free. */
  private rowKinematics: RowerKinematics = {
    legExtension: 0,
    bodySwing: 0,
    armDraw: 0,
    bladeDepth: 0,
    bladeFeather: 0,
    surge: 0,
    vertical: 0,
  };
  private skiKinematics: SkierKinematics = {
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
  private bikeKinematics: BikeKinematics = {
    crankAngle: 0,
    torsoSway: 0,
    hipRock: 0,
    anklePitchLeft: 0,
    anklePitchRight: 0,
  };

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
  }

  resize(cssWidth: number, cssHeight: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = cssWidth;
    this.h = cssHeight;
    const c = this.ctx.canvas;
    c.width = Math.round(cssWidth * this.dpr);
    c.height = Math.round(cssHeight * this.dpr);
    c.style.width = `${cssWidth}px`;
    c.style.height = `${cssHeight}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  render(state: RenderState, playing: boolean, themeName: "light" | "dark" = "light") {
    const { ctx, w, h } = this;
    const C = themeName === "dark" ? COLORS_DARK : COLORS_LIGHT;
    this.colors = C;
    this.darkTheme = themeName === "dark";
    if (w === 0) return;
    this.reduceMotion = prefersReducedMotion();

    // Reset transform at the start of every frame so a mid-frame exception
    // in any sub-method's save/restore pair can't corrupt the next frame.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;

    // Wall-clock dt (clamped) keeps decorative motion at the same speed on
    // 30/60/120 Hz displays — phases advance by time, not by frame count.
    const now = performance.now();
    const rawDt = playing && Number.isFinite(this.lastNow) ? now - this.lastNow : 0;
    const dt = playing ? clampDt(rawDt) : 0;
    this.lastNow = playing ? now : NaN;
    const animate = playing && !this.reduceMotion;
    if (animate) {
      this.wavePhase += (9 + state.frame.spm / 10) * dt;
      if (state.ghost) this.ghostWavePhase += (9 + state.ghost.spm / 10) * dt;
    }

    // Fallback phase only advances when the page has not supplied ghost stroke
    // poses.  (Live strokePose is always present — it is a required RenderState
    // field — so no fallback is needed for the live avatar.)
    if (!state.ghostStrokePose && animate && state.ghost && state.ghost.spm > 0)
      this.ghostStrokePhase += (state.ghost.spm / 60) * dt * Math.PI * 2;
    const livePose = state.strokePose;
    const ghostPose =
      state.ghost &&
      (state.ghostStrokePose ??
        fallbackStrokePose(state.sport ?? "rower", this.ghostStrokePhase, state.ghost.spm));

    if (this.reduceMotion) {
      this.liveSplash.clear();
      this.ghostSplash.clear();
    } else if (dt > 0) {
      this.liveSplash.update(dt, 0, SPLASH_GRAVITY, 0);
      this.ghostSplash.update(dt, 0, SPLASH_GRAVITY, 0);
    }

    ctx.clearRect(0, 0, w, h);

    // ── Coordinate model ──────────────────────────────────────────────────
    const startX = PAD_L;
    const finishX = w - PAD_R;
    const span = finishX - startX;

    const hasGhost = !!state.ghost;
    const playerY = hasGhost ? h * 0.78 : h * 0.7;
    const ghostY = h * 0.55;

    // ── Scene layers ──────────────────────────────────────────────────────
    this.drawBackground(w, h, state.sport ?? "rower", state.frame.d);
    this.drawGrid(
      startX,
      span,
      h,
      state.totalDistance,
      hasGhost ? [ghostY, playerY] : [playerY],
      state.sport,
    );
    this.drawFinishGate(finishX, h * 0.34, h - 20, state.sport ?? "rower");

    // Ghost first so YOU overlaps on top
    if (hasGhost && state.ghost) {
      const ghostFrac = clamp01(state.ghost.distFrac);
      const ghostAvX = startX + span * ghostFrac;
      if (animate && catchTransitions(this.lastGhostPose, ghostPose) > 0) {
        this.spawnSplash(this.ghostSplash, ghostAvX, ghostY, state.sport, ghostPose?.intensity);
      }
      this.drawLane({
        startX,
        span,
        y: ghostY,
        frac: ghostFrac,
        accent: C.ghost,
        meters: ghostFrac * state.totalDistance,
        phase: this.ghostWavePhase,
        pace: state.ghost.pace,
        isYou: false,
        nameTab: "GHOST",
        padL: PAD_L,
        sport: state.sport,
      });
      this.drawAvatar({
        x: ghostAvX,
        y: ghostY,
        accent: C.ghost,
        phase: ghostPose?.phase ?? this.ghostStrokePhase,
        meters: ghostFrac * state.totalDistance,
        pixelsPerMeter: state.totalDistance > 0 ? span / state.totalDistance : 0,
        pose: ghostPose,
        spm: state.ghost.spm,
        isYou: false,
        sport: state.sport,
        label: `${state.ghost.label || "PB"} · ${Math.round(ghostFrac * 100)}%`,
        splash: this.ghostSplash,
      });
      this.lastGhostPose = ghostPose ?? null;
    } else {
      this.lastGhostPose = null;
      this.ghostSplash.clear();
    }

    const playerFrac = clamp01(state.distFrac);
    const playerAvX = startX + span * playerFrac;
    if (animate && catchTransitions(this.lastLivePose, livePose) > 0) {
      this.spawnSplash(this.liveSplash, playerAvX, playerY, state.sport, livePose.intensity);
    }
    this.drawLane({
      startX,
      span,
      y: playerY,
      frac: playerFrac,
      accent: C.live,
      meters: state.frame.d,
      phase: this.wavePhase,
      pace: state.frame.pace,
      isYou: true,
      nameTab: "YOU",
      padL: PAD_L,
      sport: state.sport,
    });
    this.drawAvatar({
      x: playerAvX,
      y: playerY,
      accent: C.live,
      phase: livePose.phase,
      meters: state.frame.d,
      pixelsPerMeter: state.totalDistance > 0 ? span / state.totalDistance : 0,
      pose: livePose,
      spm: state.frame.spm,
      isYou: true,
      sport: state.sport,
      label: `${fmtPace(state.frame.pace)} · ${Math.round(playerFrac * 100)}%`,
      splash: this.liveSplash,
    });
    this.lastLivePose = livePose;
  }

  /**
   * Burst of droplets at the catch — water off the blade for the rower, snow
   * kicked from the pole baskets for the skier. The bike rolls smoothly and
   * spawns nothing.
   */
  private spawnSplash(pool: ParticlePool, avX: number, y: number, sport?: Sport, intensity = 0.5) {
    const effort = 0.95 + clamp01(intensity) * 0.95;
    const count =
      sport === "rower"
        ? 8 + Math.round(clamp01(intensity) * 6)
        : sport === "skierg"
          ? 7 + Math.round(clamp01(intensity) * 5)
          : 0;
    if (count === 0) return;
    // Catch-time contact points after the avatar's scale and solver-driven
    // surge: the row blade is aft/left of the hull, while the SkiErg basket
    // plants forward/right of the boots. The first droplet stays on that
    // solved offset so tests and visual QA can pin the contact side.
    const ox = sport === "rower" ? -22 : 11;
    for (let i = 0; i < count; i++) {
      const scatter = i === 0 ? 0 : (Math.random() - 0.5) * 8;
      pool.spawn(
        avX + ox + scatter,
        y + 1 + (i === 0 ? 1 : Math.random() * 3),
        0,
        (Math.random() * 68 - 18) * effort,
        -(48 + Math.random() * 72) * effort,
        0,
        0.42 + Math.random() * 0.36,
        (1.2 + Math.random() * 1.5) * effort,
      );
    }
  }

  destroy() {
    // 2D canvas has no GPU resources to release.
  }

  // ── Background ────────────────────────────────────────────────────────────

  private drawBackground(w: number, h: number, sport: Sport, meters: number) {
    const { ctx } = this;
    const palette = (this.darkTheme ? VENUES_DARK : VENUES_LIGHT)[sport];
    ctx.save();
    roundRect(ctx, 0, 0, w, h, 5);
    ctx.clip();

    this.drawSky(w, h, palette);
    if (sport === "skierg") this.drawSkiVenue(w, h, meters, palette);
    else if (sport === "bike") this.drawBikeVenue(w, h, meters, palette);
    else this.drawRowVenue(w, h, meters, palette);

    // Atmospheric fog veil — a soft blend that pulls the horizon away from
    // the course without washing out the venue silhouettes. The 3D renderer
    // does this with actual `scene.fog`; the canvas renderer needs one
    // explicit pass so the depth ordering between ridge/near/water/snow/
    // asphalt stays consistent across all three sports.
    const fog = ctx.createLinearGradient(0, h * 0.31, 0, h * 0.48);
    fog.addColorStop(0, withAlpha(palette.haze, 0));
    fog.addColorStop(0.55, withAlpha(palette.haze, this.darkTheme ? 0.23 : 0.28));
    fog.addColorStop(1, withAlpha(palette.haze, 0));
    ctx.fillStyle = fog;
    ctx.fillRect(0, h * 0.31, w, h * 0.17);

    // A restrained frame vignette supplies depth without obscuring the race.
    const vignette = ctx.createLinearGradient(0, 0, w, 0);
    vignette.addColorStop(0, withAlpha(palette.surfaceShadow, 0.22));
    vignette.addColorStop(0.08, withAlpha(palette.surfaceShadow, 0));
    vignette.addColorStop(0.92, withAlpha(palette.surfaceShadow, 0));
    vignette.addColorStop(1, withAlpha(palette.surfaceShadow, 0.18));
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  private drawSky(w: number, h: number, palette: VenuePalette) {
    const { ctx } = this;
    // Richer atmospheric dome: five stops instead of three keep the zenith,
    // mid-sky, horizon, and haze layers visually distinct without muddying
    // into a single wash across the top 60% of the canvas.
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.62);
    sky.addColorStop(0, palette.skyTop);
    sky.addColorStop(0.28, withAlpha(palette.skyTop, 0.85));
    sky.addColorStop(0.55, withAlpha(palette.skyHorizon, 0.92));
    sky.addColorStop(0.78, palette.skyHorizon);
    sky.addColorStop(1, palette.haze);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Low-opacity high-altitude vapour wisps — barely visible, but their
    // absence makes a sky dome read as a flat gradient on a large monitor.
    const highCloudAlpha = this.darkTheme ? 0.06 : 0.12;
    ctx.fillStyle = withAlpha(palette.surfaceHighlight, highCloudAlpha);
    ctx.beginPath();
    ctx.ellipse(w * 0.08, h * 0.06, w * 0.2, h * 0.015, -0.02, 0, Math.PI * 2);
    ctx.ellipse(w * 0.4, h * 0.08, w * 0.16, h * 0.013, 0.04, 0, Math.PI * 2);
    ctx.ellipse(w * 0.7, h * 0.04, w * 0.22, h * 0.014, -0.015, 0, Math.PI * 2);
    ctx.fill();

    // Mid-altitude cumulus banks — wider, softer, and two-toned so they read
    // as volume rather than flat ellipses. A darker base + lighter top per
    // bank creates a quick aerial illusion without extra draw calls.
    const cloudAlpha = this.darkTheme ? 0.09 : 0.2;
    const cloudBase = withAlpha(this.darkTheme ? palette.haze : palette.skyHorizon, cloudAlpha);
    const cloudTop = withAlpha(palette.surfaceHighlight, cloudAlpha * 0.7);
    for (const [cx, cy, rx, ry] of [
      [w * 0.15, h * 0.14, w * 0.18, h * 0.028],
      [w * 0.36, h * 0.16, w * 0.13, h * 0.022],
      [w * 0.62, h * 0.11, w * 0.17, h * 0.025],
      [w * 0.88, h * 0.13, w * 0.11, h * 0.019],
      [w * 0.24, h * 0.18, w * 0.095, h * 0.016],
      [w * 0.5, h * 0.2, w * 0.14, h * 0.017],
    ] as const) {
      ctx.fillStyle = cloudBase;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, -0.03, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = cloudTop;
      ctx.beginPath();
      ctx.ellipse(cx, cy - ry * 0.35, rx * 0.78, ry * 0.65, -0.03, 0, Math.PI * 2);
      ctx.fill();
    }

    // Single long horizon haze strip — the low sky naturally brightens/warms
    // near the course without adding a second gradient to every venue.
    const horizonHaze = ctx.createLinearGradient(0, h * 0.38, 0, h * 0.5);
    horizonHaze.addColorStop(0, withAlpha(palette.haze, 0));
    horizonHaze.addColorStop(0.55, withAlpha(palette.haze, this.darkTheme ? 0.22 : 0.38));
    horizonHaze.addColorStop(1, withAlpha(palette.haze, 0));
    ctx.fillStyle = horizonHaze;
    ctx.fillRect(0, h * 0.38, w, h * 0.12);

    // Multi-ring sun glow: the core disc is small and bright, while three
    // concentric radial halos spread the warmth across the sky without a
    // bottlenecked single gradient that turns into a hard-edge circle on wide
    // canvases. The outermost ring is subtle atmospheric scatter.
    const sunX = w * 0.77;
    const sunY = h * 0.17;
    const haloRadius = h * 0.24;
    for (const [radius, opacity] of [
      [haloRadius * 0.35, 0.42],
      [haloRadius * 0.62, 0.19],
      [haloRadius, 0.08],
      [haloRadius * 1.38, 0.028],
    ]) {
      const halo = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, radius);
      halo.addColorStop(0, withAlpha(palette.sun, opacity));
      halo.addColorStop(0.48, withAlpha(palette.sun, opacity * 0.35));
      halo.addColorStop(1, withAlpha(palette.sun, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(sunX - radius, sunY - radius, radius * 2, radius * 2);
    }
    disc(ctx, sunX, sunY, Math.max(2.5, h * 0.016), withAlpha(palette.sun, 0.92));

    // Subtle light motes — six to eight tiny scattered dots that suggest
    // atmospheric dust without turning into a particle system. Cost is
    // negligible (one fill per dot) while removing the sterile "graphic" feel.
    const moteAlpha = this.darkTheme ? 0.14 : 0.22;
    ctx.fillStyle = withAlpha(palette.sun, moteAlpha);
    for (const [mx, my, mr] of [
      [sunX - h * 0.12, sunY - h * 0.04, 0.6],
      [sunX + h * 0.08, sunY - h * 0.06, 0.45],
      [sunX - h * 0.05, sunY + h * 0.07, 0.5],
      [sunX + h * 0.1, sunY + h * 0.02, 0.38],
      [sunX - h * 0.15, sunY + h * 0.01, 0.52],
      [sunX + h * 0.14, sunY - h * 0.02, 0.42],
    ]) {
      if (mx > 0 && my > 0) disc(ctx, mx, my, mr, ctx.fillStyle as string);
    }
  }

  /** A bounded, scrub-safe parallax offset. Reduced motion keeps scenery still. */
  private materialOffset(meters: number, factor: number, period: number) {
    if (this.reduceMotion || !Number.isFinite(meters)) return 0;
    const distance = (((meters * factor) % period) + period) % period;
    return -distance;
  }

  /**
   * Canvas applies lineDashOffset opposite to direct x translation. Keep this
   * adapter explicit so repeating road/snow marks travel backwards beneath a
   * forward-moving athlete instead of contradicting the BikeErg wheel sign.
   */
  private dashMaterialOffset(meters: number, factor: number, period: number) {
    return -this.materialOffset(meters, factor, period);
  }

  private drawRowVenue(w: number, h: number, meters: number, palette: VenuePalette) {
    const { ctx } = this;
    const horizon = h * 0.405;
    const farShift = this.materialOffset(meters, 0.018, 18);

    // Soft wooded shoreline, built as two depth-separated silhouettes.
    ctx.fillStyle = palette.ridgeFar;
    ctx.beginPath();
    ctx.moveTo(0, horizon + 5);
    ctx.lineTo(0, horizon - 13);
    ctx.quadraticCurveTo(w * 0.1, horizon - 33, w * 0.2, horizon - 19);
    ctx.quadraticCurveTo(w * 0.34, horizon - 43, w * 0.49, horizon - 20);
    ctx.quadraticCurveTo(w * 0.63, horizon - 38, w * 0.78, horizon - 16);
    ctx.quadraticCurveTo(w * 0.9, horizon - 28, w, horizon - 12);
    ctx.lineTo(w, horizon + 5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = palette.ridgeNear;
    ctx.beginPath();
    ctx.moveTo(0, horizon + 8);
    ctx.lineTo(0, horizon - 4);
    for (let x = -24 + farShift; x <= w + 28; x += 22) {
      const crown = horizon - 10 - ((Math.floor((x - farShift) / 22) & 1) === 0 ? 6 : 1);
      ctx.quadraticCurveTo(x + 6, crown - 7, x + 13, crown);
      ctx.quadraticCurveTo(x + 18, crown + 5, x + 24, horizon - 2);
    }
    ctx.lineTo(w, horizon + 8);
    ctx.closePath();
    ctx.fill();

    // Regatta pavilion, dock and timing tower establish a credible venue.
    // Unique architecture stays fixed. Only genuinely repeating shoreline and
    // material bands use modulo parallax, so a long workout cannot teleport a
    // landmark when its wrap period rolls over.
    const pavilionX = Math.max(24, w * 0.105);
    const pavilionY = horizon - 25;
    ctx.fillStyle = palette.structureShade;
    ctx.beginPath();
    ctx.moveTo(pavilionX - 7, pavilionY + 5);
    ctx.lineTo(pavilionX + 91, pavilionY + 5);
    ctx.lineTo(pavilionX + 80, pavilionY - 5);
    ctx.lineTo(pavilionX + 6, pavilionY - 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = palette.structure;
    roundRect(ctx, pavilionX, pavilionY + 5, 84, 20, 1.8);
    ctx.fill();
    ctx.fillStyle = withAlpha(palette.structureLight, 0.78);
    for (let i = 0; i < 6; i++) {
      roundRect(ctx, pavilionX + 6 + i * 13, pavilionY + 9, 8, 8, 1);
      ctx.fill();
    }
    ctx.fillStyle = palette.structureShade;
    ctx.fillRect(pavilionX - 12, horizon + 1, 118, 3);
    ctx.fillRect(pavilionX + 9, pavilionY + 18, 3, 10);
    ctx.fillRect(pavilionX + 72, pavilionY + 18, 3, 10);

    const towerX = w * 0.87;
    ctx.fillStyle = palette.structureShade;
    ctx.fillRect(towerX, horizon - 43, 3, 44);
    ctx.fillRect(towerX + 20, horizon - 43, 3, 44);
    ctx.fillStyle = palette.structure;
    ctx.fillRect(towerX - 3, horizon - 45, 29, 14);
    ctx.fillStyle = withAlpha(palette.structureLight, 0.8);
    ctx.fillRect(towerX + 2, horizon - 42, 19, 6);

    // Deep regatta basin with a cooler, richer bottom depth. The old 3-stop
    // gradient turned the entire lower canvas into one uniform teal slab;
    // 5 stops give a visible thermocline and keep the surface distinct from
    // the deep water beneath both athlete lanes.
    const water = ctx.createLinearGradient(0, horizon, 0, h);
    water.addColorStop(0, palette.groundTop);
    water.addColorStop(0.18, withAlpha(palette.groundTop, 0.78));
    water.addColorStop(0.4, palette.groundMid);
    water.addColorStop(0.7, withAlpha(palette.groundBottom, 0.85));
    water.addColorStop(1, palette.groundBottom);
    ctx.fillStyle = water;
    ctx.fillRect(0, horizon, w, h - horizon);
    // Bright surface meniscus — stronger than before so the waterline reads
    // instantly across the full course width, even on small screens.
    ctx.fillStyle = withAlpha(palette.surfaceHighlight, 0.44);
    ctx.fillRect(0, horizon, w, 1.5);
    ctx.fillStyle = withAlpha(palette.surfaceHighlight, 0.16);
    ctx.fillRect(0, horizon + 1.5, w, 2.5);

    // Multi-column sun reflection with staggered taper — a real solar-path
    // glare has a visible centre column flanked by softer side bands. The
    // delta column widens near the horizon and tapers toward the bottom, so
    // it reads as a true reflected highlight rather than a single triangle.
    for (const [centerFrac, widthFactor, alpha] of [
      [0.77, 1, 0.3],
      [0.79, 0.58, 0.12],
      [0.745, 0.42, 0.08],
      [0.81, 0.36, 0.06],
      [0.755, 0.25, 0.04],
    ]) {
      const rc = w * centerFrac;
      const reflection = ctx.createLinearGradient(0, horizon, 0, h);
      reflection.addColorStop(0, withAlpha(palette.sun, alpha));
      reflection.addColorStop(0.4, withAlpha(palette.sun, alpha * 0.32));
      reflection.addColorStop(1, withAlpha(palette.sun, 0));
      ctx.fillStyle = reflection;
      ctx.beginPath();
      const topW = Math.max(1.5, h * 0.012 * widthFactor);
      const bottomW = Math.max(0.5, h * 0.024 * widthFactor);
      ctx.moveTo(rc - topW, horizon);
      ctx.lineTo(rc + topW, horizon);
      ctx.lineTo(rc + bottomW, h);
      ctx.lineTo(rc - bottomW, h);
      ctx.closePath();
      ctx.fill();
    }

    // Thin horizontal shimmer lines locked to metres so the water surface
    // visibly responds to both playback transport and passive scrub.
    for (let row = 0; row < 8; row++) {
      const yy = horizon + 14 + row * Math.max(11, h * 0.048);
      const rowAlpha = 0.2 - row * 0.018;
      ctx.strokeStyle = withAlpha(palette.surfaceHighlight, rowAlpha);
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      const offset = this.materialOffset(meters, 0.14 + row * 0.021, 34);
      for (let x = -34 + offset; x <= w + 34; x += 34) {
        ctx.moveTo(x, yy);
        ctx.quadraticCurveTo(x + 8, yy - (row % 3) * 0.7 - 0.6, x + 17, yy);
      }
      ctx.stroke();
    }

    // Broken pavilion/tower reflections — the regatta is deep enough to carry
    // three reflection panels, not a single unbroken smear from one landmark.
    ctx.strokeStyle = withAlpha(palette.structureLight, 0.2);
    ctx.lineWidth = 0.95;
    for (let panel = 0; panel < 3; panel++) {
      const yy = horizon + 7 + panel * 6.5;
      const spread = 6 + panel * 2.5;
      ctx.beginPath();
      ctx.moveTo(pavilionX + 35 - spread, yy);
      ctx.lineTo(pavilionX + 35 + spread, yy);
      ctx.moveTo(towerX + 11 - spread * 0.34, yy + 2);
      ctx.lineTo(towerX + 11 + spread * 0.34, yy + 2);
      ctx.stroke();
    }
  }

  private drawSkiVenue(w: number, h: number, meters: number, palette: VenuePalette) {
    const { ctx } = this;
    const horizon = h * 0.445;
    const treeShift = this.materialOffset(meters, 0.055, 38);

    // Two soft alpine ranges create atmospheric scale. The far ridge uses a
    // lighter, haze-closer colour to push mountains back before the pine belt.
    ctx.fillStyle = palette.ridgeFar;
    ctx.beginPath();
    ctx.moveTo(0, horizon + 10);
    ctx.lineTo(0, horizon - 22);
    ctx.quadraticCurveTo(w * 0.06, horizon - 56, w * 0.12, horizon - 70);
    ctx.quadraticCurveTo(w * 0.17, horizon - 58, w * 0.22, horizon - 31);
    ctx.quadraticCurveTo(w * 0.3, horizon - 74, w * 0.38, horizon - 90);
    ctx.quadraticCurveTo(w * 0.44, horizon - 68, w * 0.5, horizon - 36);
    ctx.quadraticCurveTo(w * 0.59, horizon - 70, w * 0.68, horizon - 78);
    ctx.quadraticCurveTo(w * 0.75, horizon - 60, w * 0.82, horizon - 32);
    ctx.quadraticCurveTo(w * 0.93, horizon - 54, w, horizon - 64);
    ctx.lineTo(w, horizon + 10);
    ctx.closePath();
    ctx.fill();

    // Pale atmospheric haze veil beneath the far ridge — mountain silhouettes
    // read as distant because they are tinted by air mass between the viewer
    // and the peak, not because they are simply a darker grey polygon.
    ctx.fillStyle = withAlpha(palette.haze, this.darkTheme ? 0.14 : 0.2);
    ctx.beginPath();
    ctx.moveTo(0, horizon - 10);
    ctx.lineTo(0, horizon - 22);
    ctx.quadraticCurveTo(w * 0.06, horizon - 56, w * 0.12, horizon - 70);
    ctx.quadraticCurveTo(w * 0.17, horizon - 58, w * 0.22, horizon - 31);
    ctx.quadraticCurveTo(w * 0.3, horizon - 74, w * 0.38, horizon - 90);
    ctx.quadraticCurveTo(w * 0.44, horizon - 68, w * 0.5, horizon - 36);
    ctx.quadraticCurveTo(w * 0.59, horizon - 70, w * 0.68, horizon - 78);
    ctx.quadraticCurveTo(w * 0.75, horizon - 60, w * 0.82, horizon - 32);
    ctx.quadraticCurveTo(w * 0.93, horizon - 54, w, horizon - 64);
    ctx.lineTo(w, horizon + 10);
    ctx.lineTo(0, horizon + 10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = palette.ridgeNear;
    ctx.beginPath();
    ctx.moveTo(0, horizon + 8);
    ctx.lineTo(0, horizon - 10);
    ctx.quadraticCurveTo(w * 0.09, horizon - 38, w * 0.17, horizon - 52);
    ctx.quadraticCurveTo(w * 0.24, horizon - 33, w * 0.31, horizon - 16);
    ctx.quadraticCurveTo(w * 0.39, horizon - 50, w * 0.49, horizon - 58);
    ctx.quadraticCurveTo(w * 0.57, horizon - 34, w * 0.63, horizon - 14);
    ctx.quadraticCurveTo(w * 0.72, horizon - 36, w * 0.8, horizon - 46);
    ctx.quadraticCurveTo(w * 0.91, horizon - 28, w, horizon - 8);
    ctx.lineTo(w, horizon + 8);
    ctx.closePath();
    ctx.fill();

    // Selective snow caps — wider and softer so they read as snow mantles
    // rather than a thin white pen stroke.
    ctx.strokeStyle = withAlpha(palette.surfaceHighlight, 0.56);
    ctx.lineWidth = 1.35;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(w * 0.05, horizon - 54);
    ctx.quadraticCurveTo(w * 0.09, horizon - 65, w * 0.125, horizon - 68);
    ctx.quadraticCurveTo(w * 0.155, horizon - 61, w * 0.18, horizon - 47);
    ctx.moveTo(w * 0.31, horizon - 72);
    ctx.quadraticCurveTo(w * 0.35, horizon - 86, w * 0.385, horizon - 88);
    ctx.quadraticCurveTo(w * 0.42, horizon - 73, w * 0.45, horizon - 56);
    ctx.moveTo(w * 0.61, horizon - 66);
    ctx.quadraticCurveTo(w * 0.65, horizon - 76, w * 0.685, horizon - 76);
    ctx.quadraticCurveTo(w * 0.72, horizon - 64, w * 0.75, horizon - 51);
    ctx.stroke();

    // Frost wrap — a very cold, low-opacity wash that sits between the sky
    // and the snow. This is the visual signal that the venue is sub-zero,
    // not a warm pasture with white-green grass.
    const frost = ctx.createLinearGradient(0, horizon - 12, 0, horizon + 4);
    frost.addColorStop(0, withAlpha(palette.surfaceHighlight, 0));
    frost.addColorStop(0.45, withAlpha(palette.surfaceHighlight, 0.15));
    frost.addColorStop(1, withAlpha(palette.surfaceHighlight, 0));
    ctx.fillStyle = frost;
    ctx.fillRect(0, horizon - 12, w, 16);

    const snow = ctx.createLinearGradient(0, horizon, 0, h);
    snow.addColorStop(0, palette.groundTop);
    snow.addColorStop(0.28, withAlpha(palette.groundTop, 0.72));
    snow.addColorStop(0.55, palette.groundMid);
    snow.addColorStop(1, palette.groundBottom);
    ctx.fillStyle = snow;
    ctx.fillRect(0, horizon, w, h - horizon);

    // Snowbank highlights — the cold field is sculpted downhill rather than
    // a single flat gradient. Two sweeping highlights follow the direction
    // of the course, so the athlete always has a directional background.
    ctx.fillStyle = withAlpha(palette.surfaceHighlight, 0.13);
    ctx.beginPath();
    ctx.moveTo(w * 0.15, horizon);
    ctx.quadraticCurveTo(w * 0.28, horizon + h * 0.14, w * 0.37, h);
    ctx.lineTo(w * 0.22, h);
    ctx.quadraticCurveTo(w * 0.16, horizon + h * 0.1, w * 0.05, horizon);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = withAlpha(palette.surfaceHighlight, 0.09);
    ctx.beginPath();
    ctx.moveTo(w * 0.58, horizon);
    ctx.quadraticCurveTo(w * 0.72, horizon + h * 0.12, w * 0.82, h);
    ctx.lineTo(w * 0.68, h);
    ctx.quadraticCurveTo(w * 0.61, horizon + h * 0.08, w * 0.47, horizon);
    ctx.closePath();
    ctx.fill();

    // Pine belt. Repeating scenery moves only with travelled distance.
    for (let x = -42 + treeShift; x < w + 42; x += 38) {
      const index = Math.floor((x - treeShift + 42) / 38);
      const treeH = 20 + (Math.abs(index) % 3) * 5;
      const trunkY = horizon + 3;
      ctx.fillStyle = withAlpha(palette.structureShade, 0.68);
      ctx.fillRect(x - 1, trunkY - treeH * 0.28, 2, treeH * 0.34);
      drawEvergreen(
        ctx,
        x,
        trunkY + 1,
        treeH,
        index % 2 === 0 ? palette.foliageNear : palette.foliageFar,
        palette.surfaceHighlight,
      );
    }

    // Nordic stadium timing cabin and paired floodlights.
    const cabinX = w * 0.12;
    ctx.fillStyle = palette.structureShade;
    ctx.beginPath();
    ctx.moveTo(cabinX - 7, horizon - 20);
    ctx.lineTo(cabinX + 79, horizon - 20);
    ctx.lineTo(cabinX + 68, horizon - 29);
    ctx.lineTo(cabinX + 4, horizon - 29);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = palette.structure;
    ctx.fillRect(cabinX, horizon - 20, 70, 22);
    ctx.fillStyle = withAlpha(palette.structureLight, 0.82);
    for (let i = 0; i < 5; i++) ctx.fillRect(cabinX + 5 + i * 13, horizon - 16, 8, 8);
    this.drawFloodlight(w * 0.07, horizon + 2, h * 0.19, palette, -1);
    this.drawFloodlight(w * 0.9, horizon + 2, h * 0.21, palette, 1);

    // Sculpted snowbanks frame the groomed competition field.
    ctx.fillStyle = withAlpha(palette.surfaceHighlight, 0.55);
    ctx.beginPath();
    ctx.moveTo(0, horizon + 15);
    ctx.quadraticCurveTo(w * 0.2, horizon + 4, w * 0.42, horizon + 17);
    ctx.quadraticCurveTo(w * 0.66, horizon + 28, w, horizon + 11);
    ctx.lineTo(w, horizon + 24);
    ctx.quadraticCurveTo(w * 0.72, horizon + 37, w * 0.44, horizon + 27);
    ctx.quadraticCurveTo(w * 0.2, horizon + 15, 0, horizon + 29);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = withAlpha(palette.surfaceShadow, 0.15);
    ctx.lineWidth = 0.85;
    for (let y = horizon + 38; y < h; y += 18) {
      const shift = this.materialOffset(meters, 0.24, 24);
      ctx.beginPath();
      for (let x = -24 + shift; x < w + 24; x += 24) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + 11, y);
      }
      ctx.stroke();
    }
  }

  private drawBikeVenue(w: number, h: number, meters: number, palette: VenuePalette) {
    const { ctx } = this;
    const horizon = h * 0.43;
    const barrierShift = this.materialOffset(meters, 0.11, 46);

    // Low city/hills silhouette anchors the velodrome in a real place.
    ctx.fillStyle = palette.ridgeFar;
    ctx.beginPath();
    ctx.moveTo(0, horizon + 8);
    ctx.lineTo(0, horizon - 8);
    ctx.quadraticCurveTo(w * 0.18, horizon - 39, w * 0.36, horizon - 12);
    ctx.quadraticCurveTo(w * 0.58, horizon - 45, w * 0.76, horizon - 10);
    ctx.quadraticCurveTo(w * 0.9, horizon - 26, w, horizon - 7);
    ctx.lineTo(w, horizon + 8);
    ctx.closePath();
    ctx.fill();

    // Premium track pavilion with a floating roof and lit hospitality boxes.
    const standX = Math.max(16, w * 0.12);
    const standW = Math.min(w * 0.46, 390);
    const standTop = horizon - 38;
    ctx.fillStyle = palette.structureShade;
    ctx.beginPath();
    ctx.moveTo(standX - 15, standTop + 4);
    ctx.lineTo(standX + standW + 13, standTop + 4);
    ctx.quadraticCurveTo(standX + standW + 3, standTop - 4, standX + standW - 4, standTop - 5);
    ctx.quadraticCurveTo(standX + standW * 0.5, standTop - 8, standX + 2, standTop - 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = palette.structure;
    ctx.beginPath();
    ctx.moveTo(standX, standTop + 5);
    ctx.lineTo(standX + standW, standTop + 5);
    ctx.lineTo(standX + standW - 16, horizon + 3);
    ctx.lineTo(standX + 12, horizon + 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = withAlpha(palette.structureLight, 0.78);
    for (let x = standX + 10; x < standX + standW - 16; x += 22) {
      ctx.fillRect(x, standTop + 10, 14, 7);
    }
    ctx.strokeStyle = withAlpha(palette.structureShade, 0.5);
    ctx.lineWidth = 1;
    for (let row = 0; row < 3; row++) {
      const y = standTop + 23 + row * 6;
      ctx.beginPath();
      ctx.moveTo(standX + 10 + row * 3, y);
      ctx.quadraticCurveTo(standX + standW * 0.5, y + 1.6, standX + standW - 12 - row * 3, y);
      ctx.stroke();
    }
    ctx.strokeStyle = withAlpha(palette.safetyLight, 0.26);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(standX + 12, standTop + 8);
    ctx.quadraticCurveTo(standX + standW * 0.5, standTop + 4.5, standX + standW - 14, standTop + 8);
    ctx.stroke();

    this.drawFloodlight(w * 0.06, horizon + 4, h * 0.22, palette, -1);
    this.drawFloodlight(w * 0.93, horizon + 4, h * 0.24, palette, 1);

    // Dusk atmosphere — a warm, narrow band right at the horizon that gives
    // the velodrome its golden-hour character. Without this, the violet sky
    // and grey asphalt feel disconnected.
    const duskGlow = ctx.createLinearGradient(0, horizon - 6, 0, horizon + 22);
    duskGlow.addColorStop(0, withAlpha(palette.sun, 0));
    duskGlow.addColorStop(0.35, withAlpha(palette.sun, this.darkTheme ? 0.16 : 0.22));
    duskGlow.addColorStop(1, withAlpha(palette.sun, 0));
    ctx.fillStyle = duskGlow;
    ctx.fillRect(0, horizon - 6, w, 28);

    const asphalt = ctx.createLinearGradient(0, horizon, 0, h);
    asphalt.addColorStop(0, palette.groundTop);
    asphalt.addColorStop(0.22, withAlpha(palette.groundTop, 0.65));
    asphalt.addColorStop(0.5, palette.groundMid);
    asphalt.addColorStop(0.78, withAlpha(palette.groundBottom, 0.82));
    asphalt.addColorStop(1, palette.groundBottom);
    ctx.fillStyle = asphalt;
    ctx.fillRect(0, horizon, w, h - horizon);

    // Faint track lights bloom — dusk venues glow from the floodlight beams.
    // Two wide, soft pools of light spilling onto the course from the poles.
    for (const [bx, bw, ba] of [
      [w * 0.06, w * 0.13, 0.08],
      [w * 0.93, w * 0.13, 0.09],
    ]) {
      const bloom = ctx.createRadialGradient(bx, horizon + 6, 0, bx, horizon + 6, bw);
      bloom.addColorStop(0, withAlpha(palette.structureLight, ba));
      bloom.addColorStop(0.5, withAlpha(palette.structureLight, ba * 0.3));
      bloom.addColorStop(1, withAlpha(palette.structureLight, 0));
      ctx.fillStyle = bloom;
      ctx.fillRect(bx - bw, horizon + 2, bw * 2, 36);
    }

    // Trackside safety barrier: disciplined repeating panels with two-tone
    // rendering so the red-marked face reads separately from the backing.
    ctx.fillStyle = palette.structureShade;
    ctx.fillRect(0, horizon + 11, w, 5);
    for (let x = -46 + barrierShift; x < w + 46; x += 46) {
      ctx.fillStyle = palette.safety;
      ctx.fillRect(x, horizon + 3, 42, 10);
      ctx.fillStyle = palette.marker;
      ctx.beginPath();
      ctx.moveTo(x, horizon + 3);
      ctx.lineTo(x + 11, horizon + 3);
      ctx.lineTo(x + 20, horizon + 13);
      ctx.lineTo(x + 9, horizon + 13);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = withAlpha(palette.surfaceShadow, 0.5);
      ctx.lineWidth = 0.75;
      ctx.strokeRect(x, horizon + 3, 42, 10);
    }

    // Fine aggregate lines — sparse and deterministic; distance scrubbing
    // moves them backwards as the athlete advances, preserving forward read.
    ctx.strokeStyle = withAlpha(palette.surfaceHighlight, 0.08);
    ctx.lineWidth = 0.85;
    for (let y = horizon + 38; y < h; y += 23) {
      const shift = this.materialOffset(meters, 0.31 + y * 0.0007, 31);
      ctx.beginPath();
      for (let x = -31 + shift; x < w + 31; x += 31) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + 7, y);
      }
      ctx.stroke();
    }
  }

  private drawFloodlight(
    x: number,
    baseY: number,
    height: number,
    palette: VenuePalette,
    lean: -1 | 1,
  ) {
    const { ctx } = this;
    const headX = x + lean * 3;
    const headY = baseY - height;
    ctx.strokeStyle = palette.structureShade;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(headX, headY);
    ctx.stroke();
    ctx.fillStyle = palette.structureShade;
    roundRect(ctx, headX - 10, headY - 4, 20, 7, 1.5);
    ctx.fill();
    ctx.fillStyle = withAlpha(palette.structureLight, 0.94);
    for (let lamp = 0; lamp < 4; lamp++) ctx.fillRect(headX - 7.5 + lamp * 4.5, headY - 2, 3, 3);
  }

  // ── Course scale + sport markers ──────────────────────────────────────────

  private drawGrid(
    startX: number,
    span: number,
    h: number,
    totalDistance: number,
    waterlines: number[],
    sport?: Sport,
  ) {
    const { ctx } = this;
    const C = this.colors;
    const resolvedSport = sport ?? "rower";
    const palette = (this.darkTheme ? VENUES_DARK : VENUES_LIGHT)[resolvedSport];
    ctx.save();
    ctx.font = '10px "Source Code Pro", ui-monospace, monospace';
    ctx.textAlign = "center";

    // A slim broadcast timing rail with a subtle top-cap line and darker
    // fade toward the bottom edge. The old version stopped at one horizontal
    // line, which read as an unfinished UI chrome rather than an on-screen
    // timing deck mirroring a real broadcast bug bar.
    const railTop = h - 27;
    const rail = ctx.createLinearGradient(0, railTop - 4, 0, h);
    rail.addColorStop(0, withAlpha(palette.surfaceShadow, 0));
    rail.addColorStop(0.15, withAlpha(palette.surfaceShadow, this.darkTheme ? 0.32 : 0.18));
    rail.addColorStop(0.4, withAlpha(palette.surfaceShadow, this.darkTheme ? 0.42 : 0.22));
    rail.addColorStop(1, withAlpha(palette.surfaceShadow, this.darkTheme ? 0.58 : 0.32));
    ctx.fillStyle = rail;
    ctx.fillRect(0, railTop - 4, this.w, h - railTop + 4);

    // Thin illuminated top cap — separates the timing deck from the course
    // in the same way a broadcast chyron has a visible upper rule.
    ctx.strokeStyle = withAlpha(palette.surfaceHighlight, 0.42);
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.moveTo(startX, railTop);
    ctx.lineTo(startX + span, railTop);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(palette.surfaceLine, 0.52);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(startX, railTop + 1.8);
    ctx.lineTo(startX + span, railTop + 1.8);
    ctx.stroke();

    for (let i = 0; i <= 10; i++) {
      const x = startX + (span * i) / 10;
      const isMajor = i % 5 === 0;
      const tickTop = railTop - (isMajor ? 6 : 3);
      // Heavy dark line first so the highlight floats on top — critical in dark
      // theme where the highlight alone would vanish against the rail fill.
      ctx.strokeStyle = withAlpha(palette.surfaceShadow, this.darkTheme ? 0.48 : 0.22);
      ctx.lineWidth = isMajor ? 1.4 : 0.9;
      ctx.beginPath();
      ctx.moveTo(x - (isMajor ? 0.35 : 0), tickTop);
      ctx.lineTo(x + (isMajor ? 0.35 : 0), railTop + 3);
      ctx.stroke();
      ctx.strokeStyle = isMajor
        ? withAlpha(palette.surfaceHighlight, 0.72)
        : withAlpha(palette.surfaceLine, 0.48);
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(x, tickTop);
      ctx.lineTo(x, railTop + 3);
      ctx.stroke();

      // Real venue markers sit on the physical lane and do not inherit either
      // racer colour. Ghost mode therefore never recolours the course.
      for (const ly of waterlines) {
        if (resolvedSport === "bike") {
          ctx.fillStyle = isMajor ? palette.safetyLight : palette.surfaceLine;
          const markerW = isMajor ? 7 : 4;
          ctx.fillRect(x - markerW / 2, ly + 15, markerW, isMajor ? 2 : 1);
        } else if (resolvedSport === "skierg") {
          ctx.fillStyle = isMajor ? palette.marker : palette.safety;
          const markerR = isMajor ? 3.5 : 2.5;
          ctx.beginPath();
          ctx.moveTo(x, ly + 9 - markerR);
          ctx.lineTo(x + markerR, ly + 9);
          ctx.lineTo(x, ly + 9 + markerR);
          ctx.lineTo(x - markerR, ly + 9);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillStyle = isMajor ? palette.marker : palette.safetyLight;
          ctx.beginPath();
          ctx.arc(x, ly + 13, isMajor ? 3.4 : 2.1, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = withAlpha(palette.surfaceShadow, 0.46);
          ctx.lineWidth = 0.75;
          ctx.stroke();
        }
      }

      if (isMajor) {
        ctx.fillStyle = C.tickText;
        const m = Math.round((totalDistance * i) / 10);
        // Right-align the final label so it clears the finish gate posts.
        if (i === 10) {
          ctx.textAlign = "right";
          ctx.fillText(`${m}`, x - 5, h - 6);
          ctx.textAlign = "center";
        } else {
          ctx.fillText(`${m}`, x, h - 6);
        }
      }
    }
    ctx.restore();
  }

  // ── Finish gate ───────────────────────────────────────────────────────────

  private drawFinishGate(x: number, y0: number, y1: number, sport: Sport) {
    const { ctx } = this;
    const C = this.colors;
    const palette = (this.darkTheme ? VENUES_DARK : VENUES_LIGHT)[sport];
    ctx.save();

    // Posts (slim, 2px wide)
    ctx.fillStyle = C.finishDark;
    ctx.fillRect(x - 1, y0, 2, y1 - y0);
    ctx.fillRect(x + 4, y0, 2, y1 - y0);

    // Checkered banner column (4px wide, between posts)
    const cell = 5;
    for (let yy = y0, r = 0; yy < y1; yy += cell, r++) {
      ctx.fillStyle = r % 2 === 0 ? C.finishDark : C.finishLight;
      ctx.fillRect(x + 1, yy, 3, Math.min(cell, y1 - yy));
    }

    // Faint accent glow on the left post, layered wide-to-narrow instead of
    // shadowBlur (same read, no per-frame blur pass). The gate is shared
    // across lanes, so it uses the venue's safety colour rather than a racer.
    ctx.lineCap = "butt";
    for (const [width, alpha] of [
      [6, 0.08],
      [3, 0.18],
      [1.5, 0.35],
    ]) {
      ctx.strokeStyle = withAlpha(palette.marker, alpha);
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x - 1, y0);
      ctx.lineTo(x - 1, y1);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ── Lane scene ────────────────────────────────────────────────────────────

  private drawRowSurface(o: LaneOpts) {
    const { ctx } = this;
    const palette = (this.darkTheme ? VENUES_DARK : VENUES_LIGHT).rower;
    const { startX, span, y, meters } = o;
    const bandTop = y - WATER_H * 0.32;
    const bandBottom = y + WATER_H * 0.82;
    const band = ctx.createLinearGradient(0, bandTop, 0, bandBottom);
    band.addColorStop(0, withAlpha(palette.surfaceHighlight, 0.14));
    band.addColorStop(0.18, withAlpha(palette.groundTop, 0.36));
    band.addColorStop(0.6, withAlpha(palette.groundMid, 0.56));
    band.addColorStop(1, withAlpha(palette.surfaceShadow, 0.42));
    ctx.fillStyle = band;
    roundRect(ctx, startX, bandTop, span, bandBottom - bandTop, 5);
    ctx.fill();

    ctx.strokeStyle = withAlpha(palette.surfaceLine, 0.76);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(startX, bandTop + 1);
    ctx.lineTo(startX + span, bandTop + 1);
    ctx.moveTo(startX, bandBottom - 1);
    ctx.lineTo(startX + span, bandBottom - 1);
    ctx.stroke();

    // Metre-driven wavelets reverse correctly when scrubbing. They never use
    // cadence, so the basin cannot appear to flow backwards at low stroke rate.
    for (let row = 0; row < 5; row++) {
      const offsetY = y + 2 + row * 4.8;
      ctx.strokeStyle = withAlpha(palette.surfaceHighlight, 0.3 - row * 0.04);
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      if (this.reduceMotion) {
        ctx.moveTo(startX, offsetY);
        ctx.lineTo(startX + span, offsetY);
      } else {
        const materialPhase = meters * (0.055 + row * 0.009) + row * 1.17;
        const amplitude = 1.35 - row * 0.1;
        for (let x = startX; x <= startX + span; x += 12) {
          const nextX = Math.min(startX + span, x + 12);
          const yy = offsetY + Math.sin(x * 0.12 - materialPhase) * amplitude;
          const nextY = offsetY + Math.sin(nextX * 0.12 - materialPhase) * amplitude;
          if (x === startX) ctx.moveTo(x, yy);
          ctx.quadraticCurveTo(x + (nextX - x) * 0.5, (yy + nextY) * 0.5, nextX, nextY);
        }
      }
      ctx.stroke();
    }

    // Sparse regatta buoy dots along the far rail — venue furniture, not HUD.
    ctx.fillStyle = withAlpha(palette.marker, 0.72);
    for (let i = 0; i < 10; i++) {
      const bx = startX + ((i + 0.4) / 10) * span;
      disc(
        ctx,
        bx,
        bandTop + 3.5,
        1.35,
        withAlpha(i % 3 === 0 ? palette.marker : palette.safetyLight, 0.8),
      );
    }
  }

  private drawSkiSurface(o: LaneOpts) {
    const { ctx } = this;
    const palette = (this.darkTheme ? VENUES_DARK : VENUES_LIGHT).skierg;
    const { startX, span, y, meters } = o;
    const bandTop = y - 11;
    const bandBottom = y + 27;
    const band = ctx.createLinearGradient(0, bandTop, 0, bandBottom);
    band.addColorStop(0, withAlpha(palette.surfaceHighlight, 0.92));
    band.addColorStop(0.48, withAlpha(palette.groundTop, 0.82));
    band.addColorStop(1, withAlpha(palette.surfaceShadow, 0.38));
    ctx.fillStyle = band;
    roundRect(ctx, startX, bandTop, span, bandBottom - bandTop, 5);
    ctx.fill();

    ctx.strokeStyle = withAlpha(palette.surfaceLine, 0.72);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, bandBottom - 1);
    ctx.lineTo(startX + span, bandBottom - 1);
    ctx.stroke();

    // Paired ski tracks (art-direction corduroy) locked to travelled metres.
    // Canvas dash offsets use the inverse of direct scenery x.
    ctx.setLineDash(SKI_GROOVE_DASH);
    ctx.lineDashOffset = this.dashMaterialOffset(meters, 0.34, 13);
    for (const pair of [0, 1]) {
      const base = y + 5 + pair * 9;
      for (const offset of [-1.1, 1.1]) {
        const gy = base + offset;
        ctx.strokeStyle = withAlpha(palette.surfaceShadow, 0.34 - pair * 0.05);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(startX, gy);
        ctx.lineTo(startX + span, gy);
        ctx.stroke();
      }
    }
    ctx.setLineDash(SOLID_LINE);
    ctx.lineDashOffset = 0;
    // Soft purple course ticks match the 3D marker language.
    ctx.fillStyle = withAlpha(palette.marker, 0.55);
    for (let i = 0; i < 8; i++) {
      const tx = startX + ((i + 0.5) / 8) * span;
      ctx.fillRect(tx - 1.2, bandTop + 2, 2.4, 3.2);
      ctx.fillRect(tx - 1.2, bandBottom - 5.2, 2.4, 3.2);
    }
  }

  private drawBikeSurface(o: LaneOpts) {
    const { ctx } = this;
    const palette = (this.darkTheme ? VENUES_DARK : VENUES_LIGHT).bike;
    const { startX, span, y, meters } = o;
    const bandTop = y - 11;
    const bandBottom = y + 28;
    const band = ctx.createLinearGradient(0, bandTop, 0, bandBottom);
    band.addColorStop(0, withAlpha(palette.surfaceHighlight, 0.24));
    band.addColorStop(0.36, withAlpha(palette.groundMid, 0.92));
    band.addColorStop(1, withAlpha(palette.surfaceShadow, 0.72));
    ctx.fillStyle = band;
    roundRect(ctx, startX, bandTop, span, bandBottom - bandTop, 5);
    ctx.fill();

    // Regulation red/ivory curbs belong to the venue, never the athlete. Their
    // scrub-safe offset advances from distance, matching clockwise wheel roll.
    const dashOffset = this.dashMaterialOffset(meters, 0.5, 16);
    for (let edge = 0; edge < 2; edge++) {
      const cy = edge === 0 ? bandTop + 1.5 : bandBottom - 1.5;
      ctx.setLineDash(BIKE_CURB_DASH);
      ctx.lineDashOffset = dashOffset;
      ctx.strokeStyle = palette.marker;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(startX, cy);
      ctx.lineTo(startX + span, cy);
      ctx.stroke();
      ctx.lineDashOffset = dashOffset - 8;
      ctx.strokeStyle = palette.safetyLight;
      ctx.stroke();
    }

    ctx.setLineDash(BIKE_LANE_DASH);
    ctx.lineDashOffset = this.dashMaterialOffset(meters, 0.38, 20);
    ctx.strokeStyle = withAlpha(palette.surfaceHighlight, 0.66);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, y + 8);
    ctx.lineTo(startX + span, y + 8);
    ctx.stroke();
    ctx.setLineDash(SOLID_LINE);
    ctx.lineDashOffset = 0;
  }

  private drawLaneTrail(o: LaneOpts, avX: number) {
    const { ctx } = this;
    const C = this.colors;
    const { startX, y, accent, phase, sport } = o;
    const resolvedSport = sport ?? "rower";
    if (avX <= startX) return;

    ctx.beginPath();
    ctx.moveTo(startX, resolvedSport === "skierg" ? y + 1 : y);
    if (resolvedSport === "rower" && !this.reduceMotion) {
      for (let x = startX; x <= avX; x += 6) {
        ctx.lineTo(x, y + Math.sin((x - avX) * 0.18 + phase) * 1.2);
      }
    } else {
      ctx.lineTo(avX, resolvedSport === "skierg" ? y + 1 : y);
    }

    if (resolvedSport === "rower") {
      ctx.strokeStyle = withAlpha(accent, 0.12);
      ctx.lineWidth = 11;
      ctx.stroke();
      ctx.strokeStyle = withAlpha(accent, 0.3);
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (resolvedSport === "skierg") {
      ctx.strokeStyle = withAlpha(C.foam, 0.58);
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.strokeStyle = withAlpha(accent, 0.58);
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      ctx.strokeStyle = withAlpha(accent, 0.2);
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }

  private drawLane(o: LaneOpts) {
    const { ctx } = this;
    const C = this.colors;
    const { startX, span, y, frac, accent, phase, pace, isYou, nameTab, padL, sport } = o;
    const avX = startX + span * frac;

    // Paint the physical lane at full opacity. Only comparison-specific ink
    // (wake, streaks and label) receives ghost transparency below.
    if (sport === "skierg") this.drawSkiSurface(o);
    else if (sport === "bike") this.drawBikeSurface(o);
    else this.drawRowSurface(o);

    ctx.save();
    if (!isYou) ctx.globalAlpha = 0.76;
    this.drawLaneTrail(o, avX);

    // Pace-linked streaks are shared, but sit on three genuinely different
    // surfaces rather than making every erg look like it races on water.
    const sLen = streakLen(pace);
    for (let si = 0; si < 4; si++) {
      const shimmerOffset = this.reduceMotion ? 0 : Math.sin(phase + si * 0.8) * 3;
      // Clamp the start to the gate so streaks shorten gradually near the
      // line rather than winking out the moment they cross it.
      const sx = Math.max(avX - sLen * STREAK_LENGTH_FACTORS[si] - shimmerOffset, startX);
      const ex = avX - shimmerOffset;
      if (sx < ex) {
        ctx.strokeStyle = withAlpha(accent, STREAK_ALPHAS[si]);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(sx, y + STREAK_Y_OFFSETS[si]);
        ctx.lineTo(ex, y + STREAK_Y_OFFSETS[si]);
        ctx.stroke();
      }
    }

    // Lane name tab (rounded rect in gutter).
    const tabX = 6;
    const tabW = padL - 16;
    const tabH = 18;
    roundRect(ctx, tabX, y - 9, tabW, tabH, 4);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = C.labelBg;
    ctx.font = '700 10px "Source Code Pro", ui-monospace, monospace';
    ctx.textAlign = "center";
    ctx.fillText(nameTab, tabX + tabW / 2, y + 4);

    ctx.restore();
  }

  // ── Avatar pod ────────────────────────────────────────────────────────────

  /**
   * The three sports share a course, not a generic floating-dot shadow. Paint
   * the actual point of support: a hull reflection, two ski impressions, or
   * two tyre patches. This gives the enlarged figures physical weight without
   * blurring the whole canvas or allocating a filter pass every frame.
   */
  private drawAvatarContact(figX: number, y: number, sport: Sport, accent: string) {
    const { ctx } = this;
    const palette = (this.darkTheme ? VENUES_DARK : VENUES_LIGHT)[sport];
    ctx.save();

    if (sport === "rower") {
      const reflection = ctx.createRadialGradient(figX, y + 3.4, 0, figX, y + 3.4, 32);
      reflection.addColorStop(0, withAlpha(this.colors.shadow, 0.3));
      reflection.addColorStop(0.48, withAlpha(this.colors.shadow, 0.12));
      reflection.addColorStop(1, withAlpha(this.colors.shadow, 0));
      ctx.fillStyle = reflection;
      ctx.beginPath();
      ctx.ellipse(figX + 2, y + 3.7, 31, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = withAlpha(palette.surfaceHighlight, 0.24);
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(figX - 23, y + 4.2);
      ctx.quadraticCurveTo(figX - 3, y + 6, figX + 22, y + 4.3);
      ctx.stroke();
    } else if (sport === "skierg") {
      const left = figX - 3.3 * ATHLETE_SCALE;
      const right = figX + 4.3 * ATHLETE_SCALE;
      for (let foot = 0; foot < 2; foot++) {
        const footX = foot === 0 ? left : right;
        ctx.fillStyle = withAlpha(this.colors.shadow, 0.2);
        ctx.beginPath();
        ctx.ellipse(footX, y + 1.15, 8.3, 1.35, -0.025, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = withAlpha(palette.surfaceShadow, 0.26);
        ctx.lineWidth = 0.55;
        ctx.beginPath();
        ctx.moveTo(footX - 5.5, y + 0.72);
        ctx.quadraticCurveTo(footX, y + 1.75, footX + 5.5, y + 0.72);
        ctx.stroke();
      }
    } else {
      const rearX = figX - 8.5 * ATHLETE_SCALE;
      const frontX = figX + 8.5 * ATHLETE_SCALE;
      for (let tyre = 0; tyre < 2; tyre++) {
        const tyreX = tyre === 0 ? rearX : frontX;
        const contact = ctx.createRadialGradient(tyreX, y + 0.8, 0, tyreX, y + 0.8, 8);
        contact.addColorStop(0, withAlpha(this.colors.shadow, 0.34));
        contact.addColorStop(1, withAlpha(this.colors.shadow, 0));
        ctx.fillStyle = contact;
        ctx.beginPath();
        ctx.ellipse(tyreX, y + 0.85, 7.2, 1.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = withAlpha(accent, 0.24);
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(tyreX - 3.6, y + 0.18);
        ctx.lineTo(tyreX + 3.6, y + 0.18);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  private drawAvatar(o: AvatarOpts) {
    const { ctx } = this;
    const C = this.colors;
    const {
      x,
      y,
      accent,
      phase,
      meters,
      pixelsPerMeter = 0,
      pose,
      spm,
      isYou,
      sport,
      label,
      splash,
    } = o;
    const reduce = this.reduceMotion;

    ctx.save();
    if (!isYou) {
      ctx.globalAlpha = 0.82;
    }

    // Solvers own the choreography. Reduced motion swaps in one representative
    // pose, while playback position and the steady HUD remain fully functional.
    const resolvedSport = sport ?? "rower";
    const kinematicPose = reduce
      ? REDUCED_REPLAY_POSES[resolvedSport]
      : (pose ?? fallbackStrokePose(resolvedSport, phase, spm));
    let rowKinematics: RowerKinematics | null = null;
    let skiKinematics: SkierKinematics | null = null;
    let bikeKinematics: BikeKinematics | null = null;
    let surgeChannel = 0;
    let verticalChannel = 0;

    if (resolvedSport === "rower") {
      rowKinematics = solveRowerKinematics(kinematicPose, this.rowKinematics);
      surgeChannel = rowKinematics.surge;
      verticalChannel = rowKinematics.vertical;
    } else if (resolvedSport === "skierg") {
      skiKinematics = solveSkierKinematics(kinematicPose, this.skiKinematics);
      surgeChannel = skiKinematics.surge;
      verticalChannel = -skiKinematics.rebound * 0.7;
    } else {
      bikeKinematics = solveBikeKinematics(kinematicPose, this.bikeKinematics);
    }

    const amplitude = kinematicPose.amplitude;
    const surge = reduce ? 0 : surgeChannel * SURGE_PX[resolvedSport] * amplitude;
    const figX = x + surge;
    const bobY = y + (reduce ? 0 : verticalChannel * BOB_AMP * amplitude);
    // Contrast rim that reads on the accent fill in both themes.
    const rim = C.labelText;

    // Contact art is sport-specific and anchored to the course, not to the
    // animated torso, so a live pull or pedal stroke never makes the athlete
    // look as if it is hovering above the surface.
    if (sport) this.drawAvatarContact(figX, y, sport, accent);

    // Sport-specific animated athlete (or neutral pod fallback).
    ctx.save();
    const a: AvatarDrawCtx = {
      x: figX,
      polePlantCourseX:
        resolvedSport === "skierg"
          ? figX + (skiPolePlantCourseX2D(x, pixelsPerMeter, kinematicPose) - figX) / ATHLETE_SCALE
          : x,
      y,
      bobY,
      meters,
      accent,
      rim,
      foam: C.foam,
      skin: C.skin,
      skinShade: C.skinShade,
      hair: C.hair,
      shoe: C.shoe,
      reduce,
    };
    if (sport) {
      ctx.translate(figX, y);
      ctx.scale(ATHLETE_SCALE, ATHLETE_SCALE);
      ctx.translate(-figX, -y);
    }
    switch (sport) {
      case "rower":
        drawRower(ctx, a, rowKinematics!);
        break;
      case "skierg":
        drawSkier(ctx, a, skiKinematics!);
        break;
      case "bike":
        drawCyclist(ctx, a, bikeKinematics!);
        break;
      default:
        drawNeutralPod(ctx, figX, bobY, accent, rim, C.foam);
        break;
    }
    ctx.restore();

    // Splash droplets (catch spray). Alpha is quantised so the memoised
    // withAlpha cache stays bounded.
    if (!reduce && splash.alive > 0) {
      for (let i = 0; i < splash.alive; i++) {
        const f = splash.fade(i);
        ctx.fillStyle = withAlpha(C.foam, Math.round(f * 8) / 10);
        ctx.beginPath();
        ctx.arc(splash.x[i], splash.y[i], splash.size[i] * (0.6 + 0.4 * f), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // HUD pill — anchored to the waterline (not the bob) so it stays steady.
    ctx.save();
    ctx.font = '600 10px "Source Code Pro", ui-monospace, monospace';
    ctx.textAlign = "center";
    const tw = ctx.measureText(label).width;
    const padX = 6;
    const pillH = 16;
    const pillW = tw + padX * 2;
    // Keep the pill on-canvas at the start/finish; the caret still points at x.
    const pillX = Math.max(4, Math.min(x - pillW / 2, this.w - pillW - 4));
    const caretSize = 4;
    const visualTopClearance = sport ? ATHLETE_TOP_CLEARANCE_2D[sport] : 22;
    const caretY = y - visualTopClearance - 3; // a visible gap above the tallest figure
    const pillY = caretY - caretSize - pillH;

    // Pill background: YOU gets labelBg (light chip), GHOST gets accent.
    roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fillStyle = isYou ? C.labelBg : accent;
    ctx.fill();

    // Caret (tiny downward triangle pointing at the avatar).
    ctx.beginPath();
    ctx.moveTo(x - caretSize, pillY + pillH);
    ctx.lineTo(x + caretSize, pillY + pillH);
    ctx.lineTo(x, caretY);
    ctx.closePath();
    ctx.fill();

    // Pill text (centred on the pill, which may be clamped away from x).
    ctx.fillStyle = isYou ? accent : C.labelBg;
    ctx.fillText(label, pillX + pillW / 2, pillY + pillH - 4);
    ctx.restore();

    ctx.restore(); // globalAlpha restore for non-you
  }
}
