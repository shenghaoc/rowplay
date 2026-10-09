import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("$lib/server/data", () => ({
  loadHomeTimezone: vi.fn(),
  saveHomeTimezone: vi.fn().mockResolvedValue(undefined),
}));

import { GET, POST } from "./+server";
import { loadHomeTimezone, saveHomeTimezone } from "$lib/server/data";

type Mock = ReturnType<typeof vi.fn>;

function event(body: unknown, demo = false) {
  return {
    locals: { demo },
    request: { json: vi.fn().mockResolvedValue(body) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (saveHomeTimezone as unknown as Mock).mockResolvedValue(undefined);
});

describe("GET /api/settings/timezone", () => {
  it("returns null when no home timezone is stored", async () => {
    (loadHomeTimezone as unknown as Mock).mockResolvedValueOnce(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await GET(event(undefined) as any);
    await expect(response.json()).resolves.toEqual({ timezone: null });
  });

  it("returns the stored timezone", async () => {
    (loadHomeTimezone as unknown as Mock).mockResolvedValueOnce("America/New_York");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await GET(event(undefined) as any);
    await expect(response.json()).resolves.toEqual({ timezone: "America/New_York" });
  });
});

describe("POST /api/settings/timezone", () => {
  it("rejects demo callers before reading the body", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(POST(event({ timezone: "UTC" }, true) as any)).rejects.toMatchObject({
      status: 401,
    });
    expect(saveHomeTimezone).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON", async () => {
    const bad = {
      locals: { demo: false },
      request: { json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token")) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(POST(bad as any)).rejects.toMatchObject({ status: 400 });
    expect(saveHomeTimezone).not.toHaveBeenCalled();
  });

  it("rejects a null JSON body", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(POST(event(null) as any)).rejects.toMatchObject({ status: 400 });
    expect(saveHomeTimezone).not.toHaveBeenCalled();
  });

  it("rejects a non-string timezone", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(POST(event({ timezone: 8 }) as any)).rejects.toMatchObject({ status: 400 });
    expect(saveHomeTimezone).not.toHaveBeenCalled();
  });

  it("rejects invalid IANA timezones before persisting them", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(POST(event({ timezone: "not/a-timezone" }) as any)).rejects.toMatchObject({
      status: 400,
    });
    expect(saveHomeTimezone).not.toHaveBeenCalled();
  });

  it("trims and persists a valid IANA timezone", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await POST(event({ timezone: " Asia/Singapore " }) as any);
    expect(saveHomeTimezone).toHaveBeenCalledWith(expect.anything(), "Asia/Singapore");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("clears the stored timezone when the value is blank", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await POST(event({ timezone: "   " }) as any);
    expect(saveHomeTimezone).toHaveBeenCalledWith(expect.anything(), undefined);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
