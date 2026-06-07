import { describe, expect, it } from 'vitest';
import {
	raceGapMetres,
	raceGapSeconds,
	finishDeltaSec,
	ghostDistAtPlayerFinish,
	playerDistAtGhostFinish
} from './replayGap';
import type { Stroke } from '$lib/types';

function strokes(times: number[], dists: number[]): Stroke[] {
	return times.map((t, i) => ({ t, d: dists[i], pace: 120, spm: 28, watts: 200 }));
}

describe('raceGapMetres', () => {
	it('positive when player is ahead', () => {
		expect(raceGapMetres(250, 230)).toBeCloseTo(20);
	});

	it('negative when player is behind', () => {
		expect(raceGapMetres(210, 250)).toBeCloseTo(-40);
	});

	it('zero when tied', () => {
		expect(raceGapMetres(500, 500)).toBe(0);
	});
});

describe('raceGapSeconds', () => {
	it('converts metres to seconds at given pace', () => {
		// 20 m gap, pace 120 s/500m → speed 500/120 ≈ 4.167 m/s → 20/4.167 ≈ 4.8s
		expect(raceGapSeconds(20, 120)).toBeCloseTo(4.8);
	});

	it('returns 0 when pace is zero', () => {
		expect(raceGapSeconds(20, 0)).toBe(0);
	});

	it('negative gap returns negative seconds', () => {
		expect(raceGapSeconds(-20, 120)).toBeCloseTo(-4.8);
	});
});

describe('finishDeltaSec', () => {
	it('negative when player is faster', () => {
		const player = strokes([0, 480], [0, 2000]);
		const ghost = strokes([0, 495], [0, 2000]);
		expect(finishDeltaSec(player, ghost)).toBeCloseTo(-15);
	});

	it('positive when ghost is faster', () => {
		const player = strokes([0, 500], [0, 2000]);
		const ghost = strokes([0, 490], [0, 2000]);
		expect(finishDeltaSec(player, ghost)).toBeCloseTo(10);
	});

	it('zero for equal finish times', () => {
		const s = strokes([0, 480], [0, 2000]);
		expect(finishDeltaSec(s, s)).toBe(0);
	});

	it('returns 0 for empty stroke arrays', () => {
		expect(finishDeltaSec([], [])).toBe(0);
		expect(finishDeltaSec(strokes([0, 480], [0, 2000]), [])).toBe(0);
	});
});

describe('ghostDistAtPlayerFinish', () => {
	it('returns ghost distance sampled at player finish time', () => {
		const ghost = strokes([0, 100, 200], [0, 500, 1000]);
		// Player finishes at t=150; ghost interpolated midway through second segment
		const d = ghostDistAtPlayerFinish(ghost, 150);
		expect(d).toBeCloseTo(750);
	});

	it('clamps to ghost end when player finishes after ghost', () => {
		const ghost = strokes([0, 100], [0, 1000]);
		const d = ghostDistAtPlayerFinish(ghost, 200);
		expect(d).toBe(1000);
	});
});

describe('playerDistAtGhostFinish', () => {
	it('returns player distance at ghost finish time', () => {
		const player = strokes([0, 100, 200], [0, 500, 1000]);
		const d = playerDistAtGhostFinish(player, 50);
		expect(d).toBeCloseTo(250);
	});
});
