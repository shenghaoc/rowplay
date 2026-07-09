import { describe, expect, it } from "vite-plus/test";
import {
  destroySession,
  openSession,
  sealSession,
  writeSession,
  SESSION_COOKIE,
  TOKEN_COOKIE,
  OAUTH_STATE_COOKIE,
} from "./session";
import { nowEpochMillis } from "../datetime";
import type { SessionData } from "./session";

const TEST_SECRET = "test-secret-for-session-tests-32chars!";

const sampleSession: SessionData = {
  user: { id: 42, username: "alice", firstName: "Alice" },
  tokens: {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: nowEpochMillis() + 3600_000,
    scope: "user:read,results:read",
  },
};

interface CookieEntry {
  value: string;
  opts: Record<string, unknown>;
}

/** Cookie jar stub that captures options for assertion. */
function fakeCookies() {
  const store = new Map<string, CookieEntry>();
  return {
    set: (name: string, value: string, opts: Record<string, unknown>) =>
      store.set(name, { value, opts }),
    get: (name: string) => store.get(name)?.value,
    delete: (name: string, _opts?: Record<string, unknown>) => {
      store.delete(name);
    },
    getAll: () => [...store.entries()].map(([name, entry]) => ({ name, value: entry.value })),
    serialize: (name: string, value: string) => `${name}=${value}`,
    _store: store,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const fakeEvent = { url: new URL("https://example.com/") };
const fakeEventHttp = { url: new URL("http://localhost/") };

describe("sealSession / openSession", () => {
  it("round-trips a session through seal and open", async () => {
    const sealed = await sealSession(TEST_SECRET, sampleSession);
    const opened = await openSession(TEST_SECRET, sealed);
    expect(opened).toEqual(sampleSession);
  });

  it("returns null for a tampered blob", async () => {
    const sealed = await sealSession(TEST_SECRET, sampleSession);
    const tampered = sealed.slice(0, -4) + "xxxx";
    expect(await openSession(TEST_SECRET, tampered)).toBeNull();
  });

  it("returns null for a wrong secret", async () => {
    const sealed = await sealSession(TEST_SECRET, sampleSession);
    expect(await openSession("wrong-secret-that-is-long-enough!!", sealed)).toBeNull();
  });

  it("round-trips a personal (BYOT) session", async () => {
    const personal: SessionData = { ...sampleSession, personal: true };
    const sealed = await sealSession(TEST_SECRET, personal);
    const opened = await openSession(TEST_SECRET, sealed);
    expect(opened?.personal).toBe(true);
  });

  it("round-trips a session with homeTimezone", async () => {
    const withTz: SessionData = { ...sampleSession, homeTimezone: "Asia/Tokyo" };
    const sealed = await sealSession(TEST_SECRET, withTz);
    const opened = await openSession(TEST_SECRET, sealed);
    expect(opened?.homeTimezone).toBe("Asia/Tokyo");
  });
});

describe("writeSession", () => {
  it("writes an encrypted session cookie", async () => {
    const cookies = fakeCookies();
    await writeSession(cookies, fakeEvent, TEST_SECRET, sampleSession);
    expect(cookies._store.has(SESSION_COOKIE)).toBe(true);
    // The cookie value should be encrypted (not plaintext JSON)
    const entry = cookies._store.get(SESSION_COOKIE)!;
    expect(entry.value).not.toContain('"user"');
    // But should be openable
    const opened = await openSession(TEST_SECRET, entry.value);
    expect(opened?.user.id).toBe(42);
  });

  it("sets httpOnly, secure, sameSite, and path on HTTPS", async () => {
    const cookies = fakeCookies();
    await writeSession(cookies, fakeEvent, TEST_SECRET, sampleSession);
    const entry = cookies._store.get(SESSION_COOKIE)!;
    expect(entry.opts).toMatchObject({
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });
    expect(typeof entry.opts.maxAge).toBe("number");
    expect(entry.opts.maxAge).toBeGreaterThan(0);
  });

  it("sets secure=false on HTTP (localhost)", async () => {
    const cookies = fakeCookies();
    await writeSession(cookies, fakeEventHttp, TEST_SECRET, sampleSession);
    const entry = cookies._store.get(SESSION_COOKIE)!;
    expect(entry.opts.secure).toBe(false);
  });
});

describe("destroySession", () => {
  it("clears the session cookie", () => {
    const cookies = fakeCookies();
    cookies.set(SESSION_COOKIE, "some-value", {});
    destroySession(cookies, fakeEvent);
    expect(cookies._store.has(SESSION_COOKIE)).toBe(false);
  });
});

describe("cookie name constants", () => {
  it("exports the expected cookie names", () => {
    expect(SESSION_COOKIE).toBe("rp_session");
    expect(TOKEN_COOKIE).toBe("rp_tok");
    expect(OAUTH_STATE_COOKIE).toBe("rp_oauth_state");
  });
});
