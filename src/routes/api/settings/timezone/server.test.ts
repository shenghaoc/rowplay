import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("$lib/server/data", () => ({
  loadHomeTimezone: vi.fn(),
  saveHomeTimezone: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "./+server";
import { saveHomeTimezone } from "$lib/server/data";

function event(body: unknown, demo = false) {
  return {
    locals: { demo },
    request: { json: vi.fn().mockResolvedValue(body) },
  };
}

describe("POST /api/settings/timezone", () => {
  it("rejects a null JSON body", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(POST(event(null) as any)).rejects.toMatchObject({ status: 400 });
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
});
