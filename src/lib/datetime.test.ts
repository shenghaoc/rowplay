import { describe, expect, it } from 'vitest';
import { todayKeyForTz, todayKeyUtc, workoutLocalDayKey } from './datetime';

describe('workoutLocalDayKey', () => {
	it('falls back to plain date slice when no timezone', () => {
		expect(workoutLocalDayKey('2024-01-15 01:00:00')).toBe('2024-01-15');
	});

	it('keeps a late-UTC workout on the same day in a western zone', () => {
		// 23:30 UTC → 18:30 EST, still Jan 14 in New York.
		expect(workoutLocalDayKey('2024-01-14 23:30:00', 'America/New_York')).toBe('2024-01-14');
	});

	it('rolls a late-UTC workout to the next day in an eastern zone', () => {
		// 23:30 UTC → 12:30 NZDT (UTC+13), already Jan 15 in Auckland.
		expect(workoutLocalDayKey('2024-01-14 23:30:00', 'Pacific/Auckland')).toBe('2024-01-15');
	});

	it('uses home timezone when workout timezone is absent', () => {
		expect(workoutLocalDayKey('2024-01-14 23:30:00', undefined, 'America/New_York')).toBe(
			'2024-01-14'
		);
	});

	it('prefers workout timezone over home timezone', () => {
		expect(
			workoutLocalDayKey('2024-01-14 23:30:00', 'Pacific/Auckland', 'America/New_York')
		).toBe('2024-01-15');
	});

	it('falls through invalid workout tz to home tz', () => {
		expect(workoutLocalDayKey('2024-01-14 23:30:00', 'Not/Real', 'America/New_York')).toBe(
			'2024-01-14'
		);
	});

	it('falls through invalid workout and home tz to plain date', () => {
		expect(workoutLocalDayKey('2024-01-14 23:30:00', 'Bad', 'Also/Bad')).toBe('2024-01-14');
	});
});

describe('todayKeyForTz', () => {
	it('matches UTC helper when tz is absent', () => {
		expect(todayKeyForTz()).toBe(todayKeyUtc());
	});

	it('returns a valid date for a known zone', () => {
		const key = todayKeyForTz('America/New_York');
		expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it('falls back to UTC for invalid zone', () => {
		expect(todayKeyForTz('Not/AZone')).toBe(todayKeyUtc());
	});
});
