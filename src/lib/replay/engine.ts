import type { Split, Sport, Stroke } from '../types';

/** A single interpolated frame of workout state. */
export interface Frame {
	t: number;
	d: number;
	pace: number;
	spm: number;
	hr?: number;
	watts: number;
	/** Fraction of the workout completed, 0..1 (by time). */
	progress: number;
}

/**
 * Linearly interpolate the workout state at time `t` (seconds).
 *
 * Pure and stateless so it can be reused for a "ghost" track later: just call
 * `sampleAt(ghostStrokes, t)` alongside the live one and render both.
 */
export function sampleAt(strokes: Stroke[], t: number): Frame {
	const n = strokes.length;
	if (n === 0) {
		return { t, d: 0, pace: 0, spm: 0, watts: 0, progress: 0 };
	}
	const total = strokes[n - 1].t || 1;
	const progress = Math.max(0, Math.min(1, t / total));

	if (t <= strokes[0].t) return frameFrom(strokes[0], t, progress);
	if (t >= strokes[n - 1].t) return frameFrom(strokes[n - 1], t, progress);

	// Binary search for the bracketing samples.
	let lo = 0;
	let hi = n - 1;
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (strokes[mid].t <= t) lo = mid;
		else hi = mid;
	}
	const a = strokes[lo];
	const b = strokes[hi];
	const span = b.t - a.t || 1;
	const f = (t - a.t) / span;

	return {
		t,
		d: lerp(a.d, b.d, f),
		pace: lerp(a.pace, b.pace, f),
		spm: lerp(a.spm, b.spm, f),
		hr: a.hr != null && b.hr != null ? lerp(a.hr, b.hr, f) : (a.hr ?? b.hr),
		watts: lerp(a.watts, b.watts, f),
		progress
	};
}

function frameFrom(s: Stroke, t: number, progress: number): Frame {
	return { t, d: s.d, pace: s.pace, spm: s.spm, hr: s.hr, watts: s.watts, progress };
}

function lerp(a: number, b: number, f: number): number {
	return a + (b - a) * f;
}

/** One work interval in a MultiErg or interval workout. */
export interface SegmentInfo {
	index: number;
	machine: Sport;
	startD: number;
	endD: number;
	startT: number;
	endT: number;
	/** Seconds of rest before this segment starts (0 for the first). */
	restBefore: number;
}

export interface RestProgress {
	phase: number;
	from: Sport;
	to: Sport;
	remaining: number;
}

const SPORTS: Sport[] = ['rower', 'skierg', 'bike'];

/** Build a distance/time map of work intervals (skips rest rows). */
export function buildSegmentMap(splits: Split[], fallbackSport: Sport = 'rower'): SegmentInfo[] {
	const work = splits.filter((s) => !s.isRest && s.machine);
	if (work.length === 0) {
		const totalD = splits.reduce((a, s) => a + (s.isRest ? 0 : s.distance), 0);
		const totalT = splits.reduce((a, s) => a + (s.isRest ? 0 : s.time), 0);
		const machine = splits.find((s) => s.machine)?.machine ?? fallbackSport;
		if (totalD <= 0 && totalT <= 0) {
			// One unbounded segment so paceRangeForSegment matches every stroke; a
			// zero-width (endD/endT = 0) segment would match nothing and fall back to
			// static pace defaults for any workout that arrives without splits.
			return [
				{
					index: 0,
					machine,
					startD: 0,
					endD: Infinity,
					startT: 0,
					endT: Infinity,
					restBefore: 0
				}
			];
		}
		return [
			{
				index: 0,
				machine,
				startD: 0,
				endD: totalD,
				startT: 0,
				endT: totalT,
				restBefore: 0
			}
		];
	}

	let d = 0;
	let t = 0;
	let pendingRest = 0;
	const segs: SegmentInfo[] = [];

	for (const s of splits) {
		if (s.isRest) {
			pendingRest += s.restTime ?? s.time ?? 0;
			continue;
		}
		if (!s.machine) continue;
		const restBefore = pendingRest;
		pendingRest = 0;
		const startD = d;
		// Work-time timeline (rests excluded). The engine's playback clock is driven
		// by strokes, which carry no time during rests, so segment boundaries must
		// align with cumulative WORK time; `restBefore` is kept separately for the
		// display-only rest interstitial. A wall-clock startT (t + restBefore) here
		// desynced the map from the engine: resuming at next.startT after a rest
		// skipped strokes, and later boundaries (whose wall-clock endT the work
		// clock never reaches) never triggered their rest.
		const startT = t;
		const endD = d + s.distance;
		const endT = startT + s.time;
		segs.push({
			index: segs.length,
			machine: s.machine,
			startD,
			endD,
			startT,
			endT,
			restBefore
		});
		d = endD;
		t = endT;
	}
	return segs;
}

