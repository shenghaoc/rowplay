import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./liveMode', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./liveMode')>();
	return {
		...actual,
		loadLivePrefs: vi.fn().mockReturnValue({ enabled: false, intervalSec: 60, soundEnabled: false, source: 'poll' }),
		saveLivePrefs: vi.fn()
	};
});

import { LiveMode } from './liveMode.svelte';
import { DEFAULT_LIVE_PREFS, loadLivePrefs, saveLivePrefs } from './liveMode';

const noopCallbacks = {
	onWorkouts: vi.fn(),
	onError: vi.fn(),
	onRecovered: vi.fn(),
	t: (key: string) => key
};

// Stub browser APIs that LiveMode uses
const origDocument = globalThis.document;

beforeEach(() => {
	vi.useFakeTimers();
	// Minimal document stub
	globalThis.document = {
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		visibilityState: 'visible'
	} as unknown as Document;
});

afterEach(() => {
	vi.useRealTimers();
	globalThis.document = origDocument;
	vi.clearAllMocks();
});

describe('LiveMode class — initial state', () => {
	it('reads initial prefs from loadLivePrefs', () => {
		(loadLivePrefs as ReturnType<typeof vi.fn>).mockReturnValue({
			enabled: true,
			intervalSec: 120,
			soundEnabled: true,
			source: 'poll'
		});
		const lm = new LiveMode(false, noopCallbacks);
		expect(lm.enabled).toBe(true);
		expect(lm.intervalSec).toBe(120);
		expect(lm.soundEnabled).toBe(true);
	});

	it('starts disabled by default when prefs say disabled', () => {
		(loadLivePrefs as ReturnType<typeof vi.fn>).mockReturnValue({ ...DEFAULT_LIVE_PREFS, enabled: false });
		const lm = new LiveMode(false, noopCallbacks);
		expect(lm.enabled).toBe(false);
		expect(lm.status).toBe('idle');
	});

	it('accepts initial known workout ids', () => {
		const lm = new LiveMode(false, noopCallbacks, [1001, 1002]);
		// No observable API for knownIds; just ensure construction doesn't throw
		expect(lm.enabled).toBe(false);
	});
});

describe('LiveMode class — hasWarning', () => {
	it('hasWarning is false when failures < 3', () => {
		const lm = new LiveMode(false, noopCallbacks);
		expect(lm.hasWarning).toBe(false);
	});
});

describe('LiveMode class — setEnabled()', () => {
	it('setEnabled(false) sets enabled to false and calls saveLivePrefs', () => {
		(loadLivePrefs as ReturnType<typeof vi.fn>).mockReturnValue({ ...DEFAULT_LIVE_PREFS, enabled: true });
		const lm = new LiveMode(false, noopCallbacks);
		lm.setEnabled(false);
		expect(lm.enabled).toBe(false);
		expect(saveLivePrefs).toHaveBeenCalled();
	});

	it('setEnabled(true) sets enabled to true', () => {
		const lm = new LiveMode(false, noopCallbacks);
		lm.setEnabled(true);
		expect(lm.enabled).toBe(true);
	});
});

describe('LiveMode class — setInterval()', () => {
	it('setInterval() updates intervalSec and saves prefs', () => {
		const lm = new LiveMode(false, noopCallbacks);
		lm.setInterval(300);
		expect(lm.intervalSec).toBe(300);
		expect(saveLivePrefs).toHaveBeenCalled();
	});
});

describe('LiveMode class — setSound()', () => {
	it('setSound() updates soundEnabled and saves prefs', () => {
		const lm = new LiveMode(false, noopCallbacks);
		lm.setSound(true);
		expect(lm.soundEnabled).toBe(true);
		expect(saveLivePrefs).toHaveBeenCalled();
	});
});

describe('LiveMode class — polling derived state', () => {
	it('polling is false when status is idle', () => {
		const lm = new LiveMode(false, noopCallbacks);
		expect(lm.polling).toBe(false);
	});
});

describe('LiveMode class — stop()', () => {
	it('stop() sets status to stopped and clears nextPollAt', () => {
		const lm = new LiveMode(false, noopCallbacks);
		lm.stop();
		expect(lm.status).toBe('stopped');
		expect(lm.nextPollAt).toBeNull();
	});
});

describe('LiveMode class — resetTimer()', () => {
	it('resetTimer() does not throw when disabled', () => {
		const lm = new LiveMode(false, noopCallbacks);
		expect(() => lm.resetTimer()).not.toThrow();
	});
});
