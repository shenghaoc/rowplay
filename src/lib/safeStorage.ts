/**
 * Safe localStorage wrapper — catches both the ReferenceError thrown in SSR
 * (Node/Workers: `localStorage` is not defined) and the SecurityError thrown
 * in Private/Incognito mode on some browsers (iOS Safari, Firefox strict).
 */
export const safeStorage = {
	getItem(key: string): string | null {
		if (typeof localStorage === 'undefined') return null;
		try {
			return localStorage.getItem(key);
		} catch {
			return null;
		}
	},

	setItem(key: string, value: string): void {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(key, value);
		} catch {
			// Silently ignore — the value is lost but the app stays functional.
		}
	},

	removeItem(key: string): void {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.removeItem(key);
		} catch {
			// Ignore
		}
	}
};
