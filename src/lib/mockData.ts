import { paceToWattsForSport } from './format';
import type { Annotation, Split, Sport, Stroke, Workout, WorkoutDetail } from './types';

/**
 * Deterministic demo data so rowplay is fully explorable without registering a
 * Concept2 app. Strokes are synthesised with realistic pacing (warmup, steady
 * state, negative split, sprint finish) plus a little noise.
 */

interface Spec {
	id: number;
	date: string;
	sport: Sport;
	distance: number;
	basePace: number; // sec/500m
	baseSpm: number;
	baseHr: number;
	workoutType: string;
	comments?: string;
	interval?: boolean;
	source?: string;
	/** Demo-only: erg logged without HR — exercises device import. */
	omitHr?: boolean;
	/** IANA zone for calendar bucketing demos (cross-timezone fixture). */
	timezone?: string;
	/** Skip stroke synthesis for lightweight calendar fixtures. */
	noStrokes?: boolean;
	/** Demo-only: simulate the Concept2 `privacy` level (defaults to `everyone`). */
	privacy?: string;
}

const SPECS: Spec[] = [
	{ id: 1001, date: '2026-05-27 06:12:00', sport: 'rower', distance: 2000, basePace: 108, baseSpm: 30, baseHr: 168, workoutType: '2000m test', comments: 'PB attempt — held on for the sprint.' },
	{ id: 1002, date: '2026-05-24 07:05:00', sport: 'rower', distance: 5000, basePace: 118, baseSpm: 26, baseHr: 158, workoutType: '5000m steady', omitHr: true, privacy: 'private' },
	{ id: 1003, date: '2026-05-21 18:40:00', sport: 'skierg', distance: 1000, basePace: 122, baseSpm: 42, baseHr: 165, workoutType: '1000m SkiErg' },
	{
		id: 1004,
		date: '2026-05-19 06:30:00',
		sport: 'bike',
		distance: 8000,
		basePace: 95,
		baseSpm: 85,
		baseHr: 150,
		workoutType: '8000m BikeErg',
		source: 'EXR'
	},
	{ id: 1005, date: '2026-05-16 06:20:00', sport: 'rower', distance: 6000, basePace: 116, baseSpm: 28, baseHr: 160, workoutType: '4x1500m intervals', interval: true },
	{ id: 1006, date: '2026-05-13 18:15:00', sport: 'rower', distance: 500, basePace: 96, baseSpm: 36, baseHr: 172, workoutType: '500m sprint' },
	{ id: 1007, date: '2026-05-10 06:18:00', sport: 'rower', distance: 2000, basePace: 112, baseSpm: 29, baseHr: 166, workoutType: '2000m steady' },
	{ id: 1008, date: '2026-05-06 07:00:00', sport: 'skierg', distance: 1000, basePace: 126, baseSpm: 40, baseHr: 162, workoutType: '1000m SkiErg' },
	// Extra 2k pieces so the like-for-like trend shows a clear progression.
	{ id: 1009, date: '2026-04-29 06:25:00', sport: 'rower', distance: 2000, basePace: 113, baseSpm: 28, baseHr: 167, workoutType: '2000m test' },
	{ id: 1010, date: '2026-04-22 06:30:00', sport: 'rower', distance: 2000, basePace: 115, baseSpm: 28, baseHr: 168, workoutType: '2000m test' },
	{ id: 1011, date: '2026-04-15 06:28:00', sport: 'rower', distance: 2000, basePace: 117, baseSpm: 27, baseHr: 169, workoutType: '2000m test' },
	{
		id: 9001,
		date: '2024-01-14 23:30:00',
		timezone: 'America/New_York',
		sport: 'rower',
		distance: 5000,
		basePace: 126,
		baseSpm: 28,
		baseHr: 160,
		workoutType: '5000m steady',
		noStrokes: true
	},
	// Fixed-time piece for comparability-guard demo (ghost/compare block vs 2k distance pieces).
	{
		id: 1012,
		date: '2026-04-08 06:00:00',
		sport: 'rower',
		distance: 7500,
		basePace: 120,
		baseSpm: 26,
		baseHr: 160,
		workoutType: 'JustRow'
	}
];

// Small deterministic PRNG so demo data is stable across reloads.
function rng(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 0xffffffff;
	};
}

function paceProfile(frac: number): number {
	// Multiplier on base pace (lower = faster). Warmup slow, steady, sprint finish.
	if (frac < 0.08) return 1.06 - frac; // ease in
	if (frac > 0.9) return 0.9 - (frac - 0.9) * 0.6; // sprint
	return 1.0 - frac * 0.06; // gentle negative split
}

