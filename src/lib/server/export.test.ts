import { describe, expect, it } from 'vitest';
import {
	exportFilename,
	workoutDetailToTcx,
	workoutExportFilename,
	workoutsToJson,
	workoutsToCsv
} from './export';
import type { Workout, WorkoutDetail } from '../types';

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
	return {
		id: 1,
		date: '2026-05-01 06:00:00',
		sport: 'rower',
		distance: 2000,
		time: 480,
		pace: 120,
		hasStrokeData: false,
		...overrides
	};
}

describe('workoutsToCsv', () => {
	it('outputs a header row followed by one data row per workout', () => {
		const csv = workoutsToCsv([makeWorkout({ id: 42 })]);
		const lines = csv.trim().split('\n');
		expect(lines).toHaveLength(2);
		expect(lines[0]).toContain('id');
		expect(lines[0]).toContain('distance_m');
		expect(lines[1]).toContain('42');
	});

	it('ends with a newline', () => {
		expect(workoutsToCsv([makeWorkout()])).toMatch(/\n$/);
	});

	it('returns just the header for an empty list', () => {
		const csv = workoutsToCsv([]);
		expect(csv.trim().split('\n')).toHaveLength(1);
	});

	it('escapes double-quotes in comments (RFC 4180)', () => {
		const csv = workoutsToCsv([makeWorkout({ comments: 'She said "good row"' })]);
		expect(csv).toContain('"She said ""good row"""');
	});

	it('escapes commas by quoting the field', () => {
		const csv = workoutsToCsv([makeWorkout({ comments: 'Morning, hard effort' })]);
		expect(csv).toContain('"Morning, hard effort"');
	});

	it('prefixes formula-injection characters with a tab', () => {
		const csv = workoutsToCsv([makeWorkout({ comments: '=SUM(A1)' })]);
		expect(csv).toContain('\t=SUM(A1)');
	});

	it('marks formula characters starting with + and @', () => {
		expect(workoutsToCsv([makeWorkout({ comments: '+1' })])).toContain('\t+1');
		expect(workoutsToCsv([makeWorkout({ comments: '@user' })])).toContain('\t@user');
	});

	it('sets has_stroke_data to 1 for workouts with stroke data', () => {
		const csv = workoutsToCsv([makeWorkout({ hasStrokeData: true })]);
		expect(csv.split('\n')[1]).toMatch(/,1\s*$/);
	});

	it('sets has_stroke_data to 0 for workouts without stroke data', () => {
		const csv = workoutsToCsv([makeWorkout({ hasStrokeData: false })]);
		expect(csv.split('\n')[1]).toMatch(/,0\s*$/);
	});

	it('leaves optional fields blank when undefined', () => {
		const csv = workoutsToCsv([makeWorkout({ strokeRate: undefined, heartRateAvg: undefined })]);
		// Several consecutive commas → empty fields
		expect(csv).toContain(',,');
	});
});

describe('workoutsToJson', () => {
	it('produces valid JSON with the right shape', () => {
		const json = workoutsToJson([makeWorkout({ id: 7 })]);
		const parsed = JSON.parse(json);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0].id).toBe(7);
		expect(parsed[0].sport).toBe('rower');
	});

	it('returns an empty array for no workouts', () => {
		expect(JSON.parse(workoutsToJson([]))).toEqual([]);
	});

	it('includes all expected fields', () => {
		const json = workoutsToJson([makeWorkout()]);
		const row = JSON.parse(json)[0];
		const expected = ['id', 'date', 'sport', 'distance', 'time', 'pace', 'hasStrokeData'];
		for (const key of expected) {
			expect(row).toHaveProperty(key);
		}
	});
});

describe('workoutDetailToTcx', () => {
	const detail: WorkoutDetail = {
		id: 100,
		date: '2026-05-01 06:00:00',
		sport: 'rower',
		distance: 2000,
		time: 480,
		pace: 120,
		hasStrokeData: true,
		strokes: [
			{ t: 0, d: 0, pace: 120, spm: 28, watts: 120 },
			{ t: 240, d: 1000, pace: 118, spm: 30, watts: 130 },
			{ t: 480, d: 2000, pace: 116, spm: 32, watts: 140 }
		],
		splits: [
			{ index: 0, distance: 1000, time: 240, pace: 120 },
			{ index: 1, distance: 1000, time: 240, pace: 116 }
		],
		isInterval: false
	};

	it('produces valid TCX XML', () => {
		const tcx = workoutDetailToTcx(detail);
		expect(tcx).toContain('<?xml version="1.0"');
		expect(tcx).toContain('TrainingCenterDatabase');
		expect(tcx).toContain('<Activity');
	});

	it('includes trackpoints for each stroke', () => {
		const tcx = workoutDetailToTcx(detail);
		const count = (tcx.match(/<Trackpoint>/g) ?? []).length;
		expect(count).toBe(3);
	});

	it('includes split laps when splits are present', () => {
		const tcx = workoutDetailToTcx(detail);
		expect((tcx.match(/<Lap /g) ?? []).length).toBeGreaterThanOrEqual(3); // summary + 2 splits
	});

	it('uses Biking sport for bike workouts', () => {
		const bikeTcx = workoutDetailToTcx({ ...detail, sport: 'bike' });
		expect(bikeTcx).toContain('Sport="Biking"');
	});

	it('uses Other sport for rower/skierg', () => {
		expect(workoutDetailToTcx(detail)).toContain('Sport="Other"');
		expect(workoutDetailToTcx({ ...detail, sport: 'skierg' })).toContain('Sport="Other"');
	});

	it('includes DistanceMeters trackpoints', () => {
		const tcx = workoutDetailToTcx(detail);
		expect(tcx).toContain('<DistanceMeters>');
	});

	it('XML-escapes special characters in workout names', () => {
		const d = { ...detail, workoutType: '<Test & "Row">' };
		const tcx = workoutDetailToTcx(d);
		expect(tcx).not.toContain('<Test & "Row">');
		expect(tcx).toContain('&lt;Test &amp; &quot;Row&quot;&gt;');
	});

	it('handles empty strokes gracefully', () => {
		const d = { ...detail, strokes: [], splits: [] };
		expect(() => workoutDetailToTcx(d)).not.toThrow();
	});
});

describe('exportFilename', () => {
	it('includes the current date and provided extension', () => {
		const name = exportFilename('csv');
		expect(name).toMatch(/^rowplay-logbook-\d{4}-\d{2}-\d{2}\.csv$/);
	});
});

describe('workoutExportFilename', () => {
	it('includes the workout id and extension', () => {
		expect(workoutExportFilename(42, 'tcx')).toBe('rowplay-workout-42.tcx');
	});
});
