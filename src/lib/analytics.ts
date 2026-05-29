import type { Split, Sport, Stroke, Workout } from './types';

// ---------------------------------------------------------------------------
// Pure analysis helpers. No DOM, no Svelte — safe to use on server or client,
// and easy to unit test.
// ---------------------------------------------------------------------------

export interface TrendFit {
	/** Slope in y-units per day. */
	slopePerDay: number;
	/** Predicted y at the first and last x (epoch ms) — the fit line endpoints. */
	y0: number;
	y1: number;
	/** Total change implied by the fit across the whole span. */
	delta: number;
	n: number;
}

/**
 * Ordinary least-squares fit of `points` (x = epoch ms, y = metric). Returns
 * null if there aren't enough points or there's no time span. Used to draw a
 * trend line and produce an "improving / flat / slowing" verdict.
 */
export function linearTrend(points: { x: number; y: number }[]): TrendFit | null {
	const n = points.length;
	if (n < 2) return null;
	const xMin = Math.min(...points.map((p) => p.x));
	// Work in days from the first point to keep the slope human-readable.
	const xs = points.map((p) => (p.x - xMin) / 86_400_000);
	const ys = points.map((p) => p.y);
	const mx = xs.reduce((a, b) => a + b, 0) / n;
	const my = ys.reduce((a, b) => a + b, 0) / n;
	let num = 0;
	let den = 0;
	for (let i = 0; i < n; i++) {
		num += (xs[i] - mx) * (ys[i] - my);
		den += (xs[i] - mx) ** 2;
	}
	if (den === 0) return null; // all on the same day
	const slope = num / den;
	const intercept = my - slope * mx;
	const xLast = Math.max(...xs);
	const y0 = intercept;
	const y1 = intercept + slope * xLast;
	return { slopePerDay: slope, y0, y1, delta: y1 - y0, n };
}

export interface DistanceBand {
	/** Stable key, e.g. "2000". */
	key: string;
	label: string;
	/** Nominal distance in metres (for sorting). */
	nominal: number;
}

/**
 * Bucket a workout distance into a like-for-like band so we compare 2k-to-2k
 * rather than a sprint against a 5k. Standard erg distances get a tight ±6%
 * window; anything else falls into a coarse range band.
 */
export function distanceBand(metres: number): DistanceBand {
	const standards = [
		{ d: 100, l: '100m' },
		{ d: 500, l: '500m' },
		{ d: 1000, l: '1k' },
		{ d: 2000, l: '2k' },
		{ d: 5000, l: '5k' },
		{ d: 6000, l: '6k' },
		{ d: 10000, l: '10k' },
		{ d: 21097, l: 'Half' },
		{ d: 42195, l: 'Full' }
	];
	for (const s of standards) {
		if (Math.abs(metres - s.d) <= s.d * 0.06) {
			return { key: String(s.d), label: s.l, nominal: s.d };
		}
	}
	// Coarse fallback ranges for non-standard pieces.
	const ranges: [number, number, string][] = [
		[0, 750, '<750m'],
		[750, 1500, '750m–1.5k'],
		[1500, 3000, '1.5k–3k'],
		[3000, 7000, '3k–7k'],
		[7000, 15000, '7k–15k'],
		[15000, Infinity, '15k+']
	];
	for (const [lo, hi, l] of ranges) {
		if (metres >= lo && metres < hi) return { key: `r${lo}`, label: l, nominal: (lo + Math.min(hi, lo * 2)) / 2 };
	}
	return { key: 'other', label: 'Other', nominal: metres };
}

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

// ---------------------------------------------------------------------------
// Stroke-quality / technique analysis
//
// The logbook exposes pace, stroke-rate, distance and heart-rate per stroke —
// not the PM5 force curve (that lives on the monitor over BLE). But for a
// heavyweight chasing pace, *distance-per-stroke* is the real lever: holding a
// pace at a lower rate means a more powerful, more efficient stroke. These
// helpers turn the logged signal into coachable technique metrics.
// ---------------------------------------------------------------------------

/** Distance per stroke (metres) implied by a pace (sec/500m) and rate (spm). */
export function distancePerStroke(pace: number, spm: number): number {
	if (pace <= 0 || spm <= 0) return 0;
	const speed = 500 / pace; // m/s
	const strokesPerSec = spm / 60;
	return speed / strokesPerSec;
}

export interface TechniqueSummary {
	/** Distance-per-stroke timeline, aligned to stroke time `t`. */
	dps: { t: number; v: number }[];
	avgDps: number;
	/** Coefficient of variation of pace (%). Lower = smoother, more even. */
	paceConsistency: number;
	/**
	 * Fade: how much pace drifts from the first third to the last third of the
	 * piece, as a % (positive = slowed down, negative = negative split).
	 */
	fade: number;
	avgSpm: number;
}

export function techniqueSummary(strokes: Stroke[]): TechniqueSummary {
	const valid = strokes.filter((s) => s.pace > 0 && s.spm > 0);
	const dps = valid.map((s) => ({ t: s.t, v: distancePerStroke(s.pace, s.spm) }));
	const avgDps = mean(dps.map((d) => d.v));
	const avgSpm = mean(valid.map((s) => s.spm));

	const paces = valid.map((s) => s.pace);
	const mp = mean(paces);
	const sd = Math.sqrt(mean(paces.map((p) => (p - mp) ** 2)));
	const paceConsistency = mp > 0 ? (sd / mp) * 100 : 0;

	// Fade by distance thirds (robust to uneven sampling in time).
	let fade = 0;
	if (valid.length >= 6) {
		const third = Math.floor(valid.length / 3);
		const firstPace = mean(valid.slice(0, third).map((s) => s.pace));
		const lastPace = mean(valid.slice(-third).map((s) => s.pace));
		fade = firstPace > 0 ? ((lastPace - firstPace) / firstPace) * 100 : 0;
	}

	return { dps, avgDps, paceConsistency, fade, avgSpm };
}

