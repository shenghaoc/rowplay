import { setWorkerEnv } from "../tests/setup";
import { sealSession } from "#lib/server/session.ts";
import { describe, expect, it, vi } from "vite-plus/test";

/**
 * Security header tests for hooks.server.ts.
 *
 * We test through the exported `handle` function, constructing a minimal
 * SvelteKit RequestEvent and a passthrough resolve that returns a clean
 * Response so we can inspect which headers were applied.
 */

// Import the module directly so these tests exercise the real hook defaults.
import { handle, handleError } from "./hooks.server";

/** Build a minimal RequestEvent for the hook. */
function fakeEvent(
  opts: {
    protocol?: string;
    hostname?: string;
    path?: string;
    sessionCookie?: string | null;
    langCookie?: string | null;
    themeCookie?: string | null;
  } = {},
) {
  const protocol = opts.protocol ?? "https:";
  const hostname = opts.hostname ?? "rowplay.shenghaoc.workers.dev";
  const path = opts.path ?? "/dashboard";
  const cookies = new Map<string, string>();
  if (opts.sessionCookie) cookies.set("rp_session", opts.sessionCookie);
  if (opts.langCookie) cookies.set("lang", opts.langCookie);
  if (opts.themeCookie) cookies.set("theme", opts.themeCookie);

  return {
    url: new URL(`${protocol}//${hostname}${path}`),
    cookies: {
      get: (name: string) => cookies.get(name) ?? null,
    },
    locals: {} as Record<string, unknown>,
  };
}

function passthroughResolve() {
  return async () => {
    return new Response("<html></html>", {
      headers: { "content-type": "text/html" },
    });
  };
}

async function getResponseHeaders(opts: Parameters<typeof fakeEvent>[0] = {}): Promise<Headers> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const event = fakeEvent(opts) as any;
  const response = await handle({ event, resolve: passthroughResolve() });
  return response.headers;
}

