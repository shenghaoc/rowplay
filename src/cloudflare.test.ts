import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import type { env } from "cloudflare:workers";

// Each directive must become an error if generated runtime globals enter the DOM project.
// @ts-expect-error Worker-only globals must remain scoped to module imports.
type WorkerContextMustRemainScoped = ExecutionContext;
// @ts-expect-error Worker-only globals must remain scoped to module imports.
type WorkerStorageMustRemainScoped = R2Bucket;

export type WorkerIsolationGuard = [WorkerContextMustRemainScoped, WorkerStorageMustRemainScoped];

describe("scoped Cloudflare bindings", () => {
  it("retains DOM Request options and native JSON object responses", async () => {
    expectTypeOf<Request>().toHaveProperty("cache");
    expectTypeOf<Request>().toHaveProperty("credentials");
    const request = new Request("https://example.invalid", {
      cache: "no-store",
      credentials: "omit",
    });
    expect(request.cache).toBe("no-store");
    expect(request.credentials).toBe("omit");
    const response = Response.json({ ok: true }, { status: 201 });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("keeps native asset and secret bindings typed without reading any secrets", () => {
    expectTypeOf<(typeof env)["ASSETS"]["fetch"]>().toBeFunction();
    expectTypeOf<(typeof env)["SESSION_SECRET"]>().toBeString();
    expectTypeOf<(typeof env)["CONCEPT2_CLIENT_SECRET"]>().toBeString();
    expectTypeOf<(typeof env)["ERGDATA_WEBHOOK_SECRET"]>().toEqualTypeOf<string | undefined>();
  });
});
