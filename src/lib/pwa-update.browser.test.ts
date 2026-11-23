import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { flushSync } from "svelte";
import type { I18n } from "./i18n.svelte";
import { updateState } from "../../tests/fixtures/updated.svelte";

vi.mock("$app/state", async () => {
  const { updateState } = await import("../../tests/fixtures/updated.svelte");
  return {
    updated: {
      get current() {
        return updateState.current;
      },
      check: vi.fn(async () => updateState.current),
    },
  };
});
vi.mock("svelte-sonner", () => ({ toast: { info: vi.fn() } }));

import { updated } from "$app/state";
import { toast } from "svelte-sonner";
import { initPwaUpdate } from "./pwa-update.svelte";

class Worker extends EventTarget {
  state = "installing";
  postMessage = vi.fn();
}
class Registration extends EventTarget {
  waiting: Worker | null = null;
  installing: Worker | null = null;
  update = vi.fn(async () => this);
}
class Container extends EventTarget {
  controller: Worker | null = new Worker();
  ready: Promise<Registration>;
  constructor(registration: Registration) {
    super();
    this.ready = Promise.resolve(registration);
  }
}

let registration: Registration;
let container: Container;
let cleanup: ReturnType<typeof initPwaUpdate>;
let checkMock: ReturnType<typeof vi.spyOn>;
const i18n = { t: (key: string) => key } as I18n;

beforeEach(() => {
  vi.clearAllMocks();
  checkMock = vi.spyOn(updated, "check");
  vi.stubEnv("PROD", true);
  updateState.current = false;
  registration = new Registration();
  container = new Container(registration);
  vi.spyOn(navigator, "serviceWorker", "get").mockReturnValue(container as never);
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function start() {
  cleanup = initPwaUpdate(i18n);
  await Promise.resolve();
  flushSync();
  await Promise.resolve();
}

describe("Kit-driven PWA update prompt", () => {
  it("waits for Kit's reactive version state and prompts only once for repeated worker events", async () => {
    registration.waiting = new Worker();
    await start();
    expect(toast.info).not.toHaveBeenCalled();
    updateState.current = true;
    flushSync();
    await expect.poll(() => vi.mocked(toast.info).mock.calls.length).toBe(1);
    registration.installing = new Worker();
    registration.dispatchEvent(new Event("updatefound"));
    registration.installing.state = "installed";
    registration.installing.dispatchEvent(new Event("statechange"));
    await Promise.resolve();
    await Promise.resolve();
    expect(toast.info).toHaveBeenCalledOnce();
    expect(toast.info).toHaveBeenCalledWith(
      "pwa.updateAvailable",
      expect.objectContaining({ duration: Infinity }),
    );
  });

  it("activates a waiting worker only when the user chooses Reload", async () => {
    const worker = new Worker();
    registration.waiting = worker;
    updateState.current = true;
    await start();
    await expect.poll(() => vi.mocked(toast.info).mock.calls.length).toBe(1);
    container.dispatchEvent(new Event("controllerchange"));
    expect(worker.postMessage).not.toHaveBeenCalled();
    const options = vi.mocked(toast.info).mock.calls[0][1]!;
    const action = options.action as { label: string; onClick: () => void };
    expect(action.label).toBe("pwa.reload");
    action.onClick();
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({ type: "SKIP_WAITING" });
  });

  it("does not prompt during first install without a controlling worker", async () => {
    registration.waiting = new Worker();
    container.controller = null;
    updateState.current = true;
    await start();
    await Promise.resolve();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("retries an offline worker update on the hourly backstop even after Kit detects a version", async () => {
    vi.useFakeTimers();
    updateState.current = true;
    registration.update.mockRejectedValueOnce(new TypeError("offline"));
    await start();
    await Promise.resolve();
    registration.waiting = new Worker();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(registration.update.mock.calls.length).toBeGreaterThan(1);
    expect(toast.info).toHaveBeenCalledOnce();
    cleanup?.();
    cleanup = undefined;
    const calls = registration.update.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(registration.update).toHaveBeenCalledTimes(calls);
  });

  it("does not start background work if unmounted before service-worker readiness", async () => {
    let ready!: (registration: Registration) => void;
    container.ready = new Promise((resolve) => {
      ready = resolve;
    });
    cleanup = initPwaUpdate(i18n);
    cleanup?.();
    cleanup = undefined;
    ready(registration);
    await Promise.resolve();
    expect(checkMock).not.toHaveBeenCalled();
    expect(registration.update).not.toHaveBeenCalled();
  });

  it("keeps development mode free of update listeners and requests", async () => {
    vi.stubEnv("PROD", false);
    expect(initPwaUpdate(i18n)).toBeUndefined();
    await Promise.resolve();
    expect(checkMock).not.toHaveBeenCalled();
  });
});
