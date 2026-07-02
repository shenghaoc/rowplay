import { describe, expect, it } from "vite-plus/test";
import {
  destroySession,
  newSessionId,
  readSession,
  writeSession,
  SESSION_COOKIE,
  TOKEN_COOKIE,
  OAUTH_STATE_COOKIE,
} from "./session";
import type { SessionData } from "./session";

/** Minimal in-memory KV stub. */
function fakeKv() {
  const store = new Map<string, string>();
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string, _opts?: unknown) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    _store: store,
  };
}

const sampleSession: SessionData = {
  user: { id: 42, username: "alice", firstName: "Alice" },
  tokens: {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 3600_000,
    scope: "user:read,results:read",
  },
};

describe("newSessionId", () => {
  it("returns a non-empty string", () => {
    expect(typeof newSessionId()).toBe("string");
    expect(newSessionId().length).toBeGreaterThan(0);
  });

  it("produces unique IDs on repeated calls", () => {
    const a = newSessionId();
    const b = newSessionId();
    expect(a).not.toBe(b);
  });

  it("contains only hex characters and hyphens", () => {
    expect(newSessionId()).toMatch(/^[0-9a-f-]+$/);
  });
});

describe("writeSession / readSession", () => {
  it("stores and retrieves a session", async () => {
    const kv = fakeKv();
    await writeSession(kv as never, "sid-1", sampleSession);
    const result = await readSession(kv as never, "sid-1");
    expect(result).toEqual(sampleSession);
  });

  it("returns null for a non-existent session id", async () => {
    const kv = fakeKv();
    expect(await readSession(kv as never, "no-such-id")).toBeNull();
  });

  it('stores the session under the "sess:" prefix', async () => {
    const kv = fakeKv();
    await writeSession(kv as never, "abc", sampleSession);
    expect(kv._store.has("sess:abc")).toBe(true);
    expect(kv._store.has("abc")).toBe(false);
  });

  it("round-trips a personal (BYOT) session", async () => {
    const kv = fakeKv();
    const personal: SessionData = { ...sampleSession, personal: true };
    await writeSession(kv as never, "sid-byot", personal);
    const result = await readSession(kv as never, "sid-byot");
    expect(result?.personal).toBe(true);
  });

  it("returns null when the stored value is corrupt JSON", async () => {
    const kv = fakeKv();
    kv._store.set("sess:bad", "not-json{");
    expect(await readSession(kv as never, "bad")).toBeNull();
  });
});

describe("destroySession", () => {
  it("removes the session so a subsequent read returns null", async () => {
    const kv = fakeKv();
    await writeSession(kv as never, "sid-del", sampleSession);
    await destroySession(kv as never, "sid-del");
    expect(await readSession(kv as never, "sid-del")).toBeNull();
  });

  it("is idempotent — does not throw for a non-existent session", async () => {
    const kv = fakeKv();
    await expect(destroySession(kv as never, "missing-id")).resolves.toBeUndefined();
  });
});

describe("cookie name constants", () => {
  it("exports the expected cookie names", () => {
    expect(SESSION_COOKIE).toBe("rp_session");
    expect(TOKEN_COOKIE).toBe("rp_tok");
    expect(OAUTH_STATE_COOKIE).toBe("rp_oauth_state");
  });
});