function findSegmentByDistance(segMap: SegmentInfo[], d: number): SegmentInfo {
	if (segMap.length === 0) return { index: 0, machine: 'rower', startD: 0, endD: 0, startT: 0, endT: 0, restBefore: 0 };
	for (const seg of segMap) {
		if (d < seg.endD) return seg;
	}
	return segMap[segMap.length - 1];
}

export function activeMachineAt(segMap: SegmentInfo[], d: number): Sport {
	return findSegmentByDistance(segMap, d).machine;
}

export function activeSegmentIndexAt(segMap: SegmentInfo[], d: number): number {
	return findSegmentByDistance(segMap, d).index;
}

export function restProgressAt(segMap: SegmentInfo[], t: number): RestProgress | null {
	for (let k = 0; k < segMap.length - 1; k++) {
		const cur = segMap[k];
		const next = segMap[k + 1];
		if (next.restBefore <= 0) continue;
		if (t >= cur.endT && t < next.startT) {
			const span = next.startT - cur.endT;
			const phase = span > 0 ? (t - cur.endT) / span : 1;
			return {
				phase,
				from: cur.machine,
				to: next.machine,
				remaining: next.startT - t
			};
		}
	}
	return null;
}

/** Pace gauge range for the active work segment. */
export function paceRangeForSegment(
	segMap: SegmentInfo[],
	segIdx: number,
	strokes: Stroke[],
	sport: Sport
): { min: number; max: number } {
	const defaults =
		sport === 'bike' ? { min: 45, max: 120 } : { min: 90, max: 200 };
	if (segIdx < 0 || segIdx >= segMap.length) return defaults;
	const seg = segMap[segIdx];
	const ps = strokes
		.filter((s) => s.d >= seg.startD && s.d <= seg.endD)
		.map((s) => s.pace)
		.filter((p) => p > 0);
	if (ps.length < 2) return defaults;
	return { min: Math.min(...ps) - 5, max: Math.max(...ps) + 5 };
}

export { SPORTS };

/**
 * Index of the most recent stroke at or before `t` (sample-and-hold).
 * Mirrors `sampleAt`'s bracketing search but returns the lower index.
 */
export function sampleIndexAt(strokes: Stroke[], t: number): number {
	const n = strokes.length;
	if (n === 0) return -1;
	if (t <= strokes[0].t) return 0;
	if (t >= strokes[n - 1].t) return n - 1;

	let lo = 0;
	let hi = n - 1;
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (strokes[mid].t <= t) lo = mid;
		else hi = mid;
	}
	return lo;
}

/**
 * requestAnimationFrame-driven playback clock. Reports the current frame back
 * to the consumer via `onFrame`; the consumer owns all rendering.
 */
export class ReplayEngine {
	private strokes: Stroke[];
	readonly duration: number;
	private _time = 0;
	private _playing = false;
	private _speed = 1;
	private rafId = 0;
	private lastTs = 0;
	private onFrame: (f: Frame, playing: boolean) => void;

	constructor(strokes: Stroke[], onFrame: (f: Frame, playing: boolean) => void) {
		this.strokes = strokes;
		this.duration = strokes.length ? strokes[strokes.length - 1].t : 0;
		this.onFrame = onFrame;
		this.emit();
	}

	get time() {
		return this._time;
	}
	get playing() {
		return this._playing;
	}
	get speed() {
		return this._speed;
	}

	private emit() {
		this.onFrame(sampleAt(this.strokes, this._time), this._playing);
	}

	private loop = (ts: number) => {
		if (!this._playing) return;
		const dt = (ts - this.lastTs) / 1000;
		this.lastTs = ts;
		this._time += dt * this._speed;
		if (this._time >= this.duration) {
			this._time = this.duration;
			this._playing = false;
			this.emit();
			return;
		}
		this.emit();
		this.rafId = requestAnimationFrame(this.loop);
	};

	play() {
		if (this._playing || this.duration === 0) return;
		if (this._time >= this.duration) this._time = 0;
		this._playing = true;
		this.lastTs = performance.now();
		this.rafId = requestAnimationFrame(this.loop);
	}

	pause() {
		this._playing = false;
		cancelAnimationFrame(this.rafId);
		this.emit();
	}

	toggle() {
		this._playing ? this.pause() : this.play();
	}

	seek(t: number) {
		this._time = Math.max(0, Math.min(this.duration, t));
		this.emit();
	}

	setSpeed(s: number) {
		this._speed = s;
		this.lastTs = performance.now();
	}

	destroy() {
		cancelAnimationFrame(this.rafId);
	}
}
