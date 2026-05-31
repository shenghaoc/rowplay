/** Concept2 machine families. All three report comparable results. */
export type Sport = 'rower' | 'skierg' | 'bike';

/** Maps Concept2 result `type` values onto our Sport union. */
export function toSport(type: string | undefined): Sport {
	switch (type) {
		case 'ski':
		case 'skierg':
			return 'skierg';
		case 'bike':
		case 'bikeerg':
			return 'bike';
		default:
			return 'rower';
	}
}

/** A summary row as returned by the Concept2 results list. */
export interface Workout {
	id: number;
	date: string; // ISO-ish, "YYYY-MM-DD HH:MM:SS"
	sport: Sport;
	/** Total distance in metres. */
	distance: number;
	/** Elapsed time in seconds. */
	time: number;
	/** Average pace, seconds per 500m. */
	pace: number;
	strokeRate?: number;
	strokeCount?: number;
	heartRateAvg?: number;
	/** Heart-rate min/max over the piece, when the logbook reports them. */
	hrMin?: number;
	hrMax?: number;
	caloriesTotal?: number;
	/** Total watt-minutes; divided by elapsed minutes gives average power. */
	wattMinutes?: number;
	dragFactor?: number;
	workoutType?: string;
	comments?: string;
	/** Whether per-stroke detail is available for a real-time replay. */
	hasStrokeData: boolean;
}

/** One sample on the workout timeline. Distances in metres, time in seconds. */
export interface Stroke {
	/** Seconds since workout start. */
	t: number;
	/** Cumulative distance in metres. */
	d: number;
	/** Instantaneous pace, seconds per 500m. */
	pace: number;
	/** Strokes per minute (or RPM for the bike). */
	spm: number;
	/** Heart rate in bpm, if recorded. */
	hr?: number;
	/** Watts, derived from pace when not reported. */
	watts: number;
}

/** A split/interval summary inside a workout. */
export interface Split {
	index: number;
	distance: number;
	time: number;
	pace: number;
	spm?: number;
	hr?: number;
}

/** Full detail needed to drive a replay. */
/** If you change this type, bump DETAIL_PAYLOAD_VERSION in src/lib/server/db.ts. */
export interface WorkoutDetail extends Workout {
	strokes: Stroke[];
	splits: Split[];
	/**
	 * True when `splits` are work *intervals* (rest between reps) rather than
	 * the even splits of a continuous piece. Drives interval-vs-split labelling.
	 */
	isInterval: boolean;
}
