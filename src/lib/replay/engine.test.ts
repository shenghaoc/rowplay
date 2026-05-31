import { describe, expect, it } from 'vitest';
import { sampleAt } from './engine';
import type { Stroke } from '$lib/types';
import { ladderStrokes } from '../../../tests/unit/fixtures';
import { mockWorkoutDetail } from '../mockData';

describe('sampleAt', () => {
	const strokes = ladderStrokes();

	it('returns zeros for empty strokes', () => {
		const f = sampleAt([], 5);
		expect(f.d).toBe(0);
		expect(f.pace).toBe(0);
		expect(f.progress).toBe(0);
	});

	it('clamps before first sample', () => {
		const f = sampleAt(strokes, -1);
		expect(f.pace).toBe(strokes[0].pace);
		expect(f.d).toBe(strokes[0].d);
		expect(f.progress).toBe(0);
	});

	it('clamps after last sample', () => {
		const f = sampleAt(strokes, 100);
		const last = strokes[strokes.length - 1];
		expect(f.pace).toBe(last.pace);
		expect(f.d).toBe(last.d);
		expect(f.progress).toBe(1);
	});

	it('returns exact values on stroke timestamps', () => {
		const mid = strokes[1];
		const f = sampleAt(strokes, mid.t);
		expect(f.pace).toBe(mid.pace);
		expect(f.d).toBe(mid.d);
		expect(f.spm).toBe(mid.spm);
		expect(f.hr).toBe(mid.hr);
	});

	it('interpolates mid-stroke between samples', () => {
		const f = sampleAt(strokes, 15);
		expect(f.t).toBe(15);
		expect(f.pace).toBeGreaterThan(100);
		expect(f.pace).toBeLessThan(120);
		expect(f.d).toBeGreaterThan(50);
		expect(f.d).toBeLessThan(100);
		expect(f.progress).toBeCloseTo(0.75, 5);
	});

	it('interpolates heart rate when both ends have HR', () => {
		const f = sampleAt(strokes, 15);
		expect(f.hr).toBeGreaterThan(150);
		expect(f.hr).toBeLessThan(160);
	});

	it('works on mock workout strokes end-to-end', () => {
		const detail = mockWorkoutDetail(1001);
		expect(detail).not.toBeNull();
		const s = detail!.strokes;
		const mid = s[Math.floor(s.length / 2)];
		const f = sampleAt(s, mid.t);
		expect(f.d).toBeCloseTo(mid.d, 0);
		expect(f.pace).toBeCloseTo(mid.pace, 0);
	});

	/** Both lanes must share the same engine clock `t` when sampled. */
	describe('ghost coherence', () => {
		const player: Stroke[] = [
			{ t: 0, d: 0, pace: 120, spm: 28, watts: 200 },
			{ t: 60, d: 250, pace: 118, spm: 29, watts: 210 },
			{ t: 120, d: 500, pace: 116, spm: 30, watts: 220 }
		];
		const ghost: Stroke[] = [
			{ t: 0, d: 0, pace: 125, spm: 26, watts: 180 },
			{ t: 60, d: 230, pace: 124, spm: 27, watts: 185 },
			{ t: 120, d: 480, pace: 122, spm: 28, watts: 190 }
		];

		for (const t of [0, 30, 60, 90, 120, 150]) {
			it(`player and ghost align at t=${t}s`, () => {
				const pf = sampleAt(player, t);
				const gf = sampleAt(ghost, t);
				expect(pf.t).toBe(gf.t);
				expect(pf.t).toBe(t);
			});
		}
	});
});
