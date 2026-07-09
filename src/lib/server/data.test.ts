import { describe, expect, it, vi, beforeEach } from "vite-plus/test";

// Mock all heavy dependencies so we only exercise the data.ts orchestration logic.
vi.mock("./concept2", () => ({ Concept2Client: vi.fn() }));
vi.mock("./config", () => ({ getConfig: vi.fn(() => ({})) }));
vi.mock("./session", () => ({
  openSession: vi.fn(),
  SESSION_COOKIE: "rp_session",
  TOKEN_COOKIE: "rp_tok",
  destroySession: vi.fn(),
  setHomeTimezone: vi.fn(),
  getHomeTimezone: vi.fn(),
}));
vi.mock("./tokenCrypto", () => ({ openToken: vi.fn() }));

import {
  loadAnnualGoal,
  loadDashboardAggregates,
  loadWorkoutDetail,
  loadWorkoutList,
  loadWorkouts,
  resetDemoWorkoutTagStore,
  saveAnnualGoal,
  syncWorkouts,
} from "./data";
import { Concept2Client } from "./concept2";
import { openSession } from "./session";
import { openToken } from "./tokenCrypto";
import { mockWorkouts } from "../mockData";
import type { Workout } from "../types";

type Mock = ReturnType<typeof vi.fn>;

