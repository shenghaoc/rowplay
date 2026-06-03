import { describe, expect, it } from 'vitest';
import {
	dayKeyEpochMillis,
	fmtDate,
	fmtDateFromEpochMillis,
	fmtLogbookDateTime,
	logbookEpochMillis,
	overlapDate,
	parseInstantMillis,
	parseLogbookDateTime,
	todayKeyUtc
} from './datetime';

describe('parseLogbookDateTime', () => {
	it('parses a standard logbook timestamp', () => {
		const pdt = parseLogbookDateTime('2026-01-15 08:30:00');
		expect(pdt).not.toBeNull();
		expect(pdt!.year).toBe(2026);
		expect(pdt!.month).toBe(1);
		expect(pdt!.day).toBe(15);
		expect(pdt!.hour).toBe(8);
		expect(pdt!.minute).toBe(30);
		expect(pdt!.second).toBe(0);
	});

	it('trims leading/trailing whitespace', () => {
		const pdt = parseLogbookDateTime('  2026-06-01 12:00:00  ');
		expect(pdt).not.toBeNull();
		expect(pdt!.year).toBe(2026);
	});

	it('returns null for invalid text', () => {
		expect(parseLogbookDateTime('not a date')).toBeNull();
		expect(parseLogbookDateTime('')).toBeNull();
	});

	it('returns null for an out-of-range date', () => {
		expect(parseLogbookDateTime('2026-99-01 00:00:00')).toBeNull();
	});
});

describe('logbookEpochMillis', () => {
	it('returns epoch millis for a valid timestamp (UTC wall clock)', () => {
		// 2000-01-01 00:00:00 UTC → 946684800000
		expect(logbookEpochMillis('2000-01-01 00:00:00')).toBe(946684800000);
	});

	it('returns NaN for invalid input', () => {
		expect(logbookEpochMillis('bad')).toBeNaN();
	});
});

describe('parseInstantMillis', () => {
	it('parses ISO-8601 with Z offset', () => {
		expect(parseInstantMillis('2000-01-01T00:00:00Z')).toBe(946684800000);
	});

	it('parses RFC 3339 with numeric offset', () => {
		// Same instant, different representation
		expect(parseInstantMillis('2000-01-01T01:00:00+01:00')).toBe(946684800000);
	});

	it('returns NaN for invalid text', () => {
		expect(parseInstantMillis('not a timestamp')).toBeNaN();
		expect(parseInstantMillis('')).toBeNaN();
	});
});

describe('overlapDate', () => {
	it('returns the day before a logbook date', () => {
		expect(overlapDate('2026-06-03 10:00:00')).toBe('2026-06-02');
	});

	it('handles month-end rollover', () => {
		expect(overlapDate('2026-03-01 00:00:00')).toBe('2026-02-28');
	});

	it('handles year-end rollover', () => {
		expect(overlapDate('2027-01-01 00:00:00')).toBe('2026-12-31');
	});

	it('returns null for invalid input', () => {
		expect(overlapDate('invalid')).toBeNull();
		expect(overlapDate('')).toBeNull();
	});
});

describe('fmtDate', () => {
	it('formats an ISO instant string with locale and timezone', () => {
		const result = fmtDate('2026-06-03T12:00:00Z', 'en-US', 'UTC');
		expect(result).toMatch(/Jun/);
		expect(result).toMatch(/2026/);
	});

	it('formats a logbook datetime string', () => {
		const result = fmtDate('2026-06-03 12:00:00', 'en-US', 'UTC');
		expect(result).toMatch(/Jun/);
		expect(result).toMatch(/2026/);
	});

	it('formats a plain date string', () => {
		const result = fmtDate('2026-06-03', 'en-US', 'UTC');
		expect(result).toMatch(/2026/);
	});

	it('falls back to the original string for garbage input', () => {
		expect(fmtDate('garbage')).toBe('garbage');
	});
});

describe('fmtLogbookDateTime', () => {
	it('formats a valid logbook timestamp as a locale string', () => {
		const result = fmtLogbookDateTime('2026-06-03 12:00:00', 'en-US');
		expect(result).toContain('2026');
	});

	it('returns the raw value for invalid input', () => {
		expect(fmtLogbookDateTime('invalid-date', 'en-US')).toBe('invalid-date');
	});
});

describe('fmtDateFromEpochMillis', () => {
	it('formats epoch milliseconds to a readable date', () => {
		// 946684800000 = 2000-01-01T00:00:00Z
		const result = fmtDateFromEpochMillis(946684800000, 'en-US');
		expect(result).toMatch(/Jan/);
		expect(result).toMatch(/2000/);
	});

	it('returns -- for NaN', () => {
		expect(fmtDateFromEpochMillis(NaN)).toBe('--');
	});

	it('returns -- for Infinity', () => {
		expect(fmtDateFromEpochMillis(Infinity)).toBe('--');
	});
});

describe('todayKeyUtc', () => {
	it('returns a YYYY-MM-DD string', () => {
		expect(todayKeyUtc()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it('matches the current UTC date', () => {
		const key = todayKeyUtc();
		const today = new Date().toISOString().slice(0, 10);
		expect(key).toBe(today);
	});
});

describe('dayKeyEpochMillis', () => {
	it('converts 2000-01-01 to UTC midnight epoch ms', () => {
		expect(dayKeyEpochMillis('2000-01-01')).toBe(946684800000);
	});

	it('converts 2026-06-03 correctly', () => {
		// 2026-06-03T00:00:00Z
		const result = dayKeyEpochMillis('2026-06-03');
		expect(result).toBeGreaterThan(0);
		expect(Number.isFinite(result)).toBe(true);
		// Verify it round-trips: converting back to date key should give the same string
		const back = new Date(result).toISOString().slice(0, 10);
		expect(back).toBe('2026-06-03');
	});

	it('returns NaN for invalid key', () => {
		expect(dayKeyEpochMillis('not-a-date')).toBeNaN();
		expect(dayKeyEpochMillis('')).toBeNaN();
	});
});
