import { describe, expect, it } from "vite-plus/test";
import { load } from "./+layout.server";

function fakeEvent(opts: { clientId?: string } = {}) {
  return {
    locals: {
      user: null,
      demo: true,
      lang: "en",
      theme: "light",
    },
    platform: {
      env: opts.clientId === undefined ? {} : { CONCEPT2_CLIENT_ID: opts.clientId },
    },
  };
}

describe("load layout", () => {
  it("enables OAuth only when CONCEPT2_CLIENT_ID is configured", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enabled = await load(fakeEvent({ clientId: "cid" }) as any);
    expect(enabled.oauthEnabled).toBe(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const disabled = await load(fakeEvent({ clientId: "" }) as any);
    expect(disabled.oauthEnabled).toBe(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const missing = await load(fakeEvent() as any);
    expect(missing.oauthEnabled).toBe(false);
  });

  it("forwards locale, theme, and demo identity from locals", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await load(fakeEvent() as any);
    expect(data.demo).toBe(true);
    expect(data.user).toBeNull();
    expect(data.lang).toBe("en");
    expect(data.theme).toBe("light");
  });
});
