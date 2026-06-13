/**
 * Vitest Browser Mode tests for ChipButton — verifies click behaviour,
 * disabled state, and ARIA attributes in a real browser DOM.
 */
import { describe, it, expect, afterEach, vi } from "vite-plus/test";
import { mount, unmount, createRawSnippet } from "svelte";
import ChipButton from "./ChipButton.svelte";

let container: HTMLDivElement;
let component: ReturnType<typeof mount>;

function renderButton(props: {
  active?: boolean;
  disabled?: boolean;
  ariaPressed?: boolean;
  onclick?: (e: MouseEvent) => void;
  label?: string;
}): void {
  container = document.createElement("div");
  document.body.appendChild(container);

  const children = createRawSnippet(() => ({
    render: () => `<span>${props.label ?? "Click"}</span>`,
  }));

  component = mount(ChipButton, {
    target: container,
    props: {
      active: props.active ?? false,
      disabled: props.disabled ?? false,
      ariaPressed: props.ariaPressed,
      onclick: props.onclick,
      children,
    },
  });
}

afterEach(() => {
  if (component) unmount(component);
  if (container?.isConnected) container.remove();
});

describe("ChipButton — browser interaction", () => {
  it("renders children text", () => {
    renderButton({ label: "Pace" });
    const btn = container.querySelector("button")!;
    expect(btn.textContent).toContain("Pace");
  });

  it("fires onclick when clicked", () => {
    const onclick = vi.fn();
    renderButton({ onclick });
    const btn = container.querySelector("button")!;

    btn.click();
    expect(onclick).toHaveBeenCalledOnce();
  });

  it("does not fire onclick when disabled", () => {
    const onclick = vi.fn();
    renderButton({ onclick, disabled: true });
    const btn = container.querySelector("button")!;

    btn.click();
    expect(onclick).not.toHaveBeenCalled();
  });

  it("sets aria-pressed to the active prop by default", () => {
    renderButton({ active: true });
    const btn = container.querySelector("button")!;

    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("sets aria-pressed=false when not active", () => {
    renderButton({ active: false });
    const btn = container.querySelector("button")!;

    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });

  it("allows overriding aria-pressed explicitly", () => {
    renderButton({ active: false, ariaPressed: true });
    const btn = container.querySelector("button")!;

    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });
});
