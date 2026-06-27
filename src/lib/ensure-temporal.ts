/** Loads `temporal-polyfill` only when the runtime lacks native Temporal (e.g. WebKit, Workers). */
let loading: Promise<void> | undefined;

// WebKit occasionally fails a fresh dynamic-chunk fetch ("Importing a module
// script failed"); since this runs at the top of hooks.client a single failure
// would reject app init. Retry with backoff before giving up.
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 50;

async function loadPolyfill(): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      await import("temporal-polyfill/global");
      return;
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, BASE_DELAY_MS * 2 ** attempt));
      }
    }
  }
  throw lastErr;
}

export function ensureTemporal(): Promise<void> {
  if (globalThis.Temporal) return Promise.resolve();
  loading ??= loadPolyfill();
  return loading;
}
