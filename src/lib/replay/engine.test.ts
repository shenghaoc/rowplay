import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ReplayEngine, sampleAt, sampleIndexAt, type Frame } from "./engine";
import type { Stroke } from "$lib/types";
import { ladderStrokes } from "../../../tests/unit/fixtures";
import { mockWorkoutDetail } from "../mockData";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Deterministic stand-in for requestAnimationFrame + performance.now. */
function installClock() {
  let now = 0;
  const pending = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const cancelled: number[] = [];

  vi.stubGlobal("performance", { now: () => now });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    if (pending.delete(id)) cancelled.push(id);
  });

  return {
    setNow(ms: number) {
      now = ms;
    },
    pendingCount() {
      return pending.size;
    },
    cancelled,
    flushOne() {
      const next = pending.entries().next();
      if (next.done) return false;
      const [id, cb] = next.value;
      pending.delete(id);
      cb(now);
      return true;
    },
  };
}

function strokeAt(t: number): Stroke {
  return { t, d: t * 4, pace: 120, spm: 24, watts: 180 };
}

describe("sampleAt", () => {
  const strokes = ladderStrokes();

  it("returns zeros for empty strokes", () => {
    const f = sampleAt([], 5);
    expect(f.d).toBe(0);
    expect(f.pace).toBe(0);
    expect(f.progress).toBe(0);
  });

  it("clamps before first sample", () => {
    const f = sampleAt(strokes, -1);
    expect(f.pace).toBe(strokes[0].pace);
    expect(f.d).toBe(strokes[0].d);
    expect(f.progress).toBe(0);
  });

  it("clamps after last sample", () => {
    const f = sampleAt(strokes, 100);
    const last = strokes[strokes.length - 1];
    expect(f.pace).toBe(last.pace);
    expect(f.d).toBe(last.d);
    expect(f.progress).toBe(1);
  });

  it("returns exact values on stroke timestamps", () => {
    const mid = strokes[1];
    const f = sampleAt(strokes, mid.t);
    expect(f.pace).toBe(mid.pace);
    expect(f.d).toBe(mid.d);
    expect(f.spm).toBe(mid.spm);
    expect(f.hr).toBe(mid.hr);
  });

  it("interpolates mid-stroke between samples", () => {
    const f = sampleAt(strokes, 15);
    expect(f.t).toBe(15);
    expect(f.pace).toBeGreaterThan(100);
    expect(f.pace).toBeLessThan(120);
    expect(f.d).toBeGreaterThan(50);
    expect(f.d).toBeLessThan(100);
    expect(f.progress).toBeCloseTo(0.75, 5);
  });

  it("interpolates heart rate when both ends have HR", () => {
    const f = sampleAt(strokes, 15);
    expect(f.hr).toBeGreaterThan(150);
    expect(f.hr).toBeLessThan(160);
  });

  it("keeps a one-sided heart-rate sample instead of averaging with undefined", () => {
    const withStart: Stroke[] = [
      { t: 0, d: 0, pace: 120, spm: 20, watts: 100, hr: 140 },
      { t: 10, d: 40, pace: 120, spm: 20, watts: 100 },
    ];
    const withEnd: Stroke[] = [
      { t: 0, d: 0, pace: 120, spm: 20, watts: 100 },
      { t: 10, d: 40, pace: 120, spm: 20, watts: 100, hr: 160 },
    ];
    const neither: Stroke[] = [
      { t: 0, d: 0, pace: 120, spm: 20, watts: 100 },
      { t: 10, d: 40, pace: 120, spm: 20, watts: 100 },
    ];
    expect(sampleAt(withStart, 5).hr).toBe(140);
    expect(sampleAt(withEnd, 5).hr).toBe(160);
    expect(sampleAt(neither, 5).hr).toBeUndefined();
  });

  it("works on mock workout strokes end-to-end", () => {
    const detail = mockWorkoutDetail(1001);
    expect(detail).not.toBeNull();
    const s = detail!.strokes;
    const mid = s[Math.floor(s.length / 2)];
    const f = sampleAt(s, mid.t);
    expect(f.d).toBeCloseTo(mid.d, 0);
    expect(f.pace).toBeCloseTo(mid.pace, 0);
  });

  describe("sampleIndexAt", () => {
    it("returns -1 for empty strokes", () => {
      expect(sampleIndexAt([], 5)).toBe(-1);
    });

    it("clamps before first sample", () => {
      expect(sampleIndexAt(strokes, -1)).toBe(0);
    });

    it("clamps after last sample", () => {
      expect(sampleIndexAt(strokes, 100)).toBe(strokes.length - 1);
    });

    it("returns exact index on stroke timestamps", () => {
      expect(sampleIndexAt(strokes, strokes[1].t)).toBe(1);
    });

    it("holds the lower bracket between samples", () => {
      expect(sampleIndexAt(strokes, 15)).toBe(1);
      const f = sampleAt(strokes, 15);
      expect(f.pace).not.toBe(strokes[1].pace);
      expect(strokes[sampleIndexAt(strokes, 15)].pace).toBe(strokes[1].pace);
    });
  });

  /** Both lanes must share the same engine clock `t` when sampled. */
  describe("ghost coherence", () => {
    const player: Stroke[] = [
      { t: 0, d: 0, pace: 120, spm: 28, watts: 200 },
      { t: 60, d: 250, pace: 118, spm: 29, watts: 210 },
      { t: 120, d: 500, pace: 116, spm: 30, watts: 220 },
    ];
    const ghost: Stroke[] = [
      { t: 0, d: 0, pace: 125, spm: 26, watts: 180 },
      { t: 60, d: 230, pace: 124, spm: 27, watts: 185 },
      { t: 120, d: 480, pace: 122, spm: 28, watts: 190 },
    ];

    for (const t of [0, 30, 60, 90, 120, 150]) {
      it(`player and ghost align at t=${t}s`, () => {
        const pf = sampleAt(player, t);
        const gf = sampleAt(ghost, t);
        expect(pf.t).toBe(gf.t);
        expect(pf.t).toBe(t);
      });
    }
  });
});

