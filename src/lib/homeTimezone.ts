export const HOME_TIMEZONE_STORAGE_KEY = 'rowplay:homeTimezone';

/** Demo-mode home timezone from localStorage (browser only). */
export function readHomeTimezoneClient(): string | undefined {
	if (typeof localStorage === 'undefined') return undefined;
	const raw = localStorage.getItem(HOME_TIMEZONE_STORAGE_KEY)?.trim();
	return raw || undefined;
}

export function writeHomeTimezoneClient(tz: string): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(HOME_TIMEZONE_STORAGE_KEY, tz);
}

export function clearHomeTimezoneClient(): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.removeItem(HOME_TIMEZONE_STORAGE_KEY);
}
