import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/data', () => ({
	loadAnnotations: vi.fn().mockResolvedValue([]),
	saveAnnotation: vi.fn().mockResolvedValue({ id: 1, timestamp: 0, text: 'note' }),
	removeAnnotation: vi.fn().mockResolvedValue(undefined)
}));

import { DELETE, GET, POST } from './+server';

function fakeGetEvent(id: string, annotationId?: string) {
	const url = annotationId
		? `http://localhost/api/workouts/${id}/annotations?annotationId=${annotationId}`
		: `http://localhost/api/workouts/${id}/annotations`;
	return {
		params: { id },
		url: new URL(url),
		locals: { demo: true },
		platform: { env: { DB: {}, SESSIONS: {} } }
	};
}

function fakePostEvent(id: string, body: unknown) {
	return {
		params: { id },
		url: new URL(`http://localhost/api/workouts/${id}/annotations`),
		locals: { demo: true },
		request: { json: async () => body },
		platform: { env: { DB: {}, SESSIONS: {} } }
	};
}

describe('GET /api/workouts/[id]/annotations', () => {
	it('throws 400 for non-numeric id', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(GET(fakeGetEvent('abc') as any)).rejects.toMatchObject({ status: 400 });
	});

	it('returns annotations for valid id', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await GET(fakeGetEvent('1001') as any);
		const body = await res.json();
		expect(Array.isArray(body.annotations)).toBe(true);
	});
});

describe('POST /api/workouts/[id]/annotations', () => {
	it('throws 400 for non-numeric id', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakePostEvent('abc', { timestamp: 0, text: 'hi' }) as any)).rejects.toMatchObject({ status: 400 });
	});

	it('throws 400 when timestamp is missing', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakePostEvent('1001', { text: 'hi' }) as any)).rejects.toMatchObject({ status: 400 });
	});

	it('throws 400 when timestamp is negative', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakePostEvent('1001', { timestamp: -1, text: 'hi' }) as any)).rejects.toMatchObject({ status: 400 });
	});

	it('throws 400 when text is empty', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakePostEvent('1001', { timestamp: 0, text: '   ' }) as any)).rejects.toMatchObject({ status: 400 });
	});

	it('throws 400 when text exceeds 1000 chars', async () => {
		const longText = 'x'.repeat(1001);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakePostEvent('1001', { timestamp: 0, text: longText }) as any)).rejects.toMatchObject({ status: 400 });
	});

	it('throws 400 when annotation id is non-integer', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakePostEvent('1001', { id: 1.5, timestamp: 0, text: 'hi' }) as any)).rejects.toMatchObject({ status: 400 });
	});

	it('saves annotation and returns it on success', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await POST(fakePostEvent('1001', { timestamp: 30, text: 'Good split' }) as any);
		const body = await res.json();
		expect(body.annotation).toBeDefined();
	});

	it('throws 400 when body is array', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(POST(fakePostEvent('1001', []) as any)).rejects.toMatchObject({ status: 400 });
	});
});

describe('DELETE /api/workouts/[id]/annotations', () => {
	it('throws 400 for non-numeric workout id', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(DELETE(fakeGetEvent('abc', '1') as any)).rejects.toMatchObject({ status: 400 });
	});

	it('throws 400 when annotationId is missing', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(DELETE(fakeGetEvent('1001') as any)).rejects.toMatchObject({ status: 400 });
	});

	it('throws 400 when annotationId is zero', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(DELETE(fakeGetEvent('1001', '0') as any)).rejects.toMatchObject({ status: 400 });
	});

	it('returns ok:true on success', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await DELETE(fakeGetEvent('1001', '5') as any);
		const body = await res.json();
		expect(body.ok).toBe(true);
	});
});
