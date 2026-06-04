import { describe, expect, it } from 'vitest';
import { generateShareToken, shareMeta } from './share';

describe('generateShareToken', () => {
	it('returns a 48-character lowercase hex string', () => {
		const token = generateShareToken();
		expect(token).toMatch(/^[a-f0-9]{48}$/);
	});

	it('produces unique tokens on each call', () => {
		const tokens = new Set(Array.from({ length: 20 }, () => generateShareToken()));
		expect(tokens.size).toBe(20);
	});

	it('contains only URL-safe characters', () => {
		const token = generateShareToken();
		expect(encodeURIComponent(token)).toBe(token);
	});
});

describe('shareMeta', () => {
	const detail = {
		id: 1001,
		date: '2026-05-01 06:00:00',
		sport: 'rower' as const,
		distance: 2000,
		time: 480,
		pace: 120,
		hasStrokeData: true,
		strokes: [],
		splits: [],
		isInterval: false,
		workoutType: '2000m test'
	};

	it('builds a non-empty title with the workout type', () => {
		const meta = shareMeta(detail, 'https://rowplay.example.com/r/abc123');
		expect(meta.title).toContain('2000m test');
	});

	it('falls back to sport name when workoutType is absent', () => {
		const d = { ...detail, workoutType: undefined };
		const meta = shareMeta(d, 'https://rowplay.example.com/r/abc');
		expect(meta.title).toContain('rower');
	});

	it('includes distance and time in the description', () => {
		const meta = shareMeta(detail, 'https://rowplay.example.com/r/abc');
		expect(meta.description).toContain('2.00 km');
		// time = 480s → 8:00
		expect(meta.description).toContain('8:00');
	});

	it('includes the pace in M:SS format', () => {
		// pace = 120 sec/500m → 2:00
		const meta = shareMeta(detail, 'https://rowplay.example.com/r/abc');
		expect(meta.description).toContain('2:00');
	});

	it('returns the provided URL in the meta', () => {
		const url = 'https://rowplay.example.com/r/mytoken';
		const meta = shareMeta(detail, url);
		expect(meta.url).toBe(url);
	});

	it('derives the image URL from the origin', () => {
		const meta = shareMeta(detail, 'https://rowplay.example.com/r/abc');
		expect(meta.image).toBe('https://rowplay.example.com/icon-512.png');
	});

	it('formats a 10k distance with one decimal km', () => {
		const d10k = { ...detail, distance: 10000, time: 2400, pace: 120, workoutType: '10k' };
		const meta = shareMeta(d10k, 'https://rowplay.example.com/r/abc');
		expect(meta.description).toContain('10.0 km');
	});
});
