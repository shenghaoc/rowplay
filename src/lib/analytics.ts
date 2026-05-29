import type { Sport, Stroke, Workout } from './types';

// ---------------------------------------------------------------------------
// Pure analysis helpers. No DOM, no Svelte — safe to use on server or client,
// and easy to unit test.
// ---------------------------------------------------------------------------

export interface SportSummary {
	sport: Sport;
	sessions: number;
	distance: number;
	time: number;
	/** Distance-weighted average pace (sec/500m). */
	avgPace: number;
	/** Best (lowest) average pace across this sport's sessions. */
	bestPace: number;
	longest: number;
}

export function summariseBySport(workouts: Workout[]): SportSummary[] {
	const by = new Map<Sport, Workout[]>();
	for (const w of workouts) {
		const arr = by.get(w.sport) ?? [];
		arr.push(w);
		by.set(w.sport, arr);
	}
	const out: SportSummary[] = [];
	for (const [sport, ws] of by) {
		const distance = ws.reduce((s, w) => s + w.distance, 0);
		const time = ws.reduce((s, w) => s + w.time, 0);
		const avgPace = distance > 0 ? time / (distance / 500) : 0;
		const bestPace = Math.min(...ws.map((w) => w.pace).filter((p) => p > 0));
		const longest = Math.max(...ws.map((w) => w.distance));
		out.push({ sport, sessions: ws.length, distance, time, avgPace, bestPace, longest });
	}
	return out.sort((a, b) => b.distance - a.distance);
}

export interface PersonalBest {
	label: string;
	value: string;
	sub?: string;
}

/** Standard erg distances we track records for, in metres. */
const STANDARD_DISTANCES = [500, 1000, 2000, 5000, 6000, 10000, 21097];

/**
 * Fastest time for each standard distance the athlete has actually completed,
 * within ~2% so a "2000m" piece logged as 2003m still counts.
 */
export function distancePBs(workouts: Workout[]): { distance: number; time: number; pace: number; date: string; sport: Sport }[] {
	const out: { distance: number; time: number; pace: number; date: string; sport: Sport }[] = [];
	for (const target of STANDARD_DISTANCES) {
		const matches = workouts.filter((w) => Math.abs(w.distance - target) <= target * 0.02 && w.time > 0);
		if (!matches.length) continue;
		const best = matches.reduce((a, b) => (a.time <= b.time ? a : b));
		out.push({ distance: target, time: best.time, pace: best.pace, date: best.date, sport: best.sport });
	}
	return out;
}

// ---------------------------------------------------------------------------
// Per-workout (stroke-level) analysis
// ---------------------------------------------------------------------------

export interface HrZone {
	zone: number;
	label: string;
	color: string;
	min: number;
	max: number;
	seconds: number;
	fraction: number;
}

/**
 * Time-in-zone distribution. Zones are defined as percentages of `maxHr`
 * (Karvonen-style boundaries: 60/70/80/90%). If `maxHr` is omitted we estimate
 * it from the workout's peak heart rate.
 */
export function hrZones(strokes: Stroke[], maxHr?: number): HrZone[] {
	const peak = Math.max(0, ...strokes.map((s) => s.hr ?? 0));
	const hrMax = maxHr && maxHr > 0 ? maxHr : Math.max(peak / 0.95, 160);

	const bounds = [0, 0.6, 0.7, 0.8, 0.9, 1.2].map((f) => f * hrMax);
	const labels = ['Z1 Recovery', 'Z2 Endurance', 'Z3 Tempo', 'Z4 Threshold', 'Z5 Max'];
	const colors = ['#3fb950', '#56d4ff', '#d29922', '#f0883e', '#f85149'];
	const seconds = new Array(5).fill(0);

	for (let i = 1; i < strokes.length; i++) {
		const dt = strokes[i].t - strokes[i - 1].t;
		const hr = strokes[i].hr;
		if (hr == null || dt <= 0) continue;
		let z = 0;
		for (let b = 1; b < bounds.length; b++) {
			if (hr >= bounds[b - 1] && hr < bounds[b]) {
				z = b - 1;
				break;
			}
			if (b === bounds.length - 1) z = 4;
		}
		seconds[z] += dt;
	}

	const total = seconds.reduce((a, b) => a + b, 0) || 1;
	return labels.map((label, i) => ({
		zone: i + 1,
		label,
		color: colors[i],
		min: Math.round(bounds[i]),
		max: i < 4 ? Math.round(bounds[i + 1]) : Infinity,
		seconds: seconds[i],
		fraction: seconds[i] / total
	}));
}

export interface PowerPoint {
	duration: number;
	watts: number;
}

/**
 * Mean-maximal power curve: the best *average* power sustained over each target
 * window length. Built from a time-integral of instantaneous watts so it works
 * with unevenly spaced strokes.
 */
export function powerCurve(strokes: Stroke[], durations?: number[]): PowerPoint[] {
	if (strokes.length < 2) return [];
	const total = strokes[strokes.length - 1].t;
	const windows = (durations ?? [5, 10, 20, 30, 60, 120, 300, 600, 1200, 1800]).filter(
		(d) => d <= total
	);

	// Prefix energy E[i] = ∫ watts dt up to strokes[i].t (trapezoidal).
	const t = strokes.map((s) => s.t);
	const w = strokes.map((s) => s.watts);
	const E = new Array(strokes.length).fill(0);
	for (let i = 1; i < strokes.length; i++) {
		E[i] = E[i - 1] + ((w[i] + w[i - 1]) / 2) * (t[i] - t[i - 1]);
	}

	const energyAt = (time: number): number => {
		if (time <= t[0]) return 0;
		if (time >= t[t.length - 1]) return E[E.length - 1];
		let lo = 0;
		let hi = t.length - 1;
		while (hi - lo > 1) {
			const mid = (lo + hi) >> 1;
			if (t[mid] <= time) lo = mid;
			else hi = mid;
		}
		const f = (time - t[lo]) / (t[hi] - t[lo] || 1);
		return E[lo] + (E[hi] - E[lo]) * f;
	};

	return windows.map((dur) => {
		let best = 0;
		for (let i = 0; i < strokes.length; i++) {
			const ta = t[i];
			const tb = ta + dur;
			if (tb > total) break;
			const avg = (energyAt(tb) - energyAt(ta)) / dur;
			if (avg > best) best = avg;
		}
		return { duration: dur, watts: best };
	});
}
