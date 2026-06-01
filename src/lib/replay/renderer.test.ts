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

/** First `--name: #hex` or `--name: light-dark(#light, #dark)` value within a block body. */
function token(body: string, name: string, mode: 'light' | 'dark' = 'light'): string {
	const dual = new RegExp(`${name}\\s*:\\s*light-dark\\((#[0-9a-fA-F]{3,8})\\s*,\\s*(#[0-9a-fA-F]{3,8})\\)`).exec(
		body
	);
	if (dual) return (mode === 'light' ? dual[1] : dual[2]).toLowerCase();
	const m = new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`).exec(body);
	if (!m) throw new Error(`token not found: ${name}`);
	return m[1].toLowerCase();
}

describe('renderer canvas palette mirrors app.css', () => {
	const root = blockBody(':root');

	it('light live/ghost match --live/--ghost', () => {
		expect(COLORS_LIGHT.live).toBe(token(root, '--live', 'light'));
		expect(COLORS_LIGHT.ghost).toBe(token(root, '--ghost', 'light'));
	});

	it('dark live/ghost match --live/--ghost', () => {
		expect(COLORS_DARK.live).toBe(token(root, '--live', 'dark'));
		expect(COLORS_DARK.ghost).toBe(token(root, '--ghost', 'dark'));
	});
});

describe('race-card machine palette mirrors app.css', () => {
	const root = blockBody(':root');

	it('light machine hues match --m-*', () => {
		expect(MACHINE_HEX.light.rower).toBe(token(root, '--m-rower', 'light'));
		expect(MACHINE_HEX.light.skierg).toBe(token(root, '--m-skierg', 'light'));
		expect(MACHINE_HEX.light.bike).toBe(token(root, '--m-bike', 'light'));
	});

	it('dark machine hues match --m-*', () => {
		expect(MACHINE_HEX.dark.rower).toBe(token(root, '--m-rower', 'dark'));
		expect(MACHINE_HEX.dark.skierg).toBe(token(root, '--m-skierg', 'dark'));
		expect(MACHINE_HEX.dark.bike).toBe(token(root, '--m-bike', 'dark'));
	});
});
