import type { KVNamespace } from '@cloudflare/workers-types';
import { paceToWatts } from '../format';
import { toSport, type Sport, type Split, type Stroke, type Workout, type WorkoutDetail } from '../types';
import { writeSession, type OAuthTokens, type SessionData, type SessionUser } from './session';

/** Scopes we request from the Concept2 logbook. */
export const OAUTH_SCOPE = 'user:read,results:read';

export interface Concept2Config {
	clientId: string;
	clientSecret: string;
	baseUrl: string;
	appUrl: string;
}

export function redirectUri(cfg: Concept2Config): string {
	return `${cfg.appUrl.replace(/\/$/, '')}/auth/callback`;
}

export function buildAuthorizeUrl(cfg: Concept2Config, state: string): string {
	const u = new URL(`${cfg.baseUrl}/oauth/authorize`);
	u.searchParams.set('client_id', cfg.clientId);
	u.searchParams.set('scope', OAUTH_SCOPE);
	u.searchParams.set('response_type', 'code');
	u.searchParams.set('redirect_uri', redirectUri(cfg));
	u.searchParams.set('state', state);
	return u.toString();
}

interface TokenResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	scope: string;
	token_type: string;
}

async function tokenRequest(cfg: Concept2Config, body: Record<string, string>): Promise<OAuthTokens> {
	const res = await fetch(`${cfg.baseUrl}/oauth/access_token`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(body)
	});
	if (!res.ok) {
		throw new Error(`Concept2 token request failed (${res.status}): ${await res.text()}`);
	}
	const json = (await res.json()) as TokenResponse;
	return {
		accessToken: json.access_token,
		refreshToken: json.refresh_token,
		expiresAt: Date.now() + json.expires_in * 1000,
		scope: json.scope
	};
}

export function exchangeCode(cfg: Concept2Config, code: string): Promise<OAuthTokens> {
	return tokenRequest(cfg, {
		grant_type: 'authorization_code',
		client_id: cfg.clientId,
		client_secret: cfg.clientSecret,
		code,
		redirect_uri: redirectUri(cfg),
		scope: OAUTH_SCOPE
	});
}

export function refreshTokens(cfg: Concept2Config, refreshToken: string): Promise<OAuthTokens> {
	return tokenRequest(cfg, {
		grant_type: 'refresh_token',
		client_id: cfg.clientId,
		client_secret: cfg.clientSecret,
		refresh_token: refreshToken,
		scope: OAUTH_SCOPE
	});
}

interface MeResponse {
	data: { id: number; username: string; first_name?: string };
}

export async function fetchMe(cfg: Concept2Config, accessToken: string): Promise<SessionUser> {
	const res = await fetch(`${cfg.baseUrl}/api/users/me`, {
		headers: authHeader(accessToken)
	});
	if (!res.ok) throw new Error(`fetchMe failed (${res.status})`);
	const json = (await res.json()) as MeResponse;
	return { id: json.data.id, username: json.data.username, firstName: json.data.first_name };
}

function authHeader(token: string) {
	return { authorization: `Bearer ${token}`, accept: 'application/json' };
}

/**
 * Client bound to a session. Transparently refreshes the access token (and
 * persists it back to KV) when it is within 60s of expiry.
 */
export class Concept2Client {
	constructor(
		private cfg: Concept2Config,
		private kv: KVNamespace,
		private sessionId: string,
		private session: SessionData
	) {}

	private async accessToken(): Promise<string> {
		const { tokens } = this.session;
		if (Date.now() < tokens.expiresAt - 60_000) return tokens.accessToken;
		const fresh = await refreshTokens(this.cfg, tokens.refreshToken);
		this.session = { ...this.session, tokens: fresh };
		await writeSession(this.kv, this.sessionId, this.session);
		return fresh.accessToken;
	}

	private async api<T>(path: string): Promise<T> {
		const token = await this.accessToken();
		const res = await fetch(`${this.cfg.baseUrl}/api${path}`, { headers: authHeader(token) });
		if (!res.ok) throw new Error(`Concept2 API ${path} failed (${res.status})`);
		return (await res.json()) as T;
	}

	async listWorkouts(page = 1, number = 50): Promise<Workout[]> {
		const json = await this.api<{ data: RawResult[] }>(
			`/users/me/results?page=${page}&number=${number}`
		);
		return json.data.map(mapResult);
	}

	async getWorkout(id: number): Promise<WorkoutDetail> {
		const detail = await this.api<{ data: RawResult }>(`/users/me/results/${id}`);
		const base = mapResult(detail.data);
		let strokes: Stroke[] = [];
		if (base.hasStrokeData) {
			try {
				const s = await this.api<{ data: RawStroke[] }>(`/users/me/results/${id}/strokes`);
				strokes = mapStrokes(s.data, base.sport);
			} catch {
				strokes = [];
			}
		}
		const splits = mapSplits(detail.data);
		if (strokes.length === 0) strokes = synthStrokes(base, splits);
		return { ...base, strokes, splits };
	}
}

