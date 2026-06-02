import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveHomeTimezone } from '$lib/server/data';
import { TIMEZONE_VALUES } from '$lib/timezoneOptions';

export const PUT: RequestHandler = async (event) => {
	if (event.locals.demo) {
		return json({ ok: true, demo: true }, { headers: { 'cache-control': 'private, no-store' } });
	}
	if (!event.locals.user) throw error(401, 'Not authenticated.');

	const body = (await event.request.json()) as { timezone?: string | null };
	const raw = body.timezone;
	if (raw != null && raw !== '' && !TIMEZONE_VALUES.has(raw)) {
		throw error(400, 'Invalid timezone.');
	}
	const tz = raw?.trim() || undefined;
	await saveHomeTimezone(event, tz);
	return json({ ok: true, timezone: tz ?? null }, { headers: { 'cache-control': 'private, no-store' } });
};
