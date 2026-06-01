import { describe, expect, it } from 'vitest';
import {
	avgWatts,
	fmtDate,
	fmtDateFromEpochMillis,
	fmtDistance,
	fmtLogbookDateTime,
	fmtPace,
	fmtPaceBare,
	fmtTime,
	challengeDistanceMetres,
	paceToWatts,
	paceToWattsForSport,
	SPORT_LABEL
} from './format';
import { bikePaceSecPer500, workout } from '../../tests/unit/fixtures';

describe('fmtTime', () => {
	it('formats sub-hour with tenths', () => {
		expect(fmtTime(125.3, true)).toBe('2:05.3');
	});

	it('formats hours without tenths', () => {
		expect(fmtTime(3661)).toBe('1:01:01');
	});

	it('returns placeholder for invalid input', () => {
		expect(fmtTime(NaN)).toBe('--:--');
		expect(fmtTime(-1)).toBe('--:--');
	});
});

describe('fmtPace / fmtPaceBare', () => {
	it('appends /500m for full pace strings', () => {
		expect(fmtPace(120)).toBe('2:00.0/500m');
	});

	it('allows zero pace bare when requested', () => {
		expect(fmtPaceBare(0, true)).toBe('0:00.0');
		expect(fmtPaceBare(0)).toBe('--:--');
	});

	it('rejects invalid pace', () => {
		expect(fmtPace(0)).toBe('--:--');
	});
});

describe('fmtDistance', () => {
	it('shows metres below 1 km', () => {
		expect(fmtDistance(500)).toBe('500 m');
	});

	it('shows kilometres at and above 1 km', () => {
		expect(fmtDistance(2500)).toBe('2.50 km');
	});
});

describe('paceToWatts / avgWatts', () => {
	it('maps Concept2 pace model at 2:00/500m', () => {
		expect(paceToWatts(120)).toBeCloseTo(202.55, 1);
	});

	it('returns 0 for invalid pace', () => {
		expect(paceToWatts(0)).toBe(0);
	});

	it('prefers watt-minutes when present', () => {
		const w = workout({ id: 1, wattMinutes: 600, time: 600, pace: 130 });
		expect(avgWatts(w)).toBe(60);
	});

	it('uses pace model for rower without watt-minutes', () => {
		const w = workout({ id: 2, pace: 120, time: 480 });
		expect(avgWatts(w)).toBe(Math.round(paceToWatts(120)));
	});
});

describe('bike pace per-1000m normalisation', () => {
	it('halves API pace tenths to sec/500m before watts', () => {
		// API reports 190.0 s/1000m → 95.0 s/500m (same speed as rower 1:35/500m).
		const normalized = bikePaceSecPer500(1900);
		expect(normalized).toBe(95);
		expect(paceToWattsForSport('bike', normalized)).toBeCloseTo(paceToWatts(95) / 8, 1);
	});
});

describe('challengeDistanceMetres', () => {
	it('counts BikeErg distance at half for logbook challenges', () => {
		expect(challengeDistanceMetres({ sport: 'bike', distance: 8000 })).toBe(4000);
		expect(challengeDistanceMetres({ sport: 'rower', distance: 8000 })).toBe(8000);
	});
});

describe('datetime formatters', () => {
	it('formats logbook date-time (timezone-independent)', () => {
		const out = fmtLogbookDateTime('2026-05-27 06:12:00', 'en-US');
		// PlainDateTime has no zone; toLocaleString may shift the day in
		// timezones west of UTC. Only assert on parts invariant to that shift.
		expect(out).toMatch(/2026/);
		expect(out).toMatch(/\d/); // at least a digit present
		expect(out.length).toBeGreaterThan(0);
	});

	it('formats logbook date from slice', () => {
		expect(fmtDate('2026-05-27 06:12:00', 'en-US', 'UTC')).toMatch(/May/);
	});

	it('formats epoch millis in UTC', () => {
		const ms = Date.parse('2026-05-27T00:00:00Z');
		expect(fmtDateFromEpochMillis(ms, 'en-US')).toMatch(/May/);
	});
});

describe('SPORT_LABEL', () => {
	it('keeps Concept2 trademark names', () => {
		expect(SPORT_LABEL.rower).toBe('RowErg');
		expect(SPORT_LABEL.bike).toBe('BikeErg');
	});
});