// ---- Raw API shapes (loosely typed; the logbook is permissive) ----

interface RawResult {
	id: number;
	date: string;
	type?: string;
	distance: number;
	time: number; // tenths of a second
	stroke_rate?: number;
	stroke_count?: number;
	drag_factor?: number;
	calories_total?: number;
	workout_type?: string;
	comments?: string;
	stroke_data?: boolean;
	heart_rate?: number | { average?: number; min?: number; max?: number };
	workout?: { splits?: RawSplit[]; intervals?: RawSplit[] };
}

interface RawSplit {
	distance?: number;
	time?: number; // tenths
	stroke_rate?: number;
	heart_rate?: number | { average?: number };
}

interface RawStroke {
	t: number; // tenths of a second
	d: number; // tenths of a metre
	p: number; // pace per 500m, tenths of a second
	spm: number;
	hr?: number;
}

function avgHr(hr: RawResult['heart_rate']): number | undefined {
	if (hr == null) return undefined;
	if (typeof hr === 'number') return hr;
	return hr.average;
}

export function mapResult(r: RawResult): Workout {
	const time = r.time / 10;
	const pace = r.distance > 0 ? time / (r.distance / 500) : 0;
	return {
		id: r.id,
		date: r.date,
		sport: toSport(r.type),
		distance: r.distance,
		time,
		pace,
		strokeRate: r.stroke_rate,
		strokeCount: r.stroke_count,
		heartRateAvg: avgHr(r.heart_rate),
		caloriesTotal: r.calories_total,
		dragFactor: r.drag_factor,
		workoutType: r.workout_type,
		comments: r.comments,
		hasStrokeData: !!r.stroke_data
	};
}

function mapStrokes(raw: RawStroke[], sport: Sport): Stroke[] {
	// Per the API: stroke `p` is pace-per-500m for rower/skierg but
	// pace-per-1000m for the bike. Normalise everything to sec/500m so the
	// rest of the app (display + watts) is unit-consistent.
	const paceDiv = sport === 'bike' ? 2 : 1;

	// Per the API: for interval workouts, t and d restart at 0 each interval.
	// Detect a reset (the counter going backwards) and carry a running offset
	// so the replay timeline stays monotonic across intervals.
	let tOffset = 0;
	let dOffset = 0;
	let prevT = 0;
	let prevD = 0;

	return raw.map((s) => {
		const rawT = s.t / 10; // tenths of a second -> s
		const rawD = s.d / 10; // decimetres -> m
		if (rawT < prevT) tOffset += prevT;
		if (rawD < prevD) dOffset += prevD;
		prevT = rawT;
		prevD = rawD;

		const pace = s.p / 10 / paceDiv; // -> sec / 500m
		return {
			t: rawT + tOffset,
			d: rawD + dOffset,
			pace,
			spm: s.spm,
			hr: s.hr ? s.hr : undefined,
			watts: paceToWatts(pace)
		};
	});
}

function mapSplits(r: RawResult): Split[] {
	const raw = r.workout?.splits ?? r.workout?.intervals ?? [];
	let cumD = 0;
	return raw.map((s, i) => {
		const time = (s.time ?? 0) / 10;
		const distance = s.distance ?? 0;
		cumD += distance;
		const pace = distance > 0 ? time / (distance / 500) : 0;
		return {
			index: i,
			distance,
			time,
			pace,
			spm: s.stroke_rate,
			hr: typeof s.heart_rate === 'number' ? s.heart_rate : s.heart_rate?.average
		};
	});
}

/**
 * When per-stroke data is unavailable, synthesise a smooth timeline from splits
 * (or the overall summary) so the replay still works — just lower resolution.
 */
function synthStrokes(w: Workout, splits: Split[]): Stroke[] {
	const out: Stroke[] = [];
	if (splits.length > 0) {
		let t = 0;
		let d = 0;
		out.push({ t: 0, d: 0, pace: splits[0].pace, spm: splits[0].spm ?? 0, hr: splits[0].hr, watts: paceToWatts(splits[0].pace) });
		for (const s of splits) {
			t += s.time;
			d += s.distance;
			out.push({ t, d, pace: s.pace, spm: s.spm ?? 0, hr: s.hr, watts: paceToWatts(s.pace) });
		}
		return out;
	}
	// Single segment from the summary.
	const steps = 60;
	for (let i = 0; i <= steps; i++) {
		const f = i / steps;
		out.push({
			t: w.time * f,
			d: w.distance * f,
			pace: w.pace,
			spm: w.strokeRate ?? 0,
			hr: w.heartRateAvg,
			watts: paceToWatts(w.pace)
		});
	}
	return out;
}
