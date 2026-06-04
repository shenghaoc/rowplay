import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Theme, daisyThemeName } from './theme.svelte';

// persistTheme touches document/location — stub document safely
const origDocument = globalThis.document;

beforeEach(() => {
	// Minimal document stub so persistTheme doesn't throw
	globalThis.document = {
		documentElement: { dataset: {} },
		cookie: ''
	} as unknown as Document;
	// Stub location.protocol
	vi.stubGlobal('location', { protocol: 'https:' });
});

afterEach(() => {
	globalThis.document = origDocument;
	vi.unstubAllGlobals();
});

describe('daisyThemeName()', () => {
	it('returns "dark" for dark theme', () => {
		expect(daisyThemeName('dark')).toBe('dark');
	});

	it('returns "rowplay" for light theme', () => {
		expect(daisyThemeName('light')).toBe('rowplay');
	});
});

describe('Theme class', () => {
	it('initialises to light by default', () => {
		const theme = new Theme();
		expect(theme.value).toBe('light');
	});

	it('initialises to provided theme', () => {
		const theme = new Theme('dark');
		expect(theme.value).toBe('dark');
	});

	it('isDark returns false for light theme', () => {
		const theme = new Theme('light');
		expect(theme.isDark).toBe(false);
	});

	it('isDark returns true for dark theme', () => {
		const theme = new Theme('dark');
		expect(theme.isDark).toBe(true);
	});

	it('set() changes the theme value', () => {
		const theme = new Theme('light');
		theme.set('dark');
		expect(theme.value).toBe('dark');
	});

	it('toggle() switches light → dark', () => {
		const theme = new Theme('light');
		theme.toggle();
		expect(theme.value).toBe('dark');
	});

	it('toggle() switches dark → light', () => {
		const theme = new Theme('dark');
		theme.toggle();
		expect(theme.value).toBe('light');
	});

	it('toggle() updates document data-theme', () => {
		const theme = new Theme('light');
		theme.toggle();
		expect((globalThis.document.documentElement as HTMLElement).dataset.theme).toBe('dark');
	});
});