describe("ReplayEngine", () => {
  it("does not start playback when the piece has no duration", () => {
    const clock = installClock();
    const frames: Frame[] = [];
    const engine = new ReplayEngine([], (frame) => frames.push(frame));

    expect(engine.duration).toBe(0);
    expect(frames).toEqual([expect.objectContaining({ t: 0, d: 0, progress: 0 })]);
    engine.play();
    expect(engine.playing).toBe(false);
    expect(clock.pendingCount()).toBe(0);
  });

  it("advances by elapsed wall time scaled by playback speed", () => {
    const clock = installClock();
    const frames: Frame[] = [];
    const engine = new ReplayEngine(ladderStrokes(), (frame) => frames.push(frame));

    clock.setNow(1_000);
    engine.play();
    expect(engine.playing).toBe(true);
    expect(engine.speed).toBe(1);

    clock.flushOne();
    expect(engine.time).toBe(0);

    clock.setNow(2_500);
    engine.setSpeed(2);
    clock.setNow(3_500);
    clock.flushOne();

    expect(engine.time).toBeCloseTo(2);
    expect(frames.at(-1)?.t).toBeCloseTo(2);
    expect(engine.playing).toBe(true);
  });

  it("clamps at the end of the piece and stops scheduling frames", () => {
    const clock = installClock();
    const engine = new ReplayEngine([strokeAt(0), strokeAt(2)], () => {});

    clock.setNow(0);
    engine.play();
    clock.flushOne();
    clock.setNow(5_000);
    clock.flushOne();

    expect(engine.time).toBe(2);
    expect(engine.playing).toBe(false);
    expect(clock.pendingCount()).toBe(0);
  });

  it("restarts from the beginning when play is pressed at the end", () => {
    const clock = installClock();
    const engine = new ReplayEngine([strokeAt(0), strokeAt(2)], () => {});
    engine.seek(2);
    expect(engine.time).toBe(2);

    clock.setNow(0);
    engine.play();
    expect(engine.time).toBe(0);
    expect(engine.playing).toBe(true);
    expect(clock.pendingCount()).toBe(1);
  });

  it("ignores a second play call while a frame is already scheduled", () => {
    const clock = installClock();
    const engine = new ReplayEngine(ladderStrokes(), () => {});
    clock.setNow(0);
    engine.play();
    engine.play();
    expect(clock.pendingCount()).toBe(1);
  });

  it("does not advance when a frame callback arrives after pause", () => {
    const queued: FrameRequestCallback[] = [];
    vi.stubGlobal("performance", { now: () => 0 });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      queued.push(cb);
      return 4;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});

    const engine = new ReplayEngine(ladderStrokes(), () => {});
    engine.play();
    const callback = queued[0];
    engine.pause();
    expect(engine.playing).toBe(false);
    expect(callback).toBeTypeOf("function");

    callback?.(5_000);
    expect(engine.time).toBe(0);
    expect(engine.playing).toBe(false);
  });

  it("clamps seek into the piece and keeps a running clock playing", () => {
    const clock = installClock();
    const frames: Frame[] = [];
    const engine = new ReplayEngine(ladderStrokes(), (frame) => frames.push(frame));

    engine.seek(-10);
    expect(engine.time).toBe(0);
    engine.seek(1_000);
    expect(engine.time).toBe(20);
    expect(frames.at(-1)?.progress).toBe(1);

    clock.setNow(0);
    engine.play();
    engine.seek(7);
    expect(engine.playing).toBe(true);
    expect(engine.time).toBe(7);
    expect(frames.at(-1)?.t).toBe(7);
  });

  it("toggles between play and pause", () => {
    const clock = installClock();
    const engine = new ReplayEngine(ladderStrokes(), () => {});
    clock.setNow(0);

    engine.toggle();
    expect(engine.playing).toBe(true);
    expect(clock.pendingCount()).toBe(1);

    engine.toggle();
    expect(engine.playing).toBe(false);
    expect(clock.pendingCount()).toBe(0);
  });

  it("cancels the scheduled frame on destroy so playback cannot continue", () => {
    const clock = installClock();
    const engine = new ReplayEngine(ladderStrokes(), () => {});
    clock.setNow(0);
    engine.play();
    engine.destroy();

    expect(clock.cancelled).toEqual([1]);
    clock.setNow(4_000);
    expect(clock.flushOne()).toBe(false);
    expect(engine.time).toBe(0);
  });
});
