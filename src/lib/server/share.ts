import type { KVNamespace } from '@cloudflare/workers-types';
import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { WorkoutDetail } from '../types';
import { mockWorkoutDetail } from '../mockData';
import { getConfig } from './config';
import { loadWorkoutDetail } from './data';
import {
	getCachedDetailByShareToken,
	getShareToken,
	putCachedDetail,
	setShareToken
} from './db';

const KV_PREFIX = 'share:';

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
		const kv = event.platform?.env?.SESSIONS;
		// Re-use token if we already shared this workout in demo (scan not needed —
		// generate fresh each time is fine, but stable link is nicer for UX).
		const token = generateShareToken();
		await writeDemoShare(kv, token, workoutId);
		return { token, path: sharePath(token), url: shareUrl(event, token), created: true };
	}

	const userId = event.locals.user!.id;
	const db = event.platform?.env?.DB;
	if (!db) throw error(500, 'Database is not configured.');

	const existing = await getShareToken(db, userId, workoutId);
	if (existing) {
		return {
			token: existing,
			path: sharePath(existing),
			url: shareUrl(event, existing),
			created: false
		};
	}

	const detail = await loadWorkoutDetail(event, workoutId);
	await putCachedDetail(db, userId, detail);

	const token = generateShareToken();
	const ok = await setShareToken(db, userId, workoutId, token);
	if (!ok) throw error(500, 'Could not enable sharing for this workout.');

	return { token, path: sharePath(token), url: shareUrl(event, token), created: true };
}

/** Load a workout that was explicitly shared — no session required. */
export async function loadSharedWorkout(
	event: RequestEvent,
	token: string
): Promise<WorkoutDetail> {
	if (!/^[a-f0-9]{48}$/.test(token)) throw error(404, 'Share link not found.');

	const db = event.platform?.env?.DB;
	const fromDb = await getCachedDetailByShareToken(db, token);
	if (fromDb) return fromDb;

	const fromKv = await readDemoShare(event.platform?.env?.SESSIONS, token);
	if (fromKv) return fromKv;

	throw error(404, 'Share link not found or sharing was revoked.');
}

/** Build Open Graph fields for a shared replay (no PII). */
export function shareMeta(detail: WorkoutDetail, url: string) {
	const title = `${detail.workoutType || detail.sport} · rowplay replay`;
	const distKm = (detail.distance / 1000).toFixed(detail.distance >= 10000 ? 1 : 2);
	const mins = Math.floor(detail.time / 60);
	const secs = Math.round(detail.time % 60);
	const paceMin = Math.floor(detail.pace / 60);
	const paceSec = Math.round(detail.pace % 60);
	const description = `${distKm} km in ${mins}:${secs.toString().padStart(2, '0')} · ${paceMin}:${paceSec.toString().padStart(2, '0')}/500m`;
	return { title, description, url };
}
