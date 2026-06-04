/**
 * Parse and format user-entered /500m pace strings (M:SS or bare seconds).
 * Pure helpers — no DOM or Svelte.
 */

/** Parse "M:SS" or "MM:SS" → positive seconds, or null on error. */
export function parsePaceInput(raw: string): number | null {
	const s = raw.trim();
	const clock = s.match(/^(\d+):([0-5]?\d(?:\.\d+)?)$/);
	const bare = s.match(/^(\d+(?:\.\d+)?)$/);
	let total: number;
	if (clock) {
		total = parseInt(clock[1], 10) * 60 + parseFloat(clock[2]);
	} else if (bare) {
		total = parseFloat(bare[1]);
	} else {
		return null;
	}
	return total > 0 && isFinite(total) ? total : null;
}

/** Format positive seconds as "M:SS" for display / prefill. */
export function formatPaceInput(seconds: number): string {
	if (!isFinite(seconds) || seconds <= 0) return '';
	const whole = Math.round(seconds);
	const m = Math.floor(whole / 60);
	const sec = whole % 60;
	return `${m}:${String(sec).padStart(2, '0')}`;
}
