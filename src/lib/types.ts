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

export interface HeartRateDetail {
	average?: number;
	min?: number;
	max?: number;
	/** bpm at the end of the effort */
	ending?: number;
	/** bpm during rest (split-level) */
	rest?: number;
	/** bpm after recovery window */
	recovery?: number;
}

export interface WorkoutTargets {
	strokeRate?: number;
	/** 0–5 */
	heartRateZone?: number;
	/** sec / 500m (normalised from API tenths) */
	pace?: number;
	watts?: number;
	calories?: number;
}

export interface LoggingMetadata {
	pmVersion?: number;
	firmwareVersion?: string;
	/** Sensitive — stripped on public /r view */
	serialNumber?: string;
	/** Sensitive — stripped on public /r view */
	device?: string;
	deviceOs?: string;
	deviceOsVersion?: string;
	/** Concept2 `erg_model_type` / X-Erg-Model-Type (0=D/E/RowErg/Dynamic, 1=C/B, 2=A). */
	ergModelType?: number;
	/** Known values include BT, ANT, Apple — stored as plain string from the API. */
	hrType?: string;
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
	heartRate?: HeartRateDetail;
	caloriesTotal?: number;
	/** Total watt-minutes; divided by elapsed minutes gives average power. */
	wattMinutes?: number;
	dragFactor?: number;
	workoutType?: string;
	comments?: string;
	timezone?: string;
	/** True UTC instant of workout end (Concept2 `date_utc` field; `null` when the API omits it). */
	dateUtc?: string | null;
	weightClass?: 'H' | 'L';
	privacy?: string;
	/** Logging app/channel from Concept2 `source` (free string; docs only show Web/ErgData). */
	source?: string;
	verified?: boolean;
	/** Total rest time in seconds (interval pieces). */
	restTime?: number;
	/** Total rest distance in metres (interval pieces). */
	restDistance?: number;
	targets?: WorkoutTargets;
	metadata?: LoggingMetadata;
	/** Whether per-stroke detail is available for a real-time replay. */
	hasStrokeData: boolean;
	/** Athlete override for auto-detected workout type tag (D1 `user_tag`; null = auto). */
	userTag?: string | null;
	/** Present on detail payloads and some summaries when interval structure is known. */
	isInterval?: boolean;
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
	/**
	 * As-logged time (s) / distance (m) before interval cumulative offsets.
	 * Set by `mapStrokes` on every API stroke so the inspector can show wire
	 * values (which reset to 0 each interval) rather than the monotonic timeline.
	 */
	rawT?: number;
	rawD?: number;
}

export type SplitIntervalType = 'time' | 'distance' | 'calorie' | 'wattminute';

/** A split/interval summary inside a workout. */
export interface Split {
	index: number;
	distance: number;
	time: number;
	pace: number;
	spm?: number;
	/** Legacy scalar avg HR — prefer `heartRate.average` when present. */
	hr?: number;
	heartRate?: HeartRateDetail;
	caloriesTotal?: number;
	wattMinutes?: number;
	type?: SplitIntervalType;
	restTime?: number;
	restDistance?: number;
	machine?: Sport;
	/** True when this row is a rest segment (work:rest analysis). */
	isRest?: boolean;
}

/** A coach/self timestamped note attached to a workout. */
export interface Annotation {
	/** Opaque id (auto-increment in D1; local counter in demo). */
	id: number;
	/** Seconds since workout start — snaps to the nearest stroke. */
	timestamp: number;
	/** Free-text coaching note. */
	text: string;
	/** Epoch milliseconds when the annotation was created. */
	createdAt: number;
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
