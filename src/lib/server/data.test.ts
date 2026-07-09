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
vi.mock("./logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn() }),
}));

import {
  loadAnnualGoal,
  loadDashboardAggregates,
  loadHomeTimezone,
  loadWorkoutDetail,
  loadWorkoutList,
  loadWorkouts,
  resetDemoWorkoutTagStore,
  saveAnnualGoal,
  saveHomeTimezone,
  syncWorkouts,
} from "./data";
import { Concept2Client } from "./concept2";
import { openSession, getHomeTimezone, setHomeTimezone } from "./session";
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
  (getHomeTimezone as unknown as Mock).mockReset();
  (setHomeTimezone as unknown as Mock).mockReset();
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

  it("throws 401 when session cannot be opened", async () => {
    (openSession as unknown as Mock).mockResolvedValue(null);

    await expect(loadWorkoutDetail(authedEvent(), 6001)).rejects.toMatchObject({ status: 401 });
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
// loadDashboardAggregates — authenticated (live API + JS aggregation)
// ---------------------------------------------------------------------------

describe("loadDashboardAggregates — authenticated", () => {
  const rowerWorkout: Workout = {
    id: 6001,
    date: "2026-06-04 06:00:00",
    sport: "rower",
    distance: 2000,
    time: 480,
    pace: 120,
    hasStrokeData: false,
  };
  const rowerWorkout2: Workout = {
    id: 6002,
    date: "2026-06-05 06:00:00",
    sport: "rower",
    distance: 5000,
    time: 1250,
    pace: 125,
    hasStrokeData: false,
  };
  const bikeWorkout: Workout = {
    id: 6003,
    date: "2026-06-06 06:00:00",
    sport: "bike",
    distance: 10000,
    time: 1800,
    pace: 90,
    hasStrokeData: false,
  };

  it("computes per-sport aggregates from live workout data", async () => {
    const listWorkouts = vi.fn().mockResolvedValue([rowerWorkout, rowerWorkout2, bikeWorkout]);
    mockConcept2Client({ listWorkouts });

    const result = await loadDashboardAggregates(authedEvent());
    expect(result).not.toBeNull();
    const { bySport } = result!;
    expect(bySport).toHaveLength(2);

    const rower = bySport.find((s) => s.sport === "rower")!;
    expect(rower.sessions).toBe(2);
    expect(rower.distance).toBe(7000);
    expect(rower.time).toBe(1730);
    expect(rower.bestPace).toBe(120);
    expect(rower.longest).toBe(5000);

    const bike = bySport.find((s) => s.sport === "bike")!;
    expect(bike.sessions).toBe(1);
    expect(bike.distance).toBe(10000);
  });

  it("computes PBs per standard distance", async () => {
    const pbWorkout: Workout = {
      id: 7001,
      date: "2026-06-01 06:00:00",
      sport: "rower",
      distance: 2000,
      time: 400, // faster
      pace: 100,
      hasStrokeData: false,
    };
    const slowerWorkout: Workout = {
      id: 7002,
      date: "2026-06-02 06:00:00",
      sport: "rower",
      distance: 2000,
      time: 480, // slower
      pace: 120,
      hasStrokeData: false,
    };
    const listWorkouts = vi.fn().mockResolvedValue([pbWorkout, slowerWorkout]);
    mockConcept2Client({ listWorkouts });

    const result = await loadDashboardAggregates(authedEvent());
    expect(result).not.toBeNull();
    expect(result!.pbs).toHaveLength(1);
    expect(result!.pbs[0]).toMatchObject({
      distance: 2000,
      time: 400,
      sport: "rower",
    });
  });

  it("returns null when API returns empty list", async () => {
    const listWorkouts = vi.fn().mockResolvedValue([]);
    mockConcept2Client({ listWorkouts });

    expect(await loadDashboardAggregates(authedEvent())).toBeNull();
  });

  it("returns null when API call fails (graceful degradation)", async () => {
    const listWorkouts = vi.fn().mockRejectedValue(new Error("API down"));
    mockConcept2Client({ listWorkouts });

    expect(await loadDashboardAggregates(authedEvent())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadHomeTimezone
// ---------------------------------------------------------------------------

describe("loadHomeTimezone", () => {
  it("returns undefined in demo mode", async () => {
    expect(await loadHomeTimezone(demoEvent())).toBeUndefined();
  });

  it("returns undefined when SESSION_SECRET is missing", async () => {
    const event = authedEvent({ platform: { env: { SESSION_SECRET: undefined } } });
    expect(await loadHomeTimezone(event)).toBeUndefined();
  });

  it("returns undefined when session cookie is missing", async () => {
    const event = authedEvent({ cookies: { get: () => undefined } });
    expect(await loadHomeTimezone(event)).toBeUndefined();
  });

  it("returns undefined when session cannot be opened", async () => {
    (openSession as unknown as Mock).mockResolvedValue(null);
    expect(await loadHomeTimezone(authedEvent())).toBeUndefined();
  });

  it("returns timezone from session when available", async () => {
    (getHomeTimezone as unknown as Mock).mockReturnValue("Asia/Tokyo");
    expect(await loadHomeTimezone(authedEvent())).toBe("Asia/Tokyo");
  });

  it("returns undefined when session has no timezone set", async () => {
    (getHomeTimezone as unknown as Mock).mockReturnValue(undefined);
    expect(await loadHomeTimezone(authedEvent())).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// saveHomeTimezone
// ---------------------------------------------------------------------------

describe("saveHomeTimezone", () => {
  it("is a no-op in demo mode", async () => {
    await saveHomeTimezone(demoEvent(), "Asia/Tokyo");
    expect(setHomeTimezone).not.toHaveBeenCalled();
  });

  it("throws 401 when SESSION_SECRET is missing", async () => {
    const event = authedEvent({ platform: { env: { SESSION_SECRET: undefined } } });
    await expect(saveHomeTimezone(event, "Asia/Tokyo")).rejects.toMatchObject({ status: 401 });
  });

  it("throws 401 when session cookie is missing", async () => {
    const event = authedEvent({ cookies: { get: () => undefined } });
    await expect(saveHomeTimezone(event, "Asia/Tokyo")).rejects.toMatchObject({ status: 401 });
  });

  it("throws 401 when session cannot be opened", async () => {
    (openSession as unknown as Mock).mockResolvedValue(null);
    await expect(saveHomeTimezone(authedEvent(), "Asia/Tokyo")).rejects.toMatchObject({
      status: 401,
    });
  });

  it("calls setHomeTimezone with the session data", async () => {
    const session = {
      user: { id: 7, username: "athlete" },
      personal: true,
      tokens: { accessToken: "", refreshToken: "", expiresAt: 0, scope: "" },
    };
    (openSession as unknown as Mock).mockResolvedValue(session);
    await saveHomeTimezone(authedEvent(), "Asia/Tokyo");
    expect(setHomeTimezone).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "test-secret-that-is-32-chars!!",
      session,
      "Asia/Tokyo",
    );
  });

  it("passes undefined to clear the timezone", async () => {
    const session = {
      user: { id: 7, username: "athlete" },
      personal: true,
      tokens: { accessToken: "", refreshToken: "", expiresAt: 0, scope: "" },
    };
    (openSession as unknown as Mock).mockResolvedValue(session);
    await saveHomeTimezone(authedEvent(), undefined);
    expect(setHomeTimezone).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.any(String),
      session,
      undefined,
    );
  });
});

// ---------------------------------------------------------------------------
// loadAnnualGoal
// ---------------------------------------------------------------------------

describe("loadAnnualGoal", () => {
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

  it("reads from cookie for authenticated users (same as demo)", async () => {
    const cookieVal = JSON.stringify({ year: 2026, kind: "hours", target: 300 });
    const event = authedEvent({ cookies: { get: () => cookieVal, set: vi.fn() } });
    const goal = await loadAnnualGoal(event, 2026);
    expect(goal.kind).toBe("hours");
    expect(goal.target).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// saveAnnualGoal
// ---------------------------------------------------------------------------

describe("saveAnnualGoal", () => {
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
