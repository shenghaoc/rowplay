import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { mount, unmount } from "svelte";

vi.mock("$app/navigation", () => ({ refreshAll: vi.fn() }));
vi.mock("#lib/i18n.svelte.ts", () => ({
  getI18nContext: () => ({ lang: "en", t: (key: string) => key }),
}));
vi.mock("svelte-sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { refreshAll } from "$app/navigation";
import { toast } from "svelte-sonner";
import EngagementPanel from "./EngagementPanel.svelte";

let component: ReturnType<typeof mount>;
let container: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(refreshAll).mockResolvedValue();
});

afterEach(async () => {
  if (component) await unmount(component);
  container?.remove();
  vi.restoreAllMocks();
});

function renderGoal() {
  container = document.createElement("div");
  document.body.appendChild(container);
  component = mount(EngagementPanel, {
    target: container,
    props: {
      workouts: [],
      annualGoal: { year: 2026, kind: "meters", target: 1000000 },
      goalYear: 2026,
      endDay: "2026-10-09",
    },
  });
  return container.querySelector<HTMLButtonElement>("button.btn-primary")!;
}

describe("annual goal refresh", () => {
  it("refreshes page loads after the unchanged goal request and reports success", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ goal: { year: 2026, kind: "meters", target: 1000000 } }));
    const button = renderGoal();
    button.click();
    await expect.poll(() => vi.mocked(toast.success).mock.calls.length).toBe(1);
    expect(fetch).toHaveBeenCalledWith("/api/goals", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: '{"year":2026,"kind":"meters","target":1000000}',
    });
    expect(refreshAll).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(false);
    expect(toast.success).toHaveBeenCalledWith("dashboard.goalsSaved");
  });

  it("keeps failed saves out of the refresh path and restores the control", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("failed", { status: 500 }));
    const button = renderGoal();
    button.click();
    await expect.poll(() => vi.mocked(toast.error).mock.calls.length).toBe(1);
    expect(refreshAll).not.toHaveBeenCalled();
    expect(button.disabled).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("dashboard.goalsSaveFailed");
  });
});
