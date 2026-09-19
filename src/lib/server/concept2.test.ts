import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  Concept2Client,
  exchangeCode,
  fetchMe,
  mapHeartRate,
  mapMetadata,
  mapResult,
  mapSplits,
  mapTargets,
  refreshTokens,
} from "./concept2";
import { bikePaceSecPer500 } from "../../../tests/unit/fixtures";
import type { Concept2Config } from "./concept2";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const cfg: Concept2Config = {
  clientId: "test-client-id",
  clientSecret: "test-secret",
  baseUrl: "https://log.concept2.com",
  appUrl: "https://rowplay.test",
};

function tokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    access_token: "fresh-access",
    refresh_token: "fresh-refresh",
    expires_in: 3600,
    scope: "user:read,results:read",
    token_type: "bearer",
    ...overrides,
  };
}

function personalClient() {
  return new Concept2Client(cfg, {
    user: { id: 1, username: "athlete" },
    personal: true,
    tokens: { accessToken: "personal-token", refreshToken: "", expiresAt: 0, scope: "" },
  });
}

describe("Concept2Client.listWorkouts", () => {
  it("follows the Concept2 pagination metadata to return the full logbook", async () => {
    const result = (id: number) => ({
      id,
      date: "2026-05-01 06:00:00",
      type: "rower",
      distance: 2000,
      time: 4800,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [result(1)], meta: { pagination: { total_pages: 2 } } }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [result(2)], meta: { pagination: { total_pages: 2 } } }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = new Concept2Client(
      {
        clientId: "",
        clientSecret: "",
        baseUrl: "https://log.concept2.com",
        appUrl: "https://rowplay.test",
      },
      {
        user: { id: 1, username: "athlete" },
        personal: true,
        tokens: { accessToken: "token", refreshToken: "", expiresAt: 0, scope: "" },
      },
    );

    await expect(client.listWorkouts()).resolves.toMatchObject([{ id: 1 }, { id: 2 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("page=1&number=250");
    expect(fetchMock.mock.calls[1][0]).toContain("page=2&number=250");
  });

  it("fetches only the newest page for live polling", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: 3, date: "2026-05-03 06:00:00", type: "rower", distance: 2000, time: 4800 }],
          meta: { pagination: { total_pages: 4 } },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new Concept2Client(
      {
        clientId: "",
        clientSecret: "",
        baseUrl: "https://log.concept2.com",
        appUrl: "https://rowplay.test",
      },
      {
        user: { id: 1, username: "athlete" },
        personal: true,
        tokens: { accessToken: "token", refreshToken: "", expiresAt: 0, scope: "" },
      },
    );

    await expect(client.listRecentWorkouts()).resolves.toMatchObject([{ id: 3 }]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain("page=1&number=25");
  });
});

describe("exchangeCode / refreshTokens", () => {
  it("exchanges an authorization code without echoing error bodies", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(tokenResponse())));
    vi.stubGlobal("fetch", fetchMock);

    await expect(exchangeCode(cfg, "auth-code")).resolves.toEqual({
      accessToken: "fresh-access",
      refreshToken: "fresh-refresh",
      expiresAt: Date.now() + 3600_000,
      scope: "user:read,results:read",
    });

    expect(fetchMock.mock.calls[0][0]).toBe("https://log.concept2.com/oauth/access_token");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    const params = new URLSearchParams(String(init.body));
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("auth-code");
    expect(params.get("redirect_uri")).toBe("https://rowplay.test/auth/callback");
    expect(params.get("client_id")).toBe("test-client-id");
    expect(params.get("client_secret")).toBe("test-secret");
  });

  it("refreshes with the refresh_token grant", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(tokenResponse())));
    vi.stubGlobal("fetch", fetchMock);

    await refreshTokens(cfg, "stored-refresh");
    const params = new URLSearchParams(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("stored-refresh");
    expect(params.get("code")).toBeNull();
  });

  it("throws a status-only error so token response bodies never leak", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("client_secret leaked here", { status: 400 })),
    );
    await expect(exchangeCode(cfg, "bad")).rejects.toThrow("Concept2 token request failed (400)");
    await expect(exchangeCode(cfg, "bad")).rejects.not.toThrow(/client_secret leaked/);
  });
});

describe("fetchMe", () => {
  it("maps the logbook profile and sends a bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 7, username: "rower", first_name: "Ada" } })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMe(cfg, "access-tok")).resolves.toEqual({
      id: 7,
      username: "rower",
      firstName: "Ada",
    });
    expect(fetchMock.mock.calls[0][0]).toBe("https://log.concept2.com/api/users/me");
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      authorization: "Bearer access-tok",
    });
  });

  it("throws on a non-OK profile response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 401 })));
    await expect(fetchMe(cfg, "expired")).rejects.toThrow("fetchMe failed (401)");
  });
});

