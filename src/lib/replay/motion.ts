import type { Sport } from "../types";

/**
 * Shared animation helpers for the 2D and 3D replay renderers.
 *
 * Everything here is pure and DOM-free so both renderers stay frame-rate
 * independent: phases advance by wall-clock dt, smoothing uses exponential
 * decay, and the particle/governor state machines can be unit-tested without
 * a canvas.
 */

/** Distance (m) per full stroke/pedal animation cycle, per sport. */
export const METERS_PER_CYCLE: Record<Sport, number> = {
  rower: 11,
  skierg: 8,
  bike: 5,
};

/**
 * Longest frame delta (s) the animation will integrate. Returning from a
 * background tab can produce multi-second deltas; clamping keeps phases and
 * particles from teleporting.
 */
const MAX_DT = 0.1;

/** Convert a raw frame delta in milliseconds to clamped seconds. */
export function clampDt(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.min(ms / 1000, MAX_DT);
}

/**
 * Frame-rate independent smoothing factor for `current += (target - current) * f`.
 * Equivalent to lerping by `1 - e^(-rate·dt)`: the same `rate` converges at the
 * same wall-clock speed at 30, 60, or 120 fps.
 */
export function dampFactor(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * Math.max(0, dt));
}

/**
 * Warp a continuous stroke phase so the drive is quick and the recovery slow,
 * matching real erg rhythm instead of a symmetric sine. Input and output are
 * radians with the catch at multiples of 2π; the drive occupies the first
 * `driveFrac` of each cycle but is remapped onto the first half (0..π) of the
 * output, so `cos(warped)` swings +1 (catch) → −1 (finish) fast and eases back
 * through the long recovery.
 */
export function warpStrokePhase(phase: number, driveFrac = 0.4): number {
  const TAU = Math.PI * 2;
  const cycles = Math.floor(phase / TAU);
  const u = phase / TAU - cycles; // 0..1 within the cycle
  const w = u < driveFrac ? (u / driveFrac) * 0.5 : 0.5 + ((u - driveFrac) / (1 - driveFrac)) * 0.5;
  return (cycles + w) * TAU;
}

/**
 * Hull surge offset for a warped stroke phase: the shell checks (sits back)
 * at the catch, accelerates through the drive and coasts forward into the
 * finish. Returns −1..1; callers scale by a per-sport amplitude in their own
 * units (px or metres).
 */
export function strokeSurge(warpedPhase: number): number {
  return -Math.cos(warpedPhase);
}

/**
 * Count the catches (phase crossing a 2π boundary) between two stroke phases.
 * Used to trigger splash/spray exactly once per stroke. Jumps larger than
 * `maxCycles` (seeks) report 0 so a scrub doesn't fire a burst of splashes.
 */
export function catchEvents(prevPhase: number, nextPhase: number, maxCycles = 2): number {
  if (!(nextPhase > prevPhase)) return 0;
  const TAU = Math.PI * 2;
  const crossings = Math.floor(nextPhase / TAU) - Math.floor(prevPhase / TAU);
  if (crossings <= 0 || nextPhase - prevPhase > maxCycles * TAU) return 0;
  return crossings;
}

/**
 * Fixed-capacity droplet pool (no allocation after construction). Coordinates
 * are caller-defined: the 2D renderer spawns in CSS pixels with y down, the 3D
 * renderer in metres with y up — gravity's sign is up to the caller.
 */
