import type { KVNamespace } from '@cloudflare/workers-types';
import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { WorkoutDetail } from '../types';
import { mockWorkoutDetail } from '../mockData';
import { isPubliclyShareable } from '../privacy';
import { resolveDemoBoardShare } from '../mockLeaderboard';
import { getConfig } from './config';
import { loadWorkoutDetail } from './data';
import {
	getCachedDetail,
	getCachedDetailByShareToken,
	getShareToken,
	putCachedDetail,
	setShareToken
} from './db';

const KV_PREFIX = 'share:';

/** Fallback message for a blocked share; the UI localizes via `share.privacyBlocked`. */
const PRIVACY_BLOCKED =
	'This workout isn’t public on Concept2, so it can’t be shared. Set its privacy to “Everyone” in your logbook first.';

/** Shown when a previously-public link is opened after the workout went non-public. */
const SHARE_NO_LONGER_PUBLIC = 'This workout is no longer shared publicly.';

/** 48 hex chars — unguessable capability URL segment. */
export function generateShareToken(): string {
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function sharePath(token: string): string {
	return `/r/${token}`;
}

function shareUrl(event: RequestEvent, token: string): string {
	const origin = getConfig(event).appUrl.replace(/\/$/, '');
	return `${origin}${sharePath(token)}`;
}

interface DemoShareRef {
	demo: true;
	workoutId: number;
}

async function readDemoShare(
	kv: KVNamespace | undefined,
	token: string
): Promise<WorkoutDetail | null> {
	if (!kv) return null;
	const raw = await kv.get(`${KV_PREFIX}${token}`);
	if (!raw) return null;
	try {
		const ref = JSON.parse(raw) as DemoShareRef;
		if (!ref.demo || !ref.workoutId) return null;
		return mockWorkoutDetail(ref.workoutId);
	} catch {
		return null;
	}
}

async function writeDemoShare(
	kv: KVNamespace | undefined,
	token: string,
	workoutId: number
): Promise<void> {
	if (!kv) throw error(500, 'Share store is not configured.');
	const ref: DemoShareRef = { demo: true, workoutId };
	await kv.put(`${KV_PREFIX}${token}`, JSON.stringify(ref));
}

/**
 * Create (or return existing) public share link for a workout the caller owns.
 * Demo mode stores a KV pointer to mock detail; live mode sets share_token on D1.
 */
export async function createWorkoutShare(
	event: RequestEvent,
	workoutId: number
): Promise<{ token: string; path: string; url: string; created: boolean }> {
	if (!event.locals.demo && !event.locals.user) {
		throw error(401, 'Not authenticated.');
	}

	if (event.locals.demo) {
		const detail = mockWorkoutDetail(workoutId);
		if (!detail) throw error(404, 'Workout not found.');
		if (!isPubliclyShareable(detail.privacy)) throw error(403, PRIVACY_BLOCKED);
		const kv = event.platform?.env?.SESSIONS;
		if (!kv) throw error(500, 'Share store is not configured.');
		// Reuse a stable token per workout via a reverse index so repeated shares
		// don't flood KV with a fresh entry on every call (and the link is stable).
		const indexKey = `${KV_PREFIX}demo:${workoutId}`;
		const existing = await kv.get(indexKey);
		if (existing) {
			return { token: existing, path: sharePath(existing), url: shareUrl(event, existing), created: false };
		}
		const token = generateShareToken();
		await writeDemoShare(kv, token, workoutId);
		await kv.put(indexKey, token);
		return { token, path: sharePath(token), url: shareUrl(event, token), created: true };
	}

	const userId = event.locals.user!.id;
	const db = event.platform?.env?.DB;
	if (!db) throw error(500, 'Database is not configured.');

	// Load the workout up front so a non-public piece is blocked before any token
	// is minted or returned — even one shared earlier while it was still public.
	const detail = await loadWorkoutDetail(event, workoutId);
	if (!isPubliclyShareable(detail.privacy)) throw error(403, PRIVACY_BLOCKED);

	const existing = await getShareToken(db, userId, workoutId);
	if (existing) {
		return {
			token: existing,
			path: sharePath(existing),
			url: shareUrl(event, existing),
			created: false
		};
	}

	await putCachedDetail(db, userId, detail);
	// putCachedDetail swallows write errors, so confirm the payload actually
	// landed — otherwise the share URL would resolve to nothing and 404.
	const cached = await getCachedDetail(db, userId, workoutId, event.platform?.env);
	if (!cached) throw error(500, 'Could not cache workout before sharing.');

	const token = generateShareToken();
	const claimed = await setShareToken(db, userId, workoutId, token);
	if (claimed) {
		return { token, path: sharePath(token), url: shareUrl(event, token), created: true };
	}

	// A concurrent request set the token first; return whatever is now stored so
	// both callers hand out the same working link.
	const winner = await getShareToken(db, userId, workoutId);
	if (!winner) throw error(500, 'Could not enable sharing for this workout.');
	return { token: winner, path: sharePath(winner), url: shareUrl(event, winner), created: false };
}

/** Strip hardware-identifying provenance from a shared replay payload. */
export function redactForPublic(detail: WorkoutDetail): WorkoutDetail {
	if (!detail.metadata) return detail;
	const { serialNumber: _sn, device: _dev, deviceOs: _os, deviceOsVersion: _osv, ...safe } =
		detail.metadata;
	const metadata =
		safe.pmVersion != null ||
		safe.firmwareVersion != null ||
		safe.ergModelType != null ||
		safe.hrType != null
			? safe
			: undefined;
	return { ...detail, metadata };
}

/**
 * Serve a shared workout, re-checking privacy at redemption time so a link
 * minted while a piece was public stops resolving once the athlete makes it
 * non-public and the cache re-syncs — fail closed, like createWorkoutShare.
 */
function servePublic(detail: WorkoutDetail): WorkoutDetail {
	if (!isPubliclyShareable(detail.privacy)) throw error(403, SHARE_NO_LONGER_PUBLIC);
	return redactForPublic(detail);
}

/** Load a workout that was explicitly shared — no session required. */
export async function loadSharedWorkout(
	event: RequestEvent,
	token: string
): Promise<WorkoutDetail> {
	if (!/^[a-f0-9]{48}$/.test(token)) throw error(404, 'Share link not found.');

	const demoBoard = resolveDemoBoardShare(token);
	if (demoBoard) return demoBoard;

	const db = event.platform?.env?.DB;
	const fromDb = await getCachedDetailByShareToken(db, token);
	if (fromDb) return servePublic(fromDb);

	const fromKv = await readDemoShare(event.platform?.env?.SESSIONS, token);
	if (fromKv) return servePublic(fromKv);

	throw error(404, 'Share link not found or sharing was revoked.');
}

/** Build Open Graph fields for a shared replay (no PII). */
export function shareMeta(detail: WorkoutDetail, url: string) {
	const title = `${detail.workoutType || detail.sport} · rowplay replay`;
	const distKm = (detail.distance / 1000).toFixed(detail.distance >= 10000 ? 1 : 2);
	const totalSecs = Math.round(detail.time);
	const mins = Math.floor(totalSecs / 60);
	const secs = totalSecs % 60;
	const totalPaceSecs = Math.round(detail.pace);
	const paceMin = Math.floor(totalPaceSecs / 60);
	const paceSec = totalPaceSecs % 60;
	const description = `${distKm} km in ${mins}:${secs.toString().padStart(2, '0')} · ${paceMin}:${paceSec.toString().padStart(2, '0')}/500m`;
	const origin = new URL(url).origin;
	return { title, description, url, image: `${origin}/icon-512.png` };
}
