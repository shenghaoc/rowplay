import { describe, expect, it } from 'vitest';
import { isPubliclyShareable } from './privacy';

describe('isPubliclyShareable', () => {
	it('allows only the public `everyone` level', () => {
		expect(isPubliclyShareable('everyone')).toBe(true);
	});

	it('blocks every narrower Concept2 privacy level', () => {
		for (const level of ['logged_in', 'partners', 'private']) {
			expect(isPubliclyShareable(level)).toBe(false);
		}
	});

	it('fails closed on absent, empty, or unknown values', () => {
		expect(isPubliclyShareable(undefined)).toBe(false);
		expect(isPubliclyShareable(null)).toBe(false);
		expect(isPubliclyShareable('')).toBe(false);
		expect(isPubliclyShareable('public')).toBe(false);
		expect(isPubliclyShareable('everybody')).toBe(false);
	});

	it('normalises surrounding whitespace and case', () => {
		expect(isPubliclyShareable(' everyone ')).toBe(true);
		expect(isPubliclyShareable('EVERYONE')).toBe(true);
	});
});
