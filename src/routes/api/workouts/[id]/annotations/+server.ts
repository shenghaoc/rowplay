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

	const body = (await event.request.json()) as {
		id?: number;
		timestamp?: number;
		text?: string;
	};

	if (typeof body.timestamp !== 'number' || body.timestamp < 0) {
		throw error(400, 'Invalid timestamp.');
	}
	if (typeof body.text !== 'string' || !body.text.trim()) {
		throw error(400, 'Annotation text is required.');
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
