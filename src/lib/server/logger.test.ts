import { describe, expect, it, vi } from 'vitest';
import { createLogger, redact, REDACTED } from './logger';

describe('redact', () => {
	it('returns the value unchanged when no patterns match', () => {
		expect(redact('Workout sync completed')).toBe('Workout sync completed');
	});

	it('redacts Concept2 API tokens (32-char hex)', () => {
		expect(redact('Token: abcdef0123456789abcdef0123456789')).toBe('Token: ' + REDACTED);
	});

	it('redacts rp_tok cookie values', () => {
		expect(redact('rp_tok=sealed-value-here; path=/')).toContain(REDACTED);
		expect(redact('rp_tok=sealed-value-here; path=/')).not.toContain('sealed-value-here');
	});

	it('redacts Authorization headers', () => {
		expect(redact('Authorization: Bearer token123abc')).toContain(REDACTED);
	});

	it('redacts SESSION_SECRET references', () => {
		expect(redact('SESSION_SECRET=my-secret-key')).toContain(REDACTED);
	});

	it('redacts full workout payloads (large JSON)', () => {
		const payload = '{"workouts":[{"id":1,"date":"2026-01-01","sport":"rower","distance":2000,"time":480,"pace":120,"hasStrokeData":false,"strokes":[]}]}';
		const result = redact(payload);
		expect(result).toContain(REDACTED);
		expect(result).not.toContain('strokes');
	});

	it('handles non-string inputs gracefully', () => {
		expect(redact(null)).toBe('null');
		expect(redact(undefined)).toBe('undefined');
		expect(redact(42)).toBe('42');
	});
});

describe('createLogger', () => {
	it('redacts all string arguments before passing to console.error', () => {
		const errors: unknown[][] = [];
		const fakeConsole = { error: vi.fn((...args: unknown[]) => errors.push(args)) };
		const log = createLogger(fakeConsole as unknown as Console);

		log.error('Sync failed', 'abcdef0123456789abcdef0123456789');
		expect(fakeConsole.error).toHaveBeenCalled();
		// The hex token in second arg should be redacted
		expect(errors[0]?.[1]).toBe(REDACTED);
		// First arg (safe message) should be untouched
		expect(errors[0]?.[0]).toBe('Sync failed');
	});

	it('does not redact safe log messages', () => {
		const errors: unknown[][] = [];
		const fakeConsole = { error: vi.fn((...args: unknown[]) => errors.push(args)) };
		const log = createLogger(fakeConsole as unknown as Console);

		log.error('D1 query failed: no such table: workouts');
		expect(errors[0]?.[0]).toBe('D1 query failed: no such table: workouts');
	});

	it('redacts object arguments containing sensitive data', () => {
		const errors: unknown[][] = [];
		const fakeConsole = { error: vi.fn((...args: unknown[]) => errors.push(args)) };
		const log = createLogger(fakeConsole as unknown as Console);

		log.error('Config error', { baseUrl: 'https://log.concept2.com', token: 'secret123' });
		const logged = JSON.stringify(errors[0]);
		expect(logged).not.toContain('secret123');
	});

	it('redacts Error message content', () => {
		const errors: unknown[][] = [];
		const fakeConsole = { error: vi.fn((...args: unknown[]) => errors.push(args)) };
		const log = createLogger(fakeConsole as unknown as Console);

		log.error(new Error('Token abcdef0123456789abcdef0123456789 was rejected'));
		const firstArg = errors[0]?.[0];
		expect(firstArg).toBeInstanceOf(Error);
		expect((firstArg as Error).message).not.toContain('abcdef0123456789');
	});
});
