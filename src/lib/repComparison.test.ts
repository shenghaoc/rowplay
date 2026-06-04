import { describe, expect, it } from 'vitest';
import {
	alignRepsForChart,
	detectReps,
	repAvgPace,
	repsHaveHr,
	type RepSeries
} from './repComparison';
import { mockWorkoutDetail } from './mockData';
import type { Split, Stroke, WorkoutDetail } from './types';

function workout(overrides: Partial<WorkoutDetail> & Pick<WorkoutDetail, 'id'>): WorkoutDetail {
	const base = mockWorkoutDetail(1001)!;
	return { ...base, ...overrides };
}

const twoWorkSplits: Split[] = [
	{ index: 0, distance: 500, time: 120, pace: 120, spm: 28, isRest: false },
	{ index: 1, distance: 0, time: 60, pace: 0, isRest: true },
	{ index: 2, distance: 500, time: 122, pace: 122, spm: 27, isRest: false }
];

function stroke(t: number, pace: number, spm = 28, hr?: number): Stroke {
	return { t, d: t * 2, pace, spm, watts: 180, hr };
}

describe('detectReps', () => {
	it('returns null for a single work interval', () => {
		const detail = workout({
			id: 1,
			splits: [{ index: 0, distance: 2000, time: 480, pace: 120 }],
			strokes: [stroke(0, 120), stroke(240, 118)]
		});
		expect(detectReps(detail)).toBeNull();
	});

	it('returns null when work intervals are shorter than 30 s', () => {
		const detail = workout({
			id: 2,
			splits: [
				{ index: 0, distance: 100, time: 20, pace: 100, isRest: false },
				{ index: 1, distance: 100, time: 20, pace: 102, isRest: false }
			],
			strokes: []
		});
		expect(detectReps(detail)).toBeNull();
	});

	it('detects two qualifying work intervals and excludes rest', () => {
		const strokes = [
			stroke(0, 120),
			stroke(60, 118),
			stroke(120, 122),
			stroke(180, 121)
		];
		const detail = workout({ id: 3, splits: twoWorkSplits, strokes, isInterval: true });
		const reps = detectReps(detail);
		expect(reps).not.toBeNull();
		expect(reps!.length).toBe(2);
	});

	it('zero-bases every rep time axis', () => {
		const strokes = [
			stroke(0, 120),
			stroke(60, 118),
			stroke(180, 122),
			stroke(240, 121)
		];
		const detail = workout({ id: 4, splits: twoWorkSplits, strokes });
		const reps = detectReps(detail)!;
		for (const r of reps) {
			expect(r.times.length).toBeGreaterThan(0);
			expect(r.times[0]).toBe(0);
		}
	});

	it('computes average pace for legend', () => {
		const detail = workout({
			id: 5,
			splits: [
				{ index: 0, distance: 500, time: 120, pace: 100, isRest: false },
				{ index: 1, distance: 500, time: 120, pace: 110, isRest: false }
			],
			strokes: []
		});
		const reps = detectReps(detail)!;
		expect(repAvgPace(reps[0])).toBe(100);
		expect(repAvgPace(reps[1])).toBe(110);
	});

	it('fills hr with zeros when unavailable', () => {
		const detail = workout({
			id: 6,
			splits: [
				{ index: 0, distance: 500, time: 120, pace: 120, isRest: false },
				{ index: 1, distance: 500, time: 120, pace: 122, isRest: false }
			],
			strokes: [stroke(0, 120), stroke(180, 122)]
		});
		const reps = detectReps(detail)!;
		expect(repsHaveHr(reps)).toBe(false);
		expect([...reps[0].hr].every((v) => v === 0)).toBe(true);
	});

	it('detects reps on demo interval workout 1005', () => {
		const detail = mockWorkoutDetail(1005)!;
		const reps = detectReps(detail);
		expect(reps).not.toBeNull();
		expect(reps!.length).toBe(4);
	});
});

describe('alignRepsForChart', () => {
	it('pads shorter reps with null on the shared grid', () => {
		const reps: RepSeries[] = [
			{
				repIndex: 0,
				avgPace: 120,
				times: new Float32Array([0, 5]),
				pace: new Float32Array([120, 118]),
				rate: new Float32Array([28, 29]),
				power: new Float32Array([180, 185]),
				hr: new Float32Array([0, 0])
			},
			{
				repIndex: 1,
				avgPace: 122,
				times: new Float32Array([0, 8]),
				pace: new Float32Array([122, 120]),
				rate: new Float32Array([27, 28]),
				power: new Float32Array([170, 175]),
				hr: new Float32Array([0, 0])
			}
		];
		const [xs, y0, y1] = alignRepsForChart(reps, 'pace');
		expect(xs[xs.length - 1]).toBe(8);
		expect(y0[y0.length - 1]).toBeNull();
		expect(y1[y1.length - 1]).not.toBeNull();
	});
});
