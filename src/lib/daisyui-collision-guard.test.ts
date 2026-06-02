import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DAISY_PREFIX, findUnprefixedDaisyTokens, labelHasToggleCollision } from './daisyui-collision';

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

describe('daisyUI prefix guard (du-)', () => {
	it('app.css enables du- prefix on the daisyUI plugin', () => {
		const css = readFileSync('src/app.css', 'utf-8');
		expect(css).toMatch(/@plugin\s+"daisyui"\s*\{[^}]*prefix:\s*du-/s);
	});

	it('no Svelte markup uses unprefixed daisyUI component classes', () => {
		const violations: string[] = [];
		for (const file of collectSvelteFiles(SRC)) {
			const html = markupOnly(readFileSync(file, 'utf-8'));
			const re = /class="([^"]*)"/g;
			let m: RegExpExecArray | null;
			while ((m = re.exec(html))) {
				const bad = findUnprefixedDaisyTokens(m[1]);
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

	it('dashboard summary uses prefixed stat parts inside dash-stats', () => {
		const html = markupOnly(readFileSync('src/routes/dashboard/+page.svelte', 'utf-8'));
		expect(html).toContain('dash-stats');
		expect(html).toContain(`${DAISY_PREFIX}stat-title`);
		expect(html).toContain(`${DAISY_PREFIX}stat dash-stat`);
		expect(html).not.toMatch(/class="stats"/);
		expect(html).not.toMatch(/class="[^"]*\bcard dash-stat/);
	});
});
