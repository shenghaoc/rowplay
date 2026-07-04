import { describe, expect, it } from "vite-plus/test";
import {
  METERS_PER_CYCLE,
  ParticlePool,
  PerfGovernor,
  catchEvents,
  clampDt,
  dampFactor,
  strokeSurge,
  warpStrokePhase,
} from "./motion";

const TAU = Math.PI * 2;

describe("clampDt", () => {
  it("converts ms to seconds", () => {
    expect(clampDt(16.7)).toBeCloseTo(0.0167, 4);
  });

  it("clamps long deltas (background tab) to 100ms", () => {
    expect(clampDt(5000)).toBe(0.1);
  });

  it("returns 0 for zero, negative, and non-finite input", () => {
    expect(clampDt(0)).toBe(0);
    expect(clampDt(-5)).toBe(0);
    expect(clampDt(NaN)).toBe(0);
    expect(clampDt(Infinity)).toBe(0);
  });
});

describe("dampFactor", () => {
  it("is 0 at dt=0 and approaches 1 for large dt", () => {
    expect(dampFactor(8, 0)).toBe(0);
    expect(dampFactor(8, 10)).toBeCloseTo(1, 6);
  });

  it("is frame-rate independent: two half-steps equal one full step", () => {
    const rate = 6;
    const full = dampFactor(rate, 1 / 30);
    const half = dampFactor(rate, 1 / 60);
    // Applying the half factor twice: 1 - (1-half)^2 must equal the full factor.
    expect(1 - (1 - half) * (1 - half)).toBeCloseTo(full, 10);
  });

  it("never goes negative for negative dt", () => {
    expect(dampFactor(8, -1)).toBe(0);
  });
});

