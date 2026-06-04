import type { Split, Stroke, WorkoutDetail } from '$lib/types';
import type uPlot from 'uplot';

export interface RepSeries {
	repIndex: number;
	avgPace: number;
	times: Float32Array;
	pace: Float32Array;
	rate: Float32Array;
	power: Float32Array;
	hr: Float32Array;
}

export type RepMetric = 'pace' | 'rate' | 'power' | 'hr';

/** Distinct overlay colours (wrap for > 6 reps). Not tied to main telemetry tokens. */
export const REP_PALETTE = [
	'#4e79a7',
	'#f28e2b',
	'#e15759',
	'#76b7b2',
	'#59a14f',
	'#edc948'
] as const;

const MIN_REP_SECONDS = 30;
const MIN_REPS = 2;

function mean(values: number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((a, b) => a + b, 0) / values.length;
}

function seriesFromStrokes(bucket: Stroke[]): Omit<RepSeries, 'repIndex' | 'avgPace'> {
	if (bucket.length === 0) {
		const empty = new Float32Array(0);
		return { times: empty, pace: empty, rate: empty, power: empty, hr: empty };
	}
	const t0 = bucket[0].t;
	const n = bucket.length;
	const times = new Float32Array(n);
	const pace = new Float32Array(n);
	const rate = new Float32Array(n);
	const power = new Float32Array(n);
	const hr = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const s = bucket[i];
		times[i] = s.t - t0;
		pace[i] = s.pace;
		rate[i] = s.spm;
		power[i] = s.watts;
		hr[i] = s.hr ?? 0;
	}
	return { times, pace, rate, power, hr };
}

function seriesFromSplit(sp: Split): Omit<RepSeries, 'repIndex' | 'avgPace'> {
	const steps = Math.max(1, Math.round(sp.time));
	const times = new Float32Array(steps);
	const pace = new Float32Array(steps);
	const rate = new Float32Array(steps);
	const power = new Float32Array(steps);
	const hr = new Float32Array(steps);
	const spm = sp.spm ?? 0;
	const hrVal = sp.hr ?? sp.heartRate?.average ?? 0;
	const watts =
		sp.wattMinutes != null && sp.time > 0
			? (sp.wattMinutes * 60) / sp.time
			: sp.pace > 0
				? paceToWattsFromSplit(sp)
				: 0;
	for (let i = 0; i < steps; i++) {
		times[i] = i;
		pace[i] = sp.pace;
		rate[i] = spm;
		power[i] = watts;
		hr[i] = hrVal;
	}
	return { times, pace, rate, power, hr };
}

/**
 * Rough watts from split pace using the C2 rowing formula (2.8 / pace³).
 * Accurate for RowErg but will be inaccurate for BikeErg and SkiErg;
 * prefer `split.wattMinutes` when available.
 */
function paceToWattsFromSplit(sp: Split): number {
	if (sp.pace <= 0) return 0;
	const perMetre = sp.pace / 500;
	return 2.8 / Math.pow(perMetre, 3);
}

function assignStrokesToWorkReps(splits: Split[], strokes: Stroke[]): Stroke[][] {
	const workCount = workSplits(splits).length;
	const buckets: Stroke[][] = Array.from({ length: workCount }, () => []);
	if (!strokes.length || workCount === 0) return buckets;

	const edges: number[] = [];
	let cum = 0;
	for (const sp of splits) {
		cum += sp.time;
		edges.push(cum);
	}

	// Map each split index to a work-rep bucket (or -1 for rest/short).
	const splitToWork: number[] = [];
	let workIdx = 0;
	for (const sp of splits) {
		if (!sp.isRest && sp.time >= MIN_REP_SECONDS) {
			splitToWork.push(workIdx++);
		} else {
			splitToWork.push(-1);
		}
	}

	let e = 0;
	for (const s of strokes) {
		while (e < edges.length && s.t > edges[e]) e++;
		const idx = e < splitToWork.length ? splitToWork[e] : -1;
		if (idx >= 0) buckets[idx].push(s);
	}

	return buckets;
}

function workSplits(splits: Split[]): Split[] {
	return splits.filter((s) => !s.isRest && s.time >= MIN_REP_SECONDS);
}

/**
 * Returns one RepSeries per work interval, or null when the workout is not a
 * recognisable multi-rep piece (< 2 work intervals or each < 30 s).
 */
export function detectReps(workout: WorkoutDetail): RepSeries[] | null {
	const work = workSplits(workout.splits);
	if (work.length < MIN_REPS) return null;

	const buckets = assignStrokesToWorkReps(workout.splits, workout.strokes);
	let repIndex = 0;
	const series: RepSeries[] = [];

	for (const sp of workout.splits) {
		if (sp.isRest || sp.time < MIN_REP_SECONDS) continue;
		const bucket = buckets[repIndex] ?? [];
		const base =
			bucket.length > 0 ? seriesFromStrokes(bucket) : seriesFromSplit(sp);
		const avgPace = repAvgPaceFromArrays(base.pace, sp.pace);
		series.push({ repIndex, avgPace, ...base });
		repIndex++;
	}

	return series.length >= MIN_REPS ? series : null;
}

function repAvgPaceFromArrays(pace: Float32Array, splitPace: number): number {
	let sum = 0;
	let count = 0;
	for (let i = 0; i < pace.length; i++) {
		const p = pace[i];
		if (p > 0) { sum += p; count++; }
	}
	if (count > 0) return sum / count;
	return splitPace > 0 ? splitPace : 0;
}

/** Average pace (sec/500m) for a rep, used in the legend. */
export function repAvgPace(series: RepSeries): number {
	return series.avgPace;
}

export function repsHaveHr(reps: RepSeries[]): boolean {
	return reps.some((r) => r.hr.some((v) => v > 0));
}

function metricValues(series: RepSeries, metric: RepMetric): Float32Array {
	switch (metric) {
		case 'pace':
			return series.pace;
		case 'rate':
			return series.rate;
		case 'power':
			return series.power;
		case 'hr':
			return series.hr;
	}
}

function sampleAt(times: Float32Array, values: Float32Array, t: number): number | null {
	if (times.length === 0) return null;
	if (t < times[0] || t > times[times.length - 1]) return null;
	if (times.length === 1) return values[0];

	let lo = 0;
	let hi = times.length - 1;
	while (lo < hi - 1) {
		const mid = (lo + hi) >> 1;
		if (times[mid] <= t) lo = mid;
		else hi = mid;
	}
	const t0 = times[lo];
	const t1 = times[hi];
	if (t1 === t0) return values[lo];
	const frac = (t - t0) / (t1 - t0);
	return values[lo] + (values[hi] - values[lo]) * frac;
}

/** Align rep series onto a shared second grid for uPlot (null past rep end). */
export function alignRepsForChart(reps: RepSeries[], metric: RepMetric): uPlot.AlignedData {
	const maxT = Math.max(
		0,
		...reps.map((r) => (r.times.length ? r.times[r.times.length - 1] : 0))
	);
	const steps = Math.max(2, Math.ceil(maxT) + 1);
	const xs: number[] = [];
	for (let i = 0; i < steps; i++) xs.push(i);

	const ys = reps.map((rep) => {
		const values = metricValues(rep, metric);
		return xs.map((x) => sampleAt(rep.times, values, x));
	});

	return [xs, ...ys];
}

export function repColor(repIndex: number): string {
	return REP_PALETTE[repIndex % REP_PALETTE.length];
}