describe("Concept2Client token refresh", () => {
  it("does not refresh personal BYOT tokens even when expiresAt is in the past", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [], meta: { pagination: { total_pages: 1 } } })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await personalClient().listRecentWorkouts();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("/oauth/access_token");
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      authorization: "Bearer personal-token",
    });
  });

  it("reuses a still-valid OAuth access token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
    const onTokenRefresh = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [], meta: { pagination: { total_pages: 1 } } })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new Concept2Client(
      cfg,
      {
        user: { id: 1, username: "athlete" },
        personal: false,
        tokens: {
          accessToken: "live-access",
          refreshToken: "rt",
          expiresAt: Date.now() + 3600_000,
          scope: "",
        },
      },
      onTokenRefresh,
    );
    await client.listRecentWorkouts();
    expect(onTokenRefresh).not.toHaveBeenCalled();
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      authorization: "Bearer live-access",
    });
  });

  it("refreshes an OAuth token inside the 60s expiry window and persists it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
    const onTokenRefresh = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(tokenResponse())))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [], meta: { pagination: { total_pages: 1 } } })),
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = new Concept2Client(
      cfg,
      {
        user: { id: 1, username: "athlete" },
        personal: false,
        tokens: {
          accessToken: "stale-access",
          refreshToken: "stored-refresh",
          expiresAt: Date.now() + 30_000,
          scope: "",
        },
      },
      onTokenRefresh,
    );
    await client.listRecentWorkouts();

    expect(String(fetchMock.mock.calls[0][0])).toContain("/oauth/access_token");
    const params = new URLSearchParams(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(params.get("refresh_token")).toBe("stored-refresh");
    expect(onTokenRefresh).toHaveBeenCalledOnce();
    expect(onTokenRefresh.mock.calls[0][0].tokens.accessToken).toBe("fresh-access");
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toMatchObject({
      authorization: "Bearer fresh-access",
    });
  });
});

describe("Concept2Client.getWorkout", () => {
  function resultPayload(overrides: Record<string, unknown> = {}) {
    return {
      data: {
        id: 42,
        date: "2026-05-01 06:00:00",
        type: "rower",
        distance: 2000,
        time: 4800,
        stroke_data: true,
        ...overrides,
      },
    };
  }

  it("keeps real strokes when the strokes endpoint succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(resultPayload())))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              { t: 0, d: 0, p: 1200, spm: 28 },
              { t: 100, d: 500, p: 1180, spm: 30 },
            ],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const detail = await personalClient().getWorkout(42);
    expect(detail.hasStrokeData).toBe(true);
    expect(detail.strokes).toHaveLength(2);
    expect(detail.strokes[1]?.t).toBe(10);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/users/me/results/42/strokes");
  });

  it("synthesises a timeline and clears hasStrokeData when /strokes fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            resultPayload({
              workout: {
                splits: [
                  { distance: 1000, time: 2400 },
                  { distance: 1000, time: 2400 },
                ],
              },
            }),
          ),
        ),
      )
      .mockResolvedValueOnce(new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const detail = await personalClient().getWorkout(42);
    expect(detail.hasStrokeData).toBe(false);
    expect(detail.strokes.length).toBeGreaterThan(1);
    expect(detail.strokes.at(-1)?.d).toBe(2000);
    expect(detail.strokes.at(-1)?.t).toBe(480);
  });

  it("synthesises a summary timeline when the result has no stroke flag", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(resultPayload({ stroke_data: false })))),
    );

    const detail = await personalClient().getWorkout(42);
    expect(detail.hasStrokeData).toBe(false);
    expect(detail.strokes).toHaveLength(61);
    expect(detail.strokes[0]?.t).toBe(0);
    expect(detail.strokes.at(-1)?.t).toBe(480);
    expect(detail.isInterval).toBe(false);
  });

  it("marks interval workouts from the intervals array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify(
            resultPayload({
              stroke_data: false,
              workout: { intervals: [{ distance: 500, time: 900 }] },
            }),
          ),
        ),
      ),
    );

    const detail = await personalClient().getWorkout(42);
    expect(detail.isInterval).toBe(true);
  });

  it("throws when the workout detail request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("gone", { status: 404 })));
    await expect(personalClient().getWorkout(42)).rejects.toThrow(
      "Concept2 API /users/me/results/42?include=metadata failed (404)",
    );
  });
});

