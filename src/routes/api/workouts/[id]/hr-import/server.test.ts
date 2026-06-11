import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("$lib/server/hrImport", () => ({
  saveHrImport: vi.fn().mockResolvedValue({ id: 1001, strokes: [] }),
  clearHrImport: vi.fn().mockResolvedValue({ id: 1001, strokes: [] }),
}));
vi.mock("$lib/hrImport", () => ({
  validateHrSamples: vi.fn(),
}));

import { saveHrImport } from "$lib/server/hrImport";
import { DELETE, POST } from "./+server";

function fakePostEvent(id: string, body: unknown) {
  return {
    params: { id },
    locals: { demo: false, user: { id: 7 } },
    request: { json: async () => body },
    platform: { env: { DB: {}, SESSIONS: {} } },
  };
}

function fakeDeleteEvent(id: string) {
  return {
    params: { id },
    locals: { demo: false, user: { id: 7 } },
    platform: { env: { DB: {}, SESSIONS: {} } },
  };
}

const validSamples = Array.from({ length: 10 }, (_, i) => ({ t: i * 1000, hr: 140 + i }));

describe("POST /api/workouts/[id]/hr-import", () => {
  it("throws 400 for non-numeric workout id", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(
      POST(fakePostEvent("abc", { samples: validSamples, offset: 0 }) as any),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 when body is missing samples array", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(POST(fakePostEvent("1001", { offset: 0 }) as any)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("throws 400 when a sample has invalid fields", async () => {
    const badSamples = [{ t: "notanumber", hr: 140 }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(
      POST(fakePostEvent("1001", { samples: badSamples, offset: 0 }) as any),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("clamps offset to ±600s", async () => {
    vi.mocked(saveHrImport).mockResolvedValue({ id: 1001 } as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await POST(fakePostEvent("1001", { samples: validSamples, offset: 9999 }) as any);
    expect(saveHrImport).toHaveBeenCalledWith(expect.anything(), 1001, expect.anything(), 600);
  });

  it("returns workout detail on success", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(fakePostEvent("1001", { samples: validSamples, offset: 0 }) as any);
    const body = await res.json();
    expect(body.id).toBe(1001);
  });
});

describe("DELETE /api/workouts/[id]/hr-import", () => {
  it("throws 400 for non-numeric workout id", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(DELETE(fakeDeleteEvent("abc") as any)).rejects.toMatchObject({ status: 400 });
  });

  it("returns workout detail on success", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await DELETE(fakeDeleteEvent("1001") as any);
    const body = await res.json();
    expect(body.id).toBe(1001);
  });
});
