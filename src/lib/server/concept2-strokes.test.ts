import { describe, expect, it } from 'vitest';
import { buildAuthorizeUrl, mapStrokes, redirectUri } from './concept2';
import type { Concept2Config } from './concept2';

const cfg: Concept2Config = {
	clientId: 'test-client-id',
	clientSecret: 'test-secret',
	baseUrl: 'https://log.concept2.com',
	appUrl: 'https://rowplay.example.com'
};

describe('redirectUri', () => {
	it('appends /auth/callback to the app URL', () => {
		expect(redirectUri(cfg)).toBe('https://rowplay.example.com/auth/callback');
	});

	it('strips a trailing slash from appUrl before appending', () => {
		const trailingSlash = { ...cfg, appUrl: 'https://rowplay.example.com/' };
		expect(redirectUri(trailingSlash)).toBe('https://rowplay.example.com/auth/callback');
	});
});

describe('buildAuthorizeUrl', () => {
	it('builds a URL pointing at the base URL OAuth endpoint', () => {
		const url = buildAuthorizeUrl(cfg, 'csrf-state');
		expect(url).toContain('https://log.concept2.com/oauth/authorize');
	});

	it('includes client_id in the query string', () => {
		const url = buildAuthorizeUrl(cfg, 'state');
		expect(url).toContain('client_id=test-client-id');
	});

	it('includes the state parameter', () => {
		const url = buildAuthorizeUrl(cfg, 'my-csrf-token');
		expect(url).toContain('state=my-csrf-token');
	});

	it('includes response_type=code', () => {
		expect(buildAuthorizeUrl(cfg, 'state')).toContain('response_type=code');
	});

	it('includes the redirect_uri', () => {
		const url = new URL(buildAuthorizeUrl(cfg, 'state'));
		expect(url.searchParams.get('redirect_uri')).toBe('https://rowplay.example.com/auth/callback');
	});

	it('includes the scope parameter', () => {
		const url = buildAuthorizeUrl(cfg, 'state');
		expect(url).toContain('scope=');
	});
});

describe('mapStrokes', () => {
	const raw = [
		{ t: 0, d: 0, p: 1200, spm: 28 },
		{ t: 100, d: 500, p: 1180, spm: 30 },
		{ t: 200, d: 1000, p: 1160, spm: 32 }
	];

	it('converts tenths of seconds to seconds', () => {
		const strokes = mapStrokes(raw, 'rower');
		expect(strokes[0].t).toBe(0);
		expect(strokes[1].t).toBe(10);
		expect(strokes[2].t).toBe(20);
	});

	it('converts decimetres to metres', () => {
		const strokes = mapStrokes(raw, 'rower');
		expect(strokes[0].d).toBe(0);
		expect(strokes[1].d).toBe(50);
		expect(strokes[2].d).toBe(100);
	});

	it('converts pace tenths to sec/500m for rower', () => {
		const strokes = mapStrokes(raw, 'rower');
		expect(strokes[0].pace).toBe(120); // 1200 / 10 / 1
		expect(strokes[1].pace).toBe(118);
	});

	it('halves pace for bike (per-1000m → per-500m)', () => {
		const strokes = mapStrokes(raw, 'bike');
		expect(strokes[0].pace).toBe(60); // 1200 / 10 / 2
		expect(strokes[1].pace).toBe(59);
	});

	it('keeps rower/skierg pace unmodified (÷ 1)', () => {
		const rowPace = mapStrokes(raw, 'rower')[0].pace;
		const skiPace = mapStrokes(raw, 'skierg')[0].pace;
		expect(rowPace).toBe(skiPace);
	});

	it('maps spm directly', () => {
		const strokes = mapStrokes(raw, 'rower');
		expect(strokes[0].spm).toBe(28);
		expect(strokes[1].spm).toBe(30);
	});

	it('preserves heart rate when present', () => {
		const withHr = [{ t: 0, d: 0, p: 1200, spm: 28, hr: 145 }];
		expect(mapStrokes(withHr, 'rower')[0].hr).toBe(145);
	});

	it('returns undefined hr when hr is 0 or absent', () => {
		const noHr = [{ t: 0, d: 0, p: 1200, spm: 28, hr: 0 }];
		expect(mapStrokes(noHr, 'rower')[0].hr).toBeUndefined();

		const missingHr = [{ t: 0, d: 0, p: 1200, spm: 28 }];
		expect(mapStrokes(missingHr, 'rower')[0].hr).toBeUndefined();
	});

	it('handles interval resets: t or d going backwards resets offset', () => {
		const intervalRaw = [
			// Interval 1
			{ t: 0, d: 0, p: 1200, spm: 28 },
			{ t: 100, d: 500, p: 1180, spm: 30 },
			// Interval 2 — counter resets
			{ t: 0, d: 0, p: 1220, spm: 27 },
			{ t: 100, d: 500, p: 1200, spm: 29 }
		];
		const strokes = mapStrokes(intervalRaw, 'rower');
		// After the first interval ends at t=10s, the second starts at offset 10s
		expect(strokes[2].t).toBeGreaterThanOrEqual(strokes[1].t);
		expect(strokes[3].t).toBeGreaterThan(strokes[2].t);
		// Distance should also be monotonically non-decreasing
		expect(strokes[2].d).toBeGreaterThanOrEqual(strokes[1].d);
	});

	it('computes watts from pace', () => {
		const strokes = mapStrokes(raw, 'rower');
		for (const s of strokes) {
			expect(s.watts).toBeGreaterThan(0);
		}
	});

	it('stores raw t/d fields for the inspector', () => {
		const strokes = mapStrokes(raw, 'rower');
		expect(strokes[0].rawT).toBe(0);
		expect(strokes[1].rawT).toBe(10); // tenths = 100/10
		expect(strokes[1].rawD).toBe(50); // decimetres = 500/10
	});
});