describe("mapHeartRate", () => {
  it("maps a scalar to average only", () => {
    expect(mapHeartRate(152)).toEqual({ average: 152 });
  });

  it("returns undefined when absent", () => {
    expect(mapHeartRate(undefined)).toBeUndefined();
  });

  it("maps the full object", () => {
    expect(mapHeartRate({ average: 160, min: 140, max: 172, ending: 168, recovery: 120 })).toEqual({
      average: 160,
      min: 140,
      max: 172,
      ending: 168,
      recovery: 120,
    });
  });
});

describe("mapTargets", () => {
  it("converts pace tenths to sec/500m for rower", () => {
    expect(mapTargets({ pace: 1080 }, "rower")).toEqual({ pace: 108 });
  });

  it("halves bike target pace (per-1000m API units)", () => {
    expect(mapTargets({ pace: 2000 }, "bike")).toEqual({ pace: 100 });
  });

  it("returns undefined when absent", () => {
    expect(mapTargets(undefined, "rower")).toBeUndefined();
  });
});

describe("mapMetadata", () => {
  it("maps provenance fields", () => {
    expect(
      mapMetadata({
        pm_version: 5,
        firmware_version: "707",
        serial_number: "SN-1",
        device: "iPhone",
        erg_model_type: 0,
        hr_type: "BT",
      }),
    ).toEqual({
      pmVersion: 5,
      firmwareVersion: "707",
      serialNumber: "SN-1",
      device: "iPhone",
      ergModelType: 0,
      hrType: "BT",
    });
  });
});

describe("mapResult", () => {
  const base = {
    id: 42,
    date: "2026-05-01 06:00:00",
    type: "rower",
    distance: 2000,
    time: 4800,
    stroke_data: true,
  };

  it("normalises rest time from tenths to seconds", () => {
    const w = mapResult({ ...base, rest_time: 900 });
    expect(w.restTime).toBe(90);
  });

  it("leaves absent fields undefined", () => {
    const w = mapResult(base);
    expect(w.restTime).toBeUndefined();
    expect(w.targets).toBeUndefined();
    expect(w.verified).toBeUndefined();
  });

  it("converts tenths of a second to seconds and derives pace", () => {
    const w = mapResult(base);
    expect(w.time).toBe(480);
    expect(w.pace).toBe(120);
  });

  it("maps Concept2 type aliases onto Sport", () => {
    expect(mapResult({ ...base, type: "ski" }).sport).toBe("skierg");
    expect(mapResult({ ...base, type: "skierg" }).sport).toBe("skierg");
    expect(mapResult({ ...base, type: "bikeerg" }).sport).toBe("bike");
    expect(mapResult({ ...base, type: undefined }).sport).toBe("rower");
  });

  it("captures HR ending/recovery and flat compat fields", () => {
    const w = mapResult({
      ...base,
      heart_rate: { average: 160, min: 140, max: 170, ending: 168, recovery: 118 },
    });
    expect(w.heartRate?.recovery).toBe(118);
    expect(w.heartRateAvg).toBe(160);
    expect(w.hrMin).toBe(140);
    expect(w.hrMax).toBe(170);
  });

  it("maps workout targets and metadata", () => {
    const w = mapResult(
      {
        ...base,
        workout: { targets: { stroke_rate: 30, watts: 220 } },
      },
      { pm_version: 5, serial_number: "X" },
    );
    expect(w.targets).toEqual({ strokeRate: 30, watts: 220 });
    expect(w.metadata?.pmVersion).toBe(5);
    expect(w.metadata?.serialNumber).toBe("X");
  });
});

describe("mapSplits", () => {
  it("maps split calories, HR detail, and interval type", () => {
    const splits = mapSplits({
      id: 1,
      date: "2026-05-01",
      distance: 6000,
      time: 12000,
      type: "rower",
      workout: {
        intervals: [
          {
            distance: 1500,
            time: 3600,
            calories_total: 120,
            wattminutes_total: 45,
            type: "distance",
            heart_rate: { average: 165, ending: 170 },
          },
          { distance: 0, time: 600, type: "time" },
        ],
      },
    });
    expect(splits[0].caloriesTotal).toBe(120);
    expect(splits[0].heartRate?.ending).toBe(170);
    expect(splits[0].type).toBe("distance");
    expect(splits[0].isRest).toBe(false);
    expect(splits[1].isRest).toBe(true);
    expect(splits[1].restTime).toBeUndefined();
  });

  it("maps a split machine alias through toSport", () => {
    const splits = mapSplits({
      id: 1,
      date: "2026-05-01",
      distance: 2000,
      time: 4800,
      type: "rower",
      workout: { splits: [{ distance: 2000, time: 4800, machine: "ski" }] },
    });
    expect(splits[0].machine).toBe("skierg");
  });
});

describe("mapStrokes bike pace", () => {
  it("matches fixture halving for bike", () => {
    expect(bikePaceSecPer500(2000)).toBe(100);
  });
});
