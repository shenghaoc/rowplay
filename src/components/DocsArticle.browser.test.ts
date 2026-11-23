import { afterEach, describe, expect, it } from "vite-plus/test";
import { mount, unmount } from "svelte";
import DocsArticle from "./DocsArticle.svelte";

let component: ReturnType<typeof mount>;
let container: HTMLDivElement;

afterEach(async () => {
  if (component) await unmount(component);
  container?.remove();
});

describe("guide navigation", () => {
  it.each([
    ["/docs/faq?lang=de#details", "/docs/faq?lang=de#details"],
    ["#details", "#details"],
    ["/replay/1001", "/replay/1001"],
  ])("preserves %s", async (href, expected) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    component = mount(DocsArticle, {
      target: container,
      props: { markdown: `[Guide](${href})`, label: "Guide" },
    });
    await expect.poll(() => container.querySelector("a")?.getAttribute("href")).toBe(expected);
  });
});
