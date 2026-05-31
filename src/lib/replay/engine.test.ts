import { describe, expect, it } from 'vitest';
import { sampleAt } from './engine';
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
});
