export type RendererKind = '2d' | '3d';
export type RenderQuality = 'low' | 'medium' | 'high';

const STORAGE_KEY = 'replay_renderer';
const QUALITY_KEY = 'replay_quality';

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

/** Read persisted 3D quality tier (client-only). Defaults to medium. */
export function loadQualityPref(): RenderQuality {
	if (typeof localStorage === 'undefined') return 'medium';
	try {
		const raw = localStorage.getItem(QUALITY_KEY);
		return raw === 'low' || raw === 'high' ? raw : 'medium';
	} catch {
		return 'medium';
	}
}

/** Persist 3D quality tier for the next visit. */
export function saveQualityPref(q: RenderQuality): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(QUALITY_KEY, q);
}
