import { expect, test } from "@playwright/test";

test("native JSON keeps byte lengths and private response contracts", async ({
  request,
  baseURL,
}) => {
  for (const path of [
    "/api/workouts",
    "/api/workouts/1001",
    "/api/goals?year=2026",
    "/api/settings/timezone",
    "/api/sync",
  ]) {
    // Compare decoded bytes to their header before transport compression.
    const response = await request.get(path, { headers: { "Accept-Encoding": "identity" } });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/json");
    expect(response.headers()["content-length"]).toBe(String((await response.body()).byteLength));
    expect(response.headers()["set-cookie"]).toBeUndefined();
    if (path.startsWith("/api/workouts")) {
      expect(response.headers()["cache-control"]).toBe("private, no-store");
    }
  }
  const poll = await request.post("/api/live/poll", {
    data: {},
    headers: { Origin: new URL(baseURL!).origin, "Accept-Encoding": "identity" },
  });
  expect(poll.status()).toBe(200);
  expect(poll.headers()["cache-control"]).toBe("private, no-store");
  expect(poll.headers()["content-length"]).toBe(String((await poll.body()).byteLength));
  expect(await poll.json()).toEqual({ workouts: [], added: 0, total: 0, newPbs: [] });
});

/** Migration contracts on the built Worker, using only demo requests. */
test("SSR keeps locale, theme and security headers", async ({ request }) => {
  const response = await request.get("/dashboard", {
    headers: { Cookie: "lang=de; theme=dark" },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  const html = await response.text();
  expect(html).toContain('lang="de"');
  expect(html).toContain('data-theme="dark"');
});

test("demo auth redirects and invalid token actions keep their HTTP contracts", async ({
  request,
  baseURL,
}) => {
  const login = await request.get("/auth/login", { maxRedirects: 0 });
  expect(login.status()).toBe(303);
  expect(login.headers().location).toBe("/dashboard");

  // Empty tokens fail before any Concept2 request or session write.
  const emptyToken = await request.post("/auth/token", {
    form: { token: "" },
    headers: { Origin: new URL(baseURL!).origin, "Accept-Encoding": "identity" },
  });
  expect(emptyToken.status()).toBe(400);
  expect(emptyToken.headers()["set-cookie"]).toBeUndefined();
});

test("Worker rejects cross-origin mutations and preserves endpoint errors", async ({
  request,
  baseURL,
}) => {
  const crossOrigin = await request.post("/auth/token", {
    data: "token=synthetic-unused-token",
    headers: {
      Origin: "https://untrusted.example",
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  expect(crossOrigin.status()).toBe(403);

  const invalidWorkout = await request.get("/api/workouts/invalid");
  expect(invalidWorkout.status()).toBe(400);
  expect(await invalidWorkout.text()).toContain("Invalid workout id");

  const retired = await request.post("/api/sync", {
    headers: { Origin: new URL(baseURL!).origin, "Accept-Encoding": "identity" },
  });
  expect(retired.status()).toBe(410);
});

test("parsed workout IDs preserve endpoint and replay contracts", async ({ request, baseURL }) => {
  for (const route of ["/api/workouts", "/api/export"]) {
    for (const raw of ["invalid", "NaN", "Infinity", "-Infinity"]) {
      const response = await request.get(`${route}/${raw}`);
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({ status: 400, message: "Invalid workout id." });
    }
  }
  for (const raw of ["0", "-1", "1.5"]) {
    const detail = await request.get(`/api/workouts/${raw}`);
    expect(detail.status()).toBe(404);
    const exported = await request.get(`/api/export/${raw}`);
    expect(exported.status()).toBe(400);
    expect(await exported.json()).toEqual({ status: 400, message: "Invalid workout id." });
  }
  for (const raw of ["1001", "001001", "0x3e9", "1.001e3"]) {
    const detail = await request.get(`/api/workouts/${raw}`);
    expect(detail.status()).toBe(200);
    expect((await detail.json()).id).toBe(1001);
    const exported = await request.get(`/api/export/${raw}`);
    expect(exported.status()).toBe(200);
    expect(exported.headers()["content-disposition"]).toContain("workout-1001.tcx");
    const replay = await request.get(`/replay/${raw}`);
    expect(replay.status()).toBe(200);
  }
  const retired = await request.patch("/api/workouts/invalid/tag", {
    data: { tag: "synthetic" },
    headers: { Origin: new URL(baseURL!).origin },
  });
  expect(retired.status()).toBe(410);
  const missingReplay = await request.get("/replay/invalid");
  expect(missingReplay.status()).toBe(404);
});
