import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  Concept2Client,
  mapHeartRate,
  mapMetadata,
  mapResult,
  mapSplits,
  mapTargets,
} from "./concept2";
import { bikePaceSecPer500 } from "../../../tests/unit/fixtures";

afterEach(() => vi.unstubAllGlobals());

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
});

describe("mapStrokes bike pace", () => {
  it("matches fixture halving for bike", () => {
    expect(bikePaceSecPer500(2000)).toBe(100);
  });
});
