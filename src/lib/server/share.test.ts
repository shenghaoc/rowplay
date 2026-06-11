import { describe, expect, it } from "vite-plus/test";
import { mockWorkoutDetail } from "../mockData";
import { createWorkoutShare, loadSharedWorkout, redactForPublic } from "./share";

describe("redactForPublic", () => {
  it("removes serial number and device from metadata", () => {
    const detail = mockWorkoutDetail(1005)!;
    expect(detail.metadata?.serialNumber).toBeTruthy();
    const redacted = redactForPublic(detail);
    expect(redacted.metadata?.serialNumber).toBeUndefined();
    expect(redacted.metadata?.device).toBeUndefined();
    expect(redacted.metadata?.deviceOs).toBeUndefined();
    expect(redacted.metadata?.deviceOsVersion).toBeUndefined();
    expect(redacted.metadata?.pmVersion).toBe(detail.metadata?.pmVersion);
  });

  it("leaves detail unchanged when metadata is absent", () => {
    const detail = mockWorkoutDetail(1001)!;
    expect(redactForPublic(detail).metadata).toBeUndefined();
  });
});

describe("createWorkoutShare privacy guard", () => {
  function demoEvent() {
    const store = new Map<string, string>();
    const kv = {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => {
        store.set(k, v);
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return {
      locals: { demo: true, user: null },
      platform: { env: { SESSIONS: kv, PUBLIC_APP_URL: "https://share.test" } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it("refuses a non-public workout with a 403", async () => {
    // Demo workout 1002 is marked privacy: 'private'.
    await expect(createWorkoutShare(demoEvent(), 1002)).rejects.toMatchObject({ status: 403 });
  });

  it("refuses even when a share token already exists for a now-private workout", async () => {
    const event = demoEvent();
    // Pre-seed the reverse index as if 1002 had been shared while public; the
    // privacy guard must still fire before the existing token is returned.
    await event.platform.env.SESSIONS.put("share:demo:1002", "preexisting-token");
    await expect(createWorkoutShare(event, 1002)).rejects.toMatchObject({ status: 403 });
  });

  it("mints a link for a public (everyone) workout", async () => {
    // Demo workouts default to privacy: 'everyone'.
    const share = await createWorkoutShare(demoEvent(), 1001);
    expect(share.token).toMatch(/^[0-9a-f]{48}$/);
    expect(share.path).toBe(`/r/${share.token}`);
    expect(share.url).toBe(`https://share.test/r/${share.token}`);
    expect(share.created).toBe(true);
  });
});

describe("loadSharedWorkout privacy re-check", () => {
  // Seed a demo share pointer (the KV redemption path) for a given workout.
  function eventWithShare(workoutId: number) {
    const token = "a".repeat(48);
    const store = new Map<string, string>([
      [`share:${token}`, JSON.stringify({ demo: true, workoutId })],
    ]);
    const kv = { get: async (k: string) => store.get(k) ?? null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = { platform: { env: { SESSIONS: kv, DB: undefined } } } as any;
    return { event, token };
  }

  it("refuses a previously-public link once the workout is non-public", async () => {
    const { event, token } = eventWithShare(1002); // privacy: 'private'
    await expect(loadSharedWorkout(event, token)).rejects.toMatchObject({ status: 403 });
  });

  it("still serves a public shared workout, redacted", async () => {
    const { event, token } = eventWithShare(1005); // privacy: 'everyone', has metadata
    const detail = await loadSharedWorkout(event, token);
    expect(detail.id).toBe(1005);
    expect(detail.metadata?.serialNumber).toBeUndefined();
  });
});
