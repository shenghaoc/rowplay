import type { Split, Sport, Stroke, Workout, WorkoutDetail } from './types';
import {
	challengeDistanceMetres,
	paceToWattsForSport,
	wattsToPaceForSport
} from './format';
import { dayKeyEpochMillis, todayKeyUtc } from './datetime';

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
	const bySport = new Map<string, Workout[]>();
	for (const w of workouts) {
		const arr = bySport.get(w.sport) ?? [];
		arr.push(w);
		bySport.set(w.sport, arr);
	}
	for (const sportWorkouts of bySport.values()) {
		for (const target of STANDARD_DISTANCES) {
			const matches = sportWorkouts.filter((w) => Math.abs(w.distance - target) <= target * 0.02 && w.time > 0);
			if (!matches.length) continue;
			const best = matches.reduce((a, b) => (a.time <= b.time ? a : b));
			out.push({ distance: target, time: best.time, pace: best.pace, date: best.date, sport: best.sport });
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// Per-workout (stroke-level) analysis
// ---------------------------------------------------------------------------

export interface HrZone {
	/** 1-5. The display name (i18n `replay.zone{n}`) and colour (CSS `--zone-{n}`)
	 *  are both resolved at the presentation layer, keyed off this number. */
	zone: number;
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
	// reduce, not Math.max(...spread): long pieces have many thousands of strokes.
	const peak = strokes.reduce((m, s) => Math.max(m, s.hr ?? 0), 0);
	const hrMax = maxHr && maxHr > 0 ? maxHr : Math.max(peak / 0.95, 160);

	const bounds = [0, 0.6, 0.7, 0.8, 0.9, 1.2].map((f) => f * hrMax);
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
	return seconds.map((sec, i) => ({
		zone: i + 1,
		min: Math.round(bounds[i]),
		max: i < 4 ? Math.round(bounds[i + 1]) : Infinity,
		seconds: sec,
		fraction: sec / total
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

// ---------------------------------------------------------------------------
// Fitness & Freshness — the Performance Management Chart (PMC)
//
// This is the headline metric every endurance athlete wants and that Strava
// and TrainingPeaks lock behind a subscription: "how fit am I, how tired am I,
// and am I ready to perform?". It needs nothing live — just the session
// summaries we already sync. We turn each session into a Training Stress Score
// (TSS) from its average power, then track three exponentially-weighted loads:
//
//   • Fitness (CTL) — a 42-day average: your built-up training base.
//   • Fatigue (ATL) — a 7-day average: recent, fast-decaying tiredness.
//   • Form    (TSB) — Fitness − Fatigue: positive = fresh, negative = loaded.
//
// Power is the logbook's watt-minutes when present (correct per machine), else
// Concept2's pace→watts model. Threshold power (FTP) is the athlete's own —
// estimated from their power-duration envelope with a Critical Power fit, so
// the load is scaled to *their* ability, not a generic number.
// ---------------------------------------------------------------------------

/**
 * Average power (watts) sustained over a whole session. The logbook's
 * watt-minutes are authoritative when present (and correct for every machine).
 * Otherwise derive from normalised sec/500m pace. BikeErg API pace is per 1000m
 * (halved on read for display); the PM cubic uses the 1000m basis, so divide by 8.
 */
export function workoutWatts(w: Workout): number {
	const minutes = w.time / 60;
	if (w.wattMinutes && w.wattMinutes > 0 && minutes > 0) return w.wattMinutes / minutes;
	return paceToWattsForSport(w.sport, w.pace);
}

export interface CriticalPower {
	/** Critical (sustainable) power in watts — the asymptote of the P–t curve. */
	cp: number;
	/** Anaerobic work capacity W′ in joules (0 when only estimated). */
	wPrime: number;
	/** Functional threshold power in watts (≈ CP); used to scale training load. */
	ftp: number;
	/** 'model' = two-parameter CP fit; 'estimate' = best sustained-power fallback. */
	method: 'model' | 'estimate';
}

/**
 * Estimate the athlete's threshold power from their own results. Each session
 * is one point on a power–duration curve (best *average* power for that
 * length). The classic two-parameter model says P(t) = CP + W′/t, so a
 * regression of power against 1/time gives CP (intercept) and W′ (slope). Falls
 * back to the best long-effort power when there isn't enough range to fit.
 */
export function estimateCriticalPower(workouts: Workout[]): CriticalPower | null {
	const fallback = (pool: { t: number; p: number }[]): CriticalPower | null => {
		// Sprints (< 2 min) sit far above threshold, so never let one set FTP.
		const valid = pool.filter((q) => q.t >= 120);
		if (!valid.length) return null;
		const best = valid.reduce((a, b) => (a.p >= b.p ? a : b));
		// Duration-based scaling factor to estimate FTP/CP from a single best effort:
		// - 20+ min: 95%
		// - 10-20 min: 90%
		// - 5-10 min: 80%
		// - 2-5 min: 70%
		let factor = 0.70;
		if (best.t >= 1200) {
			factor = 0.95;
		} else if (best.t >= 600) {
			factor = 0.90;
		} else if (best.t >= 300) {
			factor = 0.80;
		}
		const ftp = Math.round(best.p * factor);
		return ftp > 0 ? { cp: ftp, wPrime: 0, ftp, method: 'estimate' } : null;
	};

	const all = workouts
		.map((w) => ({ t: w.time, p: workoutWatts(w) }))
		.filter((q) => q.t > 0 && q.p > 0);
	if (!all.length) return null;

	// The CP model is only valid for a few-minutes-to-an-hour range.
	const pts = all.filter((q) => q.t >= 120 && q.t <= 3600);
	if (pts.length < 3) return fallback(all);

	// Mean-maximal envelope: keep only the best power in each (geometric) duration
	// bin so one easy session doesn't drag the fit down.
	const bins = new Map<number, { t: number; p: number }>();
	for (const q of pts) {
		const key = Math.round(Math.log(q.t) * 4);
		const cur = bins.get(key);
		if (!cur || q.p > cur.p) bins.set(key, q);
	}
	const env = [...bins.values()];
	if (env.length < 3) return fallback(pts);

	const xs = env.map((q) => 1 / q.t);
	const ys = env.map((q) => q.p);
	const n = xs.length;
	const mx = xs.reduce((a, b) => a + b, 0) / n;
	const my = ys.reduce((a, b) => a + b, 0) / n;
	let num = 0;
	let den = 0;
	for (let i = 0; i < n; i++) {
		num += (xs[i] - mx) * (ys[i] - my);
		den += (xs[i] - mx) ** 2;
	}
	if (den > 0) {
		const wPrime = num / den; // slope, joules
		const cp = my - wPrime * mx; // intercept, watts
		if (cp > 0 && cp < 700 && wPrime > 0) {
			return { cp: Math.round(cp), wPrime: Math.round(wPrime), ftp: Math.round(cp), method: 'model' };
		}
	}
	return fallback(pts);
}

/** Sustainable average power (watts) for a fixed duration using CP/W′. */
export function powerAtDuration(cp: CriticalPower, durationSec: number): number {
	if (durationSec <= 0 || cp.cp <= 0) return 0;
	return cp.cp + (cp.wPrime > 0 ? cp.wPrime / durationSec : 0);
}

/**
 * Predict the even-split pace (sec/500m normalised) sustainable for `durationSec`
 * from a CP/W′ model. Pass `sport` when the CP envelope is single-sport (e.g. bike
 * needs the 1000m-basis inverse); mixed-sport CP should omit it.
 */
export function predictPaceForDuration(
	cp: CriticalPower,
	durationSec: number,
	sport?: Sport
): number | null {
	const watts = powerAtDuration(cp, durationSec);
	if (watts <= 0) return null;
	const pace = wattsToPaceForSport(sport, watts);
	return pace > 0 && isFinite(pace) ? pace : null;
}

/**
 * Predict finish time (seconds) for `distanceM` at the best effort the CP model
 * allows — constant-power rowing at the sustainable watts for that duration.
 */
export function predictTimeForDistance(
	cp: CriticalPower,
	distanceM: number,
	sport?: Sport
): number | null {
	if (isNaN(distanceM) || distanceM <= 0 || cp.cp <= 0) return null;

	const distanceAt = (durationSec: number): number => {
		const pace = wattsToPaceForSport(sport, powerAtDuration(cp, durationSec));
		if (pace <= 0) return 0;
		return (durationSec * 500) / pace;
	};

	let lo = 1;
	let hi = 4 * 3600;
	if (distanceAt(hi) < distanceM) return null;

	while (hi - lo > 0.05) {
		const mid = (lo + hi) / 2;
		if (distanceAt(mid) < distanceM) lo = mid;
		else hi = mid;
	}
	return lo;
}

/** Best session-average power at each target duration (mean-maximal envelope). */
export function powerDurationEnvelope(workouts: Workout[]): PowerPoint[] {
	const pts = workouts
		.map((w) => ({ t: w.time, p: workoutWatts(w) }))
		.filter((q) => q.t >= 120 && q.t <= 3600 && q.p > 0);
	const bins = new Map<number, { t: number; p: number }>();
	for (const q of pts) {
		const key = Math.round(Math.log(q.t) * 4);
		const cur = bins.get(key);
		if (!cur || q.p > cur.p) bins.set(key, q);
	}
	return [...bins.values()]
		.sort((a, b) => a.t - b.t)
		.map((q) => ({ duration: q.t, watts: q.p }));
}

export interface PowerDurationComparison {
	/** Shared x-axis durations (seconds), sorted ascending. */
	durations: number[];
	/** Best observed average power at each duration (null when no session nearby). */
	actual: (number | null)[];
	/** CP + W′/t model at each duration. */
	modelled: number[];
}

const PD_DURATIONS = [120, 180, 300, 600, 900, 1200, 1800, 3600] as const;

/**
 * Compare the athlete's session-based power–duration bests to the fitted CP curve.
 */
export function powerDurationComparison(
	workouts: Workout[],
	cp: CriticalPower
): PowerDurationComparison {
	const env = powerDurationEnvelope(workouts);
	const durations = [...PD_DURATIONS];
	const actual = durations.map((d) => {
		let best: number | null = null;
		for (const e of env) {
			// Session summaries only claim their average for durations near the piece length.
			if (Math.abs(e.duration - d) / d > 0.12) continue;
			if (best == null || e.watts > best) best = e.watts;
		}
		return best;
	});
	const modelled = durations.map((d) => Math.round(powerAtDuration(cp, d)));
	return { durations, actual, modelled };
}

const DAY_MS = 86_400_000;

/** One day on the Performance Management Chart. */
export interface FormPoint {
	/** Epoch ms at UTC midnight for this day. */
	day: number;
	tss: number;
	/** Fitness — Chronic Training Load (42-day). */
	ctl: number;
	/** Fatigue — Acute Training Load (7-day). */
	atl: number;
	/** Form — Training Stress Balance (CTL − ATL). */
	tsb: number;
}

export type FormBand = 'transition' | 'fresh' | 'neutral' | 'productive' | 'overreaching';

export interface TrainingLoad {
	series: FormPoint[];
	cp: CriticalPower;
	ftp: number;
	/** Latest Fitness / Fatigue / Form. */
	ctl: number;
	atl: number;
	tsb: number;
	/** Fitness change over the trailing 7 days (ramp rate). */
	ramp: number;
	/** Where today's Form sits, for a plain-language read-out. */
	band: FormBand;
}

/** Coggan-style TSS for one session, scaled to the athlete's threshold power. */
function workoutTss(w: Workout, ftp: number): number {
	if (ftp <= 0 || w.time <= 0) return 0;
	const watts = workoutWatts(w);
	if (watts <= 0) return 0;
	// Intensity factor, capped so a noisy all-out sprint can't blow up the load.
	const intensity = Math.min(watts / ftp, 1.6);
	return (w.time / 3600) * intensity * intensity * 100;
}

/**
 * Build the Performance Management Chart from session summaries. Sums each
 * day's TSS (rest days count as zero so fatigue decays), then rolls the two
 * exponentially-weighted loads forward to today. Returns null when there isn't
 * enough power data to anchor a threshold.
 */
export function trainingLoad(workouts: Workout[], cpIn?: CriticalPower | null): TrainingLoad | null {
	const cp = cpIn ?? estimateCriticalPower(workouts);
	if (!cp || cp.ftp <= 0) return null;
	const ftp = cp.ftp;

	// Carry the curve through to today so a recent rest block shows as freshness.
	const today = dayKeyEpochMillis(todayKeyUtc());

	// Sum TSS per calendar day. The date-only key sidesteps timezone drift. We
	// also clamp to a sane window — a corrupted date (year 0001, or a far-future
	// timestamp) would otherwise make the day-by-day loop below run for millions
	// of iterations and hang the page.
	const EPOCH_2000 = 946_684_800_000;
	const byDay = new Map<number, number>();
	let firstDay = Infinity;
	let lastDay = -Infinity;
	for (const w of workouts) {
		const day = dayKeyEpochMillis(w.date.slice(0, 10));
		if (!isFinite(day) || day < EPOCH_2000 || day > today + DAY_MS) continue;
		byDay.set(day, (byDay.get(day) ?? 0) + workoutTss(w, ftp));
		if (day < firstDay) firstDay = day;
		if (day > lastDay) lastDay = day;
	}
	if (!isFinite(firstDay)) return null;

	const end = Math.max(lastDay, today);

	const series: FormPoint[] = [];
	let ctl = 0;
	let atl = 0;
	for (let day = firstDay; day <= end; day += DAY_MS) {
		const tss = byDay.get(day) ?? 0;
		ctl += (tss - ctl) / 42;
		atl += (tss - atl) / 7;
		series.push({ day, tss, ctl, atl, tsb: ctl - atl });
	}

	const last = series[series.length - 1];
	const weekAgo = series[series.length - 8];
	const ramp = weekAgo ? last.ctl - weekAgo.ctl : last.ctl;

	const tsb = last.tsb;
	const band: FormBand =
		tsb > 25 ? 'transition' : tsb > 5 ? 'fresh' : tsb >= -10 ? 'neutral' : tsb >= -30 ? 'productive' : 'overreaching';

	return { series, cp, ftp, ctl: last.ctl, atl: last.atl, tsb, ramp, band };
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

	return windows.map((dur) => {
		let best = 0;
		let j = 0;
		for (let i = 0; i < strokes.length; i++) {
			const ta = t[i];
			const tb = ta + dur;
			if (tb > total) break;

			// Sliding window: advance j until t[j+1] is past tb
			while (j < t.length - 1 && t[j + 1] <= tb) {
				j++;
			}

			const eTb =
				j === t.length - 1
					? E[j]
					: E[j] + ((E[j + 1] - E[j]) * (tb - t[j])) / (t[j + 1] - t[j] || 1);

			const avg = (eTb - E[i]) / dur;
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
 *
 * Stroke timestamps are assumed to be **continuous** (as normalised on read by
 * `mapStrokes` / `normalizeRawStrokes`). Rep boundaries are determined by
 * cumulative split durations rather than timestamp resets.
 */
export function intervalBreakdown(splits: Split[], strokes: Stroke[]): IntervalSet | null {
	if (splits.length < 2) return null;

	// Build cumulative time boundaries from split durations.
	const edges: number[] = [];
	let cum = 0;
	for (const sp of splits) {
		cum += sp.time;
		edges.push(cum);
	}

	// Assign each stroke to the first rep whose cumulative time boundary it
	// falls within. We use a two-pointer approach since both strokes and edges
	// are monotonically increasing in time, reducing O(N*M) to O(N).
	const buckets: Stroke[][] = splits.map(() => []);
	if (strokes.length) {
		let edgeIdx = 0;
		for (const s of strokes) {
			while (edgeIdx < edges.length && s.t > edges[edgeIdx]) {
				edgeIdx++;
			}
			const idx = edgeIdx < edges.length ? edgeIdx : buckets.length - 1;
			buckets[idx].push(s);
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

// ---------------------------------------------------------------------------
// Training calendar / consistency heatmap
// ---------------------------------------------------------------------------

export type VolumeMetric = 'distance' | 'time';

export interface DayVolume {
	day: string;
	distance: number;
	time: number;
	sessions: number;
}

/** Logbook timestamps are `YYYY-MM-DD HH:MM:SS` — slice avoids TZ shifts. */
export function workoutDayKey(date: string): string {
	return date.slice(0, 10);
}

export function aggregateDailyVolume(workouts: Workout[]): Map<string, DayVolume> {
	const map = new Map<string, DayVolume>();
	for (const w of workouts) {
		const day = workoutDayKey(w.date);
		const e = map.get(day) ?? { day, distance: 0, time: 0, sessions: 0 };
		e.distance += w.distance;
		e.time += w.time;
		e.sessions += 1;
		map.set(day, e);
	}
	return map;
}

export function dayVolumeValue(v: DayVolume, metric: VolumeMetric): number {
	return metric === 'distance' ? v.distance : v.time;
}

export interface CalendarCell {
	day: string;
	distance: number;
	time: number;
	sessions: number;
	level: number;
	week: number;
	dow: number;
}

export interface TrainingCalendar {
	cells: CalendarCell[];
	weeks: number;
	metric: VolumeMetric;
	maxVolume: number;
	maxLevel: number;
	startDay: string;
	endDay: string;
	activeDays: number;
	currentStreak: number;
	longestStreak: number;
	monthLabels: { week: number; month: number }[];
}

/** Add calendar days to a `YYYY-MM-DD` key. PlainDate is timezone-free, so DST
 *  can never shift streak/grid math. */
export function addDaysToKey(key: string, days: number): string {
	return Temporal.PlainDate.from(key).add({ days }).toString();
}

/** Day of week, 0 = Sunday … 6 = Saturday (matches the old `getUTCDay`). */
function dayOfWeekUtc(key: string): number {
	// Temporal uses ISO weekdays (1 = Monday … 7 = Sunday); % 7 maps Sunday → 0.
	return Temporal.PlainDate.from(key).dayOfWeek % 7;
}

function isConsecutiveDay(prev: string, next: string): boolean {
	return addDaysToKey(prev, 1) === next;
}

function monthNumberOfUtc(dayKey: string): number {
	return parseInt(dayKey.slice(5, 7), 10);
}

export function volumeIntensityLevel(
	value: number,
	sortedVolumes: number[], // Pre-sorted in ascending order to avoid O(N log N) inside loops
	maxLevel = 4
): number {
	if (value <= 0 || maxLevel < 1) return 0;
	if (!sortedVolumes.length) return 1;
	const max = sortedVolumes[sortedVolumes.length - 1];
	const min = sortedVolumes[0];
	// When there's a real gradient, any value at or above the max always gets maxLevel.
	if (max !== min && value >= max) return maxLevel;
	const breaks: number[] = [];
	for (let i = 1; i < maxLevel; i++) {
		const idx = Math.min(sortedVolumes.length - 1, Math.ceil((sortedVolumes.length * i) / maxLevel) - 1);
		breaks.push(sortedVolumes[Math.max(0, idx)]);
	}
	// When all volumes are identical, all breaks collapse to the same value.
	// Every cell would get level 1, which hides real training variation.
	// Deduplicate and fall back to maxLevel if there's no meaningful gradient.
	const unique = [...new Set(breaks)];
	if (unique.length === 0 || unique[0] === unique[unique.length - 1]) return value > 0 ? maxLevel : 0;
	if (unique.length === 1) return value <= unique[0] ? 1 : maxLevel;
	let level = maxLevel;
	for (let i = 0; i < unique.length; i++) {
		if (value <= unique[i]) {
			level = i + 1;
			break;
		}
	}
	return level;
}

export function trainingStreaks(activeDayKeys: string[], endDay: string): { current: number; longest: number } {
	if (!activeDayKeys.length) return { current: 0, longest: 0 };
	const set = new Set(activeDayKeys);
	const sorted = [...activeDayKeys].sort();
	let longest = 0;
	let run = 0;
	let prev: string | null = null;
	for (const key of sorted) {
		if (prev && isConsecutiveDay(prev, key)) run++;
		else run = 1;
		longest = Math.max(longest, run);
		prev = key;
	}
	let current = 0;
	let cursor = endDay;
	// Grace period: streak still counts if they trained yesterday but not yet today.
	if (!set.has(cursor)) cursor = addDaysToKey(cursor, -1);
	while (set.has(cursor)) {
		current++;
		cursor = addDaysToKey(cursor, -1);
	}
	return { current, longest };
}

export function buildTrainingCalendar(
	workouts: Workout[],
	options?: {
		/** Inclusive end of the grid, `YYYY-MM-DD` (pass from server for SSR stability). */
		endDay?: string;
		weeks?: number;
		metric?: VolumeMetric;
		maxLevel?: number;
	}
): TrainingCalendar {
	const weeks = options?.weeks ?? 53;
	const metric = options?.metric ?? 'distance';
	const maxLevel = options?.maxLevel ?? 4;

	const byDay = aggregateDailyVolume(workouts);
	const historyDays = [...byDay.keys()].sort();
	const endDay =
		options?.endDay ?? (historyDays.length ? historyDays[historyDays.length - 1] : todayKeyUtc());

	const endSunday = addDaysToKey(endDay, -dayOfWeekUtc(endDay));
	const startDay = addDaysToKey(endSunday, -(weeks - 1) * 7);

	const cells: CalendarCell[] = [];
	const volumesInRange: number[] = [];
	let activeDaysInRange = 0;

	for (let col = 0; col < weeks; col++) {
		for (let row = 0; row < 7; row++) {
			const day = addDaysToKey(startDay, col * 7 + row);
			if (day > endDay) {
				cells.push({ day: '', distance: 0, time: 0, sessions: 0, level: 0, week: col, dow: row });
				continue;
			}
			const vol = byDay.get(day);
			const distance = vol?.distance ?? 0;
			const time = vol?.time ?? 0;
			const sessions = vol?.sessions ?? 0;
			const value = metric === 'distance' ? distance : time;
			if (sessions > 0) {
				volumesInRange.push(value);
				activeDaysInRange++;
			}
			cells.push({ day, distance, time, sessions, level: 0, week: col, dow: row });
		}
	}

	const sortedVolumes = [...volumesInRange].sort((a, b) => a - b);
	const maxVolume = sortedVolumes.length ? sortedVolumes[sortedVolumes.length - 1] : 0;
	for (const cell of cells) {
		if (!cell.day) continue;
		const value = metric === 'distance' ? cell.distance : cell.time;
		cell.level = volumeIntensityLevel(value, sortedVolumes, maxLevel);
	}

	const { current: currentStreak, longest: longestStreak } = trainingStreaks(historyDays, endDay);

	const monthLabels: { week: number; month: number }[] = [];
	let lastMonth = -1;
	for (let col = 0; col < weeks; col++) {
		const weekStart = addDaysToKey(startDay, col * 7);
		const m = parseInt(weekStart.slice(5, 7), 10);
		if (m !== lastMonth) {
			if (monthLabels.length === 0 || col - monthLabels[monthLabels.length - 1].week >= 3) {
				monthLabels.push({ week: col, month: monthNumberOfUtc(weekStart) });
				lastMonth = m;
			}
		}
	}

	return {
		cells,
		weeks,
		metric,
		maxVolume,
		maxLevel,
		startDay,
		endDay,
		activeDays: activeDaysInRange,
		currentStreak,
		longestStreak,
		monthLabels
	};
}

// ---------------------------------------------------------------------------
// Head-to-head workout comparison (static analytics, distance-aligned)
// ---------------------------------------------------------------------------

export interface DistanceOverlay {
	/** Shared distance axis in metres (0 … min(endA, endB)). */
	xs: number[];
	paceA: (number | null)[];
	paceB: (number | null)[];
	powerA: (number | null)[];
	powerB: (number | null)[];
	hrA: (number | null)[];
	hrB: (number | null)[];
	/** Max distance used for alignment. */
	alignedMetres: number;
}

/** Linearly interpolate a stroke sample at a cumulative distance. */
export function sampleStrokeAtDistance(strokes: Stroke[], metres: number): Stroke | null {
	if (!strokes.length) return null;
	const first = strokes[0];
	if (metres <= first.d) return first;
	const last = strokes[strokes.length - 1];
	if (metres >= last.d) return last;

	let low = 0;
	let high = strokes.length - 1;
	while (low <= high) {
		const mid = (low + high) >> 1;
		if (strokes[mid].d < metres) {
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}

	const prev = strokes[low - 1];
	const cur = strokes[low];
	const span = cur.d - prev.d;
	if (span <= 0) return cur;
	const f = (metres - prev.d) / span;
	const hrA = prev.hr;
	const hrB = cur.hr;
	let hr: number | undefined;
	if (hrA != null && hrB != null) hr = hrA + f * (hrB - hrA);
	else if (hrA != null) hr = hrA;
	else if (hrB != null) hr = hrB;
	return {
		t: prev.t + f * (cur.t - prev.t),
		d: metres,
		pace: prev.pace + f * (cur.pace - prev.pace),
		spm: prev.spm + f * (cur.spm - prev.spm),
		hr,
		watts: prev.watts + f * (cur.watts - prev.watts)
	};
}

/**
 * Resample two stroke streams onto a shared distance grid so pace / power / HR
 * can be overlaid on one chart (different durations align by metres covered).
 */
export function buildDistanceOverlay(
	strokesA: Stroke[],
	strokesB: Stroke[],
	steps = 120
): DistanceOverlay | null {
	const endA = strokesA.at(-1)?.d ?? 0;
	const endB = strokesB.at(-1)?.d ?? 0;
	const aligned = Math.min(endA, endB);
	if (aligned <= 0 || !strokesA.length || !strokesB.length) return null;

	const xs: number[] = [];
	const paceA: (number | null)[] = [];
	const paceB: (number | null)[] = [];
	const powerA: (number | null)[] = [];
	const powerB: (number | null)[] = [];
	const hrA: (number | null)[] = [];
	const hrB: (number | null)[] = [];

	for (let i = 0; i <= steps; i++) {
		const d = (aligned * i) / steps;
		xs.push(d);
		const sa = sampleStrokeAtDistance(strokesA, d);
		const sb = sampleStrokeAtDistance(strokesB, d);
		paceA.push(sa && sa.pace > 0 ? sa.pace : null);
		paceB.push(sb && sb.pace > 0 ? sb.pace : null);
		powerA.push(sa && sa.watts > 0 ? sa.watts : null);
		powerB.push(sb && sb.watts > 0 ? sb.watts : null);
		hrA.push(sa?.hr ?? null);
		hrB.push(sb?.hr ?? null);
	}

	return { xs, paceA, paceB, powerA, powerB, hrA, hrB, alignedMetres: aligned };
}

export interface WorkoutSideStats {
	time: number;
	pace: number;
	avgWatts: number;
	/** Best 5-second average power (from powerCurve). */
	best5sPower: number;
	avgHr: number | null;
	peakHr: number | null;
	avgDps: number;
	/** Pace coefficient of variation (%); lower = more even splits. */
	paceConsistency: number;
}

export function workoutSideStats(detail: WorkoutDetail): WorkoutSideStats {
	const tech = techniqueSummary(detail.strokes);
	const pc = powerCurve(detail.strokes);
	const best5sPower = pc.length ? Math.max(...pc.map((p) => p.watts)) : 0;
	const hrs = detail.strokes.map((s) => s.hr).filter((h): h is number => h != null && h > 0);
	const peakHr = hrs.length ? hrs.reduce((m, h) => h > m ? h : m, 0) : null;
	const avgHr =
		detail.heartRateAvg && detail.heartRateAvg > 0
			? detail.heartRateAvg
			: hrs.length
				? mean(hrs)
				: null;

	return {
		time: detail.time,
		pace: detail.pace,
		avgWatts: Math.round(workoutWatts(detail)),
		best5sPower: Math.round(best5sPower),
		avgHr: avgHr != null ? Math.round(avgHr) : null,
		peakHr: peakHr != null ? Math.round(peakHr) : null,
		avgDps: tech.avgDps,
		paceConsistency: tech.paceConsistency
	};
}

export type CompareWinner = 'a' | 'b' | 'tie';

export interface CompareVerdict {
	winner: CompareWinner;
	/** Seconds faster for workout A when distances are comparable. */
	timeDeltaSec: number | null;
	/** Pace delta (A − B) in sec/500m; negative = A is faster. */
	paceDelta: number | null;
}

/**
 * Decide which piece was "better" for like-for-like distances (same band),
 * otherwise compare average pace.
 */
export function compareVerdict(a: WorkoutDetail, b: WorkoutDetail): CompareVerdict {
	if (a.sport !== b.sport) return { winner: 'tie', timeDeltaSec: null, paceDelta: null };

	const bandA = distanceBand(a.distance);
	const bandB = distanceBand(b.distance);
	const likeForLike = bandA.key === bandB.key;

	if (likeForLike && a.time > 0 && b.time > 0) {
		const timeDeltaSec = b.time - a.time; // positive = A faster
		let winner: CompareWinner = 'tie';
		if (Math.abs(timeDeltaSec) >= 0.5) winner = timeDeltaSec > 0 ? 'a' : 'b';
		return { winner, timeDeltaSec, paceDelta: a.pace - b.pace };
	}

	const paceDelta = a.pace - b.pace;
	let winner: CompareWinner = 'tie';
	if (a.pace > 0 && b.pace > 0 && Math.abs(paceDelta) >= 0.1) {
		winner = paceDelta < 0 ? 'a' : 'b';
	}
	return { winner, timeDeltaSec: null, paceDelta };
}

export interface IntervalCompareRow {
	index: number;
	paceA: number;
	paceB: number;
	/** A pace − B pace (sec/500m); negative = A faster on this rep. */
	paceDelta: number;
	timeA: number;
	timeB: number;
	/** B time − A time (sec); positive = A faster. */
	timeDelta: number;
}

/** Per-rep deltas when both workouts have interval splits (by index). */
export function compareIntervalReps(a: WorkoutDetail, b: WorkoutDetail): IntervalCompareRow[] | null {
	if (a.sport !== b.sport) return null;
	const setA = intervalBreakdown(a.splits, a.strokes);
	const setB = intervalBreakdown(b.splits, b.strokes);
	if (!setA || !setB) return null;
	const n = Math.min(setA.reps.length, setB.reps.length);
	if (n < 2) return null;

	const rows: IntervalCompareRow[] = [];
	for (let i = 0; i < n; i++) {
		const ra = setA.reps[i];
		const rb = setB.reps[i];
		rows.push({
			index: i + 1,
			paceA: ra.pace,
			paceB: rb.pace,
			paceDelta: ra.pace - rb.pace,
			timeA: ra.time,
			timeB: rb.time,
			timeDelta: rb.time - ra.time
		});
	}
	return rows;
}

// ---------------------------------------------------------------------------
// Goals, streaks, challenges (Task 5)
// ---------------------------------------------------------------------------

export type AnnualGoalKind = 'meters' | 'hours';

export interface AnnualGoal {
	year: number;
	kind: AnnualGoalKind;
	/** Target metres or seconds for the calendar year. */
	target: number;
}

export interface AnnualGoalProgress {
	year: number;
	kind: AnnualGoalKind;
	target: number;
	current: number;
	pct: number;
	daysElapsed: number;
	daysInYear: number;
	/** Linear “should have by now” target for pacing. */
	expected: number;
	onPace: boolean;
	/** Projected year-end total at the current daily rate. */
	projected: number;
}

function daysInCalendarYear(year: number): number {
	return (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
}

function dayOfYearUtc(dayKey: string): number {
	return Temporal.PlainDate.from(dayKey).dayOfYear;
}

function daysBetweenUtc(from: string, to: string): number {
	const days = Temporal.PlainDate.from(from).until(Temporal.PlainDate.from(to), {
		largestUnit: 'day'
	}).days;
	return Math.max(0, days);
}

/** Year-to-date progress toward an annual distance or time goal. */
export function annualGoalProgress(
	workouts: Workout[],
	goal: AnnualGoal,
	endDay?: string
): AnnualGoalProgress {
	const end = endDay ?? todayKeyUtc();
	const year = goal.year;
	const yearPrefix = `${year}-`;
	const inYear = workouts.filter((w) => workoutDayKey(w.date).startsWith(yearPrefix));
	const current =
		goal.kind === 'meters'
			? inYear.reduce((s, w) => s + challengeDistanceMetres(w), 0)
			: inYear.reduce((s, w) => s + w.time, 0);

	const daysInYear = daysInCalendarYear(year);
	const yearEnd = `${year}-12-31`;
	const progressThrough = end.startsWith(yearPrefix) ? end : yearEnd;
	const daysElapsed = Math.min(dayOfYearUtc(progressThrough), daysInYear);
	const expected = goal.target > 0 ? (goal.target * daysElapsed) / daysInYear : 0;
	const rate = daysElapsed > 0 ? current / daysElapsed : 0;
	const projected = rate * daysInYear;
	const pct = goal.target > 0 ? Math.min(100, (current / goal.target) * 100) : 0;

	return {
		year,
		kind: goal.kind,
		target: goal.target,
		current,
		pct,
		daysElapsed,
		daysInYear,
		expected,
		onPace: current >= expected,
		projected
	};
}

export interface TrainingStreakStats {
	currentStreak: number;
	longestStreak: number;
	/** Calendar days since the last session day (0 = trained today). */
	daysSinceLastSession: number | null;
	weeklyConsistency: { activeWeeks: number; totalWeeks: number };
}

export function weeklyConsistency(
	workouts: Workout[],
	endDay: string,
	lookbackWeeks = 8
): { activeWeeks: number; totalWeeks: number } {
	const activeDays = new Set([...aggregateDailyVolume(workouts).keys()].filter((d) => d <= endDay));
	let activeWeeks = 0;
	for (let w = 0; w < lookbackWeeks; w++) {
		const weekEnd = addDaysToKey(endDay, -w * 7);
		let any = false;
		for (let d = 0; d < 7; d++) {
			if (activeDays.has(addDaysToKey(weekEnd, -d))) {
				any = true;
				break;
			}
		}
		if (any) activeWeeks++;
	}
	return { activeWeeks, totalWeeks: lookbackWeeks };
}

export function trainingStreakStats(workouts: Workout[], endDay?: string): TrainingStreakStats {
	const end = endDay ?? todayKeyUtc();
	const historyDays = [...aggregateDailyVolume(workouts).keys()].filter((d) => d <= end).sort();
	const { current: currentStreak, longest: longestStreak } = trainingStreaks(historyDays, end);
	const lastDay = historyDays.length ? historyDays[historyDays.length - 1] : null;
	const daysSinceLastSession = lastDay != null ? daysBetweenUtc(lastDay, end) : null;
	return {
		currentStreak,
		longestStreak,
		daysSinceLastSession,
		weeklyConsistency: weeklyConsistency(workouts, end)
	};
}

export type BadgeId =
	| 'meters_100k'
	| 'meters_500k'
	| 'meters_1m'
	| 'meters_2m'
	| 'meters_5m'
	| 'club_500'
	| 'club_1000'
	| 'club_2000'
	| 'club_5000'
	| 'club_10000'
	| 'every_sport_week';

export interface AthleteBadge {
	id: BadgeId;
	earned: boolean;
	/** 0–1 progress toward the next lifetime-meters milestone (when not earned). */
	progress?: number;
}

const LIFETIME_METER_BADGES: { id: BadgeId; meters: number }[] = [
	{ id: 'meters_100k', meters: 100_000 },
	{ id: 'meters_500k', meters: 500_000 },
	{ id: 'meters_1m', meters: 1_000_000 },
	{ id: 'meters_2m', meters: 2_000_000 },
	{ id: 'meters_5m', meters: 5_000_000 }
];

const CLUB_DISTANCES: { id: BadgeId; metres: number }[] = [
	{ id: 'club_500', metres: 500 },
	{ id: 'club_1000', metres: 1000 },
	{ id: 'club_2000', metres: 2000 },
	{ id: 'club_5000', metres: 5000 },
	{ id: 'club_10000', metres: 10000 }
];

/** Any rolling 7-day window with at least one session on each Concept2 sport. */
export function hasEverySportWeek(workouts: Workout[]): boolean {
	const daySports = new Map<string, Set<Sport>>();
	for (const w of workouts) {
		const day = workoutDayKey(w.date);
		if (!daySports.has(day)) daySports.set(day, new Set());
		daySports.get(day)!.add(w.sport);
	}
	const sorted = [...daySports.keys()].sort();
	for (const start of sorted) {
		const sports = new Set<Sport>();
		for (let offset = 0; offset < 7; offset++) {
			const s = daySports.get(addDaysToKey(start, offset));
			if (s) for (const sp of s) sports.add(sp);
		}
		if (sports.has('rower') && sports.has('skierg') && sports.has('bike')) return true;
	}
	return false;
}

export function athleteBadges(
	workouts: Workout[],
	pbs: ReturnType<typeof distancePBs>
): AthleteBadge[] {
	const totalMeters = workouts.reduce((s, w) => s + challengeDistanceMetres(w), 0);
	const pbDistances = new Set(pbs.map((p) => p.distance));
	const badges: AthleteBadge[] = [];

	for (const { id, meters } of LIFETIME_METER_BADGES) {
		const earned = totalMeters >= meters;
		badges.push({
			id,
			earned,
			progress: earned ? 1 : Math.min(1, totalMeters / meters)
		});
	}
	for (const { id, metres } of CLUB_DISTANCES) {
		badges.push({ id, earned: pbDistances.has(metres) });
	}
	badges.push({ id: 'every_sport_week', earned: hasEverySportWeek(workouts) });
	return badges;
}

/** Workout ids that currently hold a standard-distance PB (per sport). */
export function pbWorkoutIds(workouts: Workout[]): Set<number> {
	const ids = new Set<number>();
	const bySport = new Map<string, Workout[]>();
	for (const w of workouts) {
		const arr = bySport.get(w.sport) ?? [];
		arr.push(w);
		bySport.set(w.sport, arr);
	}
	for (const sportWorkouts of bySport.values()) {
		for (const target of STANDARD_DISTANCES) {
			const matches = sportWorkouts.filter((w) => Math.abs(w.distance - target) <= target * 0.02 && w.time > 0);
			if (!matches.length) continue;
			const best = matches.reduce((a, b) => (a.time <= b.time ? a : b));
			ids.add(best.id);
		}
	}
	return ids;
}

export type DistancePB = ReturnType<typeof distancePBs>[number];

/** PBs that improved (or are new) after a sync or data refresh. */
export function detectNewPBs(before: DistancePB[], after: DistancePB[]): DistancePB[] {
	const beforeMap = new Map(before.map((p) => [`${p.sport}-${p.distance}`, p]));
	const out: DistancePB[] = [];
	for (const pb of after) {
		const prev = beforeMap.get(`${pb.sport}-${pb.distance}`);
		if (!prev || pb.time < prev.time - 0.001) out.push(pb);
	}
	return out;
}
