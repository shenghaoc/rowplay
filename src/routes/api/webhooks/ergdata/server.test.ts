import { describe, expect, it } from 'vitest';
import { POST } from './+server';

async function makeHmacSig(secret: string, body: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
	const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
	return `sha256=${hex}`;
}

function fakeEvent(opts: {
	secret?: string;
	sig?: string | null;
	body?: string;
}) {
	const body = opts.body ?? '{"workoutId":42}';
	return {
		platform: { env: opts.secret ? { ERGDATA_WEBHOOK_SECRET: opts.secret } : {} },
		request: {
			headers: { get: (name: string) => name.toLowerCase() === 'x-ergdata-signature' ? (opts.sig ?? null) : null },
			text: async () => body
		}
	};
}

describe('POST /api/webhooks/ergdata', () => {
	it('throws 501 when no secret is configured', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakeEvent({}) as any)).rejects.toMatchObject({ status: 501 });
	});

	it('throws 401 when signature is missing', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakeEvent({ secret: 'mysecret', sig: null }) as any)).rejects.toMatchObject({ status: 401 });
	});

	it('throws 401 when signature is invalid', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakeEvent({ secret: 'mysecret', sig: 'sha256=' + '0'.repeat(64) }) as any)).rejects.toMatchObject({ status: 401 });
	});

	it('throws 401 for wrong-length signature hex', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakeEvent({ secret: 'mysecret', sig: 'sha256=tooshort' }) as any)).rejects.toMatchObject({ status: 401 });
	});

	it('throws 400 when JSON is invalid', async () => {
		const secret = 'mysecret';
		const body = 'not-json';
		const sig = await makeHmacSig(secret, body);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakeEvent({ secret, sig, body }) as any)).rejects.toMatchObject({ status: 400 });
	});

	it('throws 400 when workoutId is missing', async () => {
		const secret = 'mysecret';
		const body = '{}';
		const sig = await makeHmacSig(secret, body);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakeEvent({ secret, sig, body }) as any)).rejects.toMatchObject({ status: 400 });
	});

	it('returns ok with workoutId for valid request', async () => {
		const secret = 'mysecret';
		const body = '{"workoutId":42}';
		const sig = await makeHmacSig(secret, body);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await POST(fakeEvent({ secret, sig, body }) as any);
		const json = await res.json();
		expect(json.ok).toBe(true);
		expect(json.queued).toBe(42);
	});
});
