/** Loads `temporal-polyfill` only when the runtime lacks native Temporal (e.g. WebKit, Workers). */
let loading: Promise<void> | undefined;

export function ensureTemporal(): Promise<void> {
	if (globalThis.Temporal) return Promise.resolve();
	loading ??= import('temporal-polyfill/global').then(() => undefined);
	return loading;
}
