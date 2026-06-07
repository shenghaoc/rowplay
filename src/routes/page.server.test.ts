import { describe, expect, it } from 'vitest';
import { load } from './+page.server';

function fakeEvent(opts: { demo: boolean; user?: { id: number } | null }) {
	return {
		locals: {
			demo: opts.demo,
			user: opts.user ?? null
		}
	};
}

describe('load /', () => {
	it('enables the first-run tour for unauthenticated demo mode', async () => {
		const data = (await load(fakeEvent({ demo: true }) as never)) as { firstRunEligible: boolean };

		expect(data.firstRunEligible).toBe(true);
	});

	it('does not enable the first-run tour for authenticated users', async () => {
		const data = (await load(fakeEvent({ demo: true, user: { id: 7 } }) as never)) as { firstRunEligible: boolean };

		expect(data.firstRunEligible).toBe(false);
	});

	it('does not enable the first-run tour outside demo mode', async () => {
		const data = (await load(fakeEvent({ demo: false }) as never)) as { firstRunEligible: boolean };

		expect(data.firstRunEligible).toBe(false);
	});
});
