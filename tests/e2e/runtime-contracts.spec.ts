import { expect, test } from "@playwright/test";

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
    headers: { Origin: new URL(baseURL!).origin },
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
    headers: { Origin: new URL(baseURL!).origin },
  });
  expect(retired.status()).toBe(410);
});
