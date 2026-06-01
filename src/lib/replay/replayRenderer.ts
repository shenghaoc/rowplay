export type RendererKind = '2d' | '3d';

const STORAGE_KEY = 'replay_renderer';

/** Read persisted renderer choice (client-only). Defaults to 2D. */
export function loadRendererPref(): RendererKind {
	if (typeof localStorage === 'undefined') return '2d';
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw === '3d' ? '3d' : '2d';
	} catch {
		return '2d';
	}
}

/** Persist renderer choice for the next visit. */
export function saveRendererPref(kind: RendererKind): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(STORAGE_KEY, kind);
}
