import { updated } from "$app/state";
import { toast } from "svelte-sonner";
import type { I18n } from "#lib/i18n.svelte.ts";

/** Kit detects versions; the service worker still needs an explicit fetch/retry backstop. */
export function initPwaUpdate(i18n: I18n) {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  return $effect.root(() => {
    const container = navigator.serviceWorker;
    let registration = $state.raw<ServiceWorkerRegistration>();
    let disposed = false;
    let prompted = false;
    let reloadAfterUpdate = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    let refreshing: Promise<void> | undefined;
    const removeListeners: (() => void)[] = [];

    function listen(target: EventTarget, name: string, listener: EventListener) {
      target.addEventListener(name, listener);
      removeListeners.push(() => target.removeEventListener(name, listener));
    }

    function prompt() {
      if (
        disposed ||
        prompted ||
        !updated.current ||
        !registration?.waiting ||
        !container.controller
      )
        return;
      prompted = true;
      toast.info(i18n.t("pwa.updateAvailable"), {
        duration: Infinity,
        action: {
          label: i18n.t("pwa.reload"),
          onClick: () => {
            if (!registration?.waiting) return;
            reloadAfterUpdate = true;
            registration.waiting.postMessage({ type: "SKIP_WAITING" });
          },
        },
      });
    }

    function refreshWorker() {
      if (!registration || disposed) return Promise.resolve();
      return (refreshing ??= (async () => {
        try {
          await registration.update();
        } catch {
          // An installed PWA can be offline; retry on the next hourly check.
        } finally {
          refreshing = undefined;
        }
        prompt();
      })());
    }

    async function check() {
      await updated.check();
      if (!disposed) await refreshWorker();
    }

    listen(container, "controllerchange", () => {
      if (reloadAfterUpdate) location.reload();
    });

    $effect(() => {
      if (updated.current && registration) void refreshWorker();
    });

    void container.ready.then((ready) => {
      if (disposed) return;
      registration = ready;
      listen(ready, "updatefound", () => {
        const worker = ready.installing;
        if (!worker) return;
        listen(worker, "statechange", () => {
          if (worker.state === "installed") void check();
        });
      });
      void check();
      // Kit stops polling after detecting a version, and never updates the SW itself.
      interval = setInterval(() => void check(), 60 * 60 * 1000);
    });

    return () => {
      disposed = true;
      clearInterval(interval);
      for (const remove of removeListeners) remove();
    };
  });
}
