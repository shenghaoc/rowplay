import { describe, expect, it } from 'vitest';
import { pluralKey } from './i18nPlural';

describe('pluralKey', () => {
	it('returns base_one for English when n = 1', () => {
		expect(pluralKey('en', 'dashboard.goalsStreakCurrent', 1)).toBe('dashboard.goalsStreakCurrent_one');
	});

	it('returns the base key for English when n ≠ 1', () => {
		expect(pluralKey('en', 'dashboard.goalsStreakCurrent', 0)).toBe('dashboard.goalsStreakCurrent');
		expect(pluralKey('en', 'dashboard.goalsStreakCurrent', 2)).toBe('dashboard.goalsStreakCurrent');
		expect(pluralKey('en', 'dashboard.goalsStreakCurrent', 100)).toBe('dashboard.goalsStreakCurrent');
	});

	it('always returns the base key for non-English languages (e.g. zh)', () => {
		expect(pluralKey('zh', 'dashboard.goalsStreakCurrent', 1)).toBe('dashboard.goalsStreakCurrent');
		expect(pluralKey('zh', 'dashboard.goalsStreakCurrent', 5)).toBe('dashboard.goalsStreakCurrent');
	});

	it('works for all supported non-English languages', () => {
		const nonEnglish = ['zh', 'de', 'es', 'fr', 'ja'] as const;
		for (const lang of nonEnglish) {
			expect(pluralKey(lang, 'someKey', 1)).toBe('someKey');
		}
	});

	it('handles n = -1 (non-positive) gracefully', () => {
		// -1 !== 1, so should return base key
		expect(pluralKey('en', 'someKey', -1)).toBe('someKey');
	});
});
