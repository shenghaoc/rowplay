import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { AnnualGoalKind } from '$lib/analytics';
import { loadAnnualGoal, saveAnnualGoal } from '$lib/server/data';

export const GET: RequestHandler = async (event) => {
	const year = parseYear(event.url.searchParams.get('year'));
	const goal = await loadAnnualGoal(event, year);
	return json({ goal }, { headers: { 'cache-control': 'private, no-store' } });
};

export const PUT: RequestHandler = async (event) => {
	const body = (await event.request.json()) as {
		year?: number;
		kind?: AnnualGoalKind;
		target?: number;
	};
	const year = typeof body.year === 'number' ? body.year : new Date().getUTCFullYear();
	if (body.kind !== 'meters' && body.kind !== 'hours') throw error(400, 'Invalid goal kind.');
	if (typeof body.target !== 'number' || body.target <= 0) throw error(400, 'Invalid target.');
	const goal = { year, kind: body.kind, target: body.target };
	await saveAnnualGoal(event, goal);
	return json({ goal }, { headers: { 'cache-control': 'private, no-store' } });
};

function parseYear(raw: string | null): number {
	if (raw == null) return new Date().getUTCFullYear();
	const y = parseInt(raw, 10);
	return Number.isFinite(y) ? y : new Date().getUTCFullYear();
}
