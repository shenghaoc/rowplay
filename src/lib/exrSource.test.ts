import { describe, it, expect } from 'vitest';
import { isExrSource } from './exrSource';

describe('isExrSource', () => {
	it('returns true for "EXR"', () => expect(isExrSource({ source: 'EXR' })).toBe(true));
	it('returns true case-insensitively', () => expect(isExrSource({ source: 'exr' })).toBe(true));
	it('returns false for ErgData', () => expect(isExrSource({ source: 'ErgData' })).toBe(false));
	it('returns false for Web', () => expect(isExrSource({ source: 'Web' })).toBe(false));
	it('returns false when source is absent', () => expect(isExrSource({})).toBe(false));
});
