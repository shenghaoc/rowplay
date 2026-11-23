import { describe, expect, it } from "vite-plus/test";
import { setWorkerEnv } from "../../tests/setup";
import { load } from "./+layout.server";

const event = { locals: { user: null, demo: true, lang: "de", theme: "dark" } };

describe("layout Worker bindings", () => {
  it("enables OAuth from native bindings without event.platform", async () => {
    setWorkerEnv({ CONCEPT2_CLIENT_ID: "synthetic-client" });
    expect(await load(event as never)).toEqual({ ...event.locals, oauthEnabled: true });
  });

  it("preserves demo mode and SSR preferences when OAuth is unconfigured", async () => {
    expect(await load(event as never)).toEqual({ ...event.locals, oauthEnabled: false });
  });
});
