import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadWorkoutDetail } from '$lib/server/data';
import { workoutDetailToTcx, workoutExportFilename } from '$lib/server/export';

export const GET: RequestHandler = async (event) => {
	const id = Number(event.params.id);
	if (!Number.isFinite(id) || id <= 0 || !Number.isInteger(id)) throw error(400, 'Invalid workout id.');
	const format = new URL(event.request.url).searchParams.get('format') ?? 'tcx';
	if (format !== 'tcx') throw error(400, 'Unsupported format. Use tcx.');

	const detail = await loadWorkoutDetail(event, id);
	const body = workoutDetailToTcx(detail);
	return new Response(body, {
		headers: {
			'content-type': 'application/vnd.garmin.tcx+xml; charset=utf-8',
			'content-disposition': `attachment; filename="${workoutExportFilename(id, 'tcx')}"`,
			'cache-control': 'private, no-store'
		}
	});
};
