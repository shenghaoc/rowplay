import { createContext } from 'svelte';
import type { DistancePB } from '$lib/analytics';
import type { Workout } from '$lib/types';
import {
	DEFAULT_LIVE_PREFS,
	effectiveIntervalSec,
	loadLivePrefs,
	nextBackoffMs,
	randomMockDelayMs,
	saveLivePrefs,
	type LiveIntervalSec,
	type LiveModePrefs,
	type LivePollResult
} from './liveMode';

export type LiveModeStatus = 'idle' | 'polling' | 'error' | 'stopped';

export interface LiveModeCallbacks {
	onWorkouts: (workouts: Workout[], newPbs: DistancePB[]) => void;
	onError: (message: string, code?: number) => void;
	onRecovered: () => void;
	t: (key: string, vars?: Record<string, string | number>) => string;
}

/**
 * Client-side live mode poller — one timer per tab, visibility-aware,
 * with exponential backoff on errors.
 */
export class LiveMode {
	enabled = $state(false);
	intervalSec = $state<LiveIntervalSec>(60);
	soundEnabled = $state(false);
	status = $state<LiveModeStatus>('idle');
	lastPollAt = $state<number | null>(null);
	nextPollAt = $state<number | null>(null);
	failures = $state(0);
	polling = $derived(this.status === 'polling');

	private demo: boolean;
	private callbacks: LiveModeCallbacks;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private abort: AbortController | null = null;
	private tabVisible = true;
	private knownIds = new Set<number>();
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private pendingWorkouts: Workout[] = [];
	private pendingPbs: DistancePB[] = [];

	constructor(demo: boolean, callbacks: LiveModeCallbacks, initialIds: number[] = []) {
		this.demo = demo;
		this.callbacks = callbacks;
		this.knownIds = new Set(initialIds);
		const prefs = loadLivePrefs();
		this.enabled = prefs.enabled;
		this.intervalSec = prefs.intervalSec;
		this.soundEnabled = prefs.soundEnabled;
	}

	get hasWarning() {
		return this.failures >= 3;
	}

	private persist() {
		saveLivePrefs({
			enabled: this.enabled,
			intervalSec: this.intervalSec,
			soundEnabled: this.soundEnabled,
			source: 'poll'
		});
	}

	setEnabled(on: boolean) {
		this.enabled = on;
		this.persist();
		if (on) this.start();
		else this.stop();
	}

	setInterval(sec: LiveIntervalSec) {
		this.intervalSec = sec;
		this.persist();
		// If a poll is in flight, this 0 ms timer fires into poll()'s
		// `status === 'polling'` early-return and is dropped — that's fine: the
		// in-flight poll reschedules with the new intervalSec when it finishes.
		if (this.enabled) this.scheduleNext(0);
	}

	setSound(on: boolean) {
		this.soundEnabled = on;
		this.persist();
	}

	/** Call when manual sync completes to reset the auto-poll timer. */
	resetTimer() {
		if (this.enabled) this.scheduleNext(this.intervalSec * 1000);
	}

	start() {
		if (!this.enabled) return;
		this.status = 'idle';
		this.bindVisibility();
		this.scheduleNext(0);
	}

	stop() {
		this.status = 'stopped';
		this.clearTimer();
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		this.pendingWorkouts = [];
		this.pendingPbs = [];
		this.abort?.abort();
		this.abort = null;
		this.nextPollAt = null;
		// Stop listening for visibility changes while disabled; start() re-binds.
		document.removeEventListener('visibilitychange', this.onVisibility);
	}

	destroy() {
		this.stop();
	}

	private bindVisibility() {
		document.removeEventListener('visibilitychange', this.onVisibility);
		document.addEventListener('visibilitychange', this.onVisibility);
		this.tabVisible = document.visibilityState === 'visible';
	}

	private onVisibility = () => {
		const visible = document.visibilityState === 'visible';
		if (visible && !this.tabVisible) {
			this.tabVisible = true;
			this.scheduleNext(0);
		} else if (!visible && this.tabVisible) {
			this.tabVisible = false;
			this.abort?.abort();
			// Tab went to the background: don't fire an immediate poll (that
			// defeats backgrounding) — reschedule at the reduced interval.
			this.scheduleNext(effectiveIntervalSec(this.intervalSec, false) * 1000);
		}
	};

	private clearTimer() {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
	}

	private scheduleNext(delayMs: number) {
		this.clearTimer();
		if (!this.enabled) return;
		const at = Date.now() + delayMs;
		this.nextPollAt = at;
		this.timer = setTimeout(() => void this.poll(), delayMs);
	}

