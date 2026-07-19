import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Sport } from "../types";
import {
  ATHLETE_TOP_CLEARANCE_2D,
  COLORS_DARK,
  COLORS_LIGHT,
  CourseRenderer,
  poleAngleAtContact,
  solveBikeRotationPoint2D,
  solveRigidOar2D,
  type RenderState,
  type RigidOar2D,
} from "./renderer";
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

describe("2D procedural athlete geometry", () => {
  it("keeps the row handle, oarlock, shaft, and blade collinear", () => {
    const oar: RigidOar2D = {
      handleX: 0,
      handleY: 0,
      bladeRootX: 0,
      bladeRootY: 0,
      bladeTipX: 0,
      bladeTipY: 0,
    };
    const lockX = 12;
    const lockY = 7;
    solveRigidOar2D(lockX, lockY, 1.17, 6.7, 13.3, 3.8, oar);

    expect(Math.hypot(oar.handleX - lockX, oar.handleY - lockY)).toBeCloseTo(6.7, 8);
    expect(Math.hypot(oar.bladeRootX - lockX, oar.bladeRootY - lockY)).toBeCloseTo(13.3, 8);
    expect(Math.hypot(oar.bladeTipX - oar.bladeRootX, oar.bladeTipY - oar.bladeRootY)).toBeCloseTo(
      3.8,
      8,
    );
    const shaftX = oar.bladeRootX - oar.handleX;
    const shaftY = oar.bladeRootY - oar.handleY;
    const bladeX = oar.bladeTipX - oar.bladeRootX;
    const bladeY = oar.bladeTipY - oar.bladeRootY;
    expect(shaftX * bladeY - shaftY * bladeX).toBeCloseTo(0, 8);
  });

  it("reserves extra HUD clearance for the helmeted BikeErg silhouette", () => {
    expect(ATHLETE_TOP_CLEARANCE_2D.bike).toBeGreaterThan(ATHLETE_TOP_CLEARANCE_2D.skierg);
    expect(ATHLETE_TOP_CLEARANCE_2D.skierg).toBeGreaterThan(ATHLETE_TOP_CLEARANCE_2D.rower);
    expect(ATHLETE_TOP_CLEARANCE_2D.bike).toBeGreaterThanOrEqual(35);
  });

  it("advances BikeErg wheels and cranks clockwise in the y-down canvas", () => {
    const start = { x: 0, y: 0 };
    const advanced = { x: 0, y: 0 };
    solveBikeRotationPoint2D(20, 30, 5, 0, start);
    solveBikeRotationPoint2D(20, 30, 5, 0.08, advanced);

    // From the three-o'clock position, clockwise motion travels down and left.
    expect(advanced.x).toBeLessThan(start.x);
    expect(advanced.y).toBeGreaterThan(start.y);
  });

  it("keeps BikeErg pedals rigidly opposed on one crankset", () => {
    const near = { x: 0, y: 0 };
    const far = { x: 0, y: 0 };
    const center = { x: 12.5, y: 7.25 };
    const radius = 3.1;
    const angle = 1.17;
    solveBikeRotationPoint2D(center.x, center.y, radius, angle, near);
    solveBikeRotationPoint2D(center.x, center.y, radius, angle + Math.PI, far);

    expect(Math.hypot(near.x - center.x, near.y - center.y)).toBeCloseTo(radius, 10);
    expect(Math.hypot(far.x - center.x, far.y - center.y)).toBeCloseTo(radius, 10);
    expect((near.x + far.x) * 0.5).toBeCloseTo(center.x, 10);
    expect((near.y + far.y) * 0.5).toBeCloseTo(center.y, 10);
  });

  it("keeps a planted SkiErg pole on one continuous ground-contact branch", () => {
    const handY = 94.6;
    const groundY = 100;
    const poleLength = 13.2;
    const before = poleAngleAtContact(handY, groundY, poleLength, Math.PI / 2 - 1e-5, 1);
    const after = poleAngleAtContact(handY, groundY, poleLength, Math.PI / 2 + 1e-5, 1);

    expect(after - before).toBeCloseTo(0, 8);
    expect(Math.cos(before)).toBeGreaterThan(0);
    expect(handY + Math.sin(before) * poleLength).toBeCloseTo(groundY, 8);
    expect(poleAngleAtContact(handY, groundY, poleLength, 2.1, 0)).toBe(2.1);
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
    dashOffsets: number[];
    styles: string[];
    operations: { method: string; args: unknown[] }[];
  } {
    const gradient = { addColorStop: vi.fn() };
    const setLineDash = vi.fn();
    const dashOffsets: number[] = [];
    const styles: string[] = [];
    const operations: { method: string; args: unknown[] }[] = [];
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
          if (!(prop in obj)) {
            obj[prop] = vi.fn((...args: unknown[]) => operations.push({ method: prop, args }));
          }
          return obj[prop];
        },
        set(obj, prop: string, value) {
          if ((prop === "fillStyle" || prop === "strokeStyle") && typeof value === "string") {
            styles.push(value);
          }
          if (prop === "lineDashOffset" && typeof value === "number") dashOffsets.push(value);
          obj[prop] = value;
          return true;
        },
      }) as unknown as CanvasRenderingContext2D,
      setLineDash,
      dashOffsets,
      styles,
      operations,
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

  it("keeps the course scale on a timing rail instead of a full-height graph grid", () => {
    const { ctx, operations } = makeCtx();
    const canvas = {
      getContext: (kind: string) => (kind === "2d" ? ctx : null),
    } as unknown as HTMLCanvasElement;
    const renderer = new CourseRenderer(canvas);
    renderer.resize(640, 300);
    renderer.render(makeState("rower", false), false, "light");

    const hasLegacyGridLine = operations.some((operation, index) => {
      const next = operations[index + 1];
      return (
        operation.method === "moveTo" &&
        next?.method === "lineTo" &&
        operation.args[1] === 10 &&
        next.args[1] === 282
      );
    });
    expect(hasLegacyGridLine).toBe(false);
  });

  it("moves SkiErg and BikeErg dash materials backwards from metres rather than phase", () => {
    for (const sport of ["skierg", "bike"] as const) {
      const { ctx, dashOffsets } = makeCtx();
      const canvas = {
        getContext: (kind: string) => (kind === "2d" ? ctx : null),
      } as unknown as HTMLCanvasElement;
      const renderer = new CourseRenderer(canvas);
      renderer.resize(640, 300);
      const testRenderer = renderer as unknown as {
        drawSkiSurface(options: Record<string, unknown>): void;
        drawBikeSurface(options: Record<string, unknown>): void;
      };
      const drawSurface = (options: Record<string, unknown>) => {
        if (sport === "skierg") testRenderer.drawSkiSurface(options);
        else testRenderer.drawBikeSurface(options);
      };
      const base = {
        startX: 58,
        span: 552,
        y: 200,
        frac: 0.2,
        accent: COLORS_LIGHT.live,
        meters: 12,
        phase: 0.2,
        pace: 120,
        isYou: true,
        nameTab: "YOU",
        padL: 58,
        sport,
      };

      drawSurface(base);
      const first = [...dashOffsets];
      // Canvas lineDashOffset runs opposite to direct x translation. A
      // positive offset here is the visual leftward road/snow motion that
      // agrees with the cyclist's clockwise forward wheel roll.
      expect(first[0]).toBeGreaterThan(0);
      dashOffsets.length = 0;
      drawSurface({ ...base, phase: 4.8 });
      expect(dashOffsets).toEqual(first);

      dashOffsets.length = 0;
      drawSurface({ ...base, meters: 29 });
      expect(dashOffsets).not.toEqual(first);
    }
  });

  it("keeps unique venue landmarks stable across repeating parallax wrap distances", () => {
    for (const sport of ["rower", "skierg", "bike"] as const) {
      const { ctx, operations } = makeCtx();
      const canvas = {
        getContext: (kind: string) => (kind === "2d" ? ctx : null),
      } as unknown as HTMLCanvasElement;
      const renderer = new CourseRenderer(canvas);
      renderer.resize(640, 300);

      const landmarkX = (meters: number) => {
        operations.length = 0;
        const state = makeState(sport, false);
        state.frame = { ...state.frame, d: meters };
        renderer.render(state, false, "light");
        const landmark = operations.find((operation) => {
          if (sport === "rower") {
            return (
              operation.method === "fillRect" &&
              operation.args[2] === 29 &&
              operation.args[3] === 14
            );
          }
          if (sport === "bike") {
            return (
              operation.method === "fillRect" && operation.args[2] === 14 && operation.args[3] === 7
            );
          }
          // The alpine ridgeline is intentionally smooth rather than a
          // faceted triangle, so use the fixed timing cabin as the landmark.
          return (
            operation.method === "fillRect" && operation.args[2] === 70 && operation.args[3] === 22
          );
        });
        expect(landmark, `${sport} landmark not drawn`).toBeDefined();
        return landmark?.args[0];
      };

      const wrapDistance = sport === "rower" ? 1_000 : sport === "skierg" ? 1_200 : 1_100;
      expect(landmarkX(wrapDistance)).toBe(landmarkX(0));
    }
  });

  it.each(["rower", "skierg", "bike"] as const)(
    "models %s with near/far anatomy and semantic kit colours",
    (sport) => {
      const { ctx, styles } = makeCtx();
      const canvas = {
        getContext: (kind: string) => (kind === "2d" ? ctx : null),
      } as unknown as HTMLCanvasElement;
      const renderer = new CourseRenderer(canvas);
      renderer.resize(640, 180);
      const testRenderer = renderer as unknown as {
        drawAvatar(options: Record<string, unknown>): void;
        liveSplash: unknown;
      };
      const state = makeState(sport, false);

      testRenderer.drawAvatar({
        x: 200,
        y: 100,
        accent: COLORS_LIGHT.live,
        phase: state.strokePose.phase,
        meters: state.frame.d,
        pose: state.strokePose,
        spm: state.frame.spm,
        isYou: true,
        sport,
        label: sport,
        splash: testRenderer.liveSplash,
      });

      expect(styles.filter((style) => style === COLORS_LIGHT.skin).length).toBeGreaterThanOrEqual(
        2,
      );
      expect(
        styles.filter((style) => style === COLORS_LIGHT.skinShade).length,
      ).toBeGreaterThanOrEqual(2);
      expect(styles).toContain(COLORS_LIGHT.hair);
      expect(styles).toContain(COLORS_LIGHT.shoe);
      expect(
        (ctx.ellipse as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
      ).toBeGreaterThan(1);
      expect(
        (ctx.quadraticCurveTo as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
      ).toBeGreaterThanOrEqual(6);
    },
  );

  it("grounds each sport with its own contact footprint instead of one generic pod shadow", () => {
    const expectedContact: Record<Sport, readonly [number, number]> = {
      rower: [31, 3.2],
      skierg: [8.3, 1.35],
      bike: [7.2, 1.2],
    };
    const close = (actual: unknown, expected: number) =>
      typeof actual === "number" && Math.abs(actual - expected) < 1e-8;

    for (const sport of ["rower", "skierg", "bike"] as const) {
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
      const state = makeState(sport, false);
      testRenderer.drawAvatar({
        x: 200,
        y: 100,
        accent: COLORS_LIGHT.live,
        phase: state.strokePose.phase,
        meters: state.frame.d,
        pose: state.strokePose,
        spm: state.frame.spm,
        isYou: true,
        sport,
        label: sport,
        splash: testRenderer.liveSplash,
      });

      const [radiusX, radiusY] = expectedContact[sport];
      const contactEllipses = copiedCalls(ctx, "ellipse").filter(
        ([, , actualX, actualY]) => close(actualX, radiusX) && close(actualY, radiusY),
      );
      expect(contactEllipses.length).toBeGreaterThanOrEqual(sport === "rower" ? 1 : 2);
    }
  });

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

  it("layers the BikeErg far drive behind the frame and near drive above it", () => {
    const { ctx, operations } = makeCtx();
    const canvas = {
      getContext: (kind: string) => (kind === "2d" ? ctx : null),
    } as unknown as HTMLCanvasElement;
    const renderer = new CourseRenderer(canvas);
    renderer.resize(640, 180);
    const testRenderer = renderer as unknown as {
      drawAvatar(options: Record<string, unknown>): void;
      liveSplash: unknown;
    };
    const state = makeState("bike", false);
    const x = 200;
    const y = 100;
    const wheelY = y - 5.4;
    const bbY = wheelY + 1;
    const crankAngle = ((state.strokePose.phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const near = { x: 0, y: 0 };
    const far = { x: 0, y: 0 };
    solveBikeRotationPoint2D(x, bbY, 3.1, crankAngle, near);
    solveBikeRotationPoint2D(x, bbY, 3.1, crankAngle + Math.PI, far);

    testRenderer.drawAvatar({
      x,
      y,
      accent: "#123456",
      phase: state.strokePose.phase,
      meters: 12,
      pose: state.strokePose,
      spm: 80,
      isYou: true,
      sport: "bike",
      label: "bike",
      splash: testRenderer.liveSplash,
    });

    const close = (actual: unknown, expected: number) =>
      typeof actual === "number" && Math.abs(actual - expected) < 1e-8;
    const segmentIndices = (x1: number, y1: number, x2: number, y2: number) => {
      const indices: number[] = [];
      for (let index = 0; index < operations.length - 1; index++) {
        const move = operations[index];
        const line = operations[index + 1];
        if (
          move.method === "moveTo" &&
          line.method === "lineTo" &&
          close(move.args[0], x1) &&
          close(move.args[1], y1) &&
          close(line.args[0], x2) &&
          close(line.args[1], y2)
        ) {
          indices.push(index);
        }
      }
      return indices;
    };

    const farCrank = segmentIndices(x, bbY, far.x, far.y);
    const farPedal = segmentIndices(far.x - 1.25, far.y + 0.12, far.x + 1.25, far.y - 0.12);
    const frame = segmentIndices(x - 8.5, wheelY, x, bbY);
    const nearCrank = segmentIndices(x, bbY, near.x, near.y);
    const nearPedals = segmentIndices(near.x - 1.25, near.y + 0.12, near.x + 1.25, near.y - 0.12);

    expect(farCrank).toHaveLength(1);
    expect(farPedal).toHaveLength(1);
    expect(frame.length).toBeGreaterThanOrEqual(2);
    expect(nearCrank).toHaveLength(1);
    expect(nearPedals).toHaveLength(2);
    expect(farCrank[0]).toBeLessThan(farPedal[0]);
    expect(farPedal[0]).toBeLessThan(frame[0]);
    expect(frame.at(-1)!).toBeLessThan(nearCrank[0]);
    expect(nearCrank[0]).toBeLessThan(nearPedals[0]);
    // The second platform is the final cleat cap, painted over the near shoe.
    expect(nearPedals[0]).toBeLessThan(nearPedals[1]);

    const pedalCaps = operations.filter(
      ({ method, args }) =>
        method === "arc" &&
        ((close(args[0], near.x) && close(args[1], near.y)) ||
          (close(args[0], far.x) && close(args[1], far.y))),
    );
    expect(pedalCaps.length).toBeGreaterThanOrEqual(4);

    const hasLimbEndpointAt = (point: { x: number; y: number }) =>
      operations.some((operation, index) => {
        const next = operations[index + 1];
        return (
          operation.method === "quadraticCurveTo" &&
          next?.method === "lineTo" &&
          close(((operation.args[2] as number) + (next.args[0] as number)) * 0.5, point.x) &&
          close(((operation.args[3] as number) + (next.args[1] as number)) * 0.5, point.y)
        );
      });
    // The curved distal edge of both tapered shins still averages to the
    // exact pedal anchor; the softened limb silhouette must not loosen contact.
    expect(hasLimbEndpointAt(far)).toBe(true);
    expect(hasLimbEndpointAt(near)).toBe(true);

    const barX = x + 8.5 - 1.2;
    const barY = wheelY - 6.4;
    const handContacts = operations.filter(
      ({ method, args }) =>
        method === "arc" &&
        (close(args[2], 0.94) || close(args[2], 1.02)) &&
        ((close(args[0], barX - 0.45) && close(args[1], barY - 0.35)) ||
          (close(args[0], barX) && close(args[1], barY))),
    );
    expect(handContacts).toHaveLength(2);
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
    const wheelCenters = [
      [191.5, 94.6],
      [208.5, 94.6],
    ] as const;
    const spokeEndpoints = () =>
      copiedCalls(ctx, "lineTo")
        .filter((call) => {
          const px = call[0] as number;
          const py = call[1] as number;
          return wheelCenters.some(
            ([cx, cy]) => Math.abs(Math.hypot(px - cx, py - cy) - 5.4) < 1e-6,
          );
        })
        .map((call) => [call[0], call[1]]);

    testRenderer.drawAvatar(base);
    const sameDistanceA = spokeEndpoints();
    expect(sameDistanceA).toHaveLength(12);
    (ctx.lineTo as unknown as ReturnType<typeof vi.fn>).mockClear();
    testRenderer.drawAvatar({ ...base, phase: poseB.phase, pose: poseB, spm: 95 });
    const sameDistanceB = spokeEndpoints();
    expect(sameDistanceB).toEqual(sameDistanceA);

    (ctx.lineTo as unknown as ReturnType<typeof vi.fn>).mockClear();
    testRenderer.drawAvatar({ ...base, meters: 18 });
    const fartherDistance = spokeEndpoints();
    expect(fartherDistance).not.toEqual(sameDistanceA);
  });

  it("breaks quarter-turn wheel aliasing with clockwise asymmetric chevrons", () => {
    const { ctx, operations } = makeCtx();
    const canvas = {
      getContext: (kind: string) => (kind === "2d" ? ctx : null),
    } as unknown as HTMLCanvasElement;
    const renderer = new CourseRenderer(canvas);
    renderer.resize(640, 180);
    const testRenderer = renderer as unknown as {
      drawAvatar(options: Record<string, unknown>): void;
      liveSplash: unknown;
    };
    const state = makeState("bike", false);
    const x = 200;
    const y = 100;
    const radius = 5.4;
    const wheelY = y - radius;
    const wheelCenters = [
      [x - 8.5, wheelY],
      [x + 8.5, wheelY],
    ] as const;
    const meters = 12;
    const close = (actual: unknown, expected: number) =>
      typeof actual === "number" && Math.abs(actual - expected) < 1e-8;
    const drawAt = (distance: number) =>
      testRenderer.drawAvatar({
        x,
        y,
        accent: "#123456",
        phase: state.strokePose.phase,
        meters: distance,
        pose: state.strokePose,
        spm: 80,
        isYou: true,
        sport: "bike",
        label: "bike",
        splash: testRenderer.liveSplash,
      });
    const markerCenters = () =>
      copiedCalls(ctx, "arc")
        .filter(
          ([markerX, markerY, markerRadius]) =>
            close(markerRadius, 0.58) &&
            wheelCenters.some(
              ([centerX, centerY]) =>
                Math.abs(
                  Math.hypot((markerX as number) - centerX, (markerY as number) - centerY) -
                    radius * 0.82,
                ) < 1e-8,
            ),
        )
        .map(([markerX, markerY]) => [markerX as number, markerY as number]);

    drawAt(meters);
    const initialMarkers = markerCenters();
    expect(initialMarkers).toHaveLength(2);

    // Both sides of each chevron converge in the positive-angle tangent,
    // which is clockwise in Canvas's y-down coordinate system.
    for (let wheel = 0; wheel < wheelCenters.length; wheel++) {
      const [centerX, centerY] = wheelCenters[wheel];
      const [markerX, markerY] = initialMarkers[wheel];
      const radialX = (markerX - centerX) / (radius * 0.82);
      const radialY = (markerY - centerY) / (radius * 0.82);
      const tangentX = -radialY;
      const tangentY = radialX;
      const tipX = markerX + tangentX * 0.62;
      const tipY = markerY + tangentY * 0.62;
      const chevronSides = operations.filter((operation, index) => {
        const next = operations[index + 1];
        return (
          operation.method === "moveTo" &&
          next?.method === "lineTo" &&
          close(next.args[0], tipX) &&
          close(next.args[1], tipY)
        );
      });
      expect(chevronSides).toHaveLength(2);
      for (const side of chevronSides) {
        const startAlongTangent =
          ((side.args[0] as number) - markerX) * tangentX +
          ((side.args[1] as number) - markerY) * tangentY;
        expect(startAlongTangent).toBeCloseTo(-1.15, 8);
      }
    }

    (ctx.arc as unknown as ReturnType<typeof vi.fn>).mockClear();
    drawAt(meters + (Math.PI / 2) * 0.34);
    const quarterTurnMarkers = markerCenters();
    expect(quarterTurnMarkers).toHaveLength(2);
    // Six identical spokes repeat after PI / 3; one tracked marker does not.
    expect(quarterTurnMarkers).not.toEqual(initialMarkers);
  });

  it("paints grounded RowErg and SkiErg equipment hardware", () => {
    const drawSport = (sport: "rower" | "skierg") => {
      const { ctx, operations } = makeCtx();
      const canvas = {
        getContext: (kind: string) => (kind === "2d" ? ctx : null),
      } as unknown as HTMLCanvasElement;
      const renderer = new CourseRenderer(canvas);
      renderer.resize(640, 180);
      const testRenderer = renderer as unknown as {
        drawAvatar(options: Record<string, unknown>): void;
        liveSplash: unknown;
      };
      const state = makeState(sport, false);
      testRenderer.drawAvatar({
        x: 200,
        y: 100,
        accent: "#123456",
        phase: state.strokePose.phase,
        meters: 12,
        pose: state.strokePose,
        spm: 32,
        isYou: true,
        sport,
        label: sport,
        splash: testRenderer.liveSplash,
      });
      return { ctx, operations };
    };
    const close = (actual: unknown, expected: number) =>
      typeof actual === "number" && Math.abs(actual - expected) < 1e-8;

    const row = drawSport("rower");
    const footplate = row.operations.some((operation, index) => {
      const next = row.operations[index + 1];
      return (
        operation.method === "moveTo" &&
        next?.method === "lineTo" &&
        typeof operation.args[0] === "number" &&
        typeof next.args[0] === "number" &&
        close(operation.args[0], next.args[0] as number) &&
        typeof operation.args[1] === "number" &&
        typeof next.args[1] === "number" &&
        Math.abs((next.args[1] as number) - (operation.args[1] as number) - 3.3) < 1e-8
      );
    });
    expect(footplate).toBe(true);
    const rowArcs = copiedCalls(row.ctx, "arc");
    const farOarlock = rowArcs.find(([, , radius]) => close(radius, 0.86));
    expect(farOarlock).toBeDefined();
    const nearOarlock = rowArcs.find(
      ([lockX, , radius]) => close(radius, 0.96) && close(lockX, farOarlock![0] as number),
    );
    expect(nearOarlock).toBeDefined();

    const ski = drawSport("skierg");
    const skiRails = ski.operations.filter((operation, index) => {
      const next = ski.operations[index + 1];
      return (
        operation.method === "moveTo" &&
        next?.method === "lineTo" &&
        typeof operation.args[0] === "number" &&
        typeof operation.args[1] === "number" &&
        typeof next.args[0] === "number" &&
        typeof next.args[1] === "number" &&
        close(operation.args[1], 100.35) &&
        close(next.args[1], 100.35) &&
        Math.abs((next.args[0] as number) - (operation.args[0] as number) - 5.75) < 1e-8
      );
    });
    expect(skiRails).toHaveLength(2);
    expect((skiRails[1].args[0] as number) - (skiRails[0].args[0] as number)).toBeCloseTo(7.6, 8);
    const basketHubs = copiedCalls(ski.ctx, "arc").filter(([, , radius]) => close(radius, 0.48));
    expect(basketHubs).toHaveLength(2);
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
