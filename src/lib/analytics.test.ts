import { describe, expect, it } from 'vitest';
import {
	aggregateDailyVolume,
	annualGoalProgress,
	buildTrainingCalendar,
	distanceBand,
	distancePBs,
	distancePerStroke,
	efficiencyByRate,
	estimateCriticalPower,
	hrZones,
	intervalBreakdown,
	linearTrend,
	powerCurve,
	summariseBySport,
	techniqueSummary,
	trainingLoad,
	volumeIntensityLevel,
	workoutDayKey,
	workoutWatts,
	dayVolumeValue,
	hrRecoveryTrend,
	hrZoneOf,
	workRestEfficiency,
	targetVsActual
} from './analytics';
import { mockWorkoutDetail, mockWorkouts } from './mockData';
import {
	intervalSplits,
	normalizedIntervalStrokes,
	normalizeRawStrokes,
	stroke,
	twoRepSplits,
	workout
} from '../../tests/unit/fixtures';

const workouts = mockWorkouts();

describe('linearTrend', () => {
	it('returns null with fewer than two points', () => {
		expect(linearTrend([])).toBeNull();
		expect(linearTrend([{ x: 0, y: 1 }])).toBeNull();
	});

	it('fits a downward pace trend for improving 2k pieces', () => {
		const twoKs = workouts.filter((w) => Math.abs(w.distance - 2000) < 50).sort((a, b) => a.date.localeCompare(b.date));
		const points = twoKs.map((w) => ({ x: Date.parse(w.date.replace(' ', 'T') + 'Z'), y: w.pace }));
		const fit = linearTrend(points);
		expect(fit).not.toBeNull();
		expect(fit!.n).toBeGreaterThanOrEqual(2);
		expect(fit!.delta).toBeLessThan(0);
	});
});

describe('distanceBand', () => {
	it('buckets standard erg distances', () => {
		expect(distanceBand(2000).key).toBe('2000');
		expect(distanceBand(2003).key).toBe('2000');
	});

	it('uses coarse bands for odd distances', () => {
		expect(distanceBand(3500).label).toBe('3k–7k');
	});
});

describe('summariseBySport', () => {
	it('aggregates mock history by sport', () => {
		const rows = summariseBySport(workouts);
		expect(rows.length).toBeGreaterThanOrEqual(2);
		const rower = rows.find((r) => r.sport === 'rower');
		expect(rower!.sessions).toBeGreaterThan(0);
		expect(rower!.distance).toBeGreaterThan(0);
		expect(rower!.avgPace).toBeGreaterThan(0);
	});
});

describe('distancePBs', () => {
	it('finds fastest standard distances within tolerance', () => {
		const pbs = distancePBs(workouts);
		const twoK = pbs.find((p) => p.distance === 2000);
		expect(twoK).toBeDefined();
		expect(twoK!.time).toBeGreaterThan(0);
		expect(twoK!.pace).toBeGreaterThan(0);
	});
});

describe('hrZones', () => {
	it('distributes time across five zones', () => {
		const detail = mockWorkoutDetail(1001)!;
		const zones = hrZones(detail.strokes);
		expect(zones).toHaveLength(5);
		const total = zones.reduce((s, z) => s + z.fraction, 0);
		expect(total).toBeCloseTo(1, 5);
		expect(zones.every((z) => z.seconds >= 0)).toBe(true);
	});
});

describe('distancePerStroke', () => {
	it('returns 0 for invalid inputs', () => {
		expect(distancePerStroke(0, 30)).toBe(0);
	});

	it('computes metres per stroke from pace and rate', () => {
		const dps = distancePerStroke(120, 30);
		expect(dps).toBeCloseTo(500 / 120 / (30 / 60), 5);
	});
});

describe('techniqueSummary', () => {
	it('summarises mock stroke data', () => {
		const detail = mockWorkoutDetail(1002)!;
		const t = techniqueSummary(detail.strokes);
		expect(t.avgDps).toBeGreaterThan(0);
		expect(t.avgSpm).toBeGreaterThan(0);
		expect(t.dps.length).toBeGreaterThan(0);
	});
});

describe('efficiencyByRate', () => {
	it('buckets strokes by rounded SPM', () => {
		const detail = mockWorkoutDetail(1001)!;
		const pts = efficiencyByRate(detail.strokes);
		expect(pts.length).toBeGreaterThan(0);
		expect(pts[0].dps).toBeGreaterThan(0);
	});
});

