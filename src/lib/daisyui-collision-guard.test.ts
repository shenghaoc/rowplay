import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	findForbiddenLayoutTokens,
	isDaisyUiMarkupToken,
	labelHasToggleCollision
} from './daisyui-collision';

const SRC = resolve('src');

function collectSvelteFiles(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, name.name);
		if (name.isDirectory()) {
			if (name.name === 'node_modules' || name.name === '.git') continue;
			out.push(...collectSvelteFiles(path));
		} else if (name.name.endsWith('.svelte')) {
			out.push(path);
		}
	}
	return out;
}

function markupOnly(source: string): string {
	const style = source.indexOf('<style>');
	return style === -1 ? source : source.slice(0, style);
}

describe('daisyUI layout collision guard', () => {
	it('app.css does not use a class prefix (idiomatic daisyUI)', () => {
		const css = readFileSync('src/app.css', 'utf-8');
		expect(css).not.toMatch(/prefix:\s*du-/);
	});

	it('isDaisyUiMarkupToken does not false-positive on custom layout class names', () => {
		const custom = [
			'drawer-nav',
			'drawer-actions',
			'drawer-theme',
			'menu-btn',
			'footer-inner',
			'status-row',
			'status-label',
			'status-time',
			'dash-stats',
			'dash-stat',
			'side-tag'
		];
		for (const name of custom) {
			expect(isDaisyUiMarkupToken(name), name).toBe(false);
		}
	});

	it('isDaisyUiMarkupToken recognizes idiomatic daisyUI variants', () => {
		expect(isDaisyUiMarkupToken('btn')).toBe(true);
		expect(isDaisyUiMarkupToken('btn-primary')).toBe(true);
		expect(isDaisyUiMarkupToken('btn-ghost')).toBe(true);
		expect(isDaisyUiMarkupToken('stat-title')).toBe(true);
		expect(isDaisyUiMarkupToken('toggle-primary')).toBe(true);
		expect(isDaisyUiMarkupToken('input-bordered')).toBe(true);
	});

	it('no markup repurposes daisyUI stats as a custom layout hook', () => {
		const violations: string[] = [];
		for (const file of collectSvelteFiles(SRC)) {
			const html = markupOnly(readFileSync(file, 'utf-8'));
			const re = /class="([^"]*)"/g;
			let m: RegExpExecArray | null;
			while ((m = re.exec(html))) {
				const bad = findForbiddenLayoutTokens(m[1]);
				if (bad.length) {
					violations.push(`${file.replace(SRC + '/', '')}: "${m[1]}" → ${bad.join(', ')}`);
				}
			}
		}
		expect(violations).toEqual([]);
	});

	it('no <label> uses toggle on the label (belongs on the input)', () => {
		const violations: string[] = [];
		for (const file of collectSvelteFiles(SRC)) {
			const html = markupOnly(readFileSync(file, 'utf-8'));
			const re = /<label\b[^>]*>/g;
			let m: RegExpExecArray | null;
			while ((m = re.exec(html))) {
				if (labelHasToggleCollision(m[0])) {
					violations.push(`${file.replace(SRC + '/', '')}: ${m[0]}`);
				}
			}
		}
		expect(violations).toEqual([]);
	});

	it('dashboard summary uses a custom dash-stats grid, not the daisyUI stats container', () => {
		const html = markupOnly(readFileSync('src/routes/dashboard/+page.svelte', 'utf-8'));
		// Redesign: custom `.statcard` cards (daisyUI `card`) inside a custom `.dash-stats`
		// grid — never the daisyUI `.stats`/`.stat` inline-grid container (the collision).
		expect(html).toContain('dash-stats');
		expect(html).toMatch(/class="card statcard/);
		expect(html).toContain('statval');
		expect(html).not.toMatch(/class="stats"/);
		expect(html).not.toMatch(/class="stat\b/);
	});
});
