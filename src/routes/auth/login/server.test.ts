import { describe, expect, it, vi, beforeEach } from "vite-plus/test";

vi.mock("#lib/server/config.ts", () => ({
  getConfig: vi.fn(),
}));
vi.mock("#lib/server/concept2.ts", () => ({
  buildAuthorizeUrl: vi.fn().mockReturnValue("https://log.concept2.com/oauth/authorize?state=test"),
}));

import { GET } from "./+server";
import { getConfig } from "#lib/server/config.ts";
import { buildAuthorizeUrl } from "#lib/server/concept2.ts";

beforeEach(() => {
  vi.mocked(buildAuthorizeUrl).mockReturnValue(
    "https://log.concept2.com/oauth/authorize?state=test",
  );
});

function fakeEvent() {
  const set: Record<string, string> = {};
  return {
    event: {
      cookies: {
        set: (name: string, val: string) => {
          set[name] = val;
        },
      },
      url: new URL("http://localhost/auth/login"),
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
    (getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
      clientId: "myClientId",
      baseUrl: "https://log.concept2.com",
    });
    const { event } = fakeEvent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = GET(event as any);
    await expect(p).rejects.toMatchObject({
      status: 302,
      location: "https://log.concept2.com/oauth/authorize?state=test",
    });
  });
});

it("allows the configured Concept2 sandbox OAuth origin", async () => {
  vi.mocked(getConfig).mockReturnValue({
    clientId: "test-client",
    clientSecret: "",
    baseUrl: "https://log-dev.concept2.com",
    appUrl: "http://localhost",
  });
  vi.mocked(buildAuthorizeUrl).mockReturnValue(
    "https://log-dev.concept2.com/oauth/authorize?state=test",
  );
  await expect(GET(fakeEvent().event as never)).rejects.toMatchObject({
    status: 302,
    location: "https://log-dev.concept2.com/oauth/authorize?state=test",
  });
});

it("rejects OAuth redirect URLs outside the configured origin", async () => {
  vi.mocked(getConfig).mockReturnValue({
    clientId: "test-client",
    clientSecret: "",
    baseUrl: "https://log.concept2.com",
    appUrl: "http://localhost",
  });
  vi.mocked(buildAuthorizeUrl).mockReturnValue("https://unexpected.example/oauth/authorize");
  await expect(GET(fakeEvent().event as never)).rejects.toThrow(
    "redirect_external_not_in_allowlist",
  );
});
