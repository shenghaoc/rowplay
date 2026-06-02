import type { KVNamespace } from '@cloudflare/workers-types';
import { nowEpochMillis } from '$lib/datetime';
import { paceToWattsForSport } from '../format';
import {
	toSport,
	type HeartRateDetail,
	type LoggingMetadata,
	type Sport,
	type Split,
	type SplitIntervalType,
	type Stroke,
	type Workout,
	type WorkoutDetail,
	type WorkoutTargets
} from '../types';
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
		// Don't include the response body — it can echo client_id/secret hints.
		throw new Error(`Concept2 token request failed (${res.status})`);
	}
	const json = (await res.json()) as TokenResponse;
	return {
		accessToken: json.access_token,
		refreshToken: json.refresh_token,
		expiresAt: nowEpochMillis() + json.expires_in * 1000,
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

/** Explicitly pin the API version, as the Concept2 docs recommend. */
const ACCEPT = 'application/vnd.c2logbook.v1+json';

function authHeader(token: string) {
	return { authorization: `Bearer ${token}`, accept: ACCEPT };
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
		// Personal (BYOT) tokens are long-lived and not refreshable — use directly.
		if (this.session.personal) return tokens.accessToken;
		if (nowEpochMillis() < tokens.expiresAt - 60_000) return tokens.accessToken;
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
		return json.data.map((r) => mapResult(r));
	}

	/**
	 * One page of results with pagination metadata, optionally filtered to
	 * workouts on/after `from` ("YYYY-MM-DD"). Used by the D1 sync to page
	 * through the full history (250 = the API max per page).
	 */
	async listWorkoutsPage(
		page: number,
		from?: string,
		to?: string,
		number = 250
	): Promise<{ workouts: Workout[]; totalPages: number }> {
		const qs = new URLSearchParams({ page: String(page), number: String(number) });
		if (from) qs.set('from', from);
		if (to) qs.set('to', to);
		const json = await this.api<{
			data: RawResult[];
			meta?: { pagination?: { total_pages?: number } };
		}>(`/users/me/results?${qs}`);
		return {
			workouts: json.data.map((r) => mapResult(r)),
			totalPages: json.meta?.pagination?.total_pages ?? 1
		};
	}

	async getWorkout(id: number): Promise<WorkoutDetail> {
		const detail = await this.api<{ data: RawResult; metadata?: RawMetadata }>(
			`/users/me/results/${id}?include=metadata`
		);
		const base = mapResult(detail.data, detail.metadata ?? detail.data.metadata);
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
		// `intervals` in the API means work reps with rest between them.
		const isInterval = !!detail.data.workout?.intervals?.length;
		if (strokes.length === 0) strokes = synthStrokes(base, splits);
		return { ...base, strokes, splits, isInterval };
	}
}

// ---- Raw API shapes (loosely typed; the logbook is permissive) ----

interface RawHeartRate {
	average?: number;
	min?: number;
	max?: number;
	ending?: number;
	rest?: number;
	recovery?: number;
}

interface RawTargets {
	stroke_rate?: number;
	heart_rate_zone?: number;
	pace?: number;
	watts?: number;
	calories?: number;
}

interface RawMetadata {
	pm_version?: number;
	firmware_version?: string;
	serial_number?: string;
	device?: string;
	device_os?: string;
	device_os_version?: string;
	erg_model_type?: number;
	hr_type?: string;
	other?: string;
}

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
	wattminutes_total?: number;
	workout_type?: string;
	comments?: string;
	stroke_data?: boolean;
	timezone?: string;
	weight_class?: 'H' | 'L';
	privacy?: string;
	/** How the workout was logged: Web, ErgData, EXR, etc. */
	source?: string;
	verified?: boolean;
	rest_time?: number;
	rest_distance?: number;
	heart_rate?: number | RawHeartRate;
	metadata?: RawMetadata;
	workout?: {
		splits?: RawSplit[];
		intervals?: RawSplit[];
		targets?: RawTargets;
	};
}

interface RawSplit {
	distance?: number;
	time?: number; // tenths
	stroke_rate?: number;
	calories_total?: number;
	wattminutes_total?: number;
	heart_rate?: number | RawHeartRate;
	type?: string;
	rest_time?: number;
	rest_distance?: number;
	machine?: string;
}

interface RawStroke {
	t: number; // tenths of a second
	d: number; // tenths of a metre
	p: number; // pace per 500m, tenths of a second
	spm: number;
	hr?: number;
}

export function mapHeartRate(hr: number | RawHeartRate | undefined): HeartRateDetail | undefined {
	if (hr == null) return undefined;
	if (typeof hr === 'number') return { average: hr };
	const out: HeartRateDetail = {};
	if (hr.average != null) out.average = hr.average;
	if (hr.min != null) out.min = hr.min;
	if (hr.max != null) out.max = hr.max;
	if (hr.ending != null) out.ending = hr.ending;
	if (hr.rest != null) out.rest = hr.rest;
	if (hr.recovery != null) out.recovery = hr.recovery;
	return Object.keys(out).length ? out : undefined;
}

