import { describe, expect, it } from 'vitest';
import {
	buildDistribution,
	buildZoneConfig,
	classifyPace,
	medianTrainingPace,
	workoutsInPeriod,
	ZONES_5,
	ZONES_3
} from './trainingZones';
import { intervalSplits, normalizedIntervalStrokes, workout } from '../../tests/unit/fixtures';
import type { WorkoutForDistribution } from './trainingZones';

const BASE = 120; // 2:00 / 500m

describe('classifyPace — 5-zone', () => {
	const config = { basePace: BASE } as const;

	it('classifies boundary paces at each threshold', () => {
		expect(classifyPace(BASE * 1.2 + 0.01, config)).toBe('UT2');
		expect(classifyPace(BASE * 1.2, config)).toBe('UT1');
		expect(classifyPace(BASE * 1.1 + 0.01, config)).toBe('UT1');
		expect(classifyPace(BASE * 1.1, config)).toBe('AT');
		expect(classifyPace(BASE * 1.02 + 0.01, config)).toBe('AT');
		expect(classifyPace(BASE * 1.02, config)).toBe('TR');
		expect(classifyPace(BASE * 0.97 + 0.01, config)).toBe('TR');
		expect(classifyPace(BASE * 0.97, config)).toBe('AN');
		expect(classifyPace(BASE * 0.5, config)).toBe('AN');
	});
});

describe('classifyPace — 3-zone fallback', () => {
	const config = { basePace: null, medianPace: 130 } as const;

	it('uses median boundaries when no 2k PB', () => {
		expect(classifyPace(130 * 1.1 + 1, config)).toBe('Easy');
		expect(classifyPace(130 * 1.1, config)).toBe('Moderate');
		expect(classifyPace(130 * 0.95 + 1, config)).toBe('Moderate');
		expect(classifyPace(130 * 0.95, config)).toBe('Hard');
	});
});

describe('classifyPace — multi-sport', () => {
	const config = {
		basePace: BASE,
		medianPace: 140,
		sportMedians: { rower: 130, skierg: 150, bike: 160 }
	} as const;

	it('uses 5-zone for rower and 3-zone for skierg under mixed config', () => {
		expect(classifyPace(BASE * 0.9, config, 'rower')).toBe('AN');
		expect(classifyPace(150 * 0.9, config, 'skierg')).toBe('Hard');
		expect(classifyPace(150 * 1.2, config, 'skierg')).toBe('Easy');
	});
});

describe('buildDistribution', () => {
	it('attributes summary-level workouts by duration', () => {
		const config = { basePace: BASE };
		const ws: WorkoutForDistribution[] = [
			workout({ id: 1, time: 600, distance: 2500, pace: BASE * 1.25 }),
			workout({ id: 2, time: 400, distance: 1800, pace: BASE * 1.05 })
		];
		const dist = buildDistribution(ws, config);
		expect(dist.totalSeconds).toBe(1000);
		expect(dist.totalMeters).toBe(4300);
		expect(dist.slices.length).toBe(ZONES_5.length);
	});

	it('uses stroke data when present', () => {
		const config = { basePace: BASE };
		const ws: WorkoutForDistribution[] = [
			{
				...workout({ id: 1, time: 20, distance: 100, pace: BASE }),
				strokes: normalizedIntervalStrokes()
			}
		];
		const dist = buildDistribution(ws, config);
		expect(dist.totalSeconds).toBeGreaterThan(0);
	});

	it('uses splits when no strokes', () => {
		const config = { basePace: BASE };
		const ws: WorkoutForDistribution[] = [
			{
				...workout({ id: 1, time: 20, distance: 100, pace: BASE }),
				splits: intervalSplits
			}
		];
		const dist = buildDistribution(ws, config);
		expect(dist.totalSeconds).toBe(20);
		expect(dist.totalMeters).toBe(100);
	});

	it('returns zero totals for an empty workout list', () => {
		const config = { basePace: BASE };
		const dist = buildDistribution([], config);
		expect(dist.totalSeconds).toBe(0);
		expect(dist.slices.every((s) => s.seconds === 0)).toBe(true);
	});
});

describe('buildZoneConfig', () => {
	it('prefers 5-zone when a rower 2k PB exists', () => {
		const ws = [
			workout({ id: 1, distance: 2000, time: 480, pace: 120, sport: 'rower' }),
			workout({ id: 2, distance: 5000, time: 1200, pace: 130, sport: 'rower' })
		];
		const cfg = buildZoneConfig(ws, Date.parse('2026-06-01T00:00:00Z'));
		expect(cfg.basePace).toBe(120);
	});

	it('falls back to 3-zone without a 2k piece', () => {
		const ws = [workout({ id: 1, distance: 5000, time: 1200, pace: 130 })];
		const cfg = buildZoneConfig(ws, Date.parse('2026-06-01T00:00:00Z'));
		expect(cfg.basePace).toBeNull();
		expect(cfg.medianPace).toBe(130);
	});
});

describe('medianTrainingPace', () => {
	it('returns the median of workout paces', () => {
		const ws = [
			workout({ id: 1, pace: 100 }),
			workout({ id: 2, pace: 120 }),
			workout({ id: 3, pace: 140 })
		];
		expect(medianTrainingPace(ws)).toBe(120);
	});
});

describe('workoutsInPeriod', () => {
	const now = Date.parse('2026-06-04T12:00:00Z');

	it('includes recent workouts only', () => {
		const recent = workout({ id: 1, date: '2026-06-01 06:00:00' });
		const old = workout({ id: 2, date: '2025-01-01 06:00:00' });
		const in4w = workoutsInPeriod([recent, old], '4w', now);
		expect(in4w.map((w) => w.id)).toEqual([1]);
	});
});