	async poll() {
		if (!this.enabled || this.status === 'polling') return;
		this.status = 'polling';
		this.abort = new AbortController();
		const signal = this.abort.signal;

		try {
			let result: LivePollResult;
			if (this.demo) {
				result = await this.demoPoll(signal);
			} else {
				result = await this.apiPoll(signal);
			}

			// Aborted (tab hidden / stop) — release the 'polling' status so the next
			// scheduled poll isn't blocked by the guard, but don't clobber 'stopped'.
			if (signal.aborted) {
				if (this.status === 'polling') this.status = 'idle';
				return;
			}

			const hadFailures = this.failures >= 3;
			const fresh = result.workouts.filter((w) => !this.knownIds.has(w.id));
			for (const w of result.workouts) this.knownIds.add(w.id);

			this.failures = 0;
			this.lastPollAt = Date.now();
			this.status = 'idle';

			if (fresh.length) {
				this.enqueueWorkouts(fresh, result.newPbs);
				if (this.soundEnabled) playChime();
			}
			if (hadFailures) this.callbacks.onRecovered();

			// Demo mode intentionally ignores intervalSec and uses a random delay
			// to simulate the unpredictable arrival of real workouts; the interval
			// selector only governs live (non-demo) polling cadence.
			const interval = this.demo
				? randomMockDelayMs()
				: effectiveIntervalSec(this.intervalSec, this.tabVisible) * 1000 + nextBackoffMs(0);
			this.scheduleNext(interval);
		} catch (e) {
			if (signal.aborted) {
				if (this.status === 'polling') this.status = 'idle';
				return;
			}
			this.failures++;
			this.status = 'error';
			const msg = e instanceof Error ? e.message : String(e);
			const code = (e as { status?: number }).status;
			console.error('[liveMode] poll failed:', msg);
			this.callbacks.onError(msg, code);

			const backoff = nextBackoffMs(this.failures);
			const interval = this.demo
				? randomMockDelayMs() + backoff
				: effectiveIntervalSec(this.intervalSec, this.tabVisible) * 1000 + backoff;
			this.scheduleNext(interval);
		}
	}

	private async apiPoll(signal: AbortSignal): Promise<LivePollResult> {
		const res = await fetch('/api/live/poll', { method: 'POST', signal });
		if (!res.ok) {
			let message = `HTTP ${res.status}`;
			try {
				const body = (await res.json()) as { message?: string };
				if (body?.message) message = body.message;
			} catch {
				/* ignore */
			}
			const err = new Error(message) as Error & { status?: number };
			err.status = res.status;
			throw err;
		}
		return (await res.json()) as LivePollResult;
	}

	private async demoPoll(signal: AbortSignal): Promise<LivePollResult> {
		const res = await fetch('/api/live/mock', { method: 'POST', signal });
		if (!res.ok) {
			const err = new Error(`HTTP ${res.status}`) as Error & { status?: number };
			err.status = res.status;
			throw err;
		}
		return (await res.json()) as LivePollResult;
	}

	private enqueueWorkouts(workouts: Workout[], newPbs: DistancePB[]) {
		this.pendingWorkouts.push(...workouts);
		this.pendingPbs.push(...newPbs);
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => {
			const batch = this.pendingWorkouts.splice(0);
			const pbs = this.pendingPbs.splice(0);
			if (batch.length) this.callbacks.onWorkouts(batch, pbs);
		}, 1000);
	}
}

// One shared, lazily-created AudioContext: creating one per chime hits
// browser concurrent-context limits and leaks contexts that autoplay policy
// leaves 'suspended' (so onended never fires to close them).
let sharedCtx: AudioContext | null = null;

function playChime() {
	try {
		sharedCtx ??= new AudioContext();
		if (sharedCtx.state === 'suspended') void sharedCtx.resume();
		const osc = sharedCtx.createOscillator();
		const gain = sharedCtx.createGain();
		osc.connect(gain);
		gain.connect(sharedCtx.destination);
		osc.frequency.value = 880;
		gain.gain.value = 0.05;
		osc.start();
		osc.stop(sharedCtx.currentTime + 0.12);
	} catch {
		/* audio optional */
	}
}

export const [getLiveModeContext, setLiveModeContext] = createContext<LiveMode>();

export { DEFAULT_LIVE_PREFS, type LiveIntervalSec, type LiveModePrefs, LIVE_INTERVALS } from './liveMode';