function buildStrokes(spec: Spec): { strokes: Stroke[]; time: number } {
	const rand = rng(spec.id);
	const strokes: Stroke[] = [];
	let d = 0;
	let t = 0;
	const dStep = spec.distance / 220; // ~220 samples
	while (d < spec.distance) {
		const frac = d / spec.distance;
		const noise = (rand() - 0.5) * 4;
		const pace = Math.max(70, spec.basePace * paceProfile(frac) + noise);
		const speed = 500 / pace; // m/s
		const dt = dStep / speed;
		t += dt;
		d += dStep;
		const spm = spec.baseSpm + (frac > 0.9 ? 4 : 0) + (rand() - 0.5) * 2;
		const stroke: Stroke = {
			t: round1(t),
			d: round1(Math.min(d, spec.distance)),
			pace: round1(pace),
			spm: Math.round(spm),
			watts: Math.round(paceToWattsForSport(spec.sport, pace))
		};
		if (!spec.omitHr) {
			const hr = Math.min(192, spec.baseHr * (0.8 + frac * 0.22) + (rand() - 0.5) * 3);
			stroke.hr = Math.round(hr);
		}
		strokes.push(stroke);
	}
	return { strokes, time: t };
}

function buildSplits(spec: Spec, strokes: Stroke[], time: number): Split[] {
	const n = spec.distance >= 5000 ? Math.round(spec.distance / 1000) : 4;
	const splits: Split[] = [];
	const seg = spec.distance / n;
	for (let i = 0; i < n; i++) {
		const startD = i * seg;
		const endD = (i + 1) * seg;
		const within = strokes.filter((s) => s.d > startD && s.d <= endD);
		if (within.length === 0) continue;
		const segTime = within[within.length - 1].t - (i === 0 ? 0 : strokes.filter((s) => s.d <= startD).slice(-1)[0]?.t ?? 0);
		const pace = segTime > 0 ? segTime / (seg / 500) : spec.basePace;
		const split: Split = {
			index: i,
			distance: Math.round(seg),
			time: round1(segTime),
			pace: round1(pace),
			spm: Math.round(avg(within.map((s) => s.spm)))
		};
		if (!spec.omitHr) {
			split.hr = Math.round(avg(within.map((s) => s.hr ?? 0)));
		}
		splits.push(split);
	}
	return splits;
}

/** Demo-only: exercise full-fidelity fields on selected fixtures. */
function applyFullFidelityDemo(spec: Spec, detail: WorkoutDetail): void {
	if (spec.id === 1005 && spec.interval) {
		const repDist = 1500;
		const repTime = round1(timeForDistance(repDist, spec.basePace));
		const restTime = 90;
		detail.splits = [];
		for (let i = 0; i < 4; i++) {
			detail.splits.push({
				index: detail.splits.length,
				distance: repDist,
				time: repTime,
				pace: spec.basePace,
				spm: spec.baseSpm,
				hr: spec.baseHr + i,
				heartRate: { average: spec.baseHr + i, ending: spec.baseHr + i + 4 },
				caloriesTotal: 95 + i * 2,
				wattMinutes: 38 + i,
				type: 'distance',
				isRest: false
			});
			if (i < 3) {
				detail.splits.push({
					index: detail.splits.length,
					distance: 0,
					time: restTime,
					pace: 0,
					heartRate: { rest: 118, recovery: 112 },
					isRest: true
				});
			}
		}
		detail.restTime = restTime * 3;
		detail.restDistance = 0;
		detail.verified = true;
		detail.weightClass = 'H';
		detail.targets = { strokeRate: 28, pace: spec.basePace + 2, watts: 210 };
		detail.heartRate = { average: spec.baseHr, min: 142, max: 178, ending: 172, recovery: 128 };
		detail.heartRateAvg = detail.heartRate.average;
		detail.hrMin = detail.heartRate.min;
		detail.hrMax = detail.heartRate.max;
		detail.wattMinutes = 168;
		detail.metadata = {
			pmVersion: 5,
			firmwareVersion: '707',
			serialNumber: 'DEMO-SN-1005',
			device: 'Demo iPhone',
			deviceOs: 'iOS',
			ergModelType: 0,
			hrType: 'BT'
		};
	}
	if (spec.id === 1007) {
		detail.heartRate = { average: spec.baseHr, min: 145, max: 174, ending: 170, recovery: 122 };
		detail.heartRateAvg = detail.heartRate.average;
		detail.hrMin = detail.heartRate.min;
		detail.hrMax = detail.heartRate.max;
	}
}

function timeForDistance(metres: number, paceSecPer500: number): number {
	return (metres / 500) * paceSecPer500;
}

function detailFor(spec: Spec): WorkoutDetail {
	const { strokes, time } = spec.noStrokes
		? { strokes: [] as Stroke[], time: timeForDistance(spec.distance, spec.basePace) }
		: buildStrokes(spec);
	const splits = spec.noStrokes ? [] : buildSplits(spec, strokes, time);
	const pace = time / (spec.distance / 500);
	const detail: WorkoutDetail = {
		id: spec.id,
		date: spec.date,
		sport: spec.sport,
		distance: spec.distance,
		time: round1(time),
		pace: round1(pace),
		strokeRate: strokes.length ? Math.round(avg(strokes.map((s) => s.spm))) : spec.baseSpm,
		strokeCount: strokes.length,
		caloriesTotal: Math.round((time / 60) * 12),
		dragFactor: spec.sport === 'rower' ? 130 : spec.sport === 'skierg' ? 110 : undefined,
		workoutType: spec.workoutType,
		comments: spec.comments,
		hasStrokeData: !spec.noStrokes,
		isInterval: !!spec.interval,
		strokes,
		splits
	};
	if (spec.timezone) detail.timezone = spec.timezone;
	if (!spec.omitHr) {
		detail.heartRateAvg = Math.round(avg(strokes.map((s) => s.hr ?? 0)));
	}
	if (spec.source) detail.source = spec.source;
	// Demo workouts simulate a public Concept2 privacy level so the share flow
	// works out of the box; specific specs override to exercise the block path.
	detail.privacy = spec.privacy ?? 'everyone';
	applyFullFidelityDemo(spec, detail);
	return detail;
}

