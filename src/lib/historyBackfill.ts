import { invalidateAll } from '$app/navigation';
import { nextBackoffMs } from '$lib/liveMode';

const PACE_MS = 2_000;

export interface BackfillChunk {
	added: number;
	oldestDate: string | null;
	done: boolean;
}

/** POST one backfill chunk; throws with `.status` on HTTP errors. */
export async function fetchBackfillChunk(signal?: AbortSignal): Promise<BackfillChunk> {
	const res = await fetch('/api/sync/backfill', { method: 'POST', signal });
	if (!res.ok) {
		let message = `HTTP ${res.status}`;
		try {
			const body = (await res.json()) as { message?: string };
			if (body?.message) message = body.message;
		} catch {
			/* non-JSON */
		}
		const err = new Error(message) as Error & { status?: number };
		err.status = res.status;
		throw err;
	}
	return (await res.json()) as BackfillChunk;
}

/**
 * Drain backfill chunks until `done`, paced between requests and backing off on 429.
 * Returns when finished or aborted.
 */
export async function runHistoryBackfillLoop(opts?: {
	signal?: AbortSignal;
	onChunk?: (chunk: BackfillChunk) => void;
}): Promise<void> {
	let failures = 0;
	for (;;) {
		if (opts?.signal?.aborted) return;
		try {
			const chunk = await fetchBackfillChunk(opts?.signal);
			failures = 0;
			opts?.onChunk?.(chunk);
			if (chunk.done) {
				await invalidateAll();
				return;
			}
			await sleep(PACE_MS + nextBackoffMs(0), opts?.signal);
		} catch (e) {
			if (opts?.signal?.aborted) return;
			const code = (e as { status?: number }).status;
			if (code === 429) {
				failures++;
				await sleep(nextBackoffMs(failures), opts?.signal);
				continue;
			}
			throw e;
		}
	}
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new DOMException('Aborted', 'AbortError'));
			return;
		}
		const id = setTimeout(resolve, ms);
		signal?.addEventListener(
			'abort',
			() => {
				clearTimeout(id);
				reject(new DOMException('Aborted', 'AbortError'));
			},
			{ once: true }
		);
	});
}
