import { flushSync, mount, unmount } from "svelte";
import { expect, it, vi } from "vite-plus/test";
import { distancePBs } from "#lib/analytics.ts";
import { workout } from "../../tests/unit/fixtures";
import PerformancePredictorCard from "./PerformancePredictorCard.svelte";

vi.mock("#lib/i18n.svelte.ts", () => ({
  getI18nContext: () => ({ translate: (key: string) => key }),
}));

it("prefills the predictor with the nominal 2k time of the pace winner", async () => {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const component = mount(PerformancePredictorCard, {
    target,
    props: {
      personalBests: distancePBs([
        workout({ id: 1, distance: 2000, time: 419, pace: 419 / 4 }),
        workout({ id: 2, distance: 2040, time: 421, pace: (421 * 500) / 2040 }),
      ]),
    },
  });

  try {
    flushSync(() => target.querySelector("button")!.click());
    expect(target.querySelector("select")?.value).toBe("2000");
    expect(target.querySelector("input")?.value).toBe("6:52.7");
  } finally {
    await unmount(component);
    target.remove();
  }
});
