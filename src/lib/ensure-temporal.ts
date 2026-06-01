/** Loads `temporal-polyfill` only when the runtime lacks native Temporal (e.g. WebKit, Workers). */
let loading: Promise<void> | undefined;

// WebKit occasionally fails a fresh dynamic-chunk fetch ("Importing a module
// script failed"); since this runs at the top of hooks.client a single failure
// would reject app init. Retry the fetch before giving up.
async function loadPolyfill(): Promise<void> {
	let lastErr: unknown;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			await import('temporal-polyfill/global');
			return;
		} catch (e) {
			lastErr = e;
		}
	}
	throw lastErr;
}

export function ensureTemporal(): Promise<void> {
	if (globalThis.Temporal) return Promise.resolve();
	loading ??= loadPolyfill();
	return loading;
}
