import { describe, expect, it } from 'vitest';
import { todayKeyForTz, todayKeyUtc, workoutLocalDayKey } from './datetime';

describe('workoutLocalDayKey', () => {
	it('falls back to plain date slice when no timezone', () => {
		expect(workoutLocalDayKey('2024-01-15 01:00:00')).toBe('2024-01-15');
	});

	it('keeps the plain date as-is when date is in workoutTz (monitor-local)', () => {
		// 23:30 in America/New_York is still Jan 14.
		expect(workoutLocalDayKey('2024-01-14 23:30:00', 'America/New_York')).toBe('2024-01-14');
	});

	it('keeps the plain date as-is for Auckland workoutTz (monitor-local, not UTC-shifted)', () => {
		// 23:30 NZDT is still Jan 14 in Auckland — NOT Jan 15.
		expect(workoutLocalDayKey('2024-01-14 23:30:00', 'Pacific/Auckland')).toBe('2024-01-14');
	});

	it('cross-zone: Auckland evening workout converted to New York home timezone', () => {
		// 23:30 NZDT = 05:30 EST, still Jan 14 in New York.
		expect(
			workoutLocalDayKey('2024-01-14 23:30:00', 'Pacific/Auckland', 'America/New_York')
		).toBe('2024-01-14');
	});

	it('cross-zone: New York late workout converted to Auckland home timezone rolls forward', () => {
		// 23:30 EST (UTC-5) = 17:30 NZDT (UTC+13) next day → Jan 15 in Auckland.
		expect(
			workoutLocalDayKey('2024-01-14 23:30:00', 'America/New_York', 'Pacific/Auckland')
		).toBe('2024-01-15');
	});

	it('falls through invalid workout tz to plain date', () => {
		expect(workoutLocalDayKey('2024-01-14 23:30:00', 'Not/Real')).toBe('2024-01-14');
	});

	it('uses plain date when only homeTz is known (no source zone info)', () => {
		// Without knowing the source zone, plain date is best effort.
		expect(workoutLocalDayKey('2024-01-14 23:30:00', undefined, 'America/New_York')).toBe(
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
