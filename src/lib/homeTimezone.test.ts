import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  HOME_TIMEZONE_STORAGE_KEY,
  clearHomeTimezoneClient,
  readHomeTimezoneClient,
  writeHomeTimezoneClient,
} from "./homeTimezone";

afterEach(() => vi.unstubAllGlobals());

function stubStore(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  });
  return store;
}

describe("home timezone client helpers", () => {
  it("round-trips a stored IANA zone through the dedicated key", () => {
    const store = stubStore();
    writeHomeTimezoneClient("Asia/Singapore");
    expect(store.get(HOME_TIMEZONE_STORAGE_KEY)).toBe("Asia/Singapore");
    expect(readHomeTimezoneClient()).toBe("Asia/Singapore");
  });

  it("trims whitespace and treats a blank value as unset", () => {
    stubStore({ [HOME_TIMEZONE_STORAGE_KEY]: "  Europe/Berlin  " });
    expect(readHomeTimezoneClient()).toBe("Europe/Berlin");

    stubStore({ [HOME_TIMEZONE_STORAGE_KEY]: "   " });
    expect(readHomeTimezoneClient()).toBeUndefined();
  });

  it("returns undefined when nothing is stored", () => {
    stubStore();
    expect(readHomeTimezoneClient()).toBeUndefined();
  });

  it("clears the stored zone", () => {
    const store = stubStore({ [HOME_TIMEZONE_STORAGE_KEY]: "UTC" });
    clearHomeTimezoneClient();
    expect(store.has(HOME_TIMEZONE_STORAGE_KEY)).toBe(false);
    expect(readHomeTimezoneClient()).toBeUndefined();
  });
});
