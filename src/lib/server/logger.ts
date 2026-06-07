/**
 * Privacy-safe logger for Cloudflare Workers / SvelteKit server.
 *
 * Redacts before writing to console so personal tokens, raw cookies, full
 * workout payloads, and session secrets are never emitted to Workers logs.
 *
 * Use `createLogger(console)` in production; tests inject a fake console.
 */

export const REDACTED = '[REDACTED]';

/** Patterns that match personally sensitive data. Applied before logging. */
const SENSITIVE_PATTERNS: RegExp[] = [
	// Concept2 API token: 32-character hex string
	/\b[a-f0-9]{32,}\b/gi,
	// rp_tok cookie value
	/rp_tok=[^;]+/gi,
	// session cookie value
	/session=[^;]+/gi,
	// Authorization header
	/Authorization:\s*Bearer\s+\S+/gi,
	// SESSION_SECRET env value (if accidentally logged)
	/SESSION_SECRET[=:]\s*\S+/gi,
	// Full workout payloads (JSON array/blob of workout data > 100 chars)
	/\{(?:[^{}]|\{[^{}]*\}){100,}\}/g,
	// Multi-line debug dumps of workout detail
	/workoutDetail:\s*\{[\s\S]*?\b(strokes|splits)\b[\s\S]*?\}/gi,
	// Generic token values in JSON (lookbehind/lookahead keep key intact)
	/(?<="token"\s*:\s*")[^"]+(?=")/gi,
];

/**
 * Redact sensitive content from a string. Idempotent — safe to call on
 * already-redacted strings.
 */
export function redact(value: unknown): string {
	if (typeof value !== 'string') return String(value);
	let result = value;
	for (const pattern of SENSITIVE_PATTERNS) {
		result = result.replace(pattern, REDACTED);
	}
	return result;
}

function redactArgs(args: unknown[]): unknown[] {
	return args.map((a) => {
		if (typeof a === 'string') return redact(a);
		if (a instanceof Error) {
			return new Error(redact(a.message));
		}
		if (typeof a === 'object' && a !== null) {
			try {
				return JSON.parse(redact(JSON.stringify(a)));
			} catch {
				return a;
			}
		}
		return a;
	});
}

export interface Logger {
	error(...args: unknown[]): void;
	warn(...args: unknown[]): void;
}

export function createLogger(consoleObj: Pick<Console, 'error' | 'warn'>): Logger {
	return {
		error(...args: unknown[]) {
			consoleObj.error(...redactArgs(args));
		},
		warn(...args: unknown[]) {
			consoleObj.warn(...redactArgs(args));
		}
	};
}
