import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("$lib/server/data", () => ({
  loadWorkoutDetail: vi.fn(),
}));
vi.mock("$lib/server/export", () => ({
  workoutDetailToTcx: vi.fn().mockReturnValue("<TrainingCenterDatabase/>"),
  workoutExportFilename: vi.fn().mockReturnValue("rowplay-workout-1001.tcx"),
}));

import { GET } from "./+server";
import { loadWorkoutDetail } from "$lib/server/data";

const sampleDetail = {
  id: 1001,
  date: "2026-01-01 06:00:00",
  sport: "rower" as const,
  distance: 2000,
  time: 480,
  pace: 120,
  hasStrokeData: true,
  strokes: [],
  splits: [],
  isInterval: false,
};

function fakeEvent(id: string, format?: string) {
  const url = format
    ? `http://localhost/api/export/${id}?format=${format}`
    : `http://localhost/api/export/${id}`;
  return {
    params: { id },
    request: { url },
    locals: { demo: true },
    platform: { env: { DB: {}, SESSIONS: {} } },
  };
}

describe("GET /api/export/[id]", () => {
  it("throws 400 for non-numeric id", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(GET(fakeEvent("abc") as any)).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 for unsupported format", async () => {
    (loadWorkoutDetail as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDetail);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(GET(fakeEvent("1001", "csv") as any)).rejects.toMatchObject({ status: 400 });
  });

  it("returns tcx for valid id and tcx format", async () => {
    (loadWorkoutDetail as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDetail);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(fakeEvent("1001", "tcx") as any);
    expect(res.headers.get("content-type")).toContain("tcx");
  });

  it("defaults to tcx format when none specified", async () => {
    (loadWorkoutDetail as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDetail);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(fakeEvent("1001") as any);
    expect(res.headers.get("content-type")).toContain("tcx");
  });

  it("throws 400 for zero id", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(GET(fakeEvent("0") as any)).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 for negative id", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(GET(fakeEvent("-1") as any)).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 for fractional id", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(GET(fakeEvent("1.5") as any)).rejects.toMatchObject({ status: 400 });
  });

  it("sets correct content-type for tcx", async () => {
    (loadWorkoutDetail as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDetail);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(fakeEvent("1001", "tcx") as any);
    expect(res.headers.get("content-type")).toBe("application/vnd.garmin.tcx+xml; charset=utf-8");
  });

  it("sets cache-control: private, no-store on tcx response", async () => {
    (loadWorkoutDetail as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDetail);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(fakeEvent("1001", "tcx") as any);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("sets content-disposition with filename for tcx", async () => {
    (loadWorkoutDetail as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDetail);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(fakeEvent("1001", "tcx") as any);
    expect(res.headers.get("content-disposition")).toContain('filename="rowplay-workout-1001.tcx"');
  });
});