describe("warpStrokePhase", () => {
  it("maps cycle boundaries onto themselves", () => {
    expect(warpStrokePhase(0)).toBeCloseTo(0, 10);
    expect(warpStrokePhase(TAU)).toBeCloseTo(TAU, 10);
    expect(warpStrokePhase(3 * TAU)).toBeCloseTo(3 * TAU, 10);
  });

  it("maps the end of the drive (driveFrac) to half a cycle", () => {
    expect(warpStrokePhase(0.4 * TAU, 0.4)).toBeCloseTo(Math.PI, 10);
    expect(warpStrokePhase(0.3 * TAU, 0.3)).toBeCloseTo(Math.PI, 10);
  });

  it("is monotonic within a cycle", () => {
    let prev = -1;
    for (let u = 0; u <= 1; u += 0.01) {
      const w = warpStrokePhase(u * TAU);
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
  });

  it("traverses the drive faster than the recovery", () => {
    // With driveFrac 0.4, the first 40% of the cycle covers half the output
    // range, so its average rate exceeds the recovery's.
    const driveRate = warpStrokePhase(0.4 * TAU) / (0.4 * TAU);
    const recoveryRate = (warpStrokePhase(TAU) - warpStrokePhase(0.4 * TAU)) / (0.6 * TAU);
    expect(driveRate).toBeGreaterThan(recoveryRate);
  });
});

describe("strokeSurge", () => {
  it("checks (minimum) at the catch and peaks at the finish", () => {
    expect(strokeSurge(0)).toBe(-1);
    expect(strokeSurge(Math.PI)).toBe(1);
  });

  it("stays within -1..1", () => {
    for (let p = 0; p < TAU; p += 0.1) {
      const s = strokeSurge(p);
      expect(s).toBeGreaterThanOrEqual(-1);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe("catchEvents", () => {
  it("reports one catch when the phase crosses a cycle boundary", () => {
    expect(catchEvents(0.9 * TAU, 1.1 * TAU)).toBe(1);
  });

  it("reports none within a cycle", () => {
    expect(catchEvents(0.2 * TAU, 0.8 * TAU)).toBe(0);
  });

  it("suppresses bursts from seek-sized jumps", () => {
    expect(catchEvents(0, 50 * TAU)).toBe(0);
  });

  it("ignores backwards movement (seek back)", () => {
    expect(catchEvents(2 * TAU, TAU)).toBe(0);
  });
});

describe("ParticlePool", () => {
  it("spawns up to capacity and drops overflow silently", () => {
    const p = new ParticlePool(2);
    p.spawn(0, 0, 0, 0, 0, 0, 1, 1);
    p.spawn(0, 0, 0, 0, 0, 0, 1, 1);
    p.spawn(0, 0, 0, 0, 0, 0, 1, 1);
    expect(p.alive).toBe(2);
  });

  it("integrates velocity and gravity", () => {
    const p = new ParticlePool(1);
    p.spawn(0, 0, 0, 10, 0, 0, 1, 1);
    p.update(0.5, 0, -4, 0);
    expect(p.x[0]).toBeCloseTo(5, 5);
    expect(p.vy[0]).toBeCloseTo(-2, 5);
    expect(p.y[0]).toBeCloseTo(-1, 5); // vy after gravity, then integrate
  });

  it("expires particles and swap-removes them", () => {
    const p = new ParticlePool(3);
    p.spawn(1, 0, 0, 0, 0, 0, 0.1, 1); // dies first
    p.spawn(2, 0, 0, 0, 0, 0, 9, 1);
    p.spawn(3, 0, 0, 0, 0, 0, 9, 1);
    p.update(0.2, 0, 0, 0);
    expect(p.alive).toBe(2);
    // The dead slot 0 was backfilled by the last particle.
    const xs = [p.x[0], p.x[1]].sort((a, b) => a - b);
    expect(xs).toEqual([2, 3]);
  });

  it("fade falls from 1 toward 0 over the particle lifetime", () => {
    const p = new ParticlePool(1);
    p.spawn(0, 0, 0, 0, 0, 0, 1, 1);
    expect(p.fade(0)).toBe(1);
    p.update(0.75, 0, 0, 0);
    expect(p.fade(0)).toBeCloseTo(0.25, 5);
  });

  it("clear() removes all particles", () => {
    const p = new ParticlePool(2);
    p.spawn(0, 0, 0, 0, 0, 0, 1, 1);
    p.clear();
    expect(p.alive).toBe(0);
  });
});

describe("PerfGovernor", () => {
  /** Warm the calibration window with healthy ~60 Hz frames. */
  function calibrate(g: PerfGovernor, frames = 30, dt = 16) {
    for (let i = 0; i < frames; i++) g.sample(dt);
  }

  it("stays at level 0 while frames are within budget", () => {
    const g = new PerfGovernor({ budgetMs: 22, window: 10, maxLevel: 3 });
    for (let i = 0; i < 200; i++) expect(g.sample(16)).toBeNull();
    expect(g.level).toBe(0);
  });

  it("steps down after a sustained run of slow frames", () => {
    const g = new PerfGovernor({ budgetMs: 22, window: 10, graceFrames: 5, maxLevel: 3 });
    calibrate(g);
    let stepped: number | null = null;
    for (let i = 0; i < 80 && stepped === null; i++) stepped = g.sample(40);
    expect(stepped).toBe(1);
    expect(g.level).toBe(1);
  });

  it("does not degrade on a refresh-capped display (steady 30 Hz, idle GPU)", () => {
    // iOS Low Power Mode / 30 Hz monitors tick rAF at ~33 ms with no GPU
    // load. Calibration must absorb that as the device's steady state.
    const g = new PerfGovernor({ budgetMs: 22, window: 10, graceFrames: 5, maxLevel: 3 });
    for (let i = 0; i < 600; i++) g.sample(33.4);
    expect(g.level).toBe(0);
  });

  it("still degrades when a capped display genuinely slows down", () => {
    const g = new PerfGovernor({ budgetMs: 22, window: 10, graceFrames: 5, maxLevel: 3 });
    for (let i = 0; i < 30; i++) g.sample(33.4); // calibrate at 30 Hz
    let stepped: number | null = null;
    for (let i = 0; i < 100 && stepped === null; i++) stepped = g.sample(80);
    expect(stepped).toBe(1);
  });

  it("a single slow frame does not trigger a step", () => {
    const g = new PerfGovernor({ budgetMs: 22, window: 10, maxLevel: 3 });
    calibrate(g);
    g.sample(200);
    for (let i = 0; i < 100; i++) g.sample(10);
    expect(g.level).toBe(0);
  });

  it("respects the grace period after stepping", () => {
    const g = new PerfGovernor({ budgetMs: 22, window: 5, graceFrames: 50, maxLevel: 3 });
    calibrate(g);
    while (g.level === 0) g.sample(40);
    // During grace, even slow frames must not advance the level.
    for (let i = 0; i < 50; i++) g.sample(40);
    expect(g.level).toBe(1);
  });

  it("never exceeds maxLevel", () => {
    const g = new PerfGovernor({ budgetMs: 22, window: 5, graceFrames: 0, maxLevel: 2 });
    calibrate(g);
    for (let i = 0; i < 500; i++) g.sample(40);
    expect(g.level).toBe(2);
  });

  it("ignores tab-switch sized deltas", () => {
    const g = new PerfGovernor({ budgetMs: 22, window: 5, graceFrames: 0, maxLevel: 2 });
    calibrate(g);
    for (let i = 0; i < 100; i++) g.sample(1000);
    expect(g.level).toBe(0);
  });

  it("degrades on an already-overloaded device (calibration at 100 ms/frame)", () => {
    const g = new PerfGovernor({ budgetMs: 22, window: 5, graceFrames: 5, maxLevel: 3 });
    // Calibration at 100 ms/frame (10 fps) — the quality tier is too heavy.
    for (let i = 0; i < 30; i++) g.sample(100);
    // After calibration the budget is capped at 2×floor (44 ms), not the
    // uncapped median×1.6 (160 ms), so sustained 100 ms frames trigger
    // degradation quickly.
    let stepped: number | null = null;
    for (let i = 0; i < 50 && stepped === null; i++) stepped = g.sample(100);
    expect(stepped).toBe(1);
  });
});

describe("METERS_PER_CYCLE", () => {
  it("covers every sport with a positive cycle length", () => {
    expect(METERS_PER_CYCLE.rower).toBeGreaterThan(0);
    expect(METERS_PER_CYCLE.skierg).toBeGreaterThan(0);
    expect(METERS_PER_CYCLE.bike).toBeGreaterThan(0);
  });
});
