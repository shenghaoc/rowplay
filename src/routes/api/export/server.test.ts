import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("$lib/server/data", () => ({
  loadWorkouts: vi.fn(),
}));
vi.mock("$lib/server/export", () => ({
  exportFilename: vi.fn().mockImplementation((ext: string) => `rowplay-logbook-2026-01-01.${ext}`),
  workoutsToCsv: vi.fn().mockReturnValue("date,distance\n2026-01-01,2000"),
  workoutsToJson: vi.fn().mockReturnValue("[]"),
}));

import { GET } from "./+server";
import { loadWorkouts } from "$lib/server/data";

const sampleWorkouts = [
  { id: 1, date: "2026-01-01", distance: 2000, time: 480, pace: 120, sport: "rower" },
];

function fakeEvent(format?: string) {
  const url = format
    ? `http://localhost/api/export?format=${format}`
    : "http://localhost/api/export";
  return {
    request: { url },
    locals: { demo: true },
    url: new URL(url),
  };
}

describe("GET /api/export", () => {
  it("throws 404 when no workouts exist", async () => {
    (loadWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(GET(fakeEvent() as any)).rejects.toMatchObject({ status: 404 });
  });

  it("returns csv when format=csv", async () => {
    (loadWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue(sampleWorkouts);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(fakeEvent("csv") as any);
    expect(res.headers.get("content-type")).toContain("text/csv");
  });

  it("returns json when format=json (default)", async () => {
    (loadWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue(sampleWorkouts);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(fakeEvent("json") as any);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("defaults to json when no format specified", async () => {
    (loadWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue(sampleWorkouts);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(fakeEvent() as any);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("throws 400 for unsupported format", async () => {
    (loadWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue(sampleWorkouts);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(GET(fakeEvent("xml") as any)).rejects.toMatchObject({ status: 400 });
  });

  it("sets cache-control: private, no-store on csv response", async () => {
    (loadWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue(sampleWorkouts);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(fakeEvent("csv") as any);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("sets content-disposition with attachment filename for csv", async () => {
    (loadWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue(sampleWorkouts);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(fakeEvent("csv") as any);
    const disposition = res.headers.get("content-disposition");
    expect(disposition).toContain("attachment");
    expect(disposition).toMatch(/filename="rowplay-logbook-\d{4}-\d{2}-\d{2}\.csv"/);
  });

  it("sets content-type correctly for csv", async () => {
    (loadWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue(sampleWorkouts);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(fakeEvent("csv") as any);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
  });

  it("sets content-type correctly for json", async () => {
    (loadWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue(sampleWorkouts);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(fakeEvent("json") as any);
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
  });

  it("sets cache-control: private, no-store on json response", async () => {
    (loadWorkouts as ReturnType<typeof vi.fn>).mockResolvedValue(sampleWorkouts);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(fakeEvent("json") as any);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
