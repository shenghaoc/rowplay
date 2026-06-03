import { describe, expect, it } from 'vitest';
import {
	DEFAULT_ANNUAL_METERS,
	defaultAnnualGoal,
	parseGoalsCookie,
	serializeGoalsCookie
} from './goals';

describe('defaultAnnualGoal', () => {
	it('returns a meters goal for the given year', () => {
		expect(defaultAnnualGoal(2026)).toEqual({
			year: 2026,
			kind: 'meters',
			target: DEFAULT_ANNUAL_METERS
		});
	});

	it('uses the provided year', () => {
		expect(defaultAnnualGoal(2030).year).toBe(2030);
	});
});

describe('parseGoalsCookie', () => {
	it('parses a valid meters goal', () => {
		const raw = JSON.stringify({ year: 2026, kind: 'meters', target: 500000 });
		expect(parseGoalsCookie(raw)).toEqual({ year: 2026, kind: 'meters', target: 500000 });
	});

	it('parses a valid hours goal', () => {
		const raw = JSON.stringify({ year: 2026, kind: 'hours', target: 100 });
		expect(parseGoalsCookie(raw)).toEqual({ year: 2026, kind: 'hours', target: 100 });
	});

	it('returns null for undefined', () => {
		expect(parseGoalsCookie(undefined)).toBeNull();
	});

	it('returns null for empty string', () => {
		expect(parseGoalsCookie('')).toBeNull();
	});

	it('returns null for invalid JSON', () => {
		expect(parseGoalsCookie('{')).toBeNull();
		expect(parseGoalsCookie('null')).toBeNull();
	});

	it('returns null for an unsupported kind', () => {
		const raw = JSON.stringify({ year: 2026, kind: 'calories', target: 500 });
		expect(parseGoalsCookie(raw)).toBeNull();
	});

	it('returns null for zero target', () => {
		const raw = JSON.stringify({ year: 2026, kind: 'meters', target: 0 });
		expect(parseGoalsCookie(raw)).toBeNull();
	});

	it('returns null for negative target', () => {
		const raw = JSON.stringify({ year: 2026, kind: 'meters', target: -1000 });
		expect(parseGoalsCookie(raw)).toBeNull();
	});

	it('returns null for non-numeric year', () => {
		const raw = JSON.stringify({ year: '2026', kind: 'meters', target: 500000 });
		expect(parseGoalsCookie(raw)).toBeNull();
	});

	it('returns null for missing fields', () => {
		expect(parseGoalsCookie(JSON.stringify({ kind: 'meters', target: 500000 }))).toBeNull();
		expect(parseGoalsCookie(JSON.stringify({ year: 2026, target: 500000 }))).toBeNull();
	});
});

describe('serializeGoalsCookie', () => {
	it('round-trips through parseGoalsCookie for meters', () => {
		const goal = { year: 2026, kind: 'meters' as const, target: 1_000_000 };
		expect(parseGoalsCookie(serializeGoalsCookie(goal))).toEqual(goal);
	});

	it('round-trips through parseGoalsCookie for hours', () => {
		const goal = { year: 2027, kind: 'hours' as const, target: 200 };
		expect(parseGoalsCookie(serializeGoalsCookie(goal))).toEqual(goal);
	});
});
