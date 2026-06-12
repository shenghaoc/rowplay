import { safeStorage } from "./safeStorage";

export const HOME_TIMEZONE_STORAGE_KEY = "rowplay:homeTimezone";

/** Demo-mode home timezone from localStorage (browser only). */
export function readHomeTimezoneClient(): string | undefined {
  const raw = safeStorage.getItem(HOME_TIMEZONE_STORAGE_KEY)?.trim();
  return raw || undefined;
}

export function writeHomeTimezoneClient(tz: string): void {
  safeStorage.setItem(HOME_TIMEZONE_STORAGE_KEY, tz);
}

export function clearHomeTimezoneClient(): void {
  safeStorage.removeItem(HOME_TIMEZONE_STORAGE_KEY);
}