function summaryOf(d: WorkoutDetail): Workout {
	const { strokes, splits, ...rest } = d;
	return { ...rest, isInterval: d.isInterval };
}

export function mockWorkouts(): Workout[] {
	const staticList = SPECS.map((s) => summaryOf(detailFor(s)));
	const generated = [...generatedSpecs.values()].map((s) => summaryOf(detailFor(s)));
	const byId = new Map<number, Workout>();
	for (const w of [...staticList, ...generated]) byId.set(w.id, w);
	return [...byId.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function mockWorkoutDetail(id: number): WorkoutDetail | null {
	const spec = SPECS.find((s) => s.id === id) ?? generatedSpecs.get(id);
	return spec ? detailFor(spec) : null;
}

const MOCK_TEMPLATES: Omit<Spec, 'id' | 'date'>[] = [
	{ sport: 'rower', distance: 2000, basePace: 110, baseSpm: 29, baseHr: 165, workoutType: '2000m steady' },
	{ sport: 'rower', distance: 5000, basePace: 118, baseSpm: 26, baseHr: 158, workoutType: '5000m steady' },
	{ sport: 'skierg', distance: 1000, basePace: 124, baseSpm: 41, baseHr: 163, workoutType: '1000m SkiErg' },
	{ sport: 'bike', distance: 4000, basePace: 98, baseSpm: 82, baseHr: 152, workoutType: '4000m BikeErg' },
	{ sport: 'rower', distance: 500, basePace: 100, baseSpm: 35, baseHr: 170, workoutType: '500m sprint' }
];

/** Runtime demo workouts created by live-mode mock polling. */
const generatedSpecs = new Map<number, Spec>();

/** Synthesise a new demo workout for live-mode mock polling. */
export function generateMockWorkout(existingIds: Iterable<number>): Workout {
	const used = new Set(existingIds);
	let id = 2000 + Math.floor(Math.random() * 8000);
	while (used.has(id)) id++;
	const tpl = MOCK_TEMPLATES[Math.floor(Math.random() * MOCK_TEMPLATES.length)];
	const now = new Date();
	const spec: Spec = {
		id,
		date: now.toISOString().slice(0, 19).replace('T', ' '),
		...tpl
	};
	generatedSpecs.set(id, spec);
	// Cap the generated map to avoid unbounded growth in long-running isolates.
	if (generatedSpecs.size > 50) generatedSpecs.delete(generatedSpecs.keys().next().value!);
	return summaryOf(detailFor(spec));
}

/**
 * Stable mock annotations for demo mode so coaching notes are explorable.
 * Timestamps align with the workout timeline (seconds since start).
 */
const MOCK_ANNOTATIONS: Record<number, Annotation[]> = {
	1001: [
		{ id: 1, timestamp: 30, text: 'Strong start — keep the rate at 30', createdAt: Date.parse('2026-05-27T06:15:00Z') },
		{ id: 2, timestamp: 90, text: 'Settle into 1:48 pace through the middle 1000', createdAt: Date.parse('2026-05-27T06:20:00Z') },
		{ id: 3, timestamp: 160, text: 'Sprint! Empty the tank in the last 250', createdAt: Date.parse('2026-05-27T06:25:00Z') }
	],
	1007: [
		{ id: 5, timestamp: 45, text: 'Good rhythm, body over at the finish', createdAt: Date.parse('2026-05-10T06:20:00Z') },
		{ id: 6, timestamp: 120, text: 'Watch the catch — no pause at the back', createdAt: Date.parse('2026-05-10T06:25:00Z') }
	],
	1005: [
		{ id: 7, timestamp: 15, text: 'Interval 1 start — controlled effort', createdAt: Date.parse('2026-05-16T06:22:00Z') },
		{ id: 8, timestamp: 150, text: 'Interval 2 — hold steady through the rest', createdAt: Date.parse('2026-05-16T06:25:00Z') }
	]
};

export function mockAnnotations(workoutId: number): Annotation[] {
	// Return a shallow copy to prevent callers from mutating shared template data.
	return (MOCK_ANNOTATIONS[workoutId] ?? []).map((a) => ({ ...a }));
}

function avg(xs: number[]): number {
	return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function round1(x: number): number {
	return Math.round(x * 10) / 10;
}