describe('workoutWatts', () => {
	it('uses watt-minutes when logged', () => {
		const w = workout({ id: 1, wattMinutes: 480, time: 480, pace: 120 });
		expect(workoutWatts(w)).toBe(60);
	});

	it('derives watts from normalised pace for bike without watt-minutes', () => {
		const w = workout({ id: 2, sport: 'bike', pace: 95, time: 600 });
		expect(workoutWatts(w)).toBeCloseTo(51.03, 1);
	});

	it('derives watts from pace for rower', () => {
		const w = workout({ id: 3, sport: 'rower', pace: 120, time: 480 });
		expect(workoutWatts(w)).toBeGreaterThan(0);
	});
});

describe('estimateCriticalPower', () => {
	it('returns a threshold from mock history', () => {
		const cp = estimateCriticalPower(workouts);
		expect(cp).not.toBeNull();
		expect(cp!.ftp).toBeGreaterThan(0);
		expect(['model', 'estimate']).toContain(cp!.method);
	});
});

describe('annualGoalProgress', () => {
	it('credits BikeErg distance at half toward metre goals', () => {
		const progress = annualGoalProgress(
			[workout({ id: 1, sport: 'bike', distance: 8000, time: 1000, pace: 95 })],
			{ year: 2026, kind: 'meters', target: 1_000_000 },
			'2026-06-01'
		);
		expect(progress.current).toBe(4000);
	});
});

describe('trainingLoad', () => {
	it('builds PMC series from mock workouts', () => {
		const load = trainingLoad(workouts);
		expect(load).not.toBeNull();
		expect(load!.series.length).toBeGreaterThan(0);
		expect(load!.ctl).toBeGreaterThanOrEqual(0);
		expect(['transition', 'fresh', 'neutral', 'productive', 'overreaching']).toContain(load!.band);
	});
});

describe('powerCurve', () => {
	it('returns mean-maximal points for mock strokes', () => {
		const detail = mockWorkoutDetail(1001)!;
		const curve = powerCurve(detail.strokes, [10, 30, 60]);
		expect(curve.length).toBeGreaterThan(0);
		expect(curve.every((p) => p.watts >= 0)).toBe(true);
	});

	it('returns empty for too few strokes', () => {
		expect(powerCurve([{ t: 0, d: 0, pace: 120, spm: 28, watts: 100 }])).toEqual([]);
	});
});

describe('intervalBreakdown', () => {
	it('returns null for single-segment pieces', () => {
		const detail = mockWorkoutDetail(1001)!;
		expect(intervalBreakdown([detail.splits[0]], detail.strokes)).toBeNull();
	});

	it('assigns strokes across reps using cumulative split time boundaries', () => {
		const result = intervalBreakdown(intervalSplits, normalizedIntervalStrokes());
		expect(result).not.toBeNull();
		expect(result!.reps).toHaveLength(2);
		expect(result!.reps[0].pace).toBe(120);
		expect(result!.reps[1].pace).toBe(122);
		// Rep 0 gets strokes with t ≤ 10 (4 strokes), rep 1 gets t > 10 (2 strokes).
		// spm is derived from the bucket since splits omit it, and rep values differ.
		expect(result!.reps[0].spm).toBeGreaterThan(result!.reps[1].spm);
		expect(result!.reps[0].spm).not.toBe(result!.reps[1].spm);
	});

	it('returns a breakdown with zero derived spm when strokes are empty', () => {
		const result = intervalBreakdown(twoRepSplits, []);
		expect(result).not.toBeNull();
		expect(result!.reps).toHaveLength(2);
		expect(result!.reps[0].spm).toBe(0);
		expect(result!.reps[1].spm).toBe(0);
	});

	it('assigns a stroke exactly on a split boundary to that rep', () => {
		const onFirstEdge = intervalBreakdown(twoRepSplits, [stroke(10, 99)]);
		expect(onFirstEdge!.reps[0].spm).toBe(99);
		expect(onFirstEdge!.reps[1].spm).toBe(0);

		const onLastEdge = intervalBreakdown(twoRepSplits, [stroke(20, 88)]);
		expect(onLastEdge!.reps[0].spm).toBe(0);
		expect(onLastEdge!.reps[1].spm).toBe(88);
	});

	it('assigns strokes after the last split boundary to the final rep', () => {
		const result = intervalBreakdown(twoRepSplits, [stroke(25, 77)]);
		expect(result!.reps[0].spm).toBe(0);
		expect(result!.reps[1].spm).toBe(77);
	});
});

