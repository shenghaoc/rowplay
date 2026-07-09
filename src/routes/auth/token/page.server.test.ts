import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("$lib/server/config", () => ({
  getConfig: vi.fn().mockReturnValue({ clientId: null, appUrl: "http://localhost" }),
}));
vi.mock("$lib/server/concept2", () => ({
  fetchMe: vi.fn(),
}));
vi.mock("$lib/server/session", () => ({
  writeSession: vi.fn().mockResolvedValue(undefined),
  SESSION_COOKIE: "rp_session",
  TOKEN_COOKIE: "rp_tok",
}));
vi.mock("$lib/server/tokenCrypto", () => ({
  sealToken: vi.fn().mockResolvedValue("sealed-token"),
}));
vi.mock("$lib/datetime", () => ({
  nowEpochMillis: vi.fn().mockReturnValue(1_000_000_000),
}));

import { actions, load } from "./+page.server";
import { fetchMe } from "$lib/server/concept2";
import { TOKEN_COOKIE, writeSession } from "$lib/server/session";
import { sealToken } from "$lib/server/tokenCrypto";

type Mock = ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  (fetchMe as Mock).mockReset();
  (sealToken as Mock).mockResolvedValue("sealed-token");
});

function fakeLoadEvent(user?: { id: number; username: string } | null) {
  return {
    locals: { user: user ?? null },
    platform: { env: {} },
  };
}

function fakeActionEvent(opts: { token?: string; secret?: string; url?: string }) {
  const formData = new FormData();
  if (opts.token !== undefined) formData.append("token", opts.token);

  const cookiesSet: Record<string, { value: string; options: Record<string, unknown> }> = {};
  return {
    event: {
      locals: { lang: "en" },
      request: { formData: async () => formData },
      platform: { env: opts.secret ? { SESSION_SECRET: opts.secret } : {} },
      url: new URL(opts.url ?? "http://localhost/auth/token"),
      cookies: {
        set: (name: string, val: string, options: Record<string, unknown>) => {
          cookiesSet[name] = { value: val, options };
        },
      },
    },
    cookiesSet,
  };
}

describe("load /auth/token", () => {
  it("redirects to dashboard when already authenticated", async () => {
    const event = fakeLoadEvent({ id: 7, username: "athlete" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(load(event as any)).rejects.toMatchObject({ status: 303, location: "/dashboard" });
  });

  it("returns oauthEnabled:false when no clientId", async () => {
    const event = fakeLoadEvent(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await load(event as any)) as any;
    expect(data.oauthEnabled).toBe(false);
  });
});

describe("actions /auth/token", () => {
  it("returns fail(400) when token is empty", async () => {
    const { event } = fakeActionEvent({ token: "   " });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await actions.default(event as any);
    expect(result).toMatchObject({ status: 400 });
  });

  it("returns fail(500) when SESSION_SECRET is not set", async () => {
    const { event } = fakeActionEvent({ token: "mytoken" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await actions.default(event as any);
    expect(result).toMatchObject({ status: 500 });
    expect(fetchMe).not.toHaveBeenCalled();
    expect(writeSession).not.toHaveBeenCalled();
  });

  it("returns fail(400) when token is rejected by Concept2", async () => {
    (fetchMe as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("401 Unauthorized"));
    const { event } = fakeActionEvent({ token: "badtoken", secret: "mysecret" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await actions.default(event as any);
    expect(result).toMatchObject({ status: 400 });
    expect(writeSession).not.toHaveBeenCalled();
  });

  it("writes encrypted session cookie and sealed token cookie on successful auth", async () => {
    (fetchMe as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 7, username: "athlete" });
    const { event, cookiesSet } = fakeActionEvent({
      token: "valid-personal-token",
      secret: "mysecret",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(actions.default(event as any)).rejects.toMatchObject({
      status: 303,
      location: "/dashboard",
    });

    expect(sealToken).toHaveBeenCalledWith("mysecret", "valid-personal-token");
    expect(writeSession).toHaveBeenCalledOnce();
    // writeSession is now called with (cookies, event, secret, sessionData)
    const [, , secret, session] = (writeSession as Mock).mock.calls[0];
    expect(secret).toBe("mysecret");
    expect(session).toMatchObject({
      user: { id: 7, username: "athlete" },
      personal: true,
      tokens: { accessToken: "", refreshToken: "", scope: "" },
    });
    expect(JSON.stringify(session)).not.toContain("valid-personal-token");

    expect(cookiesSet[TOKEN_COOKIE]).toMatchObject({
      value: "sealed-token",
      options: { path: "/", httpOnly: true, secure: false, sameSite: "lax", maxAge: 2_592_000 },
    });
    expect(JSON.stringify(cookiesSet)).not.toContain("valid-personal-token");
  });

  it("marks the rp_tok cookie secure on HTTPS", async () => {
    (fetchMe as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 7, username: "athlete" });
    const { event, cookiesSet } = fakeActionEvent({
      token: "valid-personal-token",
      secret: "mysecret",
      url: "https://rowplay.example/auth/token",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(actions.default(event as any)).rejects.toMatchObject({
      status: 303,
      location: "/dashboard",
    });

    expect(cookiesSet[TOKEN_COOKIE]).toMatchObject({
      value: "sealed-token",
      options: { path: "/", httpOnly: true, secure: true, sameSite: "lax" },
    });
  });
});
