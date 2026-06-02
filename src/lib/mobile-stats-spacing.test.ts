/**
 * Bug Condition Exploration Test — Mobile Stat Cards Cramped Padding and Gap
 *
 * Property 1: Bug Condition
 * Validates: Requirements 1.1, 1.2, 1.3
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const DASHBOARD_PATH = resolve('src/routes/dashboard/+page.svelte');

function extractSvelteStyle(filePath: string): string {
	const source = readFileSync(filePath, 'utf-8');
	const match = source.match(/<style>([\s\S]*?)<\/style>/);
	if (!match) throw new Error(`No <style> block found in ${filePath}`);
	return match[1];
}

function extractMediaBlock(css: string, maxWidthPx: number): string {
	const pattern = new RegExp(`@media\\s*\\(max-width:\\s*${maxWidthPx}px\\)\\s*\\{`, 'g');
	const match = pattern.exec(css);
	if (!match) return '';

	let depth = 1;
	let i = match.index + match[0].length;
	const start = i;
	while (i < css.length && depth > 0) {
		if (css[i] === '{') depth++;
		else if (css[i] === '}') depth--;
		i++;
	}
	return css.slice(start, i - 1);
}

function findPropertyValue(cssBlock: string, selector: string, property: string): string | null {
	const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const selectorPattern = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'g');
	let match: RegExpExecArray | null;
	while ((match = selectorPattern.exec(cssBlock)) !== null) {
		const propPattern = new RegExp(`${property.replace(/-/g, '\\-')}\\s*:\\s*([^;]+)`, 'i');
		const propMatch = propPattern.exec(match[1]);
		if (propMatch) return propMatch[1].trim();
	}
	return null;
}

function isBugCondition(viewport: { widthPx: number }): boolean {
	return viewport.widthPx <= 720;
}

const css = extractSvelteStyle(DASHBOARD_PATH);
const media720 = extractMediaBlock(css, 720);
const media400 = extractMediaBlock(css, 400);

describe('daisyUI collision guard', () => {
	it('dashboard summary uses dash-stats + stat parts, not stats container', () => {
		const source = readFileSync(DASHBOARD_PATH, 'utf-8');
		const html = source.slice(0, source.indexOf('<style>'));
		expect(html).not.toMatch(/class="stats"/);
		expect(html).toContain('dash-stats');
		expect(html).toContain('stat-title');
		expect(html).toContain('class="card dash-stat"');
		expect(html).toContain('class="stat"');
	});
});

describe('Property 1: Bug Condition — Mobile Stat Cards Cramped Padding and Gap', () => {
	describe('Viewport range [401, 720]', () => {
		it('should have .dash-stat { padding: 1rem 1.1rem } inside @media (max-width: 720px)', () => {
			const padding = findPropertyValue(media720, '.dash-stat', 'padding');
			expect(padding).toBe('1rem 1.1rem');
		});
	});

	describe('Viewport range [320, 400]', () => {
		it('should have .dash-stats { gap: 0.75rem } inside @media (max-width: 400px)', () => {
			const gap = findPropertyValue(media400, '.dash-stats', 'gap');
			expect(gap).toBe('0.75rem');
		});

		it('should have .dash-stat { padding: 0.9rem 1rem } inside @media (max-width: 400px)', () => {
			const padding = findPropertyValue(media400, '.dash-stat', 'padding');
			expect(padding).toBe('0.9rem 1rem');
		});
	});

	describe('Sanity checks', () => {
		it('should preserve 2-column dash-stats at 720px', () => {
			const cols = findPropertyValue(media720, '.dash-stats', 'grid-template-columns');
			expect(cols).toBe('repeat(2, minmax(0, 1fr))');
		});

		it('should preserve stat-value font-size at 400px', () => {
			const fontSize = findPropertyValue(media400, '.dash-stat .stat-value', 'font-size');
			expect(fontSize).toBe('1.25rem');
		});

		it('should preserve stat-title min-height at 400px', () => {
			const minHeight = findPropertyValue(media400, '.dash-stat .stat-title', 'min-height');
			expect(minHeight).toBe('2.6em');
		});
	});
});

function extractBaseStyles(css: string): string {
	let result = css;
	let mediaStart = result.search(/@media\s*\(/);
	while (mediaStart !== -1) {
		const braceStart = result.indexOf('{', mediaStart);
		let depth = 1;
		let i = braceStart + 1;
		while (i < result.length && depth > 0) {
			if (result[i] === '{') depth++;
			else if (result[i] === '}') depth--;
			i++;
		}
		result = result.slice(0, mediaStart) + result.slice(i);
		mediaStart = result.search(/@media\s*\(/);
	}
	return result;
}

const baseStyles = extractBaseStyles(css);

describe('Property 2: Preservation — Desktop Stat Styles', () => {
	it('should have NO .dash-stat padding in base styles', () => {
		expect(findPropertyValue(baseStyles, '.dash-stat', 'padding')).toBeNull();
	});

	it('should have .dash-stats { gap: 1rem } in base styles', () => {
		expect(findPropertyValue(baseStyles, '.dash-stats', 'gap')).toBe('1rem');
	});
});
