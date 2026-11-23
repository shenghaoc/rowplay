import { expect, test } from "@playwright/test";

/** Exercise the real compiled Kit update state; only the waiting SW is synthetic. */
test("Kit version detection offers one prompt and activates only on Reload", async ({
  page,
  request,
}) => {
  const response = await request.get("/_app/version.json");
  expect(response.status()).toBe(200);
  const current = (await response.json()) as { version: string };
  let newVersion = false;
  await page.route("**/_app/version.json", (route) =>
    route.fulfill({
      json: { version: newVersion ? `${current.version}-synthetic-update` : current.version },
    }),
  );
  await page.addInitScript(() => {
    const messages: unknown[] = [];
    const probe = { messages, updates: 0 };
    Object.defineProperty(window, "__rowplayPwaProbe", { value: probe });
    const registration = Object.assign(new EventTarget(), {
      waiting: { postMessage: (message: unknown) => messages.push(message) },
      installing: null,
      update: async () => {
        probe.updates++;
      },
    });
    const container = Object.assign(new EventTarget(), {
      controller: {},
      ready: Promise.resolve(registration),
      register: async () => registration,
    });
    Object.defineProperty(navigator, "serviceWorker", { value: container });
  });

  await page.goto("/dashboard");
  await expect(page.locator("html")).toHaveAttribute("data-app-hydrated", "true");
  const prompt = page.getByText("A new version of rowplay is ready.", { exact: true });
  await expect(prompt).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "__rowplayPwaProbe").updates))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => Reflect.get(window, "__rowplayPwaProbe").messages)).toEqual([]);

  newVersion = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(prompt).toHaveCount(1);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    navigator.serviceWorker.dispatchEvent(new Event("controllerchange"));
  });
  await expect(prompt).toHaveCount(1);
  expect(await page.evaluate(() => Reflect.get(window, "__rowplayPwaProbe").messages)).toEqual([]);
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  expect(await page.evaluate(() => Reflect.get(window, "__rowplayPwaProbe").messages)).toEqual([
    { type: "SKIP_WAITING" },
  ]);
});