describe('calendar helpers', () => {
	it('extracts day key without timezone shift', () => {
		expect(workoutDayKey('2026-05-27 06:12:00')).toBe('2026-05-27');
	});

	it('aggregates daily volume', () => {
		const map = aggregateDailyVolume(workouts);
		expect(map.size).toBeGreaterThan(0);
		const first = [...map.values()][0];
		expect(dayVolumeValue(first, 'distance')).toBe(first.distance);
	});

	it('builds a stable training calendar grid', () => {
		const cal = buildTrainingCalendar(workouts, { endDay: '2026-05-27', weeks: 12 });
		expect(cal.cells.length).toBe(12 * 7);
		expect(cal.activeDays).toBeGreaterThan(0);
		expect(cal.longestStreak).toBeGreaterThanOrEqual(cal.currentStreak);
	});

	it('buckets cross-timezone workouts on the athlete local day', () => {
		const crossTz = {
			id: 9001,
			date: '2024-01-14 23:30:00',
			timezone: 'America/New_York',
			sport: 'rower' as const,
			distance: 5000,
			time: 1260,
			pace: 126,
			hasStrokeData: false
		};
		const withHome = buildTrainingCalendar([crossTz], {
			endDay: '2024-01-20',
			weeks: 2,
			homeTz: 'America/New_York'
		});
		const jan14WithHome = withHome.cells.find((c) => c.day === '2024-01-14');
		expect(jan14WithHome?.sessions).toBe(1);

		const withWorkoutTzOnly = buildTrainingCalendar([crossTz], {
			endDay: '2024-01-20',
			weeks: 2
		});
		const jan14WorkoutTz = withWorkoutTzOnly.cells.find((c) => c.day === '2024-01-14');
		expect(jan14WorkoutTz?.sessions).toBe(1);
	});
});

describe('volumeIntensityLevel', () => {
	it('returns 0 for rest days', () => {
		expect(volumeIntensityLevel(0, [100, 200, 300])).toBe(0);
	});

	it('maps the max volume to max level', () => {
		const sorted = [100, 200, 300, 400];
		expect(volumeIntensityLevel(400, sorted, 4)).toBe(4);
	});
});

describe('stroke normalisation (bike + intervals)', () => {
	it('offsets time and distance across interval resets', () => {
		const raw = [
			{ t: 0, d: 0, p: 1200, spm: 28 },
			{ t: 100, d: 500, p: 1180, spm: 29 },
			{ t: 0, d: 0, p: 1220, spm: 27 },
			{ t: 100, d: 500, p: 1200, spm: 28 }
		];
		const norm = normalizeRawStrokes(raw, 'rower');
		expect(norm[2].t).toBeGreaterThanOrEqual(norm[1].t);
		expect(norm[3].t).toBeGreaterThan(norm[2].t);
	});

	it('halves bike pace to sec/500m', () => {
		const raw = [{ t: 0, d: 0, p: 1900, spm: 85 }];
		const norm = normalizeRawStrokes(raw, 'bike');
		expect(norm[0].pace).toBe(95);
	});
});

describe('full-fidelity analytics', () => {
	it('hrRecoveryTrend uses ending/recovery when present', () => {
		const detail = mockWorkoutDetail(1007)!;
		const trend = hrRecoveryTrend([detail]);
		expect(trend.length).toBe(1);
		expect(trend[0].drop).toBe(48);
	});

	it('hrZoneOf returns 0-indexed zones aligned with Concept2 targets', () => {
		const hrMax = 200;
		expect(hrZoneOf(100, hrMax)).toBe(0);
		expect(hrZoneOf(130, hrMax)).toBe(1);
		expect(hrZoneOf(190, hrMax)).toBe(4);
		expect(hrZoneOf(250, hrMax)).toBe(5);
	});

	it('targetVsActual compares HR zone index to derived zone, not bpm', () => {
		const detail = mockWorkoutDetail(1005)!;
		detail.targets = { ...detail.targets, heartRateZone: 3 };
		detail.heartRateAvg = 160;
		detail.hrMax = 200;
		const row = targetVsActual(detail).find((r) => r.metric === 'heartRateZone');
		expect(row).toBeDefined();
		expect(row!.actual).toBeLessThanOrEqual(5);
		expect(row!.actual).toBeGreaterThanOrEqual(0);
		expect(typeof row!.actual).toBe('number');
		expect(row!.actual).not.toBe(detail.heartRateAvg);
	});

	it('workRestEfficiency summarises interval work vs rest', () => {
		const detail = mockWorkoutDetail(1005)!;
		const eff = workRestEfficiency(detail);
		expect(eff).not.toBeNull();
		expect(eff!.restTime).toBe(270);
		expect(eff!.timeRatio).toBeGreaterThan(0);
	});

	it('targetVsActual compares pace and watts', () => {
		const detail = mockWorkoutDetail(1005)!;
		const rows = targetVsActual(detail);
		expect(rows.some((r) => r.metric === 'pace')).toBe(true);
		expect(rows.some((r) => r.metric === 'watts')).toBe(true);
	});
});
