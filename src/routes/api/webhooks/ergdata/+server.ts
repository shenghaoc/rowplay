import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * ErgData webhook stub — validates signature when ERGDATA_WEBHOOK_SECRET is set.
 * Full integration deferred until ErgData publishes a stable webhook API.
 */
export const POST: RequestHandler = async (event) => {
	const secret = event.platform?.env?.ERGDATA_WEBHOOK_SECRET;
	if (!secret) {
		throw error(501, 'ErgData webhooks are not configured on this deployment.');
	}

	const sig = event.request.headers.get('x-ergdata-signature');
	const body = await event.request.text();
	if (!sig || !(await validHmac(secret, body, sig))) {
		throw error(401, 'Invalid webhook signature.');
	}

	let payload: { workoutId?: number };
	try {
		payload = JSON.parse(body) as { workoutId?: number };
	} catch {
		throw error(400, 'Invalid JSON body.');
	}

	if (payload.workoutId == null) {
		throw error(400, 'Missing workoutId.');
	}

	// Future: fetch workout detail via Concept2 API and upsert into D1.
	return json({ ok: true, queued: payload.workoutId });
};

async function validHmac(secret: string, body: string, provided: string): Promise<boolean> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
	const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
	return timingSafeEqual(hex, provided.replace(/^sha256=/, ''));
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let out = 0;
	for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return out === 0;
}
