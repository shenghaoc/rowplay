import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findForbiddenCustomTokens, labelHasToggleCollision } from './daisyui-collision';

const SRC = resolve('src');

function collectSvelteFiles(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, name.name);
		if (name.isDirectory()) out.push(...collectSvelteFiles(path));
		else if (name.name.endsWith('.svelte')) out.push(path);
	}
	return out;
}

function markupOnly(source: string): string {
	const style = source.indexOf('<style>');
	return style === -1 ? source : source.slice(0, style);
}

describe('daisyUI collision guard (project-wide)', () => {
	const files = collectSvelteFiles(SRC);

	it('no markup uses forbidden custom tokens (list, stats)', () => {
		const violations: string[] = [];

		for (const file of files) {
			const html = markupOnly(readFileSync(file, 'utf-8'));
			const re = /class="([^"]*)"/g;
			let m: RegExpExecArray | null;
			while ((m = re.exec(html))) {
				const bad = findForbiddenCustomTokens(m[1]);
				if (bad.length) {
					violations.push(`${file.replace(SRC + '/', '')}: "${m[1]}" → ${bad.join(', ')}`);
				}
			}
		}

		expect(violations).toEqual([]);
	});

	it('no <label> uses class toggle (belongs on the checkbox input)', () => {
		const violations: string[] = [];
		for (const file of files) {
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

	it('dashboard summary uses dash-stats grid with daisyUI stat parts', () => {
		const html = markupOnly(readFileSync('src/routes/dashboard/+page.svelte', 'utf-8'));
		expect(html).toContain('class="dash-stats"');
		expect(html).toContain('stat-title');
		expect(html).toContain('stat-value');
		expect(html).not.toMatch(/class="stats"/);
		expect(html).not.toMatch(/class="card dash-stat"/);
	});
});
