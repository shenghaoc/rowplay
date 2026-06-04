import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeStorage } from './safeStorage';

afterEach(() => vi.unstubAllGlobals());

describe('safeStorage', () => {
	it('round-trips a value through a normal localStorage stub', () => {
		const store = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: (k: string, v: string) => { store.set(k, v); },
			removeItem: (k: string) => { store.delete(k); }
		});

		safeStorage.setItem('key', 'hello');
		expect(safeStorage.getItem('key')).toBe('hello');
		safeStorage.removeItem('key');
		expect(safeStorage.getItem('key')).toBeNull();
	});

	it('returns null from getItem when localStorage is unavailable', () => {
		vi.stubGlobal('localStorage', undefined);
		expect(safeStorage.getItem('any')).toBeNull();
	});

	it('does not throw from setItem when localStorage throws', () => {
		vi.stubGlobal('localStorage', {
			setItem: () => { throw new DOMException('blocked', 'SecurityError'); }
		});
		expect(() => safeStorage.setItem('k', 'v')).not.toThrow();
	});

	it('does not throw from removeItem when localStorage throws', () => {
		vi.stubGlobal('localStorage', {
			removeItem: () => { throw new DOMException('blocked', 'SecurityError'); }
		});
		expect(() => safeStorage.removeItem('k')).not.toThrow();
	});

	it('returns null from getItem when localStorage throws', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => { throw new DOMException('blocked', 'SecurityError'); }
		});
		expect(safeStorage.getItem('k')).toBeNull();
	});

	it('returns null when getItem returns null', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => null
		});
		expect(safeStorage.getItem('missing')).toBeNull();
	});
});
