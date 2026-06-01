import type { CourseRenderer3D } from './renderer3d';

export type Renderer3DCtor = typeof CourseRenderer3D;

let cached: Promise<Renderer3DCtor> | null = null;

/** SSR-safe WebGL capability probe. */
export function webglSupported(): boolean {
	if (typeof document === 'undefined') return false;
	try {
		const c = document.createElement('canvas');
		return !!(c.getContext('webgl2') || c.getContext('webgl'));
	} catch {
		return false;
	}
}

/** Lazy-load the 3D renderer module (and Three.js) once per session. */
export function loadRenderer3D(): Promise<Renderer3DCtor> {
	cached ??= import('./renderer3d').then((m) => m.CourseRenderer3D);
	return cached;
}

/** Reset module cache (tests only). */
export function resetRenderer3DCache(): void {
	cached = null;
}
