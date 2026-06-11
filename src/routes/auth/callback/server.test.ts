import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("$lib/server/config", () => ({
  getConfig: vi.fn().mockReturnValue({
    clientId: "cid",
    clientSecret: "csecret",
    redirectUri: "http://localhost/auth/callback",
  }),
  requireSessions: vi.fn().mockReturnValue({ put: vi.fn(), get: vi.fn(), delete: vi.fn() }),
}));
vi.mock("$lib/server/concept2", () => ({
  exchangeCode: vi.fn().mockResolvedValue({
    accessToken: "tok",
    refreshToken: "rtok",
    expiresAt: 9999999,
    scope: "read",
  }),
  fetchMe: vi.fn().mockResolvedValue({ id: 7, username: "athlete" }),
}));
vi.mock("$lib/server/session", () => ({
  newSessionId: vi.fn().mockReturnValue("new-session-id"),
  writeSession: vi.fn().mockResolvedValue(undefined),
  SESSION_COOKIE: "c2_session",
  OAUTH_STATE_COOKIE: "c2_oauth_state",
}));

import { GET } from "./+server";

function fakeEvent(opts: {
  code?: string | null;
  state?: string | null;
  storedState?: string | null;
  errorParam?: string | null;
}) {
  const params = new URLSearchParams();
  if (opts.code) params.set("code", opts.code);
  if (opts.state) params.set("state", opts.state);
  if (opts.errorParam) params.set("error", opts.errorParam);

  const cookiesSet: Record<string, string> = {};
  const cookiesDeleted: string[] = [];
  return {
    event: {
      url: new URL(`http://localhost/auth/callback?${params.toString()}`),
      cookies: {
        get: (name: string) => (name === "c2_oauth_state" ? opts.storedState : null),
        set: (name: string, val: string) => {
          cookiesSet[name] = val;
        },
        delete: (name: string) => cookiesDeleted.push(name),
      },
      locals: {},
    },
    cookiesSet,
    cookiesDeleted,
  };
}

describe("GET /auth/callback", () => {
  it("throws 400 when error param is present", async () => {
    const { event } = fakeEvent({ errorParam: "access_denied" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(GET(event as any)).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 for unknown error codes (sanitizes arbitrary input)", async () => {
    const { event } = fakeEvent({ errorParam: "some_injected_value" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = await (GET(event as any) as Promise<Response>).catch((e) => e);
    expect(err.status).toBe(400);
    expect(err.body?.message ?? err.message ?? "").toContain("unknown_error");
  });

  it("throws 400 when state param is missing", async () => {
    const { event } = fakeEvent({ code: "mycode", storedState: "expected" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(GET(event as any)).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 when state does not match stored state", async () => {
    const { event } = fakeEvent({ code: "mycode", state: "wrong", storedState: "expected" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(GET(event as any)).rejects.toMatchObject({ status: 400 });
  });

  it("redirects to dashboard on successful OAuth exchange", async () => {
    const { event } = fakeEvent({ code: "mycode", state: "abc123", storedState: "abc123" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(GET(event as any)).rejects.toMatchObject({ status: 303, location: "/dashboard" });
  });
});
