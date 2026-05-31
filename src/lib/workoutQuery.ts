import { distanceBand } from '$lib/analytics';
import type { Sport, Workout } from '$lib/types';

/** Fields the list can sort by. */
export type WorkoutSortField = 'date' | 'distance' | 'time' | 'pace' | 'power';

export type SortDir = 'asc' | 'desc';

/** Parsed list query — mirrors URL search params. */
export interface WorkoutListQuery {
	sport?: Sport;
	workoutType?: string;
	dateFrom?: string;
	dateTo?: string;
	/** Nominal metres for a distance chip (500, 2000, …). */
	distanceM?: number;
	/** Coarse band key from `distanceBand` (e.g. `r3000`). */
	distanceBandKey?: string;
	hasStroke?: boolean;
	/** Free-text match against `comments`. */
	q?: string;
	pbsOnly?: boolean;
	durationMin?: number;
	durationMax?: number;
	sort: WorkoutSortField;
	dir: SortDir;
}

export const DISTANCE_CHIPS = [
	{ m: 500, key: '500' },
	{ m: 2000, key: '2000' },
	{ m: 5000, key: '5000' },
	{ m: 10000, key: '10000' },
	{ m: 42195, key: '42195' }
] as const;

/** Common piece durations (seconds) with ±10% tolerance when applied. */
export const DURATION_CHIPS = [
	{ sec: 1200, key: '20' },
	{ sec: 1800, key: '30' },
	{ sec: 3600, key: '60' }
] as const;

const STANDARD_PB_DISTANCES = [500, 1000, 2000, 5000, 6000, 10000, 21097];

const SORT_FIELDS: WorkoutSortField[] = ['date', 'distance', 'time', 'pace', 'power'];

function parseBool(v: string | null): boolean | undefined {
	if (v === '1' || v === 'true') return true;
	if (v === '0' || v === 'false') return false;
	return undefined;
}

function parseNum(v: string | null): number | undefined {
	if (v == null || v === '') return undefined;
	const n = Number(v);
	return Number.isFinite(n) ? n : undefined;
}

/** Read list filters from `?sport=rower&sort=pace&dir=asc` etc. */
export function parseWorkoutListQuery(params: URLSearchParams): WorkoutListQuery {
	const sport = params.get('sport');
	const sortRaw = params.get('sort');
	const sort = SORT_FIELDS.includes(sortRaw as WorkoutSortField)
		? (sortRaw as WorkoutSortField)
		: 'date';
	const dir = params.get('dir') === 'asc' ? 'asc' : 'desc';

	const q: WorkoutListQuery = { sort, dir };

	if (sport === 'rower' || sport === 'skierg' || sport === 'bike') q.sport = sport;
	const wt = params.get('type');
	if (wt) q.workoutType = wt;
	const df = params.get('from');
	if (df) q.dateFrom = df;
	const dt = params.get('to');
	if (dt) q.dateTo = dt;
	const dist = parseNum(params.get('dist'));
	if (dist != null) q.distanceM = dist;
	const band = params.get('band');
	if (band) q.distanceBandKey = band;
	const stroke = parseBool(params.get('stroke'));
	if (stroke != null) q.hasStroke = stroke;
	const text = params.get('q')?.trim();
	if (text) q.q = text;
	if (params.get('pbs') === '1') q.pbsOnly = true;
	const dmin = parseNum(params.get('dmin'));
	if (dmin != null) q.durationMin = dmin;
	const dmax = parseNum(params.get('dmax'));
	if (dmax != null) q.durationMax = dmax;

	return q;
}

/** Serialize for shareable/bookmarkable URLs (omit defaults). */
export function serializeWorkoutListQuery(q: WorkoutListQuery): URLSearchParams {
	const p = new URLSearchParams();
	if (q.sport) p.set('sport', q.sport);
	if (q.workoutType) p.set('type', q.workoutType);
	if (q.dateFrom) p.set('from', q.dateFrom);
	if (q.dateTo) p.set('to', q.dateTo);
	if (q.distanceM != null) p.set('dist', String(q.distanceM));
	if (q.distanceBandKey) p.set('band', q.distanceBandKey);
	if (q.hasStroke === true) p.set('stroke', '1');
	else if (q.hasStroke === false) p.set('stroke', '0');
	if (q.q) p.set('q', q.q);
	if (q.pbsOnly) p.set('pbs', '1');
	if (q.durationMin != null) p.set('dmin', String(q.durationMin));
	if (q.durationMax != null) p.set('dmax', String(q.durationMax));
	if (q.sort !== 'date') p.set('sort', q.sort);
	if (q.dir !== 'desc') p.set('dir', q.dir);
	return p;
}

