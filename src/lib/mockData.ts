import { paceToWatts } from './format';
import type { Split, Sport, Stroke, Workout, WorkoutDetail } from './types';

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
}

const SPECS: Spec[] = [
	{ id: 1001, date: '2026-05-27 06:12:00', sport: 'rower', distance: 2000, basePace: 108, baseSpm: 30, baseHr: 168, workoutType: '2000m test', comments: 'PB attempt — held on for the sprint.' },
	{ id: 1002, date: '2026-05-24 07:05:00', sport: 'rower', distance: 5000, basePace: 118, baseSpm: 26, baseHr: 158, workoutType: '5000m steady' },
	{ id: 1003, date: '2026-05-21 18:40:00', sport: 'skierg', distance: 1000, basePace: 122, baseSpm: 42, baseHr: 165, workoutType: '1000m SkiErg' },
	{ id: 1004, date: '2026-05-19 06:30:00', sport: 'bike', distance: 8000, basePace: 95, baseSpm: 85, baseHr: 150, workoutType: '8000m BikeErg' },
	{ id: 1005, date: '2026-05-16 06:20:00', sport: 'rower', distance: 6000, basePace: 116, baseSpm: 28, baseHr: 160, workoutType: '4x1500m intervals', interval: true },
	{ id: 1006, date: '2026-05-13 18:15:00', sport: 'rower', distance: 500, basePace: 96, baseSpm: 36, baseHr: 172, workoutType: '500m sprint' },
	{ id: 1007, date: '2026-05-10 06:18:00', sport: 'rower', distance: 2000, basePace: 112, baseSpm: 29, baseHr: 166, workoutType: '2000m steady' },
	{ id: 1008, date: '2026-05-06 07:00:00', sport: 'skierg', distance: 1000, basePace: 126, baseSpm: 40, baseHr: 162, workoutType: '1000m SkiErg' },
	// Extra 2k pieces so the like-for-like trend shows a clear progression.
	{ id: 1009, date: '2026-04-29 06:25:00', sport: 'rower', distance: 2000, basePace: 113, baseSpm: 28, baseHr: 167, workoutType: '2000m test' },
	{ id: 1010, date: '2026-04-22 06:30:00', sport: 'rower', distance: 2000, basePace: 115, baseSpm: 28, baseHr: 168, workoutType: '2000m test' },
	{ id: 1011, date: '2026-04-15 06:28:00', sport: 'rower', distance: 2000, basePace: 117, baseSpm: 27, baseHr: 169, workoutType: '2000m test' }
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
		const hr = Math.min(192, spec.baseHr * (0.8 + frac * 0.22) + (rand() - 0.5) * 3);
		strokes.push({
			t: round1(t),
			d: round1(Math.min(d, spec.distance)),
			pace: round1(pace),
			spm: Math.round(spm),
			hr: Math.round(hr),
			watts: Math.round(paceToWatts(pace))
		});
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
		splits.push({
			index: i,
			distance: Math.round(seg),
			time: round1(segTime),
			pace: round1(pace),
			spm: Math.round(avg(within.map((s) => s.spm))),
			hr: Math.round(avg(within.map((s) => s.hr ?? 0)))
		});
	}
	return splits;
}

function detailFor(spec: Spec): WorkoutDetail {
	const { strokes, time } = buildStrokes(spec);
	const splits = buildSplits(spec, strokes, time);
	const pace = time / (spec.distance / 500);
	return {
		id: spec.id,
		date: spec.date,
		sport: spec.sport,
		distance: spec.distance,
		time: round1(time),
		pace: round1(pace),
		strokeRate: Math.round(avg(strokes.map((s) => s.spm))),
		strokeCount: strokes.length,
		heartRateAvg: Math.round(avg(strokes.map((s) => s.hr ?? 0))),
		caloriesTotal: Math.round((time / 60) * 12),
		dragFactor: spec.sport === 'rower' ? 130 : spec.sport === 'skierg' ? 110 : undefined,
		workoutType: spec.workoutType,
		comments: spec.comments,
		hasStrokeData: true,
		isInterval: !!spec.interval,
		strokes,
		splits
	};
}

function summaryOf(d: WorkoutDetail): Workout {
	const { strokes, splits, isInterval, ...rest } = d;
	return rest;
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

function avg(xs: number[]): number {
	return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function round1(x: number): number {
	return Math.round(x * 10) / 10;
}
