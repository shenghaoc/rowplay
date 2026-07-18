import type { Frame } from "./engine";
import type { Sport } from "../types";
import { fmtPace } from "../format";
import { ParticlePool, clampDt } from "./motion";
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
const BOB_AMP = 3.4;
/** Scale the stick figure so joint travel is legible on the course strip. */
const ATHLETE_SCALE = 1.28;
/** Forward/back hull surge per stroke (px), per sport. Bike pedals smoothly. */
const SURGE_PX: Record<Sport, number> = { rower: 4.2, skierg: 2.2, bike: 0 };
/** Splash droplets per lane; small and brief, so a tiny pool suffices. */
const SPLASH_CAP = 16;
/** Canvas y grows downward, so droplet gravity is positive (px/s²). */
const SPLASH_GRAVITY = 260;
const STREAK_ALPHAS = [0.35, 0.28, 0.22, 0.16] as const;
const STREAK_LENGTH_FACTORS = [1, 0.75, 0.55, 0.4] as const;
const STREAK_Y_OFFSETS = [-3, 0, 3, -5] as const;
const SKI_GROOVE_DASH = [6, 7];
const BIKE_CURB_DASH = [8, 8];
const BIKE_LANE_DASH = [12, 8];
const SOLID_LINE: number[] = [];
/** Stable mid-drive pose used when decorative athlete motion is reduced. */
const REDUCED_POSE_PHASE = Math.PI * 0.5;
/** One shared readable pose for 2D/3D when decorative motion is reduced. */
export const REDUCED_REPLAY_POSES: Readonly<Record<Sport, StrokePose>> = {
  rower: fallbackStrokePose("rower", REDUCED_POSE_PHASE, 30),
  skierg: fallbackStrokePose("skierg", REDUCED_POSE_PHASE, 34),
  bike: fallbackStrokePose("bike", REDUCED_POSE_PHASE, 85),
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

/** Rounded limb / strut segment. */
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
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** Filled disc (head / hub / joint). */
function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

interface AvatarDrawCtx {
  x: number;
  /** Waterline / ground. */
  y: number;
  /** Bobbing centre for floating parts. */
  bobY: number;
  /** Cumulative course distance, used for distance-locked wheel rotation. */
  meters: number;
  accent: string;
  rim: string;
  foam: string;
  reduce: boolean;
}

/** Rowing shell with fixed feet and legs → body → arms drive sequencing. */
function drawRower(ctx: CanvasRenderingContext2D, a: AvatarDrawCtx, k: RowerKinematics) {
  const { x, bobY, accent, rim, foam, reduce } = a;
  const HL = 17;
  const HH = 2.8;

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

  // Seat slides hard toward the bow as the legs drive. Catch is compressed over
  // the stretcher; finish lays back with arms drawn to the body.
  const seatX = x + 3.5 - k.legExtension * 9.2;
  const seatY = bobY - 2;
  const shX = seatX + 4.2 - k.bodySwing * 9.5;
  const shY = bobY - 9.5 + k.bodySwing * 1.4;
  const hipX = seatX;
  const hipY = seatY;

  const footX = x + 9.2;
  const footY = bobY - 1;
  // Catch: knee high and forward. Finish: knee drops as the leg straightens.
  const kneeX = footX - 1.2 - k.legExtension * 6.5;
  const kneeY = bobY - 8.2 + k.legExtension * 6.4;
  limb(ctx, hipX, hipY, kneeX, kneeY, 2.1, accent); // thigh
  limb(ctx, kneeX, kneeY, footX, footY, 1.9, accent); // shin
  disc(ctx, footX, footY, 1.3, rim); // foot on stretcher

  // Torso + head.
  limb(ctx, seatX, seatY, shX, shY, 2.6, accent); // torso
  disc(ctx, shX, shY - 3.2, 2.5, accent); // head

  // One continuous oar rotates around a fixed oarlock. Long inboard lever so
  // hands travel with the seat; outboard blade sweeps a clear arc on the strip.
  const strokeProgress = k.legExtension * 0.42 + k.bodySwing * 0.34 + k.armDraw * 0.24;
  const oarAngle = Math.PI - 0.28 - strokeProgress * (Math.PI - 0.52);
  const oarCos = Math.cos(oarAngle);
  const oarSin = Math.sin(oarAngle);
  const oarlockX = x + 0.4;
  const oarlockY = bobY - 0.2;
  const handX = oarlockX - oarCos * 7.2;
  const handY = oarlockY - oarSin * 2.1 - k.bladeFeather * 0.8;
  const bladeRootX = oarlockX + oarCos * 13.5;
  const bladeRootY = oarlockY + oarSin * 4.2 + k.bladeDepth * 2.4 - k.bladeFeather * 5.5;
  const bladeTipX = bladeRootX + oarCos * 3.6;
  const bladeTipY = bladeRootY + oarSin * 1.1;
  const elbowX = (shX + handX) / 2 + 2.2 - k.armDraw * 1.6;
  const elbowY = (shY + handY) / 2 - 1.1 + k.armDraw * 0.4;
  limb(ctx, shX, shY + 1, elbowX, elbowY, 1.7, accent); // upper arm
  limb(ctx, elbowX, elbowY, handX, handY, 1.5, accent); // forearm
  disc(ctx, handX, handY, 1, accent); // hand on handle
  limb(ctx, handX, handY, bladeRootX, bladeRootY, 1.4, rim); // oar shaft
  limb(ctx, bladeRootX, bladeRootY, bladeTipX, bladeTipY, 2.8 - k.bladeFeather * 1.4, accent);
  if (!reduce && k.bladeDepth > 0.08) {
    disc(ctx, bladeTipX, bobY + 2.6, 1 + k.bladeDepth * 0.5, foam);
    disc(ctx, bladeTipX + 2.2, bobY + 1.4, 0.7 + k.bladeDepth * 0.35, foam);
    disc(ctx, bladeTipX - 1.2, bobY + 1.8, 0.55 + k.bladeDepth * 0.25, foam);
  }
}

/** Skier double-poling: arms/poles swing from a high reach to a low back-pull. */
function drawSkier(ctx: CanvasRenderingContext2D, a: AvatarDrawCtx, k: SkierKinematics) {
  const { x, y, bobY, accent, rim, foam, reduce } = a;
  const hipX = x + k.hipHinge * 1.8;
  const hipY = bobY - 7.2 + k.kneeFlex * 2.8;
  const shX = x + 0.6 + k.hipHinge * 4.6;
  const shY = bobY - 13.5 + k.hipHinge * 5.2;

  // Both boots remain planted while the knees and hip absorb the press.
  limb(ctx, hipX, hipY, x + 4.2, y, 2.3, accent);
  limb(ctx, hipX, hipY, x - 3.2, y, 2.3, accent);
  disc(ctx, x + 4.2, y, 1.2, rim); // right boot
  disc(ctx, x - 3.2, y, 1.2, rim); // left boot
  limb(ctx, hipX, hipY, shX, shY, 2.7, accent);
  disc(ctx, shX, shY - 3.2, 2.5, accent);

  // Reach → plant → press → recovery. The pole tip touches the snow only
  // while poleContact is active; otherwise its full trajectory clears the deck.
  const handX = shX + 6.5 - k.armPress * 9.5;
  const handY = shY + 0.8 + k.armPress * 8.5;
  const elbowX = (shX + handX) / 2 + 2.2 - k.armPress * 1.2;
  const elbowY = (shY + handY) / 2 + 0.6;
  limb(ctx, shX, shY + 1, elbowX, elbowY, 1.9, accent); // upper arm
  limb(ctx, elbowX, elbowY, handX, handY, 1.7, accent); // forearm
  disc(ctx, handX, handY, 1, accent); // hand on grip
  const poleTipX = handX + 5.2 - k.poleSweep * 13;
  const poleTipY = y - (1 - k.poleContact) * 6.5;
  limb(ctx, handX, handY, poleTipX, poleTipY, 1.3, rim);
  if (!reduce && k.poleContact > 0.12) {
    disc(ctx, poleTipX, y, 0.85 + k.poleContact * 0.45, foam);
    disc(ctx, poleTipX + 2, y - 1, 0.65 + k.poleContact * 0.3, foam);
    disc(ctx, poleTipX - 1.4, y - 0.6, 0.5 + k.poleContact * 0.2, foam);
  }
}

/** Cyclist whose wheels spin and legs pedal with the phase. */
function drawCyclist(ctx: CanvasRenderingContext2D, a: AvatarDrawCtx, k: BikeKinematics) {
  const { x, y, accent, rim, meters, reduce } = a;
  const wr = 5.4;
  const rearX = x - 8.5;
  const frontX = x + 8.5;
  const wheelY = y - wr;
  // Wheel rotation is tied to road distance, not cadence. A gearing change can
  // alter crank speed without making the tyres slide along the course.
  const wheelSpin = reduce ? 0.3 : meters / 0.34;

  // Wheels: rim + rotating spokes + hub.
  for (let wheel = 0; wheel < 2; wheel++) {
    const wx = wheel === 0 ? rearX : frontX;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(wx, wheelY, wr, 0, Math.PI * 2);
    ctx.stroke();
    for (let spoke = 0; spoke < 4; spoke++) {
      const ang = wheelSpin + (spoke * Math.PI) / 2;
      limb(ctx, wx, wheelY, wx + Math.cos(ang) * wr, wheelY + Math.sin(ang) * wr, 0.85, rim);
    }
    disc(ctx, wx, wheelY, 1.1, accent);
  }

  // Frame and wheels stay grounded; only the rider gets restrained secondary
  // movement from the kinematics solver.
  const bbX = x;
  const bbY = wheelY + 1;
  const seatX = x - 3.2;
  const seatY = wheelY - 7.4;
  const barX = frontX - 1.2;
  const barY = wheelY - 6.4;
  limb(ctx, rearX, wheelY, bbX, bbY, 1.7, accent);
  limb(ctx, bbX, bbY, seatX, seatY, 1.7, accent);
  limb(ctx, seatX, seatY, barX, barY, 1.7, accent);
  limb(ctx, bbX, bbY, barX, barY, 1.7, accent);
  limb(ctx, frontX, wheelY, barX, barY, 1.7, accent);

  // Rider: torso → bars, head, arms on bars, and two pedalling legs.
  const hipLift = reduce ? 0 : k.hipRock * 18;
  const torsoShift = reduce ? 0 : k.torsoSway * 18;
  const hipX = seatX + torsoShift * 0.25;
  const hipY = seatY + hipLift;
  const rShX = x + 1.2 + torsoShift;
  const rShY = wheelY - 12.5 + hipLift * 0.4;
  limb(ctx, hipX, hipY, rShX, rShY, 2.5, accent);
  disc(ctx, rShX + 1, rShY - 2.6, 2.4, accent); // head

  // Arms: from shoulders to handlebars with an elbow bend.
  const armElbX = (rShX + barX) / 2 + 1;
  const armElbY = (rShY + barY) / 2 - 0.6;
  limb(ctx, rShX, rShY, armElbX, armElbY, 1.7, accent); // upper arm
  limb(ctx, armElbX, armElbY, barX, barY, 1.5, accent); // forearm
  disc(ctx, barX, barY, 1, accent); // hand on bars

  // Two legs pedalling in opposition: each follows its crank position
  // (180° apart). The knee kinks outward for a natural look.
  for (let leg = 0; leg < 2; leg++) {
    const legSpin = k.crankAngle + leg * Math.PI;
    const crankX = bbX + Math.cos(legSpin) * 3.1;
    const crankY = bbY + Math.sin(legSpin) * 3.1;
    // Knee kinks outward on the downstroke, inward on the upstroke.
    const extension = Math.sin(legSpin);
    const kneeX = (hipX + crankX) / 2 + (leg === 0 ? 1.5 : -1.5) + extension * 0.7;
    const kneeY = (hipY + crankY) / 2 - 0.8;
    limb(ctx, hipX + 0.5, hipY + 0.5, kneeX, kneeY, 1.7, accent); // thigh
    limb(ctx, kneeX, kneeY, crankX, crankY, 1.5, accent); // shin
    const anklePitch = leg === 0 ? k.anklePitchLeft : k.anklePitchRight;
    const shoeX = crankX + Math.cos(anklePitch) * 1.7;
    const shoeY = crankY + Math.sin(anklePitch) * 1.7;
    limb(ctx, crankX, crankY, shoeX, shoeY, 1.6, rim); // foot on pedal
  }
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
    armPress: 0,
    hipHinge: 0,
    kneeFlex: 0,
    poleContact: 0,
    poleSweep: 0,
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
    if (w === 0) return;
    this.reduceMotion = prefersReducedMotion();

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
    const playerY = hasGhost ? h * 0.7 : h * 0.56;
    const ghostY = h * 0.34;

    // ── Scene layers ──────────────────────────────────────────────────────
    this.drawBackground(w, h);
    this.drawGrid(
      startX,
      span,
      h,
      state.totalDistance,
      hasGhost ? [ghostY, playerY] : [playerY],
      state.sport,
    );
    this.drawFinishGate(finishX, 10, h - 10);

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
    const effort = 0.85 + clamp01(intensity) * 0.75;
    const count =
      sport === "rower"
        ? 5 + Math.round(clamp01(intensity) * 4)
        : sport === "skierg"
          ? 4 + Math.round(clamp01(intensity) * 3)
          : 0;
    if (count === 0) return;
    // Catch-time contact points after the avatar's scale and solver-driven
    // surge: the row blade is aft/left of the hull, while the SkiErg basket
    // plants forward/right of the boots.
    const ox = sport === "rower" ? -22 : 11;
    for (let i = 0; i < count; i++) {
      pool.spawn(
        avX + ox + (Math.random() - 0.5) * 6,
        y + 2,
        0,
        (Math.random() * 48 - 14) * effort,
        -(32 + Math.random() * 48) * effort,
        0,
        0.36 + Math.random() * 0.28,
        (1 + Math.random() * 1.1) * effort,
      );
    }
  }

  destroy() {
    // 2D canvas has no GPU resources to release.
  }

  // ── Background ────────────────────────────────────────────────────────────

  private drawBackground(w: number, h: number) {
    const { ctx } = this;
    const C = this.colors;
    ctx.save();
    roundRect(ctx, 0, 0, w, h, 3);
    ctx.clip();
    // Richer gradient with a warm horizon band for a luxurious feel.
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, C.skyTop);
    grad.addColorStop(0.55, C.skyBottom);
    grad.addColorStop(1, C.courseFill);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // ── Grid + buoys ──────────────────────────────────────────────────────────

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
    ctx.save();
    ctx.font = '10px "Source Code Pro", ui-monospace, monospace';
    ctx.textAlign = "center";

    for (let i = 0; i <= 10; i++) {
      const x = startX + (span * i) / 10;
      const isMajor = i % 5 === 0;
      ctx.strokeStyle = isMajor ? C.tickMajor : C.tickMinor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 10);
      ctx.lineTo(x, h - 18);
      ctx.stroke();

      // Sport-aware course markers on every lane (ghost keeps visual parity).
      ctx.fillStyle = C.markerCap;
      for (const ly of waterlines) {
        if (sport === "bike") {
          const markerW = isMajor ? 5 : 3;
          ctx.fillRect(x - markerW / 2, ly - 1, markerW, 2);
        } else if (sport === "skierg") {
          const markerR = isMajor ? 3.5 : 2.5;
          ctx.beginPath();
          ctx.moveTo(x, ly - markerR);
          ctx.lineTo(x + markerR, ly);
          ctx.lineTo(x, ly + markerR);
          ctx.lineTo(x - markerR, ly);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(x, ly, isMajor ? 3.5 : 2.5, 0, Math.PI * 2);
          ctx.fill();
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

  private drawFinishGate(x: number, y0: number, y1: number) {
    const { ctx } = this;
    const C = this.colors;
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
    // across lanes, so it always uses the live accent (`C.live`).
    ctx.lineCap = "butt";
    for (const [width, alpha] of [
      [6, 0.08],
      [3, 0.18],
      [1.5, 0.35],
    ]) {
      ctx.strokeStyle = withAlpha(C.live, alpha);
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x - 1, y0);
      ctx.lineTo(x - 1, y1);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ── Lane scene ────────────────────────────────────────────────────────────

  private drawRowSurface(o: LaneOpts, avX: number) {
    const { ctx } = this;
    const C = this.colors;
    const { startX, span, y, accent, phase } = o;
    const bandTop = y - WATER_H * 0.3;
    const bandBottom = y + WATER_H * 0.7;
    const band = ctx.createLinearGradient(0, bandTop, 0, bandBottom);
    band.addColorStop(0, withAlpha(accent, 0.04));
    band.addColorStop(0.35, withAlpha(accent, 0.12));
    band.addColorStop(0.5, withAlpha(accent, 0.18));
    band.addColorStop(1, withAlpha(accent, 0.22));
    ctx.fillStyle = band;
    roundRect(ctx, startX, bandTop, span, bandBottom - bandTop, 4);
    ctx.fill();

    ctx.strokeStyle = C.laneLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(startX + span, y);
    ctx.stroke();

    // Three wave trains make the RowErg lane read as water. Reduced motion
    // keeps the same structure but flattens every train.
    for (let ri = 0; ri < 3; ri++) {
      const offsetY = y + 5 + ri * 5;
      ctx.strokeStyle = withAlpha(accent, 0.25 - ri * 0.06);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(startX, offsetY);
      if (this.reduceMotion) {
        ctx.lineTo(startX + span, offsetY);
      } else {
        const layerPhase = phase * (0.7 + ri * 0.45) + ri * 1.1;
        for (let rx = startX; rx <= startX + span; rx += 6) {
          ctx.lineTo(rx, offsetY + Math.sin(rx * 0.12 + layerPhase) * 1.5);
        }
      }
      ctx.stroke();
    }

    if (avX <= startX) return;
    // Build the wake once, then restroke the retained path for glow + core.
    ctx.beginPath();
    ctx.moveTo(startX, y);
    if (this.reduceMotion) {
      ctx.lineTo(avX, y);
    } else {
      for (let x = startX; x <= avX; x += 6) {
        ctx.lineTo(x, y + Math.sin((x - avX) * 0.18 + phase) * 1.2);
      }
    }
    ctx.strokeStyle = withAlpha(accent, 0.12);
    ctx.lineWidth = 11;
    ctx.stroke();
    ctx.strokeStyle = withAlpha(accent, 0.3);
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  private drawSkiSurface(o: LaneOpts, avX: number) {
    const { ctx } = this;
    const C = this.colors;
    const { startX, span, y, accent, phase } = o;
    const bandTop = y - 10;
    const bandBottom = y + 22;
    const band = ctx.createLinearGradient(0, bandTop, 0, bandBottom);
    band.addColorStop(0, withAlpha(C.foam, 0.52));
    band.addColorStop(0.45, withAlpha(accent, 0.08));
    band.addColorStop(1, withAlpha(C.markerCap, 0.18));
    ctx.fillStyle = band;
    roundRect(ctx, startX, bandTop, span, bandBottom - bandTop, 4);
    ctx.fill();

    ctx.strokeStyle = withAlpha(C.markerCap, 0.7);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(startX + span, y);
    ctx.stroke();

    // Groomed grooves drift very gently while playing; they are straight and
    // stationary under reduced motion, unlike RowErg's wave trains.
    ctx.setLineDash(SKI_GROOVE_DASH);
    ctx.lineDashOffset = this.reduceMotion ? 0 : -phase * 2;
    for (let groove = 0; groove < 3; groove++) {
      const gy = y + 6 + groove * 5;
      ctx.strokeStyle = withAlpha(accent, 0.18 - groove * 0.035);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(startX, gy);
      ctx.lineTo(startX + span, gy);
      ctx.stroke();
    }
    ctx.setLineDash(SOLID_LINE);
    ctx.lineDashOffset = 0;

    if (avX > startX) {
      ctx.beginPath();
      ctx.moveTo(startX, y + 1);
      ctx.lineTo(avX, y + 1);
      ctx.strokeStyle = withAlpha(C.foam, 0.55);
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.strokeStyle = withAlpha(accent, 0.55);
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  private drawBikeSurface(o: LaneOpts, avX: number) {
    const { ctx } = this;
    const C = this.colors;
    const { startX, span, y, accent, phase } = o;
    const bandTop = y - 10;
    const bandBottom = y + 22;
    const band = ctx.createLinearGradient(0, bandTop, 0, bandBottom);
    band.addColorStop(0, withAlpha(C.shadow, 0.08));
    band.addColorStop(0.45, withAlpha(C.markerCap, 0.24));
    band.addColorStop(1, withAlpha(C.shadow, 0.18));
    ctx.fillStyle = band;
    roundRect(ctx, startX, bandTop, span, bandBottom - bandTop, 4);
    ctx.fill();

    // Alternating accent/foam curb strokes frame a compact velodrome lane.
    const dashOffset = this.reduceMotion ? 0 : -phase * 3;
    for (let edge = 0; edge < 2; edge++) {
      const cy = edge === 0 ? bandTop + 1.5 : bandBottom - 1.5;
      ctx.setLineDash(BIKE_CURB_DASH);
      ctx.lineDashOffset = dashOffset;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(startX, cy);
      ctx.lineTo(startX + span, cy);
      ctx.stroke();
      ctx.lineDashOffset = dashOffset - 8;
      ctx.strokeStyle = withAlpha(C.foam, 0.8);
      ctx.stroke();
    }

    ctx.setLineDash(BIKE_LANE_DASH);
    ctx.lineDashOffset = this.reduceMotion ? 0 : -phase * 4;
    ctx.strokeStyle = withAlpha(C.labelBg, 0.58);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, y + 8);
    ctx.lineTo(startX + span, y + 8);
    ctx.stroke();
    ctx.setLineDash(SOLID_LINE);
    ctx.lineDashOffset = 0;

    if (avX > startX) {
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(avX, y);
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

    ctx.save();
    if (!isYou) {
      ctx.globalAlpha = 0.82;
    }

    if (sport === "skierg") this.drawSkiSurface(o, avX);
    else if (sport === "bike") this.drawBikeSurface(o, avX);
    else this.drawRowSurface(o, avX);

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

  private drawAvatar(o: AvatarOpts) {
    const { ctx } = this;
    const C = this.colors;
    const { x, y, accent, phase, meters, pose, spm, isYou, sport, label, splash } = o;
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

    // Cast shadow on the water (anchored to the waterline, so the avatar lifts).
    ctx.save();
    ctx.fillStyle = withAlpha(C.shadow, 0.18);
    ctx.beginPath();
    ctx.ellipse(figX, y + 5, POD_R * 1.9, POD_R * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Sport-specific animated athlete (or neutral pod fallback).
    ctx.save();
    const a: AvatarDrawCtx = {
      x: figX,
      y,
      bobY,
      meters,
      accent,
      rim,
      foam: C.foam,
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
    const caretY = y - 22; // tip sits just above the figure
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
