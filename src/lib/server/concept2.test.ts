import { describe, expect, it } from 'vitest';
import {
	mapHeartRate,
	mapMetadata,
	mapResult,
	mapSplits,
	mapStrokes,
	mapTargets
} from './concept2';
import { computeIsMultiErg } from '../types';
import type { Split } from '../types';
import { bikePaceSecPer500 } from '../../../tests/unit/fixtures';

describe('mapHeartRate', () => {
	it('maps a scalar to average only', () => {
		expect(mapHeartRate(152)).toEqual({ average: 152 });
	});

	it('returns undefined when absent', () => {
		expect(mapHeartRate(undefined)).toBeUndefined();
	});

	it('maps the full object', () => {
		expect(
			mapHeartRate({ average: 160, min: 140, max: 172, ending: 168, recovery: 120 })
		).toEqual({ average: 160, min: 140, max: 172, ending: 168, recovery: 120 });
	});
});

describe('mapTargets', () => {
	it('converts pace tenths to sec/500m for rower', () => {
		expect(mapTargets({ pace: 1080 }, 'rower')).toEqual({ pace: 108 });
	});

	it('halves bike target pace (per-1000m API units)', () => {
		expect(mapTargets({ pace: 2000 }, 'bike')).toEqual({ pace: 100 });
	});

	it('returns undefined when absent', () => {
		expect(mapTargets(undefined, 'rower')).toBeUndefined();
	});
});

describe('mapMetadata', () => {
	it('maps provenance fields', () => {
		expect(
			mapMetadata({
				pm_version: 5,
				firmware_version: '707',
				serial_number: 'SN-1',
				device: 'iPhone',
				erg_model_type: 0,
				hr_type: 'BT'
			})
		).toEqual({
			pmVersion: 5,
			firmwareVersion: '707',
			serialNumber: 'SN-1',
			device: 'iPhone',
			ergModelType: 0,
			hrType: 'BT'
		});
	});
});

describe('mapResult', () => {
	const base = {
		id: 42,
		date: '2026-05-01 06:00:00',
		type: 'rower',
		distance: 2000,
		time: 4800,
		stroke_data: true
	};

	it('normalises rest time from tenths to seconds', () => {
		const w = mapResult({ ...base, rest_time: 900 });
		expect(w.restTime).toBe(90);
	});

	it('leaves absent fields undefined', () => {
		const w = mapResult(base);
		expect(w.restTime).toBeUndefined();
		expect(w.targets).toBeUndefined();
		expect(w.verified).toBeUndefined();
	});

	it('captures HR ending/recovery and flat compat fields', () => {
		const w = mapResult({
			...base,
			heart_rate: { average: 160, min: 140, max: 170, ending: 168, recovery: 118 }
		});
		expect(w.heartRate?.recovery).toBe(118);
		expect(w.heartRateAvg).toBe(160);
		expect(w.hrMin).toBe(140);
		expect(w.hrMax).toBe(170);
	});

	it('maps workout targets and metadata', () => {
		const w = mapResult(
			{
				...base,
				workout: { targets: { stroke_rate: 30, watts: 220 } }
			},
			{ pm_version: 5, serial_number: 'X' }
		);
		expect(w.targets).toEqual({ strokeRate: 30, watts: 220 });
		expect(w.metadata?.pmVersion).toBe(5);
		expect(w.metadata?.serialNumber).toBe('X');
	});
});

describe('mapSplits', () => {
	it('maps split calories, HR detail, and interval type', () => {
		const splits = mapSplits({
			id: 1,
			date: '2026-05-01',
			distance: 6000,
			time: 12000,
			type: 'rower',
			workout: {
				intervals: [
					{
						distance: 1500,
						time: 3600,
						calories_total: 120,
						wattminutes_total: 45,
						type: 'distance',
						heart_rate: { average: 165, ending: 170 }
					},
					{ distance: 0, time: 600, type: 'time' }
				]
			}
		});
		expect(splits[0].caloriesTotal).toBe(120);
		expect(splits[0].heartRate?.ending).toBe(170);
		expect(splits[0].type).toBe('distance');
		expect(splits[0].isRest).toBe(false);
		expect(splits[1].isRest).toBe(true);
		expect(splits[1].restTime).toBeUndefined();
	});
});

describe('mapStrokes bike pace', () => {
	it('matches fixture halving for bike', () => {
		expect(bikePaceSecPer500(2000)).toBe(100);
	});

	it('halves bike segment pace when splits carry machine', () => {
		const splits: Split[] = [
			{ index: 0, distance: 500, time: 100, pace: 100, machine: 'rower', isRest: false },
			{ index: 1, distance: 500, time: 100, pace: 100, machine: 'bike', isRest: false }
		];
		const strokes = mapStrokes(
			[
				{ t: 100, d: 500, p: 2000, spm: 28 },
				{ t: 50, d: 250, p: 4000, spm: 80 }
			],
			'rower',
			splits
		);
		expect(strokes[0].pace).toBe(200);
		expect(strokes[1].pace).toBe(200);
	});

	it('matches single-sport output with and without splits', () => {
		const raw = [{ t: 100, d: 250, p: 2000, spm: 28 }];
		const a = mapStrokes(raw, 'rower');
		const b = mapStrokes(raw, 'rower', []);
		expect(a).toEqual(b);
	});

	it('assigns strokes after a reset to the next segment machine', () => {
		const splits: Split[] = [
			{ index: 0, distance: 500, time: 100, pace: 100, machine: 'rower', isRest: false },
			{ index: 1, distance: 500, time: 100, pace: 100, machine: 'bike', isRest: false }
		];
		const strokes = mapStrokes(
			[
				{ t: 100, d: 500, p: 2000, spm: 28 },
				{ t: 10, d: 50, p: 4000, spm: 80 }
			],
			'rower',
			splits
		);
		expect(strokes[0].rawD).toBe(50);
		expect(strokes[1].rawD).toBe(5);
		expect(strokes[1].d).toBeGreaterThan(strokes[0].d);
	});
});

describe('computeIsMultiErg', () => {
	it('is true when two work machines appear', () => {
		const splits: Split[] = [
			{ index: 0, distance: 500, time: 100, pace: 100, machine: 'rower', isRest: false },
			{ index: 1, distance: 500, time: 100, pace: 100, machine: 'bike', isRest: false }
		];
		expect(computeIsMultiErg(splits)).toBe(true);
	});
});