describe("security headers", () => {
  it("applies X-Frame-Options: DENY", async () => {
    const headers = await getResponseHeaders();
    expect(headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("applies X-Content-Type-Options: nosniff", async () => {
    const headers = await getResponseHeaders();
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("applies Referrer-Policy: strict-origin-when-cross-origin", async () => {
    const headers = await getResponseHeaders();
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("applies Permissions-Policy denying geolocation, camera, microphone", async () => {
    const headers = await getResponseHeaders();
    expect(headers.get("Permissions-Policy")).toBe("geolocation=(), camera=(), microphone=()");
  });

  it("applies Cross-Origin-Opener-Policy: same-origin", async () => {
    const headers = await getResponseHeaders();
    expect(headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
  });

  it("includes a report-only CSP", async () => {
    const headers = await getResponseHeaders();
    const csp = headers.get("Content-Security-Policy-Report-Only");
    expect(csp).toBeTruthy();
    // Verify the key directives are present
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("does not include frame-ancestors or form-action (browsers ignore in report-only)", async () => {
    const headers = await getResponseHeaders();
    const csp = headers.get("Content-Security-Policy-Report-Only")!;
    expect(csp).not.toContain("frame-ancestors");
    expect(csp).not.toContain("form-action");
  });

  it("does not allow unsafe-eval in script-src", async () => {
    const headers = await getResponseHeaders();
    const csp = headers.get("Content-Security-Policy-Report-Only")!;
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("font-src allows data: for @fontsource base64 preloads but no wildcard sources", async () => {
    // font-src 'self' https://fonts.gstatic.com data: — data: is needed for
    // inline base64 font preloads from @fontsource. Verify no wildcard src.
    const headers = await getResponseHeaders();
    const csp = headers.get("Content-Security-Policy-Report-Only")!;
    expect(csp).toContain("font-src 'self' https://fonts.gstatic.com data:");
    // No '*' or overly broad sources
    expect(csp).not.toMatch(/font-src.*\*/);
  });

  it("allows Google Fonts for CJK stylesheets and font files", async () => {
    const headers = await getResponseHeaders();
    const csp = headers.get("Content-Security-Policy-Report-Only")!;
    expect(csp).toContain("https://fonts.googleapis.com");
    expect(csp).toContain("https://fonts.gstatic.com");
  });

  it("does not override headers explicitly set by a route", async () => {
    // Simulate a route that set its own X-Frame-Options (e.g. ALLOW-FROM for
    // an embeddable page).
    const resolve = async () => {
      return new Response("<html></html>", {
        headers: { "X-Frame-Options": "ALLOW-FROM https://example.com" },
      });
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = fakeEvent() as any;
    const response = await handle({ event, resolve });
    // Route override preserved
    expect(response.headers.get("X-Frame-Options")).toBe("ALLOW-FROM https://example.com");
    // But other defaults still applied
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});

describe("HSTS", () => {
  it("sends Strict-Transport-Security on https:// production host", async () => {
    const headers = await getResponseHeaders({
      protocol: "https:",
      hostname: "rowplay.shenghaoc.workers.dev",
    });
    expect(headers.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
  });

  it("does NOT send HSTS on http:// (wrangler dev)", async () => {
    const headers = await getResponseHeaders({
      protocol: "http:",
      hostname: "127.0.0.1",
    });
    expect(headers.get("Strict-Transport-Security")).toBeNull();
  });

  it("does NOT send HSTS when hostname is localhost", async () => {
    const headers = await getResponseHeaders({
      protocol: "https:",
      hostname: "localhost",
    });
    expect(headers.get("Strict-Transport-Security")).toBeNull();
  });

  it("does NOT send HSTS when hostname is 127.0.0.1", async () => {
    const headers = await getResponseHeaders({
      protocol: "https:",
      hostname: "127.0.0.1",
    });
    expect(headers.get("Strict-Transport-Security")).toBeNull();
  });

  it("does NOT send HSTS when hostname is [::1]", async () => {
    const headers = await getResponseHeaders({
      protocol: "https:",
      hostname: "[::1]",
    });
    expect(headers.get("Strict-Transport-Security")).toBeNull();
  });
});

describe("immutable header fallback", () => {
  it("rebuilds response when headers are immutable (fetch passthrough)", async () => {
    // Simulate a resolve that returns a fetch Response (immutable headers).
    // Calling .set() on such a response throws TypeError.
    const original = new Response("<html></html>", {
      headers: { "content-type": "text/html" },
    });
    // Make headers immutable — Object.defineProperty alone isn't enough;
    // we simulate the TypeError that occurs with real fetch responses.
    const resolve = async () => {
      // Create a response whose headers.set throws TypeError
      const res = new Response(original.body, {
        status: original.status,
        statusText: original.statusText,
        headers: original.headers,
      });
      // Override set to throw on the *same* response object (mimicking
      // immutable headers from a passthrough fetch).
      const origSet = res.headers.set.bind(res.headers);
      let first = true;
      res.headers.set = function (...args: Parameters<Headers["set"]>) {
        if (first) {
          first = false;
          throw new TypeError("Can't modify immutable headers");
        }
        return origSet(...args);
      } as Headers["set"];
      return res;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = fakeEvent() as any;
    const response = await handle({ event, resolve });
    // Headers should still be applied after the rebuild
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});

describe("session loading", () => {
  it("defaults to demo mode when no session cookie is present", async () => {
    const resolve = async (event: any) => {
      expect(event.locals.demo).toBe(true);
      expect(event.locals.user).toBeNull();
      return new Response("<html></html>");
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = fakeEvent() as any;
    await handle({ event, resolve });
  });
});

describe("native Worker session bindings", () => {
  it("opens encrypted sessions without an event.platform", async () => {
    const secret = "local-sveltekit-3-session-test-secret";
    setWorkerEnv({ SESSION_SECRET: secret });
    const sessionCookie = await sealSession(secret, {
      user: { id: 7, username: "synthetic-athlete" },
      personal: true,
      tokens: { accessToken: "", refreshToken: "", expiresAt: 9999999999999, scope: "" },
    });
    const event = fakeEvent({ sessionCookie });
    await handle({ event: event as never, resolve: passthroughResolve() });
    expect(event.locals).toMatchObject({
      demo: false,
      personal: true,
      user: { id: 7, username: "synthetic-athlete" },
    });
  });

  it("keeps tampered sessions in demo mode", async () => {
    setWorkerEnv({ SESSION_SECRET: "local-sveltekit-3-session-test-secret" });
    const event = fakeEvent({ sessionCookie: "tampered" });
    await handle({ event: event as never, resolve: passthroughResolve() });
    expect(event.locals).toMatchObject({ demo: true, personal: false, user: null });
  });
});

describe("Kit 3 request error logging", () => {
  const privateEvent = {
    route: { id: "/api/workouts/[id=workoutId]" },
    get url() {
      throw new Error("Request URLs must not be read for logging");
    },
    get request() {
      throw new Error("Headers must not be read for logging");
    },
    get cookies() {
      throw new Error("Cookies must not be read for logging");
    },
    get locals() {
      throw new Error("Session contents must not be read for logging");
    },
  } as never;

  const expected: Parameters<typeof handleError>[0][] = [
    {
      kind: "app",
      error: { status: 400, message: "rp_tok=synthetic-private-cookie" },
      event: privateEvent,
    },
    { kind: "framework", error: { status: 404, message: "private-path" }, event: privateEvent },
    {
      kind: "validation",
      error: { status: 400, message: "Bad Request" },
      issues: [{ message: "private-input" }],
      event: privateEvent,
    },
  ];

  it.each(expected)(
    "logs $kind/$error.status metadata without overriding the expected response",
    (input) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        expect(handleError(input)).toBeUndefined();
        expect(warn).toHaveBeenCalledExactlyOnceWith("[sveltekit] request rejected", {
          kind: input.kind,
          status: (input.error as { status: number }).status,
          route: "/api/workouts/[id=workoutId]",
        });
        expect(error).not.toHaveBeenCalled();
      } finally {
        vi.restoreAllMocks();
      }
    },
  );

  it("logs unknown errors as 500 without their sensitive message, stack or cause", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const sensitive = new Error("Authorization: Bearer synthetic-private-token", {
        cause: new Error("rp_session=synthetic-session; SESSION_SECRET=synthetic-secret"),
      });
      expect(
        handleError({ kind: "unknown", error: sensitive, event: privateEvent }),
      ).toBeUndefined();
      expect(error).toHaveBeenCalledExactlyOnceWith("[sveltekit] request failed", {
        kind: "unknown",
        status: 500,
        route: "/api/workouts/[id=workoutId]",
      });
      expect(JSON.stringify(error.mock.calls)).not.toContain("synthetic");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("handles an unmatched framework route using null metadata", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(
        handleError({
          kind: "framework",
          error: { status: 404, message: "Not Found" },
          event: { route: { id: null } } as never,
        }),
      ).toBeUndefined();
      expect(warn).toHaveBeenCalledExactlyOnceWith("[sveltekit] request rejected", {
        kind: "framework",
        status: 404,
        route: null,
      });
    } finally {
      vi.restoreAllMocks();
    }
  });
});
