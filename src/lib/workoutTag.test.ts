import { describe, expect, it } from 'vitest';
import {
	autoDetectTag,
	resolveTag,
	type TaggableWorkout,
	WORKOUT_TAGS
} from './workoutTag';
import type { Split } from './types';

function base(overrides: Partial<TaggableWorkout> = {}): TaggableWorkout {
	return {
		id: 1,
		date: '2026-01-01 06:00:00',
		sport: 'rower',
		distance: 2000,
		time: 480,
		pace: 120,
		hasStrokeData: true,
		...overrides
	};
}

function intervalSplits(reps: number, repDist = 500, repPace = 110, restSec = 90): Split[] {
	const splits: Split[] = [];
	for (let i = 0; i < reps; i++) {
		splits.push({
			index: splits.length,
			distance: repDist,
			time: (repDist / 500) * repPace,
			pace: repPace,
			isRest: false
		});
		if (i < reps - 1) {
			splits.push({
				index: splits.length,
				distance: 0,
				time: restSec,
				pace: 0,
				isRest: true
			});
		}
	}
	return splits;
}

describe('WORKOUT_TAGS', () => {
	it('lists six tag values', () => {
		expect(WORKOUT_TAGS).toEqual([
			'steady-state',
			'interval',
			'race-piece',
			'time-trial',
			'warmup-cooldown',
			'unknown'
		]);
	});
});

describe('autoDetectTag', () => {
	it('classifies interval workouts with rest splits', () => {
		const w = base({
			distance: 4000,
			time: 2400,
			splits: intervalSplits(4, 1000, 115),
			isInterval: true
		});
		expect(autoDetectTag(w)).toBe('interval');
	});

	it('classifies interval workouts from summary flags when split detail is missing', () => {
		const w = base({
			distance: 4000,
			time: 1800,
			restTime: 240,
			isInterval: true,
			workoutType: 'JustRow'
		});
		expect(autoDetectTag(w)).toBe('interval');
	});

	it('does not classify rest-only as interval', () => {
		const w = base({
			distance: 0,
			time: 300,
			splits: [{ index: 0, distance: 0, time: 300, pace: 0, isRest: true }]
		});
		expect(autoDetectTag(w)).not.toBe('interval');
	});

	it('classifies short fast pieces as race-piece', () => {
		const w = base({ distance: 500, time: 100, pace: 100, splits: [] });
		expect(autoDetectTag(w, { medianPaceSecs: 120 })).toBe('race-piece');
	});

	it('does not classify 10k as race-piece', () => {
		const w = base({
			distance: 10000,
			time: 2400,
			pace: 120,
			splits: [{ index: 0, distance: 10000, time: 2400, pace: 120 }]
		});
		expect(autoDetectTag(w, { medianPaceSecs: 120 })).toBe('steady-state');
	});

	it('classifies long low-variance pieces as steady-state', () => {
		const splits: Split[] = [];
		for (let i = 0; i < 8; i++) {
			splits.push({ index: i, distance: 5000, time: 600, pace: 120 + (i % 2) * 0.5 });
		}
		const w = base({ distance: 40000, time: 4800, pace: 120, splits });
		expect(autoDetectTag(w)).toBe('steady-state');
	});

	it('can classify a missing-split long single piece as steady-state', () => {
		const w = base({ distance: 15000, time: 3600, pace: 120, splits: undefined });
		expect(autoDetectTag(w)).toBe('steady-state');
	});

	it('classifies mid-duration low-variance as time-trial', () => {
		const splits: Split[] = [
			{ index: 0, distance: 3000, time: 720, pace: 120 },
			{ index: 1, distance: 3000, time: 720, pace: 121 }
		];
		const w = base({ distance: 6000, time: 1440, pace: 120.5, splits });
		expect(autoDetectTag(w)).toBe('time-trial');
	});

	it('classifies easy short pieces as warmup-cooldown when median known', () => {
		const w = base({ distance: 1000, time: 420, pace: 160, splits: [] });
		expect(autoDetectTag(w, { medianPaceSecs: 120 })).toBe('warmup-cooldown');
	});

	it('returns unknown when no rule matches', () => {
		const splits: Split[] = [
			{ index: 0, distance: 2000, time: 480, pace: 100 },
			{ index: 1, distance: 2000, time: 520, pace: 130 }
		];
		const w = base({ distance: 4000, time: 1000, pace: 115, splits });
		expect(autoDetectTag(w, { medianPaceSecs: 120 })).toBe('unknown');
	});

	it('keeps high-variance mid-duration pieces as unknown', () => {
		const splits: Split[] = [
			{ index: 0, distance: 2000, time: 440, pace: 110 },
			{ index: 1, distance: 2000, time: 540, pace: 135 },
			{ index: 2, distance: 2000, time: 440, pace: 110 }
		];
		const w = base({ distance: 6000, time: 1420, pace: 118, splits });
		expect(autoDetectTag(w, { medianPaceSecs: 120 })).toBe('unknown');
	});
});

describe('resolveTag', () => {
	it('prefers a valid userTag override', () => {
		const w = base({ userTag: 'interval', distance: 500, time: 100, pace: 100 });
		expect(resolveTag(w)).toBe('interval');
	});

	it('falls back to auto when userTag is invalid', () => {
		const w = base({ userTag: 'not-a-tag', distance: 500, time: 100, pace: 100 });
		expect(resolveTag(w, { medianPaceSecs: 120 })).toBe('race-piece');
	});

	it('falls back to auto when userTag is null', () => {
		const w = base({ userTag: null, distance: 500, time: 100, pace: 100 });
		expect(resolveTag(w, { medianPaceSecs: 120 })).toBe('race-piece');
	});
});
