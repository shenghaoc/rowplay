import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("$lib/server/config", () => ({
  getConfig: vi.fn(),
}));
vi.mock("$lib/server/concept2", () => ({
  buildAuthorizeUrl: vi.fn().mockReturnValue("https://log.concept2.com/oauth/authorize?state=test"),
}));

import { GET } from "./+server";
import { getConfig } from "$lib/server/config";
import { OAUTH_STATE_COOKIE } from "$lib/server/session";

function fakeEvent(url = "http://localhost/auth/login") {
  const set: Record<string, { value: string; options: Record<string, unknown> }> = {};
  return {
    event: {
      cookies: {
        set: (name: string, val: string, options: Record<string, unknown>) => {
          set[name] = { value: val, options };
        },
      },
      url: new URL(url),
    },
    cookiesSet: set,
  };
}

describe("GET /auth/login", () => {
  it("redirects to dashboard in demo mode (no clientId)", async () => {
    (getConfig as ReturnType<typeof vi.fn>).mockReturnValue({ clientId: null });
    const { event } = fakeEvent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = GET(event as any);
    await expect(p).rejects.toMatchObject({ status: 303, location: "/dashboard" });
  });

  it("redirects to OAuth authorize URL when clientId is set", async () => {
    (getConfig as ReturnType<typeof vi.fn>).mockReturnValue({ clientId: "myClientId" });
    const { event } = fakeEvent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = GET(event as any);
    await expect(p).rejects.toMatchObject({ status: 302 });
  });

  it("stores a short-lived httpOnly OAuth state cookie before redirecting", async () => {
    (getConfig as ReturnType<typeof vi.fn>).mockReturnValue({ clientId: "myClientId" });
    const { event, cookiesSet } = fakeEvent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(GET(event as any)).rejects.toMatchObject({ status: 302 });

    expect(cookiesSet[OAUTH_STATE_COOKIE]).toMatchObject({
      options: {
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 600,
      },
    });
    expect(cookiesSet[OAUTH_STATE_COOKIE].value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("marks the OAuth state cookie Secure on HTTPS", async () => {
    (getConfig as ReturnType<typeof vi.fn>).mockReturnValue({ clientId: "myClientId" });
    const { event, cookiesSet } = fakeEvent("https://rowplay.example/auth/login");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(GET(event as any)).rejects.toMatchObject({ status: 302 });
    expect(cookiesSet[OAUTH_STATE_COOKIE].options.secure).toBe(true);
  });
});