export class ParticlePool {
  readonly capacity: number;
  /** Particles in [0, alive) are live; swap-removed on expiry. */
  alive = 0;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  /** Remaining life (s). */
  readonly life: Float32Array;
  /** Initial life (s), for fade fractions. */
  readonly ttl: Float32Array;
  readonly size: Float32Array;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.z = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.vz = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.ttl = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
  }

  /** Spawn one droplet; silently dropped when the pool is full. */
  spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
  ): void {
    if (this.alive >= this.capacity) return;
    const i = this.alive++;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.life[i] = life;
    this.ttl[i] = life;
    this.size[i] = size;
  }

  /** Integrate gravity + velocity and expire dead droplets. */
  update(dt: number, gx: number, gy: number, gz: number): void {
    let i = 0;
    while (i < this.alive) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // Swap-remove with the last live particle.
        const last = --this.alive;
        if (i !== last) {
          this.x[i] = this.x[last];
          this.y[i] = this.y[last];
          this.z[i] = this.z[last];
          this.vx[i] = this.vx[last];
          this.vy[i] = this.vy[last];
          this.vz[i] = this.vz[last];
          this.life[i] = this.life[last];
          this.ttl[i] = this.ttl[last];
          this.size[i] = this.size[last];
        }
        continue;
      }
      this.vx[i] += gx * dt;
      this.vy[i] += gy * dt;
      this.vz[i] += gz * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.z[i] += this.vz[i] * dt;
      i++;
    }
  }

  /** Fraction of life remaining for particle `i`, 1 → 0. */
  fade(i: number): number {
    const t = this.ttl[i];
    return t > 0 ? this.life[i] / t : 0;
  }

  clear(): void {
    this.alive = 0;
  }
}

/**
 * Adaptive degradation ladder: watches frame deltas while playing and steps a
 * `level` counter up (0 = full quality) when frames are persistently over
 * budget. Levels are sticky for the renderer's lifetime — stepping back up
 * would oscillate on hardware that is right at the edge. The consumer maps
 * levels to concrete savings (lower pixel ratio, flat water, fewer effects).
 *
 * The deltas are rAF-to-rAF gaps, which also reflect deliberate refresh caps
 * (30 Hz monitors, battery-saver rAF throttling) where the GPU is idle. To
 * avoid punishing those, the governor first watches `calibrationFrames`
 * samples and sets its working budget to the *median* observed interval plus
 * headroom — degradation then only triggers when frames run persistently
 * slower than the device's own steady state.
 */
export class PerfGovernor {
  private readonly floorBudgetMs: number;
  private readonly window: number;
  private readonly graceFrames: number;
  private readonly maxLevel: number;
  private readonly calibration: Float64Array;
  private calCount = 0;
  private budget = 0;
  private emaMs = 0;
  private over = 0;
  private grace = 0;
  level = 0;

  constructor(opts: {
    budgetMs?: number;
    window?: number;
    graceFrames?: number;
    maxLevel: number;
    calibrationFrames?: number;
  }) {
    this.floorBudgetMs = opts.budgetMs ?? 22; // ~45 fps floor
    this.window = opts.window ?? 60;
    this.graceFrames = opts.graceFrames ?? 90;
    this.maxLevel = opts.maxLevel;
    this.calibration = new Float64Array(Math.max(1, opts.calibrationFrames ?? 30));
  }

  /**
   * Feed one frame delta (ms). Returns the new level when a step-down fires,
   * else null. Deltas over 250 ms (tab switches, GC stalls) are ignored.
   */
  sample(dtMs: number): number | null {
    if (!Number.isFinite(dtMs) || dtMs <= 0 || dtMs > 250) return null;
    if (this.calCount < this.calibration.length) {
      this.calibration[this.calCount++] = dtMs;
      if (this.calCount === this.calibration.length) {
        const sorted = Array.from(this.calibration).sort((a, b) => a - b);
        const median = sorted[sorted.length >> 1];
        // Cap the budget so a device that is already overloaded during
        // calibration (e.g. high quality on weak GPU) still triggers
        // degradation. 2× the floor (~44 ms ≈ 22 fps) is generous enough
        // for refresh-capped displays (30 Hz = 33 ms) but tight enough
        // that truly overloaded frames (80–100 ms) step down quickly.
        const calBudgetCap = this.floorBudgetMs * 2;
        this.budget = Math.min(calBudgetCap, Math.max(this.floorBudgetMs, median * 1.6));
        this.emaMs = median;
      }
      return null;
    }
    if (this.grace > 0) {
      this.grace--;
      return null;
    }
    if (this.level >= this.maxLevel) return null;
    // The EMA grows from 0, so a lone spike can never push it over budget —
    // only a sustained run of slow frames can.
    this.emaMs = this.emaMs * 0.9 + dtMs * 0.1;
    if (this.emaMs > this.budget) {
      if (++this.over >= this.window) {
        this.level++;
        this.over = 0;
        this.emaMs = 0;
        this.grace = this.graceFrames;
        return this.level;
      }
    } else {
      this.over = 0;
    }
    return null;
  }
}
