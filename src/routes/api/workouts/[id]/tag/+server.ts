import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isValidWorkoutTag, type WorkoutTag } from '$lib/workoutTag';
import { saveWorkoutTag } from '$lib/server/data';

export const PATCH: RequestHandler = async (event) => {
	const workoutId = Number(event.params.id);
	if (!Number.isInteger(workoutId) || workoutId <= 0) throw error(400, 'Invalid workout id.');

	let raw: unknown;
	try {
		raw = await event.request.json();
	} catch {
		throw error(400, 'Invalid JSON body.');
	}
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		throw error(400, 'Request body must be a JSON object.');
	}
	const body = raw as { tag?: unknown };
	if (body.tag !== null && body.tag !== undefined &&
			(typeof body.tag !== 'string' || !isValidWorkoutTag(body.tag))) {
		throw error(400, 'Invalid workout tag.');
	}
	const tag = (body.tag === null || body.tag === undefined ? null : body.tag) as WorkoutTag | null;

	const saved = await saveWorkoutTag(event, workoutId, tag);
	return json({ tag: saved }, { headers: { 'cache-control': 'private, no-store' } });
};
