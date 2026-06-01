import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COLORS_LIGHT, COLORS_DARK } from './renderer';
import { MACHINE_HEX } from './sports';

// The course renderer paints to <canvas>, which can't resolve CSS custom
// properties, so it mirrors the live/ghost accent tokens as constants. app.css
// is the source of truth — parse it and fail loudly if the mirror drifts.
const css = readFileSync(fileURLToPath(new URL('../../app.css', import.meta.url)), 'utf8');

/** Body of the first `selector { … }` rule (custom-property blocks have no nested braces). */
function blockBody(selector: string): string {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const m = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
	if (!m) throw new Error(`CSS block not found: ${selector}`);
	return m[1];
}

/** First `--name: #hex` value within a block body. */
function token(body: string, name: string): string {
	const m = new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`).exec(body);
	if (!m) throw new Error(`token not found: ${name}`);
	return m[1].toLowerCase();
}

describe('renderer canvas palette mirrors app.css', () => {
	const light = blockBody(':root');
	const dark = blockBody(":root[data-theme='dark']");

	it('light live/ghost match --live/--ghost', () => {
		expect(COLORS_LIGHT.live).toBe(token(light, '--live'));
		expect(COLORS_LIGHT.ghost).toBe(token(light, '--ghost'));
	});

	it('dark live/ghost match --live/--ghost', () => {
		expect(COLORS_DARK.live).toBe(token(dark, '--live'));
		expect(COLORS_DARK.ghost).toBe(token(dark, '--ghost'));
	});
});

describe('race-card machine palette mirrors app.css', () => {
	const light = blockBody(':root');
	const dark = blockBody(":root[data-theme='dark']");

	it('light machine hues match --m-*', () => {
		expect(MACHINE_HEX.light.rower).toBe(token(light, '--m-rower'));
		expect(MACHINE_HEX.light.skierg).toBe(token(light, '--m-skierg'));
		expect(MACHINE_HEX.light.bike).toBe(token(light, '--m-bike'));
	});

	it('dark machine hues match --m-*', () => {
		expect(MACHINE_HEX.dark.rower).toBe(token(dark, '--m-rower'));
		expect(MACHINE_HEX.dark.skierg).toBe(token(dark, '--m-skierg'));
		expect(MACHINE_HEX.dark.bike).toBe(token(dark, '--m-bike'));
	});
});
