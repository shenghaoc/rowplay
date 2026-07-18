import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Sport } from "../types";
import { COLORS_LIGHT, COLORS_DARK, CourseRenderer, type RenderState } from "./renderer";
import { MACHINE_HEX } from "./sports";
import { buildStrokeTimeline, strokePoseAt } from "./strokeModel";

// The course renderer paints to <canvas>, which can't resolve CSS custom
// properties, so it mirrors the live/ghost accent tokens as constants. app.css
// is the source of truth — parse it and fail loudly if the mirror drifts.
const css = readFileSync(fileURLToPath(new URL("../../app.css", import.meta.url)), "utf8");

/** Body of the first `selector { … }` rule (custom-property blocks have no nested braces). */
function blockBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`CSS block not found: ${selector}`);
  return m[1];
}

/** First `--name: #hex` or `--name: light-dark(#light, #dark)` value within a block body. */
function token(body: string, name: string, mode: "light" | "dark" = "light"): string {
  const dual = new RegExp(
    `${name}\\s*:\\s*light-dark\\((#[0-9a-fA-F]{3,8})\\s*,\\s*(#[0-9a-fA-F]{3,8})\\)`,
  ).exec(body);
  if (dual) return (mode === "light" ? dual[1] : dual[2]).toLowerCase();
  const m = new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`).exec(body);
  if (!m) throw new Error(`token not found: ${name}`);
  return m[1].toLowerCase();
}

describe("renderer canvas palette mirrors app.css", () => {
  const root = blockBody(":root");

  it("light live/ghost match --live/--ghost", () => {
    expect(COLORS_LIGHT.live).toBe(token(root, "--live", "light"));
    expect(COLORS_LIGHT.ghost).toBe(token(root, "--ghost", "light"));
  });

  it("dark live/ghost match --live/--ghost", () => {
    expect(COLORS_DARK.live).toBe(token(root, "--live", "dark"));
    expect(COLORS_DARK.ghost).toBe(token(root, "--ghost", "dark"));
  });
});

describe("race-card machine palette mirrors app.css", () => {
  const root = blockBody(":root");

  it("light machine hues match --m-*", () => {
    expect(MACHINE_HEX.light.rower).toBe(token(root, "--m-rower", "light"));
    expect(MACHINE_HEX.light.skierg).toBe(token(root, "--m-skierg", "light"));
    expect(MACHINE_HEX.light.bike).toBe(token(root, "--m-bike", "light"));
  });

  it("dark machine hues match --m-*", () => {
    expect(MACHINE_HEX.dark.rower).toBe(token(root, "--m-rower", "dark"));
    expect(MACHINE_HEX.dark.skierg).toBe(token(root, "--m-skierg", "dark"));
    expect(MACHINE_HEX.dark.bike).toBe(token(root, "--m-bike", "dark"));
  });
});

describe("CourseRenderer stroke pose input", () => {
  const origWindow = globalThis.window;

  beforeEach(() => {
    // @ts-expect-error test stub
    globalThis.window = {
      devicePixelRatio: 1,
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    };
  });

  afterEach(() => {
    globalThis.window = origWindow;
    vi.clearAllMocks();
  });

  function makeCtx(): {
    ctx: CanvasRenderingContext2D;
    setLineDash: ReturnType<typeof vi.fn>;
  } {
    const gradient = { addColorStop: vi.fn() };
    const setLineDash = vi.fn();
    const target: Record<string, unknown> = {
      canvas: { width: 0, height: 0, style: {} },
      createLinearGradient: vi.fn().mockReturnValue(gradient),
      createRadialGradient: vi.fn().mockReturnValue(gradient),
      measureText: vi.fn().mockReturnValue({ width: 72 }),
      setLineDash,
    };
    return {
      ctx: new Proxy(target, {
        get(obj, prop: string) {
          if (!(prop in obj)) obj[prop] = vi.fn();
          return obj[prop];
        },
      }) as unknown as CanvasRenderingContext2D,
      setLineDash,
    };
  }

  function makeState(sport: Sport, withGhost = true): RenderState {
    const distance = sport === "bike" ? 34 : sport === "skierg" ? 16 : 21;
    const timeline = buildStrokeTimeline(
      [
        { t: 2, d: distance * 0.48, pace: 120, spm: 30, watts: 180 },
        { t: 4, d: distance, pace: 118, spm: 31, watts: 195 },
      ],
      sport,
      true,
    );
    const pose = strokePoseAt(timeline, 2.1);
    return {
      frame: {
        t: 2.1,
        d: distance * 0.52,
        pace: 120,
        spm: 30,
        watts: 180,
        hr: 0,
        progress: 0.1,
      },
      distFrac: 0.1,
      totalDistance: 100,
      sport,
      strokePose: pose,
      ...(withGhost
        ? {
            ghost: { distFrac: 0.08, pace: 125, spm: 28, label: "PB" },
            ghostStrokePose: pose,
          }
        : {}),
    };
  }

  function expectFiniteDrawing(ctx: CanvasRenderingContext2D) {
    const methods = [
      "arc",
      "arcTo",
      "ellipse",
      "fillRect",
      "lineTo",
      "moveTo",
      "quadraticCurveTo",
      "scale",
      "translate",
    ] as const;
    for (const method of methods) {
      const calls = (ctx[method] as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      for (const call of calls) {
        for (const value of call) {
          if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
        }
      }
    }
  }

  function copiedCalls(ctx: CanvasRenderingContext2D, method: keyof CanvasRenderingContext2D) {
    return (
      ctx[method] as unknown as {
        mock: { calls: unknown[][] };
      }
    ).mock.calls.map((call) => call.map((value) => (Array.isArray(value) ? [...value] : value)));
  }

  it.each(["rower", "skierg", "bike"] as const)(
    "renders data-derived live and ghost poses for %s",
    (sport) => {
      const { ctx, setLineDash } = makeCtx();
      const canvas = {
        getContext: (kind: string) => (kind === "2d" ? ctx : null),
      } as unknown as HTMLCanvasElement;
      const renderer = new CourseRenderer(canvas);
      renderer.resize(640, 180);

      expect(() => renderer.render(makeState(sport), true, "light")).not.toThrow();
      expectFiniteDrawing(ctx);
      if (sport === "rower") expect(setLineDash).not.toHaveBeenCalled();
      else expect(setLineDash).toHaveBeenCalled();
    },
  );

  it("emits catch particles at the solved row blade and ski basket sides", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const avatarX = 58 + (640 - 30 - 58) * 0.1;

    for (const [sport, expectedOffset] of [
      ["rower", -22],
      ["skierg", 11],
    ] as const) {
      const { ctx } = makeCtx();
      const canvas = {
        getContext: (kind: string) => (kind === "2d" ? ctx : null),
      } as unknown as HTMLCanvasElement;
      const timeline = buildStrokeTimeline(
        [
          { t: 2, d: 10, pace: 120, spm: 30, watts: 180 },
          { t: 4, d: 20, pace: 118, spm: 31, watts: 195 },
        ],
        sport,
        true,
      );
      const renderer = new CourseRenderer(canvas);
      renderer.resize(640, 180);
      renderer.render(
        { ...makeState(sport, false), strokePose: strokePoseAt(timeline, 1.99) },
        true,
      );
      renderer.render(
        { ...makeState(sport, false), strokePose: strokePoseAt(timeline, 2.01) },
        true,
      );

      const liveSplash = (
        renderer as unknown as {
          liveSplash: { alive: number; x: Float32Array };
        }
      ).liveSplash;
      expect(liveSplash.alive).toBeGreaterThan(0);
      expect(liveSplash.x[0] - avatarX).toBeCloseTo(expectedOffset, 4);
    }
  });

  it("keeps BikeErg wheel roll distance-driven while cadence moves the cranks", () => {
    const { ctx } = makeCtx();
    const canvas = {
      getContext: (kind: string) => (kind === "2d" ? ctx : null),
    } as unknown as HTMLCanvasElement;
    const renderer = new CourseRenderer(canvas);
    renderer.resize(640, 180);
    const testRenderer = renderer as unknown as {
      drawAvatar(options: Record<string, unknown>): void;
      liveSplash: unknown;
    };
    const timeline = buildStrokeTimeline(
      [
        { t: 2, d: 10, pace: 120, spm: 80, watts: 180 },
        { t: 4, d: 20, pace: 118, spm: 95, watts: 195 },
      ],
      "bike",
      true,
    );
    const poseA = strokePoseAt(timeline, 0.4);
    const poseB = strokePoseAt(timeline, 1.4);
    const base = {
      x: 200,
      y: 100,
      accent: "#123456",
      phase: poseA.phase,
      meters: 12,
      pose: poseA,
      spm: 80,
      isYou: true,
      sport: "bike",
      label: "bike",
      splash: testRenderer.liveSplash,
    };

    testRenderer.drawAvatar(base);
    const sameDistanceA = copiedCalls(ctx, "lineTo").slice(0, 8);
    (ctx.lineTo as unknown as ReturnType<typeof vi.fn>).mockClear();
    testRenderer.drawAvatar({ ...base, phase: poseB.phase, pose: poseB, spm: 95 });
    const sameDistanceB = copiedCalls(ctx, "lineTo").slice(0, 8);
    expect(sameDistanceB).toEqual(sameDistanceA);

    (ctx.lineTo as unknown as ReturnType<typeof vi.fn>).mockClear();
    testRenderer.drawAvatar({ ...base, meters: 18 });
    const fartherDistance = copiedCalls(ctx, "lineTo").slice(0, 8);
    expect(fartherDistance).not.toEqual(sameDistanceA);
  });

  it("freezes decorative geometry under the real reduced-motion media query", async () => {
    // @ts-expect-error test stub
    globalThis.window = {
      devicePixelRatio: 1,
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    };
    vi.resetModules();
    const { CourseRenderer: ReducedMotionRenderer } = await import("./renderer");
    const { ctx } = makeCtx();
    const canvas = {
      getContext: (kind: string) => (kind === "2d" ? ctx : null),
    } as unknown as HTMLCanvasElement;
    const renderer = new ReducedMotionRenderer(canvas);
    renderer.resize(640, 180);
    const timeline = buildStrokeTimeline(
      [
        { t: 2, d: 10, pace: 120, spm: 30, watts: 180 },
        { t: 4, d: 20, pace: 118, spm: 31, watts: 195 },
      ],
      "rower",
      true,
    );
    const state = makeState("rower", false);
    const methods = [
      "arc",
      "ellipse",
      "fillRect",
      "lineTo",
      "moveTo",
      "quadraticCurveTo",
      "scale",
      "setLineDash",
      "translate",
    ] as const;

    renderer.render({ ...state, strokePose: strokePoseAt(timeline, 0.4) }, true);
    const firstTrace = Object.fromEntries(
      methods.map((method) => [method, copiedCalls(ctx, method)]),
    );
    for (const method of methods) {
      (ctx[method] as unknown as ReturnType<typeof vi.fn>).mockClear();
    }
    renderer.render({ ...state, strokePose: strokePoseAt(timeline, 2.8) }, true);
    const secondTrace = Object.fromEntries(
      methods.map((method) => [method, copiedCalls(ctx, method)]),
    );

    expect(secondTrace).toEqual(firstTrace);
  });

  it("clears stale ghost particles when the comparison disappears", () => {
    const { ctx } = makeCtx();
    const canvas = {
      getContext: (kind: string) => (kind === "2d" ? ctx : null),
    } as unknown as HTMLCanvasElement;
    const renderer = new CourseRenderer(canvas);
    renderer.resize(640, 180);
    const ghostPool = (
      renderer as unknown as {
        ghostSplash: {
          alive: number;
          spawn: (...args: number[]) => void;
        };
      }
    ).ghostSplash;
    ghostPool.spawn(10, 10, 0, 0, 0, 0, 1, 1);
    expect(ghostPool.alive).toBe(1);

    renderer.render(makeState("rower", false), false, "dark");
    expect(ghostPool.alive).toBe(0);
  });
});
