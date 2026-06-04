import { describe, expect, it } from 'vitest';
import { mockAnnotations, mockWorkoutDetail, mockWorkouts } from './mockData';

describe('mockWorkouts', () => {
	it('returns a non-empty array of workouts', () => {
		const workouts = mockWorkouts();
		expect(workouts.length).toBeGreaterThan(0);
	});

	it('each workout has the required fields', () => {
		for (const w of mockWorkouts()) {
			expect(typeof w.id).toBe('number');
			expect(typeof w.date).toBe('string');
			expect(['rower', 'skierg', 'bike']).toContain(w.sport);
			expect(w.distance).toBeGreaterThan(0);
			expect(w.time).toBeGreaterThan(0);
			expect(w.pace).toBeGreaterThan(0);
			expect(typeof w.hasStrokeData).toBe('boolean');
		}
	});

	it('returns a stable (deterministic) list on repeated calls', () => {
		const a = mockWorkouts();
		const b = mockWorkouts();
		expect(a.map((w) => w.id)).toEqual(b.map((w) => w.id));
		expect(a[0].time).toBe(b[0].time);
	});

	it('includes multiple sports', () => {
		const sports = new Set(mockWorkouts().map((w) => w.sport));
		expect(sports.size).toBeGreaterThan(1);
	});

	it('marks workouts with stroke data', () => {
		const withStroke = mockWorkouts().filter((w) => w.hasStrokeData);
		expect(withStroke.length).toBeGreaterThan(0);
	});
});

describe('mockWorkoutDetail', () => {
	it('returns a detail for each workout id in mockWorkouts()', () => {
		for (const w of mockWorkouts()) {
			const detail = mockWorkoutDetail(w.id);
			expect(detail, `should have detail for id ${w.id}`).not.toBeNull();
		}
	});

	it('returns null for an unknown id', () => {
		expect(mockWorkoutDetail(99999)).toBeNull();
	});

	it('includes stroke data for workouts with hasStrokeData', () => {
		const withStroke = mockWorkouts().find((w) => w.hasStrokeData);
		if (!withStroke) return;
		const detail = mockWorkoutDetail(withStroke.id)!;
		expect(detail.strokes.length).toBeGreaterThan(0);
	});

	it('all strokes have finite t, d, pace, spm, and watts', () => {
		const detail = mockWorkoutDetail(1001)!;
		for (const s of detail.strokes) {
			expect(Number.isFinite(s.t)).toBe(true);
			expect(Number.isFinite(s.d)).toBe(true);
			expect(Number.isFinite(s.pace)).toBe(true);
			expect(Number.isFinite(s.spm)).toBe(true);
			expect(Number.isFinite(s.watts)).toBe(true);
		}
	});

	it('has splits when the workout has intervals', () => {
		// id 1005 is the interval workout
		const detail = mockWorkoutDetail(1005)!;
		expect(detail.splits.length).toBeGreaterThan(0);
	});

	it('detail distance and time are positive', () => {
		const detail = mockWorkoutDetail(1001)!;
		expect(detail.distance).toBeGreaterThan(0);
		expect(detail.time).toBeGreaterThan(0);
	});
});

describe('mockAnnotations', () => {
	it('returns an array for a known workout id', () => {
		const annotations = mockAnnotations(1001);
		expect(Array.isArray(annotations)).toBe(true);
	});

	it('returns an empty array for an unknown workout id', () => {
		expect(mockAnnotations(99999)).toEqual([]);
	});

	it('each annotation has required fields', () => {
		const annotations = mockAnnotations(1001);
		for (const a of annotations) {
			expect(typeof a.id).toBe('number');
			expect(typeof a.timestamp).toBe('number');
			expect(typeof a.text).toBe('string');
			expect(typeof a.createdAt).toBe('number');
			expect(a.text.length).toBeGreaterThan(0);
		}
	});

	it('returns the same annotations on repeated calls (deterministic)', () => {
		const a = mockAnnotations(1001);
		const b = mockAnnotations(1001);
		expect(a).toEqual(b);
	});
});
