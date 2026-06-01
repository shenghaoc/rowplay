import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadAnnotations, removeAnnotation, saveAnnotation } from '$lib/server/data';

/** List annotations for a workout. */
export const GET: RequestHandler = async (event) => {
	const workoutId = Number(event.params.id);
	if (!Number.isFinite(workoutId)) throw error(400, 'Invalid workout id.');
	const annotations = await loadAnnotations(event, workoutId);
	return json({ annotations }, { headers: { 'cache-control': 'private, no-store' } });
};

/** Add or update an annotation. */
export const POST: RequestHandler = async (event) => {
	const workoutId = Number(event.params.id);
	if (!Number.isFinite(workoutId)) throw error(400, 'Invalid workout id.');

	let raw: unknown;
	try {
		raw = await event.request.json();
	} catch {
		throw error(400, 'Invalid JSON body.');
	}
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		throw error(400, 'Request body must be a JSON object.');
	}
	const body = raw as { id?: unknown; timestamp?: unknown; text?: unknown };

	if (body.id !== undefined && (typeof body.id !== 'number' || !Number.isInteger(body.id) || body.id < 0)) {
		throw error(400, 'Invalid annotation id.');
	}
	if (typeof body.timestamp !== 'number' || !Number.isFinite(body.timestamp) || body.timestamp < 0) {
		throw error(400, 'Invalid timestamp.');
	}
	if (typeof body.text !== 'string' || !body.text.trim()) {
		throw error(400, 'Annotation text is required.');
	}
	if (body.text.trim().length > 1000) {
		throw error(400, 'Annotation text must be 1000 characters or fewer.');
	}

	const annotation = await saveAnnotation(event, workoutId, {
		id: typeof body.id === 'number' ? body.id : 0,
		timestamp: body.timestamp,
		text: body.text.trim()
	});
	return json({ annotation }, { headers: { 'cache-control': 'private, no-store' } });
};

/** Delete an annotation. */
export const DELETE: RequestHandler = async (event) => {
	const workoutId = Number(event.params.id);
	if (!Number.isFinite(workoutId)) throw error(400, 'Invalid workout id.');

	const annotationIdStr = event.url.searchParams.get('annotationId');
	const annotationId = annotationIdStr ? Number(annotationIdStr) : NaN;
	if (!Number.isFinite(annotationId) || annotationId <= 0) {
		throw error(400, 'Invalid annotation id.');
	}

	await removeAnnotation(event, workoutId, annotationId);
	return json({ ok: true }, { headers: { 'cache-control': 'private, no-store' } });
};
