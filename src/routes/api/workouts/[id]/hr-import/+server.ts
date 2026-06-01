import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { HrSample } from '$lib/hrImport';
import { validateHrSamples } from '$lib/hrImport';
import { clearHrImport, saveHrImport } from '$lib/server/hrImport';

function parseBody(body: unknown): { samples: HrSample[]; offset: number } {
	if (!body || typeof body !== 'object') throw error(400, 'Invalid body.');
	const { samples, offset } = body as { samples?: unknown; offset?: unknown };
	const MAX_SAMPLES = 20_000;
	if (!Array.isArray(samples) || samples.length > MAX_SAMPLES) throw error(400, 'Missing samples.');
	const parsed: HrSample[] = samples.map((s) => {
		if (!s || typeof s !== 'object') throw error(400, 'Invalid sample.');
		const { t, hr } = s as { t?: unknown; hr?: unknown };
		if (typeof t !== 'number' || typeof hr !== 'number' || !isFinite(t) || !isFinite(hr)) {
			throw error(400, 'Invalid sample.');
		}
		return { t, hr };
	});
	try {
		validateHrSamples(parsed);
	} catch {
		throw error(400, 'Too few heart-rate samples.');
	}
	const MAX_OFFSET = 600;
	const rawOffset = typeof offset === 'number' && isFinite(offset) ? offset : 0;
	const offsetSec = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, rawOffset));
	return { samples: parsed, offset: offsetSec };
}

export const POST: RequestHandler = async (event) => {
	const id = Number(event.params.id);
	if (!Number.isFinite(id)) throw error(400, 'Invalid workout id.');
	// Demo-mode + auth guards live in saveHrImport (the layer that needs a real DB).
	const { samples, offset } = parseBody(await event.request.json());
	const detail = await saveHrImport(event, id, samples, offset);
	return json(detail, { headers: { 'cache-control': 'private, no-store' } });
};

export const DELETE: RequestHandler = async (event) => {
	const id = Number(event.params.id);
	if (!Number.isFinite(id)) throw error(400, 'Invalid workout id.');
	// Demo-mode + auth guards live in clearHrImport (the layer that needs a real DB).
	const detail = await clearHrImport(event, id);
	return json(detail, { headers: { 'cache-control': 'private, no-store' } });
};
