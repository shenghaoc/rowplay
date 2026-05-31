import type { Sport, Workout } from './types';

/** Seconds -> "M:SS.t" or "H:MM:SS". */
export function fmtTime(seconds: number, tenths = false): string {
	if (!isFinite(seconds) || seconds < 0) return '--:--';
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	if (h > 0) {
		return `${h}:${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')}`;
	}
	const sStr = tenths ? s.toFixed(1).padStart(4, '0') : String(Math.floor(s)).padStart(2, '0');
	return `${m}:${sStr}`;
}

/** Pace (sec/500m) -> "M:SS.t /500m". */
export function fmtPace(pace: number): string {
	if (!isFinite(pace) || pace <= 0) return '--:--';
	return `${fmtTime(pace, true)}/500m`;
}

/** Pace without the "/500m" suffix (for gauges, charts, and split labels).
 * Zero is treated as invalid (--:--) unless `allowZero` is true, which is
 * useful for formatting pace deltas (no change = 0:00.0). */
export function fmtPaceBare(pace: number, allowZero = false): string {
	if (!isFinite(pace) || (allowZero ? pace < 0 : pace <= 0)) return '--:--';
	return fmtTime(pace, true);
}

export function fmtDistance(metres: number): string {
	if (metres >= 1000) return `${(metres / 1000).toFixed(2)} km`;
	return `${Math.round(metres)} m`;
}

export function fmtDate(iso: string): string {
	const d = new Date(iso.replace(' ', 'T'));
	if (isNaN(d.getTime())) return iso;
	return d.toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

export const SPORT_LABEL: Record<Sport, string> = {
	rower: 'RowErg',
	skierg: 'SkiErg',
	bike: 'BikeErg'
};

/**
 * Concept2's power model: watts = 2.8 / pace^3, where pace is seconds-per-metre.
 * Given pace in sec/500m, pace-per-metre = pace/500.
 */
export function paceToWatts(pacePer500: number): number {
	if (!isFinite(pacePer500) || pacePer500 <= 0) return 0;
	const perMetre = pacePer500 / 500;
	return 2.8 / Math.pow(perMetre, 3);
}

/** Average watts from cached watt-minutes when present, else Concept2 pace model. */
export function avgWatts(w: Pick<Workout, 'wattMinutes' | 'time' | 'pace'>): number {
	if (w.wattMinutes != null && w.time > 0) {
		return Math.round(w.wattMinutes / (w.time / 60));
	}
	return Math.round(paceToWatts(w.pace));
}
