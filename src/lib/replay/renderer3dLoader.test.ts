import { afterEach, describe, expect, it } from 'vitest';
import { loadRenderer3D, resetRenderer3DCache, webglSupported } from './renderer3dLoader';

describe('webglSupported', () => {
	const origDoc = globalThis.document;

	afterEach(() => {
		globalThis.document = origDoc;
	});

	it('returns false without document', () => {
		// @ts-expect-error test stub
		delete globalThis.document;
		expect(webglSupported()).toBe(false);
	});

	it('returns false without canvas context', () => {
		globalThis.document = {
			createElement: () => ({ getContext: () => null })
		} as unknown as Document;
		expect(webglSupported()).toBe(false);
	});
});

describe('loadRenderer3D', () => {
	afterEach(() => {
		resetRenderer3DCache();
	});

	it('reuses the same import promise', () => {
		resetRenderer3DCache();
		const p1 = loadRenderer3D();
		const p2 = loadRenderer3D();
		expect(p1).toBe(p2);
	});
});