export interface EfficiencyPoint {
	spm: number;
	pace: number;
	dps: number;
}

/**
 * Pace-vs-rate efficiency cloud, bucketed by stroke rate. Reveals your most
 * efficient rating band: where you hold the best pace for the rate (highest
 * distance-per-stroke). Each point is the median pace observed at that rate.
 */
export function efficiencyByRate(strokes: Stroke[]): EfficiencyPoint[] {
	const buckets = new Map<number, number[]>();
	for (const s of strokes) {
		if (s.pace <= 0 || s.spm <= 0) continue;
		const r = Math.round(s.spm);
		const arr = buckets.get(r) ?? [];
		arr.push(s.pace);
		buckets.set(r, arr);
	}
	return [...buckets.entries()]
		.filter(([, paces]) => paces.length >= 2) // ignore one-off outliers
		.map(([spm, paces]) => {
			const pace = median(paces);
			return { spm, pace, dps: distancePerStroke(pace, spm) };
		})
		.sort((a, b) => a.spm - b.spm);
}

function mean(xs: number[]): number {
	return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function median(xs: number[]): number {
	if (!xs.length) return 0;
	const s = [...xs].sort((a, b) => a - b);
	const m = s.length >> 1;
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
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

// ---------------------------------------------------------------------------
// Interval / rep breakdown
//
// A split is one work segment (a rep). We enrich each split with the stroke
// samples that fall inside it — pace, rate, HR, DPS, plus how the rep was
// paced internally (start vs end) — then compare reps to each other so you can
// see if you held the pieces together or faded across the set.
// ---------------------------------------------------------------------------

export interface IntervalRep {
	index: number;
	distance: number;
	time: number;
	pace: number;
	spm: number;
	hr?: number;
	dps: number;
	/** Within-rep fade: last-third pace vs first-third pace, % (>0 = slowed). */
	internalFade: number;
	/** Pace delta vs the set's average rep pace, sec/500m (<0 = faster). */
	vsAverage: number;
	/** True for the fastest rep in the set. */
	isFastest: boolean;
	/** True for the slowest rep in the set. */
	isSlowest: boolean;
}

export interface IntervalSet {
	reps: IntervalRep[];
	avgPace: number;
	/** Pace spread across reps as a coefficient of variation, % (lower = evener). */
	consistency: number;
	/** Set-level fade: last rep pace vs first rep pace, % (>0 = slowed down). */
	fade: number;
	fastest: number;
	slowest: number;
}

/**
 * Build a rep-by-rep breakdown from a workout's splits, using strokes (when
 * present) to compute distance-per-stroke and within-rep fade. Returns null for
 * single-segment pieces — there's nothing to compare.
 */
export function intervalBreakdown(splits: Split[], strokes: Stroke[]): IntervalSet | null {
	if (splits.length < 2) return null;

	// Assign strokes to reps by cumulative split time. Strokes reset to t=0 each
	// interval (handled on read), so we walk them and start a new rep bucket
	// whenever the stroke time steps backwards or we exceed the split duration.
	const buckets: Stroke[][] = splits.map(() => []);
	if (strokes.length) {
		let rep = 0;
		let prevT = -Infinity;
		for (const s of strokes) {
			if (s.t < prevT && rep < splits.length - 1) rep++;
			prevT = s.t;
			(buckets[rep] ?? buckets[buckets.length - 1]).push(s);
		}
	}

	const paces = splits.map((sp) => sp.pace).filter((p) => p > 0);
	const avgPace = paces.length ? paces.reduce((a, b) => a + b, 0) / paces.length : 0;
	const fastest = paces.length ? Math.min(...paces) : 0;
	const slowest = paces.length ? Math.max(...paces) : 0;

	const reps: IntervalRep[] = splits.map((sp, i) => {
		const bucket = buckets[i] ?? [];
		const spm = sp.spm ?? (bucket.length ? mean(bucket.map((s) => s.spm)) : 0);
		const dps = sp.pace > 0 && spm > 0 ? distancePerStroke(sp.pace, spm) : 0;

		let internalFade = 0;
		if (bucket.length >= 6) {
			const third = Math.floor(bucket.length / 3);
			const first = mean(bucket.slice(0, third).map((s) => s.pace));
			const last = mean(bucket.slice(-third).map((s) => s.pace));
			internalFade = first > 0 ? ((last - first) / first) * 100 : 0;
		}

		return {
			index: i,
			distance: sp.distance,
			time: sp.time,
			pace: sp.pace,
			spm: Math.round(spm),
			hr: sp.hr ?? (bucket.some((s) => s.hr != null) ? Math.round(mean(bucket.map((s) => s.hr ?? 0))) : undefined),
			dps,
			internalFade,
			vsAverage: sp.pace > 0 ? sp.pace - avgPace : 0,
			isFastest: sp.pace === fastest && fastest > 0,
			isSlowest: sp.pace === slowest && slowest > 0 && fastest !== slowest
		};
	});

	const sd = paces.length
		? Math.sqrt(paces.reduce((s, p) => s + (p - avgPace) ** 2, 0) / paces.length)
		: 0;
	const consistency = avgPace > 0 ? (sd / avgPace) * 100 : 0;

	const firstPace = reps[0].pace;
	const lastPace = reps[reps.length - 1].pace;
	const fade = firstPace > 0 ? ((lastPace - firstPace) / firstPace) * 100 : 0;

	return { reps, avgPace, consistency, fade, fastest, slowest };
}