/** Whether any list-specific filter (beyond sort) is active. */
export function listQueryIsFiltered(q: WorkoutListQuery): boolean {
	return !!(
		q.sport ||
		q.workoutType ||
		q.dateFrom ||
		q.dateTo ||
		q.distanceM != null ||
		q.distanceBandKey ||
		q.hasStroke != null ||
		q.q ||
		q.pbsOnly ||
		q.durationMin != null ||
		q.durationMax != null
	);
}

export function avgPowerWatts(w: Workout): number | null {
	if (!w.wattMinutes || w.time <= 0) return null;
	return (w.wattMinutes * 60) / w.time;
}

/** Workout ids that are a PB at a standard distance (±2%). */
export function pbWorkoutIds(workouts: Workout[]): Set<number> {
	const ids = new Set<number>();
	for (const target of STANDARD_PB_DISTANCES) {
		const matches = workouts.filter(
			(w) => Math.abs(w.distance - target) <= target * 0.02 && w.time > 0
		);
		if (!matches.length) continue;
		const best = matches.reduce((a, b) => (a.time <= b.time ? a : b));
		ids.add(best.id);
	}
	return ids;
}

function matchesDistanceChip(metres: number, nominal: number): boolean {
	return Math.abs(metres - nominal) <= nominal * 0.02;
}

function matchesDurationChip(seconds: number, target: number): boolean {
	const tol = target * 0.1;
	return seconds >= target - tol && seconds <= target + tol;
}

/** In-memory filter + sort (demo mode and API fallback). */
export function filterAndSortWorkouts(
	workouts: Workout[],
	q: WorkoutListQuery,
	pbIds?: Set<number>
): Workout[] {
	const pbs = pbIds ?? (q.pbsOnly ? pbWorkoutIds(workouts) : undefined);

	let out = workouts.filter((w) => {
		if (q.sport && w.sport !== q.sport) return false;
		if (q.workoutType && w.workoutType !== q.workoutType) return false;
		if (q.dateFrom && w.date.slice(0, 10) < q.dateFrom) return false;
		if (q.dateTo && w.date.slice(0, 10) > q.dateTo) return false;
		if (q.distanceM != null && !matchesDistanceChip(w.distance, q.distanceM)) return false;
		if (q.distanceBandKey && distanceBand(w.distance).key !== q.distanceBandKey) return false;
		if (q.hasStroke === true && !w.hasStrokeData) return false;
		if (q.hasStroke === false && w.hasStrokeData) return false;
		if (q.q) {
			const hay = (w.comments ?? '').toLowerCase();
			if (!hay.includes(q.q.toLowerCase())) return false;
		}
		if (q.pbsOnly && pbs && !pbs.has(w.id)) return false;
		if (q.durationMin != null && w.time < q.durationMin) return false;
		if (q.durationMax != null && w.time > q.durationMax) return false;
		return true;
	});

	const dir = q.dir === 'asc' ? 1 : -1;
	out = [...out].sort((a, b) => {
		let cmp = 0;
		switch (q.sort) {
			case 'date':
				cmp = a.date.localeCompare(b.date);
				break;
			case 'distance':
				cmp = a.distance - b.distance;
				break;
			case 'time':
				cmp = a.time - b.time;
				break;
			case 'pace':
				cmp = (a.pace || Infinity) - (b.pace || Infinity);
				break;
			case 'power': {
				const pa = avgPowerWatts(a) ?? -1;
				const pb = avgPowerWatts(b) ?? -1;
				cmp = pa - pb;
				break;
			}
		}
		return cmp * dir;
	});
	return out;
}

/** Apply a distance or duration quick-chip onto a query (toggle off if already set). */
export function toggleDistanceChip(q: WorkoutListQuery, metres: number): WorkoutListQuery {
	const on = q.distanceM === metres;
	return {
		...q,
		distanceM: on ? undefined : metres,
		distanceBandKey: undefined,
		durationMin: undefined,
		durationMax: undefined
	};
}

export function toggleDurationChip(q: WorkoutListQuery, seconds: number): WorkoutListQuery {
	const tol = seconds * 0.1;
	const on = q.durationMin === seconds - tol && q.durationMax === seconds + tol;
	return {
		...q,
		durationMin: on ? undefined : seconds - tol,
		durationMax: on ? undefined : seconds + tol,
		distanceM: undefined,
		distanceBandKey: undefined
	};
}

export function durationChipActive(q: WorkoutListQuery, seconds: number): boolean {
	const tol = seconds * 0.1;
	return q.durationMin === seconds - tol && q.durationMax === seconds + tol;
}