export function mapTargets(raw: RawTargets | undefined, sport: Sport): WorkoutTargets | undefined {
	if (!raw) return undefined;
	const paceDiv = sport === 'bike' ? 2 : 1;
	const out: WorkoutTargets = {};
	if (raw.stroke_rate != null) out.strokeRate = raw.stroke_rate;
	if (raw.heart_rate_zone != null) out.heartRateZone = raw.heart_rate_zone;
	if (raw.pace != null) out.pace = raw.pace / 10 / paceDiv;
	if (raw.watts != null) out.watts = raw.watts;
	if (raw.calories != null) out.calories = raw.calories;
	return Object.keys(out).length ? out : undefined;
}

export function mapMetadata(raw: RawMetadata | undefined): LoggingMetadata | undefined {
	if (!raw) return undefined;
	const out: LoggingMetadata = {};
	if (raw.pm_version != null) out.pmVersion = raw.pm_version;
	if (raw.firmware_version != null) out.firmwareVersion = raw.firmware_version;
	if (raw.serial_number != null) out.serialNumber = raw.serial_number;
	if (raw.device != null) out.device = raw.device;
	if (raw.device_os != null) out.deviceOs = raw.device_os;
	if (raw.device_os_version != null) out.deviceOsVersion = raw.device_os_version;
	if (raw.erg_model_type != null) out.ergModelType = raw.erg_model_type;
	if (raw.hr_type != null) out.hrType = raw.hr_type;
	return Object.keys(out).length ? out : undefined;
}

function mapSplitType(raw: string | undefined): SplitIntervalType | undefined {
	switch (raw) {
		case 'time':
		case 'distance':
		case 'calorie':
		case 'wattminute':
			return raw;
		default:
			return undefined;
	}
}

export function mapResult(r: RawResult, metadata?: RawMetadata): Workout {
	const sport = toSport(r.type);
	const time = r.time / 10;
	const pace = r.distance > 0 ? time / (r.distance / 500) : 0;
	const heartRate = mapHeartRate(r.heart_rate);
	return {
		id: r.id,
		date: r.date,
		sport,
		distance: r.distance,
		time,
		pace,
		strokeRate: r.stroke_rate,
		strokeCount: r.stroke_count,
		heartRate,
		heartRateAvg: heartRate?.average,
		hrMin: heartRate?.min,
		hrMax: heartRate?.max,
		caloriesTotal: r.calories_total,
		wattMinutes: r.wattminutes_total,
		dragFactor: r.drag_factor,
		workoutType: r.workout_type,
		comments: r.comments,
		timezone: r.timezone,
		weightClass: r.weight_class,
		privacy: r.privacy,
		source: r.source,
		verified: r.verified,
		restTime: r.rest_time != null ? r.rest_time / 10 : undefined,
		restDistance: r.rest_distance,
		targets: mapTargets(r.workout?.targets, sport),
		metadata: mapMetadata(metadata ?? r.metadata),
		hasStrokeData: !!r.stroke_data
	};
}

export function mapStrokes(raw: RawStroke[], sport: Sport): Stroke[] {
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
			rawT,
			rawD,
			pace,
			spm: s.spm,
			hr: s.hr ? s.hr : undefined,
			watts: paceToWattsForSport(sport, pace)
		};
	});
}

export function mapSplits(r: RawResult): Split[] {
	const raw = r.workout?.splits ?? r.workout?.intervals ?? [];
	return raw.map((s, i) => {
		const time = (s.time ?? 0) / 10;
		const distance = s.distance ?? 0;
		const pace = distance > 0 ? time / (distance / 500) : 0;
		const heartRate = mapHeartRate(s.heart_rate);
		const isRest = distance === 0 && time > 0;
		return {
			index: i,
			distance,
			time,
			pace,
			spm: s.stroke_rate,
			hr: heartRate?.average,
			heartRate,
			caloriesTotal: s.calories_total,
			wattMinutes: s.wattminutes_total,
			type: mapSplitType(s.type),
			restTime: s.rest_time != null ? s.rest_time / 10 : undefined,
			restDistance: s.rest_distance,
			machine: s.machine ? toSport(s.machine) : undefined,
			isRest
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
		out.push({
			t: 0,
			d: 0,
			pace: splits[0].pace,
			spm: splits[0].spm ?? 0,
			hr: splits[0].hr,
			watts: paceToWattsForSport(w.sport, splits[0].pace)
		});
		for (const s of splits) {
			t += s.time;
			d += s.distance;
			out.push({ t, d, pace: s.pace, spm: s.spm ?? 0, hr: s.hr, watts: paceToWattsForSport(w.sport, s.pace) });
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
			watts: paceToWattsForSport(w.sport, w.pace)
		});
	}
	return out;
}
