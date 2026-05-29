import type { Stroke } from '../types';

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