function mockConcept2Client(methods: Record<string, unknown>) {
  (Concept2Client as unknown as Mock).mockImplementation(function () {
    return methods;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function demoEvent(extras: Record<string, unknown> = {}): any {
  return {
    locals: { demo: true, user: null },
    platform: { env: {} },
    url: new URL("http://localhost/"),
    cookies: { get: () => undefined, set: vi.fn() },
    ...extras,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function authedEvent(extras: Record<string, unknown> = {}): any {
  const base = {
    locals: { demo: false, user: { id: 7 }, personal: true },
    platform: { env: { SESSION_SECRET: "test-secret-that-is-32-chars!!" } },
    url: new URL("http://localhost/"),
    cookies: { get: () => "sealed-session-or-token", set: vi.fn(), delete: vi.fn() },
  };
  const platform = extras.platform as
    | { env?: Record<string, unknown>; context?: unknown }
    | undefined;
  return {
    ...base,
    ...extras,
    locals: { ...base.locals, ...(extras.locals as Record<string, unknown> | undefined) },
    platform: {
      ...base.platform,
      ...platform,
      env: { ...base.platform.env, ...platform?.env },
    },
    cookies: {
      ...base.cookies,
      ...(extras.cookies as Record<string, unknown> | undefined),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (Concept2Client as unknown as Mock).mockReset();
  (openSession as unknown as Mock).mockReset();
  (openToken as unknown as Mock).mockReset();
  resetDemoWorkoutTagStore();
  (openSession as unknown as Mock).mockResolvedValue({
    user: { id: 7, username: "athlete" },
    personal: true,
    tokens: { accessToken: "", refreshToken: "", expiresAt: 0, scope: "" },
  });
  (openToken as unknown as Mock).mockResolvedValue("personal-token");
});

// ---------------------------------------------------------------------------
// loadWorkouts — demo mode
// ---------------------------------------------------------------------------

describe("loadWorkouts — demo mode", () => {
  it("returns mock workouts without hitting the API", async () => {
    const result = await loadWorkouts(demoEvent());
    expect(result).toEqual(mockWorkouts());
  });
});

// ---------------------------------------------------------------------------
// loadWorkouts — authenticated (live API)
// ---------------------------------------------------------------------------

describe("loadWorkouts — authenticated live API", () => {
  const liveWorkout: Workout = {
    id: 5002,
    date: "2026-06-02 06:00:00",
    sport: "rower",
    distance: 5000,
    time: 1260,
    pace: 126,
    hasStrokeData: false,
  };

  it("fetches from the Concept2 API for authenticated users", async () => {
    const listWorkouts = vi.fn().mockResolvedValue([liveWorkout]);
    mockConcept2Client({ listWorkouts });

    await expect(loadWorkouts(authedEvent())).resolves.toEqual([liveWorkout]);
    expect(listWorkouts).toHaveBeenCalledOnce();
  });

  it("throws 401 when session cannot be opened", async () => {
    (openSession as unknown as Mock).mockResolvedValue(null);

    await expect(loadWorkouts(authedEvent())).rejects.toMatchObject({ status: 401 });
  });
});

// ---------------------------------------------------------------------------
// loadWorkoutList — authenticated (live API + JS filter)
// ---------------------------------------------------------------------------

describe("loadWorkoutList — authenticated", () => {
  const q = { sort: "date" as const, dir: "desc" as const };
  const liveWorkout: Workout = {
    id: 5101,
    date: "2026-06-03 06:00:00",
    sport: "rower",
    distance: 2000,
    time: 480,
    pace: 120,
    hasStrokeData: false,
  };

  it("fetches from the API and filters in JS", async () => {
    const listWorkouts = vi.fn().mockResolvedValue([liveWorkout]);
    mockConcept2Client({ listWorkouts });

    await expect(loadWorkoutList(authedEvent(), q)).resolves.toEqual([liveWorkout]);
    expect(listWorkouts).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// loadWorkoutDetail — demo mode
// ---------------------------------------------------------------------------

describe("loadWorkoutDetail — demo mode", () => {
  it("returns a mock workout detail for a known id", async () => {
    const detail = await loadWorkoutDetail(demoEvent(), 1001);
    expect(detail.id).toBe(1001);
  });

  it("throws a 404 for an unknown demo id", async () => {
    await expect(loadWorkoutDetail(demoEvent(), 99999)).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------
// loadWorkoutDetail — authenticated (live API)
// ---------------------------------------------------------------------------

describe("loadWorkoutDetail — authenticated", () => {
  const detail: Workout = {
    id: 6001,
    date: "2026-06-04 06:00:00",
    sport: "rower",
    distance: 2000,
    time: 480,
    pace: 120,
    hasStrokeData: true,
  };

  it("fetches from the Concept2 API", async () => {
    const getWorkout = vi.fn().mockResolvedValue(detail);
    mockConcept2Client({ getWorkout });

    await expect(loadWorkoutDetail(authedEvent(), 6001)).resolves.toEqual(detail);
    expect(getWorkout).toHaveBeenCalledWith(6001);
  });
});

// ---------------------------------------------------------------------------
// loadDashboardAggregates — demo mode
// ---------------------------------------------------------------------------

describe("loadDashboardAggregates — demo mode", () => {
  it("returns null in demo mode", async () => {
    expect(await loadDashboardAggregates(demoEvent())).toBeNull();
  });
});

describe("loadDashboardAggregates — no user", () => {
  it("returns null when user is not authenticated", async () => {
    const event = authedEvent({ locals: { demo: false, user: null } });
    expect(await loadDashboardAggregates(event)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadAnnualGoal — demo mode
// ---------------------------------------------------------------------------

describe("loadAnnualGoal — demo mode", () => {
  it("returns the default goal when no cookie is set", async () => {
    const goal = await loadAnnualGoal(demoEvent(), 2026);
    expect(goal.year).toBe(2026);
    expect(goal.kind).toBe("meters");
  });

  it("returns a stored goal from the cookie", async () => {
    const cookieVal = JSON.stringify({ year: 2026, kind: "hours", target: 200 });
    const event = demoEvent({ cookies: { get: () => cookieVal, set: vi.fn() } });
    const goal = await loadAnnualGoal(event, 2026);
    expect(goal.kind).toBe("hours");
    expect(goal.target).toBe(200);
  });

  it("ignores a cookie for a different year and returns the default", async () => {
    const cookieVal = JSON.stringify({ year: 2025, kind: "hours", target: 100 });
    const event = demoEvent({ cookies: { get: () => cookieVal, set: vi.fn() } });
    const goal = await loadAnnualGoal(event, 2026);
    expect(goal.year).toBe(2026);
    expect(goal.kind).toBe("meters");
  });
});

// ---------------------------------------------------------------------------
// saveAnnualGoal — demo mode
// ---------------------------------------------------------------------------

describe("saveAnnualGoal — demo mode", () => {
  it("serializes the goal to a cookie", async () => {
    const setCookie = vi.fn();
    const event = demoEvent({ cookies: { get: () => undefined, set: setCookie } });
    await saveAnnualGoal(event, { year: 2026, kind: "meters", target: 500_000 });
    expect(setCookie).toHaveBeenCalledOnce();
    const [cookieName, cookieValue] = setCookie.mock.calls[0];
    expect(cookieName).toBe("annual_goal");
    const parsed = JSON.parse(cookieValue);
    expect(parsed.target).toBe(500_000);
  });
});

// ---------------------------------------------------------------------------
// syncWorkouts — authenticated (live API)
// ---------------------------------------------------------------------------

describe("syncWorkouts", () => {
  const workout: Workout = {
    id: 6001,
    date: "2026-06-04 06:00:00",
    sport: "rower",
    distance: 2000,
    time: 480,
    pace: 120,
    hasStrokeData: false,
  };

  it("fetches workouts from the API and returns them", async () => {
    const listWorkouts = vi.fn().mockResolvedValue([workout]);
    mockConcept2Client({ listWorkouts });

    const result = await syncWorkouts(authedEvent());
    expect(result).toMatchObject({ added: 1, total: 1, workouts: [workout] });
    expect(listWorkouts).toHaveBeenCalledOnce();
  });

  it("throws 401 when not authenticated", async () => {
    (openSession as unknown as Mock).mockResolvedValue(null);

    await expect(syncWorkouts(authedEvent())).rejects.toMatchObject({ status: 401 });
  });
});
